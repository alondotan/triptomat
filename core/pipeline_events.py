"""Fire-and-forget pipeline event reporting for real-time admin monitoring.

Each Lambda calls report_event() at key stages. If the edge function is
unreachable or not configured, failures are silently swallowed so the
pipeline is never blocked by monitoring.

Required env vars (optional — if missing, reporting is silently skipped):
  PIPELINE_EVENT_URL   — Supabase edge function URL for pipeline-event
  PIPELINE_EVENT_TOKEN — Shared auth token
"""

import json
import os
import urllib.request
import urllib.error

PIPELINE_EVENT_URL = os.environ.get("PIPELINE_EVENT_URL", "")
PIPELINE_EVENT_TOKEN = os.environ.get("PIPELINE_EVENT_TOKEN", "")


def report_event(
    job_id: str,
    stage: str,
    status: str = "started",
    source_url: str | None = None,
    source_type: str | None = None,
    title: str | None = None,
    image: str | None = None,
    metadata: dict | None = None,
):
    """POST a pipeline event to the Supabase edge function. Fire-and-forget."""
    if not PIPELINE_EVENT_URL or not PIPELINE_EVENT_TOKEN:
        return

    payload = {
        "job_id": job_id,
        "stage": stage,
        "status": status,
    }
    if source_url:
        payload["source_url"] = source_url
    if source_type:
        payload["source_type"] = source_type
    if title:
        payload["title"] = title
    if image:
        payload["image"] = image
    if metadata:
        payload["metadata"] = metadata

    try:
        req = urllib.request.Request(
            PIPELINE_EVENT_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {PIPELINE_EVENT_TOKEN}",
            },
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            resp.read()
    except Exception as e:
        # Never block the pipeline for monitoring
        print(f"[pipeline-event] Failed to report ({stage}/{status}): {e}")
