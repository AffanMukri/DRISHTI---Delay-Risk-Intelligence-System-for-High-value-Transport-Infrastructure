from typing import Literal

from app.analytics.benchmarking import build_peer_benchmark
from app.analytics.calculations import round_metrics
from app.repositories.analytics import AnalyticsRepository


class AnalyticsService:
    def __init__(self, repository: AnalyticsRepository) -> None:
        self.repository = repository

    async def get(self, kind: Literal["cost", "schedule", "benchmark"]) -> dict[str, object]:
        return round_metrics(await self.repository.get(kind))

    async def cost(
        self,
        *,
        sector: str | None,
        escalated_only: bool,
        mismatch_threshold: float,
    ) -> dict[str, object]:
        return round_metrics(await self.repository.cost(
            sector=sector,
            escalated_only=escalated_only,
            mismatch_threshold=mismatch_threshold,
        ))

    async def schedule(
        self,
        *,
        sector: str | None,
        delay_filter: Literal["all", "delayed", "severe", "on_time"],
        search: str | None,
    ) -> dict[str, object]:
        return round_metrics(await self.repository.schedule(
            sector=sector,
            delay_filter=delay_filter,
            search=search,
        ))

    async def benchmark(
        self,
        *,
        project_id: str | None,
        comparison_project_id: str | None,
        max_peers: int,
    ) -> dict[str, object]:
        facts = await self.repository.benchmark_facts()
        return round_metrics(build_peer_benchmark(
            facts,
            project_id=project_id,
            comparison_project_id=comparison_project_id,
            max_peers=max_peers,
        ))
