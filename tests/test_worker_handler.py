"""Tests for lambdas/worker/handler.py."""

import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from lambdas.worker.handler import _to_decimal, lambda_handler


class TestToDecimal:
    """Tests for _to_decimal()."""

    def test_converts_float(self):
        assert _to_decimal(3.14) == Decimal("3.14")

    def test_converts_nested_dict(self):
        result = _to_decimal({"a": {"b": 1.5}})
        assert result == {"a": {"b": Decimal("1.5")}}

    def test_converts_list(self):
        result = _to_decimal([1.0, 2.5])
        assert result == [Decimal("1.0"), Decimal("2.5")]

    def test_passes_through_string(self):
        assert _to_decimal("hello") == "hello"

    def test_passes_through_int(self):
        assert _to_decimal(42) == 42

    def test_passes_through_none(self):
        assert _to_decimal(None) is None


class TestWorkerLambdaHandler:
    """Tests for lambda_handler()."""

    def _make_sqs_event(self, body):
        return {"Records": [{"body": json.dumps(body)}]}

    def _base_message(self, source_type="web", **overrides):
        msg = {
            "job_id": "job-1",
            "url": "https://example.com",
            "source_type": source_type,
            "source_metadata": {"title": "Test", "image": ""},
            "webhook_token": "tok-1",
        }
        msg.update(overrides)
        return msg

    @patch("lambdas.worker.handler.report_event")
    @patch("lambdas.worker.handler.send_to_webhook", return_value=True)
    @patch("lambdas.worker.handler.reconcile", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.worker.handler.enrich_analysis_data", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.worker.handler.gemini")
    @patch("lambdas.worker.handler.maps")
    @patch("lambdas.worker.handler.table")
    @patch("lambdas.worker.handler.s3")
    def test_web_flow_success(self, mock_s3, mock_table, mock_maps, mock_gemini,
                               mock_enrich, mock_reconcile, mock_webhook, mock_report):
        mock_gemini.analyze_text.return_value = json.dumps({
            "recommendations": [{"name": "Place A", "category": "restaurant"}]
        })
        mock_maps.get_google_maps_image.return_value = ""
        mock_maps.search_google_image.return_value = ""

        event = self._make_sqs_event(self._base_message(
            source_type="web", text="Great restaurant in Tokyo"
        ))
        lambda_handler(event, None)

        mock_gemini.analyze_text.assert_called_once()
        mock_webhook.assert_called_once()
        mock_table.put_item.assert_called()
        put_call = mock_table.put_item.call_args
        assert put_call.kwargs["Item"]["status"] == "completed"

    @patch("lambdas.worker.handler.report_event")
    @patch("lambdas.worker.handler.send_to_webhook", return_value=True)
    @patch("lambdas.worker.handler.reconcile", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.worker.handler.enrich_analysis_data", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.worker.handler.gemini")
    @patch("lambdas.worker.handler.maps")
    @patch("lambdas.worker.handler.table")
    @patch("lambdas.worker.handler.s3")
    def test_video_flow_downloads_from_s3(self, mock_s3, mock_table, mock_maps,
                                           mock_gemini, mock_enrich, mock_reconcile,
                                           mock_webhook, mock_report):
        mock_gemini.analyze_video.return_value = json.dumps({
            "recommendations": [{"name": "Beach", "category": "attraction"}]
        })
        mock_maps.get_google_maps_image.return_value = ""
        mock_maps.search_google_image.return_value = ""

        event = self._make_sqs_event(self._base_message(
            source_type="video", s3_key="uploads/job-1.mp4"
        ))

        with patch("lambdas.worker.handler.os.remove"):
            lambda_handler(event, None)

        mock_s3.download_file.assert_called_once()
        mock_gemini.analyze_video.assert_called_once()

    @patch("lambdas.worker.handler.report_event")
    @patch("lambdas.worker.handler.send_to_webhook", return_value=True)
    @patch("lambdas.worker.handler.reconcile", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.worker.handler.enrich_analysis_data", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.worker.handler.gemini")
    @patch("lambdas.worker.handler.maps")
    @patch("lambdas.worker.handler.table")
    def test_maps_flow_with_coords(self, mock_table, mock_maps, mock_gemini,
                                    mock_enrich, mock_reconcile, mock_webhook, mock_report):
        mock_gemini.analyze_text.return_value = json.dumps({
            "recommendations": [{"name": "Tokyo Tower", "category": "landmark"}]
        })
        mock_maps.get_address_from_coords.return_value = "Tokyo, Japan"
        mock_maps.get_google_maps_image.return_value = "http://img.com/map.jpg"
        mock_maps.search_google_image.return_value = ""

        event = self._make_sqs_event(self._base_message(
            source_type="maps",
            final_url="https://www.google.com/maps/place/...",
            manual_lat=35.6762,
            manual_lng=139.6503,
        ))
        lambda_handler(event, None)

        mock_gemini.analyze_text.assert_called_once()
        mock_maps.get_address_from_coords.assert_called_once_with(35.6762, 139.6503)

    @patch("lambdas.worker.handler.report_event")
    @patch("lambdas.worker.handler.table")
    def test_empty_result_caches_completed(self, mock_table, mock_report):
        event = self._make_sqs_event(self._base_message(source_type="web"))
        lambda_handler(event, None)

        put_call = mock_table.put_item.call_args
        assert put_call.kwargs["Item"]["status"] == "completed"
        assert put_call.kwargs["Item"]["result"] == {}

    @patch("lambdas.worker.handler.report_event")
    @patch("lambdas.worker.handler.send_failure_to_webhook")
    @patch("lambdas.worker.handler.gemini")
    @patch("lambdas.worker.handler.table")
    def test_failure_caches_error_and_sends_failure_webhook(self, mock_table, mock_gemini,
                                                             mock_fail_webhook, mock_report):
        mock_gemini.analyze_text.side_effect = Exception("AI error")

        event = self._make_sqs_event(self._base_message(source_type="web", text="some text"))

        with pytest.raises(Exception, match="AI error"):
            lambda_handler(event, None)

        put_call = mock_table.put_item.call_args
        assert put_call.kwargs["Item"]["status"] == "failed"
        mock_fail_webhook.assert_called_once()

    def test_invalid_message_raises(self):
        event = {"Records": [{"body": json.dumps({"bad": "data"})}]}
        with pytest.raises(Exception):
            lambda_handler(event, None)
