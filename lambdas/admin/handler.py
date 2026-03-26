"""triptomat-admin Lambda handler.

Admin API for managing the Triptomat pipeline. Provides endpoints for viewing
statistics, managing S3 objects, DynamoDB cache entries, users, and CloudWatch
metrics.

Required env vars:
  ADMIN_API_TOKEN       -- Bearer token for authenticating admin requests
  SUPABASE_URL          -- Supabase project URL (e.g. https://xxx.supabase.co)
  SUPABASE_SERVICE_KEY  -- Supabase service-role key (full access)

Optional env vars:
  DYNAMODB_TABLE        -- DynamoDB cache table name (default: triptomat-cache)
  S3_BUCKET_MEDIA       -- S3 media bucket name (default: triptomat-media)
  S3_BUCKET_EMAILS      -- S3 raw emails bucket name (default: triptomat-raw-emails)
  DOWNLOAD_QUEUE_URL    -- SQS download queue URL
  ANALYSIS_QUEUE_URL    -- SQS analysis queue URL
  ALLOWED_ORIGINS       -- Comma-separated CORS origins (default: Supabase + localhost)
"""

import hmac
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
from botocore.exceptions import ClientError
from supabase import create_client

from core.http_utils import resolve_cors_origin, api_response
from core.url_helpers import is_video_url

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
ADMIN_API_TOKEN = os.environ.get("ADMIN_API_TOKEN", "")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

DYNAMODB_TABLE = os.environ.get("DYNAMODB_TABLE", "triptomat-cache")
S3_BUCKET_MEDIA = os.environ.get("S3_BUCKET_MEDIA", "triptomat-media")
S3_BUCKET_EMAILS = os.environ.get("S3_BUCKET_EMAILS", "triptomat-raw-emails")
DOWNLOAD_QUEUE_URL = os.environ.get("DOWNLOAD_QUEUE_URL", "")
ANALYSIS_QUEUE_URL = os.environ.get("ANALYSIS_QUEUE_URL", "")

_DEFAULT_ORIGINS = (
    "https://aqpzhflzsqkjceeeufyf.supabase.co,"
    "https://triptomat.com,"
    "https://www.triptomat.com,"
    "http://localhost:5173,"
    "http://localhost:8080"
)
ALLOWED_ORIGINS: set[str] = {
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
}

ALLOWED_BUCKETS: set[str] = {S3_BUCKET_MEDIA, S3_BUCKET_EMAILS}
MAX_BODY_SIZE = 1_000_000  # 1 MB — matches the gateway limit

LAMBDA_FUNCTIONS = [
    "triptomat-gateway",
    "triptomat-downloader",
    "triptomat-worker",
    "triptomat-mail-handler",
]

SQS_QUEUE_URLS: list[str] = [
    q for q in [DOWNLOAD_QUEUE_URL, ANALYSIS_QUEUE_URL] if q
]

# Derive DLQ URLs by appending '-dlq' to the queue name portion of the URL.
# e.g. https://sqs.../123/triptomat-download-queue -> .../triptomat-download-queue-dlq
def _derive_dlq_url(queue_url: str) -> str:
    """Append '-dlq' to the queue name in an SQS URL."""
    return queue_url + "-dlq" if queue_url else ""

DOWNLOAD_DLQ_URL = _derive_dlq_url(DOWNLOAD_QUEUE_URL)
ANALYSIS_DLQ_URL = _derive_dlq_url(ANALYSIS_QUEUE_URL)

DLQ_MAP: dict[str, dict[str, str]] = {
    "download": {"dlq_url": DOWNLOAD_DLQ_URL, "main_url": DOWNLOAD_QUEUE_URL},
    "analysis": {"dlq_url": ANALYSIS_DLQ_URL, "main_url": ANALYSIS_QUEUE_URL},
}

# ---------------------------------------------------------------------------
# AWS / Supabase clients (created at module level for Lambda reuse)
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")
sqs_client = boto3.client("sqs")
cloudwatch = boto3.client("cloudwatch")

table = dynamodb.Table(DYNAMODB_TABLE)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_KEY else None

# Set per-invocation; used by _response.
_cors_origin: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _response(status_code: int, body: dict) -> dict:
    """Build an API Gateway proxy response with CORS headers."""
    return api_response(
        status_code, body,
        cors_origin=_cors_origin,
        allowed_methods="GET,POST,DELETE,OPTIONS",
    )


def _authenticate(event: dict) -> bool:
    """Validate the Bearer token from the Authorization header."""
    if not ADMIN_API_TOKEN:
        logger.warning("ADMIN_API_TOKEN is not set -- rejecting all requests")
        return False
    headers = event.get("headers") or {}
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    return hmac.compare_digest(auth, f"Bearer {ADMIN_API_TOKEN}")


def _get_query_param(event: dict, name: str, default: str | None = None) -> str | None:
    """Safely extract a query-string parameter."""
    params = event.get("queryStringParameters") or {}
    return params.get(name, default)


def _parse_int_param(event: dict, name: str, default: int) -> tuple[int, dict | None]:
    """Parse an integer query parameter. Returns (value, None) on success or (0, error_response) on failure."""
    raw = _get_query_param(event, name, str(default)) or str(default)
    try:
        return int(raw), None
    except ValueError:
        return 0, _response(400, {"error": f"Invalid '{name}' parameter — must be an integer"})


def _check_body_size(event: dict) -> dict | None:
    """Return an error response if the request body exceeds MAX_BODY_SIZE, else None."""
    body_str = event.get("body") or ""
    if len(body_str) > MAX_BODY_SIZE:
        return _response(413, {"error": f"Request body too large (max {MAX_BODY_SIZE} bytes)"})
    return None


def _parse_json_body(event: dict) -> dict:
    """Parse the JSON body of the request, returning an empty dict on failure."""
    body_str = event.get("body") or ""
    if not body_str:
        return {}
    return json.loads(body_str)


def _validate_bucket(bucket: str) -> str | None:
    """Return an error message if the bucket is not in the allow-list, else None."""
    if bucket not in ALLOWED_BUCKETS:
        return f"Bucket '{bucket}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_BUCKETS))}"
    return None


# ---------------------------------------------------------------------------
# Route table
# ---------------------------------------------------------------------------
def _extract_method_path(event: dict) -> tuple[str, str]:
    """Extract HTTP method and path, supporting both API Gateway v1 and v2 formats."""
    http_ctx = event.get("requestContext", {}).get("http", {})
    method = (http_ctx.get("method") or event.get("httpMethod") or "").upper()
    path = event.get("rawPath") or event.get("path") or ""
    return method, path


