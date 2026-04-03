# CLAUDE.md — TakeoffPro

## Projekt leírás

TakeoffPro egy magyar nyelvű építőipari költségbecslő (takeoff) webalkalmazás villanyszerelőknek.
PDF és DXF/DWG tervrajzokból automatikus szimbólumfelismeréssel, kábelbecslő AI-val, és
árajánlat-generálással készít professzionális költségvetést.

## Tech Stack

| Réteg | Technológia |
|-------|-------------|
| Frontend | **React 18** + **Vite 4** (SPA, NEM Next.js) |
| Nyelv | **JavaScript / JSX** (NEM TypeScript) |
| Stílus | **Inline styles** + `C` design token objektum (NEM Tailwind, NEM shadcn/ui) |
| Routing | **Hash routing** (`#app`, `#quotes`, `#settings`, stb.) — az `App.jsx`-ben manuális `window.location.hash` |
| Állapot | React `useState` / `useRef` / `useCallback` — nincs Redux/Zustand |
| Perzisztencia | **localStorage** + **IndexedDB** (localforage) + **Supabase** (remote sync) |
| Backend | **Python serverless functions** Vercel-en (`api/*.py`) |
| Auth | **Supabase Auth** (JWT, ~1h token lifetime, autoRefreshToken) |
| DB | **Supabase PostgreSQL** |
| Storage | **Supabase Storage** (`plan-files` bucket) |
| Monitoring | **Sentry** (`@sentry/react`) |
| PDF | **pdf.js** (`pdfjs-dist`) — 300 DPI renderelés |
| DXF | **dxf-viewer** (WebGL) + saját `dxfParser.js` |
| DWG | **CloudConvert API** (DWG→DXF konverzió) |
| Teszt | **Vitest** |
| Deploy | **Vercel** (SPA + Python serverless) |

## Mappastruktúra

```
├── api/                    # Python serverless API endpoints (Vercel Functions)
│   ├── ai.py               # OpenAI szimbólumfelismerés
│   ├── cable-agent.py      # AI kábelbecslés
│   ├── convert-dwg.py      # DWG→DXF CloudConvert proxy
│   ├── meta-vision.py      # Tervrajz metaadat felismerés
│   ├── notify-quote-accepted.py  # Email értesítés árajánlat elfogadáskor
│   ├── parse-dwg.py        # DWG elemzés
│   ├── parse-dxf.py        # DXF elemzés
│   ├── parse-pdf.py        # PDF elemzés (AI)
│   └── parse-pdf-vectors.py # PDF vektor elemzés
├── security_helpers.py     # Közös biztonsági modul (CORS, auth, rate limit)
├── src/
│   ├── App.jsx             # Fő alkalmazás — routing, auth gate, összes oldal
│   ├── Landing.jsx         # Landing page (nem bejelentkezett)
│   ├── supabase.js         # Supabase client + auth + CRUD helpers
│   ├── dxfParser.js        # DXF fájl parser (ENTITIES + BLOCKS szekciók)
│   ├── components/
│   │   ├── TakeoffWorkspace.jsx  # Fő munkaterület (~2189 LOC)
│   │   ├── PdfViewer/            # PDF megjelenítő + mérés + szimbólumfelismerés
│   │   ├── DxfViewer/            # DXF megjelenítő (WebGL)
│   │   ├── Sidebar.jsx           # Navigáció
│   │   ├── ErrorBoundary.jsx
│   │   ├── ui.jsx                # Közös UI komponensek (Toast, Badge, fmt)
│   │   └── takeoff/              # Takeoff al-komponensek
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Quotes.jsx
│   │   ├── WorkItems.jsx
│   │   ├── Materials.jsx
│   │   ├── Assemblies.jsx
│   │   ├── Settings.jsx
│   │   ├── Projektek.jsx
│   │   └── QuotePortal.jsx      # Publikus árajánlat megtekintés (token alapú)
│   ├── data/
│   │   ├── store.js              # localStorage CRUD (settings, quotes, workItems, materials, assemblies)
│   │   ├── planStore.js          # IndexedDB plan fájlok + meta
│   │   ├── projectStore.js       # Projektek kezelése (guardedWrite)
│   │   ├── symbolDictionary.js   # Szimbólum katalógus
│   │   ├── trades.js             # Szakmák definíciói
│   │   └── quoteDefaults.js      # Árajánlat alapértékek
│   ├── utils/
│   │   ├── fullCalc.js           # Pénzügyi számítás (takeoff + measurement + markup)
│   │   ├── createQuote.js        # Árajánlat objektum építés
│   │   ├── takeoffRows.js        # Recognition + marker sorok merge
│   │   ├── blockRecognition.js   # DXF BLOCK felismerés + kábeltípus osztályozás
│   │   ├── cableModel.js         # Kábelbecslés (MST, 3-tier cascade)
│   │   ├── pricing.js            # Árazás motor
│   │   ├── quoteDisplayTotals.js # Markup/margin számítás
│   │   ├── templateMatching.js   # NCC template matching (Auto Symbol)
│   │   ├── generatePdf.js        # PDF árajánlat generálás (jsPDF)
│   │   └── bomExport.js          # BOM export
│   └── workers/
│       └── dxfParser.worker.js   # Web Worker DXF parsing
├── vercel.json                   # Vercel config (rewrites, headers, function timeouts)
├── vite.config.js
└── package.json
```

