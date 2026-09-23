import { ApiError, apiClient } from '../lib/apiClient';
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
  WarningUpdateInput,
} from '../types';
import type {
  ApiAnalyticsDataset,
  ApiDataConfidence,
  ApiIntervention,
  ApiInterventionHistory,
  ApiInterventionOfficer,
  ApiList,
  ApiPortfolioSummary,
  ApiPortfolioChanges,
  ApiPredictionList,
  ApiProject,
  ApiProjectHistory,
  ApiRisk,
  ApiRiskTrajectory,
  ApiWarning,
} from './apiTypes';
import type { AnalyticsKind, ProjectDataService, ProjectFilters, ProjectsResult } from './contracts';
import { mapDataConfidence, mapIntervention, mapInterventionOfficer, mapInterventionUpdate, mapPortfolioChanges, mapPrediction, mapProject, mapRisk, mapRiskTrajectory, mapWarning, toApiEnum } from './mappers';

const PAGE_SIZE = 200;

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

export class BackendProjectService implements ProjectDataService {
  async getProjects(filters: ProjectFilters = {}, signal?: AbortSignal): Promise<ProjectsResult> {
    const firstOffset = ((filters.page ?? 1) - 1) * (filters.pageSize ?? PAGE_SIZE);
    const requestedPageSize = filters.pageSize ?? PAGE_SIZE;
    const apiStatus = filters.status ? toApiEnum(filters.status) : undefined;
    const apiRisk = filters.riskLevel ? toApiEnum(filters.riskLevel) : undefined;

    const [riskResponse, firstPage] = await Promise.all([
      apiClient.get<ApiList<ApiRisk>>(`/risks${queryString({ risk_level: apiRisk, current_only: true })}`, { signal }),
      apiClient.get<ApiList<ApiProject>>(`/projects${queryString({
        search: filters.search,
        ministry: filters.ministry,
        sector: filters.sector,
        status: apiStatus,
        limit: requestedPageSize,
        offset: firstOffset,
      })}`, { signal }),
    ]);

    let items = firstPage.items;
    if (filters.page === undefined && firstPage.total > items.length) {
      const requests: Array<Promise<ApiList<ApiProject>>> = [];
      for (let offset = items.length; offset < firstPage.total; offset += PAGE_SIZE) {
        requests.push(apiClient.get<ApiList<ApiProject>>(`/projects${queryString({
          search: filters.search,
          ministry: filters.ministry,
          sector: filters.sector,
          status: apiStatus,
          limit: PAGE_SIZE,
          offset,
        })}`, { signal }));
      }
      items = items.concat((await Promise.all(requests)).flatMap(page => page.items));
    }

    const risksByProject = new Map(riskResponse.items.map(risk => [risk.projectId, risk]));
    let projects = items.map(item => mapProject(item, risksByProject.get(item.id)));
    if (filters.state) projects = projects.filter(project => project.state.includes(filters.state!));
    if (filters.riskLevel) projects = projects.filter(project => project.riskAssessment.riskLevel === filters.riskLevel);
    if (filters.sortBy) {
      projects.sort((left, right) => {
        const leftValue = left[filters.sortBy!] as string | number;
        const rightValue = right[filters.sortBy!] as string | number;
        const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        return filters.sortDir === 'desc' ? -result : result;
      });
    }
    return {
      data: projects,
      total: filters.state || filters.riskLevel ? projects.length : firstPage.total,
      page: filters.page ?? 1,
      pageSize: requestedPageSize,
    };
  }

