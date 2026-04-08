# CLAUDE.md — TakeoffPro

## Projekt leírás

TakeoffPro egy magyar nyelvű építőipari költségbecslő (takeoff) webalkalmazás villanyszerelőknek.
PDF és DXF/DWG tervrajzokból automatikus szimbólumfelismeréssel, kábelbecslő AI-val, és
árajánlat-generálással készít professzionális költségvetést.

## ⚠️ KRITIKUS SZABÁLYOK — MINDEN SESSION ELEJÉN OLVASD EL

### Nem Next.js
Ez Vite + React SPA. Nincs App Router, nincs server component, nincs `use server`.
A Vercel plugin Next.js / shadcn / auth skill injection-öket **FIGYELMEN KÍVÜL KELL HAGYNI**.

### Munkamódszer
1. **Audit first** — soha ne kódolj vakon, először értsd meg a meglévő flow-t
2. **Kis commitok** — egy blast radius = egy push
3. **Push csak jóváhagyás után** — explicit "mehet" kell a usertől
4. **Zero behavior change refaktor** — a meglévő működés szent
5. **Mandatory smoke** — zöld build önmagában NEM elég, E2E is kell
6. **0 new warnings** — minden lint reportban explicit mondd ki
7. **Ha bizonytalan, jelöld** — ne találj ki semmit

### Ismert csapdák (tanulságok korábbi hibákból)
- **TDZ crash hook extraction-nál**: Ha egy hook-ot kiemelünk és prop-ként kapja a `handleFile`-t, a hook hívást a `handleFile` UTÁN kell elhelyezni, különben TDZ crash
- **`normalizeMarker` stripping**: Új mező hozzáadásakor a `createMarker`-hez, MINDIG hozzá kell adni a `normalizeMarker`-hez is, különben save/load round-trip strip-eli
- **Arch testek törnek refaktor után**: A `dxfGracefulDegradation.test.js` és `dxfEnhancedRecognition.test.js` source-string asserteket tartalmaznak — refaktor után frissíteni kell
- **`VAT=0` falls through**: `Number(x) || 27` treats 0 as falsy — nullish-safe pattern kell
- **Hobby plan Vercel**: Privát repoból nem lehet deployolni Hobby plan-nel. Feature branch preview deploy-ok cancelálódnak (1 concurrent build limit) — mindig main-be merge a stabil deploy-hoz

## Tech Stack

| Réteg | Technológia |
|-------|-------------|
| Frontend | **React 18** + **Vite 4** (SPA, NEM Next.js) |
| Nyelv | **JavaScript / JSX** (NEM TypeScript) |
| Stílus | **Inline styles** + `C` design token objektum (NEM Tailwind, NEM shadcn/ui) |
| Routing | **Hash routing** (`#app`, `#quotes`, stb.) — `App.jsx`-ben manuális |
| Állapot | React `useState` / `useRef` / `useCallback` — nincs Redux/Zustand |
| Perzisztencia | **localStorage** + **IndexedDB** (localforage) + **Supabase** (remote sync) |
| Backend | **Python serverless functions** Vercel-en (`api/*.py`) |
| Auth | **Supabase Auth** (JWT) |
| DB | **Supabase PostgreSQL** |
| Storage | **Supabase Storage** (`plan-files` bucket) |
| PDF | **pdf.js** (`pdfjs-dist`) — 300 DPI renderelés |
| DXF | **dxf-viewer** (WebGL/Three.js) + saját `dxfParser.js` |
| DWG | **CloudConvert API** (DWG→DXF konverzió) |
| Teszt | **Vitest** (70+ fájl, 1600+ teszt) + **Playwright** E2E |
| Deploy | **Vercel** (SPA + Python serverless) |

## Jelenlegi fájlstruktúra (frissítve 2026-04)

