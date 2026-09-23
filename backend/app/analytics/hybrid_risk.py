from __future__ import annotations

from dataclasses import dataclass
from math import floor
from typing import Any, Iterable

from app.config import Settings


RULE_VERSION = "deterministic-risk-v1"
STATISTICAL_VERSION = "peer-percentile-v1"
ENSEMBLE_VERSION = "hybrid-risk-v1"


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _rounded(value: float) -> float:
    """Match the existing JavaScript Math.round behavior for non-negative scores."""
    return float(floor(_clamp(value) + 0.5))


def _number(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
        return result if result == result else default
    except (TypeError, ValueError):
        return default


def _weighted(values: dict[str, float | None], weights: dict[str, float]) -> tuple[float | None, dict[str, float]]:
    available = {name: weights[name] for name, value in values.items() if value is not None and weights.get(name, 0) > 0}
    denominator = sum(available.values())
    if denominator <= 0:
        return None, {}
    effective = {name: weight / denominator for name, weight in available.items()}
    score = sum(_number(values[name]) * weight for name, weight in effective.items())
    return _rounded(score), effective


@dataclass(frozen=True)
class RiskConfiguration:
    ensemble_weights: dict[str, float]
    factor_weights: dict[str, float]
    domain_weights: dict[str, dict[str, float]]
    saturation: dict[str, float]
    thresholds: dict[str, float]
    driver_thresholds: dict[str, float]
    statistical_min_peers: int
    ml_signal_weights: dict[str, float]

    @classmethod
    def from_settings(cls, settings: Settings) -> "RiskConfiguration":
        return cls(
            ensemble_weights={
                "rule": settings.risk_ensemble_rule_weight,
                "statistical": settings.risk_ensemble_statistical_weight,
                "ml": settings.risk_ensemble_ml_weight,
            },
            factor_weights={
                "progress": settings.risk_rule_progress_weight,
                "cost": settings.risk_rule_cost_weight,
                "schedule": settings.risk_rule_schedule_weight,
                "milestone": settings.risk_rule_milestone_weight,
                "expenditure": settings.risk_rule_expenditure_weight,
            },
            domain_weights={
                "cost": {
                    "cost": settings.risk_cost_domain_cost_weight,
                    "progress": settings.risk_cost_domain_progress_weight,
                    "schedule": settings.risk_cost_domain_schedule_weight,
                },
                "schedule": {
                    "schedule": settings.risk_schedule_domain_schedule_weight,
                    "milestone": settings.risk_schedule_domain_milestone_weight,
                    "progress": settings.risk_schedule_domain_progress_weight,
                },
                "implementation": {
                    "progress": settings.risk_implementation_domain_progress_weight,
                    "milestone": settings.risk_implementation_domain_milestone_weight,
                    "expenditure": settings.risk_implementation_domain_expenditure_weight,
                },
            },
            saturation={
                "progress_gap_pp": settings.risk_progress_gap_saturation_pp,
                "cost_overrun_pct": settings.risk_cost_overrun_saturation_pct,
                "schedule_delay_days": settings.risk_schedule_delay_saturation_days,
                "expenditure_gap_pp": settings.risk_expenditure_gap_saturation_pp,
            },
            thresholds={
                "watch": settings.risk_level_watch_threshold,
                "high": settings.risk_level_high_threshold,
                "critical": settings.risk_level_critical_threshold,
            },
            driver_thresholds={
                "medium": settings.risk_driver_medium_threshold,
                "high": settings.risk_driver_high_threshold,
            },
            statistical_min_peers=settings.risk_statistical_min_peer_count,
            ml_signal_weights={"cost": settings.risk_ml_cost_weight, "schedule": settings.risk_ml_schedule_weight},
        )

    def public_document(self) -> dict[str, Any]:
        return {
            "strategyVersion": ENSEMBLE_VERSION,
            "configuredWeights": self.ensemble_weights,
            "ruleFactorWeights": self.factor_weights,
            "domainWeights": self.domain_weights,
            "saturationThresholds": self.saturation,
            "riskLevelThresholds": self.thresholds,
            "statisticalMinimumPeers": self.statistical_min_peers,
            "mlSignalWeights": self.ml_signal_weights,
            "missingSignalPolicy": "Renormalize configured weights across available components; never replace an unavailable signal with zero.",
            "rationale": {
                "rule": "50% preserves continuity with the audited deterministic score and keeps certified monitoring data primary.",
                "statistical": "25% adds historical peer context without allowing cohort composition to dominate the score.",
                "ml": "25% treats genuine versioned model outputs as an advisory signal; synthetic or missing outputs are excluded.",
            },
        }


def _risk_level(score: float, config: RiskConfiguration) -> str:
    if score >= config.thresholds["critical"]:
        return "critical"
    if score >= config.thresholds["high"]:
        return "high_risk"
    if score >= config.thresholds["watch"]:
        return "watch"
    return "healthy"


def _impact(value: float, config: RiskConfiguration) -> str:
    if value >= config.driver_thresholds["high"]:
        return "high"
    if value >= config.driver_thresholds["medium"]:
        return "medium"
    return "low"


def _raw_indicators(row: dict[str, Any]) -> dict[str, float]:
    approved = _number(row.get("approved_cost"))
    revised = _number(row.get("revised_cost"))
    physical = _number(row.get("physical_progress"))
    planned = _number(row.get("planned_progress"))
    financial = _number(row.get("financial_progress"))
    total = int(_number(row.get("milestones_total")))
    troubled = int(_number(row.get("milestones_delayed"))) + int(_number(row.get("milestones_at_risk")))
    return {
        "progress": max(0.0, planned - physical),
        "cost": max(0.0, ((revised - approved) / approved) * 100) if approved > 0 else 0.0,
        "schedule": max(0.0, _number(row.get("delay_days"))),
        "milestone": (troubled / total * 100) if total > 0 else 50.0,
        "expenditure": max(0.0, financial - physical),
    }


def _domains(factors: dict[str, float | None], config: RiskConfiguration) -> dict[str, float | None]:
    return {domain: _weighted(factors, weights)[0] for domain, weights in config.domain_weights.items()}


def rule_component(row: dict[str, Any], config: RiskConfiguration) -> dict[str, Any]:
    raw = _raw_indicators(row)
    factors = {
        "progress": _clamp(raw["progress"] / config.saturation["progress_gap_pp"] * 100),
        "cost": _clamp(raw["cost"] / config.saturation["cost_overrun_pct"] * 100),
        "schedule": _clamp(raw["schedule"] / config.saturation["schedule_delay_days"] * 100),
        "milestone": _clamp(raw["milestone"]),
        "expenditure": _clamp(raw["expenditure"] / config.saturation["expenditure_gap_pp"] * 100),
    }
    overall, effective = _weighted(factors, config.factor_weights)
    domains = _domains(factors, config)
    return {
        "available": True,
        "overallScore": overall,
        "costRisk": domains["cost"],
        "scheduleRisk": domains["schedule"],
        "implementationRisk": domains["implementation"],
        "factors": {name: _rounded(value) for name, value in factors.items()},
        "rawIndicators": raw,
        "effectiveFactorWeights": effective,
        "provenance": {
            "type": "deterministic_rules",
            "version": RULE_VERSION,
            "description": "Exact refactor of the original DHRISTI five-factor formula.",
        },
    }


def _percentile(value: float, population: Iterable[float]) -> float | None:
    values = list(population)
    if not values:
        return None
    below = sum(candidate < value for candidate in values)
    equal = sum(candidate == value for candidate in values)
    return _clamp((below + 0.5 * equal) / len(values) * 100)


def statistical_component(row: dict[str, Any], all_rows: list[dict[str, Any]], config: RiskConfiguration) -> dict[str, Any]:
    if bool(row.get("is_synthetic")):
        return {"available": False, "reason": "Synthetic demonstration projects are excluded from historical scoring.", "provenance": {"type": "historical_peer_percentile", "version": STATISTICAL_VERSION}}
    eligible = [candidate for candidate in all_rows if not bool(candidate.get("is_synthetic"))]
    strategies = [
        ("same_sector_and_project_type", [candidate for candidate in eligible if candidate.get("sector") == row.get("sector") and candidate.get("project_type") == row.get("project_type")]),
        ("same_sector", [candidate for candidate in eligible if candidate.get("sector") == row.get("sector")]),
        ("portfolio", eligible),
    ]
    strategy, peers = next(((name, candidates) for name, candidates in strategies if len(candidates) >= config.statistical_min_peers), ("unavailable", []))
    if not peers:
        return {"available": False, "reason": f"Fewer than {config.statistical_min_peers} comparable non-synthetic projects.", "provenance": {"type": "historical_peer_percentile", "version": STATISTICAL_VERSION}}
    own = _raw_indicators(row)
    peer_values = [_raw_indicators(peer) for peer in peers]
    factors = {name: _percentile(value, (candidate[name] for candidate in peer_values)) for name, value in own.items()}
    overall, effective = _weighted(factors, config.factor_weights)
    domains = _domains(factors, config)
    return {
        "available": overall is not None,
        "overallScore": overall,
        "costRisk": domains["cost"],
        "scheduleRisk": domains["schedule"],
        "implementationRisk": domains["implementation"],
        "factors": {name: _rounded(value) if value is not None else None for name, value in factors.items()},
        "effectiveFactorWeights": effective,
        "provenance": {
            "type": "historical_peer_percentile",
            "version": STATISTICAL_VERSION,
            "cohortStrategy": strategy,
            "peerCount": len(peers),
            "minimumPeerCount": config.statistical_min_peers,
            "percentileMethod": "midrank_empirical_percentile",
        },
    }


def ml_component(row: dict[str, Any], config: RiskConfiguration) -> dict[str, Any]:
    cost = row.get("cost_prediction") if isinstance(row.get("cost_prediction"), dict) else None
    schedule = row.get("schedule_prediction") if isinstance(row.get("schedule_prediction"), dict) else None
    cost_signal = None
    schedule_signal = None
    if cost and cost.get("synthetic") is False:
        probability = cost.get("significant_overrun_probability")
        if probability is not None:
            cost_signal = _clamp(_number(probability) * 100)
        elif cost.get("predicted_escalation_percentage") is not None:
            cost_signal = _clamp(_number(cost["predicted_escalation_percentage"]) / config.saturation["cost_overrun_pct"] * 100)
    if schedule and schedule.get("synthetic") is False:
        probability = schedule.get("schedule_overrun_probability")
        if probability is not None:
            schedule_signal = _clamp(_number(probability) * 100)
        elif schedule.get("expected_delay_days") is not None:
            schedule_signal = _clamp(_number(schedule["expected_delay_days"]) / config.saturation["schedule_delay_days"] * 100)
    overall, effective = _weighted({"cost": cost_signal, "schedule": schedule_signal}, config.ml_signal_weights)
    provenance = []
    for kind, payload in (("cost", cost), ("schedule", schedule)):
        if payload and payload.get("synthetic") is False:
            provenance.append({
                "signal": kind,
                "modelName": payload.get("model_name"),
                "modelVersion": payload.get("model_version"),
                "generatedAt": payload.get("generated_at"),
                "trainingDataVersion": payload.get("training_data_version"),
            })
    return {
        "available": overall is not None,
        "reason": None if overall is not None else "No genuine versioned cost or schedule ML prediction is available.",
        "overallScore": overall,
        "costRisk": _rounded(cost_signal) if cost_signal is not None else None,
        "scheduleRisk": _rounded(schedule_signal) if schedule_signal is not None else None,
        "implementationRisk": None,
        "signals": {"cost": cost_signal, "schedule": schedule_signal},
        "effectiveSignalWeights": effective,
        "provenance": {"type": "trained_model_outputs", "models": provenance, "syntheticOutputsAccepted": False},
    }


def _ensemble(components: dict[str, dict[str, Any]], field: str, config: RiskConfiguration) -> tuple[float, dict[str, float]]:
    score, effective = _weighted(
        {name: component.get(field) if component.get("available") else None for name, component in components.items()},
        config.ensemble_weights,
    )
    return (score if score is not None else 0.0), effective


def _drivers(
    rule: dict[str, Any],
    statistical: dict[str, Any],
    ml: dict[str, Any],
    effective_ensemble_weights: dict[str, float],
    config: RiskConfiguration,
) -> list[dict[str, Any]]:
    labels = {
        "progress": "Progress Variance", "cost": "Cost Escalation", "schedule": "Schedule Delay",
        "milestone": "Milestone Slippage", "expenditure": "Expenditure–Progress Mismatch",
    }
    descriptions = {
        "progress": "Planned physical progress exceeds verified actual progress.",
        "cost": "Latest revised cost exceeds the original approved cost.",
        "schedule": "The current completion position is beyond the original schedule.",
        "milestone": "Monitored milestones are delayed or at risk.",
        "expenditure": "Financial progress is ahead of verified physical progress.",
    }
    drivers: list[dict[str, Any]] = []
    for name, value in rule["factors"].items():
        drivers.append({"code": f"RULE_{name.upper()}", "name": labels[name], "impact": _impact(value, config), "value": value, "weighted_contribution": value * config.factor_weights[name] * effective_ensemble_weights.get("rule", 0), "description": descriptions[name], "evidence": [{"component": "rule", "rawValue": rule["rawIndicators"][name]}], "metadata": {"component": "rule", "version": RULE_VERSION}})
    if statistical.get("available"):
        name, value = max(statistical["factors"].items(), key=lambda item: item[1] or -1)
        drivers.append({"code": f"STAT_{name.upper()}", "name": f"Peer-relative {labels[name]}", "impact": _impact(value or 0, config), "value": value or 0, "weighted_contribution": (value or 0) * statistical["effectiveFactorWeights"].get(name, 0) * effective_ensemble_weights.get("statistical", 0), "description": "This indicator ranks high relative to the selected historical peer cohort.", "evidence": [{"component": "statistical", **statistical["provenance"]}], "metadata": {"component": "statistical", "version": STATISTICAL_VERSION}})
    if ml.get("available"):
        for name in ("cost", "schedule"):
            value = ml["signals"].get(name)
            if value is not None:
                drivers.append({"code": f"ML_{name.upper()}", "name": f"ML {name.title()} Signal", "impact": _impact(value, config), "value": _rounded(value), "weighted_contribution": value * effective_ensemble_weights.get("ml", 0) * ml["effectiveSignalWeights"].get(name, 0), "description": "Signal from a genuine, versioned trained model output.", "evidence": ml["provenance"]["models"], "metadata": {"component": "ml"}})
    drivers.sort(key=lambda item: item["weighted_contribution"], reverse=True)
    for rank, driver in enumerate(drivers[:7], 1):
        driver["rank"] = rank
    return drivers[:7]


def assess_project(row: dict[str, Any], all_rows: list[dict[str, Any]], config: RiskConfiguration) -> dict[str, Any]:
    components = {
        "rule": rule_component(row, config),
        "statistical": statistical_component(row, all_rows, config),
        "ml": ml_component(row, config),
    }
    overall, overall_weights = _ensemble(components, "overallScore", config)
    cost, cost_weights = _ensemble(components, "costRisk", config)
    schedule, schedule_weights = _ensemble(components, "scheduleRisk", config)
    implementation, implementation_weights = _ensemble(components, "implementationRisk", config)
    rule = components["rule"]
    available = [name for name, component in components.items() if component.get("available")]
    return {
        "project_database_id": row["project_database_id"],
        "project_id": row["project_id"],
        "source_update_id": row.get("source_update_id"),
        "assessment_period": row.get("assessment_period"),
        "overall_score": overall,
        "risk_level": _risk_level(overall, config),
        "cost_overrun_risk": cost,
        "schedule_delay_risk": schedule,
        "implementation_risk": implementation,
        "progress_factor": rule["factors"]["progress"],
        "cost_factor": rule["factors"]["cost"],
        "schedule_factor": rule["factors"]["schedule"],
        "milestone_factor": rule["factors"]["milestone"],
        "expenditure_factor": rule["factors"]["expenditure"],
        "methodology": ENSEMBLE_VERSION,
        "explanation": f"Hybrid score combined {', '.join(available)} component(s); unavailable signals were excluded and weights renormalized.",
        "drivers": _drivers(rule, components["statistical"], components["ml"], overall_weights, config),
        "input_snapshot": {
            "components": components,
            "ensemble": {
                "strategy": "weighted_average_with_available_signal_renormalization",
                "version": ENSEMBLE_VERSION,
                "configuredWeights": config.ensemble_weights,
                "effectiveWeights": {"overall": overall_weights, "cost": cost_weights, "schedule": schedule_weights, "implementation": implementation_weights},
                "thresholds": config.thresholds,
            },
            "provenance": {
                "ruleVersion": RULE_VERSION,
                "statisticalVersion": STATISTICAL_VERSION,
                "ensembleVersion": ENSEMBLE_VERSION,
                "sourceUpdateId": str(row.get("source_update_id")) if row.get("source_update_id") else None,
                "syntheticProject": bool(row.get("is_synthetic")),
            },
        },
    }
