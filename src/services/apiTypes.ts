import type { AnalyticsDataset, DataConfidence, PortfolioChanges, PortfolioSummary, ProjectHistory } from '../types';

export interface ApiRiskBrief {
  overallScore: number;
  riskLevel: string;
}

export interface ApiProject {
  id: string;
  databaseId: string;
  name: string;
  ministry: string;
  implementingAgency?: string | null;
  department?: string | null;
  sector: string;
  projectType?: string | null;
  state: string;
  states: string[];
  description?: string | null;
  status: string;
  currency: string;
  approvedCost: number;
  revisedCost: number;
  expenditure: number;
  physicalProgress: number;
  plannedProgress: number;
  financialProgress: number;
  originalCompletionDate?: string | null;
  revisedCompletionDate?: string | null;
  delayDays: number;
  lastReportedAt?: string | null;
  costBreakdown: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  risk?: ApiRiskBrief | null;
  milestones?: ApiMilestone[];
}

export interface ApiMilestone {
  id: string;
  code: string;
  name: string;
  nodeType?: 'milestone' | 'package';
  sequenceNo: number;
  plannedDate: string;
  forecastDate?: string | null;
  actualDate?: string | null;
  status: string;
  delayDays?: number | null;
  weight?: number | null;
}

export interface ApiRiskDriver {
  code: string;
  name: string;
  impact: string;
  value: number;
  weightedContribution?: number | null;
  rank?: number | null;
  description?: string | null;
  evidence: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ApiRiskComponent {
  available: boolean;
  reason?: string | null;
  overallScore?: number | null;
  costRisk?: number | null;
  scheduleRisk?: number | null;
  implementationRisk?: number | null;
  factors?: Record<string, number | null>;
  signals?: Record<string, number | null>;
  provenance?: Record<string, unknown>;
}

export interface ApiRisk {
  id: string;
  projectId: string;
  projectName: string;
  assessedAt: string;
  assessmentPeriod?: string | null;
  overallScore: number;
  riskLevel: string;
  costOverrunRisk?: number | null;
  scheduleDelayRisk?: number | null;
  implementationRisk?: number | null;
  progressFactor?: number | null;
  costFactor?: number | null;
  scheduleFactor?: number | null;
  milestoneFactor?: number | null;
  expenditureFactor?: number | null;
  methodology: string;
  explanation?: string | null;
  components?: Record<string, ApiRiskComponent>;
  ensemble?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  drivers: ApiRiskDriver[];
}

export interface ApiRiskTrajectory {
  projectId: string;
  trendDirection: string;
  points: Array<{
    snapshotId: string;
    reportingMonth: string;
    assessedAt: string;
    overallRisk: number;
    costRisk?: number | null;
    scheduleRisk?: number | null;
    implementationRisk?: number | null;
    riskLevel: string;
    overallChange?: number | null;
    trendDirection: string;
    meaningfulIncrease: boolean;
  }>;
  changes: Array<{
    fromMonth: string;
    toMonth: string;
    overallChange: number;
    costRiskChange?: number | null;
    scheduleRiskChange?: number | null;
    implementationRiskChange?: number | null;
    trendDirection: string;
    meaningfulIncrease: boolean;
    driverChanges: Array<{
      code: string;
      name: string;
      changeType: string;
      previousValue?: number | null;
      currentValue?: number | null;
      valueDelta: number;
      weightedContributionDelta: number;
      description?: string | null;
    }>;
  }>;
  totalMonths: number;
  thresholds: {
    stableBandPoints: number;
    meaningfulIncreasePoints: number;
    rapidIncreasePoints: number;
  };
}

export interface ApiWarning {
  id: string;
  databaseId: string;
  projectId: string;
  projectName: string;
  ministry: string;
  sector?: string;
  state?: string;
  severity: string;
  status: string;
  alertType: string;
  title: string;
  description: string;
  triggerRule?: string | null;
  evidence: unknown[];
  detectedAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  assignedToName?: string | null;
  sourceType: string;
  sourceReference?: string | null;
  sourceUpdateId?: string | null;
  currentValue?: unknown;
  previousValue?: unknown;
  recommendedAction?: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  metadata: Record<string, unknown>;
}

export interface ApiIntervention {
  id: string;
  databaseId: string;
  projectId: string;
  projectName: string;
  ministry: string;
  warningId?: string | null;
  warningTitle?: string | null;
  warningSeverity?: string | null;
  issue: string;
  recommendedAction: string;
  priority: string;
  status: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
  dueDate?: string | null;
  openedAt: string;
  resolvedAt?: string | null;
  resolutionSummary?: string | null;
  escalatedAt?: string | null;
  escalationReason?: string | null;
  escalatedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiInterventionUpdate {
  id: string;
  interventionId: string;
  updateType: string;
  status?: string | null;
  note?: string | null;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdBy?: string | null;
  createdByName?: string | null;
  occurredAt: string;
}

export interface ApiInterventionHistory {
  interventionId: string;
  items: ApiInterventionUpdate[];
  total: number;
}

export interface ApiInterventionOfficer {
  id: string;
  fullName?: string | null;
  email: string;
  designation?: string | null;
  role: string;
}

export interface ApiPrediction {
  id: string;
  projectId: string;
  projectName: string;
  modelName: string;
  modelVersion: string;
  predictionType: string;
  horizonMonths?: number | null;
  targetDate?: string | null;
  predictedValue?: number | null;
  predictedClass?: string | null;
  confidence?: number | null;
  lowerBound?: number | null;
  upperBound?: number | null;
  outputPayload: Record<string, unknown>;
  generatedAt: string;
  validUntil?: string | null;
}

export interface ApiList<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}

export interface ApiPredictionList {
  projectId: string;
  items: ApiPrediction[];
}

export type ApiProjectHistory = ProjectHistory;
export type ApiDataConfidence = Omit<DataConfidence, 'rating' | 'latestReportingMonth'> & {
  rating: string;
  latestReportingMonth?: string | null;
};
export type ApiPortfolioSummary = PortfolioSummary;
export type ApiPortfolioChanges = Omit<PortfolioChanges,
  'newlyHighRisk' | 'newlyCritical' | 'recovered' | 'significantCostRiskIncrease' |
  'significantScheduleRiskIncrease' | 'capitalExposure' | 'emergingRiskDrivers' | 'dimensions'
> & {
  newlyHighRisk: ApiProjectChangeMetric;
  newlyCritical: ApiProjectChangeMetric;
  recovered: ApiProjectChangeMetric;
  significantCostRiskIncrease: ApiProjectChangeMetric;
  significantScheduleRiskIncrease: ApiProjectChangeMetric;
  capitalExposure: Omit<PortfolioChanges['capitalExposure'], 'projects'> & { projects: ApiComparisonProject[] };
  emergingRiskDrivers: Array<Omit<PortfolioChanges['emergingRiskDrivers'][number], 'projects'> & { projects: ApiComparisonProject[] }>;
  dimensions: {
    sectors: ApiDimensionChange[];
    ministries: ApiDimensionChange[];
    states: ApiDimensionChange[];
  };
};
export type ApiComparisonProject = Omit<PortfolioChanges['newlyHighRisk']['projects'][number], 'previousRiskLevel' | 'currentRiskLevel'> & {
  previousRiskLevel: string;
  currentRiskLevel: string;
};
export type ApiProjectChangeMetric = { count: number; projects: ApiComparisonProject[] };
export type ApiDimensionChange = Omit<PortfolioChanges['dimensions']['sectors'][number], 'projects'> & { projects: ApiComparisonProject[] };
export type ApiAnalyticsDataset = AnalyticsDataset;
