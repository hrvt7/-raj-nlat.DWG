// ─── Count Session Panel ─────────────────────────────────────────────────────
// PlanSwift-style candidate review panel for CountObject search sessions.
//
// Shows:
//   1. What sample is being searched (crop preview + label)
//   2. Where (scope + region indicator)
//   3. Scale mode (exact/tolerant)
//   4. Candidate count by bucket
//   5. Per-candidate place/ignore controls
//   6. Batch accept likely / ignore low
//   7. "Materialize" button — only accepted candidates become markers
//
// Design: Dark enterprise UI matching PdfViewer aesthetic.
// ────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect } from 'react'
import { CANDIDATE_STATUS } from '../data/searchSessionStore.js'
import { SCALE_MODE, SEARCH_SCOPE } from '../data/countObjectStore.js'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

const SCOPE_LABELS = {
  [SEARCH_SCOPE.CURRENT_REGION]: 'Kijelölt régió',
  [SEARCH_SCOPE.CURRENT_PAGE]: 'Aktuális oldal',
  [SEARCH_SCOPE.WHOLE_PLAN]: 'Teljes terv',
}

const SCALE_LABELS = {
  [SCALE_MODE.EXACT]: 'Pontos',
  [SCALE_MODE.TOLERANT]: 'Toleráns',
}

/**
 * @param {Object} props
 * @param {Object} props.session — SearchSession with candidates[]
 * @param {Object} props.countObject — source CountObject
 * @param {Function} props.onCandidateStatusChange — (candidateId, status) => void
 * @param {Function} props.onBatchAcceptLikely — () => void
 * @param {Function} props.onBatchIgnoreLow — () => void
 * @param {Function} props.onMaterialize — () => void — create markers from accepted
 * @param {Function} props.onDismiss — () => void
 * @param {Function} props.onFocusCandidate — (candidate) => void
 * @param {boolean} props.isSearching — search in progress
 * @param {string|null} [props.cropPreviewUrl] — data URL for crop thumbnail
 */
