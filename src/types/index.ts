// =============================================================================
// DRISHTI — Type Definitions
// Infrastructure Project Monitoring & Intelligence Platform
// =============================================================================

export type RiskLevel = 'Healthy' | 'Watch' | 'High Risk' | 'Critical';
export type ProjectStatus = 'Active' | 'Completed' | 'On Hold' | 'Under Review';
export type MilestoneStatus = 'Completed' | 'On Track' | 'At Risk' | 'Delayed';
export type WarningSeverity = 'Critical' | 'High' | 'Moderate' | 'Low';
export type WarningStatus = 'New' | 'Acknowledged' | 'Assigned' | 'Under Review' | 'Resolved';
export type InterventionPriority = 'Critical' | 'High' | 'Moderate' | 'Medium' | 'Low';
export type InterventionStatus = 'Open' | 'Assigned' | 'In Progress' | 'Escalated' | 'Resolved' | 'Overdue';
export type UserRole = 'Administrator' | 'Monitoring Officer' | 'Analyst' | 'Executive';
export type RiskTrendDirection = 'Improving' | 'Stable' | 'Deteriorating' | 'Rapidly Deteriorating';

export interface Milestone {
  id: string;
  name: string;
  nodeType?: 'milestone' | 'package';
  plannedDate: string;
  actualDate?: string;
  status: MilestoneStatus;
  delayDays?: number;
}

export interface CostBreakdown {
  materialCosts: number;
  scopeChanges: number;
  delayedExecution: number;
  contractualChanges: number;
  otherFactors: number;
}

export interface RiskAssessment {
  overallScore: number;
  riskLevel: RiskLevel;
  costOverrunRisk: number;
  scheduleDelayRisk: number;
  implementationRisk: number;
  progressFactor: number;
  costFactor: number;
  scheduleFactor: number;
  milestoneFactor: number;
  expenditureFactor: number;
  methodology: string;
  components: Record<string, RiskComponentScore>;
  ensemble: Record<string, unknown>;
  provenance: Record<string, unknown>;
  drivers: RiskDriver[];
}

export interface RiskComponentScore {
  available: boolean;
  reason?: string;
  overallScore?: number;
  costRisk?: number;
  scheduleRisk?: number;
  implementationRisk?: number;
  factors?: Record<string, number | null>;
  signals?: Record<string, number | null>;
  provenance: Record<string, unknown>;
}

export interface RiskDriver {
  name: string;
  impact: 'High' | 'Medium' | 'Low';
  value: number; // 0–100
  description: string;
  component?: 'rule' | 'statistical' | 'ml';
}

export interface RiskTrajectoryPoint {
  snapshotId: string;
  reportingMonth: string;
  assessedAt: string;
  overallRisk: number;
  costRisk?: number;
  scheduleRisk?: number;
  implementationRisk?: number;
  riskLevel: RiskLevel;
  overallChange?: number;
  trendDirection: RiskTrendDirection;
  meaningfulIncrease: boolean;
}

export interface RiskDriverChange {
  code: string;
  name: string;
  changeType: 'Added' | 'Removed' | 'Increased' | 'Decreased';
  previousValue?: number;
  currentValue?: number;
  valueDelta: number;
  weightedContributionDelta: number;
  description?: string;
}

export interface RiskTrajectoryChange {
  fromMonth: string;
  toMonth: string;
  overallChange: number;
  costRiskChange?: number;
  scheduleRiskChange?: number;
  implementationRiskChange?: number;
  trendDirection: RiskTrendDirection;
  meaningfulIncrease: boolean;
  driverChanges: RiskDriverChange[];
}

export interface RiskTrajectory {
  projectId: string;
  trendDirection: RiskTrendDirection;
  points: RiskTrajectoryPoint[];
  changes: RiskTrajectoryChange[];
  totalMonths: number;
  thresholds: {
    stableBandPoints: number;
    meaningfulIncreasePoints: number;
    rapidIncreasePoints: number;
  };
}

export type DataConfidenceRating = 'High' | 'Moderate' | 'Low' | 'Very Low';

export interface DataConfidenceComponent {
  code: string;
  label: string;
  score: number;
  weight: number;
  weightedScore: number;
  reasons: string[];
  missingFields: string[];
  staleFields: string[];
  evidence: Record<string, unknown>;
}