def _route(event: dict) -> dict:
    """Dispatch the request to the appropriate handler based on method + path."""
    method, path = _extract_method_path(event)

    routes: dict[tuple[str, str], Any] = {
        ("GET", "/admin/stats"): _handle_stats,
        ("GET", "/admin/s3/objects"): _handle_s3_list,
        ("DELETE", "/admin/s3/objects"): _handle_s3_delete,
        ("GET", "/admin/cache"): _handle_cache_list,
        ("DELETE", "/admin/cache"): _handle_cache_delete,
        ("POST", "/admin/cache/reprocess"): _handle_cache_reprocess,
        ("GET", "/admin/users"): _handle_users_list,
        ("PATCH", "/admin/users/tier"): _handle_users_update_tier,
        ("DELETE", "/admin/users"): _handle_users_delete,
        ("GET", "/admin/cloudwatch/metrics"): _handle_cloudwatch_metrics,
        ("GET", "/admin/dlq"): _handle_dlq_list,
        ("POST", "/admin/dlq/redrive"): _handle_dlq_redrive,
        ("DELETE", "/admin/dlq"): _handle_dlq_delete,
        ("GET", "/admin/emails"): _handle_emails_list,
        ("GET", "/admin/emails/stats"): _handle_emails_stats,
        ("GET", "/admin/costs"): _handle_costs,
        ("GET", "/admin/funnel"): _handle_funnel,
    }

    handler = routes.get((method, path))
    if handler is not None:
        return handler(event)

    # Dynamic path: GET /admin/emails/{email_id}/raw
    if method == "GET" and path.startswith("/admin/emails/") and path.endswith("/raw"):
        return _handle_email_raw(event, path)

    return _response(404, {"error": f"Not found: {method} {path}"})


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------
def lambda_handler(event: dict, context: Any) -> dict:
    """API Gateway entry point for the admin API."""
    global _cors_origin
    _cors_origin = resolve_cors_origin(event, ALLOWED_ORIGINS)

    method, path = _extract_method_path(event)
    logger.info("Admin request: %s %s", method, path)

    # CORS preflight
    if method == "OPTIONS":
        return _response(200, {})

    # Auth check
    if not _authenticate(event):
        return _response(401, {"error": "Unauthorized -- invalid or missing Bearer token"})

    try:
        return _route(event)
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON in request body"})
    except Exception as exc:
        logger.error("Unhandled error: %s", str(exc), exc_info=True)
        return _response(500, {"error": "Internal server error"})


# ===========================================================================
# Endpoint handlers
# ===========================================================================

# ---- GET /admin/stats -----------------------------------------------------
def _handle_stats(event: dict) -> dict:
    """Return overview statistics from DynamoDB, S3, and Supabase."""
    logger.info("Fetching admin stats")
    stats: dict[str, Any] = {}

    # -- DynamoDB stats --
    try:
        dynamo_stats = _get_dynamo_stats()
        stats["dynamodb"] = dynamo_stats
    except Exception as exc:
        logger.error("Failed to get DynamoDB stats: %s", exc)
        stats["dynamodb"] = {"error": str(exc)}

    # -- S3 stats --
    try:
        stats["s3"] = {}
        for bucket in ALLOWED_BUCKETS:
            stats["s3"][bucket] = _get_s3_stats(bucket)
    except Exception as exc:
        logger.error("Failed to get S3 stats: %s", exc)
        stats["s3"] = {"error": str(exc)}

    # -- Supabase stats --
    try:
        stats["supabase"] = _get_supabase_stats()
    except Exception as exc:
        logger.error("Failed to get Supabase stats: %s", exc)
        stats["supabase"] = {"error": str(exc)}

    return _response(200, stats)


def _get_dynamo_stats() -> dict:
    """Scan the DynamoDB cache table and collect counts."""
    # TODO: Add source_type tracking to worker cache writes
    total = 0
    by_status: dict[str, int] = {}

    scan_kwargs: dict[str, Any] = {
        "ProjectionExpression": "#s",
        "ExpressionAttributeNames": {"#s": "status"},
    }
    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            total += 1
            status = item.get("status", "unknown")
            by_status[status] = by_status.get(status, 0) + 1

        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

    return {
        "total_items": total,
        "by_status": by_status,
    }


def _get_s3_stats(bucket: str) -> dict:
    """Count objects and total size in an S3 bucket."""
    total_objects = 0
    total_size = 0
    continuation_token = None

    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "MaxKeys": 1000}
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token

        resp = s3_client.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []):
            total_objects += 1
            total_size += obj.get("Size", 0)

        if not resp.get("IsTruncated"):
            break
        continuation_token = resp.get("NextContinuationToken")

    return {
        "total_objects": total_objects,
        "total_size_bytes": total_size,
    }


def _get_supabase_stats() -> dict:
    """Query Supabase for user, trip, and POI counts."""
    if not supabase:
        return {"error": "Supabase not configured"}

    # Count users via Supabase admin API
    try:
        users_resp = supabase.auth.admin.list_users()
        users_count = len(users_resp) if users_resp else 0
    except Exception:
        users_count = 0

    # Count trips
    trips_resp = supabase.table("trips").select("id", count="exact").execute()
    trips_count = trips_resp.count if trips_resp.count is not None else 0

    # Count POIs
    pois_resp = supabase.table("points_of_interest").select("id", count="exact").execute()
    pois_count = pois_resp.count if pois_resp.count is not None else 0

    return {
        "users": users_count,
        "trips": trips_count,
        "pois": pois_count,
    }


# ---- GET /admin/s3/objects ------------------------------------------------
def _handle_s3_list(event: dict) -> dict:
    """List S3 objects in a given bucket/prefix with optional pagination."""
    bucket = _get_query_param(event, "bucket", "")
    if not bucket:
        return _response(400, {"error": "Missing required query param: bucket"})

    err = _validate_bucket(bucket)
    if err:
        return _response(400, {"error": err})

    prefix = _get_query_param(event, "prefix", "")
    limit, err = _parse_int_param(event, "limit", 100)
    if err:
        return err
    continuation_token = _get_query_param(event, "continuation_token")

    logger.info("Listing S3 objects: bucket=%s prefix=%s limit=%d", bucket, prefix, limit)

    kwargs: dict[str, Any] = {
        "Bucket": bucket,
        "MaxKeys": min(limit, 1000),
    }
    if prefix:
        kwargs["Prefix"] = prefix
    if continuation_token:
        kwargs["ContinuationToken"] = continuation_token

    resp = s3_client.list_objects_v2(**kwargs)

    objects = []
    for obj in resp.get("Contents", []):
        objects.append({
            "key": obj["Key"],
            "size": obj["Size"],
            "last_modified": obj["LastModified"].isoformat(),
            "etag": obj.get("ETag", ""),
        })

    result: dict[str, Any] = {
        "bucket": bucket,
        "prefix": prefix or "",
        "objects": objects,
        "count": len(objects),
        "is_truncated": resp.get("IsTruncated", False),
    }
    if resp.get("NextContinuationToken"):
        result["next_continuation_token"] = resp["NextContinuationToken"]

    return _response(200, result)


# ---- DELETE /admin/s3/objects ---------------------------------------------
def _handle_s3_delete(event: dict) -> dict:
    """Delete one or more S3 objects."""
    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)
    bucket = body.get("bucket", "")
    keys = body.get("keys", [])

    if not bucket:
        return _response(400, {"error": "Missing 'bucket' in request body"})
    if not keys or not isinstance(keys, list):
        return _response(400, {"error": "Missing or invalid 'keys' in request body (must be a non-empty list)"})

    err = _validate_bucket(bucket)
    if err:
        return _response(400, {"error": err})

    logger.info("Deleting %d S3 objects from %s", len(keys), bucket)

    # S3 delete_objects supports up to 1000 keys per call
    delete_objects = [{"Key": k} for k in keys[:1000]]
    resp = s3_client.delete_objects(
        Bucket=bucket,
        Delete={"Objects": delete_objects, "Quiet": True},
    )

    errors = resp.get("Errors", [])
    deleted_count = len(delete_objects) - len(errors)

    result: dict[str, Any] = {"deleted": deleted_count}
    if errors:
        result["errors"] = [
            {"key": e["Key"], "message": e.get("Message", "")}
            for e in errors
        ]

    return _response(200, result)


