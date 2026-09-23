# CUF versus CUF+ experimental comparison

This framework measures whether validated external variables improve held-out
performance over the current PRAGATI-X CUF/project-monitoring variables. It is
an experiment registry, not a claim that external data is useful by default.

## Feature sets

- **Model A** uses the leakage-screened cost or schedule feature list already
  used by the production pipelines. Land acquisition and clearance values in a
  monthly CUF record remain Model A fields.
- **Model B** uses the identical Model A fields plus external observations that
  are independently stored in `external_feature_observations`. An external
  land-acquisition or clearance value is therefore distinct from its CUF
  counterpart and must have its own source.

The feature catalog covers weather, externally verified land acquisition,
environmental clearances, contractor history, commodity prices, district
characteristics, litigation, procurement, geographic complexity, and fund
release patterns. Catalog entries are definitions only. The migration does not
seed external observations.

Every observation requires a project, observation date, value, source name,
source URL, source record identifier, retrieval timestamp, and validation
status. Optional source checksums and licences strengthen reproducibility. A
pending value cannot enter Model B. A validated value is joined only when its
observation date is no later than the project's feature snapshot and its stated
period contains that snapshot.

## Fair evaluation

Within each outcome, A and B use:

- the same non-synthetic completed-project cohort;
- the same chronological 60/20/20 train/validation/test project partitions;
- the same random seed and candidate estimators;
- the same label and metric definitions;
- preprocessing fitted on the training partition only.

External feature eligibility is also decided from training-partition coverage,
not test coverage. The default minimum is 30%. Missing eligible external values
are median-imputed from the training partition and their coverage is reported.

Regression compares Ridge and Random Forest and selects the lowest validation
MAE. Classification compares Logistic Regression and Random Forest and selects
the highest validation AUC, falling back to F1. The test partition is used once
for the reported comparison.

Outcomes:

- cost overrun: final project cost, with MAE, RMSE, and R²;
- time overrun: actual-minus-original completion variance in days, with MAE,
  RMSE, and R²;
- outcome-risk classification: significant final cost escalation **or** final
  completion delay, with precision, recall, F1, and AUC.

The outcome-risk label is not a historical PRAGATI-X risk score and does not use
future risk snapshots as features. It is explicitly defined in each artifact
using the configured cost and delay thresholds.

The response says that CUF+ improved overall only when Model B improves all
three primary held-out metrics: cost MAE, time MAE, and risk F1. Otherwise it
states that no consistent CUF+ improvement was established. Per-metric winners
remain visible regardless of the overall result.

## Workflow and API

Apply migrations first:

```powershell
npx supabase db push
```

Analysts or Administrators can register a pending observation:

```http
POST /api/experiments/cuf-plus/observations
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "PROJECT-CODE",
  "featureCode": "procurement_delay_days",
  "numericValue": 47,
  "observationDate": "2025-03-01",
  "sourceName": "Published procurement register",
  "sourceUri": "https://publisher.example/record/123",
  "sourceRecordId": "123",
  "publisher": "Publishing authority",
  "retrievedAt": "2026-09-21T10:00:00Z"
}
```

The returned UUID is reviewed through:

```http
PATCH /api/experiments/cuf-plus/observations/{observation_id}/validation

{"status":"validated","notes":"Matched to the published project and reporting period."}
```

Run an immutable version and retrieve its results:

```http
POST /api/experiments/cuf-plus/run

{"version":"2026-09-baseline"}

GET /api/experiments/cuf-plus/latest
GET /api/experiments/cuf-plus
GET /api/experiments/cuf-plus/features
```

Artifacts are JSON files under `EXPERIMENT_ARTIFACT_DIR`. The database record
stores methodology, features, coverage, selected algorithms, metrics,
limitations, dataset fingerprint, artifact checksum, and the conservative
conclusion. Version names are immutable.

## Known limitations

- External observations may be correlated with reporting quality or project
  selection. Measured predictive improvement is not evidence of causation.
- Source definitions can vary across publishers and periods. Only compatible,
  documented measurements should share a feature code.
- Small cohorts or weak class support cause a task to be omitted rather than
  producing unstable metrics.
- Current external integrations are provenance-gated ingestion endpoints, not
  live publisher connectors. No weather, price, legal, district, contractor,
  procurement, geographic, or fund-release value is generated or inferred.
