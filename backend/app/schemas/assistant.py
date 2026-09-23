from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import APIModel


AssistantIntent = Literal[
    "cost_schedule_filter",
    "risk_explanation",
    "interventions",
    "project_comparison",
    "attention_required",
    "document_search",
    "project_overview",
    "unsupported",
]
AssistantRoute = Literal["structured", "documents", "hybrid", "none"]
EvidenceSourceType = Literal[
    "project_database",
    "calculated_analytics",
    "risk_assessment",
    "warning",
    "intervention",
    "peer_benchmark",
    "project_document",
]


class AssistantQuestionRequest(APIModel):
    question: str = Field(min_length=3, max_length=1200)
    project_id: str | None = Field(default=None, min_length=1, max_length=100)
    include_documents: bool = True


class AssistantEvidence(APIModel):
    id: str
    source_type: EvidenceSourceType
    title: str
    project_id: str | None = None
    document_id: UUID | None = None
    page_number: int | None = None
    observed_at: datetime | None = None
    excerpt: str | None = None
    facts: dict[str, Any] = Field(default_factory=dict)
    relevance_score: float | None = Field(default=None, ge=0, le=1)


class AssistantAnswerResponse(APIModel):
    answer: str
    intent: AssistantIntent
    route: AssistantRoute
    grounded: bool
    insufficient_evidence: bool
    model_used: str | None = None
    synthesis_status: Literal["ollama", "deterministic_fallback", "not_attempted"]
    evidence: list[AssistantEvidence]
    limitations: list[str] = Field(default_factory=list)
    generated_at: datetime
    disclaimer: str = "Answers are grounded in retrieved DRISHTI records and documents; missing values are not inferred."


class AssistantDocumentResponse(APIModel):
    id: UUID
    project_id: str
    title: str
    document_type: str
    original_file_name: str
    page_count: int
    chunk_count: int
    embedding_model: str
    checksum_sha256: str
    created_at: datetime


class AssistantDocumentListItem(APIModel):
    id: UUID
    project_id: str
    title: str
    document_type: str
    original_file_name: str
    page_count: int
    chunk_count: int
    embedding_model: str | None = None
    created_at: datetime


class DocumentIngestionForm(BaseModel):
    project_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=300)
    document_type: str = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def strip_values(self) -> "DocumentIngestionForm":
        self.project_id = self.project_id.strip()
        self.title = self.title.strip()
        self.document_type = self.document_type.strip()
        if not self.project_id or not self.title or not self.document_type:
            raise ValueError("Document fields cannot be blank.")
        return self
