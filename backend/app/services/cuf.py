from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID

from app.config import get_settings
from app.errors import AppError, ConflictError, NotFoundError
from app.ingestion.cuf import parse_cuf_file, validate_rows
from app.repositories.cuf import CUFRepository


class CUFService:
    def __init__(self, repository: CUFRepository) -> None:
        self.repository = repository
        self.settings = get_settings()

    async def upload(self, file_name: str, content: bytes, user_id: UUID) -> dict[str, object]:
        safe_name = Path(file_name).name.strip()
        extension = Path(safe_name).suffix.lower().lstrip(".")
        if extension not in {"csv", "xlsx"}:
            raise AppError("Only CSV and XLSX CUF files are supported.", code="unsupported_file_type", status_code=415)
        if not content:
            raise AppError("The uploaded file is empty.", code="empty_file")
        if len(content) > self.settings.cuf_max_file_size_bytes:
            maximum_mb = self.settings.cuf_max_file_size_bytes / (1024 * 1024)
            raise AppError(f"The CUF file exceeds the {maximum_mb:g} MB limit.", code="file_too_large", status_code=413)

        digest = hashlib.sha256(content).hexdigest()
        duplicate = await self.repository.find_active_by_hash(digest)
        if duplicate:
            raise ConflictError(f"This exact file was already uploaded as batch {duplicate['id']} ({duplicate['status']}).")

        table = parse_cuf_file(content, extension, self.settings.cuf_max_rows)
        project_lookup = await self.repository.project_lookup()
        existing_keys = await self.repository.existing_monthly_keys()
        validation = validate_rows(table, project_lookup, existing_keys)
        batch_id = await self.repository.create_batch(
            file_name=safe_name,
            file_type=extension,
            file_size_bytes=len(content),
            content_sha256=digest,
            columns=validation.columns,
            mapping=validation.mapping,
            summary=validation.summary,
            rows=validation.rows,
            user_id=user_id,
        )
        preview = await self.repository.get_preview(batch_id, self.settings.cuf_preview_rows)
        if preview is None:
            raise NotFoundError("CUF import batch", str(batch_id))
        return preview

    async def preview(self, batch_id: UUID, limit: int | None = None, offset: int = 0) -> dict[str, object]:
        preview = await self.repository.get_preview(batch_id, limit or self.settings.cuf_preview_rows, offset)
        if preview is None:
            raise NotFoundError("CUF import batch", str(batch_id))
        return preview

    async def confirm(self, batch_id: UUID, user_id: UUID) -> dict[str, object]:
        preview = await self.repository.get_preview(batch_id, 1)
        if preview is None:
            raise NotFoundError("CUF import batch", str(batch_id))
        if preview["status"] != "validated":
            raise ConflictError(f"Batch {batch_id} cannot be imported from status '{preview['status']}'.")
        if preview["valid_rows"] == 0:
            raise ConflictError("This batch has no valid rows to import.")
        result = await self.repository.confirm(batch_id, user_id)
        if result is None:
            raise NotFoundError("CUF import batch", str(batch_id))
        return result
