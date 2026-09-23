import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  Database,
  FlaskConical,
  Gauge,
  ShieldCheck,
} from 'lucide-react';
import type { Project } from '../../types';
import { Badge } from '../ui';

interface ModelReadinessDashboardProps {
  projects: Project[];
}

const CANDIDATES = [
  {
    name: 'Cost Overrun Intelligence',
    outputs: 'Overrun probability · predicted final cost',
    baseline: 'Logistic + linear regression',
    challenger: 'Random Forest / gradient boosting',
    features: 13,
  },
  {
    name: 'Schedule Overrun Intelligence',
    outputs: 'Delay probability · expected delay days',
    baseline: 'Logistic + regularized regression',
    challenger: 'Random Forest / gradient boosting',
    features: 15,
  },
] as const;

const POLICY_ROWS = [
  ['Numeric feature drift', 'PSI + KS test', 'PSI ≥ 0.20', '100 recent inferences'],
  ['Categorical feature drift', 'Chi-square / Cramér’s V', 'p < 0.05 + effect size', 'Expected counts ≥ 5'],
  ['Missing-feature change', 'Percentage-point delta', 'Increase ≥ 5 pp', '30 recent inferences'],
  ['Prediction distribution', 'PSI + KS test', 'PSI ≥ 0.20', '100 recent predictions'],
  ['Realized performance', 'MAE, RMSE, R² / F1, AUC', 'Against approved baseline', 'Matured outcomes only'],
] as const;

