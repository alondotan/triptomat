"""Shared OpenTelemetry setup for all Triptomat Lambda functions.

Provides:
  - init_telemetry(service_name) — initialises tracer + meter providers
  - get_tracer(name) -> Tracer
  - get_meter(name) -> Meter
  - trace_function — decorator for easy span creation

Configuration via environment variables:
  OTEL_ENABLED                  — "true" to enable (default: disabled)
  OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP collector endpoint (default: console exporter)
  OTEL_ENVIRONMENT              — deployment.environment attribute (default: "development")
  OTEL_SERVICE_VERSION          — service.version attribute (default: "0.0.0")
"""

from __future__ import annotations

import functools
import logging
import os
import time
from contextlib import contextmanager
from typing import Any, Callable, Generator, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy globals – populated by init_telemetry()
# ---------------------------------------------------------------------------
_tracer_provider = None
_meter_provider = None
_initialised = False

# Public convenience: lightweight stubs returned when OTel is disabled.
_NOOP_TRACER = None
_NOOP_METER = None


def _otel_enabled() -> bool:
    return os.environ.get("OTEL_ENABLED", "false").lower() in ("true", "1", "yes")


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

def init_telemetry(service_name: str) -> None:
    """Initialise OpenTelemetry tracer and meter providers.

    Safe to call multiple times — subsequent calls are no-ops.
    If anything goes wrong during setup the error is logged and the
    application continues without telemetry.
    """
    global _tracer_provider, _meter_provider, _initialised
    global _NOOP_TRACER, _NOOP_METER

    if _initialised:
        return

    _initialised = True

    if not _otel_enabled():
        logger.debug("OpenTelemetry disabled (OTEL_ENABLED != true)")
        return

    try:
        from opentelemetry import trace, metrics
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.resources import Resource

        environment = os.environ.get("OTEL_ENVIRONMENT", "development")
        service_version = os.environ.get("OTEL_SERVICE_VERSION", "0.0.0")

        resource = Resource.create({
            "service.name": service_name,
            "service.version": service_version,
            "deployment.environment": environment,
        })

        # ── Trace exporter ──────────────────────────────────────────────
        otlp_endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")

        if otlp_endpoint:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
                OTLPMetricExporter,
            )
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

            span_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
            span_processor = BatchSpanProcessor(span_exporter)
            metric_exporter = OTLPMetricExporter(endpoint=otlp_endpoint)
            metric_reader = PeriodicExportingMetricReader(metric_exporter)
        else:
            from opentelemetry.sdk.trace.export import (
                SimpleSpanProcessor,
                ConsoleSpanExporter,
            )
            from opentelemetry.sdk.metrics.export import (
                ConsoleMetricExporter,
                PeriodicExportingMetricReader,
            )

            span_exporter = ConsoleSpanExporter()
            span_processor = SimpleSpanProcessor(span_exporter)
            metric_exporter = ConsoleMetricExporter()
            metric_reader = PeriodicExportingMetricReader(metric_exporter)

        # ── Providers ───────────────────────────────────────────────────
        _tracer_provider = TracerProvider(resource=resource)
        _tracer_provider.add_span_processor(span_processor)
        trace.set_tracer_provider(_tracer_provider)

        _meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
        metrics.set_meter_provider(_meter_provider)

        # ── Optional: AWS Lambda instrumentor ───────────────────────────
        try:
            from opentelemetry.instrumentation.aws_lambda import AwsLambdaInstrumentor
            AwsLambdaInstrumentor().instrument()
        except Exception:
            pass  # Not available or not running on Lambda — skip silently

        # ── Optional: botocore instrumentor ──────────────────────────────
        try:
            from opentelemetry.instrumentation.botocore import BotocoreInstrumentor
            BotocoreInstrumentor().instrument()
        except Exception:
            pass

        # ── Optional: requests instrumentor ─────────────────────────────
        try:
            from opentelemetry.instrumentation.requests import RequestsInstrumentor
            RequestsInstrumentor().instrument()
        except Exception:
            pass

        logger.info("OpenTelemetry initialised for service=%s", service_name)

    except Exception:
        logger.warning("Failed to initialise OpenTelemetry — continuing without telemetry", exc_info=True)
        _tracer_provider = None
        _meter_provider = None


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_tracer(name: str):
    """Return an OpenTelemetry Tracer, or a no-op proxy when OTel is off."""
    if _tracer_provider is not None:
        try:
            from opentelemetry import trace
            return trace.get_tracer(name)
        except Exception:
            pass
    return _NoOpTracer()


