// ─── Wall Split Utilities Tests ───────────────────────────────────────────────
// Tests for wallSplitUtils: creation-time materialization of wall splits,
// marker reconciliation, and preselection behavior.

import { describe, it, expect } from 'vitest'
import {
  reconcileMarkerSplits,
  initializeRecognitionSplits,
  countMarkerAssemblies,
} from '../utils/wallSplitUtils.js'

// ── countMarkerAssemblies ────────────────────────────────────────────────────

describe('countMarkerAssemblies', () => {
  it('counts markers by asmId', () => {
    const markers = [
      { asmId: 'ASM-001' },
      { asmId: 'ASM-001' },
      { asmId: 'ASM-002' },
    ]
    expect(countMarkerAssemblies(markers)).toEqual({ 'ASM-001': 2, 'ASM-002': 1 })
  })

  it('falls back to category if asmId is missing', () => {
    const markers = [
      { category: 'ASM-003' },
      { category: 'ASM-003' },
      { category: 'CABLE' },  // not ASM- prefix — ignored
    ]
    expect(countMarkerAssemblies(markers)).toEqual({ 'ASM-003': 2 })
  })

  it('returns empty object for no markers', () => {
    expect(countMarkerAssemblies([])).toEqual({})
  })

  it('ignores markers without asmId or ASM- category', () => {
    const markers = [
      { category: 'CABLE' },
      { category: 'MISC' },
      {},
    ]
    expect(countMarkerAssemblies(markers)).toEqual({})
  })
})

// ── reconcileMarkerSplits ────────────────────────────────────────────────────

describe('reconcileMarkerSplits', () => {
  it('creates splits for new assembly with preselected wall type', () => {
    const prev = {}
    const counts = { 'ASM-001': 3 }
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'ytong')
    expect(changed).toBe(true)
    expect(next['ASM-001']).toEqual({ ytong: 3 })
  })

  it('defaults to brick when brick is active', () => {
    const prev = {}
    const counts = { 'ASM-001': 5 }
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'brick')
    expect(changed).toBe(true)
    expect(next['ASM-001']).toEqual({ brick: 5 })
  })

  it('adds markers to active wall type for existing assembly', () => {
    const prev = { 'ASM-001': { brick: 2 } }
    const counts = { 'ASM-001': 5 }  // 3 new markers
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'drywall')
    expect(changed).toBe(true)
    expect(next['ASM-001']).toEqual({ brick: 2, drywall: 3 })
  })

  it('adds to same wall type if already has entries', () => {
    const prev = { 'ASM-001': { drywall: 2, brick: 1 } }
    const counts = { 'ASM-001': 5 }  // 2 new markers
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'drywall')
    expect(changed).toBe(true)
    expect(next['ASM-001']).toEqual({ drywall: 4, brick: 1 })
  })

  it('reduces proportionally when markers removed', () => {
    const prev = { 'ASM-001': { brick: 3, drywall: 2 } }
    const counts = { 'ASM-001': 3 }  // 2 removed
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'brick')
    expect(changed).toBe(true)
    // Reduces from first key (brick) first: brick 3→1, drywall stays 2
    const total = Object.values(next['ASM-001']).reduce((s, n) => s + n, 0)
    expect(total).toBe(3)
  })

  it('no change when count matches split total', () => {
    const prev = { 'ASM-001': { brick: 2, ytong: 1 } }
    const counts = { 'ASM-001': 3 }  // same total
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'brick')
    expect(changed).toBe(false)
    expect(next['ASM-001']).toEqual({ brick: 2, ytong: 1 })
  })

  it('handles multiple assemblies simultaneously', () => {
    const prev = { 'ASM-001': { brick: 1 } }
    const counts = { 'ASM-001': 2, 'ASM-002': 3 }
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'concrete')
    expect(changed).toBe(true)
    expect(next['ASM-001']).toEqual({ brick: 1, concrete: 1 })
    expect(next['ASM-002']).toEqual({ concrete: 3 })
  })

  it('preserves unrelated assemblies in prev state', () => {
    const prev = { 'ASM-099': { brick: 5 } }
    const counts = { 'ASM-001': 2 }
    const { next, changed } = reconcileMarkerSplits(prev, counts, 'brick')
    expect(changed).toBe(true)
    expect(next['ASM-099']).toEqual({ brick: 5 })
    expect(next['ASM-001']).toEqual({ brick: 2 })
  })

  it('does not mutate prev state', () => {
    const prev = { 'ASM-001': { brick: 1 } }
    const prevCopy = JSON.parse(JSON.stringify(prev))
    reconcileMarkerSplits(prev, { 'ASM-001': 3 }, 'drywall')
    expect(prev).toEqual(prevCopy)
  })
})

