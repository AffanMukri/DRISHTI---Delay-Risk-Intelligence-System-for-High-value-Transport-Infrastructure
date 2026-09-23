from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.api.dependencies import get_report_service
from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.schemas.report import ReportGenerateRequest, ReportOptionsResponse
from app.services.reports import ReportService


router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/options", response_model=ReportOptionsResponse, summary="List permitted report types and scopes")
async def report_options(
    service: Annotated[ReportService, Depends(get_report_service)],
    profile: Annotated[CurrentProfile, Depends(get_current_profile)],
) -> dict[str, object]:
    return await service.options(profile)


@router.post("/generate", summary="Generate and download an authenticated report")
async def generate_report(
    payload: ReportGenerateRequest,
    service: Annotated[ReportService, Depends(get_report_service)],
    profile: Annotated[CurrentProfile, Depends(get_current_profile)],
) -> Response:
    generated = await service.generate(payload, profile)
    return Response(
        content=generated.content,
        media_type=generated.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{generated.file_name}"',
            "X-Report-ID": str(generated.report_id),
            "X-Report-Checksum-SHA256": generated.checksum_sha256,
            "X-Data-As-Of": generated.data_as_of.isoformat(),
        },
    )

