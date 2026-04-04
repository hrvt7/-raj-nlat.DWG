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
import { estimateCablesMST } from '../pdfTakeoff.js'
import { loadAssemblies, loadWorkItems, loadMaterials, saveQuote } from '../data/store.js'
import { createQuote } from '../utils/createQuote.js'
import { savePlan as savePlanBlob, savePlanAnnotations, getPlanAnnotations, updatePlanMeta, onAnnotationsChanged, getPlanMeta } from '../data/planStore.js'
import { getProject } from '../data/projectStore.js'
import { CONTEXT_FACTORS } from '../data/workItemsDb.js'
import { computePricing } from '../utils/pricing.js'
import { normalizeCableEstimate, shouldOverwrite, isCrossContextMarkerConflict, CABLE_SOURCE } from '../utils/cableModel.js'
import { normalizeMarkers } from '../utils/markerModel.js'
import { computeDxfAudit } from '../utils/dxfAudit.js'
import CableConfidenceCard, { CableModeBadge } from './CableConfidenceCard.jsx'
import { computeCableAudit } from '../utils/cableAudit.js'
import ManualCableModePanel from './ManualCableModePanel.jsx'
import { saveReferencePanels, toggleReferencePanelBlock } from '../utils/referencePanelStore.js'
import { computePanelAssistedEstimate } from '../utils/panelAssistedEstimate.js'
import { normalizeDxfResult } from '../utils/dxfParseContract.js'
import { lookupMemory, recordConfirmation } from '../data/recognitionMemory.js'
import { buildBlockEvidence } from '../data/evidenceExtractor.js'
import { classifyAllItems, buildReviewSummary, computeQuoteReadiness, shouldTrainMemory, getEffectiveAsmId } from '../utils/reviewState.js'
import { buildAssemblySummary } from '../utils/pricingContract.js'
import { computeWorkflowStatus, getSaveGating, getSaveLabel, getSaveColor } from '../utils/workflowStatus.js'
import { suggestAssemblies } from '../utils/suggestAssemblies.js'
import { getAuthHeaders } from '../supabase.js'

// ─── Design tokens ────────────────────────────────────────────────────────────
import { C } from './takeoff/designTokens.js'

// ─── Block recognition & cable detection (extracted to utils/blockRecognition.js) ───
import { BLOCK_ASM_RULES, ASM_COLORS, recognizeBlock, CABLE_GENERIC_KW, CABLE_TYPE_KW, detectDxfCableLengths } from '../utils/blockRecognition.js'
import { buildRecognitionRows, buildMarkerRows, mergeTakeoffRows } from '../utils/takeoffRows.js'
import { computeFullCalc, computeUnitCostByAsmByWall, applyMarkupToSubtotal } from '../utils/fullCalc.js'

