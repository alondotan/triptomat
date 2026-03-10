"""Tests for core/reconciliation.py and core/supabase_client.py."""

import json
from unittest.mock import patch, MagicMock

from core.reconciliation import (
    _detect_format,
    _extract_countries_from_hierarchy,
    _build_worker_prompt,
    _build_mail_handler_prompt,
    _merge_worker_result,
    _merge_mail_handler_result,
    reconcile,
)
from core.supabase_client import (
    get_user_id_from_token,
    get_active_trips,
    fetch_trip_context,
)


# ── Format detection ──────────────────────────────────────────────


class TestDetectFormat:
    def test_worker_format(self):
        assert _detect_format({"recommendations": [], "contacts": []}) == "worker"

    def test_mail_handler_format(self):
        assert _detect_format({"metadata": {"category": "accommodation"}}) == "mail_handler"

    def test_unknown_format(self):
        assert _detect_format({"something": "else"}) == "unknown"

    def test_worker_takes_precedence_if_both(self):
        """If both keys present, worker format wins (recommendations checked first)."""
        assert _detect_format({"recommendations": [], "metadata": {}}) == "worker"


# ── Country extraction ────────────────────────────────────────────


class TestExtractCountries:
    def test_single_country(self):
        data = {"sites_hierarchy": [
            {"site": "Netherlands", "site_type": "country", "sub_sites": []}
        ]}
        assert _extract_countries_from_hierarchy(data) == ["Netherlands"]

    def test_multiple_countries(self):
        data = {"sites_hierarchy": [
            {"site": "Netherlands", "site_type": "country", "sub_sites": []},
            {"site": "Belgium", "site_type": "country", "sub_sites": []},
        ]}
        assert _extract_countries_from_hierarchy(data) == ["Netherlands", "Belgium"]

    def test_nested_hierarchy(self):
        data = {"sites_hierarchy": [
            {"site": "Netherlands", "site_type": "country", "sub_sites": [
                {"site": "Amsterdam", "site_type": "city", "sub_sites": []}
            ]}
        ]}
        assert _extract_countries_from_hierarchy(data) == ["Netherlands"]

    def test_empty_hierarchy(self):
        assert _extract_countries_from_hierarchy({}) == []
        assert _extract_countries_from_hierarchy({"sites_hierarchy": []}) == []


# ── Merge functions ───────────────────────────────────────────────


class TestMergeWorkerResult:
    def test_replaces_recommendations_and_contacts(self):
        original = {
            "sites_hierarchy": [{"site": "NL"}],
            "recommendations": [{"name": "Old"}],
            "contacts": [{"name": "Old Contact"}],
        }
        reconciled = {
            "recommendations": [{"name": "Old", "is_outside_trip": False}],
            "contacts": [{"name": "Old Contact"}],
        }
        result = _merge_worker_result(original, reconciled)
        assert result["recommendations"] == reconciled["recommendations"]
        assert result["contacts"] == reconciled["contacts"]
        assert result["sites_hierarchy"] == [{"site": "NL"}]

    def test_internal_dedup_reduces_count(self):
        """AI merges internal duplicates, so reconciled has fewer items."""
        original = {
            "recommendations": [{"name": "A"}, {"name": "A (copy)"}],
            "contacts": [],
        }
        reconciled = {
            "recommendations": [{"name": "A", "merged_from": ["A", "A (copy)"]}],
            "contacts": [],
        }
        result = _merge_worker_result(original, reconciled)
        assert len(result["recommendations"]) == 1

    def test_outside_trip_removed(self):
        """Items flagged as outside trip area are removed."""
        original = {
            "recommendations": [
                {"name": "A", "site": "Amsterdam"},
                {"name": "B", "site": "Paris"},
            ],
            "contacts": [],
        }
        reconciled = {
            "recommendations": [
                {"name": "A", "site": "Amsterdam", "is_outside_trip": False},
                {"name": "B", "site": "Paris", "is_outside_trip": True},
            ],
            "contacts": [],
        }
        result = _merge_worker_result(original, reconciled)
        assert len(result["recommendations"]) == 1
        assert result["recommendations"][0]["name"] == "A"

    def test_missing_keys_preserved(self):
        original = {"recommendations": [{"name": "A"}], "contacts": []}
        reconciled = {"recommendations": [{"name": "A"}]}
        result = _merge_worker_result(original, reconciled)
        assert result["contacts"] == []


