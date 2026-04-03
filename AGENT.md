# AGENT.md — TakeoffPro Autonomous Task Rules

> This file governs how Claude Code agents behave when working autonomously on TakeoffPro.
> Read this before starting any multi-step task.
> For full tech stack details, see CLAUDE.md.

---

## PROJECT ROOT

```
/Users/horvathadam/Desktop/-raj-nlat.DWG-main 5/
```

Key directories:
```
├── src/                  # React 18 + Vite SPA source
│   ├── components/       # UI components (inline styles, C design tokens)
│   ├── pages/            # Hash-route pages (#app, #quotes, #settings, ...)
│   ├── utils/            # Business logic, pricing, PDF, cable model, etc.
│   ├── data/             # Local stores (localStorage + IndexedDB + Supabase sync)
│   ├── workers/          # Web workers (DXF parser)
│   └── __tests__/        # Vitest unit tests (51 files, 1301 tests)
├── e2e/                  # Playwright E2E tests (30 specs)
├── api/                  # Python serverless functions (Vercel Functions)
├── supabase/migrations/  # Applied SQL migrations
└── vercel.json           # Vercel deployment config
```

Entry point: `index.html` + `src/main.jsx`
Config: `vite.config.js`

---

## STACK REMINDERS

- **Vite + React 18 SPA** — NOT Next.js
- **JavaScript / JSX** — NOT TypeScript
- **Inline styles + `C` design token object** — NOT Tailwind, NOT shadcn/ui
- **Hash routing** (`window.location.hash`) — NOT React Router
- **Python serverless** (`api/*.py`) — NOT Node.js API routes
- Do NOT generate Next.js patterns, server components, `use server`, or App Router code

---

## REAL DATABASE SCHEMA (Supabase)

All tables have RLS enabled. Never bypass.

### Core tables
| Table | Purpose | Key columns |
|-------|---------|-------------|
| `profiles` | User profile + billing | `user_id` (FK auth.users), `plan`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_end` |
| `projects` | Projects (JSON blob) | `user_id` (unique) |
| `plans_meta` | Plan file metadata (JSON blob) | `user_id` (unique) |
| `plan_annotations` | Per-plan annotation backup | `user_id` + `plan_id` (unique), `data` JSONB |
| `quotes` | Cost quotes | `user_id` + `quote_number` (unique), `pricing_data` JSONB |
| `quote_shares` | Client portal tokens | `token` (unique hex), `status`: pending/accepted/expired |
| `trade_subscriptions` | Per-trade billing | `user_id`, `trade_id`: erosaram/gyengaram/tuzjelzo |

### Catalog tables (stored as JSONB arrays per user)
| Table | Purpose |
|-------|---------|
| `work_items` | Work item catalog (labor) |
| `materials` | Material catalog |
| `assemblies` | Assembly bundles |
| `settings` | User settings as JSONB blob |

### Tables that do NOT exist (don't reference these)
- ~~`line_items`~~ — use `work_items` + `materials` + `assemblies`
- ~~`clients`~~ — client data lives in quote/project JSON
- ~~`price_lists`~~ — pricing lives in `quotes.pricing_data` (JSONB) and catalog tables
- ~~`plans`~~ — the table is called `plans_meta`
- ~~`job_queue`~~ — no async job queue exists

### Applied migrations
1. `20260327_quote_shares` — quote_shares table + RLS
2. `20260401_plan_annotations` — plan_annotations table + RLS

---

## WHAT IS DONE vs MISSING

### Working (do not rewrite from scratch)
- Auth flow (Supabase Auth, mandatory login gate in App.jsx)
- Project CRUD (`projects` table)
- File upload + DXF/DWG/PDF viewer with annotations
- DWG conversion pipeline (CloudConvert API via `api/convert-dwg.py`, auth protected)
- Quote builder with pricing logic (`quotes` table, `pricing.js`, `fullCalc.js`, `quoteDisplayTotals.js`)
- Client quote portal (`QuotePortal.jsx` + `#quote/{token}` route + `quote_shares` table)
- Work items / materials / assemblies catalog management
- Trade subscription logic (`trade_subscriptions` table)
- Cable estimation (`cableModel.js`, 3-tier cascade: DXF layers / MST / device count)
- Block recognition (`blockRecognition.js`, BLOCK_ASM_RULES)
- DXF parser (ENTITIES + BLOCKS, LWPOLYLINE + classic POLYLINE, Web Worker)
- Auto Symbol (NCC template matching in `templateMatching.js`)
- Measurement pipeline (PdfViewer/DxfViewer → measurementItems → fullCalc → grandTotal)
- Security helpers (`security_helpers.py`: origin check, rate limit, JWT auth, body size)
- Proactive token refresh (`getAuthHeaders` in `supabase.js`)
- 401-retry on DWG convert (refresh + single retry in TakeoffWorkspace)
- E2E tests (Playwright, 30 specs)
- Unit tests (Vitest, 51 files, 1301 tests)

