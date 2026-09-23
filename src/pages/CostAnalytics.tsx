import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertOctagon, BarChart2, Database, IndianRupee, Info, TrendingUp } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import {
  costAnalyticsService,
  type CostAnalyticsResponse,
} from '../services/costAnalyticsService';
import { Badge, EmptyState, ErrorState, KPICard, LoadingState } from '../components/ui';

const MINISTRY_COLORS = ['#176b78', '#128277', '#c68c35', '#d46e45', '#c64f55', '#568f87', '#64748b'];
const USE_BACKEND_DATA = import.meta.env.VITE_DATA_SOURCE !== 'mock';

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not reported' : `₹${value.toLocaleString()} Cr`;
}

function shortMoney(value: number): string {
  return `₹${(value / 1000).toFixed(1)}k Cr`;
}

function monthLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export default function CostAnalytics() {
  const { navigate } = useApp();
  const { projects } = usePragatiData();
  const [selectedSector, setSelectedSector] = useState('All');
  const [filterMode, setFilterMode] = useState<'all' | 'escalated'>('all');
  const [data, setData] = useState<CostAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const sectors = useMemo(() => ['All', ...new Set(projects.map(project => project.sector))], [projects]);
  const retry = useCallback(() => setVersion(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void costAnalyticsService.get({
      sector: selectedSector === 'All' ? undefined : selectedSector,
      escalatedOnly: filterMode === 'escalated',
      mismatchThreshold: 15,
    }, controller.signal).then(setData).catch(loadError => {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load cost analytics.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [filterMode, selectedSector, version]);

  const sectorCostData = useMemo(() => data?.sectorBreakdown.map(row => ({
    ...row,
    label: row.sector.length > 18 ? `${row.sector.slice(0, 16)}…` : row.sector,
  })) ?? [], [data]);
  const ministryEscalation = useMemo(() => data?.ministryBreakdown
    .filter(row => row.absoluteCostEscalation > 0)
    .slice(0, 7) ?? [], [data]);
  const trend = useMemo(() => data?.series.map(row => ({ ...row, month: monthLabel(row.period) })) ?? [], [data]);

  if (loading && !data) {
    return <div className="min-h-[65vh] flex items-center justify-center"><LoadingState message="Aggregating project and monthly cost records…" /></div>;
  }
  if (error && !data) {
    return <div className="p-6"><div className="card"><ErrorState description={error} onRetry={retry} /></div></div>;
  }
  if (!data) {
    return <div className="p-6"><EmptyState title="No cost analytics available" description="The API returned no cost aggregation data." /></div>;
  }

  const summary = data.summary;
  const availability = data.dataAvailability;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Cost Analytics & Escalation Forensics</h1>
            <Badge variant="neutral">MoSPI Financial Monitoring</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {USE_BACKEND_DATA
              ? 'Backend aggregation of approved cost, latest revisions, cumulative expenditure, and monthly reporting history.'
              : 'Deterministic aggregation of the available demonstration project snapshots.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedSector} onChange={event => setSelectedSector(event.target.value)} className="select py-1 text-xs w-44">
            {sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}
          </select>
          <button
            onClick={() => setFilterMode(mode => mode === 'all' ? 'escalated' : 'all')}
            className={`btn btn-sm text-xs ${filterMode === 'escalated' ? 'btn-primary' : 'btn-secondary'}`}
          >
            {filterMode === 'escalated' ? 'Escalated Only (Active)' : 'Show Escalated Only'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center justify-between"><span>{error}</span><button onClick={retry} className="font-semibold underline">Retry</button></div>}
      {loading && <div className="h-1 bg-blue-100 overflow-hidden rounded"><div className="h-full w-1/3 bg-gov-blue animate-pulse" /></div>}

      <div className={`p-3.5 rounded border flex items-start gap-3 text-xs ${availability.incompleteCostProjects ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
        <Database className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">Cost data availability</p>
          <p className="mt-0.5">
            {availability.comparableCostProjects} of {availability.totalProjects} projects have comparable approved and revised costs; {availability.monthlyHistoryProjects} include monthly history.
            {availability.incompleteCostProjects > 0 && ` ${availability.incompleteCostProjects} projects are excluded from escalation calculations because a required cost value is unavailable.`}
          </p>
          <p className="text-2xs mt-1 opacity-80">
            Approved: {availability.approvedCostProjects} · Revised: {availability.revisedCostProjects} · Expenditure: {availability.expenditureProjects} · Physical progress: {availability.physicalProgressProjects}
            {availability.latestReportingMonth && ` · Latest monthly record: ${monthLabel(availability.latestReportingMonth)}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Original Approved Cost" value={shortMoney(summary.originalApprovedCost)} subtitle={`${availability.approvedCostProjects} projects with available baseline`} status="neutral" icon={<IndianRupee className="w-5 h-5 text-navy-600" />} />
        <KPICard title="Latest Revised Cost" value={shortMoney(summary.latestRevisedCost)} subtitle={`${summary.absoluteCostEscalation >= 0 ? '+' : ''}${shortMoney(summary.absoluteCostEscalation)} (${summary.costEscalationPercentage.toFixed(1)}%)`} status={summary.absoluteCostEscalation > 0 ? 'danger' : 'healthy'} icon={<TrendingUp className="w-5 h-5 text-red-600" />} />
        <KPICard title="Cumulative Expenditure" value={shortMoney(summary.cumulativeExpenditure)} subtitle={`${summary.expenditurePercentage.toFixed(1)}% of comparable revised cost`} status="healthy" icon={<BarChart2 className="w-5 h-5 text-blue-600" />} />
        <KPICard title="Escalated Projects" value={`${summary.escalatedProjects} / ${summary.totalProjects}`} subtitle="Positive escalation on comparable costs" status="warning" icon={<AlertOctagon className="w-5 h-5 text-amber-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="card lg:col-span-8">
          <div className="card-header">
            <div><h2 className="text-sm font-semibold text-navy-800">Approved vs. Revised Cost by Sector</h2><p className="text-xs text-slate-500 mt-0.5">PostgreSQL aggregation in ₹ Crore</p></div>
            <div className="flex items-center gap-4 text-2xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#94a3b8] rounded-sm" /> Approved</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#176b78] rounded-sm" /> Revised</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-[#16a34a] rounded-sm" /> Spent</span>
            </div>
          </div>
          <div className="card-body">
            {sectorCostData.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={sectorCostData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={value => `₹${value / 1000}k`} />
                  <ReTooltip formatter={(value: any, name: any) => [money(Number(value ?? 0)), name ?? '']} contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="originalApprovedCost" name="Approved Cost" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="latestRevisedCost" name="Revised Cost" fill="#176b78" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="cumulativeExpenditure" name="Cumulative Expenditure" fill="#16a34a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No sector cost data" description="No projects match the selected backend filters." />}
          </div>
        </div>

        <div className="card lg:col-span-4 flex flex-col">
          <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Ministry-wise Escalation</h2><p className="text-2xs text-slate-500 mt-0.5">Positive absolute escalation by ministry</p></div></div>
          <div className="card-body flex-1">
            {ministryEscalation.length ? <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={ministryEscalation} nameKey="ministry" dataKey="absoluteCostEscalation" innerRadius={45} outerRadius={70} paddingAngle={3}>{ministryEscalation.map((row, index) => <Cell key={row.ministry} fill={MINISTRY_COLORS[index % MINISTRY_COLORS.length]} />)}</Pie><ReTooltip formatter={(value: any) => [money(Number(value ?? 0)), 'Escalation']} /></PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-sm font-bold text-navy-900">{shortMoney(Math.max(0, summary.absoluteCostEscalation))}</span><span className="text-2xs text-slate-400">Portfolio escalation</span></div>
              </div>
              <div className="space-y-2 mt-3">{ministryEscalation.map((row, index) => <div key={row.ministry} className="flex items-center justify-between gap-2 text-xs"><div className="flex items-center gap-1.5 min-w-0"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: MINISTRY_COLORS[index % MINISTRY_COLORS.length] }} /><span className="truncate text-slate-700">{row.ministry}</span></div><span className="font-semibold tabular-nums">₹{row.absoluteCostEscalation.toLocaleString()} Cr</span></div>)}</div>
            </> : <EmptyState title="No positive ministry escalation" description="No comparable project has a revised cost above its approved cost." />}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Historical Monthly Cost Trend</h2><p className="text-xs text-slate-500 mt-0.5">Monthly reported values; coverage may differ by reporting period</p></div><Badge variant={availability.monthlyHistoryProjects ? 'info' : 'neutral'}>{availability.monthlyHistoryProjects ? 'Database history' : 'Awaiting monthly records'}</Badge></div>
        <div className="card-body">
          {trend.length ? <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend} margin={{ top: 10, right: 12, bottom: 0, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={value => `₹${value / 1000}k`} />
              <ReTooltip formatter={(value: any, name: any) => [money(Number(value ?? 0)), name ?? '']} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.period} · ${payload[0].payload.reportingProjects} reporting projects` : ''} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="originalApprovedCost" name="Approved Cost" stroke="#64748b" fill="#e2e8f0" connectNulls={false} />
              <Area type="monotone" dataKey="latestRevisedCost" name="Revised Cost" stroke="#176b78" fill="#dcefeb" connectNulls={false} />
              <Area type="monotone" dataKey="cumulativeExpenditure" name="Expenditure" stroke="#16a34a" fill="#dcfce7" connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer> : <EmptyState title="No monthly cost history" description="Monthly trend data will appear after project updates are imported." />}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Top 10 High-Escalation Projects</h2><p className="text-xs text-slate-500 mt-0.5">Highest absolute escalation from {data.projectBreakdown.length} backend project-level records</p></div></div>
        <div className="overflow-x-auto">
          <table className="data-table"><thead><tr><th>Project</th><th>Ministry / Sector</th><th>Original Approved</th><th>Latest Revised</th><th>Escalation</th><th>Escalation %</th><th>Expenditure Rate</th><th>Action</th></tr></thead>
            <tbody>
              {data.breakdown.map(project => <tr key={project.projectId} onClick={() => navigate('project-intelligence', project.projectId)}>
                <td><span className="font-semibold text-navy-900 block text-xs">{project.projectName}</span><span className="text-2xs text-slate-400">{project.projectId}{project.hasMonthlyHistory ? ' · Monthly history' : ' · Snapshot only'}</span></td>
                <td><span className="text-slate-700 block text-xs">{project.ministry}</span><span className="text-2xs text-slate-400">{project.sector}</span></td>
                <td className="text-xs tabular-nums">{money(project.originalApprovedCost)}</td>
                <td className="text-xs font-semibold tabular-nums">{money(project.latestRevisedCost)}</td>
                <td className="text-xs font-bold text-red-700 tabular-nums">+{money(project.absoluteCostEscalation)}</td>
                <td><span className="badge badge-critical tabular-nums">+{project.costEscalationPercentage?.toFixed(1) ?? '—'}%</span></td>
                <td className="text-xs tabular-nums">{project.expenditurePercentage?.toFixed(1) ?? '—'}%</td>
                <td><button onClick={event => { event.stopPropagation(); navigate('project-intelligence', project.projectId); }} className="btn btn-secondary btn-sm">Inspect</button></td>
              </tr>)}
              {data.breakdown.length === 0 && <tr><td colSpan={8} className="text-center text-slate-500 py-8">No positive cost escalations found for the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Expenditure vs. Physical Progress Mismatch</h2><p className="text-xs text-slate-500 mt-0.5">Projects where cumulative expenditure as a share of revised cost exceeds physical progress by at least 15 percentage points</p></div><Badge variant="watch">Data audit</Badge></div>
        <div className="overflow-x-auto">
          <table className="data-table"><thead><tr><th>Project</th><th>Physical Progress</th><th>Expenditure / Revised Cost</th><th>Mismatch</th><th>Data Basis</th><th>Action</th></tr></thead>
            <tbody>
              {data.progressMismatches.map(project => <tr key={project.projectId} onClick={() => navigate('project-intelligence', project.projectId)}>
                <td><span className="font-semibold text-navy-900 block text-xs">{project.projectName}</span><span className="text-2xs text-slate-400">{project.projectId} · {project.ministry}</span></td>
                <td className="text-xs font-semibold tabular-nums">{project.physicalProgress.toFixed(1)}%</td>
                <td className="text-xs font-semibold text-orange-700 tabular-nums">{project.expenditurePercentage.toFixed(1)}%</td>
                <td className="text-xs font-bold text-red-700 tabular-nums">+{project.progressMismatch.toFixed(1)} pp</td>
                <td className="text-2xs text-slate-600">{money(project.cumulativeExpenditure)} spent against {money(project.latestRevisedCost)} revised cost</td>
                <td><button onClick={event => { event.stopPropagation(); navigate('project-intelligence', project.projectId); }} className="btn btn-secondary btn-sm">Audit</button></td>
              </tr>)}
              {data.progressMismatches.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500 py-8">No projects exceed the 15 percentage-point mismatch threshold.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-2xs text-slate-500 flex items-start gap-2"><Info className="w-3.5 h-3.5 shrink-0" />This is a deterministic data-quality indicator, not an ML prediction. Projects missing revised cost, expenditure, or physical progress are excluded and counted in data availability.</div>
      </div>
    </div>
  );
}
