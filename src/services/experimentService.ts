import { ApiError, apiClient } from '../lib/apiClient';

export interface ExperimentMetricDelta {
  model_a: number | null;
  model_b: number | null;
  difference_b_minus_a: number | null;
  better: 'model_a' | 'model_b' | 'tie' | null;
}

export interface ExternalFeatureCoverage {
  code: string;
  display_name: string;
  category: string;
  unit: string;
  populated_rows: number;
  total_rows: number;
  coverage: number;
  sources: string[];
}

export interface ModelComparisonExperiment {
  id?: string | null;
  experimentCode: string;
  version: string;
  status: 'running' | 'completed' | 'insufficient_data' | 'failed';
  startedAt: string;
  completedAt?: string | null;
  randomState: number;
  methodology: Record<string, unknown>;
  featureSets: {
    model_a?: Record<string, string[]>;
    model_b_external?: Record<string, string[]>;
    leakage_exclusions?: Record<string, string[]>;
  };
  featureCoverage: {
    cost?: ExternalFeatureCoverage[];
    schedule?: ExternalFeatureCoverage[];
    risk?: ExternalFeatureCoverage[];
    minimum_eligible_coverage?: number;
  };
  metrics: Record<string, Record<string, unknown>>;
  comparison: Record<string, Record<string, ExperimentMetricDelta> | null>;
  limitations: string[];
  datasetFingerprintSha256?: string | null;
  artifactChecksumSha256?: string | null;
  conclusion: string;
  modelBImprovementSupported: boolean;
}

export const ExperimentService = {
  async latest(signal?: AbortSignal): Promise<ModelComparisonExperiment | null> {
    try {
      return await apiClient.get<ModelComparisonExperiment>('/experiments/cuf-plus/latest', { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  run(version: string): Promise<ModelComparisonExperiment> {
    return apiClient.post<ModelComparisonExperiment>('/experiments/cuf-plus/run', { version });
  },
};
