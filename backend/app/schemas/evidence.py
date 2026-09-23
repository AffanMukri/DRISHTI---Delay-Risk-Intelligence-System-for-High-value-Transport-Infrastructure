from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import APIModel


EvidenceStage = Literal[
    "source_data", "derived_signal", "prediction", "explanation", "warning", "intervention"
]
EvidenceSubject = Literal["risk", "prediction", "warning"]
EvidenceProvenance = Literal["stored_data", "calculated_analytics", "trained_model", "documented_rule", "workflow_record"]


class EvidenceValueResponse(APIModel):
    label: str
    value: Any = None
    unit: str | None = None
    field: str | None = None
    formula: str | None = None
    source_table: str | None = None
    source_record_id: str | None = None
    timestamp: date | datetime | None = None


class EvidenceNodeResponse(APIModel):
    stage: EvidenceStage
    title: str
    description: str | None = None
    provenance_type: EvidenceProvenance
    timestamp: date | datetime | None = None
    source_table: str | None = None
    source_record_id: str | None = None
    model_name: str | None = None
    model_version: str | None = None
    data_version: str | None = None
    rule_version: str | None = None
    values: list[EvidenceValueResponse] = Field(default_factory=list)


class EvidenceChainItemResponse(APIModel):
    chain_id: str
    subject_type: EvidenceSubject
    subject_id: str
    title: str
    severity: str | None = None
    status: str | None = None
    as_of_date: date | datetime | None = None
    nodes: list[EvidenceNodeResponse]


class EvidenceChainResponse(APIModel):
    project_id: str
    project_name: str
    generated_at: datetime
    chains: list[EvidenceChainItemResponse]
    omissions: list[str]
    methodology: str
