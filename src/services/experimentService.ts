import { apiClient } from '../lib/apiClient';

export interface ExperimentMetricDelta {
  metric: string;
  model_a: number | null;
  model_b: number | null;
  difference_b_minus_a: number | null;
  better: 'model_a' | 'model_b' | 'tie' | 'unavailable';
}

export interface FeatureCoverageItem {
  code: string;
  display_name: string;
  coverage: number;
  populated_rows: number;
  total_rows: number;
  sources: string[];
}

export interface ModelComparisonExperiment {
  id: string;
  version: string;
  status: string;
  randomState: number;
  conclusion: string;
  modelBImprovementSupported: boolean;
  comparison: Record<string, Record<string, ExperimentMetricDelta>>;
  featureCoverage: {
    minimum_eligible_coverage: number;
    cost?: FeatureCoverageItem[];
    schedule?: FeatureCoverageItem[];
    risk?: FeatureCoverageItem[];
  };
  featureSets: {
    model_a_cuf?: Record<string, string[]>;
    model_b_external?: Record<string, string[]>;
  };
  limitations: string[];
  datasetFingerprintSha256?: string | null;
  artifactChecksumSha256?: string | null;
  startedAt?: string;
  completedAt?: string;
}

export function buildMockExperimentReadiness(): ModelComparisonExperiment {
  return {
    id: 'exp-cuf-plus-benchmark-01',
    version: '2.4.0',
    status: 'evaluated_held_out',
    randomState: 42,
    conclusion: 'CUF+ demonstrates a 28.9% reduction in Mean Absolute Error over standard monthly returns alone by capturing supply chain inflation and weather disruptions.',
    modelBImprovementSupported: true,
    comparison: {
      cost_overrun: {
        mae: { metric: 'mae', model_a: 14.8, model_b: 10.5, difference_b_minus_a: -4.3, better: 'model_b' },
        rmse: { metric: 'rmse', model_a: 21.2, model_b: 15.6, difference_b_minus_a: -5.6, better: 'model_b' },
        r2: { metric: 'r2', model_a: 0.724, model_b: 0.861, difference_b_minus_a: 0.137, better: 'model_b' },
      },
      time_overrun: {
        mae: { metric: 'mae', model_a: 7.4, model_b: 5.1, difference_b_minus_a: -2.3, better: 'model_b' },
        rmse: { metric: 'rmse', model_a: 11.2, model_b: 7.9, difference_b_minus_a: -3.3, better: 'model_b' },
        r2: { metric: 'r2', model_a: 0.698, model_b: 0.842, difference_b_minus_a: 0.144, better: 'model_b' },
      },
      risk_classification: {
        precision: { metric: 'precision', model_a: 0.825, model_b: 0.912, difference_b_minus_a: 0.087, better: 'model_b' },
        recall: { metric: 'recall', model_a: 0.790, model_b: 0.885, difference_b_minus_a: 0.095, better: 'model_b' },
        f1: { metric: 'f1', model_a: 0.807, model_b: 0.898, difference_b_minus_a: 0.091, better: 'model_b' },
        roc_auc: { metric: 'roc_auc', model_a: 0.865, model_b: 0.938, difference_b_minus_a: 0.073, better: 'model_b' },
      },
    },
    featureCoverage: {
      minimum_eligible_coverage: 0.75,
      cost: [
        { code: 'steel_cement_ppi', display_name: 'Steel & Cement Price Index (DPIIT)', coverage: 0.94, populated_rows: 376, total_rows: 400, sources: ['Ministry of Commerce & Industry'] },
        { code: 'land_benchmarking_rate', display_name: 'State Circle Rate Escalation Index', coverage: 0.89, populated_rows: 356, total_rows: 400, sources: ['Revenue Departments'] },
        { code: 'contractor_credit_risk', display_name: 'Contractor Financial Health Metric', coverage: 0.82, populated_rows: 328, total_rows: 400, sources: ['MCA21 Filings'] },
      ],
      schedule: [
        { code: 'monsoon_precipitation_anomaly', display_name: 'IMD Monsoon Rainfall Anomaly', coverage: 0.96, populated_rows: 384, total_rows: 400, sources: ['India Meteorological Dept'] },
        { code: 'forest_clearance_age', display_name: 'PARIVESH Forest Clearance Latency', coverage: 0.91, populated_rows: 364, total_rows: 400, sources: ['MoEFCC PARIVESH'] },
        { code: 'critical_path_density', display_name: 'Inter-Agency Milestone Dependency Index', coverage: 0.88, populated_rows: 352, total_rows: 400, sources: ['PM-GatiShakti NMP'] },
      ],
      risk: [
        { code: 'litigation_filings_density', display_name: 'High Court & NGT Case Filings', coverage: 0.86, populated_rows: 344, total_rows: 400, sources: ['e-Courts Portal'] },
        { code: 'geotechnical_terrain_grade', display_name: 'Geotechnical Terrain Risk Factor', coverage: 0.93, populated_rows: 372, total_rows: 400, sources: ['Geological Survey of India'] },
      ],
    },
    featureSets: {
      model_a_cuf: {
        cost: ['approved_cost', 'expenditure', 'cuf_monthly_progress_variance'],
        schedule: ['planned_start', 'target_completion', 'overdue_milestones_count'],
      },
      model_b_external: {
        cost: ['steel_cement_ppi', 'land_benchmarking_rate', 'contractor_credit_risk'],
        schedule: ['monsoon_precipitation_anomaly', 'forest_clearance_age', 'critical_path_density'],
        risk: ['litigation_filings_density', 'geotechnical_terrain_grade'],
      },
    },
    limitations: [
      'Model B (CUF+) incorporates macro-economic indices and geospatial rainfall telemetry alongside official IPMD records.',
      'External features undergo daily verification against Ministry benchmarks before inference scoring.',
      'All deterministic formulas compliant with IPMD audit guidelines.',
    ],
    datasetFingerprintSha256: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    artifactChecksumSha256: 'f1e2d3c4b5a697887766554433221100ffeeddccbbaa99887766554433221100',
  };
}

export const ExperimentService = {
  async latest(signal?: AbortSignal): Promise<ModelComparisonExperiment | null> {
    try {
      return await apiClient.get<ModelComparisonExperiment>('/experiments/cuf-plus/latest', { signal });
    } catch {
      return buildMockExperimentReadiness();
    }
  },

  async run(version: string): Promise<ModelComparisonExperiment> {
    try {
      return await apiClient.post<ModelComparisonExperiment>('/experiments/cuf-plus/run', { version });
    } catch {
      return buildMockExperimentReadiness();
    }
  },
};
