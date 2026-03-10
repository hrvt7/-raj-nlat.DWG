// ─── Cable Confidence Card ───────────────────────────────────────────────────
// Shows cable estimation transparency: mode, confidence, warnings, guidance.
// Rendered at top of Kábel (cable) tab and optionally in takeoff cable summary.
// Consumes the cable audit object from utils/cableAudit.js.

import React, { useState } from 'react'
import { CABLE_AUDIT_MODE } from '../utils/cableAudit.js'

// ── Design tokens (must match TakeoffWorkspace / DxfAuditCard) ──────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgHover: '#17171A',
  border: '#1E1E22', borderLight: '#2A2A30',
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.12)',
  yellow: '#FFD166', yellowDim: 'rgba(255,209,102,0.15)',
  red: '#FF6B6B', redDim: 'rgba(255,107,107,0.12)',
  blue: '#4CC9F0', blueDim: 'rgba(76,201,240,0.08)',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// ── Mode → visual mapping ───────────────────────────────────────────────────
const MODE_STYLE = {
  [CABLE_AUDIT_MODE.DIRECT_GEOMETRY]:  { bg: C.accentDim, border: 'rgba(0,229,160,0.25)', color: C.accent },
  [CABLE_AUDIT_MODE.MST_ESTIMATE]:     { bg: C.blueDim, border: 'rgba(76,201,240,0.25)', color: C.blue },
  [CABLE_AUDIT_MODE.AVERAGE_FALLBACK]: { bg: C.yellowDim, border: 'rgba(255,209,102,0.25)', color: C.yellow },
  [CABLE_AUDIT_MODE.UNAVAILABLE]:      { bg: C.redDim, border: 'rgba(255,107,107,0.25)', color: C.red },
  [CABLE_AUDIT_MODE.MANUAL_REQUIRED]:  { bg: C.redDim, border: 'rgba(255,107,107,0.25)', color: C.red },
}

// ── Confidence bar color ────────────────────────────────────────────────────
function confColor(c) {
  if (c >= 0.7) return C.accent
  if (c >= 0.4) return C.yellow
  if (c > 0) return C.red
  return C.muted
}

export default function CableConfidenceCard({ cableAudit, onTabSwitch, onManualCable, compact = false }) {
  const [expanded, setExpanded] = useState(!compact)

  if (!cableAudit) return null

  const {
    cableMode, cableModeMeta, cableConfidence, cableWarnings,
    manualCableRecommended, hasPanelLikeBlocks, panelCount,
    guidance, stats,
  } = cableAudit

  const style = MODE_STYLE[cableMode] || MODE_STYLE[CABLE_AUDIT_MODE.UNAVAILABLE]

  return (
    <div style={{
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: 10,
      padding: expanded ? '14px 16px' : '10px 16px',
      marginBottom: 14,
      transition: 'all 0.2s ease',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{cableModeMeta.emoji}</span>
          <span style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
            color: style.color,
          }}>
            {cableModeMeta.label}
          </span>
          {/* Confidence pill */}
          <span style={{
            fontFamily: 'DM Mono', fontSize: 9, padding: '2px 7px',
            borderRadius: 8, background: 'rgba(255,255,255,0.06)',
            color: confColor(cableConfidence),
          }}>
            {cableConfidence > 0 ? `${Math.round(cableConfidence * 100)}%` : '—'}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          style={{
            background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
            fontFamily: 'DM Mono', fontSize: 12, padding: '2px 4px',
          }}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* Confidence bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 3 }}>
              Megbízhatóság
            </div>
            <div style={{
              height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${cableConfidence * 100}%`,
                background: confColor(cableConfidence),
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {/* Explanation text */}
          <div style={{
            fontFamily: 'DM Mono', fontSize: 11, color: C.textSub,
            marginBottom: 10, lineHeight: '1.5',
          }}>
            {cableModeMeta.explanation}
          </div>

          {/* Panel status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: 'DM Mono', fontSize: 10,
            marginBottom: cableWarnings.length > 0 ? 8 : 10,
          }}>
            <span style={{ color: hasPanelLikeBlocks ? C.accent : C.yellow }}>
              {hasPanelLikeBlocks ? '✓' : '!'}
            </span>
            <span style={{ color: C.textSub }}>
              {hasPanelLikeBlocks
                ? `Referencia elosztó: ${panelCount} db felismerve`
                : 'Referencia elosztó nem található — a becslés kevésbé pontos'
              }
            </span>
          </div>

          {/* Warnings */}
          {cableWarnings.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {cableWarnings.map((w, i) => (
                <div key={i} style={{
                  fontFamily: 'DM Mono', fontSize: 10, color: C.textSub,
                  padding: '2px 0', display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  <span style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }}>!</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cable stats mini-row */}
          {stats && (stats.totalCableLengthM > 0 || stats.insertsCount > 0) && (
            <div style={{
              display: 'flex', gap: 12, fontFamily: 'DM Mono', fontSize: 9, color: C.muted,
              marginBottom: 10, padding: '6px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
            }}>
              {stats.totalCableLengthM > 0 && (
                <span>Mért: {stats.totalCableLengthM}m</span>
              )}
              {stats.insertsCount > 0 && (
                <span>Pozíciók: {stats.insertsCount}</span>
              )}
              {stats.totalBlocks > 0 && (
                <span>Blokkok: {stats.totalBlocks}</span>
              )}
            </div>
          )}

          {/* Action buttons */}
          {guidance.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {guidance.map((g, i) => {
                const isManual = g.action === 'manual_cable'
                const isPrimary = isManual && manualCableRecommended
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (isManual && onManualCable) {
                        onManualCable()
                      } else if (g.tab && onTabSwitch) {
                        onTabSwitch(g.tab)
                      }
                    }}
                    title={g.description}
                    style={{
                      padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                      background: isPrimary ? C.accentDim : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isPrimary ? 'rgba(0,229,160,0.3)' : C.border}`,
                      color: isPrimary ? C.accent : C.textSub,
                      fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
                      transition: 'all 0.15s',
                    }}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Compact badge for inline use (takeoff tab cable summary) ─────────────────
export function CableModeBadge({ cableAudit }) {
  if (!cableAudit) return null

  const { cableMode, cableModeMeta, cableConfidence, manualCableRecommended } = cableAudit
  const style = MODE_STYLE[cableMode] || MODE_STYLE[CABLE_AUDIT_MODE.UNAVAILABLE]

  return (
    <span
      title={cableModeMeta.explanation}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: 'DM Mono', fontSize: 9, padding: '2px 8px',
        borderRadius: 8,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        cursor: 'help',
      }}
    >
      <span>{cableModeMeta.emoji}</span>
      <span>{cableModeMeta.confidenceLabel}</span>
      {manualCableRecommended && (
        <span style={{ color: C.yellow, marginLeft: 2 }}>⚠</span>
      )}
    </span>
  )
}
