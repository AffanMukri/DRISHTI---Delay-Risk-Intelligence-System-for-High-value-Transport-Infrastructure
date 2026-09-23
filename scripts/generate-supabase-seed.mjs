import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();

function compile(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function evaluate(code, requireFn) {
  const moduleObject = { exports: {} };
  new Function('module', 'exports', 'require', code)(moduleObject, moduleObject.exports, requireFn);
  return moduleObject.exports;
}

const riskModule = evaluate(compile('src/utils/riskCalculations.ts'), () => ({}));
const projectModule = evaluate(
  compile('src/data/projects.ts'),
  id => id.includes('riskCalculations') ? riskModule : {},
);
const warningModule = evaluate(compile('src/data/warnings.ts'), () => ({}));

const projects = projectModule.PROJECTS;
const warnings = warningModule.WARNINGS;
const interventions = warningModule.INTERVENTIONS;

const quote = value => value === null || value === undefined
  ? 'null'
  : `'${String(value).replaceAll("'", "''")}'`;
const date = value => value ? `${quote(value)}::date` : 'null';
const timestamp = value => value ? `${quote(`${value}T00:00:00Z`)}::timestamptz` : 'null';
const json = value => `${quote(JSON.stringify(value ?? {}))}::jsonb`;
const number = value => value === null || value === undefined ? 'null' : String(value);
const textArray = values => values.length
  ? `array[${values.map(quote).join(', ')}]::text[]`
  : `'{}'::text[]`;
const enumValue = value => value.toLowerCase().replaceAll(' ', '_');
const monthStart = value => `${value.slice(0, 7)}-01`;
const slug = value => value
  .toLowerCase()
  .replaceAll('–', '-')
  .replaceAll('—', '-')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const ministryNames = [...new Set(projects.map(project => project.ministry))].sort();
const ministryCodes = new Map(ministryNames.map((name, index) => [name, `MIN-${String(index + 1).padStart(3, '0')}`]));

const agencyRows = [...new Set(projects.map(project => project.implementingAgency))]
  .sort()
  .map((name, index) => {
    const project = projects.find(item => item.implementingAgency === name);
    return {
      code: `AGY-${String(index + 1).padStart(3, '0')}`,
      name,
      ministry: project.ministry,
    };
  });

const warningTitlesByProject = new Map();
for (const warning of warnings) {
  const current = warningTitlesByProject.get(warning.projectId) ?? [];
  current.push(warning.title);
  warningTitlesByProject.set(warning.projectId, current);
}

const sql = [];
sql.push(`-- Generated from src/data/projects.ts and src/data/warnings.ts.
-- Run: npm run db:seed:generate
-- This file contains synthetic demonstration data only.

begin;

set local statement_timeout = '120s';
`);

sql.push(`insert into public.ministries (code, name, metadata)
values
${ministryNames.map(name => `  (${quote(ministryCodes.get(name))}, ${quote(name)}, '{"seed":true}'::jsonb)`).join(',\n')}
on conflict (code) do update set
  name = excluded.name,
  metadata = public.ministries.metadata || excluded.metadata;
`);

sql.push(`insert into public.agencies (code, name, ministry_id, metadata)
select values_table.code, values_table.name, ministries.id, '{"seed":true}'::jsonb
from (values
${agencyRows.map(row => `  (${quote(row.code)}, ${quote(row.name)}, ${quote(row.ministry)})`).join(',\n')}
) as values_table(code, name, ministry_name)
join public.ministries on ministries.name = values_table.ministry_name
on conflict (code) do update set
  name = excluded.name,
  ministry_id = excluded.ministry_id,
  metadata = public.agencies.metadata || excluded.metadata;
`);

sql.push(`insert into public.projects (
  project_code, name, ministry_id, agency_id, department, sector, project_type,
  state_display, states, description, status, approved_cost, revised_cost,
  expenditure, physical_progress, planned_progress, financial_progress,
  original_completion_date, revised_completion_date, delay_days, last_reported_at,
  cost_breakdown, latitude, longitude, source_system, source_record_id,
  data_quality_status, raw_payload, metadata
)
select
  values_table.project_code,
  values_table.name,
  ministries.id,
  agencies.id,
  values_table.department,
  values_table.sector,
  values_table.project_type,
  values_table.state_display,
  values_table.states,
  values_table.description,
  values_table.status::public.project_status,
  values_table.approved_cost,
  values_table.revised_cost,
  values_table.expenditure,
  values_table.physical_progress,
  values_table.planned_progress,
  values_table.financial_progress,
  values_table.original_completion_date,
  values_table.revised_completion_date,
  values_table.delay_days,
  values_table.last_reported_at,
  values_table.cost_breakdown,
  values_table.latitude,
  values_table.longitude,
  'PRAGATI-X-DEMO',
  values_table.project_code,
  'validated'::public.data_quality_status,
  values_table.raw_payload,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${projects.map(project => `  (
    ${quote(project.id)}, ${quote(project.name)}, ${quote(project.ministry)}, ${quote(project.implementingAgency)},
    ${quote(project.department)}, ${quote(project.sector)}, ${quote(project.projectType)},
    ${quote(project.state)}, ${textArray(project.state.split(' / ').map(value => value.trim()))},
    ${quote(project.description)}, ${quote(enumValue(project.status))},
    ${number(project.approvedCost)}, ${number(project.revisedCost)}, ${number(project.expenditure)},
    ${number(project.physicalProgress)}, ${number(project.expectedProgress)}, ${number(project.financialProgress)},
    ${date(project.originalCompletionDate)}, ${date(project.revisedCompletionDate)}, ${number(project.delayDays)},
    ${timestamp(project.lastUpdated)}, ${json(project.costBreakdown)}, ${number(project.latitude)}, ${number(project.longitude)},
    ${json({ legacyProjectId: project.id, legacyLastUpdated: project.lastUpdated })}
  )`).join(',\n')}
) as values_table(
  project_code, name, ministry_name, agency_name, department, sector, project_type,
  state_display, states, description, status, approved_cost, revised_cost,
  expenditure, physical_progress, planned_progress, financial_progress,
  original_completion_date, revised_completion_date, delay_days, last_reported_at,
  cost_breakdown, latitude, longitude, raw_payload
)
join public.ministries on ministries.name = values_table.ministry_name
left join public.agencies on agencies.name = values_table.agency_name
on conflict (project_code) do update set
  name = excluded.name,
  ministry_id = excluded.ministry_id,
  agency_id = excluded.agency_id,
  department = excluded.department,
  sector = excluded.sector,
  project_type = excluded.project_type,
  state_display = excluded.state_display,
  states = excluded.states,
  description = excluded.description,
  status = excluded.status,
  approved_cost = excluded.approved_cost,
  revised_cost = excluded.revised_cost,
  expenditure = excluded.expenditure,
  physical_progress = excluded.physical_progress,
  planned_progress = excluded.planned_progress,
  financial_progress = excluded.financial_progress,
  original_completion_date = excluded.original_completion_date,
  revised_completion_date = excluded.revised_completion_date,
  delay_days = excluded.delay_days,
  last_reported_at = excluded.last_reported_at,
  cost_breakdown = excluded.cost_breakdown,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  raw_payload = excluded.raw_payload;
`);

sql.push(`insert into public.project_monthly_updates (
  project_id, reporting_month, approved_cost, revised_cost, expenditure,
  physical_progress, planned_progress, financial_progress,
  original_completion_date, revised_completion_date, forecast_completion_date,
  delay_days, milestones_total, milestones_completed, milestones_delayed,
  milestones_at_risk, milestone_snapshot, clearance_status, contract_status,
  issues, remarks, submitted_at, source_system, source_record_id,
  data_quality_status, raw_payload, metadata
)
select
  projects.id,
  values_table.reporting_month,
  values_table.approved_cost,
  values_table.revised_cost,
  values_table.expenditure,
  values_table.physical_progress,
  values_table.planned_progress,
  values_table.financial_progress,
  values_table.original_completion_date,
  values_table.revised_completion_date,
  values_table.revised_completion_date,
  values_table.delay_days,
  values_table.milestones_total,
  values_table.milestones_completed,
  values_table.milestones_delayed,
  values_table.milestones_at_risk,
  values_table.milestone_snapshot,
  '{}'::jsonb,
  values_table.contract_status,
  values_table.issues,
  'Seeded from the frontend synthetic monitoring snapshot.',
  values_table.submitted_at,
  'PRAGATI-X-DEMO',
  values_table.source_record_id,
  'validated'::public.data_quality_status,
  values_table.raw_payload,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${projects.map(project => {
    const milestones = project.milestones;
    return `  (
    ${quote(project.id)}, ${date(monthStart(project.lastUpdated))},
    ${number(project.approvedCost)}, ${number(project.revisedCost)}, ${number(project.expenditure)},
    ${number(project.physicalProgress)}, ${number(project.expectedProgress)}, ${number(project.financialProgress)},
    ${date(project.originalCompletionDate)}, ${date(project.revisedCompletionDate)}, ${number(project.delayDays)},
    ${milestones.length}, ${milestones.filter(item => item.status === 'Completed').length},
    ${milestones.filter(item => item.status === 'Delayed').length},
    ${milestones.filter(item => item.status === 'At Risk').length},
    ${json(milestones)}, ${quote(enumValue(project.status))},
    ${textArray(warningTitlesByProject.get(project.id) ?? [])}, ${timestamp(project.lastUpdated)},
    ${quote(`${project.id}:${project.lastUpdated.slice(0, 7)}`)},
    ${json({ projectId: project.id, reportingMonth: monthStart(project.lastUpdated) })}
  )`;
  }).join(',\n')}
) as values_table(
  project_code, reporting_month, approved_cost, revised_cost, expenditure,
  physical_progress, planned_progress, financial_progress, original_completion_date,
  revised_completion_date, delay_days, milestones_total, milestones_completed,
  milestones_delayed, milestones_at_risk, milestone_snapshot, contract_status,
  issues, submitted_at, source_record_id, raw_payload
)
join public.projects on projects.project_code = values_table.project_code
on conflict (project_id, reporting_month, source_system) do update set
  approved_cost = excluded.approved_cost,
  revised_cost = excluded.revised_cost,
  expenditure = excluded.expenditure,
  physical_progress = excluded.physical_progress,
  planned_progress = excluded.planned_progress,
  financial_progress = excluded.financial_progress,
  revised_completion_date = excluded.revised_completion_date,
  forecast_completion_date = excluded.forecast_completion_date,
  delay_days = excluded.delay_days,
  milestone_snapshot = excluded.milestone_snapshot,
  issues = excluded.issues,
  submitted_at = excluded.submitted_at,
  raw_payload = excluded.raw_payload;
`);

const milestoneRows = projects.flatMap(project => project.milestones.map((milestone, index) => ({
  projectCode: project.id,
  milestone,
  sequence: index + 1,
})));

sql.push(`insert into public.milestones (
  project_id, milestone_code, name, sequence_no, planned_date, actual_date,
  status, delay_days, source_update_id, source_record_id, metadata
)
select
  projects.id,
  values_table.milestone_code,
  values_table.name,
  values_table.sequence_no,
  values_table.planned_date,
  values_table.actual_date,
  values_table.status::public.milestone_status,
  values_table.delay_days,
  monthly_updates.id,
  values_table.source_record_id,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${milestoneRows.map(({ projectCode, milestone, sequence }) => `  (
    ${quote(projectCode)}, ${quote(milestone.id)}, ${quote(milestone.name)}, ${sequence},
    ${date(milestone.plannedDate)}, ${date(milestone.actualDate)},
    ${quote(enumValue(milestone.status))}, ${number(milestone.delayDays)},
    ${quote(`${projectCode}:${milestone.id}`)}
  )`).join(',\n')}
) as values_table(
  project_code, milestone_code, name, sequence_no, planned_date, actual_date,
  status, delay_days, source_record_id
)
join public.projects on projects.project_code = values_table.project_code
left join lateral (
  select updates.id
  from public.project_monthly_updates updates
  where updates.project_id = projects.id
  order by updates.reporting_month desc
  limit 1
) monthly_updates on true
on conflict (project_id, milestone_code) do update set
  name = excluded.name,
  sequence_no = excluded.sequence_no,
  planned_date = excluded.planned_date,
  actual_date = excluded.actual_date,
  status = excluded.status,
  delay_days = excluded.delay_days,
  source_update_id = excluded.source_update_id;
`);

sql.push(`insert into public.project_cost_history (
  project_id, effective_date, approved_cost, revised_cost, expenditure,
  estimated_at_completion, change_amount, change_reason, source_update_id, metadata
)
select
  projects.id,
  values_table.effective_date,
  values_table.approved_cost,
  values_table.revised_cost,
  values_table.expenditure,
  values_table.revised_cost,
  values_table.revised_cost - values_table.approved_cost,
  'Initial synthetic portfolio snapshot',
  updates.id,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${projects.map(project => `  (${quote(project.id)}, ${date(project.lastUpdated)}, ${number(project.approvedCost)}, ${number(project.revisedCost)}, ${number(project.expenditure)})`).join(',\n')}
) as values_table(project_code, effective_date, approved_cost, revised_cost, expenditure)
join public.projects on projects.project_code = values_table.project_code
left join public.project_monthly_updates updates
  on updates.project_id = projects.id
  and updates.reporting_month = date_trunc('month', values_table.effective_date)::date
where not exists (
  select 1 from public.project_cost_history existing
  where existing.project_id = projects.id and existing.effective_date = values_table.effective_date
);
`);

sql.push(`insert into public.project_schedule_history (
  project_id, effective_date, original_completion_date, revised_completion_date,
  forecast_completion_date, delay_days, physical_progress, planned_progress,
  revision_reason, source_update_id, metadata
)
select
  projects.id,
  values_table.effective_date,
  values_table.original_completion_date,
  values_table.revised_completion_date,
  values_table.revised_completion_date,
  values_table.delay_days,
  values_table.physical_progress,
  values_table.planned_progress,
  'Initial synthetic portfolio snapshot',
  updates.id,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${projects.map(project => `  (
    ${quote(project.id)}, ${date(project.lastUpdated)}, ${date(project.originalCompletionDate)},
    ${date(project.revisedCompletionDate)}, ${number(project.delayDays)},
    ${number(project.physicalProgress)}, ${number(project.expectedProgress)}
  )`).join(',\n')}
) as values_table(
  project_code, effective_date, original_completion_date, revised_completion_date,
  delay_days, physical_progress, planned_progress
)
join public.projects on projects.project_code = values_table.project_code
left join public.project_monthly_updates updates
  on updates.project_id = projects.id
  and updates.reporting_month = date_trunc('month', values_table.effective_date)::date
where not exists (
  select 1 from public.project_schedule_history existing
  where existing.project_id = projects.id and existing.effective_date = values_table.effective_date
);
`);

sql.push(`insert into public.model_versions (
  name, version, model_type, algorithm, description, status,
  feature_schema, parameters, evaluation_metrics, training_data_version,
  trained_at, deployed_at
)
values (
  'pragati_x_deterministic_risk',
  '1.0.0',
  'risk_scoring',
  'weighted_arithmetic',
  'Frontend-compatible deterministic demonstration formula. Not a production ML model.',
  'active',
  ${json({
    progressFactor: 'number:0-100',
    costFactor: 'number:0-100',
    scheduleFactor: 'number:0-100',
    milestoneFactor: 'number:0-100',
    expenditureFactor: 'number:0-100',
  })},
  ${json({ progress: 0.25, cost: 0.25, schedule: 0.25, milestone: 0.15, expenditure: 0.10 })},
  '{}',
  'synthetic-demo-v1',
  '2026-04-30T00:00:00Z',
  '2026-04-30T00:00:00Z'
)
on conflict (name, version) do update set
  description = excluded.description,
  feature_schema = excluded.feature_schema,
  parameters = excluded.parameters,
  evaluation_metrics = excluded.evaluation_metrics;
`);

sql.push(`insert into public.project_risks (
  project_id, model_version_id, source_update_id, assessed_at, assessment_period,
  overall_score, risk_level, cost_overrun_risk, schedule_delay_risk,
  implementation_risk, progress_factor, cost_factor, schedule_factor,
  milestone_factor, expenditure_factor, methodology, explanation,
  input_snapshot, is_current
)
select
  projects.id,
  model_versions.id,
  updates.id,
  values_table.assessed_at,
  values_table.assessment_period,
  values_table.overall_score,
  values_table.risk_level::public.risk_level,
  values_table.cost_overrun_risk,
  values_table.schedule_delay_risk,
  values_table.implementation_risk,
  values_table.progress_factor,
  values_table.cost_factor,
  values_table.schedule_factor,
  values_table.milestone_factor,
  values_table.expenditure_factor,
  'deterministic_frontend_v1',
  'Transparent weighted score seeded from the existing PRAGATI-X demonstration engine.',
  values_table.input_snapshot,
  true
from (values
${projects.map(project => {
    const risk = project.riskAssessment;
    return `  (
    ${quote(project.id)}, ${timestamp(project.lastUpdated)}, ${date(monthStart(project.lastUpdated))},
    ${number(risk.overallScore)}, ${quote(enumValue(risk.riskLevel))},
    ${number(risk.costOverrunRisk)}, ${number(risk.scheduleDelayRisk)}, ${number(risk.implementationRisk)},
    ${number(risk.progressFactor)}, ${number(risk.costFactor)}, ${number(risk.scheduleFactor)},
    ${number(risk.milestoneFactor)}, ${number(risk.expenditureFactor)},
    ${json({
      approvedCost: project.approvedCost,
      revisedCost: project.revisedCost,
      physicalProgress: project.physicalProgress,
      plannedProgress: project.expectedProgress,
      financialProgress: project.financialProgress,
      delayDays: project.delayDays,
    })}
  )`;
  }).join(',\n')}
) as values_table(
  project_code, assessed_at, assessment_period, overall_score, risk_level,
  cost_overrun_risk, schedule_delay_risk, implementation_risk, progress_factor,
  cost_factor, schedule_factor, milestone_factor, expenditure_factor, input_snapshot
)
join public.projects on projects.project_code = values_table.project_code
join public.model_versions on model_versions.name = 'pragati_x_deterministic_risk'
  and model_versions.version = '1.0.0'
left join public.project_monthly_updates updates
  on updates.project_id = projects.id
  and updates.reporting_month = values_table.assessment_period
where not exists (
  select 1 from public.project_risks existing
  where existing.project_id = projects.id and existing.is_current
);
`);

const driverWeights = {
  'Progress Variance': 0.25,
  'Cost Escalation': 0.25,
  'Schedule Delay': 0.25,
  'Milestone Slippage': 0.15,
  'Expenditure–Progress Mismatch': 0.10,
};
const driverRows = projects.flatMap(project => project.riskAssessment.drivers.map((driver, index) => ({
  projectCode: project.id,
  driver,
  rank: index + 1,
  weight: driverWeights[driver.name] ?? 0,
})));

sql.push(`insert into public.risk_drivers (
  risk_id, driver_code, name, impact, value, weighted_contribution,
  rank, description, evidence, metadata
)
select
  risks.id,
  values_table.driver_code,
  values_table.name,
  values_table.impact::public.risk_impact,
  values_table.value,
  values_table.weighted_contribution,
  values_table.rank,
  values_table.description,
  '[]'::jsonb,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${driverRows.map(({ projectCode, driver, rank, weight }) => `  (
    ${quote(projectCode)}, ${quote(slug(driver.name))}, ${quote(driver.name)},
    ${quote(enumValue(driver.impact))}, ${number(driver.value)},
    ${number(Math.round(driver.value * weight * 10000) / 10000)}, ${rank}, ${quote(driver.description)}
  )`).join(',\n')}
) as values_table(
  project_code, driver_code, name, impact, value, weighted_contribution, rank, description
)
join public.projects on projects.project_code = values_table.project_code
join public.project_risks risks on risks.project_id = projects.id and risks.is_current
where not exists (
  select 1 from public.risk_drivers existing
  where existing.risk_id = risks.id and existing.driver_code = values_table.driver_code
);
`);

const predictionProjects = projects.filter(project => project.riskAssessment.overallScore >= 60);
sql.push(`insert into public.predictions (
  project_id, model_version_id, source_update_id, prediction_type,
  horizon_months, target_date, predicted_value, predicted_class, confidence,
  output_payload, feature_snapshot, generated_at, valid_until, metadata
)
select
  projects.id,
  model_versions.id,
  updates.id,
  'risk_score',
  3,
  (values_table.generated_at::date + interval '3 months')::date,
  least(100, values_table.current_score + 5),
  values_table.risk_level,
  70,
  jsonb_build_object('basis', 'seeded deterministic trend', 'currentScore', values_table.current_score),
  values_table.feature_snapshot,
  values_table.generated_at,
  values_table.generated_at + interval '3 months',
  '{"seed":true,"synthetic":true,"notProductionML":true}'::jsonb
from (values
${predictionProjects.map(project => `  (
    ${quote(project.id)}, ${number(project.riskAssessment.overallScore)},
    ${quote(enumValue(project.riskAssessment.riskLevel))}, ${timestamp(project.lastUpdated)},
    ${json({
      physicalProgress: project.physicalProgress,
      plannedProgress: project.expectedProgress,
      financialProgress: project.financialProgress,
      delayDays: project.delayDays,
    })}
  )`).join(',\n')}
) as values_table(project_code, current_score, risk_level, generated_at, feature_snapshot)
join public.projects on projects.project_code = values_table.project_code
join public.model_versions on model_versions.name = 'pragati_x_deterministic_risk'
  and model_versions.version = '1.0.0'
left join lateral (
  select monthly.id
  from public.project_monthly_updates monthly
  where monthly.project_id = projects.id
  order by monthly.reporting_month desc
  limit 1
) updates on true
where not exists (
  select 1 from public.predictions existing
  where existing.project_id = projects.id
    and existing.model_version_id = model_versions.id
    and existing.prediction_type = 'risk_score'
    and existing.generated_at = values_table.generated_at
);
`);

sql.push(`insert into public.warnings (
  warning_code, project_id, risk_id, severity, status, alert_type, title,
  description, trigger_rule, source_type, source_reference, deduplication_key,
  evidence, detected_at, assigned_to_name, metadata
)
select
  values_table.warning_code,
  projects.id,
  risks.id,
  values_table.severity::public.warning_severity,
  values_table.status::public.warning_status,
  values_table.alert_type,
  values_table.title,
  values_table.description,
  values_table.trigger_rule,
  'rule',
  'frontend-demo-warning',
  values_table.warning_code,
  values_table.evidence,
  values_table.detected_at,
  values_table.assigned_to_name,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${warnings.map(warning => `  (
    ${quote(warning.id)}, ${quote(warning.projectId)}, ${quote(enumValue(warning.severity))},
    ${quote(enumValue(warning.status))}, ${quote(warning.alertType)}, ${quote(warning.title)},
    ${quote(warning.description)}, ${quote(warning.trigger)}, ${json(warning.evidence)},
    ${timestamp(warning.detectedDate)}, ${quote(warning.assignedTo)}
  )`).join(',\n')}
) as values_table(
  warning_code, project_code, severity, status, alert_type, title, description,
  trigger_rule, evidence, detected_at, assigned_to_name
)
join public.projects on projects.project_code = values_table.project_code
left join public.project_risks risks on risks.project_id = projects.id and risks.is_current
on conflict (warning_code) do update set
  project_id = excluded.project_id,
  risk_id = excluded.risk_id,
  severity = excluded.severity,
  status = excluded.status,
  alert_type = excluded.alert_type,
  title = excluded.title,
  description = excluded.description,
  trigger_rule = excluded.trigger_rule,
  evidence = excluded.evidence,
  detected_at = excluded.detected_at,
  assigned_to_name = excluded.assigned_to_name;
`);

sql.push(`insert into public.interventions (
  intervention_code, project_id, warning_id, ministry_id, issue,
  recommended_action, priority, status, assigned_to_name, due_date,
  opened_at, resolved_at, notes, metadata
)
select
  values_table.intervention_code,
  projects.id,
  warning_match.id,
  projects.ministry_id,
  values_table.issue,
  values_table.recommended_action,
  values_table.priority::public.intervention_priority,
  values_table.status::public.intervention_status,
  values_table.assigned_to_name,
  values_table.due_date,
  values_table.opened_at,
  values_table.resolved_at,
  values_table.notes,
  '{"seed":true,"synthetic":true}'::jsonb
from (values
${interventions.map(intervention => `  (
    ${quote(intervention.id)}, ${quote(intervention.projectId)}, ${quote(intervention.issue)},
    ${quote(intervention.recommendedAction)}, ${quote(enumValue(intervention.priority))},
    ${quote(enumValue(intervention.status))}, ${quote(intervention.assignedTo)},
    ${date(intervention.dueDate)}, ${date(intervention.createdDate)},
    ${timestamp(intervention.resolvedDate)}, ${quote(intervention.notes)}
  )`).join(',\n')}
) as values_table(
  intervention_code, project_code, issue, recommended_action, priority,
  status, assigned_to_name, due_date, opened_at, resolved_at, notes
)
join public.projects on projects.project_code = values_table.project_code
left join lateral (
  select warnings.id
  from public.warnings
  where warnings.project_id = projects.id
  order by warnings.detected_at
  limit 1
) warning_match on true
on conflict (intervention_code) do update set
  project_id = excluded.project_id,
  warning_id = excluded.warning_id,
  ministry_id = excluded.ministry_id,
  issue = excluded.issue,
  recommended_action = excluded.recommended_action,
  priority = excluded.priority,
  status = excluded.status,
  assigned_to_name = excluded.assigned_to_name,
  due_date = excluded.due_date,
  opened_at = excluded.opened_at,
  resolved_at = excluded.resolved_at,
  notes = excluded.notes;
`);

sql.push(`insert into public.intervention_updates (
  intervention_id, update_type, status, note, occurred_at, metadata
)
select
  interventions.id,
  'seed_snapshot',
  interventions.status,
  coalesce(interventions.notes, 'Initial intervention state imported from the frontend demonstration dataset.'),
  interventions.created_at,
  '{"seed":true,"synthetic":true}'::jsonb
from public.interventions
where interventions.metadata ->> 'seed' = 'true'
  and not exists (
    select 1 from public.intervention_updates existing
    where existing.intervention_id = interventions.id
      and existing.update_type = 'seed_snapshot'
  );
`);

sql.push(`insert into public.audit_logs (
  action, entity_type, table_name, record_key, new_values, occurred_at
)
select
  'seed_import',
  'dataset',
  'projects',
  'pragati-x-demo-v1',
  jsonb_build_object(
    'projects', (select count(*) from public.projects where metadata ->> 'seed' = 'true'),
    'warnings', (select count(*) from public.warnings where metadata ->> 'seed' = 'true'),
    'interventions', (select count(*) from public.interventions where metadata ->> 'seed' = 'true')
  ),
  now()
where not exists (
  select 1 from public.audit_logs where record_key = 'pragati-x-demo-v1' and action = 'seed_import'
);

-- Profiles are created by the auth.users trigger. Documents and notifications
-- intentionally remain empty until real Storage objects and authenticated users exist.

commit;
`);

const outputPath = path.join(root, 'supabase', 'seed.sql');
fs.writeFileSync(outputPath, sql.join('\n'), 'utf8');

console.log(
  `Generated ${path.relative(root, outputPath)} from ${projects.length} projects, ` +
  `${milestoneRows.length} milestones, ${driverRows.length} risk drivers, ` +
  `${predictionProjects.length} predictions, ${warnings.length} warnings, and ` +
  `${interventions.length} interventions.`,
);
