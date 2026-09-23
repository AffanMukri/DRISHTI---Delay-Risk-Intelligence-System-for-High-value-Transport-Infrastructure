import type {
  CostBreakdown,
  DataConfidence,
  Intervention,
  InterventionOfficer,
  InterventionPriority,
  InterventionStatus,
  InterventionUpdate,
  Milestone,
  MilestoneStatus,
  Prediction,
  PortfolioChanges,
  Project,
  ProjectStatus,
  RiskAssessment,
  RiskDriverChange,
  RiskLevel,
  RiskTrajectory,
  RiskTrendDirection,
  Warning,
  WarningSeverity,
  WarningStatus,
} from '../types';
import type { ApiComparisonProject, ApiDataConfidence, ApiIntervention, ApiInterventionOfficer, ApiInterventionUpdate, ApiMilestone, ApiPortfolioChanges, ApiPrediction, ApiProject, ApiRisk, ApiRiskTrajectory, ApiWarning } from './apiTypes';

const titleByValue: Record<string, string> = {
  active: 'Active', completed: 'Completed', on_hold: 'On Hold', under_review: 'Under Review',
  healthy: 'Healthy', watch: 'Watch', high_risk: 'High Risk', critical: 'Critical',
  on_track: 'On Track', at_risk: 'At Risk', delayed: 'Delayed',
  new: 'New', acknowledged: 'Acknowledged', assigned: 'Assigned', resolved: 'Resolved',
  open: 'Open', in_progress: 'In Progress', escalated: 'Escalated', overdue: 'Overdue',
  high: 'High', moderate: 'Moderate', medium: 'Medium', low: 'Low',
};

