-- Expose non-sensitive row-level quality counts on the certified monthly
-- update so data-confidence reads are consistent across roles without
-- weakening RLS on raw CUF import rows.
update public.project_monthly_updates monthly
set metadata = monthly.metadata || jsonb_build_object(
  'validation_warnings', row.validation_warnings,
  'validation_errors', row.validation_errors,
  'anomaly_count', row.anomaly_count,
  'missing_value_count', row.missing_value_count,
  'validation_evidence_version', 'cuf-row-v1'
)
from public.cuf_import_rows row
where row.imported_update_id = monthly.id;

create index if not exists project_monthly_updates_confidence_lookup_idx
  on public.project_monthly_updates (project_id, reporting_month desc, created_at desc);
