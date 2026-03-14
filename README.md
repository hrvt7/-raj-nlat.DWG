# TakeoffPro – Elektromos felmérés és árajánlat-készítő

Magyar nyelvű webalkalmazás villanyszerelési tervrajzok feldolgozására: tervfeltöltés → elemfelismerés → mennyiségszámítás → kábelbecslés → árajánlat generálás.

## Mire való / Kinek szól

- **Villanyszerelő vállalkozók, kalkulátorok** akik DXF/DWG (vagy PDF) tervrajzból akarnak gyorsan mennyiségi kiírást és árajánlatot készíteni
- **Fő érték:** terv-alapú felmérés gyorsítása — a tervrajzból kinyert blokkok és vonalhosszak alapján automatikus mennyiségszámítás, manuális felülvizsgálattal
- **Kimenet:** formázott PDF árajánlat (tömör / összesített / részletes), CSV export, BOM

## Product positioning

- **DXF/DWG-first** — a fő útvonal: DXF fájl betöltése → client-side JS parser → blokk- és vonalfelismerés → assembly hozzárendelés
- **PDF támogatott, de másodlagos** — PDF tervrajzok feltölthetők és feldolgozhatók, de ez a path törékennyebb (raszterizálás, marker-alapú felmérés, server-side parse)
- **DWG → DXF konverzió** — DWG fájlok server-side konvertálódnak DXF-re (ODA engine, `/api/parse-dwg`), utána a standard DXF pipeline dolgozik

## Fő munkafolyamat

```
1. Projekt létrehozása    → ügyfél, projekt név, emelet/diszciplína
2. Tervrajz feltöltés     → DXF / DWG / PDF fájl → planStore (IndexedDB)
3. Elemfelismerés          → DXF parser (client-side JS + web worker) kinyeri:
                              blokkok (INSERT), vonalhosszak, rétegek, attribútumok
4. Felülvizsgálat          → felismert blokkok → assembly hozzárendelés
                              (szabály-alapú + 3-tier recognition memory + manuális review)
5. Kalkuláció              → anyagköltség + munkadíj + kábelbecslés → összesítés
6. Árajánlat kimenet       → PDF generálás (3 részletességi szint) / CSV / nyomtatás
```

## Tech stack

| Réteg | Technológia |
|---|---|
| Frontend | React 18 + Vite 4, egyetlen SPA |
| Viewer | `dxf-viewer` (WebGL, Three.js) DXF-hez, `pdfjs-dist` PDF-hez |
| Persistence | **Local-first**: localStorage + IndexedDB (localforage) |
| Cloud sync | Opcionális Supabase (auth, quotes, settings sync) |
| Serverless API | Vercel Python functions (DWG konverzió, PDF parse, AI meta-vision) |
| Tesztek | Vitest (1077 unit), Playwright (54 E2E) |
| Build | Vite, code-split: vendor-pdf, vendor-dxf, vendor-supabase |

## Projektstruktúra

```
├── api/                        # Vercel serverless Python functions
│   ├── parse-dxf.py            #   DXF feldolgozás (ezdxf) — fallback, ritkán használt
│   ├── parse-dwg.py            #   DWG → DXF konverzió (ODA engine)
│   ├── parse-pdf.py            #   PDF raszterizálás + blokk-detekció
│   ├── parse-pdf-vectors.py    #   PDF vektor-alapú parse
│   ├── cable-agent.py          #   Kábel-agent (AI-asszisztált kábelbecslés)
│   ├── meta-vision.py          #   AI tervrajz metaadat-kinyerés
│   ├── convert-dwg.py          #   DWG → DXF batch konverzió
│   ├── ai.py                   #   AI helper endpoint
│   ├── create-checkout.py      #   Stripe checkout
│   └── stripe-webhook.py       #   Stripe webhook handler
├── src/
│   ├── App.jsx                 # Fő alkalmazás shell (1733 sor): routing, quote szerkesztés, PDF output
│   ├── Landing.jsx             # Landing page
│   ├── dxfParser.js            # Client-side DXF parser (blokkok, vonalak, rétegek, attribútumok)
│   ├── pdfTakeoff.js           # PDF marker-alapú felmérés + kábelbecslés (MST)
│   ├── cableAgent.js           # AI kábel-agent kliens
│   ├── supabase.js             # Supabase auth + sync kliens
│   ├── components/
│   │   ├── TakeoffWorkspace.jsx    # Központi munkaterület (2954 sor): viewer + felismerés + review
│   │   ├── DxfViewer/              # WebGL DXF megjelenítő (Three.js OrthographicCamera)
│   │   ├── PdfViewer/              # PDF megjelenítő (pdf.js canvas)
│   │   ├── Sidebar.jsx             # Navigáció
│   │   ├── DetectionReviewPanel.jsx # AI detekció felülvizsgálat
│   │   ├── LegendPanel.jsx         # Jelmagyarázat kezelés
│   │   ├── PdfMergePanel.jsx       # Több PDF terv összefésülése
│   │   ├── CableConfidenceCard.jsx # Kábelbecslés konfidencia megjelenítés
│   │   ├── ManualCableModePanel.jsx # Manuális kábelbecslés
│   │   ├── ErrorBoundary.jsx       # Globális hibakezelés
│   │   └── ui.jsx                  # Közös UI komponensek (badge, toast, fmt)
│   ├── pages/
│   │   ├── Dashboard.jsx       # Áttekintő dashboard
│   │   ├── Quotes.jsx          # Árajánlat-lista
│   │   ├── Projektek.jsx       # Projekt-kezelés
│   │   ├── Assemblies.jsx      # Assembly katalógus szerkesztő
│   │   ├── WorkItems.jsx       # Munkatétel katalógus
│   │   ├── Materials.jsx       # Anyag katalógus
│   │   └── Settings.jsx        # Beállítások (cég, logó, API kulcsok)
│   ├── data/
│   │   ├── store.js            # localStorage persistence (settings, quotes, items)
│   │   ├── planStore.js        # IndexedDB terv-fájl tárolás + metaadat
│   │   ├── projectStore.js     # Projekt persistence
│   │   ├── recognitionMemory.js    # 3-tier elemfelismerési memória (projekt → fiók → globális)
│   │   ├── evidenceExtractor.js    # DXF evidence kinyerés (réteg, attrib, szöveg)
│   │   ├── workItemsDb.js      # Beépített munkatétel-adatbázis + normaidők
│   │   ├── legendStore.js      # Jelmagyarázat template tárolás
│   │   └── ...                 # schema versioning, concurrency guard, category map
│   ├── utils/
│   │   ├── pricing.js          # Árazási motor (anyag + munka + overhead)
│   │   ├── generatePdf.js      # HTML → PDF generálás (html2canvas + jsPDF)
│   │   ├── dxfParseContract.js # Parser output normalizálás (browser/worker parity)
│   │   ├── cableModel.js       # Kábelbecslés modell
│   │   ├── reviewState.js      # Review workflow állapotgép
│   │   ├── csvExport.js        # CSV árajánlat export
│   │   ├── bomExport.js        # BOM (Bill of Materials) export
│   │   └── ...                 # audit, merge, template matching, workflow
│   ├── workers/
│   │   ├── dxfParser.worker.js # Web Worker DXF parser (nagy fájlokhoz)
│   │   └── dxf-viewer.worker.js
│   └── __tests__/              # 39 test suite, 1077 teszt
├── e2e/                        # 30 Playwright E2E spec (54 teszt)
├── vite.config.js
├── vercel.json
├── requirements.txt            # Python dependencies (ezdxf, stripe, openai, stb.)
└── .env.example                # Environment változók dokumentáció
```

