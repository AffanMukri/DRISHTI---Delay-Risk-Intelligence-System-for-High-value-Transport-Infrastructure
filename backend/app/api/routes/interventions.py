from typing import Annotated

from fastapi import APIRouter, Depends, Path, status as http_status

from app.api.dependencies import get_intervention_service
from app.auth.dependencies import require_roles
from app.auth.models import CurrentProfile
from app.schemas.intervention import (
    InterventionCreate,
    InterventionHistoryResponse,
    InterventionListResponse,
    InterventionOfficerListResponse,
    InterventionPatch,
    InterventionPriority,
    InterventionResponse,
    InterventionStatus,
)
from app.services.interventions import InterventionService


intervention_reader = require_roles("administrator", "executive", "monitoring_officer")
intervention_manager = require_roles("administrator", "monitoring_officer")

router = APIRouter(
    prefix="/interventions",
    tags=["Interventions"],
    dependencies=[Depends(intervention_reader)],
)


@router.get("", response_model=InterventionListResponse, summary="List interventions")
async def list_interventions(
    service: Annotated[InterventionService, Depends(get_intervention_service)],
    status: InterventionStatus | None = None,
    priority: InterventionPriority | None = None,
) -> dict[str, object]:
    return await service.list(status, priority)


@router.get("/officers", response_model=InterventionOfficerListResponse, summary="List assignable officers")
async def list_intervention_officers(
    service: Annotated[InterventionService, Depends(get_intervention_service)],
) -> dict[str, object]:
    return await service.officers()


@router.get(
    "/{intervention_id}/history",
    response_model=InterventionHistoryResponse,
    summary="Get persisted intervention update history",
)
async def intervention_history(
    intervention_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[InterventionService, Depends(get_intervention_service)],
) -> dict[str, object]:
    return await service.history(intervention_id)


@router.post(
    "",
    response_model=InterventionResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Create an intervention",
)
async def create_intervention(
    payload: InterventionCreate,
    service: Annotated[InterventionService, Depends(get_intervention_service)],
    profile: Annotated[CurrentProfile, Depends(intervention_reader)],
) -> dict[str, object]:
    return await service.create(payload, profile.id)


@router.patch("/{intervention_id}", response_model=InterventionResponse, summary="Update an intervention")
async def update_intervention(
    intervention_id: Annotated[str, Path(min_length=1, max_length=100)],
    payload: InterventionPatch,
    service: Annotated[InterventionService, Depends(get_intervention_service)],
    profile: Annotated[CurrentProfile, Depends(intervention_manager)],
) -> dict[str, object]:
    return await service.update(intervention_id, payload, profile.id)
