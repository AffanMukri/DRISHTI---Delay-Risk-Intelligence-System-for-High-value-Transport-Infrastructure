import { PROJECTS } from '../data/projects';
import type {
  CostOverrunPrediction,
  DataConfidence,
  DataConfidenceComponent,
  PredictionExplanation,
  Project,
  ProjectEvidenceChain,
  ProjectHistory,
  RiskTrajectory,
  RiskTrendDirection,
  ScenarioConfiguration,
  ScenarioOutcome,
  ScenarioSimulation,
} from '../types';
import { computeRiskAssessment, costOverrunPct, riskLevelFromScore } from '../utils/riskCalculations';
import type { DependencyGraph, DependencyNodeStatus } from './dependencyService';

const DEMO_HISTORY_METHOD = 'Deterministic synthetic monthly series reconstructed from the current demonstration snapshot. It is not stored government history.';

const clamp = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

function projectFor(projectId: string): Project {
  const project = PROJECTS.find(item => item.id === projectId);
  if (!project) throw new Error(`Project ${projectId} was not found in the demonstration portfolio.`);
  return project;
}

function shiftMonth(value: string, offset: number): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function shiftDays(value: string, offset: number): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function riskTrend(change: number): RiskTrendDirection {
  if (change >= 10) return 'Rapidly Deteriorating';
  if (change > 2) return 'Deteriorating';
  if (change < -2) return 'Improving';
  return 'Stable';
}

export function buildMockProjectHistory(projectId: string): ProjectHistory {
  const project = projectFor(projectId);
  const updates = Array.from({ length: 12 }, (_, index) => {
    const monthsFromLatest = index - 11;
    const progressStep = Math.max(0.7, project.physicalProgress / 22);
    const plannedStep = Math.max(progressStep, project.expectedProgress / 21);
    const physicalProgress = index === 11
      ? project.physicalProgress
      : round(clamp(project.physicalProgress - (11 - index) * progressStep));
    const plannedProgress = index === 11
      ? project.expectedProgress
      : round(clamp(project.expectedProgress - (11 - index) * plannedStep));
    const financialProgress = index === 11
      ? project.financialProgress
      : round(clamp(project.financialProgress - (11 - index) * Math.max(0.8, project.financialProgress / 22)));
    const reportingMonth = shiftMonth(project.lastUpdated, monthsFromLatest);
    const eligibleMilestones = project.milestones.filter(milestone => milestone.plannedDate <= reportingMonth);
    const completedMilestones = project.milestones.filter(milestone => (
      milestone.status === 'Completed' && Boolean(milestone.actualDate) && milestone.actualDate! <= reportingMonth
    ));
    const delayedMilestones = eligibleMilestones.filter(milestone => milestone.status === 'Delayed').length;
    const atRiskMilestones = eligibleMilestones.filter(milestone => milestone.status === 'At Risk').length;
    const delayStep = project.delayDays > 0 ? Math.max(5, project.delayDays / 19) : 0;
    const delayDays = index === 11 ? project.delayDays : Math.max(0, Math.round(project.delayDays - (11 - index) * delayStep));
    const costShare = 0.48 + (index / 11) * 0.52;
    const revisedCost = round(project.approvedCost + (project.revisedCost - project.approvedCost) * costShare, 2);
    return {
      reportingMonth,
      approvedCost: project.approvedCost,
      revisedCost: index === 11 ? project.revisedCost : revisedCost,
      expenditure: index === 11 ? project.expenditure : round(project.expenditure * (0.34 + (index / 11) * 0.66), 2),
      physicalProgress,
      plannedProgress,
      financialProgress,
      originalCompletionDate: project.originalCompletionDate,
      revisedCompletionDate: project.revisedCompletionDate,
      delayDays,
      milestonesTotal: project.milestones.length,
      milestonesCompleted: completedMilestones.length,
      milestonesDelayed: delayedMilestones,
      milestonesAtRisk: atRiskMilestones,
      clearanceStatus: {},
      contractStatus: 'Synthetic demonstration record',
      issues: delayedMilestones || atRiskMilestones ? ['Demonstration milestone variance'] : [],
      remarks: 'Synthetic monthly point generated deterministically from the published demo snapshot.',
    };
  });

  return {
    projectId,
    dataSource: 'synthetic_demo_series',
    methodology: DEMO_HISTORY_METHOD,
    monthlyUpdates: updates,
    costHistory: updates.map(update => ({
      effectiveDate: update.reportingMonth,
      approvedCost: update.approvedCost,
      revisedCost: update.revisedCost,
      expenditure: update.expenditure,
      changeAmount: round((update.revisedCost ?? project.approvedCost) - project.approvedCost, 2),
      changeReason: 'Synthetic demonstration trend',
    })),
    scheduleHistory: updates.map(update => ({
      effectiveDate: update.reportingMonth,
      originalCompletionDate: project.originalCompletionDate,
      revisedCompletionDate: project.revisedCompletionDate,
      delayDays: update.delayDays,
      physicalProgress: update.physicalProgress,
      plannedProgress: update.plannedProgress,
      revisionReason: 'Synthetic demonstration trend',
    })),
  };
}