# ---- GET /admin/cache -----------------------------------------------------
def _handle_cache_list(event: dict) -> dict:
    """Scan DynamoDB cache items, optionally filtered by status."""
    status_filter = _get_query_param(event, "status")
    limit, err = _parse_int_param(event, "limit", 50)
    if err:
        return err
    last_key_raw = _get_query_param(event, "last_key")

    logger.info("Listing cache items: status=%s limit=%d", status_filter, limit)

    scan_kwargs: dict[str, Any] = {"Limit": min(limit, 100)}

    if status_filter:
        scan_kwargs["FilterExpression"] = "#s = :status"
        scan_kwargs["ExpressionAttributeNames"] = {"#s": "status"}
        scan_kwargs["ExpressionAttributeValues"] = {":status": status_filter}

    if last_key_raw:
        scan_kwargs["ExclusiveStartKey"] = {"url": last_key_raw}

    resp = table.scan(**scan_kwargs)

    items = []
    for item in resp.get("Items", []):
        items.append({
            "url": item.get("url"),
            "job_id": item.get("job_id"),
            "status": item.get("status"),
            "created_at": item.get("created_at"),
            "source_metadata": item.get("source_metadata"),
            "error": item.get("error"),
        })

    result: dict[str, Any] = {
        "items": items,
        "count": len(items),
    }
    if "LastEvaluatedKey" in resp:
        result["last_key"] = resp["LastEvaluatedKey"].get("url")

    return _response(200, result)


# ---- DELETE /admin/cache --------------------------------------------------
def _handle_cache_delete(event: dict) -> dict:
    """Delete one or more DynamoDB cache items by URL (primary key)."""
    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)
    urls = body.get("urls", [])

    if not urls or not isinstance(urls, list):
        return _response(400, {"error": "Missing or invalid 'urls' in request body (must be a non-empty list)"})

    logger.info("Deleting %d cache items", len(urls))

    deleted = 0
    errors = []
    for url in urls:
        try:
            table.delete_item(Key={"url": url})
            deleted += 1
        except ClientError as exc:
            logger.error("Failed to delete cache item %s: %s", url, exc)
            errors.append({"url": url, "message": str(exc)})

    result: dict[str, Any] = {"deleted": deleted}
    if errors:
        result["errors"] = errors

    return _response(200, result)


# ---- POST /admin/cache/reprocess -----------------------------------------
def _handle_cache_reprocess(event: dict) -> dict:
    """Resubmit a URL for processing and overwrite the cache entry with 'processing' status."""
    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)
    url = body.get("url", "")

    if not url:
        return _response(400, {"error": "Missing 'url' in request body"})

    if not DOWNLOAD_QUEUE_URL and not ANALYSIS_QUEUE_URL:
        return _response(500, {"error": "SQS queue URLs are not configured"})

    logger.info("Reprocessing URL: %s", url)

    # Determine which queue to use based on URL type
    if is_video_url(url):
        queue_url = DOWNLOAD_QUEUE_URL
        queue_name = "download"
        message = {
            "job_id": _generate_job_id(),
            "url": url,
            "overwrite": True,
            "webhook_token": "",
        }
    else:
        queue_url = ANALYSIS_QUEUE_URL
        queue_name = "analysis"
        message = {
            "job_id": _generate_job_id(),
            "url": url,
            "source_type": "web",
            "source_metadata": {"title": "", "image": ""},
            "text": "",
            "webhook_token": "",
        }

    if not queue_url:
        return _response(500, {"error": f"Queue URL for '{queue_name}' is not configured"})

    sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message),
    )

    # Mark as processing in DynamoDB
    table.put_item(Item={
        "url": url,
        "job_id": message["job_id"],
        "status": "processing",
    })

    return _response(202, {
        "reprocessing": True,
        "queue": queue_name,
        "job_id": message["job_id"],
    })


def _generate_job_id() -> str:
    """Generate a UUID-based job ID."""
    import uuid
    return str(uuid.uuid4())


# ---- GET /admin/users -----------------------------------------------------
def _handle_users_list(event: dict) -> dict:
    """List users from Supabase with trip and POI counts."""
    if not supabase:
        return _response(500, {"error": "Supabase is not configured"})

    limit, err = _parse_int_param(event, "limit", 50)
    if err:
        return err
    offset, err = _parse_int_param(event, "offset", 0)
    if err:
        return err
    search = _get_query_param(event, "search", "")

    logger.info("Listing users: limit=%d offset=%d search=%s", limit, offset, search)

    # List users via Supabase admin API (auth.users)
    try:
        all_users = supabase.auth.admin.list_users()
    except Exception as exc:
        logger.error("Failed to list users: %s", str(exc))
        return _response(500, {"error": "Failed to fetch users"})

    # Filter by search if provided
    if search:
        search_lower = search.lower()
        all_users = [u for u in all_users if u.email and search_lower in u.email.lower()]

    # Sort by created_at descending
    all_users.sort(key=lambda u: u.created_at or "", reverse=True)

    # Apply pagination
    paginated = all_users[offset:offset + limit]

    # Enrich with trip and POI counts for each user
    users = []
    for user in paginated:
        user_id = user.id

        # Count trips for this user
        trips_resp = supabase.table("trips").select(
            "id", count="exact"
        ).eq("user_id", user_id).execute()
        trips_count = trips_resp.count if trips_resp.count is not None else 0

        # Count POIs for this user (via trip_id)
        trip_ids_resp = supabase.table("trips").select("id").eq("user_id", user_id).execute()
        trip_ids = [t["id"] for t in (trip_ids_resp.data or [])]
        pois_count = 0
        if trip_ids:
            pois_resp = supabase.table("points_of_interest").select(
                "id", count="exact"
            ).in_("trip_id", trip_ids).execute()
            pois_count = pois_resp.count if pois_resp.count is not None else 0

        # Get user tier from profiles
        tier_resp = supabase.table("profiles").select("user_tier").eq("id", user_id).maybe_single().execute()
        user_tier = (tier_resp.data or {}).get("user_tier", "free") if tier_resp.data else "free"

        # Get today's AI usage
        import datetime
        today = datetime.date.today().isoformat()
        usage_resp = supabase.table("ai_usage").select("feature,count").eq("user_id", user_id).eq("usage_date", today).execute()
        ai_usage = {row["feature"]: row["count"] for row in (usage_resp.data or [])}

        users.append({
            "id": user_id,
            "email": user.email,
            "created_at": str(user.created_at) if user.created_at else None,
            "last_sign_in_at": str(user.last_sign_in_at) if user.last_sign_in_at else None,
            "trips_count": trips_count,
            "pois_count": pois_count,
            "user_tier": user_tier,
            "ai_usage_today": ai_usage,
        })

    return _response(200, {
        "users": users,
        "count": len(users),
        "total": len(all_users),
        "limit": limit,
        "offset": offset,
    })


