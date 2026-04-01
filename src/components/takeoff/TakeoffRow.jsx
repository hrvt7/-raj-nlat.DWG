import React, { useState } from 'react'
import { C } from './designTokens.js'
import { ASM_COLORS } from '../../utils/blockRecognition.js'

// ─── Wall type options ────────────────────────────────────────────────────────
export const WALL_OPTS = [
  { key: 'drywall',  label: 'GK',    color: '#00E5A0' },
  { key: 'ytong',    label: 'Ytong', color: '#FFD166' },
  { key: 'brick',    label: 'Tégla', color: '#FF9A3C' },
  { key: 'concrete', label: 'Beton', color: '#FF6B6B' },
]

// ─── Takeoff row ──────────────────────────────────────────────────────────────
export default function TakeoffRow({ asmId, qty, variantId, wallSplits, assemblies, onSplitChange, onVariantChange, unitCostByWall, isHighlighted, onDelete, memoryTier, signalType }) {
  const [hovered, setHovered] = useState(false)
  const asm = assemblies.find(a => a.id === asmId)
  const variants = assemblies.filter(a => a.variantOf === asmId)

  // Category color from ASM_COLORS
  const dotColor = ASM_COLORS[asmId] || C.muted

  // If no splits set yet, treat all qty as brick
  const effectiveSplits = wallSplits || { brick: qty }
  const totalQty = Object.values(effectiveSplits).reduce((s, n) => s + n, 0)

  // Total price = Σ(splitQty × unitCostByWall[wallKey])
  const costs = unitCostByWall || {}
  const totalPrice = Object.entries(effectiveSplits).reduce(
    (s, [wk, n]) => s + n * (costs[wk] ?? costs.brick ?? 0), 0
  )

  const handleDelta = (wallKey, delta) => {
    // On first interaction, initialize full splits from current qty
    const base = wallSplits || { brick: qty }
    const current = base[wallKey] ?? 0
    const newVal = Math.max(0, current + delta)
    const updated = { ...base, [wallKey]: newVal }

    // If adding to a non-default wall type and base was just initialized,
    // reduce brick to keep total = qty (move items between wall types, don't add new)
    if (!wallSplits && wallKey !== 'brick' && delta > 0) {
      updated.brick = Math.max(0, (updated.brick || 0) - delta)
    }
    onSplitChange(asmId, updated)
  }

  if (!asm) return null

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '10px 14px', borderRadius: 8, marginBottom: 6,
        background: isHighlighted ? 'rgba(0,229,160,0.06)' : C.bgCard,
        border: `1px solid ${isHighlighted ? C.accent + '60' : C.border}`,
      }}
    >
      {/* ── Delete button (hover-reveal) ── */}
      {hovered && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(asmId) }}
          title="Elem törlése"
          style={{
            position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
            background: C.red, border: `2px solid ${C.bgCard}`, color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, zIndex: 2,
          }}
        >&times;</button>
      )}

      {/* ── Top row: color dot / name / total qty / total price ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          {asm.name}
          {memoryTier && (
            <span style={{
              fontSize: 9, fontFamily: 'DM Mono', fontWeight: 600,
              padding: '1px 5px', borderRadius: 4, flexShrink: 0,
              background: memoryTier === 'account' ? 'rgba(76,201,240,0.12)' : 'rgba(0,229,160,0.12)',
              color: memoryTier === 'account' ? '#4CC9F0' : C.accent,
            }}>
              {memoryTier === 'account' ? 'Fiók memória' : memoryTier === 'project' ? 'Projekt memória' : 'Globális javaslat'}
            </span>
          )}
          {signalType && signalType !== 'block_name' && (
            <span style={{
              fontSize: 9, fontFamily: 'DM Mono', fontWeight: 600,
              padding: '1px 5px', borderRadius: 4, flexShrink: 0,
              background: 'rgba(255,209,102,0.12)',
              color: '#FFD166',
            }}>
              {signalType === 'layer_name' ? 'Réteg' :
               signalType === 'attribute_signature' ? 'Attribútum' :
               signalType === 'nearby_text' ? 'Szöveg' :
               signalType === 'hybrid' ? 'Több jel' : null}
            </span>
          )}
        </div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, flexShrink: 0 }}>
          {totalQty} db
        </span>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent, minWidth: 72, textAlign: 'right', flexShrink: 0 }}>
          {Math.round(totalPrice).toLocaleString('hu-HU')} Ft
        </div>
      </div>

      {/* ── Per-wall-type split counters ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {WALL_OPTS.map(w => {
          const n = effectiveSplits[w.key] || 0
          const active = n > 0
          return (
            <div key={w.key} style={{
              display: 'flex', alignItems: 'center', gap: 1,
              padding: '2px 5px', borderRadius: 6,
              background: active ? w.color + '15' : 'transparent',
              border: `1px solid ${active ? w.color + '55' : C.border}`,
              transition: 'all 0.12s',
            }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: active ? w.color : C.muted, minWidth: 26, userSelect: 'none' }}>
                {w.label}
              </span>
              <button
                onClick={() => handleDelta(w.key, -1)}
                style={{ width: 17, height: 17, borderRadius: 3, background: 'transparent', border: 'none', color: active ? w.color : C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >−</button>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: active ? w.color : C.muted, minWidth: 16, textAlign: 'center', userSelect: 'none' }}>
                {n}
              </span>
              <button
                onClick={() => handleDelta(w.key, +1)}
                style={{ width: 17, height: 17, borderRadius: 3, background: 'transparent', border: 'none', color: active ? w.color : C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >+</button>
            </div>
          )
        })}
        {variants.length > 0 && (
          <select value={variantId || ''} onChange={e => onVariantChange(asmId, e.target.value || null)}
            style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 4, color: C.textSub, fontSize: 10, padding: '1px 4px', fontFamily: 'DM Mono', cursor: 'pointer' }}>
            <option value="">Standard</option>
            {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
