-- Reproducible CUF-only versus CUF+validated-external-data experiments.
-- This migration deliberately seeds feature definitions, not observations.
-- External values must be source-attributed, reviewed, and time-valid before use.

create type public.external_feature_validation_status as enum ('pending', 'validated', 'rejected');
create type public.model_experiment_status as enum ('running', 'completed', 'insufficient_data', 'failed');

create table public.external_feature_definitions (
  code text primary key,
  display_name text not null,
  category text not null,
  unit text not null,
  description text not null,
  minimum_value double precision,
  maximum_value double precision,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_feature_code_format check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint external_feature_name_not_blank check (btrim(display_name) <> ''),
  constraint external_feature_category_not_blank check (btrim(category) <> ''),
  constraint external_feature_unit_not_blank check (btrim(unit) <> ''),
  constraint external_feature_range_valid check (
    minimum_value is null or maximum_value is null or minimum_value <= maximum_value
  )
);

create table public.external_feature_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  feature_code text not null references public.external_feature_definitions(code) on delete restrict,
  numeric_value double precision not null,
  observation_date date not null,
  period_start date,
  period_end date,
  source_name text not null,
  source_uri text not null,
  source_record_id text not null,
  publisher text,
  licence text,
  retrieved_at timestamptz not null,
  source_checksum_sha256 text,
  validation_status public.external_feature_validation_status not null default 'pending',
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  validation_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_observation_source_name_not_blank check (btrim(source_name) <> ''),
  constraint external_observation_source_uri_not_blank check (btrim(source_uri) <> ''),
  constraint external_observation_source_record_not_blank check (btrim(source_record_id) <> ''),
  constraint external_observation_period_valid check (
    (period_start is null and period_end is null)
    or (period_start is not null and period_end is not null and period_start <= period_end)
  ),
  constraint external_observation_checksum_format check (
    source_checksum_sha256 is null or source_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint external_observation_validation_audit check (
    validation_status = 'pending'
    or (validated_by is not null and validated_at is not null and btrim(coalesce(validation_notes, '')) <> '')
  ),
  constraint external_observation_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (project_id, feature_code, observation_date, source_name, source_record_id)
);

create index external_feature_observations_project_asof_idx
  on public.external_feature_observations (project_id, feature_code, observation_date desc)
  where validation_status = 'validated';
create index external_feature_observations_status_idx
  on public.external_feature_observations (validation_status, created_at desc);

