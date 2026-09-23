import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Database, ExternalLink, GitCompareArrows, History, Users } from 'lucide-react';
import {
  Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip as ReTooltip,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import {
  benchmarkAnalyticsService,
  type BenchmarkAnalyticsResponse,
  type BenchmarkMetricComparison,
  type BenchmarkProject,
} from '../services/benchmarkAnalyticsService';
import { Badge, EmptyState, ErrorState, KPICard, LoadingState } from '../components/ui';

const USE_BACKEND_DATA = import.meta.env.VITE_DATA_SOURCE !== 'mock';

function metricValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return 'Not reported';
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'days') return `${Math.round(value).toLocaleString()} days`;
  if (unit === 'pp/month') return `${value.toFixed(1)} pp/mo`;
  if (unit === 'score') return `${value.toFixed(1)} / 100`;
  return value.toFixed(1);
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not reported' : `₹${value.toLocaleString()} Cr`;
}

function duration(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not reported' : `${(value / 365.25).toFixed(1)} years`;
}

function projectMetric(project: BenchmarkProject | null | undefined, key: string): number | null | undefined {
  if (!project) return null;
  const values: Record<string, number | null | undefined> = {
    cost_overrun_percentage: project.costOverrunPercentage,
    schedule_delay_days: project.scheduleDelayDays,
    monthly_progress_velocity: project.monthlyProgressVelocity,
    expenditure_efficiency: project.expenditureEfficiency,
    milestone_slippage_percentage: project.milestoneSlippagePercentage,
    overall_risk_score: project.overallRiskScore,
    cost_risk_score: project.costRiskScore,
    schedule_risk_score: project.scheduleRiskScore,
    implementation_risk_score: project.implementationRiskScore,
  };
  return values[key];
}

function valueClass(metric: BenchmarkMetricComparison, value: number | null | undefined): string {
  if (value === null || value === undefined || metric.peerMedian === null || metric.peerMedian === undefined) return 'text-slate-500';
  const favorable = metric.lowerIsBetter ? value <= metric.peerMedian : value >= metric.peerMedian;
  return favorable ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold';
}