function component(
  code: string,
  label: string,
  score: number,
  weight: number,
  reasons: string[] = [],
  missingFields: string[] = [],
  staleFields: string[] = [],
): DataConfidenceComponent {
  return {
    code,
    label,
    score: round(score),
    weight,
    weightedScore: round(score * weight),
    reasons,
    missingFields,
    staleFields,
    evidence: { source: 'synthetic_demo_snapshot' },
  };
}

export function buildMockDataConfidence(projectId: string): DataConfidence {
  const project = projectFor(projectId);
  const requiredValues = [
    project.name, project.ministry, project.sector, project.state, project.implementingAgency,
    project.approvedCost, project.revisedCost, project.expenditure, project.physicalProgress,
    project.expectedProgress, project.originalCompletionDate, project.revisedCompletionDate,
  ];
  const completeness = (requiredValues.filter(value => value !== '' && value != null).length / requiredValues.length) * 100;
  const milestoneScore = project.milestones.length >= 4 ? 100 : project.milestones.length >= 2 ? 75 : project.milestones.length ? 50 : 0;
  const coordinateScore = project.latitude != null && project.longitude != null ? 100 : 50;
  const components = [
    component('required_fields', 'Required-field completeness', completeness, 0.25),
    component('freshness', 'Latest update freshness', 100, 0.15, ['Measured against the dated demonstration snapshot, not the current calendar date.']),
    component('history', 'Historical monthly coverage', 55, 0.15, ['Only the latest point is source data; the displayed prior months are explicitly reconstructed demo points.']),
    component('milestones', 'Milestone availability', milestoneScore, 0.15, milestoneScore < 100 ? ['Fewer than four milestone records are available.'] : []),
    component('cost_progress', 'Cost and progress fields', 100, 0.15),
    component('delivery_context', 'Agency and location context', coordinateScore, 0.10, coordinateScore < 100 ? ['Reliable map coordinates are not available.'] : [], coordinateScore < 100 ? ['latitude', 'longitude'] : []),
    component('validation', 'Validation and anomaly evidence', 60, 0.05, ['The demo dataset has logical checks but no signed CUF validation record.']),
  ];
  const overallScore = round(components.reduce((sum, item) => sum + item.weightedScore, 0));
  const reasons = components.flatMap(item => item.reasons).filter(Boolean);
  return {
    projectId,
    projectName: project.name,
    scoreType: 'data_quality',
    isPredictionProbability: false,
    overallScore,
    rating: overallScore >= 85 ? 'High' : overallScore >= 70 ? 'Moderate' : overallScore >= 50 ? 'Low' : 'Very Low',
    asOfDate: project.lastUpdated,
    latestReportingMonth: project.lastUpdated,
    components,
    reasonsLoweringConfidence: reasons,
    missingFields: components.flatMap(item => item.missingFields),
    staleFields: [],
    configuration: {
      formulaVersion: 'demo-data-confidence-v1',
      weights: Object.fromEntries(components.map(item => [item.code, item.weight])),
      freshDays: 45,
      staleDays: 90,
      historyTargetMonths: 12,
      anomalyPenalty: 10,
      validationIssuePenalty: 8,
      statement: 'Deterministic demonstration score calculated only from fields present in the synthetic project fixture. It is not prediction confidence.',
    },
  };
}

