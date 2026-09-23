from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.dependencies import get_warning_service
from app.auth.dependencies import get_current_profile, require_roles
from app.auth.models import CurrentProfile
from app.schemas.warning import (
    WarningListResponse,
    WarningResponse,
    WarningSeverity,
    WarningStatus,
    WarningUpdateRequest,
)
from app.services.warnings import WarningService


router = APIRouter(
    prefix="/warnings",
    tags=["Warnings"],
    dependencies=[Depends(get_current_profile)],
)


@router.get("", response_model=WarningListResponse, summary="List early warnings")
async def list_warnings(
    service: Annotated[WarningService, Depends(get_warning_service)],
    status: WarningStatus | None = None,
    severity: WarningSeverity | None = None,
) -> dict[str, object]:
    return await service.list(status, severity)


@router.post("/{warning_id}/acknowledge", response_model=WarningResponse, summary="Acknowledge a warning")
async def acknowledge_warning(
    warning_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[WarningService, Depends(get_warning_service)],
    profile: Annotated[CurrentProfile, Depends(require_roles("administrator", "monitoring_officer"))],
) -> dict[str, object]:
    return await service.acknowledge(warning_id, profile.id)


@router.patch("/{warning_id}", response_model=WarningResponse, summary="Update warning workflow status")
async def update_warning(
    warning_id: Annotated[str, Path(min_length=1, max_length=100)],
    payload: WarningUpdateRequest,
    service: Annotated[WarningService, Depends(get_warning_service)],
    profile: Annotated[CurrentProfile, Depends(require_roles("administrator", "monitoring_officer"))],
) -> dict[str, object]:
    return await service.update(warning_id, payload, profile.id)
