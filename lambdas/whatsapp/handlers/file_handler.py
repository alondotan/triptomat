"""Handle file uploads (images & documents) via WhatsApp.

Downloads media from WhatsApp, uploads to S3, and inserts metadata
into the Supabase `documents` table — same storage path convention
as the mail-handler and frontend document uploads.
"""

import json
import logging
import os
import re
import uuid

import boto3
import meta_api

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
MEDIA_BUCKET = os.environ.get("MEDIA_BUCKET", "triptomat-media")

s3 = boto3.client("s3")

# Mime-type → document category mapping
_CATEGORY_BY_MIME = {
    "application/pdf": "other",
    "image/jpeg": "other",
    "image/png": "other",
    "image/webp": "other",
}

# Max file size: 16 MB (WhatsApp limit for documents)
MAX_FILE_SIZE = 16 * 1024 * 1024


def handle_file(wa_user: dict, message: dict, phone: str) -> None:
    """Process an image or document message from WhatsApp.

    1. Download media from WhatsApp
    2. Upload to S3
    3. Insert into Supabase documents table
    4. Confirm to user
    """
    user_id = wa_user.get("user_id")
    trip_id = wa_user.get("active_trip_id")
    message_id = message.get("id", "")

    if not user_id:
        meta_api.send_text(phone, "Something went wrong — your account isn't linked properly.")
        return

    if not trip_id:
        meta_api.send_text(
            phone,
            "Please select a trip first with /trip before uploading files.",
        )
        return

    msg_type = message.get("type", "")
    media_info = message.get(msg_type, {})
    media_id = media_info.get("id")

    if not media_id:
        meta_api.send_text(phone, "Could not read the file. Please try again.")
        return

    # Extract metadata
    mime_type = media_info.get("mime_type", "application/octet-stream")
    caption = media_info.get("caption", "")

    if msg_type == "document":
        original_filename = media_info.get("filename", "document")
    else:
        # Images don't have a filename — generate one
        ext = _ext_from_mime(mime_type)
        original_filename = f"whatsapp-image.{ext}"

    # React with hourglass while processing
    try:
        meta_api.send_reaction(phone, message_id, "\u23f3")
    except Exception:
        pass

    # Step 1: Download from WhatsApp
    try:
        file_data = meta_api.download_media(media_id)
    except Exception as e:
        logger.error("Failed to download media %s: %s", media_id, e)
        meta_api.send_text(phone, "Failed to download the file from WhatsApp. Please try again.")
        return

    file_size = len(file_data)
    if file_size > MAX_FILE_SIZE:
        meta_api.send_text(phone, "File is too large (max 16 MB). Please send a smaller file.")
        return

    # Step 2: Upload to S3
    safe_name = re.sub(r"[^\w.\-]", "_", original_filename)
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    s3_key = f"documents/{user_id}/{trip_id}/{unique_name}"

    try:
        s3.put_object(
            Bucket=MEDIA_BUCKET,
            Key=s3_key,
            Body=file_data,
            ContentType=mime_type,
        )
        logger.info("Uploaded %s to s3://%s/%s (%d bytes)", original_filename, MEDIA_BUCKET, s3_key, file_size)
    except Exception as e:
        logger.error("Failed to upload to S3: %s", e)
        meta_api.send_text(phone, "Failed to save the file. Please try again.")
        return

    # Step 3: Insert into Supabase documents table
    doc_name = caption if caption else original_filename
    category = _guess_category(original_filename, caption)

    try:
        _insert_document(
            user_id=user_id,
            trip_id=trip_id,
            name=doc_name,
            file_name=original_filename,
            file_size=file_size,
            mime_type=mime_type,
            storage_path=s3_key,
            category=category,
            notes=f"Uploaded via WhatsApp",
        )
    except Exception as e:
        logger.error("Failed to insert document record: %s", e)
        # File is in S3 but no DB record — still inform user
        meta_api.send_text(
            phone,
            f"File *{original_filename}* was saved but there was a problem recording it. "
            "It should appear in your documents shortly.",
        )
        return

    # Step 4: Confirm
    try:
        meta_api.send_reaction(phone, message_id, "\u2705")
    except Exception:
        pass

    meta_api.send_text(
        phone,
        f"File saved: *{doc_name}*\n"
        f"Category: {category}\n"
        f"Size: {_human_size(file_size)}",
    )


def _insert_document(
    user_id: str,
    trip_id: str,
    name: str,
    file_name: str,
    file_size: int,
    mime_type: str,
    storage_path: str,
    category: str,
    notes: str,
) -> None:
    """Insert a document record into Supabase via REST API."""
    import urllib.request

    url = f"{SUPABASE_URL}/rest/v1/documents"
    data = json.dumps({
        "user_id": user_id,
        "trip_id": trip_id,
        "name": name,
        "file_name": file_name,
        "file_size": file_size,
        "mime_type": mime_type,
        "storage_path": storage_path,
        "category": category,
        "notes": notes,
    }).encode()

    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    urllib.request.urlopen(req, timeout=10)


def _ext_from_mime(mime_type: str) -> str:
    """Get a file extension from a MIME type."""
    mapping = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "application/pdf": "pdf",
        "video/mp4": "mp4",
    }
    return mapping.get(mime_type, "bin")


def _guess_category(filename: str, caption: str) -> str:
    """Guess a document category from filename and caption."""
    text = f"{filename} {caption}".lower()

    patterns = {
        "passport": r"passport|דרכון",
        "visa": r"visa|ויזה",
        "insurance": r"insurance|ביטוח",
        "id": r"\bid\b|תעודת\s*זהות",
        "flight": r"flight|boarding|טיסה|כרטיס",
        "hotel": r"hotel|booking|reservation|מלון|הזמנ",
        "car_rental": r"car.?rental|rent.?a.?car|השכרת\s*רכב",
        "activity": r"ticket|activity|tour|כרטיס|פעילות",
    }

    for category, pattern in patterns.items():
        if re.search(pattern, text):
            return category

    return "other"


def _human_size(size: int) -> str:
    """Format bytes as human-readable size."""
    for unit in ("B", "KB", "MB"):
        if size < 1024:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"
