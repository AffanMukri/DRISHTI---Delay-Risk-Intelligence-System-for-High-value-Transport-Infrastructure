import { PROJECTS } from '../data/projects';
import type {
  AuditFilterOptions,
  AuditFilters,
  AuditLogItem,
  AuditLogResponse,
} from './auditService';

const actors = {
  admin: { id: '00000000-0000-4000-8000-000000000001', email: 'administrator@demo.drishti.local', fullName: 'DRISHTI Demo Administrator', role: 'administrator' },
  executive: { id: '00000000-0000-4000-8000-000000000002', email: 'executive@demo.drishti.local', fullName: 'DRISHTI Demo Executive', role: 'executive' },
  officer: { id: '00000000-0000-4000-8000-000000000003', email: 'monitoring@demo.drishti.local', fullName: 'DRISHTI Demo Monitoring Officer', role: 'monitoring_officer' },
  analyst: { id: '00000000-0000-4000-8000-000000000004', email: 'analyst@demo.drishti.local', fullName: 'DRISHTI Demo Analyst', role: 'analyst' },
};

function project(index: number) {
  const value = PROJECTS[index % PROJECTS.length];
  return { id: value.id, projectCode: value.id, name: value.name };
}

function event(
  id: number,
  action: string,
  entityType: string,
  source: string,
  actor: AuditLogItem['actor'],
  occurredAt: string,
  projectIndex?: number,
  details: Partial<AuditLogItem> = {},
): AuditLogItem {
  const linkedProject = projectIndex === undefined ? null : project(projectIndex);
  return {
    id: `DEMO-AUDIT-${String(id).padStart(4, '0')}`,
    actor,
    project: linkedProject,
    action,
    entityType,
    entityId: details.entityId ?? linkedProject?.id ?? `demo-${entityType}-${id}`,
    tableName: details.tableName ?? entityType,
    recordKey: details.recordKey ?? linkedProject?.projectCode ?? `DEMO-${id}`,
    oldValues: details.oldValues ?? null,
    newValues: details.newValues ?? null,
    source,
    requestReference: details.requestReference ?? `REQ-DEMO-202604-${String(id).padStart(4, '0')}`,
    importReference: details.importReference ?? null,
    ipAddress: null,
    userAgent: null,
    metadata: { syntheticDemo: true, containsSecrets: false, ...details.metadata },
    eventVersion: 1,
    occurredAt,
  };
}

