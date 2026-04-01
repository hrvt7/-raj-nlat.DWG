import React, { useState, useEffect } from 'react'

// ─── Interactive scrollbars for PDF pan navigation ──────────────────────────
export default function PdfScrollbars({ viewRef, containerRef, renderTick, onPan }) {
  const [dragging, setDragging] = useState(null) // { axis: 'h'|'v', startMouse, startOffset }

  const v = viewRef.current
  const cw = containerRef.current?.clientWidth || 1
  const ch = containerRef.current?.clientHeight || 1
  const pw = v.pageWidth * v.zoom
  const ph = v.pageHeight * v.zoom
  const showH = pw > cw * 1.05
  const showV = ph > ch * 1.05

  // Thumb sizes
  const hThumbW = showH ? Math.max(40, cw * cw / pw) : 0
  const vThumbH = showV ? Math.max(40, ch * ch / ph) : 0
  // Thumb positions (0 to trackLen - thumbLen)
  const hTrackW = cw - (showV ? 20 : 8) - 8
  const vTrackH = ch - (showH ? 20 : 8) - 8
  const hPos = showH ? Math.max(0, Math.min(hTrackW - hThumbW, (hTrackW - hThumbW) * (-v.offsetX / Math.max(1, pw - cw)))) : 0
  const vPos = showV ? Math.max(0, Math.min(vTrackH - vThumbH, (vTrackH - vThumbH) * (-v.offsetY / Math.max(1, ph - ch)))) : 0

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const delta = dragging.axis === 'h'
        ? e.clientX - dragging.startMouse
        : e.clientY - dragging.startMouse
      const trackLen = dragging.axis === 'h' ? hTrackW : vTrackH
      const thumbLen = dragging.axis === 'h' ? hThumbW : vThumbH
      const pageLen = dragging.axis === 'h' ? pw : ph
      const viewLen = dragging.axis === 'h' ? cw : ch
      const ratio = delta / Math.max(1, trackLen - thumbLen)
      const panDelta = -ratio * (pageLen - viewLen)
      if (dragging.axis === 'h') {
        viewRef.current.offsetX = dragging.startOffset + panDelta
      } else {
        viewRef.current.offsetY = dragging.startOffset + panDelta
      }
      onPan(0, 0) // trigger redraw
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  const thumbStyle = { borderRadius: 4, cursor: 'pointer', transition: dragging ? 'none' : 'all 0.1s' }

  if (!showH && !showV) return null
  return <>
    {showH && <div style={{
      position: 'absolute', bottom: 2, left: 4, width: hTrackW, height: 10,
      borderRadius: 5, background: 'rgba(255,255,255,0.04)', zIndex: 8,
    }}
      onMouseDown={(e) => {
        // Click on track → jump to that position
        const rect = e.currentTarget.getBoundingClientRect()
        const clickPos = e.clientX - rect.left
        const ratio = clickPos / hTrackW
        viewRef.current.offsetX = -ratio * (pw - cw)
        onPan(0, 0)
      }}
    >
      <div style={{
        ...thumbStyle, position: 'absolute', top: 1, height: 8,
        background: dragging?.axis === 'h' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)',
        width: hThumbW, left: hPos,
      }}
        onMouseDown={(e) => { e.stopPropagation(); setDragging({ axis: 'h', startMouse: e.clientX, startOffset: viewRef.current.offsetX }) }}
      />
    </div>}
    {showV && <div style={{
      position: 'absolute', top: 4, right: 2, height: vTrackH, width: 10,
      borderRadius: 5, background: 'rgba(255,255,255,0.04)', zIndex: 8,
    }}
      onMouseDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const clickPos = e.clientY - rect.top
        const ratio = clickPos / vTrackH
        viewRef.current.offsetY = -ratio * (ph - ch)
        onPan(0, 0)
      }}
    >
      <div style={{
        ...thumbStyle, position: 'absolute', left: 1, width: 8,
        background: dragging?.axis === 'v' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)',
        height: vThumbH, top: vPos,
      }}
        onMouseDown={(e) => { e.stopPropagation(); setDragging({ axis: 'v', startMouse: e.clientY, startOffset: viewRef.current.offsetY }) }}
      />
    </div>}
  </>
}
