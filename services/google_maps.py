import requests


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
