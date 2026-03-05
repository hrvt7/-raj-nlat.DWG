// ─── useApiCall — unified async API loading/error state ─────────────────────
// Wraps any async operation with { loading, error, data, run, reset } state.
// Each consumer gets its own slot so multiple concurrent calls stay independent.

import { useState, useCallback, useRef } from 'react'

/**
 * @param {Function} asyncFn - The async function to call (can accept any args)
 * @returns {{ loading, error, data, run, reset }}
 */
export function useApiCall(asyncFn) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [data, setData]       = useState(null)
  // Track the latest call so stale responses don't overwrite fresh ones
  const callIdRef = useRef(0)

  const run = useCallback(async (...args) => {
    const callId = ++callIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await asyncFn(...args)
      if (callId === callIdRef.current) {
        setData(result)
        setError(null)
      }
      return result
    } catch (err) {
      if (callId === callIdRef.current) {
        setError(err?.message || 'Ismeretlen hiba')
        setData(null)
      }
      throw err
    } finally {
      if (callId === callIdRef.current) setLoading(false)
    }
  }, [asyncFn])

  const reset = useCallback(() => {
    callIdRef.current++  // Invalidate any in-flight call
    setLoading(false)
    setError(null)
    setData(null)
  }, [])

  return { loading, error, data, run, reset }
}

/**
 * ApiErrorBanner — inline error strip with retry + manual mode CTA.
 * Pass as JSX: <ApiErrorBanner error={error} onRetry={...} onManual={...} />
 */
export function ApiErrorBanner({ error, label, onRetry, onManualMode }) {
  if (!error) return null

  const C = {
    red: '#FF6B6B', redDim: 'rgba(255,107,107,0.10)',
    accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.10)',
    textSub: '#9CA3AF', border: '#1E1E22', muted: '#71717A',
  }

  return (
    <div style={{
      background: C.redDim, border: `1px solid ${C.red}35`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.red, marginBottom: 3 }}>
          ⚠ {label || 'API hiba'}
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.red + 'cc', wordBreak: 'break-word' }}>
          {error}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {onRetry && (
          <button onClick={onRetry} style={{
            padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
            background: C.accentDim, border: `1px solid ${C.accent}40`,
            color: C.accent, fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
          }}>
            🔄 Próbáld újra
          </button>
        )}
        {onManualMode && (
          <button onClick={onManualMode} style={{
            padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.textSub, fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
          }}>
            ✏️ Manuális mód
          </button>
        )}
      </div>
    </div>
  )
}
