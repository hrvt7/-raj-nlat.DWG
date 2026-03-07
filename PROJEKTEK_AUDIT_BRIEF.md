# Projektek Oldal — Audit & Implementation Brief

## 1. Current-State Audit

### Projektek.jsx (766 lines) — Two-level view

**Level 1: ProjectListView (L331–464)**
- Project grid with `ProjectCard` items
- "Új projekt" creation (inline name input)
- Stats badges per project: plan count, template count, has-legend indicator
- Click → opens ProjectDetailView (Level 2)

**Level 2: ProjectDetailView (L555–730)**
- Back button → returns to project list
- Header: project name (read-only), plan count + template count subtitle
- DetectionHistoryMini dropdown (L678–679)
- SelectionToolbar (L668–675): appears when ≥1 plan selected → Detect / Merge buttons
- Plan upload drop zone (L689–706): PDF, DXF, DWG
- Plans grid (L709–718): PlanCard items with checkbox, open, delete

**Main export: FelmeresPage (L735–766)**
- Routes between Level 1 and Level 2 via `currentProjectId` state
- Receives 7 callbacks from App.jsx: `onOpenFile`, `onLegendPanel`, `onDetectPanel`, `onMergePanel`, `onReopenDetection`, `onOpenProject`, `onBackToProjects`

### App.jsx orchestration (L842–859 → L873–947)

| Callback | Wiring |
|----------|--------|
| `onOpenFile(file, plan)` | Sets `felmeresFile` + `felmeresOpenPlan` → navigates to `projektek-workspace` → renders TakeoffWorkspace |
| `onLegendPanel(data)` | Sets `legendPanelData` → opens LegendPanel modal overlay |
| `onDetectPanel(plans, projId)` | Sets `detectPanelPlans` + `detectPanelProjectId` → opens DetectionReviewPanel modal overlay |
| `onMergePanel(plans)` | Sets `mergePanelPlans` → opens PdfMergePanel modal overlay |
| `onReopenDetection(run)` | Sets `detectPanelExistingRun` + reconstructs plan list → opens DetectionReviewPanel |
| `onOpenProject(id)` | Sets `activeProjectId` → Projektek switches to project detail |
| `onBackToProjects()` | Clears `activeProjectId` → Projektek returns to project list |

### TakeoffWorkspace (projektek-workspace route, L800–819)

- Full-screen workspace for a single plan (PDF viewer or DXF viewer)
- `onSaved` → returns to `projektek` page
- `onCancel` → returns to `projektek` page
- Auto-save toast when switching plans via detect locate

---

## 2. Legnagyobb UX Friction Pontok

### F1: Legend section removed but upload handler still exists (DEAD CODE)
- ProjectDetailView L665 has comment `{/* Legend section removed */}`
- But `handleLegendFile` (L614–627) and `legendInputRef` (L566) and `legendDragging` (L564) state are still alive
- `handleLegendFile` is never called from any UI element — the drop zone / input was removed
- **Impact:** Dead code, no UX friction directly, but confusing for maintenance

### F2: No legend upload UI in project detail
- The legend section was visually removed (L665 comment) but the feature intent is still there
- `onLegendPanel` callback exists and works (App.jsx L873–891)
- Users currently cannot upload a legend for a project via the Projektek flow
- **Impact:** Feature gap — legend is only accessible if previously uploaded or via other means

### F3: DetectionHistoryMini placement — above plans, below nothing
- DetectionHistoryMini appears at L678–679, between SelectionToolbar and the plans grid
- It's a dropdown showing past detection runs for the project
- On first visit with no detection history, it renders an empty space (minimal but still a slot)
- When detection history exists, it's a useful quick-access point
- **Impact:** Low friction, but the visual hierarchy is: header → toolbar → detection history → plans. Detection history is a secondary action but gets prime real estate.

### F4: Project name is read-only in detail view
- L661: `<h1>{project.name}</h1>` — no edit capability
- **Impact:** Users must go back to project list to rename (and even there, no rename exists — only create+delete). Minor friction.

