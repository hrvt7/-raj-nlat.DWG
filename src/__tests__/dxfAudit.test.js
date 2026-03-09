import { describe, it, expect } from 'vitest'
import { computeDxfAudit, DXF_STATUS, CABLE_MODE } from '../utils/dxfAudit.js'

// ─── Fixture helpers ────────────────────────────────────────────────────────

function makeGoodDxf() {
  return {
    success: true,
    blocks: [
      { name: 'LAMP_01', layer: 'LIGHTING', count: 12 },
      { name: 'SOCKET_01', layer: 'SOCKETS', count: 8 },
      { name: 'SWITCH_01', layer: 'SWITCHES', count: 5 },
      { name: 'PANEL_01', layer: 'POWER', count: 1 },
    ],
    lengths: [
      { layer: 'CABLE_NYM', length: 120.5, length_raw: 120500, info: null },
      { layer: 'WIRE_H07V', length: 45.2, length_raw: 45200, info: null },
    ],
    inserts: Array.from({ length: 26 }, (_, i) => ({
      name: i < 12 ? 'LAMP_01' : i < 20 ? 'SOCKET_01' : i < 25 ? 'SWITCH_01' : 'PANEL_01',
      layer: 'DEFAULT', x: i * 100, y: i * 50,
    })),
    layers: ['LIGHTING', 'SOCKETS', 'SWITCHES', 'POWER', 'CABLE_NYM', 'WIRE_H07V', 'WALLS'],
    units: { insunits: 4, name: 'mm', factor: 0.001, auto_detected: false },
    lineGeom: [{ layer: 'WALLS', x1: 0, y1: 0, x2: 100, y2: 0 }],
    polylineGeom: [{ layer: 'WALLS', points: [[0,0],[100,0],[100,50]], closed: true }],
    geomBounds: { minX: 0, maxX: 2600, minY: 0, maxY: 1250, width: 2600, height: 1250 },
    summary: { total_block_types: 4, total_blocks: 26, total_layers: 7, layers_with_lines: 2, total_inserts: 26 },
    _source: 'browser',
  }
}

function makeGoodRecognized() {
  return [
    { blockName: 'LAMP_01', qty: 12, asmId: 'ASM-003', confidence: 0.95, matchType: 'partial', rule: {} },
    { blockName: 'SOCKET_01', qty: 8, asmId: 'ASM-001', confidence: 0.90, matchType: 'partial', rule: {} },
    { blockName: 'SWITCH_01', qty: 5, asmId: 'ASM-002', confidence: 0.85, matchType: 'partial', rule: {} },
    { blockName: 'PANEL_01', qty: 1, asmId: 'ASM-018', confidence: 0.80, matchType: 'partial', rule: {} },
  ]
}

function makePartialRecognized() {
  return [
    { blockName: 'LAMP_01', qty: 12, asmId: 'ASM-003', confidence: 0.95, matchType: 'partial', rule: {} },
    { blockName: 'BLK_XYZ', qty: 8, asmId: null, confidence: 0, matchType: 'unknown', rule: null },
    { blockName: 'ELEM_123', qty: 5, asmId: null, confidence: 0.2, matchType: 'unknown', rule: null },
  ]
}

function makeExplodedDxf() {
  return {
    success: true,
    blocks: [],
    lengths: [{ layer: 'Layer0', length: 500, length_raw: 500000, info: null }],
    inserts: [],
    layers: ['Layer0', 'Layer1'],
    units: { insunits: 0, name: 'mm (guessed)', factor: 0.001, auto_detected: true },
    lineGeom: Array.from({ length: 200 }, (_, i) => ({
      layer: 'Layer0', x1: i, y1: 0, x2: i + 1, y2: 1,
    })),
    polylineGeom: [],
    geomBounds: { minX: 0, maxX: 200, minY: 0, maxY: 1, width: 200, height: 1 },
    summary: { total_block_types: 0, total_blocks: 0, total_layers: 2, layers_with_lines: 1, total_inserts: 0 },
    _source: 'browser',
  }
}

