-- Persistent intervention workflow, transition validation, history and audit.

begin;

alter table public.interventions
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_reason text,
  add column if not exists escalated_by uuid references public.profiles(id) on delete set null;

create unique index if not exists interventions_active_warning_uidx
  on public.interventions (warning_id)
  where warning_id is not null and status <> 'resolved';

create index if not exists interventions_status_due_idx
  on public.interventions (status, due_date)
  where status <> 'resolved';

-- Workflow history is append-only. All writes are produced by the audited
-- intervention trigger below, rather than by direct client table mutations.
drop policy if exists intervention_updates_monitoring_insert on public.intervention_updates;
drop policy if exists intervention_updates_monitoring_update on public.intervention_updates;
drop policy if exists intervention_updates_admin_delete on public.intervention_updates;

create or replace function public.validate_intervention_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.warning_id is not null and not exists (
    select 1 from public.warnings warning
    where warning.id = new.warning_id and warning.project_id = new.project_id
  ) then
    raise exception 'The originating warning must belong to the intervention project.' using errcode = '23514';
  end if;

  if new.assigned_to is not null and not exists (
    select 1 from public.profiles profile
    where profile.id = new.assigned_to and profile.is_active
  ) then
    raise exception 'The assigned officer profile is missing or inactive.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status = 'resolved' then
      raise exception 'Resolved interventions are terminal.' using errcode = '23514';
    end if;

    if not (
      (old.status = 'open' and new.status in ('assigned', 'in_progress', 'escalated', 'resolved', 'overdue')) or
      (old.status = 'assigned' and new.status in ('open', 'in_progress', 'escalated', 'resolved', 'overdue')) or
      (old.status = 'in_progress' and new.status in ('assigned', 'escalated', 'resolved', 'overdue')) or
      (old.status = 'escalated' and new.status in ('in_progress', 'resolved', 'overdue')) or
      (old.status = 'overdue' and new.status in ('assigned', 'in_progress', 'escalated', 'resolved'))
    ) then
      raise exception 'Invalid intervention status transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if new.status in ('assigned', 'in_progress', 'escalated')
     and new.assigned_to is null
     and nullif(btrim(coalesce(new.assigned_to_name, '')), '') is null then
    raise exception 'An assigned officer is required for status %.', new.status using errcode = '23514';
  end if;

  if new.status in ('in_progress', 'escalated') and new.due_date is null then
    raise exception 'A due date is required for status %.', new.status using errcode = '23514';
  end if;

  if new.status = 'escalated' then
    if nullif(btrim(coalesce(new.escalation_reason, '')), '') is null then
      raise exception 'An escalation reason is required.' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'escalated' then
      new.escalated_at := now();
      new.escalated_by := auth.uid();
    end if;
  end if;

  if new.status = 'resolved'
     and nullif(btrim(coalesce(new.resolution_summary, '')), '') is null
     and lower(coalesce(new.metadata->>'seed', 'false')) <> 'true' then
    raise exception 'Resolution notes are required.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists interventions_validate_workflow on public.interventions;
create trigger interventions_validate_workflow
before insert or update on public.interventions
for each row execute function public.validate_intervention_transition();

create or replace function public.record_intervention_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  event_type text;
  event_note text := nullif(current_setting('app.intervention_event_note', true), '');
  event_source text := coalesce(nullif(current_setting('app.intervention_event_source', true), ''), 'database');
  old_snapshot jsonb;
  new_snapshot jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    event_type := 'created';
    old_snapshot := '{}'::jsonb;
    event_note := coalesce(event_note, 'Intervention created.');
  else
    old_snapshot := to_jsonb(old);
    if (old_snapshot - 'updated_at') = (new_snapshot - 'updated_at') then
      return new;
    end if;
    event_type := case
      when old.status is distinct from new.status then
        case new.status
          when 'escalated' then 'escalated'
          when 'resolved' then 'resolved'
          when 'overdue' then 'overdue'
          else 'status_transition'
        end
      when old.assigned_to is distinct from new.assigned_to
        or old.assigned_to_name is distinct from new.assigned_to_name then 'assignment'
      when old.due_date is distinct from new.due_date then 'deadline'
      when old.priority is distinct from new.priority then 'priority'
      when old.recommended_action is distinct from new.recommended_action then 'action_updated'
      when old.notes is distinct from new.notes then 'remark'
      else 'updated'
    end;
    event_note := coalesce(
      event_note,
      case
        when new.status = 'escalated' and old.status is distinct from new.status then new.escalation_reason
        when new.status = 'resolved' and old.status is distinct from new.status then new.resolution_summary
        else 'Intervention updated.'
      end
    );
  end if;

  insert into public.intervention_updates (
    intervention_id, update_type, status, note, previous_values,
    new_values, metadata, created_by
  ) values (
    new.id, event_type, new.status, event_note, old_snapshot, new_snapshot,
    jsonb_build_object('source', event_source), actor
  );

  insert into public.audit_logs (
    actor_id, project_id, action, entity_type, entity_id,
    table_name, record_key, old_values, new_values
  ) values (
    actor, new.project_id, 'intervention.' || event_type, 'intervention', new.id,
    'interventions', new.intervention_code,
    case when tg_op = 'INSERT' then null else old_snapshot end,
    new_snapshot
  );

  return new;
end;
$$;

drop trigger if exists interventions_record_event on public.interventions;
create trigger interventions_record_event
after insert or update on public.interventions
for each row execute function public.record_intervention_event();

-- Existing seed/demo rows receive a baseline history entry without pretending
-- that the migration observed their original creation event.
insert into public.intervention_updates (
  intervention_id, update_type, status, note, previous_values, new_values, metadata
)
select intervention.id, 'baseline', intervention.status,
       'Baseline state captured when persistent workflow history was enabled.',
       '{}'::jsonb, to_jsonb(intervention), '{"source":"migration"}'::jsonb
from public.interventions intervention
where not exists (
  select 1 from public.intervention_updates update_row
  where update_row.intervention_id = intervention.id
);

create or replace function public.refresh_overdue_interventions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not public.can_view_interventions() then
    raise exception 'Intervention access is required.' using errcode = '42501';
  end if;

  perform set_config('app.intervention_event_source', 'overdue_engine', true);
  perform set_config(
    'app.intervention_event_note',
    'Deadline passed before the intervention was resolved.',
    true
  );

  update public.interventions
  set status = 'overdue'
  where due_date < current_date
    and status in ('open', 'assigned', 'in_progress', 'escalated');

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.list_intervention_officers()
returns table (
  id uuid,
  full_name text,
  email text,
  designation text,
  role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.full_name, profile.email, profile.designation,
         profile.role::text
  from public.profiles profile
  where public.can_view_interventions()
    and profile.is_active
  order by coalesce(profile.full_name, profile.email), profile.email;
$$;

revoke all on function public.validate_intervention_transition() from public;
revoke all on function public.record_intervention_event() from public;
revoke all on function public.refresh_overdue_interventions() from public;
revoke all on function public.list_intervention_officers() from public;
grant execute on function public.refresh_overdue_interventions() to authenticated;
grant execute on function public.list_intervention_officers() to authenticated;

commit;
