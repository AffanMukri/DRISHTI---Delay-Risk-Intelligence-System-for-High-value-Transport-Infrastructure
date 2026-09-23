from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pymupdf

from app.assistant.documents import chunk_pages, extract_pdf_pages
from app.assistant.router import IntentRouter
from app.config import Settings
from app.auth.models import CurrentProfile
from app.schemas.assistant import AssistantQuestionRequest
from app.services.assistant import AssistantDocumentService, AssistantService


class FakeRepository:
    async def projects_for_matching(self) -> list[dict[str, object]]:
        return []

    async def cost_schedule_projects(self, **_: object) -> list[dict[str, object]]:
        return [{
            "project_id": "PX-RAIL-01",
            "project_name": "Verified Rail Corridor",
            "sector": "Railways",
            "state": "Maharashtra",
            "approved_cost": 1000.0,
            "revised_cost": 1200.0,
            "cost_escalation_pct": 20.0,
            "delay_days": 410,
            "last_reported_at": datetime(2026, 9, 1, tzinfo=UTC),
        }]


class NoopAnalyticsRepository:
    pass


class NoopOllama:
    async def synthesize(self, **_: object) -> None:
        return None


class EmbeddingOllama(NoopOllama):
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.125] * 64 for _ in texts]


class FakeDocumentRepository:
    def __init__(self) -> None:
        self.chunks: list[dict[str, object]] = []
        self.audited = False

    async def project(self, identifier: str) -> dict[str, object]:
        return {
            "project_database_id": UUID("20000000-0000-4000-8000-000000000001"),
            "project_id": identifier,
            "project_name": "Verified Project",
        }

    async def duplicate_document(self, project_id, checksum: str) -> None:
        return None

    async def insert_document(self, values: dict[str, object]) -> dict[str, object]:
        return {"id": values["id"], "created_at": datetime(2026, 9, 20, tzinfo=UTC)}

    async def insert_chunks(self, chunks: list[dict[str, object]]) -> None:
        self.chunks = chunks

    async def audit_document(self, **_: object) -> None:
        self.audited = True


def test_intent_router_uses_deterministic_structured_route() -> None:
    routed = IntentRouter().route(
        "Which railway projects have >15% cost escalation and major delay?",
        project_id=None,
        include_documents=True,
    )
    assert routed.intent == "cost_schedule_filter"
    assert routed.route == "structured"
    assert routed.cost_escalation_threshold_pct == 15
    assert routed.sector_hint == "Railways"


def test_pdf_extraction_and_chunking_preserve_page_references() -> None:
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "Land acquisition is 72 percent complete. Clearance hearing is pending.")
    payload = document.tobytes()
    document.close()

    pages = extract_pdf_pages(payload)
    chunks = chunk_pages(pages, chunk_characters=500, overlap_characters=50)
    assert pages[0][0] == 1
    assert "Land acquisition" in chunks[0].content
    assert chunks[0].page_number == 1


def test_structured_answer_uses_database_facts_and_citations() -> None:
    settings = Settings(app_env="test", ollama_enabled=False)
    service = AssistantService(
        FakeRepository(),  # type: ignore[arg-type]
        NoopAnalyticsRepository(),  # type: ignore[arg-type]
        settings,
        ollama=NoopOllama(),  # type: ignore[arg-type]
    )
    response = asyncio.run(service.ask(AssistantQuestionRequest(
        question="Which railway projects have >15% cost escalation and major delay?",
    )))
    assert response["grounded"] is True
    assert response["synthesis_status"] == "deterministic_fallback"
    assert "20.0% cost escalation" in response["answer"]
    assert "410 days" in response["answer"]
    assert "[S1]" in response["answer"]
    assert response["evidence"][0].facts["approved_cost"] == 1000.0


def test_unsupported_question_returns_insufficient_evidence_instead_of_invention() -> None:
    settings = Settings(app_env="test", ollama_enabled=False)
    service = AssistantService(
        FakeRepository(),  # type: ignore[arg-type]
        NoopAnalyticsRepository(),  # type: ignore[arg-type]
        settings,
        ollama=NoopOllama(),  # type: ignore[arg-type]
    )
    response = asyncio.run(service.ask(AssistantQuestionRequest(question="Tell me a joke")))
    assert response["grounded"] is False
    assert response["insufficient_evidence"] is True
    assert "do not have enough trusted" in response["answer"]


def test_document_ingestion_extracts_embeds_persists_and_audits(tmp_path) -> None:
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "Verified clearance evidence from the project report.")
    payload = document.tobytes()
    document.close()
    repository = FakeDocumentRepository()
    settings = Settings(
        app_env="test",
        ollama_enabled=True,
        ollama_embedding_dimensions=64,
        assistant_document_dir=tmp_path,
    )
    service = AssistantDocumentService(
        repository,  # type: ignore[arg-type]
        settings,
        ollama=EmbeddingOllama(),  # type: ignore[arg-type]
    )
    profile = CurrentProfile(
        id=UUID("10000000-0000-4000-8000-000000000001"),
        email="analyst@example.com",
        full_name="Analyst",
        role="analyst",
        is_active=True,
    )
    response = asyncio.run(service.ingest(
        project_identifier="PX-001",
        title="Clearance report",
        document_type="clearance",
        file_name="clearance.pdf",
        content_type="application/pdf",
        payload=payload,
        profile=profile,
    ))
    assert response["page_count"] == 1
    assert response["chunk_count"] == 1
    assert repository.chunks[0]["page_number"] == 1
    assert repository.audited is True
    assert list(tmp_path.rglob("*.pdf"))
