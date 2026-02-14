import json
import os


def load_config(config_path="config.json"):
    """Loads the type list and categories from an external JSON config file."""
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Missing configuration file: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)
    master_list = config_data.get("master_list", [])
    allowed_types = [item["type"] for item in master_list]
    geo_types = [item["type"] for item in master_list if item.get("is_geo_location")]
    return allowed_types, geo_types
