# PRAGATI-X FastAPI backend

This backend exposes the existing PRAGATI-X PostgreSQL data through an authenticated API. It does not replace or redesign the React frontend.

## Architecture

- `app/api/routes`: thin HTTP handlers and OpenAPI metadata
- `app/schemas`: validated Pydantic request and response contracts
- `app/services`: application and workflow rules
- `app/repositories`: parameterized PostgreSQL queries
- `app/auth`: Supabase access-token validation and role dependencies
- `app/analytics`: reusable deterministic analytics transforms
- `app/ingestion`: CSV/XLSX CUF parsing, canonical mapping, normalization, and deterministic data-quality rules
- `app/assistant`: deterministic intent routing, PDF extraction, Ollama embeddings, and grounded synthesis
- `app/reporting`: PDF, XLSX, and CSV document builders with traceable source sections
- `app/ml`: reproducible cost-overrun training/inference pipelines and future model interfaces
- `app/config.py`: environment-based configuration
- `app/errors.py`: consistent JSON errors

The API validates each Bearer token with Supabase Auth. For database calls it starts a transaction, changes to PostgreSQL's `authenticated` role, and sets `request.jwt.claim.sub` to the authenticated user ID. The existing Supabase RLS policies therefore remain authoritative; the backend's route checks are an additional early guard, not the only authorization mechanism.

## Local setup (PowerShell)

From the repository root:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env`. Use the Supabase direct database URL or the session pooler URL on port 5432. Do not put a service-role key in this file or in the frontend; the public/publishable key is sufficient for token validation.

Apply the existing database schema from the repository root before starting the API:

```powershell
npx supabase link --project-ref thxthjzgspqprqblzcbt
npx supabase db push --include-seed
```

Start the server from `backend`:

```powershell
python -m app
```

Set `BACKEND_RELOAD=true` in `.env` for local auto-reload. The project launcher also selects a psycopg-compatible event loop on Windows. On Linux/macOS, the equivalent direct Uvicorn command is `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.

Useful URLs:

- Health: `http://127.0.0.1:8000/api/health`
- Swagger UI: `http://127.0.0.1:8000/api/docs`
- ReDoc: `http://127.0.0.1:8000/api/redoc`
- OpenAPI JSON: `http://127.0.0.1:8000/api/openapi.json`

## Administrative audit trail

The Administrator-only Audit Trail page reads `GET /api/audit/logs` and
`GET /api/audit/options`. It supports action, entity, source, actor, date, and
free-text filtering with server-side pagination. Authenticated login/logout
flows submit only allow-listed events to `POST /api/audit/security-events`;
passwords and tokens are never included.

Migration `20260921000500_comprehensive_audit_trail.sql` makes audit rows
append-only, preserves actor snapshots and API/import references, recursively
redacts secret-like JSON keys, and adds database triggers for project data,
warnings, interventions, model versions, predictions, reports, and risk
snapshots. Database RLS permits only Administrators to read this trail.

## Milestone and package dependencies

Project Intelligence displays an interactive graph built only from explicit
`milestone_dependencies` rows. Planning records use `milestones.node_type` to
distinguish milestones from package-level nodes. No edge is inferred from
sequence number, date proximity, risk score, or similar project history.

- `GET /api/projects/{project_id}/dependencies` returns nodes, explicit edges,
  current statuses, shortest paths, and dependency depth.
- `POST /api/projects/{project_id}/dependencies` defines one manual edge.
- `POST /api/projects/{project_id}/dependencies/import` atomically imports up
  to 500 validated edges with a required source reference.
- `DELETE /api/projects/{project_id}/dependencies/{dependency_id}` removes an
  explicitly stored edge.

Administrator, Monitoring Officer, and Analyst roles can manage edges;
Executives have read-only access. PostgreSQL rejects cross-project edges,
self-dependencies, duplicates, and directed cycles. When a delayed node reaches
an incomplete downstream node, the API labels it `potentially_affected` and
returns the explicit path. This is exposure analysis only and never asserts
that downstream delay is certain.

## Authenticated reports

