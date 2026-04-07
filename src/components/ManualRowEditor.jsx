// ─── ManualRowEditor — Inline editable table for manual pricing rows ─────────
// Used by QuoteView when quote.pricingMode === 'manual'.
// Edit source of truth: manualRows array (from quote.manualRows).
// Derived fields (materialCost, laborCost, lineTotal) computed via helpers.

import React, { useState, useRef, useCallback } from 'react'
import { C, fmt } from './ui.jsx'
import {
  createManualRow,
  rowLineTotal,
  computeManualTotals,
} from '../utils/manualPricingRow.js'

// ─── Inline editable cell ────────────────────────────────────────────────────
function EditableCell({ value, onChange, type = 'text', placeholder = '', align = 'left', mono = true, step }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  const commit = () => {
    setEditing(false)
    const parsed = type === 'number' ? (draft === '' ? 0 : Number(draft)) : draft
    if (parsed !== value) onChange(parsed)
  }

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type={type}
        step={step}
        value={draft}
        onChange={e => setDraft(type === 'number' ? e.target.value : e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
          if (e.key === 'Tab') { commit() }
        }}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '4px 6px', borderRadius: 4,
          background: C.bg, border: `1px solid ${C.accent}60`,
          color: C.text, textAlign: align,
          fontFamily: mono ? 'DM Mono' : 'Syne', fontSize: 12,
          outline: 'none',
        }}
      />
    )
  }

  const displayVal = type === 'number'
    ? (value === 0 || value === '' ? '—' : (typeof value === 'number' ? value.toLocaleString('hu-HU') : value))
    : (value || '—')

  return (
    <div
      onClick={startEdit}
      title="Kattints a szerkesztéshez"
      style={{
        cursor: 'text', padding: '4px 6px', borderRadius: 4,
        textAlign: align,
        fontFamily: mono ? 'DM Mono' : 'Syne', fontSize: 12,
        color: value ? C.text : C.muted,
        border: '1px solid transparent',
        transition: 'border-color 0.15s',
        minHeight: 20,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = C.border}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
    >
      {displayVal}
    </div>
  )
}

// ─── Single table section (Munkák or Anyagok) ───────────────────────────────
function ManualRowTable({ title, accentColor, rows, rowType, hourlyRate, onUpdateRow, onDeleteRow, onAddRow }) {
  const headers = rowType === 'labor'
    ? ['Megnevezés', 'Mennyiség', 'Egység', 'Munkaóra', 'Összesen', '']
    : ['Megnevezés', 'Mennyiség', 'Egység', 'Egységár', 'Összesen', '']

  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 3, height: 18, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 14, color: C.text }}>{title}</span>
          <span style={{
            fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: '2px 8px',
          }}>{rows.length} tétel</span>
        </div>
        <button
          onClick={onAddRow}
          style={{
            padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
            background: accentColor + '18', border: `1px solid ${accentColor}40`,
            color: accentColor, fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
          }}
        >
          + Új sor
        </button>
      </div>

      {/* Table */}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {headers.map((h, i) => (
                  <th key={h || 'action'} style={{
                    padding: '8px 14px', fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
                    textAlign: i === 0 ? 'left' : 'right', fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    borderBottom: `1px solid ${C.border}`,
                    width: i === headers.length - 1 ? 36 : undefined,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const total = rowLineTotal(row, hourlyRate)
                return (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    {/* Name */}
                    <td style={{ padding: '6px 14px' }}>
                      <EditableCell
                        value={row.name} mono={false} placeholder="Megnevezés…"
                        onChange={v => onUpdateRow(row.id, { name: v })}
                      />
                    </td>
                    {/* Qty */}
                    <td style={{ padding: '6px 10px' }}>
                      <EditableCell
                        value={row.qty} type="number" align="right" step="1"
                        onChange={v => onUpdateRow(row.id, { qty: v })}
                      />
                    </td>
                    {/* Unit */}
                    <td style={{ padding: '6px 10px' }}>
                      <EditableCell
                        value={row.unit} align="right" placeholder="db"
                        onChange={v => onUpdateRow(row.id, { unit: v })}
                      />
                    </td>
                    {/* UnitPrice or LaborHours */}
                    <td style={{ padding: '6px 10px' }}>
                      {rowType === 'labor' ? (
                        <EditableCell
                          value={row.laborHours} type="number" align="right" step="0.25"
                          onChange={v => onUpdateRow(row.id, { laborHours: v })}
                        />
                      ) : (
                        <EditableCell
                          value={row.unitPrice} type="number" align="right" step="100"
                          onChange={v => onUpdateRow(row.id, { unitPrice: v })}
                        />
                      )}
                    </td>
                    {/* Total (derived, read-only) */}
                    <td style={{
                      padding: '6px 14px', textAlign: 'right',
                      fontFamily: 'DM Mono', fontSize: 12, fontWeight: 600,
                      color: total > 0 ? accentColor : C.muted,
                    }}>
                      {total > 0 ? `${fmt(total)} Ft` : '—'}
                    </td>
                    {/* Delete */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => onDeleteRow(row.id)}
                        title="Sor törlése"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: C.muted, fontSize: 14, padding: '2px 6px', borderRadius: 4,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = C.red}
                        onMouseLeave={e => e.currentTarget.style.color = C.muted}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div style={{
          padding: '24px 18px', textAlign: 'center',
          fontFamily: 'DM Mono', fontSize: 12, color: C.muted,
        }}>
          Nincs még tétel. Kattints az „Új sor" gombra.
        </div>
      )}
    </div>
  )
}

// ─── Main ManualRowEditor ────────────────────────────────────────────────────
export default function ManualRowEditor({ rows, hourlyRate, onChange }) {
  const materialRows = rows.filter(r => r.type === 'material')
  const laborRows = rows.filter(r => r.type === 'labor')

  const updateRow = useCallback((id, changes) => {
    onChange(rows.map(r => r.id === id ? { ...r, ...changes } : r))
  }, [rows, onChange])

  const deleteRow = useCallback((id) => {
    onChange(rows.filter(r => r.id !== id))
  }, [rows, onChange])

  const addMaterialRow = useCallback(() => {
    onChange([...rows, createManualRow({ type: 'material' })])
  }, [rows, onChange])

  const addLaborRow = useCallback(() => {
    onChange([...rows, createManualRow({ type: 'labor' })])
  }, [rows, onChange])

  const totals = computeManualTotals(rows, hourlyRate)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Anyagok table */}
      <ManualRowTable
        title="Anyagok" accentColor={C.yellow} rows={materialRows}
        rowType="material" hourlyRate={hourlyRate}
        onUpdateRow={updateRow} onDeleteRow={deleteRow} onAddRow={addMaterialRow}
      />

      {/* Munkák table */}
      <ManualRowTable
        title="Munkák" accentColor={C.blue} rows={laborRows}
        rowType="labor" hourlyRate={hourlyRate}
        onUpdateRow={updateRow} onDeleteRow={deleteRow} onAddRow={addLaborRow}
      />

      {/* Summary footer */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
        padding: '14px 18px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Anyagköltség</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.yellow }}>{fmt(totals.totalMaterials)} Ft</div>
        </div>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Munkadíj</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.blue }}>{fmt(totals.totalLabor)} Ft</div>
        </div>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Munkaóra</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.text }}>{totals.totalHours.toFixed(1)} ó</div>
        </div>
      </div>
    </div>
  )
}
