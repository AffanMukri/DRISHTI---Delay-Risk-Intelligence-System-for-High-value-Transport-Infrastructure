from __future__ import annotations

import re
from dataclasses import dataclass

from app.schemas.assistant import AssistantIntent, AssistantRoute


INDIAN_STATES = (
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
    "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
    "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala",
    "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim",
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
)


@dataclass(frozen=True)
class RoutedQuestion:
    intent: AssistantIntent
    route: AssistantRoute
    cost_escalation_threshold_pct: float | None = None
    sector_hint: str | None = None
    state_hint: str | None = None


class IntentRouter:
    """Deterministic router: it never asks an LLM to choose a database query."""

    @staticmethod
    def _threshold(question: str) -> float | None:
        match = re.search(
            r"(?:>|over|above|greater\s+than|more\s+than|exceed(?:ing|s)?)\s*(\d+(?:\.\d+)?)\s*%",
            question,
            flags=re.IGNORECASE,
        )
        return float(match.group(1)) if match else None

    @staticmethod
    def _sector(question: str) -> str | None:
        lowered = question.lower()
        aliases = {
            "rail": "Railways",
            "road": "Roads & Highways",
            "highway": "Roads & Highways",
            "power": "Power",
            "energy": "Power",
            "port": "Ports",
            "airport": "Airports",
            "urban": "Urban Infrastructure",
            "telecom": "Telecommunications",
        }
        return next((sector for term, sector in aliases.items() if term in lowered), None)

    @staticmethod
    def _state(question: str) -> str | None:
        lowered = question.lower().replace("&", "and")
        return next((state for state in INDIAN_STATES if state.lower() in lowered), None)

    def route(self, question: str, *, project_id: str | None, include_documents: bool) -> RoutedQuestion:
        lowered = " ".join(question.lower().split())
        threshold = self._threshold(question)
        sector = self._sector(question)
        state = self._state(question)

        if any(term in lowered for term in ("compare", "peer", "similar project", "benchmark")):
            return RoutedQuestion("project_comparison", "structured")
        if "intervention" in lowered and any(term in lowered for term in ("unresolved", "open", "pending", "overdue", "summar")):
            return RoutedQuestion("interventions", "structured", state_hint=state)
        if any(term in lowered for term in ("need attention", "needs attention", "prioriti", "this month", "urgent projects")):
            return RoutedQuestion("attention_required", "structured", sector_hint=sector, state_hint=state)
        if any(term in lowered for term in ("why", "reason", "driver")) and "risk" in lowered:
            return RoutedQuestion("risk_explanation", "hybrid" if include_documents else "structured")
        if ("cost" in lowered or "escalation" in lowered or "overrun" in lowered) and (
            "delay" in lowered or "project" in lowered
        ):
            return RoutedQuestion(
                "cost_schedule_filter",
                "structured",
                cost_escalation_threshold_pct=threshold,
                sector_hint=sector,
                state_hint=state,
            )
        if any(term in lowered for term in (
            "document", "report", "dpr", "contract", "tender", "pdf", "memorandum",
            "minutes", "clearance", "according to", "uploaded",
        )):
            return RoutedQuestion("document_search", "documents", state_hint=state)
        if project_id:
            return RoutedQuestion("project_overview", "hybrid" if include_documents else "structured")
        return RoutedQuestion("unsupported", "none")