The Reports page uses backend-generated files rather than browser-side mock
exports. `GET /api/reports/options` returns the reporting periods and scopes
permitted for the caller. `POST /api/reports/generate` returns a PDF, XLSX, or
applicable CSV attachment with `X-Report-ID`, `X-Data-As-Of`, and SHA-256 trace
headers. Monthly Flash and PRAGATI dossiers are intentionally not flattened to
CSV because their output contains several related sections.

Every report is calculated at the requested month-end from stored monthly
updates, risk snapshots, risk drivers, warnings, and authorized intervention
records. Recommendations are deterministic analytical/workflow-rule outputs
and are labelled as such. Each successful download is recorded in the
RLS-protected `report_exports` table and mirrored to `audit_logs` by a database
trigger. Analysts cannot request report types containing intervention records;
the same restriction is enforced in the service and by PostgreSQL RLS.

Apply `20260921000400_secure_report_exports.sql` with the normal migration
command before using the page:

```powershell
npx supabase db push
```

## Ask PRAGATI-X

Ask PRAGATI-X is a constrained project-intelligence assistant, not an open-domain
chatbot. A deterministic router selects a known structured query, document RAG,
or a hybrid of both. Portfolio numbers are retrieved or calculated in
PostgreSQL; the local language model receives only numbered evidence records and
is instructed not to infer missing values. Generated citation identifiers are
validated before an answer is returned. If Ollama is disabled or unavailable,
structured questions receive a deterministic evidence summary and document-only
questions report insufficient evidence.

Endpoints:

- `POST /api/assistant/ask`: authenticated grounded question answering
- `POST /api/assistant/documents`: Administrator, Monitoring Officer, or Analyst PDF ingestion
- `GET /api/assistant/documents/{project_id}`: indexed-document inventory

The document path is deliberately separate from structured querying. PyMuPDF
extracts page-aware text, Ollama creates embeddings, and PostgreSQL `pgvector`
stores/searches `document_chunks`. The original PDF is stored beneath the
server-only `ASSISTANT_DOCUMENT_DIR`; use durable encrypted storage mounted at
that path in production. Scanned PDFs are rejected unless OCR has already
produced extractable text.

Install and start Ollama, then pull the configured local models:

```powershell
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
ollama serve
```

Apply migrations and configure the `OLLAMA_*` and `ASSISTANT_*` values from
`.env.example`. `OLLAMA_EMBEDDING_DIMENSIONS` must remain `768` unless a new
migration changes the `document_chunks.embedding` vector dimension and all
documents are re-indexed.
The complete trust boundary and failure behavior are documented in
`docs/ask-pragati-x.md`.

## Intervention workflow

The Intervention Center uses a persisted workflow rather than browser-local
state. Executives, Monitoring Officers, and Administrators can read and create
interventions. Only Monitoring Officers and Administrators can assign officers,
change deadlines or priorities, post remarks, escalate, or resolve them. The
same permissions are enforced by PostgreSQL RLS.

- `GET /api/interventions`
- `GET /api/interventions/officers`
- `GET /api/interventions/{intervention_id}/history`
- `POST /api/interventions`
- `PATCH /api/interventions/{intervention_id}`

Every insert or meaningful update is captured by a database trigger in both
`intervention_updates` and `audit_logs`, including direct authorized database
writes. `intervention_updates` is append-only under RLS. Status transitions are validated in both the service layer and
PostgreSQL. Escalation requires a reason, resolution requires resolution notes,
and resolved interventions are terminal. Reading the intervention queue runs a
guarded database function that persists `OVERDUE` for unresolved items whose
deadline has passed. Only one unresolved intervention may be linked to a given
warning.

## Hybrid risk scoring

The original five-factor deterministic formula is preserved as
`deterministic-risk-v1` and is now one independently reported component of the
`hybrid-risk-v1` ensemble. Historical peer percentiles and genuine stored cost
and schedule model outputs are added only when defensible. Missing components
are excluded and configured weights are renormalized; synthetic model outputs
are never treated as ML evidence.

Read endpoints remain available to authenticated analytics users. Creating a
new snapshot is restricted to Administrator and Analyst roles and is also
enforced by the existing PostgreSQL RLS policies:

- `GET /api/risks/configuration`
- `GET /api/risks/{project_id}`
- `GET /api/risks/{project_id}/history`
- `GET /api/risks/{project_id}/trajectory`
- `GET /api/portfolio/changes`
- `GET /api/projects/{project_id}/data-confidence`
- `POST /api/risks/{project_id}/assess`
- `POST /api/risks/assess-portfolio`

Every run inserts a historical `project_risks` snapshot and normalized
`risk_drivers`; it never overwrites the prior assessment. Exact weights,
thresholds, rationale, and environment settings are documented in
`docs/hybrid-risk-scoring.md` and `.env.example`.

The trajectory endpoint groups persisted assessments by `assessment_period`,
uses the newest assessment when a month was recalculated, and returns the four
risk series plus deterministic month-to-month direction and driver deltas. It
does not infer missing historical points. Direction thresholds are documented
in `docs/risk-trajectory.md` and configurable through server-only environment
variables.

## Monthly portfolio change intelligence

`GET /api/portfolio/changes` compares the two newest stored reporting cycles
and returns risk transitions, material cost/schedule risk increases, newly
overdue milestones, warning lifecycle events, exposed-capital movement,
emerging drivers, and sector/ministry/state movement. Every aggregate includes
the affected records required for drill-down. Missing prior cycles or
non-comparable projects are reported explicitly; historical values are not
backfilled from current project data. Definitions and thresholds are documented
in `docs/monthly-change-intelligence.md`.

## Project Data Confidence

`GET /api/projects/{project_id}/data-confidence` returns a transparent,
deterministic input-data quality score. It includes weighted component scores,
reasons lowering confidence, missing and stale fields, validation/anomaly
evidence, and the effective formula configuration. It is deliberately separate
from ML prediction probabilities and never fills missing current-cycle values
from frontend defaults. The complete formula is documented in
`docs/data-confidence-scoring.md`.

## Cost analytics

`GET /api/analytics/cost` aggregates current project snapshots with monthly
history. Optional `sector`, `escalated_only`, and `mismatch_threshold` query
parameters are applied in PostgreSQL. The response includes portfolio totals,
coverage counts, monthly trends, sector/ministry/project breakdowns, the ten
highest escalations, and expenditure-versus-physical-progress mismatches.

Original cost uses the earliest non-null monthly approved cost and falls back
to the project snapshot. Revised cost, expenditure, and physical progress use
the latest non-null monthly values and then the snapshot. Escalation excludes
projects without both comparable cost values; those omissions are reported in
`dataAvailability`.

## Schedule analytics

`GET /api/analytics/schedule` accepts optional `sector`, `search`, and
`delay_filter=all|delayed|severe|on_time` parameters. PostgreSQL returns the
portfolio summary, data coverage, delay histogram, historical planned-versus-
actual series, sector/ministry aggregates, complete project facts, and the 25
highest delayed projects.

The calculations are deterministic:

- schedule slippage = current/revised completion date - original completion date
- progress variance = actual physical progress - planned physical progress
- monthly velocity = actual progress percentage-point change / calendar months elapsed
- elapsed duration = days since the first monthly record / days from that record to current completion
- milestone completion = completed milestones / total milestones
- overdue = incomplete detailed milestone with a planned date before the project's reporting as-of date

The earliest historical non-null original date is the baseline. Current date,
planned progress, and actual progress use the latest non-null monthly value and
then the current project snapshot. Detailed milestone rows take precedence over
the latest monthly milestone counts. Missing values are not converted to zero
for comparisons; exclusions and fallback coverage are exposed in
`dataAvailability`. No ML output is used by this endpoint.

## Peer benchmarking

`GET /api/analytics/benchmark?project_id=PRJ-001` selects up to eight peers in
the backend. An optional `comparison_project_id` must belong to that generated
peer group, and `max_peers` is restricted to 1-20.

The deterministic 100-point match score uses sector (30), project type (20),
original-cost band (15), shared state (10), planned-duration similarity (10),
start-period proximity (10), and the same implementing agency (5) when that
agency has multiple monitored projects. Normal selection requires the same
sector or project type and at least 30 points. If no candidate qualifies, the
response explicitly reports use of the relaxed 15-point fallback.

