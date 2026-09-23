import { apiClient } from '../lib/apiClient';
import { analyticsRequest } from './analyticsDataSource';
import { buildMockBenchmarkAnalytics } from './mockAnalytics';

export interface BenchmarkProject {
  projectId: string;
  projectName: string;
  ministry: string;
  implementingAgency: string;
  sector: string;
  projectType: string;
  state: string;
  states: string[];
  status: string;
  originalCost?: number | null;
  revisedCost?: number | null;
  startDate?: string | null;
  startDateSource?: string | null;
  startYear?: number | null;
  plannedDurationDays?: number | null;
  costBand?: string | null;
  costOverrunPercentage?: number | null;
  scheduleDelayDays?: number | null;
  monthlyProgressVelocity?: number | null;
  expenditureEfficiency?: number | null;
  milestoneSlippagePercentage?: number | null;
  milestoneCompletionPercentage?: number | null;
  overallRiskScore?: number | null;
  costRiskScore?: number | null;
  scheduleRiskScore?: number | null;
  implementationRiskScore?: number | null;
}

export interface PeerMatch extends BenchmarkProject {
  matchScore: number;
  matchReasons: string[];
  isHistorical: boolean;
}

export interface BenchmarkMetricComparison {
  key: string;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  selectedValue?: number | null;
  comparisonValue?: number | null;
  sectorMedian?: number | null;
  peerMedian?: number | null;
  historicalMedian?: number | null;
  sectorSampleSize: number;
  peerSampleSize: number;
  historicalSampleSize: number;
}

export interface BenchmarkRadarPoint {
  subject: string;
  selectedScore?: number | null;
  comparisonScore?: number | null;
  peerMedianScore?: number | null;
}

export interface AgencyBenchmark {
  rank: number;
  agency: string;
  projectCount: number;
  totalOutlay: number;
  averageDelayDays?: number | null;
  averageCostOverrunPercentage?: number | null;
  milestoneHitRate?: number | null;
  averageRiskScore?: number | null;
  deliveryEfficiencyIndex?: number | null;
}

export interface BenchmarkAnalyticsResponse {
  selectedProject: BenchmarkProject;
  comparisonPeer?: PeerMatch | null;
  peerGroup: {
    selectionMethod: string;
    minimumMatchScore: number;
    candidateProjectsEvaluated: number;
    peerCount: number;
    historicalPeerCount: number;
    maximumPeers: number;
  };
  peers: PeerMatch[];
  historicalPeers: PeerMatch[];
  metricComparisons: BenchmarkMetricComparison[];
  radar: BenchmarkRadarPoint[];
  agencyLeaderboard: AgencyBenchmark[];
  dataAvailability: {
    portfolioProjects: number;
    sectorProjects: number;
    projectsWithStartDate: number;
    projectsWithVelocity: number;
    projectsWithMilestones: number;
    projectsWithRisk: number;
  };
}

class BenchmarkAnalyticsService {
  get(
    projectId: string,
    comparisonProjectId?: string,
    signal?: AbortSignal,
  ): Promise<BenchmarkAnalyticsResponse> {
    const params = new URLSearchParams({ project_id: projectId, max_peers: '8' });
    if (comparisonProjectId) params.set('comparison_project_id', comparisonProjectId);
    return analyticsRequest(
      signal,
      () => buildMockBenchmarkAnalytics(projectId, comparisonProjectId),
      () => apiClient.get<BenchmarkAnalyticsResponse>(`/analytics/benchmark?${params}`, { signal }),
    );
  }
}

export const benchmarkAnalyticsService = new BenchmarkAnalyticsService();