export function buildMockRiskTrajectory(projectId: string): RiskTrajectory {
  const project = projectFor(projectId);
  const history = buildMockProjectHistory(projectId).monthlyUpdates.slice(-8);
  const current = project.riskAssessment;
  const monthlyRise = current.overallScore >= 60 ? 2.4 : current.overallScore >= 35 ? 1.2 : 0.4;
  const points = history.map((update, index) => {
    const remaining = history.length - 1 - index;
    const overallRisk = index === history.length - 1 ? current.overallScore : round(clamp(current.overallScore - remaining * monthlyRise));
    const costRisk = index === history.length - 1 ? current.costOverrunRisk : round(clamp(current.costOverrunRisk - remaining * monthlyRise * 0.75));
    const scheduleRisk = index === history.length - 1 ? current.scheduleDelayRisk : round(clamp(current.scheduleDelayRisk - remaining * monthlyRise * 1.1));
    const implementationRisk = index === history.length - 1 ? current.implementationRisk : round(clamp(current.implementationRisk - remaining * monthlyRise * 0.65));
    const previousOverall = index ? (index === history.length - 1 ? pointsPlaceholder(current.overallScore - monthlyRise) : round(clamp(current.overallScore - (remaining + 1) * monthlyRise))) : undefined;
    const overallChange = previousOverall == null ? undefined : round(overallRisk - previousOverall);
    return {
      snapshotId: `DEMO-RISK-${projectId}-${update.reportingMonth}`,
      reportingMonth: update.reportingMonth,
      assessedAt: `${update.reportingMonth}T12:00:00Z`,
      overallRisk,
      costRisk,
      scheduleRisk,
      implementationRisk,
      riskLevel: riskLevelFromScore(overallRisk),
      overallChange,
      trendDirection: overallChange == null ? 'Stable' as const : riskTrend(overallChange),
      meaningfulIncrease: overallChange != null && overallChange >= 5,
    };
  });
  const changes = points.slice(1).map((point, index) => {
    const previous = points[index];
    const overallChange = round(point.overallRisk - previous.overallRisk);
    const costRiskChange = round((point.costRisk ?? 0) - (previous.costRisk ?? 0));
    const scheduleRiskChange = round((point.scheduleRisk ?? 0) - (previous.scheduleRisk ?? 0));
    const implementationRiskChange = round((point.implementationRisk ?? 0) - (previous.implementationRisk ?? 0));
    const driverChanges = [
      ['cost', 'Cost escalation', costRiskChange],
      ['schedule', 'Schedule delay', scheduleRiskChange],
      ['implementation', 'Implementation variance', implementationRiskChange],
    ].filter(([, , delta]) => Math.abs(Number(delta)) >= 0.1).map(([code, name, delta]) => ({
      code: String(code),
      name: String(name),
      changeType: Number(delta) >= 0 ? 'Increased' as const : 'Decreased' as const,
      valueDelta: Number(delta),
      weightedContributionDelta: round(Number(delta) / 3),
      description: 'Deterministic change in the reconstructed synthetic demonstration series.',
    }));
    return {
      fromMonth: previous.reportingMonth,
      toMonth: point.reportingMonth,
      overallChange,
      costRiskChange,
      scheduleRiskChange,
      implementationRiskChange,
      trendDirection: riskTrend(overallChange),
      meaningfulIncrease: overallChange >= 5,
      driverChanges,
    };
  });
  return {
    projectId,
    trendDirection: changes.at(-1)?.trendDirection ?? 'Stable',
    points,
    changes,
    totalMonths: points.length,
    thresholds: { stableBandPoints: 2, meaningfulIncreasePoints: 5, rapidIncreasePoints: 10 },
    provenance: 'synthetic_demo_reconstruction',
    methodology: DEMO_HISTORY_METHOD,
  };
}

function pointsPlaceholder(value: number): number {
  return round(clamp(value));
}

function unavailableExplanation(project: Project, kind: 'cost' | 'schedule'): PredictionExplanation {
  const gap = round(project.expectedProgress - project.physicalProgress);
  return {
    version: 'demo-rule-explanation-v1',
    ml: {
      available: false,
      method: 'SHAP',
      reason: 'SHAP is unavailable because this is a deterministic demonstration projection, not trained-model inference.',
      positiveDrivers: [],
      protectiveDrivers: [],
      contributions: [],
    },
    rules: {
      method: 'transparent deterministic demonstration rules',
      triggers: [
        {
          ruleId: `${kind}-progress-gap`,
          feature: 'progress_variance',
          featureLabel: 'Progress variance',
          actualValue: gap,
          unit: 'percentage points',
          explanation: `Planned progress exceeds physical progress by ${gap.toFixed(1)} percentage points.`,
        },
        {
          ruleId: `${kind}-reported-delay`,
          feature: 'delay_days',
          featureLabel: 'Reported schedule delay',
          actualValue: project.delayDays,
          unit: 'days',
          explanation: 'Reported delay is used directly in the deterministic demo equation.',
        },
      ],
    },
    historical: {
      method: 'not available for synthetic demo projection',
      available: false,
      reason: 'No validated completed-project training cohort is used in demo mode.',
      comparisons: [],
    },
  };
}

