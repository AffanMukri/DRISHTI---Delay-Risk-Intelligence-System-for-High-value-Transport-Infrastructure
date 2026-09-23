# Prediction explainability

Cost and schedule predictions generated from newly trained PRAGATI-X model artifacts include a structured `explanation` object. Numerical feature importance comes exclusively from SHAP; no LLM generates, changes, ranks, or signs a contribution.

## Explanation layers

- `ml`: SHAP values, registered model/version, explainer type, baseline, model output, additivity residual, positive drivers, protective drivers, and all aggregated feature contributions.
- `rules`: deterministic triggers evaluated against the same normalized inference snapshot. These triggers are evidence, not SHAP values.
- `historical`: comparisons against the chronological training cohort. Sector history is used when at least ten training projects exist; otherwise the complete training cohort is used.

Random Forest estimators use `TreeExplainer`. Ridge regression uses `LinearExplainer`. Logistic regression uses `PermutationExplainer` around `predict_proba`, so contributions remain in probability percentage points. Cost regression contributions are returned in escalation percentage points. Schedule regression contributions are returned in days.

Categorical one-hot contributions are summed back to their canonical source field. For example, all encoded contract-status columns are returned as one `contract_status` contribution. `baseValue + sum(contributions)` is compared with the explained model output and the residual is returned for audit.

## Artifact compatibility

Training stores a bounded, evenly sampled transformed background from the training partition plus historical reference statistics. Existing immutable artifacts that predate this metadata continue to produce predictions but return `ml.available=false` with a retraining reason. Retrain under a new model version to enable SHAP:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m app.ml.train_cost_overrun --version 2.0.0
python -m app.ml.train_schedule_overrun --version 2.0.0
```

Do not overwrite an existing artifact version. The explanation and prediction are stored together in `predictions.output_payload`, preserving the exact explanation shown to users.
