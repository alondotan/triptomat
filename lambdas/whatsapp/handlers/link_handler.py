"""Handle incoming URLs — invoke the gateway Lambda for analysis."""

import json
import logging
import os

import boto3

from classifier import extract_urls
import meta_api

logger = logging.getLogger(__name__)

lambda_client = boto3.client("lambda")
GATEWAY_FUNCTION_NAME = os.environ.get("GATEWAY_FUNCTION_NAME", "triptomat-gateway")


def handle_link(wa_user: dict, message: dict, phone: str) -> None:
    """Extract URL(s) from the message and invoke the gateway Lambda asynchronously."""
    text = (message.get("text") or {}).get("body", "")
    urls = extract_urls(text)

    if not urls:
        meta_api.send_text(phone, "I couldn't find a URL in your message. Please send a valid link.")
        return

    webhook_token = wa_user.get("webhook_token", "")
    if not webhook_token:
        meta_api.send_text(phone, "Your account isn't fully linked. Please re-link via the app.")
        return

    # Process each URL (usually just one)
    for url in urls[:3]:  # limit to 3 URLs per message
        _invoke_gateway(url, webhook_token, phone)

    if len(urls) == 1:
        meta_api.send_reaction(phone, message.get("id", ""), "\u23f3")  # hourglass
        meta_api.send_text(phone, f"Processing your link...\n{urls[0]}")
    else:
        meta_api.send_text(phone, f"Processing {len(urls[:3])} links...")


def _invoke_gateway(url: str, webhook_token: str, phone: str) -> None:
    """Invoke the triptomat-gateway Lambda asynchronously."""
    payload = {
        "httpMethod": "POST",
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "url": url,
            "webhook_token": webhook_token,
        }),
    }

    try:
        lambda_client.invoke(
            FunctionName=GATEWAY_FUNCTION_NAME,
            InvocationType="Event",  # async — don't wait for response
            Payload=json.dumps(payload),
        )
        logger.info("Invoked gateway for URL: %s", url[:100])
    except Exception as e:
        logger.error("Failed to invoke gateway: %s", e)
        meta_api.send_text(phone, "Sorry, I couldn't process that link. Please try again.")
