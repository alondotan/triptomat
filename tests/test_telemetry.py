"""Tests for core/telemetry.py."""

import importlib
from unittest.mock import patch

from core.telemetry import (
    _otel_enabled,
    _NoOpSpan,
    _NoOpTracer,
    _NoOpCounter,
    _NoOpHistogram,
    _NoOpMeter,
    safe_span,
    record_counter,
    record_histogram,
    time_ms,
    flush_telemetry,
    get_tracer,
    get_meter,
)


class TestOtelEnabled:
    """Tests for _otel_enabled()."""

    @patch.dict("os.environ", {"OTEL_ENABLED": "true"})
    def test_true(self):
        assert _otel_enabled() is True

    @patch.dict("os.environ", {"OTEL_ENABLED": "1"})
    def test_one(self):
        assert _otel_enabled() is True

    @patch.dict("os.environ", {"OTEL_ENABLED": "yes"})
    def test_yes(self):
        assert _otel_enabled() is True

    @patch.dict("os.environ", {"OTEL_ENABLED": "false"})
    def test_false(self):
        assert _otel_enabled() is False

    @patch.dict("os.environ", {}, clear=True)
    def test_missing(self):
        assert _otel_enabled() is False

    @patch.dict("os.environ", {"OTEL_ENABLED": "TRUE"})
    def test_case_insensitive(self):
        assert _otel_enabled() is True


class TestNoOpClasses:
    """Tests for no-op stub classes."""

    def test_noop_span_set_attribute(self):
        span = _NoOpSpan()
        span.set_attribute("key", "value")  # should not raise

    def test_noop_span_add_event(self):
        span = _NoOpSpan()
        span.add_event("test", {"k": "v"})

    def test_noop_span_set_status(self):
        span = _NoOpSpan()
        span.set_status("ERROR", "msg")

    def test_noop_span_record_exception(self):
        span = _NoOpSpan()
        span.record_exception(ValueError("test"))

    def test_noop_span_context_manager(self):
        span = _NoOpSpan()
        with span as s:
            assert s is span

    def test_noop_tracer_yields_span(self):
        tracer = _NoOpTracer()
        with tracer.start_as_current_span("test") as span:
            assert isinstance(span, _NoOpSpan)

    def test_noop_counter_add(self):
        counter = _NoOpCounter()
        counter.add(1, {"k": "v"})  # should not raise

    def test_noop_histogram_record(self):
        hist = _NoOpHistogram()
        hist.record(42.5, {"k": "v"})  # should not raise

    def test_noop_meter_create_counter(self):
        meter = _NoOpMeter()
        counter = meter.create_counter("test.counter")
        assert isinstance(counter, _NoOpCounter)

    def test_noop_meter_create_histogram(self):
        meter = _NoOpMeter()
        hist = meter.create_histogram("test.hist")
        assert isinstance(hist, _NoOpHistogram)

    def test_noop_meter_create_up_down_counter(self):
        meter = _NoOpMeter()
        counter = meter.create_up_down_counter("test.updown")
        assert isinstance(counter, _NoOpCounter)


class TestGetTracerAndMeter:
    """Tests for get_tracer() and get_meter() when OTel is disabled."""

    def test_get_tracer_returns_noop(self):
        tracer = get_tracer("test")
        assert isinstance(tracer, _NoOpTracer)

    def test_get_meter_returns_noop(self):
        meter = get_meter("test")
        assert isinstance(meter, _NoOpMeter)


class TestSafeSpan:
    """Tests for safe_span() context manager."""

    def test_yields_span_from_noop_tracer(self):
        tracer = _NoOpTracer()
        with safe_span(tracer, "test.span") as span:
            assert span is not None

    def test_with_attributes(self):
        tracer = _NoOpTracer()
        with safe_span(tracer, "test.span", {"key": "val"}) as span:
            assert span is not None

    def test_exception_propagates(self):
        tracer = _NoOpTracer()
        with pytest.raises(ValueError):
            with safe_span(tracer, "test.span"):
                raise ValueError("boom")


class TestRecordHelpers:
    """Tests for record_counter() and record_histogram()."""

    def test_record_counter_with_noop(self):
        counter = _NoOpCounter()
        record_counter(counter, 5, {"status": "ok"})  # should not raise

    def test_record_histogram_with_noop(self):
        hist = _NoOpHistogram()
        record_histogram(hist, 123.4, {"source": "web"})  # should not raise

    def test_record_counter_with_broken_counter(self):
        class BrokenCounter:
            def add(self, *a, **kw):
                raise RuntimeError("broken")

        record_counter(BrokenCounter())  # should not raise


class TestTimeMs:
    """Tests for time_ms()."""

    def test_returns_positive_float(self):
        result = time_ms()
        assert isinstance(result, float)
        assert result > 0

    def test_monotonic(self):
        t1 = time_ms()
        t2 = time_ms()
        assert t2 >= t1


class TestFlushTelemetry:
    """Tests for flush_telemetry()."""

    def test_no_providers_does_not_raise(self):
        flush_telemetry()  # should not raise


# Need pytest import for raises
import pytest
