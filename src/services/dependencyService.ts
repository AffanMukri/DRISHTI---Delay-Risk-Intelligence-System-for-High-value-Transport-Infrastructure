import { apiClient } from '../lib/apiClient';

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
export type DependencyNodeStatus = 'completed' | 'on_track' | 'at_risk' | 'delayed';

export interface DependencyNode {
  id: string;
  code: string;
  name: string;
  nodeType: 'milestone' | 'package';
  sequenceNo: number;
  plannedDate: string;
  forecastDate?: string | null;
  actualDate?: string | null;
  status: DependencyNodeStatus;
  delayDays?: number | null;
  incomingDependencies: number;
  outgoingDependencies: number;
  isDelayedTrigger: boolean;
  potentiallyAffected: boolean;
  dependencyDepth?: number | null;
  triggerMilestoneIds: string[];
}

export interface DependencyEdge {
  id: string;
  upstreamMilestoneId: string;
  downstreamMilestoneId: string;
  dependencyType: DependencyType;
  lagDays: number;
  sourceSystem: string;
  sourceReference?: string | null;
  metadata: Record<string, unknown>;
  createdBy?: string | null;
  createdAt: string;
  potentiallyAffected: boolean;
}

export interface PropagationPath {
  sourceMilestoneId: string;
  sourceCode: string;
  targetMilestoneId: string;
  targetCode: string;
  depth: number;
  milestoneIds: string[];
  milestoneCodes: string[];
  milestoneNames: string[];
}

export interface DependencyGraph {
  projectId: string;
  projectName: string;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  propagationPaths: PropagationPath[];
  summary: {
    planningNodeCount: number;
    explicitDependencyCount: number;
    delayedTriggerCount: number;
    potentiallyAffectedCount: number;
    maximumDependencyDepth: number;
    analysisKind: 'explicit_dependency_risk_propagation';
    causalityClaimed: false;
    statement: string;
  };
}

export interface DependencyCreateInput {
  upstreamMilestone: string;
  downstreamMilestone: string;
  dependencyType: DependencyType;
  lagDays: number;
  sourceReference?: string;
}

export const DependencyService = {
  graph(projectId: string, signal?: AbortSignal): Promise<DependencyGraph> {
    return apiClient.get<DependencyGraph>(`/projects/${encodeURIComponent(projectId)}/dependencies`, { signal });
  },

  create(projectId: string, input: DependencyCreateInput): Promise<DependencyGraph> {
    return apiClient.post<DependencyGraph>(`/projects/${encodeURIComponent(projectId)}/dependencies`, input);
  },

  remove(projectId: string, dependencyId: string): Promise<void> {
    return apiClient.delete(`/projects/${encodeURIComponent(projectId)}/dependencies/${encodeURIComponent(dependencyId)}`);
  },
};
