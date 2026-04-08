// ─── TakeoffWorkspace ─────────────────────────────────────────────────────────
// DXF/PDF felmérési munkaterület.
// Elrendezés: Bal = tervrajz nézegető, Jobb = elemfelismerés + felmérés + kábelbecslés.
// Kábelbecslés: 1. mért DXF rétegek → 2. MST pozíciókból → 3. eszközszám alapján.

import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react'

// ── Lazy imports with retry: handles stale chunk hashes after Vercel deploys ──
// If the dynamic import fails (chunk 404), retry once and reload if still failing.
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      // First retry — browser may have stale HTML with old chunk hashes
      return importFn().catch((err) => {
        // If still failing, force a full page reload to fetch fresh HTML
        console.error('[TakeoffWorkspace] Chunk load failed after retry, reloading page:', err)
        window.location.reload()
        // Return never-resolving promise so React doesn't render an error
        return new Promise(() => {})
      })
    })
  )
}
const DxfViewerPanel = lazyRetry(() => import('./DxfViewer/index.jsx'))
const PdfViewerPanel = lazyRetry(() => import('./PdfViewer/index.jsx'))
import { parseDxfFile, parseDxfText, parseDxfTextInWorker } from '../dxfParser.js'
// estimateCablesMST now used inside useCableEstimation hook
import { loadAssemblies, loadWorkItems, loadMaterials, saveQuote } from '../data/store.js'
import { createQuote } from '../utils/createQuote.js'
import { savePlan as savePlanBlob, savePlanAnnotations, getPlanAnnotations, updatePlanMeta, getPlanMeta } from '../data/planStore.js'
import { getProject } from '../data/projectStore.js'
import { CONTEXT_FACTORS } from '../data/workItemsDb.js'
import { computePricing } from '../utils/pricing.js'
import { normalizeCableEstimate, shouldOverwrite, isCrossContextMarkerConflict, CABLE_SOURCE } from '../utils/cableModel.js'
import CableConfidenceCard, { CableModeBadge } from './CableConfidenceCard.jsx'
import ManualCableModePanel from './ManualCableModePanel.jsx'
import { toggleReferencePanelBlock } from '../utils/referencePanelStore.js'
// computePanelAssistedEstimate + saveReferencePanels now used inside useCableEstimation hook
import { normalizeDxfResult } from '../utils/dxfParseContract.js'
import { lookupMemory, recordConfirmation } from '../data/recognitionMemory.js'
import { buildBlockEvidence } from '../data/evidenceExtractor.js'
import { buildAssemblySummary } from '../utils/pricingContract.js'
import { getSaveLabel, getSaveColor } from '../utils/workflowStatus.js'
import { suggestAssemblies } from '../utils/suggestAssemblies.js'
import { getAuthHeaders } from '../supabase.js'

// ─── Design tokens ────────────────────────────────────────────────────────────
import { C } from './takeoff/designTokens.js'

// ─── Block recognition & cable detection (extracted to utils/blockRecognition.js) ───
import { BLOCK_ASM_RULES, ASM_COLORS, recognizeBlock, CABLE_GENERIC_KW, CABLE_TYPE_KW, isJunkBlock } from '../utils/blockRecognition.js'
import { applyMarkupToSubtotal } from '../utils/fullCalc.js'
import usePricingPipeline from '../hooks/usePricingPipeline.js'
import useCableEstimation from '../hooks/useCableEstimation.js'
import { convertDwgToDxf } from '../utils/dwgConversionFlow.js'
import useTakeoffPlanAnnotations from '../hooks/useTakeoffPlanAnnotations.js'
import useTakeoffSplitLayout from '../hooks/useTakeoffSplitLayout.js'
import useTakeoffReviewAuditState from '../hooks/useTakeoffReviewAuditState.js'
import useTakeoffRowState from '../hooks/useTakeoffRowState.js'
import useTakeoffBootstrap from '../hooks/useTakeoffBootstrap.js'
import { takeoffToManualRows } from '../utils/takeoffToManualRows.js'
import { materializeManualRowsToItems, computeManualTotals } from '../utils/manualPricingRow.js'
import { buildSnapshotItems, buildCustomSnapshotItems, trainMemoryFromSave } from '../utils/saveHelpers.js'

// ─── Extracted sub-components ─────────────────────────────────────────────────
import DxfBlockOverlay from './takeoff/DxfBlockOverlay.jsx'
import DropZone from './takeoff/DropZone.jsx'
import RecognitionRow from './takeoff/RecognitionRow.jsx'
import WorkflowStatusCard from './takeoff/WorkflowStatusCard.jsx'
import TakeoffRow from './takeoff/TakeoffRow.jsx'
import UnknownBlockPanel from './takeoff/UnknownBlockPanel.jsx'
import PricingPill from './takeoff/PricingPill.jsx'

