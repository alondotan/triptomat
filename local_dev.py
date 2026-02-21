"""Local development script - runs the full synchronous pipeline."""
import json
import os
import sys

import yt_dlp
from dotenv import load_dotenv

from core.analyzer import GeminiService
from core.config import load_config
from core.geocoding import enrich_analysis_data, extract_coords_from_url
from core.prompts import build_main_prompt
from core.scrapers import (
    MapsService,
    download_video,
    extract_text_from_url,
    get_final_maps_url,
    get_web_metadata,
)
from core.url_helpers import get_safe_filename, is_google_maps_url, is_video_url
from core.webhook import send_to_webhook

load_dotenv()

GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
MAP_GOOGLE_API_KEY = os.environ["MAP_GOOGLE_API_KEY"]

gemini = GeminiService(GOOGLE_API_KEY)
maps = MapsService(MAP_GOOGLE_API_KEY)

ALLOWED_TYPES, GEO_ONLY_TYPES = load_config()
print(f"Loaded {len(ALLOWED_TYPES)} types from config.")
main_prompt = build_main_prompt(ALLOWED_TYPES, GEO_ONLY_TYPES)


def process_source(url):
    """Process a URL and return (enriched_data, source_metadata) or None."""
    print(f"Processing: {url}")
    file_base_name = get_safe_filename(url)
    response_json = None
    manual_lat, manual_lng = None, None
    source_metadata = {"title": "", "image": ""}

    if is_video_url(url):
        with yt_dlp.YoutubeDL({"quiet": True}) as ydl:
            info = ydl.extract_info(url, download=False)
            source_metadata["title"] = info.get("title", "")
            source_metadata["image"] = info.get("thumbnail", "")

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
        return enriched_data, source_metadata

    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python local_dev.py <url> [url2] [url3] ...")
        sys.exit(1)

    for url in sys.argv[1:]:
        try:
            process_source(url)
        except Exception as e:
            print(f"Error processing {url}: {e}")
