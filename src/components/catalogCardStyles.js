// ─── Shared catalog card visual constants ────────────────────────────────────
// Used by Assemblies, Work Items, and Materials pages to maintain
// a unified "design family" look across the three catalog grids.
// Only visual / layout constants — no business logic.

import { C } from './ui.jsx'

// ─── Grid layout ────────────────────────────────────────────────────────────
// 230px min ensures 4 columns on typical desktop (≥ ~1000px content width).
export const CATALOG_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
  gap: 14,
}

// ─── Card shell ─────────────────────────────────────────────────────────────
export function catalogCardShell(hovered) {
  return {
    background: hovered ? 'rgba(0,229,160,0.04)' : C.bgCard,
    border: `1px solid ${hovered ? 'rgba(0,229,160,0.25)' : C.border}`,
    borderRadius: 14,
    padding: '16px 20px',
    cursor: 'pointer',
    transition: 'all 0.18s',
    transform: hovered ? 'translateY(-2px)' : 'none',
    boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.35)' : 'none',
    position: 'relative',
  }
}

// ─── Header row (badge left, code right) ────────────────────────────────────
export const CARD_HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
}

// ─── Category chip (inline badge for WI / MAT pages) ───────────────────────
export function categoryChipStyle(color) {
  const c = color || C.textSub
  return {
    fontFamily: 'DM Mono',
    fontSize: 10,
    color: c,
    background: `${c}14`,
    border: `1px solid ${c}28`,
    padding: '2px 8px',
    borderRadius: 20,
  }
}

// ─── Title ──────────────────────────────────────────────────────────────────
export const CARD_TITLE_STYLE = {
  fontFamily: 'Syne',
  fontWeight: 700,
  fontSize: 14,
  color: C.text,
  lineHeight: 1.35,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// ─── Description (optional) ─────────────────────────────────────────────────
export const CARD_DESC_STYLE = {
  fontFamily: 'DM Mono',
  fontSize: 10,
  color: C.textMuted,
  lineHeight: 1.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// ─── Divider ────────────────────────────────────────────────────────────────
export const CARD_DIVIDER_STYLE = {
  borderTop: `1px solid ${C.border}`,
  margin: '12px 0 10px',
}

// ─── Stat label (small uppercase above value) ───────────────────────────────
export const CARD_STAT_LABEL = {
  fontFamily: 'DM Mono',
  fontSize: 9,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
}

// ─── Stat badge (accent color) ──────────────────────────────────────────────
export const CARD_STAT_ACCENT = {
  fontFamily: 'Syne',
  fontWeight: 700,
  fontSize: 13,
  color: C.accent,
  background: C.accentDim,
  padding: '2px 8px',
  borderRadius: 6,
}

// ─── Stat badge (yellow) ────────────────────────────────────────────────────
export const CARD_STAT_YELLOW = {
  fontFamily: 'Syne',
  fontWeight: 700,
  fontSize: 13,
  color: C.yellow,
  background: C.yellowDim,
  padding: '2px 8px',
  borderRadius: 6,
}

// ─── Code text (ID, right side of header) ───────────────────────────────────
export const CARD_CODE_STYLE = {
  fontFamily: 'DM Mono',
  fontSize: 10,
  color: C.textMuted,
}

// ─── Stat unit text ─────────────────────────────────────────────────────────
export const CARD_STAT_UNIT = {
  fontFamily: 'DM Mono',
  fontSize: 11,
  color: C.textSub,
}

// ─── Delete button ──────────────────────────────────────────────────────────
export function deleteButtonStyle(hovered) {
  return {
    marginLeft: 'auto',
    padding: '4px 7px',
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.textMuted,
    cursor: 'pointer',
    fontSize: 11,
    opacity: hovered ? 1 : 0.4,
    transition: 'opacity 0.15s',
  }
}
