import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Clock3,
  Database, Play, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { Badge, EmptyState, ErrorState, LoadingState } from '../components/ui';
import ModelReadinessDashboard from '../components/model/ModelReadinessDashboard';
import { usePragatiData } from '../context/PragatiDataContext';
import {
  ModelMonitoringService,
  type ModelInventoryItem,
  type ModelInventoryResponse,
  type ModelMonitoringRun,
  type MonitoringTestResult,
} from '../services/modelMonitoringService';

const mockMode = import.meta.env.VITE_DATA_SOURCE === 'mock';

function dateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function monitoringBadge(status?: string | null) {
  if (status === 'sufficient' || status === 'stable') return <Badge variant="healthy">{status.replaceAll('_', ' ')}</Badge>;
  if (status === 'drift_detected' || status === 'degraded' || status === 'failed') return <Badge variant="critical">{status.replaceAll('_', ' ')}</Badge>;
  if (status === 'partial' || status === 'watch') return <Badge variant="watch">{status.replaceAll('_', ' ')}</Badge>;
  return <Badge variant="neutral">{(status || 'not monitored').replaceAll('_', ' ')}</Badge>;
}

function number(value: unknown, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function trainingPeriod(model: ModelInventoryItem): string {
  const period = model.trainingPeriod;
  if (!period) return 'Not recorded for this artifact';
  const start = period.snapshot_start || period.label_start;
  const end = period.snapshot_end || period.label_end;
  return start || end ? `${start || 'unknown'} to ${end || 'unknown'}` : 'Not recorded for this artifact';
}

function TestTable({ title, tests }: { title: string; tests: Record<string, MonitoringTestResult> }) {
  const entries = Object.entries(tests);
  return <div className="card overflow-hidden">
    <div className="card-header"><div><h3 className="text-sm font-semibold text-navy-800">{title}</h3><p className="text-2xs text-slate-500 mt-0.5">Unavailable statistics are suppressed when sample or expected-count requirements are not met.</p></div></div>
    {!entries.length ? <div className="p-5"><EmptyState title="No monitoring evidence" description="A verified model artifact and recent inference feature snapshots are required." /></div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="text-left px-3 py-2">Feature / output</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-3 py-2">Reference</th><th className="text-right px-3 py-2">Current</th><th className="text-right px-3 py-2">PSI</th><th className="text-right px-3 py-2">KS / chi-square</th><th className="text-right px-3 py-2">p-value</th><th className="text-left px-3 py-2">Availability</th></tr></thead><tbody className="divide-y divide-slate-100">{entries.map(([feature, result]) => <tr key={feature}><td className="px-3 py-2 font-mono text-2xs text-navy-800">{feature}</td><td className="px-3 py-2">{monitoringBadge(result.status)}</td><td className="px-3 py-2 text-right tabular-nums">{result.reference_count ?? '--'}</td><td className="px-3 py-2 text-right tabular-nums">{result.current_count ?? '--'}</td><td className="px-3 py-2 text-right tabular-nums">{number(result.psi)}</td><td className="px-3 py-2 text-right tabular-nums">{number(result.ks_statistic ?? result.chi_square)}</td><td className="px-3 py-2 text-right tabular-nums">{number(result.p_value, 4)}</td><td className="px-3 py-2 text-2xs text-slate-500 max-w-xs">{result.reason || result.kind || 'Calculated'}</td></tr>)}</tbody></table></div>}
  </div>;
}

function PerformancePanel({ performance }: { performance: ModelMonitoringRun['performanceMonitoring'] }) {
  return <div className="card p-4"><h3 className="text-sm font-semibold text-navy-800">Realized Performance</h3><p className="text-2xs text-slate-500 mt-1">Compared only after actual outcomes are stored against prior predictions.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">{Object.entries(performance).map(([task, item]) => <div key={task} className="rounded border border-slate-200 p-3"><div className="flex justify-between items-center"><span className="text-xs font-semibold capitalize">{task}</span>{monitoringBadge(String(item.status || 'insufficient_data'))}</div><p className="text-2xs text-slate-500 mt-1">Evaluated outcomes: {item.evaluated_count ?? 0}</p>{item.metrics && <div className="grid grid-cols-2 gap-2 mt-2">{Object.entries(item.metrics as Record<string, number>).map(([metric, metricValue]) => <div key={metric} className="bg-slate-50 rounded p-2"><span className="block text-2xs uppercase text-slate-400">{metric}</span><span className="text-xs font-semibold tabular-nums">{number(metricValue)}</span></div>)}</div>}{item.reason && <p className="text-2xs text-amber-700 mt-2">{String(item.reason)}</p>}</div>)}</div></div>;
}

function ModelDetails({ model }: { model: ModelInventoryItem }) {
  const regression = model.evaluationMetrics?.regression?.test as Record<string, number> | undefined;
  const classification = model.evaluationMetrics?.classification?.test as Record<string, number> | undefined;
  return <div className="card p-4 space-y-4"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-bold text-navy-900">{model.name}</h2><p className="text-xs text-slate-500 mt-0.5">Version {model.version} | {model.algorithm || 'Algorithm not recorded'}</p></div><div className="flex gap-2">{model.active ? <Badge variant="healthy">Active</Badge> : <Badge variant="neutral">{model.status}</Badge>}{model.monitoringSupported ? <Badge variant="info">Statistical monitoring supported</Badge> : <Badge variant="watch">Inventory only</Badge>}</div></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs"><div><span className="text-2xs uppercase text-slate-400">Training date</span><p className="font-medium mt-0.5">{dateTime(model.trainingDate)}</p></div><div><span className="text-2xs uppercase text-slate-400">Training period</span><p className="font-medium mt-0.5">{trainingPeriod(model)}</p></div><div><span className="text-2xs uppercase text-slate-400">Training rows</span><p className="font-medium mt-0.5">{model.trainingRows?.toLocaleString() ?? 'Not recorded'}</p></div><div><span className="text-2xs uppercase text-slate-400">Last inference</span><p className="font-medium mt-0.5">{dateTime(model.lastInference)}</p></div></div><div><span className="text-2xs uppercase text-slate-400">Feature list ({model.featureList.length})</span><div className="flex flex-wrap gap-1.5 mt-2">{model.featureList.length ? model.featureList.map(feature => <span key={feature} className="text-2xs font-mono bg-slate-100 border border-slate-200 rounded px-2 py-1">{feature}</span>) : <span className="text-xs text-slate-500">No registered feature list.</span>}</div></div><div><span className="text-2xs uppercase text-slate-400">Registered evaluation metrics</span>{regression || classification ? <div className="flex flex-wrap gap-2 mt-2">{Object.entries({ ...(regression || {}), ...(classification || {}) }).map(([key, metricValue]) => <span key={key} className="text-xs bg-blue-50 border border-blue-100 text-blue-900 rounded px-2 py-1"><b>{key.toUpperCase()}</b> {number(metricValue)}</span>)}</div> : <p className="text-xs text-slate-500 mt-1">No held-out metrics registered.</p>}</div>{!model.monitoringSupported && <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">{model.monitoringUnavailableReason}</div>}</div>;
}

export default function ModelMonitoring() {
  const { projects } = usePragatiData();
  const [inventory, setInventory] = useState<ModelInventoryResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [run, setRun] = useState<ModelMonitoringRun | null>(null);
  const [loading, setLoading] = useState(!mockMode);
  const [detailLoading, setDetailLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => inventory?.items.find(model => model.id === selectedId) ?? inventory?.items[0] ?? null, [inventory, selectedId]);

  const load = useCallback(async () => {
    if (mockMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ModelMonitoringService.inventory();
      setInventory(data);
      setSelectedId(current => current || data.items[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load model inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mockMode) return;
    const controller = new AbortController();
    void ModelMonitoringService.inventory(controller.signal).then(async data => {
      if (controller.signal.aborted) return;
      setInventory(data);
      const first = data.items[0];
      setSelectedId(first?.id || '');
      if (first?.latestMonitoringRunId) {
        const detail = await ModelMonitoringService.detail(first.latestMonitoringRunId, controller.signal);
        if (!controller.signal.aborted) setRun(detail);
      }
    }).catch(loadError => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load model inventory.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const selectModel = async (model: ModelInventoryItem) => {
    setSelectedId(model.id);
    setRun(null);
    if (!model.latestMonitoringRunId) return;
    setDetailLoading(true);
    try {
      setRun(await ModelMonitoringService.detail(model.latestMonitoringRunId));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Unable to load monitoring detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  const runMonitoring = async () => {
    if (!selected) return;
    setRunning(true);
    setError(null);
    try {
      setRun(await ModelMonitoringService.run(selected.id, 90));
      const data = await ModelMonitoringService.inventory();
      setInventory(data);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unable to run model monitoring.');
    } finally {
      setRunning(false);
    }
  };

  if (mockMode) return <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-navy-900">ML Model Monitoring</h1><Badge variant="info">Administrator Only</Badge><Badge variant="neutral">No Automatic Retraining</Badge></div><p className="text-xs text-slate-500 mt-1">Model governance, deployment readiness, drift policy, missingness, output shift, and realized-performance controls.</p></div><ModelReadinessDashboard projects={projects} /></div>;
  if (loading && !inventory) return <div className="min-h-[65vh] flex items-center justify-center"><LoadingState message="Loading deployed model inventory..." /></div>;
  if (error && !inventory) return <div className="p-6"><div className="card"><ErrorState description={error} onRetry={() => void load()} /></div></div>;

  return <div className="p-6 space-y-6 max-w-7xl mx-auto"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-xl font-bold text-navy-900">ML Model Monitoring</h1><Badge variant="info">Administrator Only</Badge><Badge variant="neutral">No Automatic Retraining</Badge></div><p className="text-xs text-slate-500 mt-1">Statistical observability for registered model versions. Monitoring reports never deploy or retrain a model.</p></div><button onClick={() => void load()} disabled={loading || running} className="btn btn-secondary btn-sm"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><div className="card p-4"><Database className="w-4 h-4 text-gov-blue" /><p className="text-2xl font-bold mt-2">{inventory?.total ?? 0}</p><p className="text-xs text-slate-500">Registered versions</p></div><div className="card p-4"><ShieldCheck className="w-4 h-4 text-green-600" /><p className="text-2xl font-bold mt-2">{inventory?.activeModels ?? 0}</p><p className="text-xs text-slate-500">Active models</p></div><div className="card p-4"><Activity className="w-4 h-4 text-blue-600" /><p className="text-2xl font-bold mt-2">{inventory?.modelsWithInference ?? 0}</p><p className="text-xs text-slate-500">With genuine inference</p></div><div className="card p-4"><AlertTriangle className="w-4 h-4 text-amber-600" /><p className="text-2xl font-bold mt-2">{inventory?.modelsRequiringAttention ?? 0}</p><p className="text-xs text-slate-500">Requiring review</p></div></div>
    <div className="card"><div className="card-header flex-wrap gap-3"><div><h2 className="text-sm font-semibold text-navy-800">Deployed Model Registry</h2><p className="text-2xs text-slate-500">Select a version to inspect metadata and its latest persisted monitoring report.</p></div>{selected && <button onClick={() => void runMonitoring()} disabled={running || !selected.monitoringSupported} className="btn btn-primary btn-sm"><Play className="w-3 h-3" />{running ? 'Calculating...' : 'Run 90-day monitoring'}</button>}</div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="text-left px-3 py-2">Model</th><th className="text-left px-3 py-2">Version</th><th className="text-left px-3 py-2">Deployment</th><th className="text-left px-3 py-2">Last inference</th><th className="text-right px-3 py-2">Inference records</th><th className="text-left px-3 py-2">Latest monitoring</th></tr></thead><tbody className="divide-y divide-slate-100">{inventory?.items.map(model => <tr key={model.id} onClick={() => void selectModel(model)} className={`cursor-pointer hover:bg-blue-50/40 ${selected?.id === model.id ? 'bg-blue-50/70' : ''}`}><td className="px-3 py-2 font-medium text-navy-900">{model.name}</td><td className="px-3 py-2 font-mono text-2xs">{model.version}</td><td className="px-3 py-2">{model.active ? <Badge variant="healthy">Active</Badge> : <Badge variant="neutral">{model.status}</Badge>}</td><td className="px-3 py-2">{dateTime(model.lastInference)}</td><td className="px-3 py-2 text-right tabular-nums">{model.inferenceCount.toLocaleString()}</td><td className="px-3 py-2">{monitoringBadge(model.latestMonitoringStatus)}</td></tr>)}</tbody></table></div></div>
    {selected ? <ModelDetails model={selected} /> : <div className="card p-5"><EmptyState title="No registered models" description="Register a model version before monitoring can begin." /></div>}
      {detailLoading ? <div className="card p-5"><LoadingState message="Loading the latest monitoring report..." /></div> : run && run.modelVersionId === selected?.id ? <><div className="card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-navy-900">Latest Monitoring Report</h2><p className="text-2xs text-slate-500 mt-1">{dateTime(run.monitoringWindowStart)} to {dateTime(run.monitoringWindowEnd)} | completed {dateTime(run.completedAt)}</p></div>{monitoringBadge(run.status)}</div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4"><div className="bg-slate-50 rounded p-3"><span className="text-2xs uppercase text-slate-400">Training reference</span><p className="font-bold">{run.referenceSampleSize}</p></div><div className="bg-slate-50 rounded p-3"><span className="text-2xs uppercase text-slate-400">Current inference</span><p className="font-bold">{run.currentSampleSize}</p></div><div className="bg-slate-50 rounded p-3"><span className="text-2xs uppercase text-slate-400">Previous window</span><p className="font-bold">{run.comparisonSampleSize}</p></div><div className="bg-slate-50 rounded p-3"><span className="text-2xs uppercase text-slate-400">Realized outcomes</span><p className="font-bold">{run.evaluatedOutcomeCount}</p></div></div><div className={`mt-3 p-3 rounded border text-xs ${run.summary.attention_required ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900'}`}>{run.summary.attention_required ? <AlertTriangle className="w-4 h-4 inline mr-2" /> : <CheckCircle2 className="w-4 h-4 inline mr-2" />}{run.summary.attention_required ? 'Statistical signals require administrative review.' : 'No calculated monitoring signal crossed the configured review thresholds.'} No retraining was triggered.</div></div><TestTable title="Feature / Data Drift" tests={run.featureDrift} /><TestTable title="Prediction Distribution Shift" tests={run.predictionShift} /><TestTable title="Missing-Feature Changes" tests={run.missingFeatureChanges} /><PerformancePanel performance={run.performanceMonitoring} />{run.limitations.length > 0 && <div className="card p-4"><h3 className="text-sm font-semibold text-navy-800">Limitations and unavailable checks</h3><ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-slate-600">{run.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</> : selected?.monitoringSupported ? <div className="card p-5"><EmptyState title="No monitoring report for this version" description="Run monitoring to create a persistent statistical snapshot. It will not retrain or change deployment status." /></div> : null}
    <div className="p-3 rounded border bg-blue-50 border-blue-200 text-xs text-blue-900 flex items-start gap-2"><Clock3 className="w-4 h-4 shrink-0 mt-0.5" /><span>Monitoring is an administrative observation and review workflow. Model retirement, replacement, validation, and retraining remain explicit controlled actions outside this module.</span></div>
  </div>;
}
