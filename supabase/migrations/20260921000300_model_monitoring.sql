-- Administrative, observation-only monitoring for deployed model versions.
-- Monitoring reports never change model status or trigger retraining.

create type public.model_monitoring_status as enum (
  'sufficient',
  'partial',
  'insufficient_data',
  'failed'
);

create table public.model_monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions(id) on delete cascade,
  status public.model_monitoring_status not null,
  monitoring_window_start timestamptz not null,
  monitoring_window_end timestamptz not null,
  comparison_window_start timestamptz not null,
  comparison_window_end timestamptz not null,
  reference_sample_size integer not null default 0,
  current_sample_size integer not null default 0,
  comparison_sample_size integer not null default 0,
  evaluated_outcome_count integer not null default 0,
  feature_drift jsonb not null default '{}'::jsonb,
  prediction_shift jsonb not null default '{}'::jsonb,
  missing_feature_changes jsonb not null default '{}'::jsonb,
  performance_monitoring jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  methodology jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  run_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_monitoring_window_valid check (
    monitoring_window_start < monitoring_window_end
    and comparison_window_start < comparison_window_end
    and comparison_window_end <= monitoring_window_start
  ),
  constraint model_monitoring_counts_nonnegative check (
    reference_sample_size >= 0 and current_sample_size >= 0
    and comparison_sample_size >= 0 and evaluated_outcome_count >= 0
  ),
  constraint model_monitoring_json_shapes check (
    jsonb_typeof(feature_drift) = 'object'
    and jsonb_typeof(prediction_shift) = 'object'
    and jsonb_typeof(missing_feature_changes) = 'object'
    and jsonb_typeof(performance_monitoring) = 'object'
    and jsonb_typeof(summary) = 'object'
    and jsonb_typeof(methodology) = 'object'
    and jsonb_typeof(limitations) = 'array'
  )
);

create index model_monitoring_runs_model_time_idx
  on public.model_monitoring_runs (model_version_id, completed_at desc);
create index model_monitoring_runs_status_time_idx
  on public.model_monitoring_runs (status, completed_at desc);

alter table public.model_monitoring_runs enable row level security;

create policy model_monitoring_runs_admin_read
  on public.model_monitoring_runs for select to authenticated
  using (public.is_admin());
create policy model_monitoring_runs_admin_insert
  on public.model_monitoring_runs for insert to authenticated
  with check (public.is_admin() and run_by = auth.uid());
create policy model_monitoring_runs_admin_update
  on public.model_monitoring_runs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy model_monitoring_runs_admin_delete
  on public.model_monitoring_runs for delete to authenticated
  using (public.is_admin());

create policy audit_logs_model_monitoring_insert
  on public.audit_logs for insert to authenticated
  with check (
    public.is_admin()
    and actor_id = auth.uid()
    and entity_type = 'model_monitoring_run'
    and action = 'model.monitoring_run'
  );

grant select, insert, update, delete on public.model_monitoring_runs to authenticated;

create trigger model_monitoring_runs_set_updated_at
before update on public.model_monitoring_runs
for each row execute function public.set_updated_at();

create index predictions_model_generated_idx
  on public.predictions (model_version_id, generated_at desc);
create index predictions_model_evaluated_idx
  on public.predictions (model_version_id, evaluated_at desc)
  where evaluated_at is not null;
