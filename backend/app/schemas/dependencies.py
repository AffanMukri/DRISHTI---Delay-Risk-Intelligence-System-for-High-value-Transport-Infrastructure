from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import APIModel
from app.schemas.project import MilestoneStatus


DependencyType = Literal["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"]


class DependencyDefinition(APIModel):
    upstream_milestone: str = Field(min_length=1, max_length=100)
    downstream_milestone: str = Field(min_length=1, max_length=100)
    dependency_type: DependencyType = "finish_to_start"
    lag_days: int = Field(default=0, ge=-3650, le=3650)

    @model_validator(mode="after")
    def distinct_milestones(self) -> "DependencyDefinition":
        if self.upstream_milestone.casefold() == self.downstream_milestone.casefold():
            raise ValueError("Upstream and downstream milestones must be different.")
        return self


class DependencyCreateRequest(DependencyDefinition):
    source_reference: str | None = Field(default=None, max_length=300)


class DependencyImportRequest(APIModel):
    edges: list[DependencyDefinition] = Field(min_length=1, max_length=500)
    source_system: str = Field(default="API_IMPORT", min_length=1, max_length=64)
    source_reference: str = Field(min_length=1, max_length=300)
    replace_existing: bool = False


class DependencyNode(APIModel):
    id: UUID
    code: str
    name: str
    node_type: Literal["milestone", "package"]
    sequence_no: int = Field(ge=0)
    planned_date: date
    forecast_date: date | None = None
    actual_date: date | None = None
    status: MilestoneStatus
    delay_days: int | None = None
    incoming_dependencies: int = Field(ge=0)
    outgoing_dependencies: int = Field(ge=0)
    is_delayed_trigger: bool
    potentially_affected: bool
    dependency_depth: int | None = Field(default=None, ge=1)
    trigger_milestone_ids: list[UUID]


class DependencyEdge(APIModel):
    id: UUID
    upstream_milestone_id: UUID
    downstream_milestone_id: UUID
    dependency_type: DependencyType
    lag_days: int
    source_system: str
    source_reference: str | None = None
    metadata: dict[str, Any]
    created_by: UUID | None = None
    created_at: datetime
    potentially_affected: bool


class PropagationPath(APIModel):
    source_milestone_id: UUID
    source_code: str
    target_milestone_id: UUID
    target_code: str
    depth: int = Field(ge=1)
    milestone_ids: list[UUID]
    milestone_codes: list[str]
    milestone_names: list[str]


class DependencyAnalysisSummary(APIModel):
    planning_node_count: int = Field(ge=0)
    explicit_dependency_count: int = Field(ge=0)
    delayed_trigger_count: int = Field(ge=0)
    potentially_affected_count: int = Field(ge=0)
    maximum_dependency_depth: int = Field(ge=0)
    analysis_kind: Literal["explicit_dependency_risk_propagation"]
    causality_claimed: Literal[False]
    statement: str


class DependencyGraphResponse(APIModel):
    project_id: str
    project_name: str
    nodes: list[DependencyNode]
    edges: list[DependencyEdge]
    propagation_paths: list[PropagationPath]
    summary: DependencyAnalysisSummary
