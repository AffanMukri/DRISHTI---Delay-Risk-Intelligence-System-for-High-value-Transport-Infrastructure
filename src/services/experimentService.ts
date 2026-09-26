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

export function buildMockExperimentReadiness(totalRows = 40): ModelComparisonExperiment {
  const candidates: ExternalFeatureCoverage[] = [
    ['weather_disruption_days', 'Weather disruption days', 'weather', 'days'],
    ['land_acquisition_progress', 'Land acquisition progress', 'land', '%'],
    ['environmental_clearance_delay_days', 'Environmental clearance delay', 'clearances', 'days'],
    ['contractor_completion_rate', 'Contractor historical completion rate', 'contractor', '%'],
    ['commodity_price_index_change', 'Material price-index change', 'commodity', '%'],
    ['district_infrastructure_index', 'District infrastructure index', 'district', 'index'],
    ['active_litigation_count', 'Active litigation indicators', 'litigation', 'count'],
    ['procurement_delay_days', 'Procurement delay', 'procurement', 'days'],
    ['geographic_complexity_index', 'Geographic complexity index', 'geography', 'index'],
    ['fund_release_variance_days', 'Fund-release variance', 'funding', 'days'],
  ].map(([code, display_name, category, unit]) => ({
    code,
    display_name,
    category,
    unit,
    populated_rows: 0,
    total_rows: totalRows,
    coverage: 0,
    sources: [],
  }));

  return {
    experimentCode: 'cuf-vs-cuf-plus-readiness',
    version: 'demo-readiness-v1',
    status: 'insufficient_data',
    startedAt: '2026-04-30T09:30:00Z',
    completedAt: '2026-04-30T09:30:01Z',
    randomState: 42,
    methodology: {
      purpose: 'Pre-experiment readiness assessment only',
      cohort_rows: totalRows,
      split_strategy: 'Chronological train/validation/test split required when labelled historical outcomes exist',
      comparison_rule: 'Identical cohort, target definitions, partitions, preprocessing, and evaluation metrics for Model A and Model B',
      performance_metrics_computed: false,
    },
    featureSets: {
      model_a: {
        cost: ['approved_cost', 'revised_cost', 'expenditure', 'physical_progress', 'planned_progress'],
        schedule: ['physical_progress', 'planned_progress', 'delay_days', 'milestone_status', 'completion_dates'],
        risk: ['cost_escalation_pct', 'progress_variance', 'schedule_delay_days', 'milestone_slippage'],
      },
      model_b_external: {},
      leakage_exclusions: {
        all_targets: ['final_cost_after_outcome', 'actual_completion_date_after_snapshot', 'future_warning_or_risk_state'],
      },
    },
    featureCoverage: {
      cost: candidates,
      schedule: candidates,
      risk: candidates,
      minimum_eligible_coverage: 0.7,
    },
    metrics: {},
    comparison: {
      cost_overrun: null,
      time_overrun: null,
      risk_classification: null,
    },
    limitations: [
      'The demonstration portfolio contains no source-attributed external observations, so Model B cannot be trained or evaluated.',
      'Current project snapshots are not a sufficient labelled historical outcome cohort for an unbiased train/test experiment.',
      'Coverage values are zero until external records pass source, date, project-linkage, and validation checks.',
      'No performance improvement, causal effect, or CUF+ advantage is claimed by this readiness assessment.',
    ],
    datasetFingerprintSha256: null,
    artifactChecksumSha256: null,
    conclusion: 'CUF+ comparison is not yet measurable: validated external coverage and historical outcome labels are insufficient.',
    modelBImprovementSupported: false,
  };
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
