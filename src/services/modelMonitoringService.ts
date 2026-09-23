import { apiClient } from '../lib/apiClient';

export type MonitoringStatus = 'sufficient' | 'partial' | 'insufficient_data' | 'failed';

export interface ModelInventoryItem {
  id: string;
  name: string;
  version: string;
  modelType: string;
  algorithm?: string | null;
  description?: string | null;
  status: string;
  active: boolean;
  trainingDate?: string | null;
  trainingPeriod?: Record<string, string | null> | null;
  trainingRows?: number | null;
  featureList: string[];
  evaluationMetrics: Record<string, any>;
  deployedAt?: string | null;
  lastInference?: string | null;
  inferenceCount: number;
  latestMonitoringRunId?: string | null;
  latestMonitoringStatus?: MonitoringStatus | null;
  latestMonitoredAt?: string | null;
  latestMonitoringSummary?: Record<string, any> | null;
  monitoringSupported: boolean;
  monitoringUnavailableReason?: string | null;
}

export interface ModelInventoryResponse {
  items: ModelInventoryItem[];
  total: number;
  activeModels: number;
  modelsWithInference: number;
  modelsRequiringAttention: number;
  automaticRetrainingEnabled: false;
}

export interface MonitoringTestResult {
  kind?: string;
  status: string;
  reason?: string | null;
  reference_count?: number;
  current_count?: number;
  psi?: number | null;
  ks_statistic?: number | null;
  chi_square?: number | null;
  cramers_v?: number | null;
  p_value?: number | null;
  reference_missing_rate?: number | null;
  current_missing_rate?: number | null;
  rate_change?: number | null;
  [key: string]: unknown;
}

export interface ModelMonitoringRun {
  id: string;
  modelVersionId: string;
  modelName: string;
  modelVersion: string;
  status: MonitoringStatus;
  monitoringWindowStart: string;
  monitoringWindowEnd: string;
  comparisonWindowStart: string;
  comparisonWindowEnd: string;
  referenceSampleSize: number;
  currentSampleSize: number;
  comparisonSampleSize: number;
  evaluatedOutcomeCount: number;
  featureDrift: Record<string, MonitoringTestResult>;
  predictionShift: Record<string, MonitoringTestResult>;
  missingFeatureChanges: Record<string, MonitoringTestResult>;
  performanceMonitoring: Record<string, Record<string, any>>;
  summary: {
    attention_required?: boolean;
    feature_drift_alerts?: string[];
    missingness_alerts?: string[];
    prediction_shift_alerts?: string[];
    performance_degradation_alerts?: string[];
    calculated_test_count?: number;
    insufficient_test_count?: number;
    automatic_retraining_triggered?: false;
  };
  methodology: Record<string, any>;
  limitations: string[];
  startedAt: string;
  completedAt: string;
}

export const ModelMonitoringService = {
  inventory(signal?: AbortSignal): Promise<ModelInventoryResponse> {
    return apiClient.get<ModelInventoryResponse>('/model-monitoring', { signal });
  },

  run(modelVersionId: string, windowDays = 90): Promise<ModelMonitoringRun> {
    return apiClient.post<ModelMonitoringRun>(
      `/model-monitoring/${encodeURIComponent(modelVersionId)}/runs`,
      { windowDays },
    );
  },

  detail(runId: string, signal?: AbortSignal): Promise<ModelMonitoringRun> {
    return apiClient.get<ModelMonitoringRun>(
      `/model-monitoring/runs/${encodeURIComponent(runId)}`,
      { signal },
    );
  },
};
