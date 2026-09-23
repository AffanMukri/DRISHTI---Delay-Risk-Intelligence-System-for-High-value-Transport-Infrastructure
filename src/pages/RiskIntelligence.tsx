// =============================================================================
// DHRISTI — Risk Intelligence Page
// Advanced Portfolio-Level Risk Diagnostics & Prioritization Matrix
// =============================================================================

import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Search,
  ArrowUpDown, ExternalLink, HelpCircle,
  BarChart2, Info, RefreshCw, GitBranch
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip,
  CartesianGrid, ScatterChart, Scatter, ZAxis, Cell
} from 'recharts';
import { useApp } from '../context/AppContext';
import { usePragatiData } from '../context/PragatiDataContext';
import { useAuth } from '../hooks/useAuth';
import { ProjectService } from '../services';
import type { RiskLevel, RiskTrajectory } from '../types';
import {
  Badge, KPICard, HealthPill, DataDisclaimer, Modal
} from '../components/ui';
import { RiskTrajectoryPanel } from '../components/RiskTrajectoryPanel';
import { EvidenceChainModal } from '../components/EvidenceChainModal';

export default function RiskIntelligence() {
  const { navigate } = useApp();
  const { projects: allProjects, reload } = usePragatiData();
  const { hasPermission } = useAuth();

  const [selectedRiskLevel, setSelectedRiskLevel] = useState<RiskLevel | 'All'>('All');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'cost' | 'delay'>('score');
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [trajectoryProjectId, setTrajectoryProjectId] = useState('');
  const [trajectory, setTrajectory] = useState<RiskTrajectory | null>(null);
  const [trajectoryLoading, setTrajectoryLoading] = useState(false);
  const [trajectoryError, setTrajectoryError] = useState<string | null>(null);
  const [trajectoryVersion, setTrajectoryVersion] = useState(0);
  const [evidenceProjectId, setEvidenceProjectId] = useState('');
  const canAssess = hasPermission('analyse_data') && import.meta.env.VITE_DATA_SOURCE !== 'mock';

  const componentSummary = useMemo(() => ['rule', 'statistical', 'ml'].map(name => {
    const available = allProjects
      .map(project => project.riskAssessment.components[name])
      .filter(component => component?.available && component.overallScore !== undefined);
    return {
      name,
      count: available.length,
      average: available.length
        ? Math.round(available.reduce((sum, component) => sum + (component.overallScore ?? 0), 0) / available.length)
        : null,
    };
  }), [allProjects]);
  const effectiveTrajectoryProjectId = useMemo(() => {
    if (allProjects.some(project => project.id === trajectoryProjectId)) return trajectoryProjectId;
    return [...allProjects].sort(
      (left, right) => right.riskAssessment.overallScore - left.riskAssessment.overallScore,
    )[0]?.id ?? '';
  }, [allProjects, trajectoryProjectId]);

  const runPortfolioAssessment = async () => {
    setAssessing(true);
    setAssessmentError(null);
    try {
      await ProjectService.assessPortfolioRisks();
      reload();
      setTrajectoryVersion(version => version + 1);
    } catch (error) {
      setAssessmentError(error instanceof Error ? error.message : 'Risk assessment failed.');
    } finally {
      setAssessing(false);
    }
  };

  useEffect(() => {
    if (!effectiveTrajectoryProjectId) return;
    const controller = new AbortController();
    setTrajectoryLoading(true);
    setTrajectoryError(null);
    void ProjectService.getRiskTrajectory(effectiveTrajectoryProjectId, controller.signal)
      .then(setTrajectory)
      .catch(error => {
        if (!controller.signal.aborted) {
          setTrajectoryError(error instanceof Error ? error.message : 'Unable to load the risk trajectory.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrajectoryLoading(false);
      });
    return () => controller.abort();
  }, [effectiveTrajectoryProjectId, trajectoryVersion]);

  // Filters
  const sectors = useMemo(() => ['All', ...new Set(allProjects.map(project => project.sector))], [allProjects]);
  const filteredProjects = useMemo(() => {
    return allProjects.filter(p => {
      if (selectedRiskLevel !== 'All' && p.riskAssessment.riskLevel !== selectedRiskLevel) return false;
      if (selectedSector !== 'All' && p.sector !== selectedSector) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q) && !p.state.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === 'score') {
        valA = a.riskAssessment.overallScore;
        valB = b.riskAssessment.overallScore;
      } else if (sortBy === 'cost') {
        valA = a.revisedCost - a.approvedCost;
        valB = b.revisedCost - b.approvedCost;
      } else {
        valA = a.delayDays;
        valB = b.delayDays;
      }
      return valB - valA;
    });
  }, [allProjects, selectedRiskLevel, selectedSector, searchQuery, sortBy]);

  // Aggregate stats
  const riskCounts = useMemo(() => {
    const counts = { Critical: 0, 'High Risk': 0, Watch: 0, Healthy: 0 };
    allProjects.forEach(p => {
      counts[p.riskAssessment.riskLevel] = (counts[p.riskAssessment.riskLevel] || 0) + 1;
    });
    return counts;
  }, [allProjects]);

  const avgRiskScore = useMemo(() => {
    const sum = allProjects.reduce((acc, p) => acc + p.riskAssessment.overallScore, 0);
    return Math.round(sum / allProjects.length);
  }, [allProjects]);

  const criticalAtRiskCost = useMemo(() => {
    return allProjects
      .filter(p => p.riskAssessment.riskLevel === 'Critical' || p.riskAssessment.riskLevel === 'High Risk')
      .reduce((sum, p) => sum + p.revisedCost, 0);
  }, [allProjects]);

  // Scatter plot data: Cost Overrun % vs Delay Days, sized by revisedCost, colored by riskLevel
  const scatterData = useMemo(() => {
    return allProjects.map(p => {
      const overrunPct = p.approvedCost > 0
        ? Math.round(((p.revisedCost - p.approvedCost) / p.approvedCost) * 100 * 10) / 10
        : 0;
      return {
        id: p.id,
        name: p.name,
        delayDays: p.delayDays,
        overrunPct,
        cost: p.revisedCost,
        riskLevel: p.riskAssessment.riskLevel,
        score: p.riskAssessment.overallScore,
        sector: p.sector,
      };
    });
  }, [allProjects]);

  // Sector average risk
  const sectorRiskData = useMemo(() => {
    const map: Record<string, { sum: number; count: number; critical: number }> = {};
    allProjects.forEach(p => {
      if (!map[p.sector]) map[p.sector] = { sum: 0, count: 0, critical: 0 };
      map[p.sector].sum += p.riskAssessment.overallScore;
      map[p.sector].count += 1;
      if (p.riskAssessment.riskLevel === 'Critical') map[p.sector].critical += 1;
    });
    return Object.entries(map).map(([sector, d]) => ({
      sector: sector.replace(' & ', ' &\n'),
      avgScore: Math.round(d.sum / d.count),
      criticalCount: d.critical,
      totalCount: d.count,
    })).sort((a, b) => b.avgScore - a.avgScore);
  }, [allProjects]);

  // Risk drivers distribution across portfolio
  const driverDistribution = useMemo(() => {
    let progressLagCount = 0;
    let costOverrunCount = 0;
    let scheduleDelayCount = 0;
    let milestoneSlippageCount = 0;
    let expGapCount = 0;

    allProjects.forEach(p => {
      const r = p.riskAssessment;
      if (r.progressFactor >= 50) progressLagCount++;
      if (r.costFactor >= 50) costOverrunCount++;
      if (r.scheduleFactor >= 50) scheduleDelayCount++;
      if (r.milestoneFactor >= 50) milestoneSlippageCount++;
      if (r.expenditureFactor >= 50) expGapCount++;
    });

    return [
      { name: 'Schedule Delays (>1 yr)', count: scheduleDelayCount, color: '#dc2626' },
      { name: 'Progress Variance (>15pp)', count: progressLagCount, color: '#ea580c' },
      { name: 'Cost Escalation (>10%)', count: costOverrunCount, color: '#d97706' },
      { name: 'Milestone Slippage', count: milestoneSlippageCount, color: '#176b78' },
      { name: 'Financial/Physical Gap', count: expGapCount, color: '#0f8b8d' },
    ];
  }, [allProjects]);

  const getColorByRisk = (level: string) => {
    if (level === 'Critical') return '#dc2626';
    if (level === 'High Risk') return '#ea580c';
    if (level === 'Watch') return '#d97706';
    return '#16a34a';
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Risk Intelligence</h1>
            <Badge variant="neutral">Portfolio Diagnostics</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Transparent hybrid assessment across {allProjects.length.toLocaleString()} central infrastructure projects with rule, peer-history, and genuine ML signals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAssess && (
            <button onClick={runPortfolioAssessment} disabled={assessing} className="btn btn-primary text-xs flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${assessing ? 'animate-spin' : ''}`} />
              {assessing ? 'Assessing...' : 'Refresh Risk Snapshot'}
            </button>
          )}
          <button
            onClick={() => setShowFormulaModal(true)}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Scoring Methodology
          </button>
        </div>
      </div>

      {assessmentError && <div className="p-3 rounded border border-red-200 bg-red-50 text-xs text-red-700">{assessmentError}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Risk score components">
        {componentSummary.map(component => (
          <div key={component.name} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-navy-800 capitalize">{component.name === 'ml' ? 'ML-derived signal' : `${component.name}-based score`}</span>
              <Badge variant={component.count ? 'info' : 'neutral'}>{component.count}/{allProjects.length} available</Badge>
            </div>
            <p className="mt-2 text-xl font-bold text-slate-900">{component.average === null ? 'Unavailable' : `${component.average}/100`}</p>
            <p className="text-2xs text-slate-500 mt-1">
              {component.name === 'rule' ? 'Preserved five-factor deterministic formula' : component.name === 'statistical' ? 'Empirical percentile within a documented peer cohort' : 'Only genuine versioned cost and schedule model outputs'}
            </p>
          </div>
        ))}
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Average Portfolio Risk"
          value={`${avgRiskScore}/100`}
          subtitle="Moderate-High overall portfolio exposure"
          status="warning"
          icon={<ShieldAlert className="w-5 h-5 text-amber-600" />}
        />
        <KPICard
          title="Critical Projects"
          value={riskCounts['Critical']}
          subtitle="Immediate PMO / Pragati intervention required"
          status="danger"
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
        />
        <KPICard
          title="Capital at Severe Risk"
          value={`₹${(criticalAtRiskCost / 1000).toFixed(1)}k Cr`}
          subtitle={`${Math.round((criticalAtRiskCost / 3120000) * 100)}% of total monitored portfolio`}
          status="danger"
          icon={<BarChart2 className="w-5 h-5 text-orange-600" />}
        />
        <KPICard
          title="Healthy / On-Track"
          value={riskCounts['Healthy']}
          subtitle={`${Math.round((riskCounts['Healthy'] / allProjects.length) * 100)}% of active projects`}
          status="healthy"
          icon={<ShieldCheck className="w-5 h-5 text-green-600" />}
        />
      </div>

      <div className="card">
        <div className="card-header flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-navy-800">Project Risk Trajectory</h2>
            <p className="text-xs text-slate-500 mt-0.5">Inspect persisted monthly risk movement and the drivers behind material changes.</p>
          </div>
          <select
            className="select py-1.5 text-xs min-w-64"
            value={effectiveTrajectoryProjectId}
            onChange={event => setTrajectoryProjectId(event.target.value)}
            aria-label="Select project for risk trajectory"
          >
            {allProjects.map(project => (
              <option key={project.id} value={project.id}>{project.id} — {project.name}</option>
            ))}
          </select>
        </div>
        <div className="card-body">
          <RiskTrajectoryPanel
            trajectory={trajectory?.projectId === effectiveTrajectoryProjectId ? trajectory : null}
            loading={trajectoryLoading}
            error={trajectoryError}
            onRetry={() => setTrajectoryVersion(version => version + 1)}
          />
        </div>
      </div>

      {/* Risk Quadrant & Sector Risk Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Risk Quadrant Scatter Plot */}
        <div className="card lg:col-span-8">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-navy-800">Risk Exposure Matrix: Cost Overrun vs. Delay</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quadrant map: Projects in top-right exhibit compounded failure risk. Dot size represents project capital expenditure.
              </p>
            </div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  dataKey="delayDays"
                  name="Schedule Delay"
                  unit=" d"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  label={{ value: 'Delay (Days)', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  type="number"
                  dataKey="overrunPct"
                  name="Cost Escalation"
                  unit="%"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  label={{ value: 'Cost Overrun (%)', angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: '#64748b' }}
                />
                <ZAxis type="number" dataKey="cost" range={[60, 450]} name="Revised Cost" />
                <ReTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 rounded shadow-lg border border-slate-200 text-xs">
                          <p className="font-semibold text-navy-900 mb-1">{data.name}</p>
                          <div className="space-y-0.5 text-slate-600">
                            <p>Sector: <span className="font-medium text-slate-900">{data.sector}</span></p>
                            <p>Risk Level: <span className="font-semibold" style={{ color: getColorByRisk(data.riskLevel) }}>{data.riskLevel} ({data.score}/100)</span></p>
                            <p>Cost Overrun: <span className="font-medium text-slate-900">+{data.overrunPct}%</span></p>
                            <p>Schedule Delay: <span className="font-medium text-slate-900">{data.delayDays} days</span></p>
                            <p>Total Cost: <span className="font-medium text-slate-900">₹{Number(data.cost).toLocaleString()} Cr</span></p>
                          </div>
                          <button
                            onClick={() => navigate('project-intelligence', data.id)}
                            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            Drill Down <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Projects" data={scatterData}>
                  {scatterData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={getColorByRisk(entry.riskLevel)}
                      opacity={0.8}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate('project-intelligence', entry.id)}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Critical</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> High Risk</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Watch</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-600" /> Healthy</span>
            </div>
          </div>
        </div>

        {/* Systemic Risk Drivers Card */}
        <div className="card lg:col-span-4 flex flex-col">
          <div className="card-header">
            <h2 className="text-sm font-semibold text-navy-800">Key Stress Drivers</h2>
          </div>
          <div className="card-body flex-1 flex flex-col justify-between">
            <p className="text-xs text-slate-500 mb-4">
              Number of monitored projects where this risk factor is the primary or secondary escalation driver:
            </p>
            <div className="space-y-4 flex-1">
              {driverDistribution.map(item => (
                <div key={item.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <span className="font-semibold text-slate-900">{item.count} projects</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(100, Math.round((item.count / allProjects.length) * 100))}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800">
              <p className="font-semibold flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Analytical Observation
              </p>
              <p className="mt-1 text-slate-600 text-2xs leading-relaxed">
                Schedule slippage precedes cost escalations by an average of 9 to 14 months across high-capex transport and energy projects.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sector Risk Index */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-navy-800">Sector-Wise Vulnerability Index</h2>
          <span className="text-xs text-slate-500">Average Composite Risk Score (0–100)</span>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sectorRiskData} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="sector" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
              <ReTooltip
                formatter={(v: any) => [`${v}/100`, 'Avg Risk Score']}
                contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 4 }}
              />
              <Bar dataKey="avgScore" name="Avg Risk Score" radius={[4, 4, 0, 0]}>
                {sectorRiskData.map(entry => (
                  <Cell
                    key={entry.sector}
                    fill={entry.avgScore >= 60 ? '#dc2626' : entry.avgScore >= 40 ? '#ea580c' : '#16a34a'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filterable Ranked Risk Table */}
      <div className="card">
        <div className="card-header flex-wrap gap-4">
          <div>
            <h2 className="text-sm font-semibold text-navy-800">Projects Requiring Immediate Supervision</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredProjects.length} of {allProjects.length} projects sorted by severity
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search project..."
                className="input pl-8 py-1 text-xs w-44"
              />
            </div>

            {/* Risk filter */}
            <select
              value={selectedRiskLevel}
              onChange={e => setSelectedRiskLevel(e.target.value as any)}
              className="select py-1 text-xs w-32"
            >
              <option value="All">All Risk Levels</option>
              <option value="Critical">Critical Only</option>
              <option value="High Risk">High Risk</option>
              <option value="Watch">Watch</option>
              <option value="Healthy">Healthy</option>
            </select>

            {/* Sector filter */}
            <select
              value={selectedSector}
              onChange={e => setSelectedSector(e.target.value)}
              className="select py-1 text-xs w-36"
            >
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Sort toggle */}
            <button
              onClick={() => {
                if (sortBy === 'score') setSortBy('cost');
                else if (sortBy === 'cost') setSortBy('delay');
                else setSortBy('score');
              }}
              className="btn btn-secondary text-xs flex items-center gap-1"
            >
              <ArrowUpDown className="w-3 h-3" />
              Sort: {sortBy === 'score' ? 'Risk Score' : sortBy === 'cost' ? 'Overrun ₹' : 'Delay (Days)'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project ID & Name</th>
                <th>Ministry / Sector</th>
                <th>State</th>
                <th>Composite Score</th>
                <th>Schedule Delay</th>
                <th>Cost Escalation</th>
                <th>Primary Risk Driver</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.slice(0, 15).map(project => {
                const overrun = project.revisedCost - project.approvedCost;
                const overrunPct = project.approvedCost > 0
                  ? ((overrun / project.approvedCost) * 100).toFixed(1)
                  : '0.0';
                const topDriver = project.riskAssessment.drivers[0]?.name || 'N/A';

                return (
                  <tr
                    key={project.id}
                    onClick={() => navigate('project-intelligence', project.id)}
                  >
                    <td>
                      <div>
                        <span className="font-semibold text-navy-900 block text-xs">{project.name}</span>
                        <span className="text-2xs text-slate-400">{project.id}</span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs">
                        <span className="text-slate-700 block truncate max-w-xs">{project.ministry}</span>
                        <span className="text-2xs text-slate-400">{project.sector}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-slate-600">{project.state}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs tabular-nums text-slate-800">
                          {project.riskAssessment.overallScore}
                        </span>
                        <HealthPill score={project.riskAssessment.overallScore} level={project.riskAssessment.riskLevel} />
                      </div>
                    </td>
                    <td>
                      <span className={`text-xs font-medium tabular-nums ${project.delayDays > 365 ? 'text-red-700' : 'text-slate-700'}`}>
                        {project.delayDays > 0 ? `${project.delayDays} days` : 'On Schedule'}
                      </span>
                    </td>
                    <td>
                      <div>
                        <span className={`text-xs font-medium tabular-nums block ${overrun > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                          {overrun > 0 ? `+₹${overrun.toLocaleString()} Cr` : 'Within Budget'}
                        </span>
                        {overrun > 0 && (
                          <span className="text-2xs text-slate-400">+{overrunPct}%</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-2xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {topDriver}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEvidenceProjectId(project.id);
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          <GitBranch className="w-3 h-3" /> View Evidence
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('project-intelligence', project.id);
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology Modal */}
      {showFormulaModal && (
        <Modal
          title="DHRISTI Risk Scoring Methodology"
          isOpen={showFormulaModal}
          onClose={() => setShowFormulaModal(false)}
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="font-semibold text-blue-900">Transparent Hybrid Ensemble</p>
              <p className="mt-1 text-slate-600">
                The original deterministic score is preserved as the primary component. Historical peer context and genuine versioned ML outputs supplement it only when available.
              </p>
              <div className="mt-2 font-mono bg-white p-2.5 rounded border border-blue-100 text-blue-950 font-bold text-xs">
                Hybrid = 0.50 × Rule + 0.25 × Historical + 0.25 × ML
              </div>
              <p className="mt-2 text-2xs text-slate-600">Unavailable components are excluded and remaining weights are proportionally renormalized; missing evidence is never scored as zero.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded border border-slate-200"><strong>Rule score</strong><p className="mt-1 text-slate-500">Exact legacy formula: 25% progress, 25% cost, 25% schedule, 15% milestones, 10% expenditure.</p></div>
              <div className="p-2.5 rounded border border-slate-200"><strong>Historical score</strong><p className="mt-1 text-slate-500">Midrank percentile against at least five non-synthetic sector/type, sector, or portfolio peers.</p></div>
              <div className="p-2.5 rounded border border-slate-200"><strong>ML signal</strong><p className="mt-1 text-slate-500">Cost and schedule probabilities from stored trained models. No model means no ML component.</p></div>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-slate-900">Factor Definitions:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                <li><strong>Progress Factor (PF):</strong> Variance between scheduled physical progress target and actual achievement on ground.</li>
                <li><strong>Cost Escalation Factor (CF):</strong> Ratio of revised/anticipated final cost to original Cabinet-approved cost.</li>
                <li><strong>Schedule Delay Factor (SF):</strong> Days elapsed past original commissioning deadline normalized against total duration.</li>
                <li><strong>Milestone Slippage Factor (MF):</strong> Ratio of delayed or at-risk intermediate milestones to total monitored milestones.</li>
                <li><strong>Expenditure Disparity Factor (EF):</strong> Divergence between financial drawdown and verified physical completion.</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-100 rounded">
              <p className="font-semibold text-slate-800">Threshold Categorization:</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-white p-2 rounded border border-red-200 text-red-700">
                  <strong>Critical (80–100):</strong> Severe multifold slippage; PMO Pragati intervention.
                </div>
                <div className="bg-white p-2 rounded border border-orange-200 text-orange-700">
                  <strong>High Risk (60–79):</strong> Substantial breach in cost or deadline; Secretary review.
                </div>
                <div className="bg-white p-2 rounded border border-amber-200 text-amber-700">
                  <strong>Watch (35–59):</strong> Early indicators of friction or milestone delay; Officer follow-up.
                </div>
                <div className="bg-white p-2 rounded border border-green-200 text-green-700">
                  <strong>Healthy (0–34):</strong> Progress tracking within acceptable tolerance limits.
                </div>
              </div>
            </div>

            <DataDisclaimer label="Auditable Hybrid Risk Methodology" />
          </div>
        </Modal>
      )}
      <EvidenceChainModal
        isOpen={Boolean(evidenceProjectId)}
        projectId={evidenceProjectId}
        preferredSubject="risk"
        backendEnabled={import.meta.env.VITE_DATA_SOURCE !== 'mock'}
        onClose={() => setEvidenceProjectId('')}
      />
    </div>
  );
}
