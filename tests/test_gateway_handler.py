"""Tests for lambdas/gateway/handler.py."""

import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from core.http_utils import resolve_cors_origin as _resolve_cors_origin, DecimalEncoder as _DecimalEncoder
from lambdas.gateway.handler import (
    _response,
    lambda_handler,
    ALLOWED_ORIGINS,
)


class TestResolveCorSOrigin:
    """Tests for _resolve_cors_origin()."""

    def test_returns_matching_origin(self):
        origin = next(iter(ALLOWED_ORIGINS))
        event = {"headers": {"Origin": origin}}
        assert _resolve_cors_origin(event) == origin

    def test_returns_default_for_unknown_origin(self):
        event = {"headers": {"Origin": "https://evil.com"}}
        result = _resolve_cors_origin(event)
        assert result != "https://evil.com"

    def test_handles_missing_headers(self):
        event = {}
        result = _resolve_cors_origin(event)
        assert isinstance(result, str)

    def test_handles_lowercase_origin_header(self):
        origin = next(iter(ALLOWED_ORIGINS))
        event = {"headers": {"origin": origin}}
        assert _resolve_cors_origin(event) == origin


class TestDecimalEncoder:
    """Tests for _DecimalEncoder."""

    def test_converts_decimal_to_float(self):
        result = json.dumps({"value": Decimal("3.14")}, cls=_DecimalEncoder)
        assert '"value": 3.14' in result

    def test_passes_through_regular_types(self):
        result = json.dumps({"str": "hello", "int": 42}, cls=_DecimalEncoder)
        data = json.loads(result)
        assert data["str"] == "hello"
        assert data["int"] == 42


class TestResponse:
    """Tests for _response()."""

    def test_includes_cors_headers(self):
        resp = _response(200, {"ok": True})
        assert "Access-Control-Allow-Origin" in resp["headers"]
        assert resp["headers"]["Content-Type"] == "application/json"
        assert resp["headers"]["Access-Control-Allow-Methods"] == "POST,OPTIONS"

    def test_serializes_body_as_json(self):
        resp = _response(200, {"key": "value"})
        body = json.loads(resp["body"])
        assert body["key"] == "value"

    def test_sets_status_code(self):
        assert _response(404, {})["statusCode"] == 404


class TestGatewayLambdaHandler:
    """Tests for lambda_handler()."""

    def _make_event(self, body=None, method="POST", origin="http://localhost:5173"):
        event = {
            "httpMethod": method,
            "path": "/",
            "headers": {"Origin": origin},
            "requestContext": {"identity": {"sourceIp": "127.0.0.1"}},
        }
        if body is not None:
            event["body"] = json.dumps(body) if isinstance(body, dict) else body
        else:
            event["body"] = ""
        return event

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    def test_options_returns_200(self, mock_rl, mock_report):
        event = self._make_event(method="OPTIONS")
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    def test_invalid_json_returns_400(self, mock_rl, mock_report):
        event = self._make_event()
        event["body"] = "not json {"
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400
        assert "Invalid JSON" in json.loads(result["body"])["error"]

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    def test_missing_url_and_text_returns_400(self, mock_rl, mock_report):
        event = self._make_event(body={})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    def test_body_too_large_returns_413(self, mock_rl, mock_report):
        event = self._make_event()
        event["body"] = "x" * 1_000_001
        result = lambda_handler(event, None)
        assert result["statusCode"] == 413

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    @patch("lambdas.gateway.handler.sqs")
    def test_text_paste_returns_202(self, mock_sqs, mock_rl, mock_report):
        event = self._make_event(body={"text": "Check out this amazing restaurant in Tokyo"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 202
        body = json.loads(result["body"])
        assert body["status"] == "processing"
        assert "job_id" in body
        mock_sqs.send_message.assert_called_once()

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    def test_invalid_url_scheme_returns_400(self, mock_rl, mock_report):
        event = self._make_event(body={"url": "ftp://example.com/file"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 400
        assert "scheme" in json.loads(result["body"])["error"].lower()

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    @patch("lambdas.gateway.handler.table")
    def test_cache_hit_returns_200(self, mock_table, mock_rl, mock_report):
        mock_table.get_item.return_value = {
            "Item": {
                "url": "https://example.com",
                "status": "completed",
                "result": {"recommendations": []},
                "source_metadata": {"title": "Test"},
            }
        }
        event = self._make_event(body={"url": "https://example.com"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "completed"

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(False, 31))
    def test_rate_limit_returns_429(self, mock_rl, mock_report):
        event = self._make_event(body={"url": "https://example.com"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 429

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    @patch("lambdas.gateway.handler.table")
    @patch("lambdas.gateway.handler.sqs")
    @patch("lambdas.gateway.handler.is_video_url", return_value=True)
    @patch("lambdas.gateway.handler.get_web_metadata", return_value={"title": "Video", "image": ""})
    def test_video_url_dispatches_to_download_queue(self, mock_meta, mock_is_video,
                                                     mock_sqs, mock_table, mock_rl, mock_report):
        mock_table.get_item.return_value = {}
        event = self._make_event(body={"url": "https://www.youtube.com/watch?v=abc"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 202
        mock_sqs.send_message.assert_called_once()

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    @patch("lambdas.gateway.handler.table")
    @patch("lambdas.gateway.handler.sqs")
    @patch("lambdas.gateway.handler.is_video_url", return_value=False)
    @patch("lambdas.gateway.handler.is_google_maps_url", return_value=False)
    @patch("lambdas.gateway.handler.extract_text_from_url", return_value="Page content")
    @patch("lambdas.gateway.handler.get_web_metadata", return_value={"title": "Page", "image": ""})
    def test_web_url_dispatches_to_analysis_queue(self, mock_meta, mock_text,
                                                   mock_is_maps, mock_is_video,
                                                   mock_sqs, mock_table, mock_rl, mock_report):
        mock_table.get_item.return_value = {}
        event = self._make_event(body={"url": "https://example.com/article"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 202
        body = json.loads(mock_sqs.send_message.call_args.kwargs["MessageBody"])
        assert body["source_type"] == "web"

    @patch("lambdas.gateway.handler.report_event")
    @patch("lambdas.gateway.handler._check_rate_limit", return_value=(True, 1))
    @patch("lambdas.gateway.handler.table")
    @patch("lambdas.gateway.handler.sqs")
    @patch("lambdas.gateway.handler.is_video_url", return_value=False)
    @patch("lambdas.gateway.handler.is_google_maps_url", return_value=True)
    @patch("lambdas.gateway.handler.get_final_maps_url", return_value="https://www.google.com/maps/place/...")
    @patch("lambdas.gateway.handler.extract_coords_from_url", return_value=(35.6762, 139.6503))
    @patch("lambdas.gateway.handler.maps")
    def test_maps_url_dispatches_to_analysis_queue(self, mock_maps_svc, mock_coords,
                                                    mock_final_url, mock_is_maps,
                                                    mock_is_video, mock_sqs, mock_table,
                                                    mock_rl, mock_report):
        mock_table.get_item.return_value = {}
        mock_maps_svc.get_address_from_coords.return_value = "Tokyo, Japan"
        event = self._make_event(body={"url": "https://maps.app.goo.gl/abc123"})
        result = lambda_handler(event, None)
        assert result["statusCode"] == 202
