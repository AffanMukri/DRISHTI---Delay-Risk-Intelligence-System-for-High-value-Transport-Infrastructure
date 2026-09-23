-- PRAGATI-X production authorization matrix
-- Frontend permission checks improve UX; these grants and policies are the
-- authoritative enforcement layer for every Data API request.

begin;

create or replace function public.has_app_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.is_active
      and profile.role = any(allowed_roles)
  );
$$;

create or replace function public.can_view_predictions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_role(array[
    'administrator'::public.app_role,
    'executive'::public.app_role,
    'analyst'::public.app_role
  ]);
$$;

create or replace function public.can_view_interventions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_role(array[
    'administrator'::public.app_role,
    'executive'::public.app_role,
    'monitoring_officer'::public.app_role
  ]);
$$;

create or replace function public.can_create_interventions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_interventions();
$$;

create or replace function public.can_upload_cuf()
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

create or replace function public.can_administer_users()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

-- Role/status changes are exposed only through this audited RPC. Keeping role
-- columns out of the authenticated UPDATE grant prevents self-promotion.
create or replace function public.admin_update_profile_access(
  p_user_id uuid,
  p_role public.app_role,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid())
     and (p_role <> 'administrator'::public.app_role or not p_is_active) then
    raise exception 'Administrators cannot remove their own administrative access.' using errcode = '22023';
  end if;

  select * into old_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  update public.profiles
  set role = p_role,
      is_active = p_is_active
  where id = p_user_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    table_name,
    record_key,
    old_values,
    new_values
  )
  values (
    (select auth.uid()),
    'update_profile_access',
    'profile',
    p_user_id,
    'profiles',
    p_user_id::text,
    jsonb_build_object('role', old_profile.role, 'is_active', old_profile.is_active),
    jsonb_build_object('role', p_role, 'is_active', p_is_active)
  );
end;
$$;

revoke all on function public.has_app_role(public.app_role[]) from public;
revoke all on function public.can_view_predictions() from public;
revoke all on function public.can_view_interventions() from public;
revoke all on function public.can_create_interventions() from public;
revoke all on function public.can_upload_cuf() from public;
revoke all on function public.can_administer_users() from public;
revoke all on function public.admin_update_profile_access(uuid, public.app_role, boolean) from public;

grant execute on function public.has_app_role(public.app_role[]) to authenticated;
grant execute on function public.can_view_predictions() to authenticated;
grant execute on function public.can_view_interventions() to authenticated;
grant execute on function public.can_create_interventions() to authenticated;
grant execute on function public.can_upload_cuf() to authenticated;
grant execute on function public.can_administer_users() to authenticated;
grant execute on function public.admin_update_profile_access(uuid, public.app_role, boolean) to authenticated;

-- Replace the foundation policies with the production role matrix.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'profiles', 'ministries', 'agencies', 'projects', 'project_monthly_updates',
        'milestones', 'project_cost_history', 'project_schedule_history',
        'project_risks', 'risk_drivers', 'predictions', 'warnings', 'interventions',
        'intervention_updates', 'documents', 'model_versions', 'audit_logs', 'notifications'
      ])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

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
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

-- All permanent users can read the common portfolio and analytical facts.
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
  public.warnings,
  public.documents
to authenticated;

-- RLS further limits these authenticated reads by application role.
grant select on table
  public.model_versions,
  public.predictions,
  public.interventions,
  public.intervention_updates
to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, designation, phone, avatar_url, preferences) on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (status, read_at, dismissed_at) on public.notifications to authenticated;

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
  public.documents,
  public.model_versions,
  public.project_risks,
  public.risk_drivers,
  public.predictions
to authenticated;

create policy profiles_select_own_or_admin
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()) and is_active);

-- Shared read-only portfolio facts.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ministries', 'agencies', 'projects', 'project_monthly_updates', 'milestones',
    'project_cost_history', 'project_schedule_history', 'project_risks',
    'risk_drivers', 'warnings', 'documents'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_app_role() is not null)',
      table_name || '_active_user_read',
      table_name
    );
  end loop;
end;
$$;

create policy model_versions_prediction_roles_read
  on public.model_versions for select to authenticated
  using (public.can_view_predictions());

create policy predictions_prediction_roles_read
  on public.predictions for select to authenticated
  using (public.can_view_predictions());

create policy interventions_authorized_roles_read
  on public.interventions for select to authenticated
  using (public.can_view_interventions());

create policy intervention_updates_authorized_roles_read
  on public.intervention_updates for select to authenticated
  using (public.can_view_interventions());

-- Organization and project master data are Administrator-managed.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['ministries', 'agencies', 'projects']
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
      table_name || '_admin_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
      table_name || '_admin_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      table_name || '_admin_delete', table_name
    );
  end loop;
end;
$$;

-- Certified monitoring facts can be managed by Monitoring Officers or Admins.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'project_monthly_updates', 'milestones', 'project_cost_history',
    'project_schedule_history', 'warnings'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_monitoring())',
      table_name || '_monitoring_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_monitoring()) with check (public.can_manage_monitoring())',
      table_name || '_monitoring_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      table_name || '_admin_delete', table_name
    );
  end loop;
end;
$$;

create policy interventions_authorized_roles_insert
  on public.interventions for insert to authenticated
  with check (
    public.can_create_interventions()
    and created_by = (select auth.uid())
  );

create policy interventions_monitoring_update
  on public.interventions for update to authenticated
  using (public.can_manage_monitoring())
  with check (public.can_manage_monitoring());

create policy interventions_admin_delete
  on public.interventions for delete to authenticated
  using (public.is_admin());

create policy intervention_updates_monitoring_insert
  on public.intervention_updates for insert to authenticated
  with check (
    public.can_manage_monitoring()
    and created_by = (select auth.uid())
  );

create policy intervention_updates_monitoring_update
  on public.intervention_updates for update to authenticated
  using (public.can_manage_monitoring())
  with check (public.can_manage_monitoring());

create policy intervention_updates_admin_delete
  on public.intervention_updates for delete to authenticated
  using (public.is_admin());

-- CUF and analytical uploads are permitted to Monitoring Officers, Analysts,
-- and Administrators. Users must attribute new uploads to themselves.
create policy documents_cuf_roles_insert
  on public.documents for insert to authenticated
  with check (
    public.can_upload_cuf()
    and uploaded_by = (select auth.uid())
  );

create policy documents_monitoring_update
  on public.documents for update to authenticated
  using (public.can_manage_monitoring())
  with check (public.can_manage_monitoring());

create policy documents_admin_delete
  on public.documents for delete to authenticated
  using (public.is_admin());

-- Model artifacts, computed risk records, and predictions are Analyst/Admin writes.
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
      table_name || '_analyst_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_models()) with check (public.can_manage_models())',
      table_name || '_analyst_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_admin())',
      table_name || '_admin_delete', table_name
    );
  end loop;
end;
$$;

create policy audit_logs_admin_read
  on public.audit_logs for select to authenticated
  using (public.is_admin());

create policy notifications_own_or_admin_read
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) or public.is_admin());

create policy notifications_own_or_admin_update
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) or public.is_admin())
  with check (recipient_id = (select auth.uid()) or public.is_admin());

create policy notifications_admin_delete
  on public.notifications for delete to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';

commit;
