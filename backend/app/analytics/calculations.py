from datetime import date, datetime
from decimal import Decimal
from typing import Any


def normalize_numeric_values(value: Any) -> Any:
    """Convert database numerics recursively while retaining dates and IDs."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: normalize_numeric_values(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize_numeric_values(item) for item in value]
    if isinstance(value, (date, datetime)):
        return value
    return value


def round_metrics(payload: dict[str, Any], digits: int = 2) -> dict[str, Any]:
    def round_value(value: Any) -> Any:
        if isinstance(value, float):
            return round(value, digits)
        if isinstance(value, dict):
            return {key: round_value(item) for key, item in value.items()}
        if isinstance(value, list):
            return [round_value(item) for item in value]
        return value

    return round_value(normalize_numeric_values(payload))

