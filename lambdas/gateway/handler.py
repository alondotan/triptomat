"""triptomat-gateway Lambda handler.

Required env vars:
  DOWNLOAD_QUEUE_URL  — SQS queue URL for video downloads
  ANALYSIS_QUEUE_URL  — SQS queue URL for AI analysis
  DYNAMODB_TABLE      — DynamoDB cache table name (default: triptomat-cache)
  MAP_GOOGLE_API_KEY  — Google Maps API key for geocoding

Optional env vars:
  ALLOWED_ORIGINS     — Comma-separated CORS origins (default: Supabase + localhost dev)
  RATE_LIMIT          — Max requests per minute per token/IP (default: 30)
  OTEL_ENABLED        — "true" to enable OpenTelemetry tracing/metrics
"""

import json
import logging
import os
import time
import traceback
import uuid
from decimal import Decimal
from urllib.parse import urlparse

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

import boto3
from botocore.exceptions import ClientError
from pydantic import ValidationError

from core.schemas import GatewayRequest
from core.url_helpers import is_google_maps_url, is_video_url
from core.scrapers import extract_text_from_url, get_final_maps_url, get_web_metadata, MapsService
from core.geocoding import extract_coords_from_url
from core.pipeline_events import report_event
from core.telemetry import (
    init_telemetry, get_tracer, get_meter,
    safe_span, record_counter, time_ms,
    flush_telemetry, record_span_error,
)

# ── Telemetry setup ─────────────────────────────────────────────────────────
init_telemetry("triptomat-gateway")
tracer = get_tracer(__name__)
meter = get_meter(__name__)

requests_counter = meter.create_counter(
    "triptomat.gateway.requests",
    description="Total gateway requests",
)
rate_limit_counter = meter.create_counter(
    "triptomat.gateway.rate_limit_hits",
    description="Requests rejected by rate limiter",
)

# ── AWS clients & config ────────────────────────────────────────────────────
sqs = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")

DOWNLOAD_QUEUE_URL = os.environ.get("DOWNLOAD_QUEUE_URL", "")
ANALYSIS_QUEUE_URL = os.environ.get("ANALYSIS_QUEUE_URL", "")
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "triptomat-cache")
MAP_GOOGLE_API_KEY = os.environ.get("MAP_GOOGLE_API_KEY", "")
_DEFAULT_ORIGINS = "https://aqpzhflzsqkjceeeufyf.supabase.co,https://triptomat.com,https://www.triptomat.com,http://localhost:5173,http://localhost:8080"
ALLOWED_ORIGINS = {
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()
}
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "30"))
MAX_BODY_SIZE = 1_000_000  # 1 MB

# Set per-invocation by lambda_handler; used by _response.
_cors_origin = ""

table = dynamodb.Table(DYNAMODB_TABLE)
maps = MapsService(MAP_GOOGLE_API_KEY) if MAP_GOOGLE_API_KEY else None


def _resolve_cors_origin(event):
    """Return the request Origin if it's in the allow-list, else the first allowed origin."""
    headers = event.get("headers") or {}
    origin = headers.get("Origin") or headers.get("origin") or ""
    if origin in ALLOWED_ORIGINS:
        return origin
    return next(iter(ALLOWED_ORIGINS), "")


