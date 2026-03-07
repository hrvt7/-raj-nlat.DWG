# Phase 3 — Plans.jsx Decommission Brief

## 1. Current-State Audit

### Plans.jsx (`src/pages/Plans.jsx`, 735 lines)

**Routing status:** DEAD — `App.jsx` L11 imports `PlansPage` but never renders it.
`App.jsx` L553 redirects `page === 'plans'` → `'projektek'`.
App.jsx L557-566 migrates orphan plans (no `projectId`) into "Importált tervek" project on mount.

**The Plans page was the original standalone plan manager — upload, grid view, parse, preview, merge.
It has been fully superseded by the Projektek flow (project-scoped upload + TakeoffWorkspace).**

### Functional blocks inside Plans.jsx

| # | Block (lines) | Function | Status |
|---|---------------|----------|--------|
| A | L14-18 | `fmtSize()` — byte formatting | **Duplicated** in Projektek.jsx L43-47 |
| B | L20-25 | `fmtDate()` — date formatting | **Duplicated** in Projektek.jsx L48-52 |
| C | L27-38 | `FILE_TYPE_MAP`, `getFileType()` | **Duplicated** in Projektek.jsx L20-31 |
| D | L40-60 | `generatePdfThumbnail()` | **Duplicated** as `generatePdfThumb()` in Projektek.jsx L53-69 |
| E | L84-92 | Floor/discipline tag handlers | **Partially in Projektek** (project-level metadata, not per-plan tags) |
| F | L95-119 | `handleParsePlan()` — single DXF parse with worker pool + normalizeBlocks | **NOT replicated** anywhere — unique logic |
| G | L122-145 | `handleParsePdf()` — runPdfTakeoff + save recognition | **NOT needed** — TakeoffWorkspace runs runPdfTakeoff at workspace open time (L741-752) |
| H | L148-163 | `handleBatchParse()` — parallel DXF parse queue | **NOT replicated** — unique logic, depends on F |
| I | L181-222 | `handleUpload()` — file upload + save | **Superseded** by Projektek.jsx `handlePlanFiles()` L591-611 |
| J | L247-255 | MergePlansView integration | **Used** via App.jsx merge panel (L941-946), NOT from Plans.jsx |
| K | L257-311 | Viewer mode (full-screen DxfViewerPanel / PdfViewerPanel) | **Superseded** by TakeoffWorkspace (projektek-workspace route) |
| L | L315-703 | Grid view UI (plan cards, upload zone, batch parse buttons) | **Dead UI** — never rendered |
| M | L707-734 | `PlanIcon` component | **Duplicated** inline in Projektek.jsx plan cards |

### MergePlansView (`src/components/MergePlansView.jsx`, 1530 lines)

**Status:** ALIVE — used via App.jsx L941-946 (`mergePanelPlans` state).
Plans.jsx imports it (L5, L249) but that code path is dead.
MergePlansView is **not** a decommission target — it's used by the active Projektek flow.

---

## 2. Megtartandó vs. Eldobható

### MEGTARTANDÓ (migrate before delete)

| ID | Element | Reason | Target |
|----|---------|--------|--------|
| F | `handleParsePlan()` logic (L95-119) | Only place with DXF pre-parse + normalizeBlocks integration. Projektek.jsx upload does NOT auto-parse DXF files. If we want "Elemzés" button in project detail, this logic is needed. | **Evaluate:** Does project flow need DXF pre-parse? If yes → extract to `src/utils/planParsing.js`. If no → drop. |
| H | `handleBatchParse()` logic (L148-163) | Only batch DXF parse. Depends on F. Same decision as F. | Same as F |
| E | Floor/discipline per-plan tags (L84-92, L548-592) | Plans.jsx has per-plan `<select>` for floor/discipline on DXF/DWG cards. Projektek.jsx does NOT have this — it only shows auto-detected tags from filename (read-only). | **Low priority.** Only matters if users need manual per-plan tagging in project detail view. Can be deferred. |

### ELDOBHATÓ (safe to delete)

| ID | Element | Reason |
|----|---------|--------|
| A-D | Utility functions (fmtSize, fmtDate, FILE_TYPE_MAP, getFileType, generatePdfThumbnail) | All duplicated in Projektek.jsx already |
| G | `handleParsePdf()` | TakeoffWorkspace handles PDF takeoff at open time |
| I | `handleUpload()` | Superseded by Projektek `handlePlanFiles()` |
| J | MergePlansView integration inside Plans.jsx | Dead code path — merge works via App.jsx merge panel |
| K | Viewer mode (full-screen) | TakeoffWorkspace is the viewer now |
| L | Entire grid view UI | Dead, never rendered |
| M | PlanIcon component | Duplicated inline in Projektek |

---

## 3. Érintett Fájlok

| File | Change | Risk |
|------|--------|------|
| `src/pages/Plans.jsx` | **DELETE** entirely | None — never rendered |
| `src/App.jsx` | Remove L11 `import PlansPage` + L553 redirect + L598 `plans:` from nav map | Low — redirect is no-op guard |
| `src/components/MergePlansView.jsx` | **NO CHANGE** — alive, used by App.jsx | — |
| `src/data/planStore.js` | **NO CHANGE** — used by Projektek.jsx, TakeoffWorkspace, MergePlansView | — |
| `src/data/symbolDictionary.js` | **NO CHANGE** — `normalizeBlocks` used by mergeParseResults.js | — |

