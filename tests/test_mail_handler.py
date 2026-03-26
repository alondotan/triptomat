"""Tests for lambdas/mail_handler/handler.py."""

import json
from unittest.mock import MagicMock, patch
from email.message import EmailMessage

import pytest

from lambdas.mail_handler.handler import (
    _mask_email,
    _get_plain_text,
    _extract_forwarded_headers,
    clean_html_for_ai,
    lambda_handler,
)


class TestMaskEmail:
    """Tests for _mask_email()."""

    def test_masks_normal_email(self):
        assert _mask_email("alice@example.com") == "a***@example.com"

    def test_masks_single_char_local(self):
        assert _mask_email("a@example.com") == "a***@example.com"

    def test_invalid_email_returns_stars(self):
        assert _mask_email("nope") == "***"


class TestGetPlainText:
    """Tests for _get_plain_text()."""

    def test_single_part_plain(self):
        msg = EmailMessage()
        msg.set_content("Hello plain text")
        result = _get_plain_text(msg)
        assert "Hello plain text" in result

    def test_multipart_with_plain(self):
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email import message_from_string
        from email.policy import default as default_policy

        msg = MIMEMultipart()
        msg.attach(MIMEText("plain body", "plain"))
        msg.attach(MIMEText("<p>html body</p>", "html"))
        parsed = message_from_string(msg.as_string(), policy=default_policy)
        result = _get_plain_text(parsed)
        assert "plain body" in result


class TestExtractForwardedHeaders:
    """Tests for _extract_forwarded_headers()."""

    def test_parses_gmail_forward(self):
        text = """Some text above

---------- Forwarded message ---------
From: sender@example.com
Date: Mon, 1 Jan 2024
Subject: Trip to Tokyo
To: me@example.com

Body here"""
        headers = _extract_forwarded_headers(text)
        assert headers["from"] == "sender@example.com"
        assert headers["subject"] == "Trip to Tokyo"
        assert headers["date"] == "Mon, 1 Jan 2024"
        assert headers["to"] == "me@example.com"

    def test_no_forward_block_returns_empty(self):
        assert _extract_forwarded_headers("Just some text") == {}

    def test_handles_unicode_marks(self):
        text = """---------- Forwarded message ---------
\u202aFrom: test@test.com
\u200eSubject: Hotel booking

Body"""
        headers = _extract_forwarded_headers(text)
        assert headers["from"] == "test@test.com"
        assert headers["subject"] == "Hotel booking"


class TestCleanHtmlForAi:
    """Tests for clean_html_for_ai()."""

    def test_removes_head(self):
        html = "<html><head><title>Test</title></head><body>Content</body></html>"
        result = clean_html_for_ai(html)
        assert "<head>" not in result
        assert "Content" in result

    def test_removes_style(self):
        html = "<style>.cls { color: red; }</style><p>Hello</p>"
        result = clean_html_for_ai(html)
        assert "<style>" not in result
        assert "Hello" in result

    def test_removes_script(self):
        html = "<script>alert('x')</script><p>Safe</p>"
        result = clean_html_for_ai(html)
        assert "<script>" not in result
        assert "Safe" in result

    def test_truncates_to_15000(self):
        html = "x" * 20000
        result = clean_html_for_ai(html)
        assert len(result) <= 15000

    def test_empty_input(self):
        assert clean_html_for_ai("") == ""
        assert clean_html_for_ai(None) == ""

    def test_collapses_whitespace(self):
        html = "<p>Hello    \n\n    World</p>"
        result = clean_html_for_ai(html)
        assert "  " not in result


class TestMailLambdaHandler:
    """Tests for lambda_handler()."""

    def _make_s3_event(self, bucket="triptomat-raw-emails", key="emails/test.eml"):
        return {
            "Records": [{
                "s3": {
                    "bucket": {"name": bucket},
                    "object": {"key": key},
                }
            }]
        }

    @patch("lambdas.mail_handler.handler.report_event")
    @patch("lambdas.mail_handler.handler.get_webhook_token_for_email", return_value=None)
    @patch("lambdas.mail_handler.handler.s3_client")
    def test_no_token_returns_200_skipped(self, mock_s3, mock_get_token, mock_report):
        email_content = "From: unknown@example.com\r\nSubject: Test\r\nContent-Type: text/plain\r\n\r\nHello"
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=MagicMock(return_value=email_content.encode()))
        }

        result = lambda_handler(self._make_s3_event(), None)
        assert result["statusCode"] == 200
        assert "skipped" in result["body"].lower() or "No user" in result["body"]

    @patch("lambdas.mail_handler.handler.WEBHOOK_URL", "https://hook.example.com")
    @patch("lambdas.mail_handler.handler.report_event")
    @patch("lambdas.mail_handler.handler.reconcile", side_effect=lambda d, *a, **kw: d)
    @patch("lambdas.mail_handler.handler.send_to_webhook")
    @patch("lambdas.mail_handler.handler.call_gemini")
    @patch("lambdas.mail_handler.handler.get_webhook_token_for_email", return_value="tok-1")
    @patch("lambdas.mail_handler.handler.s3_client")
    def test_success_processes_and_sends_webhook(self, mock_s3, mock_get_token,
                                                  mock_gemini, mock_send_wh,
                                                  mock_reconcile, mock_report):
        email_content = (
            "From: user@example.com\r\n"
            "Subject: Hotel Booking\r\n"
            "Date: Mon, 1 Jan 2024 10:00:00 +0000\r\n"
            "Message-ID: <abc@mail.com>\r\n"
            "Content-Type: text/html\r\n\r\n"
            "<html><body>Your hotel booking is confirmed</body></html>"
        )
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=MagicMock(return_value=email_content.encode()))
        }
        mock_gemini.return_value = {
            "metadata": {"category": "accommodation", "sub_category": "hotel", "action": "create"},
            "sites_hierarchy": [],
        }

        result = lambda_handler(self._make_s3_event(), None)
        assert result["statusCode"] == 200
        mock_send_wh.assert_called_once()
        payload = mock_send_wh.call_args[0][0]
        assert "source_email_info" in payload
        assert payload["source_email_info"]["subject"] == "Hotel Booking"

    @patch("lambdas.mail_handler.handler.report_event")
    @patch("lambdas.mail_handler.handler.s3_client")
    def test_error_raises(self, mock_s3, mock_report):
        mock_s3.get_object.side_effect = Exception("S3 read failed")

        with pytest.raises(Exception, match="S3 read failed"):
            lambda_handler(self._make_s3_event(), None)
