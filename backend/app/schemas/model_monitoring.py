from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


MonitoringStatus = Literal["sufficient", "partial", "insufficient_data", "failed"]


class ModelMonitoringRunRequest(APIModel):
    window_days: int | None = Field(default=None, ge=7, le=730)


class ModelInventoryItem(APIModel):
    id: UUID
    name: str
    version: str
    model_type: str
    algorithm: str | None = None
    description: str | None = None
    status: str
    active: bool
    training_date: datetime | None = None
    training_period: dict[str, Any] | None = None
    training_rows: int | None = Field(default=None, ge=0)
    feature_list: list[str]
    evaluation_metrics: dict[str, Any]
    deployed_at: datetime | None = None
    last_inference: datetime | None = None
    inference_count: int = Field(ge=0)
    latest_monitoring_run_id: UUID | None = None
    latest_monitoring_status: MonitoringStatus | None = None
    latest_monitored_at: datetime | None = None
    latest_monitoring_summary: dict[str, Any] | None = None
    monitoring_supported: bool
    monitoring_unavailable_reason: str | None = None


class ModelInventoryResponse(APIModel):
    items: list[ModelInventoryItem]
    total: int = Field(ge=0)
    active_models: int = Field(ge=0)
    models_with_inference: int = Field(ge=0)
    models_requiring_attention: int = Field(ge=0)
    automatic_retraining_enabled: Literal[False] = False


class ModelMonitoringRunResponse(APIModel):
    id: UUID
    model_version_id: UUID
    model_name: str
    model_version: str
    status: MonitoringStatus
    monitoring_window_start: datetime
    monitoring_window_end: datetime
    comparison_window_start: datetime
    comparison_window_end: datetime
    reference_sample_size: int = Field(ge=0)
    current_sample_size: int = Field(ge=0)
    comparison_sample_size: int = Field(ge=0)
    evaluated_outcome_count: int = Field(ge=0)
    feature_drift: dict[str, Any]
    prediction_shift: dict[str, Any]
    missing_feature_changes: dict[str, Any]
    performance_monitoring: dict[str, Any]
    summary: dict[str, Any]
    methodology: dict[str, Any]
    limitations: list[str]
    run_by: UUID | None = None
    started_at: datetime
    completed_at: datetime


class ModelMonitoringRunListResponse(APIModel):
    items: list[ModelMonitoringRunResponse]
    total: int = Field(ge=0)
