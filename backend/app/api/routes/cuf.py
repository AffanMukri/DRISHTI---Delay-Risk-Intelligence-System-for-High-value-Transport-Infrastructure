from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Path, Query, UploadFile, status

from app.api.dependencies import get_cuf_analysis_runner, get_cuf_service
from app.auth.dependencies import require_roles
from app.auth.models import CurrentProfile
from app.config import get_settings
from app.schemas.cuf import CUFImportResponse, CUFPreviewResponse
from app.services.cuf import CUFService


cuf_user = require_roles("administrator", "monitoring_officer", "analyst")
cuf_importer = require_roles("administrator", "monitoring_officer")

router = APIRouter(prefix="/cuf", tags=["CUF Data Ingestion"])


@router.post(
    "/uploads",
    response_model=CUFPreviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and validate a CUF CSV/XLSX file",
)
async def upload_cuf(
    file: Annotated[UploadFile, File(description="CUF data in CSV or XLSX format")],
    service: Annotated[CUFService, Depends(get_cuf_service)],
    profile: Annotated[CurrentProfile, Depends(cuf_user)],
) -> dict[str, object]:
    content = await file.read(get_settings().cuf_max_file_size_bytes + 1)
    return await service.upload(file.filename or "upload", content, profile.id)


@router.get(
    "/imports/{batch_id}/preview",
    response_model=CUFPreviewResponse,
    summary="Get the persisted validation preview for a CUF batch",
)
async def preview_cuf(
    batch_id: Annotated[UUID, Path()],
    service: Annotated[CUFService, Depends(get_cuf_service)],
    _: Annotated[CurrentProfile, Depends(cuf_user)],
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, object]:
    return await service.preview(batch_id, limit, offset)


@router.post(
    "/imports/{batch_id}/confirm",
    response_model=CUFImportResponse,
    summary="Confirm and import valid CUF rows",
)
async def confirm_cuf(
    batch_id: Annotated[UUID, Path()],
    background_tasks: BackgroundTasks,
    service: Annotated[CUFService, Depends(get_cuf_service)],
    profile: Annotated[CurrentProfile, Depends(cuf_importer)],
    analysis_runner: Annotated[Callable[[UUID], Awaitable[None]], Depends(get_cuf_analysis_runner)],
) -> dict[str, object]:
    result = await service.confirm(batch_id, profile.id)
    if int(result.get("imported_rows", 0)) > 0:
        background_tasks.add_task(analysis_runner, batch_id)
    return result
