from core.url_helpers import get_safe_filename, is_google_maps_url, is_video_url


class TestIsVideoUrl:
    def test_youtube(self):
        assert is_video_url("https://www.youtube.com/watch?v=abc123")

    def test_youtu_be(self):
        assert is_video_url("https://youtu.be/abc123")

    def test_tiktok(self):
        assert is_video_url("https://www.tiktok.com/@user/video/123")

    def test_instagram(self):
        assert is_video_url("https://www.instagram.com/p/abc123/")

    def test_regular_website(self):
        assert not is_video_url("https://www.example.com/article")

    def test_google_maps(self):
        assert not is_video_url("https://maps.app.goo.gl/abc123")


class TestIsGoogleMapsUrl:
    def test_maps_app_short_link(self):
        assert is_google_maps_url("https://maps.app.goo.gl/abc123")

    def test_goo_gl_maps(self):
        assert is_google_maps_url("https://goo.gl/maps/abc123")

    def test_google_com_maps(self):
        assert is_google_maps_url("https://www.google.com/maps/place/abc")

    def test_regular_website(self):
        assert not is_google_maps_url("https://www.example.com")

    def test_youtube(self):
        assert not is_google_maps_url("https://www.youtube.com/watch?v=abc")


class TestGetSafeFilename:
    def test_returns_10_chars(self):
        result = get_safe_filename("https://example.com")
        assert len(result) == 10

    def test_deterministic(self):
        url = "https://example.com/page"
        assert get_safe_filename(url) == get_safe_filename(url)

    def test_different_urls_different_names(self):
        assert get_safe_filename("https://a.com") != get_safe_filename("https://b.com")

    def test_alphanumeric(self):
        result = get_safe_filename("https://example.com")
        assert result.isalnum()