### F5: No inline legend status in project detail
- ProjectListView shows `hasLegend` badge on project cards (via `projectStats`)
- ProjectDetailView shows template count in subtitle but no visual indicator of whether a legend has been processed
- **Impact:** User doesn't know if they need to upload a legend or if one exists

### F6: Plan card doesn't show which source was used for cable estimate
- PlanCard (L206–280) shows `detectedCount` badge and `calc summary` (cable estimate)
- Cable estimate source (_source) info is available but not surfaced on the card
- **Impact:** Minor — detailed info is in TakeoffWorkspace

---

## 3. Jó Elemek (maradjanak)

| Element | Location | Why good |
|---------|----------|----------|
| Two-level navigation (list → detail) | FelmeresPage L735–766 | Clean, predictable navigation pattern |
| ProjectCard with stats badges | L282–329 | Quick project overview at a glance |
| SelectionToolbar (Detect + Merge) | L111–134 | Contextual actions only when plans are selected |
| PlanCard with checkbox, open, delete | L206–280 | Standard card pattern, clean interactions |
| Plan upload drop zone in detail | L689–706 | Clear affordance, drag+click, file type hint |
| DetectionHistoryMini | L466–550 | Quick access to reopen past detection runs |
| ScannerSVG empty state | L156–203 | Engaging animated placeholder for project list |
| Callback-based panel opening | App.jsx L842–859 | Clean separation — Projektek fires intents, App.jsx manages panel state |
| Auto-save toast on plan switch | App.jsx L844, L948–960 | Prevents data loss during plan switching |

---

## 4. Zavaró / Redundáns Elemek

| Element | Location | Issue | Recommendation |
|---------|----------|-------|----------------|
| `handleLegendFile` + `legendInputRef` + `legendDragging` | ProjectDetailView L564–627 | Dead code — legend upload UI was removed but handler stayed | **DELETE** dead legend code |
| `{/* Legend section removed */}` comment | L665 | Stale comment marking removed section | **DELETE** comment |
| `onLegendPanel` callback threading | Projektek L555, L626, L735, L757 + App.jsx L847 | Full callback chain exists but is unreachable since no UI triggers it | **KEEP** the callback chain — it's not harmful and will be needed when legend UI returns. Only delete the dead handler code. |
| `FILE_TYPE_MAP` + `getFileType` in Projektek.jsx | L20–31 | Duplicated from deleted Plans.jsx. Now sole copy. | **KEEP** — sole copy, works fine. Future dedup to utils/ is cosmetic. |
| `fmtSize` + `fmtDate` in Projektek.jsx | L43–52 | Same as above — sole surviving copy | **KEEP** |
| `generatePdfThumb` in Projektek.jsx | L53–69 | Same | **KEEP** |

---

## 5. Érintett Fájlok

| File | Change | Risk |
|------|--------|------|
| `src/pages/Projektek.jsx` | Remove dead legend handler code (handleLegendFile, legendInputRef, legendDragging, legend comment) | **Very low** — no UI references this code |
| `src/App.jsx` | **NO CHANGE** — onLegendPanel wiring is alive (for future use) | — |
| `src/components/LegendPanel.jsx` | **NO CHANGE** — used by App.jsx modal | — |
| `src/components/DetectionReviewPanel.jsx` | **NO CHANGE** | — |
| `src/components/Sidebar.jsx` | **NO CHANGE** — single "Projektek" entry | — |
| `src/data/projectStore.js` | **NO CHANGE** | — |
| `src/data/planStore.js` | **NO CHANGE** | — |
| `src/data/legendStore.js` | **NO CHANGE** | — |

---

## 6. Regressziós Kockázatok

| Risk | Severity | Mitigation |
|------|----------|------------|
| Removing handleLegendFile breaks legend upload | **None** — no UI triggers it. The legend section was already removed. | Verify: grep for `handleLegendFile` — only defined, never called from JSX |
| Removing legendInputRef breaks something | **None** — ref is never attached to any rendered `<input>` | Verify: grep for `legendInputRef` — only defined + `useRef(null)` |
| Removing legendDragging breaks drag UI | **None** — no `onDragOver`/`onDrop` handler in rendered JSX uses it | Verify: grep for `legendDragging` — only defined + `useState(false)` |
| onLegendPanel callback chain breaks | **N/A** — we're keeping this chain | — |
| Future legend feature breaks | **N/A** — the callback chain (`onLegendPanel`) remains intact. When legend UI returns, it only needs to call `onLegendPanel(data)`. | — |

