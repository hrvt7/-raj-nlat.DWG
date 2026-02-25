import React from 'react'

const C = { yellow: '#FFD166', bg: '#09090B', text: '#E4E4E7', muted: '#71717A' }

// Renders measurement lines between two points on top of the canvas
export default function DxfMeasureOverlay({ measurements, activeMeasure, unitFactor, unitName }) {
  const factor = unitFactor || 0.001 // default mm → m

  if ((!measurements || measurements.length === 0) && !activeMeasure) return null

  const allLines = [...(measurements || [])]
  if (activeMeasure?.start) {
    allLines.push(activeMeasure)
  }

  return (
    <svg
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', zIndex: 3,
        width: '100%', height: '100%',
      }}
    >
      {allLines.map((m, i) => {
        if (!m.start) return null
        const hasEnd = m.end
        const x1 = m.start.screenX
        const y1 = m.start.screenY
        const x2 = hasEnd ? m.end.screenX : (m.currentScreenX || x1)
        const y2 = hasEnd ? m.end.screenY : (m.currentScreenY || y1)

        // Calculate distance in scene coords (meters)
        let distLabel = ''
        if (hasEnd && m.start.sceneX != null) {
          const dx = m.end.sceneX - m.start.sceneX
          const dy = m.end.sceneY - m.start.sceneY
          const distRaw = Math.sqrt(dx * dx + dy * dy)
          const distM = distRaw * factor
          distLabel = distM < 1 ? `${(distM * 1000).toFixed(0)} mm` :
                      distM < 10 ? `${distM.toFixed(2)} m` :
                      `${distM.toFixed(1)} m`
        }

        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2

        return (
          <g key={i}>
            {/* Line */}
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={C.yellow} strokeWidth={2}
              strokeDasharray={hasEnd ? 'none' : '6 4'}
              opacity={0.9}
            />
            {/* Start dot */}
            <circle cx={x1} cy={y1} r={4} fill={C.yellow} stroke={C.bg} strokeWidth={1.5} />
            {/* End dot */}
            {hasEnd && <circle cx={x2} cy={y2} r={4} fill={C.yellow} stroke={C.bg} strokeWidth={1.5} />}
            {/* Distance label */}
            {distLabel && (
              <>
                <rect
                  x={midX - 36} y={midY - 14}
                  width={72} height={22}
                  rx={5} fill="rgba(9,9,11,0.85)"
                  stroke={C.yellow} strokeWidth={1}
                />
                <text
                  x={midX} y={midY + 1}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={C.yellow}
                  style={{ fontSize: 11, fontFamily: 'DM Mono', fontWeight: 700 }}
                >
                  {distLabel}
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
