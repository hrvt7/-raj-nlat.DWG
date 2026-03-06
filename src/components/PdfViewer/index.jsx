import React, { useState, useRef, useCallback, useEffect } from 'react'
import { COUNT_CATEGORIES, CategoryDropdown, CABLE_TRAY_COLOR } from '../DxfViewer/DxfToolbar.jsx'
import EstimationPanel from '../EstimationPanel.jsx'
import { savePlanAnnotations, getPlanAnnotations } from '../../data/planStore.js'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
// PdfViewerPanel — PDF floor-plan viewer with pan/zoom, measure, count
// Uses <canvas> for rendering PDF pages + overlay for annotations
// ═══════════════════════════════════════════════════════════════════════════
export default function PdfViewerPanel({ file, style, planId, onCreateQuote, onCableData }) {
  const containerRef = useRef(null)
  const pdfCanvasRef = useRef(null)
  const overlayRef = useRef(null)

  // ── PDF state ──
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── View transform (pan/zoom) ──
  const viewRef = useRef({ offsetX: 0, offsetY: 0, zoom: 1, pageWidth: 0, pageHeight: 0 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOX: 0, startOY: 0 })

  // ── Tools ──
  const [activeTool, setActiveTool] = useState(null)
  const [activeCategory, setActiveCategory] = useState('socket')

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
      if (ann.markers?.length) { markersRef.current = ann.markers; setRenderTick(t => t + 1) }
      if (ann.measurements?.length) { measuresRef.current = ann.measurements }
      if (ann.scale?.calibrated) { setScale(ann.scale) }
      if (ann.ceilingHeight) setCeilingHeight(ann.ceilingHeight)
      if (ann.socketHeight) setSocketHeight(ann.socketHeight)
      if (ann.switchHeight) setSwitchHeight(ann.switchHeight)
      if (ann.assignments && typeof ann.assignments === 'object') {
        setAssignments(ann.assignments)
        assignmentsRef.current = ann.assignments
      }
      if (ann.quoteOverrides && typeof ann.quoteOverrides === 'object') {
        setQuoteOverrides(ann.quoteOverrides)
        quoteOverridesRef.current = ann.quoteOverrides
      }
      if (ann.rotation != null) setRotation(ann.rotation)
    })
  }, [planId])

  // ── Auto-save annotations on unmount ──
  useEffect(() => {
    return () => {
      if (!planId) return
      savePlanAnnotations(planId, {
        markers: markersRef.current,
        measurements: measuresRef.current,
        scale: scaleRef.current,
        ceilingHeight,
        socketHeight,
        switchHeight,
        assignments: assignmentsRef.current,
        quoteOverrides: quoteOverridesRef.current,
        rotation: rotationRef.current,
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
    } catch (err) {
      console.error('Page render error:', err)
    }
  }, [])

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
      drawMarker(ctx, s.x, s.y, m.color, v.zoom)
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

    if (activeTool === 'count') {
      const cat = COUNT_CATEGORIES.find(c => c.key === activeCategory) || COUNT_CATEGORIES[0]
      markersRef.current.push({ x: pdf.x, y: pdf.y, category: activeCategory, color: cat.color })
      setRenderTick(t => t + 1)
      drawOverlay()
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

    mousePdfRef.current = screenToPdf(sx, sy)
    if (activeTool) drawOverlay()
  }, [activeTool, screenToPdf, drawOverlay])

  const handleMouseUp = useCallback(() => {
    dragRef.current.dragging = false
  }, [])

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
    } else if (markersRef.current.length > 0) {
      markersRef.current.pop()
    }
    setRenderTick(t => t + 1)
    drawOverlay()
  }, [drawOverlay])

  const handleClearAll = useCallback(() => {
    markersRef.current = []
    measuresRef.current = []
    activeStartRef.current = null
    setRenderTick(t => t + 1)
    drawOverlay()
  }, [drawOverlay])

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
    // Update existing measurements
    measuresRef.current = measuresRef.current.map(seg => ({ ...seg }))
    setCalibDialog(null)
    setCalibInput('')
    setRenderTick(t => t + 1)
    drawOverlay()
  }, [calibDialog, calibInput, calibUnit, drawOverlay])

  // ── Measurement category reassignment (retroactive tagging of existing measurements) ──
  const handleMeasureCategoryChange = useCallback((idx, category) => {
    if (idx >= 0 && idx < measuresRef.current.length) {
      measuresRef.current[idx] = { ...measuresRef.current[idx], category: category || undefined }
      setRenderTick(t => t + 1)
      drawOverlay()
    }
  }, [drawOverlay])

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
  const countSummary = (() => {
    const map = {}
    for (const m of markersRef.current) {
      map[m.category] = (map[m.category] || 0) + 1
    }
    return map
  })()
  const markerCount = markersRef.current.length
  const measureCount = measuresRef.current.length

  // ── Report cable data to parent when markers/scale change ──
  useEffect(() => {
    if (!onCableData) return
    const markers = markersRef.current
    const sf = scaleRef.current
    if (!markers.length || !sf.calibrated || !sf.factor) {
      onCableData(null)
      return
    }
    // Find panel marker
    const panel = markers.find(m => m.category === 'panel')
    if (!panel) { onCableData(null); return }

    // Compute Manhattan cable lengths from panel to each device
    let lightM = 0, socketM = 0, switchM = 0, otherM = 0
    let lightN = 0, socketN = 0, switchN = 0, otherN = 0
    const ROUTING_FACTOR = 1.25 // wall routing + vertical drops overhead

    for (const m of markers) {
      if (m.category === 'panel') continue
      // Cable tray markers don't get individual cable runs
      const catDef = COUNT_CATEGORIES.find(c => c.key === m.category)
      if (catDef?.isCableTray) continue

      const dist = (Math.abs(m.x - panel.x) + Math.abs(m.y - panel.y)) * sf.factor * ROUTING_FACTOR
      if (m.category === 'light') { lightM += dist; lightN++ }
      else if (m.category === 'socket') { socketM += dist; socketN++ }
      else if (m.category === 'switch') { switchM += dist; switchN++ }
      else { otherM += dist; otherN++ }
    }

    const totalM = lightM + socketM + switchM + otherM
    const deviceCount = lightN + socketN + switchN + otherN
    if (deviceCount === 0) { onCableData(null); return }

    onCableData({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderTick, scale, onCableData])

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div ref={containerRef} style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
      overflow: 'hidden', ...style,
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
      />

      {/* Main area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, cursor: activeTool ? 'crosshair' : 'grab' }}>
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

        {/* Count summary panel */}
        {countPanelOpen && markerCount > 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8, zIndex: 20,
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 14, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
              Összesítő ({markerCount})
            </div>
            {COUNT_CATEGORIES.filter(c => countSummary[c.key]).map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: c.color }}>{c.label}</span>
                </div>
                <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: c.color }}>{countSummary[c.key]}</span>
              </div>
            ))}
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

