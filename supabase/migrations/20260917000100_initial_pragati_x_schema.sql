-- PRAGATI-X database foundation
-- Normalized PostgreSQL schema for Supabase Auth, project monitoring,
-- historical analytics, interventions, reporting, CUF ingestion, and ML.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Domains and enums
-- ---------------------------------------------------------------------------

create domain public.percentage as numeric(5,2)
  check (value >= 0 and value <= 100);

create domain public.nonnegative_amount as numeric(20,2)
  check (value >= 0);

create type public.app_role as enum (
  'administrator',
  'monitoring_officer',
  'analyst',
  'executive'
);

create type public.project_status as enum (
  'active',
  'completed',
  'on_hold',
  'under_review'
);

create type public.milestone_status as enum (
  'completed',
  'on_track',
  'at_risk',
  'delayed'
);

create type public.risk_level as enum (
  'healthy',
  'watch',
  'high_risk',
  'critical'
);

create type public.risk_impact as enum ('low', 'medium', 'high');

create type public.warning_severity as enum (
  'critical',
  'high',
  'moderate',
  'low'
);

create type public.warning_status as enum (
  'new',
  'acknowledged',
  'assigned',
  'under_review',
  'resolved'
);

-- "medium" remains available for compatibility with the current TS union;
-- new records should prefer "moderate".
create type public.intervention_priority as enum (
  'critical',
  'high',
  'moderate',
  'medium',
  'low'
);

create type public.intervention_status as enum (
  'open',
  'assigned',
  'in_progress',
  'escalated',
  'resolved',
  'overdue'
);

create type public.model_status as enum (
  'draft',
  'validating',
  'active',
  'retired'
);

create type public.data_quality_status as enum (
  'pending',
  'validated',
  'rejected',
  'needs_review'
);

create type public.notification_channel as enum (
  'in_app',
  'email',
  'sms',
  'push'
);

create type public.notification_status as enum (
  'unread',
  'read',
  'dismissed'
);

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organization and identity
-- ---------------------------------------------------------------------------

create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  short_name text,
  contact_email text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ministries_code_not_blank check (btrim(code) <> ''),
  constraint ministries_name_not_blank check (btrim(name) <> ''),
  constraint ministries_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid references public.ministries(id) on delete set null,
  code text not null unique,
  name text not null unique,
  agency_type text,
  contact_email text,
  contact_phone text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_code_not_blank check (btrim(code) <> ''),
  constraint agencies_name_not_blank check (btrim(name) <> ''),
  constraint agencies_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'executive',
  ministry_id uuid references public.ministries(id) on delete set null,
  agency_id uuid references public.agencies(id) on delete set null,
  designation text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_preferences_object check (jsonb_typeof(preferences) = 'object')
);

create unique index profiles_email_lower_uidx on public.profiles (lower(email));
create index profiles_ministry_idx on public.profiles (ministry_id);
create index profiles_agency_idx on public.profiles (agency_id);
create index agencies_ministry_idx on public.agencies (ministry_id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@pending.local'),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    'executive'::public.app_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Project master and historical monitoring
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  name text not null,
  ministry_id uuid not null references public.ministries(id) on delete restrict,
  agency_id uuid references public.agencies(id) on delete set null,
  department text,
  sector text not null,
  project_type text,
  state_display text not null,
  states text[] not null default '{}'::text[],
  description text,
  status public.project_status not null default 'active',
  currency char(3) not null default 'INR',

  -- Latest certified snapshot retained for direct compatibility with the UI.
  approved_cost public.nonnegative_amount not null default 0,
  revised_cost public.nonnegative_amount not null default 0,
  expenditure public.nonnegative_amount not null default 0,
  physical_progress public.percentage not null default 0,
  planned_progress public.percentage not null default 0,
  financial_progress public.percentage not null default 0,
  original_completion_date date,
  revised_completion_date date,
  delay_days integer not null default 0,
  last_reported_at timestamptz,
  cost_breakdown jsonb not null default '{}'::jsonb,

  latitude numeric(9,6),
  longitude numeric(9,6),

  -- Source lineage and CUF ingestion compatibility.
  cuf_project_id text,
  source_system text not null default 'PRAGATI-X',
  source_record_id text,
  ingestion_batch_id uuid,
  data_quality_status public.data_quality_status not null default 'validated',
  schema_version integer not null default 1,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_code_not_blank check (btrim(project_code) <> ''),
  constraint projects_name_not_blank check (btrim(name) <> ''),
  constraint projects_sector_not_blank check (btrim(sector) <> ''),
  constraint projects_state_not_blank check (btrim(state_display) <> ''),
  constraint projects_currency_uppercase check (currency = upper(currency)),
  constraint projects_latitude_valid check (latitude is null or latitude between -90 and 90),
  constraint projects_longitude_valid check (longitude is null or longitude between -180 and 180),
  constraint projects_cost_breakdown_object check (jsonb_typeof(cost_breakdown) = 'object'),
  constraint projects_raw_payload_object check (jsonb_typeof(raw_payload) = 'object'),
  constraint projects_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint projects_schema_version_positive check (schema_version > 0),
  constraint projects_version_positive check (version > 0)
);

