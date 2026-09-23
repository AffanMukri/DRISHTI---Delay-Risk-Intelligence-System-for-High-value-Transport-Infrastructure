from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_analytics_service
from app.auth.dependencies import get_current_profile
from app.schemas.analytics import (
    BenchmarkAnalyticsResponse,
    CostAnalyticsResponse,
    ScheduleAnalyticsResponse,
)
from app.services.analytics import AnalyticsService


router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    dependencies=[Depends(get_current_profile)],
)


@router.get("/cost", response_model=CostAnalyticsResponse, summary="Portfolio cost analytics")
async def cost_analytics(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    sector: Annotated[str | None, Query(max_length=200)] = None,
    escalated_only: bool = False,
    mismatch_threshold: Annotated[float, Query(ge=0, le=100)] = 15,
) -> dict[str, object]:
    return await service.cost(
        sector=sector,
        escalated_only=escalated_only,
        mismatch_threshold=mismatch_threshold,
    )


@router.get("/schedule", response_model=ScheduleAnalyticsResponse, summary="Portfolio schedule analytics")
async def schedule_analytics(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    sector: Annotated[str | None, Query(max_length=200)] = None,
    delay_filter: Literal["all", "delayed", "severe", "on_time"] = "all",
    search: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
) -> dict[str, object]:
    return await service.schedule(sector=sector, delay_filter=delay_filter, search=search)


@router.get("/benchmark", response_model=BenchmarkAnalyticsResponse, summary="Project peer benchmark analytics")
async def benchmark_analytics(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
    project_id: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    comparison_project_id: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    max_peers: Annotated[int, Query(ge=1, le=20)] = 8,
) -> dict[str, object]:
    return await service.benchmark(
        project_id=project_id,
        comparison_project_id=comparison_project_id,
        max_peers=max_peers,
    )