## Adatbázis (Supabase)

### Táblák
| Tábla | Leírás | Kulcs |
|-------|--------|-------|
| `profiles` | Felhasználói profil | `user_id` (FK auth.users) |
| `settings` | Beállítások (JSON blob) | `user_id` (unique) |
| `quotes` | Árajánlatok | `user_id` + `quote_number` (unique) |
| `quote_shares` | Publikus árajánlat linkek | `token` (auto-generated hex), `quote_id`, `user_id` |
| `work_items` | Munkatételek (JSON blob) | `user_id` (unique) |
| `materials` | Anyagok (JSON blob) | `user_id` (unique) |
| `assemblies` | Szerelvények (JSON blob) | `user_id` (unique) |
| `projects` | Projektek (JSON blob) | `user_id` (unique) |
| `plans_meta` | Tervrajz metaadatok (JSON blob) | `user_id` (unique) |
| `plan_annotations` | Terv annotációk | `user_id` + `plan_id` (unique) |
| `trade_subscriptions` | Előfizetések | `user_id` |

### Storage
- **`plan-files`** bucket: PDF/DXF/DWG fájlok (`{user_id}/{plan_id}.{ext}`)

## Kódolási konvenciók

### Nyelv
- **Magyar** UI szövegek, error message-ek, kommentek (a kódban is)
- **Angol** változónevek, függvénynevek, CSS property-k

### Stílus
- **Inline styles** mindenhol — NEM használunk CSS fájlokat vagy Tailwind-ot
- A `C` objektum tartalmazza a design tokeneket (App.jsx tetején):
  ```js
  const C = {
    bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
    accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
    text: '#E4E4E7', muted: '#71717A', sidebar: '#0D0D0F',
    // ...
  }
  ```
- Sötét téma (dark mode only)

### Komponensek
- Funkcionális komponensek (nincs class component)
- `useState`, `useRef`, `useCallback`, `useEffect` — vanilla React
- Lazy loading: `React.lazy()` + `Suspense` a ritkán használt oldalakhoz
- Nincs prop-types vagy TypeScript — JSDoc kommentek ahol szükséges

### API végpontok
- Python `BaseHTTPRequestHandler` (Vercel serverless)
- `security_helpers.py` import minden endpoint-ban (fallback inline-nal)
- Biztonsági rétegek: origin check → rate limit → body size → (opcionális auth) → env check
- AI/compute endpointok: `require_auth` (Supabase JWT validáció)
- Egyszerű endpointok (pl. convert-dwg): rate limit + origin check elegendő
- Hibaüzenetek magyarul

