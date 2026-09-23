# PRAGATI-X hybrid risk scoring

Version `hybrid-risk-v1` preserves the original `deterministic-risk-v1` calculation and adds two independently identifiable signals. The API returns every component, the effective ensemble weights, major drivers, and provenance with each snapshot.

## Components

1. **Rule (default 50%)** — exact original five-factor score: progress 25%, cost 25%, schedule 25%, milestones 15%, and expenditure mismatch 10%. The default weight is highest to preserve score continuity and keep certified monitoring facts primary.
2. **Statistical (default 25%)** — midrank empirical percentiles for the same five indicators. Cohorts are selected in order: same sector and project type, same sector, then the non-synthetic portfolio. A cohort requires at least five projects. This supplies historical context without letting cohort composition dominate.
3. **ML (default 25%)** — cost and schedule probabilities from genuine stored outputs of `pragati_x_cost_overrun` and `pragati_x_schedule_overrun`. Synthetic predictions are rejected. No implementation ML model exists, so implementation risk deliberately renormalizes rule and statistical weights only.

When a component is unavailable, its weight is not treated as a zero-risk signal. Configured weights are renormalized across available components and the unavailability reason is returned.

## Thresholds

- Healthy: 0–34
- Watch: 35–59
- High Risk: 60–79
- Critical: 80–100

All weights, saturation points, thresholds, and the minimum cohort size are server environment settings listed in `.env.example`. Invalid weight sums or non-increasing thresholds stop application configuration loading.

## Historical snapshots and provenance

Each assessment inserts a new `project_risks` row and marks the prior row non-current. Component details and effective weights are stored in `input_snapshot`; major drivers are stored in `risk_drivers`. `GET /api/risks/{project_id}/history` returns the evolution. Only Administrator and Analyst roles may create snapshots; read access continues through the existing authenticated RLS policies.
