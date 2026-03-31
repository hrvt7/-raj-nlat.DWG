import React, { useState, useRef, useCallback, useEffect } from 'react'
import { COUNT_CATEGORIES, CategoryDropdown, AssemblyDropdown, CABLE_TRAY_COLOR } from '../DxfViewer/DxfToolbar.jsx'
import EstimationPanel from '../EstimationPanel.jsx'
import { savePlanAnnotations, getPlanAnnotations, onAnnotationsChanged } from '../../data/planStore.js'
import { createMarker, normalizeMarkers, deduplicateMarkersManualFirst } from '../../utils/markerModel.js'
import { loadCategoryAssemblyMap, applyDefaultAssignments } from '../../data/categoryAssemblyMap.js'
import { renderPageImageData } from '../../utils/templateMatching.js'
import templateMatchWorkerUrl from '../../workers/templateMatch.worker.js?url'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// ── Map assembly to COUNT_CATEGORIES key ─────────────────────────────────────
// When users select an assembly from AssemblyDropdown (e.g. ASM-001), the marker
// must store the matching COUNT_CATEGORY key (socket, switch, light, etc.) so that
// EstimationPanel can count and price them correctly.
function resolveCountCategory(assemblyId, assemblies) {
  if (!assemblyId?.startsWith?.('ASM-')) return assemblyId // already a category key
  const asm = assemblies?.find(a => a.id === assemblyId)
  if (!asm) return 'other'
  if (asm.category === 'vilagitas') return 'light'
  if (asm.category === 'elosztok') return 'elosztok'
  if (asm.category === 'szerelvenyek') {
    const up = (asm.name || '').toUpperCase()
    if (up.includes('DUGALJ') || up.includes('ALJZAT') || up.includes('SOCKET') || up.includes('KONNEKTOR')) return 'socket'
    if (up.includes('KAPCSOL') || up.includes('SWITCH') || up.includes('DIMMER') || up.includes('VÁLTÓ') || up.includes('VALTO')) return 'switch'
    return 'socket' // default for szerelvenyek
  }
  return 'other'
}

// ── Migrate legacy markers ──────────────────────────────────────────────────
// Older markers stored assembly IDs (ASM-xxx) as category. Convert them to
// proper COUNT_CATEGORY keys while preserving the assembly ID in asmId.
function migrateMarkers(markers, assemblies) {
  if (!markers?.length || !assemblies?.length) return markers
  let changed = false
  const migrated = markers.map(m => {
    if (m.category?.startsWith?.('ASM-')) {
      changed = true
      const resolved = resolveCountCategory(m.category, assemblies)
      return { ...m, category: resolved, asmId: m.asmId || m.category }
    }
    return m
  })
  return changed ? migrated : markers
}

function formatDist(m) {
  if (m < 0.01) return `${(m * 1000).toFixed(1)} mm`
  if (m < 1) return `${(m * 100).toFixed(1)} cm`
  if (m < 100) return `${m.toFixed(2)} m`
  return `${m.toFixed(1)} m`
}

// ── Rotation-invariant coordinate helpers ─────────────────────────────────
// W, H are UNROTATED page dimensions (at 1× scale).
// Rotation is CW in degrees (0, 90, 180, 270).
//
// docToCanvas: unrotated document coords → rotated canvas coords
// canvasToDoc: rotated canvas coords → unrotated document coords
//
// These ensure markers are stored in rotation-invariant (doc) space and
// rendered correctly regardless of the current rotation.

export function docToCanvas(dx, dy, rot, W, H) {
  switch (rot) {
    case 90:  return { x: dy,     y: W - dx }
    case 180: return { x: W - dx, y: H - dy }
    case 270: return { x: H - dy, y: dx }
    default:  return { x: dx,     y: dy }
  }
}

