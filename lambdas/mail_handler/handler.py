"""triptomat-mail-handler Lambda handler.

Required env vars:
  MAIL_WEBHOOK_URL       — Supabase travel-webhook Edge Function URL (prod)
  SUPABASE_URL           — Supabase project URL (for user lookup)
  SUPABASE_SERVICE_KEY   — Supabase service-role key
  GOOGLE_API_KEY         — Google Gemini API key (for email analysis + reconciliation)

Optional env vars:
  STAGE_MAIL_WEBHOOK_URL — Webhook URL for stage environment
  MEDIA_BUCKET           — S3 bucket for attachments (default: triptomat-media)
  OTEL_ENABLED           — "true" to enable OpenTelemetry tracing/metrics

Environment detection:
  S3 key prefix "stage/" routes to STAGE_MAIL_WEBHOOK_URL.
  All other keys route to MAIL_WEBHOOK_URL (prod).
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
from core.supabase_client import get_user_id_from_token, check_ai_usage
from core.pipeline_events import report_event
from core.reconciliation import reconcile
from core.telemetry import (
    init_telemetry, get_tracer, get_meter,
    safe_span, record_counter, record_histogram, time_ms,
    flush_telemetry, record_span_error,
)

# ── Telemetry setup ─────────────────────────────────────────────────────────
init_telemetry("triptomat-mail-handler")
tracer = get_tracer(__name__)
meter = get_meter(__name__)

emails_counter = meter.create_counter(
    "triptomat.mail_handler.emails_processed",
    description="Total emails processed",
)
parse_duration_hist = meter.create_histogram(
    "triptomat.mail_handler.parse_duration_ms",
    description="Email parsing duration in milliseconds",
)
ai_analysis_duration_hist = meter.create_histogram(
    "triptomat.mail_handler.ai_analysis_duration_ms",
    description="Gemini analysis duration in milliseconds",
)

# ── AWS clients & config ────────────────────────────────────────────────────
s3_client = boto3.client('s3')

ALLOWED_TYPES, GEO_ONLY_TYPES = load_config()
WEBHOOK_URL = os.environ.get('MAIL_WEBHOOK_URL', '')
STAGE_WEBHOOK_URL = os.environ.get('STAGE_MAIL_WEBHOOK_URL', '')
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
GOOGLE_API_KEY = os.environ.get('GOOGLE_API_KEY', '')
MEDIA_BUCKET = os.environ.get('MEDIA_BUCKET', 'triptomat-media')


def _mask_email(email: str) -> str:
    """Mask email for safe inclusion in span attributes: 'a***@domain.com'."""
    try:
        local, domain = email.split("@", 1)
        return f"{local[0]}***@{domain}" if local else f"***@{domain}"
    except Exception:
        return "***"


def _detect_environment(s3_key: str) -> str:
    """Detect prod/stage environment from S3 key prefix."""
    if s3_key.startswith("stage/"):
        return "stage"
    return "prod"


def _extract_attachments(msg) -> list[dict]:
    """Extract file attachments from a MIME email message.

    Returns a list of dicts with filename, content_type, size, and data (bytes).
    Skips inline images and text parts.
    """
    attachments = []
    if not msg.is_multipart():
        return attachments

    for part in msg.walk():
        content_disposition = str(part.get("Content-Disposition", ""))
        content_type = part.get_content_type()

        # Skip text parts and parts without attachment disposition
        if content_type in ("text/html", "text/plain"):
            continue
        if "attachment" not in content_disposition and "inline" not in content_disposition:
            continue
        # For inline parts, only keep non-image files (skip inline logos etc.)
        if "inline" in content_disposition and content_type.startswith("image/"):
            continue

        payload = part.get_payload(decode=True)
        if not payload:
            continue

        filename = part.get_filename() or f"attachment_{len(attachments) + 1}"
        attachments.append({
            "filename": filename,
            "content_type": content_type,
            "size": len(payload),
            "data": payload,
        })

    return attachments


def _upload_attachments(
    attachments: list[dict],
    user_id: str | None,
    trip_id: str | None,
) -> list[dict]:
    """Upload attachments to S3 and return metadata with S3 URLs.

    Path: s3://triptomat-media/documents/{user_id}/{trip_id}/{filename}
    If no trip: s3://triptomat-media/documents/{user_id}/unassigned/{filename}
    If no user: skips upload.
    """
    if not user_id or not attachments:
        return []

    uploaded = []
    folder = trip_id if trip_id else "unassigned"

    for att in attachments:
        # Sanitize filename
        safe_name = re.sub(r'[^\w.\-]', '_', att["filename"])
        s3_key = f"documents/{user_id}/{folder}/{safe_name}"

        try:
            s3_client.put_object(
                Bucket=MEDIA_BUCKET,
                Key=s3_key,
                Body=att["data"],
                ContentType=att["content_type"],
            )
            uploaded.append({
                "filename": att["filename"],
                "content_type": att["content_type"],
                "size": att["size"],
                "s3_url": f"s3://{MEDIA_BUCKET}/{s3_key}",
                "s3_key": s3_key,
            })
            print(f"Uploaded attachment: {s3_key} ({att['size']} bytes)")
        except Exception as e:
            print(f"Failed to upload attachment {att['filename']}: {e}")

    return uploaded


def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'])
    env = _detect_environment(key)
    active_webhook_url = STAGE_WEBHOOK_URL if env == "stage" else WEBHOOK_URL

    try:
        with safe_span(tracer, "mail_handler.handle_email", {
            "mail.message_id": key[:100],
            "s3.bucket": bucket,
            "s3.key": key[:200],
            "env": env,
        }) as root_span:
            try:
                # ── Read raw email from S3 ──────────────────────────────────
                with safe_span(tracer, "mail_handler.s3_read", {
                    "s3.bucket": bucket,
                    "s3.key": key[:200],
                }) as s3_span:
                    response = s3_client.get_object(Bucket=bucket, Key=key)
                    raw_email = response['Body'].read().decode('utf-8')
                    size_bytes = len(raw_email.encode('utf-8'))
                    if s3_span:
                        try:
                            s3_span.set_attribute("s3.size_bytes", size_bytes)
                        except Exception:
                            pass

                # ── Parse email ─────────────────────────────────────────────
                with safe_span(tracer, "mail_handler.email_parse") as parse_span:
                    parse_start = time_ms()
                    msg = message_from_string(raw_email, policy=default)

                    html_content = ""
                    has_html = False
                    has_plain = False
                    if msg.is_multipart():
                        for part in msg.walk():
                            if part.get_content_type() == "text/html":
                                html_content = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8')
                                has_html = True
                                break
                    else:
                        html_content = msg.get_payload(decode=True).decode(msg.get_content_charset() or 'utf-8')
                        if msg.get_content_type() == "text/html":
                            has_html = True

                    plain_text = _get_plain_text(msg)
                    has_plain = bool(plain_text)
                    fwd_headers = _extract_forwarded_headers(plain_text)
                    _, user_email = parseaddr(msg['from'])

                    subject = msg.get('subject', '') or ''
                    parse_duration = time_ms() - parse_start
                    record_histogram(parse_duration_hist, parse_duration)

                    # Extract attachments
                    attachments = _extract_attachments(msg)
                    print(f"Extracted {len(attachments)} attachments from email")

                    if parse_span:
                        try:
                            parse_span.set_attribute("email.has_html", has_html)
                            parse_span.set_attribute("email.has_plain", has_plain)
                            parse_span.set_attribute("email.subject", subject[:80])
                            parse_span.set_attribute("email.attachment_count", len(attachments))
                        except Exception:
                            pass

                # ── User lookup ─────────────────────────────────────────────
                with safe_span(tracer, "mail_handler.user_lookup", {
                    "user.email_masked": _mask_email(user_email),
                }) as lookup_span:
                    token = get_webhook_token_for_email(user_email)
                    found = token is not None
                    if lookup_span:
                        try:
                            lookup_span.set_attribute("user.found", found)
                        except Exception:
                            pass

                if not token:
                    print(f"No webhook token found for {user_email} — skipping")
                    record_counter(emails_counter, attributes={"status": "skipped"})
                    return {'statusCode': 200, 'body': json.dumps('No user found, skipped')}

                # Daily AI usage check
                uid = get_user_id_from_token(token, SUPABASE_URL, SUPABASE_SERVICE_KEY) if SUPABASE_URL else None
                if uid:
                    usage = check_ai_usage(uid, "email_parsing", SUPABASE_URL, SUPABASE_SERVICE_KEY)
                    if not usage.get("allowed", True):
                        print(f"Daily email parsing limit reached for {_mask_email(user_email)} ({usage.get('used')}/{usage.get('limit')})")
                        record_counter(emails_counter, attributes={"status": "usage_limited"})
                        return {'statusCode': 200, 'body': json.dumps('Daily usage limit reached')}

                mail_job_id = str(uuid.uuid4())
                report_event(
                    mail_job_id, "mail_handler", "started",
                    source_url=f"s3://{bucket}/{key}", source_type="email",
                    title=subject[:120],
                )

                # ── AI analysis ─────────────────────────────────────────────
                clean_html = clean_html_for_ai(html_content)

                with safe_span(tracer, "mail_handler.gemini_analysis", {
                    "ai.model_name": "gemini-2.0-flash",
                }) as ai_span:
                    ai_start = time_ms()
                    travel_data = call_gemini(clean_html, ALLOWED_TYPES, GEO_ONLY_TYPES)
                    ai_duration = time_ms() - ai_start
                    record_histogram(ai_analysis_duration_hist, ai_duration)

                if travel_data:
                    # Build Gmail permalink from Message-ID header
                    message_id = msg.get('message-id', '')
                    if message_id:
                        # Strip angle brackets: "<abc@mail.com>" -> "abc@mail.com"
                        mid = message_id.strip().strip('<>')
                        email_permalink = f"https://mail.google.com/mail/u/0/#search/rfc822msgid%3A{urllib.parse.quote(mid, safe='')}"
                    else:
                        email_permalink = None

                    travel_data["source_email_info"] = {
                        "subject": fwd_headers.get("subject", msg['subject']),
                        "sender": fwd_headers.get("from", msg['from']),
                        "date_sent": fwd_headers.get("date", msg['date']),
                        "email_permalink": email_permalink,
                    }
                    travel_data["user_email"] = user_email

                    payload = travel_data
                    payload["input_type"] = "email"
                    payload["recommendation_id"] = str(uuid.uuid4())
                    payload["timestamp"] = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                    payload["source_url"] = f"s3://{bucket}/{key}"

                    # ── Reconciliation ──────────────────────────────────────
                    with safe_span(tracer, "mail_handler.reconciliation"):
                        payload = reconcile(
                            payload, token,
                            os.environ.get("GOOGLE_API_KEY", ""),
                        )

                    # ── Upload attachments ────────────────────────────────
                    print(f"Attachments to upload: {len(attachments)}, uid={uid}, _resolved_user_id={payload.get('_resolved_user_id')}, _resolved_trip_id={payload.get('_resolved_trip_id')}")
                    if attachments:
                        with safe_span(tracer, "mail_handler.upload_attachments") as att_span:
                            resolved_user_id = payload.pop("_resolved_user_id", None) or uid
                            resolved_trip_id = payload.pop("_resolved_trip_id", None)
                            uploaded = _upload_attachments(
                                attachments, resolved_user_id, resolved_trip_id,
                            )
                            if uploaded:
                                payload["attachments"] = uploaded
                            if att_span:
                                try:
                                    att_span.set_attribute("attachments.count", len(uploaded))
                                    att_span.set_attribute("attachments.trip_id", resolved_trip_id or "unassigned")
                                except Exception:
                                    pass
                    else:
                        # Clean up internal fields even if no attachments
                        payload.pop("_resolved_user_id", None)
                        payload.pop("_resolved_trip_id", None)

                    print(json.dumps(payload, indent=2, ensure_ascii=False))

                    # ── Webhook send ────────────────────────────────────────
                    if active_webhook_url:
                        with safe_span(tracer, "mail_handler.webhook_send") as wh_span:
                            try:
                                send_to_webhook(payload, active_webhook_url, token)
                                if wh_span:
                                    try:
                                        wh_span.set_attribute("webhook.status", "success")
                                        wh_span.set_attribute("webhook.env", env)
                                    except Exception:
                                        pass
                            except Exception as wh_exc:
                                if wh_span:
                                    try:
                                        wh_span.set_attribute("webhook.status", "failure")
                                    except Exception:
                                        pass
                                print(f"Webhook delivery failed: {wh_exc}")

                if travel_data:
                    report_event(mail_job_id, "mail_handler", "completed", metadata={
                        "category": travel_data.get("metadata", {}).get("category", ""),
                        "sub_category": travel_data.get("metadata", {}).get("sub_category", ""),
                        "action": travel_data.get("metadata", {}).get("action", ""),
                        "order_number": travel_data.get("metadata", {}).get("order_number", ""),
                        "subject": subject[:120],
                    })
                else:
                    report_event(mail_job_id, "mail_handler", "completed", metadata={"result": "no_travel_data"})

                record_counter(emails_counter, attributes={"status": "success"})
                return {'statusCode': 200, 'body': json.dumps('Processed and Sent')}

            except Exception as e:
                _err_job_id = mail_job_id if 'mail_job_id' in locals() else key[:36]
                report_event(_err_job_id, "mail_handler", "failed", metadata={"error": str(e)[:300]})
                print(f"Error: {str(e)}")
                record_counter(emails_counter, attributes={"status": "failure"})
                if root_span:
                    record_span_error(root_span, e)
                raise e
    finally:
        flush_telemetry()


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


def call_gemini(html_text, allowed_types, geo_types):
    today = datetime.date.today()

    prompt = f"""You are a data extraction agent. Analyze the email and return ONLY a valid JSON object.
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
            12. Free Cancellation Deadline (`free_cancellation_until`):
            - Applies to ALL categories: accommodation_details, attraction_details, eatery_details, and transportation_details.
            - If the email mentions a free-cancellation cutoff (e.g., "free cancellation until March 5", "cancel by 18:00 on Apr 2 for no charge", "cancel by..."), set `free_cancellation_until` to that datetime in ISO 8601 format (YYYY-MM-DDTHH:mm:ss).
            - If no time is mentioned, use T00:00:00.
            - If no free-cancellation deadline exists, set to null.
            12. The sites_hierarchy (Nested Structure):
            - Construct a nested geographical tree under the key "sites_hierarchy".
            - The first level must be the country or countries that in the mail.
            - Each node must be an object: {{"site": "Name", "site_type": "Type", "sub_sites": []}}.
            - Use "sub_sites" only if child locations exist.
            - site_type must be strictly from: {geo_types}.
            - The hierarchy MUST follow a COMPLETE logical geographic path. Always include intermediate levels even if not directly mentioned. For example: Japan -> Chubu Region (region) -> Nagano Prefecture (prefecture) -> Matsumoto (city), NOT Japan -> Matsumoto directly.
            - Common intermediate levels: regions/states/prefectures between country and city, districts/areas between city and neighborhood. Never skip a geographic level if one exists.
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
                                        "checkin_date": "","checkin_hour": "","checkout_date": "","checkout_hour": "",
                                        "free_cancellation_until": "ISO8601|null"
                                        }},
            "eatery_details": {{ "establishment_name": "",
                                "reservation_date":"","reservation_hour":"",
                                "location_details": {{ "street": null, "city": null, "country": null }},
                                "free_cancellation_until": "ISO8601|null"
                                }},
            "attraction_details": {{ "attraction_name": "",
                                    "attraction_type":"",
                                    "cost": {{ "amount": 0, "currency": "" }},
                                "reservation_date":"","reservation_hour":"",
                                "location_details": {{ "street": null, "city": null, "country": null }},
                                "free_cancellation_until": "ISO8601|null"
                                }},
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
                                "baggage_allowance": {{ "cabin_bag": "", "checked_bag": "" }},
                                "free_cancellation_until": "ISO8601|null"
                            }},
            "additional_info": {{ "summary": "", "raw_notes": "" }}
            }}

            HTML: {html_text}"""

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        "models/gemini-2.0-flash:generateContent"
        f"?key={GOOGLE_API_KEY}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0,
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        result = json.loads(res.read().decode("utf-8"))
        text = result["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)


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