export default function ModelReadinessDashboard({ projects }: ModelReadinessDashboardProps) {
  const milestoneCount = projects.reduce((sum, project) => sum + project.milestones.length, 0);
  const completedProjects = projects.filter(project => project.status === 'Completed').length;
  const updateFreshness = projects.length
    ? Math.round(projects.filter(project => Number.isFinite(new Date(project.lastUpdated).getTime())).length / projects.length * 100)
    : 0;

  const readinessChecks = [
    { label: 'Canonical project schema', detail: `${projects.length} portfolio records available`, status: 'Ready', tone: 'healthy' as const },
    { label: 'Milestone feature coverage', detail: `${milestoneCount} milestone records available`, status: milestoneCount ? 'Available' : 'Missing', tone: milestoneCount ? 'healthy' as const : 'watch' as const },
    { label: 'Update timestamp coverage', detail: `${updateFreshness}% of project records`, status: updateFreshness >= 90 ? 'Ready' : 'Review', tone: updateFreshness >= 90 ? 'healthy' as const : 'watch' as const },
    { label: 'Historical monthly outcomes', detail: 'Multiple reporting cycles are required for leakage-safe training', status: 'Pending data', tone: 'watch' as const },
    { label: 'Held-out model validation', detail: 'Starts only after defensible outcome labels exist', status: 'Not started', tone: 'neutral' as const },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-teal-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-navy-900 p-2.5 text-white"><FlaskConical className="h-5 w-5" /></span>
            <div>
              <h2 className="text-sm font-bold text-navy-900">Pre-deployment model readiness workspace</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">This page shows the planned registry, validation gates, and monitoring policy using the current demo portfolio. No model is trained or deployed, and no drift or performance statistic below is presented as an observed result.</p>
            </div>
          </div>
          <Badge variant="watch" className="shrink-0">Demonstration readiness data</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4"><Database className="h-4 w-4 text-teal-700" /><p className="mt-2 text-2xl font-bold text-navy-900">{projects.length}</p><p className="text-xs text-slate-500">Project master records</p></div>
        <div className="card p-4"><BarChart3 className="h-4 w-4 text-blue-700" /><p className="mt-2 text-2xl font-bold text-navy-900">{milestoneCount}</p><p className="text-xs text-slate-500">Milestone records available</p></div>
        <div className="card p-4"><Activity className="h-4 w-4 text-amber-600" /><p className="mt-2 text-2xl font-bold text-navy-900">2</p><p className="text-xs text-slate-500">Candidate ML pipelines</p></div>
        <div className="card p-4"><ShieldCheck className="h-4 w-4 text-slate-600" /><p className="mt-2 text-2xl font-bold text-navy-900">0</p><p className="text-xs text-slate-500">Approved deployed models</p></div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="card xl:col-span-7">
          <div className="card-header">
            <div><h2 className="text-sm font-semibold text-navy-800">Candidate Model Registry</h2><p className="mt-0.5 text-2xs text-slate-500">Proposed experiments—not trained artifacts or approved forecasts.</p></div>
            <Badge variant="neutral">Design stage</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {CANDIDATES.map((candidate, index) => (
              <div key={candidate.name} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">M{index + 1}</span>
                    <div><h3 className="text-xs font-bold text-navy-900">{candidate.name}</h3><p className="mt-0.5 text-2xs text-slate-500">{candidate.outputs}</p></div>
                  </div>
                  <Badge variant="watch">Awaiting history</Badge>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded border border-slate-200 bg-slate-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Interpretable baseline</p><p className="mt-1 text-2xs font-medium text-slate-700">{candidate.baseline}</p></div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Challenger</p><p className="mt-1 text-2xs font-medium text-slate-700">{candidate.challenger}</p></div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Candidate features</p><p className="mt-1 text-2xs font-medium text-slate-700">{candidate.features} governed inputs</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card xl:col-span-5">
          <div className="card-header"><div><h2 className="text-sm font-semibold text-navy-800">Training Readiness Gates</h2><p className="mt-0.5 text-2xs text-slate-500">Evidence required before any deployment claim.</p></div></div>
          <div className="card-body space-y-2.5">
            {readinessChecks.map(check => (
              <div key={check.label} className="flex items-start justify-between gap-3 rounded border border-slate-200 p-3">
                <div className="flex items-start gap-2.5">
                  {check.tone === 'healthy' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : check.tone === 'watch' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                  <div><p className="text-xs font-semibold text-slate-800">{check.label}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{check.detail}</p></div>
                </div>
                <Badge variant={check.tone}>{check.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <div><h2 className="text-sm font-semibold text-navy-800">Approved Monitoring Policy Preview</h2><p className="mt-0.5 text-2xs text-slate-500">Methods activate only after a version is registered and minimum sample requirements are satisfied.</p></div>
          <Gauge className="h-4 w-4 text-teal-700" />
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Signal</th><th>Method</th><th>Review threshold</th><th>Minimum evidence</th><th>Current status</th></tr></thead>
            <tbody>{POLICY_ROWS.map(row => <tr key={row[0]}><td className="font-semibold text-navy-900">{row[0]}</td><td>{row[1]}</td><td className="font-mono text-2xs">{row[2]}</td><td>{row[3]}</td><td><Badge variant="neutral">Not calculated</Badge></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-2xs font-bold uppercase tracking-wide text-slate-400">Outcome maturity</p><p className="mt-2 text-sm font-bold text-navy-900">{completedProjects} completed projects</p><p className="mt-1 text-xs leading-5 text-slate-500">Completion alone is not a training label; consistent monthly cost and schedule outcomes are still required.</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-2xs font-bold uppercase tracking-wide text-slate-400">Deployment control</p><p className="mt-2 text-sm font-bold text-navy-900">Human approval required</p><p className="mt-1 text-xs leading-5 text-slate-500">Monitoring never promotes, retires, or retrains a model automatically.</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-2xs font-bold uppercase tracking-wide text-slate-400">Next defensible step</p><p className="mt-2 text-sm font-bold text-navy-900">Accumulate reporting cycles</p><p className="mt-1 text-xs leading-5 text-slate-500">Import validated monthly CUF updates and mature outcome labels before time-aware evaluation.</p></div>
      </div>
    </div>
  );
}
