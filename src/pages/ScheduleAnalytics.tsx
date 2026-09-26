import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, Clock, Database, Search, Timer,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import { useAuth } from '../hooks/useAuth';
import { ProjectService } from '../services';
import { SchedulePredictionService } from '../services/schedulePredictionService';
import { buildMockProjectHistory, buildMockScheduleProjection } from '../services/mockProjectIntelligence';
import {
  scheduleAnalyticsService,
  type ScheduleAnalyticsResponse,
  type ScheduleDelayFilter,
} from '../services/scheduleAnalyticsService';
import { Badge, EmptyState, ErrorState, KPICard, LoadingState } from '../components/ui';
import type { ProjectHistory, ScheduleOverrunPrediction } from '../types';

const BRACKET_COLORS = ['#16a34a', '#f59e0b', '#ea580c', '#dc2626', '#991b1b'];
const USE_BACKEND_DATA = import.meta.env.VITE_DATA_SOURCE !== 'mock';

function dateLabel(value: string | null | undefined): string {
  if (!value) return 'Not reported';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;
}

function delayLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'Dates unavailable';
  if (days <= 0) return days < 0 ? `${Math.abs(days)} days ahead` : 'On schedule';
  return `${days.toLocaleString()} days (${(days / 365).toFixed(1)} yrs)`;
}

