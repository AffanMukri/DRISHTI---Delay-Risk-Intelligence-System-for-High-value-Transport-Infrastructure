-- Persistent fields required by the automated monthly early-warning engine.

begin;

alter table public.cuf_import_batches
  add column if not exists downstream_analysis_completed_at timestamptz,
  add column if not exists downstream_analysis_summary jsonb not null default '{}'::jsonb,
  add column if not exists downstream_analysis_error text;

alter table public.cuf_import_batches
  add constraint cuf_batches_downstream_summary_object
  check (jsonb_typeof(downstream_analysis_summary) = 'object');

alter table public.warnings
  add column if not exists source_update_id uuid references public.project_monthly_updates(id) on delete set null,
  add column if not exists current_value jsonb,
  add column if not exists previous_value jsonb,
  add column if not exists recommended_action text,
  add column if not exists first_detected_at timestamptz,
  add column if not exists last_detected_at timestamptz,
  add column if not exists occurrence_count integer not null default 1;

update public.warnings
set first_detected_at = coalesce(first_detected_at, detected_at),
    last_detected_at = coalesce(last_detected_at, detected_at)
where first_detected_at is null or last_detected_at is null;

alter table public.warnings
  alter column first_detected_at set default now(),
  alter column first_detected_at set not null,
  alter column last_detected_at set default now(),
  alter column last_detected_at set not null;

alter table public.warnings
  add constraint warnings_occurrence_count_positive check (occurrence_count > 0),
  add constraint warnings_current_value_json check (current_value is null or jsonb_typeof(current_value) in ('number', 'string', 'boolean', 'object', 'array')),
  add constraint warnings_previous_value_json check (previous_value is null or jsonb_typeof(previous_value) in ('number', 'string', 'boolean', 'object', 'array'));

create index warnings_source_update_idx on public.warnings (source_update_id)
  where source_update_id is not null;
create index warnings_project_type_active_idx on public.warnings (project_id, alert_type, last_detected_at desc)
  where status <> 'resolved';

commit;
