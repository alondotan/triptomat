import hashlib
import os
import time
import yt_dlp
from google import genai
import json
from slugify import slugify
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import re
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

# --- הגדרות ומפתחות ---
load_dotenv()
GOOGLE_API_KEY = os.environ["GOOGLE_API_KEY"]
MAP_GOOGLE_API_KEY = os.environ["MAP_GOOGLE_API_KEY"]
client = genai.Client(api_key=GOOGLE_API_KEY)


def load_config(config_path="config.json"):
    """טוען את רשימת הטיפוסים והקטגוריות מקובץ ה-JSON החיצוני."""
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Missing configuration file: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)
    master_list = config_data.get("master_list", [])
    allowed_types = [item["type"] for item in master_list]
    geo_types = [item["type"] for item in master_list if item.get("is_geo_location")]
    return allowed_types, geo_types


try:
    ALLOWED_TYPES, GEO_ONLY_TYPES = load_config()
    print(f"Loaded {len(ALLOWED_TYPES)} types from config.")
except Exception as e:
    print(f"Error loading config: {e}")
    exit(1)

# --- פרומפט מעודכן לפי הסכמה הסופית ---
main_prompt = f"""
Extract the recommendations from the input you got.
Your output must be a RFC8259 compliant JSON object with the following structure:

{{
      "sites_hierarchy": [
                    {{
                        "site": "Country Name",
                        "site_type": "country",
                        "sub_sites": [
                            {{
                                "site": "City/State Name/Region",
                                "site_type": "city",
                                "sub_sites": []
                            }}
                        ]
                    }}
        ],
    "recommendations": [
        {{
            "name": "Name of the specific place or attraction",
            "category": "Must be one of the allowed types listed below",
            "sentiment": "good | bad",
            "paragraph": "The exact quote or sentence from the video describing this place",
            "site": "The location/neighborhood/city from the sitesList",
            "location_type": "specific | general",
            "location": {{
                "address": "string",
                "coordinates": {{
                    "lat": 0,
                    "lng": 0
                }}
            }}
        }}
    ]
}}

### Rules:
1. Category must be strictly from: {", ".join(ALLOWED_TYPES)}.
2. The sites_hierarchy (Nested Structure):
 2.1 Construct a nested geographical tree under the key "sites_hierarchy".
 2.2 The first level must be the country or countries that in the mail.
 2.3 Each node must be an object: {{"site": "Name", "site_type": "Type", "sub_sites": []}}.
 2.4 Use "sub_sites" only if child locations exist.
 2.5 The sites_hierarchy must represent a geographical hierarchy and must be strictly from: {GEO_ONLY_TYPES}
 2.6 The hierarchy MUST follow a logical path:  Country -> State/Region -> City -> Neighborhood/POI.
 2.7 The sites_hierarchy should only contain the sites of the recommendations.
 2.8 All values in the sites_hierarchy must be the english names.

3. Location Handling:
 3.1 Identify if the recommendation is "specific" (a concrete business, hotel, restaurant, or landmark) or "general" (e.g., "beaches", "nightlife", "atmosphere", "shopping areas" in general).
 3.2 Set "location_type" accordingly.
 3.3 IF "location_type" is "general", leave the "location" object with null or empty strings.
 3.4 IF "location_type" is "specific", fill the "location" object ONLY if the information is explicitly provided or clearly inferred.
 3.5 Put coordinates and address only if unknown.
4. The recommendations
 4.1 The data in the paragraph should be in the origen language
5. Only provide the JSON object. No prose or explanations.
6. Perform a JSON integrity check before responding.
"""


# --- פונקציות Geocoding והעשרה ---

def get_site_hierarchy_string(site_name, sites_list):
    """בונה שרשרת הורים עבור אתר מסוים (למשל: יפו, תל אביב, ישראל)."""
    path = []
    current = site_name
    visited = set()  # למניעת לולאות אינסופיות

    while current and current not in visited:
        visited.add(current)
        path.append(current)
        # מחפש את האובייקט של האתר הנוכחי כדי למצוא את ההורה שלו
        parent = next((s.get('parent_site') for s in sites_list if s.get('site') == current), None)
        current = parent

    return ", ".join(path)


def get_location_details(search_query):
    """משלים כתובת ונ"צ בעזרת שאילתה מלאה (שם המקום + היררכיה)."""
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={search_query}&key={MAP_GOOGLE_API_KEY}"

    try:
        response = requests.get(url, timeout=10).json()

        if response['status'] == 'OK':
            result = response['results'][0]
            return {
                "address": result.get("formatted_address", ""),
                "coordinates": {
                    "lat": result["geometry"]["location"]["lat"],
                    "lng": result["geometry"]["location"]["lng"]
                }
            }
    except Exception as e:
        print(f"Geocoding API error: {e}")

    return {"address": "", "coordinates": {"lat": 0, "lng": 0}}


