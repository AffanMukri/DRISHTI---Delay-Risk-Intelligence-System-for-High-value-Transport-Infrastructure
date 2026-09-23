# Risk trajectory

PRAGATI-X builds project trajectories only from persisted `project_risks`
records. The reporting month is `assessment_period`; if a project was assessed
more than once for the same month, the assessment with the newest
`assessed_at` timestamp is used in the monthly series. Raw assessments remain
in the database and are not deleted.

The trend direction compares the current month's overall risk score with the
immediately preceding stored month:

- `Improving`: decrease greater than the stable band.
- `Stable`: absolute change within the stable band.
- `Deteriorating`: increase above the stable band but below the rapid threshold.
- `Rapidly Deteriorating`: increase at or above the rapid threshold.

Defaults use absolute points on the 0–100 risk scale:

```text
RISK_TRAJECTORY_STABLE_BAND_POINTS=2
RISK_TRAJECTORY_MEANINGFUL_INCREASE_POINTS=5
RISK_TRAJECTORY_RAPID_INCREASE_POINTS=10
```

The 2-point stable band prevents minor recalculation noise from being labelled
as a trend. The 10-point rapid threshold aligns with the default automated
warning threshold for a sharp risk increase; the 5-point marker surfaces
material movement for review before it reaches warning severity. Configuration
validation requires `stable < meaningful <= rapid`.

Cost, schedule, or implementation scores that were not stored remain `null`.
The API and frontend do not substitute the overall score or interpolate missing
months. “What changed” compares stored component scores and normalized risk
driver values/contributions between the two selected snapshots.
