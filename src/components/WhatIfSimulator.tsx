import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Info, RotateCcw, Sparkles } from 'lucide-react';
import type { ScenarioConfiguration, ScenarioOutcome, ScenarioSimulation } from '../types';
import { ScenarioService } from '../services/scenarioService';
import {
  buildMockScenarioConfiguration,
  simulateMockScenario,
} from '../services/mockProjectIntelligence';
import { ErrorState, LoadingState, formatCrore, formatDate } from './ui';

interface WhatIfSimulatorProps {
  projectId: string;
  backendEnabled: boolean;
}

const riskLabels = {
  healthy: 'Healthy',
  watch: 'Watch',
  high_risk: 'High Risk',
  critical: 'Critical',
};

function camelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value == null || value === '') return 'Not reported';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return String(value).replaceAll('_', ' ');
}

function OutcomeColumn({ title, outcome, accent, demo = false }: { title: string; outcome: ScenarioOutcome; accent: string; demo?: boolean }) {
  return (
    <div className={`rounded border ${accent} overflow-hidden`}>
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <p className="text-xs font-bold tracking-wide text-slate-700">{title}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-0 divide-y sm:divide-y-0 sm:divide-x lg:divide-x-0 lg:divide-y divide-slate-200">
        <div className="p-4">
          <p className="text-2xs uppercase tracking-wide text-slate-500">{demo ? 'Deterministic risk' : 'Hybrid risk'}</p>
          <p className="text-2xl font-bold text-navy-800 tabular-nums mt-1">{outcome.risk.overallScore.toFixed(0)}/100</p>
          <p className="text-xs text-slate-500">{riskLabels[outcome.risk.riskLevel]}</p>
        </div>
        <div className="p-4">
          <p className="text-2xs uppercase tracking-wide text-slate-500">{demo ? 'Estimated delay' : 'Predicted delay'}</p>
          <p className="text-2xl font-bold text-navy-800 tabular-nums mt-1">{outcome.schedule.expectedDelayDays.toLocaleString()} days</p>
          <p className="text-xs text-slate-500">
            {outcome.schedule.scheduleOverrunProbability == null ? 'Probability unavailable' : `${(outcome.schedule.scheduleOverrunProbability * 100).toFixed(1)}% overrun probability`}
          </p>
          <p className="text-2xs text-slate-400">Completion {formatDate(outcome.schedule.predictedCompletionDate)}</p>
        </div>
        <div className="p-4">
          <p className="text-2xs uppercase tracking-wide text-slate-500">{demo ? 'Estimated cost escalation' : 'Predicted cost escalation'}</p>
          <p className="text-xl font-bold text-navy-800 tabular-nums mt-1">{formatCrore(outcome.cost.predictedEscalationAmount)}</p>
          <p className="text-xs text-slate-500">{outcome.cost.predictedEscalationPercentage >= 0 ? '+' : ''}{outcome.cost.predictedEscalationPercentage.toFixed(1)}%</p>
          <p className="text-2xs text-slate-400">{outcome.cost.significantOverrunProbability == null ? 'Probability unavailable' : `${(outcome.cost.significantOverrunProbability * 100).toFixed(1)}% significant-overrun probability`}</p>
        </div>
      </div>
    </div>
  );
}

