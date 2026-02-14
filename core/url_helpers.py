import hashlib


def is_video_url(url):
    """Checks if a URL is from a known video platform."""
    return any(d in url for d in ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com'])


def is_google_maps_url(url):
    """Checks if a URL is a Google Maps link."""
    return any(d in url for d in ['goo.gl/maps', 'google.com/maps', 'googleusercontent.com', 'maps.app.goo.gl'])


def get_safe_filename(url):
    """Generates a safe filename from a URL using MD5 hash."""
    return hashlib.md5(url.encode()).hexdigest()[:10]