# ---- PATCH /admin/users/tier ----------------------------------------------
def _handle_users_update_tier(event: dict) -> dict:
    """Update a user's AI usage tier."""
    if not supabase:
        return _response(500, {"error": "Supabase is not configured"})

    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)
    user_id = body.get("user_id", "")
    tier = body.get("tier", "")

    if not user_id:
        return _response(400, {"error": "Missing 'user_id'"})
    if tier not in ("free", "pro", "super"):
        return _response(400, {"error": "Invalid tier. Must be 'free', 'pro', or 'super'"})

    logger.info("Updating user %s tier to %s", user_id, tier)

    try:
        resp = supabase.table("profiles").update({"user_tier": tier}).eq("id", user_id).execute()
        if not resp.data:
            return _response(404, {"error": "User profile not found"})
        return _response(200, {"message": f"Tier updated to {tier}", "tier": tier})
    except Exception as exc:
        logger.error("Failed to update tier: %s", str(exc))
        return _response(500, {"error": f"Failed to update tier: {str(exc)}"})


# ---- DELETE /admin/users --------------------------------------------------
def _handle_users_delete(event: dict) -> dict:
    """Delete a user and all their data (trips, POIs, etc.) from Supabase."""
    if not supabase:
        return _response(500, {"error": "Supabase is not configured"})

    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)
    user_id = body.get("user_id", "")

    if not user_id:
        return _response(400, {"error": "Missing 'user_id' in request body"})

    logger.info("Deleting user: %s", user_id)

    errors = []

    # 1. Find all trips for this user
    try:
        trips_resp = supabase.table("trips").select("id").eq("user_id", user_id).execute()
        trip_ids = [t["id"] for t in (trips_resp.data or [])]
    except Exception as exc:
        logger.error("Failed to fetch trips for user %s: %s", user_id, str(exc))
        trip_ids = []
        errors.append(f"Failed to fetch trips: {exc}")

    # 2. Delete related data for each trip
    if trip_ids:
        for table in ["points_of_interest", "transportation", "itinerary_days", "missions", "collections", "source_emails", "source_recommendations"]:
            try:
                supabase.table(table).delete().in_("trip_id", trip_ids).execute()
            except Exception as exc:
                logger.error("Failed to delete %s for user %s: %s", table, user_id, str(exc))
                errors.append(f"Failed to delete {table}: {exc}")

    # 3. Delete trips
    try:
        supabase.table("trips").delete().eq("user_id", user_id).execute()
    except Exception as exc:
        logger.error("Failed to delete trips for user %s: %s", user_id, str(exc))
        errors.append(f"Failed to delete trips: {exc}")

    # 4. Delete webhook tokens
    try:
        supabase.table("webhook_tokens").delete().eq("user_id", user_id).execute()
    except Exception as exc:
        logger.error("Failed to delete webhook_tokens for user %s: %s", user_id, str(exc))
        errors.append(f"Failed to delete webhook_tokens: {exc}")

    # 5. Delete the auth user
    try:
        supabase.auth.admin.delete_user(user_id)
    except Exception as exc:
        logger.error("Failed to delete auth user %s: %s", user_id, str(exc))
        errors.append(f"Failed to delete auth user: {exc}")

    if errors:
        return _response(207, {"message": "User partially deleted", "errors": errors})

    return _response(200, {"message": f"User {user_id} deleted successfully"})


# ---- GET /admin/cloudwatch/metrics ---------------------------------------
def _handle_cloudwatch_metrics(event: dict) -> dict:
    """Fetch CloudWatch metrics for Lambda functions and SQS queues."""
    period_str = _get_query_param(event, "period", "24h") or "24h"
    period_map = {
        "1h": (3600, 60),        # 1 hour, 1-minute granularity
        "24h": (86400, 300),     # 24 hours, 5-minute granularity
        "7d": (604800, 3600),    # 7 days, 1-hour granularity
    }

    if period_str not in period_map:
        return _response(400, {
            "error": f"Invalid period '{period_str}'. Allowed: {', '.join(period_map.keys())}"
        })

    total_seconds, granularity = period_map[period_str]
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(seconds=total_seconds)

    logger.info("Fetching CloudWatch metrics: period=%s", period_str)

    # Build metric queries
    metric_queries = []
    query_id_index = 0

    # Lambda metrics (invocations + errors for each function)
    for func_name in LAMBDA_FUNCTIONS:
        safe_name = re.sub(r"[^a-z0-9]", "_", func_name.lower())

        metric_queries.append({
            "Id": f"inv_{safe_name}_{query_id_index}",
            "MetricStat": {
                "Metric": {
                    "Namespace": "AWS/Lambda",
                    "MetricName": "Invocations",
                    "Dimensions": [{"Name": "FunctionName", "Value": func_name}],
                },
                "Period": granularity,
                "Stat": "Sum",
            },
        })
        query_id_index += 1

        metric_queries.append({
            "Id": f"err_{safe_name}_{query_id_index}",
            "MetricStat": {
                "Metric": {
                    "Namespace": "AWS/Lambda",
                    "MetricName": "Errors",
                    "Dimensions": [{"Name": "FunctionName", "Value": func_name}],
                },
                "Period": granularity,
                "Stat": "Sum",
            },
        })
        query_id_index += 1

    # SQS metrics for each queue
    for queue_url in SQS_QUEUE_URLS:
        queue_name = queue_url.rstrip("/").split("/")[-1] if queue_url else ""
        if not queue_name:
            continue
        safe_name = re.sub(r"[^a-z0-9]", "_", queue_name.lower())

        for metric_name, label_prefix in [
            ("NumberOfMessagesSent", "sent"),
            ("NumberOfMessagesReceived", "recv"),
            ("ApproximateNumberOfMessagesVisible", "depth"),
        ]:
            metric_queries.append({
                "Id": f"{label_prefix}_{safe_name}_{query_id_index}",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/SQS",
                        "MetricName": metric_name,
                        "Dimensions": [{"Name": "QueueName", "Value": queue_name}],
                    },
                    "Period": granularity,
                    "Stat": "Sum",
                },
            })
            query_id_index += 1

    if not metric_queries:
        return _response(200, {"period": period_str, "lambda": {}, "sqs": {}})

    # CloudWatch GetMetricData supports up to 500 queries per call
    try:
        cw_resp = cloudwatch.get_metric_data(
            MetricDataQueries=metric_queries,
            StartTime=start_time,
            EndTime=end_time,
        )
    except ClientError as exc:
        logger.error("CloudWatch query failed: %s", exc)
        return _response(500, {"error": "CloudWatch query failed"})

    # Organise results
    lambda_metrics: dict[str, dict] = {fn: {} for fn in LAMBDA_FUNCTIONS}
    sqs_metrics: dict[str, dict] = {}

    for result in cw_resp.get("MetricDataResults", []):
        query_id = result["Id"]
        values = result.get("Values", [])
        timestamps = [ts.isoformat() for ts in result.get("Timestamps", [])]
        total = sum(values)

        # Parse the query ID to figure out what it belongs to
        # Lambda invocations: inv_<safe_name>_<idx>
        # Lambda errors: err_<safe_name>_<idx>
        # SQS: sent_/recv_/depth_<safe_name>_<idx>
        for func_name in LAMBDA_FUNCTIONS:
            safe_fn = re.sub(r"[^a-z0-9]", "_", func_name.lower())
            if f"inv_{safe_fn}_" in query_id:
                lambda_metrics[func_name]["invocations"] = {
                    "total": total,
                    "datapoints": len(values),
                }
                break
            if f"err_{safe_fn}_" in query_id:
                lambda_metrics[func_name]["errors"] = {
                    "total": total,
                    "datapoints": len(values),
                }
                break
        else:
            # SQS metrics
            for queue_url in SQS_QUEUE_URLS:
                queue_name = queue_url.rstrip("/").split("/")[-1] if queue_url else ""
                if not queue_name:
                    continue
                safe_qn = re.sub(r"[^a-z0-9]", "_", queue_name.lower())
                if safe_qn in query_id:
                    if queue_name not in sqs_metrics:
                        sqs_metrics[queue_name] = {}
                    if query_id.startswith("sent_"):
                        sqs_metrics[queue_name]["messages_sent"] = total
                    elif query_id.startswith("recv_"):
                        sqs_metrics[queue_name]["messages_received"] = total
                    elif query_id.startswith("depth_"):
                        sqs_metrics[queue_name]["approximate_queue_depth"] = total
                    break

    return _response(200, {
        "period": period_str,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "granularity_seconds": granularity,
        "lambda": lambda_metrics,
        "sqs": sqs_metrics,
    })


