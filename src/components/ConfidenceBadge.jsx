// ─── ConfidenceBadge ──────────────────────────────────────────────────────────
// Shows PDF recognition confidence level with a visual bar.
// Low confidence (<50%) triggers a warning + suggests manual tools.

import React from 'react'

const C = {
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.10)',
  yellow: '#FFD166', yellowDim: 'rgba(255,209,102,0.10)',
  red: '#FF6B6B', redDim: 'rgba(255,107,107,0.10)',
  blue: '#4CC9F0', blueDim: 'rgba(76,201,240,0.10)',
  border: '#1E1E22', bgCard: '#111113', text: '#E4E4E7',
  muted: '#71717A', textSub: '#9CA3AF',
}

/**
 * @param {number} confidence - Overall confidence 0–1
 * @param {string} source - 'vector' | 'vision' | 'mixed' | 'fallback'
 * @param {boolean} showManualHint - Show "Ellenőrzés szükséges" hint when low confidence
 * @param {Function} onOpenManualTools - Called when user clicks the manual tools CTA
 */
export default function ConfidenceBadge({ confidence, source, showManualHint = true, onOpenManualTools }) {
  if (confidence == null) return null

  const pct = Math.round(confidence * 100)

  // Colour tiers
  const isHigh   = pct >= 75
  const isMed    = pct >= 50 && pct < 75
  const isLow    = pct < 50

  const color   = isHigh ? C.accent   : isMed ? C.yellow   : C.red
  const dimBg   = isHigh ? C.accentDim : isMed ? C.yellowDim : C.redDim
  const icon    = isHigh ? '✅'        : isMed ? '⚠️'        : '❗'
  const label   = isHigh ? 'Magas'    : isMed ? 'Közepes'   : 'Alacsony'

  const sourceLabel = {
    vector: 'Vektoros felismerés',
    vision: 'Vision AI',
    mixed: 'Vegyes (vektor + AI)',
    fallback: 'Becsült',
  }[source] || 'Automatikus'

  return (
    <div style={{
      background: dimBg, border: `1px solid ${color}35`,
      borderRadius: 10, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color }}>
            Felismerés megbízhatóság: {pct}%
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginTop: 1 }}>
            {sourceLabel}
          </div>
        </div>
        {/* Badge */}
        <span style={{
          fontFamily: 'DM Mono', fontSize: 9, color,
          background: dimBg, border: `1px solid ${color}40`,
          borderRadius: 20, padding: '2px 8px', flexShrink: 0,
        }}>{label}</span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4, borderRadius: 4,
        background: C.border, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Low confidence hint */}
      {isLow && showManualHint && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.red }}>
            Ellenőrzés szükséges — a felismerés bizonytalan
          </div>
          {onOpenManualTools && (
            <button onClick={onOpenManualTools} style={{
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.red}50`,
              color: C.red, fontFamily: 'Syne', fontWeight: 700, fontSize: 10,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              ✏️ Manuális eszközök
            </button>
          )}
        </div>
      )}

      {/* Medium confidence hint */}
      {isMed && showManualHint && (
        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow }}>
          Javasolt ellenőrzés — egyes elemek manuálisan pontosíthatók
        </div>
      )}
    </div>
  )
}
