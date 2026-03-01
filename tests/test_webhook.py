"""Tests for core/webhook.py — send_to_webhook function."""

import json
import uuid
from unittest.mock import MagicMock, patch

from core.webhook import send_to_webhook


class TestSendToWebhook:
    """Tests for send_to_webhook()."""

    ANALYSIS = {"recommendations": [{"name": "Place A"}]}
    URL = "https://example.com/video"
    META = {"title": "My Video", "image": "https://img.com/thumb.jpg"}

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_successful_send_returns_true(self, mock_post):
        result = send_to_webhook(self.ANALYSIS, self.URL, self.META)
        assert result is True
        mock_post.assert_called_once()

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_payload_structure(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, self.META)
        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs["json"]

        assert payload["input_type"] == "recommendation"
        assert payload["source_url"] == self.URL
        assert payload["source_title"] == "My Video"
        assert payload["source_image"] == "https://img.com/thumb.jpg"
        assert payload["analysis"] == self.ANALYSIS
        # recommendation_id is a valid UUID
        uuid.UUID(payload["recommendation_id"])
        # timestamp ends with Z
        assert payload["timestamp"].endswith("Z")

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_webhook_token_param_appended_to_url(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, self.META, webhook_token="my-token")
        call_args = mock_post.call_args
        url_used = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert "?token=my-token" in url_used

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": "env-tok"})
    def test_env_webhook_token_fallback(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, self.META)
        url_used = mock_post.call_args.args[0]
        assert "?token=env-tok" in url_used

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": "env-tok"})
    def test_param_token_overrides_env(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, self.META, webhook_token="param-tok")
        url_used = mock_post.call_args.args[0]
        assert "?token=param-tok" in url_used

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_no_token_no_query_string(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, self.META)
        url_used = mock_post.call_args.args[0]
        assert url_used == "https://hook.example.com/api"
        assert "?token=" not in url_used

    @patch("core.webhook.requests.post", side_effect=Exception("connection error"))
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_request_failure_returns_false(self, mock_post):
        result = send_to_webhook(self.ANALYSIS, self.URL, self.META)
        assert result is False

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_timeout_set_to_10(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, self.META)
        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["timeout"] == 10

    @patch("core.webhook.requests.post")
    @patch.dict("os.environ", {"WEBHOOK_URL": "https://hook.example.com/api", "WEBHOOK_TOKEN": ""})
    def test_missing_metadata_keys_default_to_empty(self, mock_post):
        send_to_webhook(self.ANALYSIS, self.URL, {})
        payload = mock_post.call_args.kwargs["json"]
        assert payload["source_title"] == ""
        assert payload["source_image"] == ""
