import { useCallback, useEffect, useState } from 'react';
import { ProjectService } from '../services';
import type { DataConfidence, Prediction, Project, ProjectHistory, RiskTrajectory } from '../types';
import { useAuth } from './useAuth';

interface ProjectDataState {
  project: Project | null;
  history: ProjectHistory | null;
  predictions: Prediction[];
  riskTrajectory: RiskTrajectory | null;
  riskTrajectoryLoading: boolean;
  riskTrajectoryError: string | null;
  dataConfidence: DataConfidence | null;
  dataConfidenceLoading: boolean;
  dataConfidenceError: string | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  retryRiskTrajectory: () => void;
  retryDataConfidence: () => void;
}

export function useProjectData(projectId: string | null): ProjectDataState {
  const { hasPermission } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<ProjectHistory | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [riskTrajectory, setRiskTrajectory] = useState<RiskTrajectory | null>(null);
  const [riskTrajectoryLoading, setRiskTrajectoryLoading] = useState(Boolean(projectId));
  const [riskTrajectoryError, setRiskTrajectoryError] = useState<string | null>(null);
  const [dataConfidence, setDataConfidence] = useState<DataConfidence | null>(null);
  const [dataConfidenceLoading, setDataConfidenceLoading] = useState(Boolean(projectId));
  const [dataConfidenceError, setDataConfidenceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [trajectoryVersion, setTrajectoryVersion] = useState(0);
  const [confidenceVersion, setConfidenceVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  const retryRiskTrajectory = useCallback(() => setTrajectoryVersion(value => value + 1), []);
  const retryDataConfidence = useCallback(() => setConfidenceVersion(value => value + 1), []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setHistory(null);
      setPredictions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      ProjectService.getProject(projectId, controller.signal),
      ProjectService.getProjectHistory(projectId, controller.signal),
      hasPermission('view_predictions')
        ? ProjectService.getPredictions(projectId, controller.signal)
        : Promise.resolve([]),
    ]).then(([nextProject, nextHistory, nextPredictions]) => {
      setProject(nextProject);
      setHistory(nextHistory);
      setPredictions(nextPredictions);
    }).catch(loadError => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Unable to load project intelligence.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [projectId, version, hasPermission]);

  useEffect(() => {
    if (!projectId) {
      setRiskTrajectory(null);
      setRiskTrajectoryLoading(false);
      setRiskTrajectoryError(null);
      return;
    }
    const controller = new AbortController();
    setRiskTrajectoryLoading(true);
    setRiskTrajectoryError(null);
    void ProjectService.getRiskTrajectory(projectId, controller.signal)
      .then(setRiskTrajectory)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setRiskTrajectoryError(loadError instanceof Error ? loadError.message : 'Unable to load the risk trajectory.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRiskTrajectoryLoading(false);
      });
    return () => controller.abort();
  }, [projectId, trajectoryVersion]);

  useEffect(() => {
    if (!projectId) {
      setDataConfidence(null);
      setDataConfidenceLoading(false);
      setDataConfidenceError(null);
      return;
    }
    const controller = new AbortController();
    setDataConfidenceLoading(true);
    setDataConfidenceError(null);
    void ProjectService.getDataConfidence(projectId, controller.signal)
      .then(setDataConfidence)
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setDataConfidenceError(loadError instanceof Error ? loadError.message : 'Unable to assess data confidence.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDataConfidenceLoading(false);
      });
    return () => controller.abort();
  }, [projectId, confidenceVersion]);

  return {
    project,
    history,
    predictions,
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
  };
}
