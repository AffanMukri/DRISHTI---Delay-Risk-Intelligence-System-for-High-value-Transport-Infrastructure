import { PROJECTS } from '../data/projects';
import type { Project, ProjectMonthlyUpdate } from '../types';
import { buildMockProjectHistory } from './mockProjectIntelligence';
import type {
  CostAggregateBreakdown,
  CostAnalyticsFilters,
  CostAnalyticsResponse,
  CostProgressMismatch,
  ProjectCostBreakdown,
} from './costAnalyticsService';
import type {
  ProjectScheduleBreakdown,
  ScheduleAggregateBreakdown,
  ScheduleAnalyticsFilters,
  ScheduleAnalyticsResponse,
} from './scheduleAnalyticsService';
import type {
  AgencyBenchmark,
  BenchmarkAnalyticsResponse,
  BenchmarkMetricComparison,
  BenchmarkProject,
  PeerMatch,
} from './benchmarkAnalyticsService';

const DAY_MS = 86_400_000;

function average(values: Array<number | null | undefined>): number {
  const available = values.filter((value): value is number => value !== null && value !== undefined);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : 0;
}

function nullableAverage(values: Array<number | null | undefined>): number | null {
  const available = values.filter((value): value is number => value !== null && value !== undefined);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

function median(values: Array<number | null | undefined>): number | null {
  const available = values
    .filter((value): value is number => value !== null && value !== undefined)
    .sort((left, right) => left - right);
  if (!available.length) return null;
  const middle = Math.floor(available.length / 2);
  return available.length % 2
    ? available[middle]
    : (available[middle - 1] + available[middle]) / 2;
}

function dateValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const result = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(result) ? null : result;
}

function daysBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  const startValue = dateValue(start);
  const endValue = dateValue(end);
  return startValue === null || endValue === null ? null : Math.round((endValue - startValue) / DAY_MS);
}

function aggregateCost(projects: Project[]): CostAggregateBreakdown {
  const originalApprovedCost = projects.reduce((sum, project) => sum + project.approvedCost, 0);
  const latestRevisedCost = projects.reduce((sum, project) => sum + project.revisedCost, 0);
  const cumulativeExpenditure = projects.reduce((sum, project) => sum + project.expenditure, 0);
  const absoluteCostEscalation = latestRevisedCost - originalApprovedCost;
  return {
    projectCount: projects.length,
    comparableProjects: projects.length,
    originalApprovedCost,
    latestRevisedCost,
    cumulativeExpenditure,
    absoluteCostEscalation,
    costEscalationPercentage: originalApprovedCost > 0
      ? absoluteCostEscalation / originalApprovedCost * 100
      : 0,
  };
}

function projectCost(project: Project): ProjectCostBreakdown {
  const escalation = project.revisedCost - project.approvedCost;
  const expenditurePercentage = project.revisedCost > 0
    ? project.expenditure / project.revisedCost * 100
    : null;
  return {
    projectId: project.id,
    projectName: project.name,
    ministry: project.ministry,
    sector: project.sector,
    originalApprovedCost: project.approvedCost,
    latestRevisedCost: project.revisedCost,
    cumulativeExpenditure: project.expenditure,
    absoluteCostEscalation: escalation,
    costEscalationPercentage: project.approvedCost > 0 ? escalation / project.approvedCost * 100 : null,
    expenditurePercentage,
    physicalProgress: project.physicalProgress,
    progressMismatch: expenditurePercentage === null ? null : expenditurePercentage - project.physicalProgress,
    approvedCostSource: 'synthetic_demo_snapshot',
    revisedCostSource: 'synthetic_demo_snapshot',
    expenditureSource: 'synthetic_demo_snapshot',
    hasMonthlyHistory: true,
  };
}

