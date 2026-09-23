from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from app.auth.models import CurrentProfile
from app.errors import NotFoundError
from app.repositories.evidence import EvidenceRepository


METHODOLOGY = (
    "Evidence chains are assembled only from persisted monthly updates, milestones, risk snapshots, "
    "registered-model predictions, documented warning rules, and intervention workflow records."
)


def _number(value: Any) -> float | None:
    try:
        result = float(value)
        return result if result == result else None
    except (TypeError, ValueError):
        return None


def _value(label: str, value: Any, *, unit: str | None = None, field: str | None = None,
           formula: str | None = None, table: str | None = None, record: Any = None,
           timestamp: Any = None) -> dict[str, Any]:
    return {
        "label": label, "value": value, "unit": unit, "field": field, "formula": formula,
        "source_table": table, "source_record_id": str(record) if record else None, "timestamp": timestamp,
    }


def _node(stage: str, title: str, provenance: str, *, description: str | None = None,
          timestamp: Any = None, table: str | None = None, record: Any = None,
          model_name: str | None = None, model_version: str | None = None,
          data_version: str | None = None, rule_version: str | None = None,
          values: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "stage": stage, "title": title, "description": description,
        "provenance_type": provenance, "timestamp": timestamp,
        "source_table": table, "source_record_id": str(record) if record else None,
        "model_name": model_name, "model_version": model_version,
        "data_version": data_version, "rule_version": rule_version, "values": values or [],
    }


