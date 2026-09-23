-- Reporting-cycle comparison reads the newest snapshot per project/period and
-- warning lifecycle events inside the latest reporting month.
create index if not exists project_risks_period_project_assessed_idx
  on public.project_risks (assessment_period desc, project_id, assessed_at desc)
  where assessment_period is not null;

create index if not exists warnings_critical_first_detected_idx
  on public.warnings (first_detected_at desc)
  where severity = 'critical';

create index if not exists warnings_resolved_at_idx
  on public.warnings (resolved_at desc)
  where resolved_at is not null;