create index projects_ministry_idx on public.projects (ministry_id);
create index projects_agency_idx on public.projects (agency_id);
create index projects_sector_idx on public.projects (sector);
create index projects_status_idx on public.projects (status);
create index projects_last_reported_idx on public.projects (last_reported_at desc);
create index projects_states_gin_idx on public.projects using gin (states);
create index projects_source_lookup_idx on public.projects (source_system, source_record_id);
create unique index projects_cuf_project_uidx on public.projects (cuf_project_id)
  where cuf_project_id is not null;

create table public.project_monthly_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reporting_month date not null,

  approved_cost public.nonnegative_amount,
  revised_cost public.nonnegative_amount,
  expenditure public.nonnegative_amount,
  physical_progress public.percentage,
  planned_progress public.percentage,
  financial_progress public.percentage,
  original_completion_date date,
  revised_completion_date date,
  forecast_completion_date date,
  delay_days integer,

  milestones_total integer,
  milestones_completed integer,
  milestones_delayed integer,
  milestones_at_risk integer,
  milestone_snapshot jsonb not null default '[]'::jsonb,

  land_acquisition_target numeric(18,4),
  land_acquisition_completed numeric(18,4),
  land_acquisition_unit text,
  land_acquisition_progress public.percentage,
  clearance_status jsonb not null default '{}'::jsonb,
  contract_status text,
  issues text[] not null default '{}'::text[],
  remarks text,

  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  source_system text not null default 'PRAGATI-X',
  source_record_id text,
  ingestion_batch_id uuid,
  data_quality_status public.data_quality_status not null default 'validated',
  schema_version integer not null default 1,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint monthly_reporting_month_first_day
    check (reporting_month = date_trunc('month', reporting_month)::date),
  constraint monthly_milestone_counts_nonnegative check (
    coalesce(milestones_total, 0) >= 0 and
    coalesce(milestones_completed, 0) >= 0 and
    coalesce(milestones_delayed, 0) >= 0 and
    coalesce(milestones_at_risk, 0) >= 0
  ),
  constraint monthly_milestone_counts_bounded check (
    milestones_total is null or (
      coalesce(milestones_completed, 0) +
      coalesce(milestones_delayed, 0) +
      coalesce(milestones_at_risk, 0) <= milestones_total
    )
  ),
  constraint monthly_land_values_nonnegative check (
    coalesce(land_acquisition_target, 0) >= 0 and
    coalesce(land_acquisition_completed, 0) >= 0
  ),
  constraint monthly_milestone_snapshot_array check (jsonb_typeof(milestone_snapshot) = 'array'),
  constraint monthly_clearance_status_object check (jsonb_typeof(clearance_status) = 'object'),
  constraint monthly_raw_payload_object check (jsonb_typeof(raw_payload) = 'object'),
  constraint monthly_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint monthly_schema_version_positive check (schema_version > 0),
  unique (project_id, reporting_month, source_system)
);

create index project_monthly_updates_project_month_idx
  on public.project_monthly_updates (project_id, reporting_month desc);
create index project_monthly_updates_quality_idx
  on public.project_monthly_updates (data_quality_status, reporting_month desc);
create index project_monthly_updates_ingestion_batch_idx
  on public.project_monthly_updates (ingestion_batch_id)
  where ingestion_batch_id is not null;
create index project_monthly_updates_issues_gin_idx
  on public.project_monthly_updates using gin (issues);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_code text not null,
  name text not null,
  sequence_no integer not null default 0,
  planned_date date not null,
  forecast_date date,
  actual_date date,
  status public.milestone_status not null default 'on_track',
  delay_days integer,
  weight public.percentage,
  source_update_id uuid references public.project_monthly_updates(id) on delete set null,
  source_record_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestones_code_not_blank check (btrim(milestone_code) <> ''),
  constraint milestones_name_not_blank check (btrim(name) <> ''),
  constraint milestones_sequence_nonnegative check (sequence_no >= 0),
  constraint milestones_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (project_id, milestone_code)
);

create index milestones_project_status_idx on public.milestones (project_id, status);
create index milestones_planned_date_idx on public.milestones (planned_date);

