from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Path, UploadFile, status

from app.api.dependencies import get_assistant_document_service, get_assistant_service
from app.auth.dependencies import get_current_profile, require_roles
from app.auth.models import CurrentProfile
from app.schemas.assistant import (
    AssistantAnswerResponse,
    AssistantDocumentListItem,
    AssistantDocumentResponse,
    AssistantQuestionRequest,
    DocumentIngestionForm,
)
from app.services.assistant import AssistantDocumentService, AssistantService


router = APIRouter(
    prefix="/assistant",
    tags=["Ask DHRISTI"],
    dependencies=[Depends(get_current_profile)],
)


@router.post(
    "/ask",
    response_model=AssistantAnswerResponse,
    summary="Answer a grounded DHRISTI intelligence question",
)
async def ask_pragati_x(
    request: AssistantQuestionRequest,
    service: Annotated[AssistantService, Depends(get_assistant_service)],
) -> dict[str, object]:
    return await service.ask(request)


@router.post(
    "/documents",
    response_model=AssistantDocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Extract and index one project PDF for document RAG",
)
async def ingest_project_document(
    service: Annotated[AssistantDocumentService, Depends(get_assistant_document_service)],
    profile: Annotated[
        CurrentProfile,
        Depends(require_roles("administrator", "monitoring_officer", "analyst")),
    ],
    project_id: Annotated[str, Form(min_length=1, max_length=100)],
    title: Annotated[str, Form(min_length=1, max_length=300)],
    document_type: Annotated[str, Form(min_length=1, max_length=100)],
    file: Annotated[UploadFile, File(description="Text-based PDF; scanned files require OCR first")],
) -> dict[str, object]:
    form = DocumentIngestionForm(project_id=project_id, title=title, document_type=document_type)
    payload = await file.read(service.settings.assistant_max_document_bytes + 1)
    return await service.ingest(
        project_identifier=form.project_id,
        title=form.title,
        document_type=form.document_type,
        file_name=file.filename or "document.pdf",
        content_type=file.content_type,
        payload=payload,
        profile=profile,
    )


@router.get(
    "/documents/{project_id}",
    response_model=list[AssistantDocumentListItem],
    summary="List PDF documents indexed for a project",
)
async def list_project_documents(
    project_id: Annotated[str, Path(min_length=1, max_length=100)],
    service: Annotated[AssistantDocumentService, Depends(get_assistant_document_service)],
) -> list[dict[str, object]]:
    return await service.list(project_id)