# ---- GET /admin/dlq -------------------------------------------------------
def _handle_dlq_list(event: dict) -> dict:
    """List messages from both SQS dead-letter queues (peek, don't consume)."""
    logger.info("Listing DLQ messages")

    queues = []
    for queue_label, urls in DLQ_MAP.items():
        dlq_url = urls["dlq_url"]
        if not dlq_url:
            continue

        dlq_name = dlq_url.rstrip("/").split("/")[-1]

        # Get approximate message count
        try:
            attrs_resp = sqs_client.get_queue_attributes(
                QueueUrl=dlq_url,
                AttributeNames=["ApproximateNumberOfMessages"],
            )
            approx_count = int(
                attrs_resp.get("Attributes", {}).get("ApproximateNumberOfMessages", "0")
            )
        except ClientError as exc:
            logger.error("Failed to get DLQ attributes for %s: %s", dlq_name, exc)
            approx_count = -1

        # Peek at messages (VisibilityTimeout=0 so they remain visible)
        messages = []
        try:
            recv_resp = sqs_client.receive_message(
                QueueUrl=dlq_url,
                MaxNumberOfMessages=10,
                VisibilityTimeout=0,
                AttributeNames=["All"],
            )
            for msg in recv_resp.get("Messages", []):
                attributes = msg.get("Attributes", {})
                messages.append({
                    "message_id": msg["MessageId"],
                    "receipt_handle": msg["ReceiptHandle"],
                    "body": msg.get("Body", ""),
                    "attributes": attributes,
                    "sent_timestamp": attributes.get("SentTimestamp", ""),
                })
        except ClientError as exc:
            logger.error("Failed to receive DLQ messages from %s: %s", dlq_name, exc)

        queues.append({
            "name": dlq_name,
            "url": dlq_url,
            "queue": queue_label,
            "approximate_count": approx_count,
            "messages": messages,
        })

    return _response(200, {"queues": queues})


# ---- POST /admin/dlq/redrive ----------------------------------------------
def _handle_dlq_redrive(event: dict) -> dict:
    """Resubmit a message from a DLQ back to its main queue."""
    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)

    queue_label = body.get("queue", "")
    message_id = body.get("message_id", "")
    receipt_handle = body.get("receipt_handle", "")

    if queue_label not in DLQ_MAP:
        return _response(400, {"error": f"Invalid queue '{queue_label}'. Allowed: download, analysis"})
    if not message_id:
        return _response(400, {"error": "Missing 'message_id' in request body"})
    if not receipt_handle:
        return _response(400, {"error": "Missing 'receipt_handle' in request body"})

    urls = DLQ_MAP[queue_label]
    dlq_url = urls["dlq_url"]
    main_url = urls["main_url"]

    if not dlq_url or not main_url:
        return _response(500, {"error": f"Queue URLs for '{queue_label}' are not configured"})

    logger.info("Redriving message %s from %s DLQ to main queue", message_id, queue_label)

    # Receive the specific message using the receipt handle to get its body
    # The receipt_handle from the peek should still be valid (VisibilityTimeout=0 makes it re-available)
    # We re-receive to get a fresh receipt handle for deletion
    try:
        recv_resp = sqs_client.receive_message(
            QueueUrl=dlq_url,
            MaxNumberOfMessages=10,
            VisibilityTimeout=30,
        )
    except ClientError as exc:
        logger.error("Failed to receive from DLQ: %s", exc)
        return _response(500, {"error": f"Failed to receive from DLQ: {str(exc)}"})

    # Find the target message
    target_msg = None
    for msg in recv_resp.get("Messages", []):
        if msg["MessageId"] == message_id:
            target_msg = msg
            break

    if not target_msg:
        return _response(404, {"error": f"Message {message_id} not found in DLQ"})

    # Send to main queue
    try:
        sqs_client.send_message(
            QueueUrl=main_url,
            MessageBody=target_msg["Body"],
        )
    except ClientError as exc:
        logger.error("Failed to send message to main queue: %s", exc)
        return _response(500, {"error": f"Failed to send to main queue: {str(exc)}"})

    # Delete from DLQ
    try:
        sqs_client.delete_message(
            QueueUrl=dlq_url,
            ReceiptHandle=target_msg["ReceiptHandle"],
        )
    except ClientError as exc:
        logger.error("Failed to delete message from DLQ: %s", exc)
        # Message was already sent to main queue, so log but don't fail
        return _response(200, {
            "success": True,
            "queue": queue_label,
            "warning": "Message sent to main queue but failed to delete from DLQ",
        })

    return _response(200, {"success": True, "queue": queue_label})


# ---- DELETE /admin/dlq -----------------------------------------------------
def _handle_dlq_delete(event: dict) -> dict:
    """Delete a specific message from a DLQ."""
    size_err = _check_body_size(event)
    if size_err:
        return size_err
    body = _parse_json_body(event)

    queue_label = body.get("queue", "")
    receipt_handle = body.get("receipt_handle", "")

    if queue_label not in DLQ_MAP:
        return _response(400, {"error": f"Invalid queue '{queue_label}'. Allowed: download, analysis"})
    if not receipt_handle:
        return _response(400, {"error": "Missing 'receipt_handle' in request body"})

    dlq_url = DLQ_MAP[queue_label]["dlq_url"]
    if not dlq_url:
        return _response(500, {"error": f"DLQ URL for '{queue_label}' is not configured"})

    logger.info("Deleting message from %s DLQ", queue_label)

    try:
        sqs_client.delete_message(
            QueueUrl=dlq_url,
            ReceiptHandle=receipt_handle,
        )
    except ClientError as exc:
        logger.error("Failed to delete DLQ message: %s", exc)
        return _response(500, {"error": f"Failed to delete message: {str(exc)}"})

    return _response(200, {"deleted": True})


