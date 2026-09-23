begin;

alter table public.milestones
  add column node_type text not null default 'milestone',
  add constraint milestones_node_type_valid check (node_type in ('milestone', 'package')),
  add constraint milestones_id_project_unique unique (id, project_id);

create table public.milestone_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  upstream_milestone_id uuid not null,
  downstream_milestone_id uuid not null,
  dependency_type text not null default 'finish_to_start',
  lag_days integer not null default 0,
  source_system text not null default 'PRAGATI-X',
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_dependencies_upstream_project_fk
    foreign key (upstream_milestone_id, project_id)
    references public.milestones(id, project_id) on delete cascade,
  constraint milestone_dependencies_downstream_project_fk
    foreign key (downstream_milestone_id, project_id)
    references public.milestones(id, project_id) on delete cascade,
  constraint milestone_dependencies_distinct_nodes
    check (upstream_milestone_id <> downstream_milestone_id),
  constraint milestone_dependencies_type_valid
    check (dependency_type in ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  constraint milestone_dependencies_lag_bounded check (lag_days between -3650 and 3650),
  constraint milestone_dependencies_source_not_blank check (btrim(source_system) <> ''),
  constraint milestone_dependencies_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (project_id, upstream_milestone_id, downstream_milestone_id, dependency_type)
);

create index milestone_dependencies_project_idx
  on public.milestone_dependencies (project_id, created_at);
create index milestone_dependencies_upstream_idx
  on public.milestone_dependencies (upstream_milestone_id);
create index milestone_dependencies_downstream_idx
  on public.milestone_dependencies (downstream_milestone_id);

comment on table public.milestone_dependencies is
  'Explicit user/import-defined milestone dependency edges. Edges support dependency-risk propagation analysis and do not assert deterministic causality.';

create or replace function public.can_manage_dependencies()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_role(array[
    'administrator'::public.app_role,
    'monitoring_officer'::public.app_role,
    'analyst'::public.app_role
  ]);
$$;

revoke all on function public.can_manage_dependencies() from public;
grant execute on function public.can_manage_dependencies() to authenticated;

create or replace function public.validate_milestone_dependency_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creates_cycle boolean;
begin
  if new.upstream_milestone_id = new.downstream_milestone_id then
    raise exception 'A milestone cannot depend on itself.' using errcode = '23514';
  end if;

  with recursive descendants(milestone_id) as (
    select dependency.downstream_milestone_id
    from public.milestone_dependencies dependency
    where dependency.project_id = new.project_id
      and dependency.upstream_milestone_id = new.downstream_milestone_id
      and dependency.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    union
    select dependency.downstream_milestone_id
    from public.milestone_dependencies dependency
    join descendants on descendants.milestone_id = dependency.upstream_milestone_id
    where dependency.project_id = new.project_id
      and dependency.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  select exists(
    select 1 from descendants where milestone_id = new.upstream_milestone_id
  ) into creates_cycle;

  if creates_cycle then
    raise exception 'This dependency would create a cycle in the milestone graph.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_milestone_dependency_cycle() from public;

create trigger milestone_dependencies_validate_cycle
before insert or update of project_id, upstream_milestone_id, downstream_milestone_id
on public.milestone_dependencies
for each row execute function public.validate_milestone_dependency_cycle();

create trigger milestone_dependencies_set_updated_at
before update on public.milestone_dependencies
for each row execute function public.set_updated_at();

create or replace function public.audit_milestone_dependency_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_value jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_value jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  snapshot jsonb := coalesce(after_value, before_value);
  audit_source text;
begin
  if tg_op = 'UPDATE' and (before_value - 'updated_at') = (after_value - 'updated_at') then
    return new;
  end if;
  audit_source := case
    when upper(coalesce(snapshot->>'source_system', '')) = 'MANUAL'
      then coalesce(nullif(current_setting('app.audit_source', true), ''), 'manual_dependency_definition')
    else 'dependency_import'
  end;
  insert into public.audit_logs (
    project_id, action, entity_type, entity_id, table_name, record_key,
    old_values, new_values, source, import_reference
  ) values (
    (snapshot->>'project_id')::uuid,
    'milestone_dependency.' || lower(tg_op),
    'milestone_dependency',
    (snapshot->>'id')::uuid,
    'milestone_dependencies',
    snapshot->>'id',
    before_value,
    after_value,
    audit_source,
    nullif(snapshot->>'source_reference', '')
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_milestone_dependency_change() from public;

create trigger milestone_dependencies_audit_change
after insert or update or delete on public.milestone_dependencies
for each row execute function public.audit_milestone_dependency_change();

alter table public.milestone_dependencies enable row level security;

grant select, insert, update, delete on public.milestone_dependencies to authenticated;

create policy milestone_dependencies_active_user_read
  on public.milestone_dependencies for select to authenticated
  using (public.current_app_role() is not null);

create policy milestone_dependencies_authorized_insert
  on public.milestone_dependencies for insert to authenticated
  with check (
    public.can_manage_dependencies()
    and created_by = (select auth.uid())
  );

create policy milestone_dependencies_authorized_update
  on public.milestone_dependencies for update to authenticated
  using (public.can_manage_dependencies())
  with check (
    public.can_manage_dependencies()
    and updated_by = (select auth.uid())
  );

create policy milestone_dependencies_authorized_delete
  on public.milestone_dependencies for delete to authenticated
  using (public.can_manage_dependencies());

notify pgrst, 'reload schema';

commit;