function monthKey(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function costTrend(projects: Project[]): CostAnalyticsResponse['series'] {
  const periods = new Map<string, ProjectMonthlyUpdate[]>();
  for (const project of projects) {
    for (const update of buildMockProjectHistory(project.id).monthlyUpdates) {
      const period = monthKey(update.reportingMonth);
      periods.set(period, [...(periods.get(period) ?? []), update]);
    }
  }
  return [...periods.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([period, updates]) => {
    const approved = updates.filter(update => update.approvedCost !== undefined);
    const revised = updates.filter(update => update.revisedCost !== undefined);
    const expenditure = updates.filter(update => update.expenditure !== undefined);
    const originalApprovedCost = approved.reduce((sum, update) => sum + (update.approvedCost ?? 0), 0);
    const latestRevisedCost = revised.reduce((sum, update) => sum + (update.revisedCost ?? 0), 0);
    const cumulativeExpenditure = expenditure.reduce((sum, update) => sum + (update.expenditure ?? 0), 0);
    const absoluteCostEscalation = latestRevisedCost - originalApprovedCost;
    return {
      period,
      reportingProjects: updates.length,
      approvedCostProjects: approved.length,
      revisedCostProjects: revised.length,
      expenditureProjects: expenditure.length,
      originalApprovedCost,
      latestRevisedCost,
      cumulativeExpenditure,
      absoluteCostEscalation,
      costEscalationPercentage: originalApprovedCost > 0 ? absoluteCostEscalation / originalApprovedCost * 100 : null,
    };
  });
}

export function buildMockCostAnalytics(filters: CostAnalyticsFilters = {}): CostAnalyticsResponse {
  const projects = PROJECTS.filter(project => (
    (!filters.sector || project.sector === filters.sector)
    && (!filters.escalatedOnly || project.revisedCost > project.approvedCost)
  ));
  const aggregate = aggregateCost(projects);
  const series = costTrend(projects);
  const projectBreakdown = projects.map(projectCost).sort((left, right) => (
    (right.absoluteCostEscalation ?? Number.NEGATIVE_INFINITY)
    - (left.absoluteCostEscalation ?? Number.NEGATIVE_INFINITY)
  ) || left.projectId.localeCompare(right.projectId));
  const group = (key: 'sector' | 'ministry') => {
    const groups = new Map<string, Project[]>();
    for (const project of projects) groups.set(project[key], [...(groups.get(project[key]) ?? []), project]);
    return [...groups].map(([name, rows]) => ({ [key]: name, ...aggregateCost(rows) }))
      .sort((left, right) => right.absoluteCostEscalation - left.absoluteCostEscalation);
  };
  const threshold = filters.mismatchThreshold ?? 15;
  const progressMismatches: CostProgressMismatch[] = projectBreakdown
    .filter(project => (project.progressMismatch ?? Number.NEGATIVE_INFINITY) >= threshold)
    .slice(0, 25)
    .map(project => ({
      projectId: project.projectId,
      projectName: project.projectName,
      ministry: project.ministry,
      sector: project.sector,
      latestRevisedCost: project.latestRevisedCost!,
      cumulativeExpenditure: project.cumulativeExpenditure!,
      expenditurePercentage: project.expenditurePercentage!,
      physicalProgress: project.physicalProgress!,
      progressMismatch: project.progressMismatch!,
    }));
  return {
    summary: {
      totalProjects: aggregate.projectCount,
      originalApprovedCost: aggregate.originalApprovedCost,
      latestRevisedCost: aggregate.latestRevisedCost,
      cumulativeExpenditure: aggregate.cumulativeExpenditure,
      absoluteCostEscalation: aggregate.absoluteCostEscalation,
      costEscalationPercentage: aggregate.costEscalationPercentage,
      expenditurePercentage: aggregate.latestRevisedCost > 0
        ? aggregate.cumulativeExpenditure / aggregate.latestRevisedCost * 100
        : 0,
      escalatedProjects: projects.filter(project => project.revisedCost > project.approvedCost).length,
    },
    dataAvailability: {
      totalProjects: projects.length,
      approvedCostProjects: projects.length,
      revisedCostProjects: projects.length,
      expenditureProjects: projects.length,
      physicalProgressProjects: projects.length,
      comparableCostProjects: projects.length,
      monthlyHistoryProjects: projects.length,
      incompleteCostProjects: 0,
      latestReportingMonth: series.at(-1)?.period ?? null,
    },
    // This series is deterministic demonstration data reconstructed from each
    // current fixture. The UI labels it as synthetic, never as reported history.
    series,
    sectorBreakdown: group('sector') as CostAnalyticsResponse['sectorBreakdown'],
    ministryBreakdown: group('ministry') as CostAnalyticsResponse['ministryBreakdown'],
    projectBreakdown,
    breakdown: projectBreakdown.filter(project => (project.absoluteCostEscalation ?? 0) > 0).slice(0, 10),
    progressMismatches,
  };
}

function scheduleProject(project: Project, updates: ProjectMonthlyUpdate[]): ProjectScheduleBreakdown {
  const asOfDate = project.lastUpdated.slice(0, 10);
  const scheduleSlippageDays = daysBetween(project.originalCompletionDate, project.revisedCompletionDate)
    ?? project.delayDays;
  const completedMilestones = project.milestones.filter(milestone => milestone.status === 'Completed' || milestone.actualDate).length;
  const onTrackMilestones = project.milestones.filter(milestone => (
    milestone.status === 'On Track' && !milestone.actualDate && milestone.plannedDate >= asOfDate
  )).length;
  const atRiskMilestones = project.milestones.filter(milestone => !milestone.actualDate && milestone.status === 'At Risk').length;
  const delayedMilestones = project.milestones.filter(milestone => !milestone.actualDate && milestone.status === 'Delayed').length;
  const overdueMilestones = project.milestones.filter(milestone => (
    !milestone.actualDate && milestone.status !== 'Completed' && milestone.plannedDate < asOfDate
  )).length;
  const monitoringStartDate = project.milestones
    .map(milestone => milestone.plannedDate)
    .sort()[0] ?? null;
  const elapsedDays = daysBetween(monitoringStartDate, asOfDate);
  const durationDays = daysBetween(monitoringStartDate, project.revisedCompletionDate);
  return {
    projectId: project.id,
    projectName: project.name,
    ministry: project.ministry,
    implementingAgency: project.implementingAgency,
    sector: project.sector,
    originalCompletionDate: project.originalCompletionDate,
    currentCompletionDate: project.revisedCompletionDate,
    scheduleSlippageDays,
    plannedPhysicalProgress: project.expectedProgress,
    actualPhysicalProgress: project.physicalProgress,
    progressVariance: project.physicalProgress - project.expectedProgress,
    monitoringStartDate,
    asOfDate,
    elapsedDurationPercentage: elapsedDays !== null && durationDays !== null && durationDays > 0
      ? Math.max(0, elapsedDays / durationDays * 100)
      : null,
    totalMilestones: project.milestones.length,
    completedMilestones,
    onTrackMilestones,
    atRiskMilestones,
    delayedMilestones,
    overdueMilestones,
    milestoneCompletionPercentage: project.milestones.length
      ? completedMilestones / project.milestones.length * 100
      : null,
    monthlyProgressVelocity: updates.length > 1
      ? (updates.at(-1)?.physicalProgress ?? project.physicalProgress)
        - (updates.at(-2)?.physicalProgress ?? project.physicalProgress)
      : null,
    hasMonthlyHistory: updates.length > 1,
    delayRank: null,
  };
}

function aggregateSchedule(rows: ProjectScheduleBreakdown[]): ScheduleAggregateBreakdown {
  const delays = rows.map(row => row.scheduleSlippageDays).filter((value): value is number => value !== null && value !== undefined);
  const positiveDelays = delays.filter(value => value > 0);
  return {
    projectCount: rows.length,
    comparableProjects: delays.length,
    delayedProjects: positiveDelays.length,
    averageDelayDays: average(positiveDelays),
    maximumDelayDays: delays.length ? Math.max(...delays) : 0,
    averageProgressVariance: average(rows.map(row => row.progressVariance)),
    averageMonthlyProgressVelocity: average(rows.map(row => row.monthlyProgressVelocity)),
  };
}

export function buildMockScheduleAnalytics(filters: ScheduleAnalyticsFilters = {}): ScheduleAnalyticsResponse {
  const query = filters.search?.trim().toLowerCase();
  const historyByProject = new Map(PROJECTS.map(project => [project.id, buildMockProjectHistory(project.id).monthlyUpdates]));
  let rows = PROJECTS.map(project => scheduleProject(project, historyByProject.get(project.id) ?? [])).filter(row => (
    (!filters.sector || row.sector === filters.sector)
    && (!query || [row.projectId, row.projectName, row.ministry].some(value => value.toLowerCase().includes(query)))
  ));
  rows = rows.filter(row => {
    const delay = row.scheduleSlippageDays;
    if (!filters.delayFilter || filters.delayFilter === 'all') return true;
    if (delay === null || delay === undefined) return false;
    if (filters.delayFilter === 'delayed') return delay > 0;
    if (filters.delayFilter === 'severe') return delay >= 730;
    return delay <= 0;
  }).sort((left, right) => (
    (right.scheduleSlippageDays ?? Number.NEGATIVE_INFINITY)
    - (left.scheduleSlippageDays ?? Number.NEGATIVE_INFINITY)
  ) || left.projectId.localeCompare(right.projectId));
  let previousDelay: number | null = null;
  let rank = 0;
  rows = rows.map(row => {
    if ((row.scheduleSlippageDays ?? 0) <= 0) return row;
    if (row.scheduleSlippageDays !== previousDelay) rank += 1;
    previousDelay = row.scheduleSlippageDays ?? null;
    return { ...row, delayRank: rank };
  });
  const grouped = (key: 'sector' | 'ministry') => {
    const groups = new Map<string, ProjectScheduleBreakdown[]>();
    for (const row of rows) groups.set(row[key], [...(groups.get(row[key]) ?? []), row]);
    return [...groups].map(([name, groupRows]) => ({ [key]: name, ...aggregateSchedule(groupRows) }))
      .sort((left, right) => right.averageDelayDays - left.averageDelayDays);
  };
  const counts = [0, 0, 0, 0, 0];
  for (const row of rows) {
    const delay = row.scheduleSlippageDays;
    if (delay === null || delay === undefined) continue;
    counts[delay <= 0 ? 0 : delay <= 365 ? 1 : delay <= 730 ? 2 : delay <= 1825 ? 3 : 4] += 1;
  }
  const totalMilestones = rows.reduce((sum, row) => sum + row.totalMilestones, 0);
  const completedMilestones = rows.reduce((sum, row) => sum + row.completedMilestones, 0);
  const delayed = rows.filter(row => (row.scheduleSlippageDays ?? 0) > 0);
  const latest = rows.length ? [...rows].sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0].asOfDate : null;
  const includedIds = new Set(rows.map(row => row.projectId));
  const periods = new Map<string, Array<{ update: ProjectMonthlyUpdate; velocity: number | null }>>();
  for (const [projectId, updates] of historyByProject) {
    if (!includedIds.has(projectId)) continue;
    updates.forEach((update, index) => {
      const previous = updates[index - 1];
      const velocity = previous?.physicalProgress !== undefined && update.physicalProgress !== undefined
        ? update.physicalProgress - previous.physicalProgress
        : null;
      const period = monthKey(update.reportingMonth);
      periods.set(period, [...(periods.get(period) ?? []), { update, velocity }]);
    });
  }
  const series: ScheduleAnalyticsResponse['series'] = [...periods.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, entries]) => {
      const updates = entries.map(entry => entry.update);
      const planned = updates.map(update => update.plannedProgress).filter((value): value is number => value !== undefined);
      const actual = updates.map(update => update.physicalProgress).filter((value): value is number => value !== undefined);
      const delays = updates.map(update => update.delayDays).filter((value): value is number => value !== undefined);
      const velocities = entries.map(entry => entry.velocity).filter((value): value is number => value !== null);
      const plannedProgress = nullableAverage(planned);
      const actualProgress = nullableAverage(actual);
      return {
        period,
        reportingProjects: updates.length,
        plannedProgressProjects: planned.length,
        actualProgressProjects: actual.length,
        plannedProgress,
        actualProgress,
        progressVariance: plannedProgress === null || actualProgress === null ? null : actualProgress - plannedProgress,
        monthlyProgressVelocity: nullableAverage(velocities),
        averageSlippageDays: nullableAverage(delays),
      };
    });
  return {
    summary: {
      totalProjects: rows.length,
      delayedProjects: delayed.length,
      onTimeProjects: rows.filter(row => (row.scheduleSlippageDays ?? 1) <= 0).length,
      severeDelayedProjects: rows.filter(row => (row.scheduleSlippageDays ?? 0) >= 730).length,
      chronicDelayedProjects: rows.filter(row => (row.scheduleSlippageDays ?? 0) >= 1825).length,
      averageSlippageDays: average(delayed.map(row => row.scheduleSlippageDays)),
      maximumSlippageDays: rows.length ? Math.max(0, ...rows.map(row => row.scheduleSlippageDays ?? 0)) : 0,
      averagePlannedProgress: average(rows.map(row => row.plannedPhysicalProgress)),
      averageActualProgress: average(rows.map(row => row.actualPhysicalProgress)),
      averageProgressVariance: average(rows.map(row => row.progressVariance)),
      averageElapsedDurationPercentage: average(rows.map(row => row.elapsedDurationPercentage)),
      averageMonthlyProgressVelocity: average(rows.map(row => row.monthlyProgressVelocity)),
      totalMilestones,
      completedMilestones,
      onTrackMilestones: rows.reduce((sum, row) => sum + row.onTrackMilestones, 0),
      atRiskMilestones: rows.reduce((sum, row) => sum + row.atRiskMilestones, 0),
      delayedMilestones: rows.reduce((sum, row) => sum + row.delayedMilestones, 0),
      overdueMilestones: rows.reduce((sum, row) => sum + row.overdueMilestones, 0),
      milestoneCompletionPercentage: totalMilestones ? completedMilestones / totalMilestones * 100 : 0,
    },
    dataAvailability: {
      totalProjects: rows.length,
      originalDateProjects: rows.filter(row => row.originalCompletionDate).length,
      currentDateProjects: rows.filter(row => row.currentCompletionDate).length,
      comparableDateProjects: rows.filter(row => row.originalCompletionDate && row.currentCompletionDate).length,
      plannedProgressProjects: rows.filter(row => row.plannedPhysicalProgress !== null && row.plannedPhysicalProgress !== undefined).length,
      actualProgressProjects: rows.filter(row => row.actualPhysicalProgress !== null && row.actualPhysicalProgress !== undefined).length,
      comparableProgressProjects: rows.filter(row => row.plannedPhysicalProgress !== null && row.actualPhysicalProgress !== null).length,
      elapsedDurationProjects: rows.filter(row => row.elapsedDurationPercentage !== null && row.elapsedDurationPercentage !== undefined).length,
      velocityProjects: rows.filter(row => row.monthlyProgressVelocity !== null && row.monthlyProgressVelocity !== undefined).length,
      monthlyHistoryProjects: rows.filter(row => row.hasMonthlyHistory).length,
      milestoneDetailProjects: rows.filter(row => row.totalMilestones > 0).length,
      milestoneReportingProjects: rows.filter(row => row.totalMilestones > 0).length,
      latestAsOfDate: latest,
      latestReportingMonth: series.at(-1)?.period ?? null,
    },
    // This is a deterministic reconstruction for demonstration and is labelled
    // separately from imported CUF reporting history in the interface.
    series,
    delayBrackets: ['On Schedule (0d)', '1-12 Months', '13-24 Months', '25-60 Months', '> 5 Years']
      .map((bracket, index) => ({ bracket, projectCount: counts[index], sortOrder: index + 1 })),
    sectorBreakdown: grouped('sector') as ScheduleAnalyticsResponse['sectorBreakdown'],
    ministryBreakdown: grouped('ministry') as ScheduleAnalyticsResponse['ministryBreakdown'],
    projectBreakdown: rows,
    breakdown: rows.filter(row => (row.scheduleSlippageDays ?? 0) > 0).slice(0, 25),
  };
}

