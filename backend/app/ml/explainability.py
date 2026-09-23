from __future__ import annotations

from collections import Counter
from importlib.metadata import PackageNotFoundError, version as package_version
from typing import Any, Callable, Literal

import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import Pipeline


EXPLANATION_VERSION = "shap-v1"
MAX_BACKGROUND_ROWS = 64
MIN_SECTOR_REFERENCE_ROWS = 10

FEATURE_LABELS = {
    "approved_cost": "Approved project cost",
    "original_approved_cost": "Original approved cost",
    "planned_duration_days": "Planned project duration",
    "elapsed_days": "Elapsed project duration",
    "elapsed_duration_pct": "Elapsed duration",
    "physical_progress": "Physical progress",
    "planned_progress": "Planned physical progress",
    "progress_variance": "Physical progress variance",
    "previous_physical_progress": "Previous physical progress",
    "previous_planned_progress": "Previous planned progress",
    "monthly_progress_velocity": "Monthly progress velocity",
    "expenditure_to_approved_pct": "Expenditure against approved cost",
    "schedule_slippage_days": "Reported schedule slippage",
    "reported_delay_days": "Reported delay",
    "milestone_completion_pct": "Milestone completion",
    "milestone_slippage_pct": "Milestone slippage",
    "milestone_delay_pct": "Delayed milestones",
    "land_acquisition_progress": "Land acquisition progress",
    "clearance_completion_pct": "Clearance completion",
    "clearance_pending_count": "Pending clearances",
    "issue_count": "Open issue count",
    "start_year": "Project start year",
    "snapshot_year": "Monitoring year",
    "sector": "Sector",
    "project_type": "Project type",
    "ministry": "Ministry",
    "implementing_agency": "Implementing agency",
    "state": "State",
    "contract_status": "Contract status",
    "clearance_risk_status": "Clearance status",
}

FEATURE_UNITS = {
    "approved_cost": "crore_inr",
    "original_approved_cost": "crore_inr",
    "planned_duration_days": "days",
    "elapsed_days": "days",
    "elapsed_duration_pct": "percent",
    "physical_progress": "percent",
    "planned_progress": "percent",
    "progress_variance": "percentage_points",
    "previous_physical_progress": "percent",
    "previous_planned_progress": "percent",
    "monthly_progress_velocity": "percentage_points_per_month",
    "expenditure_to_approved_pct": "percent",
    "schedule_slippage_days": "days",
    "reported_delay_days": "days",
    "milestone_completion_pct": "percent",
    "milestone_slippage_pct": "percent",
    "milestone_delay_pct": "percent",
    "land_acquisition_progress": "percent",
    "clearance_completion_pct": "percent",
    "clearance_pending_count": "count",
    "issue_count": "count",
    "start_year": "year",
    "snapshot_year": "year",
}


def _dense(value: Any) -> np.ndarray:
    if hasattr(value, "toarray"):
        value = value.toarray()
    return np.asarray(value, dtype=float)


def _sample_evenly(rows: list[dict[str, Any]], maximum: int = MAX_BACKGROUND_ROWS) -> list[dict[str, Any]]:
    if len(rows) <= maximum:
        return rows
    indexes = np.linspace(0, len(rows) - 1, maximum, dtype=int)
    return [rows[int(index)] for index in indexes]


def transformed_background(
    pipeline: Pipeline | None,
    rows: list[dict[str, Any]],
    matrix_builder: Callable[[list[dict[str, Any]]], list[list[Any]]],
) -> np.ndarray | None:
    if pipeline is None:
        return None
    sample = _sample_evenly(rows)
    transformed = pipeline.named_steps["preprocess"].transform(matrix_builder(sample))
    return _dense(transformed)


def _numeric_reference(rows: list[dict[str, Any]], feature: str) -> dict[str, Any]:
    values = sorted(float(row[feature]) for row in rows if row.get(feature) is not None)
    if not values:
        return {"kind": "numeric", "count": 0, "values": []}
    array = np.asarray(values, dtype=float)
    return {
        "kind": "numeric",
        "count": len(values),
        "median": float(np.median(array)),
        "p25": float(np.quantile(array, 0.25)),
        "p75": float(np.quantile(array, 0.75)),
        "values": values,
    }


def _categorical_reference(rows: list[dict[str, Any]], feature: str) -> dict[str, Any]:
    values = [str(row.get(feature) or "Not reported") for row in rows]
    counts = Counter(values)
    mode, mode_count = counts.most_common(1)[0] if counts else ("Not reported", 0)
    return {
        "kind": "categorical",
        "count": len(values),
        "mode": mode,
        "modeShare": mode_count / len(values) if values else 0,
        "counts": dict(counts),
    }


