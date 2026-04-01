// ─── Block Recognition & Cable Detection Tests ──────────────────────────────
// Safety net for TakeoffWorkspace refactor — tests the extracted utility functions.

import { describe, it, expect } from 'vitest'
import {
  BLOCK_ASM_RULES,
  ASM_COLORS,
  recognizeBlock,
  CABLE_GENERIC_KW,
  CABLE_TYPE_KW,
  detectDxfCableLengths,
} from '../utils/blockRecognition.js'

// ─── recognizeBlock ─────────────────────────────────────────────────────────

describe('recognizeBlock', () => {
  describe('exact matches (confidence 1.0)', () => {
    it('matches LIGHT → ASM-003 lamp', () => {
      const r = recognizeBlock('LIGHT')
      expect(r.asmId).toBe('ASM-003')
      expect(r.confidence).toBe(1.0)
      expect(r.matchType).toBe('exact')
    })

    it('matches SWITCH → ASM-002 switch', () => {
      const r = recognizeBlock('SWITCH')
      expect(r.asmId).toBe('ASM-002')
      expect(r.confidence).toBe(1.0)
    })

    it('matches SOCKET → ASM-001 socket', () => {
      const r = recognizeBlock('SOCKET')
      expect(r.asmId).toBe('ASM-001')
      expect(r.confidence).toBe(1.0)
    })

    it('matches PANEL → ASM-018 panel', () => {
      const r = recognizeBlock('PANEL')
      expect(r.asmId).toBe('ASM-018')
      expect(r.confidence).toBe(1.0)
    })

    it('matches SMOKE → null asmId (detector, no assembly)', () => {
      const r = recognizeBlock('SMOKE')
      expect(r.asmId).toBeNull()
      expect(r.confidence).toBe(1.0)
    })
  })

  describe('case and separator normalization', () => {
    it('lowercased input matches (light → LIGHT)', () => {
      const r = recognizeBlock('light')
      expect(r.asmId).toBe('ASM-003')
      expect(r.confidence).toBe(1.0)
    })

    it('mixed case matches (Switch → SWITCH)', () => {
      const r = recognizeBlock('Switch')
      expect(r.asmId).toBe('ASM-002')
      expect(r.confidence).toBe(1.0)
    })

    it('underscores replaced by spaces (partial match via PANEL)', () => {
      const r = recognizeBlock('DB_PANEL')
      expect(r.asmId).toBe('ASM-018')
      expect(r.matchType).toBe('partial') // "DB PANEL" contains "PANEL" but doesn't exact-match "DB_PANEL"
      expect(r.confidence).toBeGreaterThan(0.6)
    })

    it('hyphens replaced by spaces', () => {
      const r = recognizeBlock('DOWN-LIGHT')
      expect(r.asmId).toBe('ASM-003')
      expect(r.matchType).toBe('partial')
    })

    it('dots replaced by spaces', () => {
      const r = recognizeBlock('LAMP.01')
      expect(r.asmId).toBe('ASM-003')
      expect(r.matchType).toBe('partial')
    })
  })

  describe('partial matches (confidence 0.60-0.95)', () => {
    it('partial match has lower confidence than exact', () => {
      const r = recognizeBlock('CEILING_LIGHT_2X4')
      expect(r.asmId).toBe('ASM-003')
      expect(r.matchType).toBe('partial')
      expect(r.confidence).toBeGreaterThan(0.6)
      expect(r.confidence).toBeLessThan(1.0)
    })

    it('longer pattern = higher specificity = higher confidence', () => {
      const short = recognizeBlock('XX_LED_YYYYYYYYYY') // LED is short
      const long = recognizeBlock('XX_DOWNLIGHT_YY')     // DOWNLIGHT is long
      expect(long.confidence).toBeGreaterThan(short.confidence)
    })

    it('best match wins when multiple patterns match', () => {
      // "SWITCH_LAMPA" contains both SWITCH and LAMPA patterns
      const r = recognizeBlock('SWITCH_LAMPA')
      expect(r.matchType).toBe('partial')
      // Should pick the one with higher specificity
      expect(['ASM-002', 'ASM-003']).toContain(r.asmId)
    })
  })

  describe('unknown blocks', () => {
    it('returns unknown for unrecognized names', () => {
      const r = recognizeBlock('CHAIR')
      expect(r.asmId).toBeNull()
      expect(r.confidence).toBe(0)
      expect(r.matchType).toBe('unknown')
    })

    it('handles null input', () => {
      const r = recognizeBlock(null)
      expect(r.asmId).toBeNull()
      expect(r.matchType).toBe('unknown')
    })

    it('handles empty string', () => {
      const r = recognizeBlock('')
      expect(r.asmId).toBeNull()
      expect(r.matchType).toBe('unknown')
    })
  })

  describe('Hungarian keywords', () => {
    it('recognizes VILÁG (light)', () => {
      const r = recognizeBlock('VILÁG')
      expect(r.asmId).toBe('ASM-003')
    })

    it('recognizes DUGALJ (socket)', () => {
      const r = recognizeBlock('DUGALJ')
      expect(r.asmId).toBe('ASM-001')
    })

    it('recognizes KAPCSOL (switch)', () => {
      const r = recognizeBlock('KAPCSOL')
      expect(r.asmId).toBe('ASM-002')
    })

    it('recognizes ELOSZTÓ (panel)', () => {
      const r = recognizeBlock('ELOSZTÓ')
      expect(r.asmId).toBe('ASM-018')
    })

    it('recognizes ÉRZÉKEL (detector)', () => {
      const r = recognizeBlock('ÉRZÉKEL')
      expect(r.asmId).toBeNull() // detector has null asmId
      expect(r.confidence).toBe(1.0)
    })
  })
})

