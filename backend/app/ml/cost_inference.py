from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib

from app.ml.cost_features import (
    CATEGORICAL_FEATURES,
    FEATURE_NAMES,
    NUMERIC_FEATURES,
    feature_matrix,
    normalize_feature_row,
)
from app.ml.cost_training import ARTIFACT_SCHEMA_VERSION, MODEL_NAME
from app.ml.explainability import explain_prediction, unavailable_explanation
from app.ml.interface import ModelUnavailableError


@lru_cache(maxsize=4)
def load_cost_model(artifact_uri: str, checksum: str, artifact_root: str) -> dict[str, Any]:
    root = Path(artifact_root).resolve()
    path = Path(artifact_uri).resolve()
    if not path.is_relative_to(root):
        raise ModelUnavailableError("Registered model artifact is outside the configured artifact directory.")
    if not path.is_file():
        raise ModelUnavailableError("Registered cost-overrun model artifact is missing.")
    actual_checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_checksum != checksum:
        raise ModelUnavailableError("Registered cost-overrun model artifact failed its checksum validation.")
    try:
        artifact = joblib.load(path)
    except Exception as exc:
        raise ModelUnavailableError("Registered cost-overrun model artifact could not be loaded.") from exc
    if not isinstance(artifact, dict):
        raise ModelUnavailableError("Registered cost-overrun model artifact has an invalid structure.")
    if artifact.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ModelUnavailableError("Cost-overrun model artifact schema is unsupported.")
    if artifact.get("model_name") != MODEL_NAME or artifact.get("synthetic_training_data") is not False:
        raise ModelUnavailableError("Cost-overrun artifact provenance is invalid.")
    if artifact.get("feature_names") != FEATURE_NAMES:
        raise ModelUnavailableError("Cost-overrun model feature schema does not match this API version.")
    return artifact


def predict_cost_overrun(
    artifact: dict[str, Any],
    project_features: dict[str, Any],
    *,
    training_data_version: str,
) -> dict[str, Any]:
    if project_features.get("is_synthetic"):
        raise ModelUnavailableError("Cost-overrun ML predictions are disabled for synthetic demonstration projects.")
    approved_cost = float(project_features.get("approved_cost") or 0)
    if approved_cost <= 0:
        raise ModelUnavailableError("A positive original approved cost is required for prediction.")
    if project_features.get("snapshot_date") is None:
        raise ModelUnavailableError("At least one dated monitoring snapshot is required for prediction.")

    normalized_features = normalize_feature_row(project_features)
    matrix = feature_matrix([normalized_features])
    predicted_ratio = max(0, float(artifact["regression_pipeline"].predict(matrix)[0]))
    predicted_final_cost = predicted_ratio * approved_cost
    escalation_amount = predicted_final_cost - approved_cost
    escalation_percentage = (predicted_ratio - 1) * 100

    uncertainty = artifact["uncertainty"]
    ratio_error = float(uncertainty["cost_ratio_absolute_error_q90"])
    lower_cost = max(0, (predicted_ratio - ratio_error) * approved_cost)
    upper_cost = max(lower_cost, (predicted_ratio + ratio_error) * approved_cost)

    probability: float | None = None
    predicted_class: str | None = None
    classifier = artifact.get("classification_pipeline")
    if classifier is not None:
        probability = float(classifier.predict_proba(matrix)[0][1])
        predicted_class = "significant_overrun" if probability >= 0.5 else "not_significant_overrun"

    try:
        explanation = explain_prediction(
            artifact=artifact,
            normalized_features=normalized_features,
            matrix=matrix,
            numeric_features=NUMERIC_FEATURES,
            categorical_features=CATEGORICAL_FEATURES,
            prediction_kind="cost",
        )
    except (RuntimeError, TypeError, ValueError) as exc:
        explanation = unavailable_explanation(str(exc))

    return {
        "project_id": project_features["project_id"],
        "project_name": project_features["project_name"],
        "as_of_date": project_features["snapshot_date"],
        "original_approved_cost": approved_cost,
        "significant_overrun_probability": probability,
        "predicted_class": predicted_class,
        "significant_overrun_threshold_pct": float(
            artifact["metrics"]["classification"]["threshold_pct"]
        ),
        "predicted_final_cost": predicted_final_cost,
        "predicted_escalation_amount": escalation_amount,
        "predicted_escalation_percentage": escalation_percentage,
        "predicted_final_cost_lower": lower_cost,
        "predicted_final_cost_upper": upper_cost,
        "uncertainty_method": uncertainty["method"],
        "uncertainty_is_formally_calibrated": bool(uncertainty["is_formally_calibrated"]),
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
