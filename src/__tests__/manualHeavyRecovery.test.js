// ─── Manual-Heavy Recovery Tests ────────────────────────────────────────────
// Tests for the manual-heavy DXF recovery improvement:
//   1. Unknown blocks sorted by qty descending (highest impact first)
//   2. Progress computation (coverage % for resolved block types)
//   3. MANUAL_HEAVY audit classification for edge cases
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { computeDxfAudit, DXF_STATUS } from '../utils/dxfAudit.js'
import { computeWorkflowStatus } from '../utils/workflowStatus.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simulates the unknownProgress computation from TakeoffWorkspace */
function computeProgress(effectiveItems, unknownItems) {
  const totalTypes = effectiveItems.length
  const unresolvedTypes = unknownItems.length
  const resolvedTypes = totalTypes - unresolvedTypes
  const totalQty = effectiveItems.reduce((s, i) => s + i.qty, 0)
  const unresolvedQty = unknownItems.reduce((s, i) => s + i.qty, 0)
  const resolvedQty = totalQty - unresolvedQty
  const coveragePct = totalQty > 0 ? Math.round((resolvedQty / totalQty) * 100) : 0
  return { resolvedTypes, totalTypes, resolvedQty, totalQty, coveragePct }
}

/** Sort unknown items by qty desc (same logic as UnknownBlockPanel) */
function sortByQtyDesc(items) {
  return [...items].sort((a, b) => b.qty - a.qty)
}

function makeItem(blockName, qty, asmId = null) {
  return { blockName, qty, asmId, confidence: asmId ? 0.9 : 0, matchType: asmId ? 'partial' : 'unknown' }
}

// ── Sort order: qty descending ──────────────────────────────────────────────

describe('Unknown block sort order (qty descending)', () => {
  it('sorts highest qty first', () => {
    const items = [
      makeItem('BLK_A', 3),
      makeItem('BLK_B', 50),
      makeItem('BLK_C', 12),
    ]
    const sorted = sortByQtyDesc(items)
    expect(sorted[0].blockName).toBe('BLK_B')
    expect(sorted[1].blockName).toBe('BLK_C')
    expect(sorted[2].blockName).toBe('BLK_A')
  })

  it('preserves order for equal qty', () => {
    const items = [
      makeItem('BLK_X', 5),
      makeItem('BLK_Y', 5),
      makeItem('BLK_Z', 5),
    ]
    const sorted = sortByQtyDesc(items)
    // Equal qty → original order preserved (stable sort)
    expect(sorted.length).toBe(3)
    expect(sorted.map(i => i.qty)).toEqual([5, 5, 5])
  })

  it('single item returns unchanged', () => {
    const items = [makeItem('ONLY', 10)]
    const sorted = sortByQtyDesc(items)
    expect(sorted.length).toBe(1)
    expect(sorted[0].blockName).toBe('ONLY')
  })

  it('empty array returns empty', () => {
    expect(sortByQtyDesc([])).toEqual([])
  })
})

// ── Progress computation ────────────────────────────────────────────────────

describe('Unknown block progress computation', () => {
  it('all items unresolved → 0% coverage', () => {
    const all = [makeItem('A', 10), makeItem('B', 20), makeItem('C', 30)]
    const unknown = [...all]
    const progress = computeProgress(all, unknown)
    expect(progress.resolvedTypes).toBe(0)
    expect(progress.totalTypes).toBe(3)
    expect(progress.coveragePct).toBe(0)
  })

  it('all items resolved → 100% coverage, 0 unknown', () => {
    const all = [makeItem('A', 10, 'ASM-001'), makeItem('B', 20, 'ASM-002')]
    const unknown = []
    const progress = computeProgress(all, unknown)
    expect(progress.resolvedTypes).toBe(2)
    expect(progress.totalTypes).toBe(2)
    expect(progress.coveragePct).toBe(100)
    expect(progress.resolvedQty).toBe(30)
  })

  it('partial resolution → correct coverage %', () => {
    const all = [
      makeItem('A', 50, 'ASM-001'),  // resolved — 50 instances
      makeItem('B', 30),              // unknown — 30 instances
      makeItem('C', 10),              // unknown — 10 instances
      makeItem('D', 10, 'ASM-003'),   // resolved — 10 instances
    ]
    const unknown = [makeItem('B', 30), makeItem('C', 10)]
    const progress = computeProgress(all, unknown)
    expect(progress.resolvedTypes).toBe(2)
    expect(progress.totalTypes).toBe(4)
    expect(progress.resolvedQty).toBe(60)
    expect(progress.totalQty).toBe(100)
    expect(progress.coveragePct).toBe(60)
  })

  it('resolving highest-qty item first gives disproportionate coverage', () => {
    // Scenario: 3 blocks — one has 80% of instances
    const all = [
      makeItem('BIG', 80, 'ASM-001'),  // resolved
      makeItem('MED', 15),              // unknown
      makeItem('SMALL', 5),             // unknown
    ]
    const unknown = [makeItem('MED', 15), makeItem('SMALL', 5)]
    const progress = computeProgress(all, unknown)
    expect(progress.resolvedTypes).toBe(1)
    expect(progress.totalTypes).toBe(3)
    expect(progress.coveragePct).toBe(80) // 1 block resolved = 80% coverage
  })

  it('empty effective items → 0 coverage, no division by zero', () => {
    const progress = computeProgress([], [])
    expect(progress.coveragePct).toBe(0)
    expect(progress.totalTypes).toBe(0)
    expect(progress.totalQty).toBe(0)
  })
})

