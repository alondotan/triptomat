"""Supabase REST API wrapper for database operations.

Provides query, insert, update, upsert, delete, and RPC functions
for use by Lambda handlers (ported from TypeScript Edge Functions).

Uses urllib.request (no external dependencies) consistent with
core/supabase_client.py and core/reconciliation.py.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional


def _resolve(url: str, key: str) -> tuple[str, str]:
    """Resolve URL and key, falling back to environment variables."""
    if not url:
        url = os.environ.get("SUPABASE_URL", "")
    if not key:
        key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    return url, key


def _headers(service_key: str) -> dict:
    """Standard headers for Supabase REST API."""
    return {
        "Content-Type": "application/json",
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Prefer": "return=representation",
    }


def _request(
    method: str,
    full_url: str,
    headers: dict,
    body: Optional[bytes] = None,
    timeout: int = 10,
) -> list | dict | None:
    """Make an HTTP request and return parsed JSON, or None on error."""
    req = urllib.request.Request(full_url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode("utf-8")
            if not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        print(f"Supabase {method} {full_url} failed {e.code}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Supabase {method} error: {e}")
        return None


def _build_filter_params(filters: dict) -> str:
    """Build PostgREST query params from a dict of column=value pairs."""
    parts = []
    for col, val in filters.items():
        parts.append(f"{urllib.parse.quote(col)}=eq.{urllib.parse.quote(str(val))}")
    return "&".join(parts)


# ── Query (SELECT) ───────────────────────────────────────────────


def query(
    table: str,
    filters: dict,
    select: str = "*",
    *,
    url: str = "",
    key: str = "",
    single: bool = False,
    order: str = "",
) -> list | dict | None:
    """SELECT from table with equality filters.

    Args:
        table: Table name.
        filters: Dict of column: value (uses eq operator).
        select: Columns to select (PostgREST select syntax).
        url: Supabase URL (falls back to SUPABASE_URL env var).
        key: Service role key (falls back to SUPABASE_SERVICE_KEY env var).
        single: If True, return first row or None instead of a list.
        order: Ordering string, e.g. "day_number.asc".

    Returns:
        List of rows, a single row dict, or None.
    """
    url, key = _resolve(url, key)
    params = [f"select={urllib.parse.quote(select)}"]
    if filters:
        params.append(_build_filter_params(filters))
    if order:
        params.append(f"order={urllib.parse.quote(order)}")
    full_url = f"{url}/rest/v1/{table}?{'&'.join(params)}"

    result = _request("GET", full_url, _headers(key))

    if single:
        if isinstance(result, list) and len(result) > 0:
            return result[0]
        return None
    return result if isinstance(result, list) else []


def query_contains(
    table: str,
    column: str,
    json_value: dict,
    select: str = "*",
    extra_filters: dict = None,
    *,
    url: str = "",
    key: str = "",
) -> list:
    """SELECT with a contains (@>) filter for JSONB columns.

    Args:
        table: Table name.
        column: JSONB column to filter on.
        json_value: Dict to match via the @> (contains) operator.
        select: Columns to select.
        extra_filters: Additional equality filters.
        url: Supabase URL.
        key: Service role key.

    Returns:
        List of matching rows.
    """
    url, key = _resolve(url, key)
    encoded_json = urllib.parse.quote(json.dumps(json_value, ensure_ascii=False))
    params = [
        f"select={urllib.parse.quote(select)}",
        f"{urllib.parse.quote(column)}=cs.{encoded_json}",
    ]
    if extra_filters:
        params.append(_build_filter_params(extra_filters))
    full_url = f"{url}/rest/v1/{table}?{'&'.join(params)}"

    result = _request("GET", full_url, _headers(key))
    return result if isinstance(result, list) else []


# ── Insert ───────────────────────────────────────────────────────


def insert(
    table: str,
    rows: list[dict] | dict,
    *,
    url: str = "",
    key: str = "",
    select: str = "*",
) -> list:
    """INSERT rows into a table.

    Args:
        table: Table name.
        rows: A single dict or list of dicts to insert.
        url: Supabase URL.
        key: Service role key.
        select: Columns to return from inserted rows.

    Returns:
        List of inserted rows.
    """
    url, key = _resolve(url, key)
    if isinstance(rows, dict):
        rows = [rows]
    params = [f"select={urllib.parse.quote(select)}"]
    full_url = f"{url}/rest/v1/{table}?{'&'.join(params)}"
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")

    result = _request("POST", full_url, _headers(key), body=body)
    return result if isinstance(result, list) else []


# ── Update ───────────────────────────────────────────────────────


def update(
    table: str,
    filters: dict,
    data: dict,
    *,
    url: str = "",
    key: str = "",
    extra_filter: str = "",
) -> list:
    """UPDATE rows matching filters.

    Args:
        table: Table name.
        filters: Dict of column: value equality filters.
        data: Dict of column: value to set.
        url: Supabase URL.
        key: Service role key.
        extra_filter: Raw PostgREST filter string, e.g. "image_url=is.null".

    Returns:
        List of updated rows.
    """
    url, key = _resolve(url, key)
    params = []
    if filters:
        params.append(_build_filter_params(filters))
    if extra_filter:
        params.append(extra_filter)
    full_url = f"{url}/rest/v1/{table}?{'&'.join(params)}"
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")

    result = _request("PATCH", full_url, _headers(key), body=body)
    return result if isinstance(result, list) else []


# ── Upsert ───────────────────────────────────────────────────────


def upsert(
    table: str,
    rows: list[dict] | dict,
    *,
    url: str = "",
    key: str = "",
    on_conflict: str = "",
) -> list:
    """UPSERT rows (insert or update on conflict).

    Args:
        table: Table name.
        rows: A single dict or list of dicts.
        url: Supabase URL.
        key: Service role key.
        on_conflict: Conflict column(s) for upsert resolution.

    Returns:
        List of upserted rows.
    """
    url, key = _resolve(url, key)
    if isinstance(rows, dict):
        rows = [rows]
    hdrs = _headers(key)
    hdrs["Prefer"] = "return=representation,resolution=merge-duplicates"
    params = []
    if on_conflict:
        params.append(f"on_conflict={urllib.parse.quote(on_conflict)}")
    query_str = f"?{'&'.join(params)}" if params else ""
    full_url = f"{url}/rest/v1/{table}{query_str}"
    body = json.dumps(rows, ensure_ascii=False).encode("utf-8")

    result = _request("POST", full_url, hdrs, body=body)
    return result if isinstance(result, list) else []


# ── Delete ───────────────────────────────────────────────────────


def delete(table: str, filters: dict, *, url: str = "", key: str = "") -> None:
    """DELETE rows matching filters.

    Args:
        table: Table name.
        filters: Dict of column: value equality filters.
        url: Supabase URL.
        key: Service role key.
    """
    url, key = _resolve(url, key)
    params = []
    if filters:
        params.append(_build_filter_params(filters))
    full_url = f"{url}/rest/v1/{table}?{'&'.join(params)}"

    hdrs = _headers(key)
    del hdrs["Prefer"]  # No need for return=representation on DELETE
    _request("DELETE", full_url, hdrs)


# ── RPC ──────────────────────────────────────────────────────────


def rpc(
    function_name: str, params: dict, *, url: str = "", key: str = ""
) -> any:
    """Call a Supabase RPC (database function).

    Args:
        function_name: Name of the Postgres function.
        params: Dict of function parameters.
        url: Supabase URL.
        key: Service role key.

    Returns:
        Parsed JSON response, or None on error.
    """
    url, key = _resolve(url, key)
    full_url = f"{url}/rest/v1/rpc/{function_name}"
    body = json.dumps(params, ensure_ascii=False).encode("utf-8")

    return _request("POST", full_url, _headers(key), body=body)


# ── Webhook token validation ─────────────────────────────────────


def validate_webhook_token(
    token: str, *, url: str = "", key: str = ""
) -> dict | None:
    """Validate a webhook token and return associated user info.

    Queries the webhook_tokens table for the given token.

    Args:
        token: The webhook token string.
        url: Supabase URL.
        key: Service role key.

    Returns:
        Dict with {"valid": True, "user_id": str} or None if invalid.
    """
    row = query(
        "webhook_tokens",
        {"token": token},
        select="user_id",
        url=url,
        key=key,
        single=True,
    )
    if row and row.get("user_id"):
        return {"valid": True, "user_id": row["user_id"]}
    return None