export default function Benchmarking() {
  const { navigate } = useApp();
  const { projects } = usePragatiData();
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [comparisonId, setComparisonId] = useState('');
  const [data, setData] = useState<BenchmarkAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void benchmarkAnalyticsService.get(projectId, comparisonId || undefined, controller.signal)
      .then(setData)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load peer benchmarking data.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [comparisonId, projectId, version]);

  const radar = useMemo(() => data?.radar.map(point => ({
    ...point,
    selectedScore: point.selectedScore ?? 0,
    comparisonScore: point.comparisonScore ?? 0,
    peerMedianScore: point.peerMedianScore ?? 0,
  })) ?? [], [data]);

  if (loading && !data) {
    return <div className="min-h-[65vh] flex items-center justify-center"><LoadingState message="Selecting comparable projects and calculating peer medians…" /></div>;
  }
  if (error && !data) {
    return <div className="p-6"><div className="card"><ErrorState description={error} onRetry={retry} /></div></div>;
  }
  if (!data) {
    return <div className="p-6"><EmptyState title="No benchmark data available" description="No project facts were available for peer selection." /></div>;
  }

  const selected = data.selectedProject;
  const comparison = data.comparisonPeer;
  const activeComparisonId = comparisonId || comparison?.projectId || '';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Benchmarking & Agency Intelligence</h1>
            <Badge variant="neutral">Comparative Performance Analysis</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">{USE_BACKEND_DATA ? 'Backend-selected peers, portfolio medians, and transparent delivery comparisons.' : 'Deterministically selected peers and portfolio comparisons from demonstration project snapshots.'}</p>
        </div>
        <select value={projectId} onChange={event => { setProjectId(event.target.value); setComparisonId(''); }} className="select py-1 text-xs w-72">
          {projects.map(project => <option key={project.id} value={project.id}>{project.id} - {project.name}</option>)}
        </select>
      </div>

      {error && <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center justify-between"><span>{error}</span><button onClick={retry} className="font-semibold underline">Retry</button></div>}
      {loading && <div className="h-1 bg-blue-100 overflow-hidden rounded"><div className="h-full w-1/3 bg-gov-blue animate-pulse" /></div>}

      <div className="p-3.5 rounded border bg-blue-50 border-blue-200 text-blue-900 flex items-start gap-3 text-xs">
        <Database className="w-4 h-4 shrink-0 mt-0.5" />
        <div><p className="font-semibold">Peer selection: {data.peerGroup.selectionMethod}</p><p className="mt-0.5">Evaluated {data.peerGroup.candidateProjectsEvaluated} candidates and selected {data.peerGroup.peerCount} peers at a minimum score of {data.peerGroup.minimumMatchScore}; {data.peerGroup.historicalPeerCount} are historical comparables.</p><p className="text-2xs mt-1 opacity-80">Start-date coverage: {data.dataAvailability.projectsWithStartDate}/{data.dataAvailability.portfolioProjects} · Velocity: {data.dataAvailability.projectsWithVelocity} · Milestones: {data.dataAvailability.projectsWithMilestones} · Current risk: {data.dataAvailability.projectsWithRisk}</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Selected Peer Group" value={data.peerGroup.peerCount} subtitle={`${data.peerGroup.candidateProjectsEvaluated} portfolio candidates evaluated`} status="neutral" icon={<Users className="w-5 h-5 text-blue-600" />} />
        <KPICard title="Historical Comparables" value={data.peerGroup.historicalPeerCount} subtitle="Completed or earlier-start projects" status="neutral" icon={<History className="w-5 h-5 text-slate-600" />} />
        <KPICard title="Top Peer Match" value={comparison ? `${comparison.matchScore} / 100` : 'Unavailable'} subtitle={comparison?.projectName || 'No qualifying peer'} status={comparison && comparison.matchScore >= 70 ? 'healthy' : 'warning'} icon={<GitCompareArrows className="w-5 h-5 text-green-600" />} />
        <KPICard title="Sector Sample" value={data.dataAvailability.sectorProjects} subtitle={`${selected.sector} projects`} status="neutral" icon={<Database className="w-5 h-5 text-navy-600" />} />
      </div>

      <div className="card">
        <div className="card-header flex-wrap gap-4">
          <div className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-gov-blue" /><div><h2 className="text-sm font-semibold text-navy-800">Direct Project Comparator</h2><p className="text-2xs text-slate-500 mt-0.5">Comparison choices are restricted to service-selected peers.</p></div></div>
          <select value={activeComparisonId} onChange={event => setComparisonId(event.target.value)} className="select py-1 text-xs w-72" disabled={!data.peers.length}>
            {data.peers.length ? data.peers.map(peer => <option key={peer.projectId} value={peer.projectId}>{peer.matchScore}/100 - {peer.projectName}</option>) : <option value="">No qualifying peers</option>}
          </select>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-6 h-80">
              {radar.length ? <ResponsiveContainer width="100%" height="100%"><RadarChart cx="50%" cy="50%" outerRadius="72%" data={radar}><PolarGrid stroke="#dce4e1" /><PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#5f736f' }} /><PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#91a29e' }} /><Radar name={selected.projectName.substring(0, 24)} dataKey="selectedScore" stroke="#176b78" fill="#176b78" fillOpacity={0.24} /><Radar name={comparison?.projectName.substring(0, 24) || 'Comparison peer'} dataKey="comparisonScore" stroke="#c68c35" fill="#c68c35" fillOpacity={0.2} /><Radar name="Peer Median" dataKey="peerMedianScore" stroke="#64748b" strokeDasharray="4 3" fill="transparent" /><ReTooltip formatter={(value: any) => [`${Number(value).toFixed(1)} / 100`, 'Score']} /><Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} /></RadarChart></ResponsiveContainer> : <EmptyState title="No comparable radar metrics" description="Metrics will appear when peer records have sufficient data." />}
            </div>
            <div className="lg:col-span-6 overflow-x-auto">
              <table className="w-full text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="py-2 px-3 text-left font-semibold text-slate-500">Attribute</th><th className="py-2 px-3 text-left font-semibold text-navy-800 bg-blue-50/50">Selected project</th><th className="py-2 px-3 text-left font-semibold text-orange-800 bg-orange-50/50">Comparison peer</th></tr></thead><tbody className="divide-y divide-slate-100">
                <tr><td className="py-2 px-3 text-slate-500">Project</td><td className="py-2 px-3 font-semibold">{selected.projectName}</td><td className="py-2 px-3 font-semibold">{comparison?.projectName || 'No peer'}</td></tr>
                <tr><td className="py-2 px-3 text-slate-500">Sector / Type</td><td className="py-2 px-3">{selected.sector}<span className="block text-2xs text-slate-400">{selected.projectType}</span></td><td className="py-2 px-3">{comparison?.sector || '—'}<span className="block text-2xs text-slate-400">{comparison?.projectType || '—'}</span></td></tr>
                <tr><td className="py-2 px-3 text-slate-500">Original cost band</td><td className="py-2 px-3">{money(selected.originalCost)}<span className="block text-2xs text-slate-400">{selected.costBand || 'No band'}</span></td><td className="py-2 px-3">{money(comparison?.originalCost)}<span className="block text-2xs text-slate-400">{comparison?.costBand || 'No band'}</span></td></tr>
                <tr><td className="py-2 px-3 text-slate-500">Geography</td><td className="py-2 px-3">{selected.state}</td><td className="py-2 px-3">{comparison?.state || 'Not reported'}</td></tr>
                <tr><td className="py-2 px-3 text-slate-500">Agency</td><td className="py-2 px-3">{selected.implementingAgency}</td><td className="py-2 px-3">{comparison?.implementingAgency || 'Not reported'}</td></tr>
                <tr><td className="py-2 px-3 text-slate-500">Planned duration</td><td className="py-2 px-3">{duration(selected.plannedDurationDays)}<span className="block text-2xs text-slate-400">Start {selected.startYear ?? 'unknown'} via {selected.startDateSource?.replaceAll('_', ' ') || 'no source'}</span></td><td className="py-2 px-3">{duration(comparison?.plannedDurationDays)}<span className="block text-2xs text-slate-400">Start {comparison?.startYear ?? 'unknown'} via {comparison?.startDateSource?.replaceAll('_', ' ') || 'no source'}</span></td></tr>
                <tr><td className="py-2 px-3 text-slate-500">Action</td><td className="py-2 px-3"><button onClick={() => navigate('project-intelligence', selected.projectId)} className="btn btn-secondary btn-sm">View selected <ExternalLink className="w-3 h-3 ml-1" /></button></td><td className="py-2 px-3">{comparison && <button onClick={() => navigate('project-intelligence', comparison.projectId)} className="btn btn-secondary btn-sm">View peer <ExternalLink className="w-3 h-3 ml-1" /></button>}</td></tr>
              </tbody></table>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Performance Against Portfolio Benchmarks</h2><p className="text-xs text-slate-500 mt-0.5">Available source metrics; green indicates the selected project performs at least as well as the peer median.</p></div><Badge variant="info">Median comparison</Badge></div>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Metric</th><th>Selected Project</th><th>Comparison Peer</th><th>Sector Median</th><th>Peer Median</th><th>Historical Median</th></tr></thead><tbody>
          {data.metricComparisons.map(metric => {
            const selectedValue = projectMetric(selected, metric.key);
            return <tr key={metric.key}><td><span className="font-semibold text-navy-900 text-xs">{metric.label}</span><span className="block text-2xs text-slate-400">{metric.lowerIsBetter ? 'Lower is better' : 'Higher is better'}</span></td><td className={`text-xs tabular-nums ${valueClass(metric, selectedValue)}`}>{metricValue(selectedValue, metric.unit)}</td><td className="text-xs tabular-nums">{metricValue(metric.comparisonValue, metric.unit)}</td><td className="text-xs tabular-nums">{metricValue(metric.sectorMedian, metric.unit)}<span className="block text-2xs text-slate-400">n={metric.sectorSampleSize}</span></td><td className="text-xs font-semibold tabular-nums">{metricValue(metric.peerMedian, metric.unit)}<span className="block text-2xs text-slate-400">n={metric.peerSampleSize}</span></td><td className="text-xs tabular-nums">{metricValue(metric.historicalMedian, metric.unit)}<span className="block text-2xs text-slate-400">n={metric.historicalSampleSize}</span></td></tr>;
          })}
        </tbody></table></div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Selected Peer Group & Match Evidence</h2><p className="text-xs text-slate-500 mt-0.5">Every peer includes the backend rules that contributed to its match score.</p></div><Badge variant="neutral">Maximum {data.peerGroup.maximumPeers} peers</Badge></div>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Peer Project</th><th>Match</th><th>Why Comparable</th><th>Delivery Snapshot</th><th>Cohort</th></tr></thead><tbody>
          {data.peers.map(peer => <tr key={peer.projectId} onClick={() => navigate('project-intelligence', peer.projectId)}><td><span className="font-semibold text-navy-900 block text-xs">{peer.projectName}</span><span className="text-2xs text-slate-400">{peer.projectId} · {peer.projectType}</span></td><td><span className={`badge ${peer.matchScore >= 70 ? 'badge-healthy' : peer.matchScore >= 50 ? 'badge-watch' : 'badge-neutral'}`}>{peer.matchScore} / 100</span></td><td><div className="flex flex-wrap gap-1 max-w-xl">{peer.matchReasons.map(reason => <span key={reason} className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-2xs text-blue-800">{reason}</span>)}</div></td><td><span className="text-xs block">Cost {metricValue(peer.costOverrunPercentage, '%')} · Delay {metricValue(peer.scheduleDelayDays, 'days')}</span><span className="text-2xs text-slate-400">Velocity {metricValue(peer.monthlyProgressVelocity, 'pp/month')} · Risk {metricValue(peer.overallRiskScore, 'score')}</span></td><td>{peer.isHistorical ? <Badge variant="neutral">Historical</Badge> : <Badge variant="info">Current-period</Badge>}</td></tr>)}
          {!data.peers.length && <tr><td colSpan={5} className="text-center text-slate-500 py-8">No projects met the peer-selection threshold.</td></tr>}
        </tbody></table></div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Implementing Agency Delivery Leaderboard</h2><p className="text-xs text-slate-500 mt-0.5">Composite of schedule, cost, milestone, and risk evidence.</p></div><Badge variant="healthy">{USE_BACKEND_DATA ? 'Database benchmark' : 'Demo benchmark'}</Badge></div>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Rank & Agency</th><th>Projects</th><th>Total Outlay</th><th>Avg Delay</th><th>Avg Cost Overrun</th><th>Milestone Hit Rate</th><th>Delivery Efficiency</th></tr></thead><tbody>
          {data.agencyLeaderboard.map(agency => <tr key={agency.agency}><td><div className="flex items-center gap-2"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${agency.rank === 1 ? 'bg-amber-100 text-amber-800' : agency.rank === 2 ? 'bg-slate-200 text-slate-700' : agency.rank === 3 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>{agency.rank}</span><span className="font-semibold text-navy-900 text-xs">{agency.agency}</span></div></td><td className="text-xs">{agency.projectCount}</td><td className="text-xs font-semibold tabular-nums">{money(agency.totalOutlay)}</td><td className="text-xs tabular-nums">{metricValue(agency.averageDelayDays, 'days')}</td><td className="text-xs tabular-nums">{metricValue(agency.averageCostOverrunPercentage, '%')}</td><td><div className="w-24"><span className="text-2xs">{metricValue(agency.milestoneHitRate, '%')}</span><div className="progress-bar"><div className="progress-fill bg-green-600" style={{ width: `${Math.max(0, Math.min(100, agency.milestoneHitRate ?? 0))}%` }} /></div></div></td><td><span className={`badge ${(agency.deliveryEfficiencyIndex ?? 0) >= 75 ? 'badge-healthy' : (agency.deliveryEfficiencyIndex ?? 0) >= 50 ? 'badge-watch' : 'badge-critical'}`}>{metricValue(agency.deliveryEfficiencyIndex, 'score')}</span></td></tr>)}
        </tbody></table></div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded text-2xs text-slate-600">
        <strong>Method note:</strong> {USE_BACKEND_DATA ? 'Peer selection and all medians are calculated by FastAPI.' : 'Peer selection and all medians use the same deterministic service rules against the explicit demo dataset.'} Historical peers are completed projects or qualifying peers with an earlier inferred start year. Start date uses project metadata when present, otherwise the earliest milestone, then the earliest monthly report. Expenditure efficiency is physical progress divided by expenditure as a percentage of revised cost, indexed to 100. No ML inference is used.
      </div>
    </div>
  );
}
