// =============================================================================
// DHRISTI — Project Intelligence Page
// Detailed project drill-down: Health Score, Risk Breakdown, Timeline, Why flagged
// =============================================================================

import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend,
  BarChart, Bar,
} from 'recharts';
import {
  ArrowLeft, Calendar, MapPin, Building2, Info, CheckCircle,
  AlertTriangle, Clock, Sparkles, GitBranch
} from 'lucide-react';
import {
  RiskBadge, StatusBadge, MetricRow, ContributionBar,
  ProgressBar, Tabs, formatCrore, formatDate,
  DataDisclaimer, Modal, EmptyState, ErrorState, LoadingState
} from '../components/ui';
import { useApp } from '../context/AppContext';
import { useProjectData } from '../hooks/useProjectData';
import { useAuth } from '../hooks/useAuth';
import { CostPredictionService } from '../services/costPredictionService';
import { SchedulePredictionService } from '../services/schedulePredictionService';
// Import the authoritative contracts explicitly instead of relying on directory
// barrel resolution. This keeps the editor's TypeScript server aligned with the
// same source file used by the project build.
import type {
  CostOverrunPrediction,
  EvidenceSubjectType,
  ScheduleOverrunPrediction,
} from '../types/index';
import { costOverrunPct } from '../utils/riskCalculations';
import { PredictionExplanationPanel } from '../components/PredictionExplanationPanel';
import { RiskTrajectoryPanel } from '../components/RiskTrajectoryPanel';
import { DataConfidencePanel } from '../components/DataConfidencePanel';
import { WhatIfSimulator } from '../components/WhatIfSimulator';
import { EvidenceChainModal } from '../components/EvidenceChainModal';
import { AskPragatiX } from '../components/AskPragatiX';
import { PublicProjectQr } from '../components/PublicProjectQr';

const MilestoneDependencyGraph = lazy(() => import('../components/MilestoneDependencyGraph').then(module => ({
  default: module.MilestoneDependencyGraph,
})));

const MILESTONE_ICON: Record<string, React.ReactNode> = {
  Completed: <CheckCircle className="w-4 h-4 text-green-500" />,
  'On Track': <Clock className="w-4 h-4 text-blue-500" />,
  'At Risk': <AlertTriangle className="w-4 h-4 text-amber-500" />,
  Delayed: <AlertTriangle className="w-4 h-4 text-red-500" />,
};

const USE_BACKEND_DATA = import.meta.env.VITE_DATA_SOURCE !== 'mock';