The response explains every selected peer and compares the selected project,
direct comparison peer, sector median, peer median, and historical-peer median
for cost overrun, schedule delay, monthly physical-progress velocity,
expenditure efficiency, milestone slippage, and current risk indicators.
Historical peers are completed qualifying projects or qualifying projects with
an earlier start year. Start date uses project metadata, then the earliest
milestone, then the earliest monthly report; `startDateSource` exposes the
source. The radar scores and agency leaderboard are also calculated by the
backend. No ML inference is used.

## Cost-overrun ML pipeline

The first production ML workflow predicts a completed project's final-cost to
original-approved-cost ratio and, when both target classes have adequate
support, the probability of a final overrun of at least the configured
threshold (10% by default). It never trains on seed/demo projects and never
falls back to a synthetic prediction.

Training uses one observation per completed project. Features come only from
the earliest monthly monitoring snapshot, while the target is the latest
recorded final revised/estimated-at-completion cost. A target must be dated
after the feature snapshot. Revised/final cost, current overrun, risk scores,
financial progress, and current/latest project snapshots are explicitly
excluded from the feature set to prevent outcome leakage.

Projects are ordered by target date and split chronologically 60/20/20 into
train, validation, and untouched test partitions. Validation MAE selects
between Ridge and Random Forest regression; validation AUC (or F1 when AUC is
undefined) selects between Logistic Regression and Random Forest
classification. XGBoost/LightGBM is intentionally not added yet: with the
current minimum dataset, another boosted-tree dependency does not justify its
operational complexity. It can be evaluated once enough real history exists.

The artifact contains both fitted preprocessing/model pipelines, the exact
feature list, leakage exclusions, model version, data fingerprint, split
dates/counts, software versions, metrics, and a checksum. Regression reports
MAE/RMSE/R²; classification reports precision/recall/F1/AUC. Classification is
omitted and its probability is returned as null if either class lacks the
configured support. The cost range uses the validation partition's
90th-percentile absolute ratio error and is explicitly not a formally
calibrated confidence interval.

Train and register a model from `backend` after configuring `DATABASE_URL` and
applying the migrations:

```powershell
.\.venv\Scripts\Activate.ps1
python -m app.ml.train_cost_overrun --version 1.0.0
```

By default, at least 100 qualifying non-synthetic completed projects are
required. The command exits without creating/registering a model if readiness
checks fail. Store `ML_ARTIFACT_DIR` on durable server storage shared by API
instances; artifacts are deliberately git-ignored.
Model version identifiers are immutable; choose a new version for every run.

Authenticated prediction endpoints:

- `GET /api/predictions/cost-overrun/{project_id}`: latest persisted real result
- `POST /api/predictions/cost-overrun/{project_id}`: run and persist inference (Administrator/Analyst)
- `GET /api/predictions/what-if/{project_id}`: list current inputs supported by both active model schemas
- `POST /api/predictions/what-if/{project_id}`: run a non-persistent baseline-versus-scenario comparison

What-if access follows prediction-view RBAC (Administrator, Executive, and
Analyst). Scenario values are held in memory only and never update certified
project data or persist prediction/risk snapshots. See
`docs/what-if-intervention-simulator.md` for supported features and safeguards.

Auditable evidence endpoint:

- `GET /api/evidence/projects/{project_id}`: stored source data through derived signals, model/rule output, explanation, warning, and linked intervention

The evidence builder performs no generative inference and respects the caller's
existing PostgreSQL RLS permissions. See `docs/evidence-chain.md`.

Executives can read persisted results. PostgreSQL RLS limits model and
prediction writes to Administrators/Analysts; the FastAPI role dependency
enforces the same generation boundary before the database call.

Newly trained artifacts also include SHAP background metadata. Generated
predictions return numerical positive/protective contributions, deterministic
rule triggers, and sector-or-portfolio historical comparisons in a structured
`explanation` object. Random Forest uses TreeExplainer, Ridge uses
LinearExplainer, and Logistic Regression uses probability-space
PermutationExplainer. Existing immutable artifacts remain readable but must be
retrained under a new version to add explanations. See
`docs/prediction-explainability.md`.

## Schedule-overrun ML pipeline