export function canvasToDoc(cx, cy, rot, W, H) {
  switch (rot) {
    case 90:  return { x: W - cy, y: cx }
    case 180: return { x: W - cx, y: H - cy }
    case 270: return { x: cy,     y: H - cx }
    default:  return { x: cx,     y: cy }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PdfViewerPanel — PDF floor-plan viewer with pan/zoom, measure, count
// Uses <canvas> for rendering PDF pages + overlay for annotations
// ═══════════════════════════════════════════════════════════════════════════
export default function PdfViewerPanel({ file, style, planId, onCreateQuote, onCableData, assemblies: assembliesProp, onMarkersChange, focusTarget, onDirtyChange }) {
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
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
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
  const [autoSymbolRect, setAutoSymbolRect] = useState(null) // {x1,y1,x2,y2} in screen coords during pick
  const [autoSymbolResults, setAutoSymbolResults] = useState([]) // [{x,y,score,accepted}] in PDF doc coords
  const [autoSymbolLabel, setAutoSymbolLabel] = useState('') // user label for finalization
  const [autoSymbolCategory, setAutoSymbolCategory] = useState('other') // category key for finalization
  const [autoSymbolThreshold, setAutoSymbolThreshold] = useState(0.75)
  const [autoSymbolSearching, setAutoSymbolSearching] = useState(false)
  const [autoSymbolSearchArea, setAutoSymbolSearchArea] = useState(null) // {x,y,w,h} in PDF doc coords or null (full page)
  const [autoSymbolAreaRect, setAutoSymbolAreaRect] = useState(null) // screen coords during area selection
  const autoSymbolTemplateRef = useRef(null) // { cropData, w, h } cropped template RGBA
  const autoSymbolStartRef = useRef(null) // mouse down position during picking
  const autoSymbolWorkerRef = useRef(null) // Web Worker instance
  const autoSymbolSearchIdRef = useRef(0) // monotonic counter to detect stale results
  const [autoSymbolError, setAutoSymbolError] = useState(null) // string error message or null

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
        if (onMarkersChange) onMarkersChange([...markersRef.current])
      }
      if (ann.measurements?.length) { measuresRef.current = ann.measurements }
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
      if (onMarkersChange) onMarkersChange([...markersRef.current])
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
  }, [planId, onMarkersChange])

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
        // Detection markers from store that are NOT already in our ref (by id)
        const localIds = new Set(localMarkers.map(m => m.id))
        const externalDetections = storedMarkers.filter(
          m => m.source === 'detection' && !localIds.has(m.id)
        )
        // Manual-first dedup: if a manual local marker and a detection marker
        // occupy the same spot, the manual marker wins.
        const merged = deduplicateMarkersManualFirst([...localMarkers, ...externalDetections])
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
          console.error('PDF load error:', err)
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
      const viewport = page.getViewport({ scale: effectiveScale, rotation: rotationRef.current })
      const unrotVp = page.getViewport({ scale: effectiveScale, rotation: 0 })
      unrotatedDimsRef.current = { w: unrotVp.width / effectiveScale, h: unrotVp.height / effectiveScale }
      const canvas = pdfCanvasRef.current
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      viewRef.current.pageWidth = viewport.width / effectiveScale
      viewRef.current.pageHeight = viewport.height / effectiveScale
      renderScaleRef.current = effectiveScale

      const ctx = canvas.getContext('2d')
      const renderTask = page.render({ canvasContext: ctx, viewport })
      renderPageRef.current = renderTask
      await renderTask.promise
      renderPageRef.current = null

      if (renderId !== renderIdRef.current) return

      // Fit view initially (only on page/rotation change, not zoom-driven re-render)
      if (!opts.zoomDriven && containerRef.current) {
        const cw = containerRef.current.clientWidth
        const ch = containerRef.current.clientHeight
        const pw = viewport.width / effectiveScale
        const ph = viewport.height / effectiveScale
        const zoom = Math.min(cw / pw, ch / ph) * 0.92
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
      console.error('Page render error:', err)
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
    if (migrationRef.current && d.w > 0) {
      const mig = migrationRef.current
      migrationRef.current = null
      markersRef.current = markersRef.current.map(m => {
        const doc = canvasToDoc(m.x, m.y, mig.rotation, d.w, d.h)
        return { ...m, x: doc.x, y: doc.y }
      })
      measuresRef.current = measuresRef.current.map(seg => {
        const doc1 = canvasToDoc(seg.x1, seg.y1, mig.rotation, d.w, d.h)
        const doc2 = canvasToDoc(seg.x2, seg.y2, mig.rotation, d.w, d.h)
        return { ...seg, x1: doc1.x, y1: doc1.y, x2: doc2.x, y2: doc2.y }
      })
      if (onMarkersChange) onMarkersChange([...markersRef.current])
    }
    // proj: unrotated doc coords → screen coords (via docToCanvas + zoom/offset)
    const proj = (dx, dy) => {
      const c = docToCanvas(dx, dy, rot, d.w, d.h)
      return { x: c.x * v.zoom + v.offsetX, y: c.y * v.zoom + v.offsetY }
    }
    const sf = scaleRef.current

    // Draw PDF canvas at current transform
    if (pdfCanvasRef.current) {
      ctx.save()
      ctx.translate(v.offsetX, v.offsetY)
      const rs = renderScaleRef.current || 3
      ctx.scale(v.zoom / rs, v.zoom / rs) // PDF rendered at dynamic scale
      ctx.drawImage(pdfCanvasRef.current, 0, 0)
      ctx.restore()
    }

    // ── Cable routes (Manhattan L-shaped lines) ──
    if (showCableRoutes) {
      const allMarkers = markersRef.current
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

    // ── Markers ──
    for (const m of markersRef.current) {
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

    // ── Measurements ──
    for (const seg of measuresRef.current) {
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
    if (autoSymbolRect && autoSymbolPhase === 'picking') {
      const r = autoSymbolRect
      ctx.strokeStyle = '#FF8C42'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1))
      ctx.setLineDash([])
    }

    // ── Auto Symbol: search area rectangle (being drawn) ──
    if (autoSymbolAreaRect && autoSymbolPhase === 'areaSelect') {
      const r = autoSymbolAreaRect
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
      const ANALYSIS_SCALE = 4
      for (const hit of autoSymbolResults) {
        const s = proj(hit.x, hit.y)
        // tpl.w/h are in analysis-scale pixels; convert to doc-scale for display
        const halfW = (tpl.w / ANALYSIS_SCALE / 2) * v.zoom
        const halfH = (tpl.h / ANALYSIS_SCALE / 2) * v.zoom
        const color = hit.accepted ? '#FF8C42' : '#FF6B6B'
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
  }, [activeTool, pdfToScreen, screenToPdf, showCableRoutes, autoSymbolRect, autoSymbolPhase, autoSymbolResults, autoSymbolAreaRect, autoSymbolSearchArea])

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const pdf = screenToPdf(sx, sy)

    // Auto-symbol done phase: click on a result to toggle accepted/rejected
    if (activeTool === 'auto-symbol' && autoSymbolPhase === 'done' && autoSymbolResults.length > 0 && autoSymbolTemplateRef.current) {
      const tpl = autoSymbolTemplateRef.current
      const ANALYSIS_SCALE = 4
      const halfW = tpl.w / ANALYSIS_SCALE / 2, halfH = tpl.h / ANALYSIS_SCALE / 2
      // Check if click is inside any result rectangle
      for (let i = 0; i < autoSymbolResults.length; i++) {
        const hit = autoSymbolResults[i]
        const s = pdfToScreen(hit.x, hit.y)
        const hw = halfW * viewRef.current.zoom, hh = halfH * viewRef.current.zoom
        if (sx >= s.x - hw && sx <= s.x + hw && sy >= s.y - hh && sy <= s.y + hh) {
          setAutoSymbolResults(prev => prev.map((r, j) => j === i ? { ...r, accepted: !r.accepted } : r))
          drawOverlay()
          return
        }
      }
      // Click outside results in done phase — just pan
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOX: viewRef.current.offsetX, startOY: viewRef.current.offsetY }
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
      markersRef.current.push(createMarker({ x: pdf.x, y: pdf.y, category: resolvedCategory, color, asmId: asm ? asm.id : null, source: 'manual' }))
      markDirty()
      setRenderTick(t => t + 1)
      drawOverlay()
      // Notify parent of marker change
      if (onMarkersChange) {
        onMarkersChange([...markersRef.current])
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
          // Tag measurement with cable tray category if the active category is a cable tray
          const activeCatDef = COUNT_CATEGORIES.find(c => c.key === activeCategory)
          const measCategory = activeCatDef?.isCableTray ? activeCategory : undefined
          measuresRef.current.push({ x1: start.x, y1: start.y, x2: pdf.x, y2: pdf.y, dist: pxDist, ...(measCategory ? { category: measCategory } : {}) })
          markDirty()
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

    // Auto-symbol rectangle drag (sample or area)
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
  const runAutoSymbolSearch = useCallback(async (threshold, searchArea) => {
    if (!autoSymbolTemplateRef.current || !pdfDoc) return
    const mySearchId = ++autoSymbolSearchIdRef.current
    setAutoSymbolSearching(true)
    setAutoSymbolError(null)
    setAutoSymbolResults([])
    try {
      const ANALYSIS_SCALE = 4 // ~300 DPI high-res raster for template matching
      const page = await pdfDoc.getPage(pageNum)
      const { imageData, width, height } = await renderPageImageData(page, ANALYSIS_SCALE)
      const { cropData, w: tW, h: tH } = autoSymbolTemplateRef.current

      // Abort any previous worker
      if (autoSymbolWorkerRef.current) autoSymbolWorkerRef.current.terminate()
      const worker = new Worker(templateMatchWorkerUrl, { type: 'module' })
      autoSymbolWorkerRef.current = worker

      const result = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'result') resolve(e.data.hits)
          else reject(new Error(e.data.message || 'Worker hiba'))
        }
        worker.onerror = (e) => reject(new Error(e.message || 'Worker összeomlott'))
        // Convert search area from doc coords to analysis-scale pixel coords
        const scaledArea = searchArea ? {
          x: Math.round(searchArea.x * ANALYSIS_SCALE),
          y: Math.round(searchArea.y * ANALYSIS_SCALE),
          w: Math.round(searchArea.w * ANALYSIS_SCALE),
          h: Math.round(searchArea.h * ANALYSIS_SCALE),
        } : null
        worker.postMessage({
          imgData: imageData.data,
          imgW: width, imgH: height,
          tplData: cropData,
          tplW: tW, tplH: tH,
          threshold,
          searchArea: scaledArea,
        })
      })

      // Stale result guard — if a newer search was started, discard this result
      if (autoSymbolSearchIdRef.current !== mySearchId) return

      // Convert from analysis-scale pixel coords back to doc coords (scale=1)
      const results = result.map((h, i) => ({
        x: (h.x + tW / 2) / ANALYSIS_SCALE, y: (h.y + tH / 2) / ANALYSIS_SCALE, score: h.score, accepted: true, idx: i,
      }))
      setAutoSymbolResults(results)
      setAutoSymbolPhase('done')
      if (results.length === 0) setAutoSymbolError('Nincs találat ezen a küszöbértéken.')
    } catch (err) {
      if (autoSymbolSearchIdRef.current !== mySearchId) return // stale
      console.error('[AutoSymbol] worker search failed:', err)
      setAutoSymbolError('Keresés sikertelen: ' + (err.message || 'ismeretlen hiba'))
      setAutoSymbolPhase('done')
    } finally {
      if (autoSymbolSearchIdRef.current === mySearchId) setAutoSymbolSearching(false)
    }
  }, [pdfDoc, pageNum])

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
      const ANALYSIS_SCALE = 4 // ~300 DPI — match the search raster
      const v = viewRef.current
      // Screen → doc coords for the crop rectangle
      const doc1 = screenToPdf(x1, y1)
      const doc2 = screenToPdf(x2, y2)
      const docX = Math.min(doc1.x, doc2.x), docY = Math.min(doc1.y, doc2.y)
      const docW = Math.abs(doc2.x - doc1.x), docH = Math.abs(doc2.y - doc1.y)
      // Crop from on-demand high-res analysis raster (NOT the display canvas)
      try {
        const analysisPage = await pdfDoc.getPage(pageNum)
        const { imageData: fullImg, width: fullW } = await renderPageImageData(analysisPage, ANALYSIS_SCALE)
        // Extract template region from analysis raster
        const ax = Math.round(docX * ANALYSIS_SCALE), ay = Math.round(docY * ANALYSIS_SCALE)
        const tW = Math.round(docW * ANALYSIS_SCALE), tH = Math.round(docH * ANALYSIS_SCALE)
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
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const v = viewRef.current
    const newZoom = Math.max(0.1, Math.min(20, v.zoom * delta))
    // Zoom towards cursor
    v.offsetX = sx - (sx - v.offsetX) * (newZoom / v.zoom)
    v.offsetY = sy - (sy - v.offsetY) * (newZoom / v.zoom)
    v.zoom = newZoom
    drawOverlay()
    // Schedule high-quality re-render after zoom settles
    if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current)
    zoomRerenderTimerRef.current = setTimeout(() => {
      if (pdfDoc && pageNum > 0) renderPage(pdfDoc, pageNum, { zoomDriven: true })
    }, 400)
  }, [drawOverlay, pdfDoc, pageNum, renderPage])

  // Re-search when threshold changes (debounced)
  useEffect(() => {
    if (autoSymbolPhase !== 'done' || !autoSymbolTemplateRef.current) return
    const t = setTimeout(() => runAutoSymbolSearch(autoSymbolThreshold, autoSymbolSearchArea), 300)
    return () => clearTimeout(t)
  }, [autoSymbolThreshold]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup worker on unmount
  useEffect(() => () => { autoSymbolWorkerRef.current?.terminate() }, [])

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
    } else if (markersRef.current.length > 0) {
      markersRef.current.pop()
      markDirty()
      if (onMarkersChange) onMarkersChange([...markersRef.current])
    }
    setRenderTick(t => t + 1)
    drawOverlay()
  }, [drawOverlay, onMarkersChange, markDirty])

  const handleClearAll = useCallback(() => {
    markersRef.current = []
    measuresRef.current = []
    activeStartRef.current = null
    markDirty()
    setRenderTick(t => t + 1)
    drawOverlay()
    if (onMarkersChange) onMarkersChange([])
  }, [drawOverlay, onMarkersChange, markDirty])

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
    let lightM = 0, socketM = 0, switchM = 0, otherM = 0
    let lightN = 0, socketN = 0, switchN = 0, otherN = 0
    const ROUTING_FACTOR = 1.25 // wall routing + vertical drops overhead

    for (const m of markers) {
      if (m.category === 'panel') continue
      // Cable tray markers don't get individual cable runs
      const catDef = COUNT_CATEGORIES.find(c => c.key === m.category)
      if (catDef?.isCableTray) continue
      // Skip junction/other specials
      if (m.category === 'junction' || m.category === 'other') continue

      const dist = (Math.abs(m.x - panel.x) + Math.abs(m.y - panel.y)) * sf.factor * ROUTING_FACTOR
      // Assembly-based categorization: look up the assembly category
      const asm = (assembliesProp || []).find(a => a.id === m.category)
      const asmCat = asm?.category
      if (asmCat === 'vilagitas' || m.category === 'light') { lightM += dist; lightN++ }
      else if (m.category === 'socket' || (asmCat === 'szerelvenyek' && (asm?.name || '').toLowerCase().includes('dugalj'))) { socketM += dist; socketN++ }
      else if (m.category === 'switch' || (asmCat === 'szerelvenyek' && (asm?.name || '').toLowerCase().includes('kapcsol'))) { switchM += dist; switchN++ }
      else { otherM += dist; otherN++ }
    }

    const totalM = lightM + socketM + switchM + otherM
    const deviceCount = lightN + socketN + switchN + otherN
    if (deviceCount === 0) { cb(null); return }

    cb({
      cable_total_m: Math.round(totalM * 10) / 10,
      cable_total_m_p50: Math.round(totalM * 10) / 10,
      cable_total_m_p90: Math.round(totalM * 1.2 * 10) / 10,
      cable_by_type: {
        light_m: Math.round(lightM * 10) / 10,
        socket_m: Math.round(socketM * 10) / 10,
        switch_m: Math.round(switchM * 10) / 10,
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
        onZoomIn={() => { viewRef.current.zoom = Math.min(20, viewRef.current.zoom * 1.2); drawOverlay(); if (pdfDoc && pageNum > 0) { if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current); zoomRerenderTimerRef.current = setTimeout(() => renderPage(pdfDoc, pageNum, { zoomDriven: true }), 400) } }}
        onZoomOut={() => { viewRef.current.zoom = Math.max(0.1, viewRef.current.zoom / 1.2); drawOverlay(); if (pdfDoc && pageNum > 0) { if (zoomRerenderTimerRef.current) clearTimeout(zoomRerenderTimerRef.current); zoomRerenderTimerRef.current = setTimeout(() => renderPage(pdfDoc, pageNum, { zoomDriven: true }), 400) } }}
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
        onRotateLeft={() => setRotation(r => (r - 90 + 360) % 360)}
        onRotateRight={() => setRotation(r => (r + 90) % 360)}
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
          drawOverlay()
        }}
        onAutoSymbolRejectAll={() => {
          setAutoSymbolResults(prev => prev.map(r => ({ ...r, accepted: false })))
          drawOverlay()
        }}
        onAutoSymbolCategoryChange={setAutoSymbolCategory}
        onAutoSymbolLabelChange={setAutoSymbolLabel}
        onAutoSymbolFinalize={() => {
          // Finalize: add accepted results as markers to the existing PDF takeoff flow
          const accepted = autoSymbolResults.filter(r => r.accepted)
          if (accepted.length === 0) return
          const cat = COUNT_CATEGORIES.find(c => c.key === autoSymbolCategory) || COUNT_CATEGORIES.find(c => c.key === 'other')
          const color = cat?.color || '#71717A'
          const label = autoSymbolLabel.trim() || cat?.label || 'Auto szimbólum'
          for (const hit of accepted) {
            markersRef.current.push(createMarker({
              x: hit.x, y: hit.y,
              category: autoSymbolCategory,
              color,
              source: 'detection',
              confidence: hit.score,
              label,
            }))
          }
          markDirty()
          setRenderTick(t => t + 1)
          if (onMarkersChange) onMarkersChange([...markersRef.current])
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
          onWheel={handleWheel}
        />

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

// ─── Drawing helpers (same as DXF overlay) ──────────────────────────────────

function drawMarker(ctx, x, y, color, zoom, source) {
  const r = Math.max(6, 10 * Math.min(zoom, 1.5))
  const isDetection = source === 'detection'

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color + (isDetection ? '20' : '40')
  ctx.fill()
  ctx.lineWidth = isDetection ? 1.5 : 2

  if (isDetection) {
    // Dashed border for auto-detected markers
    ctx.setLineDash([3, 3])
  }
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.setLineDash([]) // reset

  // Cross (manual) or dot (detection)
  if (isDetection) {
    // Small inner dot for detection markers
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  } else {
    // Cross for manual markers
    const c = r * 0.5
    ctx.beginPath()
    ctx.moveTo(x - c, y); ctx.lineTo(x + c, y)
    ctx.moveTo(x, y - c); ctx.lineTo(x, y + c)
    ctx.stroke()
  }
}

function drawMeasureLine(ctx, x1, y1, x2, y2, label, color) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([6, 3])
  ctx.stroke()
  ctx.setLineDash([])

  // Endpoints
  for (const [ex, ey] of [[x1, y1], [x2, y2]]) {
    ctx.beginPath()
    ctx.arc(ex, ey, 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // Label
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  ctx.font = '600 12px "DM Mono", monospace'
  const tw = ctx.measureText(label).width
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(mx - tw / 2 - 6, my - 18, tw + 12, 22)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, mx, my - 7)
}

// ─── PDF Toolbar ────────────────────────────────────────────────────────────

function PdfToolbar({
  activeTool, onToolChange,
  activeCategory, onCategoryChange,
  scale, markerCount, measureCount,
  onFitView, onZoomIn, onZoomOut,
  onUndo, onClearAll,
  onToggleCountPanel, countPanelOpen,
  pageNum, numPages, onPrevPage, onNextPage,
  /* onToggleEstimation, estimationOpen — removed with Részletek button */
  showCableRoutes, onToggleCableRoutes,
  rotation, onRotateLeft, onRotateRight,
  assemblies,
  autoSymbolActive, autoSymbolPhase, autoSymbolCount, autoSymbolAcceptedCount, autoSymbolSearching, autoSymbolError,
  autoSymbolThreshold, autoSymbolCategory, autoSymbolLabel,
  onAutoSymbolToggle, onAutoSymbolThresholdChange, onAutoSymbolClear, onAutoSymbolSearchFull,
  onAutoSymbolAcceptAll, onAutoSymbolRejectAll, onAutoSymbolCategoryChange, onAutoSymbolLabelChange, onAutoSymbolFinalize,
}) {
  const TOOLS = [
    { id: 'count', label: 'Számlálás', key: 'C' },
    { id: 'measure', label: 'Mérés', key: 'M' },
    { id: 'calibrate', label: 'Skála', key: 'S' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', background: C.bgCard, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
      {/* Page nav */}
      {numPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8, background: C.bg, borderRadius: 6, padding: 2 }}>
          <TinyBtn onClick={onPrevPage} disabled={pageNum <= 1} title="Előző oldal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </TinyBtn>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, padding: '0 2px', userSelect: 'none' }}>{pageNum}/{numPages}</span>
          <TinyBtn onClick={onNextPage} disabled={pageNum >= numPages} title="Következő oldal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </TinyBtn>
        </div>
      )}

      {/* Tool buttons */}
      {TOOLS.map(t => {
        const on = activeTool === t.id
        return (
          <button key={t.id} onClick={() => onToolChange(on ? null : t.id)} title={`${t.label} (${t.key})`} style={{
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'Syne', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
            background: on ? 'rgba(0,229,160,0.12)' : 'transparent',
            border: `1px solid ${on ? 'rgba(0,229,160,0.3)' : 'transparent'}`,
            color: on ? C.accent : C.text, transition: 'all 0.12s',
          }}>
            {t.label}
            {t.id === 'count' && markerCount > 0 && <span style={{ background: C.accent, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{markerCount}</span>}
            {t.id === 'measure' && measureCount > 0 && <span style={{ background: C.yellow, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{measureCount}</span>}
            {t.id === 'calibrate' && scale.calibrated && <span style={{ background: C.blue, color: C.bg, borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 700, fontFamily: 'DM Mono' }}>✓</span>}
          </button>
        )
      })}

      {/* Assembly/Category picker — shown for count + measure */}
      {activeTool === 'count' && assemblies?.length > 0 && (
        <AssemblyDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} assemblies={assemblies} />
      )}
      {activeTool === 'count' && (!assemblies || !assemblies.length) && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} />
      )}
      {activeTool === 'measure' && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} />
      )}

      {/* ── Auto Symbol POC ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, borderLeft: `1px solid ${C.border}`, paddingLeft: 8 }}>
        <button onClick={onAutoSymbolToggle} title="Auto szimbólum keresés (BETA)" style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'Syne', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
          background: autoSymbolActive ? 'rgba(255,140,66,0.12)' : 'transparent',
          border: `1px solid ${autoSymbolActive ? 'rgba(255,140,66,0.3)' : 'transparent'}`,
          color: autoSymbolActive ? '#FF8C42' : C.text, transition: 'all 0.12s',
        }}>
          ⚡ Auto
          {autoSymbolCount > 0 && <span style={{ background: '#FF8C42', color: '#09090B', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{autoSymbolCount}</span>}
        </button>
        {autoSymbolActive && autoSymbolPhase === 'picking' && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#FF8C42' }}>① Jelölj ki mintát ↓</span>
        )}
        {autoSymbolActive && autoSymbolPhase === 'areaSelect' && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#4CC9F0' }}>② Keresési terület (opcionális) ↓</span>
        )}
        {autoSymbolActive && autoSymbolPhase === 'areaSelect' && (
          <button onClick={onAutoSymbolSearchFull}
            style={{ padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontFamily: 'DM Mono', background: '#FF8C42', border: 'none', color: '#09090B', fontWeight: 700 }}>
            Keresés teljes oldalon →
          </button>
        )}
        {autoSymbolSearching && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#FF8C42' }}>Keresés…</span>
        )}
        {autoSymbolError && !autoSymbolSearching && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: autoSymbolCount === 0 ? '#FF8C42' : '#FF6B6B' }}>{autoSymbolError}</span>
        )}
        {autoSymbolPhase === 'done' && (
          <>
            <label style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              Küszöb
              <input type="range" min="0.50" max="0.95" step="0.05" value={autoSymbolThreshold}
                onChange={e => onAutoSymbolThresholdChange(parseFloat(e.target.value))}
                style={{ width: 50, accentColor: '#FF8C42' }} />
              <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#FF8C42', width: 28 }}>{(autoSymbolThreshold * 100).toFixed(0)}%</span>
            </label>
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>
              {autoSymbolAcceptedCount}/{autoSymbolCount}
            </span>
            <button onClick={onAutoSymbolAcceptAll} title="Összes elfogadása" style={{
              padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
              background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: C.accent,
            }}>✓ Mind</button>
            <button onClick={onAutoSymbolRejectAll} title="Összes kizárása" style={{
              padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
              background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#FF6B6B',
            }}>✕ Mind</button>
            <select value={autoSymbolCategory} onChange={e => onAutoSymbolCategoryChange(e.target.value)}
              style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono', background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
              {COUNT_CATEGORIES.filter(c => !c.isCableTray).map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <input value={autoSymbolLabel} onChange={e => onAutoSymbolLabelChange(e.target.value)}
              placeholder="Címke…" style={{ width: 80, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono', background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            <button onClick={onAutoSymbolFinalize} disabled={autoSymbolAcceptedCount === 0 || autoSymbolSearching} title="Elfogadott találatok hozzáadása a takeoff-hoz" style={{
              padding: '3px 10px', borderRadius: 5, cursor: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? 'pointer' : 'default', fontSize: 10, fontFamily: 'Syne', fontWeight: 700,
              background: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? '#FF8C42' : C.bgCard, border: 'none', color: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? '#09090B' : C.muted,
              opacity: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? 1 : 0.5,
            }}>+ Takeoff ({autoSymbolAcceptedCount})</button>
            <button onClick={onAutoSymbolClear} title="Új minta" style={{
              padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
              background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
            }}>Új minta</button>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Undo/Clear */}
      {(markerCount > 0 || measureCount > 0) && (
        <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
          <TinyBtn onClick={onUndo} title="Visszavonás (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="M3 10l4-4M3 10l4 4"/></svg>
          </TinyBtn>
          <TinyBtn onClick={onClearAll} title="Összes törlése" style={{ color: C.red }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </TinyBtn>
        </div>
      )}

      {/* Összesítő — text pill */}
      {markerCount > 0 && (
        <button onClick={onToggleCountPanel} title="Összesítő panel" style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          fontFamily: 'Syne', fontWeight: 700,
          background: countPanelOpen ? 'rgba(0,229,160,0.15)' : 'transparent',
          border: `1px solid ${countPanelOpen ? 'rgba(0,229,160,0.3)' : C.border}`,
          color: countPanelOpen ? C.accent : C.muted,
          transition: 'all 0.12s',
        }}>
          {countPanelOpen ? 'Összesítő ✓' : 'Összesítő'}
        </button>
      )}

      {/* Cable routes toggle */}
      {markerCount > 0 && (
        <button onClick={onToggleCableRoutes} style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          fontFamily: 'Syne', fontWeight: 700,
          background: showCableRoutes ? 'rgba(255,209,102,0.15)' : 'transparent',
          border: `1px solid ${showCableRoutes ? C.yellow : C.border}`,
          color: showCableRoutes ? C.yellow : C.muted,
          transition: 'all 0.12s',
        }}>
          {showCableRoutes ? 'Kábelvonalak ✓' : 'Kábelvonalak'}
        </button>
      )}

      {/* Rotation controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }} title="Terv forgatása">
        <TinyBtn onClick={onRotateLeft} title="Forgatás balra (−90°)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2v6h6"/><path d="M2.5 8a10 10 0 1 1 3.17-4.39"/></svg>
        </TinyBtn>
        {rotation !== 0 && (
          <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, padding: '4px 3px', alignSelf: 'center' }}>{rotation}°</span>
        )}
        <TinyBtn onClick={onRotateRight} title="Forgatás jobbra (+90°)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.5 2v6h-6"/><path d="M21.5 8A10 10 0 1 0 18.33 3.61"/></svg>
        </TinyBtn>
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
        <TinyBtn onClick={onZoomIn} title="Nagyítás"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></TinyBtn>
        <TinyBtn onClick={onFitView} title="Illesztés"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></TinyBtn>
        <TinyBtn onClick={onZoomOut} title="Kicsinyítés"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg></TinyBtn>
      </div>
    </div>
  )
}

function TinyBtn({ children, onClick, title, style, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      padding: '5px 7px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
      background: 'transparent', border: 'none', color: C.muted, fontSize: 13,
      fontFamily: 'DM Mono', fontWeight: 600, opacity: disabled ? 0.3 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'color 0.1s',
      ...style,
    }}>{children}</button>
  )
}
