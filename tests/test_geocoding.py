from core.geocoding import enrich_analysis_data, extract_coords_from_url, get_site_hierarchy_string


class TestGetSiteHierarchyString:
    def test_single_site_no_parent(self):
        sites = [{"site": "Israel"}]
        assert get_site_hierarchy_string("Israel", sites) == "Israel"

    def test_two_level_hierarchy(self):
        sites = [
            {"site": "Israel"},
            {"site": "Tel Aviv", "parent_site": "Israel"},
        ]
        result = get_site_hierarchy_string("Tel Aviv", sites)
        assert result == "Tel Aviv, Israel"

    def test_three_level_hierarchy(self):
        sites = [
            {"site": "Israel"},
            {"site": "Tel Aviv", "parent_site": "Israel"},
            {"site": "Jaffa", "parent_site": "Tel Aviv"},
        ]
        result = get_site_hierarchy_string("Jaffa", sites)
        assert result == "Jaffa, Tel Aviv, Israel"

    def test_unknown_site(self):
        sites = [{"site": "Israel"}]
        assert get_site_hierarchy_string("Unknown", sites) == "Unknown"

    def test_none_site(self):
        sites = [{"site": "Israel"}]
        assert get_site_hierarchy_string(None, sites) == ""

    def test_circular_reference(self):
        sites = [
            {"site": "A", "parent_site": "B"},
            {"site": "B", "parent_site": "A"},
        ]
        result = get_site_hierarchy_string("A", sites)
        assert "A" in result
        assert "B" in result


class TestExtractCoordsFromUrl:
    def test_valid_coords(self):
        url = "https://www.google.com/maps/place/@32.0853,34.7818,15z"
        lat, lng = extract_coords_from_url(url)
        assert lat == 32.0853
        assert lng == 34.7818

    def test_negative_coords(self):
        url = "https://www.google.com/maps/@-33.8688,151.2093,12z"
        lat, lng = extract_coords_from_url(url)
        assert lat == -33.8688
        assert lng == 151.2093

    def test_no_coords(self):
        url = "https://www.google.com/maps/place/SomePlace"
        lat, lng = extract_coords_from_url(url)
        assert lat is None
        assert lng is None

    def test_non_maps_url(self):
        url = "https://example.com"
        lat, lng = extract_coords_from_url(url)
        assert lat is None
        assert lng is None


class TestEnrichAnalysisData:
    def _fake_geocode(self, query):
        return {
            "address": f"Geocoded: {query}",
            "coordinates": {"lat": 1.0, "lng": 2.0}
        }

    def test_enriches_specific_location(self):
        data = {
            "recommendations": [
                {
                    "name": "Cafe Xoho",
                    "site": "Tel Aviv",
                    "location_type": "specific",
                    "location": {"address": "", "coordinates": {"lat": 0, "lng": 0}},
                }
            ],
            "sites_list": [
                {"site": "Israel"},
                {"site": "Tel Aviv", "parent_site": "Israel"},
            ],
        }
        result = enrich_analysis_data(data, self._fake_geocode)
        loc = result["recommendations"][0]["location"]
        assert loc["coordinates"]["lat"] == 1.0
        assert "Cafe Xoho" in loc["address"]

    def test_manual_coords_first_item(self):
        data = {
            "recommendations": [
                {
                    "name": "Place",
                    "site": "City",
                    "location_type": "specific",
                    "location": {"address": "", "coordinates": {"lat": 0, "lng": 0}},
                }
            ],
            "sites_list": [],
        }
        result = enrich_analysis_data(data, self._fake_geocode, manual_lat=10.0, manual_lng=20.0)
        coords = result["recommendations"][0]["location"]["coordinates"]
        assert coords["lat"] == 10.0
        assert coords["lng"] == 20.0

    def test_skips_general_location(self):
        data = {
            "recommendations": [
                {
                    "name": "Beaches",
                    "site": "Tel Aviv",
                    "location_type": "general",
                    "location": {"address": "", "coordinates": {"lat": 0, "lng": 0}},
                }
            ],
            "sites_list": [],
        }
        result = enrich_analysis_data(data, self._fake_geocode)
        assert result["recommendations"][0]["location"]["coordinates"]["lat"] == 0
