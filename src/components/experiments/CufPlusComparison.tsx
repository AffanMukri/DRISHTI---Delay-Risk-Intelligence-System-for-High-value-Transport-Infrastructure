import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, GitCompareArrows, Play, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  buildMockExperimentReadiness,
  ExperimentService,
  type ExperimentMetricDelta,
  type ModelComparisonExperiment,
} from '../../services/experimentService';
import { Badge, EmptyState, ErrorState, LoadingState } from '../ui';

const mockMode = import.meta.env.VITE_DATA_SOURCE === 'mock';

const METRICS: Array<{ task: string; label: string; metric: string; metricLabel: string; lower: boolean }> = [
  { task: 'cost_overrun', label: 'Cost overrun', metric: 'mae', metricLabel: 'MAE (cost)', lower: true },
  { task: 'cost_overrun', label: 'Cost overrun', metric: 'rmse', metricLabel: 'RMSE (cost)', lower: true },
  { task: 'cost_overrun', label: 'Cost overrun', metric: 'r2', metricLabel: 'R²', lower: false },
  { task: 'time_overrun', label: 'Time overrun', metric: 'mae', metricLabel: 'MAE (days)', lower: true },
  { task: 'time_overrun', label: 'Time overrun', metric: 'rmse', metricLabel: 'RMSE (days)', lower: true },
  { task: 'time_overrun', label: 'Time overrun', metric: 'r2', metricLabel: 'R²', lower: false },
  { task: 'risk_classification', label: 'Risk classification', metric: 'precision', metricLabel: 'Precision', lower: false },
  { task: 'risk_classification', label: 'Risk classification', metric: 'recall', metricLabel: 'Recall', lower: false },
  { task: 'risk_classification', label: 'Risk classification', metric: 'f1', metricLabel: 'F1', lower: false },
  { task: 'risk_classification', label: 'Risk classification', metric: 'roc_auc', metricLabel: 'AUC', lower: false },
];