export function buildMockCostProjection(projectId: string, overrides: Partial<Project> = {}): CostOverrunPrediction {
  const project = { ...projectFor(projectId), ...overrides };
  const currentEscalation = Math.max(0, costOverrunPct(project.approvedCost, project.revisedCost));
  const progressGap = Math.max(0, project.expectedProgress - project.physicalProgress);
  const expenditureGap = Math.max(0, project.financialProgress - project.physicalProgress);
  const additionalEscalation = clamp(progressGap * 0.18 + (project.delayDays / 365) * 1.25 + expenditureGap * 0.08, 0, 25);
  const escalationPercentage = round(currentEscalation + additionalEscalation);
  const predictedFinalCost = round(Math.max(project.revisedCost, project.approvedCost * (1 + escalationPercentage / 100)), 2);
  const spread = Math.max(project.approvedCost * 0.025, (predictedFinalCost - project.revisedCost) * 0.5);
  return {
    projectId,
    projectName: project.name,
    asOfDate: project.lastUpdated,
    originalApprovedCost: project.approvedCost,
    significantOverrunProbability: undefined,
    predictedClass: undefined,
    significantOverrunThresholdPct: 10,
    predictedFinalCost,
    predictedEscalationAmount: round(predictedFinalCost - project.approvedCost, 2),
    predictedEscalationPercentage: escalationPercentage,
    predictedFinalCostLower: round(Math.max(project.revisedCost, predictedFinalCost - spread), 2),
    predictedFinalCostUpper: round(predictedFinalCost + spread, 2),
    uncertaintyMethod: 'deterministic sensitivity band; not calibrated',
    uncertaintyIsFormallyCalibrated: false,
    modelName: 'Deterministic Demo Cost Projection',
    modelVersion: 'demo-cost-rule-v1',
    trainingDataVersion: 'none-demo-fixture-only',
    regressionModel: 'transparent_rule_projection',
    classificationModel: undefined,
    featureList: ['approved_cost', 'revised_cost', 'physical_progress', 'planned_progress', 'financial_progress', 'delay_days'],
    features: {
      approvedCost: project.approvedCost,
      revisedCost: project.revisedCost,
      physicalProgress: project.physicalProgress,
      plannedProgress: project.expectedProgress,
      financialProgress: project.financialProgress,
      delayDays: project.delayDays,
    },
    evaluationMetrics: {
      classification: { omission_reason: 'No classifier is executed in synthetic demonstration mode.' },
    },
    explanation: unavailableExplanation(project, 'cost'),
    generatedAt: `${project.lastUpdated}T12:00:00Z`,
    synthetic: true,
  };
}

export function buildMockScheduleProjection(projectId: string, overrides: Partial<Project> = {}): import('../types').ScheduleOverrunPrediction {
  const project = { ...projectFor(projectId), ...overrides };
  const progressGap = Math.max(0, project.expectedProgress - project.physicalProgress);
  const milestonePenalty = project.milestones.filter(item => item.status === 'Delayed').length * 14;
  const expectedDelayDays = Math.max(project.delayDays, Math.round(project.delayDays + progressGap * 8 + milestonePenalty));
  const predictedCompletionDate = shiftDays(project.originalCompletionDate, expectedDelayDays);
  const spread = Math.max(30, Math.round(45 + progressGap * 2));
  const intervals = 6;
  const predictedProgressSeries = Array.from({ length: intervals }, (_, index) => ({
    period: index === intervals - 1 ? predictedCompletionDate : shiftMonth(project.lastUpdated, index + 1),
    predictedProgress: round(project.physicalProgress + ((100 - project.physicalProgress) * (index + 1)) / intervals),
  }));
  return {
    projectId,
    projectName: project.name,
    asOfDate: project.lastUpdated,
    originalCompletionDate: project.originalCompletionDate,
    currentPhysicalProgress: project.physicalProgress,
    scheduleOverrunProbability: undefined,
    predictedClass: undefined,
    scheduleOverrunThresholdDays: 90,
    predictedCompletionVarianceDays: expectedDelayDays,
    expectedDelayDays,
    predictedCompletionDate,
    predictedCompletionDateLower: shiftDays(predictedCompletionDate, -spread),
    predictedCompletionDateUpper: shiftDays(predictedCompletionDate, spread),
    predictedDelayDaysLower: Math.max(0, expectedDelayDays - spread),
    predictedDelayDaysUpper: expectedDelayDays + spread,
    uncertaintyMethod: 'deterministic sensitivity band; not calibrated',
    uncertaintyIsFormallyCalibrated: false,
    predictedProgressSeries,
    progressProjectionMethod: 'linear path from current progress to deterministic estimated completion',
    progressProjectionIsDirectModelOutput: false,
    modelName: 'Deterministic Demo Schedule Projection',
    modelVersion: 'demo-schedule-rule-v1',
    trainingDataVersion: 'none-demo-fixture-only',
    regressionModel: 'transparent_rule_projection',
    classificationModel: undefined,
    featureList: ['physical_progress', 'planned_progress', 'financial_progress', 'delay_days', 'delayed_milestones'],
    features: {
      physicalProgress: project.physicalProgress,
      plannedProgress: project.expectedProgress,
      financialProgress: project.financialProgress,
      delayDays: project.delayDays,
      delayedMilestones: project.milestones.filter(item => item.status === 'Delayed').length,
    },
    evaluationMetrics: {
      classification: { omission_reason: 'No classifier is executed in synthetic demonstration mode.' },
    },
    explanation: unavailableExplanation(project, 'schedule'),
    generatedAt: `${project.lastUpdated}T12:00:00Z`,
    synthetic: true,
  };
}

