// ─── DXF Audit Card ─────────────────────────────────────────────────────────
// Shows DXF import quality summary + actionable next steps.
// Rendered at top of Felmérés (takeoff) tab after DXF parse completes.
// Consumes the audit object from utils/dxfAudit.js.

import React, { useState } from 'react'
import { DXF_STATUS, CABLE_MODE } from '../utils/dxfAudit.js'

// ── Design tokens (must match TakeoffWorkspace) ─────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgHover: '#17171A',
  border: '#1E1E22', borderLight: '#2A2A30',
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.12)',
  yellow: '#FFD166', yellowDim: 'rgba(255,209,102,0.15)',
  red: '#FF6B6B', redDim: 'rgba(255,107,107,0.12)',
  blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// ── Cable mode badge colors ─────────────────────────────────────────────────
const CABLE_BADGE = {
  [CABLE_MODE.GEOMETRY]:    { bg: 'rgba(0,229,160,0.1)', border: 'rgba(0,229,160,0.3)', color: C.accent },
  [CABLE_MODE.MST]:         { bg: 'rgba(76,201,240,0.1)', border: 'rgba(76,201,240,0.3)', color: C.blue },
  [CABLE_MODE.DEVICE_AVG]:  { bg: C.yellowDim, border: 'rgba(255,209,102,0.3)', color: C.yellow },
  [CABLE_MODE.UNAVAILABLE]: { bg: 'rgba(255,255,255,0.03)', border: C.border, color: C.muted },
}

export default function DxfAuditCard({ audit, onTabSwitch, onDismiss }) {
  const [expanded, setExpanded] = useState(true)

  if (!audit) return null

  const { status, statusMeta, scores, worked, missing, guidance, cableMode, cableModeMeta, stats } = audit

  // Don't show card if parse failed entirely (error state shown elsewhere)
  if (audit.error && status === DXF_STATUS.PARSE_LIMITED) return null

  const statusBg = status === DXF_STATUS.GOOD_FOR_AUTO ? C.accentDim
    : status === DXF_STATUS.PARTIAL_AUTO ? C.yellowDim
    : status === DXF_STATUS.EXPLODED_RISK ? C.redDim
    : status === DXF_STATUS.MANUAL_HEAVY ? 'rgba(255,140,66,0.12)'
    : 'rgba(255,255,255,0.03)'

  const statusBorder = status === DXF_STATUS.GOOD_FOR_AUTO ? 'rgba(0,229,160,0.25)'
    : status === DXF_STATUS.PARTIAL_AUTO ? 'rgba(255,209,102,0.25)'
    : status === DXF_STATUS.EXPLODED_RISK ? 'rgba(255,107,107,0.25)'
    : status === DXF_STATUS.MANUAL_HEAVY ? 'rgba(255,140,66,0.25)'
    : C.border

  return (
    <div style={{
      background: statusBg,
      border: `1px solid ${statusBorder}`,
      borderRadius: 10,
      padding: expanded ? '14px 16px' : '10px 16px',
      marginBottom: 14,
      transition: 'all 0.2s ease',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{statusMeta.emoji}</span>
          <span style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
            color: statusMeta.color,
          }}>
            {statusMeta.label}
          </span>
          {/* Recognition summary badge */}
          {stats.totalBlockTypes > 0 && (
            <span style={{
              fontFamily: 'DM Mono', fontSize: 10, padding: '2px 8px',
              borderRadius: 10, background: 'rgba(255,255,255,0.06)',
              color: C.textSub,
            }}>
              {stats.recognizedPct}% felismerve
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Cable mode badge */}
          {cableMode && (
            <span style={{
              fontFamily: 'DM Mono', fontSize: 9, padding: '2px 7px',
              borderRadius: 8,
              background: CABLE_BADGE[cableMode].bg,
              border: `1px solid ${CABLE_BADGE[cableMode].border}`,
              color: CABLE_BADGE[cableMode].color,
            }}>
              kábel: {cableModeMeta.confidence}
            </span>
          )}
          {/* Expand/collapse + dismiss */}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            style={{
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
              fontFamily: 'DM Mono', fontSize: 12, padding: '2px 4px',
            }}
          >
            {expanded ? '▲' : '▼'}
          </button>
          {onDismiss && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              style={{
                background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
                fontFamily: 'DM Mono', fontSize: 12, padding: '2px 4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 12 }}>

          {/* Score bars */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[
              { key: 'blocks', label: 'Blokkok' },
              { key: 'recognition', label: 'Felismerés' },
              { key: 'cable', label: 'Kábel' },
              { key: 'units', label: 'Egység' },
            ].map(({ key, label }) => (
              <div key={key} style={{ flex: 1 }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 3 }}>{label}</div>
                <div style={{
                  height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${scores[key] * 100}%`,
                    background: scores[key] >= 0.7 ? C.accent
                      : scores[key] >= 0.3 ? C.yellow
                      : scores[key] > 0 ? C.red
                      : C.muted,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Worked / Missing lists */}
          {worked.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {worked.map((w, i) => (
                <div key={i} style={{
                  fontFamily: 'DM Mono', fontSize: 11, color: C.textSub,
                  padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  <span style={{ color: C.accent, flexShrink: 0, marginTop: 1 }}>+</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {missing.map((m, i) => (
                <div key={i} style={{
                  fontFamily: 'DM Mono', fontSize: 11, color: C.textSub,
                  padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  <span style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }}>!</span>
                  <span>{m}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cable mode detail */}
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
            marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 12 }}>
              {cableMode === CABLE_MODE.GEOMETRY ? '📏' : cableMode === CABLE_MODE.MST ? '🌐' : cableMode === CABLE_MODE.DEVICE_AVG ? '📊' : '—'}
            </span>
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>
                {cableModeMeta.label}
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
                Megbízhatóság: {cableModeMeta.confidence}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {guidance.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {guidance.map((g, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (g.tab && onTabSwitch) onTabSwitch(g.tab)
                  }}
                  title={g.description}
                  style={{
                    padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                    background: g.action === 'proceed' ? C.accentDim : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${g.action === 'proceed' ? 'rgba(0,229,160,0.3)' : C.border}`,
                    color: g.action === 'proceed' ? C.accent : C.textSub,
                    fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
                    transition: 'all 0.15s',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
