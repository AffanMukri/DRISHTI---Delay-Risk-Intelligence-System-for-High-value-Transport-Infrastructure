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
  RiskLevel,
  Warning,
  WarningUpdateInput,
} from '../types';

export interface ProjectFilters {
  search?: string;
  ministry?: string;
  sector?: string;
  state?: string;
  riskLevel?: RiskLevel;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: keyof Project;
  sortDir?: 'asc' | 'desc';
}

export interface ProjectsResult {
  data: Project[];
  total: number;
  page: number;
  pageSize: number;
}

export type AnalyticsKind = 'cost' | 'schedule' | 'benchmark';

export interface ProjectDataService {
  getProjects(filters?: ProjectFilters, signal?: AbortSignal): Promise<ProjectsResult>;
  getProject(id: string, signal?: AbortSignal): Promise<Project | null>;
  getProjectHistory(id: string, signal?: AbortSignal): Promise<ProjectHistory>;
  getDataConfidence(id: string, signal?: AbortSignal): Promise<DataConfidence | null>;
  getPortfolioSummary(signal?: AbortSignal): Promise<PortfolioSummary>;
  getPortfolioChanges(signal?: AbortSignal): Promise<PortfolioChanges>;
  getRisks(signal?: AbortSignal): Promise<RiskAssessment[]>;
  getRiskTrajectory(projectId: string, signal?: AbortSignal): Promise<RiskTrajectory>;
  assessPortfolioRisks(): Promise<RiskAssessment[]>;
  getWarnings(signal?: AbortSignal): Promise<Warning[]>;
  acknowledgeWarning(id: string): Promise<Warning>;
  updateWarning(id: string, input: WarningUpdateInput): Promise<Warning>;
  getInterventions(signal?: AbortSignal): Promise<Intervention[]>;
  getInterventionHistory(id: string, signal?: AbortSignal): Promise<InterventionUpdate[]>;
  getInterventionOfficers(signal?: AbortSignal): Promise<InterventionOfficer[]>;
  createIntervention(input: InterventionCreateInput): Promise<Intervention>;
  updateIntervention(id: string, input: InterventionUpdateInput): Promise<Intervention>;
  getAnalytics(kind: AnalyticsKind, signal?: AbortSignal): Promise<AnalyticsDataset>;
  getPredictions(projectId: string, signal?: AbortSignal): Promise<Prediction[]>;
}
