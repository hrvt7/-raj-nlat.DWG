import React, { useState } from 'react'
import { C } from './designTokens.js'
import { ASM_COLORS } from '../../utils/blockRecognition.js'

// Category → color (consistent across all assemblies, not just 4 hardcoded IDs)
const CATEGORY_COLORS = {
  'szerelvenyek': '#4CC9F0', // blue
  'vilagitas':    '#00E5A0', // green
  'elosztok':     '#FF6B6B', // red
  'gyengaram':    '#A78BFA', // purple
  'tuzjelzo':     '#FF8C42', // orange
  'kabeltalca':   '#78909C', // gray-blue
  'kabelezes':    '#06D6A0', // teal
  'meres':        '#FFD166', // yellow
}

// ─── Wall type options ────────────────────────────────────────────────────────
export const WALL_OPTS = [
  { key: 'drywall',  label: 'GK',    color: '#00E5A0' },
  { key: 'ytong',    label: 'Ytong', color: '#FFD166' },
  { key: 'brick',    label: 'Tégla', color: '#FF9A3C' },
  { key: 'concrete', label: 'Beton', color: '#FF6B6B' },
]

// ─── Inline mini-input ───────────────────────────────────────────────────────
const miniInputStyle = {
  background: '#0D0D0F', border: `1px solid #2A2A30`, borderRadius: 4,
  color: '#E4E4E7', fontFamily: 'DM Mono', fontSize: 11,
  padding: '3px 6px', outline: 'none', boxSizing: 'border-box',
}

// ─── Custom takeoff row (Egyéni tétel) — editable ─────────────────────────────
function CustomTakeoffRow({ row, onDelete, meta, onMetaChange }) {
  const [hovered, setHovered] = useState(false)
  const name = meta?.name || ''
  const unit = meta?.unit || 'db'
  const unitPrice = meta?.unitPrice ?? 0
  const totalPrice = row.qty * unitPrice

  const update = (field, value) => {
    onMetaChange(row._customItemId, { ...meta, name, unit, unitPrice, [field]: value })
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '10px 14px', borderRadius: 8, marginBottom: 6,
        background: C.bgCard,
        border: `1px solid ${'#A78BFA'}40`,
      }}
    >
      {hovered && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(row._customItemId) }}
          title="Egyéni tétel törlése"
          style={{
            position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
            background: C.red, border: `2px solid ${C.bgCard}`, color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, zIndex: 2,
          }}
        >&times;</button>
      )}

      {/* ── Top row: dot / name input / badge / qty / total ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A78BFA', flexShrink: 0 }} />
        <input
          value={name}
          onChange={e => update('name', e.target.value)}
          placeholder="Tétel megnevezése…"
          style={{ ...miniInputStyle, flex: 1, fontFamily: 'Syne', fontWeight: 700, fontSize: 13 }}
        />
        <span style={{
          fontSize: 9, fontFamily: 'DM Mono', fontWeight: 600,
          padding: '1px 5px', borderRadius: 4, flexShrink: 0,
          background: 'rgba(167,139,250,0.12)', color: '#A78BFA',
        }}>
          Egyéni
        </span>
        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, flexShrink: 0 }}>
          {row.qty} {unit}
        </span>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: totalPrice > 0 ? '#A78BFA' : C.muted, minWidth: 72, textAlign: 'right', flexShrink: 0 }}>
          {totalPrice > 0 ? `${Math.round(totalPrice).toLocaleString('hu-HU')} Ft` : '—'}
        </div>
      </div>

      {/* ── Bottom row: unit + unitPrice inputs ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>Egység:</span>
          <input
            value={unit}
            onChange={e => update('unit', e.target.value)}
            style={{ ...miniInputStyle, width: 50, textAlign: 'center' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>Egységár:</span>
          <input
            type="number"
            value={unitPrice || ''}
            onChange={e => update('unitPrice', e.target.value === '' ? 0 : Number(e.target.value))}
            placeholder="0"
            min={0}
            step={100}
            style={{ ...miniInputStyle, width: 80, textAlign: 'right' }}
          />
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>Ft/{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Takeoff row ──────────────────────────────────────────────────────────────
export default function TakeoffRow({ asmId, qty, variantId, wallSplits, assemblies, onSplitChange, onVariantChange, unitCostByWall, isHighlighted, onDelete, memoryTier, signalType, row, customMeta, onCustomMetaChange, onRowHover, isVisible, onToggleVisibility }) {
  const [hovered, setHovered] = useState(false)

  // ── Custom row render (hooks called above, safe) ──
  if (row?._sourceType === 'custom') {
    return <CustomTakeoffRow row={row} onDelete={onDelete} meta={customMeta} onMetaChange={onCustomMetaChange} />
  }

  const asm = assemblies.find(a => a.id === asmId)
  const variants = assemblies.filter(a => a.variantOf === asmId)

  // Category color: prefer per-ID (legacy 4), then per-category, then muted
  const dotColor = ASM_COLORS[asmId] || CATEGORY_COLORS[asm?.category] || C.muted

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
      onMouseEnter={() => { setHovered(true); onRowHover?.(asmId) }}
      onMouseLeave={() => { setHovered(false); onRowHover?.(null) }}
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

      {/* ── Top row: color dot / visibility toggle / name / total qty / total price ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/* Visibility eye toggle */}
        {onToggleVisibility && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(asmId) }}
            title={isVisible ? 'Találatok elrejtése' : 'Találatok mutatása a rajzon'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 13, lineHeight: 1, color: isVisible ? C.accent : C.muted,
              opacity: isVisible ? 1 : 0.4, transition: 'opacity 0.15s, color 0.15s',
              flexShrink: 0,
            }}
          >{isVisible ? '👁' : '👁‍🗨'}</button>
        )}
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