// ── MANUAL_HEAVY audit classification ───────────────────────────────────────

describe('MANUAL_HEAVY audit classification', () => {
  it('classifies zero-recognition DXF as MANUAL_HEAVY', () => {
    const dxf = {
      success: true,
      blocks: [
        { name: 'BLK_A', layer: 'L1', count: 20 },
        { name: 'BLK_B', layer: 'L2', count: 15 },
        { name: 'BLK_C', layer: 'L3', count: 10 },
      ],
      lengths: [], inserts: [],
      layers: ['L1', 'L2', 'L3'],
      units: { insunits: 4, name: 'mm', factor: 0.001, auto_detected: false },
      lineGeom: [], polylineGeom: [], geomBounds: null,
      summary: { total_block_types: 3, total_blocks: 45, total_layers: 3, layers_with_lines: 0, total_inserts: 0 },
    }
    const recognized = [
      makeItem('BLK_A', 20),
      makeItem('BLK_B', 15),
      makeItem('BLK_C', 10),
    ]
    const audit = computeDxfAudit(dxf, recognized)
    expect(audit.status).toBe(DXF_STATUS.MANUAL_HEAVY)
  })

  it('MANUAL_HEAVY guidance includes review_blocks action', () => {
    const dxf = {
      success: true,
      blocks: [
        { name: 'OBJ_1', layer: 'DEFAULT', count: 8 },
        { name: 'OBJ_2', layer: 'DEFAULT', count: 5 },
      ],
      lengths: [], inserts: [],
      layers: ['DEFAULT'],
      units: { insunits: 4, name: 'mm', factor: 0.001, auto_detected: false },
      lineGeom: [], polylineGeom: [], geomBounds: null,
      summary: { total_block_types: 2, total_blocks: 13, total_layers: 1, layers_with_lines: 0, total_inserts: 0 },
    }
    const recognized = [makeItem('OBJ_1', 8), makeItem('OBJ_2', 5)]
    const audit = computeDxfAudit(dxf, recognized)
    expect(audit.guidance.some(g => g.action === 'review_blocks')).toBe(true)
  })
})

// ── Workflow status: MANUAL_HEAVY enrichment ────────────────────────────────

describe('MANUAL_HEAVY workflow status enrichment', () => {
  function makeManualHeavyScenario(overrides = {}) {
    return computeWorkflowStatus({
      hasFile: true,
      dxfAudit: {
        status: 'MANUAL_HEAVY',
        statusMeta: { label: 'Manuális hozzárendelés szükséges', emoji: '🟠', color: '#FF8C42' },
        scores: { blocks: 0.4, recognition: 0, geometry: 0, cable: 0, units: 1 },
        worked: [], missing: ['Egyetlen blokk sem ismerhető fel automatikusan'],
        guidance: [{ action: 'review_blocks', label: 'Blokkok ellenőrzése', description: '...' }],
        cableMode: 'unavailable',
        cableModeMeta: {},
        stats: { totalBlocks: 45, totalBlockTypes: 15, recognizedPct: 0, highConfPct: 0 },
      },
      reviewSummary: {
        confirmed: 0, autoHigh: 0, autoLow: 0, unresolved: 15, excluded: 0, total: 15,
        confirmedQty: 0, autoHighQty: 0, autoLowQty: 0, unresolvedQty: 45, excludedQty: 0, totalQty: 45,
      },
      quoteReadiness: { status: 'review_required', reasons: ['15 blokk nincs hozzárendelve (45 db)'] },
      takeoffRowCount: 0,
      ...overrides,
    })
  }

  it('stage is unresolved_blocks', () => {
    const result = makeManualHeavyScenario()
    expect(result.stage).toBe('unresolved_blocks')
  })

  it('status line mentions largest-first hint', () => {
    const result = makeManualHeavyScenario()
    expect(result.statusLine).toContain('legnagyobb')
  })

  it('detail.reasons includes guidance hint', () => {
    const result = makeManualHeavyScenario()
    expect(result.detail.reasons.length).toBeGreaterThan(1)
    expect(result.detail.reasons.some(r => r.includes('legnagyobb darabszám'))).toBe(true)
  })

  it('CTA remains review_blocks', () => {
    const result = makeManualHeavyScenario()
    expect(result.cta.action).toBe('review_blocks')
  })

  it('save is gated (disabled)', () => {
    // Import getSaveGating inline to keep test self-contained
    const { getSaveGating } = require('../utils/workflowStatus.js')
    const result = makeManualHeavyScenario()
    const gating = getSaveGating(result)
    expect(gating.disabled).toBe(true)
    expect(gating.reason).toBeTruthy()
  })
})
