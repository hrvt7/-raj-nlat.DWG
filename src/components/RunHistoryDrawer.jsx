// ─── Run History Drawer ─────────────────────────────────────────────────────
// Lightweight panel showing recent recipe runs for the current plan.
// Appears in the same slot as RecipeMatchReviewPanel (top-right overlay).
//
// Shows:
//  - Last N runs, newest first
//  - Per-run: time, recipe count, match/applied, assembly summary, undo status
//  - Undo button for the latest undoable run
//
// Does NOT touch: DetectionReviewPanel, generic PDF rule engine, quote/BOM.
// ────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useEffect } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

/**
 * @param {Object} props
 * @param {import('../data/recipeRunStore').RecipeRunRecord[]} props.runs — newest-first
 * @param {Function} props.onUndo — (runId) => void
 * @param {Function} props.onClose — () => void
 */
export default function RunHistoryDrawer({ runs, onUndo, onClose }) {
  // Keyboard: Escape closes
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const isEmpty = !runs?.length

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
          Futtatási előzmények
        </div>
        <button onClick={onClose} style={closeBtnStyle} title="Bezárás (Esc)">✕</button>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div style={{ padding: '20px 14px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
            Még nem volt futtatás ezen a terven.
          </div>
        </div>
      )}

      {/* Run list */}
      {!isEmpty && (
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
          {runs.map((run, i) => (
            <RunRow key={run.runId} run={run} isFirst={i === 0} onUndo={onUndo} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Run row ─────────────────────────────────────────────────────────────────

function RunRow({ run, isFirst, onUndo }) {
  const timeStr = useMemo(() => formatRelativeTime(run.createdAt), [run.createdAt])
  const isUndone = !!run.undoneAt
  const scopeLabel = run.scope === 'current_page' ? 'oldal' : 'terv'
  const asmEntries = Object.entries(run.assemblySummary || {})

  return (
    <div style={{
      padding: '8px 14px',
      borderBottom: `1px solid ${C.border}20`,
      opacity: isUndone ? 0.5 : 1,
    }}>
      {/* Top row: time + scope + undo badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
          {timeStr}
        </span>
        <span style={{
          fontFamily: 'DM Mono', fontSize: 9, padding: '1px 5px', borderRadius: 6,
          background: 'rgba(76,201,240,0.10)', color: C.blue,
          border: `1px solid rgba(76,201,240,0.15)`,
        }}>
          {scopeLabel}
        </span>
        {isUndone && (
          <span style={{
            fontFamily: 'DM Mono', fontSize: 9, padding: '1px 5px', borderRadius: 6,
            background: 'rgba(255,107,107,0.10)', color: C.red,
            border: `1px solid rgba(255,107,107,0.15)`,
          }}>
            visszavonva
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>
        <span style={{ color: C.accent, fontWeight: 600 }}>{run.appliedMarkerCount}</span>
        <span style={{ color: C.textSub }}> marker</span>
        {run.skippedCount > 0 && (
          <span style={{ color: C.muted }}> · {run.skippedCount} átugr.</span>
        )}
        <span style={{ color: C.muted }}>
          {' '}· {run.recipeCount} minta · {run.totalMatches} talál.
        </span>
      </div>

      {/* Assembly breakdown */}
      {asmEntries.length > 0 && (
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginTop: 2 }}>
          {asmEntries.map(([name, count]) => `${name} (${count})`).join(' · ')}
        </div>
      )}

      {/* Undo button — only on most recent non-undone run */}
      {run.undoAvailable && !isUndone && (
        <button
          onClick={() => onUndo(run.runId)}
          style={{
            marginTop: 4, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
            background: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.25)',
            color: C.red, fontSize: 10, fontFamily: 'DM Mono', fontWeight: 500,
          }}
        >
          Visszavonás
        </button>
      )}
    </div>
  )
}

// ── Time formatting ─────────────────────────────────────────────────────────

function formatRelativeTime(isoString) {
  try {
    const diff = Date.now() - new Date(isoString).getTime()
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return 'most'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} perce`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} órája`
    const d = Math.floor(hr / 24)
    return `${d} napja`
  } catch {
    return ''
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle = {
  position: 'absolute', top: 8, right: 8, zIndex: 25,
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
  minWidth: 260, maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

const closeBtnStyle = {
  background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
  fontSize: 14, padding: '2px 4px', borderRadius: 4,
}