### Routing
- Hash-based: `window.location.hash` — `#app`, `#quotes`, `#settings`, `#workitems`, `#assemblies`, `#materials`, `#projects`, `#privacy`, `#quote/{token}`
- Nincs react-router — manuális hash kezelés az App.jsx-ben
- SPA fallback: `vercel.json` rewrite `→ /index.html`

### Adatkezelés
- **Offline-first**: localStorage + IndexedDB az elsődleges
- **Remote sync**: Bejelentkezés után Supabase-ből tölt, módosítás után Supabase-be ment
- **Pre-logout sync**: Kijelentkezés előtt mind a 7 entitás szinkronizálása
- **guardedWrite**: `projectStore.js`-ben cross-tab concurrency védelem

## Fontos pipeline-ok

### Measurement Pipeline
```
PdfViewer/DxfViewer → onMeasurementsChange → measurementItems (TakeoffWorkspace)
→ measurementCostTotal → fullCalc.js → grandTotal
```

### Pricing Pipeline
```
takeoffRows (recognition + marker merge) → computePricing → fullCalc → createQuote
```

### Kábelbecslés
- 3-tier cascade: DXF layers → MST (Minimum Spanning Tree) → device count fallback
- 6 kábeltípus: `light`, `socket`, `switch`, `data` (gyengeáram), `fire` (tűzjelző), `other`
- Assembly felismerés: `BLOCK_ASM_RULES` (4 árazott + 1 detektor)
- **nearest match TILOS** — csak exact match vagy fallback

### DXF Parser
- ENTITIES + BLOCKS szekciók (`*MODEL_SPACE`, `*PAPER_SPACE`)
- LWPOLYLINE + klasszikus POLYLINE+VERTEX+SEQEND
- Web Worker-ben fut (`dxfParser.worker.js`)
- Parse cache LRU (max 50 entry)

## Biztonsági modell

1. **Origin validáció** — fail-closed production-ben, `takeoffpro-*` és `raj-nlat-dwg*` Vercel URL-ek
2. **Supabase JWT** — `verify_supabase_token` a Supabase Auth API-n keresztül (signing-key agnosztikus)
3. **Rate limiting** — in-memory, per-IP, 60s ablak
4. **Body size limit** — endpoint-specifikus (1KB metadata, 5MB fájlok)
5. **Required env check** — fail-closed ha hiányzik API kulcs
6. **Safe error response** — nincs stack trace a kliensnek

### Env változók
- **Frontend (build-time)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`
- **Backend (runtime)**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLOUDCONVERT_API_KEY`, `OPENAI_API_KEY`
- A `VITE_` prefix a Vite build-time injection — Python oldalon NEM elérhető közvetlenül

## Gyakori hibák és tanulságok

- **drawOverlay rAF throttle**: Stale closure probléma — NE throttle-olj React renderben használt függvényt requestAnimationFrame-mel
- **autoSymbolRect**: `setState` + szinkron `drawOverlay()` = régi érték — megoldás: `useRef` + `useState` dual pattern
- **Token refresh**: A cached session `expires_at`-ja lejárhat — `getAuthHeaders()` proaktívan refresh-el 2 perccel lejárat előtt
- **DWG convert auth**: `require_auth` felesleges volt — rate limit + origin check elegendő formátum-konverzióhoz
- **VITE_ prefix**: Frontend env var-nak `VITE_` kell, de Python serverless-nek NEM

## Build & Deploy

```bash
npm run dev        # Lokális fejlesztés (Vite dev server)
npm run build      # Production build (vite build + prerender)
npm run test       # Vitest futtatás
npm run lint       # ESLint
```

- Vercel auto-deploy: push → build → deploy
- Preview deploy: minden branch-nek saját URL
- Python functions: `api/` mappából automatikusan Vercel Functions
