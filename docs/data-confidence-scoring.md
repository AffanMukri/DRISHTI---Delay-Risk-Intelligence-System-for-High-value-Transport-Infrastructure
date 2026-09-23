# Data Confidence Score

`GET /api/projects/{project_id}/data-confidence` returns a deterministic 0–100
assessment of the completeness, freshness, coverage, and validation evidence
of a project's input data.

It is explicitly not:

- an ML model probability;
- prediction confidence;
- project health or delivery risk; or
- a substitute for missing data.

The API returns `scoreType: "data_quality"` and
`isPredictionProbability: false` to preserve this distinction in downstream
clients.

## Default formula

The overall score is the weighted sum of ten component scores:

| Component | Default weight | Scoring basis |
| --- | ---: | --- |
| Required fields | 20% | Presence of core project identity, approved cost, original completion date, and a monthly update |
| Latest-update freshness | 15% | Full credit through 45 days, linear decline, zero at 180 days |
| Monthly history | 15% | Distinct reports present in the latest 12 expected months |
| Milestones | 10% | 100 for milestone-level records, 60 for aggregate counts only, otherwise 0 |
| Cost data | 10% | Latest approved cost, revised cost, and expenditure |
| Physical progress | 10% | Latest actual and planned progress |
| Clearances | 5% | At least one substantive clearance status |
| Land acquisition | 5% | Progress or reported target/completed quantities |
| Agency and contract | 5% | Implementing agency and latest contract status |
| Validation quality | 5% | Certified row-level evidence, anomalies, and unresolved validation findings |

Weights are server-side environment settings and must sum to 1.0. Missing
values receive no credit. Project-table display defaults are not substituted
for missing latest-cycle cost or progress fields.

## Validation evidence

Confirmed CUF imports copy non-sensitive validation counts into the certified
monthly update metadata. This keeps the confidence result consistent for every
authorized role without exposing raw CUF rows or weakening their RLS policies.

- Full validation credit requires persisted row-level evidence.
- A `validated` status without row-level evidence receives 70 points for this
  component and is reported as incomplete evidence.
- Each anomaly deducts 20 component points by default.
- Each unresolved validation error or warning deducts 10 component points by
  default.
- The component is always bounded to 0–100.

## Configuration

```text
DATA_CONFIDENCE_REQUIRED_FIELDS_WEIGHT=0.20
DATA_CONFIDENCE_FRESHNESS_WEIGHT=0.15
DATA_CONFIDENCE_HISTORY_WEIGHT=0.15
DATA_CONFIDENCE_MILESTONE_WEIGHT=0.10
DATA_CONFIDENCE_COST_WEIGHT=0.10
DATA_CONFIDENCE_PROGRESS_WEIGHT=0.10
DATA_CONFIDENCE_CLEARANCE_WEIGHT=0.05
DATA_CONFIDENCE_LAND_WEIGHT=0.05
DATA_CONFIDENCE_AGENCY_CONTRACT_WEIGHT=0.05
DATA_CONFIDENCE_VALIDATION_WEIGHT=0.05
DATA_CONFIDENCE_FRESH_DAYS=45
DATA_CONFIDENCE_STALE_DAYS=180
DATA_CONFIDENCE_HISTORY_TARGET_MONTHS=12
DATA_CONFIDENCE_ANOMALY_PENALTY=20
DATA_CONFIDENCE_VALIDATION_ISSUE_PENALTY=10
```

Ratings are descriptive only: High ≥85, Moderate ≥70, Low ≥50, and Very Low
below 50. The numerical components, missing/stale fields, reasons, weights, and
formula version remain the authoritative explanation.
