import React, { useState, useRef, useCallback, useEffect } from 'react'
import DxfViewerCanvas from './DxfViewerCanvas.jsx'
import DxfToolbar from './DxfToolbar.jsx'
import DxfLayerPanel from './DxfLayerPanel.jsx'
import DxfCountOverlay from './DxfCountOverlay.jsx'
import DxfMeasureOverlay from './DxfMeasureOverlay.jsx'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', text: '#E4E4E7', muted: '#71717A',
}

let nextMarkerId = 1

// ─── DxfViewerPanel ─────────────────────────────────────────────────────────
// Complete interactive DXF viewer with toolbar, overlays, and layer panel
export default function DxfViewerPanel({ file, unitFactor, unitName, style, compact = false }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  // Tool state
  const [activeTool, setActiveTool] = useState(null)
  const [layers, setLayers] = useState([])
  const [layerVisibility, setLayerVisibility] = useState({})
  const [layersPanelOpen, setLayersPanelOpen] = useState(false)

  // Count state
  const [countMarkers, setCountMarkers] = useState([])
  const [counts, setCounts] = useState({}) // { category: count }

  // Measure state
  const [measurements, setMeasurements] = useState([])
  const [activeMeasure, setActiveMeasure] = useState(null)

  // Info popup state (for select tool)
  const [selectInfo, setSelectInfo] = useState(null)

  // On DXF loaded
  const handleLoad = useCallback((info) => {
    setLayers(info.layers || [])
    const vis = {}
    for (const l of info.layers || []) {
      vis[l.name] = true
    }
    setLayerVisibility(vis)
  }, [])

  // Handle pointer events on canvas
  const handlePointerDown = useCallback((event) => {
    if (!activeTool) return

    const { position, domEvent, canvasCoord } = event
    if (!position) return

    // Get screen position from domEvent or canvasCoord
    const rect = containerRef.current?.getBoundingClientRect()
    const screenX = domEvent ? domEvent.clientX - (rect?.left || 0) : (canvasCoord?.x || 0)
    const screenY = domEvent ? domEvent.clientY - (rect?.top || 0) : (canvasCoord?.y || 0)

    if (activeTool === 'count') {
      const id = nextMarkerId++
      setCountMarkers(prev => [...prev, {
        id,
        screenX, screenY,
        sceneX: position.x, sceneY: position.y,
      }])
      setCounts(prev => ({ ...prev, total: (prev.total || 0) + 1 }))
    }

    if (activeTool === 'measure') {
      if (!activeMeasure?.start) {
        // First point
        setActiveMeasure({
          start: { screenX, screenY, sceneX: position.x, sceneY: position.y },
          end: null,
        })
      } else {
        // Second point — finalize
        const completed = {
          ...activeMeasure,
          end: { screenX, screenY, sceneX: position.x, sceneY: position.y },
        }
        setMeasurements(prev => [...prev, completed])
        setActiveMeasure(null)
      }
    }

    if (activeTool === 'select') {
      setSelectInfo({
        x: screenX, y: screenY,
        sceneX: position.x?.toFixed(2),
        sceneY: position.y?.toFixed(2),
      })
    }
  }, [activeTool, activeMeasure])

  // Layer toggle
  const handleToggleLayer = useCallback((name) => {
    setLayerVisibility(prev => {
      const next = { ...prev, [name]: !prev[name] }
      canvasRef.current?.showLayer(name, next[name])
      return next
    })
  }, [])

  const handleShowAll = useCallback(() => {
    const next = {}
    for (const l of layers) {
      next[l.name] = true
      canvasRef.current?.showLayer(l.name, true)
    }
    setLayerVisibility(next)
  }, [layers])

  const handleHideAll = useCallback(() => {
    const next = {}
    for (const l of layers) {
      next[l.name] = false
      canvasRef.current?.showLayer(l.name, false)
    }
    setLayerVisibility(next)
  }, [layers])

  // Fit view
  const handleFitView = useCallback(() => {
    canvasRef.current?.fitView()
  }, [])

  // Tool change — clear active measure when switching away
  const handleToolChange = useCallback((tool) => {
    setActiveTool(tool)
    setActiveMeasure(null)
    setSelectInfo(null)
  }, [])

  // Remove count marker
  const handleRemoveMarker = useCallback((id) => {
    setCountMarkers(prev => prev.filter(m => m.id !== id))
    setCounts(prev => ({ ...prev, total: Math.max(0, (prev.total || 0) - 1) }))
  }, [])

  // Clear all for current tool
  const handleClearAll = useCallback(() => {
    if (activeTool === 'count') {
      setCountMarkers([])
      setCounts({})
    }
    if (activeTool === 'measure') {
      setMeasurements([])
      setActiveMeasure(null)
    }
  }, [activeTool])

  if (!file) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: compact ? 200 : 400,
        background: C.bgCard, borderRadius: 8,
        border: `1px solid ${C.border}`,
        ...style,
      }}>
        <div style={{ textAlign: 'center', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📐</div>
          <div style={{ fontSize: 13, fontFamily: 'Syne' }}>Nincs tervrajz betöltve</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', minHeight: compact ? 300 : 500,
        background: C.bgCard, borderRadius: 8,
        border: `1px solid ${C.border}`, overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {/* Toolbar */}
      <DxfToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onFitView={handleFitView}
        onToggleLayers={() => setLayersPanelOpen(p => !p)}
        layersPanelOpen={layersPanelOpen}
        counts={counts}
      />

      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DxfViewerCanvas
          ref={canvasRef}
          file={file}
          onLoad={handleLoad}
          onPointerDown={handlePointerDown}
        />

        {/* Overlays */}
        <DxfCountOverlay
          countMarkers={countMarkers}
          onRemoveMarker={handleRemoveMarker}
        />
        <DxfMeasureOverlay
          measurements={measurements}
          activeMeasure={activeMeasure}
          unitFactor={unitFactor}
          unitName={unitName}
        />

        {/* Select info popup */}
        {selectInfo && (
          <div style={{
            position: 'absolute',
            left: selectInfo.x + 12, top: selectInfo.y - 8,
            background: 'rgba(9,9,11,0.92)', border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '6px 10px', zIndex: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted }}>
              X: {selectInfo.sceneX}  Y: {selectInfo.sceneY}
            </div>
          </div>
        )}

        {/* Layer panel */}
        {layersPanelOpen && (
          <DxfLayerPanel
            layers={layers}
            layerVisibility={layerVisibility}
            onToggleLayer={handleToggleLayer}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
          />
        )}
      </div>

      {/* Bottom status bar */}
      <div style={{
        padding: '4px 12px', borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10, fontFamily: 'DM Mono', color: C.muted,
      }}>
        <span>
          {activeTool === 'count' && countMarkers.length > 0
            ? `🔢 Számlálás: ${countMarkers.length} db  (jobb klikk = törlés)`
            : activeTool === 'measure' && (measurements.length > 0 || activeMeasure)
            ? `📏 ${measurements.length} mérés${activeMeasure?.start ? ' — kattints a végpontra' : ''}`
            : activeTool === 'select'
            ? '🔍 Kattints egy pontra a koordináták megtekintéséhez'
            : `${layers.length} réteg betöltve`
          }
        </span>
        {(countMarkers.length > 0 || measurements.length > 0) && (
          <button
            onClick={handleClearAll}
            style={{
              background: 'transparent', border: 'none',
              color: '#FF6B6B', fontSize: 10, fontFamily: 'DM Mono',
              cursor: 'pointer', padding: '2px 4px',
            }}
          >
            Törlés ✕
          </button>
        )}
      </div>
    </div>
  )
}
