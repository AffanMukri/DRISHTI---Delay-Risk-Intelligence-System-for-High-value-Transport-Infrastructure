from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import (
    get_analytics_service,
    get_assistant_document_service,
    get_assistant_service,
    get_cuf_analysis_runner,
    get_cuf_service,
    get_evidence_service,
    get_health_service,
    get_intervention_service,
    get_portfolio_service,
    get_prediction_service,
    get_project_service,
    get_public_project_service,
    get_risk_service,
    get_scenario_service,
    get_warning_service,
)
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.errors import NotFoundError
from app.main import create_app


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
DATABASE_ID = UUID("20000000-0000-0000-0000-000000000001")
RISK_ID = UUID("30000000-0000-0000-0000-000000000001")
BATCH_ID = UUID("70000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)


def project() -> dict[str, object]:
    return {
        "id": "PX-001",
        "database_id": DATABASE_ID,
        "name": "National Connectivity Corridor",
        "ministry": "Ministry of Infrastructure",
        "implementing_agency": "National Projects Agency",
        "department": "Corridors",
        "sector": "Transport",
        "project_type": "Infrastructure",
        "state": "Multi-state",
        "states": ["Delhi", "Uttar Pradesh"],
        "description": "Demo project",
        "status": "active",
        "currency": "INR",
        "approved_cost": 1000.0,
        "revised_cost": 1120.0,
        "expenditure": 610.0,
        "physical_progress": 61.0,
        "planned_progress": 70.0,
        "financial_progress": 54.46,
        "original_completion_date": date(2026, 12, 31),
        "revised_completion_date": date(2027, 3, 31),
        "delay_days": 90,
        "last_reported_at": NOW,
        "cost_breakdown": {"civil": 700},
        "latitude": 28.6139,
        "longitude": 77.209,
        "risk": {"overall_score": 72.0, "risk_level": "high_risk"},
    }


def risk() -> dict[str, object]:
    return {
        "id": RISK_ID,
        "project_id": "PX-001",
        "project_name": "National Connectivity Corridor",
        "assessed_at": NOW,
        "assessment_period": date(2026, 9, 1),
        "overall_score": 72.0,
        "risk_level": "high_risk",
        "cost_overrun_risk": 65.0,
        "schedule_delay_risk": 78.0,
        "implementation_risk": 70.0,
        "methodology": "deterministic",
        "explanation": "Schedule slippage",
        "drivers": [{
            "code": "SCHEDULE_GAP",
            "name": "Schedule gap",
            "impact": "high",
            "value": 78.0,
            "weighted_contribution": 31.2,
            "rank": 1,
            "description": "Actual progress is behind plan",
            "evidence": [],
        }],
    }


def warning() -> dict[str, object]:
    return {
        "id": "WARN-001",
        "database_id": UUID("40000000-0000-0000-0000-000000000001"),
        "project_id": "PX-001",
        "project_name": "National Connectivity Corridor",
        "ministry": "Ministry of Infrastructure",
        "severity": "high",
        "status": "acknowledged",
        "alert_type": "schedule",
        "title": "Schedule variance threshold exceeded",
        "description": "Progress is below plan.",
        "trigger_rule": "gap > 5",
        "evidence": [],
        "detected_at": NOW,
        "acknowledged_at": NOW,
        "resolved_at": None,
        "assigned_to_name": "Monitoring Team",
        "source_type": "rule",
        "source_reference": None,
        "source_update_id": None,
        "current_value": 9,
        "previous_value": 6,
        "recommended_action": "Convene a recovery review.",
        "first_detected_at": NOW,
        "last_detected_at": NOW,
        "occurrence_count": 1,
        "metadata": {},
    }


def intervention() -> dict[str, object]:
    return {
        "id": "INT-001",
        "database_id": UUID("50000000-0000-0000-0000-000000000001"),
        "project_id": "PX-001",
        "project_name": "National Connectivity Corridor",
        "ministry": "Ministry of Infrastructure",
        "warning_id": "WARN-001",
        "warning_title": "Schedule variance threshold exceeded",
        "warning_severity": "high",
        "issue": "Schedule variance",
        "recommended_action": "Convene a recovery review",
        "priority": "high",
        "status": "open",
        "assigned_to": USER_ID,
        "assigned_to_name": "Monitoring Team",
        "due_date": date(2026, 10, 1),
        "opened_at": date(2026, 9, 17),
        "resolved_at": None,
        "resolution_summary": None,
        "escalated_at": None,
        "escalation_reason": None,
        "escalated_by": None,
        "notes": "Track weekly",
        "created_at": NOW,
        "updated_at": NOW,
    }


def prediction_explanation() -> dict[str, object]:
    comparison = {
        "feature": "progress_variance",
        "featureLabel": "Physical progress variance",
        "actualValue": -9,
        "referenceValue": -3,
        "percentile": 22,
        "unit": "percentage_points",
        "cohort": "historical training projects in Transport",
        "cohortSize": 40,
        "explanation": "Current value is -9; the historical median is -3.",
    }
    contribution = {
        "feature": "progress_variance",
        "featureLabel": "Physical progress variance",
        "actualValue": -9,
        "featureUnit": "percentage_points",
        "contribution": 16,
        "contributionUnit": "probability_percentage_points",
        "direction": "risk_increasing",
        "humanExplanation": "Physical progress variance increases overrun probability.",
        "historicalComparison": comparison,
    }
    return {
        "version": "shap-v1",
        "ml": {
            "available": True,
            "method": "SHAP",
            "explainer": "TreeExplainer",
            "modelName": "pragati_x_cost_overrun",
            "modelVersion": "1.0.0",
            "modelOutput": "classification_probability",
            "target": "significant_cost_overrun_probability",
            "targetLabel": "cost overrun probability",
            "outputUnit": "probability_percentage_points",
            "baseValue": 45,
            "predictionValue": 61,
            "additivityResidual": 0,
            "positiveDrivers": [contribution],
            "protectiveDrivers": [],
            "contributions": [contribution],
            "numericalSource": "SHAP values from the fitted estimator.",
        },
        "rules": {
            "method": "deterministic_thresholds",
            "triggers": [{
                "ruleId": "RULE_PROGRESS_BEHIND_PLAN",
                "feature": "progress_variance",
                "featureLabel": "Physical progress variance",
                "actualValue": -9,
                "unit": "percentage_points",
                "explanation": "Actual physical progress is below plan.",
            }],
        },
        "historical": {
            "method": "training_cohort_comparison",
            "available": True,
            "cohort": "historical training projects in Transport",
            "cohortSize": 40,
            "comparisons": [comparison],
        },
    }


class FakeHealthService:
    async def status(self) -> dict[str, object]:
        return {
            "status": "ok",
            "service": "PRAGATI-X API",
            "version": "1.0.0",
            "environment": "test",
            "database": "connected",
            "timestamp": NOW,
        }


class FakeProjectService:
    async def list_public(self, **values: object) -> dict[str, object]:
        item = await self.get_public("PX-001")
        return {"items": [item], "total": 1, "limit": values["limit"], "offset": values["offset"]}

    async def get_public(self, identifier: str) -> dict[str, object]:
        if identifier == "missing":
            raise NotFoundError("Public project", identifier)
        value = project()
        return {
            "id": value["id"],
            "name": value["name"],
            "ministry": value["ministry"],
            "implementing_agency": value["implementing_agency"],
            "sector": value["sector"],
            "project_type": value["project_type"],
            "state": value["state"],
            "description": value["description"],
            "status": value["status"],
            "currency": value["currency"],
            "approved_cost": value["approved_cost"],
            "revised_cost": value["revised_cost"],
            "physical_progress": value["physical_progress"],
            "original_completion_date": value["original_completion_date"],
            "revised_completion_date": value["revised_completion_date"],
            "last_reported_at": value["last_reported_at"],
            "milestones": [{"name": "Foundation complete", "planned_date": date(2026, 6, 30)}],
        }

    async def list(self, **values: object) -> dict[str, object]:
        return {"items": [project()], "total": 1, "limit": values["limit"], "offset": values["offset"]}

    async def get(self, identifier: str) -> dict[str, object]:
        if identifier == "missing":
            raise NotFoundError("Project", identifier)
        return {**project(), "milestones": []}

    async def history(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "monthly_updates": [{
                "reporting_month": date(2026, 9, 1),
                "approved_cost": 1000,
                "revised_cost": 1120,
                "expenditure": 610,
                "physical_progress": 61,
                "planned_progress": 70,
                "financial_progress": 54.46,
                "original_completion_date": date(2026, 12, 31),
                "revised_completion_date": date(2027, 3, 31),
                "forecast_completion_date": date(2027, 4, 30),
                "delay_days": 90,
                "milestones_total": 10,
                "milestones_completed": 6,
                "milestones_delayed": 2,
                "milestones_at_risk": 1,
                "land_acquisition_progress": 94,
                "clearance_status": {"environment": "approved"},
                "contract_status": "active",
                "issues": ["Utility relocation"],
                "remarks": "Recovery plan requested",
            }],
            "cost_history": [],
            "schedule_history": [],
        }

    async def data_confidence(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "project_name": "National Connectivity Corridor",
            "score_type": "data_quality",
            "is_prediction_probability": False,
            "overall_score": 78.5,
            "rating": "moderate",
            "as_of_date": date(2026, 9, 20),
            "latest_reporting_month": date(2026, 9, 1),
            "components": [{
                "code": "freshness",
                "label": "Latest-update freshness",
                "score": 100,
                "weight": 0.15,
                "weighted_score": 15,
                "reasons": [],
                "missing_fields": [],
                "stale_fields": [],
                "evidence": {"age_days": 19},
            }],
            "reasons_lowering_confidence": ["Only 6 of 12 reporting periods are available."],
            "missing_fields": ["clearance_status"],
            "stale_fields": [],
            "configuration": {
                "formula_version": "data-confidence-v1",
                "weights": {"freshness": 0.15},
                "fresh_days": 45,
                "stale_days": 180,
                "history_target_months": 12,
                "anomaly_penalty": 20,
                "validation_issue_penalty": 10,
                "statement": "This score measures input data and is not a prediction probability.",
            },
        }


class FakePortfolioService:
    async def summary(self) -> dict[str, object]:
        return {
            "total_projects": 1,
            "portfolio_value": 1120,
            "total_expenditure": 610,
            "cost_overrun_exposure": 120,
            "delayed_projects": 1,
            "active_warnings": 1,
            "open_interventions": 1,
            "healthy": 0,
            "watch": 0,
            "high_risk": 1,
            "critical": 0,
        }

    async def changes(self) -> dict[str, object]:
        project_change = {
            "project_id": "PX-001",
            "project_name": "National Connectivity Corridor",
            "ministry": "Ministry of Infrastructure",
            "sector": "Transport",
            "state": "Multi-state",
            "previous_risk_level": "watch",
            "current_risk_level": "high_risk",
            "previous_overall_risk": 55,
            "current_overall_risk": 72,
            "previous_cost_risk": 50,
            "current_cost_risk": 65,
            "previous_schedule_risk": 65,
            "current_schedule_risk": 78,
            "previous_revised_cost": 1000,
            "current_revised_cost": 1120,
            "change_value": 17,
            "detail": "Overall risk increase",
        }
        metric = {"count": 1, "projects": [project_change]}
        empty_metric = {"count": 0, "projects": []}
        return {
            "comparison_available": True,
            "latest_period": date(2026, 9, 1),
            "previous_period": date(2026, 8, 1),
            "headline": "Portfolio movement from August 2026 to September 2026",
            "summary_points": ["One project entered High Risk."],
            "newly_high_risk": metric,
            "newly_critical": empty_metric,
            "recovered": empty_metric,
            "significant_cost_risk_increase": metric,
            "significant_schedule_risk_increase": metric,
            "newly_overdue_milestones": {"count": 0, "project_count": 0, "projects": [], "milestones": []},
            "new_critical_warnings": {"count": 0, "warnings": []},
            "resolved_warnings": {"count": 0, "warnings": []},
            "capital_exposure": {"previous": 0, "current": 1120, "change": 1120, "change_percentage": None, "projects": [project_change]},
            "emerging_risk_drivers": [{"code": "SCHEDULE", "name": "Schedule delay", "project_count": 1, "average_increase": 13, "maximum_increase": 13, "projects": [project_change]}],
            "dimensions": {"sectors": [], "ministries": [], "states": []},
            "data_availability": {"latest_snapshot_projects": 1, "previous_snapshot_projects": 1, "comparable_projects": 1, "capital_comparable_projects": 1, "excluded_projects": 0},
            "thresholds": {"significant_risk_increase_points": 10, "emerging_driver_increase_points": 2},
        }


class FakeAnalyticsService:
    async def get(self, kind: str) -> dict[str, object]:
        return {"summary": {"kind": kind, "count": 1}, "series": [], "breakdown": []}

    async def cost(self, **_: object) -> dict[str, object]:
        project_row = {
            "project_id": "PX-001",
            "project_name": "National Connectivity Corridor",
            "ministry": "Ministry of Infrastructure",
            "sector": "Transport",
            "original_approved_cost": 1000,
            "latest_revised_cost": 1120,
            "cumulative_expenditure": 610,
            "absolute_cost_escalation": 120,
            "cost_escalation_percentage": 12,
            "expenditure_percentage": 54.46,
            "physical_progress": 61,
            "progress_mismatch": -6.54,
            "approved_cost_source": "monthly_history",
            "revised_cost_source": "monthly_history",
            "expenditure_source": "monthly_history",
            "has_monthly_history": True,
        }
        aggregate = {
            "project_count": 1,
            "comparable_projects": 1,
            "original_approved_cost": 1000,
            "latest_revised_cost": 1120,
            "cumulative_expenditure": 610,
            "absolute_cost_escalation": 120,
            "cost_escalation_percentage": 12,
        }
        return {
            "summary": {
                "total_projects": 1,
                "original_approved_cost": 1000,
                "latest_revised_cost": 1120,
                "cumulative_expenditure": 610,
                "absolute_cost_escalation": 120,
                "cost_escalation_percentage": 12,
                "expenditure_percentage": 54.46,
                "escalated_projects": 1,
            },
            "data_availability": {
                "total_projects": 1,
                "approved_cost_projects": 1,
                "revised_cost_projects": 1,
                "expenditure_projects": 1,
                "physical_progress_projects": 1,
                "comparable_cost_projects": 1,
                "monthly_history_projects": 1,
                "incomplete_cost_projects": 0,
                "latest_reporting_month": date(2026, 9, 1),
            },
            "series": [{
                "period": date(2026, 9, 1),
                "reporting_projects": 1,
                "approved_cost_projects": 1,
                "revised_cost_projects": 1,
                "expenditure_projects": 1,
                "original_approved_cost": 1000,
                "latest_revised_cost": 1120,
                "cumulative_expenditure": 610,
                "absolute_cost_escalation": 120,
                "cost_escalation_percentage": 12,
            }],
            "sector_breakdown": [{"sector": "Transport", **aggregate}],
            "ministry_breakdown": [{"ministry": "Ministry of Infrastructure", **aggregate}],
            "project_breakdown": [project_row],
            "breakdown": [project_row],
            "progress_mismatches": [],
        }

    async def schedule(self, **_: object) -> dict[str, object]:
        project = {
            "project_id": "PX-001",
            "project_name": "National Connectivity Corridor",
            "ministry": "Ministry of Infrastructure",
            "implementing_agency": "National Projects Agency",
            "sector": "Transport",
            "original_completion_date": date(2026, 12, 31),
            "current_completion_date": date(2027, 3, 31),
            "schedule_slippage_days": 90,
            "planned_physical_progress": 70,
            "actual_physical_progress": 61,
            "progress_variance": -9,
            "monitoring_start_date": date(2026, 1, 1),
            "as_of_date": date(2026, 9, 1),
            "elapsed_duration_percentage": 53.82,
            "total_milestones": 10,
            "completed_milestones": 6,
            "on_track_milestones": 2,
            "at_risk_milestones": 1,
            "delayed_milestones": 1,
            "overdue_milestones": 1,
            "milestone_completion_percentage": 60,
            "monthly_progress_velocity": 2.5,
            "has_monthly_history": True,
            "delay_rank": 1,
        }
        aggregate = {
            "project_count": 1,
            "comparable_projects": 1,
            "delayed_projects": 1,
            "average_delay_days": 90,
            "maximum_delay_days": 90,
            "average_progress_variance": -9,
            "average_monthly_progress_velocity": 2.5,
        }
        return {
            "summary": {
                "total_projects": 1,
                "delayed_projects": 1,
                "on_time_projects": 0,
                "severe_delayed_projects": 0,
                "chronic_delayed_projects": 0,
                "average_slippage_days": 90,
                "maximum_slippage_days": 90,
                "average_planned_progress": 70,
                "average_actual_progress": 61,
                "average_progress_variance": -9,
                "average_elapsed_duration_percentage": 53.82,
                "average_monthly_progress_velocity": 2.5,
                "total_milestones": 10,
                "completed_milestones": 6,
                "on_track_milestones": 2,
                "at_risk_milestones": 1,
                "delayed_milestones": 1,
                "overdue_milestones": 1,
                "milestone_completion_percentage": 60,
            },
            "data_availability": {
                "total_projects": 1,
                "original_date_projects": 1,
                "current_date_projects": 1,
                "comparable_date_projects": 1,
                "planned_progress_projects": 1,
                "actual_progress_projects": 1,
                "comparable_progress_projects": 1,
                "elapsed_duration_projects": 1,
                "velocity_projects": 1,
                "monthly_history_projects": 1,
                "milestone_detail_projects": 1,
                "milestone_reporting_projects": 1,
                "latest_as_of_date": date(2026, 9, 1),
                "latest_reporting_month": date(2026, 9, 1),
            },
            "series": [{
                "period": date(2026, 9, 1),
                "reporting_projects": 1,
                "planned_progress_projects": 1,
                "actual_progress_projects": 1,
                "planned_progress": 70,
                "actual_progress": 61,
                "progress_variance": -9,
                "monthly_progress_velocity": 2.5,
                "average_slippage_days": 90,
            }],
            "delay_brackets": [{"bracket": "1-12 Months", "project_count": 1, "sort_order": 2}],
            "sector_breakdown": [{"sector": "Transport", **aggregate}],
            "ministry_breakdown": [{"ministry": "Ministry of Infrastructure", **aggregate}],
            "project_breakdown": [project],
            "breakdown": [project],
        }

    async def benchmark(self, **_: object) -> dict[str, object]:
        selected = {
            "project_id": "PX-001",
            "project_name": "National Connectivity Corridor",
            "ministry": "Ministry of Infrastructure",
            "implementing_agency": "National Projects Agency",
            "sector": "Transport",
            "project_type": "Rail Infrastructure",
            "state": "Maharashtra",
            "states": ["Maharashtra"],
            "status": "active",
            "original_cost": 1000,
            "revised_cost": 1120,
            "start_date": date(2022, 1, 1),
            "start_date_source": "earliest_milestone",
            "start_year": 2022,
            "planned_duration_days": 1825,
            "cost_band": "₹1,000-5,000 Cr",
            "cost_overrun_percentage": 12,
            "schedule_delay_days": 90,
            "monthly_progress_velocity": 2.5,
            "expenditure_efficiency": 95,
            "milestone_slippage_percentage": 10,
            "milestone_completion_percentage": 60,
            "overall_risk_score": 55,
            "cost_risk_score": 50,
            "schedule_risk_score": 60,
            "implementation_risk_score": 45,
        }
        peer = {
            **selected,
            "project_id": "PX-002",
            "project_name": "Comparable Rail Corridor",
            "match_score": 85,
            "match_reasons": ["Same sector: Transport", "Same project type: Rail Infrastructure"],
            "is_historical": True,
        }
        return {
            "selected_project": selected,
            "comparison_peer": peer,
            "peer_group": {
                "selection_method": "weighted sector/type peer match",
                "minimum_match_score": 30,
                "candidate_projects_evaluated": 1,
                "peer_count": 1,
                "historical_peer_count": 1,
                "maximum_peers": 8,
            },
            "peers": [peer],
            "historical_peers": [peer],
            "metric_comparisons": [{
                "key": "cost_overrun_percentage",
                "label": "Cost overrun",
                "unit": "%",
                "lower_is_better": True,
                "selected_value": 12,
                "comparison_value": 12,
                "sector_median": 12,
                "peer_median": 12,
                "historical_median": 12,
                "sector_sample_size": 2,
                "peer_sample_size": 1,
                "historical_sample_size": 1,
            }],
            "radar": [{
                "subject": "Cost discipline",
                "selected_score": 76,
                "comparison_score": 76,
                "peer_median_score": 76,
            }],
            "agency_leaderboard": [{
                "rank": 1,
                "agency": "National Projects Agency",
                "project_count": 2,
                "total_outlay": 2240,
                "average_delay_days": 90,
                "average_cost_overrun_percentage": 12,
                "milestone_hit_rate": 60,
                "average_risk_score": 55,
                "delivery_efficiency_index": 63,
            }],
            "data_availability": {
                "portfolio_projects": 2,
                "sector_projects": 2,
                "projects_with_start_date": 2,
                "projects_with_velocity": 2,
                "projects_with_milestones": 2,
                "projects_with_risk": 2,
            },
        }


class FakeRiskService:
    async def list(self, risk_level: str | None, current_only: bool) -> dict[str, object]:
        return {"items": [risk()], "total": 1}

    async def get_for_project(self, project_id: str) -> dict[str, object]:
        return risk()

    def configuration(self) -> dict[str, object]:
        return {
            "strategyVersion": "hybrid-risk-v1",
            "configuredWeights": {"rule": 0.5, "statistical": 0.25, "ml": 0.25},
            "ruleFactorWeights": {"progress": 0.25, "cost": 0.25, "schedule": 0.25, "milestone": 0.15, "expenditure": 0.1},
            "domainWeights": {"cost": {"cost": 1.0}},
            "saturationThresholds": {"costOverrunPct": 50},
            "riskLevelThresholds": {"watch": 35, "high": 60, "critical": 80},
            "statisticalMinimumPeers": 5,
            "mlSignalWeights": {"cost": 0.5, "schedule": 0.5},
            "missingSignalPolicy": "renormalize",
            "rationale": {"rule": "continuity", "statistical": "context", "ml": "advisory"},
        }

    async def history_for_project(self, project_id: str) -> dict[str, object]:
        return {"project_id": project_id, "items": [risk()], "total": 1}

    async def trajectory_for_project(self, project_id: str) -> dict[str, object]:
        return {
            "project_id": project_id,
            "trend_direction": "stable",
            "points": [{
                "snapshot_id": RISK_ID,
                "reporting_month": date(2026, 9, 1),
                "assessed_at": NOW,
                "overall_risk": 72,
                "cost_risk": 65,
                "schedule_risk": 78,
                "implementation_risk": 70,
                "risk_level": "high_risk",
                "overall_change": None,
                "trend_direction": "stable",
                "meaningful_increase": False,
            }],
            "changes": [],
            "total_months": 1,
            "thresholds": {
                "stable_band_points": 2,
                "meaningful_increase_points": 5,
                "rapid_increase_points": 10,
            },
        }

    async def assess_project(self, project_id: str) -> dict[str, object]:
        return risk()

    async def assess_portfolio(self) -> dict[str, object]:
        return {"items": [risk()], "total": 1}


class FakeWarningService:
    async def list(self, status: str | None, severity: str | None) -> dict[str, object]:
        return {"items": [warning()], "total": 1}

    async def acknowledge(self, identifier: str, user_id: UUID) -> dict[str, object]:
        return warning()

    async def update(self, identifier: str, payload, user_id: UUID) -> dict[str, object]:
        value = warning()
        value["status"] = payload.status
        return value


class FakeInterventionService:
    async def list(self, status: str | None, priority: str | None) -> dict[str, object]:
        return {"items": [intervention()], "total": 1}

    async def create(self, payload: object, user_id: UUID) -> dict[str, object]:
        return intervention()

    async def update(self, identifier: str, payload: object, user_id: UUID) -> dict[str, object]:
        return {**intervention(), "status": "in_progress"}

    async def officers(self) -> dict[str, object]:
        return {"items": [{
            "id": USER_ID,
            "full_name": "Monitoring Team",
            "email": "monitoring@pragati-x.example.com",
            "designation": "Nodal Officer",
            "role": "monitoring_officer",
        }], "total": 1}

    async def history(self, identifier: str) -> dict[str, object]:
        return {"intervention_id": identifier, "items": [{
            "id": UUID("80000000-0000-0000-0000-000000000001"),
            "intervention_id": identifier,
            "update_type": "status_transition",
            "status": "in_progress",
            "note": "Work started.",
            "previous_values": {"status": "assigned"},
            "new_values": {"status": "in_progress"},
            "metadata": {"source": "api_patch"},
            "created_by": USER_ID,
            "created_by_name": "Monitoring Team",
            "occurred_at": NOW,
        }], "total": 1}


class FakePredictionService:
    async def latest_schedule_overrun(self, identifier: str) -> dict[str, object]:
        return await self.predict_schedule_overrun(identifier)

    async def predict_schedule_overrun(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "project_name": "National Connectivity Corridor",
            "as_of_date": date(2026, 9, 1),
            "original_completion_date": date(2026, 12, 31),
            "current_physical_progress": 61,
            "schedule_overrun_probability": 0.81,
            "predicted_class": "schedule_overrun",
            "schedule_overrun_threshold_days": 0,
            "predicted_completion_variance_days": 120,
            "expected_delay_days": 120,
            "predicted_completion_date": date(2027, 4, 30),
            "predicted_completion_date_lower": date(2027, 3, 1),
            "predicted_completion_date_upper": date(2027, 6, 30),
            "predicted_delay_days_lower": 60,
            "predicted_delay_days_upper": 181,
            "uncertainty_method": "empirical_90pct_absolute_delay_error_on_validation_partition",
            "uncertainty_is_formally_calibrated": False,
            "predicted_progress_series": [
                {"period": date(2026, 9, 1), "predicted_progress": 61},
                {"period": date(2027, 4, 30), "predicted_progress": 100},
            ],
            "progress_projection_method": "linear_path_from_actual_snapshot_to_model_predicted_completion",
            "progress_projection_is_direct_model_output": False,
            "model_name": "pragati_x_schedule_overrun",
            "model_version": "1.0.0",
            "training_data_version": "schedule-test-data-sha256",
            "regression_model": "ridge_regression",
            "classification_model": "logistic_regression",
            "feature_list": ["physical_progress", "planned_progress"],
            "features": {"physical_progress": 61, "planned_progress": 70},
            "evaluation_metrics": {
                "regression": {"test": {"mae_days": 35, "rmse_days": 44, "r2": 0.68}},
                "classification": {"test": {"precision": 0.8, "recall": 0.75, "f1": 0.77, "roc_auc": 0.84}},
            },
            "explanation": prediction_explanation(),
            "generated_at": NOW,
            "synthetic": False,
        }

    async def latest_cost_overrun(self, identifier: str) -> dict[str, object]:
        return await self.predict_cost_overrun(identifier)

    async def predict_cost_overrun(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "project_name": "National Connectivity Corridor",
            "as_of_date": date(2026, 9, 1),
            "original_approved_cost": 1000,
            "significant_overrun_probability": 0.73,
            "predicted_class": "significant_overrun",
            "significant_overrun_threshold_pct": 10,
            "predicted_final_cost": 1140,
            "predicted_escalation_amount": 140,
            "predicted_escalation_percentage": 14,
            "predicted_final_cost_lower": 1080,
            "predicted_final_cost_upper": 1200,
            "uncertainty_method": "empirical_90pct_absolute_ratio_error_on_validation_partition",
            "uncertainty_is_formally_calibrated": False,
            "model_name": "pragati_x_cost_overrun",
            "model_version": "1.0.0",
            "training_data_version": "test-data-sha256",
            "regression_model": "ridge_regression",
            "classification_model": "logistic_regression",
            "feature_list": ["approved_cost", "physical_progress"],
            "features": {"approved_cost": 1000, "physical_progress": 61},
            "evaluation_metrics": {
                "regression": {"test": {"mae": 35, "rmse": 42, "r2": 0.71}},
                "classification": {"test": {"precision": 0.8, "recall": 0.75, "f1": 0.77, "roc_auc": 0.84}},
            },
            "explanation": prediction_explanation(),
            "generated_at": NOW,
            "synthetic": False,
        }

    async def for_project(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "items": [{
                "id": UUID("60000000-0000-0000-0000-000000000001"),
                "project_id": identifier,
                "project_name": "National Connectivity Corridor",
                "model_name": "schedule-risk",
                "model_version": "1.0.0",
                "prediction_type": "completion_date",
                "horizon_months": 6,
                "target_date": date(2027, 3, 31),
                "predicted_value": 90,
                "predicted_class": "delayed",
                "confidence": 82,
                "lower_bound": 60,
                "upper_bound": 120,
                "output_payload": {},
                "generated_at": NOW,
                "valid_until": None,
            }],
        }


class FakeScenarioService:
    async def configuration(self, identifier: str) -> dict[str, object]:
        return {
            "project_id": identifier,
            "project_name": "National Connectivity Corridor",
            "as_of_date": date(2026, 9, 1),
            "supported_variables": [{
                "code": "land_acquisition_progress",
                "label": "Land acquisition progress",
                "description": "Temporary land progress assumption.",
                "input_type": "number",
                "current_value": 62,
                "minimum": 0,
                "maximum": 100,
                "options": [],
                "models": ["cost", "schedule"],
                "affected_features": ["land_acquisition_progress"],
            }],
            "unsupported_variables": [{
                "code": "resource_availability",
                "label": "Resource availability",
                "reason": "Not used by either active model.",
            }],
            "model_versions": {"cost": "1.0.0", "schedule": "1.0.0"},
            "persists_changes": False,
            "disclaimer": "Scenario/model estimate - not a guaranteed project outcome.",
        }

    async def simulate(self, identifier: str, request) -> dict[str, object]:
        outcome_before = {
            "risk": {"overall_score": 72, "risk_level": "high_risk", "cost_risk": 65, "schedule_risk": 78, "implementation_risk": 70},
            "cost": {"significant_overrun_probability": 0.73, "predicted_final_cost": 1140, "predicted_escalation_amount": 140, "predicted_escalation_percentage": 14, "model_version": "1.0.0"},
            "schedule": {"schedule_overrun_probability": 0.81, "expected_delay_days": 120, "predicted_completion_date": date(2027, 4, 30), "model_version": "1.0.0"},
        }
        outcome_scenario = {
            "risk": {"overall_score": 64, "risk_level": "high_risk", "cost_risk": 58, "schedule_risk": 69, "implementation_risk": 60},
            "cost": {"significant_overrun_probability": 0.64, "predicted_final_cost": 1100, "predicted_escalation_amount": 100, "predicted_escalation_percentage": 10, "model_version": "1.0.0"},
            "schedule": {"schedule_overrun_probability": 0.69, "expected_delay_days": 90, "predicted_completion_date": date(2027, 3, 31), "model_version": "1.0.0"},
        }
        return {
            "project_id": identifier,
            "project_name": "National Connectivity Corridor",
            "as_of_date": date(2026, 9, 1),
            "generated_at": NOW,
            "before": outcome_before,
            "scenario": outcome_scenario,
            "changed_variables": [{
                "code": "land_acquisition_progress",
                "label": "Land acquisition progress",
                "before_value": 62,
                "scenario_value": request.changes.land_acquisition_progress,
                "affected_models": ["cost", "schedule"],
                "affected_features": ["land_acquisition_progress"],
            }],
            "explanation": {
                "summaries": ["Recomputed hybrid risk changed by -8.0 points."],
                "driver_changes": [{
                    "model": "schedule",
                    "feature": "land_acquisition_progress",
                    "feature_label": "Land acquisition progress",
                    "before_contribution": 12,
                    "scenario_contribution": 5,
                    "contribution_change": -7,
                    "contribution_unit": "delay_days",
                    "explanation": "The scenario reduced the feature contribution.",
                }],
                "numerical_source": "Baseline and scenario model inference with SHAP.",
            },
            "assumption_note": request.assumption_note,
            "persists_changes": False,
            "disclaimer": "Scenario/model estimate - not a guaranteed project outcome.",
        }


class FakeEvidenceService:
    async def for_project(self, identifier: str, profile) -> dict[str, object]:
        stages = ["source_data", "derived_signal", "prediction", "explanation", "warning", "intervention"]
        return {
            "project_id": identifier,
            "project_name": "National Connectivity Corridor",
            "generated_at": NOW,
            "chains": [{
                "chain_id": f"risk:{RISK_ID}",
                "subject_type": "risk",
                "subject_id": str(RISK_ID),
                "title": "Current High Risk project risk",
                "severity": "high_risk",
                "status": "current",
                "as_of_date": NOW,
                "nodes": [{
                    "stage": stage,
                    "title": stage.replace("_", " ").title(),
                    "provenance_type": "stored_data" if stage == "source_data" else "calculated_analytics" if stage in {"derived_signal", "prediction", "explanation"} else "workflow_record",
                    "timestamp": NOW,
                    "source_table": "project_monthly_updates",
                    "source_record_id": str(DATABASE_ID),
                    "values": [],
                } for stage in stages],
            }],
            "omissions": [],
            "methodology": "Persisted and deterministic evidence only.",
        }


class FakeAssistantService:
    async def ask(self, request) -> dict[str, object]:
        return {
            "answer": "Stored risk score is 72/100. [S1]",
            "intent": "risk_explanation",
            "route": "structured",
            "grounded": True,
            "insufficient_evidence": False,
            "model_used": None,
            "synthesis_status": "deterministic_fallback",
            "evidence": [{
                "id": "S1",
                "source_type": "risk_assessment",
                "title": "Current stored risk assessment",
                "project_id": "PX-001",
                "observed_at": NOW,
                "facts": {"overall_score": 72},
            }],
            "limitations": [],
            "generated_at": NOW,
            "disclaimer": "Answers are grounded in retrieved PRAGATI-X records and documents; missing values are not inferred.",
        }


class FakeAssistantDocumentService:
    async def list(self, project_identifier: str) -> list[dict[str, object]]:
        return []


class FakeCUFService:
    async def upload(self, file_name: str, content: bytes, user_id: UUID) -> dict[str, object]:
        assert file_name.endswith(".csv")
        assert content
        return await self.preview(BATCH_ID)

    async def preview(self, batch_id: UUID, limit: int | None = None, offset: int = 0) -> dict[str, object]:
        return {
            "batch_id": batch_id,
            "file_name": "sample_cuf.csv",
            "file_type": "csv",
            "file_size_bytes": 128,
            "status": "validated",
            "detected_columns": ["Project ID", "Reporting Month"],
            "field_mapping": {"Project ID": "project_code", "Reporting Month": "reporting_month"},
            "total_rows": 1,
            "valid_rows": 1,
            "invalid_rows": 0,
            "missing_values": 0,
            "duplicate_rows": 0,
            "anomaly_rows": 0,
            "quality_score": 100,
            "validation_summary": {"quality_formula": "deterministic"},
            "uploaded_at": NOW,
            "preview_rows": [{
                "row_number": 2,
                "project_code": "PX-001",
                "reporting_month": date(2026, 9, 1),
                "validation_status": "valid",
                "raw_data": {"Project ID": "PX-001"},
                "normalized_data": {"project_code": "PX-001", "reporting_month": "2026-09-01"},
                "transformations": [],
                "validation_errors": [],
                "validation_warnings": [],
                "missing_value_count": 0,
                "is_duplicate": False,
                "anomaly_count": 0,
            }],
            "preview_offset": offset,
            "preview_limit": limit or 100,
            "preview_truncated": False,
        }
    async def confirm(self, batch_id: UUID, user_id: UUID) -> dict[str, object]:
        return {
            "batch_id": batch_id,
            "status": "imported",
            "imported_rows": 1,
            "skipped_rows": 0,
            "invalid_rows": 0,
            "downstream_analysis_status": "pending",
            "message": "Validated rows were imported.",
        }


async def fake_cuf_analysis_runner(_: UUID) -> None:
    return None


async def administrator() -> CurrentProfile:
    return CurrentProfile(
        id=USER_ID,
        email="admin@pragati-x.example.com",
        full_name="Test Administrator",
        role="administrator",
        is_active=True,
    )


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    app.dependency_overrides.update({
        get_current_profile: administrator,
        get_health_service: FakeHealthService,
        get_project_service: FakeProjectService,
        get_public_project_service: FakeProjectService,
        get_portfolio_service: FakePortfolioService,
        get_analytics_service: FakeAnalyticsService,
        get_assistant_service: FakeAssistantService,
        get_assistant_document_service: FakeAssistantDocumentService,
        get_risk_service: FakeRiskService,
        get_warning_service: FakeWarningService,
        get_intervention_service: FakeInterventionService,
        get_prediction_service: FakePredictionService,
        get_scenario_service: FakeScenarioService,
        get_evidence_service: FakeEvidenceService,
        get_cuf_service: FakeCUFService,
        get_cuf_analysis_runner: lambda: fake_cuf_analysis_runner,
    })
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize(
    ("method", "path", "payload", "expected_status"),
    [
        ("GET", "/api/health", None, 200),
        ("GET", "/api/projects", None, 200),
        ("GET", "/api/projects/PX-001", None, 200),
        ("GET", "/api/projects/PX-001/history", None, 200),
        ("GET", "/api/projects/PX-001/data-confidence", None, 200),
        ("GET", "/api/portfolio/summary", None, 200),
        ("GET", "/api/portfolio/changes", None, 200),
        ("GET", "/api/analytics/cost", None, 200),
        ("GET", "/api/analytics/schedule", None, 200),
        ("GET", "/api/analytics/benchmark", None, 200),
        ("GET", "/api/risks", None, 200),
        ("GET", "/api/risks/configuration", None, 200),
        ("GET", "/api/risks/PX-001/history", None, 200),
        ("GET", "/api/risks/PX-001/trajectory", None, 200),
        ("POST", "/api/risks/PX-001/assess", None, 200),
        ("POST", "/api/risks/assess-portfolio", None, 200),
        ("GET", "/api/risks/PX-001", None, 200),
        ("GET", "/api/warnings", None, 200),
        ("POST", "/api/warnings/WARN-001/acknowledge", None, 200),
        ("PATCH", "/api/warnings/WARN-001", {"status": "under_review"}, 200),
        ("GET", "/api/interventions", None, 200),
        ("GET", "/api/interventions/officers", None, 200),
        ("GET", "/api/interventions/INT-001/history", None, 200),
        ("POST", "/api/interventions", {
            "projectId": "PX-001",
            "warningId": "WARN-001",
            "issue": "Schedule variance",
            "recommendedAction": "Convene a recovery review",
            "priority": "high",
        }, 201),
        ("PATCH", "/api/interventions/INT-001", {"status": "in_progress"}, 200),
        ("GET", "/api/predictions/cost-overrun/PX-001", None, 200),
        ("POST", "/api/predictions/cost-overrun/PX-001", None, 200),
        ("GET", "/api/predictions/schedule-overrun/PX-001", None, 200),
        ("POST", "/api/predictions/schedule-overrun/PX-001", None, 200),
        ("GET", "/api/predictions/what-if/PX-001", None, 200),
        ("POST", "/api/predictions/what-if/PX-001", {"changes": {"landAcquisitionProgress": 80}}, 200),
        ("GET", "/api/predictions/PX-001", None, 200),
        ("GET", "/api/evidence/projects/PX-001", None, 200),
        ("POST", "/api/assistant/ask", {"question": "Why is this project high risk?", "projectId": "PX-001"}, 200),
        ("GET", "/api/assistant/documents/PX-001", None, 200),
    ],
)
def test_requested_endpoint_contracts(
    client: TestClient,
    method: str,
    path: str,
    payload: dict[str, object] | None,
    expected_status: int,
) -> None:
    response = client.request(method, path, json=payload)
    assert response.status_code == expected_status, response.text


def test_schedule_analytics_returns_transparent_typed_metrics(client: TestClient) -> None:
    response = client.get(
        "/api/analytics/schedule",
        params={"sector": "Transport", "delay_filter": "delayed", "search": "PX-001"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["summary"]["averageSlippageDays"] == 90
    assert payload["summary"]["averageProgressVariance"] == -9
    assert payload["summary"]["overdueMilestones"] == 1
    assert payload["series"][0]["monthlyProgressVelocity"] == 2.5
    assert payload["projectBreakdown"][0]["originalCompletionDate"] == "2026-12-31"
    assert payload["projectBreakdown"][0]["currentCompletionDate"] == "2027-03-31"
    assert payload["projectBreakdown"][0]["delayRank"] == 1


def test_schedule_analytics_rejects_unknown_delay_filter(client: TestClient) -> None:
    response = client.get("/api/analytics/schedule", params={"delay_filter": "predicted"})
    assert response.status_code == 422


def test_benchmark_analytics_returns_peer_evidence_and_medians(client: TestClient) -> None:
    response = client.get(
        "/api/analytics/benchmark",
        params={"project_id": "PX-001", "comparison_project_id": "PX-002", "max_peers": 8},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["selectedProject"]["projectId"] == "PX-001"
    assert payload["comparisonPeer"]["projectId"] == "PX-002"
    assert payload["comparisonPeer"]["matchScore"] == 85
    assert payload["comparisonPeer"]["matchReasons"]
    assert payload["metricComparisons"][0]["peerMedian"] == 12
    assert payload["historicalPeers"][0]["isHistorical"] is True


def test_benchmark_analytics_validates_peer_limit(client: TestClient) -> None:
    response = client.get("/api/analytics/benchmark", params={"project_id": "PX-001", "max_peers": 0})
    assert response.status_code == 422
    assert response.headers["x-request-id"]


def test_response_uses_frontend_friendly_camel_case(client: TestClient) -> None:
    response = client.get("/api/projects/PX-001")
    body = response.json()
    assert body["databaseId"] == str(DATABASE_ID)
    assert body["approvedCost"] == 1000.0
    assert "database_id" not in body


def test_assistant_response_is_grounded_and_frontend_friendly(client: TestClient) -> None:
    response = client.post(
        "/api/assistant/ask",
        json={"question": "Why is this project high risk?", "projectId": "PX-001"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["grounded"] is True
    assert body["insufficientEvidence"] is False
    assert body["evidence"][0]["id"] == "S1"
    assert body["evidence"][0]["sourceType"] == "risk_assessment"
    assert "source_type" not in body["evidence"][0]


def test_cost_analytics_contract_exposes_backend_aggregations(client: TestClient) -> None:
    response = client.get(
        "/api/analytics/cost",
        params={"sector": "Transport", "escalated_only": "true", "mismatch_threshold": 20},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["originalApprovedCost"] == 1000
    assert body["summary"]["absoluteCostEscalation"] == 120
    assert body["dataAvailability"]["comparableCostProjects"] == 1
    assert body["sectorBreakdown"][0]["sector"] == "Transport"
    assert body["ministryBreakdown"][0]["ministry"] == "Ministry of Infrastructure"
    assert body["projectBreakdown"][0]["hasMonthlyHistory"] is True
    assert body["series"][0]["reportingProjects"] == 1


def test_cost_analytics_rejects_invalid_mismatch_threshold(client: TestClient) -> None:
    response = client.get("/api/analytics/cost?mismatch_threshold=101")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_structured_validation_error(client: TestClient) -> None:
    response = client.post("/api/interventions", json={"projectId": "PX-001", "priority": "urgent"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["requestId"] == response.headers["x-request-id"]


def test_structured_not_found_error(client: TestClient) -> None:
    response = client.get("/api/projects/missing")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_role_authorization_blocks_analyst_from_interventions(client: TestClient) -> None:
    async def analyst() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="analyst@pragati-x.example.com",
            full_name="Test Analyst",
            role="analyst",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = analyst
    response = client.get("/api/interventions")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "insufficient_permissions"


def test_executive_can_create_but_cannot_manage_interventions(client: TestClient) -> None:
    async def executive() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="executive@pragati-x.example.com",
            full_name="Test Executive",
            role="executive",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = executive
    created = client.post("/api/interventions", json={
        "projectId": "PX-001",
        "warningId": "WARN-001",
        "issue": "Schedule variance",
        "recommendedAction": "Convene a recovery review",
        "priority": "high",
        "dueDate": "2026-10-01",
    })
    assert created.status_code == 201
    denied = client.patch("/api/interventions/INT-001", json={"status": "in_progress"})
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "insufficient_permissions"


def test_cost_prediction_generation_and_read_roles(client: TestClient) -> None:
    async def executive() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="executive@pragati-x.example.com",
            full_name="Test Executive",
            role="executive",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = executive
    assert client.get("/api/predictions/cost-overrun/PX-001").status_code == 200
    assert client.get("/api/predictions/schedule-overrun/PX-001").status_code == 200
    denied = client.post("/api/predictions/cost-overrun/PX-001")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "insufficient_permissions"
    assert client.post("/api/predictions/schedule-overrun/PX-001").status_code == 403

    async def analyst() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="analyst@pragati-x.example.com",
            full_name="Test Analyst",
            role="analyst",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = analyst
    assert client.post("/api/predictions/cost-overrun/PX-001").status_code == 200
    assert client.post("/api/predictions/schedule-overrun/PX-001").status_code == 200


def test_what_if_simulator_uses_prediction_rbac_and_rejects_arbitrary_fields(client: TestClient) -> None:
    async def monitoring_officer() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="officer@pragati-x.example.com",
            full_name="Test Monitoring Officer",
            role="monitoring_officer",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = monitoring_officer
    assert client.get("/api/predictions/what-if/PX-001").status_code == 403
    assert client.post(
        "/api/predictions/what-if/PX-001",
        json={"changes": {"landAcquisitionProgress": 80}},
    ).status_code == 403

    client.app.dependency_overrides[get_current_profile] = administrator
    invalid = client.post(
        "/api/predictions/what-if/PX-001",
        json={"changes": {"resourceAvailability": 100}},
    )
    assert invalid.status_code == 422
    response = client.post(
        "/api/predictions/what-if/PX-001",
        json={"changes": {"landAcquisitionProgress": 80}},
    )
    assert response.status_code == 200
    assert response.json()["persistsChanges"] is False
    assert response.json()["disclaimer"] == "Scenario/model estimate - not a guaranteed project outcome."


def test_prediction_explanation_contract_separates_ml_rules_and_history(client: TestClient) -> None:
    response = client.get("/api/predictions/cost-overrun/PX-001")
    assert response.status_code == 200
    explanation = response.json()["explanation"]
    assert explanation["ml"]["method"] == "SHAP"
    assert explanation["ml"]["positiveDrivers"][0]["contribution"] == 16
    assert explanation["rules"]["triggers"][0]["ruleId"] == "RULE_PROGRESS_BEHIND_PLAN"
    assert explanation["historical"]["cohortSize"] == 40
    assert explanation["historical"]["comparisons"][0]["referenceValue"] == -3


def test_risk_snapshot_generation_is_restricted_to_analytical_roles(client: TestClient) -> None:
    async def executive() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="executive@pragati-x.example.com",
            full_name="Test Executive",
            role="executive",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = executive
    assert client.get("/api/risks/configuration").status_code == 200
    assert client.get("/api/risks/PX-001/history").status_code == 200
    assert client.get("/api/risks/PX-001/trajectory").status_code == 200
    denied = client.post("/api/risks/PX-001/assess")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "insufficient_permissions"
    assert client.post("/api/risks/assess-portfolio").status_code == 403


def test_bearer_token_is_required_without_auth_override() -> None:
    app = create_app()
    app.dependency_overrides[get_project_service] = FakeProjectService
    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.get("/api/projects")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "authentication_required"


def test_public_project_enquiry_requires_no_bearer_and_excludes_internal_fields() -> None:
    app = create_app()
    app.dependency_overrides[get_public_project_service] = FakeProjectService
    with TestClient(app) as unauthenticated_client:
        response = unauthenticated_client.get("/api/public/projects/PX-001")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == "PX-001"
    assert body["approvedCost"] == 1000.0
    assert body["milestones"][0]["plannedDate"] == "2026-06-30"
    for internal_field in ("risk", "delayDays", "expenditure", "plannedProgress", "financialProgress"):
        assert internal_field not in body


def test_openapi_documents_all_requested_paths(client: TestClient) -> None:
    response = client.get("/api/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    for path in (
        "/api/health",
        "/api/public/projects",
        "/api/public/projects/{project_id}",
        "/api/projects",
        "/api/projects/{project_id}",
        "/api/projects/{project_id}/history",
        "/api/projects/{project_id}/data-confidence",
        "/api/portfolio/summary",
        "/api/portfolio/changes",
        "/api/analytics/cost",
        "/api/analytics/schedule",
        "/api/analytics/benchmark",
        "/api/risks",
        "/api/risks/configuration",
        "/api/risks/assess-portfolio",
        "/api/risks/{project_id}/history",
        "/api/risks/{project_id}/trajectory",
        "/api/risks/{project_id}/assess",
        "/api/risks/{project_id}",
        "/api/warnings",
        "/api/warnings/{warning_id}/acknowledge",
        "/api/interventions",
        "/api/interventions/officers",
        "/api/interventions/{intervention_id}/history",
        "/api/interventions/{intervention_id}",
        "/api/predictions/cost-overrun/{project_id}",
        "/api/predictions/schedule-overrun/{project_id}",
        "/api/predictions/what-if/{project_id}",
        "/api/predictions/{project_id}",
        "/api/evidence/projects/{project_id}",
        "/api/assistant/ask",
        "/api/assistant/documents",
        "/api/assistant/documents/{project_id}",
        "/api/cuf/uploads",
        "/api/cuf/imports/{batch_id}/preview",
        "/api/cuf/imports/{batch_id}/confirm",
    ):
        assert path in paths


def test_cuf_upload_preview_and_confirm_contracts(client: TestClient) -> None:
    upload = client.post(
        "/api/cuf/uploads",
        files={"file": ("sample_cuf.csv", b"Project ID,Reporting Month\nPX-001,2026-09")},
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["batchId"] == str(BATCH_ID)
    assert upload.json()["qualityScore"] == 100

    preview = client.get(f"/api/cuf/imports/{BATCH_ID}/preview")
    assert preview.status_code == 200
    assert preview.json()["fieldMapping"]["Project ID"] == "project_code"

    confirmed = client.post(f"/api/cuf/imports/{BATCH_ID}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["importedRows"] == 1


def test_analyst_can_preview_but_cannot_confirm_cuf(client: TestClient) -> None:
    async def analyst() -> CurrentProfile:
        return CurrentProfile(
            id=USER_ID,
            email="analyst@pragati-x.example.com",
            full_name="Test Analyst",
            role="analyst",
            is_active=True,
        )

    client.app.dependency_overrides[get_current_profile] = analyst
    assert client.get(f"/api/cuf/imports/{BATCH_ID}/preview").status_code == 200
    response = client.post(f"/api/cuf/imports/{BATCH_ID}/confirm")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "insufficient_permissions"