def enrich_analysis_data(json_obj, manual_lat=None, manual_lng=None):
    """סורק המלצות ומשלים מידע גיאוגרפי בעזרת היררכיית האתרים."""
    items = json_obj.get("recommendations", [])
    sites_list = json_obj.get("sites_list", [])

    for idx, item in enumerate(items):
        # 1. טיפול ידני (מלינק של Google Maps)
        if idx == 0 and manual_lat and manual_lng:
            item["location"]["coordinates"]["lat"] = manual_lat
            item["location"]["coordinates"]["lng"] = manual_lng
            continue

        # 2. השלמה אוטומטית לפי היררכיה
        if item["location_type"] == "specific":
            hierarchy = get_site_hierarchy_string(item.get("site"), sites_list)
            full_query = f"{item['name']}, {hierarchy}".strip(", ")

            # parts = [p.strip() for p in hierarchy.split(",") if p.strip()]
            # hierarchy_without_last = ", ".join(parts[:-1])
            # print(hierarchy_without_last)
            print(f"🔍 Geocoding search: '{full_query}'")  # לוג לבקשתך

            enriched = get_location_details(full_query)
            item["location"] = enriched

    return json_obj


# --- פונקציות שמירה וניהול ---

def save_to_json(analysis_data, original_url, source_metadata):
    try:
        final_entry = {
            "input_type": "recommendation",
            "recommendation_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source_url": original_url,
            "source_title": source_metadata.get("title", ""),
            "source_image": source_metadata.get("image", ""),
            "analysis": analysis_data
        }

        print(json.dumps(final_entry, indent=4))
        # שליחה ל-Webhook כפי שכתבת
        # url = "https://vpkbytgemzxkxtcxacwm.supabase.co/functions/v1/recommendation-webhook"
        webhook_url = "https://vpkbytgemzxkxtcxacwm.supabase.co/functions/v1/recommendation-webhook?token=e080318fdc7b7a4becd37c33fe3bf4f135fff8f1ccf9b225fb5a2cfe27154edf"
        requests.post(webhook_url, json=final_entry, headers={"Content-Type": "application/json"}, timeout=10)

        return True
    except Exception as e:
        print(f"❌ Save error: {e}")
        return False


def get_google_maps_image(lat, lng, name):
    """מוצא תמונה של מקום בעזרת Places API (New)."""
    # שלב א': חיפוש המקום (Text Search)
    search_url = "https://places.googleapis.com/v1/places:searchText"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAP_GOOGLE_API_KEY,
        # אנחנו מבקשים רק את ה-photo resources כדי לחסוך בעלויות
        "X-Goog-FieldMask": "places.photos,places.id"
    }

    payload = {
        "textQuery": name,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 500.0
            }
        }
    }

    try:
        response = requests.post(search_url, json=payload, headers=headers, timeout=10).json()
        print(response)
        if 'places' in response and len(response['places']) > 0:
            place = response['places'][0]
            if 'photos' in place and len(place['photos']) > 0:
                # בגרסה החדשה, ה-Photo Name הוא המזהה לצורך שליפת התמונה
                photo_name = place['photos'][0]['name']

                # שלב ב': בניית ה-URL לקבלת התמונה האמיתית
                # photo_name נראה בערך ככה: places/PLACE_ID/photos/PHOTO_ID
                return f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=800&maxWidthPx=800&key={MAP_GOOGLE_API_KEY}"

    except Exception as e:
        print(f"Error with Places API (New): {e}")

    return ""

def extract_text_from_url(url):
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        for s in soup(["script", "style", "nav", "footer", "header"]): s.decompose()
        return ' '.join(soup.get_text().split())
    except:
        return None


