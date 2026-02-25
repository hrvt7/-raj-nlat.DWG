import React from 'react'

const C = { accent: '#00E5A0', bg: '#09090B', red: '#FF6B6B' }

// Renders count badges at click positions on top of the canvas
export default function DxfCountOverlay({ countMarkers, onRemoveMarker }) {
  if (!countMarkers || countMarkers.length === 0) return null

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', zIndex: 4, overflow: 'hidden',
    }}>
      {countMarkers.map((marker, i) => (
        <div
          key={marker.id || i}
          style={{
            position: 'absolute',
            left: marker.screenX - 12,
            top: marker.screenY - 12,
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          title={`Számláló #${i + 1} — jobb klikk a törléshez`}
          onContextMenu={e => {
            e.preventDefault()
            if (onRemoveMarker) onRemoveMarker(marker.id || i)
          }}
        >
          {/* Badge */}
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: C.accent, color: C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, fontFamily: 'DM Mono',
            boxShadow: '0 2px 8px rgba(0,229,160,0.4)',
            border: '2px solid rgba(255,255,255,0.2)',
          }}>
            {i + 1}
          </div>
        </div>
      ))}
    </div>
  )
}
