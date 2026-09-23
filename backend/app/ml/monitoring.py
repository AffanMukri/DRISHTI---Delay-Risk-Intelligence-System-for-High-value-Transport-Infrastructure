from __future__ import annotations

import math
from collections import Counter
from typing import Any

import numpy as np
from scipy.stats import chi2_contingency, ks_2samp
from sklearn.metrics import (
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)


MISSING_CATEGORY = "Not reported"


def _finite(values: list[Any]) -> list[float]:
    result: list[float] = []
    for value in values:
        if value is None:
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            result.append(number)
    return result


def _severity(*, drift: bool, warning: bool) -> str:
    if drift:
        return "drift_detected"
    if warning:
        return "watch"
    return "stable"


def numeric_drift(
    reference_values: list[Any],
    current_values: list[Any],
    *,
    minimum_samples: int,
    psi_warning: float,
    psi_critical: float,
    significance_level: float,
) -> dict[str, Any]:
    reference = np.asarray(_finite(reference_values), dtype=float)
    current = np.asarray(_finite(current_values), dtype=float)
    base = {
        "kind": "numeric",
        "reference_count": int(reference.size),
        "current_count": int(current.size),
    }
    if reference.size < minimum_samples or current.size < minimum_samples:
        return {
            **base,
            "status": "insufficient_data",
            "reason": f"Requires at least {minimum_samples} non-missing values in both samples.",
            "psi": None,
            "ks_statistic": None,
            "p_value": None,
        }
    if np.unique(reference).size < 2:
        return {
            **base,
            "status": "insufficient_data",
            "reason": "The training reference has no measurable numeric variation.",
            "psi": None,
            "ks_statistic": None,
            "p_value": None,
        }

    quantiles = np.unique(np.quantile(reference, np.linspace(0, 1, 11)))
    if quantiles.size < 3:
        return {
            **base,
            "status": "insufficient_data",
            "reason": "The training reference does not support stable PSI bins.",
            "psi": None,
            "ks_statistic": None,
            "p_value": None,
        }
    bins = quantiles.copy()
    bins[0] = -np.inf
    bins[-1] = np.inf
    ref_counts, _ = np.histogram(reference, bins=bins)
    cur_counts, _ = np.histogram(current, bins=bins)
    epsilon = 1e-6
    ref_share = np.maximum(ref_counts / reference.size, epsilon)
    cur_share = np.maximum(cur_counts / current.size, epsilon)
    psi = float(np.sum((cur_share - ref_share) * np.log(cur_share / ref_share)))
    ks = ks_2samp(reference, current, alternative="two-sided", method="auto")
    statistically_different = float(ks.pvalue) < significance_level
    status = _severity(
        drift=psi >= psi_critical and statistically_different,
        warning=psi >= psi_warning or statistically_different,
    )
    return {
        **base,
        "status": status,
        "reason": None,
        "psi": psi,
        "ks_statistic": float(ks.statistic),
        "p_value": float(ks.pvalue),
        "reference_mean": float(np.mean(reference)),
        "current_mean": float(np.mean(current)),
        "reference_median": float(np.median(reference)),
        "current_median": float(np.median(current)),
        "test": "PSI with training-decile bins and two-sample Kolmogorov-Smirnov",
    }


