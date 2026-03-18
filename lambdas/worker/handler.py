"""triptomat-worker Lambda handler.

Required env vars:
  S3_BUCKET           — S3 bucket for media files (default: triptomat-media)
  DYNAMODB_TABLE      — DynamoDB cache table name (default: triptomat-cache)
  GOOGLE_API_KEY      — Google Gemini API key for AI analysis
  MAP_GOOGLE_API_KEY  — Google Maps API key for geocoding
  WEBHOOK_URL         — Supabase recommendation webhook URL
  WEBHOOK_TOKEN       — Default webhook auth token (overridden per-request)
  SUPABASE_URL        — Supabase project URL (for reconciliation)
  SUPABASE_SERVICE_KEY — Supabase service role key (for reconciliation)

Optional env vars:
  OTEL_ENABLED        — "true" to enable OpenTelemetry tracing/metrics
"""

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from pydantic import ValidationError

from core.analyzer import GeminiService
from core.config import load_config
from core.geocoding import enrich_analysis_data, extract_coords_from_url
from core.prompts import build_main_prompt
from core.scrapers import MapsService
from core.schemas import AnalysisMessage
from core.pipeline_events import report_event
from core.reconciliation import reconcile
from core.webhook import send_to_webhook, send_failure_to_webhook
from core.telemetry import (
    init_telemetry, get_tracer, get_meter,
    safe_span, record_counter, record_histogram, time_ms,
    flush_telemetry, record_span_error,
)

# ── Telemetry setup ─────────────────────────────────────────────────────────
init_telemetry("triptomat-worker")
tracer = get_tracer(__name__)
meter = get_meter(__name__)

analyses_counter = meter.create_counter(
    "triptomat.worker.analyses",
    description="Total analysis jobs",
)
analysis_duration_hist = meter.create_histogram(
    "triptomat.worker.analysis_duration_ms",
    description="AI analysis duration in milliseconds",
)
geocoding_counter = meter.create_counter(
    "triptomat.worker.geocoding_calls",
    description="Total geocoding enrichment calls",
)
webhook_counter = meter.create_counter(
    "triptomat.worker.webhook_deliveries",
    description="Webhook delivery attempts",
)

# ── AWS clients & config ────────────────────────────────────────────────────
s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

S3_BUCKET = os.environ.get("S3_BUCKET", "triptomat-media")
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "triptomat-cache")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
MAP_GOOGLE_API_KEY = os.environ.get("MAP_GOOGLE_API_KEY", "")

table = dynamodb.Table(DYNAMODB_TABLE)
gemini = GeminiService(GOOGLE_API_KEY)
maps = MapsService(MAP_GOOGLE_API_KEY)

ALLOWED_TYPES, GEO_ONLY_TYPES = load_config()
main_prompt = build_main_prompt(ALLOWED_TYPES, GEO_ONLY_TYPES)


