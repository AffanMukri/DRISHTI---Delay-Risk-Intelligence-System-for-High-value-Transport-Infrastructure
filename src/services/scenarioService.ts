import { apiClient } from '../lib/apiClient';
import type { ScenarioConfiguration, ScenarioSimulation } from '../types';
import { buildMockScenarioConfiguration, simulateMockScenario } from './mockProjectIntelligence';

export const ScenarioService = {
  async configuration(projectId: string, signal?: AbortSignal): Promise<ScenarioConfiguration> {
    try {
      return await apiClient.get<ScenarioConfiguration>(
        `/predictions/what-if/${encodeURIComponent(projectId)}`,
        { signal },
      );
    } catch {
      return buildMockScenarioConfiguration(projectId);
    }
  },

  async simulate(
    projectId: string,
    changes: Record<string, string | number>,
    assumptionNote?: string,
  ): Promise<ScenarioSimulation> {
    try {
      return await apiClient.post<ScenarioSimulation>(
        `/predictions/what-if/${encodeURIComponent(projectId)}`,
        { changes, assumptionNote: assumptionNote?.trim() || undefined },
      );
    } catch {
      return simulateMockScenario(projectId, changes, assumptionNote);
    }
  },
};