export function buildMockScenarioConfiguration(projectId: string): ScenarioConfiguration {
  const project = projectFor(projectId);
  const delayedMilestones = project.milestones.filter(item => item.status === 'Delayed').length;
  return {
    projectId,
    projectName: project.name,
    asOfDate: project.lastUpdated,
    supportedVariables: [
      { code: 'physical_progress', label: 'Physical progress', description: 'Temporary scenario value for completed physical work.', inputType: 'number', currentValue: project.physicalProgress, minimum: 0, maximum: 100, options: [], models: ['cost', 'schedule'], affectedFeatures: ['physical_progress', 'progress_variance'] },
      { code: 'planned_progress', label: 'Planned progress', description: 'Temporary planned-progress assumption for comparison.', inputType: 'number', currentValue: project.expectedProgress, minimum: 0, maximum: 100, options: [], models: ['cost', 'schedule'], affectedFeatures: ['planned_progress', 'progress_variance'] },
      { code: 'financial_progress', label: 'Financial progress', description: 'Temporary expenditure-progress assumption.', inputType: 'number', currentValue: project.financialProgress, minimum: 0, maximum: 100, options: [], models: ['cost'], affectedFeatures: ['financial_progress', 'expenditure_mismatch'] },
      { code: 'schedule_delay_days', label: 'Current schedule delay', description: 'Temporary delay assumption in calendar days.', inputType: 'integer', currentValue: project.delayDays, minimum: 0, maximum: 5000, options: [], models: ['cost', 'schedule'], affectedFeatures: ['delay_days'] },
      { code: 'delayed_milestone_count', label: 'Delayed milestones', description: 'Temporary count of delayed milestones after an intervention.', inputType: 'integer', currentValue: delayedMilestones, minimum: 0, maximum: project.milestones.length, options: [], models: ['schedule'], affectedFeatures: ['delayed_milestones'] },
    ],
    unsupportedVariables: [
      { code: 'resource_availability', label: 'Resource availability', reason: 'The demonstration project fixture has no validated resource-availability field.' },
      { code: 'clearance_status', label: 'Clearance status', reason: 'The demonstration project fixture does not provide a canonical clearance status.' },
      { code: 'land_acquisition_progress', label: 'Land acquisition progress', reason: 'No reliable numeric land-acquisition field is available for every demonstration project.' },
    ],
    modelVersions: { cost: 'demo-cost-rule-v1', schedule: 'demo-schedule-rule-v1' },
    persistsChanges: false,
    disclaimer: 'Scenario/demo estimate - not a guaranteed project outcome.',
    methodology: 'deterministic_demo',
  };
}

