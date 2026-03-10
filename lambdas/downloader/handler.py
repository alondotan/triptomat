"""triptomat-downloader Lambda handler.

Required env vars:
  S3_BUCKET           — S3 bucket for media files (default: triptomat-media)
  ANALYSIS_QUEUE_URL  — SQS queue URL for AI analysis

Optional env vars:
  OTEL_ENABLED        — "true" to enable OpenTelemetry tracing/metrics
"""

import json
import os
import re
import urllib.request
import urllib.parse

import boto3
import yt_dlp
from pydantic import ValidationError
from youtube_transcript_api import YouTubeTranscriptApi

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


def _extract_video_id(url):
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/embed/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def _get_youtube_oembed(url):
    """Get video metadata via YouTube oEmbed API (no API key needed)."""
    oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(url, safe='')}&format=json"
    try:
        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return {
                "title": data.get("title", ""),
                "image": data.get("thumbnail_url", ""),
            }
    except Exception as e:
        print(f"oEmbed fetch failed: {e}")
        return {"title": "", "image": ""}


def _get_youtube_transcript(video_id):
    """Get transcript text via youtube-transcript-api. Returns None if unavailable."""
    try:
        ytt = YouTubeTranscriptApi()
        transcript = ytt.fetch(video_id)
        parts = [snippet.text for snippet in transcript]
        text = " ".join(parts)
        # Limit to 5000 chars (same as gateway text limit)
        return text[:5000] if text else None
    except Exception as e:
        print(f"Transcript fetch failed for {video_id}: {e}")
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
                    source_metadata = {"title": "", "image": ""}
                    with yt_dlp.YoutubeDL(base_opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                        source_metadata["title"] = info.get("title", "")
                        source_metadata["image"] = info.get("thumbnail", "")

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

                except yt_dlp.utils.DownloadError as e:
                    print(f"Job {job_id}: yt-dlp failed, trying text fallback: {e}")

                    video_id = _extract_video_id(url)
                    if not video_id:
                        record_counter(downloads_counter, attributes={"status": "failure"})
                        if root_span:
                            record_span_error(root_span, e)
                        raise

                    source_metadata = _get_youtube_oembed(url)
                    transcript = _get_youtube_transcript(video_id)
                    description = source_metadata.get("title", "")

                    if not transcript and not description:
                        print(f"Job {job_id}: text fallback also failed — no transcript or metadata")
                        record_counter(downloads_counter, attributes={"status": "failure"})
                        if root_span:
                            record_span_error(root_span, e)
                        raise

                    # Build text for analysis from transcript + description
                    text_parts = []
                    if description:
                        text_parts.append(f"Video title: {description}")
                    if transcript:
                        text_parts.append(f"Video transcript:\n{transcript}")
                    text = "\n\n".join(text_parts)

                    with safe_span(tracer, "downloader.text_fallback_dispatch"):
                        sqs.send_message(
                            QueueUrl=ANALYSIS_QUEUE_URL,
                            MessageBody=json.dumps({
                                "job_id": job_id,
                                "url": url,
                                "source_type": "web",
                                "source_metadata": source_metadata,
                                "text": text[:5000],
                                "webhook_token": webhook_token,
                            }),
                        )

                    print(f"Job {job_id}: sent to analysis queue via text fallback (transcript: {bool(transcript)})")
                    record_counter(downloads_counter, attributes={"status": "text_fallback"})

                except Exception as e:
                    record_counter(downloads_counter, attributes={"status": "failure"})
                    if root_span:
                        record_span_error(root_span, e)
                    raise
    finally:
        flush_telemetry()
