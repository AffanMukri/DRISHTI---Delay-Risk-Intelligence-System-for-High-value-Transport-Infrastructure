from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from app.analytics.benchmarking import build_peer_benchmark
from app.analytics.calculations import round_metrics
from app.assistant.documents import chunk_pages, extract_pdf_pages
from app.assistant.ollama import OllamaClient, OllamaUnavailable
from app.assistant.router import IntentRouter, RoutedQuestion
from app.auth.models import CurrentProfile
from app.config import Settings
from app.errors import AppError, ConflictError, NotFoundError
from app.repositories.analytics import AnalyticsRepository
from app.repositories.assistant import AssistantRepository
from app.schemas.assistant import AssistantEvidence, AssistantQuestionRequest


logger = logging.getLogger(__name__)


def _serializable_facts(row: dict[str, Any], *, exclude: set[str] | None = None) -> dict[str, Any]:
    excluded = exclude or set()
    return {key: value for key, value in row.items() if key not in excluded and value is not None}


class AssistantService:
    def __init__(
        self,
        repository: AssistantRepository,
        analytics_repository: AnalyticsRepository,
        settings: Settings,
        ollama: OllamaClient | None = None,
    ) -> None:
        self.repository = repository
        self.analytics_repository = analytics_repository
        self.settings = settings
        self.ollama = ollama or OllamaClient(settings)
        self.router = IntentRouter()

    async def _resolve_project(self, question: str, explicit_id: str | None) -> dict[str, Any] | None:
        if explicit_id:
            return await self.repository.project(explicit_id)
        candidates = await self.repository.projects_for_matching()
        normalized_question = re.sub(r"[^a-z0-9]+", " ", question.lower()).strip()
        for candidate in candidates:
            code = str(candidate["project_id"]).lower()
            name = re.sub(r"[^a-z0-9]+", " ", str(candidate["project_name"]).lower()).strip()
            if code in question.lower() or (len(name) >= 5 and name in normalized_question):
                return candidate
        return None

    @staticmethod
    def _evidence(source_type: str, title: str, facts: dict[str, Any], **kwargs: Any) -> AssistantEvidence:
        return AssistantEvidence(id="pending", source_type=source_type, title=title, facts=facts, **kwargs)

    async def _structured_evidence(
        self,
        routed: RoutedQuestion,
        project: dict[str, Any] | None,
    ) -> list[AssistantEvidence]:
        evidence: list[AssistantEvidence] = []
        if routed.intent == "cost_schedule_filter":
            threshold = routed.cost_escalation_threshold_pct
            if threshold is None:
                threshold = self.settings.ml_significant_overrun_threshold_pct
            rows = await self.repository.cost_schedule_projects(
                threshold_pct=threshold,
                major_delay_days=self.settings.assistant_major_delay_days,
                sector=routed.sector_hint,
                state=routed.state_hint,
            )
            for row in rows:
                evidence.append(self._evidence(
                    "calculated_analytics",
                    f"Cost and schedule analytics — {row['project_name']}",
                    _serializable_facts(row),
                    project_id=row["project_id"],
                    observed_at=row.get("last_reported_at"),
                ))
        elif routed.intent == "risk_explanation" and project:
            row = await self.repository.risk_explanation(project["project_database_id"])
            if row and row.get("risk_id"):
                evidence.append(self._evidence(
                    "risk_assessment",
                    f"Current stored risk assessment — {row['project_name']}",
                    _serializable_facts(row, exclude={"risk_id"}),
                    project_id=row["project_id"],
                    observed_at=row.get("assessed_at"),
                ))
        elif routed.intent == "interventions":
            rows = await self.repository.unresolved_interventions(state=routed.state_hint)
            for row in rows:
                evidence.append(self._evidence(
                    "intervention",
                    f"Unresolved intervention {row['intervention_id']}",
                    _serializable_facts(row),
                    project_id=row["project_id"],
                    observed_at=row.get("updated_at"),
                ))
        elif routed.intent == "attention_required":
            rows = await self.repository.attention_required(sector=routed.sector_hint, state=routed.state_hint)
            for row in rows:
                evidence.append(self._evidence(
                    "calculated_analytics",
                    f"Current attention indicators — {row['project_name']}",
                    _serializable_facts(row),
                    project_id=row["project_id"],
                    observed_at=row.get("risk_assessed_at") or row.get("last_reported_at"),
                ))
        elif routed.intent == "project_comparison" and project:
            facts = await self.analytics_repository.benchmark_facts()
            benchmark = round_metrics(build_peer_benchmark(
                facts,
                project_id=project["project_id"],
                comparison_project_id=None,
                max_peers=5,
            ))
            evidence.append(self._evidence(
                "peer_benchmark",
                f"Peer benchmark — {project['project_name']}",
                {
                    "selected_project": benchmark.get("selectedProject"),
                    "peer_selection": benchmark.get("peerGroup"),
                    "peers": benchmark.get("peers", []),
                    "metric_comparisons": benchmark.get("metricComparisons", []),
                },
                project_id=project["project_id"],
            ))
        elif routed.intent == "project_overview" and project:
            row = await self.repository.project_overview(project["project_database_id"])
            if row:
                evidence.append(self._evidence(
                    "project_database",
                    f"Current project snapshot — {row['project_name']}",
                    _serializable_facts(row),
                    project_id=row["project_id"],
                    observed_at=row.get("last_reported_at"),
                ))
        return evidence

    async def _document_evidence(
        self,
        question: str,
        project: dict[str, Any] | None,
    ) -> tuple[list[AssistantEvidence], str | None]:
        try:
            embedding = (await self.ollama.embed([question]))[0]
        except OllamaUnavailable as exc:
            return [], str(exc)
        rows = await self.repository.search_document_chunks(
            embedding=embedding,
            project_id=project["project_database_id"] if project else None,
            limit=min(8, self.settings.assistant_max_evidence_items),
            min_relevance=self.settings.assistant_document_min_relevance,
        )
        evidence = [self._evidence(
            "project_document",
            f"{row['title']} — page {row['page_number']}",
            {
                "document_type": row["document_type"],
                "file_name": row["original_file_name"],
                "project_name": row["project_name"],
            },
            project_id=row["project_id"],
            document_id=row["document_id"],
            page_number=row["page_number"],
            observed_at=row.get("created_at"),
            excerpt=row["content"],
            relevance_score=max(0, min(1, float(row["relevance_score"]))),
        ) for row in rows]
        return evidence, None

    @staticmethod
    def _fallback_answer(routed: RoutedQuestion, evidence: list[AssistantEvidence]) -> str:
        if not evidence:
            return (
                "I do not have enough trusted DHRISTI evidence to answer this question. "
                "Try identifying a project, narrowing the request, or uploading a relevant project PDF."
            )
        if routed.intent == "cost_schedule_filter":
            lines = ["Retrieved projects meeting the requested cost-escalation and major-delay criteria:"]
            for item in evidence[:10]:
                facts = item.facts
                lines.append(
                    f"- {facts.get('project_name')}: {float(facts['cost_escalation_pct']):.1f}% cost escalation "
                    f"and {facts.get('delay_days')} days of schedule delay [{item.id}]"
                )
            return "\n".join(lines)
        if routed.intent == "risk_explanation":
            facts = evidence[0].facts
            drivers = facts.get("drivers") or []
            driver_text = "; ".join(
                f"{driver.get('name')} ({driver.get('impact')})" for driver in drivers[:5]
            ) or "No stored risk drivers are available"
            return (
                f"{facts.get('project_name')} has a stored {str(facts.get('risk_level')).replace('_', ' ')} risk level "
                f"with an overall score of {facts.get('overall_score')}/100. The recorded drivers are: {driver_text}. "
                f"[{evidence[0].id}]"
            )
        if routed.intent == "interventions":
            lines = [f"Retrieved {len(evidence)} unresolved interventions in the requested scope:"]
            for item in evidence[:10]:
                facts = item.facts
                lines.append(
                    f"- {facts.get('intervention_id')} for {facts.get('project_name')}: "
                    f"{str(facts.get('status')).replace('_', ' ')}, priority {facts.get('priority')}, "
                    f"due {facts.get('due_date') or 'not reported'} [{item.id}]"
                )
            return "\n".join(lines)
        if routed.intent == "attention_required":
            lines = ["Projects with current high/critical risk, critical warnings, or overdue interventions:"]
            for item in evidence[:10]:
                facts = item.facts
                lines.append(
                    f"- {facts.get('project_name')}: risk {facts.get('risk_level') or 'not available'} "
                    f"({facts.get('overall_risk_score', 'not available')}/100), "
                    f"{facts.get('critical_warnings', 0)} critical warnings, "
                    f"{facts.get('overdue_interventions', 0)} overdue interventions [{item.id}]"
                )
            return "\n".join(lines)
        if routed.intent == "project_comparison":
            facts = evidence[0].facts
            peers = facts.get("peers") or []
            peer_names = ", ".join(peer.get("projectName", "Unnamed peer") for peer in peers[:5])
            return (
                f"The backend peer engine identified {len(peers)} comparable projects: "
                f"{peer_names or 'none with sufficient comparability'}. Selection reasons and metric medians are in the evidence. "
                f"[{evidence[0].id}]"
            )
        if routed.intent == "document_search":
            lines = ["Relevant uploaded-document passages:"]
            for item in evidence[:5]:
                excerpt = (item.excerpt or "").replace("\n", " ")[:360]
                lines.append(f"- {item.title}: {excerpt} [{item.id}]")
            return "\n".join(lines)
        if routed.intent == "project_overview":
            facts = evidence[0].facts
            return (
                f"{facts.get('project_name')} is a {facts.get('sector')} project in {facts.get('state')}. "
                f"Its stored approved cost is {facts.get('approved_cost')} crore, revised cost is "
                f"{facts.get('revised_cost')} crore, physical progress is {facts.get('physical_progress')}%, "
                f"and reported delay is {facts.get('delay_days')} days. [{evidence[0].id}]"
            )
        return f"Trusted evidence was retrieved for this project. Review the cited sources below. [{evidence[0].id}]"

    async def ask(self, request: AssistantQuestionRequest) -> dict[str, Any]:
        routed = self.router.route(
            request.question,
            project_id=request.project_id,
            include_documents=request.include_documents,
        )
        project = await self._resolve_project(request.question, request.project_id)
        limitations: list[str] = []
        project_required = routed.intent in {"risk_explanation", "project_comparison", "project_overview"}
        if request.project_id and not project:
            raise NotFoundError("Project", request.project_id)
        if project_required and not project:
            limitations.append("No unambiguous project could be resolved from the question.")

        structured = await self._structured_evidence(routed, project) if routed.route in {"structured", "hybrid"} else []
        documents: list[AssistantEvidence] = []
        if routed.route in {"documents", "hybrid"} and request.include_documents:
            documents, document_limitation = await self._document_evidence(request.question, project)
            if document_limitation:
                limitations.append(document_limitation)
        if len(structured) + len(documents) > self.settings.assistant_max_evidence_items:
            limitations.append(
                f"Evidence was limited to the top {self.settings.assistant_max_evidence_items} records."
            )
        combined = (structured + documents)[: self.settings.assistant_max_evidence_items]
        evidence = [item.model_copy(update={"id": f"S{index}"}) for index, item in enumerate(combined, 1)]

        answer = await self.ollama.synthesize(question=request.question, evidence=evidence)
        synthesis_status = "ollama" if answer else ("deterministic_fallback" if evidence else "not_attempted")
        if answer:
            known = {item.id for item in evidence}
            cited = set(re.findall(r"\[(S\d+)\]", answer))
            if not cited or not cited.issubset(known):
                logger.warning("Discarded Ollama answer with missing or unknown evidence citations")
                answer = None
                synthesis_status = "deterministic_fallback"
        if not answer:
            answer = self._fallback_answer(routed, evidence)

        if routed.intent == "unsupported":
            limitations.append(
                "The question does not map to a supported project, risk, intervention, comparison, attention, or document-evidence query."
            )
        return {
            "answer": answer,
            "intent": routed.intent,
            "route": routed.route,
            "grounded": bool(evidence),
            "insufficient_evidence": not evidence,
            "model_used": self.settings.ollama_chat_model if synthesis_status == "ollama" else None,
            "synthesis_status": synthesis_status,
            "evidence": evidence,
            "limitations": limitations,
            "generated_at": datetime.now(UTC),
        }


