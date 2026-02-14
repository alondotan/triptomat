import json
import os
import tempfile

import pytest

from core.config import load_config


class TestLoadConfig:
    def test_loads_types_from_config(self):
        config = {
            "master_list": [
                {"type": "restaurant", "is_geo_location": False},
                {"type": "hotel", "is_geo_location": False},
                {"type": "country", "is_geo_location": True},
                {"type": "city", "is_geo_location": True},
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(config, f)
            f.flush()
            path = f.name

        try:
            allowed, geo = load_config(path)
            assert allowed == ["restaurant", "hotel", "country", "city"]
            assert geo == ["country", "city"]
        finally:
            os.unlink(path)

    def test_empty_master_list(self):
        config = {"master_list": []}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(config, f)
            f.flush()
            path = f.name

        try:
            allowed, geo = load_config(path)
            assert allowed == []
            assert geo == []
        finally:
            os.unlink(path)

    def test_missing_file_raises(self):
        with pytest.raises(FileNotFoundError):
            load_config("/nonexistent/path/config.json")

    def test_missing_master_list_key(self):
        config = {"other_key": "value"}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(config, f)
            f.flush()
            path = f.name

        try:
            allowed, geo = load_config(path)
            assert allowed == []
            assert geo == []
        finally:
            os.unlink(path)
