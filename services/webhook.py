import json
import os
import uuid
from datetime import datetime, timezone

import requests


def send_to_webhook(analysis_data, original_url, source_metadata):
    """Builds the final payload and sends it to the webhook."""
    webhook_base = os.environ.get(
        "WEBHOOK_URL",
        "https://vpkbytgemzxkxtcxacwm.supabase.co/functions/v1/recommendation-webhook"
    )
    webhook_token = os.environ.get("WEBHOOK_TOKEN", "")
    webhook_url = f"{webhook_base}?token={webhook_token}" if webhook_token else webhook_base

    try:
        final_entry = {
            "input_type": "recommendation",
            "recommendation_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source_url": original_url,
            "source_title": source_metadata.get("title", ""),
            "source_image": source_metadata.get("image", ""),
            "analysis": analysis_data
        }

        print(json.dumps(final_entry, indent=4))
        requests.post(webhook_url, json=final_entry, headers={"Content-Type": "application/json"}, timeout=10)
        return True
    except Exception as e:
        print(f"Webhook error: {e}")
        return False
