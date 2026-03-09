import React, { useState, useRef, useCallback, useEffect } from 'react'
import { COUNT_CATEGORIES, CategoryDropdown, AssemblyDropdown, CABLE_TRAY_COLOR } from '../DxfViewer/DxfToolbar.jsx'
import EstimationPanel from '../EstimationPanel.jsx'
import SeedAssignPanel from '../SeedAssignPanel.jsx'
import { savePlanAnnotations, getPlanAnnotations, onAnnotationsChanged } from '../../data/planStore.js'
import { createMarker, normalizeMarkers, deduplicateMarkersManualFirst } from '../../utils/markerModel.js'
import { loadCategoryAssemblyMap, applyDefaultAssignments, saveCategoryAssemblyBatch } from '../../data/categoryAssemblyMap.js'
import { createRecipe, saveRecipe, getRecipesByPlan, getRecipesByProject, getAllRecipesByProject, getRelevantRecipes, updateRecipe, archiveRecipe, restoreRecipe, updateRecipeRunStats, RECIPE_SCOPE, MATCH_STRICTNESS } from '../../data/recipeStore.js'
import RecipeMatchReviewPanel from '../RecipeMatchReviewPanel.jsx'
import RecipeListPanel from '../RecipeListPanel.jsx'
import ReuseBanner, { shouldShowReuseBanner, dismissReuseBanner, getProjectRecipeCount } from '../ReuseBanner.jsx'
import { runRecipeMatching, batchAcceptGreen as batchAcceptGreenMatches, toMarkerFields as recipeToMarkerFields, groupByBucket as groupMatchByBucket } from '../../services/recipeMatching/index.js'
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