def categorical_drift(
    reference_counts: dict[str, Any],
    current_values: list[Any],
    *,
    minimum_samples: int,
    significance_level: float,
) -> dict[str, Any]:
    reference = Counter({str(key): int(value) for key, value in reference_counts.items() if int(value) > 0})
    current = Counter(str(value) for value in current_values if value not in (None, "", MISSING_CATEGORY))
    reference.pop(MISSING_CATEGORY, None)
    base = {
        "kind": "categorical",
        "reference_count": sum(reference.values()),
        "current_count": sum(current.values()),
    }
    if base["reference_count"] < minimum_samples or base["current_count"] < minimum_samples:
        return {
            **base,
            "status": "insufficient_data",
            "reason": f"Requires at least {minimum_samples} non-missing values in both samples.",
            "chi_square": None,
            "p_value": None,
            "cramers_v": None,
        }
    categories = sorted(set(reference) | set(current))
    frequent = [category for category in categories if reference[category] + current[category] >= 5]
    rare = set(categories) - set(frequent)
    if rare:
        reference["__OTHER__"] = sum(reference[item] for item in rare)
        current["__OTHER__"] = sum(current[item] for item in rare)
    categories = frequent + (["__OTHER__"] if rare else [])
    categories = [category for category in categories if reference[category] + current[category] > 0]
    if len(categories) < 2:
        return {
            **base,
            "status": "insufficient_data",
            "reason": "At least two sufficiently represented categories are required.",
            "chi_square": None,
            "p_value": None,
            "cramers_v": None,
        }
    table = np.asarray([
        [reference[category] for category in categories],
        [current[category] for category in categories],
    ], dtype=float)
    chi_square, p_value, _, expected = chi2_contingency(table)
    if np.any(expected < 5):
        return {
            **base,
            "status": "insufficient_data",
            "reason": "Expected category counts are too small for a defensible chi-square test.",
            "chi_square": None,
            "p_value": None,
            "cramers_v": None,
        }
    total = float(table.sum())
    cramers_v = math.sqrt(float(chi_square) / total) if total else 0.0
    significant = float(p_value) < significance_level
    return {
        **base,
        "status": _severity(drift=significant and cramers_v >= 0.20, warning=significant and cramers_v >= 0.10),
        "reason": None,
        "chi_square": float(chi_square),
        "p_value": float(p_value),
        "cramers_v": cramers_v,
        "categories_tested": categories,
        "test": "Pearson chi-square with Cramer's V effect size",
    }


def missingness_change(
    *,
    reference_total: int,
    reference_present: int,
    current_values: list[Any],
    categorical: bool,
    minimum_samples: int,
    significance_level: float,
) -> dict[str, Any]:
    current_total = len(current_values)
    current_present = sum(
        value not in (None, "") and (not categorical or value != MISSING_CATEGORY)
        for value in current_values
    )
    reference_missing = max(0, reference_total - reference_present)
    current_missing = max(0, current_total - current_present)
    base = {
        "reference_count": reference_total,
        "current_count": current_total,
        "reference_missing_rate": reference_missing / reference_total if reference_total else None,
        "current_missing_rate": current_missing / current_total if current_total else None,
    }
    if reference_total < minimum_samples or current_total < minimum_samples:
        return {
            **base,
            "status": "insufficient_data",
            "reason": f"Requires at least {minimum_samples} feature snapshots in both samples.",
            "rate_change": None,
            "p_value": None,
        }
    table = np.asarray([
        [reference_present, reference_missing],
        [current_present, current_missing],
    ], dtype=float)
    if np.any(table.sum(axis=0) == 0):
        rate_change = float(base["current_missing_rate"] or 0) - float(base["reference_missing_rate"] or 0)
        return {
            **base,
            "status": "stable" if rate_change == 0 else "insufficient_data",
            "reason": None if rate_change == 0 else "A zero expected cell prevents a defensible missingness test.",
            "rate_change": rate_change if rate_change == 0 else None,
            "p_value": 1.0 if rate_change == 0 else None,
        }
    chi_square, p_value, _, expected = chi2_contingency(table, correction=False)
    if np.any(expected < 5):
        return {
            **base,
            "status": "insufficient_data",
            "reason": "Expected present/missing counts are too small for a defensible test.",
            "rate_change": None,
            "p_value": None,
        }
    rate_change = float(base["current_missing_rate"] or 0) - float(base["reference_missing_rate"] or 0)
    significant = float(p_value) < significance_level
    return {
        **base,
        "status": _severity(
            drift=significant and rate_change >= 0.20,
            warning=significant and rate_change >= 0.10,
        ),
        "reason": None,
        "rate_change": rate_change,
        "chi_square": float(chi_square),
        "p_value": float(p_value),
        "test": "Pearson chi-square on present versus missing counts",
    }