Schedule prediction is a separate model family named
`pragati_x_schedule_overrun`; it does not reuse cost-model artifacts or targets.
Regression predicts signed actual-versus-original completion variance in days.
Classification predicts whether that variance exceeds
`ML_SCHEDULE_OVERRUN_THRESHOLD_DAYS` (zero days by default).

A training label is accepted only for a non-demo completed project with a
defensible actual completion date from, in order: explicit project metadata, a
fully completed detailed milestone set, or the first non-demo monthly record
at 100% physical progress. Revised and forecast dates never serve as targets.
Features come from the second monthly report so previous progress and monthly
velocity are observable. Final completion, final delay, future milestone dates,
latest snapshots, and risk scores are excluded to prevent target leakage.

Inputs include reported planned/physical progress, previous progress, velocity,
elapsed duration, original project size, expenditure ratio, snapshot-time delay
indicators, milestone status, land acquisition, clearance completion, issues,
sector, type, ministry, agency, state, and contract status. Missing fields are
handled by the persisted preprocessing pipeline.

Ridge/Logistic Regression baselines are compared with Random Forest regression
and classification using chronological 60/20/20 train/validation/test splits.
Validation MAE selects regression; validation AUC or F1 selects classification.
Held-out regression metrics are MAE days, RMSE days, and R². Classification
reports precision, recall, F1, and AUC, or is omitted when class support is not
defensible. The completion-date range uses validation 90th-percentile absolute
delay error and is explicitly not a calibrated confidence interval.

Train and register an immutable schedule version from `backend`:

```powershell
.\.venv\Scripts\Activate.ps1
python -m app.ml.train_schedule_overrun --version 1.0.0
```

Endpoints:

- `GET /api/predictions/schedule-overrun/{project_id}`: latest persisted real result
- `POST /api/predictions/schedule-overrun/{project_id}`: generate and persist (Administrator/Analyst)

The frontend's purple progress line is a transparent linear path from the last
actual report to the model-predicted completion date. It is derived from the
completion prediction and is not represented as a separately trained monthly
progress forecast.

## CUF ingestion

The staged workflow uses these authenticated endpoints:

- `POST /api/cuf/uploads`: multipart CSV/XLSX upload, validation, and persisted preview
- `GET /api/cuf/imports/{batch_id}/preview`: retrieve mapping, quality metrics, transformations, and row findings
- `POST /api/cuf/imports/{batch_id}/confirm`: atomically import only valid rows

Administrators, Monitoring Officers, and Analysts can upload and preview. Only
Administrators and Monitoring Officers can confirm certified project updates.
The PostgreSQL RLS policies enforce the same boundary.

Uploaded source rows and normalized rows are stored separately in
`cuf_import_rows`. Confirmation writes `project_monthly_updates` plus the
corresponding cost/schedule history, refreshes the latest frontend monitoring
snapshot through a field-restricted database function, appends an audit record,
and commits the batch with `downstream_analysis_status = pending`. After that
transaction commits, the server claims the persistent batch and, once per
affected project, runs cost inference, schedule inference, hybrid-risk snapshot
creation, prior-period comparison, and warning evaluation. The final per-project
result (including unavailable-model reasons) is retained in
`downstream_analysis_summary`; failures are retained for retry and audit.
Existing project/month snapshots and repeated file hashes are never overwritten.

The warning engine is deterministic and configuration-driven. It evaluates
progress variance, cost escalation, overdue milestones, financial/physical
progress mismatch, completion-date revision, hybrid-risk increase, registered
cost/schedule model probabilities, and repeated progress stagnation. An active
condition is upserted using a project/rule deduplication key, preserving its
workflow status while refreshing its evidence and occurrence count. Conditions
that clear are automatically resolved. Numerical ML warning evidence is read
only from persisted non-synthetic registered-model output; the warning engine
does not invent predictions.

Thresholds and severity bands use the `WARNING_*` server environment variables
listed in `.env.example`. The defaults use increasingly material operational
bands (for example 10/15/25 percentage points for progress variance and
0.65/0.80/0.90 for model probabilities) and can be governed without a frontend
deployment.

Safety limits are configured with `CUF_MAX_FILE_SIZE_BYTES`, `CUF_MAX_ROWS`,
and `CUF_PREVIEW_ROWS`.

