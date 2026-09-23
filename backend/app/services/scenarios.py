from __future__ import annotations

from copy import deepcopy
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from app.analytics.hybrid_risk import RiskConfiguration, assess_project
from app.config import Settings
from app.errors import AppError, NotFoundError
from app.ml.cost_inference import load_cost_model, predict_cost_overrun
from app.ml.interface import ModelUnavailableError
from app.ml.schedule_inference import load_schedule_model, predict_schedule_overrun
from app.repositories.predictions import PredictionRepository
from app.repositories.risks import RiskRepository
from app.schemas.scenario import ScenarioRequest


DISCLAIMER = "Scenario/model estimate - not a guaranteed project outcome."


SCENARIO_VARIABLES: dict[str, dict[str, Any]] = {
    "physical_progress": {
        "label": "Physical progress",
        "description": "Temporary assumed verified physical progress for this reporting snapshot.",
        "input_type": "number", "minimum": 0, "maximum": 100,
        "features": {"cost": ["physical_progress", "progress_variance"], "schedule": ["physical_progress", "progress_variance"]},
    },
    "planned_progress": {
        "label": "Planned progress",
        "description": "Temporary planned progress assumption; progress variance is recalculated.",
        "input_type": "number", "minimum": 0, "maximum": 100,
        "features": {"cost": ["planned_progress", "progress_variance"], "schedule": ["planned_progress", "progress_variance"]},
    },
    "monthly_progress_velocity": {
        "label": "Planned monthly progress velocity",
        "description": "Assumed monthly percentage-point delivery velocity after intervention.",
        "input_type": "number", "minimum": 0, "maximum": 100,
        "features": {"schedule": ["monthly_progress_velocity"]},
    },
    "land_acquisition_progress": {
        "label": "Land acquisition progress",
        "description": "Temporary percentage of required land assumed acquired.",
        "input_type": "number", "minimum": 0, "maximum": 100,
        "features": {"cost": ["land_acquisition_progress"], "schedule": ["land_acquisition_progress"]},
    },
    "milestone_completion_pct": {
        "label": "Milestone completion",
        "description": "Temporary aggregate share of monitored milestones assumed completed.",
        "input_type": "number", "minimum": 0, "maximum": 100,
        "features": {"cost": ["milestone_completion_pct"], "schedule": ["milestone_completion_pct"]},
    },
    "milestone_delay_pct": {
        "label": "Milestone delay share",
        "description": "Temporary aggregate share of monitored milestones assumed delayed or at risk.",
        "input_type": "number", "minimum": 0, "maximum": 100,
        "features": {"cost": ["milestone_slippage_pct"], "schedule": ["milestone_delay_pct"]},
    },
    "issue_count": {
        "label": "Open issue count",
        "description": "Temporary number of unresolved implementation issues assumed after intervention.",
        "input_type": "integer", "minimum": 0, "maximum": 10000,
        "features": {"cost": ["issue_count"], "schedule": ["issue_count"]},
    },
    "contract_status": {
        "label": "Contract status",
        "description": "Temporary contract-stage assumption, restricted to normalized supported categories.",
        "input_type": "select",
        "options": ["not_reported", "pre_award", "active", "in_progress", "completed", "terminated"],
        "features": {"cost": ["contract_status"], "schedule": ["contract_status"]},
    },
    "clearance_status": {
        "label": "Clearance status",
        "description": "Temporary normalized clearance assumption; associated completion and pending features are changed together.",
        "input_type": "select", "options": ["not_reported", "pending", "cleared"],
        "features": {"schedule": ["clearance_risk_status", "clearance_completion_pct", "clearance_pending_count"]},
    },
}


def _model_features(artifact: dict[str, Any]) -> set[str]:
    return {str(value) for value in artifact.get("feature_names", [])}


def _current_value(code: str, cost: dict[str, Any], schedule: dict[str, Any]) -> Any:
    if code == "milestone_delay_pct":
        return schedule.get("milestone_delay_pct", cost.get("milestone_slippage_pct"))
    if code == "clearance_status":
        return schedule.get("clearance_risk_status")
    return schedule.get(code, cost.get(code))


