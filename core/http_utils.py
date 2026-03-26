"""Shared HTTP / API-Gateway response helpers.

Consolidates the duplicated _DecimalEncoder, _resolve_cors_origin, and
_response helpers that were copy-pasted across gateway, admin, and whatsapp
Lambda handlers.
"""

import json
import os
from decimal import Decimal
from typing import Any

# ── Default allowed origins (Supabase + local dev) ────────────────────────
_DEFAULT_ORIGINS = (
    "https://aqpzhflzsqkjceeeufyf.supabase.co,"
    "https://triptomat.com,"
    "https://www.triptomat.com,"
    "http://localhost:5173,"
    "http://localhost:8080"
)


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that converts :class:`~decimal.Decimal` to ``float``.

    DynamoDB returns numeric values as ``Decimal``; this encoder lets you
    pass them straight through ``json.dumps`` without a manual conversion
    step.
    """

    def default(self, o: object) -> Any:
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def resolve_cors_origin(
    event: dict,
    allowed_origins: set[str] | None = None,
) -> str:
    """Return the request ``Origin`` if it is in *allowed_origins*.

    Falls back to the first element of *allowed_origins* (or ``""``).  When
    *allowed_origins* is ``None`` the set is built from the ``ALLOWED_ORIGINS``
    env-var (comma-separated) or from the built-in default list.
    """
    if allowed_origins is None:
        raw = os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS)
        allowed_origins = {o.strip() for o in raw.split(",") if o.strip()}

    headers = event.get("headers") or {}
    origin = headers.get("Origin") or headers.get("origin") or ""
    if origin in allowed_origins:
        return origin
    return next(iter(allowed_origins), "")


def api_response(
    status_code: int,
    body: dict,
    *,
    cors_origin: str | None = None,
    event: dict | None = None,
    allowed_origins: set[str] | None = None,
    allowed_methods: str = "POST,OPTIONS",
) -> dict:
    """Build an API Gateway proxy-integration response dict.

    CORS behaviour:

    * If *cors_origin* is provided (even ``""``), it is used as-is for the
      ``Access-Control-Allow-Origin`` header.
    * If *event* is provided instead, :func:`resolve_cors_origin` is called
      on the fly (optionally using *allowed_origins*).
    * If **neither** is provided, no CORS headers are added — useful for
      internal endpoints like the WhatsApp webhook.

    Parameters
    ----------
    status_code:
        HTTP status code (e.g. 200, 400, 500).
    body:
        JSON-serialisable dict for the response body.
    cors_origin:
        Pre-resolved origin string.  Takes precedence over *event*.
    event:
        Raw API-Gateway event; used to resolve the origin dynamically.
    allowed_origins:
        Forwarded to :func:`resolve_cors_origin` when *event* is given.
    allowed_methods:
        Value for ``Access-Control-Allow-Methods``.  Defaults to
        ``"POST,OPTIONS"``.
    """
    headers: dict[str, str] = {"Content-Type": "application/json"}

    # Determine the effective origin for CORS headers.
    origin: str | None = None
    if cors_origin is not None:
        origin = cors_origin
    elif event is not None:
        origin = resolve_cors_origin(event, allowed_origins)

    if origin is not None:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        headers["Access-Control-Allow-Methods"] = allowed_methods

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body, cls=DecimalEncoder),
    }