function outcomeFromProject(project: Project, delayedMilestones: number): ScenarioOutcome {
  const cost = buildMockCostProjection(project.id, project);
  const schedule = buildMockScheduleProjection(project.id, {
    ...project,
    milestones: project.milestones.map((item, index) => (
      index < delayedMilestones ? { ...item, status: 'Delayed' as const } : item.status === 'Delayed' ? { ...item, status: 'On Track' as const } : item
    )),
  });
  const risk = computeRiskAssessment(project);
  return {
    risk: {
      overallScore: risk.overallScore,
      riskLevel: risk.riskLevel === 'High Risk' ? 'high_risk' : risk.riskLevel.toLowerCase() as 'healthy' | 'watch' | 'critical',
      costRisk: risk.costOverrunRisk,
      scheduleRisk: risk.scheduleDelayRisk,
      implementationRisk: risk.implementationRisk,
    },
    cost: {
      predictedFinalCost: cost.predictedFinalCost,
      predictedEscalationAmount: cost.predictedEscalationAmount,
      predictedEscalationPercentage: cost.predictedEscalationPercentage,
      modelVersion: cost.modelVersion,
    },
    schedule: {
      expectedDelayDays: schedule.expectedDelayDays,
      predictedCompletionDate: schedule.predictedCompletionDate,
      modelVersion: schedule.modelVersion,
    },
  };
}

export function simulateMockScenario(
  projectId: string,
  changes: Record<string, string | number>,
  assumptionNote?: string,
): ScenarioSimulation {
  const project = projectFor(projectId);
  const configuration = buildMockScenarioConfiguration(projectId);
  const currentDelayed = project.milestones.filter(item => item.status === 'Delayed').length;
  const scenarioDelayed = Number(changes.delayedMilestoneCount ?? currentDelayed);
  const scenarioProject: Project = {
    ...project,
    physicalProgress: Number(changes.physicalProgress ?? project.physicalProgress),
    expectedProgress: Number(changes.plannedProgress ?? project.expectedProgress),
    financialProgress: Number(changes.financialProgress ?? project.financialProgress),
    delayDays: Number(changes.scheduleDelayDays ?? project.delayDays),
    milestones: project.milestones.map((item, index) => (
      index < scenarioDelayed ? { ...item, status: 'Delayed' as const } : item.status === 'Delayed' ? { ...item, status: 'On Track' as const } : item
    )),
  };
  scenarioProject.riskAssessment = computeRiskAssessment(scenarioProject);
  const before = outcomeFromProject(project, currentDelayed);
  const scenario = outcomeFromProject(scenarioProject, scenarioDelayed);
  const variableByCamel = Object.fromEntries(configuration.supportedVariables.map(variable => [
    variable.code.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), variable,
  ]));
  const changedVariables = Object.entries(changes).flatMap(([code, value]) => {
    const variable = variableByCamel[code];
    if (!variable) return [];
    return [{
      code: variable.code,
      label: variable.label,
      beforeValue: variable.currentValue,
      scenarioValue: value,
      affectedModels: variable.models,
      affectedFeatures: variable.affectedFeatures,
    }];
  });
  return {
    projectId,
    projectName: project.name,
    asOfDate: project.lastUpdated,
    generatedAt: new Date().toISOString(),
    before,
    scenario,
    changedVariables,
    explanation: {
      summaries: [
        `Overall deterministic risk changes by ${scenario.risk.overallScore - before.risk.overallScore} points.`,
        `Estimated delay changes by ${(scenario.schedule.expectedDelayDays - before.schedule.expectedDelayDays).toLocaleString()} days.`,
        `Estimated final cost changes by ₹${round(scenario.cost.predictedFinalCost - before.cost.predictedFinalCost, 2).toLocaleString('en-IN')} Cr.`,
      ],
      driverChanges: [],
      numericalSource: 'Transparent demo rules applied to the temporary scenario values; no trained model or SHAP output is used.',
    },
    assumptionNote: assumptionNote?.trim() || undefined,
    persistsChanges: false,
    disclaimer: configuration.disclaimer,
    methodology: 'deterministic_demo',
  };
}

function dependencyStatus(status: Project['milestones'][number]['status']): DependencyNodeStatus {
  return status.toLowerCase().replace(' ', '_') as DependencyNodeStatus;
}