def _cohort_reference(
    rows: list[dict[str, Any]],
    numeric_features: list[str],
    categorical_features: list[str],
) -> dict[str, Any]:
    return {
        "count": len(rows),
        "features": {
            **{feature: _numeric_reference(rows, feature) for feature in numeric_features},
            **{feature: _categorical_reference(rows, feature) for feature in categorical_features},
        },
    }


def build_explanation_metadata(
    *,
    regression_pipeline: Pipeline,
    classification_pipeline: Pipeline | None,
    training_rows: list[dict[str, Any]],
    matrix_builder: Callable[[list[dict[str, Any]]], list[list[Any]]],
    numeric_features: list[str],
    categorical_features: list[str],
) -> dict[str, Any]:
    sectors = sorted({str(row.get("sector") or "Not reported") for row in training_rows})
    try:
        shap_version = package_version("shap")
    except PackageNotFoundError:  # pragma: no cover - training dependency guard
        shap_version = "unavailable"
    return {
        "version": EXPLANATION_VERSION,
        "shapVersion": shap_version,
        "backgroundDefinition": "Evenly sampled rows from the chronological training partition after fitted preprocessing.",
        "regressionBackground": transformed_background(regression_pipeline, training_rows, matrix_builder),
        "classificationBackground": transformed_background(classification_pipeline, training_rows, matrix_builder),
        "historicalReference": {
            "global": _cohort_reference(training_rows, numeric_features, categorical_features),
            "bySector": {
                sector: _cohort_reference(
                    [row for row in training_rows if str(row.get("sector") or "Not reported") == sector],
                    numeric_features,
                    categorical_features,
                )
                for sector in sectors
            },
        },
    }


def _transformed_origins(
    pipeline: Pipeline,
    numeric_features: list[str],
    categorical_features: list[str],
) -> list[str]:
    preprocessor = pipeline.named_steps["preprocess"]
    encoder = preprocessor.named_transformers_["categorical"].named_steps["one_hot"]
    origins = list(numeric_features)
    for feature, categories in zip(categorical_features, encoder.categories_, strict=True):
        origins.extend([feature] * len(categories))
    return origins


def _extract_explanation(explanation: Any, *, positive_class: bool) -> tuple[np.ndarray, float]:
    values = np.asarray(explanation.values, dtype=float)
    base = np.asarray(explanation.base_values, dtype=float)
    if positive_class and values.ndim == 3:
        values = values[:, :, 1]
    if positive_class and base.ndim >= 2:
        base = base[:, 1]
    return values.reshape(values.shape[0], -1)[0], float(base.reshape(-1)[0])


def _shap_values(
    pipeline: Pipeline,
    background: np.ndarray,
    transformed_row: np.ndarray,
    *,
    classification: bool,
) -> tuple[np.ndarray, float, float, str]:
    try:
        import shap
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("The SHAP runtime dependency is not installed.") from exc

    model = pipeline.named_steps["model"]
    if isinstance(model, (RandomForestClassifier, RandomForestRegressor)):
        explainer = shap.TreeExplainer(
            model,
            data=background,
            feature_perturbation="interventional",
            model_output="probability" if classification else "raw",
        )
        explanation = explainer(transformed_row, check_additivity=False)
        values, base = _extract_explanation(explanation, positive_class=classification)
        output = float(model.predict_proba(transformed_row)[0, 1]) if classification else float(model.predict(transformed_row)[0])
        return values, base, output, "TreeExplainer"
    if isinstance(model, Ridge) and not classification:
        explanation = shap.LinearExplainer(model, background)(transformed_row)
        values, base = _extract_explanation(explanation, positive_class=False)
        return values, base, float(model.predict(transformed_row)[0]), "LinearExplainer"
    if isinstance(model, LogisticRegression) and classification:
        predict_probability = lambda matrix: model.predict_proba(matrix)[:, 1]
        explainer = shap.Explainer(
            predict_probability,
            background,
            algorithm="permutation",
            seed=42,
        )
        explanation = explainer(
            transformed_row,
            max_evals=max(2 * transformed_row.shape[1] + 1, 101),
            silent=True,
        )
        values, base = _extract_explanation(explanation, positive_class=False)
        return values, base, float(predict_probability(transformed_row)[0]), "PermutationExplainer"
    raise RuntimeError(f"SHAP explanation is not implemented for estimator {type(model).__name__}.")


