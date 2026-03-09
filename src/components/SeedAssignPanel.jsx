// ─── SeedAssignPanel ─────────────────────────────────────────────────────────
// Inline panel shown after a seed capture in Azonosítás mode.
// Lets the user assign an assembly to the captured symbol region.
//
// Props:
//   seed       — { bbox, pageNum, cropDataUrl, textHints }
//   assemblies — full assembly catalog
//   onSave     — (assemblyId, label, scope) → void
//   onCancel   — () → void
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react'
import { RECIPE_SCOPE } from '../data/recipeStore.js'

const C = {
  bg: '#09090B', bgCard: '#111113', bgHover: '#17171A',
  border: '#1E1E22', borderLight: '#2A2A30',
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.12)',
  yellow: '#FFD166', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

const ASM_CATEGORY_GROUPS = [
  { key: 'szerelvenyek', label: 'Szerelvények', color: '#4CC9F0' },
  { key: 'vilagitas', label: 'Világítás', color: '#00E5A0' },
  { key: 'elosztok', label: 'Elosztók / Védelem', color: '#FF6B6B' },
  { key: 'gyengaram', label: 'Gyengeáram', color: '#A78BFA' },
  { key: 'tuzjelzo', label: 'Tűzjelző', color: '#FF8C42' },
]

export default function SeedAssignPanel({ seed, assemblies, onSave, onCancel }) {
  const [selectedAsm, setSelectedAsm] = useState(null)
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState(RECIPE_SCOPE.WHOLE_PLAN)
  const panelRef = useRef(null)

  // Focus panel on mount
  useEffect(() => {
    if (panelRef.current) panelRef.current.focus()
  }, [])

  // Only countSelectable, non-variant assemblies
  const mainAssemblies = (assemblies || []).filter(a => !a.variantOf && a.countSelectable)

  const canSave = !!selectedAsm

  const handleSave = () => {
    if (!canSave) return
    onSave(selectedAsm, label.trim(), scope)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && canSave) handleSave()
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute', top: 44, left: 8, right: 8, zIndex: 80,
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex', gap: 12,
      }}
    >
      {/* Left: crop preview */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {seed?.cropDataUrl ? (
          <img
            src={seed.cropDataUrl}
            alt="Seed preview"
            style={{
              width: 72, height: 72, objectFit: 'contain',
              border: `1px solid ${C.border}`, borderRadius: 6,
              background: '#000',
            }}
          />
        ) : (
          <div style={{
            width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${C.border}`, borderRadius: 6, background: '#000',
            color: C.muted, fontSize: 10, fontFamily: 'DM Mono',
          }}>
            Nincs kép
          </div>
        )}
        <div style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, textAlign: 'center' }}>
          {seed?.bbox ? `${Math.round(seed.bbox.w)}×${Math.round(seed.bbox.h)} px` : ''}
        </div>
        {seed?.textHints?.length > 0 && (
          <div style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.yellow, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            💡 {seed.textHints[0]}
          </div>
        )}
      </div>

      {/* Right: assignment form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontFamily: 'Syne', fontWeight: 700, color: C.accent }}>
          Szerelvény hozzárendelése
        </div>
        <div style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, marginTop: -2 }}>
          Válassz szerelvényt, majd mentsd mintaként
        </div>

        {/* Assembly groups */}
        <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, padding: 4 }}>
          {ASM_CATEGORY_GROUPS.map(grp => {
            const grpAsms = mainAssemblies.filter(a => a.category === grp.key)
            if (!grpAsms.length) return null
            return (
              <div key={grp.key} style={{ marginBottom: 2 }}>
                <div style={{
                  fontSize: 9, fontFamily: 'Syne', fontWeight: 700,
                  color: grp.color, letterSpacing: '0.05em', textTransform: 'uppercase',
                  padding: '4px 8px 2px',
                }}>
                  {grp.label}
                </div>
                {grpAsms.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAsm(a.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 4,
                      border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono',
                      background: selectedAsm === a.id ? `${grp.color}22` : 'transparent',
                      color: selectedAsm === a.id ? grp.color : C.textSub,
                      fontWeight: selectedAsm === a.id ? 700 : 400,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: selectedAsm === a.id ? grp.color : '#444',
                    }} />
                    {a.name}
                    {selectedAsm === a.id && <span style={{ marginLeft: 'auto', fontSize: 9 }}>✓</span>}
                  </button>
                ))}
              </div>
            )
          })}
        </div>

        {/* Label input */}
        <input
          type="text"
          placeholder="Címke / megjegyzés (opcionális)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.bg, color: C.text, fontSize: 11, fontFamily: 'DM Mono',
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />

        {/* Scope selector */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted }}>Hatókör:</span>
          {[
            { key: RECIPE_SCOPE.CURRENT_PAGE, label: 'Aktuális oldal' },
            { key: RECIPE_SCOPE.WHOLE_PLAN, label: 'Teljes terv' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono',
                cursor: 'pointer',
                background: scope === s.key ? C.accentDim : 'transparent',
                border: `1px solid ${scope === s.key ? 'rgba(0,229,160,0.3)' : C.border}`,
                color: scope === s.key ? C.accent : C.muted,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.muted, fontSize: 11, fontFamily: 'Syne', fontWeight: 600,
            }}
          >
            Mégse
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: canSave ? 'pointer' : 'not-allowed',
              background: canSave ? C.accent : '#333',
              border: 'none',
              color: canSave ? C.bg : C.muted,
              fontSize: 11, fontFamily: 'Syne', fontWeight: 700,
              opacity: canSave ? 1 : 0.5,
            }}
          >
            Mentés mint projektminta
          </button>
        </div>
      </div>
    </div>
  )
}
