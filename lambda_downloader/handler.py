"""triptomat-downloader Lambda handler.

Required env vars:
  S3_BUCKET           — S3 bucket for media files (default: triptomat-media)
  ANALYSIS_QUEUE_URL  — SQS queue URL for AI analysis
"""

import json
import os

import boto3
import yt_dlp
from pydantic import ValidationError

from core.schemas import DownloadMessage

s3 = boto3.client("s3")
sqs = boto3.client("sqs")

S3_BUCKET = os.environ.get("S3_BUCKET", "triptomat-media")
ANALYSIS_QUEUE_URL = os.environ.get("ANALYSIS_QUEUE_URL", "")


def lambda_handler(event, context):
    """SQS-triggered handler. Downloads video, uploads to S3, sends to analysis queue."""
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

        print(f"Downloading video for job {job_id}: {url}")

        # Extract metadata via yt-dlp
        source_metadata = {"title": "", "image": ""}
        with yt_dlp.YoutubeDL({"quiet": True}) as ydl:
            info = ydl.extract_info(url, download=False)
            source_metadata["title"] = info.get("title", "")
            source_metadata["image"] = info.get("thumbnail", "")

        # Download video to /tmp
        video_path = f"/tmp/{job_id}.mp4"
        ydl_opts = {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
            "outtmpl": video_path,
            "quiet": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Upload to S3
        s3_key = f"uploads/{job_id}.mp4"
        s3.upload_file(video_path, S3_BUCKET, s3_key)
        print(f"Uploaded to s3://{S3_BUCKET}/{s3_key}")

        # Send to analysis queue
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
