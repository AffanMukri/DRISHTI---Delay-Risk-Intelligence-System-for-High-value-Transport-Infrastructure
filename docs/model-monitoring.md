# ML model monitoring

PRAGATI-X model monitoring is an administrative observability workflow. It
does not retrain, activate, retire, replace, or deploy a model.

## Inventory

`GET /api/model-monitoring` lists every registered model version, including:

- model name, version, type, algorithm, description, and active/retired state;
- training timestamp, training period, and training-row count where recorded;
- registered feature list and held-out evaluation metrics;
- deployment timestamp, last genuine inference, and inference-record count;
- latest monitoring status and attention summary.

New cost and schedule artifacts record their full label/snapshot training
period and actual training row count. Older artifacts display these values as
unavailable when they were not historically registered.

## Monitoring report

An Administrator can persist a report with:

```http
POST /api/model-monitoring/{model_version_id}/runs
Authorization: Bearer <administrator-token>
Content-Type: application/json

{"windowDays": 90}
```

The report compares the selected deployment window with verified training
references and, for prediction output, the immediately preceding equal-length
window. Reports are immutable observations in `model_monitoring_runs`; each run
also appends an audit-log record.

### Feature and data drift

Numeric features use both:

- Population Stability Index (PSI) with bins derived from training-reference
  deciles; and
- a two-sample Kolmogorov-Smirnov test.

A numeric feature is marked `drift_detected` only when PSI reaches the critical
threshold and the KS result is statistically significant. The watch state can
be raised by the warning PSI threshold or a significant KS test.

Categorical features use Pearson's chi-square test and Cramer's V effect size.
Rare categories are pooled. If expected counts remain below five, no chi-square
value is displayed.

### Prediction distribution shift

Regression outputs and, when available, classification probabilities are
compared between adjacent deployment windows using PSI and KS. This is an
observational signal and may reflect legitimate changes in the monitored
project mix rather than model deterioration.

### Missing-feature changes

Training and current present/missing counts are compared with a two-by-two
chi-square test. A metric is withheld if either sample is too small or expected
counts are unsuitable.

### Realized performance

Performance monitoring uses only predictions where `predictions.actual_value`
or `predictions.actual_class` and `evaluated_at` have been stored through a
governed outcome-evaluation process.

- Regression reports MAE, RMSE, and R2. Degradation is flagged when observed
  MAE exceeds the registered held-out MAE by the configured ratio.
- Classification reports precision, recall, F1, and AUC when both outcome
  classes exist. F1 materially below the held-out baseline is flagged.

No observed metric is shown until the minimum evaluated sample is available.

## Sufficiency and configuration

Defaults are configured server-side:

```env
MODEL_MONITORING_DEFAULT_WINDOW_DAYS=90
MODEL_MONITORING_MIN_SAMPLES=30
MODEL_MONITORING_PSI_WARNING=0.10
MODEL_MONITORING_PSI_CRITICAL=0.25
MODEL_MONITORING_SIGNIFICANCE_LEVEL=0.05
MODEL_MONITORING_PERFORMANCE_DEGRADATION_RATIO=1.25
```

Individual checks return `insufficient_data` with a reason and null statistics
when sample-size, variation, class-support, or expected-count requirements are
not met. A report may be `partial` when some checks are defensible and others
are not.

## Security and control

The API requires the Administrator role. PostgreSQL RLS separately limits
reading and writing `model_monitoring_runs` to Administrators, binds new runs to
the authenticated profile, and constrains audit inserts. No migration, route,
service, or database trigger updates `model_versions` or invokes training.

Apply the database migration with:

```powershell
npx supabase db push
```
