# Evidence Chain

`GET /api/evidence/projects/{project_id}` returns traceable evidence chains for the project's current risk snapshot, latest genuine cost/schedule predictions visible to the caller, and persisted High/Critical warnings.

Every chain follows the same stages:

1. `source_data`
2. `derived_signal`
3. `prediction`
4. `explanation`
5. `warning`
6. `intervention`

## Provenance rules

- Source values come from `project_monthly_updates`, the prediction's persisted `feature_snapshot`, or milestone records.
- Derived values are deterministic calculations. Their response values include the formula, source record ID, and reporting timestamp.
- Model values come from persisted non-synthetic `predictions` and registered `model_versions`.
- Numerical explanation values come from persisted SHAP output or deterministic rule triggers. No LLM is called.
- Warnings come from stored `warnings` records and retain their trigger rule, warning-engine version, timestamp, and evidence.
- Recommendations come from `warnings.recommended_action`; created actions come only from warning-linked `interventions`.

Missing records are returned as explicit empty stages or response-level `omissions`. The service never substitutes frontend mock data or generates a plausible value.

## Deterministic signals

The current implementation exposes these calculations when their inputs exist:

| Signal | Formula |
| --- | --- |
| Physical progress variance | `physical_progress - planned_progress` |
| Cost escalation | `(revised_cost - approved_cost) / approved_cost * 100` |
| Expenditure/progress mismatch | `financial_progress - physical_progress` |
| Milestone overdue days | `reporting_month - planned_date` while incomplete at reporting month |

## Authorization

The endpoint requires an active authenticated profile. PostgreSQL RLS continues to govern every underlying table. For example, an Analyst can inspect prediction evidence but cannot read created intervention records; that omission is stated in the response. This prevents the evidence API from becoming an authorization bypass.
