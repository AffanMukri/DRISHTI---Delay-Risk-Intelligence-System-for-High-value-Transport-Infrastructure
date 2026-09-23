from __future__ import annotations

import hashlib
import json
import math
import platform
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Callable

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

from app.ml.cost_features import CATEGORICAL_FEATURES as COST_CATEGORICAL
from app.ml.cost_features import LEAKAGE_EXCLUSIONS as COST_LEAKAGE_EXCLUSIONS
from app.ml.cost_features import NUMERIC_FEATURES as COST_NUMERIC
from app.ml.schedule_features import CATEGORICAL_FEATURES as SCHEDULE_CATEGORICAL
from app.ml.schedule_features import LEAKAGE_EXCLUSIONS as SCHEDULE_LEAKAGE_EXCLUSIONS
from app.ml.schedule_features import NUMERIC_FEATURES as SCHEDULE_NUMERIC


EXPERIMENT_CODE = "cuf_vs_cuf_plus"
SCHEMA_VERSION = 1


class ExperimentDataError(ValueError):
    pass


def _as_date(value: Any) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _matrix(
    rows: list[dict[str, Any]],
    numeric: list[str],
    categorical: list[str],
    external: list[str],
) -> list[list[Any]]:
    result: list[list[Any]] = []
    for row in rows:
        external_values = row.get("external_features") or {}
        values: list[Any] = [float(row[name]) if row.get(name) is not None else None for name in numeric]
        values.extend(
            str(row[name]).strip() if row.get(name) not in (None, "") else "Not reported"
            for name in categorical
        )
        values.extend(
            float(external_values[name]) if external_values.get(name) is not None else None
            for name in external
        )
        result.append(values)
    return result


def _preprocessor(numeric_count: int, categorical_count: int, external_count: int) -> ColumnTransformer:
    numeric_indexes = list(range(numeric_count))
    categorical_indexes = list(range(numeric_count, numeric_count + categorical_count))
    external_indexes = list(
        range(numeric_count + categorical_count, numeric_count + categorical_count + external_count)
    )
    transformers: list[tuple[str, Any, list[int]]] = [
        ("numeric", Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric_indexes),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("one_hot", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical_indexes),
    ]
    if external_indexes:
        transformers.append(("validated_external", Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), external_indexes))
    return ColumnTransformer(transformers)


def _regressors(numeric_count: int, categorical_count: int, external_count: int, random_state: int) -> dict[str, Pipeline]:
    def preprocess() -> ColumnTransformer:
        return _preprocessor(numeric_count, categorical_count, external_count)
    return {
        "ridge_regression": Pipeline([
            ("preprocess", preprocess()),
            ("model", Ridge(alpha=1.0, solver="lsqr")),
        ]),
        "random_forest_regressor": Pipeline([
            ("preprocess", preprocess()),
            ("model", RandomForestRegressor(
                n_estimators=300,
                min_samples_leaf=3,
                max_features="sqrt",
                random_state=random_state,
                n_jobs=-1,
            )),
        ]),
    }


def _classifiers(numeric_count: int, categorical_count: int, external_count: int, random_state: int) -> dict[str, Pipeline]:
    def preprocess() -> ColumnTransformer:
        return _preprocessor(numeric_count, categorical_count, external_count)
    return {
        "logistic_regression": Pipeline([
            ("preprocess", preprocess()),
            ("model", LogisticRegression(max_iter=2_000, class_weight="balanced", random_state=random_state)),
        ]),
        "random_forest_classifier": Pipeline([
            ("preprocess", preprocess()),
            ("model", RandomForestClassifier(
                n_estimators=300,
                min_samples_leaf=3,
                max_features="sqrt",
                class_weight="balanced",
                random_state=random_state,
                n_jobs=-1,
            )),
        ]),
    }