export default function ProjectIntelligence() {
  const { navigate, selectedProjectId } = useApp();
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [explanationFocus, setExplanationFocus] = useState<'cost' | 'schedule'>('cost');
  const [costPrediction, setCostPrediction] = useState<CostOverrunPrediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [schedulePrediction, setSchedulePrediction] = useState<ScheduleOverrunPrediction | null>(null);
  const [schedulePredictionLoading, setSchedulePredictionLoading] = useState(false);
  const [schedulePredictionError, setSchedulePredictionError] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceSubject, setEvidenceSubject] = useState<EvidenceSubjectType>('risk');
  const [evidencePrediction, setEvidencePrediction] = useState<'cost' | 'schedule' | undefined>();

  const openEvidence = (subject: EvidenceSubjectType, prediction?: 'cost' | 'schedule') => {
    setEvidenceSubject(subject);
    setEvidencePrediction(prediction);
    setEvidenceOpen(true);
  };

  const {
    project,
    history,
    riskTrajectory,
    riskTrajectoryLoading,
    riskTrajectoryError,
    dataConfidence,
    dataConfidenceLoading,
    dataConfidenceError,
    loading,
    error,
    retry,
    retryRiskTrajectory,
    retryDataConfidence,
  } = useProjectData(selectedProjectId);

  useEffect(() => {
    setCostPrediction(null);
    setPredictionError(null);
    if (!selectedProjectId || !USE_BACKEND_DATA || !hasPermission('view_predictions')) return;

    const controller = new AbortController();
    setPredictionLoading(true);
    void CostPredictionService.getLatest(selectedProjectId, controller.signal)
      .then(setCostPrediction)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setPredictionError(loadError instanceof Error ? loadError.message : 'Unable to load the latest model result.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPredictionLoading(false);
      });
    return () => controller.abort();
  }, [selectedProjectId, hasPermission]);

  useEffect(() => {
    setSchedulePrediction(null);
    setSchedulePredictionError(null);
    if (!selectedProjectId || !USE_BACKEND_DATA || !hasPermission('view_predictions')) return;

    const controller = new AbortController();
    setSchedulePredictionLoading(true);
    void SchedulePredictionService.getLatest(selectedProjectId, controller.signal)
      .then(setSchedulePrediction)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setSchedulePredictionError(
            loadError instanceof Error ? loadError.message : 'Unable to load the latest schedule model result.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSchedulePredictionLoading(false);
      });
    return () => controller.abort();
  }, [selectedProjectId, hasPermission]);

  const generateCostPrediction = async () => {
    if (!project) return;
    setPredictionLoading(true);
    setPredictionError(null);
    try {
      setCostPrediction(await CostPredictionService.generate(project.id));
    } catch (predictionFailure) {
      setPredictionError(
        predictionFailure instanceof Error
          ? predictionFailure.message
          : 'The trained model could not generate a prediction.',
      );
    } finally {
      setPredictionLoading(false);
    }
  };

  const generateSchedulePrediction = async () => {
    if (!project) return;
    setSchedulePredictionLoading(true);
    setSchedulePredictionError(null);
    try {
      setSchedulePrediction(await SchedulePredictionService.generate(project.id));
    } catch (predictionFailure) {
      setSchedulePredictionError(
        predictionFailure instanceof Error
          ? predictionFailure.message
          : 'The trained schedule model could not generate a prediction.',
      );
    } finally {
      setSchedulePredictionLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6"><LoadingState message="Loading project intelligence..." /></div>;
  }

  if (error) {
    return <div className="p-6"><div className="card"><ErrorState description={error} onRetry={retry} /></div></div>;
  }

  if (!project) {
    return (
      <div className="p-6">
        <EmptyState title="No project selected" description="Please select a project from the portfolio." />
        <div className="flex justify-center mt-4">
          <button onClick={() => navigate('project-portfolio')} className="btn-primary">
            Go to Project Portfolio
          </button>
        </div>
      </div>
    );
  }

  const ra = project.riskAssessment;
  const isHybridRisk = ra.methodology === 'hybrid-risk-v1';
  const riskMethodLabel = isHybridRisk
    ? 'Hybrid score with auditable rule, historical, and available ML components'
    : 'Transparent deterministic rule score';
  const availableExplanations = [
    ...(costPrediction?.explanation ? [{ id: 'cost' as const, label: 'Cost overrun', explanation: costPrediction.explanation }] : []),
    ...(schedulePrediction?.explanation ? [{ id: 'schedule' as const, label: 'Schedule overrun', explanation: schedulePrediction.explanation }] : []),
  ];
  const focusedExplanation = availableExplanations.find(item => item.id === explanationFocus) ?? availableExplanations[0];
  const overrunPct = costOverrunPct(project.approvedCost, project.revisedCost);
  const progressTrend = (history?.monthlyUpdates ?? []).map(update => ({
    month: new Date(update.reportingMonth).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    planned: update.plannedProgress,
    actual: update.physicalProgress,
  }));
  const schedulePredictionTrend = (() => {
    const points = new Map<string, { period: string; month: string; planned?: number; actual?: number; predicted?: number }>();
    for (const update of history?.monthlyUpdates ?? []) {
      points.set(update.reportingMonth, {
        period: update.reportingMonth,
        month: new Date(update.reportingMonth).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        planned: update.plannedProgress,
        actual: update.physicalProgress,
      });
    }
    for (const predictionPoint of schedulePrediction?.predictedProgressSeries ?? []) {
      const existing = points.get(predictionPoint.period);
      points.set(predictionPoint.period, {
        period: predictionPoint.period,
        month: new Date(predictionPoint.period).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        planned: existing?.planned,
        actual: existing?.actual,
        predicted: predictionPoint.predictedProgress,
      });
    }
    return [...points.values()].sort((left, right) => left.period.localeCompare(right.period));
  })();
  const expenditureTrend = (history?.monthlyUpdates ?? []).map(update => ({
    month: new Date(update.reportingMonth).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    amount: update.expenditure ?? 0,
  }));

  const costBreakdownData = [
    { name: 'Material Costs', value: project.costBreakdown.materialCosts },
    { name: 'Scope Changes', value: project.costBreakdown.scopeChanges },
    { name: 'Delayed Execution', value: project.costBreakdown.delayedExecution },
    { name: 'Contractual', value: project.costBreakdown.contractualChanges },
    { name: 'Other', value: project.costBreakdown.otherFactors },
  ];

  const milestoneStats = {
    completed: project.milestones.filter(m => m.status === 'Completed').length,
    onTrack: project.milestones.filter(m => m.status === 'On Track').length,
    atRisk: project.milestones.filter(m => m.status === 'At Risk').length,
    delayed: project.milestones.filter(m => m.status === 'Delayed').length,
  };

  const RISK_LEVEL_COLOR: Record<string, string> = {
    Healthy: 'text-green-600',
    Watch: 'text-amber-600',
    'High Risk': 'text-orange-600',
    Critical: 'text-red-600',
  };

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('project-portfolio')} className="btn-secondary btn-sm mt-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Portfolio
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-navy-800 truncate">{project.name}</h1>
            <RiskBadge level={ra.riskLevel} score={ra.overallScore} />
            <StatusBadge status={project.status} />
            {dataConfidence && (
              <button type="button" className="badge badge-info" onClick={() => setActiveTab('data-confidence')} title="Input data quality and completeness — not model confidence">
                Data Confidence {dataConfidence.overallScore.toFixed(0)}/100
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{project.ministry}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.state}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Last updated: {formatDate(project.lastUpdated)}</span>
            <span className="font-mono text-slate-400">{project.id}</span>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <PublicProjectQr projectId={project.id} projectName={project.name} />
          <DataDisclaimer />
        </div>
      </div>

      <AskPragatiX
        key={project.id}
        projectId={project.id}
        projectName={project.name}
        backendEnabled={USE_BACKEND_DATA}
        canUploadDocuments={hasPermission('upload_cuf')}
      />

      {/* Health Score + Key Metrics row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Health Score Card */}
        <div className="card p-5 flex flex-col items-center">
          <div className="w-full mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project Health Score</p>
            <p className="text-2xs text-slate-400">{riskMethodLabel}</p>
          </div>
          <div className="relative flex items-center justify-center w-36 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" startAngle={90} endAngle={-270} data={[{ value: ra.overallScore, fill: ra.riskLevel === 'Critical' ? '#dc2626' : ra.riskLevel === 'High Risk' ? '#ea580c' : ra.riskLevel === 'Watch' ? '#d97706' : '#16a34a' }]}>
                <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#f1f5f9' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold tabular-nums ${RISK_LEVEL_COLOR[ra.riskLevel]}`}>{ra.overallScore}</span>
              <span className="text-2xs text-slate-500">/100</span>
            </div>
          </div>
          <p className={`text-sm font-bold mt-2 ${RISK_LEVEL_COLOR[ra.riskLevel]}`}>{ra.riskLevel.toUpperCase()}</p>
          <button onClick={() => setShowWhyModal(true)} className="mt-3 btn-secondary btn-sm w-full">
            <Info className="w-3.5 h-3.5" />
            Why is this flagged?
          </button>
          <button onClick={() => openEvidence('risk')} className="mt-2 btn-secondary btn-sm w-full">
            <GitBranch className="w-3.5 h-3.5" />
            View Evidence
          </button>
        </div>

        {/* Summary Metrics */}
        <div className="card p-4 lg:col-span-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Project Summary</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Approved Cost', value: formatCrore(project.approvedCost) },
              { label: 'Revised Cost', value: <span className={overrunPct > 0 ? 'text-red-600' : ''}>{formatCrore(project.revisedCost)}</span> },
              { label: 'Expenditure', value: formatCrore(project.expenditure) },
              { label: 'Cost Escalation', value: <span className={overrunPct > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{overrunPct > 0 ? '+' : ''}{overrunPct.toFixed(1)}%</span> },
              { label: 'Physical Progress', value: `${project.physicalProgress}%` },
              { label: 'Expected Progress', value: `${project.expectedProgress}%` },
              { label: 'Schedule Delay', value: <span className="text-red-600 font-bold">+{project.delayDays} days</span> },
              { label: 'Revised Completion', value: formatDate(project.revisedCompletionDate) },
            ].map(m => (
              <div key={m.label} className="min-w-0">
                <p className="text-2xs text-slate-400 uppercase tracking-wide">{m.label}</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{m.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Physical Progress</span>
                <span>{project.physicalProgress}% / Expected: {project.expectedProgress}%</span>
              </div>
              <ProgressBar value={project.physicalProgress} expected={project.expectedProgress} height="h-2.5" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Financial Progress</span>
                <span>{project.financialProgress}%</span>
              </div>
              <ProgressBar value={project.financialProgress} color="bg-blue-500" height="h-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Risk Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Cost Overrun Risk', score: ra.costOverrunRisk, level: ra.costOverrunRisk >= 80 ? 'Critical' : ra.costOverrunRisk >= 60 ? 'High Risk' : ra.costOverrunRisk >= 35 ? 'Watch' : 'Healthy', sub: `+${overrunPct.toFixed(1)}% cost escalation` },
          { label: 'Schedule Delay Risk', score: ra.scheduleDelayRisk, level: ra.scheduleDelayRisk >= 80 ? 'Critical' : ra.scheduleDelayRisk >= 60 ? 'High Risk' : ra.scheduleDelayRisk >= 35 ? 'Watch' : 'Healthy', sub: `${project.delayDays} days behind schedule` },
          { label: 'Implementation Risk', score: ra.implementationRisk, level: ra.implementationRisk >= 80 ? 'Critical' : ra.implementationRisk >= 60 ? 'High Risk' : ra.implementationRisk >= 35 ? 'Watch' : 'Healthy', sub: `${project.physicalProgress - project.expectedProgress}pp progress gap` },
        ].map(card => (
          <div key={card.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{card.label}</p>
              <button onClick={() => setShowWhyModal(true)} className="text-2xs text-navy-600 hover:underline flex items-center gap-0.5">
                Why? <Info className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-bold tabular-nums ${RISK_LEVEL_COLOR[card.level as string]}`}>{card.score}%</span>
              <RiskBadge level={card.level as any} />
            </div>
            <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
            <ProgressBar value={card.score} color={
              card.score >= 80 ? 'bg-red-500' : card.score >= 60 ? 'bg-orange-500' : card.score >= 35 ? 'bg-amber-500' : 'bg-green-500'
            } height="h-2" />
            <p className="text-2xs text-slate-400 mt-2">{riskMethodLabel}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="px-5 pt-4">
          <Tabs
            tabs={[
              { id: 'overview', label: 'Project Details' },
              { id: 'data-confidence', label: 'Data Confidence' },
              { id: 'risk-trajectory', label: 'Risk Trajectory' },
              { id: 'timeline', label: 'Timeline & Milestones' },
              { id: 'cost', label: 'Cost Analytics' },
              { id: 'schedule', label: 'Schedule Analytics' },
              ...(hasPermission('view_predictions') ? [{ id: 'prediction', label: 'Cost Prediction' }] : []),
              ...(hasPermission('view_predictions') ? [{ id: 'schedule-prediction', label: 'Schedule Prediction' }] : []),
              ...(hasPermission('view_predictions') ? [{ id: 'what-if', label: 'What-If Simulator' }] : []),
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="p-5">
          {/* Project Details Tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Project Information</p>
                <div className="space-y-0">
                  <MetricRow label="Project ID" value={project.id} />
                  <MetricRow label="Ministry" value={project.ministry} />
                  <MetricRow label="Department" value={project.department} />
                  <MetricRow label="Sector" value={project.sector} />
                  <MetricRow label="State(s)" value={project.state} />
                  <MetricRow label="Implementing Agency" value={project.implementingAgency} />
                  <MetricRow label="Project Type" value={project.projectType} />
                  <MetricRow label="Status" value={<StatusBadge status={project.status} />} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Risk Drivers — Transparent Score Breakdown</p>
                <div className="space-y-3">
                  {ra.drivers.map(driver => (
                    <div key={driver.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-700">{driver.name}</span>
                        <span className={`badge text-2xs ${driver.impact === 'High' ? 'badge-high' : driver.impact === 'Medium' ? 'badge-watch' : 'badge-neutral'}`}>
                          {driver.impact} impact
                        </span>
                      </div>
                      <ContributionBar value={driver.value} />
                      <p className="text-2xs text-slate-400 mt-0.5">{driver.description}</p>
                    </div>
                  ))}
                </div>
                <p className="text-2xs text-slate-400 mt-3 p-2 bg-slate-50 rounded border border-slate-100">
                  {isHybridRisk
                    ? 'The stored snapshot records component scores, effective weights, peer-cohort evidence, and model/rule provenance.'
                    : 'Rule-only score computed from project data using the preserved transparent weighted formula.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'risk-trajectory' && (
            <RiskTrajectoryPanel
              trajectory={riskTrajectory}
              loading={riskTrajectoryLoading}
              error={riskTrajectoryError}
              onRetry={retryRiskTrajectory}
            />
          )}

          {activeTab === 'data-confidence' && (
            <DataConfidencePanel
              confidence={dataConfidence}
              loading={dataConfidenceLoading}
              error={dataConfidenceError}
              onRetry={retryDataConfidence}
            />
          )}

          {activeTab === 'what-if' && hasPermission('view_predictions') && (
            <WhatIfSimulator projectId={project.id} backendEnabled={USE_BACKEND_DATA} />
          )}

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'Completed', count: milestoneStats.completed, color: 'text-green-600 bg-green-50 border-green-200' },
                  { label: 'On Track',  count: milestoneStats.onTrack,  color: 'text-blue-600 bg-blue-50 border-blue-200' },
                  { label: 'At Risk',   count: milestoneStats.atRisk,   color: 'text-amber-600 bg-amber-50 border-amber-200' },
                  { label: 'Delayed',   count: milestoneStats.delayed,  color: 'text-red-600 bg-red-50 border-red-200' },
                ].map(s => (
                  <div key={s.label} className={`p-3 rounded border ${s.color} text-center`}>
                    <div className={`text-2xl font-bold tabular-nums ${s.color.split(' ')[0]}`}>{s.count}</div>
                    <div className="text-xs font-medium mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {project.milestones.map(m => (
                  <div key={m.id} className={`flex items-start gap-3 p-3 rounded border
                    ${m.status === 'Completed' ? 'border-green-200 bg-green-50' :
                      m.status === 'On Track'  ? 'border-blue-200 bg-blue-50' :
                      m.status === 'At Risk'   ? 'border-amber-200 bg-amber-50' :
                                                 'border-red-200 bg-red-50'}`}>
                    <div className="mt-0.5 shrink-0">{MILESTONE_ICON[m.status]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800">{m.name}</p>
                        <span className={`badge text-2xs ${
                          m.status === 'Completed' ? 'badge-healthy' :
                          m.status === 'On Track'  ? 'badge-info' :
                          m.status === 'At Risk'   ? 'badge-watch' : 'badge-critical'}`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-2xs text-slate-500 flex-wrap">
                        <span>Planned: {formatDate(m.plannedDate)}</span>
                        {m.actualDate && <span>Actual: {formatDate(m.actualDate)}</span>}
                        {m.delayDays && m.delayDays > 0 && (
                          <span className="text-red-600 font-medium">Delay: {m.delayDays} days</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-5">
                <Suspense fallback={<LoadingState message="Loading dependency visualization..." />}>
                  <MilestoneDependencyGraph
                    projectId={project.id}
                    backendEnabled={USE_BACKEND_DATA}
                    canManage={hasPermission('manage_dependencies')}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* Cost Analytics Tab */}
          {activeTab === 'cost' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Monthly Expenditure Trend</p>
                <DataDisclaimer />
                <div className="mt-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={expenditureTrend} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <ReTooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`₹${Number(v ?? 0).toLocaleString()} Cr`, 'Expenditure']} />
                      <Area type="monotone" dataKey="amount" stroke="#176b78" fill="#dcefeb" strokeWidth={2} name="Expenditure (₹ Cr)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-3">Cost Escalation Drivers (%)</p>
                <DataDisclaimer />
                <div className="mt-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={costBreakdownData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={110} />
                      <ReTooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [`${v}%`, 'Share']} />
                      <Bar dataKey="value" fill="#176b78" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Schedule Analytics Tab */}
          {activeTab === 'schedule' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-700">Planned vs Actual Progress (%)</p>
              <DataDisclaimer />
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={progressTrend} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                  <ReTooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="planned" name="Planned Progress" stroke="#94a3b8" fill="#f1f5f9" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                  <Area type="monotone" dataKey="actual" name="Actual Progress" stroke="#176b78" fill="#dcefeb" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <p className="text-2xs text-slate-500">Current Delay</p>
                  <p className="text-xl font-bold text-red-600 tabular-nums">+{project.delayDays} days</p>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <p className="text-2xs text-slate-500">Progress Gap</p>
                  <p className="text-xl font-bold text-orange-600 tabular-nums">{(project.physicalProgress - project.expectedProgress).toFixed(0)}pp</p>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <p className="text-2xs text-slate-500">Original Completion</p>
                  <p className="text-sm font-bold text-slate-700">{formatDate(project.originalCompletionDate)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <p className="text-2xs text-slate-500">Revised Completion</p>
                  <p className="text-sm font-bold text-red-600">{formatDate(project.revisedCompletionDate)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Independent schedule-overrun ML tab */}
          {activeTab === 'schedule-prediction' && hasPermission('view_predictions') && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Trained Schedule Overrun Model</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                    Independent from the cost model. It predicts completion variance and schedule-overrun probability
                    from monitoring information available at the dated project snapshot.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => openEvidence('prediction', 'schedule')}>
                    <GitBranch className="w-3.5 h-3.5" /> View Evidence
                  </button>
                  {USE_BACKEND_DATA && hasPermission('analyse_data') && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => void generateSchedulePrediction()} disabled={schedulePredictionLoading}>
                      <Sparkles className="w-3.5 h-3.5" />
                      {schedulePredictionLoading ? 'Running model…' : schedulePrediction ? 'Run again' : 'Run prediction'}
                    </button>
                  )}
                </div>
              </div>

              {schedulePredictionError && (
                <ErrorState
                  title="Schedule prediction unavailable"
                  description={schedulePredictionError}
                  onRetry={USE_BACKEND_DATA && hasPermission('analyse_data') ? () => void generateSchedulePrediction() : undefined}
                />
              )}
              {!schedulePredictionError && !schedulePrediction && !schedulePredictionLoading && (
                <EmptyState
                  title="No real schedule model result loaded"
                  description={!USE_BACKEND_DATA
                    ? 'Real model inference is unavailable while the application is using the explicit offline mock data source.'
                    : hasPermission('analyse_data')
                      ? 'Run the active schedule model to generate and persist a project-specific prediction.'
                      : 'An Administrator or Analyst must generate a prediction before it can be reviewed.'}
                />
              )}
              {schedulePredictionLoading && <LoadingState message="Running the independent schedule-overrun model…" />}

              {schedulePrediction && !schedulePredictionLoading && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Schedule overrun probability</p>
                      <p className="text-2xl font-bold text-navy-800 tabular-nums mt-1">
                        {schedulePrediction.scheduleOverrunProbability == null
                          ? 'Not available'
                          : `${(schedulePrediction.scheduleOverrunProbability * 100).toFixed(1)}%`}
                      </p>
                      <p className="text-2xs text-slate-400 mt-1">Threshold: &gt; {schedulePrediction.scheduleOverrunThresholdDays} days</p>
                    </div>
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Expected delay</p>
                      <p className={`text-2xl font-bold tabular-nums mt-1 ${schedulePrediction.expectedDelayDays > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {schedulePrediction.expectedDelayDays.toLocaleString()} days
                      </p>
                      <p className="text-2xs text-slate-400 mt-1">Signed variance: {schedulePrediction.predictedCompletionVarianceDays} days</p>
                    </div>
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Predicted completion</p>
                      <p className="text-lg font-bold text-navy-800 mt-1">{formatDate(schedulePrediction.predictedCompletionDate)}</p>
                      <p className="text-2xs text-slate-400 mt-1">Original: {formatDate(schedulePrediction.originalCompletionDate)}</p>
                    </div>
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Empirical date range</p>
                      <p className="text-sm font-bold text-navy-800 mt-2">
                        {formatDate(schedulePrediction.predictedCompletionDateLower)} – {formatDate(schedulePrediction.predictedCompletionDateUpper)}
                      </p>
                      <p className="text-2xs text-amber-600 mt-1">Not a formally calibrated interval</p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Planned vs actual vs predicted progress</p>
                        <p className="text-2xs text-slate-500 mt-0.5">Solid blue is observed actual data; grey is reported plan; purple dashes are the implied path to the model-predicted completion date.</p>
                      </div>
                      <span className="badge badge-neutral text-2xs">Prediction clearly separated</span>
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={schedulePredictionTrend} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                        <ReTooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="planned" name="Reported planned" stroke="#64748b" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" connectNulls={false} />
                        <Area type="monotone" dataKey="actual" name="Observed actual" stroke="#176b78" fill="#dcefeb" strokeWidth={2.5} connectNulls={false} />
                        <Area type="monotone" dataKey="predicted" name="Predicted/implied path" stroke="#8b5cf6" fill="transparent" strokeWidth={2.5} strokeDasharray="7 4" connectNulls={true} />
                      </AreaChart>
                    </ResponsiveContainer>
                    <p className="text-2xs text-slate-500 mt-2">
                      The purple progress path is linear interpolation from the last actual snapshot to the model-predicted completion date. It is not a separately trained monthly-progress forecast.
                    </p>
                  </div>

                  {schedulePrediction.scheduleOverrunProbability == null
                    && schedulePrediction.evaluationMetrics.classification?.omission_reason && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                      Classification not published: {schedulePrediction.evaluationMetrics.classification.omission_reason}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded p-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Model provenance</p>
                      <MetricRow label="Model version" value={schedulePrediction.modelVersion} />
                      <MetricRow label="Regression model" value={schedulePrediction.regressionModel.replaceAll('_', ' ')} />
                      <MetricRow label="Classification model" value={schedulePrediction.classificationModel?.replaceAll('_', ' ') ?? 'Omitted — insufficient class support'} />
                      <MetricRow label="Snapshot date" value={formatDate(schedulePrediction.asOfDate)} />
                    </div>
                    <div className="border border-slate-200 rounded p-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Held-out test metrics</p>
                      <MetricRow label="MAE" value={schedulePrediction.evaluationMetrics.regression?.test?.mae_days == null ? 'Unavailable' : `${schedulePrediction.evaluationMetrics.regression.test.mae_days.toFixed(1)} days`} />
                      <MetricRow label="RMSE" value={schedulePrediction.evaluationMetrics.regression?.test?.rmse_days == null ? 'Unavailable' : `${schedulePrediction.evaluationMetrics.regression.test.rmse_days.toFixed(1)} days`} />
                      <MetricRow label="R²" value={schedulePrediction.evaluationMetrics.regression?.test?.r2?.toFixed(3) ?? 'Unavailable'} />
                      <MetricRow label="Classification F1" value={schedulePrediction.evaluationMetrics.classification?.test?.f1?.toFixed(3) ?? 'Not trained'} />
                      <MetricRow label="Classification AUC" value={schedulePrediction.evaluationMetrics.classification?.test?.roc_auc?.toFixed(3) ?? 'Not trained'} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cost-overrun ML tab */}
          {activeTab === 'prediction' && hasPermission('view_predictions') && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Trained Cost Overrun Model</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                    Uses the active, versioned model trained on non-demo completed-project history. No deterministic
                    risk score or mock value is substituted when a trained model is unavailable.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => openEvidence('prediction', 'cost')}>
                    <GitBranch className="w-3.5 h-3.5" /> View Evidence
                  </button>
                  {USE_BACKEND_DATA && hasPermission('analyse_data') && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => void generateCostPrediction()}
                      disabled={predictionLoading}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {predictionLoading ? 'Running model…' : costPrediction ? 'Run again' : 'Run prediction'}
                    </button>
                  )}
                </div>
              </div>

              {predictionError && (
                <ErrorState
                  title="Prediction unavailable"
                  description={predictionError}
                  onRetry={USE_BACKEND_DATA && hasPermission('analyse_data') ? () => void generateCostPrediction() : undefined}
                />
              )}

              {!predictionError && !costPrediction && !predictionLoading && (
                <EmptyState
                  title="No real model result loaded"
                  description={!USE_BACKEND_DATA
                    ? 'Real model inference is unavailable while the application is using the explicit offline mock data source.'
                    : hasPermission('analyse_data')
                      ? 'Run the active trained model to generate and persist a project-specific prediction.'
                      : 'An Administrator or Analyst must generate a prediction before it can be reviewed.'}
                />
              )}

              {predictionLoading && <LoadingState message="Running the active cost-overrun model…" />}

              {costPrediction && !predictionLoading && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Significant overrun probability</p>
                      <p className="text-2xl font-bold text-navy-800 tabular-nums mt-1">
                        {costPrediction.significantOverrunProbability == null
                          ? 'Not available'
                          : `${(costPrediction.significantOverrunProbability * 100).toFixed(1)}%`}
                      </p>
                      <p className="text-2xs text-slate-400 mt-1">
                        {costPrediction.predictedClass
                          ? `${costPrediction.predictedClass.replaceAll('_', ' ')} · `
                          : ''}
                        Threshold: {costPrediction.significantOverrunThresholdPct.toFixed(0)}%
                      </p>
                    </div>
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Predicted final cost</p>
                      <p className="text-2xl font-bold text-navy-800 tabular-nums mt-1">
                        {formatCrore(costPrediction.predictedFinalCost)}
                      </p>
                      <p className="text-2xs text-slate-400 mt-1">
                        Approved: {formatCrore(costPrediction.originalApprovedCost)}
                      </p>
                    </div>
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Predicted escalation</p>
                      <p className={`text-2xl font-bold tabular-nums mt-1 ${costPrediction.predictedEscalationAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCrore(costPrediction.predictedEscalationAmount)}
                      </p>
                      <p className="text-2xs text-slate-400 mt-1">
                        {costPrediction.predictedEscalationPercentage >= 0 ? '+' : ''}{costPrediction.predictedEscalationPercentage.toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-4 rounded border border-slate-200 bg-slate-50">
                      <p className="text-2xs uppercase tracking-wide text-slate-500">Empirical uncertainty range</p>
                      <p className="text-sm font-bold text-navy-800 tabular-nums mt-2">
                        {formatCrore(costPrediction.predictedFinalCostLower)} – {formatCrore(costPrediction.predictedFinalCostUpper)}
                      </p>
                      <p className="text-2xs text-amber-600 mt-1">Not a formally calibrated interval</p>
                    </div>
                  </div>

                  {costPrediction.significantOverrunProbability == null
                    && costPrediction.evaluationMetrics.classification?.omission_reason && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                      Classification not published: {costPrediction.evaluationMetrics.classification.omission_reason}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded p-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Model provenance</p>
                      <MetricRow label="Model version" value={costPrediction.modelVersion} />
                      <MetricRow label="Regression model" value={costPrediction.regressionModel.replaceAll('_', ' ')} />
                      <MetricRow label="Classification model" value={costPrediction.classificationModel?.replaceAll('_', ' ') ?? 'Omitted — insufficient class support'} />
                      <MetricRow label="Snapshot date" value={formatDate(costPrediction.asOfDate)} />
                      <MetricRow label="Generated" value={formatDate(costPrediction.generatedAt)} />
                    </div>
                    <div className="border border-slate-200 rounded p-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Held-out test metrics</p>
                      <MetricRow label="MAE" value={costPrediction.evaluationMetrics.regression?.test?.mae?.toFixed(2) ?? 'Unavailable'} />
                      <MetricRow label="RMSE" value={costPrediction.evaluationMetrics.regression?.test?.rmse?.toFixed(2) ?? 'Unavailable'} />
                      <MetricRow label="R²" value={costPrediction.evaluationMetrics.regression?.test?.r2?.toFixed(3) ?? 'Unavailable'} />
                      <MetricRow label="Classification F1" value={costPrediction.evaluationMetrics.classification?.test?.f1?.toFixed(3) ?? 'Not trained'} />
                      <MetricRow label="Classification AUC" value={costPrediction.evaluationMetrics.classification?.test?.roc_auc?.toFixed(3) ?? 'Not trained'} />
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    This is a statistical estimate from model version {costPrediction.modelVersion}, not a certified
                    revised cost. The uncertainty band is the 90th percentile validation error and is explicitly not
                    a calibrated confidence interval.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Why Modal */}
      <Modal isOpen={showWhyModal} onClose={() => setShowWhyModal(false)} title="Why is this project flagged?" size="lg">
        <div className="space-y-5">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>Method:</strong> {isHybridRisk
              ? 'This stored hybrid assessment combines the preserved deterministic rule score with eligible peer-history and genuine versioned model signals. Missing components are excluded and weights are renormalized.'
              : 'This is the preserved deterministic rule score. Historical and genuine ML signals are not available in this snapshot.'}
          </div>

          {focusedExplanation && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-semibold text-slate-700">Prediction explanation</p>
                {availableExplanations.length > 1 && (
                  <div className="flex items-center p-0.5 rounded border border-slate-200 bg-slate-50">
                    {availableExplanations.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setExplanationFocus(item.id)}
                        className={`px-2.5 py-1 rounded text-2xs font-medium ${focusedExplanation.id === item.id ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <PredictionExplanationPanel explanation={focusedExplanation.explanation} />
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Stored hybrid risk drivers</p>
            <div className="space-y-4">
              {ra.drivers.map((driver, idx) => (
                <div key={driver.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 w-5 text-right">{idx + 1}.</span>
                      <span className="text-sm font-medium text-slate-800">{driver.name}</span>
                    </div>
                    <span className={`badge text-xs ${driver.impact === 'High' ? 'badge-high' : driver.impact === 'Medium' ? 'badge-watch' : 'badge-neutral'}`}>
                      {driver.impact} impact
                    </span>
                  </div>
                  <div className="ml-7">
                    <ContributionBar value={driver.value} color={driver.impact === 'High' ? 'bg-red-500' : driver.impact === 'Medium' ? 'bg-amber-500' : 'bg-slate-400'} />
                    <p className="text-2xs text-slate-500 mt-1">{driver.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Supporting Evidence</p>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Approved Cost</span>
                <span className="font-medium">{formatCrore(project.approvedCost)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Revised Cost</span>
                <span className="font-medium text-red-600">{formatCrore(project.revisedCost)} (+{overrunPct.toFixed(1)}%)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Physical Progress</span>
                <span className="font-medium">{project.physicalProgress}% (expected {project.expectedProgress}%)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Schedule Delay</span>
                <span className="font-medium text-red-600">+{project.delayDays} days</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Milestones Delayed / At Risk</span>
                <span className="font-medium text-red-600">{project.milestones.filter(m => m.status === 'Delayed' || m.status === 'At Risk').length} of {project.milestones.length}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Expenditure vs Physical Progress</span>
                <span className={`font-medium ${project.financialProgress > project.physicalProgress + 5 ? 'text-amber-600' : 'text-green-600'}`}>
                  {project.financialProgress}% financial vs {project.physicalProgress}% physical
                </span>
              </div>
            </div>
          </div>

          <div className="p-2 bg-slate-50 rounded border border-slate-100 text-2xs text-slate-400">
            Rule component — Progress 25%, Cost 25%, Schedule 25%, Milestones 15%, Expenditure 10%. Hybrid defaults — Rule 50%, Historical 25%, ML 25% when all are available.
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setShowWhyModal(false); navigate('intervention-center'); }} className="btn-primary btn-sm">
              View Recommended Interventions
            </button>
            <button onClick={() => setShowWhyModal(false)} className="btn-secondary btn-sm">
              Close
            </button>
          </div>
        </div>
      </Modal>
      <EvidenceChainModal
        isOpen={evidenceOpen}
        projectId={project.id}
        preferredSubject={evidenceSubject}
        preferredPrediction={evidencePrediction}
        backendEnabled={USE_BACKEND_DATA}
        onClose={() => setEvidenceOpen(false)}
      />
    </div>
  );
}