function states(value: string): string[] {
  return value.split('/').map(item => item.trim()).filter(Boolean);
}

function costBand(value: number): string {
  if (value < 1_000) return 'Below ₹1,000 Cr';
  if (value < 5_000) return '₹1,000-5,000 Cr';
  if (value < 10_000) return '₹5,000-10,000 Cr';
  if (value < 25_000) return '₹10,000-25,000 Cr';
  if (value < 50_000) return '₹25,000-50,000 Cr';
  if (value < 100_000) return '₹50,000-100,000 Cr';
  return '₹100,000 Cr and above';
}

function benchmarkProject(project: Project): BenchmarkProject {
  const startDate = project.milestones.map(milestone => milestone.plannedDate).sort()[0] ?? null;
  const plannedDurationDays = daysBetween(startDate, project.originalCompletionDate);
  const slipped = project.milestones.filter(milestone => (
    !milestone.actualDate && (milestone.status === 'Delayed' || milestone.plannedDate < project.lastUpdated.slice(0, 10))
  )).length;
  const completed = project.milestones.filter(milestone => milestone.status === 'Completed' || milestone.actualDate).length;
  const expenditurePercentage = project.revisedCost > 0 ? project.expenditure / project.revisedCost * 100 : null;
  return {
    projectId: project.id,
    projectName: project.name,
    ministry: project.ministry,
    implementingAgency: project.implementingAgency,
    sector: project.sector,
    projectType: project.projectType || 'Not reported',
    state: project.state,
    states: states(project.state),
    status: project.status.toLowerCase(),
    originalCost: project.approvedCost,
    revisedCost: project.revisedCost,
    startDate,
    startDateSource: startDate ? 'earliest_milestone' : null,
    startYear: startDate ? Number(startDate.slice(0, 4)) : null,
    plannedDurationDays,
    costBand: costBand(project.approvedCost),
    costOverrunPercentage: project.approvedCost > 0
      ? (project.revisedCost - project.approvedCost) / project.approvedCost * 100
      : null,
    scheduleDelayDays: daysBetween(project.originalCompletionDate, project.revisedCompletionDate),
    monthlyProgressVelocity: null,
    expenditureEfficiency: expenditurePercentage && project.physicalProgress !== null
      ? project.physicalProgress / expenditurePercentage * 100
      : null,
    milestoneSlippagePercentage: project.milestones.length ? slipped / project.milestones.length * 100 : null,
    milestoneCompletionPercentage: project.milestones.length ? completed / project.milestones.length * 100 : null,
    overallRiskScore: project.riskAssessment.overallScore,
    costRiskScore: project.riskAssessment.costOverrunRisk,
    scheduleRiskScore: project.riskAssessment.scheduleDelayRisk,
    implementationRiskScore: project.riskAssessment.implementationRisk,
  };
}