class TestMergeMailHandlerResult:
    def test_adds_reconciliation_field(self):
        original = {
            "metadata": {"category": "accommodation"},
            "accommodation_details": {"establishment_name": "Hotel X"},
        }
        reconciled = {
            "reconciliation": {
                "is_duplicate": False,
                "existing_match": None,
                "is_outside_trip": False,
                "normalized_name": "Hotel X",
            }
        }
        result = _merge_mail_handler_result(original, reconciled)
        assert result["reconciliation"]["is_duplicate"] is False

    def test_normalizes_accommodation_name(self):
        original = {
            "metadata": {"category": "accommodation"},
            "accommodation_details": {"establishment_name": "Hotel Xxx"},
        }
        reconciled = {
            "reconciliation": {
                "is_duplicate": True,
                "existing_match": "Hotel X",
                "is_outside_trip": False,
                "normalized_name": "Hotel X",
            }
        }
        result = _merge_mail_handler_result(original, reconciled)
        assert result["accommodation_details"]["establishment_name"] == "Hotel X"

    def test_normalizes_eatery_name(self):
        original = {
            "metadata": {"category": "eatery"},
            "eatery_details": {"establishment_name": "Cafe Y"},
        }
        reconciled = {
            "reconciliation": {
                "normalized_name": "Café Y",
            }
        }
        result = _merge_mail_handler_result(original, reconciled)
        assert result["eatery_details"]["establishment_name"] == "Café Y"

    def test_normalizes_attraction_name(self):
        original = {
            "metadata": {"category": "attraction"},
            "attraction_details": {"attraction_name": "Anne Franks House"},
        }
        reconciled = {
            "reconciliation": {
                "normalized_name": "Anne Frank House",
            }
        }
        result = _merge_mail_handler_result(original, reconciled)
        assert result["attraction_details"]["attraction_name"] == "Anne Frank House"


# ── Reconcile (main function) ────────────────────────────────────


class TestReconcile:
    WORKER_DATA = {
        "sites_hierarchy": [
            {"site": "Netherlands", "site_type": "country", "sub_sites": []}
        ],
        "recommendations": [{"name": "Rijksmuseum", "category": "museum"}],
        "contacts": [],
    }

    def test_skips_without_token(self):
        result = reconcile(self.WORKER_DATA.copy(), "", "api-key", "url", "key")
        assert result == self.WORKER_DATA

    def test_skips_without_supabase_url(self):
        result = reconcile(self.WORKER_DATA.copy(), "tok", "api-key", "", "key")
        assert result == self.WORKER_DATA

    def test_skips_without_google_key(self):
        result = reconcile(self.WORKER_DATA.copy(), "tok", "", "url", "key")
        assert result == self.WORKER_DATA

    def test_skips_unknown_format(self):
        result = reconcile({"weird": True}, "tok", "key", "url", "skey")
        assert result == {"weird": True}

    @patch("core.reconciliation.fetch_trip_context", return_value=None)
    def test_skips_when_no_trip_found(self, _mock):
        result = reconcile(self.WORKER_DATA.copy(), "tok", "key", "url", "skey")
        assert "recommendations" in result

    @patch("core.reconciliation._call_gemini_reconciliation", return_value=None)
    @patch("core.reconciliation.fetch_trip_context", return_value={
        "trip_id": "t1", "countries": ["Netherlands"],
        "start_date": "2026-04-01", "end_date": "2026-04-10",
        "existing_pois": [{"name": "Anne Frank House", "category": "attraction"}],
        "existing_transport": [], "existing_contacts": [],
    })
    def test_falls_back_on_ai_failure(self, _ctx, _ai):
        result = reconcile(self.WORKER_DATA.copy(), "tok", "key", "url", "skey")
        # Original data unchanged
        assert result["recommendations"][0]["name"] == "Rijksmuseum"

    @patch("core.reconciliation._call_gemini_reconciliation")
    @patch("core.reconciliation.fetch_trip_context", return_value={
        "trip_id": "t1", "countries": ["Netherlands"],
        "start_date": "2026-04-01", "end_date": "2026-04-10",
        "existing_pois": [{"name": "Rijksmuseum", "category": "museum"}],
        "existing_transport": [], "existing_contacts": [],
    })
    def test_successful_name_normalization(self, _ctx, mock_ai):
        """Name normalized to match existing POI exactly."""
        mock_ai.return_value = {
            "recommendations": [
                {"name": "Rijksmuseum", "category": "museum",
                 "is_outside_trip": False}
            ],
            "contacts": [],
        }
        data = {
            "sites_hierarchy": [{"site": "Netherlands", "site_type": "country", "sub_sites": []}],
            "recommendations": [{"name": "Rijksmuseum Amsterdam", "category": "museum"}],
            "contacts": [],
        }
        result = reconcile(data, "tok", "key", "url", "skey")
        assert result["recommendations"][0]["name"] == "Rijksmuseum"

    @patch("core.reconciliation._call_gemini_reconciliation", side_effect=Exception("boom"))
    @patch("core.reconciliation.fetch_trip_context", return_value={
        "trip_id": "t1", "countries": ["Netherlands"],
        "start_date": None, "end_date": None,
        "existing_pois": [], "existing_transport": [], "existing_contacts": [],
    })
    def test_exception_returns_original(self, _ctx, _ai):
        """Even if an exception is raised, original data is returned."""
        result = reconcile(self.WORKER_DATA.copy(), "tok", "key", "url", "skey")
        assert result["recommendations"][0]["name"] == "Rijksmuseum"

    @patch("core.reconciliation.fetch_trip_context", return_value={
        "trip_id": "t1", "countries": [],
        "start_date": None, "end_date": None,
        "existing_pois": [], "existing_transport": [], "existing_contacts": [],
    })
    def test_skips_empty_trip(self, _ctx):
        """If trip has no entities and no countries, skip reconciliation."""
        result = reconcile(self.WORKER_DATA.copy(), "tok", "key", "url", "skey")
        assert result["recommendations"][0]["name"] == "Rijksmuseum"


