// ─── ErrorBoundary ────────────────────────────────────────────────────────────
// Wraps major app sections so a single JS crash doesn't take down the whole app.
// Renders a recoverable error card with "Próbáld újra" and "Váltás manuális módra" CTA.

import React from 'react'
import { Sentry } from '../sentry.js'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  red: '#FF6B6B', redDim: 'rgba(255,107,107,0.12)',
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.10)',
  text: '#E4E4E7', muted: '#71717A', textSub: '#9CA3AF',
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary] Uncaught error:', error, info)
    Sentry?.captureException(error, { extra: { componentStack: info?.componentStack } })
  }

  handleReset() {
    this.setState({ hasError: false, error: null, info: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error } = this.state
    const { onManualMode, fallbackLabel } = this.props

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 260, padding: 32,
      }}>
        <div style={{
          maxWidth: 480, width: '100%',
          background: C.bgCard, border: `1px solid ${C.red}40`,
          borderRadius: 14, padding: 28,
        }}>
          {/* Icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 28 }}>⚠️</span>
            <div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.red }}>
                Váratlan hiba történt
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 2 }}>
                {fallbackLabel || 'A modul összeomlott'}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error?.message && (
            <div style={{
              background: C.redDim, border: `1px solid ${C.red}30`,
              borderRadius: 8, padding: '10px 14px', marginBottom: 18,
              fontFamily: 'DM Mono', fontSize: 11, color: C.red,
              wordBreak: 'break-word',
            }}>
              {error.message}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Primary: retry */}
            <button onClick={this.handleReset} style={{
              flex: 1, minWidth: 140,
              padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
              background: C.accentDim, border: `1px solid ${C.accent}40`,
              color: C.accent, fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
              transition: 'all 0.15s',
            }}>
              🔄 Próbáld újra
            </button>

            {/* Secondary: manual mode */}
            {onManualMode && (
              <button onClick={onManualMode} style={{
                flex: 1, minWidth: 160,
                padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`,
                color: C.textSub, fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
                transition: 'all 0.15s',
              }}>
                ✏️ Váltás manuális módra
              </button>
            )}
          </div>

          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginTop: 14, textAlign: 'center' }}>
            A hiba automatikusan naplózásra került. Ha a probléma ismétlődik, töltsd újra az oldalt.
          </div>
        </div>
      </div>
    )
  }
}
