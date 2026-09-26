# DRISHTI Supabase database

This directory contains the normalized PostgreSQL foundation for DRISHTI. The
existing React application consumes the FastAPI service adapter while retaining
an explicit mock adapter for offline development.

## Compatibility model

The database uses UUID primary keys internally. Stable frontend identifiers are
preserved as unique external codes:

- `Project.id` maps to `projects.project_code` (`PRJ-001`).
- `Warning.id` maps to `warnings.warning_code` (`WRN-001`).
- `Intervention.id` maps to `interventions.intervention_code` (`INT-001`).
- Current project metrics remain on `projects` for efficient portfolio reads.
- Historical metrics are normalized into monthly, cost, schedule, risk, and
  prediction tables.
- Title Case TypeScript enum values map to snake_case PostgreSQL enum values in
  the future service adapter, for example `High Risk` to `high_risk`.

## Schema files

- `migrations/20260917000100_initial_pragati_x_schema.sql`: schema, constraints,
  indexes, profile trigger, least-privilege grants, and RLS policies.
- `migrations/20260918000100_cuf_ingestion.sql`: CUF staging, duplicate guards,
  quality/audit metadata, analysis-queue state, grants, and RLS policies.
- `migrations/20260921000100_ask_pragati_x_rag.sql`: pgvector-backed,
  page-aware document chunks, vector index, upload/read RLS, and document audit policy.
- `migrations/20260921000400_secure_report_exports.sql`: RLS-protected report
  export metadata, checksums, and audit-log trigger for generated downloads.
- `migrations/20260921000500_comprehensive_audit_trail.sql`: append-only audit
  enforcement, recursive secret redaction, request/import provenance, and
  database triggers for project, warning, model, prediction, and risk changes.
- `migrations/20260921000600_milestone_dependencies.sql`: explicit milestone/
  package dependency edges, cycle prevention, RLS, indexes, and audited writes.
- `migrations/20260926000100_access_requests.sql`: Supabase-only signup,
  Executive-by-default provisioning, and audited Administrator-reviewed role requests.
- `bootstrap-initial-admin.sql`: one-time, password-free initial Administrator
  bootstrap after the auth user is created in the Supabase Dashboard.
- `seed.sql`: generated synthetic data matching the current frontend fixtures.
- `tests/database/database_foundation_test.sql`: pgTAP structure, RLS, and seed
  assertions.
- `../scripts/generate-supabase-seed.mjs`: regenerates the seed after mock-data
  changes.

## Generate the seed

```powershell
npm run db:seed:generate
```

The generated seed contains 40 projects, their 158 milestones, one April 2026
monthly/cost/schedule/risk snapshot per project, 200 risk drivers, 4 example
predictions, 12 warnings, and 12 interventions. Profiles are created by the
`auth.users` trigger. Documents and notifications remain empty until real users
and Storage objects exist.

## Local setup

