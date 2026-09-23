from __future__ import annotations

import json
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.repositories.base import BaseRepository


class CUFRepository(BaseRepository):
    async def claim_downstream_analysis(self, batch_id: UUID) -> bool:
        result = await self.session.execute(text("""
            update public.cuf_import_batches
            set downstream_analysis_status = 'processing',
                downstream_analysis_error = null,
                updated_at = now()
            where id = :batch_id
              and status = 'imported'
              and imported_rows > 0
              and downstream_analysis_status in ('pending', 'failed')
            returning id
        """), {"batch_id": batch_id})
        return result.scalar_one_or_none() is not None

    async def imported_projects(self, batch_id: UUID) -> list[str]:
        result = await self.session.execute(text("""
            select distinct p.project_code
            from public.cuf_import_rows row
            join public.projects p on p.id = row.project_id
            where row.batch_id = :batch_id and row.validation_status = 'imported'
            order by p.project_code
        """), {"batch_id": batch_id})
        return [str(value) for value in result.scalars().all()]

    async def finish_downstream_analysis(self, batch_id: UUID, summary: dict[str, Any]) -> None:
        await self.session.execute(text("""
            update public.cuf_import_batches
            set downstream_analysis_status = 'completed',
                downstream_analysis_completed_at = now(),
                downstream_analysis_summary = cast(:summary as jsonb),
                downstream_analysis_error = null,
                updated_at = now()
            where id = :batch_id and downstream_analysis_status = 'processing'
        """), {"batch_id": batch_id, "summary": json.dumps(summary, default=str)})

    async def fail_downstream_analysis(self, batch_id: UUID, message: str) -> None:
        await self.session.execute(text("""
            update public.cuf_import_batches
            set downstream_analysis_status = 'failed',
                downstream_analysis_completed_at = now(),
                downstream_analysis_error = left(:message, 2000),
                updated_at = now()
            where id = :batch_id and downstream_analysis_status = 'processing'
        """), {"batch_id": batch_id, "message": message})

    async def project_lookup(self) -> dict[str, tuple[str, str]]:
        result = await self.session.execute(text("select id::text, project_code from public.projects"))
        return {row["project_code"].casefold(): (row["id"], row["project_code"]) for row in result.mappings()}

    async def existing_monthly_keys(self) -> set[tuple[str, date]]:
        result = await self.session.execute(text("""
            select project_id::text, reporting_month
            from public.project_monthly_updates
        """))
        return {(row["project_id"], row["reporting_month"]) for row in result.mappings()}

    async def find_active_by_hash(self, content_sha256: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select id, status from public.cuf_import_batches
            where content_sha256 = :content_sha256
              and status in ('validated', 'importing', 'imported')
            limit 1
        """), {"content_sha256": content_sha256})
        return self.row(result)

    async def create_batch(
        self,
        *,
        file_name: str,
        file_type: str,
        file_size_bytes: int,
        content_sha256: str,
        columns: list[str],
        mapping: dict[str, str | None],
        summary: dict[str, Any],
        rows: list[dict[str, Any]],
        user_id: UUID,
    ) -> UUID:
        batch_result = await self.session.execute(text("""
            insert into public.cuf_import_batches (
              file_name, file_type, file_size_bytes, content_sha256,
              detected_columns, field_mapping, total_rows, valid_rows,
              invalid_rows, missing_values, duplicate_rows, anomaly_rows,
              quality_score, validation_summary, uploaded_by
            ) values (
              :file_name, :file_type, :file_size_bytes, :content_sha256,
              :detected_columns, cast(:field_mapping as jsonb), :total_rows, :valid_rows,
              :invalid_rows, :missing_values, :duplicate_rows, :anomaly_rows,
              :quality_score, cast(:validation_summary as jsonb), :uploaded_by
            ) returning id
        """), {
            "file_name": file_name,
            "file_type": file_type,
            "file_size_bytes": file_size_bytes,
            "content_sha256": content_sha256,
            "detected_columns": columns,
            "field_mapping": json.dumps(mapping, default=str),
            "validation_summary": json.dumps(summary, default=str),
            "uploaded_by": user_id,
            **summary,
        })
        batch_id = batch_result.scalar_one()
        parameters = [{
            "batch_id": batch_id,
            "row_number": row["row_number"],
            "project_id": row["project_id"],
            "project_code": row["project_code"],
            "reporting_month": row["reporting_month"],
            "validation_status": row["validation_status"],
            "raw_data": json.dumps(row["raw_data"], default=str),
            "normalized_data": json.dumps(row["normalized_data"], default=str),
            "transformations": json.dumps(row["transformations"], default=str),
            "validation_errors": json.dumps(row["validation_errors"], default=str),
            "validation_warnings": json.dumps(row["validation_warnings"], default=str),
            "missing_value_count": row["missing_value_count"],
            "is_duplicate": row["is_duplicate"],
            "anomaly_count": row["anomaly_count"],
        } for row in rows]
        await self.session.execute(text("""
            insert into public.cuf_import_rows (
              batch_id, row_number, project_id, project_code, reporting_month,
              validation_status, raw_data, normalized_data, transformations,
              validation_errors, validation_warnings, missing_value_count,
              is_duplicate, anomaly_count
            ) values (
              :batch_id, :row_number, cast(:project_id as uuid), :project_code, :reporting_month,
              :validation_status, cast(:raw_data as jsonb), cast(:normalized_data as jsonb),
              cast(:transformations as jsonb), cast(:validation_errors as jsonb),
              cast(:validation_warnings as jsonb), :missing_value_count,
              :is_duplicate, :anomaly_count
            )
        """), parameters)
        await self._audit(batch_id, user_id, "upload_validate_cuf", {
            "file_name": file_name,
            "content_sha256": content_sha256,
            **summary,
        })
        return batch_id

    async def get_preview(self, batch_id: UUID, preview_limit: int, preview_offset: int = 0) -> dict[str, Any] | None:
        batch_result = await self.session.execute(text("""
            select id as batch_id, file_name, file_type, file_size_bytes, status,
                   detected_columns, field_mapping, total_rows, valid_rows,
                   invalid_rows, missing_values, duplicate_rows, anomaly_rows,
                   quality_score::double precision as quality_score,
                   validation_summary, uploaded_at
            from public.cuf_import_batches
            where id = :batch_id
        """), {"batch_id": batch_id})
        batch = self.row(batch_result)
        if batch is None:
            return None
        row_result = await self.session.execute(text("""
            select row_number, project_code, reporting_month, validation_status,
                   raw_data, normalized_data, transformations, validation_errors,
                   validation_warnings, missing_value_count, is_duplicate, anomaly_count
            from public.cuf_import_rows
            where batch_id = :batch_id
            order by (validation_status = 'valid'), row_number
            limit :preview_limit
            offset :preview_offset
        """), {"batch_id": batch_id, "preview_limit": preview_limit, "preview_offset": preview_offset})
        batch["preview_rows"] = self.rows(row_result)
        batch["preview_offset"] = preview_offset
        batch["preview_limit"] = preview_limit
        batch["preview_truncated"] = batch["total_rows"] > preview_offset + len(batch["preview_rows"])
        return batch

    async def confirm(self, batch_id: UUID, user_id: UUID) -> dict[str, Any] | None:
        batch_result = await self.session.execute(text("""
            select id, status, total_rows, valid_rows, invalid_rows
            from public.cuf_import_batches
            where id = :batch_id
            for update
        """), {"batch_id": batch_id})
        batch = self.row(batch_result)
        if batch is None:
            return None

        await self.session.execute(text("""
            update public.cuf_import_batches set status = 'importing'
            where id = :batch_id
        """), {"batch_id": batch_id})

        inserted_result = await self.session.execute(text("""
            with inserted as (
              insert into public.project_monthly_updates (
                project_id, reporting_month, approved_cost, revised_cost, expenditure,
                physical_progress, planned_progress, financial_progress,
                original_completion_date, revised_completion_date, forecast_completion_date,
                delay_days, milestones_total, milestones_completed, milestones_delayed,
                milestones_at_risk, land_acquisition_target, land_acquisition_completed,
                land_acquisition_unit, land_acquisition_progress, clearance_status,
                contract_status, issues, remarks, submitted_by, submitted_at,
                source_system, source_record_id, ingestion_batch_id, data_quality_status,
                raw_payload, metadata
              )
              select
                row.project_id, row.reporting_month,
                nullif(row.normalized_data->>'approved_cost', '')::numeric,
                nullif(row.normalized_data->>'revised_cost', '')::numeric,
                nullif(row.normalized_data->>'expenditure', '')::numeric,
                nullif(row.normalized_data->>'physical_progress', '')::numeric,
                nullif(row.normalized_data->>'planned_progress', '')::numeric,
                nullif(row.normalized_data->>'financial_progress', '')::numeric,
                nullif(row.normalized_data->>'original_completion_date', '')::date,
                nullif(row.normalized_data->>'revised_completion_date', '')::date,
                nullif(row.normalized_data->>'forecast_completion_date', '')::date,
                nullif(row.normalized_data->>'delay_days', '')::integer,
                nullif(row.normalized_data->>'milestones_total', '')::integer,
                nullif(row.normalized_data->>'milestones_completed', '')::integer,
                nullif(row.normalized_data->>'milestones_delayed', '')::integer,
                nullif(row.normalized_data->>'milestones_at_risk', '')::integer,
                nullif(row.normalized_data->>'land_acquisition_target', '')::numeric,
                nullif(row.normalized_data->>'land_acquisition_completed', '')::numeric,
                row.normalized_data->>'land_acquisition_unit',
                nullif(row.normalized_data->>'land_acquisition_progress', '')::numeric,
                coalesce(row.normalized_data->'clearance_status', '{}'::jsonb),
                row.normalized_data->>'contract_status',
                coalesce(array(select jsonb_array_elements_text(row.normalized_data->'issues')), '{}'::text[]),
                row.normalized_data->>'remarks', :user_id, now(), 'CUF',
                :batch_text || ':' || row.row_number::text, :batch_id, 'validated',
                row.raw_data,
                jsonb_build_object(
                  'cuf_import_batch_id', :batch_text,
                  'source_row_number', row.row_number,
                  'transformations', row.transformations,
                  'validation_warnings', row.validation_warnings,
                  'validation_errors', row.validation_errors,
                  'anomaly_count', row.anomaly_count,
                  'missing_value_count', row.missing_value_count,
                  'validation_evidence_version', 'cuf-row-v1'
                )
              from public.cuf_import_rows row
              where row.batch_id = :batch_id and row.validation_status = 'valid'
              on conflict do nothing
              returning id, project_id, reporting_month
            )
            update public.cuf_import_rows row
            set validation_status = 'imported', imported_update_id = inserted.id
            from inserted
            where row.batch_id = :batch_id
              and row.project_id = inserted.project_id
              and row.reporting_month = inserted.reporting_month
            returning row.id
        """), {"batch_id": batch_id, "batch_text": str(batch_id), "user_id": user_id})
        imported_rows = len(inserted_result.all())

        await self.session.execute(text("""
            update public.cuf_import_rows
            set validation_status = 'conflict',
                is_duplicate = true,
                validation_errors = validation_errors || jsonb_build_array(jsonb_build_object(
                  'field', 'reporting_month',
                  'code', 'duplicate_monthly_import',
                  'message', 'A concurrent or previously certified CUF update already exists.'
                ))
            where batch_id = :batch_id and validation_status = 'valid'
        """), {"batch_id": batch_id})

        await self.session.execute(text("""
            insert into public.project_cost_history (
              project_id, effective_date, approved_cost, revised_cost, expenditure,
              change_reason, source_update_id, metadata
            )
            select update.project_id, update.reporting_month, update.approved_cost,
                   update.revised_cost, update.expenditure, 'CUF monthly import', update.id,
                   jsonb_build_object('cuf_import_batch_id', :batch_text)
            from public.project_monthly_updates update
            where update.ingestion_batch_id = :batch_id
              and (update.approved_cost is not null or update.revised_cost is not null or update.expenditure is not null)
            on conflict do nothing
        """), {"batch_id": batch_id, "batch_text": str(batch_id)})
        await self.session.execute(text("""
            insert into public.project_schedule_history (
              project_id, effective_date, original_completion_date, revised_completion_date,
              forecast_completion_date, delay_days, physical_progress, planned_progress,
              revision_reason, source_update_id, metadata
            )
            select update.project_id, update.reporting_month, update.original_completion_date,
                   update.revised_completion_date, update.forecast_completion_date,
                   update.delay_days, update.physical_progress, update.planned_progress,
                   'CUF monthly import', update.id,
                   jsonb_build_object('cuf_import_batch_id', :batch_text)
            from public.project_monthly_updates update
            where update.ingestion_batch_id = :batch_id
              and (update.original_completion_date is not null or update.revised_completion_date is not null
                   or update.forecast_completion_date is not null or update.delay_days is not null
                   or update.physical_progress is not null or update.planned_progress is not null)
            on conflict do nothing
        """), {"batch_id": batch_id, "batch_text": str(batch_id)})

        refreshed_projects = await self.session.scalar(
            text("select public.refresh_projects_from_cuf_batch(:batch_id)"),
            {"batch_id": batch_id},
        )

        skipped_rows = batch["valid_rows"] - imported_rows
        await self.session.execute(text("""
            update public.cuf_import_batches
            set status = 'imported', confirmed_by = :user_id, confirmed_at = now(),
                imported_rows = :imported_rows, skipped_rows = :skipped_rows,
                downstream_analysis_status = 'pending', downstream_analysis_requested_at = now()
            where id = :batch_id
        """), {
            "batch_id": batch_id,
            "user_id": user_id,
            "imported_rows": imported_rows,
            "skipped_rows": skipped_rows,
        })
        await self._audit(batch_id, user_id, "confirm_cuf_import", {
            "imported_rows": imported_rows,
            "skipped_rows": skipped_rows,
            "invalid_rows": batch["invalid_rows"],
            "refreshed_projects": refreshed_projects or 0,
            "downstream_analysis_status": "pending",
        })
        return {
            "batch_id": batch_id,
            "status": "imported",
            "imported_rows": imported_rows,
            "skipped_rows": skipped_rows,
            "invalid_rows": batch["invalid_rows"],
            "downstream_analysis_status": "pending",
            "message": "Validated rows were imported. Invalid rows remain staged for audit and correction.",
        }

    async def _audit(self, batch_id: UUID, user_id: UUID, action: str, values: dict[str, Any]) -> None:
        await self.session.execute(text("""
            insert into public.audit_logs (
              actor_id, action, entity_type, entity_id, table_name,
              record_key, new_values, source, import_reference
            ) values (
              :actor_id, :action, 'cuf_import_batch', :entity_id,
              'cuf_import_batches', :record_key, cast(:new_values as jsonb),
              'cuf_ingestion', :record_key
            )
        """), {
            "actor_id": user_id,
            "action": action,
            "entity_id": batch_id,
            "record_key": str(batch_id),
            "new_values": json.dumps(values, default=str),
        })