def _historical_cohort(metadata: dict[str, Any], feature_values: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    reference = metadata["historicalReference"]
    sector = str(feature_values.get("sector") or "Not reported")
    sector_reference = reference.get("bySector", {}).get(sector)
    if sector_reference and int(sector_reference.get("count", 0)) >= MIN_SECTOR_REFERENCE_ROWS:
        return f"historical training projects in {sector}", sector_reference
    return "all historical training projects", reference["global"]


def _comparison(feature: str, actual: Any, cohort_name: str, cohort: dict[str, Any]) -> dict[str, Any] | None:
    reference = cohort.get("features", {}).get(feature)
    if not reference or not reference.get("count"):
        return None
    if reference["kind"] == "numeric" and actual is not None:
        actual_number = float(actual)
        values = reference["values"]
        percentile = sum(value <= actual_number for value in values) / len(values) * 100
        median = float(reference["median"])
        return {
            "feature": feature,
            "featureLabel": FEATURE_LABELS.get(feature, feature.replace("_", " ").title()),
            "actualValue": actual_number,
            "referenceValue": median,
            "percentile": round(percentile, 2),
            "unit": FEATURE_UNITS.get(feature),
            "cohort": cohort_name,
            "cohortSize": int(cohort["count"]),
            "explanation": f"Current value is {actual_number:g}; the {cohort_name} median is {median:g} (approximately the {percentile:.0f}th percentile).",
        }
    actual_text = str(actual or "Not reported")
    count = int(reference.get("counts", {}).get(actual_text, 0))
    prevalence = count / int(reference["count"]) * 100
    return {
        "feature": feature,
        "featureLabel": FEATURE_LABELS.get(feature, feature.replace("_", " ").title()),
        "actualValue": actual_text,
        "referenceValue": reference.get("mode"),
        "percentile": None,
        "prevalencePct": round(prevalence, 2),
        "unit": None,
        "cohort": cohort_name,
        "cohortSize": int(cohort["count"]),
        "explanation": f"Value '{actual_text}' occurs in {prevalence:.1f}% of {cohort_name}; the most common value is '{reference.get('mode')}'.",
    }


def _rule_triggers(feature_values: dict[str, Any], prediction_kind: Literal["cost", "schedule"]) -> list[dict[str, Any]]:
    candidates = [
        ("progress_variance", lambda value: value < 0, "RULE_PROGRESS_BEHIND_PLAN", "Actual physical progress is below plan."),
        ("land_acquisition_progress", lambda value: value < 100, "RULE_LAND_INCOMPLETE", "Land acquisition is incomplete."),
        ("issue_count", lambda value: value > 0, "RULE_OPEN_ISSUES", "Open implementation issues are reported."),
    ]
    if prediction_kind == "cost":
        candidates += [
            ("schedule_slippage_days", lambda value: value > 0, "RULE_SCHEDULE_SLIPPAGE", "Positive schedule slippage can increase execution cost exposure."),
            ("milestone_slippage_pct", lambda value: value > 0, "RULE_MILESTONE_SLIPPAGE", "A share of monitored milestones is delayed or at risk."),
        ]
    else:
        candidates += [
            ("reported_delay_days", lambda value: value > 0, "RULE_REPORTED_DELAY", "The latest monitoring return already reports delay."),
            ("milestone_delay_pct", lambda value: value > 0, "RULE_MILESTONE_DELAY", "A share of monitored milestones is delayed."),
            ("clearance_pending_count", lambda value: value > 0, "RULE_CLEARANCES_PENDING", "Statutory or administrative clearances remain pending."),
        ]
    triggers = []
    for feature, predicate, rule_id, explanation in candidates:
        raw = feature_values.get(feature)
        if raw is None:
            continue
        number = float(raw)
        if predicate(number):
            triggers.append({
                "ruleId": rule_id,
                "feature": feature,
                "featureLabel": FEATURE_LABELS.get(feature, feature.replace("_", " ").title()),
                "actualValue": number,
                "unit": FEATURE_UNITS.get(feature),
                "explanation": explanation,
            })
    return triggers


def unavailable_explanation(reason: str) -> dict[str, Any]:
    return {
        "version": EXPLANATION_VERSION,
        "ml": {"available": False, "method": "SHAP", "reason": reason, "positiveDrivers": [], "protectiveDrivers": [], "contributions": []},
        "rules": {"method": "deterministic_thresholds", "triggers": []},
        "historical": {"method": "training_cohort_comparison", "available": False, "reason": reason, "comparisons": []},
    }


def explain_prediction(
    *,
    artifact: dict[str, Any],
    normalized_features: dict[str, Any],
    matrix: list[list[Any]],
    numeric_features: list[str],
    categorical_features: list[str],
    prediction_kind: Literal["cost", "schedule"],
) -> dict[str, Any]:
    metadata = artifact.get("explanation_metadata")
    if not metadata:
        return unavailable_explanation("This model artifact predates SHAP background metadata; retrain under the current pipeline to enable numerical explanations.")
    classifier = artifact.get("classification_pipeline")
    classification = classifier is not None and metadata.get("classificationBackground") is not None
    pipeline = classifier if classification else artifact["regression_pipeline"]
    background_key = "classificationBackground" if classification else "regressionBackground"
    background = _dense(metadata[background_key])
    transformed_row = _dense(pipeline.named_steps["preprocess"].transform(matrix))
    values, base, model_output, explainer_name = _shap_values(
        pipeline, background, transformed_row, classification=classification
    )
    origins = _transformed_origins(pipeline, numeric_features, categorical_features)
    if len(origins) != len(values):
        return unavailable_explanation("The fitted preprocessor output no longer matches the registered feature schema.")
    grouped = {feature: 0.0 for feature in numeric_features + categorical_features}
    for origin, value in zip(origins, values, strict=True):
        grouped[origin] += float(value)

    if classification:
        target = f"significant_{prediction_kind}_overrun_probability"
        target_label = f"{prediction_kind} overrun probability"
        output_unit = "probability_percentage_points"
        scale = 100.0
        scaled_base = base * scale
        scaled_output = model_output * scale
    elif prediction_kind == "cost":
        target = "predicted_cost_escalation_percentage"
        target_label = "predicted cost escalation"
        output_unit = "percentage_points"
        scale = 100.0
        scaled_base = (base - 1) * scale
        scaled_output = (model_output - 1) * scale
    else:
        target = "raw_model_completion_variance_days"
        target_label = "modelled completion variance"
        output_unit = "days"
        scale = 1.0
        scaled_base = base
        scaled_output = model_output

    cohort_name, cohort = _historical_cohort(metadata, normalized_features)
    contributions = []
    for feature, raw_contribution in grouped.items():
        contribution = raw_contribution * scale
        comparison = _comparison(feature, normalized_features.get(feature), cohort_name, cohort)
        direction = "risk_increasing" if contribution > 0 else "protective" if contribution < 0 else "neutral"
        label = FEATURE_LABELS.get(feature, feature.replace("_", " ").title())
        effect = "increases" if contribution > 0 else "reduces" if contribution < 0 else "does not materially change"
        contributions.append({
            "feature": feature,
            "featureLabel": label,
            "actualValue": normalized_features.get(feature),
            "featureUnit": FEATURE_UNITS.get(feature),
            "contribution": round(contribution, 6),
            "contributionUnit": output_unit,
            "direction": direction,
            "humanExplanation": f"{label} at the observed value {effect} the {target_label} relative to the SHAP background baseline.",
            "historicalComparison": comparison,
        })
    contributions.sort(key=lambda item: abs(float(item["contribution"])), reverse=True)
    positive = sorted((item for item in contributions if item["contribution"] > 0), key=lambda item: item["contribution"], reverse=True)[:5]
    protective = sorted((item for item in contributions if item["contribution"] < 0), key=lambda item: item["contribution"])[:5]
    historical_comparisons = [item["historicalComparison"] for item in contributions[:6] if item["historicalComparison"]]
    residual = scaled_output - (scaled_base + sum(item["contribution"] for item in contributions))
    return {
        "version": EXPLANATION_VERSION,
        "ml": {
            "available": True,
            "method": "SHAP",
            "explainer": explainer_name,
            "libraryVersion": metadata.get("shapVersion"),
            "modelName": artifact["model_name"],
            "modelVersion": artifact["model_version"],
            "modelOutput": "classification_probability" if classification else "regression_output",
            "target": target,
            "targetLabel": target_label,
            "outputUnit": output_unit,
            "baseValue": round(scaled_base, 6),
            "predictionValue": round(scaled_output, 6),
            "additivityResidual": round(residual, 9),
            "positiveDrivers": positive,
            "protectiveDrivers": protective,
            "contributions": contributions,
            "numericalSource": "SHAP values calculated from the registered fitted estimator; human text is deterministic template output.",
            "backgroundDefinition": metadata.get("backgroundDefinition"),
        },
        "rules": {"method": "deterministic_thresholds", "triggers": _rule_triggers(normalized_features, prediction_kind)},
        "historical": {
            "method": "training_cohort_comparison",
            "available": True,
            "cohort": cohort_name,
            "cohortSize": int(cohort["count"]),
            "comparisons": historical_comparisons,
        },
    }
