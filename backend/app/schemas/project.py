from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


ProjectStatus = Literal["active", "completed", "on_hold", "under_review"]
MilestoneStatus = Literal["completed", "on_track", "at_risk", "delayed"]
RiskLevel = Literal["healthy", "watch", "high_risk", "critical"]


class ProjectRiskBrief(APIModel):
    overall_score: float = Field(ge=0, le=100)
    risk_level: RiskLevel


class ProjectResponse(APIModel):
    id: str
    database_id: UUID
    name: str
    ministry: str
    implementing_agency: str | None = None
    department: str | None = None
    sector: str
    project_type: str | None = None
    state: str
    states: list[str]
    description: str | None = None
    status: ProjectStatus
    currency: str
    approved_cost: float = Field(ge=0)
    revised_cost: float = Field(ge=0)
    expenditure: float = Field(ge=0)
    physical_progress: float = Field(ge=0, le=100)
    planned_progress: float = Field(ge=0, le=100)
    financial_progress: float = Field(ge=0, le=100)
    original_completion_date: date | None = None
    revised_completion_date: date | None = None
    delay_days: int
    last_reported_at: datetime | None = None
    cost_breakdown: dict[str, Any]
    latitude: float | None = None
    longitude: float | None = None
    risk: ProjectRiskBrief | None = None


class ProjectListResponse(APIModel):
    items: list[ProjectResponse]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class MilestoneResponse(APIModel):
    id: UUID
    code: str
    name: str
    node_type: Literal["milestone", "package"] = "milestone"
    sequence_no: int = Field(ge=0)
    planned_date: date
    forecast_date: date | None = None
    actual_date: date | None = None
    status: MilestoneStatus
    delay_days: int | None = None
    weight: float | None = Field(default=None, ge=0, le=100)


class ProjectDetailResponse(ProjectResponse):
    milestones: list[MilestoneResponse] = Field(default_factory=list)


class PublicMilestoneResponse(APIModel):
    name: str
    planned_date: date


class PublicProjectResponse(APIModel):
    """Deliberately limited project facts safe for unauthenticated visitors."""

    id: str
    name: str
    ministry: str
    implementing_agency: str | None = None
    sector: str
    project_type: str | None = None
    state: str
    description: str | None = None
    status: ProjectStatus
    currency: str
    approved_cost: float = Field(ge=0)
    revised_cost: float = Field(ge=0)
    physical_progress: float = Field(ge=0, le=100)
    original_completion_date: date | None = None
    revised_completion_date: date | None = None
    last_reported_at: datetime | None = None
    milestones: list[PublicMilestoneResponse] = Field(default_factory=list)


class PublicProjectListResponse(APIModel):
    items: list[PublicProjectResponse]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)


class MonthlyUpdateResponse(APIModel):
    reporting_month: date
    approved_cost: float | None = Field(default=None, ge=0)
    revised_cost: float | None = Field(default=None, ge=0)
    expenditure: float | None = Field(default=None, ge=0)
    physical_progress: float | None = Field(default=None, ge=0, le=100)
    planned_progress: float | None = Field(default=None, ge=0, le=100)
    financial_progress: float | None = Field(default=None, ge=0, le=100)
    original_completion_date: date | None = None
    revised_completion_date: date | None = None
    forecast_completion_date: date | None = None
    delay_days: int | None = None
    milestones_total: int | None = Field(default=None, ge=0)
    milestones_completed: int | None = Field(default=None, ge=0)
    milestones_delayed: int | None = Field(default=None, ge=0)
    milestones_at_risk: int | None = Field(default=None, ge=0)
    land_acquisition_progress: float | None = Field(default=None, ge=0, le=100)
    clearance_status: dict[str, Any]
    contract_status: str | None = None
    issues: list[str]
    remarks: str | None = None


class CostHistoryResponse(APIModel):
    effective_date: date
    approved_cost: float | None = Field(default=None, ge=0)
    revised_cost: float | None = Field(default=None, ge=0)
    expenditure: float | None = Field(default=None, ge=0)
    estimated_at_completion: float | None = Field(default=None, ge=0)
    change_amount: float | None = None
    change_reason: str | None = None


class ScheduleHistoryResponse(APIModel):
    effective_date: date
    original_completion_date: date | None = None
    revised_completion_date: date | None = None
    forecast_completion_date: date | None = None
    delay_days: int | None = None
    physical_progress: float | None = Field(default=None, ge=0, le=100)
    planned_progress: float | None = Field(default=None, ge=0, le=100)
    revision_reason: str | None = None


class ProjectHistoryResponse(APIModel):
    project_id: str
    monthly_updates: list[MonthlyUpdateResponse]
    cost_history: list[CostHistoryResponse]
    schedule_history: list[ScheduleHistoryResponse]


class DataConfidenceComponentResponse(APIModel):
    code: str
    label: str
    score: float = Field(ge=0, le=100)
    weight: float = Field(ge=0, le=1)
    weighted_score: float = Field(ge=0, le=100)
    reasons: list[str]
    missing_fields: list[str]
    stale_fields: list[str]
    evidence: dict[str, Any]


class DataConfidenceConfigurationResponse(APIModel):
    formula_version: str
    weights: dict[str, float]
    fresh_days: int = Field(ge=1)
    stale_days: int = Field(ge=2)
    history_target_months: int = Field(ge=1)
    anomaly_penalty: float = Field(ge=0)
    validation_issue_penalty: float = Field(ge=0)
    statement: str


class DataConfidenceResponse(APIModel):
    project_id: str
    project_name: str
    score_type: Literal["data_quality"]
    is_prediction_probability: Literal[False]
    overall_score: float = Field(ge=0, le=100)
    rating: Literal["high", "moderate", "low", "very_low"]
    as_of_date: date
    latest_reporting_month: date | None = None
    components: list[DataConfidenceComponentResponse]
    reasons_lowering_confidence: list[str]
    missing_fields: list[str]
    stale_fields: list[str]
    configuration: DataConfidenceConfigurationResponse
