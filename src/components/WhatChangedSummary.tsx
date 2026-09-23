import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarRange, ChevronRight, RefreshCw } from 'lucide-react';
import { ProjectService } from '../services';
import type { ComparisonProject, PortfolioChanges, PortfolioDimensionChange, PortfolioWarningChange } from '../types';
import { useApp } from '../context/AppContext';
import { EmptyState, ErrorState, LoadingState, Modal, RiskBadge, formatCrore, formatDate } from './ui';

type Drilldown =
  | { title: string; subtitle: string; kind: 'projects'; projects: ComparisonProject[]; unit?: 'points' | 'crore' }
  | { title: string; subtitle: string; kind: 'warnings'; warnings: PortfolioWarningChange[] }
  | { title: string; subtitle: string; kind: 'milestones'; milestones: PortfolioChanges['newlyOverdueMilestones']['milestones'] }
  | { title: string; subtitle: string; kind: 'dimension'; dimension: PortfolioDimensionChange }
  | { title: string; subtitle: string; kind: 'dimensionList'; dimensions: PortfolioDimensionChange[] };

function signed(value: number, unit: 'points' | 'crore' = 'points'): string {
  if (unit === 'crore') return `${value >= 0 ? '+' : '−'}${formatCrore(Math.abs(value))}`;
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
}

