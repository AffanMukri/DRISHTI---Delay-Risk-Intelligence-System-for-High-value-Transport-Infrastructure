// =============================================================================
// DRISHTI — Command Center Page
// The flagship dashboard: Monitor → Understand → Identify Risk → Warn → Act
// =============================================================================

import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, ExternalLink, Eye, Building2, BadgeIndianRupee,
  ShieldAlert, CalendarClock, ClipboardCheck, Landmark, CalendarDays
} from 'lucide-react';
import {
  KPICard, RiskBadge, ProgressBar,
  SeverityBadge, formatCrore, formatDate, DataDisclaimer, TrendIndicator
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import { RISK_TREND } from '../data/portfolioMetrics';
import { WhatChangedSummary } from '../components/WhatChangedSummary';

export default function CommandCenter() {
  const { navigate, setPortfolioFilter, setSectorFilter } = useApp();
  const { projects, warnings, portfolioSummary: m } = usePragatiData();

  const criticalProjects = useMemo(() => projects
    .filter(project => project.riskAssessment.riskLevel === 'Critical' || project.riskAssessment.riskLevel === 'High Risk')
    .sort((left, right) => right.riskAssessment.overallScore - left.riskAssessment.overallScore)
    .slice(0, 8), [projects]);

  const sectorRisk = useMemo(() => {
    const sectors = new Map<string, { sector: string; totalProjects: number; critical: number; highRisk: number; watch: number; healthy: number }>();
    projects.forEach(project => {
      const item = sectors.get(project.sector) ?? { sector: project.sector, totalProjects: 0, critical: 0, highRisk: 0, watch: 0, healthy: 0 };
      item.totalProjects += 1;
      if (project.riskAssessment.riskLevel === 'Critical') item.critical += 1;
      else if (project.riskAssessment.riskLevel === 'High Risk') item.highRisk += 1;
      else if (project.riskAssessment.riskLevel === 'Watch') item.watch += 1;
      else item.healthy += 1;
      sectors.set(project.sector, item);
    });
    return [...sectors.values()].sort((left, right) => right.critical + right.highRisk - left.critical - left.highRisk);
  }, [projects]);

  const ministries = useMemo(() => {
    const values = new Map<string, { id: string; name: string; shortName: string; totalProjects: number; highRisk: number; critical: number; costExposure: number; scheduleExposure: number; riskTrend: 'up' | 'down' | 'stable' }>();
    projects.forEach(project => {
      const item = values.get(project.ministry) ?? {
        id: project.ministry,
        name: project.ministry,
        shortName: project.ministry.replace('Ministry of ', '').split(/\s+/).map(part => part[0]).join('').slice(0, 6),
        totalProjects: 0,
        highRisk: 0,
        critical: 0,
        costExposure: 0,
        scheduleExposure: 0,
        riskTrend: 'stable' as const,
      };
      item.totalProjects += 1;
      if (project.riskAssessment.riskLevel === 'High Risk') item.highRisk += 1;
      if (project.riskAssessment.riskLevel === 'Critical') item.critical += 1;
      item.costExposure += Math.max(0, project.revisedCost - project.approvedCost);
      if (project.delayDays > 0) item.scheduleExposure += project.revisedCost;
      values.set(project.ministry, item);
    });
    return [...values.values()].sort((left, right) => right.critical - left.critical).slice(0, 8);
  }, [projects]);

  const donutData = [
    { name: 'Healthy',   value: m.healthy,  color: '#16a34a' },
    { name: 'Watch',     value: m.watch,    color: '#d97706' },
    { name: 'High Risk', value: m.highRisk, color: '#ea580c' },
    { name: 'Critical',  value: m.critical, color: '#dc2626' },
  ];

  const handleHealthClick = (category: string) => {
    setPortfolioFilter(category);
    navigate('project-portfolio');
  };

  return (
    <div className="p-5 lg:p-6 space-y-5 max-w-[1600px] mx-auto">

      {/* Page header */}
      <div className="command-hero px-5 py-5 lg:px-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex items-start gap-4 relative z-10">
          <div className="command-hero__seal shrink-0 mt-0.5">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <div className="command-hero__eyebrow">
              Government of India <span className="w-1 h-1 rounded-full bg-amber-400" /> DRISHTI Executive Desk
            </div>
            <h1 className="text-2xl lg:text-[1.7rem] font-bold text-white mt-1.5">Infrastructure Command Center</h1>
            <p className="text-sm text-sky-100/80 mt-1">National portfolio health, emerging risks and intervention priorities</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-4 lg:border-l lg:border-white/15 lg:pl-5">
          <div className="hidden sm:grid place-items-center w-9 h-9 rounded-lg bg-white/[0.07] border border-white/10">
            <CalendarDays className="w-4 h-4 text-sky-200" />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-sky-200/70">Reporting cycle</p>
            <p className="text-sm font-semibold text-white mt-0.5">April 2026</p>
            <p className="text-[10px] text-sky-100/60 mt-0.5">Data frozen on 30 Apr 2026</p>
          </div>
          <div className="ml-auto lg:ml-2 rounded-full bg-white/90 p-0.5">
            <DataDisclaimer />
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <KPICard
          title="Total Projects"
          value={m.totalProjects.toLocaleString()}
          subtitle="Tracked projects"
          accent="navy"
          icon={<Building2 className="w-4 h-4" />}
        />
        <KPICard
          title="Portfolio Value"
          value={formatCrore(m.portfolioValue)}
          subtitle="Original approved cost"
          accent="navy"
          icon={<BadgeIndianRupee className="w-4 h-4" />}
        />
        <KPICard
          title="At-Risk Projects"
          value={(m.highRisk + m.critical).toLocaleString()}
          subtitle="High Risk + Critical"
          accent="orange"
          icon={<ShieldAlert className="w-4 h-4" />}
          onClick={() => { setPortfolioFilter('High Risk'); navigate('project-portfolio'); }}
        />
        <KPICard
          title="Cost Overrun Exposure"
          value={formatCrore(m.costOverrunExposure)}
          subtitle="Across at-risk projects"
          accent="red"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KPICard
          title="Schedule Risk"
          value={`${m.delayedProjects.toLocaleString()} Projects`}
          subtitle="Potential delay flagged"
          accent="amber"
          icon={<CalendarClock className="w-4 h-4" />}
        />
        <KPICard
          title="Intervention Required"
          value={m.openInterventions.toLocaleString()}
          subtitle="Critical priority"
          accent="red"
          icon={<ClipboardCheck className="w-4 h-4" />}
          onClick={() => navigate('intervention-center')}
        />
      </div>

      <WhatChangedSummary />

      {/* Row 2: Portfolio Health + Risk Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Portfolio Health Donut */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">Portfolio Health</h2>
              <p className="text-xs text-slate-500">Click category to filter Project Portfolio</p>
            </div>
          </div>
          <div className="card-body">
            <div className="flex items-center gap-4">
              {/* Donut */}
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={68}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map(entry => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          stroke="white"
                          strokeWidth={2}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleHealthClick(entry.name)}
                        />
                      ))}
                    </Pie>
                    <ReTooltip
                      formatter={(v: any, name: any) => [Number(v ?? 0).toLocaleString(), String(name)]}
                      contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 4 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend / buttons */}
              <div className="flex-1 space-y-2">
                {donutData.map(item => (
                  <button
                    key={item.name}
                    onClick={() => handleHealthClick(item.name)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50
                      border border-transparent hover:border-slate-200 transition-all group text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-sm text-slate-700">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Trend Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">Portfolio Risk Trend</h2>
              <p className="text-xs text-slate-500">Jan – Apr 2026 · Risk score and at-risk project count</p>
            </div>
            <DataDisclaimer />
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={RISK_TREND} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <ReTooltip contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 4 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="atRisk" name="At-Risk Projects" stroke="#ea580c" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="critical" name="Critical Projects" stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="previous" name="Previous Period" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              Historical trend context is shown above. {m.critical} critical projects currently require immediate attention.
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Sector Risk + Ministry Table */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Sector Bar Chart */}
        <div className="card xl:col-span-2">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">Risk by Infrastructure Sector</h2>
              <p className="text-xs text-slate-500">Click to filter portfolio</p>
            </div>
          </div>
          <div className="card-body py-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sectorRisk} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="sector" type="category" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={110} />
                <ReTooltip contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 4 }} />
                <Bar dataKey="critical"  name="Critical"   stackId="a" fill="#dc2626" radius={[0,0,0,0]}
                  onClick={(d: any) => { if (d?.sector) { setSectorFilter(d.sector); navigate('project-portfolio'); } }}
                  style={{ cursor: 'pointer' }} />
                <Bar dataKey="highRisk"  name="High Risk"  stackId="a" fill="#ea580c"
                  onClick={(d: any) => { if (d?.sector) { setSectorFilter(d.sector); navigate('project-portfolio'); } }}
                  style={{ cursor: 'pointer' }} />
                <Bar dataKey="watch"     name="Watch"      stackId="a" fill="#d97706"
                  onClick={(d: any) => { if (d?.sector) { setSectorFilter(d.sector); navigate('project-portfolio'); } }}
                  style={{ cursor: 'pointer' }} />
                <Bar dataKey="healthy"   name="Healthy"    stackId="a" fill="#16a34a" radius={[0,3,3,0]}
                  onClick={(d: any) => { if (d?.sector) { setSectorFilter(d.sector); navigate('project-portfolio'); } }}
                  style={{ cursor: 'pointer' }} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ministry Risk Table */}
        <div className="card xl:col-span-3">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-navy-800">Ministry Risk Overview</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ministry</th>
                  <th className="text-right">Projects</th>
                  <th className="text-right">High Risk</th>
                  <th className="text-right">Critical</th>
                  <th className="text-right">Cost Exposure</th>
                  <th className="text-right">Sched. Exposure</th>
                  <th className="text-center">Trend</th>
                </tr>
              </thead>
              <tbody>
                {ministries.map(min => (
                  <tr key={min.id} onClick={() => { navigate('project-portfolio'); }}>
                    <td>
                      <div className="font-medium text-navy-800 text-xs">{min.name}</div>
                      <div className="text-2xs text-slate-400">{min.shortName}</div>
                    </td>
                    <td className="text-right tabular-nums">{min.totalProjects}</td>
                    <td className="text-right">
                      <span className="text-orange-600 font-semibold tabular-nums">{min.highRisk}</span>
                    </td>
                    <td className="text-right">
                      <span className="text-red-600 font-semibold tabular-nums">{min.critical}</span>
                    </td>
                    <td className="text-right text-xs tabular-nums">
                      {formatCrore(min.costExposure)}
                    </td>
                    <td className="text-right text-xs tabular-nums">
                      {formatCrore(min.scheduleExposure)}
                    </td>
                    <td className="text-center">
                      <TrendIndicator direction={min.riskTrend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 4: Priority Projects + Early Warnings */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Priority Projects */}
        <div className="card xl:col-span-2">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">Projects Requiring Immediate Attention</h2>
              <p className="text-xs text-slate-500">Sorted by demonstration risk score</p>
            </div>
            <button
              onClick={() => navigate('project-portfolio')}
              className="btn-secondary btn-sm"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Ministry</th>
                  <th>State</th>
                  <th className="text-center">Risk Score</th>
                  <th className="text-center">Progress</th>
                  <th className="text-right">Last Update</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {criticalProjects.map(p => (
                  <tr key={p.id} onClick={() => navigate('project-intelligence', p.id)}>
                    <td>
                      <div className="font-medium text-xs text-navy-800 max-w-[180px] truncate">{p.name}</div>
                      <div className="text-2xs text-slate-400">{p.id} · {p.sector}</div>
                    </td>
                    <td className="text-xs text-slate-600 max-w-[120px] truncate">{p.ministry.replace('Ministry of ', '')}</td>
                    <td className="text-xs text-slate-600">{p.state.split(' / ')[0]}</td>
                    <td className="text-center">
                      <RiskBadge level={p.riskAssessment.riskLevel} score={p.riskAssessment.overallScore} />
                    </td>
                    <td className="min-w-[80px]">
                      <ProgressBar value={p.physicalProgress} expected={p.expectedProgress} showLabel />
                    </td>
                    <td className="text-right text-2xs text-slate-400 whitespace-nowrap">{formatDate(p.lastUpdated)}</td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={e => { e.stopPropagation(); navigate('project-intelligence', p.id); }}>
                        <Eye className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Early Warnings Panel */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">Emerging Early Warnings</h2>
              <p className="text-xs text-slate-400">Rule-based · Deterministic frontend alerts</p>
            </div>
            <button onClick={() => navigate('early-warning')} className="btn-secondary btn-sm">
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {warnings.slice(0, 5).map(w => (
              <div key={w.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-2 mb-1">
                  <SeverityBadge severity={w.severity} />
                  <span className="text-xs font-medium text-slate-700 leading-tight flex-1 min-w-0">{w.title}</span>
                </div>
                <p className="text-2xs text-slate-500 truncate">{w.projectName}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-2xs text-slate-400">{formatDate(w.detectedDate)}</span>
                  <button
                    onClick={() => navigate('project-intelligence', w.projectId)}
                    className="text-2xs text-navy-600 font-medium hover:underline"
                  >
                    View Project →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 border-t border-slate-200">
        <p className="text-2xs text-slate-400">
          Delay & Risk Intelligence System for High-value Transport & Infrastructure · DRISHTI ·
          Data shown in this prototype is for demonstration purposes.
        </p>
      </div>
    </div>
  );
}
