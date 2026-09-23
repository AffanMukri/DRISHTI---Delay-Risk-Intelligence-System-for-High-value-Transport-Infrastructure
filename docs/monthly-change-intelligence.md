# What Changed Since Last Month?

The portfolio comparison is calculated by FastAPI and returned by:

```text
GET /api/portfolio/changes
```

React renders this response and does not independently recalculate comparison
metrics.

## Reporting-cycle definition

The latest and previous cycles are the two newest distinct non-null
`project_risks.assessment_period` values. If a project was recalculated more
than once in one period, its newest `assessed_at` record is authoritative for
that month. A project must have a snapshot in both periods to participate in
risk transitions, risk-score changes, dimensional changes, or exposed-capital
comparison. Coverage and exclusions are returned in `dataAvailability`.

No previous cycle is inferred. When fewer than two stored cycles exist, the API
returns `comparisonAvailable: false` and empty drill-down collections.

## Metric definitions

- Newly High Risk: previous level Healthy/Watch and current level High Risk.
- Newly Critical: current level Critical and previous level was not Critical.
- Recovered: previous level High Risk/Critical and current level Healthy/Watch.
- Significant cost/schedule increase: domain score increased by at least
  `COMPARISON_SIGNIFICANT_RISK_INCREASE_POINTS` (default 10 points).
- Newly overdue milestone: overdue at the latest cycle date but not overdue at
  the previous cycle date, based on stored planned and actual dates.
- New critical warning: `first_detected_at` falls within the latest reporting
  month and severity is Critical.
- Resolved warning: `resolved_at` falls within the latest reporting month.
- Capital exposed: revised cost for comparable projects classified High Risk or
  Critical in each cycle. Projects missing a historical cost in either cycle
  are excluded from this calculation and reported through coverage metadata.
- Emerging driver: stored driver score increased by more than the configured
  risk-trajectory stable band; drivers are ranked by affected-project count and
  average increase.
- Sector/ministry/state movement: change in High/Critical project count and
  exposed capital among comparable projects.

All metric, warning, milestone, driver, and dimensional aggregates include
their affected project records so the frontend can provide drill-down without
additional calculations.
