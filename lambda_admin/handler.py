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
from decimal import Decimal
from typing import Any

import boto3
from botocore.exceptions import ClientError
from supabase import create_client

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
class _DecimalEncoder(json.JSONEncoder):
    """Encode DynamoDB Decimal values as float for JSON serialisation."""
    def default(self, o: object) -> Any:
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _resolve_cors_origin(event: dict) -> str:
    """Return the request Origin if it is in the allow-list, else the first allowed origin."""
    headers = event.get("headers") or {}
    origin = headers.get("Origin") or headers.get("origin") or ""
    if origin in ALLOWED_ORIGINS:
        return origin
    return next(iter(ALLOWED_ORIGINS), "")


def _response(status_code: int, body: dict) -> dict:
    """Build an API Gateway proxy response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": _cors_origin,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        },
        "body": json.dumps(body, cls=_DecimalEncoder),
    }


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
        ("GET", "/admin/cloudwatch/metrics"): _handle_cloudwatch_metrics,
        ("GET", "/admin/costs"): _handle_costs,
    }

    handler = routes.get((method, path))
    if handler is None:
        return _response(404, {"error": f"Not found: {method} {path}"})

    return handler(event)


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------
def lambda_handler(event: dict, context: Any) -> dict:
    """API Gateway entry point for the admin API."""
    global _cors_origin
    _cors_origin = _resolve_cors_origin(event)

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

        users.append({
            "id": user_id,
            "email": user.email,
            "created_at": str(user.created_at) if user.created_at else None,
            "last_sign_in_at": str(user.last_sign_in_at) if user.last_sign_in_at else None,
            "trips_count": trips_count,
            "pois_count": pois_count,
        })

    return _response(200, {
        "users": users,
        "count": len(users),
        "total": len(all_users),
        "limit": limit,
        "offset": offset,
    })


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