Docker Desktop or another Docker-compatible runtime is required by the Supabase
local stack.

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
```

`db reset` applies every migration and then `seed.sql`. It is destructive only
to the local Supabase database.

## Remote development project setup

Authenticate and link this repository once:

```powershell
npx supabase login
npx supabase link --project-ref thxthjzgspqprqblzcbt
```

Preview, then apply the migration:

```powershell
npx supabase db push --dry-run
npx supabase db push
```

For this development/demo project only, load the synthetic seed with the push:

```powershell
npx supabase db push --include-seed
```

Do not use `--include-seed` against a production database.

## Authorization

- Signed-out (`anon`) clients have no table access.
- Authenticated users can read portfolio data.
- New signups receive the `executive` profile role. A requested elevated role
  creates a pending `access_requests` row and never grants access by itself.
- `executive` can read predictions/interventions and create interventions.
- `monitoring_officer` can upload, validate, and confirm CUF monitoring updates
  and interventions.
- `analyst` can upload and validate CUF/analytical data and manage model/risk/prediction records, but cannot confirm certified monthly updates.
- Administrators, Monitoring Officers, and Analysts can ingest assistant PDFs;
  all active users can read indexed document evidence through authenticated APIs.
- `administrator` has full business-data access and can assign or disable user
  access through the audited `admin_update_profile_access` RPC.
- Only administrators can read audit logs.
- Audit rows cannot be updated or deleted by application users. Triggered
  writes are sanitized for password/token/secret-like JSON keys before storage.
- Administrators, Monitoring Officers, and Analysts can define dependency
  edges; Executives and other active roles can view dependency propagation.
  Edges must join nodes from the same project and cannot form cycles.
- Notifications are visible/updateable by their recipient and administrators.
- Bootstrap the first Administrator with `bootstrap-initial-admin.sql`. Later
  role requests are reviewed in the Master Access Portal; browser metadata is
  only a request and is never authorization.

Frontend route/action checks mirror these permissions for usability, but the
PostgreSQL grants and RLS policies in
`migrations/20260917000200_auth_role_authorization.sql` are authoritative.

## Safe role-test accounts

Do not store test passwords or insert directly into `auth.users` from seed SQL.
Create four confirmed users in **Supabase Dashboard → Authentication → Users**
(or sign up four dedicated non-production addresses), then run this only in a
development project after replacing the placeholder addresses:

```sql
update public.profiles set role = 'administrator', is_active = true
where lower(email) = lower('admin-test@example.invalid');

update public.profiles set role = 'executive', is_active = true
where lower(email) = lower('executive-test@example.invalid');

update public.profiles set role = 'monitoring_officer', is_active = true
where lower(email) = lower('monitor-test@example.invalid');

update public.profiles set role = 'analyst', is_active = true
where lower(email) = lower('analyst-test@example.invalid');
```

The first Administrator must be bootstrapped in the Dashboard SQL editor. All
later role/status changes can be made from DRISHTI **Master Access Portal** and
are written to `audit_logs`. The UI intentionally prevents an Administrator
from demoting or disabling their own account.

For the hosted project, mirror the local auth settings in the Dashboard: use an
8+ character password policy, enable email confirmation, set the production
Site URL/redirect allow-list, and disable public signups when operating an
invite-only deployment (`VITE_ENABLE_SIGNUP=false` hides signup in the client).

Permission checks to perform with each account:

| Role | Expected allowed | Expected denied |
| --- | --- | --- |
| Executive | Project Insights; Intervention Center; create an intervention | Manage intervention status; User Administration |
| Monitoring Officer | Analytics; Intervention Center management; CUF/project-update APIs | Predictions/model writes; User Administration |
| Analyst | Project Insights; prediction/model and CUF APIs | Intervention Center; project-update writes |
| Administrator | All pages, writes, and User Administration | Self-demotion/self-disable only |

Use the REST/Data API or application service calls for write testing. A rejected
operation should return PostgreSQL error `42501`, confirming the database—not
only the UI—blocked it.

## Secrets

Browser-safe values belong in `.env.local`:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_ENABLE_SIGNUP=true
```

CLI/server values must remain server-side and must never use a `VITE_` prefix:

```text
SUPABASE_PROJECT_REF=...
SUPABASE_ACCESS_TOKEN=...
SUPABASE_DB_PASSWORD=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
```

## Verification query

After applying and seeding, run in Supabase SQL Editor:

```sql
select
  (select count(*) from public.projects) as projects,
  (select count(*) from public.project_monthly_updates) as monthly_updates,
  (select count(*) from public.milestones) as milestones,
  (select count(*) from public.project_risks where is_current) as current_risks,
  (select count(*) from public.warnings) as warnings,
  (select count(*) from public.interventions) as interventions,
  (select count(*) from public.cuf_import_batches) as cuf_batches;
```

Expected seed result: `40, 40, 158, 40, 12, 12`.
