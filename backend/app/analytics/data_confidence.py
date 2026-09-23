"""Transparent project input-data confidence scoring.

This module assesses source-data fitness only. It does not inspect or proxy any
ML model probability, prediction interval, or risk score.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from app.config import Settings


FORMULA_VERSION = "data-confidence-v1"


@dataclass(frozen=True)
class DataConfidenceConfiguration:
    weights: dict[str, float]
    fresh_days: int
    stale_days: int
    history_target_months: int
    anomaly_penalty: float
    validation_issue_penalty: float

    @classmethod
    def from_settings(cls, settings: Settings) -> "DataConfidenceConfiguration":
        return cls(
            weights={
                "required_fields": settings.data_confidence_required_fields_weight,
                "freshness": settings.data_confidence_freshness_weight,
                "historical_coverage": settings.data_confidence_history_weight,
                "milestones": settings.data_confidence_milestone_weight,
                "cost_data": settings.data_confidence_cost_weight,
                "physical_progress": settings.data_confidence_progress_weight,
                "clearances": settings.data_confidence_clearance_weight,
                "land_acquisition": settings.data_confidence_land_weight,
                "agency_contract": settings.data_confidence_agency_contract_weight,
                "validation_quality": settings.data_confidence_validation_weight,
            },
            fresh_days=settings.data_confidence_fresh_days,
            stale_days=settings.data_confidence_stale_days,
            history_target_months=settings.data_confidence_history_target_months,
            anomaly_penalty=settings.data_confidence_anomaly_penalty,
            validation_issue_penalty=settings.data_confidence_validation_issue_penalty,
        )

    def public_document(self) -> dict[str, Any]:
        return {
            "formula_version": FORMULA_VERSION,
            "weights": self.weights,
            "fresh_days": self.fresh_days,
            "stale_days": self.stale_days,
            "history_target_months": self.history_target_months,
            "anomaly_penalty": self.anomaly_penalty,
            "validation_issue_penalty": self.validation_issue_penalty,
            "statement": "This score measures input-data quality, completeness, and freshness; it is not an ML prediction probability.",
        }


def _component(
    code: str,
    label: str,
    score: float,
    weight: float,
    *,
    reasons: list[str] | None = None,
    missing: list[str] | None = None,
    stale: list[str] | None = None,
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    bounded = round(max(0.0, min(100.0, score)), 2)
    return {
        "code": code,
        "label": label,
        "score": bounded,
        "weight": weight,
        "weighted_score": round(bounded * weight, 2),
        "reasons": reasons or [],
        "missing_fields": missing or [],
        "stale_fields": stale or [],
        "evidence": evidence or {},
    }


def _subtract_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 - months
    return date(month_index // 12, month_index % 12 + 1, 1)


def _available(value: Any, *, positive: bool = False) -> bool:
    if value is None or value == "":
        return False
    if positive:
        try:
            return float(value) > 0
        except (TypeError, ValueError):
            return False
    return True


def calculate_data_confidence(facts: dict[str, Any], config: DataConfidenceConfiguration) -> dict[str, Any]:
    weights = config.weights
    components: list[dict[str, Any]] = []

    required = {
        "project_name": _available(facts.get("project_name")),
        "ministry": _available(facts.get("ministry")),
        "sector": _available(facts.get("sector")),
        "state": _available(facts.get("state")),
        "project_status": _available(facts.get("project_status")),
        "approved_cost": _available(facts.get("master_approved_cost"), positive=True),
        "original_completion_date": _available(facts.get("master_original_completion_date")),
        "latest_monthly_update": _available(facts.get("latest_update_id")),
    }
    missing = [field for field, present in required.items() if not present]
    required_score = sum(required.values()) / len(required) * 100
    components.append(_component(
        "required_fields", "Required-field completeness", required_score, weights["required_fields"],
        reasons=[f"{len(missing)} of {len(required)} required fields are missing."] if missing else [],
        missing=missing,
        evidence={"present": sum(required.values()), "required": len(required)},
    ))

    reporting_month = facts.get("reporting_month")
    as_of_date = facts.get("as_of_date") or date.today()
    if reporting_month is None:
        freshness_score = 0.0
        freshness_reasons = ["No monthly reporting date is available."]
        freshness_missing = ["reporting_month"]
        freshness_stale: list[str] = []
        age_days = None
    else:
        age_days = (as_of_date - reporting_month).days
        freshness_missing = []
        freshness_stale = ["reporting_month"] if age_days > config.fresh_days or age_days < 0 else []
        if age_days < 0:
            freshness_score = 0.0
            freshness_reasons = [f"Latest reporting month is {abs(age_days)} days in the future."]
        elif age_days <= config.fresh_days:
            freshness_score = 100.0
            freshness_reasons = []
        elif age_days >= config.stale_days:
            freshness_score = 0.0
            freshness_reasons = [f"Latest update is {age_days} days old and exceeds the {config.stale_days}-day stale threshold."]
        else:
            freshness_score = 100 * (config.stale_days - age_days) / (config.stale_days - config.fresh_days)
            freshness_reasons = [f"Latest update is {age_days} days old; full freshness credit requires {config.fresh_days} days or less."]
    components.append(_component(
        "freshness", "Latest-update freshness", freshness_score, weights["freshness"],
        reasons=freshness_reasons, missing=freshness_missing, stale=freshness_stale,
        evidence={"reporting_month": reporting_month, "age_days": age_days, "fresh_days": config.fresh_days, "stale_days": config.stale_days},
    ))

    reported_months = set(facts.get("reporting_months") or [])
    if reporting_month is None:
        covered_months = 0
    else:
        expected_months = {_subtract_months(reporting_month, offset) for offset in range(config.history_target_months)}
        covered_months = len(expected_months & reported_months)
    history_score = covered_months / config.history_target_months * 100
    history_reasons = [] if covered_months == config.history_target_months else [
        f"Only {covered_months} of the target {config.history_target_months} recent monthly reporting periods are available."
    ]
    components.append(_component(
        "historical_coverage", "Historical monthly coverage", history_score, weights["historical_coverage"],
        reasons=history_reasons,
        missing=["monthly_history"] if covered_months == 0 else [],
        evidence={"covered_months": covered_months, "target_months": config.history_target_months},
    ))

    detailed_milestones = int(facts.get("detailed_milestone_count") or 0)
    aggregate_milestones = int(facts.get("milestones_total") or 0)
    if detailed_milestones > 0:
        milestone_score, milestone_reasons, milestone_missing = 100.0, [], []
    elif aggregate_milestones > 0:
        milestone_score, milestone_reasons, milestone_missing = 60.0, ["Only aggregate milestone counts are available; milestone-level dates and status are missing."], ["milestone_details"]
    else:
        milestone_score, milestone_reasons, milestone_missing = 0.0, ["No milestone data is available."], ["milestones"]
    components.append(_component(
        "milestones", "Milestone-data availability", milestone_score, weights["milestones"],
        reasons=milestone_reasons, missing=milestone_missing,
        evidence={"detailed_milestones": detailed_milestones, "reported_total": aggregate_milestones},
    ))

    cost_checks = {
        "approved_cost": _available(facts.get("approved_cost"), positive=True),
        "revised_cost": _available(facts.get("revised_cost"), positive=True),
        "expenditure": _available(facts.get("expenditure")),
    }
    cost_missing = [field for field, present in cost_checks.items() if not present]
    components.append(_component(
        "cost_data", "Cost-data completeness", sum(cost_checks.values()) / len(cost_checks) * 100, weights["cost_data"],
        reasons=[f"Missing latest-cycle cost fields: {', '.join(cost_missing)}."] if cost_missing else [],
        missing=cost_missing, evidence={"available_fields": sum(cost_checks.values()), "required_fields": len(cost_checks)},
    ))

    progress_checks = {
        "physical_progress": _available(facts.get("physical_progress")),
        "planned_progress": _available(facts.get("planned_progress")),
    }
    progress_missing = [field for field, present in progress_checks.items() if not present]
    components.append(_component(
        "physical_progress", "Physical-progress availability", sum(progress_checks.values()) / len(progress_checks) * 100, weights["physical_progress"],
        reasons=[f"Missing latest-cycle progress fields: {', '.join(progress_missing)}."] if progress_missing else [],
        missing=progress_missing, evidence={"available_fields": sum(progress_checks.values()), "required_fields": len(progress_checks)},
    ))

    clearances = facts.get("clearance_status") if isinstance(facts.get("clearance_status"), dict) else {}
    substantive_clearances = {key: value for key, value in clearances.items() if value not in (None, "", "unknown", "not_reported")}
    clearance_score = 100.0 if substantive_clearances else 0.0
    components.append(_component(
        "clearances", "Clearance information", clearance_score, weights["clearances"],
        reasons=[] if substantive_clearances else ["No substantive clearance information is reported."],
        missing=[] if substantive_clearances else ["clearance_status"],
        evidence={"reported_clearances": len(substantive_clearances)},
    ))

    land_progress = _available(facts.get("land_acquisition_progress"))
    land_target = _available(facts.get("land_acquisition_target"))
    land_completed = _available(facts.get("land_acquisition_completed"))
    if land_progress:
        land_score, land_missing, land_reasons = 100.0, [], []
    elif land_target and land_completed:
        land_score, land_missing, land_reasons = 80.0, ["land_acquisition_progress"], ["Land quantities are available but normalized acquisition progress is missing."]
    elif land_target or land_completed:
        land_score, land_missing, land_reasons = 40.0, ["land_acquisition_progress", "land_acquisition_target_or_completed"], ["Land-acquisition information is incomplete."]
    else:
        land_score, land_missing, land_reasons = 0.0, ["land_acquisition_information"], ["No land-acquisition information is reported."]
    components.append(_component(
        "land_acquisition", "Land-acquisition information", land_score, weights["land_acquisition"],
        reasons=land_reasons, missing=land_missing,
        evidence={"progress_available": land_progress, "target_available": land_target, "completed_available": land_completed},
    ))

    agency_checks = {
        "implementing_agency": _available(facts.get("implementing_agency")),
        "contract_status": _available(facts.get("contract_status")),
    }
    agency_missing = [field for field, present in agency_checks.items() if not present]
    components.append(_component(
        "agency_contract", "Agency and contract information", sum(agency_checks.values()) / len(agency_checks) * 100, weights["agency_contract"],
        reasons=[f"Missing governance fields: {', '.join(agency_missing)}."] if agency_missing else [],
        missing=agency_missing, evidence={"available_fields": sum(agency_checks.values()), "required_fields": len(agency_checks)},
    ))

    validation_record = bool(facts.get("validation_record_available"))
    quality_status = facts.get("data_quality_status")
    anomaly_count = int(facts.get("anomaly_count") or 0)
    validation_errors = int(facts.get("validation_error_count") or 0)
    validation_warnings = int(facts.get("validation_warning_count") or 0)
    validation_issues = validation_errors + validation_warnings
    if validation_record:
        validation_score = 100.0
        validation_missing: list[str] = []
        validation_reasons: list[str] = []
    elif quality_status == "validated":
        validation_score = 70.0
        validation_missing = ["row_level_validation_evidence"]
        validation_reasons = ["The update is marked validated, but row-level validation evidence is unavailable."]
    elif quality_status:
        validation_score = 40.0
        validation_missing = ["certified_validation_evidence"]
        validation_reasons = [f"Latest update quality status is {quality_status}, not validated."]
    else:
        validation_score = 0.0
        validation_missing = ["validation_status", "row_level_validation_evidence"]
        validation_reasons = ["No validation status or row-level validation evidence is available."]
    if anomaly_count:
        validation_reasons.append(f"{anomaly_count} anomaly finding(s) remain attached to the latest imported row.")
    if validation_issues:
        validation_reasons.append(f"{validation_issues} validation issue(s) remain attached to the latest imported row.")
    validation_score -= anomaly_count * config.anomaly_penalty
    validation_score -= validation_issues * config.validation_issue_penalty
    components.append(_component(
        "validation_quality", "Validation and anomaly status", validation_score, weights["validation_quality"],
        reasons=validation_reasons, missing=validation_missing,
        evidence={
            "data_quality_status": quality_status,
            "row_level_evidence": validation_record,
            "anomalies": anomaly_count,
            "validation_errors": validation_errors,
            "validation_warnings": validation_warnings,
        },
    ))

    overall = round(sum(component["weighted_score"] for component in components), 2)
    rating = "high" if overall >= 85 else "moderate" if overall >= 70 else "low" if overall >= 50 else "very_low"
    reasons = [reason for component in components if component["score"] < 100 for reason in component["reasons"]]
    missing_fields = sorted({field for component in components for field in component["missing_fields"]})
    stale_fields = sorted({field for component in components for field in component["stale_fields"]})
    return {
        "project_id": facts["project_id"],
        "project_name": facts["project_name"],
        "score_type": "data_quality",
        "is_prediction_probability": False,
        "overall_score": overall,
        "rating": rating,
        "as_of_date": as_of_date,
        "latest_reporting_month": reporting_month,
        "components": components,
        "reasons_lowering_confidence": reasons,
        "missing_fields": missing_fields,
        "stale_fields": stale_fields,
        "configuration": config.public_document(),
    }
