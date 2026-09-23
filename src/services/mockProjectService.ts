import { PROJECTS } from '../data/projects';
import { INTERVENTIONS, WARNINGS } from '../data/warnings';
import type {
  AnalyticsDataset,
  DataConfidence,
  Intervention,
  InterventionCreateInput,
  InterventionOfficer,
  InterventionUpdate,
  InterventionUpdateInput,
  PortfolioSummary,
  PortfolioChanges,
  Prediction,
  Project,
  ProjectHistory,
  RiskAssessment,
  RiskTrajectory,
  Warning,
} from '../types';
import type { AnalyticsKind, ProjectDataService, ProjectFilters, ProjectsResult } from './contracts';

function applyProjectFilters(filters: ProjectFilters): Project[] {
  let data = [...PROJECTS];
  if (filters.search) {
    const query = filters.search.toLowerCase();
    data = data.filter(project => [
      project.name,
      project.id,
      project.ministry,
      project.sector,
      project.state,
      project.implementingAgency,
    ].some(value => value.toLowerCase().includes(query)));
  }
  if (filters.ministry) data = data.filter(project => project.ministry === filters.ministry);
  if (filters.sector) data = data.filter(project => project.sector === filters.sector);
  if (filters.state) data = data.filter(project => project.state.includes(filters.state!));
  if (filters.riskLevel) data = data.filter(project => project.riskAssessment.riskLevel === filters.riskLevel);
  if (filters.status) data = data.filter(project => project.status === filters.status);
  if (filters.sortBy) {
    data.sort((left, right) => {
      const leftValue = left[filters.sortBy!] as string | number;
      const rightValue = right[filters.sortBy!] as string | number;
      const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      return filters.sortDir === 'desc' ? -result : result;
    });
  }
  return data;
}

export class MockProjectService implements ProjectDataService {
  private warnings = structuredClone(WARNINGS);
  private interventions = structuredClone(INTERVENTIONS);

  async getProjects(filters: ProjectFilters = {}): Promise<ProjectsResult> {
    const data = applyProjectFilters(filters);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? data.length;
    const offset = (page - 1) * pageSize;
    return { data: data.slice(offset, offset + pageSize), total: data.length, page, pageSize };
  }

  async getProject(id: string): Promise<Project | null> {
    return PROJECTS.find(project => project.id === id) ?? null;
  }

  async getProjectHistory(id: string): Promise<ProjectHistory> {
    const project = PROJECTS.find(item => item.id === id);
    return {
      projectId: id,
      monthlyUpdates: project ? [{
        reportingMonth: project.lastUpdated.slice(0, 10),
        approvedCost: project.approvedCost,
        revisedCost: project.revisedCost,
        expenditure: project.expenditure,
        physicalProgress: project.physicalProgress,
        plannedProgress: project.expectedProgress,
        financialProgress: project.financialProgress,
        delayDays: project.delayDays,
        clearanceStatus: {},
        issues: [],
      }] : [],
      costHistory: [],
      scheduleHistory: [],
    };
  }

  async getDataConfidence(): Promise<DataConfidence | null> {
    return null;
  }

  async getPortfolioSummary(): Promise<PortfolioSummary> {
    return {
      totalProjects: PROJECTS.length,
      portfolioValue: PROJECTS.reduce((sum, project) => sum + project.revisedCost, 0),
      totalExpenditure: PROJECTS.reduce((sum, project) => sum + project.expenditure, 0),
      costOverrunExposure: PROJECTS.reduce((sum, project) => sum + Math.max(0, project.revisedCost - project.approvedCost), 0),
      delayedProjects: PROJECTS.filter(project => project.delayDays > 0).length,
      activeWarnings: this.warnings.filter(warning => warning.status !== 'Resolved').length,
      openInterventions: this.interventions.filter(intervention => intervention.status !== 'Resolved').length,
      healthy: PROJECTS.filter(project => project.riskAssessment.riskLevel === 'Healthy').length,
      watch: PROJECTS.filter(project => project.riskAssessment.riskLevel === 'Watch').length,
      highRisk: PROJECTS.filter(project => project.riskAssessment.riskLevel === 'High Risk').length,
      critical: PROJECTS.filter(project => project.riskAssessment.riskLevel === 'Critical').length,
    };
  }

  async getPortfolioChanges(): Promise<PortfolioChanges> {
    const emptyMetric = { count: 0, projects: [] };
    return {
      comparisonAvailable: false,
      headline: 'A second stored reporting cycle is required before month-on-month changes can be calculated.',
      summaryPoints: [],
      newlyHighRisk: emptyMetric,
      newlyCritical: emptyMetric,
      recovered: emptyMetric,
      significantCostRiskIncrease: emptyMetric,
      significantScheduleRiskIncrease: emptyMetric,
      newlyOverdueMilestones: { count: 0, projectCount: 0, projects: [], milestones: [] },
      newCriticalWarnings: { count: 0, warnings: [] },
      resolvedWarnings: { count: 0, warnings: [] },
      capitalExposure: { previous: 0, current: 0, change: 0, projects: [] },
      emergingRiskDrivers: [],
      dimensions: { sectors: [], ministries: [], states: [] },
      dataAvailability: { latestSnapshotProjects: 0, previousSnapshotProjects: 0, comparableProjects: 0, capitalComparableProjects: 0, excludedProjects: 0 },
      thresholds: { significantRiskIncreasePoints: 10, emergingDriverIncreasePoints: 2 },
    };
  }