const seedEvents: AuditLogItem[] = [
  event(1, 'login_success', 'security', 'web_portal', actors.admin, '2026-04-30T08:42:10Z', undefined, { newValues: { authenticationMode: 'demo', role: 'administrator' } }),
  event(2, 'cuf_import_validated', 'cuf_import', 'cuf_ingestion', actors.officer, '2026-04-30T08:55:22Z', undefined, { importReference: 'CUF-DEMO-2026-04', newValues: { fileType: 'xlsx', totalRows: 40, validRows: 40, qualityScore: 94.5 } }),
  event(3, 'cuf_import_completed', 'cuf_import', 'cuf_ingestion', actors.officer, '2026-04-30T09:01:08Z', undefined, { importReference: 'CUF-DEMO-2026-04', newValues: { reportingMonth: '2026-04-01', importedRows: 40, rejectedRows: 0 } }),
  event(4, 'project_update_imported', 'project_monthly_update', 'cuf_ingestion', actors.officer, '2026-04-30T09:02:14Z', 0, { importReference: 'CUF-DEMO-2026-04', newValues: { physicalProgress: 34, plannedProgress: 52, revisedCost: 127500 } }),
  event(5, 'risk_snapshot_calculated', 'project_risk', 'risk_engine', { fullName: 'DRISHTI Risk Engine', role: 'system' }, '2026-04-30T09:04:41Z', 0, { newValues: { overallScore: PROJECTS[0].riskAssessment.overallScore, level: PROJECTS[0].riskAssessment.riskLevel, ruleVersion: 'hybrid-risk-v1' } }),
  event(6, 'warning_generated', 'warning', 'warning_engine', { fullName: 'DRISHTI Warning Engine', role: 'system' }, '2026-04-30T09:05:12Z', 0, { newValues: { severity: 'critical', trigger: 'progress_variance', status: 'open' } }),
  event(7, 'warning_acknowledged', 'warning', 'web_portal', actors.executive, '2026-04-30T09:22:35Z', 0, { oldValues: { status: 'open' }, newValues: { status: 'acknowledged', remarks: 'Review initiated with implementing agency.' } }),
  event(8, 'intervention_created', 'intervention', 'intervention_workflow', actors.executive, '2026-04-30T09:28:03Z', 0, { newValues: { priority: 'critical', status: 'open', dueDate: '2026-05-15', action: 'Resolve land and package-interface constraints' } }),
  event(9, 'intervention_assigned', 'intervention', 'intervention_workflow', actors.admin, '2026-04-30T09:31:47Z', 0, { oldValues: { assignee: null, status: 'open' }, newValues: { assignee: actors.officer.fullName, status: 'assigned' } }),
  event(10, 'intervention_status_changed', 'intervention', 'intervention_workflow', actors.officer, '2026-04-30T10:04:19Z', 0, { oldValues: { status: 'assigned' }, newValues: { status: 'in_progress', remarks: 'Joint review meeting scheduled.' } }),
  event(11, 'report_generated', 'report', 'reporting', actors.executive, '2026-04-30T10:18:50Z', undefined, { newValues: { reportType: 'Monthly Flash Report', format: 'pdf', reportingMonth: '2026-04' } }),
  event(12, 'analytics_exported', 'report', 'reporting', actors.analyst, '2026-04-30T10:32:16Z', 4, { newValues: { reportType: 'Project Cost Analysis', format: 'xlsx' } }),
  event(13, 'prediction_execution_recorded', 'prediction', 'prediction_service', actors.analyst, '2026-04-30T10:46:28Z', 1, { newValues: { status: 'not_executed', reason: 'No active trained model in demonstration environment' }, metadata: { modelVersion: null, dataVersion: 'demo-snapshot-2026-04-30' } }),
  event(14, 'project_record_viewed', 'project', 'web_portal', actors.executive, '2026-04-30T11:07:44Z', 2, { newValues: { view: 'project_intelligence' } }),
  event(15, 'role_assignment_reviewed', 'profile', 'admin_portal', actors.admin, '2026-04-30T11:24:09Z', undefined, { oldValues: { role: 'analyst' }, newValues: { role: 'analyst', active: true }, metadata: { changed: false, reviewOnly: true } }),
  event(16, 'warning_acknowledged', 'warning', 'web_portal', actors.officer, '2026-04-29T14:12:05Z', 7, { oldValues: { status: 'open' }, newValues: { status: 'acknowledged', remarks: 'Evidence verified against monthly return.' } }),
  event(17, 'intervention_resolved', 'intervention', 'intervention_workflow', actors.officer, '2026-04-29T15:40:31Z', 11, { oldValues: { status: 'in_progress' }, newValues: { status: 'resolved', resolutionNotes: 'Pending clearance obtained and package released.' } }),
  event(18, 'report_generated', 'report', 'reporting', actors.admin, '2026-04-28T12:20:18Z', undefined, { newValues: { reportType: 'Critical Project Report', format: 'pdf', projectCount: 9 } }),
];

const runtimeEvents: AuditLogItem[] = [];

function searchable(item: AuditLogItem): string {
  return [item.action, item.entityType, item.entityId, item.recordKey, item.source,
    item.requestReference, item.importReference, item.actor.email, item.actor.fullName,
    item.project?.projectCode, item.project?.name].filter(Boolean).join(' ').toLowerCase();
}

export function listMockAuditLogs(filters: AuditFilters): AuditLogResponse {
  const search = filters.search?.trim().toLowerCase();
  const all = [...runtimeEvents, ...seedEvents]
    .filter(item => !filters.action || item.action === filters.action)
    .filter(item => !filters.entityType || item.entityType === filters.entityType)
    .filter(item => !filters.source || item.source === filters.source)
    .filter(item => !filters.actorId || item.actor.id === filters.actorId)
    .filter(item => !filters.occurredFrom || item.occurredAt >= filters.occurredFrom)
    .filter(item => !filters.occurredTo || item.occurredAt <= filters.occurredTo)
    .filter(item => !search || searchable(item).includes(search))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
}

export function mockAuditOptions(): AuditFilterOptions {
  const all = [...runtimeEvents, ...seedEvents];
  const unique = (values: string[]) => [...new Set(values)].sort();
  const actorMap = new Map<string, AuditFilterOptions['actors'][number]>();
  for (const item of all) {
    if (!item.actor.id || !item.actor.email) continue;
    actorMap.set(item.actor.id, { id: item.actor.id, email: item.actor.email, fullName: item.actor.fullName });
  }
  return {
    actions: unique(all.map(item => item.action)),
    entityTypes: unique(all.map(item => item.entityType)),
    sources: unique(all.map(item => item.source)),
    actors: [...actorMap.values()].sort((left, right) => (left.fullName ?? left.email).localeCompare(right.fullName ?? right.email)),
  };
}

export function recordMockSecurityEvent(action: 'login_success' | 'logout_requested'): void {
  runtimeEvents.unshift(event(
    9000 + runtimeEvents.length,
    action,
    'security',
    'web_portal',
    actors.admin,
    new Date().toISOString(),
    undefined,
    { newValues: { authenticationMode: 'demo', action } },
  ));
}
