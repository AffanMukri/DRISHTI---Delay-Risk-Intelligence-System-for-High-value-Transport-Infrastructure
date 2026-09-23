import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppRole } from '../auth/authorization';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { ProjectService } from '../services';
import type {
  Intervention,
  InterventionCreateInput,
  InterventionUpdateInput,
  PortfolioSummary,
  Project,
  RiskAssessment,
  Warning,
  WarningUpdateInput,
} from '../types';

interface PragatiDataValue {
  projects: Project[];
  warnings: Warning[];
  interventions: Intervention[];
  risks: RiskAssessment[];
  portfolioSummary: PortfolioSummary;
  reload: () => void;
  acknowledgeWarning: (id: string) => Promise<Warning>;
  updateWarning: (id: string, input: WarningUpdateInput) => Promise<Warning>;
  createIntervention: (input: InterventionCreateInput) => Promise<Intervention>;
  updateIntervention: (id: string, input: InterventionUpdateInput) => Promise<Intervention>;
}

const PragatiDataContext = createContext<PragatiDataValue | null>(null);

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected data service error occurred.';
}

export function PragatiDataProvider({ children, role }: { children: React.ReactNode; role: AppRole }) {
  const [data, setData] = useState<Omit<PragatiDataValue, 'reload' | 'acknowledgeWarning' | 'updateWarning' | 'createIntervention' | 'updateIntervention'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const requestSequence = useRef(0);

  const reload = useCallback(() => setLoadVersion(version => version + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const projectsResult = await ProjectService.getProjects({}, controller.signal);
        const canViewInterventions = role !== 'analyst';
        const [portfolioSummary, warnings, interventions] = await Promise.all([
          ProjectService.getPortfolioSummary(controller.signal),
          ProjectService.getWarnings(controller.signal),
          canViewInterventions ? ProjectService.getInterventions(controller.signal) : Promise.resolve([]),
        ]);
        if (sequence !== requestSequence.current) return;
        const projects = projectsResult.data;
        setData({
          projects,
          warnings,
          interventions,
          risks: projects.map(project => project.riskAssessment),
          portfolioSummary,
        });
      } catch (loadError) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setError(messageFrom(loadError));
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [loadVersion, role]);

  const acknowledgeWarning = useCallback(async (id: string) => {
    const updated = await ProjectService.acknowledgeWarning(id);
    setData(current => current ? {
      ...current,
      warnings: current.warnings.map(warning => warning.id === id ? updated : warning),
    } : current);
    return updated;
  }, []);

  const updateWarning = useCallback(async (id: string, input: WarningUpdateInput) => {
    const updated = await ProjectService.updateWarning(id, input);
    setData(current => current ? {
      ...current,
      warnings: current.warnings.map(warning => warning.id === id ? updated : warning),
    } : current);
    return updated;
  }, []);

  const createIntervention = useCallback(async (input: InterventionCreateInput) => {
    const created = await ProjectService.createIntervention(input);
    setData(current => current ? { ...current, interventions: [created, ...current.interventions] } : current);
    return created;
  }, []);

  const updateIntervention = useCallback(async (id: string, input: InterventionUpdateInput) => {
    const updated = await ProjectService.updateIntervention(id, input);
    setData(current => current ? {
      ...current,
      interventions: current.interventions.map(intervention => intervention.id === id ? updated : intervention),
    } : current);
    return updated;
  }, []);

  const value = useMemo<PragatiDataValue | null>(() => data ? {
    ...data,
    reload,
    acknowledgeWarning,
    updateWarning,
    createIntervention,
    updateIntervention,
  } : null, [data, reload, acknowledgeWarning, updateWarning, createIntervention, updateIntervention]);

  if (loading && !value) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><LoadingState message="Loading DRISHTI portfolio data..." /></div>;
  }
  if (error && !value) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="card max-w-lg w-full"><ErrorState description={error} onRetry={reload} /></div></div>;
  }
  if (!value || value.projects.length === 0) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="card max-w-lg w-full"><EmptyState title="No project data available" description="The API returned an empty project portfolio." /></div></div>;
  }

  return <PragatiDataContext.Provider value={value}>{children}</PragatiDataContext.Provider>;
}

export function usePragatiData(): PragatiDataValue {
  const context = useContext(PragatiDataContext);
  if (!context) throw new Error('usePragatiData must be used within PragatiDataProvider');
  return context;
}
