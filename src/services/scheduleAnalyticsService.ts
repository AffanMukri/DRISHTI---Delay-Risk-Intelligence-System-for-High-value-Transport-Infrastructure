import { apiClient } from '../lib/apiClient';
import { analyticsRequest } from './analyticsDataSource';
import { buildMockScheduleAnalytics } from './mockAnalytics';

export type ScheduleDelayFilter = 'all' | 'delayed' | 'severe' | 'on_time';

export interface ScheduleSummary {
  totalProjects: number;
  delayedProjects: number;
  onTimeProjects: number;
  severeDelayedProjects: number;
  chronicDelayedProjects: number;
  averageSlippageDays: number;
  maximumSlippageDays: number;
  averagePlannedProgress: number;
  averageActualProgress: number;
  averageProgressVariance: number;
  averageElapsedDurationPercentage: number;
  averageMonthlyProgressVelocity: number;
  totalMilestones: number;
  completedMilestones: number;
  onTrackMilestones: number;
  atRiskMilestones: number;
  delayedMilestones: number;
  overdueMilestones: number;
  milestoneCompletionPercentage: number;
}

export interface ScheduleDataAvailability {
  totalProjects: number;
  originalDateProjects: number;
  currentDateProjects: number;
  comparableDateProjects: number;
  plannedProgressProjects: number;
  actualProgressProjects: number;
  comparableProgressProjects: number;
  elapsedDurationProjects: number;
  velocityProjects: number;
  monthlyHistoryProjects: number;
  milestoneDetailProjects: number;
  milestoneReportingProjects: number;
  latestAsOfDate?: string | null;
  latestReportingMonth?: string | null;
}

export interface ScheduleTrendPoint {
  period: string;
  reportingProjects: number;
  plannedProgressProjects: number;
  actualProgressProjects: number;
  plannedProgress?: number | null;
  actualProgress?: number | null;
  progressVariance?: number | null;
  monthlyProgressVelocity?: number | null;
  averageSlippageDays?: number | null;
}

export interface DelayBracket {
  bracket: string;
  projectCount: number;
  sortOrder: number;
}

export interface ScheduleAggregateBreakdown {
  projectCount: number;
  comparableProjects: number;
  delayedProjects: number;
  averageDelayDays: number;
  maximumDelayDays: number;
  averageProgressVariance: number;
  averageMonthlyProgressVelocity: number;
}

export interface SectorScheduleBreakdown extends ScheduleAggregateBreakdown {
  sector: string;
}

export interface MinistryScheduleBreakdown extends ScheduleAggregateBreakdown {
  ministry: string;
}

export interface ProjectScheduleBreakdown {
  projectId: string;
  projectName: string;
  ministry: string;
  implementingAgency: string;
  sector: string;
  originalCompletionDate?: string | null;
  currentCompletionDate?: string | null;
  scheduleSlippageDays?: number | null;
  plannedPhysicalProgress?: number | null;
  actualPhysicalProgress?: number | null;
  progressVariance?: number | null;
  monitoringStartDate?: string | null;
  asOfDate: string;
  elapsedDurationPercentage?: number | null;
  totalMilestones: number;
  completedMilestones: number;
  onTrackMilestones: number;
  atRiskMilestones: number;
  delayedMilestones: number;
  overdueMilestones: number;
  milestoneCompletionPercentage?: number | null;
  monthlyProgressVelocity?: number | null;
  hasMonthlyHistory: boolean;
  delayRank?: number | null;
}

export interface ScheduleAnalyticsResponse {
  summary: ScheduleSummary;
  dataAvailability: ScheduleDataAvailability;
  series: ScheduleTrendPoint[];
  delayBrackets: DelayBracket[];
  sectorBreakdown: SectorScheduleBreakdown[];
  ministryBreakdown: MinistryScheduleBreakdown[];
  projectBreakdown: ProjectScheduleBreakdown[];
  breakdown: ProjectScheduleBreakdown[];
}

export interface ScheduleAnalyticsFilters {
  sector?: string;
  delayFilter?: ScheduleDelayFilter;
  search?: string;
}

class ScheduleAnalyticsService {
  get(filters: ScheduleAnalyticsFilters = {}, signal?: AbortSignal): Promise<ScheduleAnalyticsResponse> {
    const params = new URLSearchParams();
    if (filters.sector) params.set('sector', filters.sector);
    if (filters.delayFilter && filters.delayFilter !== 'all') params.set('delay_filter', filters.delayFilter);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const query = params.toString();
    return analyticsRequest(
      signal,
      () => buildMockScheduleAnalytics(filters),
      () => apiClient.get<ScheduleAnalyticsResponse>(`/analytics/schedule${query ? `?${query}` : ''}`, { signal }),
    );
  }
}

export const scheduleAnalyticsService = new ScheduleAnalyticsService();
