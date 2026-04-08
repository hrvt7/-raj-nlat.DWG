import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ASM_COLORS } from '../../utils/blockRecognition.js'

// ─── SVG Overlay for block positions ─────────────────────────────────────────
export default function DxfBlockOverlay({ inserts, asmOverrides, recognizedItems, highlightBlock, onBlockClick, canvasRef }) {
  const svgRef = useRef(null)
  const [screenPositions, setScreenPositions] = useState([])

  const reproject = useCallback(() => {
    if (!canvasRef?.current || !inserts?.length || !svgRef.current) return
    const projected = inserts.map(ins => {
      const screen = canvasRef.current.sceneToScreen(ins.x, ins.y)
      return screen ? { ...ins, sx: screen.x, sy: screen.y } : null
    }).filter(Boolean)
    setScreenPositions(projected)
  }, [inserts, canvasRef])

  useEffect(() => {
    const viewer = canvasRef?.current?.getViewer?.()
    if (!viewer) return
    // Re-project on camera changes
    const unsub = canvasRef.current.subscribe?.('viewChanged', reproject)
    reproject()
    return () => { try { unsub?.() } catch {} }
  }, [reproject, canvasRef])

  // Also re-project when inserts change
  useEffect(() => { reproject() }, [inserts, reproject])

  if (!screenPositions.length) return null

  // Build maps: blockName → asmId, and asmId for highlightBlock
  const nameToAsm = {}
  for (const item of recognizedItems) {
    nameToAsm[item.blockName] = asmOverrides[item.blockName] ?? item.asmId
  }
  // Resolve highlighted asmId so we can highlight ALL blocks for same assembly
  const highlightAsmId = highlightBlock ? (nameToAsm[highlightBlock] ?? null) : null

  const anyHighlighted = !!highlightBlock

  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
      width="100%" height="100%"
    >
      {/* Glow filter for highlighted dots */}
      <defs>
        <filter id="highlight-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Render non-highlighted dots first (dimmed when something is highlighted) */}
      {screenPositions.map((ins, i) => {
        const asmId = nameToAsm[ins.name] ?? null
        const color = ASM_COLORS[asmId] || ASM_COLORS[null]
        const isHighlighted = highlightBlock === ins.name || (highlightAsmId && asmId === highlightAsmId)
        if (isHighlighted) return null // render highlighted dots separately on top
        return (
          <g key={i} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
             onClick={() => onBlockClick(ins.name)}>
            <circle cx={ins.sx} cy={ins.sy} r={9} fill="transparent" />
            <circle
              cx={ins.sx} cy={ins.sy} r={5}
              fill={color} fillOpacity={anyHighlighted ? 0.15 : 0.65}
              stroke={color} strokeWidth={1} strokeOpacity={anyHighlighted ? 0.2 : 1}
            />
          </g>
        )
      })}

      {/* Render highlighted dots on top — larger, glowing, pulsing */}
      {screenPositions.map((ins, i) => {
        const asmId = nameToAsm[ins.name] ?? null
        const isHighlighted = highlightBlock === ins.name || (highlightAsmId && asmId === highlightAsmId)
        if (!isHighlighted) return null
        const hlColor = '#4CC9F0' // bright blue for maximum contrast
        return (
          <g key={`hl-${i}`} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
             onClick={() => onBlockClick(ins.name)}>
            {/* Outer glow ring */}
            <circle cx={ins.sx} cy={ins.sy} r={16} fill={hlColor} fillOpacity={0.12}
              filter="url(#highlight-glow)">
              <animate attributeName="r" values="14;18;14" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="fillOpacity" values="0.12;0.06;0.12" dur="1.5s" repeatCount="indefinite" />
            </circle>
            {/* Solid inner dot */}
            <circle cx={ins.sx} cy={ins.sy} r={8}
              fill={hlColor} fillOpacity={0.95}
              stroke="#fff" strokeWidth={2.5}
            />
            {/* Hit target for click */}
            <circle cx={ins.sx} cy={ins.sy} r={18} fill="transparent" />
          </g>
        )
      })}
    </svg>
  )
}