// ═══════════════════════════════════════════════════════════════════════════
// PdfViewerPanel — PDF floor-plan viewer with pan/zoom, measure, count
// Uses <canvas> for rendering PDF pages + overlay for annotations
// ═══════════════════════════════════════════════════════════════════════════
export default function PdfViewerPanel({ file, style, planId, projectId, onCreateQuote, onCableData, assemblies: assembliesProp, onMarkersChange, focusTarget, onDirtyChange }) {
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
  const pdfDocRef = useRef(null)
  useEffect(() => { pdfDocRef.current = pdfDoc }, [pdfDoc])
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── View transform (pan/zoom) ──
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 1, pageWidth: 0, pageHeight: 0 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOX: 0, startOY: 0 })

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

  // ── Dirty state tracking (unsaved local changes) ──
  const dirtyRef = useRef(false)
  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true
      if (onDirtyChange) onDirtyChange(true)
    }
  }, [onDirtyChange])

  // ── Seed capture state (Azonosítás mode) ──
  const seedStartRef = useRef(null)        // { x, y } in screen coords — drag start
  const seedRectRef = useRef(null)          // { x, y, w, h } in screen coords — live rect
  const [pendingSeed, setPendingSeed] = useState(null) // { bbox, pageNum, cropDataUrl, textHints }
  const [recipeCount, setRecipeCount] = useState(0)    // recipe count badge

  // Load recipe count for this plan
  useEffect(() => {
    if (planId) setRecipeCount(getRecipesByPlan(planId).length)
  }, [planId])

  // ── Recipe matching state ──
  const [recipeMatchCandidates, setRecipeMatchCandidates] = useState([])
  const recipeMatchCandidatesRef = useRef([])
  useEffect(() => { recipeMatchCandidatesRef.current = recipeMatchCandidates; setRenderTick(t => t + 1) }, [recipeMatchCandidates])
  const [recipeMatchRunning, setRecipeMatchRunning] = useState(false)
  const [recipeMatchPanelOpen, setRecipeMatchPanelOpen] = useState(false)

  // ── Reuse banner state ──
  const [reuseBannerDismissed, setReuseBannerDismissed] = useState(false)
  // Use relevance-aware recipe lookup for recommendations
  const getRelevantProjectRecipes = useCallback((pid) => getRelevantRecipes(pid), [])
  const projectRecipeCount = getProjectRecipeCount(projectId, getRelevantProjectRecipes)
  const markerCount_forBanner = markersRef.current?.length || 0
  const showReuseBanner = !reuseBannerDismissed
    && !recipeMatchPanelOpen && !pendingSeed
    && shouldShowReuseBanner(projectId, planId, markerCount_forBanner, getRelevantProjectRecipes)

  // ── Recipe list panel state ──
  const [recipeListOpen, setRecipeListOpen] = useState(false)
  const [recipeListItems, setRecipeListItems] = useState([])
  const [showArchivedRecipes, setShowArchivedRecipes] = useState(false)

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
      // Reset dirty after hydration from store
      dirtyRef.current = false
      if (onDirtyChange) onDirtyChange(false)
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
    v.offsetX = cw / 2 - target.x * targetZoom
    v.offsetY = ch / 2 - target.y * targetZoom
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
  useEffect(() => {
    return () => {
      if (!planId) return
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

  // ── Render page ──
  const renderPageRef = useRef(null)
  const renderPage = useCallback(async (doc, num) => {
    if (!doc || !pdfCanvasRef.current) return
    try {
      const page = await doc.getPage(num)
      const viewport = page.getViewport({ scale: 2, rotation: rotationRef.current }) // hi-dpi + rotation
      const canvas = pdfCanvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      viewRef.current.pageWidth = viewport.width / 2
      viewRef.current.pageHeight = viewport.height / 2

      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise

      // Fit view initially
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth
        const ch = containerRef.current.clientHeight
        const pw = viewport.width / 2
        const ph = viewport.height / 2
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
          vv.offsetX = cw / 2 - pf.x * targetZoom
          vv.offsetY = ch / 2 - pf.y * targetZoom
          highlightRef.current = { x: pf.x, y: pf.y, startTime: Date.now() }
          setRenderTick(t => t + 1)
          setTimeout(() => {
            highlightRef.current = null
            setRenderTick(t => t + 1)
          }, 2000)
        })
      }
    } catch (err) {
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

  // ── Coordinate conversion ──
  const screenToPdf = useCallback((sx, sy) => {
    const v = viewRef.current
    return {
      x: (sx - v.offsetX) / v.zoom,
      y: (sy - v.offsetY) / v.zoom,
    }
  }, [])

  const pdfToScreen = useCallback((px, py) => {
    const v = viewRef.current
    return {
      x: px * v.zoom + v.offsetX,
      y: py * v.zoom + v.offsetY,
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
    const proj = (px, py) => ({
      x: px * v.zoom + v.offsetX,
      y: py * v.zoom + v.offsetY,
    })
    const sf = scaleRef.current

    // Draw PDF canvas at current transform
    if (pdfCanvasRef.current) {
      ctx.save()
      ctx.translate(v.offsetX, v.offsetY)
      ctx.scale(v.zoom / 2, v.zoom / 2) // PDF rendered at 2x
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

    // ── Recipe match candidate overlays ──
    const rmCandidates = recipeMatchCandidatesRef.current
    if (rmCandidates?.length) {
      for (const c of rmCandidates) {
        if (c.pageNumber !== pageNum) continue
        const sx = c.x * v.zoom + v.offsetX
        const sy = c.y * v.zoom + v.offsetY
        const bucketColor = c.confidenceBucket === 'high' ? C.accent
          : c.confidenceBucket === 'review' ? C.yellow : C.red
        const r = Math.max(8, 12 * Math.min(v.zoom, 1.5))

        ctx.save()
        // Outer ring
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = bucketColor + (c.accepted ? '40' : '18')
        ctx.fill()
        ctx.lineWidth = c.accepted ? 2.5 : 1.5
        ctx.setLineDash(c.accepted ? [] : [4, 3])
        ctx.strokeStyle = bucketColor
        ctx.stroke()
        ctx.setLineDash([])

        // Inner marker if accepted
        if (c.accepted) {
          ctx.beginPath()
          const cr = r * 0.4
          ctx.moveTo(sx - cr, sy)
          ctx.lineTo(sx + cr, sy)
          ctx.moveTo(sx, sy - cr)
          ctx.lineTo(sx, sy + cr)
          ctx.lineWidth = 2
          ctx.strokeStyle = bucketColor
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    // ── Seed capture rect (Azonosítás mode) ──
    if (seedRectRef.current && activeTool === 'select') {
      const sr = seedRectRef.current
      ctx.save()
      ctx.strokeStyle = C.accent
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(sr.x, sr.y, sr.w, sr.h)
      ctx.fillStyle = 'rgba(0, 229, 160, 0.08)'
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h)
      ctx.restore()
    }
  }, [activeTool, pdfToScreen, screenToPdf, showCableRoutes])

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e) => {
    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const pdf = screenToPdf(sx, sy)

    if (!activeTool || e.button === 1) {
      // Pan mode when no tool active or middle mouse
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOX: viewRef.current.offsetX, startOY: viewRef.current.offsetY }
      return
    }

    if (activeTool === 'select') {
      // Azonosítás mode: start box draw for seed capture
      seedStartRef.current = { x: sx, y: sy }
      seedRectRef.current = null
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

    if (dragRef.current.dragging) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      viewRef.current.offsetX = dragRef.current.startOX + dx
      viewRef.current.offsetY = dragRef.current.startOY + dy
      drawOverlay()
      return
    }

    // Azonosítás mode: live box draw
    if (activeTool === 'select' && seedStartRef.current) {
      const s = seedStartRef.current
      seedRectRef.current = {
        x: Math.min(s.x, sx),
        y: Math.min(s.y, sy),
        w: Math.abs(sx - s.x),
        h: Math.abs(sy - s.y),
      }
      drawOverlay()
      return
    }

    mousePdfRef.current = screenToPdf(sx, sy)
    if (activeTool) drawOverlay()
  }, [activeTool, screenToPdf, drawOverlay])

  // ── Seed capture: extract crop + text hints ──
  const finalizeSeedCapture = useCallback(async (screenRect) => {
    const v = viewRef.current
    // Convert screen rect to PDF coordinate space
    const pdfBbox = {
      x: (screenRect.x - v.offsetX) / v.zoom,
      y: (screenRect.y - v.offsetY) / v.zoom,
      w: screenRect.w / v.zoom,
      h: screenRect.h / v.zoom,
    }

    // Extract crop snapshot from the PDF canvas
    let cropDataUrl = null
    try {
      const pdfCanvas = pdfCanvasRef.current
      if (pdfCanvas) {
        // The PDF canvas uses renderScale, so compute pixel coordinates
        const renderScale = pdfCanvas.width / v.pageWidth
        const cropCanvas = document.createElement('canvas')
        const cw = Math.round(pdfBbox.w * renderScale)
        const ch = Math.round(pdfBbox.h * renderScale)
        if (cw > 2 && ch > 2) {
          cropCanvas.width = Math.min(cw, 256)
          cropCanvas.height = Math.min(ch, 256)
          const ctx = cropCanvas.getContext('2d')
          ctx.drawImage(
            pdfCanvas,
            Math.round(pdfBbox.x * renderScale),
            Math.round(pdfBbox.y * renderScale),
            cw, ch,
            0, 0, cropCanvas.width, cropCanvas.height,
          )
          cropDataUrl = cropCanvas.toDataURL('image/png')
        }
      }
    } catch { /* crop extraction is best-effort */ }

    // Extract text hints from PDF text layer in the bbox region
    let textHints = []
    try {
      if (pdfDocRef.current) {
        const page = await pdfDocRef.current.getPage(pageNum)
        const textContent = await page.getTextContent()
        const vp = page.getViewport({ scale: 1 })
        // pdf.js text items have transform [scaleX, 0, 0, scaleY, x, y]
        for (const item of textContent.items) {
          if (!item.str?.trim()) continue
          const tx = item.transform[4]
          const ty = vp.height - item.transform[5] // flip Y
          if (tx >= pdfBbox.x && tx <= pdfBbox.x + pdfBbox.w &&
              ty >= pdfBbox.y && ty <= pdfBbox.y + pdfBbox.h) {
            textHints.push(item.str.trim())
          }
        }
        textHints = textHints.slice(0, 20) // cap
      }
    } catch { /* text hint extraction is best-effort */ }

    setPendingSeed({
      bbox: pdfBbox,
      pageNum,
      cropDataUrl,
      textHints,
    })
  }, [pageNum])

  // ── Seed save handler: create SymbolRecipe from seed + assignment ──
  const handleSeedSave = useCallback((assemblyId, label, scope) => {
    if (!pendingSeed || !planId) return
    const asm = (assembliesProp || []).find(a => a.id === assemblyId)
    const recipe = createRecipe({
      projectId: projectId || '',
      sourcePlanId: planId,
      sourcePageNumber: pendingSeed.pageNum,
      bbox: pendingSeed.bbox,
      assemblyId,
      assemblyName: asm?.name || '',
      label,
      sourceType: 'unknown',
      seedTextHints: pendingSeed.textHints || [],
      scope,
    })
    saveRecipe(recipe, pendingSeed.cropDataUrl)
    setPendingSeed(null)
    setRecipeCount(getRecipesByPlan(planId).length)
  }, [pendingSeed, planId, projectId, assembliesProp])

  const handleSeedCancel = useCallback(() => {
    setPendingSeed(null)
  }, [])

  // ── Recipe matching handlers ──────────────────────────────────────────────

  const handleRunRecipeMatching = useCallback(async (recipesToRun) => {
    if (!pdfDocRef.current || !planId) return
    const recipes = recipesToRun || getRecipesByPlan(planId)
    if (!recipes.length) return

    setRecipeMatchRunning(true)
    setRecipeMatchPanelOpen(true)
    setRecipeMatchCandidates([])

    try {
      const candidates = await runRecipeMatching(recipes, pdfDocRef.current, planId, {
        currentPage: pageNum,
      })
      setRecipeMatchCandidates(candidates)
    } catch (err) {
      console.error('[RecipeMatching] run failed:', err)
    } finally {
      setRecipeMatchRunning(false)
    }
  }, [planId, pageNum])

  // Run project-wide recipes on this plan (reuse entry point)
  // Uses relevance-sorted recipes for smarter recommendation
  const handleRunProjectRecipes = useCallback(async () => {
    if (!pdfDocRef.current || !projectId) return
    const recipes = getRelevantRecipes(projectId)
    if (!recipes.length) return
    await handleRunRecipeMatching(recipes)
  }, [projectId, handleRunRecipeMatching])

  // ── Recipe list panel handlers ──────────────────────────────────────────
  const refreshRecipeList = useCallback(() => {
    if (projectId) setRecipeListItems(getAllRecipesByProject(projectId))
  }, [projectId])

  const handleOpenRecipeList = useCallback(() => {
    refreshRecipeList()
    setRecipeListOpen(true)
  }, [refreshRecipeList])

  const handleCloseRecipeList = useCallback(() => {
    setRecipeListOpen(false)
    setShowArchivedRecipes(false)
  }, [])

  const handleRunSingleRecipe = useCallback(async (recipe) => {
    setRecipeListOpen(false)
    await handleRunRecipeMatching([recipe])
  }, [handleRunRecipeMatching])

  const handleRunAllFromList = useCallback(async () => {
    setRecipeListOpen(false)
    await handleRunProjectRecipes()
  }, [handleRunProjectRecipes])

  const handleRenameRecipe = useCallback((recipeId, newLabel) => {
    updateRecipe(recipeId, { label: newLabel })
    refreshRecipeList()
  }, [refreshRecipeList])

  const handleDeleteRecipe = useCallback((recipeId) => {
    archiveRecipe(recipeId)
    refreshRecipeList()
    if (planId) setRecipeCount(getRecipesByPlan(planId).length)
  }, [refreshRecipeList, planId])

  const handleRestoreRecipe = useCallback((recipeId) => {
    restoreRecipe(recipeId)
    refreshRecipeList()
    if (planId) setRecipeCount(getRecipesByPlan(planId).length)
  }, [refreshRecipeList, planId])

  const handleScopeToggleRecipe = useCallback((recipeId, newScope) => {
    updateRecipe(recipeId, { scope: newScope })
    refreshRecipeList()
  }, [refreshRecipeList])

  const handleStrictnessChangeRecipe = useCallback((recipeId, newStrictness) => {
    updateRecipe(recipeId, { matchStrictness: newStrictness })
    refreshRecipeList()
  }, [refreshRecipeList])

  const handleAssemblySwapRecipe = useCallback((recipeId, newAssemblyId, newAssemblyName) => {
    updateRecipe(recipeId, { assemblyId: newAssemblyId, assemblyName: newAssemblyName })
    refreshRecipeList()
  }, [refreshRecipeList])

  const handleAcceptAllGreenMatches = useCallback(() => {
    setRecipeMatchCandidates(prev => batchAcceptGreenMatches(prev))
  }, [])

  const handleToggleMatchCandidate = useCallback((candidateId, accepted) => {
    setRecipeMatchCandidates(prev =>
      prev.map(c => c.id === candidateId ? { ...c, accepted } : c)
    )
  }, [])

  const handleApplyRecipeMatches = useCallback(() => {
    const accepted = recipeMatchCandidates.filter(c => c.accepted)
    const rejected = recipeMatchCandidates.filter(c => !c.accepted)
    if (!accepted.length && !rejected.length) return

    if (accepted.length) {
      const newMarkers = accepted.map(c => {
        const fields = recipeToMarkerFields(c, assembliesProp)
        return createMarker(fields)
      })

      // Merge with existing markers (manual-first dedup)
      markersRef.current = deduplicateMarkersManualFirst([...markersRef.current, ...newMarkers])
      markDirty()
      setRenderTick(t => t + 1)
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
    }

    // ── Quality feedback: update per-recipe run stats ──
    const byRecipe = new Map()
    for (const c of recipeMatchCandidates) {
      const rid = c.recipeId
      if (!byRecipe.has(rid)) byRecipe.set(rid, { accepted: 0, rejected: 0, total: 0 })
      const s = byRecipe.get(rid)
      s.total++
      if (c.accepted) s.accepted++
      else s.rejected++
    }
    for (const [rid, stats] of byRecipe) {
      try { updateRecipeRunStats(rid, stats) } catch { /* non-critical */ }
    }

    // Clear match state
    setRecipeMatchCandidates([])
    setRecipeMatchPanelOpen(false)

    // Update recipe count badge
    if (planId) setRecipeCount(getRecipesByPlan(planId).length)
  }, [recipeMatchCandidates, assembliesProp, planId, markDirty])

  const handleDismissRecipeMatches = useCallback(() => {
    setRecipeMatchCandidates([])
    setRecipeMatchPanelOpen(false)
  }, [])

  const handleReuseBannerRun = useCallback(() => {
    setReuseBannerDismissed(true)
    if (planId) dismissReuseBanner(planId)
    handleRunProjectRecipes()
  }, [planId, handleRunProjectRecipes])

  const handleReuseBannerDismiss = useCallback(() => {
    setReuseBannerDismissed(true)
    if (planId) dismissReuseBanner(planId)
  }, [planId])

  const handleFocusMatchCandidate = useCallback((candidate) => {
    // TODO: pan/zoom to candidate location (future enhancement)
    // For now, just switch to the right page
    if (candidate.pageNumber && candidate.pageNumber !== pageNum) {
      setPageNum(candidate.pageNumber)
    }
  }, [pageNum])

  const handleMouseUp = useCallback(() => {
    // Azonosítás mode: finalize box draw → seed capture
    if (activeTool === 'select' && seedStartRef.current && seedRectRef.current) {
      const sr = seedRectRef.current
      if (sr.w > 10 && sr.h > 10) {
        // Valid box draw — extract seed data
        finalizeSeedCapture(sr)
      }
      seedStartRef.current = null
      seedRectRef.current = null
      drawOverlay()
    }
    dragRef.current.dragging = false
  }, [activeTool, finalizeSeedCapture, drawOverlay])

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
  }, [drawOverlay])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const h = (e) => {
      if (calibDialog) return
      if (e.key === 'Escape') { setActiveTool(null); activeStartRef.current = null; setPendingSeed(null); seedStartRef.current = null; seedRectRef.current = null; drawOverlay() }
      if (e.key === 'i' || e.key === 'I') setActiveTool(t => t === 'select' ? null : 'select')
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
        onZoomIn={() => { viewRef.current.zoom *= 1.2; drawOverlay() }}
        onZoomOut={() => { viewRef.current.zoom /= 1.2; drawOverlay() }}
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
        recipeCount={recipeCount}
        onRunRecipeMatching={() => handleRunRecipeMatching()}
        onRunProjectRecipes={handleRunProjectRecipes}
        recipeMatchRunning={recipeMatchRunning}
        hasProjectRecipes={projectId ? getRelevantRecipes(projectId).length > 0 : false}
        onOpenRecipeList={handleOpenRecipeList}
        recipeListOpen={recipeListOpen}
      />

      {/* Main area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden', borderRadius: '0 0 10px 10px', cursor: activeTool ? 'crosshair' : 'grab' }}>
        {/* Hidden PDF render canvas */}
        <canvas ref={pdfCanvasRef} style={{ display: 'none' }} />

        {/* Visible overlay canvas (draws PDF + annotations) */}
        <canvas
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
          <div style={{
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

        {/* Seed assignment panel (Azonosítás mode) */}
        {pendingSeed && (
          <SeedAssignPanel
            seed={pendingSeed}
            assemblies={assembliesProp}
            onSave={handleSeedSave}
            onCancel={handleSeedCancel}
          />
        )}

        {/* Recipe match review panel */}
        {recipeMatchPanelOpen && (
          <RecipeMatchReviewPanel
            candidates={recipeMatchCandidates}
            onAcceptAllGreen={handleAcceptAllGreenMatches}
            onToggleCandidate={handleToggleMatchCandidate}
            onApply={handleApplyRecipeMatches}
            onDismiss={handleDismissRecipeMatches}
            onFocusCandidate={handleFocusMatchCandidate}
            isRunning={recipeMatchRunning}
            assemblies={assembliesProp}
          />
        )}

        {/* Recipe list / management panel */}
        {recipeListOpen && (
          <RecipeListPanel
            recipes={recipeListItems}
            assemblies={assembliesProp}
            onRun={handleRunSingleRecipe}
            onRunAll={handleRunAllFromList}
            onRename={handleRenameRecipe}
            onDelete={handleDeleteRecipe}
            onRestore={handleRestoreRecipe}
            onScopeToggle={handleScopeToggleRecipe}
            onStrictnessChange={handleStrictnessChangeRecipe}
            onAssemblySwap={handleAssemblySwapRecipe}
            onClose={handleCloseRecipeList}
            isRunning={recipeMatchRunning}
            showArchived={showArchivedRecipes}
            onToggleArchived={() => setShowArchivedRecipes(prev => !prev)}
          />
        )}

        {/* Reuse banner — project recipes available for new plan */}
        <ReuseBanner
          recipeCount={projectRecipeCount}
          onRun={handleReuseBannerRun}
          onDismiss={handleReuseBannerDismiss}
          visible={showReuseBanner}
        />

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
  assemblies, recipeCount,
  onRunRecipeMatching, onRunProjectRecipes, recipeMatchRunning, hasProjectRecipes,
  onOpenRecipeList, recipeListOpen,
}) {
  const TOOLS = [
    { id: 'select', label: 'Azonosítás', key: 'I' },
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

      {/* Tool buttons — Azonosítás primary, others secondary */}
      {TOOLS.map(t => {
        const on = activeTool === t.id
        const isPrimary = t.id === 'select'
        return (
          <button key={t.id} onClick={() => onToolChange(on ? null : t.id)} title={`${t.label} (${t.key})`} style={{
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
            fontSize: isPrimary ? 12 : 11, fontFamily: 'Syne', fontWeight: isPrimary ? 700 : 600,
            display: 'flex', alignItems: 'center', gap: 5,
            background: on ? 'rgba(0,229,160,0.12)' : 'transparent',
            border: `1px solid ${on ? 'rgba(0,229,160,0.3)' : 'transparent'}`,
            color: on ? C.accent : isPrimary ? C.text : C.textSub,
            transition: 'all 0.12s',
          }}>
            {t.label}
            {t.id === 'select' && recipeCount > 0 && <span style={{ background: C.blue, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{recipeCount}</span>}
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

      {/* Azonosítás context area — empty state hint OR recipe run buttons */}
      {activeTool === 'select' && recipeCount === 0 && !hasProjectRecipes && (
        <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted, marginLeft: 8, userSelect: 'none' }}>
          Jelölj ki egy szimbólumot a terven ▸
        </span>
      )}
      {activeTool === 'select' && recipeCount === 0 && hasProjectRecipes && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted }}>Nincs terv-minta</span>
          <button onClick={onRunProjectRecipes} disabled={recipeMatchRunning} title="Projekt minták futtatása ezen a terven" style={{
            padding: '4px 10px', borderRadius: 6, cursor: recipeMatchRunning ? 'wait' : 'pointer',
            fontSize: 11, fontFamily: 'Syne', fontWeight: 700,
            background: 'rgba(0,229,160,0.10)', border: `1px solid rgba(0,229,160,0.25)`,
            color: C.accent, opacity: recipeMatchRunning ? 0.5 : 1, transition: 'all 0.12s',
          }}>
            {recipeMatchRunning ? 'Keresés...' : 'Projekt minták futtatása'}
          </button>
        </div>
      )}
      {activeTool === 'select' && recipeCount > 0 && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          <button onClick={onRunRecipeMatching} disabled={recipeMatchRunning} title="Mentett minták futtatása ezen az oldalon" style={{
            padding: '4px 10px', borderRadius: 6, cursor: recipeMatchRunning ? 'wait' : 'pointer',
            fontSize: 11, fontFamily: 'Syne', fontWeight: 700,
            background: 'rgba(0,229,160,0.10)', border: `1px solid rgba(0,229,160,0.25)`,
            color: C.accent, opacity: recipeMatchRunning ? 0.5 : 1, transition: 'all 0.12s',
          }}>
            {recipeMatchRunning ? 'Keresés...' : 'Minták futtatása'}
          </button>
          {hasProjectRecipes && (
            <button onClick={onRunProjectRecipes} disabled={recipeMatchRunning} title="Összes projekt minta futtatása" style={{
              padding: '4px 10px', borderRadius: 6, cursor: recipeMatchRunning ? 'wait' : 'pointer',
              fontSize: 11, fontFamily: 'DM Mono', fontWeight: 600,
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.muted, opacity: recipeMatchRunning ? 0.5 : 1, transition: 'all 0.12s',
            }}>
              Projekt minták
            </button>
          )}
        </div>
      )}

      {/* Projekt minták button — always visible when project has recipes */}
      {hasProjectRecipes && (
        <button onClick={onOpenRecipeList} title="Projekt minták kezelése" style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
          fontSize: 11, fontFamily: 'Syne', fontWeight: 700, marginLeft: 4,
          background: recipeListOpen ? 'rgba(76,201,240,0.12)' : 'transparent',
          border: `1px solid ${recipeListOpen ? 'rgba(76,201,240,0.3)' : C.border}`,
          color: recipeListOpen ? C.blue : C.muted,
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'all 0.12s',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
          Minták
        </button>
      )}

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
