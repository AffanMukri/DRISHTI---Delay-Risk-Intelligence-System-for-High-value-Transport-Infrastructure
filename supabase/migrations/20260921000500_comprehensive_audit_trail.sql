begin;

alter table public.audit_logs
  add column if not exists source text not null default 'database',
  add column if not exists request_reference text,
  add column if not exists import_reference text,
  add column if not exists actor_email text,
  add column if not exists actor_role text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists event_version integer not null default 1;

alter table public.audit_logs
  add constraint audit_logs_source_not_blank check (btrim(source) <> ''),
  add constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object'),
  add constraint audit_logs_event_version_positive check (event_version > 0);

create index if not exists audit_logs_action_time_idx
  on public.audit_logs (action, occurred_at desc);
create index if not exists audit_logs_source_time_idx
  on public.audit_logs (source, occurred_at desc);
create index if not exists audit_logs_request_reference_idx
  on public.audit_logs (request_reference) where request_reference is not null;
create index if not exists audit_logs_import_reference_idx
  on public.audit_logs (import_reference) where import_reference is not null;

comment on table public.audit_logs is
  'Append-only security and business audit trail. UPDATE and DELETE are rejected; secret-like JSON keys are recursively redacted.';
comment on column public.audit_logs.request_reference is
  'API correlation/request ID. This is text so caller-provided trace IDs remain representable.';
comment on column public.audit_logs.import_reference is
  'CUF batch or other ingestion reference associated with the audited action.';

