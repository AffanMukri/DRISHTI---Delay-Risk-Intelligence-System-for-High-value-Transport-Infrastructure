// =============================================================================
// DHRISTI — Deterministic Risk Calculations
//
// PROTOTYPE DEMONSTRATION FORMULA — Not a Production Risk Model.
// All scores are computed transparently from project data using weighted
// arithmetic formulas. No machine learning or AI inference is involved.
//
// Formula:
//   Risk Score = ProgressFactor×25 + CostFactor×25 + ScheduleFactor×25
//              + MilestoneFactor×15 + ExpenditureFactor×10
// =============================================================================

import type { Project, RiskAssessment, RiskDriver } from '../types';

/** Clamp a value between 0 and 100 */
const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/**
 * Progress Factor (0–100):
 * Based on gap between expected and actual physical progress.
 */
export function calcProgressFactor(actual: number, expected: number): number {
  const gap = expected - actual; // positive = behind schedule
  if (gap <= 0) return 0;        // ahead or on track
  if (gap >= 30) return 100;
  return clamp(gap * (100 / 30));
}

/**
 * Cost Factor (0–100):
 * Based on cost escalation percentage.
 */
export function calcCostFactor(approved: number, revised: number): number {
  if (approved <= 0) return 0;
  const pct = ((revised - approved) / approved) * 100;
  if (pct <= 0) return 0;
  if (pct >= 50) return 100;
  return clamp(pct * 2);
}

/**
 * Schedule Factor (0–100):
 * Based on delay in days.
 */
export function calcScheduleFactor(delayDays: number): number {
  if (delayDays <= 0) return 0;
  if (delayDays >= 365) return 100;
  return clamp(delayDays / 3.65);
}

/**
 * Milestone Factor (0–100):
 * Based on ratio of delayed/at-risk milestones.
 */
export function calcMilestoneFactor(milestones: Project['milestones']): number {
  if (!milestones.length) return 50;
  const troubled = milestones.filter(
    m => m.status === 'Delayed' || m.status === 'At Risk'
  ).length;
  return clamp((troubled / milestones.length) * 100);
}

/**
 * Expenditure Factor (0–100):
 * Detects mismatch between financial progress and physical progress.
 * High expenditure with low physical progress = high risk.
 */
export function calcExpenditureFactor(
  financialProgress: number,
  physicalProgress: number
): number {
  const mismatch = financialProgress - physicalProgress;
  if (mismatch <= 0) return 0; // spending less than physical — acceptable
  if (mismatch >= 30) return 100;
  return clamp(mismatch * (100 / 30));
}

/**
 * MAIN: Compute full risk assessment for a project.
 *
 * PROTOTYPE DEMONSTRATION FORMULA — Not a Production Risk Model.
 * Weights:
 *   Progress Variance  25%
 *   Cost Escalation    25%
 *   Schedule Delay     25%
 *   Milestone Status   15%
 *   Expenditure Mismatch 10%
 */
