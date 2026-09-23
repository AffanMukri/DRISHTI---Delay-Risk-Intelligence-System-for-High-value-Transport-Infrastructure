import { ApiError, apiClient } from '../lib/apiClient';
import type { ScheduleOverrunPrediction } from '../types';

export const SchedulePredictionService = {
  async getLatest(projectId: string, signal?: AbortSignal): Promise<ScheduleOverrunPrediction | null> {
    try {
      return await apiClient.get<ScheduleOverrunPrediction>(
        `/predictions/schedule-overrun/${encodeURIComponent(projectId)}`,
        { signal },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  generate(projectId: string): Promise<ScheduleOverrunPrediction> {
    return apiClient.post<ScheduleOverrunPrediction>(
      `/predictions/schedule-overrun/${encodeURIComponent(projectId)}`,
    );
  },
};
