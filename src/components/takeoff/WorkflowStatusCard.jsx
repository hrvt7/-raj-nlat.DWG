import React, { useState } from 'react'
import { C } from './designTokens.js'

// ─── Workflow Status Card ─────────────────────────────────────────────────────
// Unified status card replacing DxfAuditCard + ReviewSummaryCard stacking.
// One status line, one CTA, collapsible detail. Reduces visual noise.
export default function WorkflowStatusCard({ workflowStatus, reviewSummary, dxfAudit, cableAudit, onAcceptAll, onTabSwitch, onAction, isPdf }) {
  const [expanded, setExpanded] = useState(false)

  if (!workflowStatus || workflowStatus.stage === 'empty') return null

  const { statusLine, statusColor: colorKey, cta, detail } = workflowStatus
  const color = C[colorKey] || C.muted
  const stats = detail?.stats || {}
  const reasons = detail?.reasons || []

  // Show review stats row only when there are recognized items
  const hasStats = stats.total > 0
  const activeItems = hasStats ? stats.total - (stats.excluded || 0) : 0
  const trustedCount = (stats.confirmed || 0) + (stats.autoHigh || 0)
  const trustedPct = activeItems > 0 ? Math.round((trustedCount / activeItems) * 100) : 0

  const handleCta = () => {
    if (!cta) return
    switch (cta.action) {
      case 'accept_all':  onAcceptAll?.(); break
      case 'check_cable': onTabSwitch?.('cable'); break
      case 'activate_manual_cable': onAction?.('activate_manual_cable'); break
      case 'save':        onAction?.('save'); break
      case 'review_blocks': onTabSwitch?.('takeoff'); break
      case 'retry':       onAction?.('retry'); break
      case 'switch_to_pdf': onAction?.('switch_to_pdf'); break
      case 'reexport':    break // informational only
      default: break
    }
  }

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, marginBottom: 12,
      background: `${color}0A`,
      border: `1px solid ${color}30`,
      transition: 'all 0.2s ease',
    }}>
      {/* Header: status + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span data-testid="workflow-status-line" style={{
            fontFamily: 'DM Mono', fontSize: 11, fontWeight: 600, color,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {statusLine}
          </span>
          {/* Compact trusted % badge when review data exists */}
          {hasStats && !isPdf && workflowStatus.stage !== 'parse_failed' && (
            <span style={{
              fontFamily: 'DM Mono', fontSize: 9, padding: '1px 6px', borderRadius: 6,
              background: 'rgba(255,255,255,0.05)', color: trustedPct >= 80 ? C.accent : C.textSub,
              flexShrink: 0,
            }}>
              {trustedPct}%
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {cta && cta.action !== 'save' && (
            <button onClick={handleCta} data-testid="workflow-cta-btn" data-action={cta.action} style={{
              background: `${color}15`, border: `1px solid ${color}35`, borderRadius: 6,
              color, fontSize: 10, fontFamily: 'Syne', fontWeight: 700,
              padding: '3px 10px', cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}>
              {cta.label}
            </button>
          )}
          {/* Detail toggle */}
          {(reasons.length > 0 || hasStats || (dxfAudit && !isPdf)) && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
                fontFamily: 'DM Mono', fontSize: 11, padding: '2px 4px',
              }}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* Review stats mini-row */}
          {hasStats && !isPdf && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: reasons.length > 0 ? 8 : 0 }}>
              {stats.confirmed > 0 && (
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.accent }}>
                  ✓ {stats.confirmed} ({stats.confirmedQty} db)
                </span>
              )}
              {stats.autoHigh > 0 && (
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>
                  ● {stats.autoHigh} auto ({stats.autoHighQty} db)
                </span>
              )}
              {stats.autoLow > 0 && (
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow }}>
                  ⚠ {stats.autoLow} ({stats.autoLowQty} db)
                </span>
              )}
              {stats.unresolved > 0 && (
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.red }}>
                  ✗ {stats.unresolved} ({stats.unresolvedQty} db)
                </span>
              )}
              {stats.excluded > 0 && (
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                  − {stats.excluded} kizárt
                </span>
              )}
            </div>
          )}

          {/* Warning reasons — structured severity rendering when available */}
          {reasons.length > 0 && (
            <div style={{ marginBottom: (dxfAudit && !isPdf) ? 8 : 0 }}>
              {(detail?.structuredReasons?.length > 0 ? detail.structuredReasons : reasons.map(r => ({ text: r, severity: 'warning' }))).map((sr, i) => {
                const isObj = typeof sr === 'object' && sr !== null
                const text = isObj ? sr.text : sr
                const severity = isObj ? sr.severity : 'warning'
                const icon = severity === 'blocker' ? '✗' : severity === 'action' ? '⚠' : severity === 'info' ? 'ℹ' : '•'
                const iconColor = severity === 'blocker' ? C.red : severity === 'action' ? C.yellow : severity === 'info' ? C.muted : C.yellow
                const textColor = severity === 'blocker' ? C.red : severity === 'info' ? C.muted : C.muted
                const fontWeight = severity === 'blocker' || severity === 'action' ? 600 : 400
                return (
                  <div key={i} data-severity={severity} style={{
                    fontFamily: 'DM Mono', fontSize: 10, color: textColor,
                    padding: '2px 0', display: 'flex', alignItems: 'flex-start', gap: 5,
                    fontWeight,
                  }}>
                    <span style={{ color: iconColor, flexShrink: 0 }}>{icon}</span>
                    <span>{text}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Inline DXF audit detail (replaces standalone DxfAuditCard) */}
          {dxfAudit && !isPdf && dxfAudit.status !== 'PARSE_LIMITED' && (
            <div style={{
              padding: '8px 10px', borderRadius: 7, marginTop: 4,
              background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 6 }}>
                Rajz részletek
              </div>
              {/* Score bars */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                {[
                  { key: 'blocks', label: 'Blokk' },
                  { key: 'recognition', label: 'Felism.' },
                  { key: 'cable', label: 'Kábel' },
                  { key: 'units', label: 'Egys.' },
                ].map(({ key, label }) => (
                  <div key={key} style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 8, color: C.muted, marginBottom: 2 }}>{label}</div>
                    <div style={{
                      height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 1.5,
                        width: `${(dxfAudit.scores?.[key] || 0) * 100}%`,
                        background: (dxfAudit.scores?.[key] || 0) >= 0.7 ? C.accent
                          : (dxfAudit.scores?.[key] || 0) >= 0.3 ? C.yellow
                          : (dxfAudit.scores?.[key] || 0) > 0 ? C.red : C.muted,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              {/* Worked/missing compact */}
              {(dxfAudit.worked?.length > 0 || dxfAudit.missing?.length > 0) && (
                <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                  {(dxfAudit.worked || []).slice(0, 3).map((w, i) => (
                    <div key={`w${i}`}><span style={{ color: C.accent }}>+</span> {w}</div>
                  ))}
                  {(dxfAudit.missing || []).slice(0, 3).map((m, i) => (
                    <div key={`m${i}`}><span style={{ color: C.yellow }}>!</span> {m}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