---

## 7. Smoke Check Lista

After dead legend code removal:

1. **Build:** `npm run build` — 0 errors, no missing reference warnings
2. **Project list:** Navigate to Projektek → project cards render with stats
3. **Project detail:** Open a project → plans grid renders, upload zone works
4. **Plan upload:** Upload PDF in project detail → file saved, thumbnail generated
5. **Plan open:** Click plan card → TakeoffWorkspace opens with the plan
6. **Selection toolbar:** Select 2+ plans → Detect and Merge buttons appear
7. **Detection:** Click "Detektálás" → DetectionReviewPanel opens
8. **Merge:** Click "Összevonás" → PdfMergePanel opens
9. **Detection history:** DetectionHistoryMini dropdown shows past runs (if any)
10. **Back navigation:** "Vissza a projektekhez" → returns to project list
11. **Tests:** `npx vitest run` — all green

---

## 8. Ajánlott Implementációs Sorrend

**Egyetlen lépés.** A dead legend code eltávolítása egyetlen atomi commitban végrehajtható:

### Lépések:

1. **Projektek.jsx cleanup:**
   - Remove `const [legendDragging, setLegendDragging] = useState(false)` (L564)
   - Remove `const legendInputRef = useRef(null)` (L566)
   - Remove `handleLegendFile` callback (L614–627)
   - Remove `{/* Legend section removed */}` comment (L665)

2. **Build + smoke check**

3. **Commit**

### NOT in this step:
- onLegendPanel callback chain (alive, needed for future legend UI)
- Project name inline editing (feature, not cleanup)
- Legend upload UI restoration (feature, not cleanup)
- DetectionHistoryMini repositioning (cosmetic, not blocking)
- Cable source badge on PlanCard (feature, not cleanup)
- Utility function dedup to `src/utils/` (cosmetic, not blocking)
- PlanIcon extraction (cosmetic)

---

## 9. Implementation Brief

### Scope
Remove dead legend upload handler code from ProjectDetailView in Projektek.jsx.

### What changes
1. `src/pages/Projektek.jsx` — delete 4 elements:
   - `legendDragging` state (L564)
   - `legendInputRef` ref (L566)
   - `handleLegendFile` callback (L614–627)
   - Stale comment at L665

### What stays
- `onLegendPanel` prop in ProjectDetailView (used for future legend UI)
- All other ProjectDetailView functionality (plans, selection, detection, merge)
- All App.jsx orchestration (legendPanelData state, LegendPanel modal)
- All utility functions (fmtSize, fmtDate, getFileType, etc.)
- DetectionHistoryMini
- SelectionToolbar

### Deliverables
- Files changed: 1 modified (Projektek.jsx)
- Build: 0 errors expected
- Tests: all green expected (no Projektek-specific tests exist)
- Smoke: 11-point check above

### Known edge cases
- `onLegendPanel` is threaded through ProjectDetailView but never called after this cleanup. This is intentional — the callback chain stays wired for when legend UI returns.
- `handleLegendFile` was the only caller of `onLegendPanel` inside ProjectDetailView. After removal, legend can only be triggered from outside (e.g., a future toolbar button or a restored legend section).

### Decision needed before implementation
**Legend UI restoration.** The legend section was removed (L665 comment). Two options:
- **(a) Leave it removed** — legend upload returns in a future dedicated step when the auto-extraction feature is ready.
- **(b) Restore a minimal legend section** — simple upload zone + "Jelmagyarázat feldolgozása" button that calls `onLegendPanel`.

**Recommendation: (a) Leave it removed.** The dead code cleanup is independent. Legend UI restoration is a feature step that should be scoped separately.
