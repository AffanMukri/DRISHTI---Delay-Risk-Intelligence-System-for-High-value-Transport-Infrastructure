from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response, status

from app.api.dependencies import get_dependency_service
from app.auth.dependencies import get_current_profile, require_roles
from app.auth.models import CurrentProfile
from app.schemas.dependencies import (
    DependencyCreateRequest,
    DependencyGraphResponse,
    DependencyImportRequest,
)
from app.services.dependencies import DependencyService


router = APIRouter(prefix="/projects", tags=["Milestone Dependencies"])
dependency_editor = require_roles("administrator", "monitoring_officer", "analyst")


@router.get(
    "/{project_id}/dependencies",
    response_model=DependencyGraphResponse,
    summary="Get explicit milestone dependencies and risk-propagation analysis",
)
async def dependency_graph(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[DependencyService, Depends(get_dependency_service)],
    _: Annotated[CurrentProfile, Depends(get_current_profile)],
) -> dict[str, object]:
    return await service.graph(project_id)


@router.post(
    "/{project_id}/dependencies",
    response_model=DependencyGraphResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Define an explicit milestone dependency",
)
async def create_dependency(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    payload: DependencyCreateRequest,
    service: Annotated[DependencyService, Depends(get_dependency_service)],
    profile: Annotated[CurrentProfile, Depends(dependency_editor)],
) -> dict[str, object]:
    return await service.create(project_id, payload, profile)


@router.post(
    "/{project_id}/dependencies/import",
    response_model=DependencyGraphResponse,
    summary="Import an explicit dependency edge set",
)
async def import_dependencies(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    payload: DependencyImportRequest,
    service: Annotated[DependencyService, Depends(get_dependency_service)],
    profile: Annotated[CurrentProfile, Depends(dependency_editor)],
) -> dict[str, object]:
    return await service.import_edges(project_id, payload, profile)


@router.delete(
    "/{project_id}/dependencies/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove an explicit milestone dependency",
)
async def delete_dependency(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    dependency_id: UUID,
    service: Annotated[DependencyService, Depends(get_dependency_service)],
    _: Annotated[CurrentProfile, Depends(dependency_editor)],
) -> Response:
    await service.delete(project_id, dependency_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

