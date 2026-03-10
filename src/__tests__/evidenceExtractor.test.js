import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── localStorage mock (needed because evidenceExtractor imports from recognitionMemory) ──
let store = {}
beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    get length() { return Object.keys(store).length },
    key: (i) => Object.keys(store)[i] ?? null,
    clear: () => { store = {} },
  })
})

import { buildBlockEvidence } from '../data/evidenceExtractor.js'

// ── Helper: build a minimal normalized DXF contract ─────────────────────────
function makeContract(overrides = {}) {
  return {
    success: true,
    blocks: [],
    insertPositions: [],
    textEntities: [],
    geomBounds: null,
    ...overrides,
  }
}

describe('buildBlockEvidence', () => {
  it('returns empty map for null input', () => {
    const result = buildBlockEvidence(null)
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('returns empty map for failed parse', () => {
    const result = buildBlockEvidence({ success: false })
    expect(result.size).toBe(0)
  })

  it('returns empty map when no blocks and no inserts', () => {
    const result = buildBlockEvidence(makeContract())
    expect(result.size).toBe(0)
  })

  it('builds evidence for a block with layer', () => {
    const contract = makeContract({
      blocks: [{ name: 'LAMP_01', layer: 'E_LIGHT', count: 3 }],
      insertPositions: [
        { name: 'LAMP_01', layer: 'E_LIGHT', x: 100, y: 200, attribs: null },
        { name: 'LAMP_01', layer: 'E_LIGHT', x: 150, y: 250, attribs: null },
        { name: 'LAMP_01', layer: 'E_LIGHT', x: 200, y: 300, attribs: null },
      ],
    })

    const evMap = buildBlockEvidence(contract)
    expect(evMap.size).toBe(1)

    const ev = evMap.get('LAMP_01')
    expect(ev).toBeDefined()
    expect(ev.blockName).toBe('LAMP_01')
    expect(ev.layer).toBe('E_LIGHT')
    expect(ev.signals.block_name).toBeTruthy()
    expect(ev.signals.layer_name).toBeTruthy()
  })

  it('picks dominant layer across inserts', () => {
    const contract = makeContract({
      blocks: [{ name: 'BLK_01', layer: 'LAYER_A', count: 5 }],
      insertPositions: [
        { name: 'BLK_01', layer: 'LAYER_A', x: 0, y: 0, attribs: null },
        { name: 'BLK_01', layer: 'LAYER_A', x: 1, y: 1, attribs: null },
        { name: 'BLK_01', layer: 'LAYER_A', x: 2, y: 2, attribs: null },
        { name: 'BLK_01', layer: 'LAYER_B', x: 3, y: 3, attribs: null },
        { name: 'BLK_01', layer: 'LAYER_B', x: 4, y: 4, attribs: null },
      ],
    })

    const ev = buildBlockEvidence(contract).get('BLK_01')
    expect(ev.layer).toBe('LAYER_A') // 3 vs 2 → A wins
  })

  it('aggregates ATTRIBs when 70%+ share same set', () => {
    const attribs = [{ tag: 'TYPE', value: 'SOCKET_2P' }]
    const contract = makeContract({
      blocks: [{ name: 'KAP_01', layer: 'E_SOCKET', count: 10 }],
      insertPositions: Array.from({ length: 10 }, (_, i) => ({
        name: 'KAP_01', layer: 'E_SOCKET', x: i * 10, y: 0,
        attribs: i < 8 ? attribs : null, // 8 of 10 = 80% → should aggregate
      })),
    })

    const ev = buildBlockEvidence(contract).get('KAP_01')
    expect(ev.attribs).toEqual(attribs)
    expect(ev.signals.attribute_signature).toBeTruthy()
  })

  it('does NOT aggregate ATTRIBs when <70% share same set', () => {
    const attribs = [{ tag: 'TYPE', value: 'SOCKET_2P' }]
    const contract = makeContract({
      blocks: [{ name: 'KAP_02', layer: 'E_SOCKET', count: 10 }],
      insertPositions: Array.from({ length: 10 }, (_, i) => ({
        name: 'KAP_02', layer: 'E_SOCKET', x: i * 10, y: 0,
        attribs: i < 5 ? attribs : null, // 5 of 10 = 50% → should NOT aggregate
      })),
    })

    const ev = buildBlockEvidence(contract).get('KAP_02')
    expect(ev.attribs).toBeNull()
    expect(ev.signals.attribute_signature).toBeNull()
  })

  it('captures nearby text within radius', () => {
    const contract = makeContract({
      blocks: [{ name: 'BLK_X', layer: 'DEFAULT', count: 1 }],
      insertPositions: [
        { name: 'BLK_X', layer: 'DEFAULT', x: 100, y: 100, attribs: null },
      ],
      textEntities: [
        { text: 'DUGALJ', x: 105, y: 105, layer: 'DEFAULT' },    // close → included
        { text: 'FAR_AWAY', x: 9999, y: 9999, layer: 'DEFAULT' }, // far → excluded
      ],
      geomBounds: { width: 10000, height: 10000 }, // radius = 10000*0.02 = 200
    })

    const ev = buildBlockEvidence(contract).get('BLK_X')
    expect(ev.nearbyText).toContain('DUGALJ')
    expect(ev.nearbyText).not.toContain('FAR_AWAY')
  })

  it('excludes text outside radius', () => {
    const contract = makeContract({
      blocks: [{ name: 'BLK_Y', layer: 'DEFAULT', count: 1 }],
      insertPositions: [
        { name: 'BLK_Y', layer: 'DEFAULT', x: 0, y: 0, attribs: null },
      ],
      textEntities: [
        { text: 'TOO_FAR', x: 500, y: 500, layer: 'DEFAULT' },
      ],
      geomBounds: { width: 1000, height: 1000 }, // radius = 1000*0.02 = 20
    })

    const ev = buildBlockEvidence(contract).get('BLK_Y')
    expect(ev.nearbyText).toEqual([])
  })

  it('deduplicates nearby text', () => {
    const contract = makeContract({
      blocks: [{ name: 'BLK_Z', layer: 'DEFAULT', count: 1 }],
      insertPositions: [
        { name: 'BLK_Z', layer: 'DEFAULT', x: 100, y: 100, attribs: null },
      ],
      textEntities: [
        { text: 'SOCKET', x: 101, y: 101, layer: 'DEFAULT' },
        { text: 'SOCKET', x: 102, y: 102, layer: 'DEFAULT' },
        { text: 'OUTLET', x: 103, y: 103, layer: 'DEFAULT' },
      ],
      geomBounds: { width: 10000, height: 10000 },
    })

    const ev = buildBlockEvidence(contract).get('BLK_Z')
    // SOCKET should appear only once
    const socketCount = ev.nearbyText.filter(t => t === 'SOCKET').length
    expect(socketCount).toBe(1)
  })

  it('produces all signals when full evidence is available', () => {
    const contract = makeContract({
      blocks: [{ name: 'LAMP_SPOT', layer: 'E_LIGHT', count: 5 }],
      insertPositions: Array.from({ length: 5 }, (_, i) => ({
        name: 'LAMP_SPOT', layer: 'E_LIGHT', x: 100 + i, y: 200,
        attribs: [{ tag: 'TYPE', value: 'SPOT_LED' }],
      })),
      textEntities: [
        { text: 'LÁMPA', x: 102, y: 201, layer: 'E_LIGHT' },
      ],
      geomBounds: { width: 10000, height: 10000 },
    })

    const ev = buildBlockEvidence(contract).get('LAMP_SPOT')
    expect(ev.signals.block_name).toBeTruthy()
    expect(ev.signals.layer_name).toBeTruthy()
    expect(ev.signals.attribute_signature).toBeTruthy()
    // nearby_text depends on quality gate in normalizeTextSignature
    // 'LÁMPA' contains keyword → should pass
    expect(ev.signals.nearby_text).toBeTruthy()
  })

  it('block with no useful context has only block_name signal', () => {
    const contract = makeContract({
      blocks: [{ name: 'XYZ_123', layer: 'DEFAULT', count: 1 }],
      insertPositions: [], // no inserts → no layer, no attribs, no text
    })

    const ev = buildBlockEvidence(contract).get('XYZ_123')
    expect(ev).toBeDefined()
    expect(ev.signals.block_name).toBeTruthy()
    expect(ev.signals.layer_name).toBeNull()
    expect(ev.signals.attribute_signature).toBeNull()
    expect(ev.signals.nearby_text).toBeNull()
  })

  it('handles multiple block types independently', () => {
    const contract = makeContract({
      blocks: [
        { name: 'BLOCK_A', layer: 'LAYER_1', count: 2 },
        { name: 'BLOCK_B', layer: 'LAYER_2', count: 3 },
      ],
      insertPositions: [
        { name: 'BLOCK_A', layer: 'LAYER_1', x: 0, y: 0, attribs: null },
        { name: 'BLOCK_A', layer: 'LAYER_1', x: 10, y: 10, attribs: null },
        { name: 'BLOCK_B', layer: 'LAYER_2', x: 500, y: 500, attribs: null },
        { name: 'BLOCK_B', layer: 'LAYER_2', x: 510, y: 510, attribs: null },
        { name: 'BLOCK_B', layer: 'LAYER_2', x: 520, y: 520, attribs: null },
      ],
    })

    const evMap = buildBlockEvidence(contract)
    expect(evMap.size).toBe(2)
    expect(evMap.get('BLOCK_A').layer).toBe('LAYER_1')
    expect(evMap.get('BLOCK_B').layer).toBe('LAYER_2')
  })
})
