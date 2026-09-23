import { apiClient } from '../lib/apiClient';
import type { ScenarioConfiguration, ScenarioSimulation } from '../types';

export const ScenarioService = {
  configuration(projectId: string, signal?: AbortSignal): Promise<ScenarioConfiguration> {
    return apiClient.get<ScenarioConfiguration>(
      `/predictions/what-if/${encodeURIComponent(projectId)}`,
      { signal },
    );
  },

  simulate(
    projectId: string,
    changes: Record<string, string | number>,
    assumptionNote?: string,
  ): Promise<ScenarioSimulation> {
    return apiClient.post<ScenarioSimulation>(
      `/predictions/what-if/${encodeURIComponent(projectId)}`,
      { changes, assumptionNote: assumptionNote?.trim() || undefined },
    );
  },
};
