import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import * as three from 'three'
import DxfViewerCanvas from './DxfViewerCanvas.jsx'
import DxfToolbar, { COUNT_CATEGORIES } from './DxfToolbar.jsx'
import DxfLayerPanel from './DxfLayerPanel.jsx'
import EstimationPanel from '../EstimationPanel.jsx'
import { savePlanAnnotations, getPlanAnnotations, onAnnotationsChanged } from '../../data/planStore.js'
import { createMarker, normalizeMarkers, deduplicateMarkersManualFirst } from '../../utils/markerModel.js'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

function formatDist(m) {
  if (m < 0.01) return `${(m * 1000).toFixed(1)} mm`
  if (m < 1) return `${(m * 100).toFixed(1)} cm`
  if (m < 100) return `${m.toFixed(2)} m`
  return `${m.toFixed(1)} m`
}

// ═══════════════════════════════════════════════════════════════════════════
// DxfViewerPanel — Enterprise DXF viewer with measurement, counting, scale
// ═══════════════════════════════════════════════════════════════════════════
const DxfViewerPanel = forwardRef(function DxfViewerPanel({ file, unitFactor, unitName, style, compact = false, planId, onCreateQuote, onCableData, onMeasurementsChange, onMarkersChange, focusTarget, assemblies: assembliesProp }, ref) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const containerRef = useRef(null)

  // Stable callback ref — prevents infinite re-render loop when parent passes
  // inline onCableData (new reference each render → useEffect re-fires → setState → re-render → …)
  const onCableDataRef = useRef(onCableData)
  useEffect(() => { onCableDataRef.current = onCableData })
  const onMeasurementsChangeRef = useRef(onMeasurementsChange)
  useEffect(() => { onMeasurementsChangeRef.current = onMeasurementsChange })
  const onMarkersChangeRef = useRef(onMarkersChange)
  useEffect(() => { onMarkersChangeRef.current = onMarkersChange })

  // Notify parent of measurement changes (with calibrated distances)
  const notifyMeasurements = useCallback(() => {
    const cb = onMeasurementsChangeRef.current
    if (!cb) return
    const enriched = measuresRef.current.map(seg => ({
      ...seg,
      dist: seg.distance / (scaleRef.current?.factor || 1), // raw pixel dist for compat
      distMeters: seg.distance, // already in meters
    }))
    cb(enriched)
  }, [])

  // Expose inner DxfViewerCanvas imperative API so parents (e.g. DxfBlockOverlay) can use
  // sceneToScreen, getViewer, subscribe, etc. through the forwarded ref.
  useImperativeHandle(ref, () => ({
    getViewer: () => canvasRef.current?.getViewer?.(),
    sceneToScreen: (sx, sy) => canvasRef.current?.sceneToScreen?.(sx, sy),
    screenToScene: (sx, sy) => canvasRef.current?.screenToScene?.(sx, sy),
    subscribe: (event, handler) => canvasRef.current?.subscribe?.(event, handler),
    getLayers: (nonEmpty) => canvasRef.current?.getLayers?.(nonEmpty),
    showLayer: (name, show) => canvasRef.current?.showLayer?.(name, show),
    fitView: () => canvasRef.current?.fitView?.(),
    getOrigin: () => canvasRef.current?.getOrigin?.(),
    getBounds: () => canvasRef.current?.getBounds?.(),
    getCamera: () => canvasRef.current?.getCamera?.(),
    getRendererElement: () => canvasRef.current?.getRendererElement?.(),
  }))

  // ── UI State ──
  const [activeTool, setActiveTool] = useState(null)
  // Assembly-first: default to first assembly ID if available, fallback to 'socket'
  const [activeCategory, setActiveCategory] = useState(() => {
    const mainAsms = (assembliesProp || []).filter(a => !a.variantOf)
    return mainAsms.length > 0 ? mainAsms[0].id : 'socket'
  })
  const [layers, setLayers] = useState([])
  const [layerVisibility, setLayerVisibility] = useState({})
  const [layersPanelOpen, setLayersPanelOpen] = useState(false)
  const [countPanelOpen, setCountPanelOpen] = useState(false)
  const [estimationOpen, setEstimationOpen] = useState(false)
  const [renderTick, setRenderTick] = useState(0) // force re-render for counts
  const [ceilingHeight, setCeilingHeight] = useState(3.0)
  const [switchHeight, setSwitchHeight] = useState(1.2)
  const [socketHeight, setSocketHeight] = useState(0.3)
  const [showCableRoutes, setShowCableRoutes] = useState(false)
  const showCableRoutesRef = useRef(false)
  useEffect(() => { showCableRoutesRef.current = showCableRoutes }, [showCableRoutes])

  // ── Scale calibration ──
  const [scale, setScale] = useState({
    factor: unitFactor || null,
    unitName: unitName || 'auto',
    calibrated: false,
  })
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])

  // ── Calibration dialog ──
  const [calibDialog, setCalibDialog] = useState(null) // { sceneDistance, x1, y1, x2, y2 }
  const [calibInput, setCalibInput] = useState('')
  const [calibUnit, setCalibUnit] = useState('m')

  // ── Scene-coordinate data (refs for Canvas2D performance) ──
  const markersRef = useRef([])   // [{x, y, category, color}]
  const measuresRef = useRef([])  // [{x1,y1,x2,y2,distance,label}]
  const activeStartRef = useRef(null) // {x,y} first click of measure/calibrate
  const mouseSceneRef = useRef(null)  // {x,y} current mouse in scene coords
  const mouseScreenRef = useRef(null) // {x,y} current mouse in screen coords
  const activeToolRef = useRef(null)
  const highlightRef = useRef(null) // { x, y, startTime } for focus pulse animation
  const hydratedRef = useRef(false) // true once async annotation restore completes
  const debounceSaveTimerRef = useRef(null)
  const saveStateTimerRef = useRef(null)
  const [saveState, setSaveState] = useState('clean')
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])

  // ── Debounced auto-save: persist annotations 2s after last change ──
  const debouncedSave = useCallback(() => {
    if (!planId || !hydratedRef.current) return
    setSaveState('dirty')
    if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current)
    if (debounceSaveTimerRef.current) clearTimeout(debounceSaveTimerRef.current)
    debounceSaveTimerRef.current = setTimeout(() => {
      getPlanAnnotations(planId).then(stored => {
        savePlanAnnotations(planId, {
          ...stored,
          markers: markersRef.current,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight, switchHeight, socketHeight,
        }, { silent: true })
        setSaveState('saved')
        if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current)
        saveStateTimerRef.current = setTimeout(() => setSaveState('clean'), 3000)
      }).catch(() => {})
    }, 2000)
  }, [planId, ceilingHeight, switchHeight, socketHeight])

  // ── Load saved annotations on mount ──
  useEffect(() => {
    if (!planId) return
    hydratedRef.current = false // reset — auto-save guard active until restore finishes
    getPlanAnnotations(planId).then(ann => {
      if (ann.markers?.length) { markersRef.current = normalizeMarkers(ann.markers); setRenderTick(t => t + 1) }
      if (ann.measurements?.length) { measuresRef.current = ann.measurements; notifyMeasurements() }
      if (ann.scale?.calibrated) { setScale(ann.scale) }
      if (ann.ceilingHeight) setCeilingHeight(ann.ceilingHeight)
      if (ann.switchHeight) setSwitchHeight(ann.switchHeight)
      if (ann.socketHeight) setSocketHeight(ann.socketHeight)
      hydratedRef.current = true // annotation restore complete — auto-save now safe
    }).catch(() => {
      // Load failed (corrupt IDB, etc.) — nothing stored to protect,
      // so unblock auto-save to preserve any markers placed this session.
      hydratedRef.current = true
    })
  }, [planId])

  // ── Subscribe to external annotation changes (e.g. DetectionReviewPanel apply) ──
  useEffect(() => {
    if (!planId) return
    const unsub = onAnnotationsChanged(planId, ({ markers }) => {
      markersRef.current = normalizeMarkers(markers)
      setRenderTick(t => t + 1)
    })
    return unsub
  }, [planId])

  // ── Focus on target marker (from review panel locate) ──
  useEffect(() => {
    if (!focusTarget || !focusTarget.x || !focusTarget.y) return
    const viewer = canvasRef.current?.getViewer()
    if (!viewer?.camera) return
    const cam = viewer.camera
    // Center camera on target scene coordinates
    const viewWidth = (cam.right - cam.left)
    const viewHeight = (cam.top - cam.bottom)
    // Zoom in to ~30% of current view if too wide
    const targetSpan = Math.min(viewWidth, viewHeight, 500)
    cam.left = focusTarget.x - targetSpan / 2
    cam.right = focusTarget.x + targetSpan / 2
    cam.top = focusTarget.y + targetSpan / 2 * (viewHeight / viewWidth || 1)
    cam.bottom = focusTarget.y - targetSpan / 2 * (viewHeight / viewWidth || 1)
    cam.updateProjectionMatrix()
    // Start highlight pulse
    highlightRef.current = { x: focusTarget.x, y: focusTarget.y, startTime: Date.now() }
    // Auto-clear highlight after 2s
    const timer = setTimeout(() => { highlightRef.current = null }, 2000)
    return () => clearTimeout(timer)
  }, [focusTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save annotations on unmount ──
  // SAFETY: Merge with store to avoid overwriting externally-applied detection markers.
  // GUARD: Skip auto-save if annotations were never hydrated from IDB. This prevents
  // fast mount/unmount from writing empty markers over stored data.
  useEffect(() => {
    return () => {
      // Cancel any pending debounced save — we'll save immediately here
      if (debounceSaveTimerRef.current) clearTimeout(debounceSaveTimerRef.current)
      if (!planId) return
      if (!hydratedRef.current) return // not yet hydrated — don't overwrite IDB
      const localMarkers = markersRef.current
      getPlanAnnotations(planId).then(stored => {
        const storedMarkers = normalizeMarkers(stored?.markers || [])
        const localIds = new Set(localMarkers.map(m => m.id))
        const externalDetections = storedMarkers.filter(m => {
          if (m.source !== 'detection') return false
          if (localIds.has(m.id)) return false
          const tooClose = localMarkers.some(lm =>
            lm.category === m.category &&
            Math.hypot(lm.x - m.x, lm.y - m.y) < 15
          )
          return !tooClose
        })
        // Append without re-deduplicating local markers — their positions are authoritative
        const merged = [...localMarkers, ...externalDetections]
        savePlanAnnotations(planId, {
          ...stored,  // preserve cableReviewed, referencePanels, etc.
          markers: merged,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight,
          switchHeight,
          socketHeight,
        }, { silent: true })
      }).catch(() => {
        savePlanAnnotations(planId, {
          markers: localMarkers,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight,
          switchHeight,
          socketHeight,
        }, { silent: true })
      })
    }
  }, [planId, ceilingHeight, socketHeight])

  // ── Report cable data to parent when markers/scale change ──
  // Mirrors the PdfViewer onCableData pattern: Manhattan distance from panel to each device.
  useEffect(() => {
    const cb = onCableDataRef.current
    if (!cb) return
    const markers = markersRef.current
    const sf = scaleRef.current
    if (!markers.length || !sf.calibrated || !sf.factor) {
      cb(null)
      return
    }
    const panel = markers.find(m => m.category === 'panel')
    if (!panel) { cb(null); return }

    const ROUTING_FACTOR = 1.25
    let lightM = 0, socketM = 0, switchM = 0, dataM = 0, fireM = 0, otherM = 0
    let lightN = 0, socketN = 0, switchN = 0, dataN = 0, fireN = 0, otherN = 0

    for (const m of markers) {
      if (m.category === 'panel') continue
      const catDef = COUNT_CATEGORIES.find(c => c.key === m.category)
      if (catDef?.isCableTray) continue
      if (m.category === 'junction' || m.category === 'other') continue

      const dist = (Math.abs(m.x - panel.x) + Math.abs(m.y - panel.y)) * sf.factor * ROUTING_FACTOR
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
    })
  // onCableData accessed via stable ref — no dep needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick, scale])

  // ── Report marker changes to parent (mirrors PdfViewer onMarkersChange) ──
  useEffect(() => {
    if (onMarkersChangeRef.current) {
      onMarkersChangeRef.current([...markersRef.current])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick])

  // ── Coordinate projection helper ──
  const project = useCallback((sx, sy) => {
    const viewer = canvasRef.current?.getViewer()
    if (!viewer?.camera || !viewer?.renderer) return null
    const camera = viewer.camera
    const canvas = viewer.renderer.domElement
    const vec = new three.Vector3(sx, sy, 0)
    vec.project(camera)
    return {
      x: (vec.x + 1) / 2 * canvas.clientWidth,
      y: (-vec.y + 1) / 2 * canvas.clientHeight,
    }
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // Canvas2D overlay — RAF drawing loop
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    let running = true

    function draw() {
      if (!running) return
      const canvas = overlayRef.current
      if (!canvas) { requestAnimationFrame(draw); return }
      const viewer = canvasRef.current?.getViewer()
      if (!viewer?.camera || !viewer?.renderer) { requestAnimationFrame(draw); return }

      const cam = viewer.camera
      const gl = viewer.renderer.domElement
      const w = gl.clientWidth
      const h = gl.clientHeight
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, w, h)

      const proj = (sx, sy) => {
        const v = new three.Vector3(sx, sy, 0)
        v.project(cam)
        return { x: (v.x + 1) / 2 * w, y: (-v.y + 1) / 2 * h }
      }

      const scaleFactor = scaleRef.current?.factor || 0.001

      // ── Completed measurements ──
      for (const m of measuresRef.current) {
        const p1 = proj(m.x1, m.y1)
        const p2 = proj(m.x2, m.y2)
        drawMeasureLine(ctx, p1, p2, m.label, false)
      }

      // ── Active measurement / calibration line ──
      const aStart = activeStartRef.current
      const aMouse = mouseSceneRef.current
      const aTool = activeToolRef.current
      if (aStart && aMouse && (aTool === 'measure' || aTool === 'calibrate')) {
        const p1 = proj(aStart.x, aStart.y)
        const p2 = proj(aMouse.x, aMouse.y)
        const dx = aMouse.x - aStart.x
        const dy = aMouse.y - aStart.y
        const rawDist = Math.sqrt(dx * dx + dy * dy)
        const label = aTool === 'calibrate'
          ? `${rawDist.toFixed(1)} egys.`
          : formatDist(rawDist * scaleFactor)
        drawMeasureLine(ctx, p1, p2, label, true)
      }

      // ── Cable routes (Manhattan L-shaped lines from panel to each device) ──
      const markers = markersRef.current
      if (showCableRoutesRef.current) {
        const panel = markers.find(m => m.category === 'panel')
        if (panel) {
          const pp = proj(panel.x, panel.y)
          for (const m of markers) {
            if (m.category === 'panel') continue
            // Match PDF overlay filters: skip cable trays, junction, other
            const mCatDef = COUNT_CATEGORIES.find(c => c.key === m.category)
            if (mCatDef?.isCableTray) continue
            if (m.category === 'junction' || m.category === 'other') continue
            const mp = proj(m.x, m.y)
            // Draw L-shaped Manhattan route: horizontal first, then vertical
            const midX = mp.x
            const midY = pp.y
            ctx.save()
            ctx.strokeStyle = m.color + '60'
            ctx.lineWidth = 1.5
            ctx.setLineDash([6, 4])
            ctx.beginPath()
            ctx.moveTo(pp.x, pp.y)
            ctx.lineTo(midX, midY)
            ctx.lineTo(mp.x, mp.y)
            ctx.stroke()
            ctx.restore()
          }
        }
      }

      // ── Count markers ──
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i]
        const p = proj(m.x, m.y)
        drawMarker(ctx, p.x, p.y, i + 1, m.color, m.source)
      }

      // ── Focus highlight pulse ──
      if (highlightRef.current) {
        const h = highlightRef.current
        const hp = proj(h.x, h.y)
        const elapsed = Date.now() - h.startTime
        const progress = Math.min(elapsed / 2000, 1)
        const alpha = 1 - progress
        const pulseR = 18 + progress * 30
        ctx.save()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, pulseR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0, 229, 160, ${alpha})`
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, 14, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0, 229, 160, ${alpha * 0.7})`
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      // ── Crosshair ──
      const ms = mouseScreenRef.current
      if (aTool && ms) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 0.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(ms.x, 0); ctx.lineTo(ms.x, h)
        ctx.moveTo(0, ms.y); ctx.lineTo(w, ms.y)
        ctx.stroke()
        ctx.restore()

        // Coordinate display
        if (aMouse) {
          const coordText = `X: ${aMouse.x.toFixed(1)}  Y: ${aMouse.y.toFixed(1)}`
          ctx.save()
          ctx.font = '10px "DM Mono", monospace'
          const tw = ctx.measureText(coordText).width
          const cx = Math.min(ms.x + 14, w - tw - 12)
          const cy = Math.max(ms.y - 10, 20)
          ctx.fillStyle = 'rgba(9,9,11,0.85)'
          ctx.beginPath()
          ctx.roundRect(cx - 4, cy - 11, tw + 8, 16, 3)
          ctx.fill()
          ctx.fillStyle = '#9CA3AF'
          ctx.fillText(coordText, cx, cy)
          ctx.restore()
        }
      }

      requestAnimationFrame(draw)
    }

    requestAnimationFrame(draw)
    return () => { running = false }
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // Event handlers
  // ═══════════════════════════════════════════════════════════════

  const handleLoad = useCallback((info) => {
    setLayers(info.layers || [])
    const vis = {}
    for (const l of info.layers || []) vis[l.name] = true
    setLayerVisibility(vis)
  }, [])

  const handlePointerDown = useCallback((event) => {
    const tool = activeToolRef.current
    if (!tool || !event.position) return

    const sx = event.position.x
    const sy = event.position.y

    if (tool === 'count') {
      // Assembly-first: resolve assembly for color + asmId, fallback to category
      const asm = (assembliesProp || []).find(a => a.id === activeCategory)
      const _ASM_COLORS = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
      const SPECIAL_COLORS = { 'panel': '#FF6B6B', 'junction': '#4CC9F0', 'other': '#71717A' }
      const color = asm
        ? (_ASM_COLORS[asm.category] || '#9CA3AF')
        : (SPECIAL_COLORS[activeCategory] || (COUNT_CATEGORIES.find(c => c.key === activeCategory)?.color) || '#9CA3AF')
      markersRef.current = [...markersRef.current, createMarker({
        x: sx, y: sy, category: activeCategory, color,
        asmId: asm ? asm.id : null, source: 'manual',
      })]
      setRenderTick(t => t + 1)
      debouncedSave()
    }

    if (tool === 'measure') {
      if (!activeStartRef.current) {
        activeStartRef.current = { x: sx, y: sy }
      } else {
        const start = activeStartRef.current
        const dx = sx - start.x, dy = sy - start.y
        const rawDist = Math.sqrt(dx * dx + dy * dy)
        const factor = scaleRef.current?.factor || 0.001
        const distM = rawDist * factor
        measuresRef.current = [...measuresRef.current, {
          x1: start.x, y1: start.y, x2: sx, y2: sy,
          distance: distM, label: formatDist(distM),
          category: activeCategory || undefined,
        }]
        activeStartRef.current = null
        notifyMeasurements()
        setRenderTick(t => t + 1)
        debouncedSave()
      }
    }

    if (tool === 'calibrate') {
      if (!activeStartRef.current) {
        activeStartRef.current = { x: sx, y: sy }
      } else {
        const start = activeStartRef.current
        const dx = sx - start.x, dy = sy - start.y
        const rawDist = Math.sqrt(dx * dx + dy * dy)
        setCalibDialog({ sceneDistance: rawDist, x1: start.x, y1: start.y, x2: sx, y2: sy })
        activeStartRef.current = null
      }
    }

    if (tool === 'select') {
      // No-op for now; coordinate display is via crosshair
    }
  }, [activeCategory])

  const handlePointerMove = useCallback((e) => {
    mouseSceneRef.current = { x: e.sceneX, y: e.sceneY }
    mouseScreenRef.current = { x: e.screenX, y: e.screenY }
  }, [])

  // ── Layer controls ──
  const handleToggleLayer = useCallback((name) => {
    setLayerVisibility(prev => {
      const next = { ...prev, [name]: !prev[name] }
      canvasRef.current?.showLayer(name, next[name])
      return next
    })
  }, [])
  const handleShowAll = useCallback(() => {
    const next = {}
    for (const l of layers) { next[l.name] = true; canvasRef.current?.showLayer(l.name, true) }
    setLayerVisibility(next)
  }, [layers])
  const handleHideAll = useCallback(() => {
    const next = {}
    for (const l of layers) { next[l.name] = false; canvasRef.current?.showLayer(l.name, false) }
    setLayerVisibility(next)
  }, [layers])

  // ── Tool controls ──
  const handleToolChange = useCallback((tool) => {
    setActiveTool(tool)
    activeStartRef.current = null
  }, [])

  const handleFitView = useCallback(() => { canvasRef.current?.fitView() }, [])

  const handleZoomIn = useCallback(() => {
    const viewer = canvasRef.current?.getViewer()
    if (viewer?.camera) {
      const cam = viewer.camera
      const f = 0.75
      if (Math.abs(cam.right - cam.left) * f < 0.01) return // prevent degenerate frustum
      cam.left *= f; cam.right *= f; cam.top *= f; cam.bottom *= f
      cam.updateProjectionMatrix()
      viewer.Render()
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    const viewer = canvasRef.current?.getViewer()
    if (viewer?.camera) {
      const cam = viewer.camera
      const f = 1.33
      if (Math.abs(cam.right - cam.left) * f > 1e8) return // prevent precision loss
      cam.left *= f; cam.right *= f; cam.top *= f; cam.bottom *= f
      cam.updateProjectionMatrix()
      viewer.Render()
    }
  }, [])

  const handleUndo = useCallback(() => {
    if (activeTool === 'count' && markersRef.current.length > 0) {
      markersRef.current = markersRef.current.slice(0, -1)
      setRenderTick(t => t + 1)
      debouncedSave()
    }
    if (activeTool === 'measure' && measuresRef.current.length > 0) {
      measuresRef.current = measuresRef.current.slice(0, -1)
      notifyMeasurements()
      setRenderTick(t => t + 1)
      debouncedSave()
    }
  }, [activeTool, notifyMeasurements, debouncedSave])

  const handleClearAll = useCallback(() => {
    if (activeTool === 'count') markersRef.current = []
    if (activeTool === 'measure') { measuresRef.current = []; notifyMeasurements() }
    activeStartRef.current = null
    setRenderTick(t => t + 1)
    debouncedSave()
  }, [activeTool, debouncedSave])

  // ── Scale calibration submit ──
  const handleCalibSubmit = useCallback(() => {
    if (!calibDialog || !calibInput) return
    const realDist = parseFloat(calibInput)
    if (isNaN(realDist) || realDist <= 0) return

    const multiplier = calibUnit === 'mm' ? 0.001 : calibUnit === 'cm' ? 0.01 : 1.0
    const realM = realDist * multiplier
    const factor = realM / calibDialog.sceneDistance

    setScale({ factor, unitName: `${realDist} ${calibUnit} = kalibrált`, calibrated: true })
    setCalibDialog(null)
    setCalibInput('')
    setActiveTool(null)

    // Re-label existing measurements with new factor
    measuresRef.current = measuresRef.current.map(m => {
      const dx = m.x2 - m.x1, dy = m.y2 - m.y1
      const rawDist = Math.sqrt(dx * dx + dy * dy)
      const distM = rawDist * factor
      return { ...m, distance: distM, label: formatDist(distM) }
    })
    notifyMeasurements()
    setRenderTick(t => t + 1)
  }, [calibDialog, calibInput, calibUnit, notifyMeasurements])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'i' || e.key === 'I') handleToolChange(activeTool === 'select' ? null : 'select')
      if (e.key === 'c' || e.key === 'C') handleToolChange(activeTool === 'count' ? null : 'count')
      if (e.key === 'm' || e.key === 'M') handleToolChange(activeTool === 'measure' ? null : 'measure')
      if (e.key === 's' || e.key === 'S') handleToolChange(activeTool === 'calibrate' ? null : 'calibrate')
      if (e.key === 'Escape') { handleToolChange(null); setCalibDialog(null) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTool, handleToolChange, handleUndo])

  // ── Count summary data ──
  const countSummary = {}
  for (const m of markersRef.current) {
    countSummary[m.category] = (countSummary[m.category] || 0) + 1
  }

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  if (!file) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: compact ? 200 : 400,
        background: C.bgCard, borderRadius: 8, border: `1px solid ${C.border}`, ...style,
      }}>
        <div style={{ textAlign: 'center', color: C.muted }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1.4" strokeLinecap="round" style={{ marginBottom: 8 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <div style={{ fontSize: 13, fontFamily: 'Syne' }}>Nincs tervrajz betöltve</div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: compact ? 300 : 500,
      background: C.bgCard, borderRadius: 8,
      border: `1px solid ${C.border}`, overflow: 'hidden',
      position: 'relative', ...style,
    }}>
      {/* ── Toolbar ── */}
      <DxfToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToggleLayers={() => setLayersPanelOpen(p => !p)}
        layersPanelOpen={layersPanelOpen}
        onToggleCountPanel={() => setCountPanelOpen(p => !p)}
        countPanelOpen={countPanelOpen}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        assemblies={assembliesProp}
        scale={scale}
        markerCount={markersRef.current.length}
        measureCount={measuresRef.current.length}
        onUndo={handleUndo}
        onClearAll={handleClearAll}
        saveState={saveState}
      />

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DxfViewerCanvas
          ref={canvasRef}
          file={file}
          onLoad={handleLoad}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        />

        {/* Canvas2D overlay — positioned exactly on top of WebGL canvas */}
        <canvas
          ref={overlayRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 4,
          }}
        />

        {/* ── Layer panel ── */}
        {layersPanelOpen && (
          <DxfLayerPanel
            layers={layers}
            layerVisibility={layerVisibility}
            onToggleLayer={handleToggleLayer}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
          />
        )}

        {/* ── Count summary panel ── */}
        {countPanelOpen && markersRef.current.length > 0 && (
          <div style={{
            position: 'absolute', left: 8, top: 8, width: 200,
            background: 'rgba(17,17,19,0.95)', border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 12, zIndex: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent, marginBottom: 10 }}>
              Számláló összesítő
            </div>
            {Object.keys(countSummary).map(key => {
              const asm = (assembliesProp || []).find(a => a.id === key)
              const cat = COUNT_CATEGORIES.find(c => c.key === key)
              const ASM_COLORS_MAP = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B' }
              const label = asm?.name || cat?.label || key
              const color = asm ? (ASM_COLORS_MAP[asm.category] || '#9CA3AF') : (cat?.color || '#9CA3AF')
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>{label}</span>
                  </div>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color }}>
                    {countSummary[key]}
                  </span>
                </div>
              )
            })}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 0 0', marginTop: 4,
            }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>Összesen</span>
              <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.accent }}>
                {markersRef.current.length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Calibration dialog ── */}
      {calibDialog && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setCalibDialog(null)}>
          <div style={{
            background: '#111113', border: `1px solid ${C.border}`, borderRadius: 14,
            padding: 24, width: 320, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 4 }}>
              Skála kalibrálás
            </h3>
            <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
              A kijelölt vonal {calibDialog.sceneDistance.toFixed(1)} rajzegység hosszú.
              Add meg a valós távolságot.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                autoFocus
                type="number"
                value={calibInput}
                onChange={e => setCalibInput(e.target.value)}
                placeholder="pl. 5.0"
                onKeyDown={e => { if (e.key === 'Enter') handleCalibSubmit() }}
                style={{
                  flex: 1, background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '9px 12px', color: C.text,
                  fontFamily: 'DM Mono', fontSize: 14, outline: 'none',
                }}
              />
              <select
                value={calibUnit}
                onChange={e => setCalibUnit(e.target.value)}
                style={{
                  background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '9px 10px', color: C.text,
                  fontFamily: 'DM Mono', fontSize: 13, outline: 'none',
                }}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCalibDialog(null)} style={dialogBtn('#71717A')}>Mégse</button>
              <button onClick={handleCalibSubmit} style={dialogBtn(C.accent)}>Alkalmaz</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Status bar ── */}
      <div style={{
        padding: '4px 12px', borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10, fontFamily: 'DM Mono', color: C.muted,
      }}>
        <span>
          {activeTool === 'count'
            ? `Számlálás: ${markersRef.current.length} db  •  ${(assembliesProp || []).find(a => a.id === activeCategory)?.name || COUNT_CATEGORIES.find(c => c.key === activeCategory)?.label || activeCategory}  •  Jobb klikk = törlés`
            : activeTool === 'measure'
            ? activeStartRef.current
              ? 'Kattints a végpontra a mérés lezárásához'
              : `Mérés: ${measuresRef.current.length} db  •  Kattints a kezdőpontra`
            : activeTool === 'calibrate'
            ? activeStartRef.current
              ? 'Kattints a végpontra – válassz ismert távolságot'
              : 'Húzz egy vonalat egy ismert távolságra (pl. falméret)'
            : activeTool === 'select'
            ? 'Mozgasd az egeret a koordináták megtekintéséhez'
            : `${layers.length} réteg  •  Billentyűk: I C M S  •  Görgő: zoom  •  Húzás: mozgatás`
          }
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {scale.calibrated && (
            <span style={{ color: C.blue }}>Skála ✓</span>
          )}
          {markersRef.current.length > 0 && (
            <>
              <button onClick={() => setShowCableRoutes(p => !p)} style={{
                padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10,
                fontFamily: 'DM Mono', fontWeight: 600,
                background: showCableRoutes ? C.yellow + '20' : 'transparent',
                border: `1px solid ${showCableRoutes ? C.yellow + '60' : C.border}`,
                color: showCableRoutes ? C.yellow : C.muted,
              }}>
                {showCableRoutes ? 'Kábelvonalak ✓' : 'Kábelvonalak'}
              </button>
              <button onClick={() => setEstimationOpen(p => !p)} title="Régi kalkulációs panel (a fő kalkuláció a jobb oldali panelben van)" style={{
                padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 9,
                fontFamily: 'DM Mono', fontWeight: 600,
                background: estimationOpen ? 'rgba(255,209,102,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${estimationOpen ? 'rgba(255,209,102,0.4)' : C.border}`,
                color: estimationOpen ? '#FFD166' : C.muted,
              }}>
                📊 Részletek
              </button>
            </>
          )}
        </div>
      </div>

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
              switchHeight={switchHeight}
              socketHeight={socketHeight}
              onCeilingHeightChange={setCeilingHeight}
              onSwitchHeightChange={setSwitchHeight}
              onSocketHeightChange={setSocketHeight}
              onClose={() => setEstimationOpen(false)}
              onCreateQuote={(data) => {
                onCreateQuote?.({ ...data, planId, markers: [...markersRef.current], measurements: [...measuresRef.current], scale })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
})