export function WhatChangedSummary() {
  const { navigate } = useApp();
  const [data, setData] = useState<PortfolioChanges | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setVersion(value => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void ProjectService.getPortfolioChanges(controller.signal)
      .then(setData)
      .catch(loadError => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to compare reporting cycles.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);

  if (loading) return <div className="card p-5"><LoadingState message="Comparing the latest reporting cycles..." /></div>;
  if (error) return <div className="card p-5"><ErrorState title="Monthly comparison unavailable" description={error} onRetry={retry} /></div>;
  if (!data?.comparisonAvailable) {
    return (
      <div className="card briefing-strip px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-navy-50 border border-navy-100 text-navy-600 grid place-items-center shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="section-kicker">Monthly intelligence briefing</div>
            <h2 className="text-sm font-semibold text-navy-900 mt-0.5">What changed since last month?</h2>
            <p className="text-xs text-slate-500 mt-0.5">{data?.headline ?? 'No stored comparison is available.'}</p>
          </div>
          <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right">
            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Status</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">Awaiting next cycle</p>
          </div>
        </div>
      </div>
    );
  }

  const projectMetric = (
    title: string,
    value: number,
    projects: ComparisonProject[],
    tone: string,
    subtitle: string,
    unit: 'points' | 'crore' = 'points',
  ) => (
    <button
      type="button"
      className={`rounded border p-3 text-left hover:shadow-sm transition-shadow ${tone}`}
      onClick={() => setDrilldown({ title, subtitle, kind: 'projects', projects, unit })}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs uppercase tracking-wide font-semibold">{title}</p>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
      </div>
      <p className="text-2xl font-bold tabular-nums mt-1">{value.toLocaleString()}</p>
      <p className="text-2xs opacity-75 mt-0.5">{subtitle}</p>
    </button>
  );

  return (
    <>
      <section className="card" aria-label="What changed since last month">
        <div className="card-header flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-navy-800">What Changed Since Last Month?</h2>
              <span className="badge badge-neutral">Stored snapshots</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{data.headline}</p>
          </div>
          <div className="flex items-center gap-2 text-2xs text-slate-500">
            <span>{data.dataAvailability.comparableProjects} comparable projects</span>
            <button type="button" onClick={retry} className="btn-ghost btn-sm" title="Refresh comparison">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {projectMetric('New High Risk', data.newlyHighRisk.count, data.newlyHighRisk.projects, 'border-orange-200 bg-orange-50 text-orange-800', 'Entered High Risk')}
            {projectMetric('New Critical', data.newlyCritical.count, data.newlyCritical.projects, 'border-red-200 bg-red-50 text-red-800', 'Entered Critical')}
            {projectMetric('Recovered', data.recovered.count, data.recovered.projects, 'border-green-200 bg-green-50 text-green-800', 'Now Watch / Healthy')}
            {projectMetric('Cost Risk Increased', data.significantCostRiskIncrease.count, data.significantCostRiskIncrease.projects, 'border-amber-200 bg-amber-50 text-amber-800', `≥${data.thresholds.significantRiskIncreasePoints} point rise`)}
            {projectMetric('Schedule Risk Increased', data.significantScheduleRiskIncrease.count, data.significantScheduleRiskIncrease.projects, 'border-amber-200 bg-amber-50 text-amber-800', `≥${data.thresholds.significantRiskIncreasePoints} point rise`)}
            <button
              type="button"
              className="rounded border border-red-200 bg-red-50 text-red-800 p-3 text-left hover:shadow-sm"
              onClick={() => setDrilldown({ title: 'Newly Overdue Milestones', subtitle: `${data.newlyOverdueMilestones.projectCount} affected projects`, kind: 'milestones', milestones: data.newlyOverdueMilestones.milestones })}
            >
              <p className="text-2xs uppercase tracking-wide font-semibold">Newly Overdue Milestones</p>
              <p className="text-2xl font-bold mt-1">{data.newlyOverdueMilestones.count}</p>
              <p className="text-2xs opacity-75">{data.newlyOverdueMilestones.projectCount} projects</p>
            </button>
            <button
              type="button"
              className="rounded border border-red-200 bg-red-50 text-red-800 p-3 text-left hover:shadow-sm"
              onClick={() => setDrilldown({ title: 'New Critical Warnings', subtitle: 'First generated in the latest reporting cycle', kind: 'warnings', warnings: data.newCriticalWarnings.warnings })}
            >
              <p className="text-2xs uppercase tracking-wide font-semibold">New Critical Warnings</p>
              <p className="text-2xl font-bold mt-1">{data.newCriticalWarnings.count}</p>
              <p className="text-2xs opacity-75">Generated this cycle</p>
            </button>
            <button
              type="button"
              className="rounded border border-green-200 bg-green-50 text-green-800 p-3 text-left hover:shadow-sm"
              onClick={() => setDrilldown({ title: 'Resolved Warnings', subtitle: 'Resolved in the latest reporting cycle', kind: 'warnings', warnings: data.resolvedWarnings.warnings })}
            >
              <p className="text-2xs uppercase tracking-wide font-semibold">Resolved Warnings</p>
              <p className="text-2xl font-bold mt-1">{data.resolvedWarnings.count}</p>
              <p className="text-2xs opacity-75">Closed this cycle</p>
            </button>
            <button
              type="button"
              className={`rounded border p-3 text-left hover:shadow-sm ${data.capitalExposure.change > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}
              onClick={() => setDrilldown({ title: 'Capital Exposed to High/Critical Risk', subtitle: `${formatCrore(data.capitalExposure.previous)} → ${formatCrore(data.capitalExposure.current)}`, kind: 'projects', projects: data.capitalExposure.projects, unit: 'crore' })}
            >
              <p className="text-2xs uppercase tracking-wide font-semibold">Capital Exposure Change</p>
              <p className="text-lg font-bold mt-1">{signed(data.capitalExposure.change, 'crore')}</p>
              <p className="text-2xs opacity-75">High / Critical portfolio</p>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            <div className="rounded border border-slate-200 p-3">
              <p className="text-xs font-semibold text-navy-800 mb-2">Most Common Emerging Risk Drivers</p>
              {data.emergingRiskDrivers.length ? (
                <div className="space-y-1.5">
                  {data.emergingRiskDrivers.slice(0, 5).map(driver => (
                    <button
                      key={driver.code}
                      type="button"
                      className="w-full flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-slate-50 text-left"
                      onClick={() => setDrilldown({ title: driver.name, subtitle: `Average driver increase ${signed(driver.averageIncrease)}`, kind: 'projects', projects: driver.projects })}
                    >
                      <span className="text-xs text-slate-700">{driver.name}</span>
                      <span className="text-xs font-semibold text-red-600">{driver.projectCount} projects <ChevronRight className="inline w-3 h-3" /></span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-500">No driver increased beyond the configured threshold.</p>}
            </div>
            <div className="rounded border border-slate-200 p-3">
              <p className="text-xs font-semibold text-navy-800 mb-2">Sector / Ministry / State Movement</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  ['Sector', data.dimensions.sectors],
                  ['Ministry', data.dimensions.ministries],
                  ['State', data.dimensions.states],
                ] as const).map(([label, values]) => (
                  <div key={label}>
                    <p className="text-2xs uppercase tracking-wide text-slate-400 mb-1">{label}</p>
                    {values.length ? <>
                      {values.slice(0, 3).map(item => (
                        <button
                          key={item.name}
                          type="button"
                          className="w-full flex justify-between gap-2 py-1 text-left text-xs hover:text-blue-700"
                          onClick={() => setDrilldown({ title: `${label}: ${item.name}`, subtitle: 'High/Critical risk and exposed-capital movement', kind: 'dimension', dimension: item })}
                        >
                          <span className="truncate">{item.name}</span>
                          <span className={item.projectCountChange > 0 ? 'text-red-600' : 'text-green-600'}>{item.projectCountChange > 0 ? '+' : ''}{item.projectCountChange}</span>
                        </button>
                      ))}
                      {values.length > 3 && (
                        <button type="button" className="text-2xs font-semibold text-blue-600 hover:underline mt-1" onClick={() => setDrilldown({ title: `${label} Changes`, subtitle: 'All groups with a change in severe-risk count or exposed capital', kind: 'dimensionList', dimensions: [...values] })}>
                          View all {values.length}
                        </button>
                      )}
                    </> : <p className="text-2xs text-slate-400">No material change</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {data.dataAvailability.excludedProjects > 0 && (
            <p className="text-2xs text-slate-500">
              {data.dataAvailability.excludedProjects} project(s) were excluded because both reporting-cycle snapshots were not available.
            </p>
          )}
        </div>
      </section>

      <Modal isOpen={Boolean(drilldown)} onClose={() => setDrilldown(null)} title={drilldown?.title ?? 'Affected projects'} size="lg">
        {drilldown && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{drilldown.subtitle}</p>
            {drilldown.kind === 'projects' && <ProjectRows projects={drilldown.projects} unit={drilldown.unit} onOpen={projectId => { setDrilldown(null); navigate('project-intelligence', projectId); }} />}
            {drilldown.kind === 'warnings' && <WarningRows warnings={drilldown.warnings} onOpen={projectId => { setDrilldown(null); navigate('project-intelligence', projectId); }} />}
            {drilldown.kind === 'milestones' && <MilestoneRows milestones={drilldown.milestones} onOpen={projectId => { setDrilldown(null); navigate('project-intelligence', projectId); }} />}
            {drilldown.kind === 'dimension' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">High/Critical projects</p><p className="font-semibold mt-1">{drilldown.dimension.previousHighCriticalProjects} → {drilldown.dimension.currentHighCriticalProjects}</p></div>
                  <div className="rounded bg-slate-50 p-3"><p className="text-slate-500">Capital exposure</p><p className="font-semibold mt-1">{formatCrore(drilldown.dimension.previousCapitalExposed)} → {formatCrore(drilldown.dimension.currentCapitalExposed)}</p></div>
                </div>
                <ProjectRows projects={drilldown.dimension.projects} unit="crore" onOpen={projectId => { setDrilldown(null); navigate('project-intelligence', projectId); }} />
              </>
            )}
            {drilldown.kind === 'dimensionList' && (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded max-h-[440px] overflow-y-auto">
                {drilldown.dimensions.map(item => (
                  <div key={item.name} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-xs font-semibold text-navy-800">{item.name}</p><p className="text-2xs text-slate-500 mt-0.5">High/Critical: {item.previousHighCriticalProjects} → {item.currentHighCriticalProjects}</p></div>
                      <p className={`text-xs font-semibold ${item.capitalExposureChange > 0 ? 'text-red-600' : 'text-green-600'}`}>{signed(item.capitalExposureChange, 'crore')}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.projects.map(project => <button key={project.projectId} type="button" className="badge badge-neutral hover:border-blue-300" onClick={() => { setDrilldown(null); navigate('project-intelligence', project.projectId); }}>{project.projectId}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function ProjectRows({ projects, unit = 'points', onOpen }: { projects: ComparisonProject[]; unit?: 'points' | 'crore'; onOpen: (projectId: string) => void }) {
  if (!projects.length) return <EmptyState title="No affected projects" description="No project matched this comparison category." />;
  return <div className="divide-y divide-slate-100 border border-slate-200 rounded max-h-[440px] overflow-y-auto">{projects.map(project => (
    <button key={project.projectId} type="button" className="w-full p-3 hover:bg-slate-50 text-left flex items-center justify-between gap-3" onClick={() => onOpen(project.projectId)}>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-navy-800 truncate">{project.projectName}</p>
        <p className="text-2xs text-slate-500">{project.projectId} · {project.ministry} · {project.state}</p>
        <div className="flex items-center gap-1.5 mt-1"><RiskBadge level={project.previousRiskLevel} /><span className="text-slate-400">→</span><RiskBadge level={project.currentRiskLevel} /></div>
      </div>
      <div className="text-right shrink-0">
        {project.changeValue !== undefined && <p className={`text-xs font-semibold ${project.changeValue > 0 ? 'text-red-600' : 'text-green-600'}`}>{signed(project.changeValue, unit)}</p>}
        <ChevronRight className="w-4 h-4 text-slate-400 ml-auto mt-1" />
      </div>
    </button>
  ))}</div>;
}

function WarningRows({ warnings, onOpen }: { warnings: PortfolioWarningChange[]; onOpen: (projectId: string) => void }) {
  if (!warnings.length) return <EmptyState title="No warnings" description="No warning matched this reporting-cycle category." />;
  return <div className="divide-y divide-slate-100 border border-slate-200 rounded">{warnings.map(warning => (
    <button key={warning.warningId} type="button" className="w-full p-3 hover:bg-slate-50 text-left" onClick={() => onOpen(warning.projectId)}>
      <div className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-red-600 shrink-0" /><div><p className="text-xs font-semibold text-navy-800">{warning.title}</p><p className="text-2xs text-slate-500 mt-0.5">{warning.projectId} · {warning.projectName} · {warning.resolvedAt ? `Resolved ${formatDate(warning.resolvedAt)}` : `Generated ${formatDate(warning.firstDetectedAt)}`}</p></div></div>
    </button>
  ))}</div>;
}

function MilestoneRows({ milestones, onOpen }: { milestones: PortfolioChanges['newlyOverdueMilestones']['milestones']; onOpen: (projectId: string) => void }) {
  if (!milestones.length) return <EmptyState title="No newly overdue milestones" description="No milestone crossed its planned date between the two reporting cycles." />;
  return <div className="divide-y divide-slate-100 border border-slate-200 rounded">{milestones.map(milestone => (
    <button key={milestone.milestoneId} type="button" className="w-full p-3 hover:bg-slate-50 text-left" onClick={() => onOpen(milestone.projectId)}>
      <div className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-red-600 shrink-0" /><div><p className="text-xs font-semibold text-navy-800">{milestone.milestoneName}</p><p className="text-2xs text-slate-500 mt-0.5">{milestone.projectId} · {milestone.projectName} · Planned {formatDate(milestone.plannedDate)}</p></div></div>
    </button>
  ))}</div>;
}
