import { describe, it, expect } from 'vitest'
import {
  mergeAndNormalize,
  toRecognizedItems,
  estimateCablesMST,
  buildParsedDxfFromPdf,
} from '../pdfTakeoff.js'

// ── mergeAndNormalize ─────────────────────────────────────────────────────────

describe('mergeAndNormalize', () => {
  it('returns empty items and a warning when both inputs are null', () => {
    const result = mergeAndNormalize(null, null)
    expect(result.items).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.includes('szimbólumokat'))).toBe(true)
  })

  it('extracts items from vision API result', () => {
    const vision = {
      success: true,
      _vision_items: [
        { name: 'Dugalj', type: 'dugalj', quantity: 5 },
        { name: 'Lámpatest', type: 'lampa', quantity: 3 },
      ],
      _vision_confidence: 0.8,
    }
    const result = mergeAndNormalize(vision, null)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].qty).toBe(5)
    expect(result.items[0].type).toBe('dugalj')
    expect(result.items[0].cableType).toBe('power')
    expect(result.items[1].qty).toBe(3)
    expect(result.items[1].type).toBe('lampa')
  })

  it('ignores vision items with qty <= 0', () => {
    const vision = {
      success: true,
      _vision_items: [
        { name: 'Dugalj', type: 'dugalj', quantity: 0 },
        { name: 'Kapcsoló', type: 'kapcsolo', quantity: -1 },
        { name: 'Lámpa', type: 'lampa', quantity: 2 },
      ],
      _vision_confidence: 0.7,
    }
    const result = mergeAndNormalize(vision, null)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe('lampa')
  })

  it('extracts scaleFactor from vector result', () => {
    const vector = {
      success: true,
      _scale: { m_per_pt: 0.005, scale: 100 },
      _symbol_count: 0,
    }
    const result = mergeAndNormalize(null, vector)
    expect(result.scaleFactor).toBe(0.005)
    expect(result.scaleInfo).toMatchObject({ m_per_pt: 0.005, scale: 100 })
  })

  it('guesses type from name when type is missing', () => {
    const vision = {
      success: true,
      _vision_items: [
        { name: 'Füstérzékelő', type: null, quantity: 4 },
      ],
      _vision_confidence: 0.7,
    }
    const result = mergeAndNormalize(vision, null)
    expect(result.items[0].type).toBe('smoke_detector')
    expect(result.items[0].cableType).toBe('fire_alarm')
  })

  it('collects cable lengths from vector result', () => {
    const vector = {
      success: true,
      _symbol_count: 0,
      lengths: [
        { layer: 'NYM-J', length: 42.5 },
        { layer: 'KABEL', length: 0 },  // zero-length should be excluded
      ],
    }
    const result = mergeAndNormalize(null, vector)
    expect(result.lengths).toHaveLength(1)
    expect(result.lengths[0].length).toBe(42.5)
  })

  it('accumulates warnings from both sources', () => {
    const vision = { success: true, _vision_items: [], warnings: ['Vision warning'] }
    const vector = { success: true, _symbol_count: 0, warnings: ['Vector warning'] }
    const result = mergeAndNormalize(vision, vector)
    expect(result.warnings).toContain('Vision warning')
    expect(result.warnings).toContain('Vector warning')
  })
})


// ── toRecognizedItems ─────────────────────────────────────────────────────────

describe('toRecognizedItems', () => {
  const makeItem = (overrides = {}) => ({
    name: 'Dugalj',
    type: 'dugalj',
    qty: 5,
    asmId: 'ASM-001',
    icon: '🔌',
    label: 'Dugalj',
    cableType: 'power',
    confidence: 0.72,
    matchType: 'pdf_vision',
    positions: [{ x: 10, y: 20 }],
    ...overrides,
  })

  it('converts items to recognizedItems format', () => {
    const items = [makeItem()]
    const result = toRecognizedItems(items)
    expect(result).toHaveLength(1)
    const ri = result[0]
    expect(ri.qty).toBe(5)
    expect(ri.asmId).toBe('ASM-001')
    expect(ri.confidence).toBe(0.72)
    expect(ri.matchType).toBe('pdf_vision')
    expect(ri._pdfType).toBe('dugalj')
    expect(ri._pdfCableType).toBe('power')
    expect(ri._pdfPositions).toEqual([{ x: 10, y: 20 }])
  })

  it('generates blockName from type + name (no whitespace)', () => {
    const items = [makeItem({ type: 'lampa', name: 'LED spot lámpa' })]
    const result = toRecognizedItems(items)
    expect(result[0].blockName).not.toMatch(/\s/)
    expect(result[0].blockName).toContain('lampa')
  })

  it('truncates blockName to 80 characters', () => {
    const longName = 'A'.repeat(100)
    const items = [makeItem({ name: longName })]
    const result = toRecognizedItems(items)
    expect(result[0].blockName.length).toBeLessThanOrEqual(80)
  })

  it('sets rule to null when asmId is null', () => {
    const items = [makeItem({ asmId: null })]
    const result = toRecognizedItems(items)
    expect(result[0].asmId).toBeNull()
    expect(result[0].rule).toBeNull()
  })

  it('populates rule object when asmId is set', () => {
    const items = [makeItem({ asmId: 'ASM-001', icon: '🔌', label: 'Dugalj' })]
    const result = toRecognizedItems(items)
    expect(result[0].rule).toMatchObject({ asmId: 'ASM-001', icon: '🔌', label: 'Dugalj' })
  })
})


