"""Tests for core/scrapers.py — web scraping, video download, and Google Maps API."""

from unittest.mock import MagicMock, patch, call

from core.scrapers import (
    extract_text_from_url,
    get_web_metadata,
    get_final_maps_url,
    download_video,
    MapsService,
)


# ── extract_text_from_url ─────────────────────────────────


class TestExtractTextFromUrl:
    @patch("core.scrapers.requests.get")
    def test_returns_cleaned_text(self, mock_get):
        mock_get.return_value.text = """
        <html>
          <head><script>var x=1;</script><style>.a{}</style></head>
          <body>
            <nav>Menu</nav>
            <header>Header</header>
            <main><p>Hello   World</p></main>
            <footer>Footer</footer>
          </body>
        </html>
        """
        result = extract_text_from_url("https://example.com")
        assert result is not None
        assert "Hello" in result
        assert "World" in result
        # Script, style, nav, footer, header content should be removed
        assert "var x" not in result
        assert "Menu" not in result
        assert "Footer" not in result

    @patch("core.scrapers.requests.get")
    def test_normalizes_whitespace(self, mock_get):
        mock_get.return_value.text = "<html><body><p>  lots   of   spaces  </p></body></html>"
        result = extract_text_from_url("https://example.com")
        assert "  " not in result  # no double spaces

    @patch("core.scrapers.requests.get", side_effect=Exception("timeout"))
    def test_returns_none_on_exception(self, mock_get):
        result = extract_text_from_url("https://example.com")
        assert result is None

    @patch("core.scrapers.requests.get")
    def test_sets_user_agent_and_timeout(self, mock_get):
        mock_get.return_value.text = "<html><body>text</body></html>"
        extract_text_from_url("https://example.com")
        mock_get.assert_called_once_with(
            "https://example.com",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=10,
        )


# ── get_web_metadata ──────────────────────────────────────


class TestGetWebMetadata:
    @patch("core.scrapers.requests.get")
    def test_extracts_og_tags(self, mock_get):
        mock_get.return_value.text = """
        <html><head>
          <meta property="og:title" content="My Title" />
          <meta property="og:image" content="https://img.com/photo.jpg" />
        </head></html>
        """
        result = get_web_metadata("https://example.com")
        assert result["title"] == "My Title"
        assert result["image"] == "https://img.com/photo.jpg"

    @patch("core.scrapers.requests.get")
    def test_falls_back_to_title_tag(self, mock_get):
        mock_get.return_value.text = "<html><head><title>Fallback Title</title></head></html>"
        result = get_web_metadata("https://example.com")
        assert result["title"] == "Fallback Title"
        assert result["image"] == ""

    @patch("core.scrapers.requests.get")
    def test_missing_all_tags(self, mock_get):
        mock_get.return_value.text = "<html><head></head></html>"
        result = get_web_metadata("https://example.com")
        assert result["title"] == ""
        assert result["image"] == ""

    @patch("core.scrapers.requests.get", side_effect=Exception("network error"))
    def test_returns_empty_on_exception(self, mock_get):
        result = get_web_metadata("https://example.com")
        assert result == {"title": "", "image": ""}

    @patch("core.scrapers.requests.get")
    def test_strips_whitespace_from_title(self, mock_get):
        mock_get.return_value.text = '<html><head><meta property="og:title" content="  Spaced Title  " /></head></html>'
        result = get_web_metadata("https://example.com")
        assert result["title"] == "Spaced Title"


# ── get_final_maps_url ────────────────────────────────────


class TestGetFinalMapsUrl:
    @patch("core.scrapers.requests.get")
    def test_returns_final_url_after_redirect(self, mock_get):
        mock_get.return_value.url = "https://www.google.com/maps/place/Amsterdam"
        result = get_final_maps_url("https://maps.app.goo.gl/abc123")
        assert result == "https://www.google.com/maps/place/Amsterdam"
        mock_get.assert_called_once_with(
            "https://maps.app.goo.gl/abc123", allow_redirects=True, timeout=10
        )

    @patch("core.scrapers.requests.get", side_effect=Exception("timeout"))
    def test_returns_original_url_on_exception(self, mock_get):
        result = get_final_maps_url("https://maps.app.goo.gl/abc123")
        assert result == "https://maps.app.goo.gl/abc123"


# ── download_video ────────────────────────────────────────


class TestDownloadVideo:
    @patch.dict("sys.modules", {"yt_dlp": MagicMock()})
    def test_returns_output_path(self):
        import sys
        mock_yt_dlp = sys.modules["yt_dlp"]
        mock_ydl = MagicMock()
        mock_yt_dlp.YoutubeDL.return_value.__enter__ = MagicMock(return_value=mock_ydl)
        mock_yt_dlp.YoutubeDL.return_value.__exit__ = MagicMock(return_value=False)

        result = download_video("https://youtube.com/watch?v=abc", "test_video")
        assert result == "/tmp/test_video.mp4"
        mock_ydl.download.assert_called_once_with(["https://youtube.com/watch?v=abc"])

    @patch.dict("sys.modules", {"yt_dlp": MagicMock()})
    def test_ydl_options_format(self):
        import sys
        mock_yt_dlp = sys.modules["yt_dlp"]
        mock_ydl = MagicMock()
        mock_yt_dlp.YoutubeDL.return_value.__enter__ = MagicMock(return_value=mock_ydl)
        mock_yt_dlp.YoutubeDL.return_value.__exit__ = MagicMock(return_value=False)

        download_video("https://example.com/video", "my_vid")
        opts = mock_yt_dlp.YoutubeDL.call_args[0][0]
        assert "mp4" in opts["format"]
        assert opts["outtmpl"] == "/tmp/my_vid.mp4"
        assert opts["quiet"] is True


