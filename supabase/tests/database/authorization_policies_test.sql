begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

select results_eq(
  $$
    select count(*)
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name = any(array[
        'has_app_role', 'can_view_predictions', 'can_view_interventions',
        'can_create_interventions', 'can_upload_cuf', 'can_administer_users',
        'admin_update_profile_access'
      ])
  $$,
  array[7::bigint],
  'all authorization helper functions exist'
);

select has_function(
  'public',
  'refresh_projects_from_cuf_batch',
  array['uuid'],
  'scoped CUF snapshot refresh function exists'
);

select results_eq(
  $$
    select count(*)
    from information_schema.table_privileges
    where table_schema = 'public' and grantee = 'anon'
  $$,
  array[0::bigint],
  'anon has no direct application table privileges'
);

select results_eq(
  $$
    select count(*)
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  $$,
  array[0::bigint],
  'authenticated users cannot directly update profile roles'
);

select results_eq(
  $$
    select count(*)
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_active'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  $$,
  array[0::bigint],
  'authenticated users cannot directly enable or disable profiles'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own_or_admin'$$,
  array[1::bigint],
  'profiles own-or-admin read policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'$$,
  array[1::bigint],
  'profiles self-service update policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'interventions' and policyname = 'interventions_authorized_roles_read'$$,
  array[1::bigint],
  'intervention role read policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'interventions' and policyname = 'interventions_authorized_roles_insert'$$,
  array[1::bigint],
  'Executive/Monitoring/Admin intervention insert policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'interventions' and policyname = 'interventions_monitoring_update'$$,
  array[1::bigint],
  'Monitoring/Admin intervention update policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'predictions' and policyname = 'predictions_prediction_roles_read'$$,
  array[1::bigint],
  'Executive/Analyst/Admin prediction read policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'predictions' and policyname = 'predictions_analyst_insert'$$,
  array[1::bigint],
  'Analyst/Admin prediction insert policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_cuf_roles_insert'$$,
  array[1::bigint],
  'Monitoring/Analyst/Admin CUF document insert policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'project_monthly_updates' and policyname = 'project_monthly_updates_monitoring_insert'$$,
  array[1::bigint],
  'Monitoring/Admin project update insert policy exists'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_admin_update'$$,
  array[1::bigint],
  'project master updates are Administrator-only'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_admin_read'$$,
  array[1::bigint],
  'audit logs are Administrator-only'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'cuf_import_batches' and policyname = 'cuf_batches_upload_insert'$$,
  array[1::bigint],
  'authorized CUF roles can create their own validation batches'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'cuf_import_rows' and policyname = 'cuf_rows_upload_insert'$$,
  array[1::bigint],
  'authorized CUF roles can stage rows in their own batches'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'cuf_import_rows' and policyname = 'cuf_rows_monitoring_update'$$,
  array[1::bigint],
  'only Monitoring Officers and Administrators can mark staged rows imported'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_cuf_insert'$$,
  array[1::bigint],
  'CUF actions can append actor-bound audit records'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'model_monitoring_runs' and policyname = 'model_monitoring_runs_admin_read'$$,
  array[1::bigint],
  'model monitoring reports are Administrator-readable only'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'model_monitoring_runs' and policyname = 'model_monitoring_runs_admin_insert'$$,
  array[1::bigint],
  'only Administrators can persist attributed monitoring reports'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_model_monitoring_insert'$$,
  array[1::bigint],
  'model monitoring actions append constrained audit records'
);

select results_eq(
  $$select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_own_or_admin_read'$$,
  array[1::bigint],
  'notifications use recipient-or-Administrator reads'
);

select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public' and 'anon' = any(roles)
  $$,
  array[0::bigint],
  'no application policy targets anon'
);

select results_eq(
  $$
    select count(*)
    from pg_class relations
    join pg_namespace namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'public'
      and relations.relname = any(array[
        'profiles', 'ministries', 'agencies', 'projects', 'project_monthly_updates',
        'milestones', 'project_cost_history', 'project_schedule_history',
        'project_risks', 'risk_drivers', 'predictions', 'warnings', 'interventions',
        'intervention_updates', 'documents', 'model_versions', 'audit_logs', 'notifications',
        'cuf_import_batches', 'cuf_import_rows', 'model_monitoring_runs'
      ])
      and relations.relrowsecurity
  $$,
  array[21::bigint],
  'RLS remains enabled on every application table'
);

select * from finish();

rollback;