# ---- GET /admin/emails ---------------------------------------------------
def _handle_emails_list(event: dict) -> dict:
    """List source emails from Supabase, optionally filtered by status."""
    if not supabase:
        return _response(500, {"error": "Supabase is not configured"})

    status_filter = _get_query_param(event, "status")
    limit, err = _parse_int_param(event, "limit", 50)
    if err:
        return err

    logger.info("Listing emails: status=%s limit=%d", status_filter, limit)

    query = supabase.table("source_emails").select(
        "id, trip_id, email_id, source_email_info, parsed_data, linked_entities, status, created_at"
    ).order("created_at", desc=True).limit(limit)

    if status_filter:
        query = query.eq("status", status_filter)

    resp = query.execute()
    emails = resp.data or []

    return _response(200, {
        "emails": emails,
        "count": len(emails),
    })


# ---- GET /admin/emails/{email_id}/raw ------------------------------------
def _handle_email_raw(event: dict, path: str) -> dict:
    """Return raw email text from S3 for a given email, truncated to 10KB."""
    if not supabase:
        return _response(500, {"error": "Supabase is not configured"})

    # Extract email_id from path: /admin/emails/{email_id}/raw
    email_id = path.removeprefix("/admin/emails/").removesuffix("/raw")
    if not email_id:
        return _response(400, {"error": "Missing email_id in path"})

    logger.info("Fetching raw email: email_id=%s", email_id)

    # Try to get the S3 key directly — the key is the email message ID (from SES)
    s3_key = email_id

    try:
        head_resp = s3_client.head_object(Bucket=S3_BUCKET_EMAILS, Key=s3_key)
        size_bytes = head_resp.get("ContentLength", 0)
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "404":
            return _response(404, {"error": f"Raw email not found in S3: {s3_key}"})
        raise

    # Download the object (truncated to 10KB for safety)
    max_bytes = 10 * 1024
    try:
        get_kwargs: dict[str, Any] = {"Bucket": S3_BUCKET_EMAILS, "Key": s3_key}
        if size_bytes > max_bytes:
            get_kwargs["Range"] = f"bytes=0-{max_bytes - 1}"

        get_resp = s3_client.get_object(**get_kwargs)
        raw_bytes = get_resp["Body"].read()
        raw_text = raw_bytes.decode("utf-8", errors="replace")
    except ClientError as exc:
        logger.error("Failed to read raw email from S3: %s", exc)
        return _response(500, {"error": "Failed to read raw email from S3"})

    return _response(200, {
        "email_id": email_id,
        "s3_key": s3_key,
        "size_bytes": size_bytes,
        "raw_text_preview": raw_text,
    })


# ---- GET /admin/emails/stats ---------------------------------------------
def _handle_emails_stats(event: dict) -> dict:
    """Aggregate statistics from the source_emails table."""
    if not supabase:
        return _response(500, {"error": "Supabase is not configured"})

    logger.info("Fetching email stats")

    # Fetch all emails with relevant fields
    resp = supabase.table("source_emails").select(
        "id, trip_id, status, linked_entities, created_at"
    ).execute()
    emails = resp.data or []

    # -- By status --
    by_status: dict[str, int] = {}
    for email in emails:
        status = email.get("status", "unknown")
        by_status[status] = by_status.get(status, 0) + 1

    # -- By trip --
    by_trip_map: dict[str, int] = {}
    for email in emails:
        trip_id = email.get("trip_id") or "unassigned"
        by_trip_map[trip_id] = by_trip_map.get(trip_id, 0) + 1
    by_trip = [{"trip_id": tid, "count": cnt} for tid, cnt in sorted(by_trip_map.items(), key=lambda x: -x[1])]

    # -- By day (last 30 days) --
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    by_day_map: dict[str, int] = {}
    for email in emails:
        created = email.get("created_at")
        if not created:
            continue
        # Parse ISO date (handle both datetime and date-only)
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue
        if dt >= thirty_days_ago:
            day_str = dt.strftime("%Y-%m-%d")
            by_day_map[day_str] = by_day_map.get(day_str, 0) + 1
    by_day = [{"date": d, "count": c} for d, c in sorted(by_day_map.items())]

    # -- Average linked_entities count per email --
    total_entities = 0
    emails_with_entities = 0
    for email in emails:
        entities = email.get("linked_entities")
        if isinstance(entities, list):
            total_entities += len(entities)
            emails_with_entities += 1
    avg_entities = round(total_entities / emails_with_entities, 2) if emails_with_entities > 0 else 0

    return _response(200, {
        "by_status": by_status,
        "by_trip": by_trip,
        "by_day": by_day,
        "avg_entities_per_email": avg_entities,
    })


# ---- GET /admin/costs ----------------------------------------------------

# Rough per-call cost estimates (USD)
_COST_GEMINI_VIDEO = 0.003       # Gemini 2.5-flash (video analysis)
_COST_GEMINI_OTHER = 0.001       # Gemini 2.0-flash (text/maps/web)
_COST_OPENAI_EMAIL = 0.002       # GPT-4o-mini (email parsing)
_COST_GEOCODING_CALL = 0.005     # Google Maps Geocoding API
_COST_STATIC_MAP_CALL = 0.002    # Google Maps Static Maps API
_COST_LAMBDA_INVOCATION = 0.0000002  # AWS Lambda per-invocation
_COST_S3_PER_GB_MONTH = 0.023    # S3 standard storage per GB/month
_COST_DYNAMO_READ = 0.00025      # DynamoDB on-demand read
_COST_DYNAMO_WRITE = 0.00125     # DynamoDB on-demand write
_GEOCODING_CALLS_PER_ANALYSIS = 2
_STATIC_MAP_CALLS_PER_ANALYSIS = 1


def _infer_source_type(url: str) -> str:
    """Infer the source type of a cache entry from its URL."""
    if url.startswith("https://maps.app") or "google.com/maps" in url or "goo.gl/maps" in url:
        return "maps"
    if url.startswith("text://"):
        return "text"
    if is_video_url(url):
        return "video"
    return "web"


