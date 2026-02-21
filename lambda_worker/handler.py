import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

from core.analyzer import GeminiService
from core.config import load_config
from core.geocoding import enrich_analysis_data, extract_coords_from_url
from core.prompts import build_main_prompt
from core.scrapers import MapsService
from core.webhook import send_to_webhook

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
    for record in event["Records"]:
        msg = json.loads(record["body"])
        job_id = msg["job_id"]
        url = msg["url"]
        source_type = msg["source_type"]
        source_metadata = msg.get("source_metadata", {"title": "", "image": ""})
        webhook_token = msg.get("webhook_token", "")

        print(f"Analyzing job {job_id} ({source_type}): {url}")

        try:
            response_json = None
            manual_lat, manual_lng = None, None

            if source_type == "video":
                s3_key = msg["s3_key"]
                video_path = f"/tmp/{job_id}.mp4"
                s3.download_file(S3_BUCKET, s3_key, video_path)

                response_text = gemini.analyze_video(video_path, main_prompt)
                response_json = json.loads(response_text)
                os.remove(video_path)

            elif source_type == "maps":
                final_url = msg.get("final_url", url)
                manual_lat = msg.get("manual_lat")
                manual_lng = msg.get("manual_lng")

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
                text = msg.get("text", "")
                if text:
                    prompt = f"Analyze this text and extract locations:\n{text}\n\n{main_prompt}"
                    response_text = gemini.analyze_text(prompt)
                    response_json = json.loads(response_text)

            if response_json:
                enriched_data = enrich_analysis_data(
                    response_json, maps.get_location_details, manual_lat, manual_lng
                )
                send_to_webhook(enriched_data, url, source_metadata, webhook_token=webhook_token or None)

                # Cache result in DynamoDB
                table.put_item(Item={
                    "url": url,
                    "job_id": job_id,
                    "status": "completed",
                    "result": _to_decimal(enriched_data),
                    "source_metadata": source_metadata,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                print(f"Job {job_id}: completed and cached")
            else:
                table.put_item(Item={
                    "url": url,
                    "job_id": job_id,
                    "status": "completed",
                    "result": {},
                    "source_metadata": source_metadata,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                print(f"Job {job_id}: no recommendations found")

        except Exception as e:
            print(f"Job {job_id} failed: {e}")
            table.put_item(Item={
                "url": url,
                "job_id": job_id,
                "status": "failed",
                "error": str(e),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            raise