// ── estimateCablesMST ─────────────────────────────────────────────────────────

describe('estimateCablesMST', () => {
  it('returns fallback estimates when no positions available', () => {
    const items = [
      { type: 'dugalj', cableType: 'power',      qty: 4, positions: [] },
      { type: 'lampa',  cableType: 'power',      qty: 2, positions: [] },
      { type: 'camera', cableType: 'cctv',       qty: 1, positions: [] },
    ]
    const result = estimateCablesMST(items, null)
    expect(result.confidence).toBe(0.55)
    expect(result.method).toContain('átlag hossz')
    expect(result._source).toBe('pdf_takeoff')

    // power: (4+2) * 7 = 42m, cctv: 1 * 15 = 15m → total 57m
    expect(result.cable_total_m).toBe(57)
    expect(result.cable_by_system.power.length_m).toBe(42)
    expect(result.cable_by_system.cctv.length_m).toBe(15)
  })

  it('excludes panel items from cable estimation', () => {
    const items = [
      { type: 'panel', cableType: 'panel', qty: 1, positions: [] },
      { type: 'dugalj', cableType: 'power', qty: 3, positions: [] },
    ]
    const result = estimateCablesMST(items, null)
    expect(result.cable_by_system.panel).toBeUndefined()
    expect(result.cable_by_system.power).toBeDefined()
  })

  it('returns zero total for empty items', () => {
    const result = estimateCablesMST([], null)
    expect(result.cable_total_m).toBe(0)
    expect(Object.keys(result.cable_by_system)).toHaveLength(0)
  })

  it('uses position-based MST when positions and scaleFactor are provided', () => {
    // Panel at origin, 2 power devices at known positions
    const items = [
      {
        type: 'panel',
        cableType: 'panel',
        qty: 1,
        positions: [{ x: 0, y: 0 }],
      },
      {
        type: 'dugalj',
        cableType: 'power',
        qty: 2,
        positions: [{ x: 100, y: 0 }, { x: 0, y: 200 }],
      },
    ]
    // scaleFactor = 0.001 (mm → m)
    const result = estimateCablesMST(items, 0.001)
    expect(result.confidence).toBe(0.75)
    expect(result.method).toContain('MST')
    // Should be > 0 with positions
    expect(result.cable_total_m).toBeGreaterThan(0)
  })

  it('assigns correct topology labels per system', () => {
    const items = [
      { type: 'smoke_detector', cableType: 'fire_alarm', qty: 2, positions: [] },
      { type: 'camera',         cableType: 'cctv',       qty: 1, positions: [] },
    ]
    const result = estimateCablesMST(items, null)
    expect(result.cable_by_system.fire_alarm.topology).toBe('loop')
    expect(result.cable_by_system.cctv.topology).toBe('star')
  })
})


// ── buildParsedDxfFromPdf ─────────────────────────────────────────────────────

describe('buildParsedDxfFromPdf', () => {
  const merged = {
    items: [
      { type: 'dugalj', name: 'Dugalj',  qty: 5, confidence: 0.8 },
      { type: 'lampa',  name: 'Lámpa',   qty: 3, confidence: 0.8 },
    ],
    scaleFactor: 0.001,
    scaleInfo: { scale: 100 },
    lengths: [],
    warnings: [],
  }
  const cableEst = { cable_total_m: 57 }

  it('produces a parsedDxf-compatible structure', () => {
    const result = buildParsedDxfFromPdf(merged, cableEst)
    expect(result.success).toBe(true)
    expect(result._source).toBe('pdf_takeoff')
    expect(result.blocks).toHaveLength(2)
    expect(result.inserts).toEqual([])
    expect(result.lineGeom).toEqual([])
    expect(result.geomBounds).toBeNull()
  })

  it('synthesizes a cable length entry when no lengths in merged', () => {
    const result = buildParsedDxfFromPdf(merged, cableEst)
    expect(result.lengths).toHaveLength(1)
    expect(result.lengths[0].length).toBe(57)
  })

  it('uses server-provided lengths when available', () => {
    const mergedWithLengths = {
      ...merged,
      lengths: [{ layer: 'KABEL', length: 100, length_raw: 100 }],
    }
    const result = buildParsedDxfFromPdf(mergedWithLengths, cableEst)
    expect(result.lengths).toHaveLength(1)
    expect(result.lengths[0].length).toBe(100)
  })

  it('populates summary totals correctly', () => {
    const result = buildParsedDxfFromPdf(merged, cableEst)
    expect(result.summary.total_blocks).toBe(8)  // 5 + 3
    expect(result.summary.total_block_types).toBe(2)
    expect(result.summary.total_inserts).toBe(0)
  })
})
