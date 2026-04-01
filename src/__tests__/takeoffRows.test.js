// ─── Takeoff Row Aggregation Tests ───────────────────────────────────────────
// Safety net for TakeoffWorkspace refactor — tests the extracted row building logic.

import { describe, it, expect } from 'vitest'
import { buildRecognitionRows, buildMarkerRows, mergeTakeoffRows } from '../utils/takeoffRows.js'

// ─── buildRecognitionRows ───────────────────────────────────────────────────

describe('buildRecognitionRows', () => {
  it('groups items by asmId and sums quantities', () => {
    const items = [
      { blockName: 'LAMP_1', qty: 3, asmId: 'ASM-003' },
      { blockName: 'LAMP_2', qty: 2, asmId: 'ASM-003' },
      { blockName: 'SOCKET_1', qty: 5, asmId: 'ASM-001' },
    ]
    const rows = buildRecognitionRows(items, {}, {}, {}, {})
    expect(rows).toHaveLength(2)
    const lamp = rows.find(r => r.asmId === 'ASM-003')
    const socket = rows.find(r => r.asmId === 'ASM-001')
    expect(lamp.qty).toBe(5)
    expect(socket.qty).toBe(5)
  })

  it('skips items with no asmId', () => {
    const items = [
      { blockName: 'UNKNOWN', qty: 10, asmId: null },
      { blockName: 'LAMP', qty: 2, asmId: 'ASM-003' },
    ]
    const rows = buildRecognitionRows(items, {}, {}, {}, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].asmId).toBe('ASM-003')
  })

  it('applies asmOverrides to remap blocks', () => {
    const items = [
      { blockName: 'CUSTOM_BLOCK', qty: 4, asmId: null },
    ]
    const overrides = { 'CUSTOM_BLOCK': 'ASM-002' }
    const rows = buildRecognitionRows(items, overrides, {}, {}, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].asmId).toBe('ASM-002')
    expect(rows[0].qty).toBe(4)
  })

  it('applies qtyOverrides', () => {
    const items = [
      { blockName: 'LAMP', qty: 3, asmId: 'ASM-003' },
    ]
    const qtyOverrides = { 'ASM-003': 10 }
    const rows = buildRecognitionRows(items, {}, qtyOverrides, {}, {})
    expect(rows[0].qty).toBe(10)
  })

  it('uses wallSplit sum as qty when splits exist', () => {
    const items = [
      { blockName: 'SOCKET', qty: 5, asmId: 'ASM-001' },
    ]
    const wallSplits = { 'ASM-001': { drywall: 3, brick: 4, ytong: 1, concrete: 0 } }
    const rows = buildRecognitionRows(items, {}, {}, {}, wallSplits)
    expect(rows[0].qty).toBe(8) // 3+4+1+0
    expect(rows[0].wallSplits).toEqual(wallSplits['ASM-001'])
  })

  it('applies variantOverrides', () => {
    const items = [
      { blockName: 'LAMP', qty: 2, asmId: 'ASM-003' },
    ]
    const variantOverrides = { 'ASM-003': 'VAR-LED-PANEL' }
    const rows = buildRecognitionRows(items, {}, {}, variantOverrides, {})
    expect(rows[0].variantId).toBe('VAR-LED-PANEL')
  })

  it('returns empty array for empty items', () => {
    expect(buildRecognitionRows([], {}, {}, {}, {})).toEqual([])
  })
})

// ─── buildMarkerRows ────────────────────────────────────────────────────────

