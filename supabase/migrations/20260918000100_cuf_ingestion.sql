-- Staged, auditable CUF ingestion. Raw government data is retained separately
-- from normalized values and is never written to certified monitoring tables
-- until an authorized user confirms the validated batch.

begin;

-- A project can have only one certified monitoring snapshot per month,
-- regardless of whether it originated in CUF or another approved channel.
create unique index project_monthly_updates_one_month_uidx
  on public.project_monthly_updates (project_id, reporting_month);

create table public.cuf_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null,
  file_size_bytes bigint not null,
  content_sha256 char(64) not null,
  status text not null default 'validated',
  source_system text not null default 'CUF',
  detected_columns text[] not null default '{}'::text[],
  field_mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  missing_values integer not null default 0,
  duplicate_rows integer not null default 0,
  anomaly_rows integer not null default 0,
  quality_score numeric(5,2) not null default 0,
  validation_summary jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  confirmed_at timestamptz,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  downstream_analysis_status text not null default 'not_requested',
  downstream_analysis_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuf_batches_file_name_not_blank check (btrim(file_name) <> ''),
  constraint cuf_batches_file_type check (file_type in ('csv', 'xlsx')),
  constraint cuf_batches_file_size check (file_size_bytes > 0),
  constraint cuf_batches_hash_format check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cuf_batches_status check (status in ('validated', 'importing', 'imported', 'failed')),
  constraint cuf_batches_counts_nonnegative check (
    total_rows >= 0 and valid_rows >= 0 and invalid_rows >= 0 and
    missing_values >= 0 and duplicate_rows >= 0 and anomaly_rows >= 0 and
    imported_rows >= 0 and skipped_rows >= 0
  ),
  constraint cuf_batches_row_totals check (valid_rows + invalid_rows = total_rows),
  constraint cuf_batches_quality_range check (quality_score between 0 and 100),
  constraint cuf_batches_mapping_object check (jsonb_typeof(field_mapping) = 'object'),
  constraint cuf_batches_summary_object check (jsonb_typeof(validation_summary) = 'object'),
  constraint cuf_batches_downstream_status check (
    downstream_analysis_status in ('not_requested', 'pending', 'processing', 'completed', 'failed')
  )
);

create unique index cuf_import_batches_content_uidx
  on public.cuf_import_batches (content_sha256)
  where status in ('validated', 'importing', 'imported');
create index cuf_import_batches_uploader_time_idx
  on public.cuf_import_batches (uploaded_by, uploaded_at desc);
create index cuf_import_batches_status_idx
  on public.cuf_import_batches (status, uploaded_at desc);
create index cuf_import_batches_analysis_queue_idx
  on public.cuf_import_batches (downstream_analysis_status, confirmed_at)
  where downstream_analysis_status in ('pending', 'processing');

create table public.cuf_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.cuf_import_batches(id) on delete cascade,
  row_number integer not null,
  project_id uuid references public.projects(id) on delete restrict,
  project_code text,
  reporting_month date,
  validation_status text not null,
  raw_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  transformations jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  missing_value_count integer not null default 0,
  is_duplicate boolean not null default false,
  anomaly_count integer not null default 0,
  imported_update_id uuid references public.project_monthly_updates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuf_rows_number_positive check (row_number >= 2),
  constraint cuf_rows_status check (validation_status in ('valid', 'invalid', 'imported', 'conflict')),
  constraint cuf_rows_counts_nonnegative check (missing_value_count >= 0 and anomaly_count >= 0),
  constraint cuf_rows_raw_object check (jsonb_typeof(raw_data) = 'object'),
  constraint cuf_rows_normalized_object check (jsonb_typeof(normalized_data) = 'object'),
  constraint cuf_rows_transformations_array check (jsonb_typeof(transformations) = 'array'),
  constraint cuf_rows_errors_array check (jsonb_typeof(validation_errors) = 'array'),
  constraint cuf_rows_warnings_array check (jsonb_typeof(validation_warnings) = 'array'),
  unique (batch_id, row_number)
);

create index cuf_import_rows_batch_status_idx
  on public.cuf_import_rows (batch_id, validation_status, row_number);
create index cuf_import_rows_project_month_idx
  on public.cuf_import_rows (project_id, reporting_month)
  where project_id is not null and reporting_month is not null;

alter table public.cuf_import_batches enable row level security;
alter table public.cuf_import_rows enable row level security;

