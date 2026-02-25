import React, { useState } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', text: '#E4E4E7', muted: '#71717A', blue: '#4CC9F0',
  textSub: '#9CA3AF',
}

export default function DxfLayerPanel({ layers, layerVisibility, onToggleLayer, onShowAll, onHideAll }) {
  const [search, setSearch] = useState('')

  const filtered = layers.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.displayName || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{
      position: 'absolute', right: 8, top: 44, bottom: 8,
      width: 240, background: C.bgCard,
      border: `1px solid ${C.border}`, borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      zIndex: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: C.blue, fontSize: 13, fontFamily: 'Syne', fontWeight: 700 }}>
          Rétegek ({layers.length})
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onShowAll} style={{
            background: 'transparent', border: 'none', color: C.accent,
            fontSize: 10, fontFamily: 'DM Mono', cursor: 'pointer', padding: '2px 4px',
          }}>Mind ✓</button>
          <button onClick={onHideAll} style={{
            background: 'transparent', border: 'none', color: C.muted,
            fontSize: 10, fontFamily: 'DM Mono', cursor: 'pointer', padding: '2px 4px',
          }}>Mind ✕</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Keresés..."
          style={{
            width: '100%', background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '6px 10px', color: C.text,
            fontSize: 12, fontFamily: 'DM Mono', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Layer list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 6px' }}>
        {filtered.map(layer => {
          const visible = layerVisibility[layer.name] !== false
          const color = layer.color != null ? '#' + (layer.color & 0xFFFFFF).toString(16).padStart(6, '0') : C.muted
          return (
            <button
              key={layer.name}
              onClick={() => onToggleLayer(layer.name)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
                background: visible ? 'transparent' : 'rgba(255,255,255,0.02)',
                border: '1px solid transparent',
                opacity: visible ? 1 : 0.4,
                transition: 'opacity 0.15s',
              }}
            >
              {/* Color swatch */}
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: color, flexShrink: 0,
                border: `1px solid ${C.border}`,
              }} />
              {/* Name */}
              <span style={{
                flex: 1, textAlign: 'left', fontSize: 11,
                fontFamily: 'DM Mono', color: visible ? C.text : C.muted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {layer.displayName || layer.name}
              </span>
              {/* Toggle indicator */}
              <span style={{ fontSize: 10, color: visible ? C.accent : C.muted }}>
                {visible ? '●' : '○'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