def _source_node(snapshot: dict[str, Any] | None, feature_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    if snapshot:
        record, period = snapshot.get("id"), snapshot.get("reporting_month")
        fields = [
            ("Approved cost", "approved_cost", "INR crore"), ("Revised cost", "revised_cost", "INR crore"),
            ("Expenditure", "expenditure", "INR crore"), ("Physical progress", "physical_progress", "%"),
            ("Planned progress", "planned_progress", "%"), ("Financial progress", "financial_progress", "%"),
            ("Reported delay", "delay_days", "days"), ("Milestones total", "milestones_total", "count"),
            ("Milestones delayed", "milestones_delayed", "count"), ("Milestones at risk", "milestones_at_risk", "count"),
            ("Land acquisition progress", "land_acquisition_progress", "%"), ("Contract status", "contract_status", None),
        ]
        values = [_value(label, snapshot.get(field), unit=unit, field=field, table="project_monthly_updates", record=record, timestamp=period)
                  for label, field, unit in fields if snapshot.get(field) is not None]
        values.extend([
            _value("Source system", snapshot.get("source_system"), field="source_system", table="project_monthly_updates", record=record, timestamp=period),
            _value("Data quality status", snapshot.get("data_quality_status"), field="data_quality_status", table="project_monthly_updates", record=record, timestamp=period),
        ])
        return _node(
            "source_data", "Certified monthly monitoring data", "stored_data",
            description="Values are read from the persisted monthly update; missing fields are not inferred.",
            timestamp=period, table="project_monthly_updates", record=record,
            data_version=f"schema-v{snapshot.get('schema_version')} / {snapshot.get('source_system')}", values=values,
        )
    values = [_value(key.replace("_", " ").title(), value, field=key, table="predictions.feature_snapshot")
              for key, value in (feature_snapshot or {}).items() if value is not None]
    return _node(
        "source_data", "Persisted model feature snapshot", "stored_data",
        description="The originating monthly record is unavailable; these are the exact features stored with the prediction.",
        table="predictions", values=values,
    )


def _derived_node(snapshot: dict[str, Any] | None, milestones: list[dict[str, Any]]) -> dict[str, Any]:
    snapshot = snapshot or {}
    record, period = snapshot.get("id"), snapshot.get("reporting_month")
    actual, planned = _number(snapshot.get("physical_progress")), _number(snapshot.get("planned_progress"))
    approved, revised = _number(snapshot.get("approved_cost")), _number(snapshot.get("revised_cost"))
    financial = _number(snapshot.get("financial_progress"))
    expenditure = _number(snapshot.get("expenditure"))
    if financial is None and revised and expenditure is not None:
        financial = expenditure / revised * 100
    values: list[dict[str, Any]] = []
    if actual is not None and planned is not None:
        values.append(_value("Physical progress variance", actual - planned, unit="percentage points", field="progress_variance", formula="physical_progress - planned_progress", table="calculated_analytics", record=record, timestamp=period))
    if approved and revised is not None:
        values.append(_value("Cost escalation", (revised - approved) / approved * 100, unit="%", field="cost_escalation_pct", formula="(revised_cost - approved_cost) / approved_cost * 100", table="calculated_analytics", record=record, timestamp=period))
    if financial is not None and actual is not None:
        values.append(_value("Expenditure/progress mismatch", financial - actual, unit="percentage points", field="financial_physical_gap", formula="financial_progress - physical_progress", table="calculated_analytics", record=record, timestamp=period))
    if snapshot.get("delay_days") is not None:
        values.append(_value("Reported schedule delay", snapshot["delay_days"], unit="days", field="delay_days", formula="stored monitoring value", table="project_monthly_updates", record=record, timestamp=period))
    report_date = date.fromisoformat(str(period)) if period and not isinstance(period, date) else period
    if report_date:
        for milestone in milestones:
            planned_date = milestone.get("planned_date")
            if isinstance(planned_date, str):
                planned_date = date.fromisoformat(planned_date)
            actual_date = milestone.get("actual_date")
            if isinstance(actual_date, str):
                actual_date = date.fromisoformat(actual_date)
            if planned_date and planned_date < report_date and (not actual_date or actual_date > report_date):
                values.append(_value(
                    f"Milestone {milestone.get('milestone_code') or milestone.get('name')} overdue",
                    (report_date - planned_date).days, unit="days", field="planned_date",
                    formula="reporting_month - planned_date while not completed", table="milestones",
                    record=milestone.get("id"), timestamp=report_date,
                ))
    return _node(
        "derived_signal", "Deterministic derived signals", "calculated_analytics",
        description="Each signal states its formula and uses only the source record above.",
        timestamp=period, table="calculated_analytics", record=record, values=values,
    )


def _explanation_values(output: dict[str, Any]) -> list[dict[str, Any]]:
    explanation = output.get("explanation") if isinstance(output, dict) else None
    if not isinstance(explanation, dict):
        return []
    values: list[dict[str, Any]] = []
    ml = explanation.get("ml") or {}
    for driver in (ml.get("positive_drivers") or []) + (ml.get("protective_drivers") or []):
        values.append(_value(
            f"SHAP: {driver.get('feature_label') or driver.get('feature')}", driver.get("contribution"),
            unit=driver.get("contribution_unit"), field=driver.get("feature"), formula="SHAP model contribution",
            table="predictions.output_payload",
        ))
    for trigger in (explanation.get("rules") or {}).get("triggers", []):
        values.append(_value(
            f"Rule: {trigger.get('feature_label') or trigger.get('rule_id')}", trigger.get("actual_value"),
            unit=trigger.get("unit"), field=trigger.get("feature"), formula=trigger.get("explanation"),
            table="predictions.output_payload",
        ))
    return values


def _prediction_node(prediction: dict[str, Any]) -> dict[str, Any]:
    output = prediction.get("output_payload") or {}
    if prediction["prediction_type"] == "completion_date":
        values = [
            _value("Schedule overrun probability", output.get("schedule_overrun_probability"), unit="probability", field="schedule_overrun_probability", table="predictions", record=prediction["id"], timestamp=prediction["generated_at"]),
            _value("Expected delay", output.get("expected_delay_days"), unit="days", field="expected_delay_days", table="predictions", record=prediction["id"], timestamp=prediction["generated_at"]),
            _value("Predicted completion date", output.get("predicted_completion_date"), field="predicted_completion_date", table="predictions", record=prediction["id"], timestamp=prediction["generated_at"]),
        ]
        title = "Schedule-overrun model prediction"
    else:
        values = [
            _value("Significant cost-overrun probability", output.get("significant_overrun_probability"), unit="probability", field="significant_overrun_probability", table="predictions", record=prediction["id"], timestamp=prediction["generated_at"]),
            _value("Predicted final cost", output.get("predicted_final_cost"), unit="INR crore", field="predicted_final_cost", table="predictions", record=prediction["id"], timestamp=prediction["generated_at"]),
            _value("Predicted cost escalation", output.get("predicted_escalation_percentage"), unit="%", field="predicted_escalation_percentage", table="predictions", record=prediction["id"], timestamp=prediction["generated_at"]),
        ]
        title = "Cost-overrun model prediction"
    return _node(
        "prediction", title, "trained_model", timestamp=prediction["generated_at"],
        table="predictions", record=prediction["id"], model_name=prediction["model_name"],
        model_version=prediction["model_version"], data_version=prediction.get("training_data_version"),
        values=[value for value in values if value["value"] is not None],
    )


def _prediction_explanation_node(prediction: dict[str, Any]) -> dict[str, Any]:
    output = prediction.get("output_payload") or {}
    return _node(
        "explanation", "Stored SHAP and deterministic explanation", "trained_model",
        description="Numerical feature contributions are read from the stored model output; no narrative model generates them.",
        timestamp=prediction["generated_at"], table="predictions", record=prediction["id"],
        model_name=prediction["model_name"], model_version=prediction["model_version"],
        data_version=prediction.get("training_data_version"), values=_explanation_values(output),
    )


def _warning_node(warnings: list[dict[str, Any]]) -> dict[str, Any]:
    if not warnings:
        return _node("warning", "No linked major warning", "workflow_record", description="No High/Critical warning is linked by risk ID, source update, or model provenance.")
    values = []
    for warning in warnings:
        values.append(_value(
            f"{warning['severity'].title()} warning: {warning['title']}", warning.get("current_value"),
            field=warning.get("trigger_rule"), formula=warning.get("trigger_rule"), table="warnings",
            record=warning["id"], timestamp=warning["detected_at"],
        ))
    newest = warnings[0]
    return _node(
        "warning", "Persisted early warning", "documented_rule",
        description="Warnings are stored outputs of the documented automated warning engine.",
        timestamp=newest["detected_at"], table="warnings", record=newest["id"],
        rule_version=(newest.get("metadata") or {}).get("engine_version"), values=values,
    )


def _intervention_node(warnings: list[dict[str, Any]], interventions: list[dict[str, Any]]) -> dict[str, Any]:
    warning_codes = {warning["warning_code"] for warning in warnings}
    linked = [item for item in interventions if item.get("warning_code") in warning_codes]
    values = []
    for warning in warnings:
        if warning.get("recommended_action"):
            values.append(_value(
                f"Recommended for {warning['warning_code']}", warning["recommended_action"],
                field="recommended_action", table="warnings", record=warning["id"], timestamp=warning["detected_at"],
            ))
    for intervention in linked:
        values.append(_value(
            f"Created intervention {intervention['intervention_code']}", intervention["recommended_action"],
            field="recommended_action", table="interventions", record=intervention["id"], timestamp=intervention["created_at"],
        ))
    return _node(
        "intervention", "Recommended / created intervention", "workflow_record",
        description=("Stored warning recommendations and linked intervention records." if values else "No recommendation or linked intervention is stored for this chain."),
        timestamp=linked[0]["created_at"] if linked else None,
        table="interventions" if linked else "warnings", record=linked[0]["id"] if linked else None, values=values,
    )


def _warning_matches_prediction(warning: dict[str, Any], prediction: dict[str, Any]) -> bool:
    if warning.get("source_update_id") != prediction.get("source_update_id"):
        return False
    if warning.get("source_type") != "ml":
        return False
    return any(
        isinstance(item, dict)
        and item.get("modelName") == prediction.get("model_name")
        and item.get("modelVersion") == prediction.get("model_version")
        for item in (warning.get("evidence") or [])
    )


class EvidenceService:
    def __init__(self, repository: EvidenceRepository) -> None:
        self.repository = repository

    async def for_project(self, identifier: str, profile: CurrentProfile) -> dict[str, Any]:
        project = await self.repository.project(identifier)
        if project is None:
            raise NotFoundError("Project", identifier)
        project_db_id = project["project_database_id"]
        risk = await self.repository.current_risk(project_db_id)
        predictions = await self.repository.predictions(project_db_id)
        warnings = await self.repository.major_warnings(project_db_id)
        interventions = await self.repository.interventions(project_db_id)
        milestones = await self.repository.milestones(project_db_id)
        chains: list[dict[str, Any]] = []

        if risk:
            related = [warning for warning in warnings if warning.get("risk_id") == risk["id"] or (
                warning.get("source_update_id") and warning.get("source_update_id") == risk.get("source_update_id")
            )]
            risk_values = [
                _value("Overall hybrid risk", risk["overall_score"], unit="score / 100", field="overall_score", table="project_risks", record=risk["id"], timestamp=risk["assessed_at"]),
                _value("Cost risk", risk.get("cost_risk"), unit="score / 100", field="cost_overrun_risk", table="project_risks", record=risk["id"], timestamp=risk["assessed_at"]),
                _value("Schedule risk", risk.get("schedule_risk"), unit="score / 100", field="schedule_delay_risk", table="project_risks", record=risk["id"], timestamp=risk["assessed_at"]),
                _value("Implementation risk", risk.get("implementation_risk"), unit="score / 100", field="implementation_risk", table="project_risks", record=risk["id"], timestamp=risk["assessed_at"]),
            ]
            risk_snapshot = risk.get("input_snapshot") or {}
            for component_name, component in (risk_snapshot.get("components") or {}).items():
                if isinstance(component, dict) and component.get("available"):
                    risk_values.append(_value(
                        f"{component_name.title()} component score", component.get("overallScore"),
                        unit="score / 100", field=f"components.{component_name}.overallScore",
                        table="project_risks.input_snapshot", record=risk["id"], timestamp=risk["assessed_at"],
                    ))
            ml_provenance = ((risk_snapshot.get("components") or {}).get("ml") or {}).get("provenance", {})
            for model in ml_provenance.get("models", []):
                risk_values.append(_value(
                    f"ML {model.get('signal', 'model')} provenance",
                    f"{model.get('modelName')} v{model.get('modelVersion')}",
                    field="components.ml.provenance", formula=f"training data {model.get('trainingDataVersion')}",
                    table="project_risks.input_snapshot", record=risk["id"], timestamp=model.get("generatedAt"),
                ))
            driver_values = [_value(
                driver["name"], driver["value"], unit="score / 100", field=driver["code"],
                formula=driver.get("description"), table="risk_drivers", record=driver.get("id"), timestamp=driver.get("created_at"),
            ) for driver in risk.get("drivers", [])]
            provenance = risk_snapshot.get("provenance", {})
            chains.append({
                "chain_id": f"risk:{risk['id']}", "subject_type": "risk", "subject_id": str(risk["id"]),
                "title": f"Current {risk['risk_level'].replace('_', ' ').title()} project risk",
                "severity": risk["risk_level"], "status": "current", "as_of_date": risk.get("assessment_period") or risk["assessed_at"],
                "nodes": [
                    _source_node(risk.get("source_snapshot")),
                    _derived_node(risk.get("source_snapshot"), milestones),
                    _node("prediction", "Stored hybrid risk assessment", "calculated_analytics", description=risk.get("explanation"), timestamp=risk["assessed_at"], table="project_risks", record=risk["id"], rule_version=provenance.get("ensembleVersion") or risk.get("methodology"), values=[item for item in risk_values if item["value"] is not None]),
                    _node("explanation", "Stored risk drivers", "calculated_analytics", timestamp=risk["assessed_at"], table="risk_drivers", rule_version=provenance.get("ruleVersion"), values=driver_values),
                    _warning_node(related), _intervention_node(related, interventions),
                ],
            })

        for prediction in predictions:
            related = [warning for warning in warnings if _warning_matches_prediction(warning, prediction)]
            chains.append({
                "chain_id": f"prediction:{prediction['id']}", "subject_type": "prediction", "subject_id": str(prediction["id"]),
                "title": "Schedule overrun prediction" if prediction["prediction_type"] == "completion_date" else "Cost overrun prediction",
                "severity": related[0]["severity"] if related else None, "status": "generated", "as_of_date": prediction["generated_at"],
                "nodes": [
                    _source_node(prediction.get("source_snapshot"), prediction.get("feature_snapshot")),
                    _derived_node(prediction.get("source_snapshot"), milestones),
                    _prediction_node(prediction), _prediction_explanation_node(prediction),
                    _warning_node(related), _intervention_node(related, interventions),
                ],
            })

        for warning in warnings:
            matching = [prediction for prediction in predictions if _warning_matches_prediction(warning, prediction)]
            if matching:
                prediction_node = _prediction_node(matching[0])
                explanation_node = _prediction_explanation_node(matching[0])
            else:
                prediction_node = _node(
                    "prediction", "Documented rule / risk trigger", "documented_rule",
                    description=warning.get("description"), timestamp=warning["detected_at"], table="warnings",
                    record=warning["id"], rule_version=(warning.get("metadata") or {}).get("engine_version"),
                    values=[_value("Trigger rule", warning.get("trigger_rule"), field="trigger_rule", table="warnings", record=warning["id"], timestamp=warning["detected_at"])],
                )
                explanation_node = _node(
                    "explanation", "Stored warning evidence", "documented_rule",
                    description="Evidence values were persisted by the warning engine when the rule fired.",
                    timestamp=warning["detected_at"], table="warnings", record=warning["id"],
                    rule_version=(warning.get("metadata") or {}).get("engine_version"),
                    values=[_value(str(item.get("indicator", "Evidence")), item.get("current"), formula=warning.get("trigger_rule"), table="warnings.evidence", record=warning["id"], timestamp=warning["detected_at"]) for item in warning.get("evidence", []) if isinstance(item, dict)],
                )
            chains.append({
                "chain_id": f"warning:{warning['id']}", "subject_type": "warning", "subject_id": warning["warning_code"],
                "title": warning["title"], "severity": warning["severity"], "status": warning["status"], "as_of_date": warning["detected_at"],
                "nodes": [
                    _source_node(warning.get("source_snapshot")),
                    _derived_node(warning.get("source_snapshot"), milestones),
                    prediction_node, explanation_node, _warning_node([warning]), _intervention_node([warning], interventions),
                ],
            })

        omissions = []
        if not risk:
            omissions.append("No persisted current risk snapshot is visible for this project.")
        if not predictions:
            omissions.append("No persisted genuine model predictions are visible; they may be unavailable or restricted for the current role.")
        if not warnings:
            omissions.append("No persisted High/Critical warnings are recorded for this project.")
        if not interventions and profile.role in {"analyst"}:
            omissions.append("Created interventions are not visible to the Analyst role; warning recommendations remain available.")
        return {
            "project_id": project["project_id"], "project_name": project["project_name"],
            "generated_at": datetime.now(UTC), "chains": chains, "omissions": omissions,
            "methodology": METHODOLOGY,
        }