def _handle_costs(event: dict) -> dict:
    """Return cost estimation data for a given period."""
    period_str = _get_query_param(event, "period", "30d") or "30d"
    period_map = {
        "7d": 7,
        "30d": 30,
        "90d": 90,
    }

    if period_str not in period_map:
        return _response(400, {
            "error": f"Invalid period '{period_str}'. Allowed: {', '.join(period_map.keys())}"
        })

    days = period_map[period_str]
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=days)
    start_iso = start_time.isoformat()

    logger.info("Fetching cost data: period=%s start=%s", period_str, start_iso)

    # 1. DynamoDB cache entries — count by inferred source_type
    video_analyses = 0
    text_analyses = 0
    maps_analyses = 0
    web_analyses = 0

    try:
        scan_kwargs: dict[str, Any] = {
            "ProjectionExpression": "#u, #ca",
            "ExpressionAttributeNames": {"#u": "url", "#ca": "created_at"},
            "FilterExpression": "#ca >= :start",
            "ExpressionAttributeValues": {":start": start_iso},
        }
        while True:
            resp = table.scan(**scan_kwargs)
            for item in resp.get("Items", []):
                url = item.get("url", "")
                source = _infer_source_type(url)
                if source == "video":
                    video_analyses += 1
                elif source == "text":
                    text_analyses += 1
                elif source == "maps":
                    maps_analyses += 1
                else:
                    web_analyses += 1
            if "LastEvaluatedKey" not in resp:
                break
            scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    except Exception as exc:
        logger.error("Failed to scan DynamoDB for cost data: %s", exc)

    # 2. S3 raw emails — count objects with LastModified in the period
    email_analyses = 0
    try:
        continuation_token = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": S3_BUCKET_EMAILS, "MaxKeys": 1000}
            if continuation_token:
                kwargs["ContinuationToken"] = continuation_token
            resp = s3_client.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []):
                last_modified = obj.get("LastModified")
                if last_modified and last_modified >= start_time:
                    email_analyses += 1
            if not resp.get("IsTruncated"):
                break
            continuation_token = resp.get("NextContinuationToken")
    except Exception as exc:
        logger.error("Failed to count S3 emails for cost data: %s", exc)

    # 3. CloudWatch metrics — Lambda invocation counts
    lambda_invocations: dict[str, int] = {}
    try:
        metric_queries = []
        for idx, func_name in enumerate(LAMBDA_FUNCTIONS):
            safe_name = re.sub(r"[^a-z0-9]", "_", func_name.lower())
            metric_queries.append({
                "Id": f"inv_{safe_name}_{idx}",
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/Lambda",
                        "MetricName": "Invocations",
                        "Dimensions": [{"Name": "FunctionName", "Value": func_name}],
                    },
                    "Period": days * 86400,  # single data point for the whole period
                    "Stat": "Sum",
                },
            })

        if metric_queries:
            cw_resp = cloudwatch.get_metric_data(
                MetricDataQueries=metric_queries,
                StartTime=start_time,
                EndTime=end_time,
            )
            for result in cw_resp.get("MetricDataResults", []):
                query_id = result["Id"]
                total = sum(result.get("Values", []))
                for func_name in LAMBDA_FUNCTIONS:
                    safe_fn = re.sub(r"[^a-z0-9]", "_", func_name.lower())
                    if f"inv_{safe_fn}_" in query_id:
                        short_name = func_name.replace("triptomat-", "")
                        lambda_invocations[short_name] = int(total)
                        break
    except Exception as exc:
        logger.error("Failed to fetch CloudWatch metrics for cost data: %s", exc)
        for func_name in LAMBDA_FUNCTIONS:
            short_name = func_name.replace("triptomat-", "")
            lambda_invocations.setdefault(short_name, 0)

    # 4. S3 storage size (across all allowed buckets)
    total_s3_bytes = 0
    try:
        for bucket in ALLOWED_BUCKETS:
            cont_token = None
            while True:
                kw: dict[str, Any] = {"Bucket": bucket, "MaxKeys": 1000}
                if cont_token:
                    kw["ContinuationToken"] = cont_token
                resp = s3_client.list_objects_v2(**kw)
                for obj in resp.get("Contents", []):
                    total_s3_bytes += obj.get("Size", 0)
                if not resp.get("IsTruncated"):
                    break
                cont_token = resp.get("NextContinuationToken")
    except Exception as exc:
        logger.error("Failed to calculate S3 storage for cost data: %s", exc)

    s3_storage_gb = round(total_s3_bytes / (1024 ** 3), 6)

    # 5. Cost estimation
    total_analyses = video_analyses + text_analyses + maps_analyses + web_analyses

    gemini_video_cost = round(video_analyses * _COST_GEMINI_VIDEO, 4)
    gemini_other_cost = round(
        (text_analyses + maps_analyses + web_analyses) * _COST_GEMINI_OTHER, 4
    )
    openai_email_cost = round(email_analyses * _COST_OPENAI_EMAIL, 4)
    geocoding_cost = round(
        total_analyses * _GEOCODING_CALLS_PER_ANALYSIS * _COST_GEOCODING_CALL, 4
    )
    static_maps_cost = round(
        total_analyses * _STATIC_MAP_CALLS_PER_ANALYSIS * _COST_STATIC_MAP_CALL, 4
    )

    total_lambda_invocations = sum(lambda_invocations.values())
    lambda_cost = round(total_lambda_invocations * _COST_LAMBDA_INVOCATION, 6)
    s3_cost = round(s3_storage_gb * _COST_S3_PER_GB_MONTH, 6)

    # DynamoDB cost: estimate reads = total_analyses * 2 (scan + get), writes = total_analyses
    dynamo_reads = total_analyses * 2 + email_analyses
    dynamo_writes = total_analyses + email_analyses
    dynamo_cost = round(
        dynamo_reads * _COST_DYNAMO_READ + dynamo_writes * _COST_DYNAMO_WRITE, 4
    )

    total_cost = round(
        gemini_video_cost + gemini_other_cost + openai_email_cost
        + geocoding_cost + static_maps_cost
        + lambda_cost + s3_cost + dynamo_cost,
        4,
    )

    return _response(200, {
        "period": period_str,
        "start_date": start_time.strftime("%Y-%m-%d"),
        "end_date": end_time.strftime("%Y-%m-%d"),
        "usage": {
            "video_analyses": video_analyses,
            "text_analyses": text_analyses,
            "maps_analyses": maps_analyses,
            "web_analyses": web_analyses,
            "email_analyses": email_analyses,
            "lambda_invocations": lambda_invocations,
            "s3_storage_gb": s3_storage_gb,
        },
        "estimated_costs": {
            "gemini": {
                "video": gemini_video_cost,
                "text_maps_web": gemini_other_cost,
            },
            "openai": {
                "email": openai_email_cost,
            },
            "google_maps": {
                "geocoding": geocoding_cost,
                "static_maps": static_maps_cost,
            },
            "aws_lambda": lambda_cost,
            "aws_s3": s3_cost,
            "aws_dynamodb": dynamo_cost,
            "total": total_cost,
        },
    })