function title(value: string): string {
  return titleByValue[value] || value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function numberFrom(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function breakdown(value: Record<string, unknown>): CostBreakdown {
  return {
    materialCosts: numberFrom(value.materialCosts ?? value.material_costs),
    scopeChanges: numberFrom(value.scopeChanges ?? value.scope_changes),
    delayedExecution: numberFrom(value.delayedExecution ?? value.delayed_execution),
    contractualChanges: numberFrom(value.contractualChanges ?? value.contractual_changes),
    otherFactors: numberFrom(value.otherFactors ?? value.other_factors),
  };
}

export function mapRisk(value?: ApiRisk | null, brief?: ApiProject['risk']): RiskAssessment {
  const overallScore = value?.overallScore ?? brief?.overallScore ?? 0;
  const costRisk = value?.costOverrunRisk ?? overallScore;
  const scheduleRisk = value?.scheduleDelayRisk ?? overallScore;
  const implementationRisk = value?.implementationRisk ?? overallScore;
  const components: RiskAssessment['components'] = Object.fromEntries(Object.entries(value?.components ?? {}).map(([name, component]) => [name, {
    available: component.available,
    reason: component.reason ?? undefined,
    overallScore: component.overallScore ?? undefined,
    costRisk: component.costRisk ?? undefined,
    scheduleRisk: component.scheduleRisk ?? undefined,
    implementationRisk: component.implementationRisk ?? undefined,
    factors: component.factors,
    signals: component.signals,
    provenance: component.provenance ?? {},
  }]));
  if (Object.keys(components).length === 0 && value) {
    components.rule = {
      available: true,
      overallScore,
      costRisk,
      scheduleRisk,
      implementationRisk,
      provenance: { type: 'legacy_stored_assessment', methodology: value.methodology },
    };
  }
  return {
    overallScore,
    riskLevel: title(value?.riskLevel ?? brief?.riskLevel ?? 'healthy') as RiskLevel,
    costOverrunRisk: costRisk,
    scheduleDelayRisk: scheduleRisk,
    implementationRisk,
    progressFactor: value?.progressFactor ?? scheduleRisk,
    costFactor: value?.costFactor ?? costRisk,
    scheduleFactor: value?.scheduleFactor ?? scheduleRisk,
    milestoneFactor: value?.milestoneFactor ?? implementationRisk,
    expenditureFactor: value?.expenditureFactor ?? costRisk,
    methodology: value?.methodology ?? 'deterministic-risk-v1',
    components,
    ensemble: value?.ensemble ?? {},
    provenance: value?.provenance ?? {},
    drivers: (value?.drivers ?? []).map(driver => ({
      name: driver.name,
      impact: title(driver.impact) as 'High' | 'Medium' | 'Low',
      value: driver.value,
      description: driver.description || '',
      component: driver.metadata?.component as 'rule' | 'statistical' | 'ml' | undefined,
    })),
  };
}

export function mapRiskTrajectory(value: ApiRiskTrajectory): RiskTrajectory {
  const direction = (raw: string) => title(raw) as RiskTrendDirection;
  const driverChange = (change: ApiRiskTrajectory['changes'][number]['driverChanges'][number]): RiskDriverChange => ({
    code: change.code,
    name: change.name,
    changeType: title(change.changeType) as RiskDriverChange['changeType'],
    previousValue: change.previousValue ?? undefined,
    currentValue: change.currentValue ?? undefined,
    valueDelta: change.valueDelta,
    weightedContributionDelta: change.weightedContributionDelta,
    description: change.description ?? undefined,
  });
  return {
    projectId: value.projectId,
    trendDirection: direction(value.trendDirection),
    totalMonths: value.totalMonths,
    thresholds: value.thresholds,
    points: value.points.map(point => ({
      ...point,
      costRisk: point.costRisk ?? undefined,
      scheduleRisk: point.scheduleRisk ?? undefined,
      implementationRisk: point.implementationRisk ?? undefined,
      overallChange: point.overallChange ?? undefined,
      riskLevel: title(point.riskLevel) as RiskLevel,
      trendDirection: direction(point.trendDirection),
    })),
    changes: value.changes.map(change => ({
      ...change,
      costRiskChange: change.costRiskChange ?? undefined,
      scheduleRiskChange: change.scheduleRiskChange ?? undefined,
      implementationRiskChange: change.implementationRiskChange ?? undefined,
      trendDirection: direction(change.trendDirection),
      driverChanges: change.driverChanges.map(driverChange),
    })),
  };
}

export function mapPortfolioChanges(value: ApiPortfolioChanges): PortfolioChanges {
  const project = (item: ApiComparisonProject) => ({
    ...item,
    previousRiskLevel: title(item.previousRiskLevel) as RiskLevel,
    currentRiskLevel: title(item.currentRiskLevel) as RiskLevel,
  });
  const metric = (item: ApiPortfolioChanges['newlyHighRisk']) => ({
    count: item.count,
    projects: item.projects.map(project),
  });
  const dimension = (item: ApiPortfolioChanges['dimensions']['sectors'][number]) => ({
    ...item,
    projects: item.projects.map(project),
  });
  return {
    ...value,
    latestPeriod: value.latestPeriod ?? undefined,
    previousPeriod: value.previousPeriod ?? undefined,
    newlyHighRisk: metric(value.newlyHighRisk),
    newlyCritical: metric(value.newlyCritical),
    recovered: metric(value.recovered),
    significantCostRiskIncrease: metric(value.significantCostRiskIncrease),
    significantScheduleRiskIncrease: metric(value.significantScheduleRiskIncrease),
    capitalExposure: {
      ...value.capitalExposure,
      changePercentage: value.capitalExposure.changePercentage ?? undefined,
      projects: value.capitalExposure.projects.map(project),
    },
    emergingRiskDrivers: value.emergingRiskDrivers.map(driver => ({ ...driver, projects: driver.projects.map(project) })),
    dimensions: {
      sectors: value.dimensions.sectors.map(dimension),
      ministries: value.dimensions.ministries.map(dimension),
      states: value.dimensions.states.map(dimension),
    },
  };
}

export function mapDataConfidence(value: ApiDataConfidence): DataConfidence {
  return {
    ...value,
    rating: title(value.rating) as DataConfidence['rating'],
    latestReportingMonth: value.latestReportingMonth ?? undefined,
  };
}

export function mapMilestone(value: ApiMilestone): Milestone {
  return {
    id: value.id,
    name: value.name,
    nodeType: value.nodeType,
    plannedDate: value.plannedDate,
    actualDate: value.actualDate ?? value.forecastDate ?? undefined,
    status: title(value.status) as MilestoneStatus,
    delayDays: value.delayDays ?? undefined,
  };
}

export function mapProject(value: ApiProject, risk?: ApiRisk | null): Project {
  return {
    id: value.id,
    name: value.name,
    ministry: value.ministry,
    department: value.department || '',
    sector: value.sector,
    state: value.state,
    implementingAgency: value.implementingAgency || '',
    status: title(value.status) as ProjectStatus,
    approvedCost: value.approvedCost,
    revisedCost: value.revisedCost,
    expenditure: value.expenditure,
    physicalProgress: value.physicalProgress,
    expectedProgress: value.plannedProgress,
    financialProgress: value.financialProgress,
    originalCompletionDate: value.originalCompletionDate || value.revisedCompletionDate || '1970-01-01',
    revisedCompletionDate: value.revisedCompletionDate || value.originalCompletionDate || '1970-01-01',
    delayDays: value.delayDays,
    lastUpdated: value.lastReportedAt || value.revisedCompletionDate || value.originalCompletionDate || '1970-01-01',
    milestones: (value.milestones ?? []).map(mapMilestone),
    costBreakdown: breakdown(value.costBreakdown || {}),
    riskAssessment: mapRisk(risk, value.risk),
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    description: value.description || '',
    projectType: value.projectType || '',
  };
}

function stringifyEvidence(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    const indicator = typeof item.indicator === 'string' ? item.indicator.replaceAll('_', ' ') : 'Indicator';
    const current = item.current ?? item.cycles;
    const previous = item.previous;
    if (current !== undefined) {
      return `${indicator}: ${String(current)}${previous !== undefined && previous !== null ? ` (previous: ${String(previous)})` : ''}`;
    }
  }
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function mapWarning(value: ApiWarning): Warning {
  return {
    id: value.id,
    severity: title(value.severity) as WarningSeverity,
    projectId: value.projectId,
    projectName: value.projectName,
    ministry: value.ministry,
    sector: value.sector || 'Unspecified',
    state: value.state || 'Unspecified',
    title: value.title,
    description: value.description,
    trigger: value.triggerRule || '',
    detectedDate: value.detectedAt,
    status: title(value.status) as WarningStatus,
    assignedTo: value.assignedToName || undefined,
    evidence: value.evidence.map(stringifyEvidence),
    evidenceDetails: value.evidence,
    alertType: title(value.alertType),
    sourceType: title(value.sourceType),
    sourceReference: value.sourceReference || undefined,
    currentValue: value.currentValue,
    previousValue: value.previousValue,
    recommendedAction: value.recommendedAction || undefined,
    firstDetectedDate: value.firstDetectedAt,
    lastDetectedDate: value.lastDetectedAt,
    occurrenceCount: value.occurrenceCount,
  };
}

export function mapIntervention(value: ApiIntervention): Intervention {
  return {
    id: value.id,
    projectId: value.projectId,
    projectName: value.projectName,
    ministry: value.ministry,
    warningId: value.warningId || undefined,
    warningTitle: value.warningTitle || undefined,
    warningSeverity: value.warningSeverity ? title(value.warningSeverity) as WarningSeverity : undefined,
    issue: value.issue,
    recommendedAction: value.recommendedAction,
    priority: title(value.priority) as InterventionPriority,
    status: title(value.status) as InterventionStatus,
    assignedTo: value.assignedToName || undefined,
    assignedToId: value.assignedTo || undefined,
    dueDate: value.dueDate || '',
    createdDate: value.openedAt,
    resolvedDate: value.resolvedAt || undefined,
    resolutionSummary: value.resolutionSummary || undefined,
    escalatedDate: value.escalatedAt || undefined,
    escalationReason: value.escalationReason || undefined,
    notes: value.notes || value.resolutionSummary || undefined,
  };
}

export function mapInterventionUpdate(value: ApiInterventionUpdate): InterventionUpdate {
  return {
    id: value.id,
    interventionId: value.interventionId,
    updateType: title(value.updateType),
    status: value.status ? title(value.status) as InterventionStatus : undefined,
    note: value.note || undefined,
    createdBy: value.createdBy || undefined,
    createdByName: value.createdByName || undefined,
    occurredAt: value.occurredAt,
    metadata: value.metadata,
  };
}

export function mapInterventionOfficer(value: ApiInterventionOfficer): InterventionOfficer {
  return {
    id: value.id,
    fullName: value.fullName || undefined,
    email: value.email,
    designation: value.designation || undefined,
    role: title(value.role),
  };
}

export function mapPrediction(value: ApiPrediction): Prediction {
  return {
    id: value.id,
    projectId: value.projectId,
    projectName: value.projectName,
    modelName: value.modelName,
    modelVersion: value.modelVersion,
    predictionType: value.predictionType,
    horizonMonths: value.horizonMonths ?? undefined,
    targetDate: value.targetDate ?? undefined,
    predictedValue: value.predictedValue ?? undefined,
    predictedClass: value.predictedClass ?? undefined,
    confidence: value.confidence ?? undefined,
    lowerBound: value.lowerBound ?? undefined,
    upperBound: value.upperBound ?? undefined,
    outputPayload: value.outputPayload,
    generatedAt: value.generatedAt,
    validUntil: value.validUntil ?? undefined,
  };
}

export function toApiEnum(value: string): string {
  return value.trim().toLowerCase().replaceAll(' ', '_');
}