create table public.project_cost_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  effective_date date not null,
  approved_cost public.nonnegative_amount,
  revised_cost public.nonnegative_amount,
  expenditure public.nonnegative_amount,
  estimated_at_completion public.nonnegative_amount,
  change_amount numeric(20,2),
  change_reason text,
  approval_reference text,
  currency char(3) not null default 'INR',
  source_update_id uuid references public.project_monthly_updates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_history_currency_uppercase check (currency = upper(currency)),
  constraint cost_history_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (project_id, effective_date, source_update_id)
);

create index project_cost_history_project_date_idx
  on public.project_cost_history (project_id, effective_date desc);

create table public.project_schedule_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  effective_date date not null,
  original_completion_date date,
  revised_completion_date date,
  forecast_completion_date date,
  delay_days integer,
  physical_progress public.percentage,
  planned_progress public.percentage,
  revision_reason text,
  approval_reference text,
  source_update_id uuid references public.project_monthly_updates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_history_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (project_id, effective_date, source_update_id)
);

create index project_schedule_history_project_date_idx
  on public.project_schedule_history (project_id, effective_date desc);

-- ---------------------------------------------------------------------------
-- Model registry, risks, and predictions
-- ---------------------------------------------------------------------------

create table public.model_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  model_type text not null,
  algorithm text,
  description text,
  status public.model_status not null default 'draft',
  artifact_uri text,
  artifact_checksum text,
  feature_schema jsonb not null default '{}'::jsonb,
  parameters jsonb not null default '{}'::jsonb,
  evaluation_metrics jsonb not null default '{}'::jsonb,
  training_data_version text,
  trained_at timestamptz,
  deployed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_versions_name_not_blank check (btrim(name) <> ''),
  constraint model_versions_version_not_blank check (btrim(version) <> ''),
  constraint model_versions_feature_schema_object check (jsonb_typeof(feature_schema) = 'object'),
  constraint model_versions_parameters_object check (jsonb_typeof(parameters) = 'object'),
  constraint model_versions_metrics_object check (jsonb_typeof(evaluation_metrics) = 'object'),
  unique (name, version)
);

create unique index model_versions_one_active_per_name_idx
  on public.model_versions (name) where status = 'active';

create table public.project_risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_version_id uuid references public.model_versions(id) on delete set null,
  source_update_id uuid references public.project_monthly_updates(id) on delete set null,
  assessed_at timestamptz not null default now(),
  assessment_period date,
  overall_score public.percentage not null,
  risk_level public.risk_level not null,
  cost_overrun_risk public.percentage,
  schedule_delay_risk public.percentage,
  implementation_risk public.percentage,
  progress_factor public.percentage,
  cost_factor public.percentage,
  schedule_factor public.percentage,
  milestone_factor public.percentage,
  expenditure_factor public.percentage,
  methodology text not null default 'deterministic',
  explanation text,
  input_snapshot jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_risks_input_snapshot_object check (jsonb_typeof(input_snapshot) = 'object')
);

create unique index project_risks_one_current_idx
  on public.project_risks (project_id) where is_current;
create index project_risks_project_assessed_idx
  on public.project_risks (project_id, assessed_at desc);
create index project_risks_level_score_idx
  on public.project_risks (risk_level, overall_score desc);
create index project_risks_model_idx on public.project_risks (model_version_id);

create table public.risk_drivers (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.project_risks(id) on delete cascade,
  driver_code text not null,
  name text not null,
  impact public.risk_impact not null,
  value public.percentage not null,
  weighted_contribution numeric(8,4),
  rank integer,
  description text,
  evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_drivers_code_not_blank check (btrim(driver_code) <> ''),
  constraint risk_drivers_name_not_blank check (btrim(name) <> ''),
  constraint risk_drivers_rank_positive check (rank is null or rank > 0),
  constraint risk_drivers_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint risk_drivers_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (risk_id, driver_code)
);

create index risk_drivers_risk_rank_idx on public.risk_drivers (risk_id, rank);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_version_id uuid not null references public.model_versions(id) on delete restrict,
  source_update_id uuid references public.project_monthly_updates(id) on delete set null,
  prediction_type text not null,
  horizon_months integer,
  target_date date,
  predicted_value numeric(20,6),
  predicted_class text,
  confidence public.percentage,
  lower_bound numeric(20,6),
  upper_bound numeric(20,6),
  output_payload jsonb not null default '{}'::jsonb,
  feature_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  valid_until timestamptz,
  actual_value numeric(20,6),
  actual_class text,
  evaluated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predictions_type_not_blank check (btrim(prediction_type) <> ''),
  constraint predictions_horizon_nonnegative check (horizon_months is null or horizon_months >= 0),
  constraint predictions_bounds_ordered check (
    lower_bound is null or upper_bound is null or lower_bound <= upper_bound
  ),
  constraint predictions_output_object check (jsonb_typeof(output_payload) = 'object'),
  constraint predictions_features_object check (jsonb_typeof(feature_snapshot) = 'object'),
  constraint predictions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index predictions_project_generated_idx
  on public.predictions (project_id, generated_at desc);