// ── initializeRecognitionSplits ──────────────────────────────────────────────

describe('initializeRecognitionSplits', () => {
  it('creates splits for new DXF items with preselected wall type', () => {
    const prev = {}
    const rows = [
      { asmId: 'ASM-010', qty: 4 },
      { asmId: 'ASM-011', qty: 2 },
    ]
    const { next, changed } = initializeRecognitionSplits(prev, rows, 'ytong')
    expect(changed).toBe(true)
    expect(next['ASM-010']).toEqual({ ytong: 4 })
    expect(next['ASM-011']).toEqual({ ytong: 2 })
  })

  it('does not overwrite existing splits', () => {
    const prev = { 'ASM-010': { brick: 3, drywall: 1 } }
    const rows = [{ asmId: 'ASM-010', qty: 4 }]
    const { next, changed } = initializeRecognitionSplits(prev, rows, 'concrete')
    expect(changed).toBe(false)
    // Existing splits untouched
    expect(next['ASM-010']).toEqual({ brick: 3, drywall: 1 })
  })

  it('initializes only missing assemblies', () => {
    const prev = { 'ASM-010': { brick: 2 } }
    const rows = [
      { asmId: 'ASM-010', qty: 2 },  // already exists — skip
      { asmId: 'ASM-011', qty: 5 },  // new — initialize
    ]
    const { next, changed } = initializeRecognitionSplits(prev, rows, 'drywall')
    expect(changed).toBe(true)
    expect(next['ASM-010']).toEqual({ brick: 2 })  // untouched
    expect(next['ASM-011']).toEqual({ drywall: 5 })
  })

  it('returns changed=false when all rows already have splits', () => {
    const prev = { 'ASM-010': { brick: 4 } }
    const rows = [{ asmId: 'ASM-010', qty: 4 }]
    const { next, changed } = initializeRecognitionSplits(prev, rows, 'brick')
    expect(changed).toBe(false)
  })

  it('handles empty rows', () => {
    const prev = { 'ASM-010': { brick: 1 } }
    const { next, changed } = initializeRecognitionSplits(prev, [], 'brick')
    expect(changed).toBe(false)
    expect(next).toEqual({ 'ASM-010': { brick: 1 } })
  })

  it('defaults to brick when activeWallType is brick', () => {
    const prev = {}
    const rows = [{ asmId: 'ASM-010', qty: 3 }]
    const { next } = initializeRecognitionSplits(prev, rows, 'brick')
    expect(next['ASM-010']).toEqual({ brick: 3 })
  })

  it('does not mutate prev state', () => {
    const prev = { 'ASM-010': { brick: 2 } }
    const prevCopy = JSON.parse(JSON.stringify(prev))
    initializeRecognitionSplits(prev, [{ asmId: 'ASM-011', qty: 1 }], 'drywall')
    expect(prev).toEqual(prevCopy)
  })
})

// ── Integration scenarios ────────────────────────────────────────────────────