  async getRisks(): Promise<RiskAssessment[]> {
    return PROJECTS.map(project => project.riskAssessment);
  }

  async getRiskTrajectory(projectId: string): Promise<RiskTrajectory> {
    return {
      projectId,
      trendDirection: 'Stable',
      points: [],
      changes: [],
      totalMonths: 0,
      thresholds: {
        stableBandPoints: 2,
        meaningfulIncreasePoints: 5,
        rapidIncreasePoints: 10,
      },
    };
  }

  async assessPortfolioRisks(): Promise<RiskAssessment[]> {
    return this.getRisks();
  }

  async getWarnings(): Promise<Warning[]> {
    return structuredClone(this.warnings);
  }

  async acknowledgeWarning(id: string): Promise<Warning> {
    const warning = this.warnings.find(item => item.id === id);
    if (!warning) throw new Error(`Warning ${id} was not found.`);
    warning.status = 'Acknowledged';
    return structuredClone(warning);
  }

  async updateWarning(id: string, input: import('../types').WarningUpdateInput): Promise<Warning> {
    const warning = this.warnings.find(item => item.id === id);
    if (!warning) throw new Error(`Warning ${id} was not found.`);
    warning.status = input.status;
    if (input.assignedToName) warning.assignedTo = input.assignedToName;
    return structuredClone(warning);
  }

  async getInterventions(): Promise<Intervention[]> {
    return structuredClone(this.interventions);
  }

  async getInterventionHistory(id: string): Promise<InterventionUpdate[]> {
    const intervention = this.interventions.find(item => item.id === id);
    if (!intervention) throw new Error(`Intervention ${id} was not found.`);
    return [{
      id: `UPD-${id}`,
      interventionId: id,
      updateType: 'Baseline',
      status: intervention.status,
      note: intervention.notes || 'Demonstration intervention state.',
      occurredAt: intervention.createdDate,
      metadata: { source: 'mock' },
    }];
  }

  async getInterventionOfficers(): Promise<InterventionOfficer[]> {
    return [
      { id: '10000000-0000-0000-0000-000000000001', fullName: 'Monitoring Officer', email: 'monitoring@drishti.local', role: 'Monitoring Officer' },
      { id: '10000000-0000-0000-0000-000000000002', fullName: 'Executive Officer', email: 'executive@drishti.local', role: 'Executive' },
    ];
  }

  async createIntervention(input: InterventionCreateInput): Promise<Intervention> {
    const project = PROJECTS.find(item => item.id === input.projectId);
    if (!project) throw new Error(`Project ${input.projectId} was not found.`);
    const intervention: Intervention = {
      id: `INT-DEV-${Date.now()}`,
      projectId: project.id,
      projectName: project.name,
      ministry: project.ministry,
      issue: input.issue,
      recommendedAction: input.recommendedAction,
      priority: input.priority,
      status: input.assignedTo || input.assignedToName ? 'Assigned' : 'Open',
      warningId: input.warningId,
      assignedTo: input.assignedToName,
      assignedToId: input.assignedTo,
      dueDate: input.dueDate || '',
      createdDate: new Date().toISOString(),
      notes: input.notes,
    };
    this.interventions.unshift(intervention);
    return structuredClone(intervention);
  }

  async updateIntervention(id: string, input: InterventionUpdateInput): Promise<Intervention> {
    const index = this.interventions.findIndex(item => item.id === id);
    if (index < 0) throw new Error(`Intervention ${id} was not found.`);
    const current = this.interventions[index];
    const updated: Intervention = {
      ...current,
      status: input.status ?? current.status,
      priority: input.priority ?? current.priority,
      assignedTo: input.assignedToName ?? current.assignedTo,
      assignedToId: input.assignedTo ?? current.assignedToId,
      dueDate: input.dueDate ?? current.dueDate,
      notes: input.remark
        ? [current.notes, input.remark].filter(Boolean).join('\n')
        : input.notes ?? input.resolutionSummary ?? current.notes,
      resolutionSummary: input.resolutionSummary ?? current.resolutionSummary,
      escalationReason: input.escalationReason ?? current.escalationReason,
      resolvedDate: input.status === 'Resolved' ? new Date().toISOString() : current.resolvedDate,
    };
    this.interventions[index] = updated;
    return structuredClone(updated);
  }

  async getAnalytics(kind: AnalyticsKind): Promise<AnalyticsDataset> {
    const summary = kind === 'cost'
      ? {
          approvedCost: PROJECTS.reduce((sum, project) => sum + project.approvedCost, 0),
          revisedCost: PROJECTS.reduce((sum, project) => sum + project.revisedCost, 0),
          expenditure: PROJECTS.reduce((sum, project) => sum + project.expenditure, 0),
        }
      : kind === 'schedule'
        ? { delayedProjects: PROJECTS.filter(project => project.delayDays > 0).length }
        : { sectors: new Set(PROJECTS.map(project => project.sector)).size };
    return { summary, series: [], breakdown: [] };
  }

  async getPredictions(): Promise<Prediction[]> {
    return [];
  }
}