class AssistantDocumentService:
    def __init__(
        self,
        repository: AssistantRepository,
        settings: Settings,
        ollama: OllamaClient | None = None,
    ) -> None:
        self.repository = repository
        self.settings = settings
        self.ollama = ollama or OllamaClient(settings)

    async def ingest(
        self,
        *,
        project_identifier: str,
        title: str,
        document_type: str,
        file_name: str,
        content_type: str | None,
        payload: bytes,
        profile: CurrentProfile,
    ) -> dict[str, Any]:
        if content_type != "application/pdf" and not file_name.lower().endswith(".pdf"):
            raise AppError("Only PDF project documents are supported.", code="unsupported_document_type", status_code=415)
        if not payload.startswith(b"%PDF"):
            raise AppError("The uploaded file is not a valid PDF.", code="invalid_pdf", status_code=422)
        if len(payload) > self.settings.assistant_max_document_bytes:
            raise AppError("The PDF exceeds the configured upload limit.", code="document_too_large", status_code=413)
        project = await self.repository.project(project_identifier)
        if not project:
            raise NotFoundError("Project", project_identifier)
        checksum = hashlib.sha256(payload).hexdigest()
        duplicate = await self.repository.duplicate_document(project["project_database_id"], checksum)
        if duplicate:
            raise ConflictError(f"This PDF is already indexed for the project as '{duplicate['title']}'.")

        try:
            pages = await asyncio.to_thread(extract_pdf_pages, payload)
        except Exception as exc:
            raise AppError("PDF text extraction failed.", code="pdf_extraction_failed", status_code=422) from exc
        if not pages:
            raise AppError(
                "No extractable text was found. Scanned PDFs require OCR before ingestion.",
                code="pdf_has_no_text",
                status_code=422,
            )
        chunks = chunk_pages(
            pages,
            chunk_characters=self.settings.assistant_chunk_characters,
            overlap_characters=self.settings.assistant_chunk_overlap_characters,
        )
        if len(chunks) > self.settings.assistant_max_document_chunks:
            raise AppError(
                "The PDF produces more evidence chunks than the configured indexing limit.",
                code="document_chunk_limit_exceeded",
                status_code=413,
            )
        try:
            embeddings: list[list[float]] = []
            for start in range(0, len(chunks), self.settings.assistant_embedding_batch_size):
                batch = chunks[start:start + self.settings.assistant_embedding_batch_size]
                embeddings.extend(await self.ollama.embed([chunk.content for chunk in batch]))
        except OllamaUnavailable as exc:
            raise AppError(str(exc), code="embedding_service_unavailable", status_code=503) from exc

        document_id = uuid4()
        storage_name = f"{project['project_database_id']}/{document_id}.pdf"
        target = self.settings.assistant_document_dir / storage_name
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(target.write_bytes, payload)
        try:
            inserted = await self.repository.insert_document({
                "id": document_id,
                "project_id": project["project_database_id"],
                "document_type": document_type,
                "title": title,
                "storage_path": storage_name,
                "original_file_name": Path(file_name).name,
                "size_bytes": len(payload),
                "checksum_sha256": checksum,
                "uploaded_by": profile.id,
                "metadata": {
                    "page_count": len(pages),
                    "chunk_count": len(chunks),
                    "embedding_model": self.settings.ollama_embedding_model,
                    "embedding_dimensions": self.settings.ollama_embedding_dimensions,
                    "extraction_library": "PyMuPDF",
                },
            })
            chunk_rows = []
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                chunk_rows.append({
                    "id": uuid4(),
                    "document_id": document_id,
                    "project_id": project["project_database_id"],
                    "chunk_index": chunk.chunk_index,
                    "page_number": chunk.page_number,
                    "content": chunk.content,
                    "character_count": len(chunk.content),
                    "content_sha256": hashlib.sha256(chunk.content.encode("utf-8")).hexdigest(),
                    "embedding": "[" + ",".join(f"{value:.10g}" for value in embedding) + "]",
                    "embedding_model": self.settings.ollama_embedding_model,
                    "metadata": json.dumps({"page_number": chunk.page_number}),
                    "created_by": profile.id,
                })
            await self.repository.insert_chunks(chunk_rows)
            await self.repository.audit_document(
                actor_id=profile.id,
                project_id=project["project_database_id"],
                document_id=document_id,
                values={"title": title, "chunk_count": len(chunks), "checksum_sha256": checksum},
            )
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return {
            "id": document_id,
            "project_id": project["project_id"],
            "title": title,
            "document_type": document_type,
            "original_file_name": Path(file_name).name,
            "page_count": len(pages),
            "chunk_count": len(chunks),
            "embedding_model": self.settings.ollama_embedding_model,
            "checksum_sha256": checksum,
            "created_at": inserted["created_at"],
        }

    async def list(self, project_identifier: str) -> list[dict[str, Any]]:
        project = await self.repository.project(project_identifier)
        if not project:
            raise NotFoundError("Project", project_identifier)
        return await self.repository.list_documents(project["project_database_id"])
