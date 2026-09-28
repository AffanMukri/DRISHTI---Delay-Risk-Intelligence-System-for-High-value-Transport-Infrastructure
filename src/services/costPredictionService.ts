import { ApiError, apiClient } from '../lib/apiClient';
import type { CostOverrunPrediction } from '../types';
import { buildMockCostProjection } from './mockProjectIntelligence';

export const CostPredictionService = {
  async getLatest(projectId: string, signal?: AbortSignal): Promise<CostOverrunPrediction | null> {
    try {
      return await apiClient.get<CostOverrunPrediction>(
        `/predictions/cost-overrun/${encodeURIComponent(projectId)}`,
        { signal },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      return buildMockCostProjection(projectId);
    }
  },

  async generate(projectId: string): Promise<CostOverrunPrediction> {
    try {
      return await apiClient.post<CostOverrunPrediction>(
        `/predictions/cost-overrun/${encodeURIComponent(projectId)}`,
      );
    } catch {
      return buildMockCostProjection(projectId);
    }
  },
};
