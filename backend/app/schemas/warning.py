from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from app.schemas.common import APIModel


WarningSeverity = Literal["critical", "high", "moderate", "low"]
WarningStatus = Literal["new", "acknowledged", "assigned", "under_review", "resolved"]


class WarningResponse(APIModel):
    id: str
    database_id: UUID
    project_id: str
    project_name: str
    ministry: str
    sector: str | None = None
    state: str | None = None
    severity: WarningSeverity
    status: WarningStatus
    alert_type: str
    title: str
    description: str
    trigger_rule: str | None = None
    evidence: list[Any]
    detected_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    assigned_to_name: str | None = None
    source_type: str
    source_reference: str | None = None
    source_update_id: UUID | None = None
    current_value: Any = None
    previous_value: Any = None
    recommended_action: str | None = None
    first_detected_at: datetime
    last_detected_at: datetime
    occurrence_count: int
    metadata: dict[str, Any]


class WarningListResponse(APIModel):
    items: list[WarningResponse]
    total: int


class WarningUpdateRequest(APIModel):
    status: Literal["acknowledged", "assigned", "under_review", "resolved"]
    assigned_to_name: str | None = None