def _supported_catalog(
    cost_features: dict[str, Any],
    schedule_features: dict[str, Any],
    cost_artifact: dict[str, Any],
    schedule_artifact: dict[str, Any],
) -> list[dict[str, Any]]:
    trained = {"cost": _model_features(cost_artifact), "schedule": _model_features(schedule_artifact)}
    result: list[dict[str, Any]] = []
    for code, definition in SCENARIO_VARIABLES.items():
        models: list[str] = []
        affected: list[str] = []
        for model_name, features in definition["features"].items():
            if all(feature in trained[model_name] for feature in features):
                models.append(model_name)
                affected.extend(features)
        if not models:
            continue
        result.append({
            "code": code,
            "label": definition["label"],
            "description": definition["description"],
            "input_type": definition["input_type"],
            "current_value": _current_value(code, cost_features, schedule_features),
            "minimum": definition.get("minimum"),
            "maximum": definition.get("maximum"),
            "options": definition.get("options", []),
            "models": models,
            "affected_features": sorted(set(affected)),
        })
    return result


def _apply_changes(
    cost: dict[str, Any], schedule: dict[str, Any], changes: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    cost_scenario, schedule_scenario = deepcopy(cost), deepcopy(schedule)
    for code, value in changes.items():
        if code in {"physical_progress", "planned_progress", "land_acquisition_progress", "milestone_completion_pct", "issue_count", "contract_status"}:
            cost_scenario[code] = value
            schedule_scenario[code] = value
        elif code == "monthly_progress_velocity":
            schedule_scenario[code] = value
        elif code == "milestone_delay_pct":
            cost_scenario["milestone_slippage_pct"] = value
            schedule_scenario["milestone_delay_pct"] = value
        elif code == "clearance_status":
            schedule_scenario["clearance_risk_status"] = value
            if value == "cleared":
                schedule_scenario["clearance_completion_pct"] = 100.0
                schedule_scenario["clearance_pending_count"] = 0
            elif value == "not_reported":
                schedule_scenario["clearance_completion_pct"] = None
                schedule_scenario["clearance_pending_count"] = 0
            else:
                current_completion = schedule.get("clearance_completion_pct")
                schedule_scenario["clearance_completion_pct"] = 50.0 if current_completion in (None, 100, 100.0) else current_completion
                schedule_scenario["clearance_pending_count"] = max(1, int(schedule.get("clearance_pending_count") or 0))

    for target in (cost_scenario, schedule_scenario):
        if "physical_progress" in changes or "planned_progress" in changes:
            physical = target.get("physical_progress")
            planned = target.get("planned_progress")
            target["progress_variance"] = (
                float(physical) - float(planned) if physical is not None and planned is not None else None
            )
    return cost_scenario, schedule_scenario


def _risk_result(assessment: dict[str, Any]) -> dict[str, Any]:
    return {
        "overall_score": assessment["overall_score"],
        "risk_level": assessment["risk_level"],
        "cost_risk": assessment.get("cost_overrun_risk"),
        "schedule_risk": assessment.get("schedule_delay_risk"),
        "implementation_risk": assessment.get("implementation_risk"),
    }


def _outcome(cost: dict[str, Any], schedule: dict[str, Any], risk: dict[str, Any]) -> dict[str, Any]:
    return {
        "risk": _risk_result(risk),
        "cost": {
            "significant_overrun_probability": cost.get("significant_overrun_probability"),
            "predicted_final_cost": cost["predicted_final_cost"],
            "predicted_escalation_amount": cost["predicted_escalation_amount"],
            "predicted_escalation_percentage": cost["predicted_escalation_percentage"],
            "model_version": cost["model_version"],
        },
        "schedule": {
            "schedule_overrun_probability": schedule.get("schedule_overrun_probability"),
            "expected_delay_days": schedule["expected_delay_days"],
            "predicted_completion_date": schedule["predicted_completion_date"],
            "model_version": schedule["model_version"],
        },
    }


def _contributions(output: dict[str, Any]) -> dict[str, dict[str, Any]]:
    explanation = output.get("explanation") or {}
    ml = explanation.get("ml") if isinstance(explanation, dict) else {}
    rows = ml.get("contributions", []) if isinstance(ml, dict) else []
    return {str(row["feature"]): row for row in rows if isinstance(row, dict) and row.get("feature")}


def _explanation(
    before_cost: dict[str, Any], scenario_cost: dict[str, Any],
    before_schedule: dict[str, Any], scenario_schedule: dict[str, Any],
    before_risk: dict[str, Any], scenario_risk: dict[str, Any],
) -> dict[str, Any]:
    risk_delta = float(scenario_risk["overall_score"]) - float(before_risk["overall_score"])
    delay_delta = int(scenario_schedule["expected_delay_days"]) - int(before_schedule["expected_delay_days"])
    cost_delta = float(scenario_cost["predicted_escalation_percentage"]) - float(before_cost["predicted_escalation_percentage"])
    summaries = [
        f"Recomputed hybrid risk changed by {risk_delta:+.1f} points.",
        f"Model-estimated delay changed by {delay_delta:+d} days.",
        f"Model-estimated cost escalation changed by {cost_delta:+.1f} percentage points.",
    ]
    driver_changes: list[dict[str, Any]] = []
    for model, before, scenario in (
        ("cost", before_cost, scenario_cost),
        ("schedule", before_schedule, scenario_schedule),
    ):
        before_rows, scenario_rows = _contributions(before), _contributions(scenario)
        for feature in before_rows.keys() | scenario_rows.keys():
            first, second = before_rows.get(feature, {}), scenario_rows.get(feature, {})
            baseline = float(first.get("contribution") or 0)
            changed = float(second.get("contribution") or 0)
            delta = changed - baseline
            if abs(delta) < 1e-9:
                continue
            label = str(second.get("feature_label") or first.get("feature_label") or feature.replace("_", " ").title())
            unit = str(second.get("contribution_unit") or first.get("contribution_unit") or "model_output")
            direction = "increased" if delta > 0 else "reduced"
            driver_changes.append({
                "model": model,
                "feature": feature,
                "feature_label": label,
                "before_contribution": baseline,
                "scenario_contribution": changed,
                "contribution_change": delta,
                "contribution_unit": unit,
                "explanation": f"The scenario {direction} {label.lower()}'s model contribution by {abs(delta):.2f} {unit.replace('_', ' ')}.",
            })
    driver_changes.sort(key=lambda item: abs(item["contribution_change"]), reverse=True)
    return {
        "summaries": summaries,
        "driver_changes": driver_changes[:8],
        "numerical_source": "Differences between baseline and scenario inference from the same active model versions; contribution changes come from SHAP outputs where available.",
    }


class ScenarioService:
    def __init__(
        self,
        prediction_repository: PredictionRepository,
        risk_repository: RiskRepository,
        settings: Settings,
    ) -> None:
        self.predictions = prediction_repository
        self.risks = risk_repository
        self.settings = settings
        self.risk_config = RiskConfiguration.from_settings(settings)

    async def _context(self, identifier: str) -> dict[str, Any]:
        cost_features = await self.predictions.cost_inference_features(identifier)
        schedule_features = await self.predictions.schedule_inference_features(identifier)
        if cost_features is None or schedule_features is None:
            raise NotFoundError("Project", identifier)
        if cost_features.get("is_synthetic") or schedule_features.get("is_synthetic"):
            raise AppError(
                "What-if model estimates are disabled for synthetic demonstration projects.",
                code="synthetic_prediction_blocked", status_code=422,
            )
        if not cost_features.get("snapshot_date") or float(cost_features.get("approved_cost") or 0) <= 0:
            raise AppError("Cost scenario inference requires a dated update and positive approved cost.", code="insufficient_prediction_data", status_code=422)
        if not schedule_features.get("snapshot_date") or not schedule_features.get("original_completion_date"):
            raise AppError("Schedule scenario inference requires a dated update and original completion date.", code="insufficient_prediction_data", status_code=422)
        cost_model = await self.predictions.active_cost_model()
        schedule_model = await self.predictions.active_schedule_model()
        if cost_model is None or schedule_model is None:
            raise AppError("Both active cost and schedule models are required for what-if simulation.", code="model_unavailable", status_code=503)
        try:
            artifact_root = str(Path(self.settings.ml_artifact_dir).resolve())
            cost_artifact = load_cost_model(str(cost_model["artifact_uri"]), str(cost_model["artifact_checksum"]), artifact_root)
            schedule_artifact = load_schedule_model(str(schedule_model["artifact_uri"]), str(schedule_model["artifact_checksum"]), artifact_root)
        except ModelUnavailableError as exc:
            raise AppError(str(exc), code="model_unavailable", status_code=503) from exc
        return {
            "cost_features": cost_features, "schedule_features": schedule_features,
            "cost_model": cost_model, "schedule_model": schedule_model,
            "cost_artifact": cost_artifact, "schedule_artifact": schedule_artifact,
        }

    async def configuration(self, identifier: str) -> dict[str, Any]:
        context = await self._context(identifier)
        cost, schedule = context["cost_features"], context["schedule_features"]
        return {
            "project_id": cost["project_id"],
            "project_name": cost["project_name"],
            "as_of_date": schedule["snapshot_date"],
            "supported_variables": _supported_catalog(cost, schedule, context["cost_artifact"], context["schedule_artifact"]),
            "unsupported_variables": [{
                "code": "resource_availability",
                "label": "Resource availability",
                "reason": "The active trained cost and schedule models do not contain a resource-availability feature, so no numerical effect is claimed.",
            }],
            "model_versions": {"cost": str(context["cost_model"]["version"]), "schedule": str(context["schedule_model"]["version"])},
            "persists_changes": False,
            "disclaimer": DISCLAIMER,
        }

    async def simulate(self, identifier: str, request: ScenarioRequest) -> dict[str, Any]:
        context = await self._context(identifier)
        cost_features, schedule_features = context["cost_features"], context["schedule_features"]
        catalog = _supported_catalog(cost_features, schedule_features, context["cost_artifact"], context["schedule_artifact"])
        supported = {item["code"]: item for item in catalog}
        changes = request.changes.model_dump(exclude_none=True)
        unsupported = sorted(set(changes) - set(supported))
        if unsupported:
            raise AppError(f"Unsupported scenario variables: {', '.join(unsupported)}.", code="unsupported_scenario_variable", status_code=422)
        changed_variables = []
        for code, value in changes.items():
            before = supported[code]["current_value"]
            if before == value:
                continue
            changed_variables.append({
                "code": code, "label": supported[code]["label"],
                "before_value": before, "scenario_value": value,
                "affected_models": supported[code]["models"],
                "affected_features": supported[code]["affected_features"],
            })
        if not changed_variables:
            raise AppError("The scenario must change at least one current supported value.", code="scenario_unchanged", status_code=422)

        scenario_cost_features, scenario_schedule_features = _apply_changes(cost_features, schedule_features, changes)
        try:
            before_cost = predict_cost_overrun(context["cost_artifact"], cost_features, training_data_version=str(context["cost_model"]["training_data_version"]))
            scenario_cost = predict_cost_overrun(context["cost_artifact"], scenario_cost_features, training_data_version=str(context["cost_model"]["training_data_version"]))
            before_schedule = predict_schedule_overrun(context["schedule_artifact"], schedule_features, training_data_version=str(context["schedule_model"]["training_data_version"]))
            scenario_schedule = predict_schedule_overrun(context["schedule_artifact"], scenario_schedule_features, training_data_version=str(context["schedule_model"]["training_data_version"]))
        except ModelUnavailableError as exc:
            raise AppError(str(exc), code="model_unavailable", status_code=503) from exc

        risk_facts = await self.risks.assessment_facts()
        baseline_row = next((row for row in risk_facts if row["project_id"] == cost_features["project_id"]), None)
        if baseline_row is None:
            raise NotFoundError("Project risk inputs", identifier)
        baseline_row = deepcopy(baseline_row)
        baseline_row["cost_prediction"], baseline_row["schedule_prediction"] = before_cost, before_schedule
        before_risk = assess_project(baseline_row, risk_facts, self.risk_config)

        scenario_row = deepcopy(baseline_row)
        scenario_row["cost_prediction"], scenario_row["schedule_prediction"] = scenario_cost, scenario_schedule
        if "physical_progress" in changes:
            scenario_row["physical_progress"] = changes["physical_progress"]
        if "planned_progress" in changes:
            scenario_row["planned_progress"] = changes["planned_progress"]
        if "milestone_delay_pct" in changes and int(scenario_row.get("milestones_total") or 0) > 0:
            total = int(scenario_row["milestones_total"])
            scenario_row["milestones_delayed"] = round(total * float(changes["milestone_delay_pct"]) / 100)
            scenario_row["milestones_at_risk"] = 0
        scenario_population = [scenario_row if row["project_id"] == scenario_row["project_id"] else row for row in risk_facts]
        scenario_risk = assess_project(scenario_row, scenario_population, self.risk_config)

        return {
            "project_id": cost_features["project_id"],
            "project_name": cost_features["project_name"],
            "as_of_date": schedule_features["snapshot_date"],
            "generated_at": datetime.now(UTC),
            "before": _outcome(before_cost, before_schedule, before_risk),
            "scenario": _outcome(scenario_cost, scenario_schedule, scenario_risk),
            "changed_variables": changed_variables,
            "explanation": _explanation(before_cost, scenario_cost, before_schedule, scenario_schedule, before_risk, scenario_risk),
            "assumption_note": request.assumption_note,
            "persists_changes": False,
            "disclaimer": DISCLAIMER,
        }
