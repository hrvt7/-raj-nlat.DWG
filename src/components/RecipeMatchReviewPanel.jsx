// ─── Recipe Match Review Panel ────────────────────────────────────────────────
// Inline panel for reviewing recipe match candidates in PdfViewer.
// Shows match summary by bucket + accept/reject controls.
//
// Separate from DetectionReviewPanel — operates on RecipeMatchCandidate[],
// NOT on DetectionCandidate[].
//
// v2: Page-grouped display for whole_plan results.
//     Shows per-page summary badges when matches span multiple pages.
//
// Keyboard shortcuts:
//   Enter   — accept all green + apply (fast path)
//   Escape  — dismiss panel
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect, useRef } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// Assembly category → color map for quick visual scanning
const ASM_CAT_COLORS = {
  szerelvenyek: '#4CC9F0',
  vilagitas: '#00E5A0',
  elosztok: '#FF6B6B',
  gyengaram: '#A78BFA',
  tuzjelzo: '#FF8C42',
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
 * @param {Object[]} [props.assemblies] — assembly catalog for color lookup
 */
export default function RecipeMatchReviewPanel({
  candidates, onAcceptAllGreen, onToggleCandidate, onApply, onDismiss, onFocusCandidate, isRunning, assemblies,
}) {
  const [expandedBucket, setExpandedBucket] = useState('green')
  const panelRef = useRef(null)

  const buckets = useMemo(() => {
    const green = [], yellow = [], red = []
    for (const c of (candidates || [])) {
      if (c.confidenceBucket === 'high') green.push(c)
      else if (c.confidenceBucket === 'review') yellow.push(c)
      else red.push(c)
    }
    return { green, yellow, red }
  }, [candidates])

  // Page summary for multi-page results
  const pageGroups = useMemo(() => {
    const pages = new Map()
    for (const c of (candidates || [])) {
      const arr = pages.get(c.pageNumber) || []
      arr.push(c)
      pages.set(c.pageNumber, arr)
    }
    return pages
  }, [candidates])

  const isMultiPage = pageGroups.size > 1

  // Group current bucket's candidates by page (for multi-page display)
  const bucketByPage = useMemo(() => {
    if (!isMultiPage) return null
    const items = buckets[expandedBucket] || []
    const pages = new Map()
    for (const c of items) {
      const arr = pages.get(c.pageNumber) || []
      arr.push(c)
      pages.set(c.pageNumber, arr)
    }
    return pages
  }, [buckets, expandedBucket, isMultiPage])

  const acceptedCount = (candidates || []).filter(c => c.accepted).length
  const total = (candidates || []).length
  const allGreenAccepted = buckets.green.length > 0 && buckets.green.every(c => c.accepted)
  const hasYellow = buckets.yellow.length > 0
  // Fast path: only green+red (no yellow review needed) → show combo button
  const canFastAcceptApply = buckets.green.length > 0 && !hasYellow && !allGreenAccepted

  // Keyboard shortcuts
  useEffect(() => {
    if (isRunning || !total) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
      if (e.key === 'Enter') {
        e.stopPropagation()
        if (acceptedCount > 0) {
          onApply()
        } else if (canFastAcceptApply) {
          // Fast path: accept all green then apply
          onAcceptAllGreen()
          // Apply after a tick to let state update
          setTimeout(() => onApply(), 50)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isRunning, total, acceptedCount, canFastAcceptApply, onDismiss, onApply, onAcceptAllGreen])

  // Assembly color lookup
  const asmColorMap = useMemo(() => {
    const map = {}
    for (const a of (assemblies || [])) {
      map[a.id] = ASM_CAT_COLORS[a.category] || C.muted
    }
    return map
  }, [assemblies])

  if (isRunning) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
          <div style={{ width: 14, height: 14, border: '2px solid #1E1E22', borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Minták keresése...</span>
        </div>
      </div>
    )
  }

  if (!total) return null

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
          Találatok ({total})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted }}>Esc: bezár · Enter: alkalmaz</span>
          <button onClick={onDismiss} style={closeBtnStyle} title="Bezárás (Esc)">✕</button>
        </div>
      </div>

      {/* Page summary badges (multi-page mode) */}
      {isMultiPage && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
          {Array.from(pageGroups.entries()).sort((a, b) => a[0] - b[0]).map(([pg, items]) => (
            <span key={pg} style={{
              fontFamily: 'DM Mono', fontSize: 9, padding: '2px 6px',
              borderRadius: 8, background: 'rgba(76,201,240,0.10)', color: C.blue,
              border: `1px solid rgba(76,201,240,0.20)`,
            }}>
              p{pg}: {items.length}
            </span>
          ))}
        </div>
      )}

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
        <Pill color={C.accent} count={buckets.green.length} label="Magas" active={expandedBucket === 'green'} onClick={() => setExpandedBucket('green')} />
        <Pill color={C.yellow} count={buckets.yellow.length} label="Review" active={expandedBucket === 'yellow'} onClick={() => setExpandedBucket('yellow')} />
        <Pill color={C.red} count={buckets.red.length} label="Alacsony" active={expandedBucket === 'red'} onClick={() => setExpandedBucket('red')} />
      </div>

      {/* Fast path: accept all green + apply in one button (no yellow) */}
      {canFastAcceptApply && (
        <div style={{ padding: '0 14px 8px' }}>
          <button onClick={() => { onAcceptAllGreen(); setTimeout(() => onApply(), 50) }} style={{
            width: '100%', padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
            background: C.accent, border: 'none', color: C.bg,
            fontSize: 12, fontFamily: 'Syne', fontWeight: 700,
          }}>
            Elfogadás és alkalmazás ({buckets.green.length}) ↵
          </button>
        </div>
      )}

      {/* Standard: accept all green button (when yellow exists, two-step needed) */}
      {hasYellow && buckets.green.length > 0 && !allGreenAccepted && (
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

      {/* Expanded bucket list — page-grouped for multi-page, flat for single-page */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '0 14px 8px' }}>
        {isMultiPage && bucketByPage ? (
          Array.from(bucketByPage.entries()).sort((a, b) => a[0] - b[0]).map(([pg, items]) => (
            <div key={pg}>
              <div style={{
                fontFamily: 'DM Mono', fontSize: 9, color: C.blue,
                padding: '4px 0 2px', fontWeight: 600,
                borderBottom: `1px solid ${C.border}40`,
                marginTop: 4,
              }}>
                Oldal {pg} ({items.length})
              </div>
              {items.map(c => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  asmColor={asmColorMap[c.assemblyId]}
                  onToggle={() => onToggleCandidate(c.id, !c.accepted)}
                  onFocus={() => onFocusCandidate?.(c)}
                />
              ))}
            </div>
          ))
        ) : (
          (buckets[expandedBucket] || []).map(c => (
            <CandidateRow
              key={c.id}
              candidate={c}
              asmColor={asmColorMap[c.assemblyId]}
              onToggle={() => onToggleCandidate(c.id, !c.accepted)}
              onFocus={() => onFocusCandidate?.(c)}
            />
          ))
        )}
        {(buckets[expandedBucket] || []).length === 0 && (
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, padding: '8px 0' }}>
            Nincs találat ebben a kategóriában.
          </div>
        )}
      </div>

      {/* Apply button (when items are manually accepted) */}
      {acceptedCount > 0 && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
          <button onClick={onApply} style={{
            width: '100%', padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
            background: C.accent, border: 'none', color: C.bg,
            fontSize: 13, fontFamily: 'Syne', fontWeight: 700,
          }}>
            Alkalmazás ({acceptedCount} marker) ↵
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

function CandidateRow({ candidate, asmColor, onToggle, onFocus }) {
  const c = candidate
  const bucketColor = c.confidenceBucket === 'high' ? C.accent
    : c.confidenceBucket === 'review' ? C.yellow : C.red
  const assemblyColor = asmColor || C.muted

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

      {/* Assembly color indicator */}
      <div style={{
        width: 3, height: 22, borderRadius: 2, flexShrink: 0,
        background: assemblyColor, opacity: 0.7,
      }} />

      {/* Info */}
      <button onClick={onFocus} style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        padding: 0, minWidth: 0,
      }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.label || c.assemblyName || 'Ismeretlen'}
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
          p{c.pageNumber} · {(c.confidence * 100).toFixed(0)}% · {c.assemblyName || ''}
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
  minWidth: 260, maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

const closeBtnStyle = {
  background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
  fontSize: 14, padding: '2px 4px', borderRadius: 4,
}