def is_video_url(url):
    return any(d in url for d in ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com'])


def get_safe_filename(url):
    return hashlib.md5(url.encode()).hexdigest()[:10]


def download_video(url, fileName):
    ydl_opts = {'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]', 'outtmpl': fileName + '.mp4',
                'quiet': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([url])
    return fileName + ".mp4"


def analyze_with_gemini(file_path):
    video_file = client.files.upload(file=file_path)
    while video_file.state.name == "PROCESSING":
        time.sleep(2)
        video_file = client.files.get(name=video_file.name)

    response = client.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=[video_file, main_prompt],
        config={'response_mime_type': 'application/json'}
    )
    return response.text


def get_web_metadata(url):
    """מחלץ כותרת ותמונה ראשית מאתר (Open Graph)."""
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')

        # חילוץ כותרת (OG או תג title רגיל)
        og_title = soup.find("meta", property="og:title")
        title = og_title["content"] if og_title else (soup.find("title").get_text() if soup.find("title") else "")

        # חילוץ תמונה (OG Image)
        og_image = soup.find("meta", property="og:image")
        image = og_image["content"] if og_image else ""

        return {"title": title.strip(), "image": image}
    except Exception as e:
        print(f"Metadata extraction error: {e}")
        return {"title": "", "image": ""}

def is_google_maps_url(url):
    return any(d in url for d in ['goo.gl/maps', 'google.com/maps', 'googleusercontent.com','maps.app.goo.gl'])


def get_final_maps_url(url):
    try:
        return requests.get(url, allow_redirects=True, timeout=10).url
    except:
        return url


def extract_coords_from_url(url):
    reg = r'@([-?\d\.]+),([-?\d\.]+)'
    match = re.search(reg, url)
    if match: return float(match.group(1)), float(match.group(2))
    return None, None


def get_address_from_coords(lat, lng):
    """מבצע Reverse Geocoding כדי לקבל כתובת מדויקת מנ"צ."""
    url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={MAP_GOOGLE_API_KEY}&language=he"  # אפשר לשנות ל-en

    try:
        response = requests.get(url, timeout=10).json()
        if response['status'] == 'OK':
            # התוצאה הראשונה היא בדרך כלל הכתובת הכי מפורטת
            return response['results'][0].get("formatted_address", "")
    except Exception as e:
        print(f"Reverse Geocoding error: {e}")

    return ""

def process_source(url):
    print(f"Processing: {url}")
    file_base_name = get_safe_filename(url)
    response_json = None
    manual_lat, manual_lng = None, None
    source_metadata = {"title": "", "image": ""}  # אובייקט לאיסוף הנתונים

    if is_video_url(url):

        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            source_metadata["title"] = info.get('title', '')
            source_metadata["image"] = info.get('thumbnail', '')

        video_path = download_video(url, file_base_name)
        response_text = analyze_with_gemini(video_path)
        response_json = json.loads(response_text)
    elif is_google_maps_url(url):
        final_url = get_final_maps_url(url)
        manual_lat, manual_lng = extract_coords_from_url(final_url)

        if manual_lat and manual_lng:
            # חילוץ הכתובת האמיתית מגוגל
            actual_address = get_address_from_coords(manual_lat, manual_lng)
            source_metadata["title"] = f"Location: {actual_address}"

            # עדכון ה-Prompt ל-Gemini כדי שידע את הכתובת מראש
            prompt = f"Identify this place. URL: {final_url}\nAddress: {actual_address}\n\n{main_prompt}"
        else:
            prompt = f"Identify this place from the URL: {final_url}\n\n{main_prompt}"

        response = client.models.generate_content(model="models/gemini-2.0-flash", contents=[prompt],
                                                  config={'response_mime_type': 'application/json'})
        response_json = json.loads(response.text)

        if response_json.get("recommendations"):
            place_name = response_json["recommendations"][0].get("name", "Google Maps Location")
            source_metadata["title"] = place_name
            print("aaaa")
            if manual_lat and manual_lng:
                source_metadata["image"] = get_google_maps_image(manual_lat, manual_lng, place_name)
                print("aaaa")
                print(source_metadata["image"])

    else:
        text = extract_text_from_url(url)
        source_metadata = get_web_metadata(url)
        if text:
            prompt = f"Analyze this text and extract locations:\n{text[:5000]}\n\n{main_prompt}"
            response = client.models.generate_content(model="models/gemini-2.0-flash", contents=[prompt],
                                                      config={'response_mime_type': 'application/json'})
            response_json = json.loads(response.text)

    if response_json:
        # העשרה חכמה: היררכיית אתרים + Geocoding
        enriched_data = enrich_analysis_data(response_json, manual_lat, manual_lng)
        save_to_json(enriched_data, url, source_metadata)


# --- הרצה ---
if __name__ == "__main__":
    # url = "https://maps.app.goo.gl/CKWA7k9WMNiPJ7GE6"
    # url = "https://www.lametayel.co.il/posts/l09ojr"
    # url = "https://www.lametayel.co.il/articles/971qx1"
    # url = "https://www.youtube.com/watch?v=fQIAyC7EKMA"


    # url = "https://www.instagram.com/p/BvGngpzlBXr/"
    #
    url_list = [
        # "https://www.youtube.com/watch?v=fQIAyC7EKMA"

        # "https://www.lametayel.co.il/posts/l09ojr"
        # "https://maps.app.goo.gl/EomrEtkvPJmmtj3g9",
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

# url = "https://www.tiktok.com/@barandshany/video/7465596320376458503"
# url = "https://www.instagram.com/p/BvGngpzlBXr/"
# url = "https://www.lametayel.co.il/posts/l09ojr"
# url = "https://www.lametayel.co.il/posts/1xn2n8"
# url = "https://www.facebook.com/groups/738155287007508/posts/1822213161935043/"
# url = "https://maps.app.goo.gl/dsw7T8VBduKDmtV9A"
# url = "https://maps.app.goo.gl/LgHADSL3asWaaZ8w9"


