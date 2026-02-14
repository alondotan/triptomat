import json
import os

import yt_dlp
from dotenv import load_dotenv

from core.config import load_config
from core.geocoding import enrich_analysis_data, extract_coords_from_url
from core.prompt import build_main_prompt
from core.url_helpers import get_safe_filename, is_google_maps_url, is_video_url
from services.gemini import GeminiService
from services.google_maps import MapsService
from services.scraper import (
    download_video,
    extract_text_from_url,
    get_final_maps_url,
    get_web_metadata,
)
from services.webhook import send_to_webhook

# --- Setup ---
load_dotenv()

GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
MAP_GOOGLE_API_KEY = os.environ["MAP_GOOGLE_API_KEY"]

gemini = GeminiService(GOOGLE_API_KEY)
maps = MapsService(MAP_GOOGLE_API_KEY)

try:
    ALLOWED_TYPES, GEO_ONLY_TYPES = load_config()
    print(f"Loaded {len(ALLOWED_TYPES)} types from config.")
except Exception as e:
    print(f"Error loading config: {e}")
    exit(1)

main_prompt = build_main_prompt(ALLOWED_TYPES, GEO_ONLY_TYPES)


def process_source(url):
    print(f"Processing: {url}")
    file_base_name = get_safe_filename(url)
    response_json = None
    manual_lat, manual_lng = None, None
    source_metadata = {"title": "", "image": ""}

    if is_video_url(url):
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            source_metadata["title"] = info.get('title', '')
            source_metadata["image"] = info.get('thumbnail', '')

        video_path = download_video(url, file_base_name)
        response_text = gemini.analyze_video(video_path, main_prompt)
        response_json = json.loads(response_text)

    elif is_google_maps_url(url):
        final_url = get_final_maps_url(url)
        manual_lat, manual_lng = extract_coords_from_url(final_url)

        if manual_lat and manual_lng:
            actual_address = maps.get_address_from_coords(manual_lat, manual_lng)
            source_metadata["title"] = f"Location: {actual_address}"
            prompt = f"Identify this place. URL: {final_url}\nAddress: {actual_address}\n\n{main_prompt}"
        else:
            prompt = f"Identify this place from the URL: {final_url}\n\n{main_prompt}"

        response_text = gemini.analyze_text(prompt)
        response_json = json.loads(response_text)

        if response_json.get("recommendations"):
            place_name = response_json["recommendations"][0].get("name", "Google Maps Location")
            source_metadata["title"] = place_name
            if manual_lat and manual_lng:
                source_metadata["image"] = maps.get_google_maps_image(manual_lat, manual_lng, place_name)

    else:
        text = extract_text_from_url(url)
        source_metadata = get_web_metadata(url)
        if text:
            prompt = f"Analyze this text and extract locations:\n{text[:5000]}\n\n{main_prompt}"
            response_text = gemini.analyze_text(prompt)
            response_json = json.loads(response_text)

    if response_json:
        enriched_data = enrich_analysis_data(
            response_json, maps.get_location_details, manual_lat, manual_lng
        )
        send_to_webhook(enriched_data, url, source_metadata)


if __name__ == "__main__":
    url_list = [
        "https://maps.app.goo.gl/GNgkyQUXx3nMbjiG8",
        "https://maps.app.goo.gl/BbKgCQy5ru8SBkkAA",
        "https://maps.app.goo.gl/zyoKw4ErbHjEm1Lb8",
        "https://maps.app.goo.gl/prRRdfzrHvnJKf4E6",
        "https://maps.app.goo.gl/9YZSL6iEko8nfEni7",
        "https://maps.app.goo.gl/WHFBQ55AMuCGso6y5",
        "https://maps.app.goo.gl/n11aZaMueJ8zYVWc6",
        "https://maps.app.goo.gl/JXZYuv9cEQvpSFLz7",
        "https://maps.app.goo.gl/c45m8ezLUbPWier27",
        "https://maps.app.goo.gl/Xp9ydKyAAneiHRNFA",
        "https://maps.app.goo.gl/mQvpLgZCKk5cLqAv7",
        "https://maps.app.goo.gl/QxxDixG493dE9QW5A",
        "https://maps.app.goo.gl/C2Nu3AQQU5WKmM3c6",
        "https://maps.app.goo.gl/moBGn9e8o8RVxjNN6",
        "https://maps.app.goo.gl/uynC8rmDjXeYvTN49",
        "https://maps.app.goo.gl/LrAF9okDW56QnSxV8",
        "https://maps.app.goo.gl/9jo8fCactFMhAuCi7",
        "https://maps.app.goo.gl/EiDhMassET5oEcEA7"
    ]

    for url in url_list:
        try:
            process_source(url)
        except Exception as e:
            print(f"Error: {e}")
