from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import APIModel


InterventionPriority = Literal["critical", "high", "moderate", "medium", "low"]
InterventionStatus = Literal["open", "assigned", "in_progress", "escalated", "resolved", "overdue"]


class InterventionResponse(APIModel):
    id: str
    database_id: UUID
    project_id: str
    project_name: str
    ministry: str
    warning_id: str | None = None
    warning_title: str | None = None
    warning_severity: str | None = None
    issue: str
    recommended_action: str
    priority: InterventionPriority
    status: InterventionStatus
    assigned_to: UUID | None = None
    assigned_to_name: str | None = None
    due_date: date | None = None
    opened_at: date
    resolved_at: datetime | None = None
    resolution_summary: str | None = None
    escalated_at: datetime | None = None
    escalation_reason: str | None = None
    escalated_by: UUID | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class InterventionListResponse(APIModel):
    items: list[InterventionResponse]
    total: int


class InterventionCreate(APIModel):
    project_id: str = Field(min_length=1, max_length=100)
    warning_id: str | None = Field(default=None, max_length=100)
    issue: str = Field(min_length=3, max_length=5000)
    recommended_action: str = Field(min_length=3, max_length=5000)
    priority: InterventionPriority
    assigned_to: UUID | None = None
    assigned_to_name: str | None = Field(default=None, max_length=300)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=10000)

    @model_validator(mode="after")
    def validate_assignment(self) -> "InterventionCreate":
        if self.assigned_to is not None and self.due_date is None:
            raise ValueError("dueDate is required when assigning a registered officer")
        return self


class InterventionPatch(APIModel):
    status: InterventionStatus | None = None
    priority: InterventionPriority | None = None
    assigned_to: UUID | None = None
    assigned_to_name: str | None = Field(default=None, max_length=300)
    due_date: date | None = None
    resolution_summary: str | None = Field(default=None, max_length=10000)
    escalation_reason: str | None = Field(default=None, min_length=3, max_length=10000)
    recommended_action: str | None = Field(default=None, min_length=3, max_length=5000)
    remark: str | None = Field(default=None, min_length=1, max_length=10000)
    notes: str | None = Field(default=None, max_length=10000)

    @model_validator(mode="after")
    def validate_patch(self) -> "InterventionPatch":
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        if self.status == "resolved" and not self.resolution_summary:
            raise ValueError("resolutionSummary is required when status is resolved")
        if self.status == "escalated" and not self.escalation_reason:
            raise ValueError("escalationReason is required when status is escalated")
        return self


class InterventionUpdateResponse(APIModel):
    id: UUID
    intervention_id: str
    update_type: str
    status: InterventionStatus | None = None
    note: str | None = None
    previous_values: dict[str, Any]
    new_values: dict[str, Any]
    metadata: dict[str, Any]
    created_by: UUID | None = None
    created_by_name: str | None = None
    occurred_at: datetime


class InterventionHistoryResponse(APIModel):
    intervention_id: str
    items: list[InterventionUpdateResponse]
    total: int


class InterventionOfficerResponse(APIModel):
    id: UUID
    full_name: str | None = None
    email: str
    designation: str | None = None
    role: str


class InterventionOfficerListResponse(APIModel):
    items: list[InterventionOfficerResponse]
    total: int
