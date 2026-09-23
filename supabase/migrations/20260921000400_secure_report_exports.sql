-- Secure metadata and audit trail for backend-generated report downloads.

begin;

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  output_format text not null,
  reporting_month date not null,
  filters jsonb not null default '{}'::jsonb,
  generated_by uuid not null references public.profiles(id) on delete restrict,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text not null,
  data_as_of date not null,
  project_count integer not null default 0,
  status text not null default 'completed',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_exports_type_allowed check (report_type in (
    'monthly_flash', 'sector', 'ministry', 'critical_projects',
    'pragati_review_dossier', 'intervention'
  )),
  constraint report_exports_format_allowed check (output_format in ('pdf', 'xlsx', 'csv')),
  constraint report_exports_month_first_day check (reporting_month = date_trunc('month', reporting_month)::date),
  constraint report_exports_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint report_exports_file_name_not_blank check (btrim(file_name) <> ''),
  constraint report_exports_mime_type_not_blank check (btrim(mime_type) <> ''),
  constraint report_exports_size_nonnegative check (size_bytes >= 0),
  constraint report_exports_checksum_sha256 check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint report_exports_project_count_nonnegative check (project_count >= 0),
  constraint report_exports_status_allowed check (status in ('completed', 'failed')),
  constraint report_exports_completion_consistent check (status <> 'completed' or completed_at is not null)
);

create index report_exports_generated_by_time_idx
  on public.report_exports (generated_by, created_at desc);
create index report_exports_type_period_idx
  on public.report_exports (report_type, reporting_month desc);

alter table public.report_exports enable row level security;

create trigger report_exports_set_updated_at
before update on public.report_exports
for each row execute function public.set_updated_at();
revoke all on table public.report_exports from anon, authenticated;
grant select, insert on table public.report_exports to authenticated;

create policy report_exports_own_or_admin_read
  on public.report_exports for select to authenticated
  using (generated_by = (select auth.uid()) or public.is_admin());

create policy report_exports_active_user_insert
  on public.report_exports for insert to authenticated
  with check (
    generated_by = (select auth.uid())
    and public.current_app_role() is not null
  );

create or replace function public.audit_report_export()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, table_name,
    record_key, new_values
  ) values (
    new.generated_by,
    'report.generated',
    'report_export',
    new.id,
    'report_exports',
    new.file_name,
    jsonb_build_object(
      'report_type', new.report_type,
      'output_format', new.output_format,
      'reporting_month', new.reporting_month,
      'filters', new.filters,
      'size_bytes', new.size_bytes,
      'checksum_sha256', new.checksum_sha256,
      'project_count', new.project_count
    )
  );
  return new;
end;
$$;

revoke all on function public.audit_report_export() from public;

create trigger report_exports_audit_insert
after insert on public.report_exports
for each row execute function public.audit_report_export();

notify pgrst, 'reload schema';

commit;