export function buildMockDependencyGraph(projectId: string): DependencyGraph {
  const project = projectFor(projectId);
  const firstDelayedIndex = project.milestones.findIndex(item => item.status === 'Delayed');
  const nodes = project.milestones.map((milestone, index) => ({
    id: `${projectId}-${milestone.id}`,
    code: `${projectId}-M${index + 1}`,
    name: milestone.name,
    nodeType: milestone.nodeType ?? 'milestone' as const,
    sequenceNo: index + 1,
    plannedDate: milestone.plannedDate,
    actualDate: milestone.actualDate ?? null,
    forecastDate: milestone.actualDate ?? null,
    status: dependencyStatus(milestone.status),
    delayDays: milestone.delayDays ?? null,
    incomingDependencies: index === 0 ? 0 : 1,
    outgoingDependencies: index === project.milestones.length - 1 ? 0 : 1,
    isDelayedTrigger: milestone.status === 'Delayed',
    potentiallyAffected: firstDelayedIndex >= 0 && index > firstDelayedIndex,
    dependencyDepth: firstDelayedIndex >= 0 && index > firstDelayedIndex ? index - firstDelayedIndex : null,
    triggerMilestoneIds: firstDelayedIndex >= 0 && index > firstDelayedIndex ? [`${projectId}-${project.milestones[firstDelayedIndex].id}`] : [],
  }));
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `DEMO-EDGE-${projectId}-${index + 1}`,
    upstreamMilestoneId: node.id,
    downstreamMilestoneId: nodes[index + 1].id,
    dependencyType: 'finish_to_start' as const,
    lagDays: 0,
    sourceSystem: 'DRISHTI synthetic demo planning register',
    sourceReference: `DEMO-SEQUENCE-${index + 1}`,
    metadata: { syntheticDemo: true, explicitlyDeclaredFixtureEdge: true },
    createdAt: `${project.lastUpdated}T12:00:00Z`,
    potentiallyAffected: firstDelayedIndex >= 0 && index >= firstDelayedIndex,
  }));
  const propagationPaths = firstDelayedIndex < 0 ? [] : nodes.slice(firstDelayedIndex + 1).map((target, offset) => {
    const pathNodes = nodes.slice(firstDelayedIndex, firstDelayedIndex + offset + 2);
    return {
      sourceMilestoneId: nodes[firstDelayedIndex].id,
      sourceCode: nodes[firstDelayedIndex].code,
      targetMilestoneId: target.id,
      targetCode: target.code,
      depth: offset + 1,
      milestoneIds: pathNodes.map(item => item.id),
      milestoneCodes: pathNodes.map(item => item.code),
      milestoneNames: pathNodes.map(item => item.name),
    };
  });
  return {
    projectId,
    projectName: project.name,
    nodes,
    edges,
    propagationPaths,
    summary: {
      planningNodeCount: nodes.length,
      explicitDependencyCount: edges.length,
      delayedTriggerCount: nodes.filter(item => item.isDelayedTrigger).length,
      potentiallyAffectedCount: nodes.filter(item => item.potentiallyAffected).length,
      maximumDependencyDepth: Math.max(0, ...propagationPaths.map(item => item.depth)),
      analysisKind: 'explicit_dependency_risk_propagation',
      causalityClaimed: false,
      statement: 'Synthetic demo edges are explicitly declared fixture relationships for interface testing. Highlighted downstream nodes are exposure candidates only; downstream delay is not asserted.',
    },
  };
}