export interface DataConfidence {
  projectId: string;
  projectName: string;
  scoreType: 'data_quality';
  isPredictionProbability: false;
  overallScore: number;
  rating: DataConfidenceRating;
  asOfDate: string;
  latestReportingMonth?: string;
  components: DataConfidenceComponent[];
  reasonsLoweringConfidence: string[];
  missingFields: string[];
  staleFields: string[];
  configuration: {
    formulaVersion: string;
    weights: Record<string, number>;
    freshDays: number;
    staleDays: number;
    historyTargetMonths: number;
    anomalyPenalty: number;
    validationIssuePenalty: number;
    statement: string;
  };
}

export interface Project {
  id: string;
  name: string;
  ministry: string;
  department: string;
  sector: string;
  state: string;
  implementingAgency: string;
  status: ProjectStatus;
  approvedCost: number; // in Cr
  revisedCost: number;
  expenditure: number;
  physicalProgress: number; // 0–100
  expectedProgress: number; // 0–100
  financialProgress: number; // 0–100
  originalCompletionDate: string;
  revisedCompletionDate: string;
  delayDays: number;
  lastUpdated: string;
  milestones: Milestone[];
  costBreakdown: CostBreakdown;
  riskAssessment: RiskAssessment;
  latitude: number | null;
  longitude: number | null;
  description: string;
  projectType: string;
}

export interface Ministry {
  id: string;
  name: string;
  shortName: string;
  totalProjects: number;
  highRisk: number;
  critical: number;
  costExposure: number;
  scheduleExposure: number;
  riskTrend: 'up' | 'down' | 'stable';
}

export interface Warning {
  id: string;
  severity: WarningSeverity;
  projectId: string;
  projectName: string;
  ministry: string;
  sector: string;
  state: string;
  title: string;
  description: string;
  trigger: string;
  detectedDate: string;
  status: WarningStatus;
  assignedTo?: string;
  evidence: string[];
  evidenceDetails?: unknown[];
  alertType: string;
  sourceType?: string;
  sourceReference?: string;
  currentValue?: unknown;
  previousValue?: unknown;
  recommendedAction?: string;
  firstDetectedDate?: string;
  lastDetectedDate?: string;
  occurrenceCount?: number;
}

export interface WarningUpdateInput {
  status: Exclude<WarningStatus, 'New'>;
  assignedToName?: string;
}

export interface Intervention {
  id: string;
  projectId: string;
  projectName: string;
  ministry: string;
  warningId?: string;
  warningTitle?: string;
  warningSeverity?: WarningSeverity;
  issue: string;
  recommendedAction: string;
  priority: InterventionPriority;
  status: InterventionStatus;
  assignedTo?: string;
  assignedToId?: string;
  dueDate: string;
  createdDate: string;
  resolvedDate?: string;
  resolutionSummary?: string;
  escalatedDate?: string;
  escalationReason?: string;
  notes?: string;
}

