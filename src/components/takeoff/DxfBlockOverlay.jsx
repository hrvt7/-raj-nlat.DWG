import React, { useState, useRef, useCallback, useEffect } from 'react'
import { C } from './designTokens.js'
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

  // Build a map from blockName → asmId
  const nameToAsm = {}
  for (const item of recognizedItems) {
    nameToAsm[item.blockName] = asmOverrides[item.blockName] ?? item.asmId
  }

  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
      width="100%" height="100%"
    >
      {screenPositions.map((ins, i) => {
        const asmId = nameToAsm[ins.name] ?? null
        const color = ASM_COLORS[asmId] || ASM_COLORS[null]
        const isHighlighted = highlightBlock === ins.name
        const r = isHighlighted ? 9 : 6
        return (
          <g key={i} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
             onClick={() => onBlockClick(ins.name)}>
            <circle cx={ins.sx} cy={ins.sy} r={r + 3} fill="transparent" />
            <circle
              cx={ins.sx} cy={ins.sy} r={r}
              fill={color} fillOpacity={isHighlighted ? 0.9 : 0.65}
              stroke={isHighlighted ? '#fff' : color}
              strokeWidth={isHighlighted ? 2 : 1}
            />
          </g>
        )
      })}
    </svg>
  )
}
