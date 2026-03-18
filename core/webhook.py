import json
import os
import uuid
from datetime import datetime, timezone

import requests


def send_to_webhook(analysis_data, original_url, source_metadata, webhook_token=None, job_id=None, source_text=None):
    """Builds the final payload and sends it to the webhook."""
    webhook_base = os.environ.get("WEBHOOK_URL", "")
    token = webhook_token or os.environ.get("WEBHOOK_TOKEN", "")
    webhook_url = f"{webhook_base}?token={token}" if token else webhook_base

    try:
        final_entry = {
            "input_type": "recommendation",
            "recommendation_id": job_id or str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source_url": original_url,
            "source_title": source_metadata.get("title", ""),
            "source_image": source_metadata.get("image", ""),
            "analysis": analysis_data
        }
        if source_text:
            final_entry["source_text"] = source_text

        print(json.dumps(final_entry, indent=4))
        requests.post(webhook_url, json=final_entry, headers={"Content-Type": "application/json"}, timeout=10)
        return True
    except Exception as e:
        print(f"Webhook error: {e}")
        return False


def send_failure_to_webhook(original_url, source_metadata, error_message, webhook_token=None, job_id=None):
    """Sends a failure notification to the webhook so the frontend can update the processing row."""
    webhook_base = os.environ.get("WEBHOOK_URL", "")
    token = webhook_token or os.environ.get("WEBHOOK_TOKEN", "")
    webhook_url = f"{webhook_base}?token={token}" if token else webhook_base

    try:
        final_entry = {
            "input_type": "recommendation",
            "recommendation_id": job_id or str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source_url": original_url,
            "source_title": source_metadata.get("title", ""),
            "source_image": source_metadata.get("image", ""),
            "status": "failed",
            "error": str(error_message)[:500],
        }

        print(f"Sending failure webhook: {json.dumps(final_entry, indent=4)}")
        requests.post(webhook_url, json=final_entry, headers={"Content-Type": "application/json"}, timeout=10)
        return True
    except Exception as e:
        print(f"Failure webhook error: {e}")
        return False
