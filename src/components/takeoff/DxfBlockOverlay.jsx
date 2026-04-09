import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ASM_COLORS } from '../../utils/blockRecognition.js'

// ─── SVG Overlay for block positions — ISOLATION MODE ────────────────────────
// When a row is selected (highlight) or visibility-toggled (eye icon),
// non-matching dots are COMPLETELY HIDDEN — not dimmed.
// This creates true visual isolation for auditable review.

export default function DxfBlockOverlay({ inserts, asmOverrides, recognizedItems, highlightBlock, onBlockClick, canvasRef, visibleBlocks, visibleAsmIds }) {
  const svgRef = useRef(null)
  const [screenPositions, setScreenPositions] = useState([])

  const reproject = useCallback(() => {
    if (!canvasRef?.current || !inserts?.length) return

    // ── Coordinate space correction ──────────────────────────────────
    // sceneToScreen() returns pixel coords relative to the Three.js <canvas> element.
    // But this SVG overlay is positioned absolute:inset:0 inside the LEFT PANEL div,
    // which also contains the DxfViewerPanel (toolbar + canvas area).
    // The toolbar pushes the Three.js canvas DOWN, so we must measure the offset
    // between the renderer <canvas> and our SVG container and correct for it.
    let offsetX = 0, offsetY = 0
    const rendererEl = canvasRef.current.getRendererElement?.()
    const svgEl = svgRef.current
    if (rendererEl && svgEl) {
      const canvasRect = rendererEl.getBoundingClientRect()
      const svgRect = svgEl.getBoundingClientRect()
      offsetX = canvasRect.left - svgRect.left
      offsetY = canvasRect.top - svgRect.top
    }

    const projected = inserts.map(ins => {
      const screen = canvasRef.current.sceneToScreen(ins.x, ins.y)
      if (!screen) return null
      const sx = screen.x + offsetX
      const sy = screen.y + offsetY
      // Guard against NaN from degenerate camera projection (e.g. during load)
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
      return { ...ins, sx, sy }
    }).filter(Boolean)
    setScreenPositions(projected)
  }, [inserts, canvasRef])

  // Subscribe to viewer camera changes — retry until viewer is loaded
  useEffect(() => {
    let unsub = null
    let retryTimer = null
    let attempts = 0

    function trySubscribe() {
      attempts++
      const viewer = canvasRef?.current?.getViewer?.()
      if (!viewer) {
        if (attempts < 20) retryTimer = setTimeout(trySubscribe, 300)
        return
      }
      unsub = canvasRef.current.subscribe?.('viewChanged', reproject)
      reproject()
    }
    trySubscribe()

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      try { unsub?.() } catch {}
    }
  }, [reproject, canvasRef])

  useEffect(() => { reproject() }, [inserts, reproject])
  // Re-project when visibility or highlight changes
  useEffect(() => { reproject() }, [visibleAsmIds, visibleBlocks, highlightBlock])

  // ── Offset correction: re-reproject once SVG mounts ──
  // First reproject runs before SVG exists (svgRef=null → offset 0,0).
  // Once SVG mounts and screenPositions are set, reproject again with correct offset.
  const didCorrectOffset = useRef(false)
  useEffect(() => { didCorrectOffset.current = false }, [inserts]) // reset on new file
  useEffect(() => {
    if (svgRef.current && screenPositions.length > 0 && !didCorrectOffset.current) {
      didCorrectOffset.current = true
      // RAF to ensure layout is complete before measuring
      requestAnimationFrame(() => reproject())
    }
  }, [screenPositions.length, reproject])

  // Keep trying to project if we have inserts but no screen positions yet (viewer still loading)
  useEffect(() => {
    if (screenPositions.length > 0 || !inserts?.length) return
    const interval = setInterval(() => {
      reproject()
    }, 500)
    return () => clearInterval(interval)
  }, [screenPositions.length, inserts?.length, reproject])

  if (!screenPositions.length) return null

  // Build map: blockName → asmId
  const nameToAsm = {}
  for (const item of recognizedItems) {
    nameToAsm[item.blockName] = asmOverrides[item.blockName] ?? item.asmId
  }
  const highlightAsmId = highlightBlock ? (nameToAsm[highlightBlock] ?? null) : null

  // ── Isolation mode: is ANY row selected or visibility-toggled? ──
  const hasHighlight = !!highlightBlock
  const hasVisible = (visibleAsmIds && visibleAsmIds.size > 0) || (visibleBlocks && visibleBlocks.size > 0)
  const isolateMode = hasHighlight || hasVisible

  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
      width="100%" height="100%"
    >
      <defs>
        <filter id="hit-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {screenPositions.map((ins, i) => {
        const asmId = nameToAsm[ins.name] ?? null
        const color = ASM_COLORS[asmId] || ASM_COLORS[null]

        // Determine if this dot is part of a selected/visible set
        const isHighlighted = highlightBlock === ins.name || (highlightAsmId && asmId === highlightAsmId)
        const isVisible = (visibleBlocks?.has(ins.name)) || (visibleAsmIds?.has(asmId))
        const isActive = isHighlighted || isVisible

        // ── ISOLATION: if any row is active, non-active dots are HIDDEN ──
        if (isolateMode && !isActive) return null

        // ── Normal mode (no isolation): show all dots normally ──
        if (!isolateMode) {
          return (
            <g key={i} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
               onClick={() => onBlockClick(ins.name)}>
              <circle cx={ins.sx} cy={ins.sy} r={12} fill="transparent" />
              <circle cx={ins.sx} cy={ins.sy} r={7}
                fill={color} fillOpacity={0.8}
                stroke="#fff" strokeWidth={1} strokeOpacity={0.5}
              />
            </g>
          )
        }

        // ── Isolated active dot: large, high-contrast, unmistakable ──
        const activeColor = isHighlighted ? '#4CC9F0' : color
        return (
          <g key={i} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
             onClick={() => onBlockClick(ins.name)}>
            {/* Outer glow ring */}
            <circle cx={ins.sx} cy={ins.sy} r={18} fill={activeColor} fillOpacity={0.08}
              filter="url(#hit-glow)" />
            {/* Mid ring for emphasis */}
            <circle cx={ins.sx} cy={ins.sy} r={12}
              fill="none" stroke={activeColor} strokeWidth={1.5} strokeOpacity={0.4} />
            {/* Solid core */}
            <circle cx={ins.sx} cy={ins.sy} r={7}
              fill={activeColor} fillOpacity={0.95}
              stroke="#fff" strokeWidth={2.5}
            />
            {/* Pulse animation for highlighted (hover/click) */}
            {isHighlighted && (
              <circle cx={ins.sx} cy={ins.sy} r={14} fill="none"
                stroke={activeColor} strokeWidth={1} strokeOpacity={0.5}>
                <animate attributeName="r" values="12;20;12" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="strokeOpacity" values="0.5;0.1;0.5" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Hit target */}
            <circle cx={ins.sx} cy={ins.sy} r={20} fill="transparent" />
          </g>
        )
      })}
    </svg>
  )
}