export function WhatIfSimulator({ projectId, backendEnabled }: WhatIfSimulatorProps) {
  const [configuration, setConfiguration] = useState<ScenarioConfiguration | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [assumptionNote, setAssumptionNote] = useState('');
  const [result, setResult] = useState<ScenarioSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setConfiguration(null);
    setResult(null);
    setError(null);
    if (!backendEnabled) {
      const config = buildMockScenarioConfiguration(projectId);
      setConfiguration(config);
      setValues(Object.fromEntries(config.supportedVariables.map(variable => [
        variable.code,
        variable.currentValue == null ? '' : String(variable.currentValue),
      ])));
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void ScenarioService.configuration(projectId, controller.signal)
      .then(config => {
        setConfiguration(config);
        setValues(Object.fromEntries(config.supportedVariables.map(variable => [
          variable.code,
          variable.currentValue == null ? '' : String(variable.currentValue),
        ])));
      })
      .catch(loadError => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load simulator inputs.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, backendEnabled, version]);

  const changes = useMemo(() => {
    if (!configuration) return {};
    return Object.fromEntries(configuration.supportedVariables.flatMap(variable => {
      const raw = values[variable.code] ?? '';
      if (raw === '') return [];
      const scenarioValue = variable.inputType === 'select' ? raw : Number(raw);
      if (scenarioValue === variable.currentValue || String(scenarioValue) === String(variable.currentValue ?? '')) return [];
      return [[camelCase(variable.code), scenarioValue]];
    }));
  }, [configuration, values]);

  const reset = () => {
    if (!configuration) return;
    setValues(Object.fromEntries(configuration.supportedVariables.map(variable => [
      variable.code,
      variable.currentValue == null ? '' : String(variable.currentValue),
    ])));
    setAssumptionNote('');
    setResult(null);
    setError(null);
  };

  const simulate = async () => {
    if (!Object.keys(changes).length) return;
    setRunning(true);
    setError(null);
    try {
      setResult(backendEnabled
        ? await ScenarioService.simulate(projectId, changes, assumptionNote)
        : simulateMockScenario(projectId, changes, assumptionNote));
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : 'The scenario could not be calculated.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingState message="Loading active-model scenario inputs..." />;
  if (error && !configuration) return <ErrorState title="Simulator unavailable" description={error} onRetry={() => setVersion(value => value + 1)} />;
  if (!configuration) return null;

  return (
    <div className="space-y-5">
      <div className="rounded border border-purple-200 bg-purple-50 p-3 flex items-start gap-2 text-xs text-purple-900">
        <FlaskConical className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Temporary {configuration.methodology === 'deterministic_demo' ? 'demonstration' : 'model'} scenario — no project data is updated</p>
          <p className="text-slate-600 mt-0.5">
            {configuration.methodology === 'deterministic_demo'
              ? 'Demo mode applies documented deterministic equations to supported project fields. It does not run or imitate a trained ML model.'
              : 'Only variables used by the active trained cost or schedule model are available. Baseline and scenario use the same model versions.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configuration.supportedVariables.map(variable => (
          <label key={variable.code} className="block rounded border border-slate-200 p-3">
            <span className="text-xs font-semibold text-slate-700">{variable.label}</span>
            <span className="block text-2xs text-slate-500 mt-0.5 min-h-8">{variable.description}</span>
            {variable.inputType === 'select' ? (
              <select
                className="w-full mt-2 rounded border border-slate-300 bg-white px-2.5 py-2 text-xs"
                value={values[variable.code] ?? ''}
                onChange={event => setValues(current => ({ ...current, [variable.code]: event.target.value }))}
              >
                {!variable.options.includes(values[variable.code] ?? '') && (
                  <option value={values[variable.code] ?? ''}>Current: {displayValue(variable.currentValue)}</option>
                )}
                {variable.options.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
              </select>
            ) : (
              <input
                type="number"
                className="w-full mt-2 rounded border border-slate-300 bg-white px-2.5 py-2 text-xs"
                min={variable.minimum}
                max={variable.maximum}
                step={variable.inputType === 'integer' ? 1 : 0.1}
                value={values[variable.code] ?? ''}
                onChange={event => setValues(current => ({ ...current, [variable.code]: event.target.value }))}
              />
            )}
            <span className="block text-2xs text-slate-400 mt-1">Current: {displayValue(variable.currentValue)} · {variable.models.join(' + ')} model</span>
          </label>
        ))}
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700">Planned intervention assumption</span>
        <textarea
          className="w-full mt-1 rounded border border-slate-300 bg-white px-3 py-2 text-xs min-h-20"
          maxLength={1000}
          value={assumptionNote}
          onChange={event => setAssumptionNote(event.target.value)}
          placeholder="Optional note describing the intervention assumptions. This note does not alter model inputs."
        />
      </label>

      {configuration.unsupportedVariables.map(variable => (
        <div key={variable.code} className="rounded border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{variable.label} is unavailable:</strong> {variable.reason}</span>
        </div>
      ))}

      {error && <ErrorState title="Scenario calculation failed" description={error} />}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-2xs text-slate-500">{configuration.methodology === 'deterministic_demo' ? 'Active demo rules' : 'Active models'}: cost {configuration.modelVersions.cost} · schedule {configuration.modelVersions.schedule}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset} disabled={running}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void simulate()} disabled={running || !Object.keys(changes).length}>
            <Sparkles className="w-3.5 h-3.5" /> {running ? 'Running scenario...' : 'Compare scenario'}
          </button>
        </div>
      </div>

      {running && <LoadingState message="Running baseline and scenario inference with the active models..." />}

      {result && !running && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OutcomeColumn title="BEFORE" outcome={result.before} accent="border-slate-300" demo={result.methodology === 'deterministic_demo'} />
            <OutcomeColumn title="SCENARIO" outcome={result.scenario} accent="border-purple-300" demo={result.methodology === 'deterministic_demo'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700 mb-3">Changed variables</p>
              <div className="space-y-2">
                {result.changedVariables.map(variable => (
                  <div key={variable.code} className="flex items-center justify-between gap-3 text-xs border-b border-slate-100 pb-2">
                    <span className="text-slate-600">{variable.label}</span>
                    <span className="font-medium text-slate-800">{displayValue(variable.beforeValue)} → {displayValue(variable.scenarioValue)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700 mb-3">Why the estimates changed</p>
              <div className="space-y-2">
                {result.explanation.summaries.map(summary => <p key={summary} className="text-xs text-slate-600">{summary}</p>)}
                {result.explanation.driverChanges.slice(0, 4).map(driver => (
                  <div key={`${driver.model}-${driver.feature}`} className="text-2xs text-slate-500 border-t border-slate-100 pt-2">
                    <strong className="text-slate-700">{driver.model.toUpperCase()} · {driver.featureLabel}:</strong>{' '}
                    {result.methodology === 'deterministic_demo' ? 'Rule contribution' : 'SHAP contribution'} {driver.contributionChange >= 0 ? '+' : ''}{driver.contributionChange.toFixed(2)} {driver.contributionUnit.replaceAll('_', ' ')}
                  </div>
                ))}
                {!result.explanation.driverChanges.length && <p className="text-2xs text-slate-500">{result.explanation.numericalSource}</p>}
              </div>
            </div>
          </div>

          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <div><strong>{result.disclaimer}</strong> The simulation was not persisted and does not change certified project data, warnings, interventions, risk snapshots, or stored predictions.</div>
          </div>
        </div>
      )}
    </div>
  );
}
