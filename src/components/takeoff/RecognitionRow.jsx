import React from 'react'
import { C } from './designTokens.js'
import { BLOCK_ASM_RULES } from '../../utils/blockRecognition.js'

// ─── Recognition row ──────────────────────────────────────────────────────────
export default function RecognitionRow({ item, asmOverrides, assemblies, onAccept, onOverride, onQtyChange, onDelete, isHighlighted, onHover }) {
  const [showDelete, setShowDelete] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [editVal, setEditVal] = React.useState(String(item.qty))
  const asmId = asmOverrides[item.blockName] !== undefined ? asmOverrides[item.blockName] : item.asmId
  const asm = assemblies.find(a => a.id === asmId)
  const rule = BLOCK_ASM_RULES.find(r => r.asmId === asmId)

  const confColor = item.confidence >= 0.8 ? C.accent : item.confidence >= 0.5 ? C.yellow : C.red
  const confPct = Math.round(item.confidence * 100)

  const handleQtyBlur = () => {
    setEditing(false)
    const v = parseInt(editVal, 10)
    if (!isNaN(v) && v > 0 && v !== item.qty) {
      onQtyChange?.(item.blockName, v)
    } else {
      setEditVal(String(item.qty))
    }
  }

  return (
    <div
      onMouseEnter={() => { onHover(item.blockName); setShowDelete(true) }}
      onMouseLeave={() => { onHover(null); setShowDelete(false) }}
      style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 4,
        background: isHighlighted ? 'rgba(0,229,160,0.08)' : C.bgCard,
        border: `1px solid ${isHighlighted ? C.accent : C.border}`,
        display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
        position: 'relative',
      }}
    >
      {/* Delete button — visible on hover */}
      {showDelete && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.blockName) }}
          title="Elem törlése"
          style={{
            position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
            background: C.red, border: `2px solid ${C.bgCard}`, color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, zIndex: 2,
          }}
        >×</button>
      )}

      {/* Confidence badge */}
      <div style={{
        width: 40, height: 20, borderRadius: 4, background: confColor + '22',
        border: `1px solid ${confColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Mono', fontSize: 10, color: confColor, fontWeight: 700, flexShrink: 0,
      }}>
        {confPct}%
      </div>

      {/* Block info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.blockName}
        </div>
        <div style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: C.text }}>
          {asm?.name || (asmId ? asmId : 'Ismeretlen')}
        </div>
      </div>

      {/* Editable count */}
      {editing ? (
        <input
          autoFocus
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={handleQtyBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleQtyBlur(); if (e.key === 'Escape') { setEditing(false); setEditVal(String(item.qty)) } }}
          style={{
            width: 52, fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.accent,
            background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 6,
            padding: '2px 6px', textAlign: 'right', outline: 'none',
          }}
        />
      ) : (
        <div
          onClick={() => { setEditing(true); setEditVal(String(item.qty)) }}
          title="Kattints a darabszám módosításához"
          style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, flexShrink: 0,
            cursor: 'pointer', padding: '2px 6px', borderRadius: 6,
            border: `1px solid transparent`, transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.borderLight}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
        >
          {item.qty} db
        </div>
      )}

      {/* Override select */}
      <select
        value={asmId || ''}
        onChange={e => onOverride(item.blockName, e.target.value || null)}
        style={{
          background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 6,
          color: C.textSub, fontSize: 11, padding: '3px 6px', fontFamily: 'DM Mono',
          cursor: 'pointer', maxWidth: 120,
        }}
      >
        <option value="">— Nincs —</option>
        {assemblies.filter(a => !a.variantOf).map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  )
}
