from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel
from app.schemas.project import RiskLevel


RiskImpact = Literal["low", "medium", "high"]
RiskTrendDirection = Literal["improving", "stable", "deteriorating", "rapidly_deteriorating"]


class RiskDriverResponse(APIModel):
    code: str
    name: str
    impact: RiskImpact
    value: float = Field(ge=0, le=100)
    weighted_contribution: float | None = None
    rank: int | None = Field(default=None, ge=1)
    description: str | None = None
    evidence: list[Any]
    metadata: dict[str, Any] = Field(default_factory=dict)


class RiskComponentResponse(APIModel):
    available: bool
    reason: str | None = None
    overall_score: float | None = Field(default=None, ge=0, le=100)
    cost_risk: float | None = Field(default=None, ge=0, le=100)
    schedule_risk: float | None = Field(default=None, ge=0, le=100)
    implementation_risk: float | None = Field(default=None, ge=0, le=100)
    factors: dict[str, float | None] = Field(default_factory=dict)
    raw_indicators: dict[str, float] = Field(default_factory=dict)
    signals: dict[str, float | None] = Field(default_factory=dict)
    effective_factor_weights: dict[str, float] = Field(default_factory=dict)
    effective_signal_weights: dict[str, float] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)


class RiskResponse(APIModel):
    id: UUID
    project_id: str
    project_name: str
    assessed_at: datetime
    assessment_period: date | None = None
    overall_score: float = Field(ge=0, le=100)
    risk_level: RiskLevel
    cost_overrun_risk: float | None = Field(default=None, ge=0, le=100)
    schedule_delay_risk: float | None = Field(default=None, ge=0, le=100)
    implementation_risk: float | None = Field(default=None, ge=0, le=100)
    progress_factor: float | None = Field(default=None, ge=0, le=100)
    cost_factor: float | None = Field(default=None, ge=0, le=100)
    schedule_factor: float | None = Field(default=None, ge=0, le=100)
    milestone_factor: float | None = Field(default=None, ge=0, le=100)
    expenditure_factor: float | None = Field(default=None, ge=0, le=100)
    methodology: str
    explanation: str | None = None
    components: dict[str, RiskComponentResponse] = Field(default_factory=dict)
    ensemble: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, Any] = Field(default_factory=dict)
    drivers: list[RiskDriverResponse]


class RiskListResponse(APIModel):
    items: list[RiskResponse]
    total: int = Field(ge=0)


class RiskHistoryResponse(APIModel):
    project_id: str
    items: list[RiskResponse]
    total: int = Field(ge=0)


class RiskTrajectoryPointResponse(APIModel):
    snapshot_id: UUID
    reporting_month: date
    assessed_at: datetime
    overall_risk: float = Field(ge=0, le=100)
    cost_risk: float | None = Field(default=None, ge=0, le=100)
    schedule_risk: float | None = Field(default=None, ge=0, le=100)
    implementation_risk: float | None = Field(default=None, ge=0, le=100)
    risk_level: RiskLevel
    overall_change: float | None = None
    trend_direction: RiskTrendDirection
    meaningful_increase: bool


class RiskDriverChangeResponse(APIModel):
    code: str
    name: str
    change_type: Literal["added", "removed", "increased", "decreased"]
    previous_value: float | None = None
    current_value: float | None = None
    value_delta: float
    weighted_contribution_delta: float
    description: str | None = None


class RiskTrajectoryChangeResponse(APIModel):
    from_month: date
    to_month: date
    overall_change: float
    cost_risk_change: float | None = None
    schedule_risk_change: float | None = None
    implementation_risk_change: float | None = None
    trend_direction: RiskTrendDirection
    meaningful_increase: bool
    driver_changes: list[RiskDriverChangeResponse]


class RiskTrajectoryThresholdsResponse(APIModel):
    stable_band_points: float = Field(ge=0, le=100)
    meaningful_increase_points: float = Field(ge=0, le=100)
    rapid_increase_points: float = Field(ge=0, le=100)


class RiskTrajectoryResponse(APIModel):
    project_id: str
    trend_direction: RiskTrendDirection
    points: list[RiskTrajectoryPointResponse]
    changes: list[RiskTrajectoryChangeResponse]
    total_months: int = Field(ge=0)
    thresholds: RiskTrajectoryThresholdsResponse


class RiskConfigurationResponse(APIModel):
    strategy_version: str
    configured_weights: dict[str, float]
    rule_factor_weights: dict[str, float]
    domain_weights: dict[str, dict[str, float]]
    saturation_thresholds: dict[str, float]
    risk_level_thresholds: dict[str, float]
    statistical_minimum_peers: int
    ml_signal_weights: dict[str, float]
    missing_signal_policy: str
    rationale: dict[str, str]
