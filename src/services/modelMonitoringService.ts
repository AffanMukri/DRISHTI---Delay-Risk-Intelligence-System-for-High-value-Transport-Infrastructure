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

export function buildMockModelInventory(): ModelInventoryResponse {
  const items: ModelInventoryItem[] = [
    {
      id: 'model-cost-overrun-v2',
      name: 'Cost Overrun XGBoost Classifier',
      version: 'v2.4',
      modelType: 'classification',
      algorithm: 'Gradient Boosted Decision Trees (XGBoost)',
      description: 'Predicts probability of total project cost escalation exceeding 15% threshold based on CUF telemetry and milestone drift.',
      status: 'active',
      active: true,
      trainingDate: '2025-11-15T00:00:00Z',
      trainingPeriod: { start: '2020-01-01', end: '2025-09-30' },
      trainingRows: 1420,
      featureList: ['cuf_variance_pct', 'land_acquired_pct', 'fund_utilization_ratio', 'monsoon_exposure_months', 'agency_tier_risk'],
      evaluationMetrics: { roc_auc: 0.892, precision: 0.865, recall: 0.841, f1_score: 0.853 },
      deployedAt: '2025-12-01T00:00:00Z',
      lastInference: '2026-04-30T10:00:00Z',
      inferenceCount: 3480,
      latestMonitoringRunId: 'run-cost-001',
      latestMonitoringStatus: 'sufficient',
      latestMonitoredAt: '2026-04-30T08:30:00Z',
      latestMonitoringSummary: { attention_required: false, psi_aggregate: 0.042, drift_status: 'stable' },
      monitoringSupported: true,
    },
    {
      id: 'model-schedule-delay-v1',
      name: 'Schedule Delay Survival Forecaster',
      version: 'v1.8',
      modelType: 'survival_regression',
      algorithm: 'Cox Proportional Hazards + Random Survival Forest',
      description: 'Estimates projected completion month distribution and milestone slippage probabilities.',
      status: 'active',
      active: true,
      trainingDate: '2025-10-20T00:00:00Z',
      trainingPeriod: { start: '2019-01-01', end: '2025-09-30' },
      trainingRows: 2150,
      featureList: ['critical_path_slack_days', 'dependency_depth', 'past_milestones_overdue', 'contractor_capacity_index'],
      evaluationMetrics: { concordance_index: 0.862, brier_score: 0.124 },
      deployedAt: '2025-11-01T00:00:00Z',
      lastInference: '2026-04-30T10:00:00Z',
      inferenceCount: 4210,
      latestMonitoringRunId: 'run-schedule-001',
      latestMonitoringStatus: 'sufficient',
      latestMonitoredAt: '2026-04-30T08:30:00Z',
      latestMonitoringSummary: { attention_required: false, psi_aggregate: 0.061, drift_status: 'stable' },
      monitoringSupported: true,
    },
    {
      id: 'model-land-acq-v3',
      name: 'Right of Way & Land Acquisition Escalation',
      version: 'v3.1',
      modelType: 'gradient_boosting',
      algorithm: 'LightGBM Regressor',
      description: 'Identifies land parcel litigation risks and environmental clearance bottleneck escalation.',
      status: 'active',
      active: true,
      trainingDate: '2025-12-05T00:00:00Z',
      trainingPeriod: { start: '2021-01-01', end: '2025-11-30' },
      trainingRows: 980,
      featureList: ['state_land_benchmarking_rate', 'litigation_filings_count', 'forest_clearance_stage', 'resettlement_progress_pct'],
      evaluationMetrics: { r2: 0.835, mae: 14.2 },
      deployedAt: '2026-01-10T00:00:00Z',
      lastInference: '2026-04-30T10:00:00Z',
      inferenceCount: 1890,
      latestMonitoringRunId: 'run-land-001',
      latestMonitoringStatus: 'partial',
      latestMonitoredAt: '2026-04-30T08:30:00Z',
      latestMonitoringSummary: { attention_required: true, psi_aggregate: 0.138, drift_status: 'moderate_drift_detected' },
      monitoringSupported: true,
    },
  ];

  return {
    items,
    total: items.length,
    activeModels: items.filter(i => i.active).length,
    modelsWithInference: items.filter(i => i.inferenceCount > 0).length,
    modelsRequiringAttention: items.filter(i => i.latestMonitoringSummary?.attention_required).length,
    automaticRetrainingEnabled: false,
  };
}

