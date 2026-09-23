from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.dependencies import get_evidence_service
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.schemas.evidence import EvidenceChainResponse
from app.services.evidence import EvidenceService


router = APIRouter(prefix="/evidence", tags=["Evidence"], dependencies=[Depends(get_current_profile)])


@router.get(
    "/projects/{project_id}",
    response_model=EvidenceChainResponse,
    summary="Get auditable source-to-intervention evidence chains for a project",
)
async def get_project_evidence_chain(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[EvidenceService, Depends(get_evidence_service)],
    profile: Annotated[CurrentProfile, Depends(get_current_profile)],
) -> dict[str, object]:
    return await service.for_project(project_id, profile)