function makeNoCableDxf() {
  return {
    success: true,
    blocks: [
      { name: 'LAMP_01', layer: 'LIGHTING', count: 3 },
    ],
    lengths: [
      { layer: 'WALLS', length: 50, length_raw: 50000, info: null },
    ],
    inserts: [
      { name: 'LAMP_01', layer: 'LIGHTING', x: 0, y: 0 },
    ],
    layers: ['LIGHTING', 'WALLS'],
    units: { insunits: 4, name: 'mm', factor: 0.001, auto_detected: false },
    lineGeom: [],
    polylineGeom: [],
    geomBounds: { minX: 0, maxX: 100, minY: 0, maxY: 100, width: 100, height: 100 },
    summary: { total_block_types: 1, total_blocks: 3, total_layers: 2, layers_with_lines: 1, total_inserts: 1 },
    _source: 'browser',
  }
}

// ─── Audit output shape ─────────────────────────────────────────────────────

describe('computeDxfAudit — output shape', () => {
  it('returns all required top-level keys', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit).toHaveProperty('status')
    expect(audit).toHaveProperty('statusMeta')
    expect(audit).toHaveProperty('scores')
    expect(audit).toHaveProperty('worked')
    expect(audit).toHaveProperty('missing')
    expect(audit).toHaveProperty('guidance')
    expect(audit).toHaveProperty('cableMode')
    expect(audit).toHaveProperty('cableModeMeta')
    expect(audit).toHaveProperty('stats')
  })

  it('scores has expected dimensions', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.scores).toHaveProperty('blocks')
    expect(audit.scores).toHaveProperty('recognition')
    expect(audit.scores).toHaveProperty('geometry')
    expect(audit.scores).toHaveProperty('cable')
    expect(audit.scores).toHaveProperty('units')
    // All scores in [0, 1]
    for (const v of Object.values(audit.scores)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('statusMeta has label, emoji, color', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.statusMeta).toHaveProperty('label')
    expect(audit.statusMeta).toHaveProperty('emoji')
    expect(audit.statusMeta).toHaveProperty('color')
  })

  it('stats has recognizedPct and highConfPct', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.stats.recognizedPct).toBeGreaterThanOrEqual(0)
    expect(audit.stats.highConfPct).toBeGreaterThanOrEqual(0)
  })

  it('guidance items have action, label, description', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    for (const g of audit.guidance) {
      expect(g).toHaveProperty('action')
      expect(g).toHaveProperty('label')
      expect(g).toHaveProperty('description')
    }
  })
})

// ─── Classification ─────────────────────────────────────────────────────────

describe('computeDxfAudit — classification', () => {
  it('classifies well-recognized DXF as GOOD_FOR_AUTO', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.status).toBe(DXF_STATUS.GOOD_FOR_AUTO)
  })

  it('classifies partial recognition as PARTIAL_AUTO', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makePartialRecognized())
    expect(audit.status).toBe(DXF_STATUS.PARTIAL_AUTO)
  })

  it('classifies zero-recognition blocks as MANUAL_HEAVY', () => {
    const recognized = [
      { blockName: 'BLK_A', qty: 10, asmId: null, confidence: 0, matchType: 'unknown', rule: null },
      { blockName: 'BLK_B', qty: 5, asmId: null, confidence: 0.1, matchType: 'unknown', rule: null },
    ]
    const dxf = makeGoodDxf()
    dxf.blocks = [
      { name: 'BLK_A', layer: 'L1', count: 10 },
      { name: 'BLK_B', layer: 'L2', count: 5 },
    ]
    dxf.summary.total_block_types = 2
    const audit = computeDxfAudit(dxf, recognized)
    expect(audit.status).toBe(DXF_STATUS.MANUAL_HEAVY)
  })

  it('classifies exploded drawing as EXPLODED_RISK', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    expect(audit.status).toBe(DXF_STATUS.EXPLODED_RISK)
  })

  it('classifies failed parse as PARSE_LIMITED', () => {
    const audit = computeDxfAudit({ success: false, error: 'Bad file' }, [])
    expect(audit.status).toBe(DXF_STATUS.PARSE_LIMITED)
  })

  it('classifies null parsedDxf as PARSE_LIMITED', () => {
    const audit = computeDxfAudit(null, [])
    expect(audit.status).toBe(DXF_STATUS.PARSE_LIMITED)
  })

  it('classifies empty but valid parse as PARSE_LIMITED', () => {
    const empty = {
      success: true, blocks: [], lengths: [], inserts: [], layers: [],
      units: { insunits: 0, name: 'unknown', factor: null, auto_detected: true },
      lineGeom: [], polylineGeom: [], geomBounds: null,
      summary: { total_block_types: 0, total_blocks: 0, total_layers: 0, layers_with_lines: 0, total_inserts: 0 },
    }
    const audit = computeDxfAudit(empty, [])
    expect(audit.status).toBe(DXF_STATUS.PARSE_LIMITED)
  })
})

