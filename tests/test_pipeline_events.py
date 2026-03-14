"""Tests for core/pipeline_events.py — report_event function."""

import json
from unittest.mock import patch, MagicMock


class TestReportEvent:
    """Tests for report_event()."""

    @patch.dict("os.environ", {"PIPELINE_EVENT_URL": "", "PIPELINE_EVENT_TOKEN": ""})
    def test_no_env_vars_returns_immediately(self):
        # Re-import to pick up env vars
        import importlib
        import core.pipeline_events as mod
        importlib.reload(mod)

        with patch("urllib.request.urlopen") as mock_urlopen:
            mod.report_event("job-1", "gateway", "started")
            mock_urlopen.assert_not_called()

    @patch.dict("os.environ", {
        "PIPELINE_EVENT_URL": "https://events.example.com",
        "PIPELINE_EVENT_TOKEN": "secret-token",
    })
    def test_sends_post_with_correct_payload(self):
        import importlib
        import core.pipeline_events as mod
        importlib.reload(mod)

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_resp

            mod.report_event("job-1", "gateway", "started")

            mock_urlopen.assert_called_once()
            req = mock_urlopen.call_args[0][0]
            body = json.loads(req.data.decode())
            assert body["job_id"] == "job-1"
            assert body["stage"] == "gateway"
            assert body["status"] == "started"
            assert req.get_header("Authorization") == "Bearer secret-token"
            assert req.get_header("Content-type") == "application/json"

    @patch.dict("os.environ", {
        "PIPELINE_EVENT_URL": "https://events.example.com",
        "PIPELINE_EVENT_TOKEN": "tok",
    })
    def test_optional_fields_included_when_provided(self):
        import importlib
        import core.pipeline_events as mod
        importlib.reload(mod)

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_resp

            mod.report_event(
                "job-1", "worker", "completed",
                source_url="https://example.com",
                source_type="web",
                title="Test Page",
                image="https://img.com/thumb.jpg",
                metadata={"key": "value"},
            )

            req = mock_urlopen.call_args[0][0]
            body = json.loads(req.data.decode())
            assert body["source_url"] == "https://example.com"
            assert body["source_type"] == "web"
            assert body["title"] == "Test Page"
            assert body["image"] == "https://img.com/thumb.jpg"
            assert body["metadata"] == {"key": "value"}

    @patch.dict("os.environ", {
        "PIPELINE_EVENT_URL": "https://events.example.com",
        "PIPELINE_EVENT_TOKEN": "tok",
    })
    def test_optional_fields_excluded_when_none(self):
        import importlib
        import core.pipeline_events as mod
        importlib.reload(mod)

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.__enter__ = MagicMock(return_value=mock_resp)
            mock_resp.__exit__ = MagicMock(return_value=False)
            mock_urlopen.return_value = mock_resp

            mod.report_event("job-1", "gateway", "started")

            req = mock_urlopen.call_args[0][0]
            body = json.loads(req.data.decode())
            assert "source_url" not in body
            assert "source_type" not in body
            assert "title" not in body
            assert "image" not in body
            assert "metadata" not in body

    @patch.dict("os.environ", {
        "PIPELINE_EVENT_URL": "https://events.example.com",
        "PIPELINE_EVENT_TOKEN": "tok",
    })
    def test_network_error_does_not_raise(self):
        import importlib
        import core.pipeline_events as mod
        importlib.reload(mod)

        with patch("urllib.request.urlopen", side_effect=Exception("connection refused")):
            # Should not raise
            mod.report_event("job-1", "gateway", "started")