# ── Supabase client ───────────────────────────────────────────────


class TestSupabaseClient:
    @patch("core.supabase_client._supabase_get", return_value=[{"user_id": "u123"}])
    def test_get_user_id_from_token(self, _mock):
        assert get_user_id_from_token("tok", "url", "key") == "u123"

    @patch("core.supabase_client._supabase_get", return_value=[])
    def test_get_user_id_returns_none_for_empty(self, _mock):
        assert get_user_id_from_token("tok", "url", "key") is None

    @patch("core.supabase_client._supabase_get", return_value=None)
    def test_get_user_id_returns_none_on_error(self, _mock):
        assert get_user_id_from_token("tok", "url", "key") is None

    @patch("core.supabase_client._supabase_get", return_value=[
        {"trip_id": "t1", "trips": {"id": "t1", "name": "Trip NL", "countries": ["Netherlands"],
         "start_date": "2026-04-01", "end_date": "2026-04-10", "status": "planning"}},
    ])
    def test_get_active_trips(self, _mock):
        trips = get_active_trips("u123", "url", "key")
        assert len(trips) == 1
        assert trips[0]["id"] == "t1"

    @patch("core.supabase_client.get_trip_entities", return_value={
        "existing_pois": [], "existing_transport": [], "existing_contacts": [],
    })
    @patch("core.supabase_client.get_active_trips", return_value=[
        {"id": "t1", "countries": ["Netherlands"], "start_date": None, "end_date": None},
        {"id": "t2", "countries": ["France"], "start_date": None, "end_date": None},
    ])
    @patch("core.supabase_client.get_user_id_from_token", return_value="u1")
    def test_fetch_trip_context_prefers_country_match(self, _uid, _trips, _ent):
        result = fetch_trip_context("tok", "url", "key", hint_countries=["France"])
        assert result["trip_id"] == "t2"

    @patch("core.supabase_client.get_trip_entities", return_value={
        "existing_pois": [], "existing_transport": [], "existing_contacts": [],
    })
    @patch("core.supabase_client.get_active_trips", return_value=[
        {"id": "t1", "countries": ["Netherlands"], "start_date": None, "end_date": None},
    ])
    @patch("core.supabase_client.get_user_id_from_token", return_value="u1")
    def test_fetch_trip_context_defaults_to_first(self, _uid, _trips, _ent):
        result = fetch_trip_context("tok", "url", "key", hint_countries=["Japan"])
        assert result["trip_id"] == "t1"