// ─── Exploded risk detection ────────────────────────────────────────────────

describe('computeDxfAudit — exploded risk', () => {
  it('detects exploded when many lines but no blocks', () => {
    const dxf = makeExplodedDxf()
    const audit = computeDxfAudit(dxf, [])
    expect(audit.status).toBe(DXF_STATUS.EXPLODED_RISK)
    expect(audit.missing).toEqual(
      expect.arrayContaining([expect.stringContaining('robbantva')])
    )
  })

  it('does NOT flag exploded when blocks exist even with lots of geometry', () => {
    const dxf = makeExplodedDxf()
    dxf.blocks = [{ name: 'LAMP', layer: 'L1', count: 5 }]
    dxf.summary.total_block_types = 1
    dxf.summary.total_blocks = 5
    const recognized = [{ blockName: 'LAMP', qty: 5, asmId: 'ASM-003', confidence: 0.9, matchType: 'partial', rule: {} }]
    const audit = computeDxfAudit(dxf, recognized)
    expect(audit.status).not.toBe(DXF_STATUS.EXPLODED_RISK)
  })
})

// ─── Cable mode detection ───────────────────────────────────────────────────

describe('computeDxfAudit — cable mode', () => {
  it('detects GEOMETRY mode when cable layers exist', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.cableMode).toBe(CABLE_MODE.GEOMETRY)
  })

  it('detects MST mode when inserts exist but no cable layers', () => {
    const dxf = makeGoodDxf()
    // Remove cable-related layers from lengths
    dxf.lengths = [{ layer: 'WALLS', length: 50, length_raw: 50000, info: null }]
    const audit = computeDxfAudit(dxf, makeGoodRecognized())
    expect(audit.cableMode).toBe(CABLE_MODE.MST)
  })

  it('detects DEVICE_AVG mode when blocks exist but no positions', () => {
    const dxf = makeNoCableDxf()
    dxf.inserts = [] // no insert positions
    dxf.summary.total_inserts = 0
    const recognized = [{ blockName: 'LAMP_01', qty: 3, asmId: 'ASM-003', confidence: 0.9, matchType: 'partial', rule: {} }]
    const audit = computeDxfAudit(dxf, recognized)
    expect(audit.cableMode).toBe(CABLE_MODE.DEVICE_AVG)
  })

  it('detects UNAVAILABLE mode when nothing useful exists', () => {
    const empty = {
      success: true, blocks: [], lengths: [], inserts: [], layers: [],
      units: { insunits: 0, name: 'unknown', factor: null, auto_detected: true },
      lineGeom: [], polylineGeom: [], geomBounds: null,
      summary: { total_block_types: 0, total_blocks: 0, total_layers: 0, layers_with_lines: 0, total_inserts: 0 },
    }
    const audit = computeDxfAudit(empty, [])
    expect(audit.cableMode).toBe(CABLE_MODE.UNAVAILABLE)
  })
})