// ─── detectDxfCableLengths ──────────────────────────────────────────────────

describe('detectDxfCableLengths', () => {
  it('returns null for null input', () => {
    expect(detectDxfCableLengths(null)).toBeNull()
  })

  it('returns null for empty lengths array', () => {
    expect(detectDxfCableLengths({ lengths: [] })).toBeNull()
  })

  it('returns null when no cable layers found', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'FURNITURE', length: 100 },
        { layer: 'WALLS', length: 200 },
      ]
    })
    expect(result).toBeNull()
  })

  it('detects cable layer by generic keyword', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'E_KABEL_VILAG', length: 50.5 },
        { layer: 'E_KABEL_DUGALJ', length: 30.2 },
      ]
    })
    expect(result).not.toBeNull()
    expect(result.cable_total_m).toBeCloseTo(80.7, 1)
    expect(result._source).toBe('dxf_layers')
    expect(result.confidence).toBe(0.92)
  })

  it('classifies cable types correctly', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'KABEL_VILAGIT', length: 40 },   // light
        { layer: 'KABEL_DUGALJ', length: 30 },     // socket
        { layer: 'CABLE_KAPCSOL', length: 20 },     // switch
        { layer: 'CABLE_NYY_5X', length: 10 },      // other
      ]
    })
    expect(result.cable_by_type.light_m).toBe(40)
    expect(result.cable_by_type.socket_m).toBe(30)
    expect(result.cable_by_type.switch_m).toBe(20)
    expect(result.cable_by_type.other_m).toBe(10)
  })

  it('defaults unclassified cable to socket', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'WIRE_UNKNOWN', length: 100 },
      ]
    })
    expect(result.cable_by_type.socket_m).toBe(100)
    expect(result.cable_by_type.light_m).toBe(0)
  })

  it('skips zero/negative lengths', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'KABEL_VILAG', length: 0 },
        { layer: 'KABEL_DUGALJ', length: -5 },
        { layer: 'KABEL_SWITCH', length: 50 },
      ]
    })
    expect(result.cable_total_m).toBe(50)
  })

  it('method string includes layer count and total', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'CABLE_A', length: 100 },
        { layer: 'CABLE_B', length: 200 },
      ]
    })
    expect(result.method).toContain('2 réteg')
    expect(result.method).toContain('300 m')
  })

  it('rounds to one decimal', () => {
    const result = detectDxfCableLengths({
      lengths: [
        { layer: 'CABLE_X', length: 33.333 },
      ]
    })
    expect(result.cable_total_m).toBe(33.3)
  })
})

// ─── Constants sanity checks ────────────────────────────────────────────────

describe('Constants', () => {
  it('BLOCK_ASM_RULES has expected assembly IDs', () => {
    const asmIds = BLOCK_ASM_RULES.map(r => r.asmId)
    expect(asmIds).toContain('ASM-001') // socket
    expect(asmIds).toContain('ASM-002') // switch
    expect(asmIds).toContain('ASM-003') // lamp
    expect(asmIds).toContain('ASM-018') // panel
  })

  it('ASM_COLORS has colors for all known assembly IDs', () => {
    expect(ASM_COLORS['ASM-001']).toBeDefined()
    expect(ASM_COLORS['ASM-002']).toBeDefined()
    expect(ASM_COLORS['ASM-003']).toBeDefined()
    expect(ASM_COLORS['ASM-018']).toBeDefined()
    expect(ASM_COLORS[null]).toBeDefined() // unknown fallback
  })

  it('CABLE_GENERIC_KW contains standard keywords', () => {
    expect(CABLE_GENERIC_KW).toContain('KABEL')
    expect(CABLE_GENERIC_KW).toContain('CABLE')
    expect(CABLE_GENERIC_KW).toContain('WIRE')
  })

  it('CABLE_TYPE_KW has all four categories', () => {
    expect(Object.keys(CABLE_TYPE_KW)).toEqual(['light', 'socket', 'switch', 'other'])
  })
})