export function computeRiskAssessment(project: Omit<Project, 'riskAssessment'>): RiskAssessment {
  const pf = calcProgressFactor(project.physicalProgress, project.expectedProgress);
  const cf = calcCostFactor(project.approvedCost, project.revisedCost);
  const sf = calcScheduleFactor(project.delayDays);
  const mf = calcMilestoneFactor(project.milestones);
  const ef = calcExpenditureFactor(project.financialProgress, project.physicalProgress);

  const overallScore = clamp(
    Math.round(pf * 0.25 + cf * 0.25 + sf * 0.25 + mf * 0.15 + ef * 0.10)
  );

  const riskLevel: RiskAssessment['riskLevel'] =
    overallScore >= 80 ? 'Critical' :
    overallScore >= 60 ? 'High Risk' :
    overallScore >= 35 ? 'Watch' : 'Healthy';

  const costOverrunPct = project.approvedCost > 0
    ? ((project.revisedCost - project.approvedCost) / project.approvedCost) * 100 : 0;

  const getImpact = (val: number): 'High' | 'Medium' | 'Low' =>
    val >= 60 ? 'High' : val >= 30 ? 'Medium' : 'Low';

  const drivers: RiskDriver[] = [
    {
      name: 'Progress Variance',
      impact: getImpact(pf),
      value: Math.round(pf),
      description: `Physical progress (${project.physicalProgress}%) is ${(project.expectedProgress - project.physicalProgress).toFixed(1)}pp below expected (${project.expectedProgress}%)`,
    },
    {
      name: 'Cost Escalation',
      impact: getImpact(cf),
      value: Math.round(cf),
      description: `Revised cost ₹${project.revisedCost.toLocaleString()} Cr vs approved ₹${project.approvedCost.toLocaleString()} Cr (+${costOverrunPct.toFixed(1)}%)`,
    },
    {
      name: 'Schedule Delay',
      impact: getImpact(sf),
      value: Math.round(sf),
      description: `Project is delayed by ${project.delayDays} days beyond original completion date`,
    },
    {
      name: 'Milestone Slippage',
      impact: getImpact(mf),
      value: Math.round(mf),
      description: `${project.milestones.filter(m => m.status === 'Delayed' || m.status === 'At Risk').length} of ${project.milestones.length} milestones are delayed or at risk`,
    },
    {
      name: 'Expenditure–Progress Mismatch',
      impact: getImpact(ef),
      value: Math.round(ef),
      description: `Financial progress (${project.financialProgress}%) vs physical progress (${project.physicalProgress}%) — gap of ${(project.financialProgress - project.physicalProgress).toFixed(1)}pp`,
    },
  ].sort((a, b) => b.value - a.value);

  return {
    overallScore,
    riskLevel,
    costOverrunRisk: clamp(Math.round(cf * 0.6 + pf * 0.2 + sf * 0.2)),
    scheduleDelayRisk: clamp(Math.round(sf * 0.6 + mf * 0.3 + pf * 0.1)),
    implementationRisk: clamp(Math.round(pf * 0.4 + mf * 0.35 + ef * 0.25)),
    progressFactor: Math.round(pf),
    costFactor: Math.round(cf),
    scheduleFactor: Math.round(sf),
    milestoneFactor: Math.round(mf),
    expenditureFactor: Math.round(ef),
    methodology: 'deterministic-risk-v1',
    components: {
      rule: {
        available: true,
        overallScore,
        costRisk: clamp(Math.round(cf * 0.6 + pf * 0.2 + sf * 0.2)),
        scheduleRisk: clamp(Math.round(sf * 0.6 + mf * 0.3 + pf * 0.1)),
        implementationRisk: clamp(Math.round(pf * 0.4 + mf * 0.35 + ef * 0.25)),
        factors: { progress: Math.round(pf), cost: Math.round(cf), schedule: Math.round(sf), milestone: Math.round(mf), expenditure: Math.round(ef) },
        provenance: { type: 'deterministic_rules', version: 'deterministic-risk-v1' },
      },
      statistical: { available: false, reason: 'Historical scoring is unavailable in mock mode.', provenance: { type: 'historical_peer_percentile' } },
      ml: { available: false, reason: 'Genuine trained-model outputs are unavailable in mock mode.', provenance: { type: 'trained_model_outputs' } },
    },
    ensemble: {},
    provenance: { ruleVersion: 'deterministic-risk-v1', syntheticProject: true },
    drivers,
  };
}

export function riskLevelFromScore(score: number): 'Healthy' | 'Watch' | 'High Risk' | 'Critical' {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High Risk';
  if (score >= 35) return 'Watch';
  return 'Healthy';
}

export function costOverrunPct(approved: number, revised: number): number {
  if (approved <= 0) return 0;
  return ((revised - approved) / approved) * 100;
}
