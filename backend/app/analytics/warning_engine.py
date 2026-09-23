from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.config import Settings


WARNING_ENGINE_VERSION = "automated-warning-v1"


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def _date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _severity(value: float, high: float, critical: float) -> str:
    if value >= critical:
        return "critical"
    if value >= high:
        return "high"
    return "moderate"


def _condition(
    *,
    rule_code: str,
    alert_type: str,
    title: str,
    description: str,
    trigger_rule: str,
    severity: str,
    current_value: Any,
    previous_value: Any,
    recommended_action: str,
    evidence: list[dict[str, Any]],
    source_type: str = "rule",
) -> dict[str, Any]:
    return {
        "rule_code": rule_code,
        "alert_type": alert_type,
        "title": title,
        "description": description,
        "trigger_rule": trigger_rule,
        "severity": severity,
        "current_value": current_value,
        "previous_value": previous_value,
        "recommended_action": recommended_action,
        "evidence": evidence,
        "source_type": source_type,
        "engine_version": WARNING_ENGINE_VERSION,
    }


def _stagnation_cycles(progress_history: list[Any], epsilon: float) -> int:
    values = [number for value in progress_history if (number := _number(value)) is not None]
    if not values:
        return 0
    cycles = 1
    for newer, older in zip(values, values[1:]):
        if abs(newer - older) <= epsilon:
            cycles += 1
        else:
            break
    return cycles