create index predictions_model_type_idx
  on public.predictions (model_version_id, prediction_type);
create index predictions_unevaluated_idx
  on public.predictions (target_date) where evaluated_at is null;

-- ---------------------------------------------------------------------------
-- Warning and intervention workflow
-- ---------------------------------------------------------------------------

create table public.warnings (
  id uuid primary key default gen_random_uuid(),
  warning_code text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  risk_id uuid references public.project_risks(id) on delete set null,
  severity public.warning_severity not null,
  status public.warning_status not null default 'new',
  alert_type text not null,
  title text not null,
  description text not null,
  trigger_rule text,
  source_type text not null default 'rule',
  source_reference text,
  deduplication_key text,
  evidence jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_to_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warnings_code_not_blank check (btrim(warning_code) <> ''),
  constraint warnings_title_not_blank check (btrim(title) <> ''),
  constraint warnings_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint warnings_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint warnings_resolution_consistent check (status <> 'resolved' or resolved_at is not null)
);

create index warnings_project_status_idx on public.warnings (project_id, status);
create index warnings_severity_detected_idx on public.warnings (severity, detected_at desc);
create index warnings_assigned_to_idx on public.warnings (assigned_to) where assigned_to is not null;
create unique index warnings_deduplication_uidx on public.warnings (deduplication_key)
  where deduplication_key is not null and status <> 'resolved';

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  intervention_code text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  warning_id uuid references public.warnings(id) on delete set null,
  ministry_id uuid references public.ministries(id) on delete set null,
  assigned_agency_id uuid references public.agencies(id) on delete set null,
  issue text not null,
  recommended_action text not null,
  priority public.intervention_priority not null,
  status public.intervention_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_to_name text,
  due_date date,
  opened_at date not null default current_date,
  resolved_at timestamptz,
  resolution_summary text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interventions_code_not_blank check (btrim(intervention_code) <> ''),
  constraint interventions_issue_not_blank check (btrim(issue) <> ''),
  constraint interventions_action_not_blank check (btrim(recommended_action) <> ''),
  constraint interventions_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint interventions_resolution_consistent check (status <> 'resolved' or resolved_at is not null)
);

create index interventions_project_status_idx on public.interventions (project_id, status);
create index interventions_priority_due_idx on public.interventions (priority, due_date);
create index interventions_assigned_to_idx on public.interventions (assigned_to) where assigned_to is not null;
create index interventions_open_due_idx on public.interventions (due_date)
  where status not in ('resolved');

create table public.intervention_updates (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  update_type text not null default 'note',
  status public.intervention_status,
  note text,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intervention_updates_type_not_blank check (btrim(update_type) <> ''),
  constraint intervention_updates_has_content check (note is not null or status is not null),
  constraint intervention_updates_previous_object check (jsonb_typeof(previous_values) = 'object'),
  constraint intervention_updates_new_object check (jsonb_typeof(new_values) = 'object'),
  constraint intervention_updates_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index intervention_updates_intervention_time_idx
  on public.intervention_updates (intervention_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Documents, audit, and notifications
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  warning_id uuid references public.warnings(id) on delete set null,
  intervention_id uuid references public.interventions(id) on delete set null,
  reporting_month date,
  document_type text not null,
  title text not null,
  description text,
  storage_bucket text not null default 'project-documents',
  storage_path text not null,
  original_file_name text not null,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  source_system text not null default 'PRAGATI-X',
  source_record_id text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_type_not_blank check (btrim(document_type) <> ''),
  constraint documents_title_not_blank check (btrim(title) <> ''),
  constraint documents_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint documents_size_nonnegative check (size_bytes is null or size_bytes >= 0),
  constraint documents_reporting_month_first_day check (
    reporting_month is null or reporting_month = date_trunc('month', reporting_month)::date
  ),
  constraint documents_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (storage_bucket, storage_path)
);

create index documents_project_idx on public.documents (project_id, created_at desc);
create index documents_warning_idx on public.documents (warning_id) where warning_id is not null;
create index documents_intervention_idx on public.documents (intervention_id) where intervention_id is not null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  table_name text,
  record_key text,
  old_values jsonb,
  new_values jsonb,
  request_id uuid,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (btrim(action) <> ''),
  constraint audit_logs_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_logs_old_values_object check (old_values is null or jsonb_typeof(old_values) = 'object'),
  constraint audit_logs_new_values_object check (new_values is null or jsonb_typeof(new_values) = 'object')
);