// computePricing is imported from '../utils/pricing.js' — shared with MergePlansView

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
  const vatPercent = settings?.labor?.vat_percent || 27

  // ── Unit override ────────────────────────────────────────────────────────
  const [unitOverride, setUnitOverride] = useState(null) // null = auto, or 'mm'|'cm'|'m'|'inches'|'feet'

  // ── Cable estimate (auto) ─────────────────────────────────────────────────
  const [cableEstimate, setCableEstimate] = useState(null)

  // ── Manual cable mode + reference panels ─────────────────────────────────
  const [manualCableMode, setManualCableMode] = useState(false)
  const [referencePanels, setReferencePanels] = useState([])

  // ── Cable review persistence — suppress stale cable warnings on reopen ──
  const [cableReviewed, setCableReviewed] = useState(false)

  // ── PDF manual markers (assembly-based counting from PdfViewer) ─────────
  const [pdfMarkers, setPdfMarkers] = useState([])
  const [pdfMeasurements, setPdfMeasurements] = useState([]) // [{x1,y1,x2,y2,dist,category?}]
  const [measurementPrices, setMeasurementPrices] = useState({}) // { categoryKey: pricePerUnit(Ft) }
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
  const [rightTab, setRightTab] = useState('takeoff') // 'takeoff' | 'cable' | 'calc' | 'context'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false) // per-plan save success strip
  // ── Mobile responsive state ───────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [showDxfOnMobile, setShowDxfOnMobile] = useState(false)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── Pre-fill from MergePlansView (DXF / PDF / Manual merge) ─────────────
  // When the user clicks "Ajánlat létrehozása" in MergePlansView, initialData
  // carries the counted assembly quantities.  We synthesise recognizedItems so
  // the normal takeoffRows pipeline picks them up, then jump to the Felmérés tab.
  useEffect(() => {
    if (!initialData) return

    const syntheticItems = []

    if (initialData.source === 'dxf_analysis' && initialData.countByAssemblyType) {
      for (const [asmType, count] of Object.entries(initialData.countByAssemblyType)) {
        const asmId = initialData.assignments?.[asmType]
        if (asmId && count > 0)
          syntheticItems.push({ blockName: `PREFILL_${asmType}`, qty: count, asmId, confidence: 1.0 })
      }
    } else if (initialData.source === 'pdf_recognition' && initialData.recognizedItems) {
      for (const item of initialData.recognizedItems) {
        if (item.asmId && item.total > 0)
          syntheticItems.push({ blockName: `PREFILL_${item._pdfType || item.label}`, qty: item.total, asmId: item.asmId, confidence: 1.0 })
      }
    } else if (initialData.countByCategory && initialData.assignments) {
      // ManualMergeTab
      for (const [cat, count] of Object.entries(initialData.countByCategory)) {
        const asmId = initialData.assignments?.[cat]
        if (asmId && count > 0)
          syntheticItems.push({ blockName: `PREFILL_${cat}`, qty: count, asmId, confidence: 1.0 })
      }
    }

    if (syntheticItems.length > 0) {
      setRecognizedItems(syntheticItems)
      setRightTab('takeoff')
    }
    if (initialData.planName) setQuoteName(initialData.planName)
  }, [initialData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-load file when passed as prop (e.g. from Felmérés page) ────────────
  useEffect(() => {
    if (initialFile && !file) handleFile(initialFile)
  }, [initialFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved annotations when opening a plan with a planId ───────────
  useEffect(() => {
    if (!planId || !file) return
    ;(async () => {
      const ann = await getPlanAnnotations(planId)
      if (ann && ann.markers && ann.markers.length > 0) {
        setPdfMarkers(normalizeMarkers(ann.markers))
        if (ann.wallSplits) setWallSplits(ann.wallSplits)
        if (ann.variantOverrides) setVariantOverrides(ann.variantOverrides)
        if (ann.deletedItems) setDeletedItems(new Set(ann.deletedItems))
        setRightTab('takeoff')
      }
      // Restore reference panels (manual cable mode)
      if (ann?.referencePanels?.length > 0) {
        setReferencePanels(ann.referencePanels)
      }
      // Restore cable review flag (suppress stale cable warnings on reopen)
      if (ann?.cableReviewed) {
        setCableReviewed(true)
      }
    })()
  }, [planId, file]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Subscribe to external annotation changes (e.g. DetectionReviewPanel apply) ──
  useEffect(() => {
    if (!planId) return
    const unsub = onAnnotationsChanged(planId, ({ markers }) => {
      setPdfMarkers(normalizeMarkers(markers))
    })
    return unsub
  }, [planId])

  // ── Resizable split panel ─────────────────────────────────────────────────
  // panelRatio: left panel width as % of the container (clamp 25–80)
  const [panelRatio, setPanelRatio] = useState(58)
  const containerRef = useRef(null)
  const dragStateRef = useRef({ active: false, startX: 0, startRatio: 58 })

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    dragStateRef.current = { active: true, startX: e.clientX, startRatio: panelRatio }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelRatio])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragStateRef.current.active) return
      const containerW = containerRef.current?.offsetWidth || 1
      const dx = e.clientX - dragStateRef.current.startX
      const delta = (dx / containerW) * 100
      const newRatio = Math.min(80, Math.max(25, dragStateRef.current.startRatio + delta))
      setPanelRatio(newRatio)
    }
    const onUp = () => {
      if (!dragStateRef.current.active) return
      dragStateRef.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

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
        // ── CloudConvert DWG → DXF: direct-upload architecture ─────────────
        // 1. Our server creates the CC job → returns upload URL (no file bytes to server)
        // 2. Browser uploads directly to CloudConvert S3 (no Vercel body/timeout limits)
        // 3. Browser polls our server for job status
        // 4. Browser downloads DXF directly from CloudConvert CDN
        setDwgStatus('converting')
        setDwgError(null)
        let dxfText = null
        try {
          const apiUrl = import.meta.env.VITE_API_URL || ''

          // ── Helper: fetch with retry + exponential backoff ──────────────
          // On 401 (expired token): refresh session + retry once with new headers.
          // On 5xx: retry up to MAX_RETRIES with exponential backoff.
          const MAX_RETRIES = 3
          let _auth401Retried = false  // one-shot flag — prevent infinite 401 loops
          const isOwnApi = (url) => url.includes('/api/convert-dwg')
          const fetchWithRetry = async (url, opts, retries = MAX_RETRIES) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
              try {
                const res = await fetch(url, opts)
                // 401 = expired/invalid token — refresh and retry ONCE (only for our API, not CloudConvert)
                if (res.status === 401 && !_auth401Retried && isOwnApi(url)) {
                  _auth401Retried = true
                  console.warn('DWG convert: 401 — refreshing token and retrying')
                  const freshHeaders = await getAuthHeaders()
                  return fetchWithRetry(url, { ...opts, headers: freshHeaders }, 0)
                }
                if (res.ok || res.status < 500) return res  // only retry on 5xx
                if (attempt < retries) {
                  const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
                  console.warn(`DWG retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms (HTTP ${res.status})`)
                  await new Promise(r => setTimeout(r, delay))
                  continue
                }
                return res  // last attempt, return whatever we got
              } catch (netErr) {
                if (attempt < retries) {
                  const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
                  console.warn(`DWG retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms (${netErr.message})`)
                  await new Promise(r => setTimeout(r, delay))
                  continue
                }
                throw netErr
              }
            }
          }

          // Step 1: Create CloudConvert job (our server, tiny JSON request)
          const authHeaders = await getAuthHeaders()
          const createRes = await fetchWithRetry(`${apiUrl}/api/convert-dwg`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ filename: f.name }),
          })
          let createJson
          try {
            createJson = await createRes.json()
          } catch {
            throw new Error(
              createRes.status === 503
                ? 'A DWG konverzió szolgáltatás nem elérhető. Exportáld a tervrajzot PDF vagy DXF formátumba.'
                : `A szerver nem JSON választ adott (HTTP ${createRes.status}). Próbáld újra később, vagy használj PDF/DXF formátumot.`
            )
          }
          if (!createRes.ok || !createJson.success) {
            const errDetail = createJson.code ? ` [${createJson.code}]` : ''
            throw new Error((createJson.error || `Job létrehozása sikertelen (${createRes.status})`) + errDetail)
          }
          const { jobId, uploadUrl, uploadParams } = createJson

          // Step 2: Upload file directly from browser to CloudConvert S3
          // (file never passes through our Vercel function — no size or timeout issue)
          const formData = new FormData()
          for (const [key, val] of Object.entries(uploadParams)) {
            formData.append(key, val)
          }
          formData.append('file', f)
          const uploadRes = await fetchWithRetry(uploadUrl, { method: 'POST', body: formData })
          if (!uploadRes.ok) {
            throw new Error(`Fájl feltöltése CloudConvert-re sikertelen (HTTP ${uploadRes.status})`)
          }

          // Step 3: Poll via our server until conversion finishes (max 2 minutes)
          let downloadUrl = null
          const pollStart = Date.now()
          const MAX_POLL_MS = 120_000
          while (Date.now() - pollStart < MAX_POLL_MS) {
            await new Promise(r => setTimeout(r, 3000))
            const pollHeaders = await getAuthHeaders()
            const pollRes = await fetchWithRetry(`${apiUrl}/api/convert-dwg`, {
              method: 'POST',
              headers: pollHeaders,
              body: JSON.stringify({ jobId }),
            }, 2)
            let pollJson
            try { pollJson = await pollRes.json() } catch {
              throw new Error(`A szerver nem JSON választ adott a pollingra (HTTP ${pollRes.status}).`)
            }
            if (!pollRes.ok || !pollJson.success) {
              throw new Error(pollJson.error || 'Státusz lekérdezése sikertelen')
            }
            if (pollJson.status === 'finished') { downloadUrl = pollJson.downloadUrl; break }
            if (pollJson.status === 'error') throw new Error(pollJson.error || 'CloudConvert konverzió hiba')
          }
          if (!downloadUrl) throw new Error('CloudConvert időtúllépés (120 mp). Próbáld újra.')

          // Step 4: Download converted DXF directly from CloudConvert CDN
          const dxfRes = await fetchWithRetry(downloadUrl, {}, 2)
          if (!dxfRes.ok) throw new Error(`DXF letöltése sikertelen (HTTP ${dxfRes.status})`)
          dxfText = await dxfRes.text()

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

      // Run recognition on all unique block types
      const blockMap = {}
      for (const b of (result.blocks || [])) {
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

  // ── Effective items (filtered + overridden) ──────────────────────────────
  const effectiveItems = useMemo(() => {
    return recognizedItems
      .filter(i => !deletedItems.has(i.blockName))
      .map(i => itemQtyOverrides[i.blockName] != null
        ? { ...i, qty: itemQtyOverrides[i.blockName] }
        : i
      )
  }, [recognizedItems, deletedItems, itemQtyOverrides])

  const totalItems = effectiveItems.reduce((s, i) => s + i.qty, 0)

  // ── Unknown items: blocks with no asmId AND no override ────────────────
  const unknownItems = useMemo(() => {
    return effectiveItems.filter(i => {
      const resolvedAsmId = asmOverrides[i.blockName] !== undefined ? asmOverrides[i.blockName] : i.asmId
      return !resolvedAsmId
    })
  }, [effectiveItems, asmOverrides])

  // ── Unknown block resolution progress (for UnknownBlockPanel progress bar) ──
  const unknownProgress = useMemo(() => {
    const totalTypes = effectiveItems.length
    const unresolvedTypes = unknownItems.length
    const resolvedTypes = totalTypes - unresolvedTypes
    const totalQty = effectiveItems.reduce((s, i) => s + i.qty, 0)
    const unresolvedQty = unknownItems.reduce((s, i) => s + i.qty, 0)
    const resolvedQty = totalQty - unresolvedQty
    const coveragePct = totalQty > 0 ? Math.round((resolvedQty / totalQty) * 100) : 0
    return { resolvedTypes, totalTypes, resolvedQty, totalQty, coveragePct }
  }, [effectiveItems, unknownItems])

  // ── Review state classification ──────────────────────────────────────────
  // Classify ALL recognized items (including deleted) so the review summary
  // shows complete picture. effectiveItems only has non-deleted ones.
  const classifiedItems = useMemo(() => {
    return classifyAllItems(recognizedItems, asmOverrides, deletedItems)
  }, [recognizedItems, asmOverrides, deletedItems])

  const reviewSummary = useMemo(() => {
    return buildReviewSummary(classifiedItems)
  }, [classifiedItems])

  const quoteReadiness = useMemo(() => {
    const cableConf = cableEstimate?.confidence ?? null
    return computeQuoteReadiness(reviewSummary, cableConf, { cableReviewed })
  }, [reviewSummary, cableEstimate, cableReviewed])

  // ── DXF Import Audit (structured quality summary) ────────────────────────
  const dxfAudit = useMemo(() => {
    if (!parsedDxf || isPdf) return null
    return computeDxfAudit(parsedDxf, recognizedItems)
  }, [parsedDxf, recognizedItems, isPdf])

  // ── Cable Audit (structured cable confidence/transparency) ─────────────────
  const cableAudit = useMemo(() => {
    if (!parsedDxf || isPdf) return null
    return computeCableAudit(parsedDxf, recognizedItems, cableEstimate, referencePanels)
  }, [parsedDxf, recognizedItems, cableEstimate, isPdf, referencePanels])

  // ── Derived: takeoff rows (grouped by assembly) ───────────────────────────
  // (workflowStatus is computed below takeoffRows because it needs takeoffRowCount)
  const recognitionTakeoffRows = useMemo(() => {
    return buildRecognitionRows(effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits)
  }, [effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits])

  const markerTakeoffRows = useMemo(() => {
    return buildMarkerRows(pdfMarkers, variantOverrides, wallSplits)
  }, [pdfMarkers, variantOverrides, wallSplits])

  // Merged takeoff rows: recognition + manual markers (no duplicates)
  const takeoffRows = useMemo(() => {
    return mergeTakeoffRows(recognitionTakeoffRows, markerTakeoffRows)
  }, [recognitionTakeoffRows, markerTakeoffRows])

  // ── Unified workflow status (single source for status/CTA/badges) ───────
  const workflowStatus = useMemo(() => {
    return computeWorkflowStatus({
      dxfAudit, reviewSummary, quoteReadiness, cableAudit,
      takeoffRowCount: takeoffRows.length,
      isPdf, hasFile: !!parsedDxf || isPdf,
      cableReviewed,
    })
  }, [dxfAudit, reviewSummary, quoteReadiness, cableAudit, takeoffRows.length, isPdf, parsedDxf, cableReviewed])

  const saveGating = useMemo(() => getSaveGating(workflowStatus), [workflowStatus])

  // ── Auto-compute cable estimate for DXF (3-tier cascade) ────────────────
  // P1: DXF layer geometry  (mért kábelvonalak, confidence 0.92)
  // P2: MST becslés eszközpozíciók alapján  (confidence ~0.75)
  // P3: Eszközszám × átlagos kábelhossz  (fallback, confidence 0.55)
  // Guard: shouldOverwrite() prevents lower-priority estimates from replacing
  // higher-priority ones (e.g. pdf_markers won't be overwritten by dxf_mst).
  useEffect(() => {
    if (!takeoffRows.length) {
      // No data — clear DXF-origin estimates only (preserve PDF sources)
      setCableEstimate(prev => {
        if (prev?._source !== CABLE_SOURCE.PDF_TAKEOFF && prev?._source !== CABLE_SOURCE.PDF_MARKERS) return null
        return prev
      })
      return
    }

    // ── Tier 1: tényleges kábelvonalak a DXF rétegeiből ──────────────────
    const layerResult = detectDxfCableLengths(effectiveParsedDxf)
    if (layerResult) {
      const normalized = normalizeCableEstimate(layerResult, CABLE_SOURCE.DXF_LAYERS)
      setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
      return
    }

    // ── Tier 2: MST becslés ha vannak pozícióadatok ──────────────────────
    const inserts = effectiveParsedDxf?.inserts
    if (inserts?.length >= 2) {
      const devices = inserts.map(ins => {
        const recog = recognizedItems.find(r => r.blockName === ins.name)
        const asmId = asmOverrides[ins.name] !== undefined ? asmOverrides[ins.name] : recog?.asmId
        const type = asmId === 'ASM-003' ? 'light' : asmId === 'ASM-001' ? 'socket' : asmId === 'ASM-002' ? 'switch' : 'other'
        return { type, x: ins.x, y: ins.y, name: ins.name }
      })
      const scaleFactor = effectiveParsedDxf?.units?.factor ?? 0.001
      try {
        const mstResult = estimateCablesMST(devices, scaleFactor)
        if (mstResult && mstResult.cable_total_m > 0) {
          mstResult.method = `MST becslés (${devices.length} eszközpozíció alapján)`
          const normalized = normalizeCableEstimate(mstResult, CABLE_SOURCE.DXF_MST)
          setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
          return
        }
      } catch (_e) { /* fallthrough to device-count */ }
    }

    // ── Tier 3: eszközszám × átlag kábelhossz (fallback) ─────────────────
    const lightQty  = takeoffRows.filter(r => r.asmId === 'ASM-003').reduce((s, r) => s + r.qty, 0)
    const socketQty = takeoffRows.filter(r => r.asmId === 'ASM-001').reduce((s, r) => s + r.qty, 0)
    const switchQty = takeoffRows.filter(r => r.asmId === 'ASM-002').reduce((s, r) => s + r.qty, 0)
    const total = lightQty + socketQty + switchQty
    if (!total) { setCableEstimate(null); return }

    const lightM  = lightQty  * 8
    const socketM = socketQty * 6
    const switchM = switchQty * 4
    const totalM  = lightM + socketM + switchM
    const normalized = normalizeCableEstimate({
      cable_total_m: totalM,
      cable_by_type: { light_m: lightM, socket_m: socketM, switch_m: switchM, data_m: 0, fire_m: 0, other_m: 0 },
      method: 'Becslés eszközszám alapján (nincs pozícióadat)',
      confidence: 0.55,
    }, CABLE_SOURCE.DEVICE_COUNT)
    setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
  }, [takeoffRows, effectiveParsedDxf, recognizedItems, asmOverrides])

  // ── Panel-assisted cable estimate (manual cable mode) ───────────────────
  // When user selects reference panels, compute nearest-panel estimate and
  // let shouldOverwrite decide if it replaces current estimate.
  useEffect(() => {
    if (!referencePanels.length || !effectiveParsedDxf?.inserts?.length) return
    const scaleFactor = effectiveParsedDxf?.units?.factor ?? 0.001
    const panelEst = computePanelAssistedEstimate(
      effectiveParsedDxf.inserts, recognizedItems, asmOverrides,
      referencePanels, scaleFactor
    )
    if (panelEst) {
      const normalized = normalizeCableEstimate(panelEst, CABLE_SOURCE.PANEL_ASSISTED)
      setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
    }
  }, [referencePanels, effectiveParsedDxf, recognizedItems, asmOverrides])

  // ── Persist reference panels when they change ──────────────────────────
  useEffect(() => {
    if (!planId) return
    saveReferencePanels(planId, referencePanels)
  }, [referencePanels, planId])

  // ── Derived: pricing ──────────────────────────────────────────────────────
  const pricing = useMemo(() => {
    if (!takeoffRows.length) return null
    return computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode })
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode])

  // ── Measurement cost (auto-pricing from assembly + manual fallback) ─────
  const measurementItems = useMemo(() => {
    if (!pdfMeasurements.length) return []
    const groups = {}
    for (const seg of pdfMeasurements) {
      const key = seg.category || '_general'
      if (!groups[key]) groups[key] = { key, label: seg.category || 'Általános mérés', totalDist: 0, totalMeters: 0, count: 0 }
      groups[key].totalDist += seg.dist
      groups[key].totalMeters += seg.distMeters || 0
      groups[key].count++
    }
    // Pre-build cable tray assembly index: extract width from each kabeltalca assembly name
    // e.g. "Kábeltálca 100mm rendszer (10m)" → width=100, "Kábeltálca 200×60" → width=200
    const cableTrayAsms = assemblies
      .filter(a => a.category === 'kabeltalca')
      .map(a => {
        const m = a.name?.match(/(\d{2,4})\s*(?:mm|×)/)
        return m ? { asm: a, width: parseInt(m[1], 10) } : null
      })
      .filter(Boolean)

    return Object.values(groups).map(g => {
      // Try to find a matching assembly for this measurement category
      let matchedAsm = null
      let autoPrice = 0

      if (g.key.startsWith('ASM-')) {
        // Direct assembly ID from AssemblyDropdown (measure mode)
        matchedAsm = assemblies.find(a => a.id === g.key) || null
      } else if (g.key.startsWith('kt_asm_')) {
        // Assembly-driven cable tray key: kt_asm_{assemblyId}
        const asmId = g.key.replace('kt_asm_', '')
        matchedAsm = assemblies.find(a => a.id === asmId) || null
      } else if (g.key.startsWith('kt_')) {
        // Hardcoded cable tray key: kt_{width}_{height} e.g. kt_100_60
        const targetWidth = parseInt(g.key.split('_')[1], 10)
        if (targetWidth) {
          const exact = cableTrayAsms.find(c => c.width === targetWidth && !c.asm.variantOf)
            || cableTrayAsms.find(c => c.width === targetWidth)
          if (exact) {
            matchedAsm = exact.asm
          }
        }
      }

      if (matchedAsm) {
        // Compute per-meter cost from the assembly
        const asmPricing = computePricing({
          takeoffRows: [{ asmId: matchedAsm.id, qty: 1, variantId: null, wallSplits: null }],
          assemblies, workItems, materials, context, markup: 0, hourlyRate, cableEstimate: null, difficultyMode,
        })
        // Assembly base qty in meters (components with unit='m')
        const asmBaseQty = (matchedAsm.components || []).find(c => c.unit === 'm')?.qty || 10
        autoPrice = asmPricing.total / Math.max(asmBaseQty, 1)
      }
      const effectivePrice = measurementPrices[g.key] !== undefined && measurementPrices[g.key] > 0
        ? measurementPrices[g.key]
        : autoPrice
      return {
        ...g,
        label: matchedAsm ? matchedAsm.name : g.label,
        matchedAsmId: matchedAsm?.id || null,
        autoPrice,
        pricePerUnit: effectivePrice,
        cost: (g.totalMeters || 0) * effectivePrice,
        isAutoPriced: effectivePrice === autoPrice && autoPrice > 0,
      }
    })
  }, [pdfMeasurements, measurementPrices, assemblies, workItems, materials, context, hourlyRate, difficultyMode])

  const measurementCostTotal = useMemo(() => {
    return measurementItems.reduce((s, item) => s + item.cost, 0)
  }, [measurementItems])

  // ── Extended calc (markup/margin, cable $/m, VAT — extracted to utils/fullCalc.js) ──
  const fullCalc = useMemo(() => {
    let base = computeFullCalc({
      pricing, cableEstimate, cablePricePerM, markup, markupType, vatPercent,
      context, takeoffRows, assemblies, workItems, materials, hourlyRate, difficultyMode,
    })
    // When there are no takeoff rows but measurements exist, create a minimal calc
    // so the Kalkuláció tab shows measurement lines instead of an empty state.
    if (!base && measurementItems.length > 0) {
      const markupPct = markup * 100
      base = {
        materialCost: 0, laborCost: 0, laborHours: 0, lines: [],
        cableTotalM: 0, cablePricePerM: 0, cableCost: 0,
        subtotal: 0, markupType, markupPct, markupAmount: 0,
        grandTotal: 0, bruttoTotal: 0, vatPercent,
        bySystem: {}, byAssembly: {},
      }
    }
    if (!base) return null
    // Add measurement costs to the total
    if (measurementCostTotal > 0) {
      base.subtotal += measurementCostTotal
      base.measurementCost = measurementCostTotal
      // Recalculate grand total with shared markup helper (single source of truth)
      base.grandTotal = applyMarkupToSubtotal(base.subtotal, base.markupPct / 100, base.markupType)
      base.markupAmount = base.grandTotal - base.subtotal
      base.bruttoTotal = base.grandTotal * (1 + base.vatPercent / 100)
    } else {
      base.measurementCost = 0
    }
    // Attach measurement line items for Kalkuláció tab + quote export
    // Show all measurement items (even with 0 cost) so users see what they measured
    base.measurementLines = measurementItems
    return base
  }, [pricing, cableEstimate, cablePricePerM, markup, markupType, vatPercent, context, takeoffRows, assemblies, workItems, materials, hourlyRate, difficultyMode, measurementCostTotal, measurementItems])

  // ── Per-assembly unit cost (extracted to utils/fullCalc.js) ───────────────
  const unitCostByAsmByWall = useMemo(() => {
    return computeUnitCostByAsmByWall({
      takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, difficultyMode,
    })
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, difficultyMode])

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
    if (!pricing && !measurementItems.length) {
      setSaveError('Árkalkuláció nem elérhető — ellenőrizd az assemblyket!')
      return
    }
    setSaving(true)
    try {
      // ── Per-plan save (Felmérés flow): merge-before-save to avoid partial overwrite ──
      // Read current store state first, then overlay only workspace-owned fields.
      // This preserves measurements, scale, cableRoutes, rotation etc. from the viewer.
      if (planId) {
        const stored = (await getPlanAnnotations(planId)) || {}
        await savePlanAnnotations(planId, {
          ...stored,
          markers: pdfMarkers,
          wallSplits,
          variantOverrides,
          deletedItems: [...deletedItems],
          referencePanels,
          cableReviewed: cableEstimate?._source === 'panel_assisted' || cableReviewed,
        })
        // Persist pricing summary + snapshot for quote generation on plan metadata
        // Resolve plan-level system type from filename inference (fallback: 'general')
        const _planMeta = getPlanMeta(planId)
        const _planSysType = _planMeta?.inferredMeta?.systemType || 'general'
        const _planFloor = _planMeta?.inferredMeta?.floor || null
        const _planFloorLabel = _planMeta?.inferredMeta?.floorLabel || null
        const snapshotItems = (pricing.lines || []).map(line => ({
          name: line.name, code: line.code || '', qty: line.qty, unit: line.unit, type: line.type,
          systemType: line.systemType || 'general',
          sourcePlanSystemType: _planSysType,
          sourcePlanFloor: _planFloor,
          sourcePlanFloorLabel: _planFloorLabel,
          unitPrice: line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
          hours: line.hours || 0, materialCost: line.materialCost || 0,
        }))
        // Include measurement items in per-plan snapshot (cable trays, manual measurements)
        for (const mi of measurementItems) {
          if (!mi.totalMeters || mi.totalMeters <= 0) continue
          snapshotItems.push({
            name: mi.label + (mi.isAutoPriced ? '' : ' (kézi ár)'),
            code: mi.matchedAsmId || mi.key, qty: Math.round(mi.totalMeters * 10) / 10, unit: 'm',
            type: 'material', systemType: 'general',
            sourcePlanSystemType: _planSysType, sourcePlanFloor: _planFloor, sourcePlanFloorLabel: _planFloorLabel,
            unitPrice: mi.pricePerUnit, hours: 0, materialCost: mi.cost, _fromMeasurement: true,
          })
        }
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
        // Gate: low-confidence auto-matches must NOT train memory to avoid
        // false-trust feedback loop (0.62 partial match → 0.85 project memory)
        if (memProjectId) {
          for (const item of classifiedItems) {
            if (item.reviewStatus === 'excluded') continue
            const finalAsmId = getEffectiveAsmId(item, asmOverrides)
            if (finalAsmId && shouldTrainMemory(item)) {
              recordConfirmation(item.blockName, finalAsmId, memProjectId, 'save_plan', evidenceMap?.get(item.blockName))
            }
          }
        }

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
      const items = (pricing.lines || []).map(line => ({
        name:        line.name,
        code:        line.code || '',
        qty:         line.qty,
        unit:        line.unit,
        type:        line.type,
        systemType:  line.systemType || 'general',
        sourcePlanSystemType: _fqPlanSysType,
        sourcePlanFloor: _fqPlanFloor,
        sourcePlanFloorLabel: _fqPlanFloorLabel,
        unitPrice:   line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
        hours:       line.hours || 0,
        materialCost: line.materialCost || 0,
      }))
      // Add measurement line items (cable trays, manual measurements) to the quote
      for (const mi of measurementItems) {
        if (!mi.totalMeters || mi.totalMeters <= 0) continue
        items.push({
          name:        mi.label + (mi.isAutoPriced ? '' : ' (kézi ár)'),
          code:        mi.matchedAsmId || mi.key,
          qty:         Math.round(mi.totalMeters * 10) / 10,
          unit:        'm',
          type:        'material',
          systemType:  'general',
          sourcePlanSystemType: _fqPlanSysType,
          sourcePlanFloor: _fqPlanFloor,
          sourcePlanFloorLabel: _fqPlanFloorLabel,
          unitPrice:   mi.pricePerUnit,
          hours:       0,
          materialCost: mi.cost,
          _fromMeasurement: true,
        })
      }

      const assemblySummary = buildAssemblySummary(
        takeoffRows, pricing, assemblies, workItems, materials,
        context, markup, hourlyRate, difficultyMode, computePricing,
      )

      const displayName = quoteName || `Ajánlat ${new Date().toLocaleDateString('hu-HU')}`
      // ── Resolve output mode: prefer estimation panel override, then project default ──
      const planMeta = planId ? getPlanMeta(planId) : null
      const prjDefault = initialData?.quoteOverrides?._outputMode
        || (planMeta?.projectId ? (getProject(planMeta.projectId)?.defaultQuoteOutputMode || 'combined') : 'combined')

      // Use fullCalc as the financial source of truth (includes measurementCost, markup, VAT)
      const financialPricing = fullCalc ? {
        total:        Math.round(fullCalc.grandTotal),
        materialCost: Math.round((pricing?.materialCost || 0) + (fullCalc.measurementCost || 0)),
        laborCost:    Math.round(pricing?.laborCost || 0),
        laborHours:   pricing?.laborHours || 0,
      } : pricing

      const quote = createQuote({
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
      saveQuote(quote)

      // Learn from save — only train memory with reviewed/trusted items
      if (memProjectId) {
        for (const item of classifiedItems) {
          if (item.reviewStatus === 'excluded') continue
          const finalAsmId = getEffectiveAsmId(item, asmOverrides)
          if (finalAsmId && shouldTrainMemory(item)) {
            recordConfirmation(item.blockName, finalAsmId, memProjectId, 'save_plan', evidenceMap?.get(item.blockName))
          }
        }
      }

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
              highlightBlock={highlightBlock}
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
                  />
                )}

                {takeoffRows.length === 0 && unknownItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Még nincs felvett elem. Használd a Számlálás eszközt a tervrajzon.
                  </div>
                ) : (
                  <>
                    {takeoffRows.map(row => {
                      // Check if any items contributing to this row came from memory
                      const memItem = effectiveItems.find(i =>
                        i.matchType === 'memory' &&
                        ((asmOverrides[i.blockName] !== undefined ? asmOverrides[i.blockName] : i.asmId) === row.asmId)
                      )
                      return (
                      <TakeoffRow
                        key={row.asmId}
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
                        onDelete={(asmId) => {
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

                    {/* Cable summary in takeoff */}
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
                  </>
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

