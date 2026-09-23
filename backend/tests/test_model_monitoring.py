from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from app.auth.models import CurrentProfile
from app.config import Settings
from app.ml.monitoring import (
    categorical_drift,
    missingness_change,
    numeric_drift,
    regression_performance,
)
from app.services.model_monitoring import ModelMonitoringService


def test_numeric_drift_detects_material_shift_and_suppresses_small_samples() -> None:
    shifted = numeric_drift(
        list(range(100)),
        list(range(100, 200)),
        minimum_samples=30,
        psi_warning=0.10,
        psi_critical=0.25,
        significance_level=0.05,
    )
    assert shifted["status"] == "drift_detected"
    assert shifted["psi"] > 0.25
    assert shifted["p_value"] < 0.05

    insufficient = numeric_drift(
        list(range(100)),
        list(range(10)),
        minimum_samples=30,
        psi_warning=0.10,
        psi_critical=0.25,
        significance_level=0.05,
    )
    assert insufficient["status"] == "insufficient_data"
    assert insufficient["psi"] is None
    assert insufficient["ks_statistic"] is None


def test_categorical_and_missingness_checks_require_defensible_counts() -> None:
    categorical = categorical_drift(
        {"A": 50, "B": 50},
        ["A"] * 15 + ["B"] * 85,
        minimum_samples=30,
        significance_level=0.05,
    )
    assert categorical["status"] == "drift_detected"
    assert categorical["cramers_v"] > 0.20

    missing = missingness_change(
        reference_total=100,
        reference_present=95,
        current_values=[None] * 35 + [1] * 65,
        categorical=False,
        minimum_samples=30,
        significance_level=0.05,
    )
    assert missing["status"] == "drift_detected"
    assert missing["rate_change"] > 0.20


def test_realized_performance_is_not_calculated_without_enough_outcomes() -> None:
    result = regression_performance(
        [100.0] * 10,
        [120.0] * 10,
        minimum_samples=30,
        baseline_metrics={"mae": 5.0},
        degradation_ratio=1.25,
    )
    assert result["status"] == "insufficient_data"
    assert result["metrics"] is None


class FakeRepository:
    def __init__(self) -> None:
        self.calls: dict[str, int] = {}
        self.saved: dict[str, object] | None = None

    async def model(self, _model_version_id: UUID):
        return {
            "id": MODEL_ID,
            "name": "pragati_x_cost_overrun",
            "version": "1.0.0",
            "model_type": "cost_overrun_multitask",
            "artifact_uri": "unused",
            "artifact_checksum": "unused",
        }

    async def prediction_samples(self, _model_id, prediction_type, _start, _end):
        call = self.calls.get(prediction_type, 0)
        self.calls[prediction_type] = call + 1
        current = call == 0
        if prediction_type == "final_cost":
            offset = 100 if current else 0
            return [{
                "predicted_value": 1000 + offset + index,
                "feature_snapshot": {
                    "physical_progress": 100 + index if current else index,
                    "sector": "B" if current and index >= 10 else "A" if index < 20 else "B",
                },
            } for index in range(40)]
        offset = 30 if current else 0
        return [{"predicted_value": 40 + offset + index / 10, "feature_snapshot": {}} for index in range(40)]

    async def evaluated_samples(self, _model_id, prediction_type):
        if prediction_type == "final_cost":
            return [{"predicted_value": 1000 + index, "actual_value": 1001 + index} for index in range(40)]
        return [{
            "predicted_value": 80 if index % 2 else 20,
            "predicted_class": "significant_overrun" if index % 2 else "not_significant_overrun",
            "actual_class": "significant_overrun" if index % 2 else "not_significant_overrun",
        } for index in range(40)]

    async def save_run(self, *, model_version_id, actor_id, report):
        self.saved = report
        return {
            "id": uuid4(),
            "model_version_id": model_version_id,
            "run_by": actor_id,
            **report,
        }


MODEL_ID = UUID("20000000-0000-0000-0000-000000000001")
USER_ID = UUID("10000000-0000-0000-0000-000000000001")


def artifact() -> dict[str, object]:
    return {
        "feature_names": ["physical_progress", "sector"],
        "numeric_features": ["physical_progress"],
        "categorical_features": ["sector"],
        "explanation_metadata": {
            "historicalReference": {
                "global": {
                    "count": 40,
                    "features": {
                        "physical_progress": {"kind": "numeric", "count": 40, "values": list(range(40))},
                        "sector": {"kind": "categorical", "count": 40, "counts": {"A": 20, "B": 20}},
                    },
                },
            },
        },
        "metrics": {
            "regression": {"test": {"mae": 5, "rmse": 7, "r2": 0.8}},
            "classification": {"test": {"precision": 0.8, "recall": 0.8, "f1": 0.8, "roc_auc": 0.9}},
        },
    }


def test_service_persists_observation_only_report(monkeypatch) -> None:
    repository = FakeRepository()
    settings = Settings(
        app_env="test",
        model_monitoring_min_samples=30,
        model_monitoring_default_window_days=90,
    )
    service = ModelMonitoringService(repository, settings)  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_artifact", lambda _model: (artifact(), None))
    profile = CurrentProfile(
        id=USER_ID,
        email="admin@example.gov.in",
        full_name="Administrator",
        role="administrator",
        is_active=True,
    )

    result = asyncio.run(service.run(MODEL_ID, profile, 90))

    assert result["status"] == "sufficient"
    assert result["summary"]["attention_required"] is True
    assert result["summary"]["automatic_retraining_triggered"] is False
    assert repository.saved is not None
    assert repository.saved["methodology"]["automatic_retraining"] is False


def test_monitoring_migration_has_admin_rls_and_no_retraining_trigger() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase/migrations/20260921000300_model_monitoring.sql"
    ).read_text(encoding="utf-8")
    assert "create table public.model_monitoring_runs" in migration
    assert "enable row level security" in migration
    assert "public.is_admin()" in migration
    assert "audit_logs_model_monitoring_insert" in migration
    assert "update public.model_versions" not in migration.lower()
