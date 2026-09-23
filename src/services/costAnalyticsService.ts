import { apiClient } from '../lib/apiClient';
import { analyticsRequest } from './analyticsDataSource';
import { buildMockCostAnalytics } from './mockAnalytics';

export interface CostAnalyticsSummary {
  totalProjects: number;
  originalApprovedCost: number;
  latestRevisedCost: number;
  cumulativeExpenditure: number;
  absoluteCostEscalation: number;
  costEscalationPercentage: number;
  expenditurePercentage: number;
  escalatedProjects: number;
}

export interface CostDataAvailability {
  totalProjects: number;
  approvedCostProjects: number;
  revisedCostProjects: number;
  expenditureProjects: number;
  physicalProgressProjects: number;
  comparableCostProjects: number;
  monthlyHistoryProjects: number;
  incompleteCostProjects: number;
  latestReportingMonth?: string | null;
}

export interface CostTrendPoint {
  period: string;
  reportingProjects: number;
  approvedCostProjects: number;
  revisedCostProjects: number;
  expenditureProjects: number;
  originalApprovedCost?: number | null;
  latestRevisedCost?: number | null;
  cumulativeExpenditure?: number | null;
  absoluteCostEscalation?: number | null;
  costEscalationPercentage?: number | null;
}

export interface CostAggregateBreakdown {
  projectCount: number;
  comparableProjects: number;
  originalApprovedCost: number;
  latestRevisedCost: number;
  cumulativeExpenditure: number;
  absoluteCostEscalation: number;
  costEscalationPercentage: number;
}

export interface SectorCostBreakdown extends CostAggregateBreakdown {
  sector: string;
}

export interface MinistryCostBreakdown extends CostAggregateBreakdown {
  ministry: string;
}

export interface ProjectCostBreakdown {
  projectId: string;
  projectName: string;
  ministry: string;
  sector: string;
  originalApprovedCost?: number | null;
  latestRevisedCost?: number | null;
  cumulativeExpenditure?: number | null;
  absoluteCostEscalation?: number | null;
  costEscalationPercentage?: number | null;
  expenditurePercentage?: number | null;
  physicalProgress?: number | null;
  progressMismatch?: number | null;
  approvedCostSource?: string | null;
  revisedCostSource?: string | null;
  expenditureSource?: string | null;
  hasMonthlyHistory: boolean;
}

export interface CostProgressMismatch {
  projectId: string;
  projectName: string;
  ministry: string;
  sector: string;
  latestRevisedCost: number;
  cumulativeExpenditure: number;
  expenditurePercentage: number;
  physicalProgress: number;
  progressMismatch: number;
}

export interface CostAnalyticsResponse {
  summary: CostAnalyticsSummary;
  dataAvailability: CostDataAvailability;
  series: CostTrendPoint[];
  sectorBreakdown: SectorCostBreakdown[];
  ministryBreakdown: MinistryCostBreakdown[];
  projectBreakdown: ProjectCostBreakdown[];
  breakdown: ProjectCostBreakdown[];
  progressMismatches: CostProgressMismatch[];
}

export interface CostAnalyticsFilters {
  sector?: string;
  escalatedOnly?: boolean;
  mismatchThreshold?: number;
}

class CostAnalyticsService {
  get(filters: CostAnalyticsFilters = {}, signal?: AbortSignal): Promise<CostAnalyticsResponse> {
    const params = new URLSearchParams();
    if (filters.sector) params.set('sector', filters.sector);
    if (filters.escalatedOnly) params.set('escalated_only', 'true');
    if (filters.mismatchThreshold !== undefined) params.set('mismatch_threshold', String(filters.mismatchThreshold));
    const query = params.toString();
    return analyticsRequest(
      signal,
      () => buildMockCostAnalytics(filters),
      () => apiClient.get<CostAnalyticsResponse>(`/analytics/cost${query ? `?${query}` : ''}`, { signal }),
    );
  }
}

export const costAnalyticsService = new CostAnalyticsService();