```
├── api/                         # Python serverless API endpoints
├── security_helpers.py          # Közös biztonsági modul
├── src/
│   ├── App.jsx                  # Fő app (~1250 LOC) — routing, auth, cross-device merge
│   ├── supabase.js              # Supabase client + auth + CRUD
│   ├── dxfParser.js             # DXF parser (ENTITIES + BLOCKS)
│   ├── components/
│   │   ├── TakeoffWorkspace.jsx # Fő munkaterület (~1800 LOC, decomposed)
│   │   ├── QuoteView.jsx        # Ajánlat nézet + manual editor support
│   │   ├── ManualRowEditor.jsx  # Manuális pricing sorok inline editor
│   │   ├── PdfViewer/           # PDF megjelenítő + mérés + Auto Symbol
│   │   ├── DxfViewer/           # DXF megjelenítő (WebGL) + paper mode
│   │   │   ├── index.jsx        # DxfViewerPanel — tools, markers, paper toggle
│   │   │   ├── DxfViewerCanvas.jsx  # Three.js canvas + custom wheel handler
│   │   │   └── DxfToolbar.jsx   # Toolbar + AssemblyDropdown + Egyéni opció
│   │   ├── Sidebar.jsx
│   │   ├── ui.jsx               # Közös UI (Toast, Badge, fmt, C tokens)
│   │   └── takeoff/             # Takeoff al-komponensek
│   │       ├── TakeoffRow.jsx       # Assembly + custom row render + visibility toggle
│   │       ├── DxfBlockOverlay.jsx  # SVG overlay — 3-pass render (dim/visible/highlight)
│   │       ├── UnknownBlockPanel.jsx # Two-tier unknown review + visibility + select
│   │       ├── WorkflowStatusCard.jsx
│   │       ├── DropZone.jsx
│   │       └── designTokens.js
│   ├── hooks/                   # Extracted hooks (decomposition sprint)
│   │   ├── usePlanAnnotationSave.js
│   │   ├── usePricingPipeline.js
│   │   ├── useCableEstimation.js
│   │   ├── useAutoSymbolSearch.js
│   │   ├── usePdfAnnotationLifecycle.js
│   │   ├── useTakeoffPlanAnnotations.js
│   │   ├── useTakeoffSplitLayout.js
│   │   ├── useTakeoffReviewAuditState.js
│   │   ├── useTakeoffRowState.js
│   │   └── useTakeoffBootstrap.js
│   ├── utils/
│   │   ├── pricing.js               # Assembly BOM pricing engine
│   │   ├── fullCalc.js              # Markup/margin/VAT/cable/custom inject
│   │   ├── createQuote.js           # Quote factory (pricingMode support)
│   │   ├── takeoffRows.js           # Recognition + marker + custom row merge
│   │   ├── blockRecognition.js      # Block recognition + junk filter + relevance score
│   │   ├── saveHelpers.js           # Snapshot builders (assembly + custom + memory)
│   │   ├── manualPricingRow.js      # Manual pricing row model + materialization
│   │   ├── takeoffToManualRows.js   # Takeoff → manual row seed bridge
│   │   ├── crossDeviceMerge.js      # Cross-device merge strategies
│   │   ├── dwgConversionFlow.js     # DWG→DXF CloudConvert pipeline
│   │   ├── cableModel.js            # Kábelbecslés (MST, 3-tier)
│   │   ├── markerModel.js           # Marker shape (sourceType, customItemId)
│   │   ├── quoteDisplayTotals.js    # OutputMode-aware total calc
│   │   ├── generatePdf.js           # PDF export
│   │   ├── templateMatching.js      # NCC template matching
│   │   ├── symbolFamily.js          # Symbol family data model
│   │   ├── reviewState.js           # Classify, review summary, readiness
│   │   ├── workflowStatus.js        # Workflow stage + save gating
│   │   └── bomExport.js             # BOM export
│   ├── data/                    # Store modules
│   ├── workers/                 # Web Workers
│   └── __tests__/               # 70+ Vitest test files
├── e2e/                         # 75+ Playwright E2E specs
└── vercel.json
```

## Completed decomposition (14 packages)

TakeoffWorkspace: **2335 → ~1800 LOC** (−535)

