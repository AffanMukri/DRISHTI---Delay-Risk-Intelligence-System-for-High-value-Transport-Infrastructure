from __future__ import annotations

import asyncio
from datetime import date

import pytest

from app.errors import AppError
from app.services.predictions import PredictionService


class RepositoryWithoutModel:
    def __init__(self, *, synthetic: bool) -> None:
        self.synthetic = synthetic

    async def cost_inference_features(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "approved_cost": 1000,
            "snapshot_date": date(2026, 1, 1),
            "is_synthetic": self.synthetic,
        }

    async def active_cost_model(self) -> None:
        return None

    async def schedule_inference_features(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "source_update_id": "20000000-0000-4000-8000-000000000001",
            "snapshot_date": date(2026, 1, 1),
            "original_completion_date": date(2027, 1, 1),
            "is_synthetic": self.synthetic,
        }

    async def active_schedule_model(self) -> None:
        return None


def test_prediction_service_never_substitutes_a_value_when_model_is_missing() -> None:
    service = PredictionService(RepositoryWithoutModel(synthetic=False))  # type: ignore[arg-type]
    with pytest.raises(AppError) as error:
        asyncio.run(service.predict_cost_overrun("PRJ-001"))
    assert error.value.status_code == 503
    assert error.value.code == "model_unavailable"


def test_prediction_service_blocks_demo_projects_before_inference() -> None:
    service = PredictionService(RepositoryWithoutModel(synthetic=True))  # type: ignore[arg-type]
    with pytest.raises(AppError) as error:
        asyncio.run(service.predict_cost_overrun("DEMO-001"))
    assert error.value.status_code == 422
    assert error.value.code == "synthetic_prediction_blocked"


def test_schedule_prediction_never_falls_back_when_model_is_missing() -> None:
    service = PredictionService(RepositoryWithoutModel(synthetic=False))  # type: ignore[arg-type]
    with pytest.raises(AppError) as error:
        asyncio.run(service.predict_schedule_overrun("PRJ-001"))
    assert error.value.status_code == 503
    assert error.value.code == "model_unavailable"


def test_schedule_prediction_blocks_demo_projects() -> None:
    service = PredictionService(RepositoryWithoutModel(synthetic=True))  # type: ignore[arg-type]
    with pytest.raises(AppError) as error:
        asyncio.run(service.predict_schedule_overrun("DEMO-001"))
    assert error.value.status_code == 422
    assert error.value.code == "synthetic_prediction_blocked"
