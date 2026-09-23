from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib

from app.ml.interface import ModelUnavailableError
from app.ml.schedule_features import (
    CATEGORICAL_FEATURES,
    FEATURE_NAMES,
    NUMERIC_FEATURES,
    feature_matrix,
    normalize_feature_row,
)
from app.ml.schedule_training import ARTIFACT_SCHEMA_VERSION, MODEL_NAME
from app.ml.explainability import explain_prediction, unavailable_explanation


@lru_cache(maxsize=4)
def load_schedule_model(artifact_uri: str, checksum: str, artifact_root: str) -> dict[str, Any]:
    root = Path(artifact_root).resolve()
    path = Path(artifact_uri).resolve()
    if not path.is_relative_to(root):
        raise ModelUnavailableError("Registered schedule model artifact is outside the configured artifact directory.")
    if not path.is_file():
        raise ModelUnavailableError("Registered schedule-overrun model artifact is missing.")
    if hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
        raise ModelUnavailableError("Registered schedule-overrun model artifact failed checksum validation.")
    try:
        artifact = joblib.load(path)
    except Exception as exc:
        raise ModelUnavailableError("Registered schedule-overrun model artifact could not be loaded.") from exc
    if not isinstance(artifact, dict):
        raise ModelUnavailableError("Registered schedule-overrun model artifact has an invalid structure.")
    if artifact.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ModelUnavailableError("Schedule-overrun model artifact schema is unsupported.")
    if artifact.get("model_name") != MODEL_NAME or artifact.get("synthetic_training_data") is not False:
        raise ModelUnavailableError("Schedule-overrun artifact provenance is invalid.")
    if artifact.get("feature_names") != FEATURE_NAMES:
        raise ModelUnavailableError("Schedule-overrun feature schema does not match this API version.")
    return artifact


def _as_date(value: Any, field_name: str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise ModelUnavailableError(f"A valid {field_name} is required for schedule prediction.") from exc


def _progress_projection(as_of: date, completion: date, actual_progress: float) -> list[dict[str, Any]]:
    progress = min(100.0, max(0.0, actual_progress))
    if progress >= 100:
        return [{"period": as_of.isoformat(), "predicted_progress": 100.0}]
    completion = max(completion, as_of + timedelta(days=1))
    duration = (completion - as_of).days
    points = [{"period": as_of.isoformat(), "predicted_progress": progress}]
    for step in range(1, 7):
        fraction = step / 6
        point_date = as_of + timedelta(days=round(duration * fraction))
        point_progress = progress + (100 - progress) * fraction
        points.append({
            "period": point_date.isoformat(),
            "predicted_progress": round(point_progress, 2),
        })
    return points


def predict_schedule_overrun(
    artifact: dict[str, Any],
    project_features: dict[str, Any],
    *,
    training_data_version: str,
) -> dict[str, Any]:
    if project_features.get("is_synthetic"):
        raise ModelUnavailableError("Schedule-overrun ML predictions are disabled for synthetic demonstration projects.")
    as_of = _as_date(project_features.get("snapshot_date"), "monitoring snapshot date")
    original_completion = _as_date(
        project_features.get("original_completion_date"), "original completion date"
    )
    physical_progress = float(project_features.get("physical_progress") or 0)
    normalized_features = normalize_feature_row(project_features)
    matrix = feature_matrix([normalized_features])
    raw_variance_days = float(artifact["regression_pipeline"].predict(matrix)[0])
    raw_completion = original_completion + timedelta(days=round(raw_variance_days))
    earliest_feasible = as_of if physical_progress >= 100 else as_of + timedelta(days=1)
    predicted_completion = max(raw_completion, earliest_feasible)
    predicted_variance_days = (predicted_completion - original_completion).days
    expected_delay_days = max(0, predicted_variance_days)

    uncertainty = artifact["uncertainty"]
    error_days = float(uncertainty["delay_days_absolute_error_q90"])
    lower_raw = original_completion + timedelta(days=round(raw_variance_days - error_days))
    upper_raw = original_completion + timedelta(days=round(raw_variance_days + error_days))
    lower_completion = max(lower_raw, earliest_feasible)
    upper_completion = max(upper_raw, lower_completion)

    probability: float | None = None
    predicted_class: str | None = None
    classifier = artifact.get("classification_pipeline")
    if classifier is not None:
        probability = float(classifier.predict_proba(matrix)[0][1])
        predicted_class = "schedule_overrun" if probability >= 0.5 else "no_schedule_overrun"

    try:
        explanation = explain_prediction(
            artifact=artifact,
            normalized_features=normalized_features,
            matrix=matrix,
            numeric_features=NUMERIC_FEATURES,
            categorical_features=CATEGORICAL_FEATURES,
            prediction_kind="schedule",
        )
    except (RuntimeError, TypeError, ValueError) as exc:
        explanation = unavailable_explanation(str(exc))

    return {
        "project_id": project_features["project_id"],
        "project_name": project_features["project_name"],
        "as_of_date": as_of,
        "original_completion_date": original_completion,
        "current_physical_progress": min(100, max(0, physical_progress)),
        "schedule_overrun_probability": probability,
        "predicted_class": predicted_class,
        "schedule_overrun_threshold_days": int(
            artifact["metrics"]["classification"]["threshold_days"]
        ),
        "predicted_completion_variance_days": predicted_variance_days,
        "expected_delay_days": expected_delay_days,
        "predicted_completion_date": predicted_completion,
        "predicted_completion_date_lower": lower_completion,
        "predicted_completion_date_upper": upper_completion,
        "predicted_delay_days_lower": max(0, (lower_completion - original_completion).days),
        "predicted_delay_days_upper": max(0, (upper_completion - original_completion).days),
        "uncertainty_method": uncertainty["method"],
        "uncertainty_is_formally_calibrated": bool(uncertainty["is_formally_calibrated"]),
        "predicted_progress_series": _progress_projection(
            as_of, predicted_completion, physical_progress
        ),
        "progress_projection_method": "linear_path_from_actual_snapshot_to_model_predicted_completion",
        "progress_projection_is_direct_model_output": False,
        "model_name": artifact["model_name"],
        "model_version": artifact["model_version"],
        "training_data_version": training_data_version,
        "regression_model": artifact["regression_model_name"],
        "classification_model": artifact.get("classification_model_name"),
        "feature_list": artifact["feature_names"],
        "features": normalized_features,
        "evaluation_metrics": artifact["metrics"],
        "explanation": explanation,
        "generated_at": datetime.now(UTC),
        "synthetic": False,
    }
