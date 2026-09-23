import { ArrowDownRight, ArrowUpRight, BrainCircuit, History, Scale } from 'lucide-react';
import type { FeatureContribution, PredictionExplanation } from '../types';

function displayValue(value: unknown, unit?: string): string {
  if (value === null || value === undefined || value === '') return 'Not reported';
  if (typeof value !== 'number') return String(value);
  const formatted = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  if (unit === 'percent') return `${formatted}%`;
  if (unit === 'percentage_points') return `${formatted} pp`;
  if (unit === 'percentage_points_per_month') return `${formatted} pp/month`;
  if (unit === 'days') return `${formatted} days`;
  if (unit === 'crore_inr') return `₹${formatted} Cr`;
  return formatted;
}

function contributionValue(driver: FeatureContribution): string {
  const prefix = driver.contribution > 0 ? '+' : '';
  const suffix = driver.contributionUnit === 'days' ? ' days' : ' pp';
  return `${prefix}${driver.contribution.toFixed(1)}${suffix}`;
}

function DriverRow({ driver, maximum }: { driver: FeatureContribution; maximum: number }) {
  const riskIncreasing = driver.direction === 'risk_increasing';
  return (
    <div className="py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-800 truncate">{driver.featureLabel}</p>
          <p className="text-2xs text-slate-500">Observed: {displayValue(driver.actualValue, driver.featureUnit)}</p>
        </div>
        <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${riskIncreasing ? 'text-red-600' : 'text-green-700'}`}>
          {contributionValue(driver)}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded mt-1.5 overflow-hidden">
        <div
          className={`h-full rounded ${riskIncreasing ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${Math.max(4, Math.abs(driver.contribution) / maximum * 100)}%` }}
        />
      </div>
      <p className="text-2xs text-slate-500 mt-1.5 leading-relaxed">{driver.humanExplanation}</p>
    </div>
  );
}

export function PredictionExplanationPanel({ explanation }: { explanation: PredictionExplanation }) {
  if (!explanation.ml.available) {
    return (
      <div className="p-3 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
        <strong>ML explanation unavailable:</strong> {explanation.ml.reason || 'No compatible registered model explanation was returned.'}
      </div>
    );
  }

  const positive = explanation.ml.positiveDrivers.slice(0, 3);
  const protective = explanation.ml.protectiveDrivers.slice(0, 2);
  const maximum = Math.max(1, ...positive.concat(protective).map(driver => Math.abs(driver.contribution)));

  return (
    <div className="space-y-4">
      <div className="border border-blue-200 rounded bg-blue-50/40 overflow-hidden">
        <div className="px-3 py-2.5 border-b border-blue-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-blue-700" />
            <div>
              <p className="text-xs font-semibold text-blue-950">ML explanation</p>
              <p className="text-2xs text-blue-700">SHAP · {explanation.ml.explainer} · {explanation.ml.targetLabel}</p>
            </div>
          </div>
          <span className="badge badge-info">Model {explanation.ml.modelVersion}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-blue-100 bg-white px-3">
          <div className="md:pr-3">
            <p className="text-2xs uppercase tracking-wide font-semibold text-red-600 pt-3 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Strongest risk drivers
            </p>
            {positive.length ? positive.map(driver => <DriverRow key={driver.feature} driver={driver} maximum={maximum} />) : <p className="text-xs text-slate-500 py-3">No positive SHAP contributions.</p>}
          </div>
          <div className="md:pl-3">
            <p className="text-2xs uppercase tracking-wide font-semibold text-green-700 pt-3 flex items-center gap-1">
              <ArrowDownRight className="w-3 h-3" /> Protective drivers
            </p>
            {protective.length ? protective.map(driver => <DriverRow key={driver.feature} driver={driver} maximum={maximum} />) : <p className="text-xs text-slate-500 py-3">No negative SHAP contributions.</p>}
          </div>
        </div>
        <p className="px-3 py-2 text-2xs text-slate-500 border-t border-blue-100 bg-blue-50/40">
          Contributions are SHAP values in {explanation.ml.outputUnit?.replaceAll('_', ' ')}. Text is template-generated; no LLM assigns importance.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded border border-amber-200 bg-amber-50/50">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><Scale className="w-3.5 h-3.5" /> Deterministic rule triggers</p>
          <div className="mt-2 space-y-2">
            {explanation.rules.triggers.slice(0, 3).map(trigger => (
              <div key={trigger.ruleId} className="text-2xs text-slate-700">
                <strong>{trigger.featureLabel}:</strong> {trigger.explanation} <span className="text-slate-500">({displayValue(trigger.actualValue, trigger.unit)})</span>
              </div>
            ))}
            {!explanation.rules.triggers.length && <p className="text-2xs text-slate-500">No configured deterministic trigger fired.</p>}
          </div>
        </div>

        <div className="p-3 rounded border border-violet-200 bg-violet-50/50">
          <p className="text-xs font-semibold text-violet-900 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historical comparison</p>
          <p className="text-2xs text-violet-700 mt-0.5">{explanation.historical.cohort} · n={explanation.historical.cohortSize}</p>
          <div className="mt-2 space-y-2">
            {explanation.historical.comparisons.slice(0, 3).map(comparison => (
              <p key={comparison.feature} className="text-2xs text-slate-700 leading-relaxed">{comparison.explanation}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
