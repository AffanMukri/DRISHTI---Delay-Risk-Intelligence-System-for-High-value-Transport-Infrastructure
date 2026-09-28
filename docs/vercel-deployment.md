# DRISHTI production deployment: Vercel + Supabase

The repository is configured as one Vercel project:

- Vite/React is built to `dist`.
- `api/index.py` exposes the existing FastAPI application under `/api/*`.
- Supabase provides authentication and PostgreSQL.
- No dummy account or password is bundled in the browser.

## 1. Apply the database migrations

From the repository root, authenticate and link the Supabase project:

```powershell
npx supabase login
npx supabase link --project-ref thxthjzgspqprqblzcbt
npx supabase db push --dry-run
npx supabase db push
```

Do not use `--include-seed` for production.

## 2. Create the initial Administrator safely

In **Supabase Dashboard -> Authentication -> Users**, create and confirm:

```text
affanmukri007@gmail.com
```

Set the password in the Supabase Dashboard only. Never put it in Git, a Vercel
environment variable, SQL, or frontend code. Use a unique production password
and enable MFA before handling real project data.

Then open **Supabase Dashboard -> SQL Editor** and run
`supabase/bootstrap-initial-admin.sql`. It makes that profile the sole initial
Administrator and records the bootstrap in the audit log.

## 3. Configure Supabase Auth URLs

After Vercel assigns the production domain, set in **Authentication -> URL
Configuration**:

- Site URL: `https://YOUR-PROJECT.vercel.app`
- Redirect URL: `https://YOUR-PROJECT.vercel.app/**`
- Preview redirect URL, if previews are needed: `https://*-YOUR-TEAM.vercel.app/**`

Keep email/password authentication enabled. New accounts start as Executive.
Requests for Administrator, Monitoring Officer, or Analyst are recorded as
pending and must be approved by the Administrator in **Master Access Portal**.

## 4. Import the GitHub repository into Vercel

1. Open <https://vercel.com/new> and import the DRISHTI GitHub repository.
2. Keep the repository root as the Root Directory.
3. Framework Preset: **Vite**.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.
6. Do not override the install command.

The committed `vercel.json`, `.python-version`, root `requirements.txt`, and
`api/index.py` provide the remaining build/runtime configuration.

## 5. Add Vercel environment variables

Add the variables below to Production and Preview. Use the exact production URL
for `CORS_ORIGINS` after the first deployment.

```text
VITE_SUPABASE_URL=https://thxthjzgspqprqblzcbt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase anon/publishable key>
VITE_ENABLE_SIGNUP=true
VITE_API_BASE_URL=/api
VITE_DATA_SOURCE=backend
VITE_ENABLE_MOCK_FALLBACK=false

APP_ENV=production
API_PREFIX=/api
LOG_LEVEL=INFO
DATABASE_URL=<Supabase transaction-pooler PostgreSQL URI with sslmode=require>
DB_POOL_SIZE=1
DB_MAX_OVERFLOW=0
DB_POOL_TIMEOUT_SECONDS=10
SUPABASE_URL=https://thxthjzgspqprqblzcbt.supabase.co
SUPABASE_PUBLISHABLE_KEY=<same Supabase anon/publishable key>
CORS_ORIGINS=["https://YOUR-PROJECT.vercel.app"]
OLLAMA_ENABLED=false
ML_ARTIFACT_DIR=/tmp/drishti/ml
EXPERIMENT_ARTIFACT_DIR=/tmp/drishti/experiments
ASSISTANT_DOCUMENT_DIR=/tmp/drishti/documents
```

`DATABASE_URL` and any future service-role key are server-only. Never prefix
them with `VITE_`. The current deployment does not require a service-role key.
For Vercel, copy the **Transaction pooler** URI from Supabase **Connect**; the
backend disables prepared statements and keeps each warm function's pool small
for compatibility with this serverless connection mode.

Vercel's filesystem is ephemeral. `/tmp` prevents write failures, but trained
ML artifacts and uploaded RAG documents that must survive deployments should
later move to durable object storage. Ollama is deliberately disabled because a
local Ollama daemon is not available inside a Vercel Function.

The `api/index.py` entry point enables the compact serverless runtime. It keeps
health, public enquiry, projects, portfolio, deterministic analytics,
benchmarking, risks, warnings, interventions, audit, evidence, dependencies,
and CUF ingestion within Vercel's 500 MB uncompressed function limit. Native
scientific and document-rendering packages are intentionally absent from the
root `uv.lock`; ML prediction/experiments/monitoring, document RAG, and rendered
report endpoints return a structured `503 full_runtime_required` response.
The full dependency set remains in `backend/requirements.txt` for a persistent
Python/container deployment. CUF confirmation still performs deterministic
risk and warning analysis when the ML runtime is unavailable.

## 6. Deploy and verify

Click **Deploy**, then verify:

```text
https://YOUR-PROJECT.vercel.app/
https://YOUR-PROJECT.vercel.app/api/health
https://YOUR-PROJECT.vercel.app/api/docs
```

Sign in as the initial Administrator and check **Administration -> Master
Access Portal**. Create a separate user through signup while requesting Analyst
or Monitoring Officer. Confirm that the account initially has Executive access,
that its request appears as Pending, and that its role changes only after
Administrator approval.

To enable ML inference, SHAP, model monitoring, PDF/RAG ingestion, and generated
reports in production, deploy `backend/` on a persistent Python container host
using `backend/requirements.txt`. Then set `VITE_API_BASE_URL` to that HTTPS
backend `/api` URL and set backend `CORS_ORIGINS` to the Vercel frontend domain.