### Utility dedup consideration (NOT in scope for step 1)

`fmtSize`, `fmtDate`, `getFileType`, `FILE_TYPE_MAP` are duplicated between Plans.jsx and Projektek.jsx.
Once Plans.jsx is deleted, the Projektek copies remain authoritative. A future cleanup could extract them to a shared `src/utils/formatters.js`, but this is cosmetic and NOT blocking.

---

## 4. Regressziós Kockázatok

| Risk | Severity | Mitigation |
|------|----------|------------|
| PlansPage import removal breaks App.jsx | **Low** | PlansPage is imported but never rendered. Tree-shaker already eliminates it. Removing import is safe. |
| Plans redirect guard removal breaks deep links | **Low** | The redirect `if (page === 'plans') setPage('projektek')` is a migration guard. If any localStorage or bookmarks still have `page: 'plans'`, removing the guard means the app would try to render a `page === 'plans'` branch that doesn't exist. **Solution:** keep the redirect for 1 more release, OR verify no other code sets `page` to `'plans'`. |
| Orphan migration code removal | **Medium** | L557-566 runs on mount. If removed AND user still has orphan plans in localStorage, those plans become invisible. **Solution:** keep orphan migration in App.jsx even after Plans.jsx delete (it doesn't depend on Plans.jsx). |
| DXF pre-parse capability loss | **None** | This is already lost — Plans.jsx grid is dead. Users currently parse DXF in TakeoffWorkspace only. |
| MergePlansView breaks | **None** | MergePlansView is not imported from Plans.jsx in any live code path. App.jsx imports it directly (L13 or equivalent). |

---

## 5. Smoke Check Lista

After Plans.jsx deletion:

1. **Build:** `npm run build` — 0 errors, no missing import warnings
2. **Route test:** Navigate to every page (projektek, new-quote, projektek-workspace, beallitasok) — all render
3. **Orphan migration:** Set localStorage with orphan plan, reload — verify migration still runs
4. **Plan upload in Projektek:** Upload DXF + PDF in project detail — files saved, thumbnail generated
5. **TakeoffWorkspace open:** Open saved plan from project detail — DXF and PDF both render
6. **Merge flow:** Select 2+ plans in project detail → "Tervek összevonása" → MergePlansView opens
7. **Redirect guard:** Set `page='plans'` in devtools → verify redirect to `projektek` (if guard kept)
8. **Tests:** `npx vitest run` — all green (Plans.jsx has no unit tests)

---

## 6. Ajánlott Implementációs Sorrend

**Egyetlen lépés.** A Plans.jsx leépítése egyetlen atomi commitban végrehajtható, mert:
- Nincs élő renderelési útvonal
- Nincs importált export, amit más fájl használna
- A PlansPage import az App.jsx-ben dead code

### Lépések:

1. **App.jsx cleanup:**
   - Remove `import PlansPage from './pages/Plans.jsx'`
   - Keep `if (page === 'plans') setPage('projektek')` redirect guard (1 more release safety)
   - Keep orphan migration code (does not depend on Plans.jsx)
   - Remove `plans: 'Tervrajzok'` from nav labels map (L598) if it still exists as nav entry

2. **Delete `src/pages/Plans.jsx`**

3. **Build + smoke check**

4. **Commit**

### NOT in this step:
- MergePlansView changes
- Utility function dedup (fmtSize, fmtDate, etc.)
- DXF pre-parse capability migration (F, H) — evaluate separately
- Per-plan floor/discipline tags (E) — evaluate separately
- PlanIcon extraction — Projektek has its own inline version

---

## 7. Implementation Brief

### Scope
Remove the dead `Plans.jsx` page module and its import from `App.jsx`.

### What changes
1. `src/App.jsx` — delete `import PlansPage` line; optionally remove `plans` from nav label map
2. `src/pages/Plans.jsx` — **delete file**

### What stays
- `if (page === 'plans') setPage('projektek')` redirect guard in App.jsx (safety net for stale state)
- Orphan migration useEffect in App.jsx
- `src/components/MergePlansView.jsx` (alive, used by App.jsx merge panel)
- `src/data/planStore.js` (alive, used everywhere)
- All Projektek.jsx functionality

### Deliverables
- Files changed: 1 modified (App.jsx), 1 deleted (Plans.jsx)
- Build: 0 errors expected
- Tests: all green expected (no Plans-specific tests exist)
- Smoke: 8-point check above

### Known edge cases
- If user has `page: 'plans'` in localStorage/state, the redirect guard catches it. Guard stays for safety.
- If orphan plans exist without projectId, App.jsx mount migration handles them. Independent of Plans.jsx.
- `handleParsePlan` / `handleBatchParse` capability is lost but was already unreachable since Plans.jsx was never rendered.

### Decision needed before implementation
**F/H: DXF pre-parse.** Plans.jsx had `handleParsePlan()` (single DXF parse with normalizeBlocks) and `handleBatchParse()`. This is currently dead code. Two options:
- **(a) Drop it** — DXF parsing happens on-the-fly in TakeoffWorkspace when a plan is opened. No upfront parse needed.
- **(b) Extract to utility** — If future "batch analysis" or "project-level DXF summary" feature is planned, extract to `src/utils/planParsing.js` before deleting Plans.jsx.

**Recommendation: (a) Drop it.** The on-demand parse in TakeoffWorkspace is the active path. Batch pre-parse can be rebuilt from planStore.js + symbolDictionary.js if ever needed.
