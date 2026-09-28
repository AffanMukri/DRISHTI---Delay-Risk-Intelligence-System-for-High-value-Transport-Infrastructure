import { ApiError, apiClient } from '../lib/apiClient';
import type { ScheduleOverrunPrediction } from '../types';
import { buildMockScheduleProjection } from './mockProjectIntelligence';

export const SchedulePredictionService = {
  async getLatest(projectId: string, signal?: AbortSignal): Promise<ScheduleOverrunPrediction | null> {
    try {
      return await apiClient.get<ScheduleOverrunPrediction>(
        `/predictions/schedule-overrun/${encodeURIComponent(projectId)}`,
        { signal },
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      return buildMockScheduleProjection(projectId);
    }
  },

  async generate(projectId: string): Promise<ScheduleOverrunPrediction> {
    try {
      return await apiClient.post<ScheduleOverrunPrediction>(
        `/predictions/schedule-overrun/${encodeURIComponent(projectId)}`,
      );
    } catch {
      return buildMockScheduleProjection(projectId);
    }
  },
};
