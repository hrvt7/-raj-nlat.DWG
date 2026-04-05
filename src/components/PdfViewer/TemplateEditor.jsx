/**
 * TemplateEditor — cleanup editor for Auto Symbol template.
 *
 * After the user draws a rectangle to select a symbol, this modal shows
 * the cropped template and lets the user:
 *   - Rotate (90° steps + fine angle slider)
 *   - Recrop (drag a sub-rectangle within the template)
 *   - Erase/restore mask (brush tool)
 *
 * Architecture:
 *   - Source RGBA (300 DPI crop) is IMMUTABLE — stored in sourceRef
 *   - Rotation, crop rect, and mask are separate state
 *   - Preview shows live composite of all transforms
 *   - On confirm: applies transforms to source → produces final high-res RGBA
 *   - Worker receives this final RGBA, never preview pixels
 */
import React, { useRef, useState, useEffect, useCallback } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', red: '#FF6B6B', blue: '#4CC9F0', text: '#E4E4E7', muted: '#71717A',
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

/** Put RGBA into an offscreen canvas */
function rgbaToCanvas(rgba, w, h) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  return c
}

/** Rotate a canvas by arbitrary angle (degrees), returning new canvas + dimensions */
function rotateCanvas(srcCanvas, angleDeg) {
  if (angleDeg === 0) return { canvas: srcCanvas, w: srcCanvas.width, h: srcCanvas.height }
  const rad = angleDeg * Math.PI / 180
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
  const sw = srcCanvas.width, sh = srcCanvas.height
  const dw = Math.ceil(sw * cos + sh * sin)
  const dh = Math.ceil(sw * sin + sh * cos)
  const dst = document.createElement('canvas')
  dst.width = dw; dst.height = dh
  const ctx = dst.getContext('2d')
  ctx.translate(dw / 2, dh / 2)
  ctx.rotate(rad)
  ctx.drawImage(srcCanvas, -sw / 2, -sh / 2)
  return { canvas: dst, w: dw, h: dh }
}

/** Crop a canvas to a rect, returning new canvas */
function cropCanvas(srcCanvas, x, y, w, h) {
  const dst = document.createElement('canvas')
  dst.width = w; dst.height = h
  dst.getContext('2d').drawImage(srcCanvas, x, y, w, h, 0, 0, w, h)
  return dst
}