create table public.model_comparison_experiments (
  id uuid primary key default gen_random_uuid(),
  experiment_code text not null,
  version text not null,
  status public.model_experiment_status not null default 'running',
  requested_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  random_state integer not null,
  methodology jsonb not null default '{}'::jsonb,
  feature_sets jsonb not null default '{}'::jsonb,
  feature_coverage jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  dataset_fingerprint_sha256 text,
  artifact_uri text,
  artifact_checksum_sha256 text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_comparison_code_not_blank check (btrim(experiment_code) <> ''),
  constraint model_comparison_version_format check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  constraint model_comparison_json_shapes check (
    jsonb_typeof(methodology) = 'object'
    and jsonb_typeof(feature_sets) = 'object'
    and jsonb_typeof(feature_coverage) = 'object'
    and jsonb_typeof(metrics) = 'object'
    and jsonb_typeof(comparison) = 'object'
    and jsonb_typeof(limitations) = 'array'
  ),
  constraint model_comparison_fingerprint_format check (
    dataset_fingerprint_sha256 is null or dataset_fingerprint_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint model_comparison_checksum_format check (
    artifact_checksum_sha256 is null or artifact_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint model_comparison_completion_consistent check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  ),
  unique (experiment_code, version)
);

create index model_comparison_experiments_latest_idx
  on public.model_comparison_experiments (experiment_code, completed_at desc nulls last, created_at desc);

insert into public.external_feature_definitions
  (code, display_name, category, unit, description, minimum_value, maximum_value)
values
  ('weather_extreme_days_12m', 'Extreme weather days (12 months)', 'weather', 'days', 'Source-reported extreme weather days in the twelve months preceding the feature snapshot.', 0, 366),
  ('weather_rainfall_anomaly_pct', 'Rainfall anomaly', 'weather', 'percent', 'Source-reported rainfall deviation from the source baseline for the relevant project geography and period.', -100, 1000),
  ('land_acquisition_external_pct', 'Externally verified land acquisition', 'land_acquisition', 'percent', 'Land acquisition completion independently reported outside the CUF record.', 0, 100),
  ('environmental_clearance_delay_days', 'Environmental clearance delay', 'environmental_clearance', 'days', 'Elapsed delay against the documented environmental clearance due date.', 0, 10000),
  ('contractor_completion_rate_pct', 'Contractor historical completion rate', 'contractor_history', 'percent', 'Historical share of comparable contracts completed by the contractor under the stated source methodology.', 0, 100),
  ('contractor_average_delay_days', 'Contractor historical average delay', 'contractor_history', 'days', 'Historical average completion delay for comparable contractor assignments.', -3650, 10000),
  ('commodity_price_change_pct', 'Relevant commodity price change', 'commodity_prices', 'percent', 'Change in the documented project-relevant material price index over the source period.', -100, 1000),
  ('district_infrastructure_index', 'District infrastructure index', 'district_characteristics', 'index_0_100', 'Documented district infrastructure index normalized by its publisher to a 0-100 scale.', 0, 100),
  ('district_development_index', 'District development index', 'district_characteristics', 'index_0_100', 'Documented district development index normalized by its publisher to a 0-100 scale.', 0, 100),
  ('litigation_open_case_count', 'Open project litigation cases', 'litigation', 'count', 'Source-confirmed open litigation matters linked to the project at the observation date.', 0, 10000),
  ('litigation_delay_days', 'Litigation-attributed delay', 'litigation', 'days', 'Documented delay attributed to litigation at the observation date.', 0, 10000),
  ('procurement_delay_days', 'Procurement delay', 'procurement', 'days', 'Documented procurement completion delay against the approved procurement schedule.', 0, 10000),
  ('geographic_complexity_index', 'Geographic complexity index', 'geographic_complexity', 'index_0_100', 'Published or reproducibly calculated geographic complexity index on a 0-100 scale.', 0, 100),
  ('fund_release_delay_days', 'Fund release delay', 'fund_release', 'days', 'Delay between approved and actual fund release dates.', 0, 10000),
  ('fund_release_ratio_pct', 'Fund release ratio', 'fund_release', 'percent', 'Released funds as a percentage of the sanctioned release for the relevant period.', 0, 200);

alter table public.external_feature_definitions enable row level security;
alter table public.external_feature_observations enable row level security;
alter table public.model_comparison_experiments enable row level security;

create policy external_feature_definitions_active_read
  on public.external_feature_definitions for select to authenticated
  using (public.current_app_role() is not null);

create policy external_feature_observations_active_read
  on public.external_feature_observations for select to authenticated
  using (public.current_app_role() is not null);
create policy external_feature_observations_model_roles_insert
  on public.external_feature_observations for insert to authenticated
  with check (public.can_manage_models() and created_by = auth.uid());
create policy external_feature_observations_model_roles_update
  on public.external_feature_observations for update to authenticated
  using (public.can_manage_models()) with check (public.can_manage_models());
create policy external_feature_observations_admin_delete
  on public.external_feature_observations for delete to authenticated
  using (public.is_admin());

create policy model_comparison_prediction_roles_read
  on public.model_comparison_experiments for select to authenticated
  using (public.can_view_predictions());
create policy model_comparison_model_roles_insert
  on public.model_comparison_experiments for insert to authenticated
  with check (public.can_manage_models() and requested_by = auth.uid());
create policy model_comparison_model_roles_update
  on public.model_comparison_experiments for update to authenticated
  using (public.can_manage_models()) with check (public.can_manage_models());
create policy model_comparison_admin_delete
  on public.model_comparison_experiments for delete to authenticated
  using (public.is_admin());

grant select on public.external_feature_definitions to authenticated;
grant select, insert, update, delete on public.external_feature_observations to authenticated;
grant select, insert, update, delete on public.model_comparison_experiments to authenticated;

create trigger external_feature_definitions_set_updated_at
before update on public.external_feature_definitions
for each row execute function public.set_updated_at();
create trigger external_feature_observations_set_updated_at
before update on public.external_feature_observations
for each row execute function public.set_updated_at();
create trigger model_comparison_experiments_set_updated_at
before update on public.model_comparison_experiments
for each row execute function public.set_updated_at();
