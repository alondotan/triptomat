import json
import os
import traceback
import uuid
from decimal import Decimal

import boto3

from core.url_helpers import is_google_maps_url, is_video_url
from core.scrapers import extract_text_from_url, get_final_maps_url, get_web_metadata, MapsService
from core.geocoding import extract_coords_from_url

sqs = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")

DOWNLOAD_QUEUE_URL = os.environ.get("DOWNLOAD_QUEUE_URL", "")
ANALYSIS_QUEUE_URL = os.environ.get("ANALYSIS_QUEUE_URL", "")
DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "triptomat-cache")
MAP_GOOGLE_API_KEY = os.environ.get("MAP_GOOGLE_API_KEY", "")

table = dynamodb.Table(DYNAMODB_TABLE)
maps = MapsService(MAP_GOOGLE_API_KEY) if MAP_GOOGLE_API_KEY else None


def lambda_handler(event, context):
    """API Gateway entry point. Checks cache, classifies URL, dispatches to queues."""
    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})

    try:
        body = json.loads(event.get("body", "{}"))
        url = body.get("url")
        overwrite = body.get("overwrite", False)
        webhook_token = body.get("webhook_token", "")

        if not url:
            return _response(400, {"error": "Missing 'url' in request body"})

        # Check DynamoDB cache
        if not overwrite:
            cached = table.get_item(Key={"url": url}).get("Item")
            if cached and cached.get("status") == "completed":
                return _response(200, {
                    "status": "completed",
                    "url": url,
                    "source_metadata": cached.get("source_metadata", {}),
                    "analysis": cached.get("result", {})
                })

        job_id = str(uuid.uuid4())

        if is_video_url(url):
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

            sqs.send_message(
                QueueUrl=ANALYSIS_QUEUE_URL,
                MessageBody=json.dumps(msg)
            )
        else:
            text = extract_text_from_url(url)
            source_metadata = get_web_metadata(url)

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
        table.put_item(Item={
            "url": url,
            "job_id": job_id,
            "status": "processing"
        })

        return _response(202, {
            "status": "processing",
            "job_id": job_id,
            "message": "Job submitted"
        })

    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON in request body"})
    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


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
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body, cls=_DecimalEncoder)
    }
