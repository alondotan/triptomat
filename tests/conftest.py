"""Shared pytest fixtures and module-level mocks for Lambda handler tests.

Lambda handlers have module-level code that initializes AWS clients, AI services,
etc. These fail in the test environment (no API keys, missing packages).
We mock the problematic modules in sys.modules before any handler is imported.
"""

import sys
from unittest.mock import MagicMock

# ── Mock boto3 (not installed in CI) ──────────────────────────────────────
if "boto3" not in sys.modules:
    mock_boto3 = MagicMock()
    sys.modules["boto3"] = mock_boto3
    sys.modules["botocore"] = MagicMock()
    _mock_botocore_exc = MagicMock()
    _mock_botocore_exc.ClientError = type("ClientError", (Exception,), {})
    sys.modules["botocore.exceptions"] = _mock_botocore_exc

# ── Mock youtube_transcript_api (not installed locally) ────────────────────
if "youtube_transcript_api" not in sys.modules:
    mock_yt_transcript = MagicMock()
    sys.modules["youtube_transcript_api"] = mock_yt_transcript

# ── Mock yt_dlp.utils for DownloadError ────────────────────────────────────
if "yt_dlp" not in sys.modules:
    mock_yt_dlp = MagicMock()
    mock_yt_dlp.utils.DownloadError = type("DownloadError", (Exception,), {})
    sys.modules["yt_dlp"] = mock_yt_dlp
    sys.modules["yt_dlp.utils"] = mock_yt_dlp.utils

# ── Patch genai.Client so GeminiService can be instantiated without API key ─
# The worker handler does `gemini = GeminiService(GOOGLE_API_KEY)` at module level.
# We temporarily replace genai.Client with a no-op so this import succeeds.
# After all modules are imported, we restore the original so test_analyzer.py works.
_real_genai_client = None
try:
    from google import genai as _genai_module
    _real_genai_client = _genai_module.Client

    class _NoOpGenaiClient:
        """Stand-in that accepts empty api_key without raising ValueError."""
        def __init__(self, **kwargs):
            pass
        def __getattr__(self, name):
            return MagicMock()

    _genai_module.Client = _NoOpGenaiClient
except ImportError:
    pass


def pytest_configure(config):
    """Restore genai.Client after all imports are resolved."""
    # Force-import the lambda handlers now (while Client is mocked)
    try:
        import lambdas.worker.handler  # noqa: F401
    except Exception:
        pass
    try:
        import lambdas.gateway.handler  # noqa: F401
    except Exception:
        pass
    try:
        import lambdas.downloader.handler  # noqa: F401
    except Exception:
        pass
    try:
        import lambdas.mail_handler.handler  # noqa: F401
    except Exception:
        pass

    # Now restore the real genai.Client for test_analyzer.py
    if _real_genai_client is not None:
        try:
            from google import genai as _genai_module
            _genai_module.Client = _real_genai_client
        except Exception:
            pass