// ─── Main TakeoffWorkspace ────────────────────────────────────────────────────
export default function TakeoffWorkspace({ settings, materials: materialsProp, onSaved, onCancel, initialData, initialFile, planId, focusTarget, onDirtyChange, onQuoteFromPlan }) {
  // ── File & parse state ────────────────────────────────────────────────────
  const [file, setFile] = useState(null)
  const [parsedDxf, setParsedDxf] = useState(null)
  const [evidenceMap, setEvidenceMap] = useState(null)  // Map<blockName, Evidence> for multi-signal memory
  const [parseProgress, setParseProgress] = useState(0)
  const [parsePending, setParsePending] = useState(false)

  // ── Recognition & takeoff state ───────────────────────────────────────────
  const [recognizedItems, setRecognizedItems] = useState([]) // [{blockName, qty, asmId, confidence}]
  const [asmOverrides, setAsmOverrides] = useState({})       // blockName → asmId
  const [variantOverrides, setVariantOverrides] = useState({}) // asmId → variantId
  const [qtyOverrides, setQtyOverrides] = useState({})       // asmId → qty
  const [itemQtyOverrides, setItemQtyOverrides] = useState({}) // blockName → qty (per-item override)
  const [deletedItems, setDeletedItems] = useState(new Set())   // blockNames removed by user
  // wallSplits[asmId] = { drywall: N, ytong: N, brick: N, concrete: N }
  // Sum of values = total qty for that assembly; individual values = qty per wall material
  const [wallSplits, setWallSplits] = useState({})

  // ── Project context ───────────────────────────────────────────────────────
  const [context, setContext] = useState(settings?.context_defaults || { access: 'empty', project_type: 'renovation', height: 'normal' })
  const [markup, setMarkup] = useState(settings?.labor?.markup_percent != null ? settings.labor.markup_percent / 100 : 0.15)
  const [hourlyRate, setHourlyRate] = useState(settings?.labor?.hourly_rate || 8500)
  const difficultyMode = settings?.labor?.difficulty_mode || 'normal'
  const [quoteName, setQuoteName] = useState('')
  const [clientName, setClientName] = useState('')
  // ── Calc tab state (ported from EstimationPanel popup) ──────────────────
  const [markupType, setMarkupType] = useState(settings?.labor?.markup_type || 'markup') // 'markup' | 'margin'
  const [cablePricePerM, setCablePricePerM] = useState(settings?.labor?.cable_price_per_m || 800)
  const vatPercent = settings?.labor?.vat_percent ?? 27
  const [quotePricingMode, setQuotePricingMode] = useState('assembly') // 'assembly' | 'manual'

  // ── Unit override ────────────────────────────────────────────────────────
  const [unitOverride, setUnitOverride] = useState(null) // null = auto, or 'mm'|'cm'|'m'|'inches'|'feet'

  // ── Cable estimate state (effects extracted to useCableEstimation hook below) ──
  const [cableEstimate, setCableEstimate] = useState(null)
  const [manualCableMode, setManualCableMode] = useState(false)
  const [referencePanels, setReferencePanels] = useState([])
  const [cableReviewed, setCableReviewed] = useState(false)

  // ── PDF manual markers (assembly-based counting from PdfViewer) ─────────
  const [pdfMarkers, setPdfMarkers] = useState([])
  const [pdfMeasurements, setPdfMeasurements] = useState([]) // [{x1,y1,x2,y2,dist,category?}]
  const [measurementPrices, setMeasurementPrices] = useState({}) // { categoryKey: pricePerUnit(Ft) }
  // ── Custom item meta (name, unit, unitPrice per customItemId) ──────────
  const [customItemMeta, setCustomItemMeta] = useState({}) // { [customItemId]: { name, unit, unitPrice } }
  const prevMarkerCountRef = useRef(0)
  useEffect(() => {
    const asmMarkers = pdfMarkers.filter(m => m.asmId || (m.category && m.category.startsWith('ASM-')))
    if (asmMarkers.length > 0 && prevMarkerCountRef.current === 0) {
      setRightTab('takeoff')
    }
    prevMarkerCountRef.current = asmMarkers.length
  }, [pdfMarkers])

  // ── Effective units (auto or manual override) ────────────────────────────
  const UNIT_FACTORS = { mm: 0.001, cm: 0.01, m: 1.0, inches: 0.0254, feet: 0.3048 }
  const effectiveParsedDxf = useMemo(() => {
    if (!parsedDxf || !parsedDxf.success) return parsedDxf
    if (!unitOverride) return parsedDxf // auto — use as-is
    const newFactor = UNIT_FACTORS[unitOverride]
    if (!newFactor) return parsedDxf
    // Recalculate lengths using length_raw * newFactor
    const newLengths = (parsedDxf.lengths || []).map(l => ({
      ...l,
      length: Math.round(l.length_raw * newFactor * 100000) / 100000,
    }))
    return {
      ...parsedDxf,
      lengths: newLengths,
      units: { ...parsedDxf.units, name: unitOverride + ' (override)', factor: newFactor, auto_detected: false },
    }
  }, [parsedDxf, unitOverride])

  // ── Project ID for recognition memory ────────────────────────────────────
  const memProjectId = useMemo(() => {
    if (!planId) return null
    const meta = getPlanMeta(planId)
    return meta?.projectId || null
  }, [planId])

  // ── File type flags (derived early — needed by cableAudit + render) ──────
  const isPdf = file?.name?.toLowerCase().endsWith('.pdf') ?? false

  // ── UI state ──────────────────────────────────────────────────────────────
  const [highlightBlock, setHighlightBlock] = useState(null)
  const [selectedUnknownBlock, setSelectedUnknownBlock] = useState(null)
  const [visibleBlocks, setVisibleBlocks] = useState(new Set()) // block names with visible hits on drawing
  const [visibleAsmIds, setVisibleAsmIds] = useState(new Set()) // assembly IDs with visible hits
  const [rightTab, setRightTab] = useState('takeoff') // 'takeoff' | 'cable' | 'calc' | 'context'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false) // per-plan save success strip
  // ── Split layout + mobile shell (extracted to useTakeoffSplitLayout) ─────
  const { isMobile, showDxfOnMobile, setShowDxfOnMobile, panelRatio, containerRef, handleDividerMouseDown } = useTakeoffSplitLayout()

  // ── Plan annotation lifecycle (hydrate + external sync) ───────────────────
  useTakeoffPlanAnnotations({
    planId, file,
    setPdfMarkers, setWallSplits, setVariantOverrides,
    setDeletedItems, setReferencePanels, setCableReviewed,
    setRightTab, setCustomItemMeta,
  })

  // ── DWG conversion state ───────────────────────────────────────────────────
  const [dwgStatus, setDwgStatus] = useState(null)   // null | 'converting' | 'done' | 'failed'
  const [dwgError, setDwgError] = useState(null)     // actual error message for display
  const [viewerFile, setViewerFile] = useState(null)  // synthetic DXF File for DxfViewerCanvas

  // ── PDF pipeline state ────────────────────────────────────────────────────
  const [pdfConfidence, setPdfConfidence] = useState(null)  // 0–1 overall confidence
  const [pdfSource, setPdfSource] = useState(null)           // 'vector' | 'vision' | 'mixed'
  const [pdfError, setPdfError] = useState(null)             // last PDF API error message
  const [lastPdfFile, setLastPdfFile] = useState(null)       // for retry

  // ── Data ──────────────────────────────────────────────────────────────────
  const canvasRef = useRef(null)
  const pdfInputRef = useRef(null) // PDF-only file picker for exploded DXF recovery
  const _asmLoad = useMemo(() => {
    try { return { data: loadAssemblies(), error: null } }
    catch (err) { return { data: [], error: `Szerelvénytár betöltése sikertelen: ${err.message}` } }
  }, [])
  const _wiLoad = useMemo(() => {
    try { return { data: loadWorkItems(), error: null } }
    catch (err) { return { data: [], error: `Munkatételek betöltése sikertelen: ${err.message}` } }
  }, [])
  const _matLoad = useMemo(() => {
    if (materialsProp) return { data: materialsProp, error: null }
    try { return { data: loadMaterials(), error: null } }
    catch (err) { return { data: [], error: `Anyaglista betöltése sikertelen: ${err.message}` } }
  }, [materialsProp])
  const assemblies = _asmLoad.data
  const workItems = _wiLoad.data
  const materials = _matLoad.data
  const dataLoadError = _asmLoad.error || _wiLoad.error || _matLoad.error

  // ── Helper: File → base64 string ──────────────────────────────────────────
  const fileToBase64 = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  }), [])

  // ── Parse file on drop ────────────────────────────────────────────────────
  const handleFile = useCallback(async (f) => {
    setFile(f)
    setParsedDxf(null)
    setEvidenceMap(null)
    setRecognizedItems([])
    setAsmOverrides({})
    setQtyOverrides({})
    setItemQtyOverrides({})
    setDeletedItems(new Set())
    setVariantOverrides({})
    setWallSplits({})
    setCableEstimate(null)
    setManualCableMode(false)
    setReferencePanels([])
    setPdfMarkers([])
    setCustomItemMeta({})
    setDwgStatus(null)
    setDwgError(null)
    setViewerFile(null)
    setUnitOverride(null)
    // Reset UI/save state to prevent stale data from previous file
    setHighlightBlock(null)
    setSaveError(null)
    setSaveSuccess(false)

    const ext = f.name.toLowerCase().split('.').pop()

    if (ext === 'pdf') {
      // ── PDF: skip auto-detection, go directly to manual takeoff ──────────
      // The auto-detection pipeline (runPdfTakeoff) is not stable enough for
      // production use — it produces misleading recognition results on most
      // architectural / electrical PDFs.  The engine is preserved but disabled.
      setPdfConfidence(null)
      setPdfSource(null)
      setPdfError(null)
      setLastPdfFile(f)
      setParsedDxf({ success: true, _noDxf: true })
      setRightTab('takeoff')
      return
    }

    if (ext !== 'dxf' && ext !== 'dwg') {
      // Unknown format — skip
      setParsedDxf({ success: false, _noDxf: true })
      return
    }

    setParsePending(true)
    setParseProgress(0)

    try {
      let result

      if (ext === 'dwg') {
        // ── CloudConvert DWG → DXF (extracted to utils/dwgConversionFlow.js) ──
        setDwgStatus('converting')
        setDwgError(null)
        let dxfText = null
        try {
          dxfText = await convertDwgToDxf(f, getAuthHeaders)
        } catch (convErr) {
          console.warn('DWG → DXF conversion failed:', convErr)
          setDwgStatus('failed')
          setDwgError(convErr.message)
          setParsedDxf(normalizeDxfResult({ success: false, _dwgFailed: true }, 'browser'))
          setEvidenceMap(null)
          return
        }

        setDwgStatus('done')
        // Create synthetic DXF file for the viewer and parse for recognition
        const dxfName = f.name.replace(/\.dwg$/i, '.dxf')
        const syntheticFile = new File([dxfText], dxfName, { type: 'text/plain' })
        setViewerFile(syntheticFile)
        // Persist converted DXF so reopening doesn't trigger reconversion
        if (planId) {
          const dxfBlob = new Blob([dxfText], { type: 'text/plain' })
          savePlanBlob({ id: planId, name: dxfName, fileType: 'dxf' }, dxfBlob).catch(err =>
            console.warn('[TakeoffWorkspace] DWG→DXF cache save failed:', err.message)
          )
        }
        // Parse converted DXF in a Web Worker to avoid freezing the UI on large files
        try {
          result = await parseDxfTextInWorker(dxfText, pct => setParseProgress(pct))
        } catch (workerErr) {
          console.warn('DWG→DXF worker parse failed, falling back to main thread:', workerErr.message)
          result = parseDxfText(dxfText)
        }

      } else {
        // ── Native DXF parse ───────────────────────────────────────────────
        setViewerFile(f)
        result = await parseDxfFile(f, pct => setParseProgress(pct))
      }

      // ── Normalize raw parser output through contract layer ──────────────
      const parserSource = result?._source || 'browser'
      result = normalizeDxfResult(result, parserSource)
      setParsedDxf(result)

      // ── Build evidence from NORMALIZED contract (parser-path independent) ──
      const evMap = buildBlockEvidence(result)
      setEvidenceMap(evMap)

      // Run recognition on all unique block types (filter junk/internal CAD blocks first)
      const blockMap = {}
      for (const b of (result.blocks || [])) {
        if (isJunkBlock(b.name)) continue // skip CAD-internal blocks
        if (!blockMap[b.name]) blockMap[b.name] = 0
        blockMap[b.name] += b.count
      }
      const items = Object.entries(blockMap).map(([blockName, qty]) => {
        let rec = recognizeBlock(blockName)
        // Memory cascade: if recognizeBlock has no good match, check learned memory
        // Allow lookup even without memProjectId — lookupMemory handles null projectId
        // by skipping project-tier but still checking account-tier memory.
        if (!rec.asmId || rec.confidence < 0.80) {
          const evidence = evMap.get(blockName) || null
          const mem = lookupMemory(blockName, memProjectId, evidence)
          if (mem) {
            rec = {
              asmId: mem.asmId, confidence: mem.confidence,
              matchType: 'memory', rule: mem.tier,
              signalType: mem.signalType || 'block_name',
            }
          }
        }
        return { blockName, qty, ...rec }
      }).sort((a, b) => b.confidence - a.confidence || b.qty - a.qty)

      setRecognizedItems(items)
      if (items.length) setRightTab('takeoff')
    } catch (err) {
      console.error('[TakeoffWorkspace] Parse error:', err)
      setParsedDxf(normalizeDxfResult({ success: false, error: err.message || String(err) }, 'browser'))
      setEvidenceMap(null)
    } finally {
      setParsePending(false)
    }
  }, [fileToBase64, memProjectId])

  // ── Bootstrap / prefill lifecycle (extracted to useTakeoffBootstrap) ──────
  useTakeoffBootstrap({
    initialData, initialFile, file,
    setRecognizedItems, setRightTab, setQuoteName,
    handleFile,
  })

  // ── Effective items (filtered + overridden) ──────────────────────────────
  // ── Takeoff row derived chain (extracted to useTakeoffRowState) ──────────
  const { effectiveItems, totalItems, unknownItems, unknownProgress, takeoffRows } = useTakeoffRowState({
    recognizedItems, deletedItems, itemQtyOverrides,
    asmOverrides, qtyOverrides, variantOverrides, wallSplits,
    pdfMarkers,
  })

  // ── Review / audit / workflow / save-gating derived state ─────────────────
  const { classifiedItems, reviewSummary, dxfAudit, cableAudit, workflowStatus, saveGating } = useTakeoffReviewAuditState({
    recognizedItems, asmOverrides, deletedItems,
    cableEstimate, cableReviewed,
    parsedDxf, isPdf,
    referencePanels, takeoffRowCount: takeoffRows.length,
  })

  // ── Auto-compute cable estimate for DXF (3-tier cascade) ────────────────
  // P1: DXF layer geometry  (mért kábelvonalak, confidence 0.92)
  // ── Cable estimation effects (extracted to hooks/useCableEstimation.js) ──
  useCableEstimation({
    takeoffRows, effectiveParsedDxf, recognizedItems, asmOverrides,
    setCableEstimate, referencePanels, planId,
  })

  // ── Derived: pricing ──────────────────────────────────────────────────────
  // ── Pricing orchestration (extracted to hooks/usePricingPipeline.js) ──
  const { pricing, measurementItems, measurementCostTotal, fullCalc, unitCostByAsmByWall } = usePricingPipeline({
    takeoffRows, assemblies, workItems, materials, context, markup, markupType,
    hourlyRate, vatPercent, cablePricePerM, cableEstimate, difficultyMode,
    pdfMeasurements, measurementPrices, customItemMeta,
  })

  // ── Accept all high-confidence ────────────────────────────────────────────
  const acceptAllHighConf = () => {
    const newOverrides = { ...asmOverrides }
    let changed = false
    for (const item of effectiveItems) {
      if (item.confidence >= 0.8 && item.asmId && newOverrides[item.blockName] === undefined) {
        // Explicitly confirm the auto-matched assembly so manual overrides won't revert it
        newOverrides[item.blockName] = item.asmId
        changed = true
        // Learn from explicit user click — record to recognition memory
        if (memProjectId) {
          recordConfirmation(item.blockName, item.asmId, memProjectId, 'accept_all', evidenceMap?.get(item.blockName))
        }
      }
    }
    if (changed) setAsmOverrides(newOverrides)
    setRightTab('takeoff')
  }

  // ── Assign unknown block to assembly (immediate memory learn) ─────────
  const handleAssignUnknown = useCallback((blockName, asmId) => {
    // 1. Store override → block now resolves to asmId in takeoff rows
    setAsmOverrides(prev => ({ ...prev, [blockName]: asmId }))
    // 2. Learn immediately — record as user_override so future encounters auto-match
    if (memProjectId) {
      recordConfirmation(blockName, asmId, memProjectId, 'user_override', evidenceMap?.get(blockName))
    }
  }, [memProjectId, evidenceMap])

  // ── Delete (exclude) unknown block ─────────────────────────────────────
  const handleDeleteUnknown = useCallback((blockName) => {
    setDeletedItems(prev => {
      const next = new Set(prev)
      next.add(blockName)
      return next
    })
  }, [])

  // ── Bulk-skip: exclude all unknown blocks with qty ≤ threshold ─────────
  const handleBulkSkipLowImpact = useCallback((threshold) => {
    const toSkip = unknownItems.filter(i => i.qty <= threshold).map(i => i.blockName)
    if (toSkip.length === 0) return
    setDeletedItems(prev => {
      const next = new Set(prev)
      toSkip.forEach(bn => next.add(bn))
      return next
    })
  }, [unknownItems])

  // ── Save (per-plan or quote) ──────────────────────────────────────────────
  const handleSave = async () => {
    setSaveError(null) // clear previous error immediately on new click
    if (!takeoffRows.length && !measurementItems.length) {
      setSaveError('Nincs felvett elem — jelölj ki elemeket vagy végezz mérést a tervrajzon!')
      return
    }
    if (quotePricingMode !== 'manual' && !pricing && !measurementItems.length) {
      setSaveError('Árkalkuláció nem elérhető — ellenőrizd az assemblyket!')
      return
    }
    setSaving(true)
    try {
      // ── Per-plan save (Felmérés flow): merge-before-save to avoid partial overwrite ──
      // Read current store state first, then overlay only workspace-owned fields.
      // This preserves measurements, scale, cableRoutes, rotation etc. from the viewer.
      // NOTE: Manual pricing mode skips per-plan calc snapshot and goes directly
      // to full-quote save, because manual mode doesn't use assembly BOM pricing.
      if (planId && quotePricingMode !== 'manual') {
        const stored = (await getPlanAnnotations(planId)) || {}
        await savePlanAnnotations(planId, {
          ...stored,
          markers: pdfMarkers,
          wallSplits,
          variantOverrides,
          deletedItems: [...deletedItems],
          referencePanels,
          cableReviewed: cableEstimate?._source === 'panel_assisted' || cableReviewed,
          customItemMeta: Object.keys(customItemMeta).length > 0 ? customItemMeta : undefined,
        })
        // Persist pricing summary + snapshot for quote generation on plan metadata
        // Resolve plan-level system type from filename inference (fallback: 'general')
        const _planMeta = getPlanMeta(planId)
        const _planSysType = _planMeta?.inferredMeta?.systemType || 'general'
        const _planFloor = _planMeta?.inferredMeta?.floor || null
        const _planFloorLabel = _planMeta?.inferredMeta?.floorLabel || null
        const snapshotItems = [
          ...buildSnapshotItems(pricing.lines, measurementItems, _planSysType, _planFloor, _planFloorLabel),
          ...buildCustomSnapshotItems(takeoffRows, customItemMeta, _planSysType, _planFloor, _planFloorLabel),
        ]
        const snapshotAssembly = buildAssemblySummary(
          takeoffRows, pricing, assemblies, workItems, materials,
          context, markup, hourlyRate, difficultyMode, computePricing,
        )
        const grandTotal = fullCalc?.grandTotal || pricing.total
        updatePlanMeta(planId, {
          calcTotal: Math.round(grandTotal),
          calcItemCount: takeoffRows.reduce((s, r) => s + r.qty, 0),
          calcDate: new Date().toISOString(),
          calcTakeoffRows: takeoffRows,
          calcPricing: {
            total: grandTotal,
            materialCost: (pricing.materialCost || 0) + (fullCalc?.measurementCost || 0),
            laborCost: pricing.laborCost,
            laborHours: pricing.laborHours,
          },
          calcPricingLines: snapshotItems,
          calcAssemblySummary: snapshotAssembly,
          calcHourlyRate: hourlyRate,
          calcMarkup: markup,
          calcMarkupType: markupType,
          calcCableCost: Math.round(fullCalc?.cableCost || 0),
        })
        // Learn from save — only train memory with reviewed/trusted items
        trainMemoryFromSave(classifiedItems, asmOverrides, memProjectId, evidenceMap)

        // Show save-success strip instead of immediately navigating back
        if (onQuoteFromPlan) {
          setSaveSuccess(true)
        } else {
          onSaved?.()
        }
        return
      }

      // ── Full quote save (new-quote flow or merge fallback) ──
      // Note: planId may be null in pure new-quote flow (no plan association)
      const _fqPlanMeta = planId ? getPlanMeta(planId) : null
      const _fqPlanSysType = _fqPlanMeta?.inferredMeta?.systemType || 'general'
      const _fqPlanFloor = _fqPlanMeta?.inferredMeta?.floor || null
      const _fqPlanFloorLabel = _fqPlanMeta?.inferredMeta?.floorLabel || null

      const displayName = quoteName || `Ajánlat ${new Date().toLocaleDateString('hu-HU')}`
      const planMeta = planId ? getPlanMeta(planId) : null
      const prjDefault = initialData?.quoteOverrides?._outputMode
        || (planMeta?.projectId ? (getProject(planMeta.projectId)?.defaultQuoteOutputMode || 'combined') : 'combined')

      let quote
      if (quotePricingMode === 'manual') {
        // ── Manual pricing: seed manualRows from takeoff, skip assembly BOM ──
        const seededRows = takeoffToManualRows(takeoffRows, assemblies, {
          systemType: _fqPlanSysType, floor: _fqPlanFloor, floorLabel: _fqPlanFloorLabel,
        })
        const manualTotals = computeManualTotals(seededRows, hourlyRate)
        const manualItems = materializeManualRowsToItems(seededRows, hourlyRate)
        quote = createQuote({
          displayName,
          clientName,
          outputMode: prjDefault,
          pricing: {
            total: manualTotals.totalMaterials + manualTotals.totalLabor,
            materialCost: manualTotals.totalMaterials,
            laborCost: manualTotals.totalLabor,
            laborHours: manualTotals.totalHours,
          },
          pricingParams: { hourlyRate, markupPct: markup, markupType },
          settings,
          pricingMode: 'manual',
          manualRows: seededRows,
          overrides: {
            items: manualItems,
            assemblySummary: [],
            context,
            cableEstimate,
            cableCost: 0,
            source: 'takeoff-workspace',
            fileName: file?.name,
            bundleId: initialData?.bundleId || null,
          },
        })
      } else {
        // ── Assembly pricing: existing flow + custom items ──
        const items = [
          ...buildSnapshotItems(pricing.lines, measurementItems, _fqPlanSysType, _fqPlanFloor, _fqPlanFloorLabel),
          ...buildCustomSnapshotItems(takeoffRows, customItemMeta, _fqPlanSysType, _fqPlanFloor, _fqPlanFloorLabel),
        ]
        const assemblySummary = buildAssemblySummary(
          takeoffRows, pricing, assemblies, workItems, materials,
          context, markup, hourlyRate, difficultyMode, computePricing,
        )
        const financialPricing = fullCalc ? {
          total:        Math.round(fullCalc.grandTotal),
          materialCost: Math.round((pricing?.materialCost || 0) + (fullCalc.measurementCost || 0) + (fullCalc.customItemsCost || 0)),
          laborCost:    Math.round(pricing?.laborCost || 0),
          laborHours:   pricing?.laborHours || 0,
        } : pricing
        quote = createQuote({
          displayName,
          clientName,
          outputMode: prjDefault,
          pricing: financialPricing,
          pricingParams: { hourlyRate, markupPct: markup, markupType },
          settings,
          overrides: {
            items,
            assemblySummary,
            context,
            cableEstimate,
            cableCost: Math.round(fullCalc?.cableCost || 0),
            source: 'takeoff-workspace',
            fileName: file?.name,
            bundleId: initialData?.bundleId || null,
          },
        })
      }
      saveQuote(quote)

      // Learn from save — only train memory with reviewed/trusted items
      trainMemoryFromSave(classifiedItems, asmOverrides, memProjectId, evidenceMap)

      onSaved?.(quote)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render: upload screen ─────────────────────────────────────────────────
  if (!file) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 20, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: C.text }}>Új takeoff workspace</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, marginTop: 2 }}>Enterprise szintű tervrajz feldolgozás</div>
          </div>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, background: C.bgCard, border: `1px solid ${C.border}`, color: C.textSub, cursor: 'pointer', fontFamily: 'Syne', fontSize: 13 }}>
            Mégse
          </button>
        </div>
        <DropZone onFile={handleFile} />
      </div>
    )
  }

  // ── Render: parsing / DWG converting ─────────────────────────────────────
  if (parsePending) {
    const isDwgConverting = dwgStatus === 'converting'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
        {isDwgConverting ? (
          <>
            <div style={{
              width: 40, height: 40, border: '3px solid #1E1E22',
              borderTopColor: '#00E5A0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>DWG → DXF konverzió…</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>Ez néhány másodpercet vesz igénybe</div>
            <div style={{ width: 200, height: 2, background: C.border, borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '40%', background: C.accent, borderRadius: 1, animation: 'slideProgress 1.5s ease-in-out infinite' }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'DM Mono', fontSize: 14, color: C.textSub }}>Tervrajz feldolgozása...</div>
            <div style={{ width: 300, height: 4, background: C.border, borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${parseProgress}%`, background: C.accent, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>{parseProgress}%</div>
          </>
        )}
      </div>
    )
  }

  // isDxf = native DXF file, OR DWG that was successfully converted to DXF
  const isDxf = file.name.toLowerCase().endsWith('.dxf') || dwgStatus === 'done'
  // isPdf is derived early (line ~652) — no redeclaration needed here

  // ── Render: main workspace ────────────────────────────────────────────────
  return (
    <div data-testid="workspace-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`@keyframes slideProgress { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }`}</style>

      {/* ── Sticky pricing bar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0, padding: isMobile ? '10px 14px' : '12px 20px',
        background: C.bgCard, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        zIndex: 20, flexWrap: 'wrap', rowGap: 8,
      }}>
        {/* File name */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
            {totalItems} elem · {takeoffRows.length} assembly · {cableEstimate ? `~${Math.round(cableEstimate.cable_total_m)} m kábel` : 'kábel: —'}
          </div>
        </div>

        {/* Mobile: DXF viewer toggle button */}
        {isMobile && isDxf && (
          <button
            onClick={() => setShowDxfOnMobile(p => !p)}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              background: showDxfOnMobile ? C.accentDim : C.bgHover,
              border: `1px solid ${showDxfOnMobile ? C.accent : C.border}`,
              color: showDxfOnMobile ? C.accent : C.textSub,
              fontFamily: 'Syne', fontWeight: 700, fontSize: 11, flexShrink: 0,
            }}
          >
            {showDxfOnMobile ? 'Takeoff' : 'Terv'}
          </button>
        )}

        {/* Pricing summary or save-success strip */}
        {saveSuccess && planId ? (
          <>
            <div data-testid="workspace-save-success" style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.accent, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✓ Kalkuláció mentve · {Math.round(fullCalc?.grandTotal || pricing?.total || 0).toLocaleString('hu-HU')} Ft
            </div>
            <button
              onClick={async () => {
                setSaving(true)
                try { await onQuoteFromPlan?.(planId) }
                finally { setSaving(false) }
              }}
              disabled={saving}
              style={{
                marginLeft: 12, padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontFamily: 'Syne', fontWeight: 800, fontSize: 14,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '...' : 'Ajánlat generálása'}
            </button>
            <button
              onClick={() => onSaved?.()}
              style={{
                marginLeft: 8, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
                fontFamily: 'Syne', fontWeight: 600, fontSize: 13,
              }}
            >
              ← Vissza a projekthez
            </button>
          </>
        ) : fullCalc ? (
          <>
            <PricingPill label="Anyag" value={fullCalc.materialCost} color={C.blue} />
            <div style={{ width: 1, height: 32, background: C.border, margin: '0 12px' }} />
            <PricingPill label="Munka" value={fullCalc.laborCost} color={C.yellow} />
            {fullCalc.cableCost > 0 && (
              <>
                <div style={{ width: 1, height: 32, background: C.border, margin: '0 12px' }} />
                <PricingPill label="Kábel" value={fullCalc.cableCost} color={C.blue} />
              </>
            )}
            <div style={{ width: 1, height: 32, background: C.border, margin: '0 12px' }} />
            <div style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => setRightTab('calc')} title="Nyisd meg a Kalkuláció fület">
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>Ajánlati ár (nettó){fullCalc.markupPct > 0 ? ` · +${fullCalc.markupPct.toFixed(0)}% árrés` : ''}</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.accent }}>
                {Math.round(fullCalc.grandTotal).toLocaleString('hu-HU')} Ft
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
                bruttó: {Math.round(fullCalc.bruttoTotal).toLocaleString('hu-HU')} Ft
              </div>
            </div>
          </>
        ) : (
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>
            Adj hozzá elemeket az árajánlat generálásához
          </div>
        )}

        <button
          onClick={onCancel}
          style={{ marginLeft: 12, padding: '8px 14px', borderRadius: 8, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontFamily: 'Syne', fontSize: 12 }}
        >
          ✕
        </button>
      </div>

      {/* ── Material lookup warnings ────────────────────────────────────────── */}
      {pricing?.warnings?.length > 0 && (
        <div style={{
          padding: '4px 20px', background: 'rgba(255,209,102,0.06)',
          borderBottom: '1px solid rgba(255,209,102,0.12)',
          fontFamily: 'DM Mono', fontSize: 10, color: '#FFD166',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>⚠</span>
          {pricing.warnings.length} anyag nem található a katalógusban (0 Ft-tal számolva)
          <span style={{ color: C.muted, marginLeft: 4 }}>
            — {[...new Set(pricing.warnings.map(w => w.name))].slice(0, 3).join(', ')}{pricing.warnings.length > 3 ? ' …' : ''}
          </span>
        </div>
      )}

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Tervrajz nézegető ────────────────────────────────────────── */}
        <div style={{ flex: isMobile ? '0 0 100%' : `0 0 ${panelRatio}%`, position: 'relative', background: '#050507', display: (isMobile && !showDxfOnMobile) ? 'none' : undefined }}>
          {isDxf && viewerFile && (
            <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#050507' }} />}>
              <DxfViewerPanel
                ref={canvasRef}
                file={viewerFile}
                planId={planId}
                assemblies={assemblies}
                focusTarget={focusTarget}
                onMarkersChange={(markers) => {
                  setPdfMarkers(markers)
                }}
                onMeasurementsChange={(measurements) => {
                  setPdfMeasurements(measurements)
                }}
                onCableData={(data) => {
                  if (data) {
                    const normalized = normalizeCableEstimate(data, CABLE_SOURCE.DXF_MARKERS)
                    // Context guard: never let DXF markers overwrite PDF marker estimate
                    if (isCrossContextMarkerConflict(cableEstimate?._source, CABLE_SOURCE.DXF_MARKERS)) return
                    if (shouldOverwrite(cableEstimate, normalized)) setCableEstimate(normalized)
                  } else if (cableEstimate?._source === CABLE_SOURCE.DXF_MARKERS) {
                    // Markers cleared — drop DXF marker estimate, let DXF useEffect recalculate
                    setCableEstimate(null)
                  }
                }}
                style={{ height: '100%', border: 'none', borderRadius: 0 }}
              />
            </Suspense>
          )}

          {/* SVG overlay with block position dots (uses canvasRef proxied through DxfViewerPanel forwardRef) */}
          {isDxf && effectiveParsedDxf?.inserts?.length > 0 && (
            <DxfBlockOverlay
              inserts={effectiveParsedDxf.inserts}
              asmOverrides={asmOverrides}
              recognizedItems={recognizedItems}
              highlightBlock={highlightBlock || selectedUnknownBlock}
              visibleBlocks={visibleBlocks}
              visibleAsmIds={visibleAsmIds}
              onBlockClick={name => {
                if (manualCableMode) {
                  // In manual cable mode: toggle block as reference panel
                  const updated = toggleReferencePanelBlock(
                    referencePanels, name, effectiveParsedDxf?.inserts || [], 'manual_panel'
                  )
                  setReferencePanels(updated)
                } else {
                  setHighlightBlock(prev => prev === name ? null : name)
                }
              }}
              canvasRef={canvasRef}
            />
          )}

          {/* No DXF viewer fallback — PDF viewer or failed DWG conversion */}
          {!isDxf && (
            dwgStatus === 'failed' ? (
              <div data-testid="dwg-conversion-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32 }}>
                <>
                  <div style={{ fontSize: 40 }}>⚠️</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.yellow, textAlign: 'center' }}>
                    DWG konverzió sikertelen
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, textAlign: 'center', maxWidth: 360, lineHeight: 1.7 }}>
                    {dwgError
                      ? <span style={{ color: '#FF9090' }}>{dwgError}</span>
                      : <>A DWG fájl automatikus konvertálása nem sikerült.</>
                    }<br /><br />
                    <strong>Két megoldás:</strong><br />
                    1. Exportáld PDF-ként → az Auto Symbol funkcióval dolgozz<br />
                    2. Exportáld DXF-ként → a blokk-alapú felismerés automatikusan működik
                  </div>
                  <div style={{
                    background: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 10,
                    padding: '16px 20px', maxWidth: 360, width: '100%',
                  }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, lineHeight: 2 }}>
                      <div><span style={{ color: C.accent }}>AutoCAD:</span> File → Export → DXF</div>
                      <div><span style={{ color: C.accent }}>LibreCAD:</span> File → Export as → .dxf</div>
                      <div><span style={{ color: C.accent }}>FreeCAD:</span> File → Export → .dxf</div>
                      <div><span style={{ color: C.accent }}>BricsCAD:</span> Save As → .dxf (R2010)</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                    Ajánlott DXF verzió: AutoCAD 2010 (R18) vagy újabb
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button onClick={() => file && handleFile(file)} style={{
                      padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                      background: C.accentDim, border: `1px solid ${C.accent}40`,
                      color: C.accent, fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                    }}>🔄 Próbáld újra</button>
                    <button onClick={() => { setFile(null); setParsedDxf(null); setEvidenceMap(null) }} style={{
                      padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${C.border}`,
                      color: C.textSub, fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                    }}>📁 Másik fájl</button>
                  </div>
                </>
              </div>
            ) : isPdf ? (
              <Suspense fallback={<div style={{ width: '100%', height: '100%', background: C.bg }} />}>
                <PdfViewerPanel
                  file={file}
                  planId={planId}
                  projectId={planId ? (getPlanMeta(planId)?.projectId || null) : null}
                  style={{ height: '100%', border: 'none', borderRadius: 0 }}
                  assemblies={assemblies}
                  focusTarget={focusTarget}
                  onDirtyChange={onDirtyChange}
                  onMarkersChange={(markers) => {
                    setPdfMarkers(markers)
                  }}
                  onMeasurementsChange={(measurements) => {
                    setPdfMeasurements(measurements)
                  }}
                  onCableData={(data) => {
                    if (data) {
                      const normalized = normalizeCableEstimate(data, CABLE_SOURCE.PDF_MARKERS)
                      // Context guard: never let PDF markers overwrite DXF marker estimate
                      if (isCrossContextMarkerConflict(cableEstimate?._source, CABLE_SOURCE.PDF_MARKERS)) return
                      if (shouldOverwrite(cableEstimate, normalized)) {
                        setCableEstimate(normalized)
                      }
                    } else if (cableEstimate?._source === CABLE_SOURCE.PDF_MARKERS) {
                      // Markers cleared — fall back to pdf_takeoff or null
                      setCableEstimate(null)
                    }
                  }}
                  onCreateQuote={() => {
                    // Triggered from EstimationPanel inside PdfViewer —
                    // delegate to TakeoffWorkspace's handleSave which uses
                    // the assembly-based takeoffRows + pricing pipeline
                    handleSave()
                  }}
                />
              </Suspense>
            ) : null
          )}

          {/* Dot legend bottom-left */}
          {parsedDxf?.inserts?.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12, background: 'rgba(9,9,11,0.85)',
              border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px',
              display: 'flex', gap: 10, zIndex: 11, backdropFilter: 'blur(8px)',
            }}>
              {BLOCK_ASM_RULES.filter(r => r.asmId).map(r => (
                <div key={r.asmId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: ASM_COLORS[r.asmId] }} />
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>{r.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Drag handle ──────────────────────────────────────────────────── */}
        {!isMobile && (
          <div
            onMouseDown={handleDividerMouseDown}
            title="Húzd a panel átméretezéséhez"
            style={{
              width: 5, flexShrink: 0, cursor: 'col-resize', background: C.border,
              transition: 'background 0.15s', position: 'relative', zIndex: 10,
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.accent + '60'}
            onMouseLeave={e => e.currentTarget.style.background = C.border}
          />
        )}

        {/* ── RIGHT: Munkaterület panel ─────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: (isMobile && showDxfOnMobile) ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bgCard, flexShrink: 0 }}>
            {[
              { id: 'takeoff',   label: 'Felmérés',    badge: takeoffRows.length, warn: workflowStatus?.badges?.takeoff },
              { id: 'cable',     label: 'Kábel',       warn: workflowStatus?.badges?.cable },
              { id: 'context',   label: 'Beállítás' },
              { id: 'calc',      label: 'Kalkuláció',  warn: workflowStatus?.badges?.calc },
            ].map(tab => (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setRightTab(tab.id)}
                style={{
                  flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                  background: 'transparent', borderBottom: `2px solid ${rightTab === tab.id ? C.accent : 'transparent'}`,
                  color: rightTab === tab.id ? C.accent : C.muted,
                  fontFamily: 'Syne', fontWeight: 700, fontSize: 11, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'color 0.15s',
                  position: 'relative',
                }}
              >
                {tab.label}
                {tab.badge != null && (
                  <span style={{ background: rightTab === tab.id ? C.accentDim : 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '1px 5px', fontSize: 10 }}>
                    {tab.badge}
                  </span>
                )}
                {/* Warning dot */}
                {tab.warn && rightTab !== tab.id && (
                  <span style={{
                    position: 'absolute', top: 5, right: 8,
                    width: 6, height: 6, borderRadius: '50%',
                    background: tab.warn === 'error' ? C.red
                      : tab.warn === 'blocked' ? C.red
                      : C.yellow,
                  }} />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

            {/* ── Data-load failure banner (visible on ALL tabs) ── */}
            {dataLoadError && (
              <div style={{
                background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 8,
                padding: '10px 14px', color: C.red, fontFamily: 'DM Mono', fontSize: 12,
                marginBottom: 12,
              }}>
                ⚠ {dataLoadError}
              </div>
            )}

            {/* ── TAKEOFF TAB ─────────────────────────────────────────────── */}
            {rightTab === 'takeoff' && (
              <div>
                {/* Unified Workflow Status Card — replaces DxfAuditCard + ReviewSummaryCard */}
                {workflowStatus && workflowStatus.stage !== 'empty' && !isPdf && (
                  <WorkflowStatusCard
                    workflowStatus={workflowStatus}
                    reviewSummary={reviewSummary}
                    dxfAudit={dxfAudit}
                    cableAudit={cableAudit}
                    onAcceptAll={acceptAllHighConf}
                    onTabSwitch={setRightTab}
                    onAction={(action) => {
                      if (action === 'save') handleSave()
                      if (action === 'activate_manual_cable') {
                        setManualCableMode(true)
                        setRightTab('cable')
                      }
                      if (action === 'switch_to_pdf') {
                        // Exploded DXF recovery: open PDF-only file picker
                        pdfInputRef.current?.click()
                      }
                    }}
                    isPdf={isPdf}
                  />
                )}

                {/* Unknown block resolution panel — lets user assign unknown blocks */}
                {!isPdf && unknownItems.length > 0 && (
                  <UnknownBlockPanel
                    unknownItems={unknownItems}
                    assemblies={assemblies}
                    onAssign={handleAssignUnknown}
                    onDelete={handleDeleteUnknown}
                    onBulkSkipLowImpact={handleBulkSkipLowImpact}
                    evidenceMap={evidenceMap}
                    progress={unknownProgress}
                    onBlockHover={setHighlightBlock}
                    selectedBlock={selectedUnknownBlock}
                    visibleBlocks={visibleBlocks}
                    onToggleVisibility={(blockName) => {
                      setVisibleBlocks(prev => {
                        const next = new Set(prev)
                        next.has(blockName) ? next.delete(blockName) : next.add(blockName)
                        return next
                      })
                    }}
                    onBlockSelect={(blockName) => {
                      const isDeselect = selectedUnknownBlock === blockName
                      setSelectedUnknownBlock(isDeselect ? null : blockName)
                      setHighlightBlock(isDeselect ? null : blockName)
                      // Zoom-to-hits: fit camera to show all instances of this block
                      if (!isDeselect && blockName && effectiveParsedDxf?.inserts?.length) {
                        const hits = effectiveParsedDxf.inserts.filter(ins => ins.name === blockName)
                        if (hits.length > 0) {
                          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
                          for (const h of hits) {
                            if (h.x < minX) minX = h.x; if (h.x > maxX) maxX = h.x
                            if (h.y < minY) minY = h.y; if (h.y > maxY) maxY = h.y
                          }
                          const viewer = canvasRef.current?.getViewer?.()
                          if (viewer?.camera) {
                            const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.3
                            viewer.FitView(minX - pad, maxX + pad, minY - pad, maxY + pad, 0.05)
                          }
                        }
                      }
                    }}
                  />
                )}

                {takeoffRows.length === 0 && unknownItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Még nincs felvett elem. Használd a Számlálás eszközt a tervrajzon.
                  </div>
                ) : (
                  <>
                    {takeoffRows.map(row => {
                      const rowKey = row._sourceType === 'custom' ? row._customItemId : row.asmId
                      // Check if any items contributing to this row came from memory
                      const memItem = row._sourceType !== 'custom' ? effectiveItems.find(i =>
                        i.matchType === 'memory' &&
                        ((asmOverrides[i.blockName] !== undefined ? asmOverrides[i.blockName] : i.asmId) === row.asmId)
                      ) : null
                      return (
                      <TakeoffRow
                        key={rowKey}
                        row={row}
                        customMeta={row._sourceType === 'custom' ? (customItemMeta[row._customItemId] || null) : undefined}
                        onCustomMetaChange={(id, meta) => setCustomItemMeta(prev => ({ ...prev, [id]: meta }))}
                        isVisible={row._sourceType !== 'custom' && visibleAsmIds.has(row.asmId)}
                        onToggleVisibility={(asmId) => {
                          // Toggle assembly-level visibility
                          setVisibleAsmIds(prev => {
                            const next = new Set(prev)
                            next.has(asmId) ? next.delete(asmId) : next.add(asmId)
                            return next
                          })
                          // Also update blockName-level for overlay compatibility
                          const contributors = effectiveItems.filter(i => (asmOverrides[i.blockName] ?? i.asmId) === asmId)
                          setVisibleBlocks(prev => {
                            const next = new Set(prev)
                            const anyVisible = contributors.some(c => next.has(c.blockName))
                            contributors.forEach(c => anyVisible ? next.delete(c.blockName) : next.add(c.blockName))
                            return next
                          })
                        }}
                        onRowHover={(asmIdOrNull) => {
                          if (!asmIdOrNull) { setHighlightBlock(null); return }
                          // Find a contributing block name for this assembly to trigger overlay highlight
                          const contributor = effectiveItems.find(i => (asmOverrides[i.blockName] ?? i.asmId) === asmIdOrNull)
                          setHighlightBlock(contributor?.blockName || null)
                        }}
                        asmId={row.asmId}
                        qty={row.qty}
                        variantId={row.variantId}
                        wallSplits={row.wallSplits}
                        assemblies={assemblies}
                        memoryTier={memItem?.rule || null}
                        signalType={memItem?.signalType || null}
                        isHighlighted={highlightBlock && effectiveItems.some(i => i.blockName === highlightBlock && (asmOverrides[i.blockName] ?? i.asmId) === row.asmId)}
                        onSplitChange={(id, newSplits) => setWallSplits(p => ({ ...p, [id]: newSplits }))}
                        onVariantChange={(id, vid) => setVariantOverrides(p => ({ ...p, [id]: vid }))}
                        unitCostByWall={unitCostByAsmByWall[row.asmId] || {}}
                        onDelete={(idOrAsmId) => {
                          // Custom row deletion: remove markers by customItemId
                          if (row._sourceType === 'custom') {
                            setPdfMarkers(prev => prev.filter(m => m.customItemId !== idOrAsmId))
                            return
                          }
                          // Assembly row deletion (existing logic)
                          const asmId = idOrAsmId
                          // 1) Remove marker-sourced items for this assembly
                          setPdfMarkers(prev => prev.filter(m => {
                            const mid = m.asmId || (m.category?.startsWith('ASM-') ? m.category : null)
                            return mid !== asmId
                          }))
                          // 2) Remove recognition-sourced items for this assembly
                          const blockNamesToDelete = effectiveItems
                            .filter(i => (asmOverrides[i.blockName] ?? i.asmId) === asmId)
                            .map(i => i.blockName)
                          if (blockNamesToDelete.length > 0) {
                            setDeletedItems(prev => {
                              const next = new Set(prev)
                              blockNamesToDelete.forEach(bn => next.add(bn))
                              return next
                            })
                          }
                          // 3) Clean up derived overrides for this assembly
                          setWallSplits(prev => { const next = { ...prev }; delete next[asmId]; return next })
                          setVariantOverrides(prev => { const next = { ...prev }; delete next[asmId]; return next })
                          setQtyOverrides(prev => { const next = { ...prev }; delete next[asmId]; return next })
                        }}
                      />
                    )})}

                  </>
                )}

                {/* ── Measurement items on Felmérés tab ── */}
                {measurementItems.length > 0 && (
                  <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginTop: 12 }}>
                    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
                      Mérések ({pdfMeasurements.length} db)
                      {measurementCostTotal > 0 && (
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.yellow, marginLeft: 8 }}>
                          {Math.round(measurementCostTotal).toLocaleString('hu-HU')} Ft
                        </span>
                      )}
                    </div>
                    {measurementItems.map(item => (
                      <div key={`felmeres-meas-${item.key}`} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'DM Mono', fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,209,102,0.12)', border: '1px solid rgba(255,209,102,0.25)', color: C.yellow, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>MÉRÉS</span>
                              {item.label}
                            </div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                              {item.totalMeters ? `${item.totalMeters.toFixed(1)} m` : `${item.count} szakasz`}
                              {item.isAutoPriced
                                ? <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, background: C.accentDim, color: C.accent, fontSize: 9 }}>auto · {Math.round(item.autoPrice).toLocaleString('hu-HU')} Ft/m</span>
                                : item.pricePerUnit > 0
                                  ? <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, background: 'rgba(255,209,102,0.12)', color: C.yellow, fontSize: 9 }}>kézi · {Math.round(item.pricePerUnit).toLocaleString('hu-HU')} Ft/m</span>
                                  : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: item.cost > 0 ? C.accent : C.muted, fontWeight: 700 }}>
                              {item.cost > 0 ? `${Math.round(item.cost).toLocaleString('hu-HU')} Ft` : '—'}
                            </div>
                          </div>
                        </div>
                        {item.totalMeters > 0 && !item.isAutoPriced && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>Ár (Ft/m):</span>
                            <input
                              type="number" min={0} step={100}
                              value={measurementPrices[item.key] || ''}
                              placeholder={item.autoPrice > 0 ? Math.round(item.autoPrice) : '0'}
                              onChange={e => setMeasurementPrices(prev => ({ ...prev, [item.key]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                              style={{ width: 90, padding: '3px 6px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight || C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                            />
                            {item.cost > 0 && (
                              <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>
                                = {Math.round(item.cost).toLocaleString('hu-HU')} Ft
                              </span>
                            )}
                          </div>
                        )}
                        {!item.totalMeters && (
                          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.red, marginTop: 2 }}>
                            Kalibráld a rajzot a Skála eszközzel az árazáshoz
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cable summary — always at the bottom of Felmérés tab */}
                {cableEstimate && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(76,201,240,0.06)', border: `1px solid rgba(76,201,240,0.2)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.blue }}>
                          Kábel — ~{Math.round(cableEstimate.cable_total_m)} m
                        </span>
                        <CableModeBadge cableAudit={cableAudit} />
                      </div>
                      <button onClick={() => setRightTab('cable')} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono' }}>
                        részletek →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CABLE TAB ────────────────────────────────────────────────── */}
            {rightTab === 'cable' && (
              <div>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>
                  Kábelbecslés
                </div>
                {/* Manual Cable Mode Panel — shown when mode is active */}
                {manualCableMode && !isPdf && (
                  <ManualCableModePanel
                    referencePanels={referencePanels}
                    recognizedPanelBlocks={recognizedItems
                      .filter(i => i.asmId === 'ASM-018')
                      .map(i => ({ blockName: i.blockName, qty: i.qty }))
                    }
                    cableEstimate={cableEstimate}
                    cableAudit={cableAudit}
                    onAddRecognizedPanel={(blockName) => {
                      const updated = toggleReferencePanelBlock(
                        referencePanels, blockName,
                        effectiveParsedDxf?.inserts || [], 'recognized_panel'
                      )
                      setReferencePanels(updated)
                    }}
                    onRemovePanel={(blockName) => {
                      setReferencePanels(prev => prev.filter(p => p.blockName !== blockName))
                    }}
                    onExit={() => setManualCableMode(false)}
                  />
                )}

                {/* Cable Confidence Card — shows cable mode transparency */}
                {cableAudit && !isPdf && (
                  <CableConfidenceCard
                    cableAudit={cableAudit}
                    onTabSwitch={setRightTab}
                    onManualCable={() => {
                      setManualCableMode(true)
                      setRightTab('cable')
                    }}
                  />
                )}
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 16 }}>
                  {isPdf
                    ? 'Jelöld be az elosztót és az eszközöket a tervrajzon, majd kalibráld a léptéket — a kábelhossz a kijelölt pozíciókból számolódik. Ha nincs jelölés, eszközszám × átlagos kábelhossz alapján becsül.'
                    : 'Ha a DXF tartalmaz kábelvonalakat (réteg neve alapján felismeri), azokat méri. Ha nem, MST-algoritmussal becsül eszközpozíciók alapján, végső esetben eszközszám × átlagos kábelhossz értékkel.'
                  }
                </div>

                {cableEstimate ? (
                  <>
                    {[
                      { key: 'light_m', label: 'Világítási kör (NYM-J 3×1.5)', color: C.accent },
                      { key: 'socket_m', label: 'Dugalj kör (NYM-J 3×2.5)', color: C.blue },
                      { key: 'switch_m', label: 'Kapcsoló kör (NYM-J 3×1.5)', color: C.yellow },
                      { key: 'data_m', label: 'Gyengeáram (Cat6 / koax)', color: '#A8DADC' },
                      { key: 'fire_m', label: 'Tűzjelző (JE-H(St)H E30)', color: '#E63946' },
                      { key: 'other_m', label: 'Egyéb (NYM-J 5×2.5)', color: C.textSub },
                    ].map(({ key, label, color }) => {
                      const m = cableEstimate.cable_by_type?.[key] || 0
                      if (!m) return null
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.bgCard, borderRadius: 8, marginBottom: 6, border: `1px solid ${C.border}` }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>{label}</span>
                          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color }}>{Math.round(m)} m</span>
                        </div>
                      )
                    })}
                    <div style={{ marginTop: 12, padding: '12px 14px', background: C.accentDim, borderRadius: 8, border: `1px solid ${C.accent}30` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>Összesen</span>
                        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.accent }}>{Math.round(cableEstimate.cable_total_m)} m</span>
                      </div>
                      {cableEstimate.cable_total_m_p90 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>P50–P90 tartomány</span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>
                            {Math.round(cableEstimate.cable_total_m_p50 || cableEstimate.cable_total_m)}–{Math.round(cableEstimate.cable_total_m_p90)} m
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                        {cableEstimate.method}
                      </span>
                      <span style={{
                        fontFamily: 'DM Mono', fontSize: 10, padding: '1px 7px', borderRadius: 10,
                        background: cableEstimate._source === 'dxf_layers' ? C.accentDim
                          : cableEstimate._source === 'pdf_markers' ? C.accentDim
                          : cableEstimate._source === 'dxf_markers' ? C.accentDim
                          : cableEstimate._source === 'panel_assisted' ? 'rgba(167,139,250,0.12)'
                          : cableEstimate._source === 'dxf_mst' ? 'rgba(76,201,240,0.12)'
                          : cableEstimate._source === 'pdf_takeoff' ? 'rgba(255,209,102,0.15)'
                          : 'rgba(255,255,255,0.05)',
                        color: cableEstimate._source === 'dxf_layers' ? C.accent
                          : cableEstimate._source === 'pdf_markers' ? C.accent
                          : cableEstimate._source === 'dxf_markers' ? C.accent
                          : cableEstimate._source === 'panel_assisted' ? '#A78BFA'
                          : cableEstimate._source === 'dxf_mst' ? C.blue
                          : cableEstimate._source === 'pdf_takeoff' ? C.yellow
                          : C.muted,
                        border: `1px solid currentColor`,
                      }}>
                        {cableEstimate._source === 'dxf_layers' ? 'mért'
                          : cableEstimate._source === 'pdf_markers' ? 'jelölt'
                          : cableEstimate._source === 'dxf_markers' ? 'jelölt'
                          : cableEstimate._source === 'panel_assisted' ? 'elosztó'
                          : cableEstimate._source === 'dxf_mst' ? 'MST'
                          : cableEstimate._source === 'pdf_takeoff' ? 'PDF'
                          : 'becslés'}
                        {' '}~{Math.round((cableEstimate.confidence || 0.6) * 100)}%
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Adj hozzá elemeket a Felmérés fülön a kábelbecslés elindításához.
                  </div>
                )}
              </div>
            )}

            {/* ── CALC TAB ─────────────────────────────────────────────────── */}
            {rightTab === 'calc' && (
              <div>
                {!fullCalc ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Adj hozzá elemeket a Felmérés fülön a kalkuláció elindításához.
                  </div>
                ) : (
                  <>
                    {/* ── Per-assembly cost breakdown ── */}
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Assembly költségbontás</div>
                      {Object.entries(fullCalc.byAssembly).map(([asmId, info]) => (
                        <div key={asmId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, fontWeight: 600 }}>{info.name}</div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{info.qty} db · {info.laborHours.toFixed(1)} óra</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.blue }}>{Math.round(info.materialCost).toLocaleString('hu-HU')} Ft</div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow }}>{Math.round(info.laborCost).toLocaleString('hu-HU')} Ft</div>
                          </div>
                        </div>
                      ))}
                      {/* Measurement line items (cable trays, manual measurements) as pricing rows */}
                      {(fullCalc.measurementLines || []).map(item => (
                        <div key={`meas-${item.key}`} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontFamily: 'DM Mono', fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,209,102,0.12)', border: '1px solid rgba(255,209,102,0.25)', color: C.yellow, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }} title="Mért tétel a tervrajzról">MÉRÉS</span>
                                {item.label}
                              </div>
                              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                                {item.totalMeters ? `${item.totalMeters.toFixed(1)} m` : `${item.count} szakasz`}
                                {item.isAutoPriced
                                  ? <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, background: C.accentDim, color: C.accent, fontSize: 9 }}>auto · {Math.round(item.autoPrice).toLocaleString('hu-HU')} Ft/m</span>
                                  : item.pricePerUnit > 0
                                    ? <span style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, background: 'rgba(255,209,102,0.12)', color: C.yellow, fontSize: 9 }}>kézi · {Math.round(item.pricePerUnit).toLocaleString('hu-HU')} Ft/m</span>
                                    : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: item.cost > 0 ? C.accent : C.muted, fontWeight: 700 }}>
                                {item.cost > 0 ? `${Math.round(item.cost).toLocaleString('hu-HU')} Ft` : '—'}
                              </div>
                            </div>
                          </div>
                          {/* Manual price input for items without auto-pricing */}
                          {item.totalMeters > 0 && !item.isAutoPriced && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>Ár (Ft/m):</span>
                              <input
                                type="number" min={0} step={100}
                                value={measurementPrices[item.key] || ''}
                                placeholder={item.autoPrice > 0 ? Math.round(item.autoPrice) : '0'}
                                onChange={e => setMeasurementPrices(prev => ({ ...prev, [item.key]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                style={{ width: 90, padding: '3px 6px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight || C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                              />
                              {item.cost > 0 && (
                                <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>
                                  = {Math.round(item.cost).toLocaleString('hu-HU')} Ft
                                </span>
                              )}
                            </div>
                          )}
                          {!item.totalMeters && (
                            <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.red, marginTop: 2 }}>
                              Kalibráld a rajzot a Skála eszközzel az árazáshoz
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* ── Measurements from PDF — priceable items ── */}
                    {measurementItems.length > 0 && (
                      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
                          Mérések ({pdfMeasurements.length} db)
                          {measurementCostTotal > 0 && (
                            <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.yellow, marginLeft: 8 }}>
                              {Math.round(measurementCostTotal).toLocaleString('hu-HU')} Ft
                            </span>
                          )}
                        </div>
                        {measurementItems.map(item => (
                          <div key={item.key} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, fontWeight: 600 }}>{item.label}</div>
                                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                                  {item.count} szakasz · {item.totalMeters ? `${item.totalMeters.toFixed(1)} m` : `${Math.round(item.totalDist)} px (nincs kalibráció)`}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: item.cost > 0 ? C.yellow : C.muted, fontWeight: 700 }}>
                                {item.cost > 0 ? `${Math.round(item.cost).toLocaleString('hu-HU')} Ft` : '—'}
                              </div>
                            </div>
                            {item.totalMeters > 0 && item.isAutoPriced ? (
                              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>
                                Assembly ár: {Math.round(item.autoPrice).toLocaleString('hu-HU')} Ft/m (automatikus)
                              </div>
                            ) : item.totalMeters > 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>Ár (Ft/m):</span>
                                <input
                                  type="number" min={0} step={100}
                                  value={measurementPrices[item.key] || ''}
                                  placeholder={item.autoPrice > 0 ? Math.round(item.autoPrice) : '0'}
                                  onChange={e => setMeasurementPrices(prev => ({ ...prev, [item.key]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                  style={{ width: 90, padding: '3px 6px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                                />
                                {item.cost > 0 && (
                                  <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>
                                    = {Math.round(item.cost).toLocaleString('hu-HU')} Ft
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.red }}>
                                Kalibráld a rajzot a Skála eszközzel az árazáshoz
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Cable cost ── */}
                    {fullCalc.cableTotalM > 0 && (
                      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>Kábel költség</span>
                          {fullCalc.cableCost === 0 && cablePricePerM > 0 && (
                            <span style={{ fontFamily: 'DM Mono', fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,229,160,0.1)', color: C.accent }}>katalógus árak aktívak</span>
                          )}
                        </div>
                        {fullCalc.cableCost === 0 && (pricing?.lines || []).some(l => l.type === 'cable' && l.materialCost > 0) ? (
                          <div style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Mono', lineHeight: 1.5 }}>
                            A kábel költség az anyagkatalógus tételárain alapul ({Math.round(fullCalc.cableTotalM)} m, {(pricing?.lines || []).filter(l => l.type === 'cable').length} kábeltétel).
                            A Ft/m felülírás itt nem érvényesül, mert a katalógus részletesebb árazást ad.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Kábel ár (Ft/m)</div>
                              <input
                                type="number" min={0} step={50}
                                value={cablePricePerM}
                                onChange={e => setCablePricePerM(Math.max(0, parseFloat(e.target.value) || 0))}
                                style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                              />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Összesen ({Math.round(fullCalc.cableTotalM)} m)</div>
                              <div style={{ padding: '5px 7px', borderRadius: 4, background: 'rgba(76,201,240,0.07)', border: '1px solid rgba(76,201,240,0.18)', fontSize: 11, fontFamily: 'DM Mono', color: C.blue, fontWeight: 700 }}>
                                {Math.round(fullCalc.cableCost).toLocaleString('hu-HU')} Ft
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Rate settings ── */}
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Általános díjak</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Munkadíj (Ft/óra)</div>
                          <input
                            type="number" min={0} step={500}
                            value={hourlyRate}
                            onChange={e => setHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Feláras %</div>
                          <input
                            type="number" min={0} max={99} step={1}
                            value={Math.round(markup * 100)}
                            onChange={e => setMarkup(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)) / 100)}
                            style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      {/* Markup vs Margin toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>Számítási mód:</div>
                        {[
                          { key: 'markup', label: 'Markup', tip: `Cost × (1+${fullCalc.markupPct.toFixed(0)}%)` },
                          { key: 'margin', label: 'Margin', tip: `Cost ÷ (1−${fullCalc.markupPct.toFixed(0)}%)` },
                        ].map(opt => (
                          <button key={opt.key}
                            title={opt.tip}
                            onClick={() => setMarkupType(opt.key)}
                            style={{
                              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono',
                              border: `1px solid ${markupType === opt.key ? C.accent : C.border}`,
                              background: markupType === opt.key ? C.accentDim : 'transparent',
                              color: markupType === opt.key ? C.accent : C.muted,
                              cursor: 'pointer',
                            }}>{opt.label}</button>
                        ))}
                        <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginLeft: 4 }}>
                          +{Math.round(fullCalc.markupAmount).toLocaleString('hu-HU')} Ft
                        </span>
                      </div>

                      {/* NECA productivity factor badge */}
                      {fullCalc.productivityFactor !== 1.0 && (
                        <div style={{ marginTop: 8, padding: '5px 10px', borderRadius: 6,
                          background: fullCalc.productivityFactor > 1.2 ? 'rgba(255,107,107,0.1)' : 'rgba(255,209,102,0.1)',
                          border: `1px solid ${fullCalc.productivityFactor > 1.2 ? 'rgba(255,107,107,0.3)' : 'rgba(255,209,102,0.3)'}`,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>NECA produktivitás:</span>
                          <span style={{ fontSize: 10, fontFamily: 'DM Mono', fontWeight: 700,
                            color: fullCalc.productivityFactor > 1.2 ? '#FF6B6B' : '#FFD166' }}>
                            ×{fullCalc.productivityFactor.toFixed(2)}
                          </span>
                          <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>
                            ({fullCalc.productivityFactor > 1 ? '+' : ''}{Math.round((fullCalc.productivityFactor - 1) * 100)}% a normaidőre)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Grand total summary ── */}
                    <div style={{ background: C.bgCard, border: `1px solid ${C.accent}30`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>Összefoglaló</div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Anyagköltség</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round(fullCalc.materialCost).toLocaleString('hu-HU')} Ft</span>
                      </div>
                      {fullCalc.cableCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Kábel ({Math.round(fullCalc.cableTotalM)} m × {cablePricePerM.toLocaleString('hu-HU')} Ft/m)</span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round(fullCalc.cableCost).toLocaleString('hu-HU')} Ft</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Munkadíj ({fullCalc.laborHours.toFixed(1)} óra × {hourlyRate.toLocaleString('hu-HU')} Ft/óra)</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round(fullCalc.laborCost).toLocaleString('hu-HU')} Ft</span>
                      </div>

                      {/* Subtotal */}
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, fontWeight: 600 }}>Részösszeg</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{Math.round(fullCalc.subtotal).toLocaleString('hu-HU')} Ft</span>
                      </div>

                      {/* Markup/Margin */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#FF8C42' }}>
                          + Rezsi/árrés ({fullCalc.markupPct.toFixed(0)}% {markupType})
                        </span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#FF8C42', fontWeight: 600 }}>
                          {Math.round(fullCalc.markupAmount).toLocaleString('hu-HU')} Ft
                        </span>
                      </div>

                      {/* Grand total (nettó) */}
                      <div style={{ borderTop: `2px solid ${C.accent}40`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, color: C.accent }}>Ajánlati ár (nettó)</span>
                        <span style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, color: C.accent }}>{Math.round(fullCalc.grandTotal).toLocaleString('hu-HU')} Ft</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó ({vatPercent}% ÁFA)</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{Math.round(fullCalc.bruttoTotal).toLocaleString('hu-HU')} Ft</span>
                      </div>
                    </div>

                    {/* ── Quote readiness — gated save button ── */}
                    {saveGating.reason && (
                      <div style={{
                        padding: '6px 10px', borderRadius: 7, marginBottom: 8,
                        background: 'rgba(255,107,107,0.08)',
                        border: '1px solid rgba(255,107,107,0.25)',
                        fontFamily: 'DM Mono', fontSize: 10, color: C.red,
                      }}>
                        {saveGating.reason}
                      </div>
                    )}

                    {/* ── Pricing mode toggle ── */}
                    <div data-testid="pricing-mode-toggle" style={{
                      display: 'flex', gap: 4, marginBottom: 8,
                      background: C.bg, padding: 3, borderRadius: 8,
                      border: `1px solid ${C.border}`,
                    }}>
                      {[
                        { key: 'assembly', label: 'Assembly' },
                        { key: 'manual',   label: 'Manuális' },
                      ].map(m => (
                        <button key={m.key} onClick={() => setQuotePricingMode(m.key)} style={{
                          flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: quotePricingMode === m.key ? C.accent : 'transparent',
                          color: quotePricingMode === m.key ? '#09090B' : C.muted,
                          fontFamily: 'Syne', fontWeight: 700, fontSize: 10,
                          transition: 'all 0.15s',
                        }}>
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {/* ── Action: create quote ── */}
                    <button
                      type="button"
                      data-testid="workspace-save-btn"
                      onClick={handleSave}
                      disabled={saving || saveGating.disabled}
                      title={saveGating.reason || undefined}
                      style={{
                        width: '100%', padding: '13px 16px', borderRadius: 8,
                        cursor: (saving || saveGating.disabled) ? 'not-allowed' : 'pointer',
                        background: getSaveColor(workflowStatus), border: 'none',
                        color: workflowStatus?.stage === 'unresolved_blocks' ? C.textSub : C.bg,
                        fontSize: 14, fontFamily: 'Syne', fontWeight: 700, marginBottom: 8,
                        opacity: (saving || saveGating.disabled) ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {getSaveLabel(workflowStatus, planId, saving)}
                    </button>

                    {/* ── Save error — must be visible on calc tab where the button lives ── */}
                    {saveError && (
                      <div style={{
                        background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 8,
                        padding: '10px 14px', color: C.red, fontFamily: 'DM Mono', fontSize: 12,
                        marginBottom: 8,
                      }}>
                        {saveError}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── CONTEXT TAB (full productivity settings) ──────────────────── */}
            {rightTab === 'context' && (
              <div>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 16 }}>
                  Projekt körülmények
                </div>

                {/* Combined multiplier header */}
                {(() => {
                  let combined = 1.0
                  for (const [factorKey, factorDef] of Object.entries(CONTEXT_FACTORS)) {
                    const selectedKey = context[factorKey] ?? factorDef.defaultKey
                    const opt = factorDef.options.find(o => o.key === selectedKey)
                    if (opt) combined *= opt.factor
                  }
                  const combinedPct = ((combined - 1) * 100).toFixed(1)
                  const combinedColor = combined <= 1.0 ? C.accent : combined <= 1.3 ? C.yellow : C.red
                  return (
                    <div style={{ padding: '14px 16px', marginBottom: 16, borderRadius: 10,
                      background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Kombinált projektszorzó
                        </div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textSub, lineHeight: 1.5, marginTop: 4 }}>
                          1.00 = alap · &gt;1.00 = lassabb · &lt;1.00 = gyorsabb
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 28, color: combinedColor, lineHeight: 1 }}>
                          ×{combined.toFixed(3)}
                        </div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub, marginTop: 2 }}>
                          {combined > 1 ? `+${combinedPct}%` : combinedPct + '%'}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 14, padding: '6px 10px', background: C.bgCard, borderRadius: 6, border: `1px solid ${C.border}` }}>
                  💡 A falanyag (GK / Ytong / Tégla / Beton) tételenként állítható a Felmérés fülön.
                </div>

                {/* All CONTEXT_FACTORS grouped */}
                {(() => {
                  const groups = []
                  const seen = new Set()
                  for (const [, factorDef] of Object.entries(CONTEXT_FACTORS)) {
                    if (!seen.has(factorDef.group)) {
                      seen.add(factorDef.group)
                      groups.push({ group: factorDef.group, groupLabel: factorDef.groupLabel })
                    }
                  }
                  return groups.map(({ group, groupLabel }) => (
                    <div key={group} style={{ padding: '12px 14px', marginBottom: 12, borderRadius: 8, background: C.bgCard, border: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                        {groupLabel}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {Object.entries(CONTEXT_FACTORS).filter(([, fd]) => fd.group === group).map(([factorKey, factorDef]) => {
                          const selectedKey = context[factorKey] ?? factorDef.defaultKey
                          const selectedOpt = factorDef.options.find(o => o.key === selectedKey) || factorDef.options[0]
                          return (
                            <div key={factorKey}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 11, color: C.text }}>{factorDef.label}</div>
                                <div style={{ fontFamily: 'DM Mono', fontSize: 10,
                                  color: selectedOpt.factor === 1.0 ? C.textSub : selectedOpt.factor < 1 ? C.accent : C.yellow,
                                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 8px' }}>
                                  ×{selectedOpt.factor.toFixed(2)}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {factorDef.options.map(opt => {
                                  const active = opt.key === selectedKey
                                  return (
                                    <button key={opt.key}
                                      onClick={() => setContext(c => ({ ...c, [factorKey]: opt.key }))}
                                      style={{
                                        flex: 1, minWidth: 80, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                                        textAlign: 'left', outline: 'none', transition: 'all 0.15s',
                                        background: active ? C.accentDim : C.bg,
                                        border: `1px solid ${active ? C.accent : C.border}`,
                                      }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                        <span style={{ fontSize: 11 }}>{opt.icon}</span>
                                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 10, color: active ? C.accent : C.text }}>{opt.label}</span>
                                      </div>
                                      <div style={{ fontFamily: 'DM Mono', fontSize: 8, color: C.textMuted }}>×{opt.factor.toFixed(2)}</div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()}

                {/* ── Unit override ────────────────────────────────────── */}
                {parsedDxf?.units && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 6 }}>
                      Mértékegység {parsedDxf.units.name?.includes('guessed') ? '⚠️ (becsült)' : `(DXF: ${parsedDxf.units.name})`}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[
                        [null, 'Auto'],
                        ['mm', 'mm'],
                        ['cm', 'cm'],
                        ['m', 'm'],
                        ['inches', 'inch'],
                        ['feet', 'feet'],
                      ].map(([val, lbl]) => (
                        <button
                          key={val ?? 'auto'}
                          onClick={() => setUnitOverride(val)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            background: unitOverride === val ? C.yellowDim : C.bgCard,
                            border: `1px solid ${unitOverride === val ? C.yellow : C.border}`,
                            color: unitOverride === val ? C.yellow : C.textSub,
                            fontFamily: 'Syne', fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    {unitOverride && (
                      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow, marginTop: 4 }}>
                        Manuális override aktív — az összes hossz {unitOverride}-ben lesz értelmezve
                      </div>
                    )}
                  </div>
                )}

                <div style={{ height: 1, background: C.border, margin: '16px 0' }} />

                {/* Markup & hourly rate */}
                {[
                  { label: 'Óradíj (Ft)', value: hourlyRate, set: v => setHourlyRate(Math.max(0, parseInt(v) || 0)), unit: 'Ft/óra' },
                  { label: 'Haszonkulcs (%)', value: Math.round(markup * 100), set: v => setMarkup(Math.max(0, Math.min(99, parseInt(v) || 0)) / 100), unit: '%' },
                ].map(({ label, value, set, unit }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number" value={value} onChange={e => set(e.target.value)}
                        style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontFamily: 'DM Mono', fontSize: 14 }}
                      />
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>{unit}</span>
                    </div>
                  </div>
                ))}

                <div style={{ height: 1, background: C.border, margin: '16px 0' }} />

                {/* Quote name & client */}
                {[
                  { label: 'Ajánlat neve', value: quoteName, set: setQuoteName, placeholder: `Ajánlat ${new Date().toLocaleDateString('hu-HU')}` },
                  { label: 'Ügyfél neve', value: clientName, set: setClientName, placeholder: 'Ügyfél neve...' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <input
                      type="text" value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                      style={{ width: '100%', background: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontFamily: 'Syne', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}

                {saveError && (
                  <div style={{ background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 14px', color: C.red, fontFamily: 'DM Mono', fontSize: 12, marginTop: 12 }}>
                    {saveError}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
      {/* Hidden PDF-only file picker for exploded DXF → PDF recovery flow */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
      />
    </div>
  )
}

