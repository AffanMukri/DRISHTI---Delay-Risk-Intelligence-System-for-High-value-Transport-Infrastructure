import { apiClient } from '../lib/apiClient';
import type { ProjectEvidenceChain } from '../types';
import { buildMockEvidenceChain } from './mockProjectIntelligence';

export const EvidenceService = {
  async getForProject(projectId: string, signal?: AbortSignal): Promise<ProjectEvidenceChain> {
    try {
      return await apiClient.get<ProjectEvidenceChain>(
        `/evidence/projects/${encodeURIComponent(projectId)}`,
        { signal },
      );
    } catch {
      return buildMockEvidenceChain(projectId);
    }
  },
};