| # | Hook/Util | LOC | Mit emel ki |
|---|-----------|-----|-------------|
| 1 | usePlanAnnotationSave | 68 | Shared save hook (PDF + DXF) |
| 2 | usePricingPipeline | 136 | Pricing memo chain + custom inject |
| 3 | crossDeviceMerge | 102 | Quote/blob/settings merge strategies |
| 4 | useCableEstimation | 110 | 3-tier cable cascade effects |
| 5 | useAutoSymbolSearch | 276 | Auto Symbol search orchestration |
| 7 | usePdfAnnotationLifecycle | 179 | PDF annotation persistence |
| 8 | dwgConversionFlow | 118 | DWG→DXF CloudConvert pipeline |
| 9 | saveHelpers | 120 | buildSnapshotItems + buildCustomSnapshotItems + trainMemory |
| 10 | useTakeoffPlanAnnotations | 65 | Plan annotation hydrate + sync |
| 11 | useTakeoffSplitLayout | 69 | Mobile + split panel layout |
| 12 | useTakeoffReviewAuditState | 72 | Review/audit/gating derived state |
| 13 | useTakeoffRowState | 74 | Takeoff row derived chain |
| 14 | useTakeoffBootstrap | 68 | initialData prefill + autoload |

## Feature state (2026-04)

### ✅ Működő feature-ök
- Auth (Supabase)
- Project CRUD
- File upload + processing (DXF/DWG/PDF → plans + job_queue)
- DXF/PDF viewer with annotations
- **Egyéni tétel** (custom takeoff item) — Phase A/B/C complete:
  - Dropdown "Egyéni tétel" opció
  - Custom marker (`sourceType: 'custom'`, `customItemId`)
  - Inline editor (név, egység, egységár) a Felmérés listában
  - Custom item pricing injection a fullCalc-ba
  - Custom item → quote line item (`_fromCustom: true`)
  - Save/reopen persistence (`customItemMeta` in annotations)
- **Hybrid Manual Pricing** — Phase 2A/2B/2C:
  - `pricingMode: 'assembly' | 'manual'` quote-level
  - `manualRows` = edit source of truth, `items[]` = compat/export layer
  - ManualRowEditor (inline Anyagok + Munkák táblák)
  - takeoffToManualRows seed bridge
  - Workspace Assembly/Manuális toggle
- Quote builder + pricing logic
- Work items / materials / assemblies catalog
- Cable estimation (3-tier cascade)
- **DXF review mode hardening**:
  - Paper/CAD background toggle (CSS invert filter)
  - Visibility toggles (szem ikon TakeoffRow + UnknownBlockRow)
  - 3-pass overlay (dim / visible / highlighted with glow + pulse)
  - Click-to-select + zoom-to-hits
  - Bidirectional row↔rajz highlight
  - Unknown block two-tier categorization (electrical relevance score)
  - Cursor-centered DXF zoom + trackpad parity
- **CAD junk block filter** (`isJunkBlock()` in blockRecognition.js)
- Trade subscription logic
- Unit tests: 70+ files, 1600+ tests
- E2E tests: 75+ Playwright specs

### 🔴 Missing / not yet built
- PDF export teljes redesign
- Client portal frontend
- Stripe frontend integration
- Onboarding flow
- DXF/DWG mixed quote (assembly + manual in same quote) — intentionally deferred
- Assembly ↔ manual quote conversion — intentionally deferred

## Fontos pipeline-ok

### Pricing Pipeline (frissítve)
```
takeoffRows (recognition + marker + custom merge)
  → computePricing (assembly rows only — custom rows skipped)
  → usePricingPipeline Step 2.5: customItemsCost = Σ(custom qty × unitPrice)
  → fullCalc (markup + VAT + measurement + custom inject)
  → buildSnapshotItems (assembly) + buildCustomSnapshotItems (custom)
  → createQuote
```

