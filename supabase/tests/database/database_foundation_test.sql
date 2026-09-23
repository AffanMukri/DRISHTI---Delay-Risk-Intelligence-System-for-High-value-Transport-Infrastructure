begin;

create extension if not exists pgtap with schema extensions;

select plan(103);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'ministries', 'ministries table exists');
select has_table('public', 'agencies', 'agencies table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'project_monthly_updates', 'project_monthly_updates table exists');
select has_table('public', 'milestones', 'milestones table exists');
select has_table('public', 'project_cost_history', 'project_cost_history table exists');
select has_table('public', 'project_schedule_history', 'project_schedule_history table exists');
select has_table('public', 'project_risks', 'project_risks table exists');
select has_table('public', 'risk_drivers', 'risk_drivers table exists');
select has_table('public', 'predictions', 'predictions table exists');
select has_table('public', 'warnings', 'warnings table exists');
select has_table('public', 'interventions', 'interventions table exists');
select has_table('public', 'intervention_updates', 'intervention_updates table exists');
select has_table('public', 'documents', 'documents table exists');
select has_table('public', 'model_versions', 'model_versions table exists');
select has_table('public', 'audit_logs', 'audit_logs table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'cuf_import_batches', 'CUF import batch staging table exists');
select has_table('public', 'cuf_import_rows', 'CUF row staging table exists');
select has_table('public', 'model_monitoring_runs', 'model monitoring run table exists');
select has_table('public', 'milestone_dependencies', 'explicit milestone dependency table exists');

select col_is_pk('public', 'profiles', 'id', 'profiles uses a UUID primary key');
select col_is_pk('public', 'ministries', 'id', 'ministries uses a UUID primary key');
select col_is_pk('public', 'agencies', 'id', 'agencies uses a UUID primary key');
select col_is_pk('public', 'projects', 'id', 'projects uses a UUID primary key');
select col_is_pk('public', 'project_monthly_updates', 'id', 'project_monthly_updates uses a UUID primary key');
select col_is_pk('public', 'milestones', 'id', 'milestones uses a UUID primary key');
select col_is_pk('public', 'project_cost_history', 'id', 'project_cost_history uses a UUID primary key');
select col_is_pk('public', 'project_schedule_history', 'id', 'project_schedule_history uses a UUID primary key');
select col_is_pk('public', 'project_risks', 'id', 'project_risks uses a UUID primary key');
select col_is_pk('public', 'risk_drivers', 'id', 'risk_drivers uses a UUID primary key');
select col_is_pk('public', 'predictions', 'id', 'predictions uses a UUID primary key');
select col_is_pk('public', 'warnings', 'id', 'warnings uses a UUID primary key');
select col_is_pk('public', 'interventions', 'id', 'interventions uses a UUID primary key');
select col_is_pk('public', 'intervention_updates', 'id', 'intervention_updates uses a UUID primary key');
select col_is_pk('public', 'documents', 'id', 'documents uses a UUID primary key');
select col_is_pk('public', 'model_versions', 'id', 'model_versions uses a UUID primary key');
select col_is_pk('public', 'audit_logs', 'id', 'audit_logs uses a UUID primary key');
select col_is_pk('public', 'notifications', 'id', 'notifications uses a UUID primary key');
select col_is_pk('public', 'cuf_import_batches', 'id', 'CUF batches use a UUID primary key');
select col_is_pk('public', 'cuf_import_rows', 'id', 'CUF rows use a UUID primary key');
select col_is_pk('public', 'model_monitoring_runs', 'id', 'model monitoring runs use a UUID primary key');
select col_is_pk('public', 'milestone_dependencies', 'id', 'milestone dependencies use a UUID primary key');

select col_type_is('public', 'profiles', 'id', 'uuid', 'profiles primary key is UUID');
select col_type_is('public', 'ministries', 'id', 'uuid', 'ministries primary key is UUID');
select col_type_is('public', 'agencies', 'id', 'uuid', 'agencies primary key is UUID');
select col_type_is('public', 'projects', 'id', 'uuid', 'projects primary key is UUID');
select col_type_is('public', 'project_monthly_updates', 'id', 'uuid', 'project_monthly_updates primary key is UUID');
select col_type_is('public', 'milestones', 'id', 'uuid', 'milestones primary key is UUID');
select col_type_is('public', 'project_cost_history', 'id', 'uuid', 'project_cost_history primary key is UUID');
select col_type_is('public', 'project_schedule_history', 'id', 'uuid', 'project_schedule_history primary key is UUID');
select col_type_is('public', 'project_risks', 'id', 'uuid', 'project_risks primary key is UUID');
select col_type_is('public', 'risk_drivers', 'id', 'uuid', 'risk_drivers primary key is UUID');
select col_type_is('public', 'predictions', 'id', 'uuid', 'predictions primary key is UUID');
select col_type_is('public', 'warnings', 'id', 'uuid', 'warnings primary key is UUID');
select col_type_is('public', 'interventions', 'id', 'uuid', 'interventions primary key is UUID');
select col_type_is('public', 'intervention_updates', 'id', 'uuid', 'intervention_updates primary key is UUID');
select col_type_is('public', 'documents', 'id', 'uuid', 'documents primary key is UUID');
select col_type_is('public', 'model_versions', 'id', 'uuid', 'model_versions primary key is UUID');
select col_type_is('public', 'audit_logs', 'id', 'uuid', 'audit_logs primary key is UUID');
select col_type_is('public', 'notifications', 'id', 'uuid', 'notifications primary key is UUID');
select col_type_is('public', 'cuf_import_batches', 'id', 'uuid', 'CUF batch primary key is UUID');
select col_type_is('public', 'cuf_import_rows', 'id', 'uuid', 'CUF row primary key is UUID');
select col_type_is('public', 'model_monitoring_runs', 'id', 'uuid', 'model monitoring run primary key is UUID');
select col_type_is('public', 'milestone_dependencies', 'id', 'uuid', 'milestone dependency primary key is UUID');

select has_column('public', 'cuf_import_batches', 'quality_score', 'CUF batch stores a quality score');
select has_column('public', 'cuf_import_rows', 'normalized_data', 'CUF staging retains normalized data separately');
select has_column('public', 'milestones', 'node_type', 'planning nodes distinguish milestones and packages');
select has_column('public', 'milestone_dependencies', 'upstream_milestone_id', 'dependency stores explicit upstream node');
select has_trigger('public', 'milestone_dependencies', 'milestone_dependencies_validate_cycle', 'dependency cycles are rejected');

select has_column('public', 'audit_logs', 'source', 'audit events retain their source');
select has_column('public', 'audit_logs', 'request_reference', 'audit events retain request correlation');
select has_column('public', 'audit_logs', 'import_reference', 'audit events retain import correlation');
select has_column('public', 'audit_logs', 'actor_email', 'audit events retain an actor email snapshot');
select has_column('public', 'audit_logs', 'actor_role', 'audit events retain an actor role snapshot');
select has_column('public', 'audit_logs', 'metadata', 'audit events support structured metadata');
select has_column('public', 'audit_logs', 'event_version', 'audit events are schema-versioned');
select has_trigger('public', 'audit_logs', 'audit_logs_prepare_insert', 'audit inserts are normalized and sanitized');
select has_trigger('public', 'audit_logs', 'audit_logs_append_only', 'audit updates and deletes are rejected');
select has_trigger('public', 'warnings', 'warnings_audit_change', 'warning workflow changes are audited');
select has_trigger('public', 'predictions', 'predictions_audit_execution', 'prediction executions are audited');
select is(
  public.sanitize_audit_jsonb('{"password":"secret","safe":"value"}'::jsonb)->>'password',
  '[REDACTED]',
  'secret-like fields are redacted before audit storage'
);

insert into public.audit_logs (action, entity_type, new_values)
values ('test.append_only', 'test_event', '{"safe":true}'::jsonb);

select throws_ok(
  $$update public.audit_logs set action = 'test.changed' where action = 'test.append_only'$$,
  '42501',
  'Audit log entries are immutable',
  'audit events cannot be updated'
);
select throws_ok(
  $$delete from public.audit_logs where action = 'test.append_only'$$,
  '42501',
  'Audit log entries are immutable',
  'audit events cannot be deleted'
);

select has_column('public', 'project_monthly_updates', 'reporting_month', 'monthly update has reporting_month');
select has_column('public', 'project_monthly_updates', 'approved_cost', 'monthly update has approved_cost');
select has_column('public', 'project_monthly_updates', 'revised_cost', 'monthly update has revised_cost');
select has_column('public', 'project_monthly_updates', 'expenditure', 'monthly update has expenditure');
select has_column('public', 'project_monthly_updates', 'physical_progress', 'monthly update has physical_progress');
select has_column('public', 'project_monthly_updates', 'planned_progress', 'monthly update has planned_progress');
select has_column('public', 'project_monthly_updates', 'original_completion_date', 'monthly update has original completion date');
select has_column('public', 'project_monthly_updates', 'revised_completion_date', 'monthly update has revised completion date');
select has_column('public', 'project_monthly_updates', 'milestone_snapshot', 'monthly update has milestone snapshot');
select has_column('public', 'project_monthly_updates', 'land_acquisition_progress', 'monthly update has land acquisition progress');
select has_column('public', 'project_monthly_updates', 'clearance_status', 'monthly update has clearance status');
select has_column('public', 'project_monthly_updates', 'contract_status', 'monthly update has contract status');
select has_column('public', 'project_monthly_updates', 'issues', 'monthly update has issues');
select has_column('public', 'project_monthly_updates', 'remarks', 'monthly update has remarks');

select results_eq(
  'select count(*) from public.projects where metadata ->> ''seed'' = ''true''',
  array[40::bigint],
  '40 frontend-compatible demo projects are seeded'
);

select results_eq(
  'select count(*) from public.warnings where metadata ->> ''seed'' = ''true''',
  array[12::bigint],
  '12 frontend-compatible demo warnings are seeded'
);

select results_eq(
  'select count(*) from public.interventions where metadata ->> ''seed'' = ''true''',
  array[12::bigint],
  '12 frontend-compatible demo interventions are seeded'
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
        'cuf_import_batches', 'cuf_import_rows', 'model_monitoring_runs',
        'milestone_dependencies'
      ])
      and relations.relrowsecurity
  $$,
  array[22::bigint],
  'RLS is enabled on every application table'
);

select * from finish();

rollback;
