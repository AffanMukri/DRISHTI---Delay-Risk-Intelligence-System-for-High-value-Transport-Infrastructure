from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.ml.cost_features import FEATURE_NAMES, LEAKAGE_EXCLUSIONS
from app.ml.cost_inference import load_cost_model, predict_cost_overrun
from app.ml.cost_training import TrainingDataError, train_cost_overrun_models


def historical_rows(count: int = 120) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index in range(count):
        approved = 300 + index * 9
        significant = index % 3 != 0
        escalation = 0.18 + (index % 5) * 0.01 if significant else 0.02 + (index % 4) * 0.01
        rows.append({
            "project_id": f"HIST-{index:04d}",
            "label_date": date(2010, 1, 1) + timedelta(days=index * 30),
            "approved_cost": approved,
            "target_final_cost": approved * (1 + escalation),
            "planned_duration_days": 900 + index * 3,
            "elapsed_days": 210 + index,
            "physical_progress": 25 + index % 45,
            "planned_progress": 35 + index % 45,
            "progress_variance": -10,
            "expenditure_to_approved_pct": 20 + index % 50,
            "schedule_slippage_days": 40 + (index % 3) * 50 if significant else index % 20,
            "milestone_completion_pct": 30 + index % 55,
            "milestone_slippage_pct": 25 if significant else 4,
            "land_acquisition_progress": 55 + index % 45,
            "issue_count": 4 if significant else 1,
            "start_year": 2007 + index // 12,
            "snapshot_year": 2008 + index // 12,
            "sector": ["Transport", "Energy", "Water"][index % 3],
            "project_type": ["Rail", "Road"][index % 2],
            "ministry": f"Ministry {index % 4}",
            "implementing_agency": f"Agency {index % 7}",
            "state": f"State {index % 8}",
            "contract_status": "delayed" if significant else "active",
            "is_synthetic": False,
        })
    return rows


def test_training_saves_reproducible_versioned_artifact_and_metrics(tmp_path) -> None:
    output = train_cost_overrun_models(
        historical_rows(),
        version="test-1.0.0",
        artifact_dir=tmp_path,
        minimum_rows=60,
        minimum_class_rows=5,
    )

    assert output.artifact_path.is_file()
    assert len(output.artifact_checksum) == 64
    assert output.artifact["synthetic_training_data"] is False
    assert output.artifact["feature_names"] == FEATURE_NAMES
    assert output.artifact["training_metadata"]["split"]["strategy"] == "chronological_by_project_label_date"
    assert output.artifact["metrics"]["regression"]["selected_model"] in {
        "ridge_regression", "random_forest_regressor",
    }
    assert set(output.artifact["metrics"]["regression"]["test"]) == {"mae", "rmse", "r2"}
    assert output.artifact["metrics"]["classification"]["selected_model"] in {
        "logistic_regression", "random_forest_classifier",
    }
    assert set(output.artifact["metrics"]["classification"]["test"]) == {
        "precision", "recall", "f1", "roc_auc",
    }
    assert {"revised_cost", "final_cost", "overall_risk_score"}.issubset(LEAKAGE_EXCLUSIONS)
    assert not set(FEATURE_NAMES).intersection(LEAKAGE_EXCLUSIONS)

    loaded = load_cost_model(str(output.artifact_path), output.artifact_checksum, str(tmp_path))
    source = historical_rows(1)[0]
    prediction = predict_cost_overrun(
        loaded,
        {
            **source,
            "project_name": "A real monitored project",
            "snapshot_date": date(2026, 8, 1),
        },
        training_data_version=output.registry_metadata["training_data_version"],
    )
    assert prediction["synthetic"] is False
    assert 0 <= prediction["significant_overrun_probability"] <= 1
    assert prediction["predicted_final_cost"] >= 0
    assert prediction["predicted_final_cost_lower"] <= prediction["predicted_final_cost_upper"]
    assert prediction["uncertainty_is_formally_calibrated"] is False
    explanation = prediction["explanation"]
    assert explanation["ml"]["available"] is True
    assert explanation["ml"]["method"] == "SHAP"
    assert explanation["ml"]["contributions"]
    assert abs(explanation["ml"]["additivityResidual"]) < 1e-4
    assert explanation["rules"]["method"] == "deterministic_thresholds"
    assert explanation["historical"]["available"] is True
    assert explanation["historical"]["cohortSize"] >= 10
    first = explanation["ml"]["contributions"][0]
    assert "actualValue" in first
    assert first["humanExplanation"]
    assert first["historicalComparison"]

    with pytest.raises(TrainingDataError, match="immutable"):
        train_cost_overrun_models(
            historical_rows(),
            version="test-1.0.0",
            artifact_dir=tmp_path,
            minimum_rows=60,
        )


def test_training_refuses_synthetic_or_insufficient_history(tmp_path) -> None:
    rows = historical_rows(60)
    rows[0]["is_synthetic"] = True
    with pytest.raises(TrainingDataError, match="Synthetic projects"):
        train_cost_overrun_models(rows, version="test", artifact_dir=tmp_path, minimum_rows=60)

    with pytest.raises(TrainingDataError, match="At least 100"):
        train_cost_overrun_models(historical_rows(30), version="test", artifact_dir=tmp_path)


def test_classification_is_omitted_when_target_is_not_defensible(tmp_path) -> None:
    rows = historical_rows(60)
    for row in rows:
        row["target_final_cost"] = float(row["approved_cost"]) * 1.02
    output = train_cost_overrun_models(
        rows,
        version="regression-only",
        artifact_dir=tmp_path,
        minimum_rows=60,
        minimum_class_rows=5,
    )
    classification = output.artifact["metrics"]["classification"]
    assert output.artifact["classification_pipeline"] is None
    assert classification["selected_model"] is None
    assert "lack the required support" in classification["omission_reason"]
    prediction = predict_cost_overrun(
        output.artifact,
        {
            **rows[0],
            "project_name": "Regression-only project",
            "snapshot_date": date(2026, 8, 1),
        },
        training_data_version=output.registry_metadata["training_data_version"],
    )
    assert prediction["explanation"]["ml"]["available"] is True
    assert prediction["explanation"]["ml"]["target"] == "predicted_cost_escalation_percentage"