export default function ScheduleAnalytics() {
  const { navigate } = useApp();
  const { hasPermission } = useAuth();
  const { projects } = usePragatiData();
  const [selectedSector, setSelectedSector] = useState('All');
  const [delayFilter, setDelayFilter] = useState<ScheduleDelayFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deferredSearch, setDeferredSearch] = useState('');
  const [data, setData] = useState<ScheduleAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [predictionProjectId, setPredictionProjectId] = useState('');
  const [schedulePrediction, setSchedulePrediction] = useState<ScheduleOverrunPrediction | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<ProjectHistory | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  const sectors = useMemo(() => ['All', ...new Set(projects.map(project => project.sector))], [projects]);
  const retry = useCallback(() => setVersion(value => value + 1), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void scheduleAnalyticsService.get({
      sector: selectedSector === 'All' ? undefined : selectedSector,
      delayFilter,
      search: deferredSearch || undefined,
    }, controller.signal).then(setData).catch(loadError => {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load schedule analytics.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [deferredSearch, delayFilter, selectedSector, version]);

  const effectivePredictionProjectId = data?.projectBreakdown.some(
    project => project.projectId === predictionProjectId,
  ) ? predictionProjectId : data?.projectBreakdown[0]?.projectId || '';

  useEffect(() => {
    setSchedulePrediction(null);
    setPredictionHistory(null);
    setPredictionError(null);
    if (!effectivePredictionProjectId || !hasPermission('view_predictions')) return;
    if (!USE_BACKEND_DATA) {
      setSchedulePrediction(buildMockScheduleProjection(effectivePredictionProjectId));
      setPredictionHistory(buildMockProjectHistory(effectivePredictionProjectId));
      setPredictionLoading(false);
      return;
    }
    const controller = new AbortController();
    setPredictionLoading(true);
    void Promise.all([
      SchedulePredictionService.getLatest(effectivePredictionProjectId, controller.signal),
      ProjectService.getProjectHistory(effectivePredictionProjectId, controller.signal),
    ]).then(([prediction, history]) => {
      setSchedulePrediction(prediction);
      setPredictionHistory(history);
    }).catch(loadError => {
      if (!controller.signal.aborted) {
        setPredictionError(loadError instanceof Error ? loadError.message : 'Unable to load schedule prediction data.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setPredictionLoading(false);
    });
    return () => controller.abort();
  }, [effectivePredictionProjectId, hasPermission]);

  const runSchedulePrediction = useCallback(async () => {
    if (!effectivePredictionProjectId) return;
    setPredictionLoading(true);
    setPredictionError(null);
    try {
      setSchedulePrediction(await SchedulePredictionService.generate(effectivePredictionProjectId));
      if (!predictionHistory) {
        setPredictionHistory(await ProjectService.getProjectHistory(effectivePredictionProjectId));
      }
    } catch (predictionFailure) {
      setPredictionError(predictionFailure instanceof Error ? predictionFailure.message : 'Schedule prediction failed.');
    } finally {
      setPredictionLoading(false);
    }
  }, [effectivePredictionProjectId, predictionHistory]);

  const trend = useMemo(() => data?.series.map(point => ({ ...point, month: monthLabel(point.period) })) ?? [], [data]);
  const sectorDelayData = useMemo(() => data?.sectorBreakdown.map(row => ({
    ...row,
    label: row.sector.length > 18 ? `${row.sector.slice(0, 16)}…` : row.sector,
    averageDelayMonths: row.averageDelayDays / 30.44,
  })) ?? [], [data]);
  const projectPredictionTrend = useMemo(() => {
    const points = new Map<string, { period: string; month: string; planned?: number; actual?: number; predicted?: number }>();
    for (const update of predictionHistory?.monthlyUpdates ?? []) {
      points.set(update.reportingMonth, {
        period: update.reportingMonth,
        month: monthLabel(update.reportingMonth),
        planned: update.plannedProgress,
        actual: update.physicalProgress,
      });
    }
    for (const predictionPoint of schedulePrediction?.predictedProgressSeries ?? []) {
      const existing = points.get(predictionPoint.period);
      points.set(predictionPoint.period, {
        period: predictionPoint.period,
        month: monthLabel(predictionPoint.period),
        planned: existing?.planned,
        actual: existing?.actual,
        predicted: predictionPoint.predictedProgress,
      });
    }
    return [...points.values()].sort((left, right) => left.period.localeCompare(right.period));
  }, [predictionHistory, schedulePrediction]);

  if (loading && !data) {
    return <div className="min-h-[65vh] flex items-center justify-center"><LoadingState message="Aggregating project schedules, monthly progress, and milestones…" /></div>;
  }
  if (error && !data) {
    return <div className="p-6"><div className="card"><ErrorState description={error} onRetry={retry} /></div></div>;
  }
  if (!data) {
    return <div className="p-6"><EmptyState title="No schedule analytics available" description="The API returned no schedule aggregation data." /></div>;
  }

  const { summary, dataAvailability: availability } = data;
  const delayedPercent = summary.totalProjects > 0
    ? (summary.delayedProjects / summary.totalProjects) * 100
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Schedule Analytics & Delay Forensics</h1>
            <Badge variant="neutral">MoSPI Time Overrun Audit</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">{USE_BACKEND_DATA ? 'Database-backed completion slippage, progress velocity, and milestone execution monitoring.' : 'Deterministic schedule analysis from the available demonstration project snapshots.'}</p>
        </div>
        <select value={selectedSector} onChange={event => setSelectedSector(event.target.value)} className="select py-1 text-xs w-44">
          {sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}
        </select>
      </div>

      {error && <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center justify-between"><span>{error}</span><button onClick={retry} className="font-semibold underline">Retry</button></div>}
      {loading && <div className="h-1 bg-blue-100 overflow-hidden rounded"><div className="h-full w-1/3 bg-gov-blue animate-pulse" /></div>}

      <div className={`p-3.5 rounded border flex items-start gap-3 text-xs ${availability.comparableDateProjects < availability.totalProjects ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
        <Database className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">Schedule data availability</p>
          <p className="mt-0.5">
            {availability.comparableDateProjects} of {availability.totalProjects} projects have comparable completion dates; {availability.comparableProgressProjects} have planned and actual progress; {availability.monthlyHistoryProjects} include {USE_BACKEND_DATA ? 'monthly history' : 'reconstructed demonstration history'}.
          </p>
          <p className="text-2xs mt-1 opacity-80">
            Milestone reporting: {availability.milestoneReportingProjects} projects · Detailed milestone dates: {availability.milestoneDetailProjects} · Elapsed-duration coverage: {availability.elapsedDurationProjects} · Velocity coverage: {availability.velocityProjects}
            {availability.latestReportingMonth && ` · Latest monthly record: ${monthLabel(availability.latestReportingMonth)}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Delayed Projects" value={`${summary.delayedProjects} / ${summary.totalProjects}`} subtitle={`${delayedPercent.toFixed(1)}% of comparable projects delayed`} status="danger" icon={<Clock className="w-5 h-5 text-red-600" />} />
        <KPICard title="Average Slippage" value={`${Math.round(summary.averageSlippageDays / 30.44)} Months`} subtitle={`${Math.round(summary.averageSlippageDays).toLocaleString()} days across delayed projects`} status="warning" icon={<Timer className="w-5 h-5 text-amber-600" />} />
        <KPICard title="Chronic Delay (> 5 Yrs)" value={summary.chronicDelayedProjects} subtitle={`${summary.chronicDelayedProjects} projects exceed five years`} status="danger" icon={<AlertTriangle className="w-5 h-5 text-red-700" />} />
        <KPICard title="Strictly On-Schedule" value={summary.onTimeProjects} subtitle="Current completion is on/before baseline" status="healthy" icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="card lg:col-span-7">
          <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Portfolio Delay Histogram</h2><p className="text-xs text-slate-500 mt-0.5">Current completion date minus original completion date</p></div></div>
          <div className="card-body">
            {data.delayBrackets.length ? <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.delayBrackets} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="bracket" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <ReTooltip formatter={(value: any) => [`${value} projects`, 'Count']} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="projectCount" radius={[4, 4, 0, 0]}>{data.delayBrackets.map((row, index) => <Cell key={row.bracket} fill={BRACKET_COLORS[index % BRACKET_COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer> : <EmptyState title="No comparable completion dates" description="Original and current completion dates are required for the histogram." />}
          </div>
        </div>

        <div className="card lg:col-span-5">
          <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Sector Slippage Index</h2><p className="text-xs text-slate-500 mt-0.5">Average positive delay among delayed projects</p></div></div>
          <div className="card-body">
            {sectorDelayData.length ? <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sectorDelayData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} unit="m" />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 9, fill: '#64748b' }} width={90} />
                <ReTooltip formatter={(value: any) => [`${Number(value).toFixed(1)} months`, 'Average delay']} />
                <Bar dataKey="averageDelayMonths" fill="#176b78" radius={[0, 4, 4, 0]}>{sectorDelayData.map(row => <Cell key={row.sector} fill={row.averageDelayDays >= 1095 ? '#dc2626' : row.averageDelayDays >= 730 ? '#ea580c' : '#176b78'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer> : <EmptyState title="No sector schedule data" description="No projects match the selected filters." />}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Planned vs. Actual Historical Progress</h2><p className="text-xs text-slate-500 mt-0.5">{USE_BACKEND_DATA ? 'Monthly portfolio averages; velocity is actual progress change per calendar month' : 'Deterministically reconstructed synthetic portfolio progress; not imported CUF history'}</p></div><Badge variant={availability.monthlyHistoryProjects ? 'info' : 'neutral'}>{availability.monthlyHistoryProjects ? (USE_BACKEND_DATA ? 'Monthly database records' : 'Synthetic demo history') : 'Awaiting monthly records'}</Badge></div>
        <div className="card-body">
          {trend.length ? <ResponsiveContainer width="100%" height={290}>
            <LineChart data={trend} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
              <ReTooltip formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name ?? '']} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.period} · ${payload[0].payload.reportingProjects} reporting projects` : ''} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="plannedProgress" name="Planned progress" stroke="#64748b" strokeWidth={2} strokeDasharray="5 4" connectNulls={false} />
              <Line type="monotone" dataKey="actualProgress" name="Actual progress" stroke="#176b78" strokeWidth={2.5} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer> : <EmptyState title="No monthly progress history" description="The planned-vs-actual chart will appear after monthly CUF updates are imported." />}
        </div>
      </div>

      {hasPermission('view_predictions') && (
        <div className="card">
          <div className="card-header flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">{USE_BACKEND_DATA ? 'Project Schedule ML Forecast' : 'Deterministic Demo Schedule Projection'}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{USE_BACKEND_DATA ? 'Independent completion-delay model; actual, planned, and predicted values remain visually distinct.' : 'Transparent rule projection from the selected synthetic project snapshot; no trained model or probability is implied.'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={effectivePredictionProjectId}
                onChange={event => setPredictionProjectId(event.target.value)}
                className="select py-1 text-xs max-w-64"
              >
                {data.projectBreakdown.map(project => (
                  <option key={project.projectId} value={project.projectId}>{project.projectName}</option>
                ))}
              </select>
              {USE_BACKEND_DATA && hasPermission('analyse_data') && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void runSchedulePrediction()} disabled={predictionLoading || !effectivePredictionProjectId}>
                  {predictionLoading ? 'Running…' : schedulePrediction ? 'Run again' : 'Run prediction'}
                </button>
              )}
            </div>
          </div>
          <div className="card-body space-y-4">
            {predictionError && (
              <ErrorState title="Schedule prediction unavailable" description={predictionError} onRetry={hasPermission('analyse_data') ? () => void runSchedulePrediction() : undefined} />
            )}
            {predictionLoading && <LoadingState message="Loading the schedule projection…" />}
            {!predictionLoading && !predictionError && !schedulePrediction && (
              <EmptyState
                title="No schedule projection available"
                description={USE_BACKEND_DATA ? (hasPermission('analyse_data') ? 'Run the active trained model for the selected project.' : 'An Administrator or Analyst must generate this prediction.') : 'The selected demonstration project does not contain the fields required for a deterministic projection.'}
              />
            )}
            {schedulePrediction && !predictionLoading && (
              <>
                {schedulePrediction.synthetic && <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900"><strong>Synthetic demonstration projection:</strong> calculated deterministically from demo progress, delay, and milestone fields. It is not a trained ML inference or an official forecast.</div>}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border rounded"><span className="text-2xs text-slate-500 block">Overrun probability</span><span className="text-lg font-bold text-navy-900">{schedulePrediction.scheduleOverrunProbability == null ? 'Not trained' : `${(schedulePrediction.scheduleOverrunProbability * 100).toFixed(1)}%`}</span></div>
                  <div className="p-3 bg-slate-50 border rounded"><span className="text-2xs text-slate-500 block">{schedulePrediction.synthetic ? 'Estimated delay' : 'Expected delay'}</span><span className={`text-lg font-bold ${schedulePrediction.expectedDelayDays > 0 ? 'text-red-700' : 'text-green-700'}`}>{schedulePrediction.expectedDelayDays.toLocaleString()} days</span></div>
                  <div className="p-3 bg-slate-50 border rounded"><span className="text-2xs text-slate-500 block">{schedulePrediction.synthetic ? 'Estimated completion' : 'Predicted completion'}</span><span className="text-sm font-bold text-navy-900">{dateLabel(schedulePrediction.predictedCompletionDate)}</span></div>
                  <div className="p-3 bg-slate-50 border rounded"><span className="text-2xs text-slate-500 block">Sensitivity range</span><span className="text-xs font-bold text-navy-900">{dateLabel(schedulePrediction.predictedCompletionDateLower)} – {dateLabel(schedulePrediction.predictedCompletionDateUpper)}</span></div>
                </div>
                <ResponsiveContainer width="100%" height={290}>
                  <LineChart data={projectPredictionTrend} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
                    <ReTooltip formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}%`, name ?? '']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="planned" name="Reported planned" stroke="#64748b" strokeWidth={2} strokeDasharray="5 4" connectNulls={false} />
                    <Line type="monotone" dataKey="actual" name="Observed actual" stroke="#176b78" strokeWidth={2.5} connectNulls={false} />
                    <Line type="monotone" dataKey="predicted" name={schedulePrediction.synthetic ? 'Estimated demo path' : 'Predicted/implied path'} stroke="#8b5cf6" strokeWidth={2.5} strokeDasharray="7 4" connectNulls={true} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-2xs text-amber-800">
                  {schedulePrediction.synthetic
                    ? `Purple values are deterministic synthetic estimates, not actual reports or ML output. They interpolate to ${schedulePrediction.modelVersion}'s estimated completion and use an uncalibrated sensitivity band.`
                    : `Purple values are not actual reports. They are linear interpolation to model version ${schedulePrediction.modelVersion}'s predicted completion date, not a separately trained monthly-progress forecast. The date range uses held-out validation error and is not formally calibrated.`}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-3"><div><h2 className="text-sm font-semibold text-navy-800">Portfolio-Wide Milestone Execution Health</h2><p className="text-2xs text-slate-500 mt-0.5">Detailed milestone records take precedence; latest monthly totals are the fallback.</p></div><Badge variant={summary.overdueMilestones > 0 ? 'critical' : 'healthy'}>{summary.overdueMilestones} overdue</Badge></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Completed', value: summary.completedMilestones, box: 'bg-green-50 border-green-200', title: 'text-green-800', number: 'text-green-900', detailClass: 'text-green-600', detail: `${summary.milestoneCompletionPercentage.toFixed(1)}% milestone completion` },
            { label: 'On Track', value: summary.onTrackMilestones, box: 'bg-blue-50 border-blue-200', title: 'text-blue-800', number: 'text-blue-900', detailClass: 'text-blue-600', detail: 'Open and within planned date' },
            { label: 'At Risk', value: summary.atRiskMilestones, box: 'bg-amber-50 border-amber-200', title: 'text-amber-800', number: 'text-amber-900', detailClass: 'text-amber-600', detail: 'Early slippage indicators' },
            { label: 'Delayed', value: summary.delayedMilestones, box: 'bg-red-50 border-red-200', title: 'text-red-800', number: 'text-red-900', detailClass: 'text-red-600', detail: `${summary.overdueMilestones} incomplete past planned date` },
          ].map(item => <div key={item.label} className={`p-3 border rounded ${item.box}`}>
            <div className="flex items-center justify-between"><span className={`text-xs font-semibold ${item.title}`}>{item.label}</span><span className={`text-sm font-bold ${item.number}`}>{item.value}</span></div>
            <p className={`text-2xs mt-1 ${item.detailClass}`}>{item.detail}</p>
          </div>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Ministry-Wise Delay</h2><p className="text-2xs text-slate-500 mt-0.5">Ranked by average positive slippage</p></div></div>
          <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Ministry</th><th>Delayed</th><th>Avg delay</th><th>Progress gap</th></tr></thead><tbody>
            {data.ministryBreakdown.slice(0, 8).map(row => <tr key={row.ministry}><td className="text-xs font-semibold text-navy-900">{row.ministry}</td><td className="text-xs">{row.delayedProjects} / {row.projectCount}</td><td className="text-xs tabular-nums">{Math.round(row.averageDelayDays)} days</td><td className={`text-xs font-semibold tabular-nums ${row.averageProgressVariance < 0 ? 'text-red-700' : 'text-green-700'}`}>{row.averageProgressVariance > 0 ? '+' : ''}{row.averageProgressVariance.toFixed(1)} pp</td></tr>)}
            {data.ministryBreakdown.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-8">No ministry records match the filters.</td></tr>}
          </tbody></table></div>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-navy-800">Current Progress Position</h2>
          <p className="text-2xs text-slate-500 mt-0.5 mb-5">Averages from the latest available project/monthly records</p>
          <div className="space-y-5">
            {[{ label: 'Planned physical progress', value: summary.averagePlannedProgress, color: 'bg-slate-500' }, { label: 'Actual physical progress', value: summary.averageActualProgress, color: 'bg-blue-600' }].map(item => <div key={item.label}><div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{item.label}</span><span className="font-semibold">{item.value.toFixed(1)}%</span></div><div className="progress-bar"><div className={`progress-fill ${item.color}`} style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} /></div></div>)}
            <div className="grid grid-cols-3 gap-3 pt-2"><div className="p-3 bg-slate-50 rounded border"><span className="text-2xs text-slate-500 block">Variance</span><span className={`text-sm font-bold ${summary.averageProgressVariance < 0 ? 'text-red-700' : 'text-green-700'}`}>{summary.averageProgressVariance > 0 ? '+' : ''}{summary.averageProgressVariance.toFixed(1)} pp</span></div><div className="p-3 bg-slate-50 rounded border"><span className="text-2xs text-slate-500 block">Elapsed duration</span><span className="text-sm font-bold text-navy-900">{summary.averageElapsedDurationPercentage.toFixed(1)}%</span></div><div className="p-3 bg-slate-50 rounded border"><span className="text-2xs text-slate-500 block">Monthly velocity</span><span className="text-sm font-bold text-navy-900">{summary.averageMonthlyProgressVelocity.toFixed(1)} pp</span></div></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex-wrap gap-3">
          <div><h2 className="text-sm font-semibold text-navy-800">Project Delay Schedule Log</h2><p className="text-xs text-slate-500 mt-0.5">Ranked by current schedule slippage</p></div>
          <div className="flex items-center gap-2"><div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search project…" className="input pl-8 py-1 text-xs w-44" /></div><select value={delayFilter} onChange={event => setDelayFilter(event.target.value as ScheduleDelayFilter)} className="select py-1 text-xs w-36"><option value="all">All Projects</option><option value="delayed">Delayed (&gt;0 days)</option><option value="severe">Severe (&gt;2 years)</option><option value="on_time">On Schedule</option></select></div>
        </div>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Rank / Project</th><th>Ministry / Agency</th><th>Original Deadline</th><th>Current Completion</th><th>Slippage</th><th>Actual vs Planned</th><th>Milestones</th><th>Action</th></tr></thead><tbody>
          {data.projectBreakdown.slice(0, 25).map(project => {
            const delay = project.scheduleSlippageDays;
            return <tr key={project.projectId} onClick={() => navigate('project-intelligence', project.projectId)}>
              <td><span className="font-semibold text-navy-900 block text-xs">{project.delayRank ? `#${project.delayRank} ` : ''}{project.projectName}</span><span className="text-2xs text-slate-400">{project.projectId} · {project.hasMonthlyHistory ? 'Monthly history' : 'Snapshot only'}</span></td>
              <td><span className="text-slate-700 block text-xs">{project.ministry}</span><span className="text-2xs text-slate-400">{project.implementingAgency}</span></td>
              <td className="text-xs text-slate-600">{dateLabel(project.originalCompletionDate)}</td>
              <td className={`text-xs font-semibold ${(delay ?? 0) > 0 ? 'text-red-700' : 'text-slate-700'}`}>{dateLabel(project.currentCompletionDate)}</td>
              <td className={`text-xs font-bold tabular-nums ${delay === null || delay === undefined ? 'text-slate-400' : delay >= 1825 ? 'text-red-800' : delay >= 730 ? 'text-red-600' : delay > 0 ? 'text-amber-700' : 'text-green-700'}`}>{delayLabel(delay)}</td>
              <td><div className="w-28"><div className="flex justify-between text-2xs mb-0.5"><span>{percent(project.actualPhysicalProgress)}</span><span className="text-slate-400">tgt {percent(project.plannedPhysicalProgress)}</span></div><div className="progress-bar"><div className={`progress-fill ${(project.progressVariance ?? 0) < -10 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.max(0, Math.min(100, project.actualPhysicalProgress ?? 0))}%` }} /></div><span className={`text-2xs ${(project.progressVariance ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>{project.progressVariance === null || project.progressVariance === undefined ? 'Variance unavailable' : `${project.progressVariance > 0 ? '+' : ''}${project.progressVariance.toFixed(1)} pp variance`}</span></div></td>
              <td><span className="text-xs font-semibold">{project.completedMilestones}/{project.totalMilestones}</span><span className="text-2xs text-red-600 block">{project.overdueMilestones} overdue</span></td>
              <td><button onClick={event => { event.stopPropagation(); navigate('project-intelligence', project.projectId); }} className="btn btn-secondary btn-sm">Inspect</button></td>
            </tr>;
          })}
          {data.projectBreakdown.length === 0 && <tr><td colSpan={8} className="text-center text-slate-500 py-8">No projects match the selected backend filters.</td></tr>}
        </tbody></table></div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded text-2xs text-slate-600 flex gap-2">
        <Calendar className="w-4 h-4 shrink-0 text-slate-500" />
        <p><strong>Calculation basis:</strong> {USE_BACKEND_DATA ? 'portfolio slippage, progress variance, elapsed duration, velocity, and overdue milestones remain deterministic database analytics. The separately labelled Project Schedule ML Forecast uses its own versioned model; purple chart values are predictions and never replace reported actuals.' : 'portfolio slippage, progress variance, elapsed duration, velocity, and overdue milestones are calculated from synthetic demo fixtures. Historical and purple projection series are reconstructed demonstrations and do not replace imported CUF records or trained model results.'}</p>
      </div>
    </div>
  );
}