function peerScore(selected: BenchmarkProject, candidate: BenchmarkProject, agencyCounts: Map<string, number>): [number, string[]] {
  let score = 0;
  const reasons: string[] = [];
  if (selected.sector === candidate.sector) { score += 30; reasons.push(`Same sector: ${selected.sector}`); }
  if (selected.projectType !== 'Not reported' && selected.projectType === candidate.projectType) { score += 20; reasons.push(`Same project type: ${selected.projectType}`); }
  if (selected.costBand && selected.costBand === candidate.costBand) { score += 15; reasons.push(`Same original-cost band: ${selected.costBand}`); }
  const shared = selected.states.filter(state => candidate.states.includes(state)).sort();
  if (shared.length) { score += 10; reasons.push(`Shared geography: ${shared.join(', ')}`); }
  if (selected.implementingAgency !== 'Not reported' && selected.implementingAgency === candidate.implementingAgency && (agencyCounts.get(selected.implementingAgency) ?? 0) > 1) {
    score += 5; reasons.push(`Same implementing agency: ${selected.implementingAgency}`);
  }
  if (selected.plannedDurationDays && candidate.plannedDurationDays) {
    const difference = Math.abs(candidate.plannedDurationDays - selected.plannedDurationDays) / selected.plannedDurationDays;
    if (difference <= 0.25) { score += 10; reasons.push('Planned duration within 25%'); }
    else if (difference <= 0.5) { score += 5; reasons.push('Planned duration within 50%'); }
  }
  if (selected.startYear !== null && selected.startYear !== undefined && candidate.startYear !== null && candidate.startYear !== undefined) {
    const gap = Math.abs(candidate.startYear - selected.startYear);
    if (gap <= 2) { score += 10; reasons.push('Start period within 2 years'); }
    else if (gap <= 5) { score += 5; reasons.push('Start period within 5 years'); }
  }
  return [score, reasons];
}

