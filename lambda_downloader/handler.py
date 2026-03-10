"""triptomat-downloader Lambda handler.

Required env vars:
  S3_BUCKET           — S3 bucket for media files (default: triptomat-media)
  ANALYSIS_QUEUE_URL  — SQS queue URL for AI analysis

Optional env vars:
  OTEL_ENABLED        — "true" to enable OpenTelemetry tracing/metrics
"""

import json
import os

import boto3
import yt_dlp
from pydantic import ValidationError

from core.schemas import DownloadMessage
from core.telemetry import (
    init_telemetry, get_tracer, get_meter,
    safe_span, record_counter, record_histogram, time_ms,
    flush_telemetry, record_span_error,
)

# ── Telemetry setup ─────────────────────────────────────────────────────────
init_telemetry("triptomat-downloader")
tracer = get_tracer(__name__)
meter = get_meter(__name__)

downloads_counter = meter.create_counter(
    "triptomat.downloader.downloads",
    description="Total download attempts",
)
download_duration_hist = meter.create_histogram(
    "triptomat.downloader.download_duration_ms",
    description="Video download duration in milliseconds",
)
upload_size_hist = meter.create_histogram(
    "triptomat.downloader.upload_size_bytes",
    description="Uploaded file size in bytes",
)

# ── AWS clients & config ────────────────────────────────────────────────────
s3 = boto3.client("s3")
sqs = boto3.client("sqs")

S3_BUCKET = os.environ.get("S3_BUCKET", "triptomat-media")
ANALYSIS_QUEUE_URL = os.environ.get("ANALYSIS_QUEUE_URL", "")
COOKIES_S3_KEY = os.environ.get("COOKIES_S3_KEY", "config/cookies.txt")


def _get_cookies_path():
    """Downloads cookies file from S3 to /tmp if available."""
    cookies_path = "/tmp/cookies.txt"
    if os.path.exists(cookies_path):
        return cookies_path
    try:
        s3.download_file(S3_BUCKET, COOKIES_S3_KEY, cookies_path)
        print(f"Downloaded cookies from s3://{S3_BUCKET}/{COOKIES_S3_KEY}")
        return cookies_path
    except Exception:
        return None


def lambda_handler(event, context):
    """SQS-triggered handler. Downloads video, uploads to S3, sends to analysis queue."""
    try:
        for record in event["Records"]:
            raw = json.loads(record["body"])

            try:
                msg = DownloadMessage.model_validate(raw)
            except ValidationError as e:
                print(f"Invalid SQS message: {e}")
                raise

            job_id = msg.job_id
            url = msg.url
            webhook_token = msg.webhook_token or ""

            with safe_span(tracer, "downloader.handle_message", {
                "downloader.job_id": job_id,
                "downloader.url": url[:200],
            }) as root_span:
                try:
                    print(f"Downloading video for job {job_id}: {url}")

                    # Load cookies if available
                    cookies_path = _get_cookies_path()
                    base_opts = {"quiet": True}
                    if cookies_path:
                        base_opts["cookiefile"] = cookies_path

                    # Extract metadata via yt-dlp
                    source_metadata = {"title": "", "image": "", "description": ""}
                    with yt_dlp.YoutubeDL(base_opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                        source_metadata["title"] = info.get("title", "")
                        source_metadata["image"] = info.get("thumbnail", "")
                        source_metadata["description"] = info.get("description", "")

                    # Download video to /tmp
                    video_path = f"/tmp/{job_id}.mp4"
                    ydl_opts = {
                        **base_opts,
                        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
                        "outtmpl": video_path,
                    }

                    with safe_span(tracer, "downloader.video_download", {
                        "download.url": url[:200],
                    }) as dl_span:
                        dl_start = time_ms()
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            ydl.download([url])
                        dl_duration = time_ms() - dl_start
                        if dl_span:
                            try:
                                dl_span.set_attribute("download.duration_seconds", dl_duration / 1000)
                            except Exception:
                                pass
                        record_histogram(download_duration_hist, dl_duration)

                    # Upload to S3
                    s3_key = f"uploads/{job_id}.mp4"
                    file_size = os.path.getsize(video_path) if os.path.exists(video_path) else 0

                    with safe_span(tracer, "downloader.s3_upload", {
                        "s3.key": s3_key,
                        "s3.file_size_bytes": file_size,
                    }):
                        s3.upload_file(video_path, S3_BUCKET, s3_key)
                        record_histogram(upload_size_hist, file_size)

                    print(f"Uploaded to s3://{S3_BUCKET}/{s3_key}")

                    # Send to analysis queue
                    with safe_span(tracer, "downloader.sqs_dispatch", {
                        "sqs.queue_name": "analysis",
                    }):
                        sqs.send_message(
                            QueueUrl=ANALYSIS_QUEUE_URL,
                            MessageBody=json.dumps({
                                "job_id": job_id,
                                "url": url,
                                "source_type": "video",
                                "source_metadata": source_metadata,
                                "s3_key": s3_key,
                                "webhook_token": webhook_token,
                            }),
                        )

                    # Clean up
                    os.remove(video_path)
                    print(f"Job {job_id}: video sent to analysis queue")
                    record_counter(downloads_counter, attributes={"status": "success"})

                except Exception as e:
                    record_counter(downloads_counter, attributes={"status": "failure"})
                    if root_span:
                        record_span_error(root_span, e)
                    raise
    finally:
        flush_telemetry()