function drawMarker(ctx, x, y, color, zoom) {
  const r = Math.max(6, 10 * Math.min(zoom, 1.5))
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color + '40'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.stroke()
  // Cross
  const c = r * 0.5
  ctx.beginPath()
  ctx.moveTo(x - c, y); ctx.lineTo(x + c, y)
  ctx.moveTo(x, y - c); ctx.lineTo(x, y + c)
  ctx.stroke()
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
  onToggleEstimation, estimationOpen,
  showCableRoutes, onToggleCableRoutes,
  rotation, onRotateLeft, onRotateRight,
}) {
  const TOOLS = [
    { id: 'count', label: 'Számlálás', key: 'C' },
    { id: 'measure', label: 'Mérés', key: 'M' },
    { id: 'calibrate', label: 'Skála', key: 'S' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', background: C.bgCard, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
      {/* Page nav */}
      {numPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <TinyBtn onClick={onPrevPage} disabled={pageNum <= 1}>◀</TinyBtn>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>{pageNum}/{numPages}</span>
          <TinyBtn onClick={onNextPage} disabled={pageNum >= numPages}>▶</TinyBtn>
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

      {/* Category picker — shown for count + measure (measure tags cable tray segments) */}
      {(activeTool === 'count' || activeTool === 'measure') && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} />
      )}

      <div style={{ flex: 1 }} />

      {/* Undo/Clear */}
      {(markerCount > 0 || measureCount > 0) && (
        <>
          <TinyBtn onClick={onUndo} title="Visszavonás (Ctrl+Z)">↩</TinyBtn>
          <TinyBtn onClick={onClearAll} title="Összes törlése" style={{ color: C.red }}>✕</TinyBtn>
        </>
      )}

      {/* Count panel */}
      {markerCount > 0 && (
        <TinyBtn onClick={onToggleCountPanel} title="Összesítő" style={{ color: countPanelOpen ? C.accent : C.muted }}>∑</TinyBtn>
      )}

      {/* Cable routes toggle */}
      {markerCount > 0 && (
        <button onClick={onToggleCableRoutes} style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          fontFamily: 'Syne', fontWeight: 700,
          background: showCableRoutes ? 'rgba(255,209,102,0.15)' : 'transparent',
          border: `1px solid ${showCableRoutes ? C.yellow : C.border}`,
          color: showCableRoutes ? C.yellow : C.muted,
        }}>
          {showCableRoutes ? 'Kábelvonalak ✓' : 'Kábelvonalak'}
        </button>
      )}

      {/* Estimation button */}
      {markerCount > 0 && (
        <button onClick={onToggleEstimation} style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          fontFamily: 'Syne', fontWeight: 700,
          background: estimationOpen ? C.accent : 'rgba(0,229,160,0.12)',
          border: `1px solid ${estimationOpen ? C.accent : 'rgba(0,229,160,0.3)'}`,
          color: estimationOpen ? C.bg : C.accent,
        }}>
          Kalkuláció
        </button>
      )}

      {/* Rotation controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }} title="Terv forgatása">
        <TinyBtn onClick={onRotateLeft} title="Forgatás balra (−90°)">↶</TinyBtn>
        {rotation !== 0 && (
          <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, padding: '4px 3px', alignSelf: 'center' }}>{rotation}°</span>
        )}
        <TinyBtn onClick={onRotateRight} title="Forgatás jobbra (+90°)">↷</TinyBtn>
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
        <TinyBtn onClick={onZoomIn}>+</TinyBtn>
        <TinyBtn onClick={onFitView}>⊞</TinyBtn>
        <TinyBtn onClick={onZoomOut}>−</TinyBtn>
      </div>
    </div>
  )
}

function TinyBtn({ children, onClick, title, style, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      padding: '4px 7px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
      background: 'transparent', border: 'none', color: C.muted, fontSize: 13,
      fontFamily: 'DM Mono', fontWeight: 600, opacity: disabled ? 0.3 : 1,
      ...style,
    }}>{children}</button>
  )
}
