"""triptomat-mail-handler Lambda handler.

Required env vars:
  MAIL_WEBHOOK_URL    — Supabase travel-webhook Edge Function URL
  SUPABASE_URL        — Supabase project URL (for user lookup)
  SUPABASE_SERVICE_KEY — Supabase service-role key
  OPENAI_API_KEY      — OpenAI API key for email analysis
"""

import json
import boto3
import os
import re
import urllib.error
import urllib.request
import urllib.parse
import uuid
import datetime
from email import message_from_string
from email.policy import default
from email.utils import parseaddr

from core.config import load_config

s3_client = boto3.client('s3')

ALLOWED_TYPES, GEO_ONLY_TYPES = load_config()
WEBHOOK_URL = os.environ.get('MAIL_WEBHOOK_URL', '')
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')


def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'])

    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        raw_email = response['Body'].read().decode('utf-8')
        msg = message_from_string(raw_email, policy=default)

        html_content = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    html_content = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8')
                    break
        else:
            html_content = msg.get_payload(decode=True).decode(msg.get_content_charset() or 'utf-8')

        plain_text = _get_plain_text(msg)
        fwd_headers = _extract_forwarded_headers(plain_text)
        _, user_email = parseaddr(msg['from'])

        token = get_webhook_token_for_email(user_email)
        if not token:
            print(f"No webhook token found for {user_email} — skipping")
            return {'statusCode': 200, 'body': json.dumps('No user found, skipped')}

        clean_html = clean_html_for_ai(html_content)
        travel_data = call_openai(clean_html, ALLOWED_TYPES, GEO_ONLY_TYPES)

        if travel_data:
            travel_data["source_email_info"] = {
                "subject": fwd_headers.get("subject", msg['subject']),
                "sender": fwd_headers.get("from", msg['from']),
                "date_sent": fwd_headers.get("date", msg['date']),
            }
            travel_data["user_email"] = user_email

            payload = travel_data
            payload["input_type"] = "email"
            payload["recommendation_id"] = str(uuid.uuid4())
            payload["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
            payload["source_url"] = f"s3://{bucket}/{key}"

            print(json.dumps(payload, indent=2, ensure_ascii=False))
            if WEBHOOK_URL:
                send_to_webhook(payload, WEBHOOK_URL, token)

        return {'statusCode': 200, 'body': json.dumps('Processed and Sent')}

    except Exception as e:
        print(f"Error: {str(e)}")
        raise e


def _get_plain_text(msg):
    """Return the first text/plain body part of an email message."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return part.get_payload(decode=True).decode(
                    part.get_content_charset() or 'utf-8', errors='replace'
                )
    elif msg.get_content_type() == "text/plain":
        return msg.get_payload(decode=True).decode(
            msg.get_content_charset() or 'utf-8', errors='replace'
        )
    return ""


def _extract_forwarded_headers(plain_text):
    """
    Parse the forwarded-message header block (From/Date/Subject/To) that Gmail
    inserts when a user forwards an email.  Returns a dict with lowercase keys.
    Falls back to an empty dict if no forwarded block is found.
    """
    headers = {}
    lines = plain_text.replace('\r\n', '\n').split('\n')
    in_block = False

    for line in lines:
        if re.match(r'-{5,}.*Forwarded message.*-{5,}', line, re.IGNORECASE):
            in_block = True
            continue

        if in_block:
            if not line.strip():
                break
            # Strip leading Unicode bidirectional / invisible marks
            clean = line.lstrip('\u202a\u202b\u202c\u200e\u200f')
            m = re.match(r'^(From|Date|Subject|To):\s*(.+)$', clean, re.IGNORECASE)
            if m:
                headers[m.group(1).lower()] = m.group(2).strip()

    return headers


def clean_html_for_ai(html):
    if not html:
        return ""
    clean = re.sub(r'<head.*?>.*?</head>', '', html, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r'<style.*?>.*?</style>', '', clean, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r'<script.*?>.*?</script>', '', clean, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r'\s+[a-z-]+=(["\'])(?:(?!\1).)*\1', '', clean, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', clean).strip()[:15000]


def call_openai(html_text, allowed_types, geo_types):
    today = datetime.date.today()

    system_prompt = f"""You are a data extraction agent. Analyze the email and return ONLY a valid JSON object.
            Current date for reference: {today.strftime("%B %d, %Y")}.

            ### Extraction Rules:
            1. Categorization:
            - "category": Must be "transportation", "accommodation", "attraction", or "eatery".
            - "sub_category": Detailed types must be strictly from:  {", ".join(allowed_types)}

            2. Location & Addresses:
            - All addresses MUST be in English.
            - Break down addresses into: {{"street": "string", "city": "string", "country": "string"}}.
            - CRITICAL: Do NOT extract the address of the email sender or booking platform (e.g., ignore Amsterdam addresses from Booking.com).
            - If the street address is missing but the establishment is famous, use your knowledge to fill city and country.
            3. Currency: Use ISO 4217 standard.
            4. Details about transportation, accommodation,attraction or eatery should only be filled in if they are relevant to the type of information, otherwise there is no need to send them.
            5. In the segments, fill all the segments of the transportation and fill the full addresses from the mail or from your knowledge.
            6. Accommodation/Restaurant/Eatery: Include "location_details" in English.
            7. Language: "summary" and "raw_notes" in Hebrew. All names/locations in English.
            8. Don't fill cost if it doesn't appear in the mail.
            9. Timing & Years: If a date in the email (e.g., "19 Mar") lacks a year, use the current year ({today.year}) if the date is in the future, or the next year if the date has already passed this year.

            10. The date in the metadata refer to the main date that relevant to the mail (e.g., checking date,departure date,reservation date).
            11. Payment Status (`is_paid` in metadata):
            - Set `true` if the email confirms payment was already made (e.g., flight bookings, ticket purchases, "payment confirmed", "thank you for your payment", "amount charged").
            - Set `false` if payment is deferred (e.g., hotel with "pay at hotel", "pay on arrival", "free cancellation", "payment due at check-in", Booking.com-style reservations without prepayment).
            - Default: `true` for transportation (flights/trains/ferries usually require upfront payment), `false` for accommodation and eateries.
            12. The sites_hierarchy (Nested Structure):
            - Construct a nested geographical tree under the key "sites_hierarchy".
            - The first level must be the country or countries that in the mail.
            - Each node must be an object: {{"site": "Name", "site_type": "Type", "sub_sites": []}}.
            - Use "sub_sites" only if child locations exist.
            - Types must be strictly from: {geo_types}.
            - The hierarchy MUST follow a logical path: Country -> State/Region -> City -> Neighborhood/POI.
            - The sites_hierarchy should only contain the sites of the recommendations.
            - All values in the sites_hierarchy must be the english names.

            ### JSON Schema Structure:
            {{
            "metadata": {{"date":"", "category": "", "sub_category": "", "action": "create|update|cancel", "order_number": "", "is_paid": true}},
            "sites_hierarchy": [
                            {{
                                "site": "Country Name",
                                "site_type": "country",
                                "sub_sites": [
                                    {{
                                        "site": "City/State Name/Region",
                                        "site_type": "city",
                                        "sub_sites": []
                                    }}
                                ]
                            }}
                ],
            "accommodation_details": {{ "establishment_name": "",
                                        "rooms": [{{"room_type":"","occupancy_details":""}}],
                                        "location_details": {{ "street": null, "city": null, "country": null }},
                                        "cost": {{ "amount": 0, "currency": "" }},
                                        "checkin_date": "","checkin_hour": "","checkout_date": "","checkout_hour": ""
                                        }},
            "eatery_details": {{ "establishment_name": "",
                                "reservation_date":"","reservation_hour":"",
                                "location_details": {{ "street": null, "city": null, "country": null }} }},
            "attraction_details": {{ "attraction_name": "",
                                    "attraction_type":"",
                                    "cost": {{ "amount": 0, "currency": "" }},
                                "reservation_date":"","reservation_hour":"",
                                "location_details": {{ "street": null, "city": null, "country": null }} }},
            "transportation_details": {{
                                "cost": {{ "amount": 0, "currency": "" }},
                                "segments": [
                                {{"from": {{ "name": "string", "code": "string|null", "address": {{ "street": "string", "city": "string", "country": "string" }} }},
                                "to": {{ "name": "string", "code": "string|null", "address": {{ "street": "string", "city": "string", "country": "string" }} }},
                                "carrier": "string",
                                "flight_number": "string|null",
                                "departure_time": "ISO8601",
                                "arrival_time": "ISO8601"
                                }}
                                ],
                                "baggage_allowance": {{ "cabin_bag": "", "checked_bag": "" }}
                            }},
            "additional_info": {{ "summary": "", "raw_notes": "" }}
            }}"""

    data = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"HTML: {html_text}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
    )

    with urllib.request.urlopen(req) as res:
        res_payload = json.loads(res.read().decode("utf-8"))
        return json.loads(res_payload['choices'][0]['message']['content'])


def get_webhook_token_for_email(email):
    """Look up a user's webhook token from Supabase by their email address."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
        return None
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/get_webhook_token_by_email"
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps({"p_email": email}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            result = json.loads(res.read().decode("utf-8"))
            return result if isinstance(result, str) else None
    except urllib.error.HTTPError as e:
        print(f"Supabase token lookup failed {e.code}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Supabase token lookup error: {e}")
        return None


def send_to_webhook(payload, url, token):
    webhook_url = f"{url}?token={token}" if token else url
    print(f"Webhook URL: {webhook_url}")
    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as res:
            print(f"Webhook response status: {res.getcode()}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"Webhook HTTP {e.code}: {body}")
    except Exception as e:
        print(f"Failed to send webhook: {e}")