def _check_rate_limit(identifier):
    """Increment a per-minute counter in DynamoDB. Returns (within_limit, count)."""
    now = int(time.time())
    window_key = f"rate:{identifier}:{now // 60}"
    ttl_value = now // 60 * 60 + 120  # expire 2 minutes after window start

    try:
        resp = table.update_item(
            Key={"url": window_key},
            UpdateExpression="SET #cnt = if_not_exists(#cnt, :zero) + :inc, #ttl = :ttl",
            ExpressionAttributeNames={"#cnt": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={":zero": 0, ":inc": 1, ":ttl": ttl_value},
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp["Attributes"]["count"])
        return count <= RATE_LIMIT, count
    except ClientError:
        # If rate-limit check fails, allow the request (fail open)
        return True, -1


def lambda_handler(event, context):
    """API Gateway entry point. Checks cache, classifies URL, dispatches to queues."""
    global _cors_origin
    _cors_origin = _resolve_cors_origin(event)

    try:
        # Handle CORS preflight
        if event.get("httpMethod") == "OPTIONS":
            return _response(200, {})

        http_method = event.get("httpMethod", "UNKNOWN")
        path = event.get("path", "/")
        source_ip = event.get("requestContext", {}).get("identity", {}).get("sourceIp", "unknown")

        with safe_span(tracer, "gateway.handle_request", {
            "http.method": http_method,
            "http.path": path,
            "net.peer.ip": source_ip,
        }) as root_span:
            try:
                # Request size validation
                body_str = event.get("body") or ""
                if len(body_str) > MAX_BODY_SIZE:
                    return _response(413, {"error": "Request body too large (max 1MB)"})

                body = json.loads(body_str)

                try:
                    req = GatewayRequest.model_validate(body)
                except ValidationError as e:
                    return _response(400, {"error": e.errors()[0]["msg"]})

                url = str(req.url) if req.url else None
                text = req.text
                overwrite = req.overwrite
                logger.info("Request: url=%s text=%s overwrite=%s", url[:200] if url else None, bool(text), overwrite)
                webhook_token = req.webhook_token or ""

                # Rate limiting — prefer webhook_token, fall back to source IP
                rate_key = webhook_token or source_ip

                with safe_span(tracer, "gateway.rate_limit_check", {
                    "rate_limit.identifier": rate_key[:16] + "..." if len(rate_key) > 16 else rate_key,
                }) as rl_span:
                    within_limit, current_count = _check_rate_limit(rate_key)
                    if rl_span:
                        try:
                            rl_span.set_attribute("rate_limit.current_count", current_count)
                            rl_span.set_attribute("rate_limit.is_limited", not within_limit)
                        except Exception:
                            pass

                if not within_limit:
                    record_counter(rate_limit_counter)
                    return _response(429, {"error": "Too many requests. Limit: {} per minute".format(RATE_LIMIT)})

                # ── Text paste flow: skip cache, skip scraping, go straight to analysis ──
                if text and text.strip():
                    text = text.strip()
                    job_id = str(uuid.uuid4())
                    synthetic_url = f"text://paste-{job_id}"
                    title = text[:80].split("\n")[0]

                    with safe_span(tracer, "gateway.sqs_dispatch", {
                        "sqs.queue_name": "analysis",
                        "gateway.source_type": "text",
                        "gateway.job_id": job_id,
                    }):
                        sqs.send_message(
                            QueueUrl=ANALYSIS_QUEUE_URL,
                            MessageBody=json.dumps({
                                "job_id": job_id,
                                "url": synthetic_url,
                                "source_type": "web",
                                "source_metadata": {"title": title, "image": ""},
                                "text": text[:5000],
                                "webhook_token": webhook_token,
                            })
                        )

                    report_event(job_id, "gateway", "completed", source_url=synthetic_url, source_type="text", title=title, metadata={"queue": "analysis"})
                    record_counter(requests_counter, attributes={"source_type": "text", "cache_hit": "false"})
                    return _response(202, {
                        "status": "processing",
                        "job_id": job_id,
                        "source_metadata": {"title": title, "image": ""},
                        "message": "Text submitted for analysis"
                    })

                if not url:
                    return _response(400, {"error": "Missing 'url' or 'text' in request body"})

                # URL input sanitization
                parsed = urlparse(url)
                if parsed.scheme not in ("http", "https"):
                    return _response(400, {"error": "Invalid URL scheme — only http and https are allowed"})

                # Check DynamoDB cache
                cache_hit = False
                if not overwrite:
                    with safe_span(tracer, "gateway.cache_lookup", {
                        "cache.url": url[:200],
                    }) as cache_span:
                        cached = table.get_item(Key={"url": url}).get("Item")
                        cache_hit = bool(cached and cached.get("status") == "completed")
                        if cache_span:
                            try:
                                cache_span.set_attribute("cache.hit", cache_hit)
                            except Exception:
                                pass

                    if cache_hit:
                        source_type = "cached"
                        logger.info("Cache hit for %s", url[:200])
                        record_counter(requests_counter, attributes={"source_type": source_type, "cache_hit": "true"})
                        return _response(200, {
                            "status": "completed",
                            "url": url,
                            "source_metadata": cached.get("source_metadata", {}),
                            "analysis": cached.get("result", {})
                        })

                job_id = str(uuid.uuid4())

                logger.info("Classifying URL: video=%s maps=%s", is_video_url(url), is_google_maps_url(url))

                if is_video_url(url):
                    source_type = "video"
                    source_metadata = get_web_metadata(url)
                    with safe_span(tracer, "gateway.sqs_dispatch", {
                        "sqs.queue_name": "download",
                        "gateway.source_type": source_type,
                        "gateway.job_id": job_id,
                    }):
                        sqs.send_message(
                            QueueUrl=DOWNLOAD_QUEUE_URL,
                            MessageBody=json.dumps({
                                "job_id": job_id,
                                "url": url,
                                "overwrite": overwrite,
                                "webhook_token": webhook_token,
                            })
                        )
                elif is_google_maps_url(url):
                    source_type = "maps"
                    final_url = get_final_maps_url(url)
                    manual_lat, manual_lng = extract_coords_from_url(final_url)

                    source_metadata = {"title": "", "image": ""}
                    if manual_lat and manual_lng and maps:
                        actual_address = maps.get_address_from_coords(manual_lat, manual_lng)
                        source_metadata["title"] = f"Location: {actual_address}"

                    msg = {
                        "job_id": job_id,
                        "url": url,
                        "source_type": "maps",
                        "source_metadata": source_metadata,
                        "final_url": final_url,
                        "webhook_token": webhook_token,
                    }
                    if manual_lat is not None:
                        msg["manual_lat"] = manual_lat
                    if manual_lng is not None:
                        msg["manual_lng"] = manual_lng

                    with safe_span(tracer, "gateway.sqs_dispatch", {
                        "sqs.queue_name": "analysis",
                        "gateway.source_type": source_type,
                        "gateway.job_id": job_id,
                    }):
                        sqs.send_message(
                            QueueUrl=ANALYSIS_QUEUE_URL,
                            MessageBody=json.dumps(msg)
                        )
                else:
                    source_type = "web"
                    text = extract_text_from_url(url)
                    source_metadata = get_web_metadata(url)

                    with safe_span(tracer, "gateway.sqs_dispatch", {
                        "sqs.queue_name": "analysis",
                        "gateway.source_type": source_type,
                        "gateway.job_id": job_id,
                    }):
                        sqs.send_message(
                            QueueUrl=ANALYSIS_QUEUE_URL,
                            MessageBody=json.dumps({
                                "job_id": job_id,
                                "url": url,
                                "source_type": "web",
                                "source_metadata": source_metadata,
                                "text": text[:5000] if text else "",
                                "webhook_token": webhook_token,
                            })
                        )

                # Mark as processing in DynamoDB
                logger.info("Job %s dispatched: type=%s url=%s", job_id, source_type, url[:200])
                table.put_item(Item={
                    "url": url,
                    "job_id": job_id,
                    "status": "processing"
                })

                report_event(
                    job_id, "gateway", "completed",
                    source_url=url, source_type=source_type,
                    title=source_metadata.get("title", ""),
                    image=source_metadata.get("image", ""),
                    metadata={"queue": "download" if source_type == "video" else "analysis"},
                )
                record_counter(requests_counter, attributes={"source_type": source_type, "cache_hit": "false"})

                return _response(202, {
                    "status": "processing",
                    "job_id": job_id,
                    "source_metadata": source_metadata,
                    "message": "Job submitted"
                })

            except json.JSONDecodeError:
                logger.warning("Invalid JSON in request body")
                return _response(400, {"error": "Invalid JSON in request body"})
            except Exception as e:
                logger.error("Gateway error: %s", e, exc_info=True)
                if root_span:
                    record_span_error(root_span, e)
                return _response(500, {"error": str(e)})
    finally:
        flush_telemetry()


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": _cors_origin,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body, cls=_DecimalEncoder)
    }
