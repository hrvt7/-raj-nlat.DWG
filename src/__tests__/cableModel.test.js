import { describe, it, expect } from 'vitest'
import {
  CABLE_SOURCE,
  normalizeCableEstimate,
  shouldOverwrite,
  isValidEstimate,
} from '../utils/cableModel.js'

// ─── isValidEstimate ─────────────────────────────────────────────────────────

describe('isValidEstimate', () => {
  it('returns false for null/undefined', () => {
    expect(isValidEstimate(null)).toBe(false)
    expect(isValidEstimate(undefined)).toBe(false)
  })

  it('returns false for cable_total_m <= 0', () => {
    expect(isValidEstimate({ cable_total_m: 0, _source: 'dxf_layers' })).toBe(false)
    expect(isValidEstimate({ cable_total_m: -5, _source: 'dxf_layers' })).toBe(false)
  })

  it('returns false if _source is missing', () => {
    expect(isValidEstimate({ cable_total_m: 100 })).toBe(false)
  })

  it('returns true for valid estimate', () => {
    expect(isValidEstimate({ cable_total_m: 100, _source: 'pdf_markers' })).toBe(true)
  })
})

// ─── normalizeCableEstimate ──────────────────────────────────────────────────

describe('normalizeCableEstimate', () => {
  it('returns null for null input', () => {
    expect(normalizeCableEstimate(null, CABLE_SOURCE.DXF_LAYERS)).toBe(null)
  })

  it('returns null for zero total', () => {
    expect(normalizeCableEstimate({ cable_total_m: 0 }, CABLE_SOURCE.DXF_LAYERS)).toBe(null)
  })

  it('normalizes cable_by_type pass-through (DXF layers)', () => {
    const raw = {
      cable_total_m: 150,
      cable_by_type: { light_m: 50, socket_m: 60, switch_m: 20, other_m: 20 },
      method: 'Mért kábelvonalak (3 réteg, 150 m)',
      confidence: 0.92,
    }
    const result = normalizeCableEstimate(raw, CABLE_SOURCE.DXF_LAYERS)
    expect(result._source).toBe('dxf_layers')
    expect(result.cable_total_m).toBe(150)
    expect(result.cable_by_type.light_m).toBe(50)
    expect(result.cable_total_m_p90).toBeGreaterThan(result.cable_total_m)
  })

  it('converts cable_by_system to cable_by_type (MST output)', () => {
    const raw = {
      cable_total_m: 200,
      cable_by_system: {
        lighting: { cable_type: 'NYM-J 3×1.5', count: 5, raw_distance: 60, estimated_m: 80 },
        socket:   { cable_type: 'NYM-J 3×2.5', count: 8, raw_distance: 80, estimated_m: 100 },
        switch:   { cable_type: 'NYM-J 3×1.5', count: 3, raw_distance: 10, estimated_m: 15 },
      },
      confidence: 0.75,
    }
    const result = normalizeCableEstimate(raw, CABLE_SOURCE.DXF_MST)
    expect(result._source).toBe('dxf_mst')
    expect(result.cable_by_type.light_m).toBe(80)
    expect(result.cable_by_type.socket_m).toBe(100)
    expect(result.cable_by_type.switch_m).toBe(15)
    expect(result.cable_by_type.other_m).toBe(0)
  })

  it('handles cable_by_system with plain number values', () => {
    const raw = {
      cable_total_m: 100,
      cable_by_system: { lighting: 40, socket: 50, other: 10 },
    }
    const result = normalizeCableEstimate(raw, CABLE_SOURCE.PDF_TAKEOFF)
    expect(result.cable_by_type.light_m).toBe(40)
    expect(result.cable_by_type.socket_m).toBe(50)
    expect(result.cable_by_type.other_m).toBe(10)
  })

  it('generates p90 from multiplier if missing', () => {
    const raw = { cable_total_m: 100 }
    const result = normalizeCableEstimate(raw, CABLE_SOURCE.DEVICE_COUNT)
    // device_count multiplier = 1.5
    expect(result.cable_total_m_p90).toBe(150)
  })

  it('preserves explicit p90 if provided', () => {
    const raw = { cable_total_m: 100, cable_total_m_p90: 120 }
    const result = normalizeCableEstimate(raw, CABLE_SOURCE.DXF_LAYERS)
    expect(result.cable_total_m_p90).toBe(120)
  })

  it('sets _source tag from argument', () => {
    const raw = { cable_total_m: 50, _source: 'wrong_source' }
    const result = normalizeCableEstimate(raw, CABLE_SOURCE.PDF_MARKERS)
    expect(result._source).toBe('pdf_markers')
  })
})