def _to_decimal(obj):
    """Recursively convert floats to Decimals for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(v) for v in obj]
    return obj


def lambda_handler(event, context):
    """SQS-triggered handler. Runs AI analysis, geocoding, webhook, and caches result."""
    try:
        for record in event["Records"]:
            raw = json.loads(record["body"])

            try:
                msg = AnalysisMessage.model_validate(raw)
            except ValidationError as e:
                print(f"Invalid SQS message: {e}")
                raise

            job_id = msg.job_id
            url = msg.url
            source_type = msg.source_type
            source_metadata = msg.source_metadata
            webhook_token = msg.webhook_token or ""

            with safe_span(tracer, "worker.handle_message", {
                "worker.job_id": job_id,
                "worker.source_type": source_type,
            }) as root_span:
                print(f"Analyzing job {job_id} ({source_type}): {url}")
                report_event(job_id, "worker", "started", source_url=url, source_type=source_type, title=source_metadata.get("title", ""), image=source_metadata.get("image", ""))

                try:
                    response_json = None
                    manual_lat, manual_lng = None, None

                    # ── AI Analysis ─────────────────────────────────────────
                    with safe_span(tracer, "worker.ai_analysis", {
                        "ai.source_type": source_type,
                        "ai.model_name": "gemini",
                    }) as ai_span:
                        ai_start = time_ms()

                        if source_type == "video":
                            s3_key = msg.s3_key
                            video_path = f"/tmp/{job_id}.mp4"
                            s3.download_file(S3_BUCKET, s3_key, video_path)

                            description = source_metadata.get("description", "")
                            if description:
                                video_prompt = (
                                    f"Analyze BOTH the video AND this post description/caption:\n"
                                    f"---\n{description}\n---\n\n"
                                    f"The video may show specific places, while the description may list names, "
                                    f"addresses, or details not visible in the video. "
                                    f"Extract recommendations from BOTH sources.\n\n{main_prompt}"
                                )
                            else:
                                video_prompt = main_prompt

                            response_text = gemini.analyze_video(video_path, video_prompt)
                            response_json = json.loads(response_text)
                            os.remove(video_path)

                        elif source_type == "maps":
                            final_url = msg.final_url or url
                            manual_lat = msg.manual_lat
                            manual_lng = msg.manual_lng

                            if manual_lat and manual_lng:
                                actual_address = maps.get_address_from_coords(manual_lat, manual_lng)
                                prompt = f"Identify this place. URL: {final_url}\nAddress: {actual_address}\n\n{main_prompt}"
                            else:
                                prompt = f"Identify this place from the URL: {final_url}\n\n{main_prompt}"

                            response_text = gemini.analyze_text(prompt)
                            response_json = json.loads(response_text)

                            if response_json.get("recommendations"):
                                place_name = response_json["recommendations"][0].get("name", "Google Maps Location")
                                source_metadata["title"] = place_name
                                if manual_lat and manual_lng:
                                    source_metadata["image"] = maps.get_google_maps_image(manual_lat, manual_lng, place_name)

                        elif source_type == "web":
                            text = msg.text or ""
                            if text:
                                if text.strip().startswith("[AI Chat Insights"):
                                    prompt = (
                                        f"The following is a structured list of travel recommendations, "
                                        f"possibly organized by day. Extract EVERY place name as a separate recommendation. "
                                        f"If the list is grouped by days (Day 1, Day 2, etc.), preserve the day and order.\n\n"
                                        f"{text}\n\n{main_prompt}"
                                    )
                                else:
                                    prompt = f"Analyze this text and extract locations:\n{text}\n\n{main_prompt}"
                                response_text = gemini.analyze_text(prompt)
                                response_json = json.loads(response_text)

                        ai_duration = time_ms() - ai_start
                        record_histogram(analysis_duration_hist, ai_duration, {"source_type": source_type})

                    if response_json:
                        rec_count = len(response_json.get("recommendations", []))
                        hierarchy = response_json.get("sites_hierarchy", [])
                        report_event(job_id, "worker", "started", metadata={
                            "sub_stage": "ai_done",
                            "recommendations_count": rec_count,
                            "sites_hierarchy": hierarchy,
                            "ai_duration_ms": round(ai_duration),
                        })

                        # ── Geocoding ────────────────────────────────────────
                        with safe_span(tracer, "worker.geocoding") as geo_span:
                            enriched_data = enrich_analysis_data(
                                response_json, maps.get_location_details, manual_lat, manual_lng
                            )
                            location_count = len(enriched_data.get("recommendations", []))
                            if geo_span:
                                try:
                                    geo_span.set_attribute("geocoding.location_count", location_count)
                                except Exception:
                                    pass
                            record_counter(geocoding_counter)

                        # Fetch image for each recommendation
                        for rec in enriched_data.get("recommendations", []):
                            coords = rec.get("location", {}).get("coordinates", {})
                            lat, lng = coords.get("lat"), coords.get("lng")
                            name = rec.get("name", "")
                            if lat and lng and name:
                                image_url = maps.get_google_maps_image(lat, lng, name)
                                if not image_url:
                                    site = rec.get("site", "")
                                    search_query = f"{name}, {site}" if site else name
                                    image_url = maps.search_google_image(search_query)
                                if image_url:
                                    rec["image_url"] = image_url

                        # Set source image from first recommendation if still empty
                        if not source_metadata.get("image"):
                            recs = enriched_data.get("recommendations", [])
                            for rec in recs:
                                if rec.get("image_url"):
                                    source_metadata["image"] = rec["image_url"]
                                    break

                        # ── Reconciliation ──────────────────────────────────
                        with safe_span(tracer, "worker.reconciliation"):
                            enriched_data = reconcile(
                                enriched_data, webhook_token, GOOGLE_API_KEY,
                            )

                        # ── Webhook ──────────────────────────────────────────
                        webhook_url_masked = os.environ.get("WEBHOOK_URL", "")[:30] + "..."
                        with safe_span(tracer, "worker.webhook_send", {
                            "webhook.url_masked": webhook_url_masked,
                        }) as wh_span:
                            _source_text = msg.text if source_type == "web" else None
                            result = send_to_webhook(enriched_data, url, source_metadata, webhook_token=webhook_token or None, job_id=job_id, source_text=_source_text)
                            status_label = "success" if result else "failure"
                            if wh_span:
                                try:
                                    wh_span.set_attribute("webhook.status", status_label)
                                except Exception:
                                    pass
                            record_counter(webhook_counter, attributes={"status": status_label})

                        # ── Cache write ──────────────────────────────────────
                        with safe_span(tracer, "worker.cache_write", {
                            "cache.url": url[:200],
                            "cache.status": "completed",
                        }):
                            table.put_item(Item={
                                "url": url,
                                "job_id": job_id,
                                "status": "completed",
                                "result": _to_decimal(enriched_data),
                                "source_metadata": source_metadata,
                                "created_at": datetime.now(timezone.utc).isoformat(),
                            })
                        # Report final enriched results for monitoring
                        final_recs = enriched_data.get("recommendations", [])
                        report_event(job_id, "worker", "completed", metadata={
                            "recommendations_count": len(final_recs),
                            "recommendations": [
                                {"name": r.get("name", ""), "category": r.get("category", ""), "site": r.get("site", "")}
                                for r in final_recs[:20]
                            ],
                            "contacts_count": len(enriched_data.get("contacts", [])),
                        })
                        print(f"Job {job_id}: completed and cached")
                        record_counter(analyses_counter, attributes={"source_type": source_type, "status": "success"})

                    else:
                        with safe_span(tracer, "worker.cache_write", {
                            "cache.url": url[:200],
                            "cache.status": "completed_empty",
                        }):
                            table.put_item(Item={
                                "url": url,
                                "job_id": job_id,
                                "status": "completed",
                                "result": {},
                                "source_metadata": source_metadata,
                                "created_at": datetime.now(timezone.utc).isoformat(),
                            })
                        print(f"Job {job_id}: no recommendations found")
                        record_counter(analyses_counter, attributes={"source_type": source_type, "status": "empty"})

                except Exception as e:
                    report_event(job_id, "worker", "failed", metadata={"error": str(e)[:300]})
                    print(f"Job {job_id} failed: {e}")
                    record_counter(analyses_counter, attributes={"source_type": source_type, "status": "failure"})
                    if root_span:
                        record_span_error(root_span, e)
                    table.put_item(Item={
                        "url": url,
                        "job_id": job_id,
                        "status": "failed",
                        "error": str(e),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                    # Notify frontend of failure via webhook
                    send_failure_to_webhook(url, source_metadata, e, webhook_token=webhook_token or None, job_id=job_id)
                    raise
    finally:
        flush_telemetry()