# ── MapsService ───────────────────────────────────────────


class TestMapsServiceGetLocationDetails:
    def setup_method(self):
        self.svc = MapsService(api_key="test-key")

    @patch("core.scrapers.requests.get")
    def test_returns_address_and_coordinates(self, mock_get):
        mock_get.return_value.json.return_value = {
            "status": "OK",
            "results": [
                {
                    "formatted_address": "Dam Square, Amsterdam",
                    "geometry": {"location": {"lat": 52.373, "lng": 4.893}},
                }
            ],
        }
        result = self.svc.get_location_details("Dam Square Amsterdam")
        assert result["address"] == "Dam Square, Amsterdam"
        assert result["coordinates"]["lat"] == 52.373
        assert result["coordinates"]["lng"] == 4.893

    @patch("core.scrapers.requests.get")
    def test_returns_fallback_on_non_ok_status(self, mock_get):
        mock_get.return_value.json.return_value = {"status": "ZERO_RESULTS", "results": []}
        result = self.svc.get_location_details("nonexistent place")
        assert result == {"address": "", "coordinates": {"lat": 0, "lng": 0}}

    @patch("core.scrapers.requests.get", side_effect=Exception("API error"))
    def test_returns_fallback_on_exception(self, mock_get):
        result = self.svc.get_location_details("any query")
        assert result == {"address": "", "coordinates": {"lat": 0, "lng": 0}}

    @patch("core.scrapers.requests.get")
    def test_api_key_in_url(self, mock_get):
        mock_get.return_value.json.return_value = {"status": "ZERO_RESULTS", "results": []}
        self.svc.get_location_details("test")
        url_called = mock_get.call_args[0][0]
        assert "key=test-key" in url_called


class TestMapsServiceGetAddressFromCoords:
    def setup_method(self):
        self.svc = MapsService(api_key="test-key")

    @patch("core.scrapers.requests.get")
    def test_returns_formatted_address(self, mock_get):
        mock_get.return_value.json.return_value = {
            "status": "OK",
            "results": [{"formatted_address": "Prinsengracht 263, Amsterdam"}],
        }
        result = self.svc.get_address_from_coords(52.375, 4.884)
        assert result == "Prinsengracht 263, Amsterdam"

    @patch("core.scrapers.requests.get")
    def test_uses_hebrew_language(self, mock_get):
        mock_get.return_value.json.return_value = {"status": "OK", "results": [{"formatted_address": "addr"}]}
        self.svc.get_address_from_coords(52.0, 4.0)
        url_called = mock_get.call_args[0][0]
        assert "language=he" in url_called

    @patch("core.scrapers.requests.get", side_effect=Exception("error"))
    def test_returns_empty_on_exception(self, mock_get):
        assert self.svc.get_address_from_coords(0, 0) == ""

    @patch("core.scrapers.requests.get")
    def test_returns_empty_on_non_ok_status(self, mock_get):
        mock_get.return_value.json.return_value = {"status": "ZERO_RESULTS", "results": []}
        assert self.svc.get_address_from_coords(0, 0) == ""


class TestMapsServiceGetGoogleMapsImage:
    def setup_method(self):
        self.svc = MapsService(api_key="test-key")

    @patch("core.scrapers.requests.post")
    def test_returns_photo_url(self, mock_post):
        mock_post.return_value.json.return_value = {
            "places": [
                {
                    "id": "place1",
                    "photos": [{"name": "places/place1/photos/photo123"}],
                }
            ]
        }
        result = self.svc.get_google_maps_image(52.373, 4.893, "Anne Frank House")
        assert "places/place1/photos/photo123" in result
        assert "key=test-key" in result
        assert "maxHeightPx=800" in result

    @patch("core.scrapers.requests.post")
    def test_returns_empty_when_no_places(self, mock_post):
        mock_post.return_value.json.return_value = {"places": []}
        assert self.svc.get_google_maps_image(0, 0, "test") == ""

    @patch("core.scrapers.requests.post")
    def test_returns_empty_when_no_photos(self, mock_post):
        mock_post.return_value.json.return_value = {
            "places": [{"id": "place1", "photos": []}]
        }
        assert self.svc.get_google_maps_image(0, 0, "test") == ""

    @patch("core.scrapers.requests.post", side_effect=Exception("API error"))
    def test_returns_empty_on_exception(self, mock_post):
        assert self.svc.get_google_maps_image(0, 0, "test") == ""

    @patch("core.scrapers.requests.post")
    def test_sends_location_bias(self, mock_post):
        mock_post.return_value.json.return_value = {"places": []}
        self.svc.get_google_maps_image(52.373, 4.893, "test")
        payload = mock_post.call_args.kwargs["json"]
        circle = payload["locationBias"]["circle"]
        assert circle["center"]["latitude"] == 52.373
        assert circle["center"]["longitude"] == 4.893
        assert circle["radius"] == 500.0
