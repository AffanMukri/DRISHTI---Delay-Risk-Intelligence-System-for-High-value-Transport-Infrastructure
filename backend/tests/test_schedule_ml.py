from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.ml.schedule_features import FEATURE_NAMES, LEAKAGE_EXCLUSIONS
from app.ml.schedule_inference import load_schedule_model, predict_schedule_overrun
from app.ml.schedule_training import ScheduleTrainingDataError, train_schedule_overrun_models


def schedule_rows(count: int = 120) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index in range(count):
        overrun = index % 3 != 0
        variance = 120 + (index % 6) * 15 if overrun else -(index % 4) * 10
        actual_completion = date(2010, 1, 1) + timedelta(days=index * 35)
        original_completion = actual_completion - timedelta(days=variance)
        rows.append({
            "project_id": f"SCH-{index:04d}",
            "label_date": actual_completion,
            "completion_label_source": [
                "project_metadata", "fully_completed_milestones", "first_100pct_monthly_progress"
            ][index % 3],
            "original_completion_date": original_completion,
            "target_completion_variance_days": variance,
            "original_approved_cost": 500 + index * 12,
            "planned_duration_days": 900 + index * 4,
            "elapsed_days": 180 + index,
            "elapsed_duration_pct": 20 + index % 50,
            "physical_progress": 20 + index % 55,
            "planned_progress": 30 + index % 55,
            "progress_variance": -12 if overrun else 2,
            "previous_physical_progress": 18 + index % 55,
            "previous_planned_progress": 26 + index % 55,
            "monthly_progress_velocity": 1.2 if overrun else 3.4,
            "expenditure_to_approved_pct": 25 + index % 45,
            "reported_delay_days": 75 if overrun else 0,
            "milestone_completion_pct": 30 + index % 50,
            "milestone_delay_pct": 30 if overrun else 5,
            "land_acquisition_progress": 55 + index % 45,
            "clearance_completion_pct": 60 if overrun else 100,
            "clearance_pending_count": 2 if overrun else 0,
            "issue_count": 4 if overrun else 1,
            "start_year": 2006 + index // 12,
            "snapshot_year": 2008 + index // 12,
            "sector": ["Transport", "Power", "Water"][index % 3],
            "project_type": ["Rail", "Road"][index % 2],
            "ministry": f"Ministry {index % 4}",
            "implementing_agency": f"Agency {index % 6}",
            "state": f"State {index % 8}",
            "contract_status": "delayed" if overrun else "active",
            "clearance_risk_status": "pending" if overrun else "cleared",
            "is_synthetic": False,
        })
    return rows


def test_schedule_training_and_inference_are_independent_and_versioned(tmp_path) -> None:
    output = train_schedule_overrun_models(
        schedule_rows(),
        version="schedule-test-1",
        artifact_dir=tmp_path,
        minimum_rows=60,
        minimum_class_rows=5,
    )
    assert output.artifact_path.is_file()
    assert output.artifact["model_name"] == "pragati_x_schedule_overrun"
    assert output.artifact["feature_names"] == FEATURE_NAMES
    assert output.artifact["training_metadata"]["split"]["strategy"] == "chronological_by_actual_completion_date"
    assert set(output.artifact["metrics"]["regression"]["test"]) == {"mae_days", "rmse_days", "r2"}
    assert set(output.artifact["metrics"]["classification"]["test"]) == {
        "precision", "recall", "f1", "roc_auc",
    }
    assert {"actual_completion_date", "final_delay_days", "schedule_risk_score"}.issubset(LEAKAGE_EXCLUSIONS)
    assert not set(FEATURE_NAMES).intersection(LEAKAGE_EXCLUSIONS)

    artifact = load_schedule_model(str(output.artifact_path), output.artifact_checksum, str(tmp_path))
    source = schedule_rows(1)[0]
    prediction = predict_schedule_overrun(
        artifact,
        {
            **source,
            "project_name": "A monitored non-demo project",
            "snapshot_date": date(2026, 1, 1),
            "original_completion_date": date(2026, 12, 31),
        },
        training_data_version=output.registry_metadata["training_data_version"],
    )
    assert prediction["synthetic"] is False
    assert 0 <= prediction["schedule_overrun_probability"] <= 1
    assert prediction["expected_delay_days"] >= 0
    assert prediction["predicted_completion_date_lower"] <= prediction["predicted_completion_date_upper"]
    assert prediction["uncertainty_is_formally_calibrated"] is False
    assert prediction["progress_projection_is_direct_model_output"] is False
    assert prediction["predicted_progress_series"][-1]["predicted_progress"] == 100
    explanation = prediction["explanation"]
    assert explanation["ml"]["available"] is True
    assert explanation["ml"]["method"] == "SHAP"
    assert explanation["ml"]["contributions"]
    assert abs(explanation["ml"]["additivityResidual"]) < 1e-4
    assert explanation["rules"]["triggers"]
    assert explanation["historical"]["available"] is True

    with pytest.raises(ScheduleTrainingDataError, match="immutable"):
        train_schedule_overrun_models(
            schedule_rows(), version="schedule-test-1", artifact_dir=tmp_path, minimum_rows=60
        )


def test_schedule_training_refuses_synthetic_and_weak_classification_data(tmp_path) -> None:
    synthetic = schedule_rows(60)
    synthetic[0]["is_synthetic"] = True
    with pytest.raises(ScheduleTrainingDataError, match="Synthetic projects"):
        train_schedule_overrun_models(
            synthetic, version="synthetic", artifact_dir=tmp_path, minimum_rows=60
        )

    rows = schedule_rows(60)
    for row in rows:
        row["target_completion_variance_days"] = -5
    output = train_schedule_overrun_models(
        rows,
        version="regression-only",
        artifact_dir=tmp_path,
        minimum_rows=60,
        minimum_class_rows=5,
    )
    assert output.artifact["classification_pipeline"] is None
    assert "lack the required support" in output.artifact["metrics"]["classification"]["omission_reason"]
