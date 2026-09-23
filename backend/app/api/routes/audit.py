from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_audit_service
from app.auth.dependencies import get_current_profile, require_roles
from app.auth.models import CurrentProfile
from app.schemas.audit import (
    AuditFilterOptions,
    AuditLogListResponse,
    SecurityAuditEventRequest,
    SecurityAuditEventResponse,
)
from app.services.audit import AuditService


router = APIRouter(prefix="/audit", tags=["Audit"])
administrator = require_roles("administrator")


@router.get("/logs", response_model=AuditLogListResponse, summary="Search the immutable audit trail")
async def audit_logs(
    service: Annotated[AuditService, Depends(get_audit_service)],
    _: Annotated[CurrentProfile, Depends(administrator)],
    action: str | None = Query(default=None, max_length=120),
    entity_type: str | None = Query(default=None, max_length=120),
    source: str | None = Query(default=None, max_length=120),
    actor_id: UUID | None = None,
    project_id: UUID | None = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    search: str | None = Query(default=None, min_length=2, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, object]:
    return await service.list(
        action=action,
        entity_type=entity_type,
        source=source,
        actor_id=actor_id,
        project_id=project_id,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/options", response_model=AuditFilterOptions, summary="List audit filter values")
async def audit_options(
    service: Annotated[AuditService, Depends(get_audit_service)],
    _: Annotated[CurrentProfile, Depends(administrator)],
) -> dict[str, object]:
    return await service.filter_options()


@router.post(
    "/security-events",
    response_model=SecurityAuditEventResponse,
    summary="Record an allow-listed authenticated security event",
)
async def security_event(
    payload: SecurityAuditEventRequest,
    service: Annotated[AuditService, Depends(get_audit_service)],
    profile: Annotated[CurrentProfile, Depends(get_current_profile)],
) -> dict[str, UUID]:
    return await service.record_security_event(payload.action, payload.metadata.model_dump(), profile)
