import React from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A',
}

const TOOLS = [
  { id: 'select',  icon: '🔍', label: 'Azonosítás', desc: 'Kattints egy elemre az azonosításhoz' },
  { id: 'count',   icon: '🔢', label: 'Számlálás',  desc: 'Kattints az elemekre számláláshoz' },
  { id: 'measure', icon: '📏', label: 'Mérés',      desc: 'Két pont közötti távolság mérése' },
]

export default function DxfToolbar({ activeTool, onToolChange, onFitView, onToggleLayers, layersPanelOpen, counts }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '6px 8px', background: C.bgCard,
      borderBottom: `1px solid ${C.border}`,
      borderRadius: '8px 8px 0 0',
    }}>
      {/* Tool buttons */}
      {TOOLS.map(tool => {
        const isActive = activeTool === tool.id
        const countVal = tool.id === 'count' && counts ? Object.values(counts).reduce((s, c) => s + c, 0) : null
        return (
          <button
            key={tool.id}
            onClick={() => onToolChange(isActive ? null : tool.id)}
            title={tool.desc}
            style={{
              position: 'relative',
              padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, fontFamily: 'Syne', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
              background: isActive ? 'rgba(0,229,160,0.12)' : 'transparent',
              border: `1px solid ${isActive ? 'rgba(0,229,160,0.3)' : 'transparent'}`,
              color: isActive ? C.accent : C.text,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14 }}>{tool.icon}</span>
            <span>{tool.label}</span>
            {countVal > 0 && (
              <span style={{
                background: C.accent, color: C.bg,
                borderRadius: 10, padding: '1px 6px',
                fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono',
              }}>{countVal}</span>
            )}
          </button>
        )
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Layer toggle */}
      <button
        onClick={onToggleLayers}
        title="Rétegek"
        style={{
          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
          fontSize: 13, fontFamily: 'Syne', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
          background: layersPanelOpen ? 'rgba(76,201,240,0.12)' : 'transparent',
          border: `1px solid ${layersPanelOpen ? 'rgba(76,201,240,0.3)' : 'transparent'}`,
          color: layersPanelOpen ? C.blue : C.muted,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 14 }}>◑</span>
        <span>Rétegek</span>
      </button>

      {/* Fit view */}
      <button
        onClick={onFitView}
        title="Teljes nézet"
        style={{
          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
          fontSize: 13, fontFamily: 'Syne', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'transparent',
          border: '1px solid transparent',
          color: C.muted,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 14 }}>⊞</span>
        <span>Igazítás</span>
      </button>
    </div>
  )
}