export default function CountSessionPanel({
  session,
  countObject,
  onCandidateStatusChange,
  onBatchAcceptLikely,
  onBatchIgnoreLow,
  onMaterialize,
  onDismiss,
  onFocusCandidate,
  isSearching,
  cropPreviewUrl,
}) {
  const [expandedBucket, setExpandedBucket] = useState('high')

  const candidates = session?.candidates || []

  const buckets = useMemo(() => {
    const high = [], review = [], low = []
    for (const c of candidates) {
      if (c.confidenceBucket === 'high') high.push(c)
      else if (c.confidenceBucket === 'review') review.push(c)
      else low.push(c)
    }
    return { high, review, low }
  }, [candidates])

  const acceptedCount = candidates.filter(c => c.status === CANDIDATE_STATUS.ACCEPTED).length
  const ignoredCount = candidates.filter(c => c.status === CANDIDATE_STATUS.IGNORED).length
  const pendingCount = candidates.filter(c => c.status === CANDIDATE_STATUS.PENDING).length
  const total = candidates.length

  const allHighAccepted = buckets.high.length > 0 && buckets.high.every(c => c.status === CANDIDATE_STATUS.ACCEPTED)

  // Keyboard shortcuts
  useEffect(() => {
    if (isSearching || !session) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
      if (e.key === 'Enter' && acceptedCount > 0) {
        e.stopPropagation()
        onMaterialize()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isSearching, session, acceptedCount, onDismiss, onMaterialize])

  // Loading state
  if (isSearching) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
          <div style={{
            width: 14, height: 14, border: '2px solid #1E1E22',
            borderTopColor: C.accent, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>
            Keresés folyamatban...
          </span>
        </div>
      </div>
    )
  }

  if (!session || !countObject) return null

  return (
    <div style={panelStyle}>
      {/* ── Header: sample info ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Crop thumbnail */}
        {cropPreviewUrl && (
          <img src={cropPreviewUrl} alt="sample" style={{
            width: 28, height: 28, borderRadius: 4, objectFit: 'contain',
            border: `1px solid ${C.border}`, background: '#fff',
          }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {countObject.label || countObject.assemblyName || 'Szimbólum keresés'}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, display: 'flex', gap: 6 }}>
            <span>{SCOPE_LABELS[session.scope] || session.scope}</span>
            <span>·</span>
            <span>{SCALE_LABELS[session.scaleMode] || session.scaleMode}</span>
          </div>
        </div>
        <button onClick={onDismiss} style={closeBtnStyle} title="Bezárás (Esc)">✕</button>
      </div>

      {/* ── No results ── */}
      {total === 0 && (
        <div style={{ padding: '16px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🔍</div>
          <div style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 4 }}>
            Nem találtam egyezést
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
            Próbáld toleráns módban, vagy tágítsd a régiót.
          </div>
        </div>
      )}

      {total > 0 && (
        <>
          {/* ── Bucket pills ── */}
          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
            <BucketPill color={C.accent} count={buckets.high.length} label="Magas"
              active={expandedBucket === 'high'} onClick={() => setExpandedBucket('high')} />
            <BucketPill color={C.yellow} count={buckets.review.length} label="Review"
              active={expandedBucket === 'review'} onClick={() => setExpandedBucket('review')} />
            <BucketPill color={C.red} count={buckets.low.length} label="Alacsony"
              active={expandedBucket === 'low'} onClick={() => setExpandedBucket('low')} />
          </div>

          {/* ── Batch actions ── */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px' }}>
            {buckets.high.length > 0 && !allHighAccepted && (
              <button onClick={onBatchAcceptLikely} style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(0,229,160,0.12)', border: `1px solid rgba(0,229,160,0.3)`,
                color: C.accent, fontSize: 11, fontFamily: 'DM Mono', fontWeight: 600,
              }}>
                ✓ Elfogad ({buckets.high.length})
              </button>
            )}
            {buckets.low.length > 0 && (
              <button onClick={onBatchIgnoreLow} style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(255,107,107,0.08)', border: `1px solid rgba(255,107,107,0.20)`,
                color: C.red, fontSize: 11, fontFamily: 'DM Mono', fontWeight: 600,
              }}>
                ✕ Elvet ({buckets.low.length})
              </button>
            )}
          </div>

          {/* ── Candidate list ── */}
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '0 14px 8px' }}>
            {(buckets[expandedBucket] || []).map(c => (
              <CandidateRow
                key={c.id}
                candidate={c}
                onPlace={() => onCandidateStatusChange(c.id, CANDIDATE_STATUS.ACCEPTED)}
                onIgnore={() => onCandidateStatusChange(c.id, CANDIDATE_STATUS.IGNORED)}
                onFocus={() => onFocusCandidate?.(c)}
              />
            ))}
            {(buckets[expandedBucket] || []).length === 0 && (
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, padding: '8px 0' }}>
                Nincs találat ebben a kategóriában.
              </div>
            )}
          </div>

          {/* ── Status summary ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '6px 14px',
            borderTop: `1px solid ${C.border}`, fontFamily: 'DM Mono', fontSize: 9, color: C.muted,
          }}>
            <span>Összesen: {total}</span>
            <span style={{ color: C.accent }}>Elfogadva: {acceptedCount}</span>
            <span>Elvetett: {ignoredCount}</span>
            <span>Várakozik: {pendingCount}</span>
          </div>

          {/* ── Materialize button ── */}
          {acceptedCount > 0 && (
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
              <button onClick={onMaterialize} style={{
                width: '100%', padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontSize: 13, fontFamily: 'Syne', fontWeight: 700,
              }}>
                Markerek létrehozása ({acceptedCount}) ↵
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BucketPill({ color, count, label, active, onClick }) {
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

function CandidateRow({ candidate, onPlace, onIgnore, onFocus }) {
  const c = candidate
  const bucketColor = c.confidenceBucket === 'high' ? C.accent
    : c.confidenceBucket === 'review' ? C.yellow : C.red

  const isAccepted = c.status === CANDIDATE_STATUS.ACCEPTED
  const isIgnored = c.status === CANDIDATE_STATUS.IGNORED

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
      borderBottom: `1px solid ${C.border}20`,
      opacity: isIgnored ? 0.4 : 1,
    }}>
      {/* Place button */}
      <button onClick={onPlace} title="Elfogad" style={{
        width: 20, height: 20, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
        background: isAccepted ? C.accent : 'transparent',
        border: `1.5px solid ${isAccepted ? C.accent : C.muted}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isAccepted ? C.bg : 'transparent', fontSize: 11,
      }}>
        {isAccepted ? '✓' : ''}
      </button>

      {/* Info — clickable to focus */}
      <button onClick={onFocus} style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left', padding: 0, minWidth: 0,
      }}>
        <div style={{
          fontFamily: 'DM Mono', fontSize: 10, color: C.text,
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span>p{c.pageNumber}</span>
          <span style={{ color: C.muted }}>({c.x.toFixed(0)}, {c.y.toFixed(0)})</span>
          <span style={{ color: bucketColor, fontWeight: 600 }}>{(c.confidence * 100).toFixed(0)}%</span>
        </div>
      </button>

      {/* Ignore button */}
      <button onClick={onIgnore} title="Elvet" style={{
        width: 20, height: 20, borderRadius: 4, cursor: 'pointer', flexShrink: 0,
        background: isIgnored ? `${C.red}30` : 'transparent',
        border: `1.5px solid ${isIgnored ? C.red : C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isIgnored ? C.red : 'transparent', fontSize: 10,
      }}>
        {isIgnored ? '✕' : ''}
      </button>

      {/* Confidence dot */}
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: bucketColor, flexShrink: 0 }} />
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle = {
  position: 'absolute', top: 8, right: 8, zIndex: 25,
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
  minWidth: 280, maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
}

const closeBtnStyle = {
  background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
  fontSize: 14, padding: '2px 4px', borderRadius: 4,
}