def regression_performance(
    predicted: list[Any],
    actual: list[Any],
    *,
    minimum_samples: int,
    baseline_metrics: dict[str, Any] | None,
    degradation_ratio: float,
) -> dict[str, Any]:
    pairs = [
        (float(prediction), float(outcome))
        for prediction, outcome in zip(predicted, actual, strict=True)
        if prediction is not None and outcome is not None
        and math.isfinite(float(prediction)) and math.isfinite(float(outcome))
    ]
    if len(pairs) < minimum_samples:
        return {
            "status": "insufficient_data",
            "evaluated_count": len(pairs),
            "reason": f"Requires at least {minimum_samples} predictions with realized numeric outcomes.",
            "metrics": None,
            "baseline": baseline_metrics,
        }
    predictions = np.asarray([item[0] for item in pairs])
    outcomes = np.asarray([item[1] for item in pairs])
    metrics = {
        "mae": float(mean_absolute_error(outcomes, predictions)),
        "rmse": float(math.sqrt(mean_squared_error(outcomes, predictions))),
        "r2": float(r2_score(outcomes, predictions)),
    }
    baseline_mae = float((baseline_metrics or {}).get("mae") or 0)
    degraded = baseline_mae > 0 and metrics["mae"] > baseline_mae * degradation_ratio
    return {
        "status": "degraded" if degraded else "stable" if baseline_mae > 0 else "observed_no_baseline",
        "evaluated_count": len(pairs),
        "reason": None if baseline_mae > 0 else "Realized performance is available, but no comparable training-test MAE was registered.",
        "metrics": metrics,
        "baseline": baseline_metrics,
        "degradation_ratio_threshold": degradation_ratio,
        "mae_ratio_to_baseline": metrics["mae"] / baseline_mae if baseline_mae > 0 else None,
    }


def classification_performance(
    predicted_probability: list[Any],
    predicted_class: list[Any],
    actual_class: list[Any],
    *,
    positive_class: str,
    minimum_samples: int,
    baseline_metrics: dict[str, Any] | None,
) -> dict[str, Any]:
    rows = [
        (float(probability), str(prediction), str(actual))
        for probability, prediction, actual in zip(
            predicted_probability, predicted_class, actual_class, strict=True
        )
        if probability is not None and prediction is not None and actual is not None
    ]
    labels = [int(actual == positive_class) for _, _, actual in rows]
    if len(rows) < minimum_samples or len(set(labels)) < 2:
        return {
            "status": "insufficient_data",
            "evaluated_count": len(rows),
            "reason": f"Requires at least {minimum_samples} evaluated classifications and both outcome classes.",
            "metrics": None,
            "baseline": baseline_metrics,
        }
    predictions = [int(prediction == positive_class) for _, prediction, _ in rows]
    probabilities = [probability / 100 if probability > 1 else probability for probability, _, _ in rows]
    metrics = {
        "precision": float(precision_score(labels, predictions, zero_division=0)),
        "recall": float(recall_score(labels, predictions, zero_division=0)),
        "f1": float(f1_score(labels, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(labels, probabilities)),
    }
    baseline_f1 = float((baseline_metrics or {}).get("f1") or 0)
    degraded = baseline_f1 > 0 and metrics["f1"] < baseline_f1 * 0.80
    return {
        "status": "degraded" if degraded else "stable" if baseline_f1 > 0 else "observed_no_baseline",
        "evaluated_count": len(rows),
        "reason": None if baseline_f1 > 0 else "Realized performance is available, but no comparable training-test F1 was registered.",
        "metrics": metrics,
        "baseline": baseline_metrics,
        "f1_ratio_to_baseline": metrics["f1"] / baseline_f1 if baseline_f1 > 0 else None,
    }