describe('buildMarkerRows', () => {
  it('counts markers per asmId', () => {
    const markers = [
      { asmId: 'ASM-001' },
      { asmId: 'ASM-001' },
      { asmId: 'ASM-003' },
    ]
    const rows = buildMarkerRows(markers, {}, {})
    expect(rows).toHaveLength(2)
    const socket = rows.find(r => r.asmId === 'ASM-001')
    expect(socket.qty).toBe(2)
    expect(socket._fromMarkers).toBe(true)
  })

  it('uses category as fallback for asmId', () => {
    const markers = [
      { category: 'ASM-002' },
      { category: 'ASM-002' },
    ]
    const rows = buildMarkerRows(markers, {}, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].asmId).toBe('ASM-002')
    expect(rows[0].qty).toBe(2)
  })

  it('skips markers without asmId or ASM- category', () => {
    const markers = [
      { category: 'cable' },
      { category: null },
      { asmId: 'ASM-001' },
    ]
    const rows = buildMarkerRows(markers, {}, {})
    expect(rows).toHaveLength(1)
  })

  it('returns empty for empty markers', () => {
    expect(buildMarkerRows([], {}, {})).toEqual([])
  })

  describe('wallSplit reconciliation', () => {
    it('adds extra markers to brick wall', () => {
      const markers = [
        { asmId: 'ASM-001' },
        { asmId: 'ASM-001' },
        { asmId: 'ASM-001' },
      ]
      const wallSplits = { 'ASM-001': { drywall: 1, brick: 0 } }
      const rows = buildMarkerRows(markers, {}, wallSplits)
      // 3 markers, split total = 1, diff = 2 → brick gets +2
      expect(rows[0].wallSplits.brick).toBe(2)
      expect(rows[0].wallSplits.drywall).toBe(1)
    })

    it('removes from brick first when markers decrease', () => {
      const markers = [
        { asmId: 'ASM-001' },
      ]
      const wallSplits = { 'ASM-001': { drywall: 1, brick: 2 } }
      const rows = buildMarkerRows(markers, {}, wallSplits)
      // 1 marker, split total = 3, diff = -2 → brick reduced by 2
      expect(rows[0].wallSplits.brick).toBe(0)
      expect(rows[0].wallSplits.drywall).toBe(1)
    })

    it('removes from other walls when brick exhausted', () => {
      const markers = [
        { asmId: 'ASM-001' },
      ]
      const wallSplits = { 'ASM-001': { drywall: 2, brick: 1 } }
      const rows = buildMarkerRows(markers, {}, wallSplits)
      // 1 marker, split total = 3, diff = -2 → brick -1 (to 0), drywall -1 (to 1)
      expect(rows[0].wallSplits.brick).toBe(0)
      expect(rows[0].wallSplits.drywall).toBe(1)
    })

    it('preserves splits when counts match', () => {
      const markers = [
        { asmId: 'ASM-001' },
        { asmId: 'ASM-001' },
      ]
      const wallSplits = { 'ASM-001': { drywall: 1, brick: 1 } }
      const rows = buildMarkerRows(markers, {}, wallSplits)
      expect(rows[0].wallSplits).toEqual({ drywall: 1, brick: 1 })
    })

    it('sets wallSplits to null when no splits defined', () => {
      const markers = [{ asmId: 'ASM-001' }]
      const rows = buildMarkerRows(markers, {}, {})
      expect(rows[0].wallSplits).toBeNull()
    })
  })
})

// ─── mergeTakeoffRows ───────────────────────────────────────────────────────

describe('mergeTakeoffRows', () => {
  it('passes through recognition rows when no markers', () => {
    const recRows = [
      { asmId: 'ASM-001', qty: 5, wallSplits: null },
    ]
    const rows = mergeTakeoffRows(recRows, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(5)
  })

  it('passes through marker rows when no recognition', () => {
    const markerRows = [
      { asmId: 'ASM-003', qty: 3, wallSplits: null },
    ]
    const rows = mergeTakeoffRows([], markerRows)
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(3)
  })

  it('merges same asmId: adds quantities', () => {
    const recRows = [{ asmId: 'ASM-001', qty: 5, wallSplits: null }]
    const markerRows = [{ asmId: 'ASM-001', qty: 3, wallSplits: null }]
    const rows = mergeTakeoffRows(recRows, markerRows)
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(8)
  })

  it('merges wallSplits from both sources', () => {
    const recRows = [{ asmId: 'ASM-001', qty: 3, wallSplits: { drywall: 2, brick: 1 } }]
    const markerRows = [{ asmId: 'ASM-001', qty: 2, wallSplits: { drywall: 1, concrete: 1 } }]
    const rows = mergeTakeoffRows(recRows, markerRows)
    expect(rows[0].wallSplits).toEqual({ drywall: 3, brick: 1, concrete: 1 })
  })

  it('keeps different asmIds separate', () => {
    const recRows = [{ asmId: 'ASM-001', qty: 5, wallSplits: null }]
    const markerRows = [{ asmId: 'ASM-003', qty: 3, wallSplits: null }]
    const rows = mergeTakeoffRows(recRows, markerRows)
    expect(rows).toHaveLength(2)
  })

  it('marker wallSplits applied when recognition has none', () => {
    const recRows = [{ asmId: 'ASM-001', qty: 5, wallSplits: null }]
    const markerRows = [{ asmId: 'ASM-001', qty: 2, wallSplits: { brick: 2 } }]
    const rows = mergeTakeoffRows(recRows, markerRows)
    expect(rows[0].wallSplits).toEqual({ brick: 2 })
  })

  it('handles empty inputs', () => {
    expect(mergeTakeoffRows([], [])).toEqual([])
  })
})