## Lokális fejlesztés

### Indítás

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173

### Environment

```bash
cp .env.example .env
# Kitöltés: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# Supabase nélkül az app offline módban fut (localStorage-only)
```

### Elérhető parancsok

| Parancs | Leírás |
|---|---|
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Build előnézet |
| `npm run lint` | ESLint (`src/` — `.js`, `.jsx`) |
| `npm test` | Vitest unit tesztek (1077) |
| `npm run test:watch` | Vitest watch mód |
| `npm run test:e2e` | Playwright E2E tesztek (54) |

### Szükséges

- Node.js 18+
- npm 9+
- Playwright böngészők E2E-hez: `npx playwright install`

## Deploy (Vercel)

1. GitHub repo → Vercel import
2. Framework: **Vite**, Build: `npm run build`, Output: `dist`
3. Environment Variables beállítása (ld. `.env.example`)
4. A `requirements.txt` Python dependency-ket a Vercel automatikusan telepíti
5. `vercel.json` tartalmazza az API route konfigurációt

## DWG → DXF

- DWG fájlokat az app automatikusan konvertálja DXF-re a `/api/parse-dwg` endpoint-on (server-side ODA engine)
- Offline alternatíva: **ODA File Converter** — https://opendesign.com/guestfiles/oda_file_converter (Output: R2013 DXF)

## Egységek

A DXF fájlok általában mm-ben vannak. A UI automatikusan kezeli a mértékegységeket, de manuálisan is kalibrálható:
- `mm → m`: 0.001 szorzó ← **legtöbb esetben ez**
- `cm → m`: 0.01 szorzó
- `m → m`: 1:1

Ellenőrzés: mérd meg egy ismert falszakasz hosszát a DXF-ben a beépített mérőeszközzel.

## Fejlesztői megjegyzések

### Architektúra

- **TakeoffWorkspace.jsx** (2954 sor) a legkritikusabb fájl: tervrajz megjelenítés, elemfelismerés, assembly hozzárendelés, kábelbecslés, review workflow, mentés — mind egy komponensben
- **App.jsx** (1733 sor) az alkalmazás shell: sidebar routing, quote szerkesztés, PDF/CSV/print output, Supabase sync
- **Local-first**: minden adat elsődlegesen localStorage / IndexedDB-ben él. Supabase opcionális sync réteg, nem elsődleges adatforrás
- **DXF parser dualitás**: `dxfParser.js` (main thread) és `dxfParser.worker.js` (web worker) — azonos logika, `dxfParseContract.js` normalizálja a kimenetet mindkét útvonalról
- **Recognition memory**: 3 szintű (projekt → fiók → globális) tanulás — blokknév, réteg, attribútum és közeli szöveg alapú felismerés

### Változtatási irányelvek

> **A workspace erős, de törékeny.**
> Kis, célzott változtatásokat preferáld. Kerüld a széles refaktorokat a kritikus flow-kban (TakeoffWorkspace, App.jsx, generatePdf, dxfParser).

- Minden módosítás után: `npm run build` (zero error) + `npm test` (1077 pass) + `npm run test:e2e` (54 pass)
- A `dxfParser.js` és `dxfParser.worker.js` mindig szinkronban kell legyen — a `dxfParserConsistency.test.js` ellenőrzi
- A recognition memory backward-compatible — régi bejegyzések `signalType` nélkül `block_name`-ként kezelődnek
- PDF generálás (`generatePdf.js`) html2canvas-alapú: CSS page-break szabályok nem érvényesülnek, spacer injection kezeli a tördelést
