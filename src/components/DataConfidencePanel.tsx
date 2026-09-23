import { AlertTriangle, CheckCircle2, Database, Info } from 'lucide-react';
import type { DataConfidence } from '../types';
import { EmptyState, ErrorState, LoadingState, ProgressBar, formatDate } from './ui';

interface DataConfidencePanelProps {
  confidence: DataConfidence | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const ratingStyles: Record<DataConfidence['rating'], string> = {
  High: 'text-green-700 bg-green-50 border-green-200',
  Moderate: 'text-blue-700 bg-blue-50 border-blue-200',
  Low: 'text-amber-700 bg-amber-50 border-amber-200',
  'Very Low': 'text-red-700 bg-red-50 border-red-200',
};

function fieldLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function DataConfidencePanel({ confidence, loading = false, error, onRetry }: DataConfidencePanelProps) {
  if (loading) return <LoadingState message="Assessing input-data confidence..." />;
  if (error) return <ErrorState title="Data confidence unavailable" description={error} onRetry={onRetry} />;
  if (!confidence) {
    return (
      <EmptyState
        title="Data confidence unavailable"
        description="No database-backed confidence assessment is available. A score is not generated from mock data."
      />
    );
  }

  const scoreColor = confidence.overallScore >= 85
    ? 'text-green-700'
    : confidence.overallScore >= 70
      ? 'text-blue-700'
      : confidence.overallScore >= 50
        ? 'text-amber-700'
        : 'text-red-700';

  return (
    <div className="space-y-5">
      <div className="rounded border border-blue-200 bg-blue-50 p-3 flex items-start gap-2 text-xs text-blue-800">
        <Database className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Input Data Confidence — separate from Prediction Confidence</p>
          <p className="text-slate-600 mt-0.5">This deterministic score measures completeness, freshness, coverage, and validation evidence. It is not an ML probability or prediction certainty.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded border border-slate-200 bg-slate-50 p-5 flex flex-col justify-center items-center text-center">
          <p className="text-2xs uppercase tracking-wide text-slate-500">Overall Data Confidence</p>
          <p className={`text-4xl font-bold tabular-nums mt-2 ${scoreColor}`}>{confidence.overallScore.toFixed(1)}</p>
          <p className="text-xs text-slate-500">/100</p>
          <span className={`mt-2 rounded border px-2 py-1 text-xs font-semibold ${ratingStyles[confidence.rating]}`}>{confidence.rating}</span>
          <p className="text-2xs text-slate-400 mt-3">As of {formatDate(confidence.asOfDate)}</p>
          <p className="text-2xs text-slate-400">Latest report: {confidence.latestReportingMonth ? formatDate(confidence.latestReportingMonth) : 'Missing'}</p>
        </div>

        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {confidence.components.map(component => (
            <div key={component.code} className="rounded border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700">{component.label}</p>
                  <p className="text-2xs text-slate-400">Weight {(component.weight * 100).toFixed(0)}% · contribution {component.weightedScore.toFixed(1)}</p>
                </div>
                <span className={`text-sm font-bold tabular-nums ${component.score >= 85 ? 'text-green-600' : component.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{component.score.toFixed(0)}</span>
              </div>
              <ProgressBar
                value={component.score}
                color={component.score >= 85 ? 'bg-green-500' : component.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}
                height="h-1.5"
              />
              {component.reasons[0] && <p className="text-2xs text-slate-500 mt-2">{component.reasons[0]}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded border border-slate-200 p-4 lg:col-span-2">
          <p className="text-xs font-semibold text-navy-800 mb-2">Why confidence is reduced</p>
          {confidence.reasonsLoweringConfidence.length ? (
            <div className="space-y-2">
              {confidence.reasonsLoweringConfidence.map((reason, index) => (
                <div key={`${reason}-${index}`} className="flex items-start gap-2 text-xs text-slate-600">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-green-700"><CheckCircle2 className="w-4 h-4" />All configured data-quality checks received full credit.</div>
          )}
        </div>

        <div className="rounded border border-slate-200 p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-700">Missing fields</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {confidence.missingFields.length
                ? confidence.missingFields.map(field => <span key={field} className="badge badge-watch">{fieldLabel(field)}</span>)
                : <span className="text-xs text-green-700">None identified</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700">Stale fields</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {confidence.staleFields.length
                ? confidence.staleFields.map(field => <span key={field} className="badge badge-critical">{fieldLabel(field)}</span>)
                : <span className="text-xs text-green-700">None identified</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-2xs text-slate-500">
        <p className="font-semibold text-slate-700 flex items-center gap-1"><Info className="w-3.5 h-3.5" />Formula provenance</p>
        <p className="mt-1">{confidence.configuration.formulaVersion} · Fresh ≤{confidence.configuration.freshDays} days · Stale ≥{confidence.configuration.staleDays} days · History target {confidence.configuration.historyTargetMonths} months.</p>
        <p className="mt-0.5">Anomaly penalty: {confidence.configuration.anomalyPenalty} points; unresolved validation issue penalty: {confidence.configuration.validationIssuePenalty} points within the validation component.</p>
      </div>
    </div>
  );
}
