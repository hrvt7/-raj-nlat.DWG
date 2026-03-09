// ─── ReuseBanner ────────────────────────────────────────────────────────────
// Non-modal, dismissable inline banner shown when a user opens a plan
// in a project that already has saved recipes.
//
// Props:
//   recipeCount     — number of project recipes available
//   onRun           — () => void — run project recipes on this plan
//   onDismiss       — () => void — dismiss banner
//   visible         — boolean — whether to show
// ──────────────────────────────────────────────────────────────────────────────

import React from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

export default function ReuseBanner({ recipeCount, onRun, onDismiss, visible }) {
  if (!visible || !recipeCount) return null

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 30, display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(17,17,19,0.95)', border: `1px solid rgba(0,229,160,0.25)`,
      borderRadius: 10, padding: '8px 14px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
      maxWidth: 420, whiteSpace: 'nowrap',
    }}>
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: 'rgba(0,229,160,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontFamily: 'Syne', fontWeight: 700, color: C.text }}>
          {recipeCount} mentett minta elérhető
        </div>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted, marginTop: 1 }}>
          Futtatás ezen a terven?
        </div>
      </div>

      {/* Run button */}
      <button onClick={onRun} style={{
        padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
        background: C.accent, border: 'none', color: C.bg,
        fontSize: 11, fontFamily: 'Syne', fontWeight: 700, flexShrink: 0,
      }}>
        Futtatás
      </button>

      {/* Dismiss */}
      <button onClick={onDismiss} style={{
        background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
        fontSize: 13, padding: '2px 4px', borderRadius: 4, flexShrink: 0,
      }} title="Bezárás">
        ✕
      </button>
    </div>
  )
}

// ── Helper: check if reuse banner should show ─────────────────────────────
// Returns true when the project has recipes but the current plan has no markers.
export function shouldShowReuseBanner(projectId, planId, markerCount, getRecipesByProject) {
  if (!projectId || !planId) return false
  if (markerCount > 0) return false
  const dismissed = sessionStorage.getItem(`reuse-dismissed-${planId}`)
  if (dismissed) return false
  const recipes = getRecipesByProject(projectId)
  return recipes.length > 0
}

export function dismissReuseBanner(planId) {
  sessionStorage.setItem(`reuse-dismissed-${planId}`, '1')
}

export function getProjectRecipeCount(projectId, getRecipesByProject) {
  if (!projectId) return 0
  return getRecipesByProject(projectId).length
}