export function buildMockEvidenceChain(projectId: string): ProjectEvidenceChain {
  const project = projectFor(projectId);
  const cost = buildMockCostProjection(projectId);
  const schedule = buildMockScheduleProjection(projectId);
  const sourceValues = [
    { label: 'Approved cost', value: project.approvedCost, unit: '₹ Cr', field: 'approvedCost', sourceTable: 'synthetic_project_fixture', sourceRecordId: project.id, timestamp: project.lastUpdated },
    { label: 'Revised cost', value: project.revisedCost, unit: '₹ Cr', field: 'revisedCost', sourceTable: 'synthetic_project_fixture', sourceRecordId: project.id, timestamp: project.lastUpdated },
    { label: 'Physical progress', value: project.physicalProgress, unit: '%', field: 'physicalProgress', sourceTable: 'synthetic_project_fixture', sourceRecordId: project.id, timestamp: project.lastUpdated },
    { label: 'Planned progress', value: project.expectedProgress, unit: '%', field: 'expectedProgress', sourceTable: 'synthetic_project_fixture', sourceRecordId: project.id, timestamp: project.lastUpdated },
    { label: 'Reported delay', value: project.delayDays, unit: 'days', field: 'delayDays', sourceTable: 'synthetic_project_fixture', sourceRecordId: project.id, timestamp: project.lastUpdated },
  ];
  const commonSource = {
    stage: 'source_data' as const,
    title: 'Synthetic demonstration project snapshot',
    description: 'Values below come directly from the local synthetic project fixture.',
    provenanceType: 'stored_data' as const,
    timestamp: project.lastUpdated,
    sourceTable: 'synthetic_project_fixture',
    sourceRecordId: project.id,
    dataVersion: 'demo-portfolio-v1',
    values: sourceValues,
  };
  return {
    projectId,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    chains: [
      {
        chainId: `DEMO-RISK-${projectId}`,
        subjectType: 'risk',
        subjectId: projectId,
        title: 'Deterministic project risk score',
        asOfDate: project.lastUpdated,
        nodes: [
          commonSource,
          {
            stage: 'derived_signal', title: 'Transparent risk factors', provenanceType: 'calculated_analytics', ruleVersion: 'deterministic-risk-v1',
            values: project.riskAssessment.drivers.map(driver => ({ label: driver.name, value: driver.value, unit: '/100', formula: driver.description })),
          },
          {
            stage: 'prediction', title: 'Rule-based project health assessment', provenanceType: 'documented_rule', ruleVersion: 'deterministic-risk-v1',
            values: [
              { label: 'Overall risk score', value: project.riskAssessment.overallScore, unit: '/100' },
              { label: 'Risk level', value: project.riskAssessment.riskLevel },
            ],
          },
          {
            stage: 'explanation', title: 'Highest transparent risk drivers', provenanceType: 'calculated_analytics',
            values: project.riskAssessment.drivers.slice(0, 3).map(driver => ({ label: driver.name, value: driver.value, unit: '/100', formula: driver.description })),
          },
        ],
      },
      {
        chainId: `DEMO-COST-${projectId}`,
        subjectType: 'prediction',
        subjectId: projectId,
        title: 'Cost deterministic demonstration estimate',
        asOfDate: project.lastUpdated,
        nodes: [
          commonSource,
          {
            stage: 'derived_signal', title: 'Cost and progress variance signals', provenanceType: 'calculated_analytics', ruleVersion: cost.modelVersion,
            values: [
              { label: 'Current cost escalation', value: costOverrunPct(project.approvedCost, project.revisedCost), unit: '%' },
              { label: 'Progress gap', value: project.expectedProgress - project.physicalProgress, unit: 'percentage points' },
            ],
          },
          {
            stage: 'prediction', title: 'Deterministic cost projection', provenanceType: 'documented_rule', ruleVersion: cost.modelVersion,
            values: [
              { label: 'Estimated final cost', value: cost.predictedFinalCost, unit: '₹ Cr' },
              { label: 'Estimated escalation', value: cost.predictedEscalationPercentage, unit: '%' },
            ],
          },
          {
            stage: 'explanation', title: 'Rule explanation — no SHAP used', provenanceType: 'documented_rule', ruleVersion: cost.modelVersion,
            values: cost.explanation.rules.triggers.map(trigger => ({ label: trigger.featureLabel, value: trigger.actualValue, unit: trigger.unit, formula: trigger.explanation })),
          },
        ],
      },
      {
        chainId: `DEMO-SCHEDULE-${projectId}`,
        subjectType: 'prediction',
        subjectId: projectId,
        title: 'Schedule deterministic demonstration estimate',
        asOfDate: project.lastUpdated,
        nodes: [
          commonSource,
          {
            stage: 'derived_signal', title: 'Schedule variance signals', provenanceType: 'calculated_analytics', ruleVersion: schedule.modelVersion,
            values: [
              { label: 'Progress gap', value: project.expectedProgress - project.physicalProgress, unit: 'percentage points' },
              { label: 'Delayed milestones', value: project.milestones.filter(item => item.status === 'Delayed').length },
            ],
          },
          {
            stage: 'prediction', title: 'Deterministic schedule projection', provenanceType: 'documented_rule', ruleVersion: schedule.modelVersion,
            values: [
              { label: 'Estimated delay', value: schedule.expectedDelayDays, unit: 'days' },
              { label: 'Estimated completion', value: schedule.predictedCompletionDate },
            ],
          },
          {
            stage: 'explanation', title: 'Rule explanation — no SHAP used', provenanceType: 'documented_rule', ruleVersion: schedule.modelVersion,
            values: schedule.explanation.rules.triggers.map(trigger => ({ label: trigger.featureLabel, value: trigger.actualValue, unit: trigger.unit, formula: trigger.explanation })),
          },
        ],
      },
    ],
    omissions: ['No trained ML inference, SHAP values, persisted warning, or intervention is included in this synthetic demonstration evidence chain.'],
    methodology: 'Synthetic demo evidence is built only from local fixture values and documented deterministic formulas.',
  };
}
