from core.prompts import build_main_prompt


class TestBuildMainPrompt:
    def test_contains_allowed_types(self):
        prompt = build_main_prompt(["restaurant", "hotel"], ["country", "city"])
        assert "restaurant" in prompt
        assert "hotel" in prompt

    def test_contains_geo_types(self):
        prompt = build_main_prompt(["restaurant"], ["country", "city"])
        assert "country" in prompt
        assert "city" in prompt

    def test_contains_json_structure(self):
        prompt = build_main_prompt(["restaurant"], ["country"])
        assert "sites_hierarchy" in prompt
        assert "recommendations" in prompt

    def test_contains_rules(self):
        prompt = build_main_prompt(["restaurant"], ["country"])
        assert "Category must be strictly from" in prompt
        assert "location_type" in prompt

    def test_returns_string(self):
        result = build_main_prompt([], [])
        assert isinstance(result, str)
