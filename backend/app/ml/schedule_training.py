from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.ml.schedule_features import (
    CATEGORICAL_FEATURES,
    FEATURE_NAMES,
    LEAKAGE_EXCLUSIONS,
    NUMERIC_FEATURES,
    feature_matrix,
    parse_label_date,
    schedule_overrun_target,
    target_completion_variance_days,
)
from app.ml.explainability import MAX_BACKGROUND_ROWS, build_explanation_metadata


MODEL_NAME = "pragati_x_schedule_overrun"
ARTIFACT_SCHEMA_VERSION = 1
RANDOM_STATE = 42


class ScheduleTrainingDataError(ValueError):
    pass


@dataclass(frozen=True)
class ScheduleTrainingOutput:
    artifact: dict[str, Any]
    artifact_path: Path
    artifact_checksum: str
    registry_metadata: dict[str, Any]


def _preprocessor() -> ColumnTransformer:
    numeric_indexes = list(range(len(NUMERIC_FEATURES)))
    categorical_indexes = list(range(len(NUMERIC_FEATURES), len(FEATURE_NAMES)))
    return ColumnTransformer([
        ("numeric", Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric_indexes),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("one_hot", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical_indexes),
    ])


def _regression_candidates() -> dict[str, Pipeline]:
    return {
        "ridge_regression": Pipeline([
            ("preprocess", _preprocessor()),
            ("model", Ridge(alpha=1.0, solver="lsqr")),
        ]),
        "random_forest_regressor": Pipeline([
            ("preprocess", _preprocessor()),
            ("model", RandomForestRegressor(
                n_estimators=300,
                min_samples_leaf=3,
                max_features="sqrt",
                random_state=RANDOM_STATE,
                n_jobs=-1,
            )),
        ]),
    }


def _classification_candidates() -> dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline([
            ("preprocess", _preprocessor()),
            ("model", LogisticRegression(
                max_iter=2_000,
                class_weight="balanced",
                random_state=RANDOM_STATE,
            )),
        ]),
        "random_forest_classifier": Pipeline([
            ("preprocess", _preprocessor()),
            ("model", RandomForestClassifier(
                n_estimators=300,
                min_samples_leaf=3,
                max_features="sqrt",
                class_weight="balanced",
                random_state=RANDOM_STATE,
                n_jobs=-1,
            )),
        ]),
    }


