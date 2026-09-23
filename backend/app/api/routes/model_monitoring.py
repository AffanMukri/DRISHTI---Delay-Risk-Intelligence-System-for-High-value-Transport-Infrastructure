from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, status

from app.api.dependencies import get_model_monitoring_service
from app.auth.dependencies import require_roles
from app.auth.models import CurrentProfile
from app.schemas.model_monitoring import (
    ModelInventoryResponse,
    ModelMonitoringRunListResponse,
    ModelMonitoringRunRequest,
    ModelMonitoringRunResponse,
)
from app.services.model_monitoring import ModelMonitoringService


administrator = require_roles("administrator")
router = APIRouter(prefix="/model-monitoring", tags=["Model Monitoring"])


@router.get("", response_model=ModelInventoryResponse, summary="List deployed model inventory and monitoring status")
async def model_inventory(
    service: Annotated[ModelMonitoringService, Depends(get_model_monitoring_service)],
    _: Annotated[CurrentProfile, Depends(administrator)],
) -> dict[str, object]:
    return await service.inventory()


@router.post(
    "/{model_version_id}/runs",
    response_model=ModelMonitoringRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Calculate and persist an observation-only model monitoring report",
)
async def run_model_monitoring(
    request: ModelMonitoringRunRequest,
    model_version_id: Annotated[UUID, Path()],
    service: Annotated[ModelMonitoringService, Depends(get_model_monitoring_service)],
    profile: Annotated[CurrentProfile, Depends(administrator)],
) -> dict[str, object]:
    return await service.run(model_version_id, profile, request.window_days)


@router.get(
    "/runs/{run_id}",
    response_model=ModelMonitoringRunResponse,
    summary="Get a persisted model monitoring report",
)
async def model_monitoring_run(
    run_id: Annotated[UUID, Path()],
    service: Annotated[ModelMonitoringService, Depends(get_model_monitoring_service)],
    _: Annotated[CurrentProfile, Depends(administrator)],
) -> dict[str, object]:
    return await service.run_detail(run_id)


@router.get(
    "/{model_version_id}/runs",
    response_model=ModelMonitoringRunListResponse,
    summary="List monitoring history for one model version",
)
async def model_monitoring_history(
    model_version_id: Annotated[UUID, Path()],
    service: Annotated[ModelMonitoringService, Depends(get_model_monitoring_service)],
    _: Annotated[CurrentProfile, Depends(administrator)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, object]:
    return await service.history(model_version_id, limit)