/** Apply mask (Uint8Array, same size as canvas) — set alpha=0 where mask=0 */
function applyMaskToCanvas(canvas, mask) {
  if (!mask) return canvas
  const ctx = canvas.getContext('2d')
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) imgData.data[i * 4 + 3] = 0
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TemplateEditor({ cropData, width, height, onConfirm, onSkip }) {
  const canvasRef = useRef(null)

  // Immutable source
  const sourceRef = useRef(null)

  // Transform state
  const [rotation, setRotation] = useState(0) // degrees
  const [cropRect, setCropRect] = useState(null) // {x,y,w,h} in rotated-source coords, or null = full
  const [tool, setTool] = useState('erase') // 'erase' | 'restore' | 'crop'
  const [brushSize, setBrushSize] = useState(8)
  const [painting, setPainting] = useState(false)

  // Mask: stored at rotated-source dimensions, recreated on rotation change
  const maskRef = useRef(null) // Uint8Array (1=valid, 0=masked), null = no mask
  const [maskVersion, setMaskVersion] = useState(0) // trigger redraws

  // Undo stack for mask (alpha snapshots)
  const historyRef = useRef([])

  // Crop drag state
  const cropStartRef = useRef(null) // { sx, sy } screen coords at drag start

  // Current rotated source dimensions (computed)
  const rotatedRef = useRef({ w: width, h: height })

  // Display scale
  const maxDisplaySize = 340
  const rw = rotatedRef.current.w, rh = rotatedRef.current.h
  const effW = cropRect ? cropRect.w : rw
  const effH = cropRect ? cropRect.h : rh
  const displayScale = Math.min(maxDisplaySize / Math.max(effW, 1), maxDisplaySize / Math.max(effH, 1), 10)
  const displayW = Math.round(effW * displayScale)
  const displayH = Math.round(effH * displayScale)

  // Initialize source
  useEffect(() => {
    sourceRef.current = new Uint8ClampedArray(cropData)
    maskRef.current = null
    historyRef.current = []
    setCropRect(null)
    setRotation(0)
    rotatedRef.current = { w: width, h: height }
  }, [cropData, width, height])

  // Get the rotated source canvas (recomputed on rotation change)
  const getRotatedSource = useCallback(() => {
    if (!sourceRef.current) return null
    const srcCanvas = rgbaToCanvas(sourceRef.current, width, height)
    const { canvas, w, h } = rotateCanvas(srcCanvas, rotation)
    rotatedRef.current = { w, h }
    return { canvas, w, h }
  }, [width, height, rotation])

  // Draw preview
  const drawPreview = useCallback(() => {
    const cvs = canvasRef.current
    if (!cvs || !sourceRef.current) return
    const ctx = cvs.getContext('2d')

    // Get rotated source
    const rot = getRotatedSource()
    if (!rot) return

    // Determine visible region
    const cr = cropRect || { x: 0, y: 0, w: rot.w, h: rot.h }

    // Checkerboard
    const checkSize = Math.max(4, Math.round(displayScale * 2))
    for (let y = 0; y < displayH; y += checkSize) {
      for (let x = 0; x < displayW; x += checkSize) {
        ctx.fillStyle = ((x / checkSize + y / checkSize) % 2) === 0 ? '#2a2a2e' : '#1a1a1e'
        ctx.fillRect(x, y, checkSize, checkSize)
      }
    }

    // Draw rotated source (cropped region)
    // Apply mask if present
    let displayCanvas = rot.canvas
    if (maskRef.current && maskRef.current.length === rot.w * rot.h) {
      // Clone canvas, apply mask
      const cloned = document.createElement('canvas')
      cloned.width = rot.w; cloned.height = rot.h
      cloned.getContext('2d').drawImage(rot.canvas, 0, 0)
      applyMaskToCanvas(cloned, maskRef.current)
      displayCanvas = cloned
    }

    ctx.imageSmoothingEnabled = displayScale < 2
    ctx.drawImage(displayCanvas, cr.x, cr.y, cr.w, cr.h, 0, 0, displayW, displayH)

    // Draw crop rectangle outline if in crop mode and no crop yet
    if (tool === 'crop' && cropStartRef.current && !cropRect) {
      // handled by mouse events
    }
  }, [getRotatedSource, cropRect, displayW, displayH, displayScale, tool, maskVersion])

  useEffect(() => { drawPreview() }, [drawPreview, rotation, cropRect, maskVersion])

  // Convert screen coords to source-space coords (within visible crop region)
  const screenToSource = useCallback((e) => {
    const cvs = canvasRef.current
    if (!cvs) return null
    const rect = cvs.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const cr = cropRect || { x: 0, y: 0, w: rotatedRef.current.w, h: rotatedRef.current.h }
    const tx = Math.floor(sx / displayScale) + cr.x
    const ty = Math.floor(sy / displayScale) + cr.y
    return { tx, ty }
  }, [displayScale, cropRect])

  // Brush application on mask
  const applyBrush = useCallback((tx, ty) => {
    const rw = rotatedRef.current.w, rh = rotatedRef.current.h
    if (!maskRef.current) {
      // Lazy-init mask to all-valid
      maskRef.current = new Uint8Array(rw * rh).fill(1)
    }
    const r = Math.ceil(brushSize / 2)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const px = tx + dx, py = ty + dy
        if (px < 0 || px >= rw || py < 0 || py >= rh) continue
        maskRef.current[py * rw + px] = tool === 'erase' ? 0 : 1
      }
    }
    setMaskVersion(v => v + 1)
  }, [brushSize, tool])

  const saveMaskSnapshot = useCallback(() => {
    if (!maskRef.current) return
    historyRef.current.push(new Uint8Array(maskRef.current))
    if (historyRef.current.length > 30) historyRef.current.shift()
  }, [])

  // Mouse handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    if (tool === 'crop') {
      const cvs = canvasRef.current
      if (!cvs) return
      const rect = cvs.getBoundingClientRect()
      cropStartRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
      return
    }
    // Erase/restore
    saveMaskSnapshot()
    setPainting(true)
    const coords = screenToSource(e)
    if (coords) applyBrush(coords.tx, coords.ty)
  }, [tool, saveMaskSnapshot, screenToSource, applyBrush])

  const handleMouseMove = useCallback((e) => {
    if (tool === 'crop' && cropStartRef.current) {
      // Draw crop preview rectangle on canvas
      drawPreview()
      const cvs = canvasRef.current
      if (!cvs) return
      const ctx = cvs.getContext('2d')
      const rect = cvs.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const x1 = Math.min(cropStartRef.current.sx, cx)
      const y1 = Math.min(cropStartRef.current.sy, cy)
      const w = Math.abs(cx - cropStartRef.current.sx)
      const h = Math.abs(cy - cropStartRef.current.sy)
      ctx.strokeStyle = C.blue
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.strokeRect(x1, y1, w, h)
      ctx.setLineDash([])
      return
    }
    if (!painting) return
    const coords = screenToSource(e)
    if (coords) applyBrush(coords.tx, coords.ty)
  }, [tool, painting, screenToSource, applyBrush, drawPreview])

  const handleMouseUp = useCallback((e) => {
    if (tool === 'crop' && cropStartRef.current) {
      const cvs = canvasRef.current
      if (!cvs) { cropStartRef.current = null; return }
      const rect = cvs.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const cr = cropRect || { x: 0, y: 0, w: rotatedRef.current.w, h: rotatedRef.current.h }
      // Convert screen crop to source coords
      const x1 = Math.floor(Math.min(cropStartRef.current.sx, cx) / displayScale) + cr.x
      const y1 = Math.floor(Math.min(cropStartRef.current.sy, cy) / displayScale) + cr.y
      const w = Math.max(4, Math.floor(Math.abs(cx - cropStartRef.current.sx) / displayScale))
      const h = Math.max(4, Math.floor(Math.abs(cy - cropStartRef.current.sy) / displayScale))
      if (w >= 4 && h >= 4) {
        setCropRect({ x: Math.max(0, x1), y: Math.max(0, y1), w: Math.min(w, rotatedRef.current.w - x1), h: Math.min(h, rotatedRef.current.h - y1) })
      }
      cropStartRef.current = null
      return
    }
    setPainting(false)
  }, [tool, cropRect, displayScale])

  // Rotation
  const rotate90 = useCallback((dir) => {
    setRotation(r => {
      const next = (r + dir * 90 + 360) % 360
      // Reset mask on rotation change (mask is in rotated-source space)
      maskRef.current = null
      historyRef.current = []
      setCropRect(null)
      setMaskVersion(v => v + 1)
      return next
    })
  }, [])

  const handleFineRotation = useCallback((deg) => {
    setRotation(deg)
    maskRef.current = null
    historyRef.current = []
    setCropRect(null)
    setMaskVersion(v => v + 1)
  }, [])

  // Undo mask
  const handleUndo = useCallback(() => {
    if (!historyRef.current.length) return
    const prev = historyRef.current.pop()
    if (prev) {
      maskRef.current = prev
      setMaskVersion(v => v + 1)
    }
  }, [])

  // Reset all
  const handleReset = useCallback(() => {
    setRotation(0)
    setCropRect(null)
    maskRef.current = null
    historyRef.current = []
    rotatedRef.current = { w: width, h: height }
    setMaskVersion(v => v + 1)
  }, [width, height])

  // Confirm: generate final high-res RGBA from source + transforms
  const handleConfirm = useCallback(() => {
    if (!sourceRef.current) return
    // 1. Rotate source at full resolution
    const srcCanvas = rgbaToCanvas(sourceRef.current, width, height)
    const { canvas: rotCanvas, w: rw, h: rh } = rotateCanvas(srcCanvas, rotation)

    // 2. Crop
    const cr = cropRect || { x: 0, y: 0, w: rw, h: rh }
    const croppedCanvas = cropCanvas(rotCanvas, cr.x, cr.y, cr.w, cr.h)

    // 3. Apply mask (crop mask to same region)
    if (maskRef.current && maskRef.current.length === rw * rh) {
      const croppedMask = new Uint8Array(cr.w * cr.h)
      for (let y = 0; y < cr.h; y++) {
        for (let x = 0; x < cr.w; x++) {
          const srcIdx = (cr.y + y) * rw + (cr.x + x)
          croppedMask[y * cr.w + x] = srcIdx < maskRef.current.length ? maskRef.current[srcIdx] : 1
        }
      }
      applyMaskToCanvas(croppedCanvas, croppedMask)
    }

    // 4. Extract final RGBA
    const finalData = croppedCanvas.getContext('2d').getImageData(0, 0, cr.w, cr.h)
    onConfirm(finalData.data, cr.w, cr.h)
  }, [width, height, rotation, cropRect, onConfirm])

  // Info
  const maskedCount = maskRef.current ? Array.from(maskRef.current).filter(m => !m).length : 0
  const totalPx = rotatedRef.current.w * rotatedRef.current.h
  const maskedPct = totalPx > 0 ? Math.round((maskedCount / totalPx) * 100) : 0
  const croppedInfo = cropRect ? `${cropRect.w}×${cropRect.h}` : `${rotatedRef.current.w}×${rotatedRef.current.h}`

  const btnStyle = (active) => ({
    padding: '4px 10px', borderRadius: 4, border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent + '22' : C.bgCard, color: active ? C.accent : C.text,
    cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
  })
  const iconBtn = (active) => ({
    ...btnStyle(active), padding: '4px 8px', fontSize: 14, lineHeight: 1,
  })

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    }} onMouseUp={handleMouseUp}>
      <div style={{
        background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: 16, maxWidth: 480, width: '95vw',
      }} onMouseUp={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Minta szerkesztés</span>
          <span style={{ color: C.muted, fontSize: 11 }}>
            {croppedInfo}px | {rotation}°{maskedPct > 0 ? ` | ${maskedPct}% maszk` : ''}
          </span>
        </div>

        {/* Canvas */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 8,
          background: '#0a0a0c', borderRadius: 6, padding: 8, minHeight: 100,
        }}>
          <canvas
            ref={canvasRef}
            width={displayW}
            height={displayH}
            style={{
              cursor: tool === 'crop' ? 'crosshair' : tool === 'erase' ? 'crosshair' : 'cell',
              imageRendering: displayScale > 3 ? 'pixelated' : 'auto',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
          />
        </div>

        {/* Rotation row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={iconBtn(false)} onClick={() => rotate90(-1)} title="90° balra">↺</button>
          <button style={iconBtn(false)} onClick={() => rotate90(1)} title="90° jobbra">↻</button>
          <span style={{ color: C.muted, fontSize: 11 }}>Szög:</span>
          <input type="range" min="-45" max="45" value={rotation % 90 === 0 ? 0 : rotation}
            onChange={e => handleFineRotation(+e.target.value)}
            style={{ width: 80, accentColor: C.accent }} />
          <span style={{ color: C.text, fontSize: 11, minWidth: 28 }}>{rotation}°</span>
        </div>

        {/* Tools row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={btnStyle(tool === 'crop')} onClick={() => setTool('crop')}>Vágás</button>
          <button style={btnStyle(tool === 'erase')} onClick={() => setTool('erase')}>Radír</button>
          <button style={btnStyle(tool === 'restore')} onClick={() => setTool('restore')}>Visszaállít</button>
          {tool !== 'crop' && <>
            <span style={{ color: C.muted, fontSize: 11, margin: '0 2px' }}>|</span>
            <span style={{ color: C.muted, fontSize: 11 }}>Méret:</span>
            <input type="range" min="2" max="30" value={brushSize} onChange={e => setBrushSize(+e.target.value)}
              style={{ width: 60, accentColor: C.accent }} />
            <span style={{ color: C.text, fontSize: 11, minWidth: 18 }}>{brushSize}</span>
          </>}
          <span style={{ color: C.muted, fontSize: 11, margin: '0 2px' }}>|</span>
          <button style={btnStyle(false)} onClick={handleUndo}>Vissza</button>
          {cropRect && <button style={btnStyle(false)} onClick={() => setCropRect(null)}>Vágás törlése</button>}
          <button style={btnStyle(false)} onClick={handleReset}>Reset</button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button style={{ ...btnStyle(false), color: C.muted }} onClick={onSkip}>
            Ugrás (nyers minta)
          </button>
          <button
            style={{ ...btnStyle(true), background: C.accent, color: '#000', fontWeight: 600 }}
            onClick={handleConfirm}
          >Keresés ezzel a mintával</button>
        </div>
      </div>
    </div>
  )
}
