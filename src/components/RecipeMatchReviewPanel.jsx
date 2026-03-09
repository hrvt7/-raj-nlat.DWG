// ─── Recipe Match Review Panel ────────────────────────────────────────────────
// Inline panel for reviewing recipe match candidates in PdfViewer.
// Shows match summary by bucket + accept/reject controls.
//
// Separate from DetectionReviewPanel — operates on RecipeMatchCandidate[],
// NOT on DetectionCandidate[].
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

/**
 * @param {Object} props
 * @param {Object[]} props.candidates — RecipeMatchCandidate[]
 * @param {Function} props.onAcceptAllGreen — () => void
 * @param {Function} props.onToggleCandidate — (candidateId, accepted) => void
 * @param {Function} props.onApply — () => void — apply accepted matches as markers
 * @param {Function} props.onDismiss — () => void — close panel
 * @param {Function} props.onFocusCandidate — (candidate) => void — scroll to candidate on map
 * @param {boolean} props.isRunning — matching in progress
 */
export default function RecipeMatchReviewPanel({
  candidates, onAcceptAllGreen, onToggleCandidate, onApply, onDismiss, onFocusCandidate, isRunning,
}) {
  const [expandedBucket, setExpandedBucket] = useState('green')

  const buckets = useMemo(() => {
    const green = [], yellow = [], red = []
    for (const c of (candidates || [])) {
      if (c.confidenceBucket === 'high') green.push(c)
      else if (c.confidenceBucket === 'review') yellow.push(c)
      else red.push(c)
    }
    return { green, yellow, red }
  }, [candidates])

  const acceptedCount = (candidates || []).filter(c => c.accepted).length
  const total = (candidates || []).length

  if (isRunning) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
          <div style={{ width: 14, height: 14, border: '2px solid #1E1E22', borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Recipe matching...</span>
        </div>
      </div>
    )
  }

  if (!total) return null

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
          Recipe találatok ({total})
        </div>
        <button onClick={onDismiss} style={closeBtnStyle} title="Bezárás">✕</button>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
        <Pill color={C.accent} count={buckets.green.length} label="Magas" active={expandedBucket === 'green'} onClick={() => setExpandedBucket('green')} />
        <Pill color={C.yellow} count={buckets.yellow.length} label="Review" active={expandedBucket === 'yellow'} onClick={() => setExpandedBucket('yellow')} />
        <Pill color={C.red} count={buckets.red.length} label="Alacsony" active={expandedBucket === 'red'} onClick={() => setExpandedBucket('red')} />
      </div>

      {/* Accept all green button */}
      {buckets.green.length > 0 && !buckets.green.every(c => c.accepted) && (
        <div style={{ padding: '0 14px 8px' }}>
          <button onClick={onAcceptAllGreen} style={{
            width: '100%', padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
            background: 'rgba(0,229,160,0.12)', border: `1px solid rgba(0,229,160,0.3)`,
            color: C.accent, fontSize: 12, fontFamily: 'Syne', fontWeight: 700,
          }}>
            Összes magas elfogadása ({buckets.green.length})
          </button>
        </div>
      )}

      {/* Expanded bucket list */}
      <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 14px 8px' }}>
        {(buckets[expandedBucket] || []).map(c => (
          <CandidateRow
            key={c.id}
            candidate={c}
            onToggle={() => onToggleCandidate(c.id, !c.accepted)}
            onFocus={() => onFocusCandidate?.(c)}
          />
        ))}
        {(buckets[expandedBucket] || []).length === 0 && (
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, padding: '8px 0' }}>
            Nincs találat ebben a kategóriában.
          </div>
        )}
      </div>

      {/* Apply button */}
      {acceptedCount > 0 && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
          <button onClick={onApply} style={{
            width: '100%', padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
            background: C.accent, border: 'none', color: C.bg,
            fontSize: 13, fontFamily: 'Syne', fontWeight: 700,
          }}>
            Alkalmazás ({acceptedCount} marker)
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Pill({ color, count, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 12, cursor: 'pointer', fontSize: 11,
      fontFamily: 'DM Mono', fontWeight: 600,
      background: active ? `${color}18` : 'transparent',
      border: `1px solid ${active ? `${color}50` : C.border}`,
      color: active ? color : C.muted,
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label} <span style={{ fontWeight: 700 }}>{count}</span>
    </button>
  )
}

function CandidateRow({ candidate, onToggle, onFocus }) {
  const c = candidate
  const bucketColor = c.confidenceBucket === 'high' ? C.accent
    : c.confidenceBucket === 'review' ? C.yellow : C.red

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
      borderBottom: `1px solid ${C.border}20`,
    }}>
      {/* Accept/reject checkbox */}
      <button onClick={onToggle} style={{
        width: 18, height: 18, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
        background: c.accepted ? C.accent : 'transparent',
        border: `1.5px solid ${c.accepted ? C.accent : C.muted}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: c.accepted ? C.bg : 'transparent', fontSize: 11,
      }}>
        {c.accepted ? '✓' : ''}
      </button>

      {/* Info */}
      <button onClick={onFocus} style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        padding: 0, minWidth: 0,
      }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.label || c.assemblyName || 'Ismeretlen'}
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
          p{c.pageNumber} · {(c.confidence * 100).toFixed(0)}%
        </div>
      </button>

      {/* Confidence dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: bucketColor, flexShrink: 0 }} />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle = {
  position: 'absolute', top: 8, right: 8, zIndex: 25,
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
  minWidth: 240, maxWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

const closeBtnStyle = {
  background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
  fontSize: 14, padding: '2px 4px', borderRadius: 4,
}
