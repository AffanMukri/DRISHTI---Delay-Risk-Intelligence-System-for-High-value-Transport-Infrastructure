import json
from typing import Any
from uuid import UUID

from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID

from app.repositories.base import BaseRepository


class ExperimentRepository(BaseRepository):
    async def feature_definitions(self) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select definition.code, definition.display_name, definition.category,
                   definition.unit, definition.description, definition.minimum_value,
                   definition.maximum_value, definition.is_active,
                   count(observation.id) filter (where observation.validation_status = 'validated')::integer
                     as validated_observation_count,
                   count(distinct observation.project_id) filter (where observation.validation_status = 'validated')::integer
                     as validated_project_count
            from public.external_feature_definitions definition
            left join public.external_feature_observations observation
              on observation.feature_code = definition.code
            where definition.is_active
            group by definition.code
            order by definition.category, definition.code
        """))
        return self.rows(result)

    async def validated_observations(self, project_ids: list[UUID]) -> list[dict[str, Any]]:
        if not project_ids:
            return []
        statement = text("""
            select observation.id, observation.project_id, observation.feature_code,
                   observation.numeric_value, observation.observation_date,
                   observation.period_start, observation.period_end,
                   observation.source_name, observation.source_uri,
                   observation.source_record_id, observation.publisher,
                   observation.licence, observation.retrieved_at,
                   observation.source_checksum_sha256, observation.validated_at,
                   observation.validation_notes
            from public.external_feature_observations observation
            where observation.validation_status = 'validated'
              and observation.project_id = any(:project_ids)
            order by observation.project_id, observation.feature_code,
                     observation.observation_date desc, observation.validated_at desc
        """).bindparams(bindparam("project_ids", type_=ARRAY(PGUUID(as_uuid=True))))
        result = await self.session.execute(statement, {"project_ids": project_ids})
        return self.rows(result)

    async def project_database_id(self, identifier: str) -> UUID | None:
        result = await self.session.execute(text("""
            select id from public.projects
            where project_code = :identifier or id::text = :identifier
            limit 1
        """), {"identifier": identifier})
        return result.scalar_one_or_none()

    async def definition(self, code: str) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select code, display_name, category, unit, description,
                   minimum_value, maximum_value, is_active
            from public.external_feature_definitions where code = :code
        """), {"code": code})
        return self.row(result)

    async def create_observation(
        self, *, project_id: UUID, values: dict[str, Any], created_by: UUID
    ) -> dict[str, Any]:
        result = await self.session.execute(text("""
            insert into public.external_feature_observations (
              project_id, feature_code, numeric_value, observation_date,
              period_start, period_end, source_name, source_uri, source_record_id,
              publisher, licence, retrieved_at, source_checksum_sha256,
              validation_status, metadata, created_by
            ) values (
              :project_id, :feature_code, :numeric_value, :observation_date,
              :period_start, :period_end, :source_name, :source_uri, :source_record_id,
              :publisher, :licence, :retrieved_at, :source_checksum_sha256,
              'pending', cast(:metadata as jsonb), :created_by
            )
            returning *
        """), {
            **values,
            "project_id": project_id,
            "created_by": created_by,
            "metadata": json.dumps(values.get("metadata") or {}, default=str),
        })
        return self.row(result) or {}

    async def validate_observation(
        self, observation_id: UUID, *, status: str, notes: str, validated_by: UUID
    ) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            update public.external_feature_observations
            set validation_status = cast(:status as public.external_feature_validation_status),
                validation_notes = :notes, validated_by = :validated_by,
                validated_at = now(), updated_at = now()
            where id = :observation_id
            returning *
        """), {
            "observation_id": observation_id,
            "status": status,
            "notes": notes,
            "validated_by": validated_by,
        })
        return self.row(result)

    async def experiment_version_exists(self, version: str) -> bool:
        result = await self.session.execute(text("""
            select exists (
              select 1 from public.model_comparison_experiments
              where experiment_code = 'cuf_vs_cuf_plus' and version = :version
            )
        """), {"version": version})
        return bool(result.scalar_one())

    async def save_experiment(
        self,
        *,
        artifact: dict[str, Any],
        requested_by: UUID,
        artifact_uri: str,
        artifact_checksum: str,
    ) -> dict[str, Any]:
        result = await self.session.execute(text("""
            insert into public.model_comparison_experiments (
              experiment_code, version, status, requested_by, started_at, completed_at,
              random_state, methodology, feature_sets, feature_coverage, metrics,
              comparison, limitations, dataset_fingerprint_sha256,
              artifact_uri, artifact_checksum_sha256
            ) values (
              :experiment_code, :version,
              cast(:status as public.model_experiment_status), :requested_by,
              :generated_at, :generated_at, :random_state,
              cast(:methodology as jsonb), cast(:feature_sets as jsonb),
              cast(:feature_coverage as jsonb), cast(:metrics as jsonb),
              cast(:comparison as jsonb), cast(:limitations as jsonb),
              :fingerprint, :artifact_uri, :artifact_checksum
            )
            returning *
        """), {
            "experiment_code": artifact["experiment_code"],
            "version": artifact["version"],
            "status": artifact["status"],
            "requested_by": requested_by,
            "generated_at": artifact["generated_at"],
            "random_state": artifact["methodology"]["random_state"],
            "methodology": json.dumps(artifact["methodology"], default=str),
            "feature_sets": json.dumps(artifact["feature_sets"], default=str),
            "feature_coverage": json.dumps(artifact["feature_coverage"], default=str),
            "metrics": json.dumps(artifact["metrics"], default=str),
            "comparison": json.dumps({
                **artifact["comparison"],
                "conclusion": artifact["conclusion"],
                "model_b_improvement_supported": artifact["model_b_improvement_supported"],
            }, default=str),
            "limitations": json.dumps(artifact["limitations"], default=str),
            "fingerprint": artifact["dataset_fingerprint_sha256"],
            "artifact_uri": artifact_uri,
            "artifact_checksum": artifact_checksum,
        })
        return self.row(result) or {}

    async def latest_experiment(self) -> dict[str, Any] | None:
        result = await self.session.execute(text("""
            select * from public.model_comparison_experiments
            where experiment_code = 'cuf_vs_cuf_plus'
            order by completed_at desc nulls last, created_at desc
            limit 1
        """))
        return self.row(result)

    async def list_experiments(self, limit: int) -> list[dict[str, Any]]:
        result = await self.session.execute(text("""
            select * from public.model_comparison_experiments
            where experiment_code = 'cuf_vs_cuf_plus'
            order by completed_at desc nulls last, created_at desc
            limit :limit
        """), {"limit": limit})
        return self.rows(result)