## CUF versus CUF+ model experiments

`POST /api/experiments/cuf-plus/run` performs an immutable, reproducible
comparison of the current leakage-screened CUF features against the same
features plus validated external observations. Both sides use identical
chronological project partitions, seed, targets, and candidate estimators.
Cost and time regression plus an outcome-risk classifier are compared on their
held-out test partitions. The API returns feature lists, external coverage,
per-metric differences, limitations, dataset/artifact hashes, and a conservative
conclusion. It never treats catalog definitions or demo values as observations.

External values must first be registered as pending through
`POST /api/experiments/cuf-plus/observations` and explicitly validated through
`PATCH /api/experiments/cuf-plus/observations/{id}/validation`. Only values
available as of the historical feature snapshot can be joined. Configuration:

- `EXPERIMENT_ARTIFACT_DIR`
- `EXPERIMENT_MIN_TRAINING_ROWS`
- `EXPERIMENT_MIN_CLASS_ROWS`
- `EXPERIMENT_EXTERNAL_MIN_FEATURE_COVERAGE`
- `EXPERIMENT_RANDOM_STATE`

See `docs/cuf-plus-model-comparison.md` for target definitions, methodology,
API examples, and limitations.

## Administrative model monitoring

`GET /api/model-monitoring` provides the registered model inventory, training
metadata, feature list, held-out metrics, deployment state, and last inference.
Administrators can persist a point-in-time report with
`POST /api/model-monitoring/{model_version_id}/runs`.

Numeric drift uses PSI plus KS, categorical drift uses chi-square plus Cramer's
V, and missingness uses a present/missing chi-square comparison. Prediction
shift compares adjacent inference windows. Performance is calculated only for
predictions with stored realized outcomes. All checks enforce configured
minimum samples and suppress invalid or underpowered statistics.

Monitoring is observation-only: it never retrains, deploys, activates, or
retires a model. See `docs/model-monitoring.md` for methodology, sufficiency
rules, endpoints, environment variables, and limitations.

`tests/fixtures/sample_cuf.csv` is a small seed-compatible example containing
one valid row plus deliberate invalid, duplicate, and unknown-project rows for
demonstrating the preview findings.

## Public project enquiry

`GET /api/public/projects` and `GET /api/public/projects/{project_id}` are the
only project-data endpoints available without a session. They query the
column-limited `public_project_catalog` and `public_project_milestones` views
under PostgreSQL's `anon` role in a read-only transaction. The response cannot
include risk, predictions, warnings, interventions, expenditure, delays,
evidence, documents, or audit data.

A project is published only when `projects.metadata.publicly_visible` is
`true`. Seed/demo projects are also published for the demonstration dataset.
The site QR stores a public URL containing the project code; it does not embed
project data or an access token. Apply migration
`20260923000100_public_project_enquiry.sql` before enabling the database-backed
public experience.

## Authentication and frontend integration

All routes except `/api/health` and the two read-only `/api/public/projects`
routes require the Supabase session access token:

```http
Authorization: Bearer <session.access_token>
```

Example PowerShell request:

```powershell
$headers = @{ Authorization = "Bearer $env:PRAGATI_ACCESS_TOKEN" }
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/projects -Headers $headers
```

When the React service layer is switched from mock data, obtain the access token from the existing Supabase session and add the same header. Set `CORS_ORIGINS` to the exact deployed frontend origins.

## Tests

The contract suite covers every requested endpoint, CUF CSV/XLSX validation, validation errors, structured errors, Bearer enforcement, role rejection, request IDs, camel-case output, and OpenAPI path registration:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest -q
```

The endpoint tests replace repositories with deterministic test services and do not need production credentials. For a live smoke test, configure `.env`, run the server, call `/api/health`, sign in through the existing frontend, and use its access token in the authenticated request above.

To exercise every repository query against a migrated non-production database, create an active administrator profile in that database and run:

```powershell
$env:TEST_DATABASE_URL = "postgresql://user:password@host:5432/postgres?sslmode=require"
$env:TEST_USER_ID = "the-administrator-profile-uuid"
python -m pytest -q -m integration
```

The integration test performs its warning/intervention writes inside a transaction and rolls them back.