// ─── Guidance ───────────────────────────────────────────────────────────────

describe('computeDxfAudit — guidance', () => {
  it('GOOD_FOR_AUTO includes "proceed" action', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.guidance.some(g => g.action === 'proceed')).toBe(true)
  })

  it('EXPLODED_RISK includes manual_count and reexport actions', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    const actions = audit.guidance.map(g => g.action)
    expect(actions).toContain('manual_count')
    expect(actions).toContain('reexport')
  })

  it('PARSE_LIMITED includes retry action', () => {
    const audit = computeDxfAudit({ success: false }, [])
    expect(audit.guidance.some(g => g.action === 'retry')).toBe(true)
  })

  it('guessed units trigger check_units guidance', () => {
    const dxf = makeGoodDxf()
    dxf.units = { insunits: 0, name: 'mm (guessed)', factor: 0.001, auto_detected: true }
    const audit = computeDxfAudit(dxf, makeGoodRecognized())
    expect(audit.guidance.some(g => g.action === 'check_units')).toBe(true)
  })

  it('unrecognized blocks trigger review_blocks guidance', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makePartialRecognized())
    expect(audit.guidance.some(g => g.action === 'review_blocks')).toBe(true)
  })

  it('no cable geometry triggers cable_info guidance', () => {
    const dxf = makeGoodDxf()
    dxf.lengths = [{ layer: 'WALLS', length: 50, length_raw: 50000, info: null }]
    const audit = computeDxfAudit(dxf, makeGoodRecognized())
    expect(audit.guidance.some(g => g.action === 'cable_info')).toBe(true)
  })
})

// ─── Smoke scenarios ────────────────────────────────────────────────────────

describe('computeDxfAudit — smoke scenarios', () => {
  it('good DXF: status=GOOD_FOR_AUTO, cable=GEOMETRY, high recognition', () => {
    const audit = computeDxfAudit(makeGoodDxf(), makeGoodRecognized())
    expect(audit.status).toBe(DXF_STATUS.GOOD_FOR_AUTO)
    expect(audit.cableMode).toBe(CABLE_MODE.GEOMETRY)
    expect(audit.stats.recognizedPct).toBe(100)
    expect(audit.stats.highConfPct).toBe(100)
    expect(audit.worked.length).toBeGreaterThan(0)
  })

  it('partial DXF: status=PARTIAL_AUTO, has both worked and missing', () => {
    const dxf = makeGoodDxf()
    // Remove cable layers so "missing" list gets populated
    dxf.lengths = [{ layer: 'WALLS', length: 50, length_raw: 50000, info: null }]
    dxf.units = { insunits: 0, name: 'mm (guessed)', factor: 0.001, auto_detected: true }
    const audit = computeDxfAudit(dxf, makePartialRecognized())
    expect(audit.status).toBe(DXF_STATUS.PARTIAL_AUTO)
    expect(audit.worked.length).toBeGreaterThan(0)
    expect(audit.missing.length).toBeGreaterThan(0)
  })

  it('exploded DXF: status=EXPLODED_RISK, cable=UNAVAILABLE', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    expect(audit.status).toBe(DXF_STATUS.EXPLODED_RISK)
    expect(audit.cableMode).toBe(CABLE_MODE.UNAVAILABLE)
    expect(audit.missing.some(m => m.includes('robbantva'))).toBe(true)
  })

  it('no-cable DXF: cable mode depends on insert availability', () => {
    // With 1 insert (< 2) → DEVICE_AVG
    const dxf = makeNoCableDxf()
    const recognized = [{ blockName: 'LAMP_01', qty: 3, asmId: 'ASM-003', confidence: 0.9, matchType: 'partial', rule: {} }]
    const audit = computeDxfAudit(dxf, recognized)
    // 1 insert < 2 → not enough for MST → DEVICE_AVG
    expect(audit.cableMode).toBe(CABLE_MODE.DEVICE_AVG)
  })
})