def _regression_metrics(
    model: Pipeline,
    matrix: list[list[Any]],
    rows: list[dict[str, Any]],
) -> tuple[dict[str, float], np.ndarray]:
    predicted = np.asarray(model.predict(matrix), dtype=float)
    actual = np.asarray([target_completion_variance_days(row) for row in rows], dtype=float)
    return {
        "mae_days": float(mean_absolute_error(actual, predicted)),
        "rmse_days": float(math.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }, predicted


def _classification_metrics(
    model: Pipeline,
    matrix: list[list[Any]],
    labels: list[int],
) -> dict[str, float | None]:
    predicted = model.predict(matrix)
    probabilities = model.predict_proba(matrix)[:, 1]
    auc = float(roc_auc_score(labels, probabilities)) if len(set(labels)) == 2 else None
    return {
        "precision": float(precision_score(labels, predicted, zero_division=0)),
        "recall": float(recall_score(labels, predicted, zero_division=0)),
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "roc_auc": auc,
    }


def _time_split(
    rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    ordered = sorted(rows, key=lambda row: (parse_label_date(row), str(row["project_id"])))
    test_size = max(1, round(len(ordered) * 0.20))
    validation_size = max(1, round(len(ordered) * 0.20))
    train_end = len(ordered) - validation_size - test_size
    if train_end < 2:
        raise ScheduleTrainingDataError("Not enough rows for chronological train/validation/test partitions.")
    return ordered[:train_end], ordered[train_end:train_end + validation_size], ordered[train_end + validation_size:]


def _data_fingerprint(rows: list[dict[str, Any]]) -> str:
    values = [{
        "project_id": str(row["project_id"]),
        "label_date": parse_label_date(row).isoformat(),
        "original_completion_date": str(row["original_completion_date"]),
        "target_completion_variance_days": target_completion_variance_days(row),
        "completion_label_source": row.get("completion_label_source"),
    } for row in sorted(rows, key=lambda item: str(item["project_id"]))]
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def train_schedule_overrun_models(
    rows: list[dict[str, Any]],
    *,
    version: str,
    artifact_dir: Path,
    minimum_rows: int = 100,
    minimum_class_rows: int = 10,
    overrun_threshold_days: int = 0,
) -> ScheduleTrainingOutput:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", version):
        raise ScheduleTrainingDataError("Model version must be a safe 1-64 character identifier.")
    artifact_path = (artifact_dir / f"{MODEL_NAME}-{version}.joblib").resolve()
    if artifact_path.exists():
        raise ScheduleTrainingDataError(f"Model version '{version}' already has an artifact and is immutable.")
    if any(row.get("is_synthetic") for row in rows):
        raise ScheduleTrainingDataError("Synthetic projects cannot train a production schedule-overrun model.")
    project_ids = [str(row["project_id"]) for row in rows]
    if len(project_ids) != len(set(project_ids)):
        raise ScheduleTrainingDataError("Training data must contain one leakage-safe snapshot per project.")
    if len(rows) < minimum_rows:
        raise ScheduleTrainingDataError(
            f"At least {minimum_rows} non-synthetic completed projects with defensible completion labels are required; "
            f"found {len(rows)}."
        )
    if any(row.get("original_completion_date") is None or row.get("label_date") is None for row in rows):
        raise ScheduleTrainingDataError("Every training row requires original and actual completion dates.")

    train_rows, validation_rows, test_rows = _time_split(rows)
    x_train = feature_matrix(train_rows)
    x_validation = feature_matrix(validation_rows)
    x_test = feature_matrix(test_rows)
    y_train = [target_completion_variance_days(row) for row in train_rows]

    regression_validation: dict[str, dict[str, float]] = {}
    regression_models: dict[str, Pipeline] = {}
    for name, candidate in _regression_candidates().items():
        model = clone(candidate).fit(x_train, y_train)
        metrics, _ = _regression_metrics(model, x_validation, validation_rows)
        regression_validation[name] = metrics
        regression_models[name] = model
    selected_regression_name = min(
        regression_validation,
        key=lambda name: regression_validation[name]["mae_days"],
    )
    selected_regression = regression_models[selected_regression_name]
    regression_test, _ = _regression_metrics(selected_regression, x_test, test_rows)
    validation_predictions = np.asarray(selected_regression.predict(x_validation), dtype=float)
    validation_actual = np.asarray(
        [target_completion_variance_days(row) for row in validation_rows], dtype=float
    )
    delay_error_q90 = float(np.quantile(np.abs(validation_actual - validation_predictions), 0.90))

    all_labels = [schedule_overrun_target(row, overrun_threshold_days) for row in rows]
    class_counts = {str(label): all_labels.count(label) for label in (0, 1)}
    train_labels = [schedule_overrun_target(row, overrun_threshold_days) for row in train_rows]
    validation_labels = [schedule_overrun_target(row, overrun_threshold_days) for row in validation_rows]
    test_labels = [schedule_overrun_target(row, overrun_threshold_days) for row in test_rows]
    classification_model: Pipeline | None = None
    selected_classification_name: str | None = None
    classification_validation: dict[str, dict[str, float | None]] = {}
    classification_test: dict[str, float | None] | None = None
    classification_omission_reason: str | None = None
    if min(class_counts.values()) < minimum_class_rows or len(set(train_labels)) < 2:
        classification_omission_reason = (
            "Classification omitted because overrun/non-overrun classes lack the required support of "
            f"{minimum_class_rows} projects per class."
        )
    else:
        classification_models: dict[str, Pipeline] = {}
        for name, candidate in _classification_candidates().items():
            model = clone(candidate).fit(x_train, train_labels)
            classification_validation[name] = _classification_metrics(model, x_validation, validation_labels)
            classification_models[name] = model
        selected_classification_name = max(
            classification_validation,
            key=lambda name: (
                classification_validation[name]["roc_auc"]
                if classification_validation[name]["roc_auc"] is not None
                else classification_validation[name]["f1"] or 0
            ),
        )
        classification_model = classification_models[selected_classification_name]
        classification_test = _classification_metrics(classification_model, x_test, test_labels)

    fingerprint = _data_fingerprint(rows)
    trained_at = datetime.now(UTC).isoformat()
    split_metadata = {
        "strategy": "chronological_by_actual_completion_date",
        "train_count": len(train_rows),
        "validation_count": len(validation_rows),
        "test_count": len(test_rows),
        "train_label_end": max(parse_label_date(row) for row in train_rows).isoformat(),
        "validation_label_start": min(parse_label_date(row) for row in validation_rows).isoformat(),
        "validation_label_end": max(parse_label_date(row) for row in validation_rows).isoformat(),
        "test_label_start": min(parse_label_date(row) for row in test_rows).isoformat(),
        "test_label_end": max(parse_label_date(row) for row in test_rows).isoformat(),
    }
    snapshot_dates = [
        parse_label_date({"label_date": row["snapshot_date"]})
        for row in rows if row.get("snapshot_date") is not None
    ]
    training_period = {
        "label_start": min(parse_label_date(row) for row in rows).isoformat(),
        "label_end": max(parse_label_date(row) for row in rows).isoformat(),
        "snapshot_start": min(snapshot_dates).isoformat() if snapshot_dates else None,
        "snapshot_end": max(snapshot_dates).isoformat() if snapshot_dates else None,
    }
    metrics = {
        "regression": {
            "validation_candidates": regression_validation,
            "selected_model": selected_regression_name,
            "test": regression_test,
        },
        "classification": {
            "threshold_days": overrun_threshold_days,
            "class_counts": class_counts,
            "validation_candidates": classification_validation,
            "selected_model": selected_classification_name,
            "test": classification_test,
            "omission_reason": classification_omission_reason,
        },
    }
    label_source_counts: dict[str, int] = {}
    for row in rows:
        source = str(row.get("completion_label_source") or "unknown")
        label_source_counts[source] = label_source_counts.get(source, 0) + 1
    explanation_metadata = build_explanation_metadata(
        regression_pipeline=selected_regression,
        classification_pipeline=classification_model,
        training_rows=train_rows,
        matrix_builder=feature_matrix,
        numeric_features=NUMERIC_FEATURES,
        categorical_features=CATEGORICAL_FEATURES,
    )
    artifact = {
        "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
        "model_name": MODEL_NAME,
        "model_version": version,
        "trained_at": trained_at,
        "synthetic_training_data": False,
        "feature_names": FEATURE_NAMES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "leakage_exclusions": LEAKAGE_EXCLUSIONS,
        "regression_target": "actual_completion_date_minus_original_completion_date_days",
        "classification_target": f"completion_variance_greater_than_{overrun_threshold_days}_days",
        "regression_model_name": selected_regression_name,
        "classification_model_name": selected_classification_name,
        "regression_pipeline": selected_regression,
        "classification_pipeline": classification_model,
        "explanation_metadata": explanation_metadata,
        "uncertainty": {
            "method": "empirical_90pct_absolute_delay_error_on_validation_partition",
            "delay_days_absolute_error_q90": delay_error_q90,
            "is_formally_calibrated": False,
        },
        "metrics": metrics,
        "training_metadata": {
            "random_state": RANDOM_STATE,
            "row_count": len(rows),
            "project_count": len(rows),
            "data_fingerprint_sha256": fingerprint,
            "completion_label_source_counts": label_source_counts,
            "split": split_metadata,
            "training_period": training_period,
            "label_definition": "Actual completion metadata, fully completed milestone set, or first 100% monthly progress record.",
            "feature_snapshot_definition": "Second available monthly record, including only current and prior observations at that date.",
            "software": {
                "python": platform.python_version(),
                "scikit_learn": sklearn.__version__,
                "numpy": np.__version__,
            },
        },
    }

    artifact_dir.mkdir(parents=True, exist_ok=True)
    temporary_path = artifact_path.with_suffix(".joblib.tmp")
    joblib.dump(artifact, temporary_path)
    os.replace(temporary_path, artifact_path)
    checksum = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    registry_metadata = {
        "name": MODEL_NAME,
        "version": version,
        "model_type": "schedule_overrun_multitask",
        "algorithm": f"{selected_regression_name}+{selected_classification_name or 'classification_omitted'}",
        "description": "Independent leakage-controlled schedule overrun classification and completion-delay regression.",
        "artifact_uri": str(artifact_path),
        "artifact_checksum": checksum,
        "feature_schema": {
            "features": FEATURE_NAMES,
            "numeric": NUMERIC_FEATURES,
            "categorical": CATEGORICAL_FEATURES,
            "leakage_exclusions": LEAKAGE_EXCLUSIONS,
        },
        "parameters": {
            "random_state": RANDOM_STATE,
            "explainability_version": explanation_metadata["version"],
            "shap_version": explanation_metadata["shapVersion"],
            "shap_background_max_rows": MAX_BACKGROUND_ROWS,
            "overrun_threshold_days": overrun_threshold_days,
            "minimum_rows": minimum_rows,
            "minimum_class_rows": minimum_class_rows,
            "training_rows": len(rows),
            "training_period": training_period,
        },
        "evaluation_metrics": metrics,
        "training_data_version": fingerprint,
        "trained_at": trained_at,
    }
    return ScheduleTrainingOutput(artifact, artifact_path, checksum, registry_metadata)
