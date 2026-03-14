"""Tests for core/supabase_client.py."""

import json
from unittest.mock import patch, MagicMock
import urllib.error

from core.supabase_client import (
    _supabase_get,
    get_user_id_from_token,
    get_active_trips,
    get_trip_entities,
    fetch_trip_context,
)

BASE_URL = "https://test.supabase.co"
KEY = "test-service-key"


class TestSupabaseGet:
    """Tests for _supabase_get()."""

    @patch("core.supabase_client.urllib.request.urlopen")
    def test_successful_get(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_resp.read.return_value = json.dumps([{"id": "1"}]).encode()
        mock_urlopen.return_value = mock_resp

        result = _supabase_get(BASE_URL, KEY, "/rest/v1/test?select=*")
        assert result == [{"id": "1"}]

    @patch("core.supabase_client.urllib.request.urlopen")
    def test_http_error_returns_none(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            "url", 404, "Not Found", {}, MagicMock(read=MagicMock(return_value=b""))
        )
        result = _supabase_get(BASE_URL, KEY, "/rest/v1/test")
        assert result is None

    @patch("core.supabase_client.urllib.request.urlopen")
    def test_generic_error_returns_none(self, mock_urlopen):
        mock_urlopen.side_effect = Exception("connection error")
        result = _supabase_get(BASE_URL, KEY, "/rest/v1/test")
        assert result is None


class TestGetUserIdFromToken:
    """Tests for get_user_id_from_token()."""

    @patch("core.supabase_client._supabase_get")
    def test_returns_user_id_when_found(self, mock_get):
        mock_get.return_value = [{"user_id": "user-123"}]
        result = get_user_id_from_token("tok-1", BASE_URL, KEY)
        assert result == "user-123"

    @patch("core.supabase_client._supabase_get")
    def test_returns_none_for_empty_list(self, mock_get):
        mock_get.return_value = []
        assert get_user_id_from_token("tok-1", BASE_URL, KEY) is None

    @patch("core.supabase_client._supabase_get")
    def test_returns_none_when_api_returns_none(self, mock_get):
        mock_get.return_value = None
        assert get_user_id_from_token("tok-1", BASE_URL, KEY) is None


class TestGetActiveTrips:
    """Tests for get_active_trips()."""

    @patch("core.supabase_client._supabase_get")
    def test_returns_flattened_trips(self, mock_get):
        mock_get.return_value = [
            {"trip_id": "t1", "trips": {"id": "t1", "name": "Japan Trip", "countries": ["Japan"]}},
            {"trip_id": "t2", "trips": {"id": "t2", "name": "Italy Trip", "countries": ["Italy"]}},
        ]
        result = get_active_trips("user-1", BASE_URL, KEY)
        assert len(result) == 2
        assert result[0]["name"] == "Japan Trip"

    @patch("core.supabase_client._supabase_get")
    def test_returns_empty_for_non_list(self, mock_get):
        mock_get.return_value = None
        assert get_active_trips("user-1", BASE_URL, KEY) == []

    @patch("core.supabase_client._supabase_get")
    def test_skips_rows_without_trips(self, mock_get):
        mock_get.return_value = [
            {"trip_id": "t1", "trips": None},
            {"trip_id": "t2", "trips": {"id": "t2", "name": "Trip"}},
        ]
        result = get_active_trips("user-1", BASE_URL, KEY)
        assert len(result) == 1


class TestGetTripEntities:
    """Tests for get_trip_entities()."""

    @patch("core.supabase_client._supabase_get")
    def test_returns_all_entity_types(self, mock_get):
        mock_get.side_effect = [
            [{"id": "p1", "name": "Museum"}],  # pois
            [{"id": "tr1", "category": "train"}],  # transport
            [{"id": "c1", "name": "John"}],  # contacts
        ]
        result = get_trip_entities("trip-1", BASE_URL, KEY)
        assert len(result["existing_pois"]) == 1
        assert len(result["existing_transport"]) == 1
        assert len(result["existing_contacts"]) == 1

    @patch("core.supabase_client._supabase_get")
    def test_handles_none_responses(self, mock_get):
        mock_get.return_value = None
        result = get_trip_entities("trip-1", BASE_URL, KEY)
        assert result["existing_pois"] == []
        assert result["existing_transport"] == []
        assert result["existing_contacts"] == []


class TestFetchTripContext:
    """Tests for fetch_trip_context()."""

    @patch("core.supabase_client.get_trip_entities")
    @patch("core.supabase_client.get_active_trips")
    @patch("core.supabase_client.get_user_id_from_token")
    def test_full_flow(self, mock_user, mock_trips, mock_entities):
        mock_user.return_value = "user-1"
        mock_trips.return_value = [
            {"id": "t1", "name": "Japan", "countries": ["Japan"], "start_date": "2024-04-01", "end_date": "2024-04-10"},
        ]
        mock_entities.return_value = {
            "existing_pois": [], "existing_transport": [], "existing_contacts": [],
        }

        result = fetch_trip_context("tok-1", BASE_URL, KEY)
        assert result is not None
        assert result["trip_id"] == "t1"
        assert result["countries"] == ["Japan"]

    @patch("core.supabase_client.get_user_id_from_token", return_value=None)
    def test_no_user_returns_none(self, mock_user):
        assert fetch_trip_context("tok-1", BASE_URL, KEY) is None

    @patch("core.supabase_client.get_active_trips", return_value=[])
    @patch("core.supabase_client.get_user_id_from_token", return_value="user-1")
    def test_no_trips_returns_none(self, mock_user, mock_trips):
        assert fetch_trip_context("tok-1", BASE_URL, KEY) is None

    @patch("core.supabase_client.get_trip_entities")
    @patch("core.supabase_client.get_active_trips")
    @patch("core.supabase_client.get_user_id_from_token")
    def test_hint_countries_selects_matching_trip(self, mock_user, mock_trips, mock_entities):
        mock_user.return_value = "user-1"
        mock_trips.return_value = [
            {"id": "t1", "name": "Japan", "countries": ["Japan"], "start_date": "2024-04-01", "end_date": "2024-04-10"},
            {"id": "t2", "name": "Italy", "countries": ["Italy"], "start_date": "2024-05-01", "end_date": "2024-05-10"},
        ]
        mock_entities.return_value = {
            "existing_pois": [], "existing_transport": [], "existing_contacts": [],
        }

        result = fetch_trip_context("tok-1", BASE_URL, KEY, hint_countries=["Italy"])
        assert result["trip_id"] == "t2"