function value(value: number | null, metric: string): string {
  if (value === null || !Number.isFinite(value)) return 'Not available';
  if (['precision', 'recall', 'f1', 'roc_auc', 'r2'].includes(metric)) return value.toFixed(3);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ExperimentResults({ experiment }: { experiment: ModelComparisonExperiment }) {
  const rows = METRICS.map(item => ({
    ...item,
    result: experiment.comparison[item.task]?.[item.metric] ?? null,
  })).filter((item): item is typeof item & { result: ExperimentMetricDelta } => Boolean(item.result));
  const coverage = useMemo(() => {
    const merged = new Map<string, NonNullable<ModelComparisonExperiment['featureCoverage']['cost']>[number]>();
    for (const list of [experiment.featureCoverage.cost, experiment.featureCoverage.schedule, experiment.featureCoverage.risk]) {
      for (const item of list ?? []) {
        const current = merged.get(item.code);
        if (!current || item.coverage > current.coverage) merged.set(item.code, item);
      }
    }
    return [...merged.values()].sort((a, b) => b.coverage - a.coverage);
  }, [experiment]);

  return <div className="space-y-4">
    <div className={`p-3.5 rounded border text-xs flex items-start gap-3 ${experiment.modelBImprovementSupported ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
      {experiment.modelBImprovementSupported ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
      <div>
        <p className="font-semibold">{experiment.conclusion}</p>
        <p className="text-2xs mt-1 opacity-80">Version {experiment.version} · {experiment.status.replaceAll('_', ' ')} · random seed {experiment.randomState} · held-out test metrics</p>
      </div>
    </div>

    {rows.length ? <div className="overflow-x-auto border border-slate-200 rounded">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="text-left px-3 py-2">Outcome</th><th className="text-left px-3 py-2">Metric</th><th className="text-right px-3 py-2">Model A: CUF</th><th className="text-right px-3 py-2">Model B: CUF+</th><th className="text-right px-3 py-2">B − A</th><th className="text-left px-3 py-2">Measured result</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(({ task, label, metric, metricLabel, result }) => <tr key={`${task}-${metric}`}><td className="px-3 py-2 font-medium text-navy-800">{label}</td><td className="px-3 py-2 text-slate-600">{metricLabel}</td><td className="px-3 py-2 text-right tabular-nums">{value(result.model_a, metric)}</td><td className="px-3 py-2 text-right tabular-nums">{value(result.model_b, metric)}</td><td className="px-3 py-2 text-right tabular-nums">{value(result.difference_b_minus_a, metric)}</td><td className="px-3 py-2"><Badge variant={result.better === 'model_b' ? 'healthy' : result.better === 'tie' ? 'neutral' : 'watch'}>{result.better === 'model_b' ? 'CUF+ better' : result.better === 'model_a' ? 'CUF better' : result.better === 'tie' ? 'Tie' : 'Unavailable'}</Badge></td></tr>)}</tbody>
      </table>
    </div> : <EmptyState title="No comparable held-out metrics" description="Validated external coverage or historical labels are insufficient. No Model B performance claim was produced." />}

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border border-slate-200 rounded p-3.5">
        <h3 className="text-xs font-semibold text-navy-800 flex items-center gap-2"><Database className="w-4 h-4 text-gov-blue" />Validated external feature coverage</h3>
        <p className="text-2xs text-slate-500 mt-1">Eligibility floor: {((experiment.featureCoverage.minimum_eligible_coverage ?? 0) * 100).toFixed(0)}%. Definitions without observations remain at 0%.</p>
        <div className="mt-3 max-h-52 overflow-y-auto divide-y divide-slate-100">{coverage.map(item => <div key={item.code} className="py-2"><div className="flex justify-between gap-3"><span className="text-xs font-medium text-slate-700">{item.display_name}</span><span className="text-xs font-semibold tabular-nums">{(item.coverage * 100).toFixed(1)}%</span></div><p className="text-2xs text-slate-400">{item.populated_rows}/{item.total_rows} rows · {item.sources.length ? item.sources.join(', ') : 'No validated source'}</p></div>)}</div>
      </div>
      <div className="border border-slate-200 rounded p-3.5">
        <h3 className="text-xs font-semibold text-navy-800">Features and limitations</h3>
        <p className="text-2xs text-slate-500 mt-1">Model A uses current leakage-screened CUF fields. Model B adds only the eligible fields listed below.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{[...new Set(Object.values(experiment.featureSets.model_b_external ?? {}).flat())].map(feature => <span key={feature} className="text-2xs font-mono px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-100">{feature}</span>)}</div>
        {!Object.values(experiment.featureSets.model_b_external ?? {}).flat().length && <p className="text-xs text-amber-700 mt-3">No external feature currently meets the validation and coverage rules.</p>}
        <ul className="mt-3 list-disc pl-4 space-y-1 text-2xs text-slate-600">{experiment.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
      </div>
    </div>
    <p className="text-2xs text-slate-400 font-mono break-all">Dataset fingerprint: {experiment.datasetFingerprintSha256 || 'Not available'}</p>
  </div>;
}

export function CufPlusComparison() {
  const { hasPermission } = useAuth();
  const [experiment, setExperiment] = useState<ModelComparisonExperiment | null>(() => mockMode ? buildMockExperimentReadiness() : null);
  const [loading, setLoading] = useState(!mockMode);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setVersion(current => current + 1);
  }, []);

  useEffect(() => {
    if (mockMode) return;
    const controller = new AbortController();
    void ExperimentService.latest(controller.signal).then(setExperiment).catch(loadError => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load experiment metadata.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      setExperiment(await ExperimentService.run(`exp-${timestamp}`));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unable to run the experiment.');
    } finally {
      setRunning(false);
    }
  };

  return <div className="card">
    <div className="card-header flex-wrap gap-3">
      <div className="flex items-start gap-2"><GitCompareArrows className="w-4 h-4 text-gov-blue mt-0.5" /><div><h2 className="text-sm font-semibold text-navy-800">CUF vs CUF+ Experimental Comparison</h2><p className="text-xs text-slate-500 mt-0.5">Same cohort, chronological partitions, model candidates, and evaluation rules for both feature sets.</p></div></div>
      <div className="flex gap-2">{!mockMode && <button onClick={retry} className="btn btn-secondary btn-sm" disabled={loading || running}><RefreshCw className="w-3 h-3 mr-1" />Refresh</button>}{!mockMode && hasPermission('analyse_data') && <button onClick={() => void run()} className="btn btn-primary btn-sm" disabled={loading || running}><Play className="w-3 h-3 mr-1" />{running ? 'Running…' : 'Run experiment'}</button>}</div>
    </div>
    <div className="p-5">
      {mockMode && <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong>Experiment-readiness view:</strong> this panel lists the CUF baseline and legitimate external-feature candidates, while preserving zero coverage and omitting metrics until validated observations exist.</div>}
      {loading && !experiment ? <LoadingState message="Loading measured experiment metadata…" /> : error && !experiment ? <ErrorState description={error} onRetry={retry} /> : experiment ? <><>{error && <div className="mb-3 p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">{error}</div>}</><ExperimentResults experiment={experiment} /></> : <EmptyState title="No experiment has been run" description="Register and validate external observations, then run an immutable comparison version. Insufficient coverage will be reported without a Model B claim." />}
    </div>
  </div>;
}
