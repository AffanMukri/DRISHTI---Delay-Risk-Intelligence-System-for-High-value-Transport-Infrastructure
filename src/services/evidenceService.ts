import { apiClient } from '../lib/apiClient';
import type { ProjectEvidenceChain } from '../types';

export const EvidenceService = {
  getForProject(projectId: string, signal?: AbortSignal): Promise<ProjectEvidenceChain> {
    return apiClient.get<ProjectEvidenceChain>(
      `/evidence/projects/${encodeURIComponent(projectId)}`,
      { signal },
    );
  },
};
