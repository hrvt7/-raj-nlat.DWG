# Workspace Unification — Shared Interaction Contract

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift activeTool + selection/visibility/highlight state from PDF/DXF viewers into TakeoffWorkspace, creating a single interaction contract that both viewers consume via props.

**Architecture:** Both viewers keep their render backends (pdf.js / Three.js) but receive tool-state, selection-state, and interaction callbacks from the parent. The parent becomes the single source of truth for "what tool is active" and "what is selected/visible/highlighted".

**Tech Stack:** React state lifting, prop-based contracts, no new dependencies.

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/components/TakeoffWorkspace.jsx` | Parent — owns shared state | Modify: add activeTool, activeCategory state |
| `src/components/PdfViewer/index.jsx` | PDF render backend | Modify: receive activeTool/activeCategory as props, remove internal state |
| `src/components/DxfViewer/index.jsx` | DXF render backend | Modify: receive activeTool/activeCategory as props, remove internal state |

---

### Task 1: Lift activeTool state from DxfViewer to TakeoffWorkspace

**Files:**
- Modify: `src/components/TakeoffWorkspace.jsx`
- Modify: `src/components/DxfViewer/index.jsx`

- [ ] **Step 1: Add shared activeTool state to TakeoffWorkspace**

In TakeoffWorkspace.jsx, after the existing UI state declarations (~line 161), add:

```javascript
const [sharedActiveTool, setSharedActiveTool] = useState(null) // null | 'count' | 'measure' | 'calibrate' | 'select'
const [sharedActiveCategory, setSharedActiveCategory] = useState('ASM-001')
```

- [ ] **Step 2: Pass tool state as props to DxfViewerPanel**

Replace the `<DxfViewerPanel>` render (~line 800) to pass new props:

```jsx
<DxfViewerPanel
  ref={canvasRef}
  file={viewerFile}
  planId={planId}
  assemblies={assemblies}
  focusTarget={focusTarget}
  activeTool={sharedActiveTool}
  activeCategory={sharedActiveCategory}
  onToolChange={setSharedActiveTool}
  onCategoryChange={setSharedActiveCategory}
  onMarkersChange={...}
  onMeasurementsChange={...}
  onCableData={...}
  style={...}
/>
```

- [ ] **Step 3: Update DxfViewer to accept tool state via props**

In DxfViewer/index.jsx, update the component signature to accept `activeTool`, `activeCategory`, `onToolChange`, `onCategoryChange` as props. Keep internal state as fallback:

```javascript
const DxfViewerPanel = forwardRef(function DxfViewerPanel({
  file, unitFactor, unitName, style, compact, planId,
  onCreateQuote, onCableData, onMeasurementsChange, onMarkersChange,
  focusTarget, assemblies: assembliesProp,
  // ── Shared tool state (from parent) ──
  activeTool: externalActiveTool, activeCategory: externalActiveCategory,
  onToolChange: externalOnToolChange, onCategoryChange: externalOnCategoryChange,
}, ref) {
  // Use external state if provided, fallback to internal
  const [internalActiveTool, setInternalActiveTool] = useState(null)
  const [internalActiveCategory, setInternalActiveCategory] = useState('ASM-001')
  const activeTool = externalActiveTool !== undefined ? externalActiveTool : internalActiveTool
  const activeCategory = externalActiveCategory !== undefined ? externalActiveCategory : internalActiveCategory
  const setActiveTool = externalOnToolChange || setInternalActiveTool
  const setActiveCategory = externalOnCategoryChange || setInternalActiveCategory
```

- [ ] **Step 4: Build and verify DXF viewer still works**

Run: `npm run build && npx vitest run && npx playwright test e2e/workspace.spec.js --reporter=list`
Expected: Build clean, tests pass, DXF workspace functional.

- [ ] **Step 5: Commit**

```bash
git add src/components/TakeoffWorkspace.jsx src/components/DxfViewer/index.jsx
git commit -m "refactor: lift activeTool state from DxfViewer to TakeoffWorkspace"
```

---

### Task 2: Lift activeTool state from PdfViewer to TakeoffWorkspace

**Files:**
- Modify: `src/components/TakeoffWorkspace.jsx`
- Modify: `src/components/PdfViewer/index.jsx`

- [ ] **Step 1: Pass tool state as props to PdfViewerPanel**

Update the `<PdfViewerPanel>` render (~line 900) to pass the shared state:

```jsx
<PdfViewerPanel
  file={file}
  planId={planId}
  projectId={...}
  style={...}
  assemblies={assemblies}
  focusTarget={focusTarget}
  onDirtyChange={onDirtyChange}
  activeTool={sharedActiveTool}
  activeCategory={sharedActiveCategory}
  onToolChange={setSharedActiveTool}
  onCategoryChange={setSharedActiveCategory}
  onMarkersChange={...}
  onMeasurementsChange={...}
  onCableData={...}
  onCreateQuote={...}
/>
```

- [ ] **Step 2: Update PdfViewer to accept tool state via props**

Same pattern as DxfViewer — accept external state, fallback to internal:

```javascript
const activeTool = externalActiveTool !== undefined ? externalActiveTool : internalActiveTool
const setActiveTool = externalOnToolChange || setInternalActiveTool
```

- [ ] **Step 3: Build, test, E2E**

Run: `npm run build && npx vitest run && npx playwright test e2e/pdf.spec.js e2e/workspace.spec.js --reporter=list`
Expected: Build clean, all pass, PDF workspace functional.

- [ ] **Step 4: Commit**

```bash
git add src/components/TakeoffWorkspace.jsx src/components/PdfViewer/index.jsx
git commit -m "refactor: lift activeTool state from PdfViewer to TakeoffWorkspace"
```

---

### Task 3: Shared highlight/visibility/selection contract

**Files:**
- Modify: `src/components/TakeoffWorkspace.jsx`
- Verify: `src/components/DxfViewer/index.jsx` (already receives highlight via DxfBlockOverlay)
- Verify: `src/components/PdfViewer/index.jsx` (may need highlight prop for PDF marker overlay)

- [ ] **Step 1: Verify highlightBlock and visibility already live in TakeoffWorkspace**

Check: `highlightBlock`, `selectedUnknownBlock`, `visibleBlocks`, `visibleAsmIds` are already in TakeoffWorkspace state. The DxfBlockOverlay already receives these. PDF overlay may not use them yet.

- [ ] **Step 2: Pass highlight/visibility to PdfViewer if not already**

If PdfViewer doesn't receive `highlightBlock`/`visibleAsmIds`, add props. PDF markers should dim/highlight based on the same contract as DXF.

- [ ] **Step 3: Build, test, E2E**

Run: `npm run build && npx vitest run && npx playwright test e2e/pdf.spec.js e2e/workspace.spec.js e2e/unknownBlock.spec.js --reporter=list`

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: shared highlight/visibility contract across PDF and DXF"
```

---

### Task 4: Verify unified interaction contract

- [ ] **Step 1: Full E2E regression**

Run: `npx playwright test --reporter=list`
Expected: All specs pass.

- [ ] **Step 2: Manual checklist**

Verify:
- [ ] DXF: tool switching works via shared state
- [ ] PDF: tool switching works via shared state  
- [ ] DXF: highlight from TakeoffRow works
- [ ] PDF: highlight from TakeoffRow works (if applicable)
- [ ] DXF: visibility toggle works
- [ ] Tool state persists when switching tabs
- [ ] No regression in save/reopen

- [ ] **Step 3: Final commit**

```bash
git commit -m "feat: workspace unification — shared interaction contract complete"
```
