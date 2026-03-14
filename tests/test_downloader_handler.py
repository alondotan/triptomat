"""Tests for lambdas/downloader/handler.py."""

import json
from unittest.mock import MagicMock, patch

import pytest

from lambdas.downloader.handler import (
    _extract_video_id,
    _get_cookies_path,
    lambda_handler,
)


class TestExtractVideoId:
    """Tests for _extract_video_id()."""

    def test_youtube_watch_url(self):
        assert _extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_youtube_short_url(self):
        assert _extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_youtube_shorts_url(self):
        assert _extract_video_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_youtube_embed_url(self):
        assert _extract_video_id("https://youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_non_youtube_url_returns_none(self):
        assert _extract_video_id("https://www.example.com/video") is None

    def test_tiktok_url_returns_none(self):
        assert _extract_video_id("https://www.tiktok.com/@user/video/123") is None


class TestGetCookiesPath:
    """Tests for _get_cookies_path()."""

    @patch("os.path.exists", return_value=True)
    def test_returns_path_when_file_exists(self, mock_exists):
        result = _get_cookies_path()
        assert result == "/tmp/cookies.txt"

    @patch("os.path.exists", return_value=False)
    @patch("lambdas.downloader.handler.s3")
    def test_downloads_from_s3_when_not_cached(self, mock_s3, mock_exists):
        result = _get_cookies_path()
        assert result == "/tmp/cookies.txt"
        mock_s3.download_file.assert_called_once()

    @patch("os.path.exists", return_value=False)
    @patch("lambdas.downloader.handler.s3")
    def test_returns_none_when_s3_fails(self, mock_s3, mock_exists):
        mock_s3.download_file.side_effect = Exception("S3 error")
        result = _get_cookies_path()
        assert result is None


class TestDownloaderLambdaHandler:
    """Tests for lambda_handler()."""

    def _make_sqs_event(self, body):
        return {"Records": [{"body": json.dumps(body)}]}

    @patch("lambdas.downloader.handler.report_event")
    @patch("lambdas.downloader.handler.os.remove")
    @patch("lambdas.downloader.handler.os.path.getsize", return_value=1024)
    @patch("lambdas.downloader.handler.os.path.exists", return_value=True)
    @patch("lambdas.downloader.handler.s3")
    @patch("lambdas.downloader.handler.sqs")
    @patch("lambdas.downloader.handler._get_cookies_path", return_value=None)
    @patch("lambdas.downloader.handler.yt_dlp")
    def test_successful_download_and_dispatch(self, mock_ytdlp, mock_cookies,
                                               mock_sqs, mock_s3, mock_exists,
                                               mock_getsize, mock_remove, mock_report):
        mock_ydl_instance = MagicMock()
        mock_ydl_instance.extract_info.return_value = {"title": "Test Video", "thumbnail": "http://img.com/t.jpg"}
        mock_ytdlp.YoutubeDL.return_value.__enter__ = MagicMock(return_value=mock_ydl_instance)
        mock_ytdlp.YoutubeDL.return_value.__exit__ = MagicMock(return_value=False)

        event = self._make_sqs_event({
            "job_id": "job-1",
            "url": "https://www.youtube.com/watch?v=abc123",
            "webhook_token": "tok",
        })
        lambda_handler(event, None)

        mock_sqs.send_message.assert_called_once()
        call_kwargs = mock_sqs.send_message.call_args.kwargs
        body = json.loads(call_kwargs["MessageBody"])
        assert body["job_id"] == "job-1"
        assert body["source_type"] == "video"

    def test_invalid_message_raises_validation_error(self):
        event = self._make_sqs_event({"invalid": "data"})
        with pytest.raises(Exception):
            lambda_handler(event, None)

    @patch("lambdas.downloader.handler.report_event")
    @patch("lambdas.downloader.handler.sqs")
    @patch("lambdas.downloader.handler._get_cookies_path", return_value=None)
    @patch("lambdas.downloader.handler._get_youtube_transcript", return_value="Some transcript text")
    @patch("lambdas.downloader.handler._get_youtube_oembed", return_value={"title": "Test", "image": "http://img.com/t.jpg"})
    @patch("lambdas.downloader.handler.yt_dlp")
    def test_text_fallback_on_download_error(self, mock_ytdlp, mock_oembed,
                                              mock_transcript, mock_cookies,
                                              mock_sqs, mock_report):
        import sys
        DownloadError = sys.modules["yt_dlp"].utils.DownloadError

        mock_ydl_instance = MagicMock()
        mock_ydl_instance.extract_info.side_effect = DownloadError("blocked")
        mock_ytdlp.YoutubeDL.return_value.__enter__ = MagicMock(return_value=mock_ydl_instance)
        mock_ytdlp.YoutubeDL.return_value.__exit__ = MagicMock(return_value=False)
        mock_ytdlp.utils.DownloadError = DownloadError

        event = self._make_sqs_event({
            "job_id": "job-2",
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "webhook_token": "tok",
        })
        lambda_handler(event, None)

        mock_sqs.send_message.assert_called_once()
        body = json.loads(mock_sqs.send_message.call_args.kwargs["MessageBody"])
        assert body["source_type"] == "web"