### Not yet built (safe to implement)
- **PDF export** — `utils/generatePdf.js` exists but may be incomplete
- **Stripe payment flow** — DB columns exist (`stripe_customer_id`, etc.) but no `create-checkout.py` or `stripe-webhook.py` yet
- **Onboarding flow** — no onboarding page exists

---

## AUTONOMOUS DECISION RULES

### Act without asking
- Create or edit files in `src/components/`, `src/pages/`, `src/utils/`
- Add new Vitest unit tests in `src/__tests__/`
- Add new E2E specs in `e2e/`
- Modify `src/data/` store files (but test after)
- Edit Python functions in `api/` (non-breaking changes)
- Update `vercel.json` routes (non-breaking additions)

### Always ask before doing
- Any change to Supabase DB schema (requires new migration file)
- Modifying existing RLS policies
- Changing `src/supabase.js` (shared client config)
- Installing new npm or pip packages
- Changing `vite.config.js`
- Modifying existing test assertions (fix the code, not the test)

### Never do
- Bypass RLS (`supabase.rpc()` with service role from client)
- Reference non-existent tables (`line_items`, `clients`, `price_lists`, `plans`, `job_queue`)
- Write Next.js-specific code (App Router, server actions, `use server`)
- Use Tailwind, shadcn/ui, or CSS files (inline styles + `C` tokens only)
- Use TypeScript (project is JavaScript/JSX)
- Hard-code mock/fake data into production components
- Modify migration files that are already applied
- Use `nearest match` for assembly matching (exact match or fallback ONLY)
- Throttle `drawOverlay` with requestAnimationFrame (causes stale closure bugs)

---

## AFTER EVERY CODE CHANGE

Run in this order:
```bash
# 1. Unit tests
npm run test

# 2. Lint check
npm run lint

# 3. Build check
npm run build
```

For DB changes, verify:
- RLS policy exists for the new table/column
- Migration file created in `supabase/migrations/`
- Migration timestamp is newer than `20260401`

---

## PYTHON API FUNCTIONS (`/api/*.py`)

Vercel Serverless Functions (Python runtime).
All use `security_helpers.py` (origin check → rate limit → auth → body size → env check).

| File | Purpose | Auth |
|------|---------|------|
| `ai.py` | OpenAI symbol recognition | `require_auth` |
| `cable-agent.py` | AI cable estimation | `require_auth` |
| `convert-dwg.py` | DWG→DXF via CloudConvert | `require_auth` |
| `meta-vision.py` | Plan metadata recognition | `require_auth` |
| `parse-dwg.py` | DWG analysis | `require_auth` |
| `parse-dxf.py` | DXF analysis | `require_auth` |
| `parse-pdf.py` | PDF analysis (AI) | `require_auth` |
| `parse-pdf-vectors.py` | PDF vector analysis | `require_auth` |
| `notify-quote-accepted.py` | Email on quote accept | rate limit + origin |

Rules:
- Never import secrets directly — use env vars
- `VITE_` prefix env vars are frontend-only (build-time) — Python uses non-prefixed versions
- All error messages in Hungarian

---

## BRIEF FILES (root level)

There are ~11 `*_BRIEF.md` files at the project root (e.g. `DETECTION_CTA_BRIEF.md`, `QUOTEVIEW_EDIT_BRIEF.md`).
These are feature specification documents.
**Read the relevant BRIEF before implementing any feature it describes.**
Do not delete or modify these files.

---

## VERCEL DEPLOYMENT

Project: `takeoffpro` (team: `hrvt7s-projects`)
Every push to `main` triggers a production Vercel deployment.
Other branches get preview deploys.
Python API functions are deployed alongside the frontend from `api/`.
