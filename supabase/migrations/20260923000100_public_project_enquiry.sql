-- Public project enquiry exposes an intentionally narrow, read-only contract.
-- Publishing is explicit through metadata.publicly_visible; seeded demo records
-- are visible so local/demo environments have representative public content.

create or replace view public.public_project_catalog
with (security_barrier = true)
as
select
  p.id as database_id,
  p.id,
  p.project_code,
  p.name,
  ministry.name as ministry,
  agency.name as implementing_agency,
  p.sector,
  p.project_type,
  p.state_display as state,
  p.description,
  p.status,
  p.currency,
  p.approved_cost,
  p.revised_cost,
  p.physical_progress,
  p.original_completion_date,
  p.revised_completion_date,
  p.last_reported_at
from public.projects p
join public.ministries ministry on ministry.id = p.ministry_id
left join public.agencies agency on agency.id = p.agency_id
where p.metadata ->> 'publicly_visible' = 'true'
   or p.metadata ->> 'seed' = 'true';

create or replace view public.public_project_milestones
with (security_barrier = true)
as
select
  milestone.project_id,
  milestone.name,
  milestone.planned_date,
  milestone.sequence_no
from public.milestones milestone
join public.projects project on project.id = milestone.project_id
where project.metadata ->> 'publicly_visible' = 'true'
   or project.metadata ->> 'seed' = 'true';

revoke all on public.public_project_catalog from public;
revoke all on public.public_project_milestones from public;
grant select on public.public_project_catalog to anon, authenticated;
grant select on public.public_project_milestones to anon, authenticated;

comment on view public.public_project_catalog is
  'Column-limited public project facts. Contains no risk, prediction, warning, intervention, expenditure, delay, evidence, or audit fields.';
comment on view public.public_project_milestones is
  'Public planned milestone timeline for explicitly published projects.';