type MetricKey = keyof Pick<BenchmarkProject,
  'costOverrunPercentage' | 'scheduleDelayDays' | 'monthlyProgressVelocity' | 'expenditureEfficiency'
  | 'milestoneSlippagePercentage' | 'overallRiskScore' | 'costRiskScore' | 'scheduleRiskScore' | 'implementationRiskScore'>;

const BENCHMARK_METRICS: Array<[string, MetricKey, string, string, boolean]> = [
  ['cost_overrun_percentage', 'costOverrunPercentage', 'Cost overrun', '%', true],
  ['schedule_delay_days', 'scheduleDelayDays', 'Schedule delay', 'days', true],
  ['monthly_progress_velocity', 'monthlyProgressVelocity', 'Physical progress velocity', 'pp/month', false],
  ['expenditure_efficiency', 'expenditureEfficiency', 'Expenditure efficiency', 'index', false],
  ['milestone_slippage_percentage', 'milestoneSlippagePercentage', 'Milestone slippage', '%', true],
  ['overall_risk_score', 'overallRiskScore', 'Overall risk', 'score', true],
  ['cost_risk_score', 'costRiskScore', 'Cost risk', 'score', true],
  ['schedule_risk_score', 'scheduleRiskScore', 'Schedule risk', 'score', true],
  ['implementation_risk_score', 'implementationRiskScore', 'Implementation risk', 'score', true],
];

