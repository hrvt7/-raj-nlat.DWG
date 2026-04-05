import React, { useState, useRef, useCallback, useEffect } from 'react'
import { COUNT_CATEGORIES, CategoryDropdown, AssemblyDropdown, CABLE_TRAY_COLOR } from '../DxfViewer/DxfToolbar.jsx'
import EstimationPanel from '../EstimationPanel.jsx'
import { savePlanAnnotations, getPlanAnnotations, onAnnotationsChanged, getPlansByProject } from '../../data/planStore.js'
import { createMarker, normalizeMarkers, deduplicateMarkersManualFirst } from '../../utils/markerModel.js'
import { loadCategoryAssemblyMap, applyDefaultAssignments } from '../../data/categoryAssemblyMap.js'
import { renderPageImageData } from '../../utils/templateMatching.js'
import { generateCandidateRegions } from '../../utils/pdfVectorAnalysis.js'
import { upsertTemplateIntoFamilies, migrateTemplatesToFamilies, familiesToFlatTemplates, mergeFamiliesFromPlans, sortVariantsByPerformance, updateVariantStats, updateFamilyStats } from '../../utils/symbolFamily.js'
import templateMatchWorkerUrl from '../../workers/templateMatch.worker.js?url'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { resolveCountCategory, migrateMarkers, formatDist, docToCanvas, canvasToDoc, drawMarker, drawMeasureLine } from './pdfUtils.js'
export { docToCanvas, canvasToDoc } from './pdfUtils.js'
import PdfScrollbars from './PdfScrollbars.jsx'
import PdfToolbar from './PdfToolbar.jsx'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// ═══════════════════════════════════════════════════════════════════════════
// PdfViewerPanel — PDF floor-plan viewer with pan/zoom, measure, count
// Uses <canvas> for rendering PDF pages + overlay for annotations
// ═══════════════════════════════════════════════════════════════════════════
export default function PdfViewerPanel({ file, style, planId, projectId, onCreateQuote, onCableData, assemblies: assembliesProp, onMarkersChange, onMeasurementsChange, focusTarget, onDirtyChange }) {
  const containerRef = useRef(null)
  const pdfCanvasRef = useRef(null)
  const overlayRef = useRef(null)

  // ── Stable callback refs ──
  // Parent passes inline arrow functions for callbacks, which change reference
  // on every render. Storing them in refs prevents useEffect dependency cycles
  // (e.g. cable data useEffect → onCableData → parent setState → re-render →
  //  new onCableData ref → effect re-fires → infinite loop).
  const onCableDataRef = useRef(onCableData)
  useEffect(() => { onCableDataRef.current = onCableData })
  const onMarkersChangeRef = useRef(onMarkersChange)
  useEffect(() => { onMarkersChangeRef.current = onMarkersChange })
  const onMeasurementsChangeRef = useRef(onMeasurementsChange)
  useEffect(() => { onMeasurementsChangeRef.current = onMeasurementsChange })

  // ── PDF state ──
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── View transform (pan/zoom) ──
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 1, pageWidth: 0, pageHeight: 0 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOX: 0, startOY: 0 })

  // ── Unrotated page dimensions (for rotation-invariant coordinate conversion) ──
  const unrotatedDimsRef = useRef({ w: 0, h: 0 })
  // ── Legacy annotation migration: { rotation } when saved coords need canvas→doc conversion ──
  const migrationRef = useRef(null)

  // ── Tools ──
  const [activeTool, setActiveTool] = useState(null)
  // activeCategory can be an assembly ID (ASM-xxx) or a special key (panel, junction, other)
  const [activeCategory, setActiveCategory] = useState('ASM-001')

  // ── Page rotation ──
  const [rotation, setRotation] = useState(0) // degrees, any angle (0, 45, 90, etc.)
  const rotationRef = useRef(0)
  useEffect(() => { rotationRef.current = rotation }, [rotation])

  // ── Scale calibration ──
  const [scale, setScale] = useState({ factor: null, calibrated: false })
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])

  // ── Calibration dialog ──
  const [calibDialog, setCalibDialog] = useState(null)
  const [calibInput, setCalibInput] = useState('')
  const [calibUnit, setCalibUnit] = useState('m')

  // ── Annotations (stored in PDF coordinate space) ──
  const markersRef = useRef([])   // { x, y, category, color }
  const measuresRef = useRef([])  // { x1, y1, x2, y2, dist }
  const activeStartRef = useRef(null) // { x, y } for measure/calibrate in progress
  const mousePdfRef = useRef(null) // { x, y } mouse in pdf coords
  const [renderTick, setRenderTick] = useState(0)
  const highlightRef = useRef(null) // { x, y, startTime } for focus pulse animation
  const hydratedRef = useRef(false) // true after annotation restore completes — guards auto-save

  // ── Auto Symbol POC state ──
  const [autoSymbolActive, setAutoSymbolActive] = useState(false)
  const [autoSymbolPhase, setAutoSymbolPhase] = useState('idle') // idle | picking | areaSelect | searching | done
  const [autoSymbolRect, _setAutoSymbolRect] = useState(null) // {x1,y1,x2,y2} in screen coords during pick
  const autoSymbolRectRef = useRef(null)
  const setAutoSymbolRect = (v) => { autoSymbolRectRef.current = v; _setAutoSymbolRect(v) }
  const [autoSymbolResults, setAutoSymbolResults] = useState([]) // [{x,y,score,accepted}] in PDF doc coords
  const [autoSymbolLabel, setAutoSymbolLabel] = useState('') // user label for finalization
  const [autoSymbolCategory, setAutoSymbolCategory] = useState('other') // category key for finalization
  const [autoSymbolThreshold, setAutoSymbolThreshold] = useState(0.50)
  const autoSymbolAllHitsRef = useRef([]) // full hit list at low threshold — slider filters this
  const [autoSymbolSearching, setAutoSymbolSearching] = useState(false)
  const [autoSymbolSearchArea, setAutoSymbolSearchArea] = useState(null) // {x,y,w,h} in PDF doc coords or null (full page)
  const [autoSymbolAreaRect, _setAutoSymbolAreaRect] = useState(null) // screen coords during area selection
  const autoSymbolAreaRectRef = useRef(null)
  const setAutoSymbolAreaRect = (v) => { autoSymbolAreaRectRef.current = v; _setAutoSymbolAreaRect(v) }
  const autoSymbolTemplateRef = useRef(null) // { cropData, w, h } cropped template RGBA
  const autoSymbolStartRef = useRef(null) // mouse down position during picking
  const autoSymbolWorkerRef = useRef(null) // Web Worker instance
  const [batchSearching, setBatchSearching] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')
  const savedTemplatesRef = useRef([]) // preserved through unmount save
  const autoSymbolSearchIdRef = useRef(0) // monotonic counter to detect stale results
  const [autoSymbolError, setAutoSymbolError] = useState(null) // string error message or null
  const mountedRef = useRef(true) // guard against setState after unmount

  // ── Notify parent of measurement changes (with calibrated distances) ──
  const notifyMeasurements = useCallback(() => {
    const cb = onMeasurementsChangeRef.current
    if (!cb) return
    const sf = scaleRef.current
    const enriched = measuresRef.current.map(seg => ({
      ...seg,
      distMeters: sf.calibrated && sf.factor ? seg.dist * sf.factor : null,
    }))
    cb(enriched)
  }, [])

  // ── Dirty state tracking (unsaved local changes) ──
  const dirtyRef = useRef(false)
  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true
      if (onDirtyChange) onDirtyChange(true)
    }
  }, [onDirtyChange])

  // ── Count panel + estimation ──
  const [countPanelOpen, setCountPanelOpen] = useState(false)
  const [estimationOpen, setEstimationOpen] = useState(false)
  const [ceilingHeight, setCeilingHeight] = useState(3.0)
  const [socketHeight, setSocketHeight] = useState(0.3)
  const [switchHeight, setSwitchHeight] = useState(1.2)
  const [showCableRoutes, setShowCableRoutes] = useState(false)

  // ── Lifted estimation state (persisted with plan annotations) ──
  const [assignments, setAssignments] = useState({})
  const [quoteOverrides, setQuoteOverrides] = useState({})
  const assignmentsRef = useRef({})
  const quoteOverridesRef = useRef({})
  useEffect(() => { assignmentsRef.current = assignments }, [assignments])
  useEffect(() => { quoteOverridesRef.current = quoteOverrides }, [quoteOverrides])
  // Persist assignments/quoteOverrides to IDB on every change so explicit parent save
  // reads fresh data (prevents race with unmount auto-save)
  useEffect(() => {
    if (!planId || !hydratedRef.current) return
    getPlanAnnotations(planId).then(stored => {
      if (!stored) return
      savePlanAnnotations(planId, { ...stored, assignments, quoteOverrides }, { silent: true })
    }).catch(() => {})
  }, [assignments, quoteOverrides, planId])

  // ── Load saved annotations on mount ──
  useEffect(() => {
    if (!planId) return
    hydratedRef.current = false // reset — auto-save guard active until restore finishes
    getPlanAnnotations(planId).then(ann => {
      if (ann.markers?.length) {
        const normalized = normalizeMarkers(ann.markers)
        // Migrate legacy ASM-xxx categories to COUNT_CATEGORY keys
        markersRef.current = migrateMarkers(normalized, assembliesProp)
        setRenderTick(t => t + 1)
        if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      }
      if (ann.measurements?.length) { measuresRef.current = ann.measurements; notifyMeasurements() }
      if (ann.savedTemplates?.length) { savedTemplatesRef.current = ann.savedTemplates }
      if (ann.scale?.calibrated) { setScale(ann.scale) }
      if (ann.ceilingHeight) setCeilingHeight(ann.ceilingHeight)
      if (ann.socketHeight) setSocketHeight(ann.socketHeight)
      if (ann.switchHeight) setSwitchHeight(ann.switchHeight)
      let loadedAssignments = {}
      if (ann.assignments && typeof ann.assignments === 'object') {
        loadedAssignments = ann.assignments
      }
      // Auto-fill assignments from saved category→assembly defaults
      // (detection markers come in with category like 'socket' but no assignment)
      const defaults = loadCategoryAssemblyMap()
      const merged = applyDefaultAssignments(loadedAssignments, defaults)
      setAssignments(merged)
      assignmentsRef.current = merged

      if (ann.quoteOverrides && typeof ann.quoteOverrides === 'object') {
        setQuoteOverrides(ann.quoteOverrides)
        quoteOverridesRef.current = ann.quoteOverrides
      }
      if (ann.rotation != null) setRotation(ann.rotation)
      // ── Backward compat: schedule migration if coords are legacy (canvas-space) ──
      if (!ann.coordVersion || ann.coordVersion < 2) {
        migrationRef.current = { rotation: ann.rotation || 0 }
      }
      // Reset dirty after hydration from store
      dirtyRef.current = false
      if (onDirtyChange) onDirtyChange(false)
      hydratedRef.current = true // annotation restore complete — auto-save now safe
    })
  }, [planId])

  // ── Subscribe to external annotation changes (e.g. DetectionReviewPanel apply) ──
  useEffect(() => {
    if (!planId) return
    const unsub = onAnnotationsChanged(planId, ({ markers, assignments: extAssignments }) => {
      markersRef.current = migrateMarkers(normalizeMarkers(markers), assembliesProp)
      setRenderTick(t => t + 1)
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      // Auto-fill assignments from saved defaults when new detection markers arrive
      const currentAsgn = extAssignments || assignmentsRef.current
      const defaults = loadCategoryAssemblyMap()
      const merged = applyDefaultAssignments(currentAsgn, defaults)
      if (merged !== currentAsgn) {
        setAssignments(merged)
        assignmentsRef.current = merged
      }
    })
    return unsub
  // onMarkersChange accessed via stable ref — no dep needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // ── Focus on target marker (from review panel locate) ──
  // Pending focus: saved when focusTarget arrives before PDF is rendered.
  // Consumed by renderPage after the page loads.
  const pendingFocusRef = useRef(null)

  const applyFocus = useCallback((target) => {
    const v = viewRef.current
    if (!v.pageWidth || !containerRef.current) return false
    if (target.pageNum && target.pageNum !== pageNum) {
      // Page switch needed → defer focus to after renderPage completes.
      // Setting zoom/offset now would be overwritten by renderPage's fit-to-view.
      pendingFocusRef.current = target
      setPageNum(target.pageNum)
      return true // signal that we're handling it (page switch initiated)
    }
    const cw = containerRef.current.clientWidth
    const ch = containerRef.current.clientHeight
    const targetZoom = Math.max(v.zoom, 2.0)
    v.zoom = targetZoom
    // target.x/y are in doc coords — convert to canvas coords for offset calculation
    const d = unrotatedDimsRef.current
    const c = docToCanvas(target.x, target.y, rotationRef.current, d.w, d.h)
    v.offsetX = cw / 2 - c.x * targetZoom
    v.offsetY = ch / 2 - c.y * targetZoom
    highlightRef.current = { x: target.x, y: target.y, startTime: Date.now() }
    setRenderTick(t => t + 1)
    return true
  }, [pageNum])

  useEffect(() => {
    if (!focusTarget || !focusTarget.x || !focusTarget.y) return
    const applied = applyFocus(focusTarget)
    if (!applied) {
      // PDF not rendered yet — store as pending, renderPage will pick it up
      pendingFocusRef.current = focusTarget
      return
    }
    pendingFocusRef.current = null
    const timer = setTimeout(() => {
      highlightRef.current = null
      setRenderTick(t => t + 1)
    }, 2000)
    return () => clearTimeout(timer)
  }, [focusTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save annotations on unmount ──
  // SAFETY: Merge with store to avoid overwriting externally-applied detection markers.
  // The ref may be stale if DetectionReviewPanel applied markers while this viewer was open.
  // GUARD: Skip auto-save if annotations were never hydrated from IDB. This prevents
  // React StrictMode double-mount from writing empty markers over seeded data — the
  // first unmount fires before the async annotation restore completes.
  useEffect(() => {
    return () => {
      if (!planId) return
      if (!hydratedRef.current) return // not yet hydrated — don't overwrite IDB
      const localMarkers = markersRef.current
      // Async merge: load store state, keep detection markers from store that aren't in ref
      getPlanAnnotations(planId).then(stored => {
        const storedMarkers = normalizeMarkers(stored?.markers || [])
        // Detection markers from store that are NOT already in our ref (by id or position)
        const localIds = new Set(localMarkers.map(m => m.id))
        const externalDetections = storedMarkers.filter(m => {
          if (m.source !== 'detection') return false
          if (localIds.has(m.id)) return false
          // Skip if a local marker of the same category already sits nearby
          // (the local marker is authoritative — user placed or already accepted it)
          const tooClose = localMarkers.some(lm =>
            lm.category === m.category &&
            Math.hypot(lm.x - m.x, lm.y - m.y) < 15
          )
          return !tooClose
        })
        // Append external detections without re-deduplicating local markers.
        // localMarkers are authoritative — their positions must be preserved exactly
        // as the user placed them, even if some are close together.
        const merged = [...localMarkers, ...externalDetections]
        savePlanAnnotations(planId, {
          markers: merged,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight,
          socketHeight,
          switchHeight,
          assignments: assignmentsRef.current,
          quoteOverrides: quoteOverridesRef.current,
          rotation: rotationRef.current,
          coordVersion: 2, // markers/measurements in unrotated doc coords
          savedTemplates: savedTemplatesRef.current.length > 0 ? savedTemplatesRef.current : (stored?.savedTemplates || []),
        }, { silent: true })
      }).catch(() => {
        // Fallback: save what we have if store read fails
        savePlanAnnotations(planId, {
          markers: localMarkers,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight,
          socketHeight,
          switchHeight,
          assignments: assignmentsRef.current,
          quoteOverrides: quoteOverridesRef.current,
          rotation: rotationRef.current,
          coordVersion: 2, // markers/measurements in unrotated doc coords
        }, { silent: true })
      })
    }
  }, [planId, ceilingHeight, socketHeight, switchHeight])

  // ── Load PDF ──
  useEffect(() => {
    if (!file) return
    let cancelled = false

    async function loadPdf() {
      setLoading(true)
      setError(null)
      try {
        const pdfjsLib = await import('pdfjs-dist')
        // Use bundled worker (version-matched, no CDN dependency)
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

        const arrayBuffer = file instanceof Blob ? await file.arrayBuffer() : file
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        if (cancelled) return
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfViewer] PDF load error:', err)
          setError(err.message || 'Hiba a PDF betöltésénél')
          setLoading(false)
        }
      }
    }
    loadPdf()
    return () => { cancelled = true }
  }, [file])

  // ── Render page (concurrency-safe: latest render wins, zoom-aware) ──
  const renderPageRef = useRef(null)   // current pdf.js RenderTask (for cancellation)
  const renderIdRef = useRef(0)        // monotonic sequence id — stale render detection
  const renderScaleRef = useRef(0)     // the scale actually rendered on pdfCanvasRef
  const renderPage = useCallback(async (doc, num, opts = {}) => {
    if (!doc || !pdfCanvasRef.current) return

    // Calculate effective render scale: match current zoom × devicePixelRatio
    // so the backing bitmap has enough resolution for sharp display.
    const dpr = window.devicePixelRatio || 1
    const currentZoom = viewRef.current.zoom || 1
    // Desired scale = zoom × dpr (each "CSS pixel" of the page = this many bitmap pixels)
    // Capped to avoid excessive memory usage on extreme zoom
    const MIN_SCALE = 2
    const MAX_SCALE = 6
    const desiredScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, currentZoom * dpr))
    // If we already rendered at this scale (or higher) and this is a zoom-driven re-render, skip
    if (opts.zoomDriven && renderScaleRef.current >= desiredScale * 0.85) return

    // Cancel any in-flight render before starting a new one
    if (renderPageRef.current) {
      renderPageRef.current.cancel()
      renderPageRef.current = null
    }
    const renderId = ++renderIdRef.current

    try {
      const page = await doc.getPage(num)
      if (renderId !== renderIdRef.current) return

      const effectiveScale = desiredScale
      // Always render at 0° — rotation is applied as a view-layer canvas transform.
      // This enables arbitrary rotation angles (not just 0/90/180/270).
      const viewport = page.getViewport({ scale: effectiveScale, rotation: 0 })
      unrotatedDimsRef.current = { w: viewport.width / effectiveScale, h: viewport.height / effectiveScale }
      const canvas = pdfCanvasRef.current
      if (!canvas) return

      // Double-buffer: render to off-screen canvas, then swap to avoid black flash
      const offscreen = document.createElement('canvas')
      offscreen.width = viewport.width
      offscreen.height = viewport.height
      const offCtx = offscreen.getContext('2d')

      const renderTask = page.render({ canvasContext: offCtx, viewport })
      renderPageRef.current = renderTask
      await renderTask.promise
      renderPageRef.current = null

      if (renderId !== renderIdRef.current) return

      // Swap: copy finished render to display canvas in one operation
      canvas.width = viewport.width
      canvas.height = viewport.height
      viewRef.current.pageWidth = viewport.width / effectiveScale
      viewRef.current.pageHeight = viewport.height / effectiveScale
      renderScaleRef.current = effectiveScale
      canvas.getContext('2d').drawImage(offscreen, 0, 0)

      // Fit view initially (only on page/rotation change, not zoom-driven re-render)
      if (!opts.zoomDriven && containerRef.current) {
        const cw = containerRef.current.clientWidth
        const ch = containerRef.current.clientHeight
        const pw = viewport.width / effectiveScale
        const ph = viewport.height / effectiveScale
        // Rotated bounding box: the visible footprint of a rotated rectangle
        const rad = Math.abs(rotationRef.current * Math.PI / 180)
        const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
        const rotW = pw * cos + ph * sin
        const rotH = pw * sin + ph * cos
        const zoom = Math.min(cw / rotW, ch / rotH) * 0.92
        viewRef.current.zoom = zoom
        viewRef.current.offsetX = (cw - pw * zoom) / 2
        viewRef.current.offsetY = (ch - ph * zoom) / 2
      }
      drawOverlay()

      // ── Consume pending focus after page render ──
      if (pendingFocusRef.current) {
        const pf = pendingFocusRef.current
        pendingFocusRef.current = null
        // Apply focus directly using fresh viewRef (no applyFocus to avoid stale pageNum closure).
        // viewRef.current.pageWidth/pageHeight are set above from the just-rendered page.
        requestAnimationFrame(() => {
          const vv = viewRef.current
          const ct = containerRef.current
          if (!vv.pageWidth || !ct) return
          const cw = ct.clientWidth
          const ch = ct.clientHeight
          const targetZoom = Math.max(vv.zoom, 2.0)
          vv.zoom = targetZoom
          // pf.x/y are in doc coords — convert to canvas for offset calc
          const dd = unrotatedDimsRef.current
          const cc = docToCanvas(pf.x, pf.y, rotationRef.current, dd.w, dd.h)
          vv.offsetX = cw / 2 - cc.x * targetZoom
          vv.offsetY = ch / 2 - cc.y * targetZoom
          highlightRef.current = { x: pf.x, y: pf.y, startTime: Date.now() }
          setRenderTick(t => t + 1)
          setTimeout(() => {
            highlightRef.current = null
            setRenderTick(t => t + 1)
          }, 2000)
        })
      }
    } catch (err) {
      // pdf.js throws RenderingCancelledException when we cancel an in-flight
      // render — this is expected and not an error.
      if (err?.name === 'RenderingCancelledException') return
      console.error('[PdfViewer] Page render error:', err)
    }
  }, [applyFocus])

  useEffect(() => {
    if (pdfDoc && pageNum > 0) renderPage(pdfDoc, pageNum)
  }, [pdfDoc, pageNum, renderPage])

  // Re-render page when rotation changes
  useEffect(() => {
    rotationRef.current = rotation
    if (pdfDoc && pageNum > 0) renderPage(pdfDoc, pageNum)
  }, [rotation, pdfDoc, pageNum, renderPage])

  // ── Coordinate conversion (rotation-invariant document coords) ──
  // screenToPdf: screen pixel → unrotated document coords
  const screenToPdf = useCallback((sx, sy) => {
    const v = viewRef.current
    const cx = (sx - v.offsetX) / v.zoom
    const cy = (sy - v.offsetY) / v.zoom
    const d = unrotatedDimsRef.current
    return canvasToDoc(cx, cy, rotationRef.current, d.w, d.h)
  }, [])

  // pdfToScreen: unrotated document coords → screen pixel
  const pdfToScreen = useCallback((dx, dy) => {
    const v = viewRef.current
    const d = unrotatedDimsRef.current
    const c = docToCanvas(dx, dy, rotationRef.current, d.w, d.h)
    return {
      x: c.x * v.zoom + v.offsetX,
      y: c.y * v.zoom + v.offsetY,
    }
  }, [])

  // ── Draw overlay (annotations, crosshair, live measure) ──
  const drawOverlayRafRef = useRef(null)
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas || !containerRef.current) return
    const cw = containerRef.current.clientWidth
    const ch = containerRef.current.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = cw + 'px'
    canvas.style.height = ch + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cw, ch)

    const v = viewRef.current
    const d = unrotatedDimsRef.current
    const rot = rotationRef.current
    // ── One-time migration of legacy canvas-coord annotations to doc coords ──
    // Legacy annotations (coordVersion < 2) were stored in pdf.js rotated viewport coords.
    // That coordinate system used corner-origin transforms, not center-rotation.
    // We must use the LEGACY conversion here, not the new general rotation math.
    if (migrationRef.current && d.w > 0) {
      const mig = migrationRef.current
      migrationRef.current = null
      const legacyCanvasToDoc = (cx, cy, rot, W, H) => {
        switch (rot) {
          case 90:  return { x: W - cy, y: cx }
          case 180: return { x: W - cx, y: H - cy }
          case 270: return { x: cy,     y: H - cx }
          default:  return { x: cx,     y: cy }
        }
      }
      markersRef.current = markersRef.current.map(m => {
        const doc = legacyCanvasToDoc(m.x, m.y, mig.rotation, d.w, d.h)
        return { ...m, x: doc.x, y: doc.y }
      })
      measuresRef.current = measuresRef.current.map(seg => {
        const doc1 = legacyCanvasToDoc(seg.x1, seg.y1, mig.rotation, d.w, d.h)
        const doc2 = legacyCanvasToDoc(seg.x2, seg.y2, mig.rotation, d.w, d.h)
        return { ...seg, x1: doc1.x, y1: doc1.y, x2: doc2.x, y2: doc2.y }
      })
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      notifyMeasurements()
    }
    // proj: unrotated doc coords → screen coords (via rotation around page center + zoom/offset)
    const proj = (dx, dy) => {
      const c = docToCanvas(dx, dy, rot, d.w, d.h)
      return { x: c.x * v.zoom + v.offsetX, y: c.y * v.zoom + v.offsetY }
    }
    const sf = scaleRef.current

    // Draw PDF canvas at current transform (rotation applied as canvas transform)
    if (pdfCanvasRef.current) {
      ctx.save()
      ctx.translate(v.offsetX, v.offsetY)
      ctx.scale(v.zoom, v.zoom)
      // Rotate around page center (doc coords)
      if (rot !== 0) {
        const pcx = d.w / 2, pcy = d.h / 2
        ctx.translate(pcx, pcy)
        ctx.rotate(rot * Math.PI / 180)
        ctx.translate(-pcx, -pcy)
      }
      const rs = renderScaleRef.current || 3
      ctx.scale(1 / rs, 1 / rs) // PDF rendered at renderScale, scale down to doc-space
      ctx.drawImage(pdfCanvasRef.current, 0, 0)
      ctx.restore()
    }

    // ── Cable routes (Manhattan L-shaped lines) ──
    if (showCableRoutes) {
      const allMarkers = markersRef.current.filter(m => !m.pageNum || m.pageNum === pageNum)
      const panel = allMarkers.find(m => m.category === 'panel')
      if (panel) {
        const pp = proj(panel.x, panel.y)
        for (const m of allMarkers) {
          if (m.category === 'panel') continue
          // Cable trays are structural — don't draw individual cable runs for them
          const mCatDef = COUNT_CATEGORIES.find(c => c.key === m.category)
          if (mCatDef?.isCableTray) continue
          // Skip junction/other specials
          if (m.category === 'junction' || m.category === 'other') continue
          const mp = proj(m.x, m.y)
          ctx.save()
          ctx.strokeStyle = (m.color || C.accent) + '60'
          ctx.lineWidth = 1.5
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.moveTo(pp.x, pp.y)
          ctx.lineTo(mp.x, pp.y)
          ctx.lineTo(mp.x, mp.y)
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // ── Markers (filtered to current page) ──
    for (const m of markersRef.current) {
      if (m.pageNum && m.pageNum !== pageNum) continue // skip markers from other pages
      const s = proj(m.x, m.y)
      drawMarker(ctx, s.x, s.y, m.color, v.zoom, m.source)
    }

    // ── Focus highlight pulse ──
    if (highlightRef.current) {
      const h = highlightRef.current
      const hs = proj(h.x, h.y)
      const elapsed = Date.now() - h.startTime
      const progress = Math.min(elapsed / 2000, 1)
      const alpha = 1 - progress
      const pulseR = 18 + progress * 30
      ctx.save()
      ctx.beginPath()
      ctx.arc(hs.x, hs.y, pulseR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0, 229, 160, ${alpha})`
      ctx.lineWidth = 3
      ctx.stroke()
      // Inner solid ring
      ctx.beginPath()
      ctx.arc(hs.x, hs.y, 14, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(0, 229, 160, ${alpha * 0.7})`
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      // Animate
      if (progress < 1) requestAnimationFrame(() => setRenderTick(t => t + 1))
    }

    // ── Measurements (filtered to current page) ──
    for (const seg of measuresRef.current) {
      if (seg.pageNum && seg.pageNum !== pageNum) continue
      const a = proj(seg.x1, seg.y1)
      const b = proj(seg.x2, seg.y2)
      const distLabel = sf.factor ? formatDist(seg.dist * sf.factor) : `${seg.dist.toFixed(1)} px`
      const segCatDef = seg.category ? COUNT_CATEGORIES.find(c => c.key === seg.category) : null
      // Cable tray measurements: show shortened category label + distance
      const label = segCatDef ? `${segCatDef.label.replace(/ mm$/, '')}: ${distLabel}` : distLabel
      const color = segCatDef ? CABLE_TRAY_COLOR : C.yellow
      drawMeasureLine(ctx, a.x, a.y, b.x, b.y, label, color)
    }

    // ── Active measure/calibrate ──
    const start = activeStartRef.current
    const mouse = mousePdfRef.current
    if (start && mouse && (activeTool === 'measure' || activeTool === 'calibrate')) {
      const a = proj(start.x, start.y)
      const b = proj(mouse.x, mouse.y)
      const dx = mouse.x - start.x
      const dy = mouse.y - start.y
      const pxDist = Math.sqrt(dx * dx + dy * dy)
      const label = activeTool === 'calibrate' ? `${pxDist.toFixed(1)} px (referencia)`
        : sf.factor ? formatDist(pxDist * sf.factor) : `${pxDist.toFixed(1)} px`
      const color = activeTool === 'calibrate' ? C.blue : C.yellow
      drawMeasureLine(ctx, a.x, a.y, b.x, b.y, label, color)
    }

    // ── Crosshair ──
    if (mouse && activeTool) {
      const s = proj(mouse.x, mouse.y)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(s.x, 0); ctx.lineTo(s.x, ch)
      ctx.moveTo(0, s.y); ctx.lineTo(cw, s.y)
      ctx.stroke()
    }

    // ── Auto Symbol: sample selection rectangle ──
    const _asRect = autoSymbolRectRef.current || autoSymbolRect
    if (_asRect && autoSymbolPhase === 'picking') {
      const r = _asRect
      ctx.strokeStyle = '#FF8C42'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1))
      ctx.setLineDash([])
    }

    // ── Auto Symbol: search area rectangle (being drawn) ──
    const _asAreaRect = autoSymbolAreaRectRef.current || autoSymbolAreaRect
    if (_asAreaRect && autoSymbolPhase === 'areaSelect') {
      const r = _asAreaRect
      ctx.strokeStyle = '#4CC9F0'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1))
      ctx.setLineDash([])
    }

    // ── Auto Symbol: committed search area (during/after search) ──
    if (autoSymbolSearchArea && (autoSymbolPhase === 'done' || autoSymbolPhase === 'searching')) {
      const a = autoSymbolSearchArea
      const tl = proj(a.x, a.y)
      const br = proj(a.x + a.w, a.y + a.h)
      ctx.strokeStyle = 'rgba(76,201,240,0.4)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 3])
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
      ctx.setLineDash([])
    }

    // ── Auto Symbol: result markers (accepted = orange, rejected = dimmed red) ──
    if (autoSymbolResults.length > 0 && autoSymbolTemplateRef.current) {
      const tpl = autoSymbolTemplateRef.current
      const ANALYSIS_SCALE = 300 / 72
      // Template size in doc coords (rotation-invariant)
      // The template was cropped from the rotated raster, so for 90/270 rotation
      // the doc-space width/height are swapped relative to the raster w/h
      const docTplW = tpl.w / ANALYSIS_SCALE
      const docTplH = tpl.h / ANALYSIS_SCALE
      // Determine display color from selected category/assembly
      const _asm = (assembliesProp || []).find(a => a.id === autoSymbolCategory)
      const _ASM_COLORS = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
      const _catObj = COUNT_CATEGORIES.find(c => c.key === autoSymbolCategory)
      const acceptedColor = _asm ? (_ASM_COLORS[_asm.category] || '#FF8C42') : (_catObj?.color || '#FF8C42')

      for (const hit of autoSymbolResults) {
        const s = proj(hit.x, hit.y)
        const corner1 = proj(hit.x - docTplW / 2, hit.y - docTplH / 2)
        const corner2 = proj(hit.x + docTplW / 2, hit.y + docTplH / 2)
        const halfW = Math.abs(corner2.x - corner1.x) / 2
        const halfH = Math.abs(corner2.y - corner1.y) / 2
        const color = hit.accepted ? acceptedColor : '#FF6B6B'
        const alpha = hit.accepted ? 1 : 0.3
        ctx.globalAlpha = alpha
        // Rectangle around match
        ctx.strokeStyle = color
        ctx.lineWidth = hit.accepted ? 2 : 1
        ctx.strokeRect(s.x - halfW, s.y - halfH, halfW * 2, halfH * 2)
        // Center dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2)
        ctx.fill()
        // Score label
        ctx.font = '10px "DM Mono"'
        ctx.fillText((hit.score * 100).toFixed(0) + '%', s.x + halfW + 3, s.y - halfH + 10)
        // X mark for rejected
        if (!hit.accepted) {
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(s.x - 5, s.y - 5); ctx.lineTo(s.x + 5, s.y + 5)
          ctx.moveTo(s.x + 5, s.y - 5); ctx.lineTo(s.x - 5, s.y + 5)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
    }
  }, [activeTool, pdfToScreen, screenToPdf, showCableRoutes, autoSymbolRect, autoSymbolPhase, autoSymbolResults, autoSymbolAreaRect, autoSymbolSearchArea, autoSymbolCategory])

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const pdf = screenToPdf(sx, sy)

    // GLOBAL: middle mouse (button 1) or Shift+click ALWAYS pans, regardless of tool
    if (e.button === 1 || (e.shiftKey && activeTool)) {
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOX: viewRef.current.offsetX, startOY: viewRef.current.offsetY }
      return
    }

    // Auto-symbol done phase: click on a result to toggle accepted/rejected
    if (activeTool === 'auto-symbol' && autoSymbolPhase === 'done' && autoSymbolResults.length > 0 && autoSymbolTemplateRef.current) {
      const tpl = autoSymbolTemplateRef.current
      const ANALYSIS_SCALE = 300 / 72
      const docTplW = tpl.w / ANALYSIS_SCALE, docTplH = tpl.h / ANALYSIS_SCALE
      // Check if click is inside any result rectangle
      for (let i = 0; i < autoSymbolResults.length; i++) {
        const hit = autoSymbolResults[i]
        const s = pdfToScreen(hit.x, hit.y)
        const c1 = pdfToScreen(hit.x - docTplW / 2, hit.y - docTplH / 2)
        const c2 = pdfToScreen(hit.x + docTplW / 2, hit.y + docTplH / 2)
        const hw = Math.abs(c2.x - c1.x) / 2, hh = Math.abs(c2.y - c1.y) / 2
        if (sx >= s.x - hw && sx <= s.x + hw && sy >= s.y - hh && sy <= s.y + hh) {
          setAutoSymbolResults(prev => prev.map((r, j) => j === i ? { ...r, accepted: !r.accepted } : r))
          drawOverlay()
          return
        }
      }
      // Click outside results in done phase — add manual marker at this position
      // This lets the user manually add missing symbols that the matcher didn't find
      setAutoSymbolResults(prev => [...prev, { x: pdf.x, y: pdf.y, score: 1.0, accepted: true, idx: prev.length, manual: true }])
      setRenderTick(t => t + 1)
      return
    }

    if (activeTool === 'auto-symbol' && (autoSymbolPhase === 'picking' || autoSymbolPhase === 'areaSelect')) {
      autoSymbolStartRef.current = { sx, sy }
      if (autoSymbolPhase === 'picking') {
        setAutoSymbolRect({ x1: sx, y1: sy, x2: sx, y2: sy })
      } else {
        setAutoSymbolAreaRect({ x1: sx, y1: sy, x2: sx, y2: sy })
      }
      return
    }

    if (!activeTool || e.button === 1) {
      // Pan mode when no tool active or middle mouse
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOX: viewRef.current.offsetX, startOY: viewRef.current.offsetY }
      return
    }

    if (activeTool === 'count') {
      // Determine color from assembly or special items
      const ASM_COLORS_MAP = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
      const SPECIAL_COLORS = { panel: '#FF6B6B', junction: '#4CC9F0', other: '#71717A' }
      const asm = (assembliesProp || []).find(a => a.id === activeCategory)
      const color = asm ? (ASM_COLORS_MAP[asm.category] || '#9CA3AF') : (SPECIAL_COLORS[activeCategory] || '#9CA3AF')
      // Resolve COUNT_CATEGORY key: when activeCategory is an assembly ID (ASM-xxx),
      // map it to the proper category key (socket/switch/light/panel) so EstimationPanel
      // can count and price them. Store assembly ID in asmId field.
      const resolvedCategory = asm ? resolveCountCategory(asm.id, assembliesProp) : activeCategory
      markersRef.current.push(createMarker({ x: pdf.x, y: pdf.y, pageNum, category: resolvedCategory, color, asmId: asm ? asm.id : null, source: 'manual' }))
      markDirty()
      setRenderTick(t => t + 1)
      drawOverlay()
      // Notify parent of marker change
      if (onMarkersChangeRef.current) {
        onMarkersChangeRef.current([...markersRef.current])
      }
      // Auto-populate assignment: always update to match the LAST-used assembly
      // for this category. This keeps the AssignTab dropdown in sync.
      // Pricing now uses countByAsmId (from markers directly), so this is
      // for UI display only — not the pricing source of truth.
      if (asm && resolvedCategory) {
        setAssignments(prev => {
          const existing = prev[resolvedCategory]
          return { ...prev, [resolvedCategory]: { ...(existing || {}), assemblyId: asm.id } }
        })
      }
      return
    }

    if (activeTool === 'measure' || activeTool === 'calibrate') {
      if (!activeStartRef.current) {
        activeStartRef.current = { x: pdf.x, y: pdf.y }
      } else {
        const start = activeStartRef.current
        const dx = pdf.x - start.x
        const dy = pdf.y - start.y
        const pxDist = Math.sqrt(dx * dx + dy * dy)

        if (activeTool === 'calibrate') {
          setCalibDialog({ pxDistance: pxDist, x1: start.x, y1: start.y, x2: pdf.x, y2: pdf.y })
          activeStartRef.current = null
        } else {
          // Tag measurement with the active category (cable tray or other measurement type)
          // Always pass activeCategory so it flows to measurementItems grouping and assembly matching
          measuresRef.current.push({ x1: start.x, y1: start.y, x2: pdf.x, y2: pdf.y, dist: pxDist, category: activeCategory || undefined, pageNum })
          markDirty()
          notifyMeasurements()
          activeStartRef.current = null
          setRenderTick(t => t + 1)
        }
        drawOverlay()
      }
      return
    }
  }, [activeTool, activeCategory, screenToPdf, drawOverlay])

  const handleMouseMove = useCallback((e) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    // Auto-symbol rectangle drag (sample or area) — use immediate draw for visual feedback
    if (autoSymbolStartRef.current && (autoSymbolPhase === 'picking' || autoSymbolPhase === 'areaSelect')) {
      const r = { x1: autoSymbolStartRef.current.sx, y1: autoSymbolStartRef.current.sy, x2: sx, y2: sy }
      if (autoSymbolPhase === 'picking') setAutoSymbolRect(r)
      else setAutoSymbolAreaRect(r)
      drawOverlay()
      return
    }

    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      viewRef.current.offsetX = dragRef.current.startOX + dx
      viewRef.current.offsetY = dragRef.current.startOY + dy
      drawOverlay()
      return
    }

    mousePdfRef.current = screenToPdf(sx, sy)
    if (activeTool) drawOverlay()
  }, [activeTool, screenToPdf, drawOverlay])

  // ── Auto Symbol: run template match via Web Worker (with search ID for race safety) ──
  // IMPORTANT: must be declared BEFORE handleMouseUp which references it
  // Helper: convert doc-coords searchArea → analysis-pixel scaledArea for worker
  const docAreaToScaledArea = useCallback((area, ANALYSIS_SCALE) => {
    // Analysis raster is at 0° — doc coords map directly to analysis pixels
    return {
      x: Math.round(area.x * ANALYSIS_SCALE),
      y: Math.round(area.y * ANALYSIS_SCALE),
      w: Math.round(area.w * ANALYSIS_SCALE),
      h: Math.round(area.h * ANALYSIS_SCALE),
    }
  }, [])

  // Helper: run a single NCC worker search and return hits
  const runWorkerSearch = useCallback((imgData, imgW, imgH, cropData, tW, tH, scaledArea) => {
    return new Promise((resolve, reject) => {
      if (autoSymbolWorkerRef.current) autoSymbolWorkerRef.current.terminate()
      const worker = new Worker(templateMatchWorkerUrl, { type: 'module' })
      autoSymbolWorkerRef.current = worker
      worker.onmessage = (e) => {
        if (e.data.type === 'result') resolve(e.data.hits)
        else reject(new Error(e.data.message || 'Worker hiba'))
      }
      worker.onerror = (e) => reject(new Error(e.message || 'Worker összeomlott'))
      worker.postMessage({
        imgData, imgW, imgH,
        tplData: cropData, tplW: tW, tplH: tH,
        threshold: 0.30,
        searchArea: scaledArea,
      })
    })
  }, [])

  const runAutoSymbolSearch = useCallback(async (threshold, searchArea) => {
    if (!autoSymbolTemplateRef.current || !pdfDoc) return
    const mySearchId = ++autoSymbolSearchIdRef.current
    setAutoSymbolSearching(true)
    setAutoSymbolError(null)
    setAutoSymbolResults([])
    try {
      const ANALYSIS_SCALE = 300 / 72 // 300 DPI high-res raster for template matching
      const page = await pdfDoc.getPage(pageNum)
      const { imageData, width, height } = await renderPageImageData(page, ANALYSIS_SCALE)
      const { cropData, w: tW, h: tH } = autoSymbolTemplateRef.current

      let allHits = []

      if (searchArea) {
        // User-selected area search — use exactly as before
        const scaledArea = docAreaToScaledArea(searchArea, ANALYSIS_SCALE)
        allHits = await runWorkerSearch(imageData.data, width, height, cropData, tW, tH, scaledArea)
      } else {
        // Full-page search — try vector-aware candidate generation first
        let usedCandidates = false
        try {
          const templateSize = Math.max(tW, tH) / ANALYSIS_SCALE // convert analysis px → PDF units
          const candidates = await generateCandidateRegions(page, templateSize)
          if (candidates && candidates.regions.length > 0) {
            // Search each candidate region sequentially (reuses same image data)
            usedCandidates = true
            for (const region of candidates.regions) {
              if (!mountedRef.current || autoSymbolSearchIdRef.current !== mySearchId) return
              const scaledArea = docAreaToScaledArea(region, ANALYSIS_SCALE)
              const regionHits = await runWorkerSearch(imageData.data, width, height, cropData, tW, tH, scaledArea)
              allHits.push(...regionHits)
            }
            console.log(`[AutoSymbol] Vector-aware search: ${candidates.regions.length} regions → ${allHits.length} raw hits`)
          }
        } catch (err) {
          console.warn('[AutoSymbol] Candidate generation failed, using full-page fallback:', err.message)
        }

        // Fallback: if no candidates or candidate search found nothing → full-page scan
        if (!usedCandidates || allHits.length === 0) {
          if (usedCandidates) console.log('[AutoSymbol] Candidate regions yielded 0 hits — falling back to full-page search')
          allHits = await runWorkerSearch(imageData.data, width, height, cropData, tW, tH, null)
        }
      }

      // Stale/unmount guard
      if (!mountedRef.current || autoSymbolSearchIdRef.current !== mySearchId) return

      // Combined NMS in analysis pixel coords — matches worker NMS behavior exactly.
      // This eliminates NMS fragmentation from multi-region search: all hits compete
      // in a single suppression pass, same as if full-page search had been used.
      // minDist uses untrimmed template size (≥ trimmed), which is conservative
      // (suppresses more, not less — strictly reduces false positives vs baseline).
      const nmsMinDist = Math.max(tW, tH) * 0.6
      allHits.sort((a, b) => b.score - a.score)
      const nmsHits = []
      for (const h of allHits) {
        const tooClose = nmsHits.some(k => Math.sqrt((h.x - k.x) ** 2 + (h.y - k.y) ** 2) < nmsMinDist)
        if (!tooClose) nmsHits.push(h)
      }

      // Convert from analysis-scale pixel coords → doc coords (analysis raster is at 0°)
      const rawResults = nmsHits.map((h, i) => {
        return { x: h.x / ANALYSIS_SCALE, y: h.y / ANALYSIS_SCALE, score: h.score, accepted: true, idx: i }
      })

      // Cache ALL hits — the threshold slider filters this list instantly (no re-search)
      autoSymbolAllHitsRef.current = rawResults
      const filtered = rawResults.filter(h => h.score >= threshold).map(h => ({ ...h, accepted: true }))
      setAutoSymbolResults(filtered)
      setAutoSymbolPhase('done')
      if (filtered.length === 0) setAutoSymbolError('Nincs találat ezen a küszöbértéken. Próbáld alacsonyabb küszöbbel.')
    } catch (err) {
      if (!mountedRef.current || autoSymbolSearchIdRef.current !== mySearchId) return // stale/unmounted
      console.error('[AutoSymbol] worker search failed:', err)
      setAutoSymbolError('Keresés sikertelen: ' + (err.message || 'ismeretlen hiba'))
      setAutoSymbolPhase('done')
    } finally {
      if (mountedRef.current && autoSymbolSearchIdRef.current === mySearchId) setAutoSymbolSearching(false)
    }
  }, [pdfDoc, pageNum, docAreaToScaledArea, runWorkerSearch])

  // ── Batch search: family-aware search across all plans in the same project ──
  const runBatchProjectSearch = useCallback(async () => {
    if (!pdfDoc || !planId || !projectId) return
    setBatchSearching(true)
    setBatchProgress('Template-ek betöltése…')
    try {
      // 1. Load families from all OTHER plans in the same project
      const projectPlans = getPlansByProject(projectId).filter(p => p.id !== planId)
      const familyArrays = []
      for (const plan of projectPlans) {
        const ann = await getPlanAnnotations(plan.id)
        // Prefer symbolFamilies; fall back to migrating savedTemplates
        const planFamilies = ann?.symbolFamilies?.length
          ? ann.symbolFamilies
          : migrateTemplatesToFamilies(ann?.savedTemplates || [])
        if (planFamilies.length) familyArrays.push(planFamilies)
      }
      const families = mergeFamiliesFromPlans(familyArrays)
      if (families.length === 0) {
        setBatchProgress('')
        setBatchSearching(false)
        setAutoSymbolError('Nincs mentett szimbólum ebben a projektben. Először használd az Auto szimbólum keresést egy másik rajzon.')
        return
      }

      // 2. Render current page for matching
      const ANALYSIS_SCALE = 300 / 72
      const page = await pdfDoc.getPage(pageNum)
      const { imageData, width, height } = await renderPageImageData(page, ANALYSIS_SCALE)

      // 3. Family-aware search: primary-first, secondary fallback
      const SECONDARY_THRESHOLD = 2 // if primary finds < 2 hits, try secondaries
      const allMarkers = []

      for (let fi = 0; fi < families.length; fi++) {
        const family = families[fi]
        const sorted = sortVariantsByPerformance(family)
        const threshold = family.preferredThreshold || 0.50

        setBatchProgress(`Keresés: ${family.name} (${fi + 1}/${families.length})…`)

        // Run primary variant
        const primary = sorted[0]
        const primaryCrop = new Uint8ClampedArray(primary.cropData)
        const primaryHits = await runWorkerSearch(imageData.data, width, height, primaryCrop, primary.w, primary.h, null)
        if (!mountedRef.current) return

        const primaryAbove = primaryHits.filter(h => h.score >= threshold)
        let familyHits = [...primaryHits] // keep all at low threshold for combined NMS
        let primaryHitCount = primaryAbove.length
        let primaryAvgScore = primaryAbove.length > 0
          ? primaryAbove.reduce((s, h) => s + h.score, 0) / primaryAbove.length : 0

        // Update primary variant stats
        updateVariantStats(primary, primaryHitCount, primaryAvgScore)

        // Secondary fallback: if primary found < SECONDARY_THRESHOLD hits
        if (primaryAbove.length < SECONDARY_THRESHOLD && sorted.length > 1) {
          for (let vi = 1; vi < sorted.length; vi++) {
            const variant = sorted[vi]
            setBatchProgress(`Keresés: ${family.name} variáns ${vi + 1}/${sorted.length} (${fi + 1}/${families.length})…`)
            const varCrop = new Uint8ClampedArray(variant.cropData)
            const varHits = await runWorkerSearch(imageData.data, width, height, varCrop, variant.w, variant.h, null)
            if (!mountedRef.current) return

            const varAbove = varHits.filter(h => h.score >= threshold)
            updateVariantStats(variant, varAbove.length,
              varAbove.length > 0 ? varAbove.reduce((s, h) => s + h.score, 0) / varAbove.length : 0)
            familyHits.push(...varHits)
          }
        }

        // Combined NMS in analysis pixel coords (within family)
        const nmsMinDist = Math.max(primary.w, primary.h) * 0.6
        familyHits.sort((a, b) => b.score - a.score)
        const nmsHits = []
        for (const h of familyHits) {
          if (h.score < threshold) continue
          const tooClose = nmsHits.some(k => Math.sqrt((h.x - k.x) ** 2 + (h.y - k.y) ** 2) < nmsMinDist)
          if (!tooClose) nmsHits.push(h)
        }

        // Convert to doc coords and collect as markers (analysis raster is at 0°)
        for (const h of nmsHits) {
          allMarkers.push({
            x: h.x / ANALYSIS_SCALE, y: h.y / ANALYSIS_SCALE,
            category: family.category,
            asmId: family.asmId,
            label: family.name,
            score: h.score,
            source: 'batch_detection',
          })
        }

        // Update family stats
        updateFamilyStats(family, nmsHits.length)
      }

      // 4. Cross-family dedup (same-category hits at same location)
      allMarkers.sort((a, b) => b.score - a.score)
      const dedupDist = 15
      const unique = []
      for (const m of allMarkers) {
        const tooClose = unique.some(u =>
          u.category === m.category &&
          Math.sqrt((m.x - u.x) ** 2 + (m.y - u.y) ** 2) < dedupDist
        )
        if (!tooClose) unique.push(m)
      }

      // 5. Add as markers
      const asm = assembliesProp || []
      for (const m of unique) {
        const a = asm.find(a => a.id === m.asmId)
        const ASM_COLORS_MAP = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
        const color = a ? (ASM_COLORS_MAP[a.category] || '#9CA3AF') : '#9CA3AF'
        markersRef.current.push(createMarker({
          x: m.x, y: m.y, pageNum,
          category: m.category,
          color,
          asmId: m.asmId,
          source: 'batch_detection',
          confidence: m.score,
          label: m.label,
        }))
      }

      // 6. Persist updated family stats back to current plan annotations
      try {
        const ann = await getPlanAnnotations(planId)
        savePlanAnnotations(planId, { ...ann, symbolFamilies: families }, { silent: true })
      } catch { /* best-effort stats persist */ }

      markDirty()
      setRenderTick(t => t + 1)
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      setBatchProgress(`✓ ${unique.length} szimbólum találva (${families.length} család)`)
      setTimeout(() => setBatchProgress(''), 3000)
    } catch (err) {
      console.error('[BatchSearch] failed:', err)
      setBatchProgress('Keresés sikertelen: ' + err.message)
      setTimeout(() => setBatchProgress(''), 5000)
    } finally {
      setBatchSearching(false)
    }
  }, [pdfDoc, pageNum, planId, projectId, assembliesProp, markDirty])

  const handleMouseUp = useCallback(async () => {
    // Auto-symbol: finish rectangle pick → crop template → search
    if (autoSymbolStartRef.current && autoSymbolPhase === 'picking') {
      const r = autoSymbolRect
      autoSymbolStartRef.current = null
      if (!r || !pdfCanvasRef.current) { setAutoSymbolRect(null); return }
      const x1 = Math.min(r.x1, r.x2), y1 = Math.min(r.y1, r.y2)
      const x2 = Math.max(r.x1, r.x2), y2 = Math.max(r.y1, r.y2)
      const w = x2 - x1, h = y2 - y1
      if (w < 8 || h < 8) { setAutoSymbolRect(null); setAutoSymbolError('A kijelölés túl kicsi.'); return }
      // Convert screen coords to PDF doc coords, then render an on-demand analysis crop
      const ANALYSIS_SCALE = 300 / 72 // ~300 DPI — match the search raster
      const v = viewRef.current
      // Screen → doc coords (rotation-invariant) for the crop rectangle
      const doc1 = screenToPdf(x1, y1)
      const doc2 = screenToPdf(x2, y2)
      // Analysis raster is at 0° — crop directly in doc coords
      const canvasX = Math.min(doc1.x, doc2.x), canvasY = Math.min(doc1.y, doc2.y)
      const canvasW = Math.abs(doc2.x - doc1.x), canvasH = Math.abs(doc2.y - doc1.y)
      try {
        const analysisPage = await pdfDoc.getPage(pageNum)
        const { imageData: fullImg, width: fullW } = await renderPageImageData(analysisPage, ANALYSIS_SCALE)
        // Scale doc coords to analysis pixel coords
        const ax = Math.round(canvasX * ANALYSIS_SCALE), ay = Math.round(canvasY * ANALYSIS_SCALE)
        const tW = Math.round(canvasW * ANALYSIS_SCALE), tH = Math.round(canvasH * ANALYSIS_SCALE)
        if (tW < 4 || tH < 4) { setAutoSymbolRect(null); setAutoSymbolError('A minta túl kicsi — jelölj ki nagyobb területet.'); return }
        // Extract crop region from full analysis raster
        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = tW; cropCanvas.height = tH
        const cropCtx = cropCanvas.getContext('2d')
        // Put full image into temp canvas to use drawImage for cropping
        const fullCanvas = document.createElement('canvas')
        fullCanvas.width = fullImg.width; fullCanvas.height = fullImg.height
        fullCanvas.getContext('2d').putImageData(fullImg, 0, 0)
        cropCtx.drawImage(fullCanvas, ax, ay, tW, tH, 0, 0, tW, tH)
        const croppedData = cropCtx.getImageData(0, 0, tW, tH)
        // Store raw RGBA for worker (worker does its own toGray)
        autoSymbolTemplateRef.current = { cropData: croppedData.data, w: tW, h: tH }
        setAutoSymbolRect(null)
        // Go to area selection phase
        setAutoSymbolPhase('areaSelect')
        setAutoSymbolSearchArea(null)
      } catch (err) {
        console.error('[AutoSymbol] crop failed:', err)
        setAutoSymbolRect(null)
        setAutoSymbolPhase('picking')
      }
      return
    }
    // Area selection complete → run search
    if (autoSymbolStartRef.current && autoSymbolPhase === 'areaSelect') {
      const r = autoSymbolAreaRect
      autoSymbolStartRef.current = null
      if (r) {
        const x1s = Math.min(r.x1, r.x2), y1s = Math.min(r.y1, r.y2)
        const x2s = Math.max(r.x1, r.x2), y2s = Math.max(r.y1, r.y2)
        // Convert screen coords to PDF doc coords
        const p1 = screenToPdf(x1s, y1s)
        const p2 = screenToPdf(x2s, y2s)
        const area = { x: Math.round(Math.min(p1.x, p2.x)), y: Math.round(Math.min(p1.y, p2.y)), w: Math.round(Math.abs(p2.x - p1.x)), h: Math.round(Math.abs(p2.y - p1.y)) }
        if (area.w > 10 && area.h > 10) {
          setAutoSymbolSearchArea(area)
          setAutoSymbolAreaRect(null)
          setAutoSymbolPhase('searching')
          runAutoSymbolSearch(autoSymbolThreshold, area)
          return
        }
      }
      setAutoSymbolAreaRect(null)
      return
    }
    dragRef.current.dragging = false
  }, [autoSymbolPhase, autoSymbolRect, autoSymbolAreaRect, autoSymbolThreshold, runAutoSymbolSearch, screenToPdf])

  // Debounced zoom-aware re-render (fires 400ms after zoom stops)
  const zoomRerenderTimerRef = useRef(null)
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const v = viewRef.current

    // Trackpad two-finger scroll = pan (no ctrlKey)
    // Trackpad pinch-to-zoom = zoom (ctrlKey is set by the browser)
    // Mouse wheel = zoom (no ctrlKey, but deltaX is 0)
    const isTrackpadPan = !e.ctrlKey && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) && !e.metaKey
    const isPinchZoom = e.ctrlKey // browser sets ctrlKey for trackpad pinch

    if (isTrackpadPan && !isPinchZoom) {
      // Two-finger trackpad scroll → pan
      v.offsetX -= e.deltaX
      v.offsetY -= e.deltaY
      drawOverlay()
      setRenderTick(t => t + 1) // update scrollbars
      return
    }

    // Zoom (mouse wheel or trackpad pinch)
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const delta = isPinchZoom
      ? (e.deltaY > 0 ? 0.97 : 1.03) // finer steps for trackpad pinch
      : (e.deltaY > 0 ? 0.9 : 1.1)   // larger steps for mouse wheel
    const newZoom = Math.max(0.1, Math.min(20, v.zoom * delta))
    v.offsetX = sx - (sx - v.offsetX) * (newZoom / v.zoom)
    v.offsetY = sy - (sy - v.offsetY) * (newZoom / v.zoom)
    v.zoom = newZoom
    drawOverlay()
    setRenderTick(t => t + 1) // update scrollbars
    // Schedule high-quality re-render after zoom settles
    if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current)
    zoomRerenderTimerRef.current = setTimeout(() => {
      if (pdfDoc && pageNum > 0) renderPage(pdfDoc, pageNum, { zoomDriven: true })
    }, 400)
  }, [drawOverlay, pdfDoc, pageNum, renderPage])

  // Filter cached hits when threshold changes — NO re-search needed (instant)
  useEffect(() => {
    if (autoSymbolPhase !== 'done' || autoSymbolAllHitsRef.current.length === 0) return
    const filtered = autoSymbolAllHitsRef.current
      .filter(h => h.score >= autoSymbolThreshold)
      .map((h, i) => ({ ...h, accepted: true, idx: i }))
    setAutoSymbolResults(filtered)
    if (filtered.length === 0) setAutoSymbolError('Nincs találat ezen a küszöbértéken. Próbáld alacsonyabb küszöbbel.')
    else setAutoSymbolError(null)
  }, [autoSymbolThreshold, autoSymbolPhase])

  // Register wheel handler with { passive: false } so preventDefault works
  // (React onWheel is passive by default in modern browsers → console errors)
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const handler = (e) => handleWheel(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [handleWheel])

  // Cleanup on unmount: worker, timers, mounted flag
  useEffect(() => () => {
    mountedRef.current = false
    autoSymbolWorkerRef.current?.terminate()
    if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current)
    if (drawOverlayRafRef.current) cancelAnimationFrame(drawOverlayRafRef.current)
  }, [])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const h = (e) => {
      if (calibDialog) return
      if (e.key === 'Escape') { setActiveTool(null); activeStartRef.current = null; drawOverlay() }
      if (e.key === 'c' || e.key === 'C') setActiveTool(t => t === 'count' ? null : 'count')
      if (e.key === 'm' || e.key === 'M') setActiveTool(t => t === 'measure' ? null : 'measure')
      if (e.key === 's' || e.key === 'S') setActiveTool(t => t === 'calibrate' ? null : 'calibrate')
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [calibDialog, drawOverlay])

  // ── Undo / Clear ──
  const handleUndo = useCallback(() => {
    if (measuresRef.current.length > 0) {
      measuresRef.current.pop()
      markDirty()
      notifyMeasurements()
    } else if (markersRef.current.length > 0) {
      markersRef.current.pop()
      markDirty()
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
    }
    setRenderTick(t => t + 1)
    drawOverlay()
  }, [drawOverlay, markDirty, notifyMeasurements])

  const handleClearAll = useCallback(() => {
    markersRef.current = []
    measuresRef.current = []
    activeStartRef.current = null
    // Clear Auto Symbol state
    setAutoSymbolActive(false)
    setAutoSymbolPhase('idle')
    setAutoSymbolResults([])
    setAutoSymbolRect(null)
    setAutoSymbolAreaRect(null)
    setAutoSymbolSearchArea(null)
    setAutoSymbolError(null)
    autoSymbolAllHitsRef.current = []
    autoSymbolTemplateRef.current = null
    autoSymbolStartRef.current = null
    if (autoSymbolWorkerRef.current) { autoSymbolWorkerRef.current.terminate(); autoSymbolWorkerRef.current = null }
    markDirty()
    notifyMeasurements()
    setRenderTick(t => t + 1)
    drawOverlay()
    if (onMarkersChangeRef.current) onMarkersChangeRef.current([])
  }, [drawOverlay, markDirty, notifyMeasurements])

  // ── Calibration submit ──
  const handleCalibSubmit = useCallback(() => {
    if (!calibDialog || !calibInput) return
    const val = parseFloat(calibInput)
    if (isNaN(val) || val <= 0) return

    let meters = val
    if (calibUnit === 'cm') meters = val / 100
    if (calibUnit === 'mm') meters = val / 1000

    const factor = meters / calibDialog.pxDistance
    setScale({ factor, calibrated: true })
    markDirty()
    // Update existing measurements
    measuresRef.current = measuresRef.current.map(seg => ({ ...seg }))
    notifyMeasurements()
    setCalibDialog(null)
    setCalibInput('')
    setRenderTick(t => t + 1)
    drawOverlay()
  }, [calibDialog, calibInput, calibUnit, drawOverlay, markDirty])

  // ── Measurement category reassignment (retroactive tagging of existing measurements) ──
  const handleMeasureCategoryChange = useCallback((idx, category) => {
    if (idx >= 0 && idx < measuresRef.current.length) {
      measuresRef.current[idx] = { ...measuresRef.current[idx], category: category || undefined }
      markDirty()
      setRenderTick(t => t + 1)
      drawOverlay()
    }
  }, [drawOverlay, markDirty])

  // ── Fit view ──
  const handleFitView = useCallback(() => {
    if (!containerRef.current) return
    const cw = containerRef.current.clientWidth
    const ch = containerRef.current.clientHeight
    const v = viewRef.current
    const zoom = Math.min(cw / v.pageWidth, ch / v.pageHeight) * 0.92
    v.zoom = zoom
    v.offsetX = (cw - v.pageWidth * zoom) / 2
    v.offsetY = (ch - v.pageHeight * zoom) / 2
    drawOverlay()
  }, [drawOverlay])

  // ── Resize ──
  useEffect(() => {
    const obs = new ResizeObserver(() => drawOverlay())
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [drawOverlay])

  // ── Repaint overlay when renderTick changes (e.g. markers restored from IDB) ──
  useEffect(() => {
    drawOverlay()
  }, [renderTick, drawOverlay])

  // ── Count summary ──
  // UNIFIED: groups markers by asmId for assembly-level detail.
  // Markers without asmId (panel, detection) group by category as fallback.
  const countSummary = (() => {
    const map = {}       // { [groupKey]: count }
    const asmMap = {}    // { [groupKey]: asmId }
    for (const m of markersRef.current) {
      const groupKey = m.asmId || m.category
      map[groupKey] = (map[groupKey] || 0) + 1
      if (m.asmId) asmMap[groupKey] = m.asmId
    }
    return { counts: map, asmIds: asmMap }
  })()
  const markerCount = markersRef.current.length
  const measureCount = measuresRef.current.length

  // ── Report cable data to parent when markers/scale change ──
  useEffect(() => {
    const cb = onCableDataRef.current
    if (!cb) return
    const markers = markersRef.current
    const sf = scaleRef.current
    if (!markers.length || !sf.calibrated || !sf.factor) {
      cb(null)
      return
    }
    // Find panel marker
    const panel = markers.find(m => m.category === 'panel')
    if (!panel) { cb(null); return }

    // Compute Manhattan cable lengths from panel to each device
    let lightM = 0, socketM = 0, switchM = 0, dataM = 0, fireM = 0, otherM = 0
    let lightN = 0, socketN = 0, switchN = 0, dataN = 0, fireN = 0, otherN = 0
    const ROUTING_FACTOR = 1.25 // wall routing + vertical drops overhead

    for (const m of markers) {
      if (m.category === 'panel') continue
      // Cable tray markers don't get individual cable runs
      const catDef = COUNT_CATEGORIES.find(c => c.key === m.category)
      if (catDef?.isCableTray) continue
      // Skip junction/other specials
      if (m.category === 'junction' || m.category === 'other') continue

      const dist = (Math.abs(m.x - panel.x) + Math.abs(m.y - panel.y)) * sf.factor * ROUTING_FACTOR
      // Assembly-based categorization: look up by asmId (not m.category which is a COUNT key)
      const asm = m.asmId ? (assembliesProp || []).find(a => a.id === m.asmId) : null
      const asmCat = asm?.category
      if (asmCat === 'vilagitas' || m.category === 'light') { lightM += dist; lightN++ }
      else if (m.category === 'socket' || (asmCat === 'szerelvenyek' && (asm?.name || '').toLowerCase().includes('dugalj'))) { socketM += dist; socketN++ }
      else if (m.category === 'switch' || (asmCat === 'szerelvenyek' && (asm?.name || '').toLowerCase().includes('kapcsol'))) { switchM += dist; switchN++ }
      else if (asmCat === 'gyengaram') { dataM += dist; dataN++ }
      else if (asmCat === 'tuzjelzo') { fireM += dist; fireN++ }
      else { otherM += dist; otherN++ }
    }

    const totalM = lightM + socketM + switchM + dataM + fireM + otherM
    const deviceCount = lightN + socketN + switchN + dataN + fireN + otherN
    if (deviceCount === 0) { cb(null); return }

    cb({
      cable_total_m: Math.round(totalM * 10) / 10,
      cable_total_m_p50: Math.round(totalM * 10) / 10,
      cable_total_m_p90: Math.round(totalM * 1.2 * 10) / 10,
      cable_by_type: {
        light_m: Math.round(lightM * 10) / 10,
        socket_m: Math.round(socketM * 10) / 10,
        switch_m: Math.round(switchM * 10) / 10,
        data_m: Math.round(dataM * 10) / 10,
        fire_m: Math.round(fireM * 10) / 10,
        other_m: Math.round(otherM * 10) / 10,
      },
      method: `Kézi jelölés alapján (${deviceCount} eszköz, Manhattan-távolság × ${ROUTING_FACTOR})`,
      confidence: 0.92,
      _source: 'pdf_markers',
    })
  // onCableData accessed via stable ref — no dep needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick, scale])

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div ref={containerRef} style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
      ...style,
    }}>
      {/* Toolbar */}
      <PdfToolbar
        activeTool={activeTool} onToolChange={t => { setActiveTool(t); activeStartRef.current = null }}
        activeCategory={activeCategory} onCategoryChange={setActiveCategory}
        scale={scale} markerCount={markerCount} measureCount={measureCount}
        onFitView={handleFitView}
        onZoomIn={() => { viewRef.current.zoom = Math.min(20, viewRef.current.zoom * 1.2); drawOverlay(); setRenderTick(t => t + 1); if (pdfDoc && pageNum > 0) { if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current); zoomRerenderTimerRef.current = setTimeout(() => renderPage(pdfDoc, pageNum, { zoomDriven: true }), 400) } }}
        onZoomOut={() => { viewRef.current.zoom = Math.max(0.1, viewRef.current.zoom / 1.2); drawOverlay(); setRenderTick(t => t + 1); if (pdfDoc && pageNum > 0) { if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current); zoomRerenderTimerRef.current = setTimeout(() => renderPage(pdfDoc, pageNum, { zoomDriven: true }), 400) } }}
        onUndo={handleUndo} onClearAll={handleClearAll}
        onToggleCountPanel={() => setCountPanelOpen(!countPanelOpen)}
        countPanelOpen={countPanelOpen}
        pageNum={pageNum} numPages={numPages}
        onPrevPage={() => setPageNum(p => Math.max(1, p - 1))}
        onNextPage={() => setPageNum(p => Math.min(numPages, p + 1))}
        onToggleEstimation={() => setEstimationOpen(p => !p)}
        estimationOpen={estimationOpen}
        showCableRoutes={showCableRoutes}
        onToggleCableRoutes={() => { setShowCableRoutes(p => !p); setTimeout(drawOverlay, 50) }}
        rotation={rotation}
        onRotateLeft={() => { setRotation(r => (r - 90 + 360) % 360); if (autoSymbolActive && autoSymbolPhase !== 'done') { autoSymbolTemplateRef.current = null; setAutoSymbolPhase('picking'); setAutoSymbolError('Forgatás után válassz új mintát.') } }}
        onRotateRight={() => { setRotation(r => (r + 90) % 360); if (autoSymbolActive && autoSymbolPhase !== 'done') { autoSymbolTemplateRef.current = null; setAutoSymbolPhase('picking'); setAutoSymbolError('Forgatás után válassz új mintát.') } }}
        assemblies={assembliesProp}
        autoSymbolActive={autoSymbolActive}
        autoSymbolPhase={autoSymbolPhase}
        autoSymbolCount={autoSymbolResults.length}
        autoSymbolAcceptedCount={autoSymbolResults.filter(r => r.accepted).length}
        autoSymbolSearching={autoSymbolSearching}
        autoSymbolError={autoSymbolError}
        autoSymbolThreshold={autoSymbolThreshold}
        autoSymbolCategory={autoSymbolCategory}
        autoSymbolLabel={autoSymbolLabel}
        onAutoSymbolToggle={() => {
          if (autoSymbolActive) {
            setAutoSymbolActive(false)
            setAutoSymbolPhase('idle')
            setAutoSymbolResults([])
            setAutoSymbolRect(null)
            setAutoSymbolAreaRect(null)
            setAutoSymbolSearchArea(null)
            setAutoSymbolError(null)
            autoSymbolTemplateRef.current = null
            autoSymbolWorkerRef.current?.terminate()
            setActiveTool(null)
            drawOverlay()
          } else {
            setAutoSymbolActive(true)
            setAutoSymbolPhase('picking')
            setAutoSymbolResults([])
            setAutoSymbolSearchArea(null)
            setAutoSymbolError(null)
            setActiveTool('auto-symbol')
          }
        }}
        onAutoSymbolThresholdChange={v => setAutoSymbolThreshold(v)}
        onAutoSymbolClear={() => {
          setAutoSymbolResults([])
          setAutoSymbolPhase('picking')
          setAutoSymbolSearchArea(null)
          setAutoSymbolAreaRect(null)
          setAutoSymbolError(null)
          autoSymbolTemplateRef.current = null
          autoSymbolWorkerRef.current?.terminate()
          setAutoSymbolLabel('')
          drawOverlay()
        }}
        onAutoSymbolSearchFull={() => {
          setAutoSymbolPhase('searching')
          runAutoSymbolSearch(autoSymbolThreshold, null)
        }}
        onAutoSymbolAcceptAll={() => {
          setAutoSymbolResults(prev => prev.map(r => ({ ...r, accepted: true })))
          setRenderTick(t => t + 1)
        }}
        onAutoSymbolRejectAll={() => {
          setAutoSymbolResults(prev => prev.map(r => ({ ...r, accepted: false })))
          setRenderTick(t => t + 1)
        }}
        onAutoSymbolCategoryChange={setAutoSymbolCategory}
        onAutoSymbolLabelChange={setAutoSymbolLabel}
        onBatchProjectSearch={projectId ? runBatchProjectSearch : null}
        batchSearching={batchSearching}
        batchProgress={batchProgress}
        onAutoSymbolFinalize={() => {
          // Finalize: add accepted results as markers to the existing PDF takeoff flow
          const accepted = autoSymbolResults.filter(r => r.accepted)
          if (accepted.length === 0) return
          // Resolve assembly or category
          const asm = (assembliesProp || []).find(a => a.id === autoSymbolCategory)
          const ASM_COLORS_MAP = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
          const SPECIAL_COLORS = { panel: '#FF6B6B', junction: '#4CC9F0', other: '#71717A' }
          const color = asm ? (ASM_COLORS_MAP[asm.category] || '#9CA3AF') : (SPECIAL_COLORS[autoSymbolCategory] || COUNT_CATEGORIES.find(c => c.key === autoSymbolCategory)?.color || '#71717A')
          const resolvedCategory = asm ? resolveCountCategory(asm.id, assembliesProp) : autoSymbolCategory
          const label = autoSymbolLabel.trim() || asm?.name || COUNT_CATEGORIES.find(c => c.key === autoSymbolCategory)?.label || 'Auto szimbólum'
          for (const hit of accepted) {
            markersRef.current.push(createMarker({
              x: hit.x, y: hit.y, pageNum,
              category: resolvedCategory,
              color,
              asmId: asm ? asm.id : null,
              source: 'detection',
              confidence: hit.score,
              label,
            }))
          }
          markDirty()
          setRenderTick(t => t + 1)
          if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
          // Save template to plan annotations for reuse on other plans in the same project.
          // We save synchronously via getPlanAnnotations→savePlanAnnotations AND also
          // store in savedTemplatesRef so the unmount auto-save preserves it.
          if (planId && autoSymbolTemplateRef.current) {
            const tpl = autoSymbolTemplateRef.current
            // Per-symbol tuning: compute accept/reject stats for threshold calibration
            const totalResults = autoSymbolResults.length
            const acceptedCount = accepted.length
            const acceptRate = totalResults > 0 ? acceptedCount / totalResults : 1
            // Auto-calibrate: if user accepted most results, the threshold was good.
            // If many were rejected, suggest a higher threshold next time.
            const calibratedThreshold = acceptRate > 0.8 ? autoSymbolThreshold
              : Math.min(0.90, autoSymbolThreshold + (1 - acceptRate) * 0.10)

            const newTemplateData = {
              cropData: Array.from(tpl.cropData),
              w: tpl.w, h: tpl.h,
              category: resolvedCategory,
              asmId: asm?.id || null,
              label,
              threshold: calibratedThreshold,
              nmsRadius: Math.max(tpl.w, tpl.h) * 0.6,
              acceptRate,
              totalSearched: totalResults,
              totalAccepted: acceptedCount,
              savedAt: new Date().toISOString(),
              sourcePlanId: planId,
            }
            // Dual-write: save to BOTH savedTemplates (legacy) AND symbolFamilies (new)
            getPlanAnnotations(planId).then(ann => {
              // Legacy savedTemplates — flat dedup by category+asmId+size
              const existingTpls = ann?.savedTemplates || []
              const isDupe = existingTpls.some(t => t.category === resolvedCategory && t.asmId === (asm?.id || null) && Math.abs(t.w - tpl.w) < 5 && Math.abs(t.h - tpl.h) < 5)
              if (!isDupe) {
                savedTemplatesRef.current = [...existingTpls, newTemplateData]
              } else {
                savedTemplatesRef.current = existingTpls
              }

              // Symbol Families — auto-grouping by category+asmId, multi-variant support
              const existingFamilies = ann?.symbolFamilies || migrateTemplatesToFamilies(existingTpls)
              const { families: updatedFamilies } = upsertTemplateIntoFamilies(existingFamilies, newTemplateData)

              savePlanAnnotations(planId, {
                ...ann,
                savedTemplates: savedTemplatesRef.current,
                symbolFamilies: updatedFamilies,
              }, { silent: true })
            }).catch(() => {})
          }
          // Reset auto symbol
          setAutoSymbolActive(false)
          setAutoSymbolPhase('idle')
          setAutoSymbolResults([])
          setAutoSymbolRect(null)
          setAutoSymbolAreaRect(null)
          setAutoSymbolSearchArea(null)
          autoSymbolTemplateRef.current = null
          autoSymbolWorkerRef.current?.terminate()
          setActiveTool(null)
          setAutoSymbolLabel('')
          drawOverlay()
        }}
      />

      {/* Main area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', borderRadius: '0 0 10px 10px', cursor: activeTool === 'auto-symbol' ? 'cell' : activeTool ? 'crosshair' : 'grab' }}>
        {/* Hidden PDF render canvas */}
        <canvas ref={pdfCanvasRef} style={{ display: 'none' }} />

        {/* Visible overlay canvas (draws PDF + annotations) */}
        <canvas
          data-testid="pdf-overlay-canvas"
          ref={overlayRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          /* wheel handled via useEffect with { passive: false } to allow preventDefault */
        />

        {/* Interactive scrollbars */}
        <PdfScrollbars viewRef={viewRef} containerRef={containerRef} renderTick={renderTick} onPan={(dx, dy) => {
          viewRef.current.offsetX += dx
          viewRef.current.offsetY += dy
          drawOverlay()
        }} />

        {/* Loading */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(9,9,11,0.85)', zIndex: 5,
          }}>
            <div style={{ width: 36, height: 36, border: '3px solid #1E1E22', borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ marginTop: 12, color: C.text, fontSize: 13, fontFamily: 'Syne' }}>PDF betöltése...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div data-testid="pdf-viewer-error" style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(9,9,11,0.9)', zIndex: 5,
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div style={{ color: C.red, fontSize: 13, fontFamily: 'Syne', textAlign: 'center', maxWidth: 280, marginTop: 8 }}>{error}</div>
          </div>
        )}

        {/* Count summary panel */}
        {countPanelOpen && markerCount > 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8, zIndex: 20,
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 14, minWidth: 200, maxWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
              Összesítő ({markerCount})
            </div>
            {Object.entries(countSummary.counts).map(([key, count]) => {
              // Resolve label + color: look up assembly via asmId stored in markers
              const asmId = countSummary.asmIds[key]
              const asm = asmId ? (assembliesProp || []).find(a => a.id === asmId) : null
              const catDef = COUNT_CATEGORIES.find(c => c.key === key)
              const ASM_COLORS_MAP = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
              const SPECIAL_COLORS = { panel: '#FF6B6B', junction: '#4CC9F0', other: '#71717A' }
              const label = asm ? asm.name : (catDef?.label || key)
              const color = asm ? (ASM_COLORS_MAP[asm.category] || '#9CA3AF') : (SPECIAL_COLORS[key] || catDef?.color || '#9CA3AF')
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </div>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color, flexShrink: 0 }}>{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Calibration dialog */}
      {calibDialog && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.65)', zIndex: 30, backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 24, minWidth: 320, boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 6 }}>
              Skála kalibráció
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, marginBottom: 16 }}>
              A kijelölt vonal {calibDialog.pxDistance.toFixed(1)} px hosszú. Add meg a valós méretét:
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="number" step="any" autoFocus
                value={calibInput}
                onChange={e => setCalibInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCalibSubmit()}
                placeholder="pl. 3.5"
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6,
                  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
                  fontSize: 14, fontFamily: 'DM Mono', outline: 'none',
                }}
              />
              <select
                value={calibUnit}
                onChange={e => setCalibUnit(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 6,
                  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
                  fontSize: 13, fontFamily: 'DM Mono',
                }}
              >
                <option value="m">méter</option>
                <option value="cm">cm</option>
                <option value="mm">mm</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCalibSubmit} style={{
                flex: 1, padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontSize: 13, fontFamily: 'Syne', fontWeight: 700,
              }}>Alkalmaz</button>
              <button onClick={() => { setCalibDialog(null); setCalibInput('') }} style={{
                padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
                fontSize: 13, fontFamily: 'Syne',
              }}>Mégse</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Estimation modal overlay ── */}
      {estimationOpen && (
        <div
          onClick={() => setEstimationOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(940px, 96vw)',
              height: 'min(90vh, 880px)',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 32px 96px rgba(0,0,0,0.65)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <EstimationPanel
              markers={[...markersRef.current]}
              measurements={[...measuresRef.current]}
              scale={scale}
              ceilingHeight={ceilingHeight}
              socketHeight={socketHeight}
              switchHeight={switchHeight}
              onCeilingHeightChange={setCeilingHeight}
              onSocketHeightChange={setSocketHeight}
              onSwitchHeightChange={setSwitchHeight}
              onClose={() => setEstimationOpen(false)}
              assignments={assignments}
              onAssignmentsChange={setAssignments}
              quoteOverrides={quoteOverrides}
              onQuoteOverridesChange={setQuoteOverrides}
              onMeasureCategoryChange={handleMeasureCategoryChange}
              onCreateQuote={(data) => {
                onCreateQuote?.({ ...data, planId, markers: [...markersRef.current], measurements: [...measuresRef.current], scale })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