// ─── shouldOverwrite ─────────────────────────────────────────────────────────

describe('shouldOverwrite', () => {
  const mkEst = (source, total = 100) => ({
    cable_total_m: total,
    cable_by_type: { light_m: 30, socket_m: 40, switch_m: 20, other_m: 10 },
    _source: source,
    confidence: 0.8,
  })

  // Rule 1: null/invalid current → valid incoming always wins
  it('null current → valid incoming overwrites', () => {
    expect(shouldOverwrite(null, mkEst('device_count'))).toBe(true)
  })

  it('invalid current (total=0) → valid incoming overwrites even if lower priority', () => {
    const invalidCurrent = { cable_total_m: 0, _source: 'pdf_markers' }
    expect(shouldOverwrite(invalidCurrent, mkEst('device_count'))).toBe(true)
  })

  it('invalid current (no _source) → valid incoming overwrites', () => {
    const invalidCurrent = { cable_total_m: 100 }
    expect(shouldOverwrite(invalidCurrent, mkEst('device_count'))).toBe(true)
  })

  it('current with cable_total_m <= 0 → valid incoming overwrites regardless of priority', () => {
    const emptyCurrent = { cable_total_m: -1, _source: 'dxf_layers' }
    expect(shouldOverwrite(emptyCurrent, mkEst('device_count'))).toBe(true)
  })

  // Rule 2: invalid incoming never overwrites
  it('valid current → null incoming does NOT overwrite', () => {
    expect(shouldOverwrite(mkEst('pdf_markers'), null)).toBe(false)
  })

  it('valid current → invalid incoming (total=0) does NOT overwrite', () => {
    expect(shouldOverwrite(mkEst('device_count'), { cable_total_m: 0, _source: 'dxf_layers' })).toBe(false)
  })

  // Rule 3: both valid → priority comparison
  it('higher priority incoming overwrites lower priority current', () => {
    // pdf_markers (P0) overwrites device_count (P4)
    expect(shouldOverwrite(mkEst('device_count'), mkEst('pdf_markers'))).toBe(true)
  })

  it('lower priority incoming does NOT overwrite higher priority current', () => {
    // device_count (P4) does NOT overwrite pdf_markers (P0)
    expect(shouldOverwrite(mkEst('pdf_markers'), mkEst('device_count'))).toBe(false)
  })

  it('same priority → incoming wins (fresher data)', () => {
    expect(shouldOverwrite(mkEst('dxf_mst'), mkEst('dxf_mst'))).toBe(true)
  })

  it('dxf_layers (P1) overwrites pdf_takeoff (P2)', () => {
    expect(shouldOverwrite(mkEst('pdf_takeoff'), mkEst('dxf_layers'))).toBe(true)
  })

  it('pdf_takeoff (P2) does NOT overwrite dxf_layers (P1)', () => {
    expect(shouldOverwrite(mkEst('dxf_layers'), mkEst('pdf_takeoff'))).toBe(false)
  })

  it('dxf_mst (P3) does NOT overwrite pdf_markers (P0)', () => {
    expect(shouldOverwrite(mkEst('pdf_markers'), mkEst('dxf_mst'))).toBe(false)
  })

  // Edge: unknown source
  it('unknown source gets lowest priority', () => {
    expect(shouldOverwrite(mkEst('device_count'), mkEst('unknown_source'))).toBe(false)
  })

  it('unknown current source → any known incoming overwrites', () => {
    const unknownCurrent = { cable_total_m: 100, _source: 'unknown', confidence: 0.5 }
    expect(shouldOverwrite(unknownCurrent, mkEst('device_count'))).toBe(true)
  })
})
