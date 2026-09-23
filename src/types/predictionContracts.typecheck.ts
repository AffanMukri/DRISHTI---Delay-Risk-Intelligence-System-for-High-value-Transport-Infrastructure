import type {
  CostOverrunPrediction,
  EvidenceSubjectType,
  PredictionExplanation,
  ScheduleOverrunPrediction,
} from './index';

// Compile-time assertions for the Project Intelligence contract. This file
// emits no JavaScript and prevents the evidence/explanation surface from
// silently drifting away from the API prediction types.
type Assert<T extends true> = T;
type HasExplanation<T> = T extends { explanation: PredictionExplanation } ? true : false;

type CostPredictionHasExplanation = Assert<HasExplanation<CostOverrunPrediction>>;
type SchedulePredictionHasExplanation = Assert<HasExplanation<ScheduleOverrunPrediction>>;
type EvidenceSubjectIsSupported = Assert<
  EvidenceSubjectType extends 'risk' | 'prediction' | 'warning' ? true : false
>;

export type ProjectIntelligenceContractChecks =
  | CostPredictionHasExplanation
  | SchedulePredictionHasExplanation
  | EvidenceSubjectIsSupported;
