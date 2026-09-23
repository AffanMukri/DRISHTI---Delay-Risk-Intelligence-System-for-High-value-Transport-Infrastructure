-- Supports chronological per-project risk trajectory reads and selecting the
-- newest persisted assessment when a reporting month was recalculated.
create index if not exists project_risks_project_period_assessed_idx
  on public.project_risks (project_id, assessment_period, assessed_at desc);
