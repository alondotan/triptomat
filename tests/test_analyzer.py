"""Tests for core/analyzer.py — GeminiService for AI video/text analysis."""

from unittest.mock import MagicMock, patch, call

from core.analyzer import GeminiService


class TestGeminiServiceInit:
    @patch("core.analyzer.genai.Client")
    def test_creates_client_with_api_key(self, mock_client_class):
        svc = GeminiService(api_key="test-api-key")
        mock_client_class.assert_called_once_with(api_key="test-api-key")
        assert svc.client == mock_client_class.return_value


class TestAnalyzeVideo:
    @patch("core.analyzer.time.sleep")
    @patch("core.analyzer.genai.Client")
    def test_upload_poll_and_generate(self, mock_client_class, mock_sleep):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        # File starts as PROCESSING, then becomes ACTIVE
        uploaded_file = MagicMock()
        uploaded_file.state.name = "PROCESSING"
        uploaded_file.name = "files/abc123"
        mock_client.files.upload.return_value = uploaded_file

        active_file = MagicMock()
        active_file.state.name = "ACTIVE"
        active_file.name = "files/abc123"
        mock_client.files.get.return_value = active_file

        mock_response = MagicMock()
        mock_response.text = '{"recommendations": []}'
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        result = svc.analyze_video("/tmp/video.mp4", "Analyze this")

        assert result == '{"recommendations": []}'
        mock_client.files.upload.assert_called_once_with(file="/tmp/video.mp4")
        mock_client.files.get.assert_called_with(name="files/abc123")
        mock_sleep.assert_called_with(2)

    @patch("core.analyzer.time.sleep")
    @patch("core.analyzer.genai.Client")
    def test_no_polling_when_already_active(self, mock_client_class, mock_sleep):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        uploaded_file = MagicMock()
        uploaded_file.state.name = "ACTIVE"
        mock_client.files.upload.return_value = uploaded_file

        mock_response = MagicMock()
        mock_response.text = "{}"
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        svc.analyze_video("/tmp/video.mp4", "prompt")

        mock_sleep.assert_not_called()
        mock_client.files.get.assert_not_called()

    @patch("core.analyzer.time.sleep")
    @patch("core.analyzer.genai.Client")
    def test_uses_gemini_2_5_flash_model(self, mock_client_class, mock_sleep):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        uploaded_file = MagicMock()
        uploaded_file.state.name = "ACTIVE"
        mock_client.files.upload.return_value = uploaded_file

        mock_response = MagicMock()
        mock_response.text = "{}"
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        svc.analyze_video("/tmp/video.mp4", "prompt")

        call_kwargs = mock_client.models.generate_content.call_args
        assert call_kwargs.kwargs["model"] == "models/gemini-2.5-flash"
        assert call_kwargs.kwargs["config"]["response_mime_type"] == "application/json"

    @patch("core.analyzer.time.sleep")
    @patch("core.analyzer.genai.Client")
    def test_passes_file_and_prompt_as_contents(self, mock_client_class, mock_sleep):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        uploaded_file = MagicMock()
        uploaded_file.state.name = "ACTIVE"
        mock_client.files.upload.return_value = uploaded_file

        mock_response = MagicMock()
        mock_response.text = "{}"
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        svc.analyze_video("/tmp/video.mp4", "my prompt")

        call_kwargs = mock_client.models.generate_content.call_args
        contents = call_kwargs.kwargs["contents"]
        assert contents == [uploaded_file, "my prompt"]


class TestAnalyzeText:
    @patch("core.analyzer.genai.Client")
    def test_generates_content_and_returns_text(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = '{"name": "Place A"}'
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        result = svc.analyze_text("Analyze this text")
        assert result == '{"name": "Place A"}'

    @patch("core.analyzer.genai.Client")
    def test_uses_gemini_2_0_flash_model(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = "{}"
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        svc.analyze_text("prompt")

        call_kwargs = mock_client.models.generate_content.call_args
        assert call_kwargs.kwargs["model"] == "models/gemini-2.0-flash"
        assert call_kwargs.kwargs["config"]["response_mime_type"] == "application/json"

    @patch("core.analyzer.genai.Client")
    def test_passes_prompt_only_as_contents(self, mock_client_class):
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        mock_response = MagicMock()
        mock_response.text = "{}"
        mock_client.models.generate_content.return_value = mock_response

        svc = GeminiService(api_key="key")
        svc.analyze_text("my prompt")

        call_kwargs = mock_client.models.generate_content.call_args
        assert call_kwargs.kwargs["contents"] == ["my prompt"]