create or replace function public.sanitize_audit_jsonb(value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb;
begin
  if value is null then
    return null;
  end if;
  if jsonb_typeof(value) = 'object' then
    select coalesce(jsonb_object_agg(
      entry.key,
      case
        when lower(entry.key) ~ '(password|passwd|authorization|cookie|token|secret|api[_-]?key|private[_-]?key|service[_-]?role)'
          then '"[REDACTED]"'::jsonb
        else public.sanitize_audit_jsonb(entry.value)
      end
    ), '{}'::jsonb)
    into result
    from jsonb_each(value) entry;
    return result;
  end if;
  if jsonb_typeof(value) = 'array' then
    select coalesce(jsonb_agg(public.sanitize_audit_jsonb(item.value)), '[]'::jsonb)
    into result
    from jsonb_array_elements(value) item;
    return result;
  end if;
  return value;
end;
$$;

revoke all on function public.sanitize_audit_jsonb(jsonb) from public;

create or replace function public.prepare_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  context_request text := nullif(current_setting('app.request_id', true), '');
  context_ip text := nullif(current_setting('app.client_ip', true), '');
begin
  new.actor_id := coalesce(new.actor_id, auth.uid());
  if new.actor_id is not null and (new.actor_email is null or new.actor_role is null) then
    select coalesce(new.actor_email, profile.email),
           coalesce(new.actor_role, profile.role::text)
      into new.actor_email, new.actor_role
    from public.profiles profile
    where profile.id = new.actor_id;
  end if;
  new.old_values := public.sanitize_audit_jsonb(new.old_values);
  new.new_values := public.sanitize_audit_jsonb(new.new_values);
  new.metadata := coalesce(public.sanitize_audit_jsonb(new.metadata), '{}'::jsonb);
  new.source := case
    when nullif(new.source, '') is not null and new.source <> 'database' then new.source
    else coalesce(nullif(current_setting('app.audit_source', true), ''), nullif(new.source, ''), 'database')
  end;
  new.request_reference := coalesce(new.request_reference, context_request);
  new.import_reference := coalesce(
    new.import_reference,
    nullif(current_setting('app.import_reference', true), '')
  );
  new.user_agent := coalesce(
    new.user_agent,
    nullif(left(current_setting('app.user_agent', true), 512), '')
  );
  if new.request_id is null and context_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    new.request_id := context_request::uuid;
  end if;
  if new.ip_address is null and context_ip is not null then
    begin
      new.ip_address := context_ip::inet;
    exception when invalid_text_representation then
      new.ip_address := null;
    end;
  end if;
  new.occurred_at := coalesce(new.occurred_at, now());
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := new.created_at;
  return new;
end;
$$;

revoke all on function public.prepare_audit_log() from public;

create or replace function public.reject_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Audit log entries are immutable' using errcode = '42501';
end;
$$;

revoke all on function public.reject_audit_log_mutation() from public;

drop trigger if exists audit_logs_prepare_insert on public.audit_logs;
create trigger audit_logs_prepare_insert
before insert on public.audit_logs
for each row execute function public.prepare_audit_log();

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function public.reject_audit_log_mutation();

revoke update, delete, truncate on public.audit_logs from authenticated;

create or replace function public.audit_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb;
  after_value jsonb;
  target_id uuid;
  target_code text;
begin
  if tg_op = 'DELETE' then
    target_id := old.id;
    target_code := old.project_code;
  else
    target_id := new.id;
    target_code := new.project_code;
  end if;
  before_value := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'raw_payload' end;
  after_value := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'raw_payload' end;
  if tg_op = 'UPDATE' and (before_value - 'updated_at') = (after_value - 'updated_at') then
    return new;
  end if;
  insert into public.audit_logs (
    project_id, action, entity_type, entity_id, table_name, record_key,
    old_values, new_values, source
  ) values (
    case when tg_op = 'DELETE' then null else target_id end,
    'project.' || lower(tg_op), 'project', target_id, 'projects', target_code,
    before_value, after_value, coalesce(nullif(current_setting('app.audit_source', true), ''), 'database_trigger')
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.audit_monthly_update_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb;
  after_value jsonb;
  target_id uuid;
  target_project uuid;
  batch_id uuid;
begin
  if tg_op = 'DELETE' then
    target_id := old.id;
    target_project := old.project_id;
    batch_id := old.ingestion_batch_id;
  else
    target_id := new.id;
    target_project := new.project_id;
    batch_id := new.ingestion_batch_id;
  end if;
  before_value := case when tg_op = 'INSERT' then null else to_jsonb(old) - 'raw_payload' end;
  after_value := case when tg_op = 'DELETE' then null else to_jsonb(new) - 'raw_payload' end;
  if tg_op = 'UPDATE' and (before_value - 'updated_at') = (after_value - 'updated_at') then
    return new;
  end if;
  insert into public.audit_logs (
    project_id, action, entity_type, entity_id, table_name, record_key,
    old_values, new_values, source, import_reference
  ) values (
    target_project, 'project_monthly_update.' || lower(tg_op), 'project_monthly_update',
    target_id, 'project_monthly_updates', target_id::text, before_value, after_value,
    coalesce(nullif(current_setting('app.audit_source', true), ''), 'database_trigger'),
    batch_id::text
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.audit_warning_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
  before_value jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_value jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' and (before_value - 'updated_at') = (after_value - 'updated_at') then
    return new;
  end if;
  action_name := case
    when tg_op = 'INSERT' then 'warning.created'
    when old.acknowledged_at is null and new.acknowledged_at is not null then 'warning.acknowledged'
    when old.status is distinct from new.status then 'warning.status_changed'
    when old.assigned_to is distinct from new.assigned_to then 'warning.assigned'
    else 'warning.updated'
  end;
  insert into public.audit_logs (
    project_id, action, entity_type, entity_id, table_name, record_key,
    old_values, new_values, source, import_reference
  ) values (
    new.project_id, action_name, 'warning', new.id, 'warnings', new.warning_code,
    before_value, after_value,
    case when coalesce(new.metadata->>'automated', 'false') = 'true'
      then 'automated_warning_engine'
      else coalesce(nullif(current_setting('app.audit_source', true), ''), 'database_trigger') end,
    nullif(current_setting('app.import_reference', true), '')
  );
  return new;
end;
$$;

create or replace function public.audit_prediction_execution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  model_name text;
  model_version text;
  data_version text;
  import_ref text;
begin
  data_version := nullif(new.feature_snapshot->>'data_version', '');
  select model.name, model.version
    into model_name, model_version
  from public.model_versions model where model.id = new.model_version_id;

  select coalesce(
           data_version,
           update_row.metadata->>'validation_evidence_version',
           'monthly-update:' || update_row.id::text || ':' || update_row.reporting_month::text
         ), update_row.ingestion_batch_id::text
    into data_version, import_ref
  from public.project_monthly_updates update_row
  where update_row.id = new.source_update_id;

  data_version := coalesce(data_version, 'feature-snapshot:' || md5(new.feature_snapshot::text));

  insert into public.audit_logs (
    project_id, action, entity_type, entity_id, table_name, record_key,
    new_values, source, import_reference, metadata
  ) values (
    new.project_id, 'prediction.executed', 'prediction', new.id, 'predictions', new.id::text,
    jsonb_build_object(
      'prediction_id', new.id,
      'prediction_type', new.prediction_type,
      'model_version_id', new.model_version_id,
      'model_name', model_name,
      'model_version', model_version,
      'input_data_version', data_version,
      'source_update_id', new.source_update_id,
      'generated_at', new.generated_at,
      'output', new.output_payload,
      'explanation_reference', jsonb_build_object(
        'prediction_id', new.id,
        'field', 'predictions.output_payload.explanation'
      )
    ),
    'ml_inference', coalesce(import_ref, nullif(current_setting('app.import_reference', true), '')),
    jsonb_build_object('synthetic', lower(coalesce(new.metadata->>'synthetic', 'false')) = 'true')
  );
  return new;
end;
$$;

create or replace function public.audit_project_child_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb;
  after_value jsonb;
  snapshot jsonb;
  target_id uuid;
  target_project uuid;
  entity_name text := tg_argv[0];
begin
  before_value := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_value := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  if tg_op = 'UPDATE' and (before_value - 'updated_at') = (after_value - 'updated_at') then
    return new;
  end if;
  snapshot := coalesce(after_value, before_value);
  target_id := (snapshot->>'id')::uuid;
  target_project := (snapshot->>'project_id')::uuid;
  insert into public.audit_logs (
    project_id, action, entity_type, entity_id, table_name, record_key,
    old_values, new_values, source, import_reference
  ) values (
    target_project, entity_name || '.' || lower(tg_op), entity_name,
    target_id, tg_table_name, target_id::text, before_value, after_value,
    coalesce(nullif(current_setting('app.audit_source', true), ''), 'database_trigger'),
    coalesce(
      nullif(current_setting('app.import_reference', true), ''),
      snapshot->'metadata'->>'cuf_import_batch_id'
    )
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.audit_model_version_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_value jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  snapshot jsonb := coalesce(after_value, before_value);
begin
  if tg_op = 'UPDATE' and (before_value - 'updated_at') = (after_value - 'updated_at') then
    return new;
  end if;
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, table_name, record_key,
    old_values, new_values, source
  ) values (
    coalesce(auth.uid(), nullif(snapshot->>'created_by', '')::uuid),
    'model_version.' || lower(tg_op),
    'model_version', (snapshot->>'id')::uuid, 'model_versions',
    concat(snapshot->>'name', ':', snapshot->>'version'), before_value, after_value,
    coalesce(nullif(current_setting('app.audit_source', true), ''), 'model_registry')
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_project_change() from public;
revoke all on function public.audit_monthly_update_change() from public;
revoke all on function public.audit_warning_change() from public;
revoke all on function public.audit_prediction_execution() from public;
revoke all on function public.audit_project_child_change() from public;
revoke all on function public.audit_model_version_change() from public;

drop trigger if exists projects_audit_change on public.projects;
create trigger projects_audit_change after insert or update or delete on public.projects
for each row execute function public.audit_project_change();

drop trigger if exists project_monthly_updates_audit_change on public.project_monthly_updates;
create trigger project_monthly_updates_audit_change after insert or update or delete on public.project_monthly_updates
for each row execute function public.audit_monthly_update_change();

drop trigger if exists warnings_audit_change on public.warnings;
create trigger warnings_audit_change after insert or update on public.warnings
for each row execute function public.audit_warning_change();

drop trigger if exists predictions_audit_execution on public.predictions;
create trigger predictions_audit_execution after insert on public.predictions
for each row execute function public.audit_prediction_execution();

drop trigger if exists milestones_audit_change on public.milestones;
create trigger milestones_audit_change after insert or update or delete on public.milestones
for each row execute function public.audit_project_child_change('milestone');

drop trigger if exists project_cost_history_audit_change on public.project_cost_history;
create trigger project_cost_history_audit_change after insert or update or delete on public.project_cost_history
for each row execute function public.audit_project_child_change('project_cost_history');

drop trigger if exists project_schedule_history_audit_change on public.project_schedule_history;
create trigger project_schedule_history_audit_change after insert or update or delete on public.project_schedule_history
for each row execute function public.audit_project_child_change('project_schedule_history');

drop trigger if exists project_risks_audit_change on public.project_risks;
create trigger project_risks_audit_change after insert or update or delete on public.project_risks
for each row execute function public.audit_project_child_change('project_risk');

drop trigger if exists model_versions_audit_change on public.model_versions;
create trigger model_versions_audit_change after insert or update or delete on public.model_versions
for each row execute function public.audit_model_version_change();

create or replace function public.record_security_audit_event(event_action text, event_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  audit_id uuid;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if event_action not in ('login_success', 'logout_requested') then
    raise exception 'Unsupported security audit event' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = actor and profile.is_active) then
    raise exception 'Active profile required' using errcode = '42501';
  end if;
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, table_name, record_key,
    new_values, source
  ) values (
    actor, 'security.' || event_action, 'security_session', actor,
    'auth.users', actor::text,
    jsonb_build_object('event', event_action, 'metadata', coalesce(event_metadata, '{}'::jsonb)),
    'frontend_auth'
  ) returning id into audit_id;
  return audit_id;
end;
$$;

revoke all on function public.record_security_audit_event(text, jsonb) from public;
grant execute on function public.record_security_audit_event(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