describe('wall preselection scenarios', () => {
  it('S1: user preselects ytong, places 3 markers → all in ytong', () => {
    const markers = [
      { asmId: 'ASM-001' },
      { asmId: 'ASM-001' },
      { asmId: 'ASM-001' },
    ]
    const counts = countMarkerAssemblies(markers)
    const { next } = reconcileMarkerSplits({}, counts, 'ytong')
    expect(next['ASM-001']).toEqual({ ytong: 3 })
  })

  it('S2: user preselects drywall, places markers for 2 assemblies', () => {
    const markers = [
      { asmId: 'ASM-001' },
      { asmId: 'ASM-002' },
      { asmId: 'ASM-001' },
    ]
    const counts = countMarkerAssemblies(markers)
    const { next } = reconcileMarkerSplits({}, counts, 'drywall')
    expect(next['ASM-001']).toEqual({ drywall: 2 })
    expect(next['ASM-002']).toEqual({ drywall: 1 })
  })

  it('S3: user switches wall type mid-session, new markers go to new type', () => {
    // First batch: brick
    const markers1 = [{ asmId: 'ASM-001' }, { asmId: 'ASM-001' }]
    const counts1 = countMarkerAssemblies(markers1)
    const { next: state1 } = reconcileMarkerSplits({}, counts1, 'brick')
    expect(state1['ASM-001']).toEqual({ brick: 2 })

    // Second batch: user switches to drywall, adds 1 more marker
    const markers2 = [...markers1, { asmId: 'ASM-001' }]
    const counts2 = countMarkerAssemblies(markers2)
    const { next: state2 } = reconcileMarkerSplits(state1, counts2, 'drywall')
    expect(state2['ASM-001']).toEqual({ brick: 2, drywall: 1 })
  })

  it('S4: user manually adjusts splits, then adds more markers', () => {
    // Initial: 3 markers, all brick
    const state = { 'ASM-001': { brick: 1, ytong: 2 } }  // manually adjusted

    // User adds 2 more markers with concrete selected
    const markers = Array(5).fill({ asmId: 'ASM-001' })
    const counts = countMarkerAssemblies(markers)
    const { next } = reconcileMarkerSplits(state, counts, 'concrete')
    expect(next['ASM-001']).toEqual({ brick: 1, ytong: 2, concrete: 2 })
  })

  it('S5: fresh DXF parse with ytong preselected', () => {
    const rows = [
      { asmId: 'ASM-010', qty: 5 },
      { asmId: 'ASM-011', qty: 3 },
    ]
    const { next } = initializeRecognitionSplits({}, rows, 'ytong')
    expect(next['ASM-010']).toEqual({ ytong: 5 })
    expect(next['ASM-011']).toEqual({ ytong: 3 })
  })

  it('S6: file reset clears splits, re-parse initializes with current wall type', () => {
    // After reset, prev is empty
    const rows = [{ asmId: 'ASM-010', qty: 4 }]
    const { next } = initializeRecognitionSplits({}, rows, 'concrete')
    expect(next['ASM-010']).toEqual({ concrete: 4 })
  })

  it('S7: plan restore provides wallSplits — initializeRecognition does not overwrite', () => {
    // Plan annotation restored splits
    const restored = { 'ASM-010': { drywall: 2, brick: 2 } }
    const rows = [{ asmId: 'ASM-010', qty: 4 }]
    const { next, changed } = initializeRecognitionSplits(restored, rows, 'concrete')
    expect(changed).toBe(false)
    expect(next['ASM-010']).toEqual({ drywall: 2, brick: 2 })  // untouched
  })

  it('S8: row-based wall selection — switching active wall type between rows', () => {
    // User clicks "GK" chip in ASM-001 row → activeWallType = 'drywall'
    // Then places 2 markers for ASM-001 → goes into drywall
    const counts1 = { 'ASM-001': 2 }
    const { next: state1 } = reconcileMarkerSplits({}, counts1, 'drywall')
    expect(state1['ASM-001']).toEqual({ drywall: 2 })

    // User clicks "Ytong" chip in ASM-002 row → activeWallType = 'ytong'
    // Then places 3 markers for ASM-002 → goes into ytong
    const counts2 = { 'ASM-001': 2, 'ASM-002': 3 }
    const { next: state2 } = reconcileMarkerSplits(state1, counts2, 'ytong')
    expect(state2['ASM-001']).toEqual({ drywall: 2 })  // untouched
    expect(state2['ASM-002']).toEqual({ ytong: 3 })     // new
  })

  it('S9: variant + wall type form combined preselection context', () => {
    // Variant is stored separately (variantOverrides[asmId]) — not in wallSplits.
    // Wall splits only track wall-type distribution per assembly.
    // Verify that wall splits work independently of variant changes.
    const counts = { 'ASM-001': 4 }
    const { next } = reconcileMarkerSplits({}, counts, 'concrete')
    expect(next['ASM-001']).toEqual({ concrete: 4 })
    // Variant would be in variantOverrides['ASM-001'] = 'dugalj-ip44' (separate state)
    // Wall splits don't care about variant — they track wall material distribution only
  })

  it('S10: +/- editing preserves existing splits regardless of active wall type', () => {
    // Simulate: user had 3 items in brick, manually moved 1 to drywall via +/-
    const afterManualEdit = { 'ASM-001': { brick: 2, drywall: 1 } }
    // Active wall type is now 'ytong' (user clicked ytong chip)
    // But the existing splits for ASM-001 should not be affected
    const { next, changed } = reconcileMarkerSplits(afterManualEdit, { 'ASM-001': 3 }, 'ytong')
    // count = 3, splitTotal = 3, diff = 0 → no change
    expect(changed).toBe(false)
    expect(next['ASM-001']).toEqual({ brick: 2, drywall: 1 })  // untouched
  })

  it('S11: PDF and DXF produce same default wall type when preselected', () => {
    // PDF path: reconcileMarkerSplits with activeWallType = 'concrete'
    const pdfResult = reconcileMarkerSplits({}, { 'ASM-001': 5 }, 'concrete')
    // DXF path: initializeRecognitionSplits with activeWallType = 'concrete'
    const dxfResult = initializeRecognitionSplits({}, [{ asmId: 'ASM-001', qty: 5 }], 'concrete')
    // Both should produce identical splits
    expect(pdfResult.next['ASM-001']).toEqual({ concrete: 5 })
    expect(dxfResult.next['ASM-001']).toEqual({ concrete: 5 })
  })
})