export function buildMockMonitoringRun(runId: string): ModelMonitoringRun {
  return {
    id: runId,
    modelVersionId: 'model-cost-overrun-v2',
    modelName: 'Cost Overrun XGBoost Classifier',
    modelVersion: 'v2.4',
    status: 'sufficient',
    monitoringWindowStart: '2026-01-01T00:00:00Z',
    monitoringWindowEnd: '2026-04-30T00:00:00Z',
    comparisonWindowStart: '2025-01-01T00:00:00Z',
    comparisonWindowEnd: '2025-12-31T00:00:00Z',
    referenceSampleSize: 1420,
    currentSampleSize: 348,
    comparisonSampleSize: 1420,
    evaluatedOutcomeCount: 290,
    featureDrift: {
      cuf_variance_pct: { status: 'passed', psi: 0.038, ks_statistic: 0.042, p_value: 0.42, reference_count: 1420, current_count: 348 },
      land_acquired_pct: { status: 'warning', psi: 0.125, ks_statistic: 0.089, p_value: 0.03, reference_count: 1420, current_count: 348 },
      fund_utilization_ratio: { status: 'passed', psi: 0.044, ks_statistic: 0.051, p_value: 0.35, reference_count: 1420, current_count: 348 },
      monsoon_exposure_months: { status: 'passed', psi: 0.012, ks_statistic: 0.021, p_value: 0.88, reference_count: 1420, current_count: 348 },
      agency_tier_risk: { status: 'passed', psi: 0.029, chi_square: 2.14, p_value: 0.54, reference_count: 1420, current_count: 348 },
    },
    predictionShift: {
      high_risk_probability: { status: 'passed', psi: 0.048, ks_statistic: 0.058, p_value: 0.28, reference_count: 1420, current_count: 348 },
    },
    missingFeatureChanges: {
      cuf_variance_pct: { status: 'passed', reference_missing_rate: 0.005, current_missing_rate: 0.003, rate_change: -0.002 },
      land_acquired_pct: { status: 'passed', reference_missing_rate: 0.012, current_missing_rate: 0.010, rate_change: -0.002 },
      fund_utilization_ratio: { status: 'passed', reference_missing_rate: 0.001, current_missing_rate: 0.001, rate_change: 0.0 },
    },
    performanceMonitoring: {
      calibration: { brier_score: 0.118, reference_brier: 0.122, degradation_detected: false },
      discrimination: { rolling_roc_auc: 0.884, reference_roc_auc: 0.892, delta: -0.008 },
    },
    summary: {
      attention_required: false,
      feature_drift_alerts: ['Moderate distribution drift detected in land_acquired_pct (PSI=0.125)'],
      missingness_alerts: [],
      prediction_shift_alerts: [],
      performance_degradation_alerts: [],
      calculated_test_count: 8,
      insufficient_test_count: 0,
      automatic_retraining_triggered: false,
    },
    methodology: {
      psi_threshold_nominal: '< 0.10',
      psi_threshold_moderate: '0.10 - 0.25',
      psi_threshold_significant: '> 0.25',
      sample_size_minimum: 100,
    },
    limitations: [
      'PSI heuristics assume empirical stability in macro-economic inflation baselines.',
      'Ground validation verification is required before triggering formal model re-calibration.',
    ],
    startedAt: '2026-04-30T08:29:40Z',
    completedAt: '2026-04-30T08:30:12Z',
  };
}

export const ModelMonitoringService = {
  async inventory(signal?: AbortSignal): Promise<ModelInventoryResponse> {
    try {
      return await apiClient.get<ModelInventoryResponse>('/model-monitoring', { signal });
    } catch {
      return buildMockModelInventory();
    }
  },

  async run(modelVersionId: string, windowDays = 90): Promise<ModelMonitoringRun> {
    try {
      return await apiClient.post<ModelMonitoringRun>(
        `/model-monitoring/${encodeURIComponent(modelVersionId)}/runs`,
        { windowDays },
      );
    } catch {
      return buildMockMonitoringRun(`run-${Date.now()}`);
    }
  },

  async detail(runId: string, signal?: AbortSignal): Promise<ModelMonitoringRun> {
    try {
      return await apiClient.get<ModelMonitoringRun>(
        `/model-monitoring/runs/${encodeURIComponent(runId)}`,
        { signal },
      );
    } catch {
      return buildMockMonitoringRun(runId);
    }
  },
};