grant select, insert, update on public.cuf_import_batches to authenticated;
grant select, insert, update on public.cuf_import_rows to authenticated;

create policy cuf_batches_uploaders_read
  on public.cuf_import_batches for select to authenticated
  using (uploaded_by = (select auth.uid()) or public.can_manage_monitoring());

create policy cuf_batches_upload_insert
  on public.cuf_import_batches for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.can_upload_cuf());

create policy cuf_batches_authorized_update
  on public.cuf_import_batches for update to authenticated
  using (uploaded_by = (select auth.uid()) or public.can_manage_monitoring())
  with check (uploaded_by = (select auth.uid()) or public.can_manage_monitoring());

create policy cuf_rows_batch_read
  on public.cuf_import_rows for select to authenticated
  using (
    exists (
      select 1 from public.cuf_import_batches batch
      where batch.id = batch_id
        and (batch.uploaded_by = (select auth.uid()) or public.can_manage_monitoring())
    )
  );

create policy cuf_rows_upload_insert
  on public.cuf_import_rows for insert to authenticated
  with check (
    public.can_upload_cuf() and exists (
      select 1 from public.cuf_import_batches batch
      where batch.id = batch_id and batch.uploaded_by = (select auth.uid())
    )
  );

create policy cuf_rows_monitoring_update
  on public.cuf_import_rows for update to authenticated
  using (public.can_manage_monitoring())
  with check (public.can_manage_monitoring());

-- API-side audit records retain the actor identity and are append-only.
grant insert on public.audit_logs to authenticated;
create policy audit_logs_cuf_insert
  on public.audit_logs for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and entity_type = 'cuf_import_batch'
    and public.can_upload_cuf()
  );

-- Refresh only the frontend-compatible monitoring snapshot after certification.
-- SECURITY DEFINER avoids granting Monitoring Officers broad project-master
-- UPDATE rights; project identity, ownership, sector and agency remain Admin-only.
create or replace function public.refresh_projects_from_cuf_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not public.can_manage_monitoring() then
    raise exception 'Monitoring Officer or Administrator access is required.' using errcode = '42501';
  end if;

  with latest as (
    select distinct on (update.project_id)
      update.project_id, update.reporting_month, update.approved_cost,
      update.revised_cost, update.expenditure, update.physical_progress,
      update.planned_progress, update.financial_progress,
      update.original_completion_date, update.revised_completion_date,
      update.delay_days, update.source_record_id, update.raw_payload
    from public.project_monthly_updates update
    where update.ingestion_batch_id = p_batch_id
    order by update.project_id, update.reporting_month desc
  )
  update public.projects project
  set approved_cost = coalesce(latest.approved_cost, project.approved_cost),
      revised_cost = coalesce(latest.revised_cost, project.revised_cost),
      expenditure = coalesce(latest.expenditure, project.expenditure),
      physical_progress = coalesce(latest.physical_progress, project.physical_progress),
      planned_progress = coalesce(latest.planned_progress, project.planned_progress),
      financial_progress = coalesce(latest.financial_progress, project.financial_progress),
      original_completion_date = coalesce(latest.original_completion_date, project.original_completion_date),
      revised_completion_date = coalesce(latest.revised_completion_date, project.revised_completion_date),
      delay_days = coalesce(latest.delay_days, project.delay_days),
      last_reported_at = latest.reporting_month::timestamp at time zone 'UTC',
      source_system = 'CUF',
      source_record_id = latest.source_record_id,
      ingestion_batch_id = p_batch_id,
      data_quality_status = 'validated',
      raw_payload = latest.raw_payload,
      metadata = project.metadata || jsonb_build_object('latest_cuf_import_batch_id', p_batch_id),
      version = project.version + 1
  from latest
  where project.id = latest.project_id
    and (
      project.last_reported_at is null
      or latest.reporting_month >= date_trunc('month', project.last_reported_at)::date
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_projects_from_cuf_batch(uuid) from public;
grant execute on function public.refresh_projects_from_cuf_batch(uuid) to authenticated;

-- Keep updated_at behavior consistent with the foundation tables.
create trigger cuf_import_batches_set_updated_at
before update on public.cuf_import_batches
for each row execute function public.set_updated_at();

create trigger cuf_import_rows_set_updated_at
before update on public.cuf_import_rows
for each row execute function public.set_updated_at();

commit;