export interface InterventionUpdate {
  id: string;
  interventionId: string;
  updateType: string;
  status?: InterventionStatus;
  note?: string;
  createdBy?: string;
  createdByName?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface InterventionOfficer {
  id: string;
  fullName?: string;
  email: string;
  designation?: string;
  role: string;
}

export interface PortfolioMetrics {
  totalProjects: number;
  portfolioValue: number;
  atRiskProjects: number;
  atRiskChange: number;
  costOverrunExposure: number;
  scheduleRiskProjects: number;
  interventionRequired: number;
  healthy: number;
  watch: number;
  highRisk: number;
  critical: number;
}

export interface SectorRisk {
  sector: string;
  totalProjects: number;
  riskScore: number;
  critical: number;
  highRisk: number;
  watch: number;
  healthy: number;
}

export interface TrendDataPoint {
  month: string;
  riskScore: number;
  atRisk: number;
  critical: number;
  previous: number;
}

export interface InsightCard {
  id: string;
  title: string;
  description: string;
  category: 'attention' | 'risk' | 'cost' | 'schedule' | 'performance';
  severity: 'Critical' | 'High' | 'Moderate' | 'Informational';
  projectIds: string[];
  metric?: string;
  metricValue?: string;
}

export interface ProjectMonthlyUpdate {
  reportingMonth: string;
  approvedCost?: number;
  revisedCost?: number;
  expenditure?: number;
  physicalProgress?: number;
  plannedProgress?: number;
  financialProgress?: number;
  originalCompletionDate?: string;
  revisedCompletionDate?: string;
  forecastCompletionDate?: string;
  delayDays?: number;
  milestonesTotal?: number;
  milestonesCompleted?: number;
  milestonesDelayed?: number;
  milestonesAtRisk?: number;
  landAcquisitionProgress?: number;
  clearanceStatus: Record<string, unknown>;
  contractStatus?: string;
  issues: string[];
  remarks?: string;
}

export interface ProjectHistory {
  projectId: string;
  monthlyUpdates: ProjectMonthlyUpdate[];
  costHistory: Array<{
    effectiveDate: string;
    approvedCost?: number;
    revisedCost?: number;
    expenditure?: number;
    estimatedAtCompletion?: number;
    changeAmount?: number;
    changeReason?: string;
  }>;
  scheduleHistory: Array<{
    effectiveDate: string;
    originalCompletionDate?: string;
    revisedCompletionDate?: string;
    forecastCompletionDate?: string;
    delayDays?: number;
    physicalProgress?: number;
    plannedProgress?: number;
    revisionReason?: string;
  }>;
}

export interface PortfolioSummary {
  totalProjects: number;
  portfolioValue: number;
  totalExpenditure: number;
  costOverrunExposure: number;
  delayedProjects: number;
  activeWarnings: number;
  openInterventions: number;
  healthy: number;
  watch: number;
  highRisk: number;
  critical: number;
}

export interface ComparisonProject {
  projectId: string;
  projectName: string;
  ministry: string;
  sector: string;
  state: string;
  previousRiskLevel: RiskLevel;
  currentRiskLevel: RiskLevel;
  previousOverallRisk?: number;
  currentOverallRisk?: number;
  previousCostRisk?: number;
  currentCostRisk?: number;
  previousScheduleRisk?: number;
  currentScheduleRisk?: number;
  previousRevisedCost?: number;
  currentRevisedCost?: number;
  changeValue?: number;
  detail?: string;
}

export interface ProjectChangeMetric {
  count: number;
  projects: ComparisonProject[];
}

export interface PortfolioWarningChange {
  warningId: string;
  title: string;
  alertType: string;
  severity: string;
  status: string;
  firstDetectedAt: string;
  resolvedAt?: string;
  projectId: string;
  projectName: string;
  ministry: string;
  sector: string;
  state: string;
}

export interface PortfolioChanges {
  comparisonAvailable: boolean;
  latestPeriod?: string;
  previousPeriod?: string;
  headline: string;
  summaryPoints: string[];
  newlyHighRisk: ProjectChangeMetric;
  newlyCritical: ProjectChangeMetric;
  recovered: ProjectChangeMetric;
  significantCostRiskIncrease: ProjectChangeMetric;
  significantScheduleRiskIncrease: ProjectChangeMetric;
  newlyOverdueMilestones: {
    count: number;
    projectCount: number;
    projects: Array<{ projectId: string; projectName: string; ministry: string; sector: string; state: string; newlyOverdueCount: number }>;
    milestones: Array<{ milestoneId: string; milestoneCode: string; milestoneName: string; plannedDate: string; projectId: string; projectName: string; ministry: string; sector: string; state: string }>;
  };
  newCriticalWarnings: { count: number; warnings: PortfolioWarningChange[] };
  resolvedWarnings: { count: number; warnings: PortfolioWarningChange[] };
  capitalExposure: {
    previous: number;
    current: number;
    change: number;
    changePercentage?: number;
    projects: ComparisonProject[];
  };
  emergingRiskDrivers: Array<{
    code: string;
    name: string;
    projectCount: number;
    averageIncrease: number;
    maximumIncrease: number;
    projects: ComparisonProject[];
  }>;
  dimensions: {
    sectors: PortfolioDimensionChange[];
    ministries: PortfolioDimensionChange[];
    states: PortfolioDimensionChange[];
  };
  dataAvailability: {
    latestSnapshotProjects: number;
    previousSnapshotProjects: number;
    comparableProjects: number;
    capitalComparableProjects: number;
    excludedProjects: number;
  };
  thresholds: {
    significantRiskIncreasePoints: number;
    emergingDriverIncreasePoints: number;
  };
}

export interface PortfolioDimensionChange {
  name: string;
  previousHighCriticalProjects: number;
  currentHighCriticalProjects: number;
  projectCountChange: number;
  previousCapitalExposed: number;
  currentCapitalExposed: number;
  capitalExposureChange: number;
  projects: ComparisonProject[];
}

export interface AnalyticsDataset {
  summary: Record<string, unknown>;
  series: Array<Record<string, unknown>>;
  breakdown: Array<Record<string, unknown>>;
}

export interface Prediction {
  id: string;
  projectId: string;
  projectName: string;
  modelName: string;
  modelVersion: string;
  predictionType: string;
  horizonMonths?: number;
  targetDate?: string;
  predictedValue?: number;
  predictedClass?: string;
  confidence?: number;
  lowerBound?: number;
  upperBound?: number;
  outputPayload: Record<string, unknown>;
  generatedAt: string;
  validUntil?: string;
}

export interface HistoricalFeatureComparison {
  feature: string;
  featureLabel: string;
  actualValue: unknown;
  referenceValue: unknown;
  percentile?: number;
  prevalencePct?: number;
  unit?: string;
  cohort: string;
  cohortSize: number;
  explanation: string;
}

export interface FeatureContribution {
  feature: string;
  featureLabel: string;
  actualValue: unknown;
  featureUnit?: string;
  contribution: number;
  contributionUnit: string;
  direction: 'risk_increasing' | 'protective' | 'neutral';
  humanExplanation: string;
  historicalComparison?: HistoricalFeatureComparison;
}

export interface PredictionExplanation {
  version: string;
  ml: {
    available: boolean;
    method: 'SHAP';
    reason?: string;
    explainer?: string;
    libraryVersion?: string;
    modelName?: string;
    modelVersion?: string;
    modelOutput?: string;
    target?: string;
    targetLabel?: string;
    outputUnit?: string;
    baseValue?: number;
    predictionValue?: number;
    additivityResidual?: number;
    positiveDrivers: FeatureContribution[];
    protectiveDrivers: FeatureContribution[];
    contributions: FeatureContribution[];
    numericalSource?: string;
    backgroundDefinition?: string;
  };
  rules: {
    method: string;
    triggers: Array<{
      ruleId: string;
      feature: string;
      featureLabel: string;
      actualValue: unknown;
      unit?: string;
      explanation: string;
    }>;
  };
  historical: {
    method: string;
    available: boolean;
    reason?: string;
    cohort?: string;
    cohortSize?: number;
    comparisons: HistoricalFeatureComparison[];
  };
}

export interface CostOverrunPrediction {
  projectId: string;
  projectName: string;
  asOfDate: string;
  originalApprovedCost: number;
  significantOverrunProbability?: number;
  predictedClass?: string;
  significantOverrunThresholdPct: number;
  predictedFinalCost: number;
  predictedEscalationAmount: number;
  predictedEscalationPercentage: number;
  predictedFinalCostLower: number;
  predictedFinalCostUpper: number;
  uncertaintyMethod: string;
  uncertaintyIsFormallyCalibrated: boolean;
  modelName: string;
  modelVersion: string;
  trainingDataVersion: string;
  regressionModel: string;
  classificationModel?: string;
  featureList: string[];
  features: Record<string, unknown>;
  evaluationMetrics: {
    regression?: {
      test?: { mae?: number; rmse?: number; r2?: number };
    };
    classification?: {
      omission_reason?: string;
      test?: { precision?: number; recall?: number; f1?: number; roc_auc?: number };
    };
  };
  explanation: PredictionExplanation;
  generatedAt: string;
  synthetic: false;
}

export interface ScheduleOverrunPrediction {
  projectId: string;
  projectName: string;
  asOfDate: string;
  originalCompletionDate: string;
  currentPhysicalProgress: number;
  scheduleOverrunProbability?: number;
  predictedClass?: string;
  scheduleOverrunThresholdDays: number;
  predictedCompletionVarianceDays: number;
  expectedDelayDays: number;
  predictedCompletionDate: string;
  predictedCompletionDateLower: string;
  predictedCompletionDateUpper: string;
  predictedDelayDaysLower: number;
  predictedDelayDaysUpper: number;
  uncertaintyMethod: string;
  uncertaintyIsFormallyCalibrated: boolean;
  predictedProgressSeries: Array<{
    period: string;
    predictedProgress: number;
  }>;
  progressProjectionMethod: string;
  progressProjectionIsDirectModelOutput: boolean;
  modelName: string;
  modelVersion: string;
  trainingDataVersion: string;
  regressionModel: string;
  classificationModel?: string;
  featureList: string[];
  features: Record<string, unknown>;
  evaluationMetrics: {
    regression?: {
      test?: { mae_days?: number; rmse_days?: number; r2?: number };
    };
    classification?: {
      omission_reason?: string;
      test?: { precision?: number; recall?: number; f1?: number; roc_auc?: number };
    };
  };
  explanation: PredictionExplanation;
  generatedAt: string;
  synthetic: false;
}

export interface ScenarioVariable {
  code: string;
  label: string;
  description: string;
  inputType: 'number' | 'integer' | 'select';
  currentValue?: string | number | null;
  minimum?: number;
  maximum?: number;
  options: string[];
  models: Array<'cost' | 'schedule'>;
  affectedFeatures: string[];
}

export interface ScenarioConfiguration {
  projectId: string;
  projectName: string;
  asOfDate: string;
  supportedVariables: ScenarioVariable[];
  unsupportedVariables: Array<{ code: string; label: string; reason: string }>;
  modelVersions: Record<string, string>;
  persistsChanges: false;
  disclaimer: string;
}

export interface ScenarioOutcome {
  risk: {
    overallScore: number;
    riskLevel: 'healthy' | 'watch' | 'high_risk' | 'critical';
    costRisk?: number;
    scheduleRisk?: number;
    implementationRisk?: number;
  };
  cost: {
    significantOverrunProbability?: number;
    predictedFinalCost: number;
    predictedEscalationAmount: number;
    predictedEscalationPercentage: number;
    modelVersion: string;
  };
  schedule: {
    scheduleOverrunProbability?: number;
    expectedDelayDays: number;
    predictedCompletionDate: string;
    modelVersion: string;
  };
}

export interface ScenarioSimulation {
  projectId: string;
  projectName: string;
  asOfDate: string;
  generatedAt: string;
  before: ScenarioOutcome;
  scenario: ScenarioOutcome;
  changedVariables: Array<{
    code: string;
    label: string;
    beforeValue?: unknown;
    scenarioValue?: unknown;
    affectedModels: Array<'cost' | 'schedule'>;
    affectedFeatures: string[];
  }>;
  explanation: {
    summaries: string[];
    driverChanges: Array<{
      model: 'cost' | 'schedule';
      feature: string;
      featureLabel: string;
      beforeContribution: number;
      scenarioContribution: number;
      contributionChange: number;
      contributionUnit: string;
      explanation: string;
    }>;
    numericalSource: string;
  };
  assumptionNote?: string;
  persistsChanges: false;
  disclaimer: string;
}

export type EvidenceStage = 'source_data' | 'derived_signal' | 'prediction' | 'explanation' | 'warning' | 'intervention';
export type EvidenceSubjectType = 'risk' | 'prediction' | 'warning';

export interface EvidenceValue {
  label: string;
  value?: unknown;
  unit?: string;
  field?: string;
  formula?: string;
  sourceTable?: string;
  sourceRecordId?: string;
  timestamp?: string;
}

export interface EvidenceNode {
  stage: EvidenceStage;
  title: string;
  description?: string;
  provenanceType: 'stored_data' | 'calculated_analytics' | 'trained_model' | 'documented_rule' | 'workflow_record';
  timestamp?: string;
  sourceTable?: string;
  sourceRecordId?: string;
  modelName?: string;
  modelVersion?: string;
  dataVersion?: string;
  ruleVersion?: string;
  values: EvidenceValue[];
}

export interface EvidenceChainItem {
  chainId: string;
  subjectType: EvidenceSubjectType;
  subjectId: string;
  title: string;
  severity?: string;
  status?: string;
  asOfDate?: string;
  nodes: EvidenceNode[];
}

export interface ProjectEvidenceChain {
  projectId: string;
  projectName: string;
  generatedAt: string;
  chains: EvidenceChainItem[];
  omissions: string[];
  methodology: string;
}

export interface InterventionCreateInput {
  projectId: string;
  warningId?: string;
  issue: string;
  recommendedAction: string;
  priority: InterventionPriority;
  assignedTo?: string;
  assignedToName?: string;
  dueDate?: string;
  notes?: string;
}

export interface InterventionUpdateInput {
  status?: InterventionStatus;
  priority?: InterventionPriority;
  assignedTo?: string | null;
  assignedToName?: string | null;
  dueDate?: string | null;
  resolutionSummary?: string;
  escalationReason?: string;
  recommendedAction?: string;
  remark?: string;
  notes?: string;
}
