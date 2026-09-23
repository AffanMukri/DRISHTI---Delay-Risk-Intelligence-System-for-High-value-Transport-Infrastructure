import { ApiError, apiClient } from '../lib/apiClient';
import type { CostOverrunPrediction } from '../types';

export const CostPredictionService = {
  async getLatest(projectId: string, signal?: AbortSignal): Promise<CostOverrunPrediction | null> {
    try {
      return await apiClient.get<CostOverrunPrediction>(
        `/predictions/cost-overrun/${encodeURIComponent(projectId)}`,
        { signal },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  generate(projectId: string): Promise<CostOverrunPrediction> {
    return apiClient.post<CostOverrunPrediction>(
      `/predictions/cost-overrun/${encodeURIComponent(projectId)}`,
    );
  },
};
