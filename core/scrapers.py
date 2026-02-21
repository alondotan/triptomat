import requests


def extract_text_from_url(url):
    """Extracts visible text content from a web page."""
    from bs4 import BeautifulSoup

    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        for s in soup(["script", "style", "nav", "footer", "header"]):
            s.decompose()
        return ' '.join(soup.get_text().split())
    except Exception:
        return None


def get_web_metadata(url):
    """Extracts title and main image from a website (Open Graph)."""
    from bs4 import BeautifulSoup

    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')

        og_title = soup.find("meta", property="og:title")
        title = og_title["content"] if og_title else (soup.find("title").get_text() if soup.find("title") else "")

        og_image = soup.find("meta", property="og:image")
        image = og_image["content"] if og_image else ""

        return {"title": title.strip(), "image": image}
    except Exception as e:
        print(f"Metadata extraction error: {e}")
        return {"title": "", "image": ""}


def get_final_maps_url(url):
    """Follows redirects to get the final Google Maps URL."""
    try:
        return requests.get(url, allow_redirects=True, timeout=10).url
    except Exception:
        return url


def download_video(url, file_name):
    """Downloads a video using yt-dlp to /tmp (Lambda-compatible)."""
    import yt_dlp

    output_path = f"/tmp/{file_name}.mp4"
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        'outtmpl': output_path,
        'quiet': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return output_path


class MapsService:
    def __init__(self, api_key):
        self.api_key = api_key

    def get_location_details(self, search_query):
        """Geocodes a search query to get address and coordinates."""
        url = f"https://maps.googleapis.com/maps/api/geocode/json?address={search_query}&key={self.api_key}"

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

    def get_address_from_coords(self, lat, lng):
        """Reverse geocodes coordinates to get a formatted address."""
        url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={self.api_key}&language=he"

        try:
            response = requests.get(url, timeout=10).json()
            if response['status'] == 'OK':
                return response['results'][0].get("formatted_address", "")
        except Exception as e:
            print(f"Reverse Geocoding error: {e}")

        return ""

    def get_google_maps_image(self, lat, lng, name):
        """Finds a place photo using Google Places API (New)."""
        search_url = "https://places.googleapis.com/v1/places:searchText"

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
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
            if 'places' in response and len(response['places']) > 0:
                place = response['places'][0]
                if 'photos' in place and len(place['photos']) > 0:
                    photo_name = place['photos'][0]['name']
                    return f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=800&maxWidthPx=800&key={self.api_key}"
        except Exception as e:
            print(f"Error with Places API (New): {e}")

        return ""