def evaluate_warning_conditions(facts: dict[str, Any], settings: Settings) -> list[dict[str, Any]]:
    current = facts.get("current") or {}
    previous = facts.get("previous") or {}
    reporting_month = facts.get("reporting_month")
    conditions: list[dict[str, Any]] = []

    actual = _number(current.get("physical_progress"))
    planned = _number(current.get("planned_progress"))
    previous_actual = _number(previous.get("physical_progress"))
    previous_planned = _number(previous.get("planned_progress"))
    progress_gap = max(0.0, planned - actual) if planned is not None and actual is not None else None
    previous_gap = max(0.0, previous_planned - previous_actual) if previous_planned is not None and previous_actual is not None else None
    if progress_gap is not None and progress_gap > settings.warning_progress_variance_threshold_pp:
        conditions.append(_condition(
            rule_code="PROGRESS_VARIANCE",
            alert_type="progress",
            title="Physical progress materially behind plan",
            description=f"Actual progress trails planned progress by {progress_gap:.1f} percentage points.",
            trigger_rule=f"planned_progress - physical_progress > {settings.warning_progress_variance_threshold_pp:g} pp",
            severity=_severity(progress_gap, settings.warning_progress_variance_high_pp, settings.warning_progress_variance_critical_pp),
            current_value=progress_gap,
            previous_value=previous_gap,
            recommended_action="Require a time-bound recovery plan with monthly activity-level targets.",
            evidence=[{"indicator": "progress_variance_pp", "current": progress_gap, "previous": previous_gap, "plannedProgress": planned, "actualProgress": actual, "reportingMonth": reporting_month}],
        ))

    approved = _number(current.get("approved_cost"))
    revised = _number(current.get("revised_cost"))
    previous_approved = _number(previous.get("approved_cost"))
    previous_revised = _number(previous.get("revised_cost"))
    escalation = max(0.0, (revised - approved) / approved * 100) if approved and revised is not None else None
    previous_escalation = max(0.0, (previous_revised - previous_approved) / previous_approved * 100) if previous_approved and previous_revised is not None else None
    if escalation is not None and escalation > settings.warning_cost_escalation_threshold_pct:
        conditions.append(_condition(
            rule_code="COST_ESCALATION",
            alert_type="cost",
            title="Significant cost escalation recorded",
            description=f"Revised cost is {escalation:.1f}% above the approved cost.",
            trigger_rule=f"cost_escalation_pct > {settings.warning_cost_escalation_threshold_pct:g}%",
            severity=_severity(escalation, settings.warning_cost_escalation_high_pct, settings.warning_cost_escalation_critical_pct),
            current_value=escalation,
            previous_value=previous_escalation,
            recommended_action="Validate the revised cost basis and submit a cost-containment and approval plan.",
            evidence=[{"indicator": "cost_escalation_pct", "current": escalation, "previous": previous_escalation, "approvedCost": approved, "revisedCost": revised, "reportingMonth": reporting_month}],
        ))

    overdue = int(_number(facts.get("overdue_milestones")) or 0)
    previous_overdue = int(_number(facts.get("previous_overdue_milestones")) or 0)
    if overdue >= settings.warning_overdue_milestone_threshold_count:
        conditions.append(_condition(
            rule_code="MILESTONE_OVERDUE",
            alert_type="milestone",
            title="Project milestones overdue",
            description=f"{overdue} monitored milestone(s) are overdue or reported delayed.",
            trigger_rule=f"overdue_milestones >= {settings.warning_overdue_milestone_threshold_count}",
            severity=_severity(overdue, settings.warning_overdue_milestone_high_count, settings.warning_overdue_milestone_critical_count),
            current_value=overdue,
            previous_value=previous_overdue,
            recommended_action="Assign owners and recovery dates for each overdue milestone and review weekly.",
            evidence=[{"indicator": "overdue_milestones", "current": overdue, "previous": previous_overdue, "reportingMonth": reporting_month}],
        ))

    financial = _number(current.get("financial_progress"))
    if financial is None and revised and _number(current.get("expenditure")) is not None:
        financial = float(current["expenditure"]) / revised * 100
    previous_financial = _number(previous.get("financial_progress"))
    if previous_financial is None and previous_revised and _number(previous.get("expenditure")) is not None:
        previous_financial = float(previous["expenditure"]) / previous_revised * 100
    expenditure_gap = max(0.0, financial - actual) if financial is not None and actual is not None else None
    previous_expenditure_gap = max(0.0, previous_financial - previous_actual) if previous_financial is not None and previous_actual is not None else None
    if expenditure_gap is not None and expenditure_gap > settings.warning_expenditure_gap_threshold_pp:
        conditions.append(_condition(
            rule_code="EXPENDITURE_AHEAD_OF_PROGRESS",
            alert_type="financial_progress",
            title="Expenditure materially ahead of physical progress",
            description=f"Financial progress exceeds verified physical progress by {expenditure_gap:.1f} percentage points.",
            trigger_rule=f"financial_progress - physical_progress > {settings.warning_expenditure_gap_threshold_pp:g} pp",
            severity=_severity(expenditure_gap, settings.warning_expenditure_gap_high_pp, settings.warning_expenditure_gap_critical_pp),
            current_value=expenditure_gap,
            previous_value=previous_expenditure_gap,
            recommended_action="Reconcile certified quantities, payments, and physical achievement before further drawdown.",
            evidence=[{"indicator": "financial_physical_gap_pp", "current": expenditure_gap, "previous": previous_expenditure_gap, "financialProgress": financial, "physicalProgress": actual, "reportingMonth": reporting_month}],
        ))

    current_completion = _date(current.get("revised_completion_date") or current.get("forecast_completion_date") or current.get("original_completion_date"))
    previous_completion = _date(previous.get("revised_completion_date") or previous.get("forecast_completion_date") or previous.get("original_completion_date"))
    revision_days = (current_completion - previous_completion).days if current_completion and previous_completion else None
    if revision_days is not None and revision_days >= settings.warning_completion_revision_threshold_days:
        conditions.append(_condition(
            rule_code="COMPLETION_DATE_REVISION",
            alert_type="schedule",
            title="Completion date revised outward",
            description=f"The monitored completion date moved later by {revision_days} days since the previous reporting cycle.",
            trigger_rule=f"completion_date_revision_days >= {settings.warning_completion_revision_threshold_days}",
            severity=_severity(revision_days, settings.warning_completion_revision_high_days, settings.warning_completion_revision_critical_days),
            current_value=current_completion.isoformat(),
            previous_value=previous_completion.isoformat(),
            recommended_action="Review the critical path and approve a dated schedule-recovery baseline.",
            evidence=[{"indicator": "completion_date_revision_days", "current": revision_days, "previousCompletionDate": previous_completion, "currentCompletionDate": current_completion, "reportingMonth": reporting_month}],
        ))

    current_risk = _number(facts.get("current_risk_score"))
    previous_risk = _number(facts.get("previous_risk_score"))
    risk_delta = current_risk - previous_risk if current_risk is not None and previous_risk is not None else None
    if risk_delta is not None and risk_delta >= settings.warning_risk_increase_threshold_points:
        conditions.append(_condition(
            rule_code="RISK_SCORE_INCREASE",
            alert_type="risk",
            title="Sharp increase in project risk score",
            description=f"The hybrid risk score increased by {risk_delta:.1f} points since the previous assessment.",
            trigger_rule=f"risk_score_change >= {settings.warning_risk_increase_threshold_points:g} points",
            severity=_severity(risk_delta, settings.warning_risk_increase_high_points, settings.warning_risk_increase_critical_points),
            current_value=current_risk,
            previous_value=previous_risk,
            recommended_action="Review the changed risk drivers and decide whether an intervention should be opened.",
            evidence=[{"indicator": "risk_score", "current": current_risk, "previous": previous_risk, "change": risk_delta, "riskId": facts.get("current_risk_id"), "reportingMonth": reporting_month}],
            source_type="hybrid_risk",
        ))

    schedule_prediction = facts.get("schedule_prediction") or {}
    delay_probability = _number(schedule_prediction.get("schedule_overrun_probability"))
    if delay_probability is not None and delay_probability >= settings.warning_delay_probability_threshold:
        conditions.append(_condition(
            rule_code="PREDICTED_DELAY_PROBABILITY",
            alert_type="prediction",
            title="High predicted probability of schedule overrun",
            description=f"The registered schedule model estimates a {delay_probability * 100:.1f}% probability of schedule overrun.",
            trigger_rule=f"schedule_overrun_probability >= {settings.warning_delay_probability_threshold:.2f}",
            severity=_severity(delay_probability, settings.warning_delay_probability_high, settings.warning_delay_probability_critical),
            current_value=delay_probability,
            previous_value=_number(facts.get("previous_schedule_probability")),
            recommended_action="Validate model drivers and require schedule mitigation for the leading controllable factors.",
            evidence=[{"indicator": "schedule_overrun_probability", "current": delay_probability, "modelName": schedule_prediction.get("model_name"), "modelVersion": schedule_prediction.get("model_version"), "generatedAt": schedule_prediction.get("generated_at"), "synthetic": schedule_prediction.get("synthetic")}],
            source_type="ml",
        ))

    cost_prediction = facts.get("cost_prediction") or {}
    cost_probability = _number(cost_prediction.get("significant_overrun_probability"))
    if cost_probability is not None and cost_probability >= settings.warning_cost_probability_threshold:
        conditions.append(_condition(
            rule_code="PREDICTED_COST_OVERRUN",
            alert_type="prediction",
            title="High predicted probability of significant cost overrun",
            description=f"The registered cost model estimates a {cost_probability * 100:.1f}% probability of significant cost overrun.",
            trigger_rule=f"significant_overrun_probability >= {settings.warning_cost_probability_threshold:.2f}",
            severity=_severity(cost_probability, settings.warning_cost_probability_high, settings.warning_cost_probability_critical),
            current_value=cost_probability,
            previous_value=_number(facts.get("previous_cost_probability")),
            recommended_action="Review the SHAP cost drivers and validate a cost-containment response.",
            evidence=[{"indicator": "significant_overrun_probability", "current": cost_probability, "modelName": cost_prediction.get("model_name"), "modelVersion": cost_prediction.get("model_version"), "generatedAt": cost_prediction.get("generated_at"), "synthetic": cost_prediction.get("synthetic")}],
            source_type="ml",
        ))

    history = facts.get("recent_physical_progress") or []
    stagnation_cycles = _stagnation_cycles(history, settings.warning_stagnation_epsilon_pp)
    if stagnation_cycles >= settings.warning_stagnation_cycles:
        conditions.append(_condition(
            rule_code="REPEATED_STAGNATION",
            alert_type="progress",
            title="Physical progress repeatedly stagnant",
            description=f"Physical progress changed by no more than {settings.warning_stagnation_epsilon_pp:g} percentage points across {stagnation_cycles} consecutive reporting cycles.",
            trigger_rule=f"stagnant_cycles >= {settings.warning_stagnation_cycles} with change <= {settings.warning_stagnation_epsilon_pp:g} pp",
            severity=_severity(stagnation_cycles, settings.warning_stagnation_high_cycles, settings.warning_stagnation_critical_cycles),
            current_value=actual,
            previous_value=history[1] if len(history) > 1 else previous_actual,
            recommended_action="Require evidence of site activity and a measurable progress recovery commitment for the next cycle.",
            evidence=[{"indicator": "physical_progress_stagnation", "cycles": stagnation_cycles, "epsilonPp": settings.warning_stagnation_epsilon_pp, "recentValues": history[:settings.warning_stagnation_critical_cycles], "reportingMonth": reporting_month}],
        ))

    return conditions