create index audit_logs_actor_time_idx on public.audit_logs (actor_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_project_time_idx on public.audit_logs (project_id, occurred_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  warning_id uuid references public.warnings(id) on delete cascade,
  intervention_id uuid references public.interventions(id) on delete cascade,
  notification_type text not null,
  channel public.notification_channel not null default 'in_app',
  status public.notification_status not null default 'unread',
  severity public.warning_severity,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_type_not_blank check (btrim(notification_type) <> ''),
  constraint notifications_title_not_blank check (btrim(title) <> ''),
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint notifications_read_consistent check (status <> 'read' or read_at is not null),
  constraint notifications_dismissed_consistent check (status <> 'dismissed' or dismissed_at is not null)
);

create index notifications_recipient_status_idx
  on public.notifications (recipient_id, status, created_at desc);
create index notifications_project_idx on public.notifications (project_id) where project_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'ministries', 'agencies', 'projects', 'project_monthly_updates',
    'milestones', 'project_cost_history', 'project_schedule_history',
    'project_risks', 'risk_drivers', 'predictions', 'warnings', 'interventions',
    'intervention_updates', 'documents', 'model_versions', 'audit_logs', 'notifications'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authorization helpers and Row Level Security
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'administrator'::public.app_role, false);
$$;

create or replace function public.can_manage_monitoring()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_app_role() in (
      'administrator'::public.app_role,
      'monitoring_officer'::public.app_role
    ),
    false
  );
$$;

create or replace function public.can_manage_models()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_app_role() in (
      'administrator'::public.app_role,
      'analyst'::public.app_role
    ),
    false
  );
$$;

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_manage_monitoring() from public;
revoke all on function public.can_manage_models() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_manage_monitoring() to authenticated;
grant execute on function public.can_manage_models() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'ministries', 'agencies', 'projects', 'project_monthly_updates',
    'milestones', 'project_cost_history', 'project_schedule_history',
    'project_risks', 'risk_drivers', 'predictions', 'warnings', 'interventions',
    'intervention_updates', 'documents', 'model_versions', 'audit_logs', 'notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

grant select on table
  public.ministries,
  public.agencies,
  public.projects,
  public.project_monthly_updates,
  public.milestones,
  public.project_cost_history,
  public.project_schedule_history,
  public.project_risks,
  public.risk_drivers,
  public.predictions,
  public.warnings,
  public.interventions,
  public.intervention_updates,
  public.documents,
  public.model_versions
to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, designation, phone, avatar_url, preferences) on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;
grant select, update (status, read_at, dismissed_at) on public.notifications to authenticated;

grant insert, update, delete on table
  public.ministries,
  public.agencies,
  public.projects,
  public.project_monthly_updates,
  public.milestones,
  public.project_cost_history,
  public.project_schedule_history,
  public.warnings,
  public.interventions,
  public.intervention_updates,
  public.documents
to authenticated;

grant insert, update, delete on table
  public.model_versions,
  public.project_risks,
  public.risk_drivers,
  public.predictions
to authenticated;

create policy profiles_select_own_or_admin
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ministries', 'agencies', 'projects', 'project_monthly_updates', 'milestones',
    'project_cost_history', 'project_schedule_history', 'project_risks',
    'risk_drivers', 'predictions', 'warnings', 'interventions',
    'intervention_updates', 'documents', 'model_versions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      table_name || '_authenticated_read',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ministries', 'agencies', 'projects', 'project_monthly_updates', 'milestones',
    'project_cost_history', 'project_schedule_history', 'warnings', 'interventions',
    'intervention_updates', 'documents'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_monitoring())',
      table_name || '_monitoring_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_monitoring()) with check (public.can_manage_monitoring())',
      table_name || '_monitoring_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      table_name || '_admin_delete',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'model_versions', 'project_risks', 'risk_drivers', 'predictions'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_models())',
      table_name || '_model_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_models()) with check (public.can_manage_models())',
      table_name || '_model_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      table_name || '_admin_delete',
      table_name
    );
  end loop;
end;
$$;

create policy audit_logs_admin_read
  on public.audit_logs for select to authenticated
  using (public.is_admin());

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy notifications_update_own
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- PostgREST reloads its schema cache after migration deployment.
notify pgrst, 'reload schema';

commit;