function radarScore(metric: MetricKey, value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const clamp = (score: number) => Math.max(0, Math.min(100, score));
  if (metric === 'costOverrunPercentage') return clamp(100 - Math.max(0, value) * 2);
  if (metric === 'scheduleDelayDays') return clamp(100 - Math.max(0, value) / 10);
  if (metric === 'monthlyProgressVelocity') return clamp(value * 20);
  if (metric === 'expenditureEfficiency') return clamp(value);
  if (metric === 'milestoneSlippagePercentage') return clamp(100 - value);
  if (metric === 'overallRiskScore') return clamp(100 - value);
  return null;
}

function agencyLeaderboard(facts: BenchmarkProject[]): AgencyBenchmark[] {
  const groups = new Map<string, BenchmarkProject[]>();
  for (const project of facts) groups.set(project.implementingAgency, [...(groups.get(project.implementingAgency) ?? []), project]);
  const result = [...groups].map(([agency, projects]) => {
    const sourceProjects = projects
      .map(project => PROJECTS.find(source => source.id === project.projectId))
      .filter((project): project is Project => Boolean(project));
    const totalMilestones = sourceProjects.reduce((sum, project) => sum + project.milestones.length, 0);
    const completedMilestones = sourceProjects.reduce((sum, project) => sum + project.milestones.filter(
      milestone => milestone.status === 'Completed' || Boolean(milestone.actualDate),
    ).length, 0);
    const hitRate = totalMilestones ? completedMilestones / totalMilestones * 100 : null;
    const delay = nullableAverage(projects.map(project => project.scheduleDelayDays));
    const overrun = nullableAverage(projects.map(project => project.costOverrunPercentage));
    const risk = nullableAverage(projects.map(project => project.overallRiskScore));
    const scoreParts = [
      delay === null ? null : Math.max(0, Math.min(100, 100 - Math.max(0, delay) / 10)),
      overrun === null ? null : Math.max(0, Math.min(100, 100 - Math.max(0, overrun) * 2)),
      totalMilestones ? hitRate : null,
      risk === null ? null : Math.max(0, Math.min(100, 100 - risk)),
    ];
    return {
      rank: 0,
      agency,
      projectCount: projects.length,
      totalOutlay: projects.reduce((sum, project) => sum + (project.revisedCost ?? 0), 0),
      averageDelayDays: delay,
      averageCostOverrunPercentage: overrun,
      milestoneHitRate: hitRate,
      averageRiskScore: risk,
      deliveryEfficiencyIndex: nullableAverage(scoreParts),
    };
  }).sort((left, right) => (
    (right.deliveryEfficiencyIndex ?? -1) - (left.deliveryEfficiencyIndex ?? -1)
  ) || left.agency.localeCompare(right.agency));
  return result.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildMockBenchmarkAnalytics(projectId: string, comparisonProjectId?: string): BenchmarkAnalyticsResponse {
  const facts = PROJECTS.map(benchmarkProject);
  const selected = facts.find(project => project.projectId === projectId);
  if (!selected) throw new Error(`Project ${projectId || '(missing ID)'} was not found for benchmarking.`);
  const agencyCounts = new Map<string, number>();
  for (const project of facts) agencyCounts.set(project.implementingAgency, (agencyCounts.get(project.implementingAgency) ?? 0) + 1);
  const candidates = facts.filter(project => project.projectId !== selected.projectId).map(project => {
    const [matchScore, matchReasons] = peerScore(selected, project, agencyCounts);
    const sameFamily = project.sector === selected.sector || (project.projectType !== 'Not reported' && project.projectType === selected.projectType);
    const isHistorical = project.status === 'completed' || (
      project.startYear !== null && project.startYear !== undefined
      && selected.startYear !== null && selected.startYear !== undefined
      && project.startYear < selected.startYear
    );
    return { ...project, matchScore, matchReasons, isHistorical, sameFamily };
  });
  let eligible = candidates.filter(project => project.sameFamily && project.matchScore >= 30);
  let selectionMethod = 'weighted sector/type peer match';
  let minimumMatchScore = 30;
  if (!eligible.length) {
    eligible = candidates.filter(project => project.matchScore >= 15);
    selectionMethod = 'relaxed weighted match (no sector/type peer met the threshold)';
    minimumMatchScore = 15;
  }
  const peers: PeerMatch[] = eligible
    .sort((left, right) => right.matchScore - left.matchScore || left.projectId.localeCompare(right.projectId))
    .slice(0, 8)
    .map(({ sameFamily: _sameFamily, ...peer }) => peer);
  const comparison = comparisonProjectId
    ? peers.find(project => project.projectId === comparisonProjectId)
    : peers[0];
  if (comparisonProjectId && !comparison) throw new Error('The requested comparison project is not in this project\'s peer group.');
  const historicalPeers = peers.filter(project => project.isHistorical);
  const sectorProjects = facts.filter(project => project.sector === selected.sector);
  const metricComparisons: BenchmarkMetricComparison[] = BENCHMARK_METRICS.map(([key, field, label, unit, lowerIsBetter]) => ({
    key,
    label,
    unit,
    lowerIsBetter,
    selectedValue: selected[field],
    comparisonValue: comparison?.[field],
    sectorMedian: median(sectorProjects.map(project => project[field])),
    peerMedian: median(peers.map(project => project[field])),
    historicalMedian: median(historicalPeers.map(project => project[field])),
    sectorSampleSize: sectorProjects.filter(project => project[field] !== null && project[field] !== undefined).length,
    peerSampleSize: peers.filter(project => project[field] !== null && project[field] !== undefined).length,
    historicalSampleSize: historicalPeers.filter(project => project[field] !== null && project[field] !== undefined).length,
  }));
  const radarDimensions: Array<[string, MetricKey]> = [
    ['Cost discipline', 'costOverrunPercentage'],
    ['Schedule discipline', 'scheduleDelayDays'],
    ['Progress velocity', 'monthlyProgressVelocity'],
    ['Expenditure efficiency', 'expenditureEfficiency'],
    ['Milestone delivery', 'milestoneSlippagePercentage'],
    ['Risk resilience', 'overallRiskScore'],
  ];
  return {
    selectedProject: selected,
    comparisonPeer: comparison ?? null,
    peerGroup: {
      selectionMethod,
      minimumMatchScore,
      candidateProjectsEvaluated: candidates.length,
      peerCount: peers.length,
      historicalPeerCount: historicalPeers.length,
      maximumPeers: 8,
    },
    peers,
    historicalPeers,
    metricComparisons,
    radar: radarDimensions.map(([subject, field]) => ({
      subject,
      selectedScore: radarScore(field, selected[field]),
      comparisonScore: radarScore(field, comparison?.[field]),
      peerMedianScore: median(peers.map(project => radarScore(field, project[field]))),
    })),
    agencyLeaderboard: agencyLeaderboard(facts),
    dataAvailability: {
      portfolioProjects: facts.length,
      sectorProjects: sectorProjects.length,
      projectsWithStartDate: facts.filter(project => project.startDate).length,
      projectsWithVelocity: facts.filter(project => project.monthlyProgressVelocity !== null && project.monthlyProgressVelocity !== undefined).length,
      projectsWithMilestones: facts.filter(project => project.milestoneCompletionPercentage !== null && project.milestoneCompletionPercentage !== undefined).length,
      projectsWithRisk: facts.filter(project => project.overallRiskScore !== null && project.overallRiskScore !== undefined).length,
    },
  };
}
