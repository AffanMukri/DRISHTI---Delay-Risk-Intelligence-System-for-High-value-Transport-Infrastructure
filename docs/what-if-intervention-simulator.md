# What-If Intervention Simulator

The simulator compares a project's current model feature snapshot with a temporary intervention scenario. It runs the same active, checksum-validated cost and schedule model artifacts for both sides of the comparison.

Every result is labelled:

> Scenario/model estimate - not a guaranteed project outcome.

## API

- `GET /api/predictions/what-if/{project_id}` returns current values and the scenario-variable catalog supported by the active model feature schemas.
- `POST /api/predictions/what-if/{project_id}` accepts `{ "changes": { ... }, "assumptionNote": "..." }` and returns BEFORE versus SCENARIO outcomes.

Both endpoints require an active Administrator, Executive, or Analyst profile. Monitoring Officers do not have the `view_predictions` permission and are rejected server-side.

## Supported variables

The server exposes a variable only when its mapped features occur in an active trained model artifact:

| Scenario variable | Model features affected |
| --- | --- |
| Physical progress | `physical_progress`, recalculated `progress_variance` |
| Planned progress | `planned_progress`, recalculated `progress_variance` |
| Planned monthly progress velocity | `monthly_progress_velocity` |
| Land acquisition progress | `land_acquisition_progress` |
| Milestone completion | `milestone_completion_pct` |
| Milestone delay share | `milestone_slippage_pct`, `milestone_delay_pct` |
| Open issue count | `issue_count` |
| Contract status | `contract_status` using normalized, restricted categories |
| Clearance status | `clearance_risk_status` plus consistent completion/pending features |

`resource_availability` is explicitly reported as unsupported because it is not currently present in either trained model. The free-text intervention note is provenance for the user and never becomes a model feature.

Unknown request fields are rejected by schema validation. The service also checks requested variables against the loaded artifact feature lists before inference.

## Calculation and explanation

For each request the backend:

1. loads the current cost and schedule inference vectors;
2. loads and verifies the active model artifacts;
3. runs baseline cost and schedule inference;
4. applies temporary supported values and derived consistency changes;
5. reruns both models;
6. recomputes the transparent hybrid risk score for baseline and scenario; and
7. compares output deltas and SHAP feature-contribution deltas where SHAP is available.

The risk comparison uses the existing configured hybrid-risk ensemble. No scenario result is inserted into `projects`, `project_monthly_updates`, `predictions`, `project_risks`, warnings, or interventions. Responses include `persistsChanges: false`.