export default DxfViewerPanel

// ═══════════════════════════════════════════════════════════════════════════
// Canvas2D drawing helpers
// ═══════════════════════════════════════════════════════════════════════════

function drawMeasureLine(ctx, p1, p2, label, isDashed) {
  ctx.save()
  ctx.strokeStyle = isDashed ? 'rgba(255,209,102,0.6)' : '#FFD166'
  ctx.lineWidth = isDashed ? 1.5 : 2
  if (isDashed) ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.stroke()

  // End dots
  for (const p of [p1, p2]) {
    ctx.fillStyle = '#FFD166'
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#09090B'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.stroke()
  }

  // Label
  if (label) {
    const mx = (p1.x + p2.x) / 2
    const my = (p1.y + p2.y) / 2
    ctx.font = 'bold 11px "DM Mono", monospace'
    const tw = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(9,9,11,0.88)'
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.roundRect(mx - tw / 2 - 6, my - 11, tw + 12, 20, 5)
    ctx.fill()
    ctx.strokeStyle = '#FFD166'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#FFD166'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, mx, my)
  }
  ctx.restore()
}

function drawMarker(ctx, x, y, num, color, source) {
  const r = 13
  const isDetection = source === 'detection'
  ctx.save()
  if (isDetection) {
    // Detection markers: dashed outline, no glow, smaller
    const rd = 11
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, rd, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    // Inner dot
    ctx.fillStyle = color + '30'
    ctx.beginPath()
    ctx.arc(x, y, rd - 2, 0, Math.PI * 2)
    ctx.fill()
    // Number
    ctx.fillStyle = color
    ctx.font = `bold ${num > 99 ? 7 : 9}px "DM Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(num), x, y + 0.5)
  } else {
    // Manual markers: solid ring + glow (original)
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    // Inner
    ctx.fillStyle = '#09090B'
    ctx.beginPath()
    ctx.arc(x, y, r - 2.5, 0, Math.PI * 2)
    ctx.fill()
    // Number
    ctx.fillStyle = color
    ctx.font = `bold ${num > 99 ? 8 : 10}px "DM Mono", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(num), x, y + 0.5)
  }
  ctx.restore()
}

function dialogBtn(color) {
  return {
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontFamily: 'Syne', fontWeight: 700,
    background: `${color}18`, border: `1px solid ${color}40`,
    color, transition: 'all 0.12s',
  }
}
