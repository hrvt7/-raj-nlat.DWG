/**
 * TemplateEditor — mini cleanup editor for Auto Symbol template.
 *
 * After the user draws a rectangle to select a symbol, this modal shows
 * the cropped template at high zoom and lets the user erase unwanted
 * background (walls, text, dimensions) before search.
 *
 * Erased pixels get alpha=0 in the RGBA data. The template match worker
 * skips alpha=0 pixels in NCC computation (mask-aware matching).
 */
import React, { useRef, useState, useEffect, useCallback } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', red: '#FF6B6B', text: '#E4E4E7', muted: '#71717A',
}

export default function TemplateEditor({ cropData, width, height, onConfirm, onSkip }) {
  const canvasRef = useRef(null)
  const [tool, setTool] = useState('erase') // 'erase' | 'restore'
  const [brushSize, setBrushSize] = useState(8)
  const [painting, setPainting] = useState(false)
  const dataRef = useRef(null) // working copy of RGBA data
  const historyRef = useRef([]) // undo stack (snapshots of alpha channel only)

  // Display scale: zoom template to fill ~300px while maintaining aspect ratio
  const maxDisplaySize = 300
  const displayScale = Math.min(maxDisplaySize / width, maxDisplaySize / height, 8)
  const displayW = Math.round(width * displayScale)
  const displayH = Math.round(height * displayScale)

  // Initialize working copy
  useEffect(() => {
    dataRef.current = new Uint8ClampedArray(cropData)
    // Save initial state for undo
    const alphaSnapshot = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i++) alphaSnapshot[i] = dataRef.current[i * 4 + 3]
    historyRef.current = [alphaSnapshot]
    drawCanvas()
  }, [cropData, width, height])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !dataRef.current) return
    const ctx = canvas.getContext('2d')
    // Checkerboard background for transparency
    const checkSize = Math.max(4, Math.round(displayScale * 2))
    for (let y = 0; y < displayH; y += checkSize) {
      for (let x = 0; x < displayW; x += checkSize) {
        const isLight = ((x / checkSize + y / checkSize) % 2) === 0
        ctx.fillStyle = isLight ? '#2a2a2e' : '#1a1a1e'
        ctx.fillRect(x, y, checkSize, checkSize)
      }
    }
    // Draw template at display scale
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width; tempCanvas.height = height
    const tempCtx = tempCanvas.getContext('2d')
    const imgData = new ImageData(new Uint8ClampedArray(dataRef.current), width, height)
    tempCtx.putImageData(imgData, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tempCanvas, 0, 0, displayW, displayH)
  }, [width, height, displayW, displayH, displayScale])

  const getTemplateCoords = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    // Convert display coords to template pixel coords
    const tx = Math.floor(sx / displayScale)
    const ty = Math.floor(sy / displayScale)
    return { tx, ty }
  }, [displayScale])

  const applyBrush = useCallback((tx, ty) => {
    if (!dataRef.current) return
    const r = Math.ceil(brushSize / 2)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue // circle brush
        const px = tx + dx, py = ty + dy
        if (px < 0 || px >= width || py < 0 || py >= height) continue
        const idx = (py * width + px) * 4 + 3 // alpha channel
        dataRef.current[idx] = tool === 'erase' ? 0 : 255
      }
    }
    drawCanvas()
  }, [brushSize, tool, width, height, drawCanvas])

  const saveUndoSnapshot = useCallback(() => {
    if (!dataRef.current) return
    const snapshot = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i++) snapshot[i] = dataRef.current[i * 4 + 3]
    historyRef.current.push(snapshot)
    if (historyRef.current.length > 30) historyRef.current.shift() // cap at 30
  }, [width, height])

  const handleUndo = useCallback(() => {
    if (historyRef.current.length <= 1 || !dataRef.current) return
    historyRef.current.pop() // remove current
    const prev = historyRef.current[historyRef.current.length - 1]
    for (let i = 0; i < width * height; i++) dataRef.current[i * 4 + 3] = prev[i]
    drawCanvas()
  }, [width, height, drawCanvas])

  const handleReset = useCallback(() => {
    if (!dataRef.current || !historyRef.current.length) return
    const initial = historyRef.current[0]
    for (let i = 0; i < width * height; i++) dataRef.current[i * 4 + 3] = initial[i]
    historyRef.current = [new Uint8Array(initial)]
    drawCanvas()
  }, [width, height, drawCanvas])

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    saveUndoSnapshot()
    setPainting(true)
    const coords = getTemplateCoords(e)
    if (coords) applyBrush(coords.tx, coords.ty)
  }, [saveUndoSnapshot, getTemplateCoords, applyBrush])

  const handleMouseMove = useCallback((e) => {
    if (!painting) return
    const coords = getTemplateCoords(e)
    if (coords) applyBrush(coords.tx, coords.ty)
  }, [painting, getTemplateCoords, applyBrush])

  const handleMouseUp = useCallback(() => {
    setPainting(false)
  }, [])

  const handleConfirm = useCallback(() => {
    if (!dataRef.current) return
    onConfirm(dataRef.current)
  }, [onConfirm])

  // Count masked pixels for info display
  let maskedCount = 0
  if (dataRef.current) {
    for (let i = 0; i < width * height; i++) {
      if (dataRef.current[i * 4 + 3] === 0) maskedCount++
    }
  }
  const maskedPct = Math.round((maskedCount / (width * height)) * 100)

  const btnStyle = (active) => ({
    padding: '4px 10px', borderRadius: 4, border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent + '22' : C.bgCard, color: active ? C.accent : C.text,
    cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    }} onMouseUp={handleMouseUp}>
      <div style={{
        background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: 16, maxWidth: 420, width: '95vw',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Minta tisztítás</span>
          <span style={{ color: C.muted, fontSize: 11 }}>{width}×{height}px{maskedPct > 0 ? ` | ${maskedPct}% maszkolva` : ''}</span>
        </div>

        {/* Canvas */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 10,
          background: '#0a0a0c', borderRadius: 6, padding: 8,
        }}>
          <canvas
            ref={canvasRef}
            width={displayW}
            height={displayH}
            style={{ cursor: tool === 'erase' ? 'crosshair' : 'cell', imageRendering: 'pixelated' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
          />
        </div>

        {/* Tools row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={btnStyle(tool === 'erase')} onClick={() => setTool('erase')}>Radír</button>
          <button style={btnStyle(tool === 'restore')} onClick={() => setTool('restore')}>Visszaállít</button>
          <span style={{ color: C.muted, fontSize: 11, margin: '0 4px' }}>|</span>
          <span style={{ color: C.muted, fontSize: 11 }}>Méret:</span>
          <input type="range" min="2" max="30" value={brushSize} onChange={e => setBrushSize(+e.target.value)}
            style={{ width: 70, accentColor: C.accent }} />
          <span style={{ color: C.text, fontSize: 11, minWidth: 20 }}>{brushSize}</span>
          <span style={{ color: C.muted, fontSize: 11, margin: '0 4px' }}>|</span>
          <button style={btnStyle(false)} onClick={handleUndo}>Vissza</button>
          <button style={btnStyle(false)} onClick={handleReset}>Reset</button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            style={{ ...btnStyle(false), color: C.muted }}
            onClick={onSkip}
          >Ugrás (nyers minta)</button>
          <button
            style={{ ...btnStyle(true), background: C.accent, color: '#000', fontWeight: 600 }}
            onClick={handleConfirm}
          >Keresés tisztított mintával</button>
        </div>
      </div>
    </div>
  )
}