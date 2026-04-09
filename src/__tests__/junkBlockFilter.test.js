// ─── Junk block filter + relevance scoring tests ────────────────────────────
import { describe, it, expect } from 'vitest'
import { isJunkBlock, scoreUnknownBlock } from '../utils/blockRecognition.js'

describe('isJunkBlock', () => {
  // ── Should be filtered (junk) ──
  it('filters *MODEL_SPACE and *PAPER_SPACE', () => {
    expect(isJunkBlock('*MODEL_SPACE')).toBe(true)
    expect(isJunkBlock('*PAPER_SPACE')).toBe(true)
    expect(isJunkBlock('*D1')).toBe(true)
    expect(isJunkBlock('*U42')).toBe(true)
    expect(isJunkBlock('*T')).toBe(true)
  })

  it('filters _ prefixed internal blocks', () => {
    expect(isJunkBlock('_ARCHTICK')).toBe(true)
    expect(isJunkBlock('_DOT')).toBe(true)
    expect(isJunkBlock('_OPEN')).toBe(true)
    expect(isJunkBlock('_CLOSED')).toBe(true)
  })

  it('filters ACAD_ prefixed blocks', () => {
    expect(isJunkBlock('ACAD_DSTYLE_TEMPLATE')).toBe(true)
    expect(isJunkBlock('ACAD_NAV_VCDISPLAY')).toBe(true)
  })

  it('filters A$C anonymous blocks', () => {
    expect(isJunkBlock('A$C0')).toBe(true)
    expect(isJunkBlock('A$C123456')).toBe(true)
  })

  it('filters single-char blocks', () => {
    expect(isJunkBlock('X')).toBe(true)
    expect(isJunkBlock('0')).toBe(true)
  })

  it('filters null/empty', () => {
    expect(isJunkBlock(null)).toBe(true)
    expect(isJunkBlock('')).toBe(true)
    expect(isJunkBlock(undefined)).toBe(true)
  })

  it('filters known entity type names', () => {
    expect(isJunkBlock('SOLID')).toBe(true)
    expect(isJunkBlock('HATCH')).toBe(true)
    expect(isJunkBlock('DIMENSION')).toBe(true)
    expect(isJunkBlock('VIEWPORT')).toBe(true)
    expect(isJunkBlock('MLEADER')).toBe(true)
  })

  // ── Should NOT be filtered (real electrical elements) ──
  it('keeps real electrical block names', () => {
    expect(isJunkBlock('DUGALJ_2P_F')).toBe(false)
    expect(isJunkBlock('KAPCSOLO_1G')).toBe(false)
    expect(isJunkBlock('LAMPATEST_LED_60')).toBe(false)
    expect(isJunkBlock('LIGHT_CEILING_R150')).toBe(false)
    expect(isJunkBlock('SOCKET_DOUBLE')).toBe(false)
    expect(isJunkBlock('SWITCH_2GANG')).toBe(false)
    expect(isJunkBlock('DB_PANEL_24')).toBe(false)
    expect(isJunkBlock('SMOKE_DETECTOR')).toBe(false)
  })

  it('keeps custom named blocks', () => {
    expect(isJunkBlock('u180')).toBe(false) // ambiguous but could be real
    expect(isJunkBlock('EL_01')).toBe(false)
    expect(isJunkBlock('VILLAMOS_JELKEP_01')).toBe(false)
  })

  it('is case insensitive', () => {
    expect(isJunkBlock('*model_space')).toBe(true)
    expect(isJunkBlock('acad_style')).toBe(true)
    expect(isJunkBlock('Dugalj_2P_F')).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3-tier relevance scoring
// ═════════════════════════════════════════════════════════════════════════════

describe('scoreUnknownBlock — 3-tier relevance', () => {
  it('scores electrical blocks as likely', () => {
    expect(scoreUnknownBlock('LAMPATEST_LED', 5).tier).toBe('likely')
    expect(scoreUnknownBlock('MOZGASERZEKELO', 3).tier).toBe('likely')
    expect(scoreUnknownBlock('VILLAMOS_JELKEP', 2).tier).toBe('likely')
  })

  it('scores non-electrical blocks as non_electrical', () => {
    expect(scoreUnknownBlock('02_VALASZFAL', 5).tier).toBe('non_electrical')
    expect(scoreUnknownBlock('WC_MOSDO', 3).tier).toBe('non_electrical')
    expect(scoreUnknownBlock('PADLO_OSSZEFOLYO', 2).tier).toBe('non_electrical')
    expect(scoreUnknownBlock('LEPCSO_KORLAT', 1).tier).toBe('non_electrical')
    expect(scoreUnknownBlock('Rajzkeret', 1).tier).toBe('non_electrical')
    // High-qty non-electrical blocks may be 'uncertain' due to qty boost — conservative
    expect(scoreUnknownBlock('ARCHICAD_AJTOS_JELEK', 10).tier).not.toBe('likely')
  })

  it('scores ambiguous blocks as uncertain', () => {
    // Short/generic names without clear electrical or non-electrical signal
    const ep = scoreUnknownBlock('EP', 5)
    expect(ep.tier).toBe('uncertain')
  })

  it('never classifies electrical-keyword blocks as non_electrical', () => {
    expect(scoreUnknownBlock('DUGALJ_2P_F', 1).tier).not.toBe('non_electrical')
    expect(scoreUnknownBlock('KAPCSOLO_1G', 1).tier).not.toBe('non_electrical')
    expect(scoreUnknownBlock('FUSTERZEKELO', 1).tier).not.toBe('non_electrical')
    expect(scoreUnknownBlock('KAMERA_IP', 1).tier).not.toBe('non_electrical')
  })
})
