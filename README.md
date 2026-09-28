# DRISHTI

DRISHTI (Predictive & Early-Warning Intelligence for Central Sector Infrastructure Projects) is a React 19 + TypeScript + Vite frontend backed by FastAPI and
Supabase PostgreSQL/Auth. The existing dashboard UI is preserved; data access
is routed through the typed service layer in `src/services`.

## Frontend API configuration

Copy `.env.example` to `.env.local` and configure:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_DATA_SOURCE=backend
VITE_ENABLE_MOCK_FALLBACK=false
```

`VITE_DATA_SOURCE=backend` is the default. Use `VITE_DATA_SOURCE=mock` for an
explicit offline demo. Alternatively, `VITE_ENABLE_MOCK_FALLBACK=true` falls
back only after retryable network/server failures; authentication and
authorization failures are never hidden by fallback data.

Run the backend first (see `backend/README.md`), then start the frontend:

```powershell
npm install
npm run dev
```

### Local demonstration data

For an offline frontend data demonstration, keep `VITE_DATA_SOURCE=mock` and
run:

```powershell
npm run demo
```

Authentication always uses Supabase, including when the frontend is showing
the explicit local mock dataset. No dummy users or passwords are implemented
in the application bundle.

Useful checks:

```powershell
npm run build
npm run lint
npm run test:browser
```

## Production deployment

The Vite frontend and FastAPI entry point are prepared for a single Vercel
project. Follow [docs/vercel-deployment.md](docs/vercel-deployment.md) to apply
the Supabase migration, bootstrap the initial Administrator without committing
a password, configure environment variables, deploy, and verify role requests.

Administrators also have a **Model Monitoring** page showing registered model
versions, training metadata, feature lists, held-out metrics, last inference,
statistically gated drift checks, prediction shift, missingness changes, and
realized performance. Monitoring creates auditable reports only and never
triggers automatic retraining or deployment changes.

Project Intelligence now includes an interactive **Dependency & Risk
Propagation** view under Timeline & Milestones. It renders only explicitly
stored milestone/package edges; delayed upstream nodes highlight potentially
affected incomplete descendants with path and depth, without asserting that a
downstream delay is certain. Authorized users can define or remove edges, and
validated import clients can use the bulk dependency endpoint.

The browser verifier runs every authorized route against the retained mock
adapter, exercises the CUF upload/preview/confirm UI against an intercepted API
contract, and leaves backend API behavior to the Python tests.

Authorized Administrators, Monitoring Officers, and Analysts can open **Data
Management** to upload CSV/XLSX CUF submissions. Upload creates a validation
preview only; certified writes require a separate confirmation by an
Administrator or Monitoring Officer.

The Project Intelligence **Cost Prediction** tab only displays output from the
active versioned backend model. Administrators and Analysts can generate a new
result; Executives can review a persisted result. Demo/mock projects are
intentionally refused by the ML API. See `backend/README.md` for data-readiness,
training, evaluation, and artifact-registration commands.

Schedule overrun uses a separate model and artifact. Its outputs appear in the
Project Intelligence **Schedule Prediction** tab and the Schedule Analytics
project forecast panel. Reported planned/actual progress and purple predicted
progress are labelled separately.

After a certified CUF import, the backend now runs the registered cost and
schedule models when available, creates a new hybrid-risk snapshot, compares it
with the prior reporting cycle, and upserts persistent Early Warning Center
conditions. The warning detail view shows provenance, current/previous values,
evidence, recurrence count, and the recommended next action. Warning workflow
status changes are persisted through the API rather than held only in browser
state.

The Intervention Center implements the persistent Warning → Intervention →
Assignment → Deadline → Updates → Escalation → Resolution workflow. Warning
details can prefill a linked intervention; officer assignment, deadlines,
action descriptions, remarks, escalation reasons, resolution notes, and the
full activity timeline are loaded from the backend. Overdue interventions are
detected and persisted by the database workflow.

## Original Vite notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