  async getProject(id: string, signal?: AbortSignal): Promise<Project | null> {
    try {
      const project = await apiClient.get<ApiProject>(`/projects/${encodeURIComponent(id)}`, { signal });
      const risk = await apiClient
        .get<ApiRisk>(`/risks/${encodeURIComponent(id)}`, { signal })
        .catch(error => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        });
      return mapProject(project, risk);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  getProjectHistory(id: string, signal?: AbortSignal): Promise<ProjectHistory> {
    return apiClient.get<ApiProjectHistory>(`/projects/${encodeURIComponent(id)}/history`, { signal });
  }

  async getDataConfidence(id: string, signal?: AbortSignal): Promise<DataConfidence | null> {
    try {
      return mapDataConfidence(await apiClient.get<ApiDataConfidence>(`/projects/${encodeURIComponent(id)}/data-confidence`, { signal }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  getPortfolioSummary(signal?: AbortSignal): Promise<PortfolioSummary> {
    return apiClient.get<ApiPortfolioSummary>('/portfolio/summary', { signal });
  }

  async getPortfolioChanges(signal?: AbortSignal): Promise<PortfolioChanges> {
    return mapPortfolioChanges(await apiClient.get<ApiPortfolioChanges>('/portfolio/changes', { signal }));
  }

  async getRisks(signal?: AbortSignal): Promise<RiskAssessment[]> {
    const response = await apiClient.get<ApiList<ApiRisk>>('/risks?current_only=true', { signal });
    return response.items.map(value => mapRisk(value));
  }

  async getRiskTrajectory(projectId: string, signal?: AbortSignal): Promise<RiskTrajectory> {
    const response = await apiClient.get<ApiRiskTrajectory>(`/risks/${encodeURIComponent(projectId)}/trajectory`, { signal });
    return mapRiskTrajectory(response);
  }

  async assessPortfolioRisks(): Promise<RiskAssessment[]> {
    const response = await apiClient.post<ApiList<ApiRisk>>('/risks/assess-portfolio');
    return response.items.map(value => mapRisk(value));
  }

  async getWarnings(signal?: AbortSignal): Promise<Warning[]> {
    const response = await apiClient.get<ApiList<ApiWarning>>('/warnings', { signal });
    return response.items.map(mapWarning);
  }

  async acknowledgeWarning(id: string): Promise<Warning> {
    return mapWarning(await apiClient.post<ApiWarning>(`/warnings/${encodeURIComponent(id)}/acknowledge`));
  }

  async updateWarning(id: string, input: WarningUpdateInput): Promise<Warning> {
    const body = { status: toApiEnum(input.status), assignedToName: input.assignedToName };
    return mapWarning(await apiClient.patch<ApiWarning>(`/warnings/${encodeURIComponent(id)}`, body));
  }

  async getInterventions(signal?: AbortSignal): Promise<Intervention[]> {
    const response = await apiClient.get<ApiList<ApiIntervention>>('/interventions', { signal });
    return response.items.map(mapIntervention);
  }

  async getInterventionHistory(id: string, signal?: AbortSignal): Promise<InterventionUpdate[]> {
    const response = await apiClient.get<ApiInterventionHistory>(`/interventions/${encodeURIComponent(id)}/history`, { signal });
    return response.items.map(mapInterventionUpdate);
  }

  async getInterventionOfficers(signal?: AbortSignal): Promise<InterventionOfficer[]> {
    const response = await apiClient.get<ApiList<ApiInterventionOfficer>>('/interventions/officers', { signal });
    return response.items.map(mapInterventionOfficer);
  }

  async createIntervention(input: InterventionCreateInput): Promise<Intervention> {
    const body = { ...input, priority: toApiEnum(input.priority) };
    return mapIntervention(await apiClient.post<ApiIntervention>('/interventions', body));
  }

  async updateIntervention(id: string, input: InterventionUpdateInput): Promise<Intervention> {
    const body = {
      ...input,
      status: input.status ? toApiEnum(input.status) : undefined,
      priority: input.priority ? toApiEnum(input.priority) : undefined,
    };
    return mapIntervention(await apiClient.patch<ApiIntervention>(`/interventions/${encodeURIComponent(id)}`, body));
  }

  getAnalytics(kind: AnalyticsKind, signal?: AbortSignal): Promise<AnalyticsDataset> {
    return apiClient.get<ApiAnalyticsDataset>(`/analytics/${kind}`, { signal });
  }

  async getPredictions(projectId: string, signal?: AbortSignal): Promise<Prediction[]> {
    const response = await apiClient.get<ApiPredictionList>(`/predictions/${encodeURIComponent(projectId)}`, { signal });
    return response.items.map(mapPrediction);
  }
}
