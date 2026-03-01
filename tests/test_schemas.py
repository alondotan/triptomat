"""Tests for core/schemas.py — Pydantic models used across Lambda handlers."""

import pytest
from pydantic import ValidationError

from core.schemas import AnalysisMessage, DownloadMessage, GatewayRequest


class TestGatewayRequest:
    def test_valid_url(self):
        req = GatewayRequest(url="https://example.com")
        assert str(req.url) == "https://example.com/"

    def test_valid_text(self):
        req = GatewayRequest(text="some content")
        assert req.text == "some content"

    def test_both_url_and_text(self):
        req = GatewayRequest(url="https://example.com", text="content")
        assert req.url is not None
        assert req.text == "content"

    def test_neither_url_nor_text_raises(self):
        with pytest.raises(ValidationError, match="url or text"):
            GatewayRequest()

    def test_overwrite_default_false(self):
        req = GatewayRequest(url="https://example.com")
        assert req.overwrite is False

    def test_overwrite_true(self):
        req = GatewayRequest(url="https://example.com", overwrite=True)
        assert req.overwrite is True

    def test_text_at_max_length(self):
        req = GatewayRequest(text="a" * 50000)
        assert len(req.text) == 50000

    def test_text_over_max_length_raises(self):
        with pytest.raises(ValidationError):
            GatewayRequest(text="a" * 50001)

    def test_invalid_url_raises(self):
        with pytest.raises(ValidationError):
            GatewayRequest(url="not-a-url")

    def test_webhook_token_valid(self):
        req = GatewayRequest(url="https://example.com", webhook_token="tok123")
        assert req.webhook_token == "tok123"

    def test_webhook_token_empty_string_raises(self):
        with pytest.raises(ValidationError):
            GatewayRequest(url="https://example.com", webhook_token="")

    def test_webhook_token_too_long_raises(self):
        with pytest.raises(ValidationError):
            GatewayRequest(url="https://example.com", webhook_token="x" * 129)

    def test_webhook_token_at_max_length(self):
        req = GatewayRequest(url="https://example.com", webhook_token="x" * 128)
        assert len(req.webhook_token) == 128

    def test_webhook_token_none_by_default(self):
        req = GatewayRequest(url="https://example.com")
        assert req.webhook_token is None


class TestAnalysisMessage:
    def test_valid_full(self):
        msg = AnalysisMessage(
            job_id="j1",
            url="https://example.com",
            source_type="video",
            source_metadata={"title": "T", "image": "I"},
            text="some text",
            s3_key="uploads/file.mp4",
            webhook_token="tok",
            final_url="https://final.com",
            manual_lat=52.0,
            manual_lng=13.0,
        )
        assert msg.job_id == "j1"
        assert msg.source_type == "video"
        assert msg.manual_lat == 52.0

    def test_minimal_required_fields(self):
        msg = AnalysisMessage(job_id="j1", url="https://x.com", source_type="maps")
        assert msg.text is None
        assert msg.s3_key is None
        assert msg.webhook_token is None
        assert msg.final_url is None
        assert msg.manual_lat is None
        assert msg.manual_lng is None

    def test_default_source_metadata(self):
        msg = AnalysisMessage(job_id="j1", url="https://x.com", source_type="web")
        assert msg.source_metadata == {"title": "", "image": ""}

    def test_all_source_types(self):
        for st in ("video", "maps", "web"):
            msg = AnalysisMessage(job_id="j1", url="https://x.com", source_type=st)
            assert msg.source_type == st

    def test_invalid_source_type_raises(self):
        with pytest.raises(ValidationError):
            AnalysisMessage(job_id="j1", url="https://x.com", source_type="audio")

    def test_missing_job_id_raises(self):
        with pytest.raises(ValidationError):
            AnalysisMessage(url="https://x.com", source_type="web")

    def test_missing_url_raises(self):
        with pytest.raises(ValidationError):
            AnalysisMessage(job_id="j1", source_type="web")


class TestDownloadMessage:
    def test_valid(self):
        msg = DownloadMessage(job_id="j1", url="https://youtube.com/watch?v=abc")
        assert msg.job_id == "j1"
        assert msg.url == "https://youtube.com/watch?v=abc"

    def test_overwrite_default_false(self):
        msg = DownloadMessage(job_id="j1", url="https://example.com")
        assert msg.overwrite is False

    def test_overwrite_true(self):
        msg = DownloadMessage(job_id="j1", url="https://example.com", overwrite=True)
        assert msg.overwrite is True

    def test_webhook_token_optional(self):
        msg = DownloadMessage(job_id="j1", url="https://example.com")
        assert msg.webhook_token is None

    def test_webhook_token_set(self):
        msg = DownloadMessage(job_id="j1", url="https://example.com", webhook_token="t1")
        assert msg.webhook_token == "t1"

    def test_missing_job_id_raises(self):
        with pytest.raises(ValidationError):
            DownloadMessage(url="https://example.com")

    def test_missing_url_raises(self):
        with pytest.raises(ValidationError):
            DownloadMessage(job_id="j1")