def _split(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    ordered = sorted(rows, key=lambda row: (_as_date(row["label_date"]), str(row["project_id"])))
    test_size = max(1, round(len(ordered) * 0.20))
    validation_size = max(1, round(len(ordered) * 0.20))
    train_end = len(ordered) - validation_size - test_size
    if train_end < 2:
        raise ExperimentDataError("Not enough rows for chronological train/validation/test partitions.")
    return ordered[:train_end], ordered[train_end:train_end + validation_size], ordered[train_end + validation_size:]


def _regression_metrics(actual: list[float], predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(math.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }


def _classification_metrics(model: Pipeline, matrix: list[list[Any]], labels: list[int]) -> dict[str, float | None]:
    predicted = model.predict(matrix)
    probability = model.predict_proba(matrix)[:, 1]
    return {
        "precision": float(precision_score(labels, predicted, zero_division=0)),
        "recall": float(recall_score(labels, predicted, zero_division=0)),
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "roc_auc": float(roc_auc_score(labels, probability)) if len(set(labels)) == 2 else None,
    }


def _coverage(rows: list[dict[str, Any]], definitions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for definition in definitions:
        code = str(definition["code"])
        populated = sum((row.get("external_features") or {}).get(code) is not None for row in rows)
        sources = sorted({
            str(item["source_name"])
            for row in rows
            for item in (row.get("external_provenance") or {}).get(code, [])
        })
        result.append({
            "code": code,
            "display_name": definition["display_name"],
            "category": definition["category"],
            "unit": definition["unit"],
            "populated_rows": populated,
            "total_rows": len(rows),
            "coverage": populated / len(rows) if rows else 0,
            "sources": sources,
        })
    return result


def _training_partition(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the chronological training partition without inspecting any target values."""
    ordered = sorted(rows, key=lambda row: (_as_date(row["label_date"]), str(row["project_id"])))
    test_size = max(1, round(len(ordered) * 0.20))
    validation_size = max(1, round(len(ordered) * 0.20))
    return ordered[:len(ordered) - validation_size - test_size]


def _fit_regression_pair(
    rows: list[dict[str, Any]],
    *,
    numeric: list[str],
    categorical: list[str],
    external: list[str],
    target: Callable[[dict[str, Any]], float],
    prediction_transform: Callable[[np.ndarray, list[dict[str, Any]]], np.ndarray],
    random_state: int,
) -> dict[str, Any]:
    train, validation, test = _split(rows)
    split = {
        "strategy": "chronological_60_20_20_by_label_date",
        "train_count": len(train),
        "validation_count": len(validation),
        "test_count": len(test),
        "train_project_ids_sha256": _ids_hash(train),
        "validation_project_ids_sha256": _ids_hash(validation),
        "test_project_ids_sha256": _ids_hash(test),
        "train_label_end": max(_as_date(row["label_date"]) for row in train).isoformat(),
        "test_label_start": min(_as_date(row["label_date"]) for row in test).isoformat(),
    }
    models: dict[str, Any] = {}
    for model_key, external_features in (("model_a", []), ("model_b", external)):
        x_train = _matrix(train, numeric, categorical, external_features)
        x_validation = _matrix(validation, numeric, categorical, external_features)
        x_test = _matrix(test, numeric, categorical, external_features)
        candidates = _regressors(len(numeric), len(categorical), len(external_features), random_state)
        fitted: dict[str, Pipeline] = {}
        validation_metrics: dict[str, dict[str, float]] = {}
        for name, candidate in candidates.items():
            model = clone(candidate).fit(x_train, [target(row) for row in train])
            predicted = prediction_transform(np.asarray(model.predict(x_validation), dtype=float), validation)
            validation_metrics[name] = _regression_metrics(
                [float(row["metric_target"]) for row in validation], predicted
            )
            fitted[name] = model
        selected = min(validation_metrics, key=lambda name: validation_metrics[name]["mae"])
        test_predicted = prediction_transform(np.asarray(fitted[selected].predict(x_test), dtype=float), test)
        models[model_key] = {
            "selected_model": selected,
            "validation_candidates": validation_metrics,
            "test": _regression_metrics([float(row["metric_target"]) for row in test], test_predicted),
        }
    return {"split": split, **models}


def _fit_classification_pair(
    rows: list[dict[str, Any]],
    *,
    numeric: list[str],
    categorical: list[str],
    external: list[str],
    label: Callable[[dict[str, Any]], int],
    minimum_class_rows: int,
    random_state: int,
) -> dict[str, Any]:
    train, validation, test = _split(rows)
    split = {
        "strategy": "chronological_60_20_20_by_label_date",
        "train_count": len(train),
        "validation_count": len(validation),
        "test_count": len(test),
        "train_project_ids_sha256": _ids_hash(train),
        "validation_project_ids_sha256": _ids_hash(validation),
        "test_project_ids_sha256": _ids_hash(test),
        "train_label_end": max(_as_date(row["label_date"]) for row in train).isoformat(),
        "test_label_start": min(_as_date(row["label_date"]) for row in test).isoformat(),
    }
    labels = [label(row) for row in rows]
    counts = {str(value): labels.count(value) for value in (0, 1)}
    omission = None
    if min(counts.values()) < minimum_class_rows or len({label(row) for row in train}) < 2:
        omission = f"Classification requires at least {minimum_class_rows} rows per class and both classes in training."
        return {"split": split, "class_counts": counts, "omission_reason": omission, "model_a": None, "model_b": None}
    result: dict[str, Any] = {"split": split, "class_counts": counts, "omission_reason": None}
    for model_key, external_features in (("model_a", []), ("model_b", external)):
        matrices = {
            "train": _matrix(train, numeric, categorical, external_features),
            "validation": _matrix(validation, numeric, categorical, external_features),
            "test": _matrix(test, numeric, categorical, external_features),
        }
        split_labels = {
            "train": [label(row) for row in train],
            "validation": [label(row) for row in validation],
            "test": [label(row) for row in test],
        }
        validation_metrics: dict[str, dict[str, float | None]] = {}
        fitted: dict[str, Pipeline] = {}
        for name, candidate in _classifiers(len(numeric), len(categorical), len(external_features), random_state).items():
            model = clone(candidate).fit(matrices["train"], split_labels["train"])
            validation_metrics[name] = _classification_metrics(
                model, matrices["validation"], split_labels["validation"]
            )
            fitted[name] = model
        selected = max(
            validation_metrics,
            key=lambda name: validation_metrics[name]["roc_auc"]
            if validation_metrics[name]["roc_auc"] is not None
            else validation_metrics[name]["f1"] or 0,
        )
        result[model_key] = {
            "selected_model": selected,
            "validation_candidates": validation_metrics,
            "test": _classification_metrics(fitted[selected], matrices["test"], split_labels["test"]),
        }
    return result


def _ids_hash(rows: list[dict[str, Any]]) -> str:
    ids = [str(row["project_id"]) for row in rows]
    return hashlib.sha256(json.dumps(ids, separators=(",", ":")).encode()).hexdigest()


def _fingerprint(cost_rows: list[dict[str, Any]], schedule_rows: list[dict[str, Any]]) -> str:
    records = []
    for task, rows in (("cost", cost_rows), ("schedule", schedule_rows)):
        for row in sorted(rows, key=lambda item: str(item["project_id"])):
            records.append({
                "task": task,
                "project_id": str(row["project_id"]),
                "snapshot_date": _as_date(row["snapshot_date"]).isoformat(),
                "label_date": _as_date(row["label_date"]).isoformat(),
                "external": row.get("external_features") or {},
                "external_provenance": row.get("external_provenance") or {},
            })
    return hashlib.sha256(json.dumps(records, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _metric_delta(model_a: dict[str, Any] | None, model_b: dict[str, Any] | None) -> dict[str, Any] | None:
    if not model_a or not model_b:
        return None
    a_test = model_a["test"]
    b_test = model_b["test"]
    result: dict[str, Any] = {}
    for name in sorted(set(a_test) & set(b_test)):
        if a_test[name] is None or b_test[name] is None:
            result[name] = {"model_a": a_test[name], "model_b": b_test[name], "difference_b_minus_a": None, "better": None}
            continue
        delta = float(b_test[name]) - float(a_test[name])
        lower_is_better = name in {"mae", "rmse"}
        better = "model_b" if (delta < 0 if lower_is_better else delta > 0) else "model_a" if delta != 0 else "tie"
        result[name] = {
            "model_a": float(a_test[name]),
            "model_b": float(b_test[name]),
            "difference_b_minus_a": delta,
            "better": better,
        }
    return result


def run_comparison(
    cost_rows: list[dict[str, Any]],
    schedule_rows: list[dict[str, Any]],
    definitions: list[dict[str, Any]],
    *,
    version: str,
    artifact_dir: Path,
    minimum_rows: int,
    minimum_class_rows: int,
    minimum_external_coverage: float,
    cost_overrun_threshold_pct: float,
    schedule_overrun_threshold_days: int,
    random_state: int,
) -> tuple[dict[str, Any], Path, str]:
    artifact_path = (artifact_dir / f"{EXPERIMENT_CODE}-{version}.json").resolve()
    if artifact_path.exists():
        raise ExperimentDataError(f"Experiment version '{version}' already exists and is immutable.")
    if any(row.get("is_synthetic") for row in cost_rows + schedule_rows):
        raise ExperimentDataError("Synthetic projects cannot be used in a measured comparison.")

    cost_coverage = _coverage(cost_rows, definitions)
    schedule_coverage = _coverage(schedule_rows, definitions)
    cost_training_coverage = _coverage(_training_partition(cost_rows), definitions) if cost_rows else []
    schedule_training_coverage = _coverage(_training_partition(schedule_rows), definitions) if schedule_rows else []
    eligible_cost = [item["code"] for item in cost_training_coverage if item["coverage"] >= minimum_external_coverage]
    eligible_schedule = [item["code"] for item in schedule_training_coverage if item["coverage"] >= minimum_external_coverage]
    limitations = [
        "External observations are observational inputs; this experiment does not establish causal effects.",
        "Missing external values are median-imputed within training partitions; coverage is reported per feature.",
        "Projects without validated as-of external observations remain in both A and B to preserve an identical cohort.",
    ]
    tasks: dict[str, Any] = {}

    if len(cost_rows) >= minimum_rows and eligible_cost:
        prepared = [{**row, "metric_target": float(row["target_final_cost"])} for row in cost_rows]
        tasks["cost_overrun"] = _fit_regression_pair(
            prepared,
            numeric=COST_NUMERIC,
            categorical=COST_CATEGORICAL,
            external=eligible_cost,
            target=lambda row: float(row["target_final_cost"]) / float(row["approved_cost"]),
            prediction_transform=lambda prediction, rows: np.maximum(0, prediction * np.asarray([float(row["approved_cost"]) for row in rows])),
            random_state=random_state,
        )
        tasks["cost_overrun"]["target"] = "final_project_cost"
    else:
        reason = f"Requires {minimum_rows} cost rows and at least one external feature with {minimum_external_coverage:.0%} coverage; found {len(cost_rows)} rows and {len(eligible_cost)} eligible features."
        tasks["cost_overrun"] = {"status": "insufficient_data", "reason": reason}
        limitations.append(reason)

    if len(schedule_rows) >= minimum_rows and eligible_schedule:
        prepared = [{**row, "metric_target": float(row["target_completion_variance_days"])} for row in schedule_rows]
        tasks["time_overrun"] = _fit_regression_pair(
            prepared,
            numeric=SCHEDULE_NUMERIC,
            categorical=SCHEDULE_CATEGORICAL,
            external=eligible_schedule,
            target=lambda row: float(row["target_completion_variance_days"]),
            prediction_transform=lambda prediction, _: prediction,
            random_state=random_state,
        )
        tasks["time_overrun"]["target"] = "completion_variance_days"
    else:
        reason = f"Requires {minimum_rows} schedule rows and at least one external feature with {minimum_external_coverage:.0%} coverage; found {len(schedule_rows)} rows and {len(eligible_schedule)} eligible features."
        tasks["time_overrun"] = {"status": "insufficient_data", "reason": reason}
        limitations.append(reason)

    schedule_by_project = {str(row["project_id"]): row for row in schedule_rows}
    risk_rows = []
    for cost_row in cost_rows:
        schedule_row = schedule_by_project.get(str(cost_row["project_id"]))
        if schedule_row is None:
            continue
        cost_pct = (float(cost_row["target_final_cost"]) / float(cost_row["approved_cost"]) - 1) * 100
        risk_rows.append({
            **cost_row,
            "label_date": max(_as_date(cost_row["label_date"]), _as_date(schedule_row["label_date"])),
            "risk_target": int(
                cost_pct >= cost_overrun_threshold_pct
                or float(schedule_row["target_completion_variance_days"]) > schedule_overrun_threshold_days
            ),
        })
    risk_coverage = _coverage(risk_rows, definitions)
    risk_training_coverage = _coverage(_training_partition(risk_rows), definitions) if risk_rows else []
    eligible_risk = [item["code"] for item in risk_training_coverage if item["coverage"] >= minimum_external_coverage]
    if len(risk_rows) >= minimum_rows and eligible_risk:
        tasks["risk_classification"] = _fit_classification_pair(
            risk_rows,
            numeric=COST_NUMERIC,
            categorical=COST_CATEGORICAL,
            external=eligible_risk,
            label=lambda row: int(row["risk_target"]),
            minimum_class_rows=minimum_class_rows,
            random_state=random_state,
        )
        tasks["risk_classification"]["target"] = (
            f"cost_escalation_at_least_{cost_overrun_threshold_pct:g}_pct_or_"
            f"completion_delay_greater_than_{schedule_overrun_threshold_days}_days"
        )
    else:
        reason = f"Requires {minimum_rows} projects with both labels and eligible external coverage; found {len(risk_rows)} rows and {len(eligible_risk)} eligible features."
        tasks["risk_classification"] = {"status": "insufficient_data", "reason": reason}
        limitations.append(reason)

    comparison = {
        task: _metric_delta(values.get("model_a"), values.get("model_b"))
        for task, values in tasks.items()
    }
    primary = [
        comparison.get("cost_overrun", {}).get("mae") if comparison.get("cost_overrun") else None,
        comparison.get("time_overrun", {}).get("mae") if comparison.get("time_overrun") else None,
        comparison.get("risk_classification", {}).get("f1") if comparison.get("risk_classification") else None,
    ]
    measured = [item for item in primary if item and item["difference_b_minus_a"] is not None]
    b_consistently_better = len(measured) == 3 and all(item["better"] == "model_b" for item in measured)
    conclusion = (
        "Model B improved all three primary held-out metrics in this experiment."
        if b_consistently_better
        else "No consistent measured CUF+ improvement is established by this experiment."
    )
    status = "completed" if measured else "insufficient_data"
    artifact = {
        "schema_version": SCHEMA_VERSION,
        "experiment_code": EXPERIMENT_CODE,
        "version": version,
        "status": status,
        "generated_at": datetime.now(UTC).isoformat(),
        "dataset_fingerprint_sha256": _fingerprint(cost_rows, schedule_rows),
        "methodology": {
            "cohort": "non-synthetic completed projects with leakage-safe historical CUF snapshots",
            "split": "chronological 60/20/20 train/validation/test; identical project partitions for A and B within each task",
            "random_state": random_state,
            "candidate_models": {
                "regression": ["ridge_regression", "random_forest_regressor"],
                "classification": ["logistic_regression", "random_forest_classifier"],
            },
            "selection": "lowest validation MAE for regression; highest validation AUC, falling back to F1, for classification",
            "external_as_of_rule": "validated observations with observation_date <= feature snapshot; latest valid observation per project and feature",
        },
        "feature_sets": {
            "model_a": {
                "cost": COST_NUMERIC + COST_CATEGORICAL,
                "schedule": SCHEDULE_NUMERIC + SCHEDULE_CATEGORICAL,
                "risk": COST_NUMERIC + COST_CATEGORICAL,
            },
            "model_b_external": {
                "cost": eligible_cost,
                "schedule": eligible_schedule,
                "risk": eligible_risk,
            },
            "leakage_exclusions": {
                "cost": COST_LEAKAGE_EXCLUSIONS,
                "schedule": SCHEDULE_LEAKAGE_EXCLUSIONS,
            },
        },
        "feature_coverage": {
            "cost": cost_coverage,
            "schedule": schedule_coverage,
            "risk": risk_coverage,
            "minimum_eligible_coverage": minimum_external_coverage,
            "eligibility_basis": "chronological_training_partition_only",
            "training_partition": {
                "cost": cost_training_coverage,
                "schedule": schedule_training_coverage,
                "risk": risk_training_coverage,
            },
        },
        "metrics": tasks,
        "comparison": comparison,
        "conclusion": conclusion,
        "model_b_improvement_supported": b_consistently_better,
        "limitations": list(dict.fromkeys(limitations)),
        "software": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scikit_learn": sklearn.__version__,
        },
    }
    artifact_dir.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(artifact, indent=2, sort_keys=True, default=str).encode()
    temporary = artifact_path.with_suffix(".json.tmp")
    temporary.write_bytes(serialized)
    temporary.replace(artifact_path)
    checksum = hashlib.sha256(serialized).hexdigest()
    return artifact, artifact_path, checksum