def get_meter(name: str):
    """Return an OpenTelemetry Meter, or a no-op proxy when OTel is off."""
    if _meter_provider is not None:
        try:
            from opentelemetry import metrics
            return metrics.get_meter(name)
        except Exception:
            pass
    return _NoOpMeter()


def trace_function(span_name: Optional[str] = None, attributes: Optional[dict] = None):
    """Decorator that wraps a function in an OTel span.

    Usage::

        @trace_function("my.span.name")
        def do_work():
            ...

        @trace_function()
        def other_work():
            ...  # span name defaults to "module.function_name"
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            effective_name = span_name or f"{fn.__module__}.{fn.__qualname__}"
            tracer = get_tracer(fn.__module__)
            try:
                with tracer.start_as_current_span(effective_name) as span:
                    if attributes:
                        for k, v in attributes.items():
                            try:
                                span.set_attribute(k, v)
                            except Exception:
                                pass
                    return fn(*args, **kwargs)
            except Exception:
                # If starting a span itself fails, just run the function
                return fn(*args, **kwargs)
        return wrapper
    return decorator


@contextmanager
def safe_span(tracer, span_name: str, attributes: Optional[dict] = None) -> Generator:
    """Context manager that creates a span but never lets OTel errors escape.

    Usage::

        with safe_span(tracer, "my.span", {"key": "val"}) as span:
            ...  # do work
    """
    span = None
    try:
        cm = tracer.start_as_current_span(span_name)
        span = cm.__enter__()
        if attributes:
            for k, v in attributes.items():
                try:
                    span.set_attribute(k, v)
                except Exception:
                    pass
    except Exception:
        pass

    try:
        yield span
    except Exception:
        if span is not None:
            try:
                span.set_attribute("error", True)
            except Exception:
                pass
        raise
    finally:
        if span is not None:
            try:
                cm.__exit__(None, None, None)
            except Exception:
                pass


def record_counter(counter, amount: int = 1, attributes: Optional[dict] = None) -> None:
    """Safely add to a counter metric."""
    try:
        counter.add(amount, attributes or {})
    except Exception:
        pass


def record_histogram(histogram, value: float, attributes: Optional[dict] = None) -> None:
    """Safely record a histogram value."""
    try:
        histogram.record(value, attributes or {})
    except Exception:
        pass


def time_ms() -> float:
    """Return current monotonic time in milliseconds (for duration measurements)."""
    return time.monotonic() * 1000


def flush_telemetry(timeout_ms: int = 5000) -> None:
    """Flush all pending spans and metrics. Call at the end of each Lambda invocation."""
    if _tracer_provider and hasattr(_tracer_provider, 'force_flush'):
        try:
            _tracer_provider.force_flush(timeout_ms)
        except Exception:
            pass
    if _meter_provider and hasattr(_meter_provider, 'force_flush'):
        try:
            _meter_provider.force_flush(timeout_ms)
        except Exception:
            pass


def record_span_error(span, exception: Exception) -> None:
    """Record an error on a span using OTel conventions."""
    try:
        from opentelemetry.trace import StatusCode
        span.set_status(StatusCode.ERROR, str(exception)[:500])
        span.record_exception(exception)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# No-op stubs — used when OTel is disabled so callers never need to check
# ---------------------------------------------------------------------------

class _NoOpSpan:
    """Minimal span stub that silently ignores all calls."""

    def set_attribute(self, key: str, value: Any) -> None:
        pass

    def add_event(self, name: str, attributes: Optional[dict] = None) -> None:
        pass

    def set_status(self, *args: Any, **kwargs: Any) -> None:
        pass

    def record_exception(self, exception: Any, attributes: Optional[dict] = None) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args: Any):
        pass


class _NoOpTracer:
    """Minimal tracer stub that returns no-op spans."""

    @contextmanager
    def start_as_current_span(self, name: str, **kwargs: Any) -> Generator:
        yield _NoOpSpan()


class _NoOpCounter:
    def add(self, amount: Any, attributes: Any = None) -> None:
        pass


class _NoOpHistogram:
    def record(self, value: Any, attributes: Any = None) -> None:
        pass


class _NoOpMeter:
    """Minimal meter stub that returns no-op instruments."""

    def create_counter(self, name: str, **kwargs: Any) -> _NoOpCounter:
        return _NoOpCounter()

    def create_histogram(self, name: str, **kwargs: Any) -> _NoOpHistogram:
        return _NoOpHistogram()

    def create_up_down_counter(self, name: str, **kwargs: Any) -> _NoOpCounter:
        return _NoOpCounter()