# ---- GET /admin/funnel ---------------------------------------------------
def _handle_funnel(event: dict) -> dict:
    """Return pipeline funnel data showing how data flows from input to entities."""
    logger.info("Fetching pipeline funnel data")

    funnel: dict[str, Any] = {}
    linkage: dict[str, Any] = {}

    # 1. Gateway input — DynamoDB cache entries (each = 1 URL submission)
    try:
        dynamo_stats = _get_dynamo_stats()
        by_status = dynamo_stats.get("by_status", {})
        funnel["urls_submitted"] = {
            "total": dynamo_stats.get("total_items", 0),
            "completed": by_status.get("completed", 0),
            "processing": by_status.get("processing", 0),
            "failed": by_status.get("failed", 0),
        }
    except Exception as exc:
        logger.error("Funnel: failed to get DynamoDB stats: %s", exc)
        funnel["urls_submitted"] = {"total": 0, "completed": 0, "processing": 0, "failed": 0}

    if not supabase:
        return _response(500, {"error": "Supabase not configured"})

    # 2. Email input — source_emails
    try:
        emails_total_resp = supabase.table("source_emails").select("id", count="exact").execute()
        emails_total = emails_total_resp.count if emails_total_resp.count is not None else 0

        emails_linked_resp = supabase.table("source_emails").select(
            "id", count="exact"
        ).eq("status", "linked").execute()
        emails_linked = emails_linked_resp.count if emails_linked_resp.count is not None else 0

        emails_pending_resp = supabase.table("source_emails").select(
            "id", count="exact"
        ).eq("status", "pending").execute()
        emails_pending = emails_pending_resp.count if emails_pending_resp.count is not None else 0

        emails_cancelled_resp = supabase.table("source_emails").select(
            "id", count="exact"
        ).eq("status", "cancelled").execute()
        emails_cancelled = emails_cancelled_resp.count if emails_cancelled_resp.count is not None else 0

        funnel["emails_received"] = {
            "total": emails_total,
            "linked": emails_linked,
            "pending": emails_pending,
            "cancelled": emails_cancelled,
        }
    except Exception as exc:
        logger.error("Funnel: failed to get email stats: %s", exc)
        funnel["emails_received"] = {"total": 0, "linked": 0, "pending": 0, "cancelled": 0}

    # 3. Recommendations created — source_recommendations
    try:
        recs_total_resp = supabase.table("source_recommendations").select("id", count="exact").execute()
        recs_total = recs_total_resp.count if recs_total_resp.count is not None else 0

        recs_linked_resp = supabase.table("source_recommendations").select(
            "id", count="exact"
        ).eq("status", "linked").execute()
        recs_linked = recs_linked_resp.count if recs_linked_resp.count is not None else 0

        recs_pending_resp = supabase.table("source_recommendations").select(
            "id", count="exact"
        ).eq("status", "pending").execute()
        recs_pending = recs_pending_resp.count if recs_pending_resp.count is not None else 0

        funnel["recommendations_created"] = {
            "total": recs_total,
            "linked": recs_linked,
            "pending": recs_pending,
        }
    except Exception as exc:
        logger.error("Funnel: failed to get recommendation stats: %s", exc)
        funnel["recommendations_created"] = {"total": 0, "linked": 0, "pending": 0}

    # 4. POIs created — points_of_interest by status
    try:
        pois_total_resp = supabase.table("points_of_interest").select("id", count="exact").execute()
        pois_total = pois_total_resp.count if pois_total_resp.count is not None else 0

        poi_statuses = ["candidate", "in_plan", "booked", "visited", "matched"]
        by_status_pois: dict[str, int] = {}
        for poi_status in poi_statuses:
            resp = supabase.table("points_of_interest").select(
                "id", count="exact"
            ).eq("status", poi_status).execute()
            by_status_pois[poi_status] = resp.count if resp.count is not None else 0

        funnel["pois_created"] = {
            "total": pois_total,
            "by_status": by_status_pois,
        }
    except Exception as exc:
        logger.error("Funnel: failed to get POI stats: %s", exc)
        funnel["pois_created"] = {"total": 0, "by_status": {}}

    # 5. Transportation created
    try:
        transport_resp = supabase.table("transportation").select("id", count="exact").execute()
        transport_total = transport_resp.count if transport_resp.count is not None else 0
        funnel["transportation_created"] = {"total": transport_total}
    except Exception as exc:
        logger.error("Funnel: failed to get transportation stats: %s", exc)
        funnel["transportation_created"] = {"total": 0}

    # 6. Itinerary days
    try:
        days_total_resp = supabase.table("itinerary_days").select("id", count="exact").execute()
        days_total = days_total_resp.count if days_total_resp.count is not None else 0

        # Fetch all days with activities to count which have activities
        days_resp = supabase.table("itinerary_days").select("id,activities").execute()
        days_data = days_resp.data or []
        with_activities = 0
        for day in days_data:
            activities = day.get("activities")
            if activities and isinstance(activities, list) and len(activities) > 0:
                with_activities += 1

        funnel["itinerary_days"] = {
            "total": days_total,
            "with_activities": with_activities,
            "empty": days_total - with_activities,
        }
    except Exception as exc:
        logger.error("Funnel: failed to get itinerary day stats: %s", exc)
        funnel["itinerary_days"] = {"total": 0, "with_activities": 0, "empty": 0}

    # 7. Linkage stats
    try:
        # Fetch all POIs with source_refs to count linkage
        pois_refs_resp = supabase.table("points_of_interest").select("id,source_refs").execute()
        pois_data = pois_refs_resp.data or []

        pois_from_emails = 0
        pois_from_recs = 0
        for poi in pois_data:
            refs = poi.get("source_refs")
            if refs and isinstance(refs, dict):
                email_ids = refs.get("email_ids")
                if email_ids and isinstance(email_ids, list) and len(email_ids) > 0:
                    pois_from_emails += 1
                rec_ids = refs.get("recommendation_ids")
                if rec_ids and isinstance(rec_ids, list) and len(rec_ids) > 0:
                    pois_from_recs += 1

        # Avg linked_entities per source_email
        emails_with_linked_resp = supabase.table("source_emails").select("id,linked_entities").execute()
        emails_data = emails_with_linked_resp.data or []
        total_email_entities = 0
        emails_with_entities = 0
        for email in emails_data:
            linked = email.get("linked_entities")
            if linked and isinstance(linked, list):
                count = len(linked)
                if count > 0:
                    total_email_entities += count
                    emails_with_entities += 1
            elif linked and isinstance(linked, dict):
                # linked_entities might be a dict with arrays
                count = sum(
                    len(v) for v in linked.values() if isinstance(v, list)
                )
                if count > 0:
                    total_email_entities += count
                    emails_with_entities += 1

        avg_per_email = round(total_email_entities / emails_with_entities, 1) if emails_with_entities > 0 else 0

        # Avg linked_entities per source_recommendation
        recs_with_linked_resp = supabase.table("source_recommendations").select("id,linked_entities").execute()
        recs_data = recs_with_linked_resp.data or []
        total_rec_entities = 0
        recs_with_entities = 0
        for rec in recs_data:
            linked = rec.get("linked_entities")
            if linked and isinstance(linked, list):
                count = len(linked)
                if count > 0:
                    total_rec_entities += count
                    recs_with_entities += 1
            elif linked and isinstance(linked, dict):
                count = sum(
                    len(v) for v in linked.values() if isinstance(v, list)
                )
                if count > 0:
                    total_rec_entities += count
                    recs_with_entities += 1

        avg_per_rec = round(total_rec_entities / recs_with_entities, 1) if recs_with_entities > 0 else 0

        linkage = {
            "pois_from_emails": pois_from_emails,
            "pois_from_recommendations": pois_from_recs,
            "avg_entities_per_email": avg_per_email,
            "avg_entities_per_recommendation": avg_per_rec,
        }
    except Exception as exc:
        logger.error("Funnel: failed to get linkage stats: %s", exc)
        linkage = {
            "pois_from_emails": 0,
            "pois_from_recommendations": 0,
            "avg_entities_per_email": 0,
            "avg_entities_per_recommendation": 0,
        }

    return _response(200, {
        "funnel": funnel,
        "linkage": linkage,
    })
