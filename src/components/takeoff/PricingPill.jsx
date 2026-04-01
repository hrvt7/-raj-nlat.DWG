import React from 'react'
import { C } from './designTokens.js'

// ─── Helper: Pricing pill ─────────────────────────────────────────────────────
export default function PricingPill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 80 }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color }}>
        {Math.round(value).toLocaleString('hu-HU')} Ft
      </div>
    </div>
  )
}