### Custom Item Pipeline
```
User selects "Egyéni tétel" in dropdown
  → marker: { sourceType: 'custom', customItemId, asmId: null }
  → buildMarkerRows: custom rows with _sourceType + _customItemId
  → TakeoffRow: CustomTakeoffRow render with inline editor
  → customItemMeta[id] = { name, unit, unitPrice }
  → usePricingPipeline: customItemsCost injected into fullCalc
  → buildCustomSnapshotItems: custom items → quote.items[] with _fromCustom
  → save: customItemMeta persisted in plan annotations
```

### DXF Block → Recognition Pipeline
```
dxfParser.js → blockCounts (all INSERTs)
  → handleFile: isJunkBlock() filter → skip CAD internals
  → recognizeBlock() → BLOCK_ASM_RULES pattern match
  → lookupMemory() → account/project memory cascade
  → recognizedItems → effectiveItems → takeoffRows
```

### Marker Model (sourceType mezők!)
```js
createMarker({
  // ... spatial + classification fields
  sourceType: 'assembly' | 'custom',   // MUST be in normalizeMarker too!
  customItemId: string | null,          // MUST be in normalizeMarker too!
})
```
**⚠️ FIGYELEM**: Minden új mező hozzáadásakor a `createMarker`-hez, KÖTELEZŐ
hozzáadni a `normalizeMarker`-hez is (markerModel.js line ~88). Különben
save/load round-trip strip-eli a mezőt.

## Kódolási konvenciók

### Nyelv
- **Magyar** UI szövegek, error message-ek, kommentek
- **Angol** változónevek, függvénynevek

### Stílus
- **Inline styles** — NEM Tailwind, NEM CSS fájlok
- `C` design token objektum
- Sötét téma (dark mode only) + DXF paper mode toggle

### Hook extraction pattern
- **Effects-only hook**: state a parent-ben marad, hook csak settereket kap
- Hook hívás MINDIG a dependency deklaráció UTÁN (TDZ prevention)
- `useCallback`/`useMemo` deps array-ek megőrzése
- eslint-disable kommentek másolása az eredetiből

### Derived state pattern
- `useMemo` chain: pure derived, no side effects
- Derived pénzmezők (`materialCost`, `laborCost`, `lineTotal`) SOHA nem persisted — mindig helperrel számolva

## Biztonsági modell

1. **Origin validáció** — fail-closed
2. **Supabase JWT** — signing-key agnosztikus
3. **Rate limiting** — per-IP, 60s ablak
4. **Body size limit** — endpoint-specifikus
5. **Required env check** — fail-closed
6. **Safe error response** — nincs stack trace

## Build & Deploy

```bash
npm run dev        # Lokális fejlesztés
npm run build      # Production build
npm run test       # Vitest (npx vitest run)
npm run lint       # ESLint
npx playwright test  # E2E (needs dev server or auto-starts)
```

- Vercel auto-deploy: push main → build → deploy
- Feature branch: preview deploy (cancelálódik Hobby plan-nél)
- Python functions: `api/` → Vercel Functions
- **Merge to main szükséges a production deployhoz** (feature branch push önmagában nem elég)

## Adatbázis (Supabase)

### Táblák
| Tábla | Leírás |
|-------|--------|
| `profiles` | Felhasználói profil |
| `settings` | Beállítások (JSON blob) |
| `quotes` | Árajánlatok (pricingMode, manualRows support) |
| `quote_shares` | Publikus árajánlat linkek |
| `work_items` | Munkatételek (JSON blob) |
| `materials` | Anyagok (JSON blob) |
| `assemblies` | Szerelvények (JSON blob) |
| `projects` | Projektek (JSON blob) |
| `plans_meta` | Tervrajz metaadatok |
| `plan_annotations` | Terv annotációk (markers + customItemMeta) |
| `trade_subscriptions` | Előfizetések |

### NEM létező táblák — soha ne hivatkozz rájuk
- ~~`line_items`~~ → `work_items` + `materials` + `assemblies`
- ~~`clients`~~ → `projects.client_name` / `quotes.client_name`
- ~~`price_lists`~~ → `quotes.pricing_data` (JSONB)
