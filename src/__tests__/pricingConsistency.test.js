// ─── Pricing Path Consistency + Merge Hardening Tests ──────────────────────────
// Verifies:
//   1. assemblySummary includes cable so totals reconcile
//   2. Synthetic/prefill items classify correctly in review state
//   3. Synthetic items do NOT train recognition memory
//   4. Cable handling consistent across pricing entry points
//   5. Quote readiness stays coherent with merge/synthetic items
//   6. No regression in standard DXF/recognition flow
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  classifyItem, classifyAllItems, buildReviewSummary,
  computeQuoteReadiness, shouldTrainMemory, getEffectiveAsmId,
  isSyntheticItem,
  CONFIDENCE_HIGH, CONFIDENCE_CONFIRMED, CABLE_CONFIDENCE_STRONG,
} from '../utils/reviewState.js'
import {
  buildCableSummaryEntry, buildAssemblySummary,
  isSyntheticItem as isSyntheticItemContract,
  normalizeMergeCableEstimate,
} from '../utils/pricingContract.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides) {
  return {
    blockName: 'BLK_TEST',
    asmId: 'ASM-001',
    qty: 2,
    confidence: 0.90,
    matchType: 'rule',
    ...overrides,
  }
}

function makeSyntheticItem(overrides) {
  return {
    blockName: 'PREFILL_socket',
    asmId: 'ASM-001',
    qty: 5,
    confidence: 1.0,
    ...overrides,
  }
}

function makePricingResult(overrides) {
  return {
    materialCost: 10000,
    laborCost: 5000,
    laborHours: 2,
    subtotal: 15000,
    markup: 1500,
    total: 16500,
    lines: [
      { name: 'Dugalj', code: 'MAT-001', qty: 2, unit: 'db', hours: 0, materialCost: 8000, type: 'material', systemType: 'power' },
      { name: 'Szerelés', code: 'WI-001', qty: 2, unit: 'db', hours: 1.5, materialCost: 0, type: 'labor', systemType: 'power' },
    ],
    warnings: [],
    ...overrides,
  }
}

function makePricingWithCable(overrides) {
  return makePricingResult({
    materialCost: 13000,
    laborCost: 6200,
    laborHours: 2.8,
    subtotal: 19200,
    markup: 1920,
    total: 21120,
    lines: [
      { name: 'Dugalj', code: 'MAT-001', qty: 2, unit: 'db', hours: 0, materialCost: 8000, type: 'material', systemType: 'power' },
      { name: 'Szerelés', code: 'WI-001', qty: 2, unit: 'db', hours: 1.5, materialCost: 0, type: 'labor', systemType: 'power' },
      { name: 'NYM-J 3×2.5', code: 'MAT-021', qty: 20, unit: 'm', hours: 0, materialCost: 3000, type: 'cable', systemType: 'power' },
      { name: 'NYM-J 3×1.5', code: 'MAT-020', qty: 15, unit: 'm', hours: 0, materialCost: 2000, type: 'cable', systemType: 'lighting' },
    ],
    ...overrides,
  })
}

// Minimal computePricing stub for buildAssemblySummary
function stubComputePricing({ takeoffRows }) {
  const row = takeoffRows[0]
  return {
    materialCost: row.qty * 1000,
    laborCost: row.qty * 500,
    laborHours: row.qty * 0.5,
    total: row.qty * 1650,   // with 10% markup
    lines: [],
    warnings: [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Synthetic item classification
// ═══════════════════════════════════════════════════════════════════════════════

describe('isSyntheticItem', () => {
  it('returns true for PREFILL_ items', () => {
    expect(isSyntheticItem({ blockName: 'PREFILL_socket' })).toBe(true)
    expect(isSyntheticItem({ blockName: 'PREFILL_light' })).toBe(true)
    expect(isSyntheticItem({ blockName: 'PREFILL_KAP_DUGALJ' })).toBe(true)
  })

  it('returns false for real block names', () => {
    expect(isSyntheticItem({ blockName: 'KAP_DUGALJ_2P' })).toBe(false)
    expect(isSyntheticItem({ blockName: 'BLK_001' })).toBe(false)
  })

  it('returns false for null/undefined/empty', () => {
    expect(isSyntheticItem(null)).toBe(false)
    expect(isSyntheticItem(undefined)).toBe(false)
    expect(isSyntheticItem({})).toBe(false)
    expect(isSyntheticItem({ blockName: '' })).toBe(false)
  })

  it('pricingContract isSyntheticItem agrees with reviewState', () => {
    const item = makeSyntheticItem()
    expect(isSyntheticItem(item)).toBe(isSyntheticItemContract(item))
  })
})

describe('classifyItem with synthetic items', () => {
  it('classifies PREFILL_ with asmId as confirmed', () => {
    const item = makeSyntheticItem({ asmId: 'ASM-001' })
    expect(classifyItem(item)).toBe('confirmed')
  })

  it('classifies PREFILL_ without asmId as unresolved', () => {
    const item = makeSyntheticItem({ asmId: null })
    expect(classifyItem(item)).toBe('unresolved')
  })

  it('classifies PREFILL_ with empty asmId as unresolved', () => {
    const item = makeSyntheticItem({ asmId: '' })
    expect(classifyItem(item)).toBe('unresolved')
  })

  it('respects deletedItems for synthetic items', () => {
    const item = makeSyntheticItem()
    const deleted = new Set(['PREFILL_socket'])
    expect(classifyItem(item, {}, deleted)).toBe('excluded')
  })

  it('synthetic items get confirmed even without matchType', () => {
    // Synthetic items from MergePlansView have no matchType
    const item = { blockName: 'PREFILL_X', asmId: 'ASM-001', qty: 3, confidence: 1.0 }
    expect(classifyItem(item)).toBe('confirmed')
  })

  it('synthetic items get confirmed regardless of confidence value', () => {
    // Even if confidence were somehow 0, PREFILL_ + asmId = confirmed
    const item = makeSyntheticItem({ confidence: 0.5 })
    expect(classifyItem(item)).toBe('confirmed')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Synthetic items and memory training
// ═══════════════════════════════════════════════════════════════════════════════

describe('shouldTrainMemory with synthetic items', () => {
  it('returns false for synthetic confirmed items', () => {
    const item = { ...makeSyntheticItem(), reviewStatus: 'confirmed' }
    expect(shouldTrainMemory(item)).toBe(false)
  })

  it('returns false for synthetic auto_high items', () => {
    const item = { ...makeSyntheticItem(), reviewStatus: 'auto_high' }
    expect(shouldTrainMemory(item)).toBe(false)
  })

  it('returns true for real confirmed items', () => {
    const item = { ...makeItem(), reviewStatus: 'confirmed' }
    expect(shouldTrainMemory(item)).toBe(true)
  })

  it('returns true for real auto_high items', () => {
    const item = { ...makeItem(), reviewStatus: 'auto_high' }
    expect(shouldTrainMemory(item)).toBe(true)
  })

  it('returns false for real auto_low items', () => {
    const item = { ...makeItem({ confidence: 0.60 }), reviewStatus: 'auto_low' }
    expect(shouldTrainMemory(item)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Cable summary entry
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildCableSummaryEntry', () => {
  it('returns null when no cable lines in pricing', () => {
    const pricing = makePricingResult()  // no cable lines
    expect(buildCableSummaryEntry(pricing)).toBeNull()
  })

  it('returns cable summary when cable lines present', () => {
    const pricing = makePricingWithCable()
    const entry = buildCableSummaryEntry(pricing)
    expect(entry).not.toBeNull()
    expect(entry.id).toBe('_CABLE_SUMMARY')
    expect(entry.name).toBe('Kábelezés')
    expect(entry.category).toBe('cable')
    expect(entry.isCableSummary).toBe(true)
    expect(entry.qty).toBe(35)  // 20 + 15
    expect(entry.totalMaterials).toBe(5000)  // 3000 + 2000
    expect(entry.wallSplits).toBeNull()
  })

  it('returns null for null/undefined pricing', () => {
    expect(buildCableSummaryEntry(null)).toBeNull()
    expect(buildCableSummaryEntry(undefined)).toBeNull()
  })

  it('returns null when pricing has no lines', () => {
    expect(buildCableSummaryEntry({ lines: [] })).toBeNull()
    expect(buildCableSummaryEntry({})).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. buildAssemblySummary includes cable
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildAssemblySummary', () => {
  const assemblies = [
    { id: 'ASM-001', name: 'Dugalj', category: 'socket', components: [] },
    { id: 'ASM-003', name: 'Lámpa', category: 'light', components: [] },
  ]

  it('produces entries for each takeoff row plus cable', () => {
    const rows = [
      { asmId: 'ASM-001', qty: 4, variantId: null, wallSplits: null },
      { asmId: 'ASM-003', qty: 2, variantId: null, wallSplits: null },
    ]
    const pricing = makePricingWithCable()
    const result = buildAssemblySummary(
      rows, pricing, assemblies, [], [],
      null, 0.10, 8500, 'normal', stubComputePricing,
    )
    // 2 assembly entries + 1 cable entry = 3
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('ASM-001')
    expect(result[1].id).toBe('ASM-003')
    expect(result[2].id).toBe('_CABLE_SUMMARY')
    expect(result[2].isCableSummary).toBe(true)
  })

  it('omits cable entry when pricing has no cable', () => {
    const rows = [{ asmId: 'ASM-001', qty: 4, variantId: null, wallSplits: null }]
    const pricing = makePricingResult()  // no cable
    const result = buildAssemblySummary(
      rows, pricing, assemblies, [], [],
      null, 0.10, 8500, 'normal', stubComputePricing,
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ASM-001')
  })

  it('assembly entries have correct shape', () => {
    const rows = [{ asmId: 'ASM-001', qty: 3, variantId: null, wallSplits: { brick: 2, concrete: 1 } }]
    const pricing = makePricingResult()
    const result = buildAssemblySummary(
      rows, pricing, assemblies, [], [],
      null, 0.10, 8500, 'normal', stubComputePricing,
    )
    const entry = result[0]
    expect(entry.id).toBe('ASM-001')
    expect(entry.name).toBe('Dugalj')
    expect(entry.category).toBe('socket')
    expect(entry.qty).toBe(3)
    expect(entry.wallSplits).toEqual({ brick: 2, concrete: 1 })
    expect(typeof entry.totalPrice).toBe('number')
    expect(typeof entry.totalMaterials).toBe('number')
    expect(typeof entry.totalLabor).toBe('number')
    expect(typeof entry.totalHours).toBe('number')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. normalizeMergeCableEstimate
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeMergeCableEstimate', () => {
  it('returns null for zero or negative cable', () => {
    expect(normalizeMergeCableEstimate(0)).toBeNull()
    expect(normalizeMergeCableEstimate(-5)).toBeNull()
    expect(normalizeMergeCableEstimate(null)).toBeNull()
    expect(normalizeMergeCableEstimate(undefined)).toBeNull()
  })

  it('maps all cable to socket_m when no byType provided (lossy)', () => {
    const result = normalizeMergeCableEstimate(100)
    expect(result.cable_total_m).toBe(100)
    expect(result.cable_by_type.socket_m).toBe(100)
    expect(result.cable_by_type.light_m).toBe(0)
    expect(result.cable_by_type.switch_m).toBe(0)
    expect(result.cable_by_type.other_m).toBe(0)
    expect(result._lossy).toBe(true)
  })

  it('uses real distribution when byType provided', () => {
    const byType = { light_m: 30, socket_m: 50, switch_m: 10, other_m: 10 }
    const result = normalizeMergeCableEstimate(100, byType)
    expect(result.cable_total_m).toBe(100)
    expect(result.cable_by_type.light_m).toBe(30)
    expect(result.cable_by_type.socket_m).toBe(50)
    expect(result.cable_by_type.switch_m).toBe(10)
    expect(result.cable_by_type.other_m).toBe(10)
    expect(result._lossy).toBe(false)
  })

  it('treats socket-only byType as lossy', () => {
    const byType = { socket_m: 100 }
    const result = normalizeMergeCableEstimate(100, byType)
    expect(result._lossy).toBe(true)  // no light/switch/other → lossy
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Quote readiness with synthetic items
// ═══════════════════════════════════════════════════════════════════════════════

describe('quote readiness with synthetic/merge items', () => {
  it('all synthetic confirmed items → ready', () => {
    const items = [
      { ...makeSyntheticItem({ blockName: 'PREFILL_a', asmId: 'ASM-001' }), reviewStatus: 'confirmed' },
      { ...makeSyntheticItem({ blockName: 'PREFILL_b', asmId: 'ASM-003' }), reviewStatus: 'confirmed' },
    ]
    const summary = buildReviewSummary(items)
    const readiness = computeQuoteReadiness(summary, null)
    expect(readiness.status).toBe('ready')
    expect(readiness.reasons).toHaveLength(0)
  })

  it('synthetic without asmId → unresolved → review_required', () => {
    const classified = classifyAllItems([
      makeSyntheticItem({ blockName: 'PREFILL_a', asmId: 'ASM-001' }),
      makeSyntheticItem({ blockName: 'PREFILL_b', asmId: null }),
    ])
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, null)
    expect(readiness.status).toBe('review_required')
    expect(classified[0].reviewStatus).toBe('confirmed')
    expect(classified[1].reviewStatus).toBe('unresolved')
  })

  it('mix of real and synthetic items → coherent readiness', () => {
    const classified = classifyAllItems([
      makeSyntheticItem({ blockName: 'PREFILL_a', asmId: 'ASM-001' }),
      makeItem({ blockName: 'REAL_BLK', asmId: 'ASM-003', confidence: 0.92, matchType: 'rule' }),
    ])
    const summary = buildReviewSummary(classified)
    expect(summary.confirmed).toBe(1)  // synthetic
    expect(summary.autoHigh).toBe(1)   // real 0.92
    expect(summary.unresolved).toBe(0)
    const readiness = computeQuoteReadiness(summary, null)
    expect(readiness.status).toBe('ready')
  })

  it('weak cable with synthetic items → ready_with_warnings', () => {
    const classified = classifyAllItems([
      makeSyntheticItem({ blockName: 'PREFILL_a', asmId: 'ASM-001' }),
    ])
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.50)
    expect(readiness.status).toBe('ready_with_warnings')
    expect(readiness.reasons.some(r => r.includes('Kábelbecslés'))).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Cable consistency across pricing paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('cable consistency', () => {
  it('cable summary totalMaterials matches sum of cable lines', () => {
    const pricing = makePricingWithCable()
    const entry = buildCableSummaryEntry(pricing)
    const cableLines = pricing.lines.filter(l => l.type === 'cable')
    const sumMaterial = cableLines.reduce((s, l) => s + l.materialCost, 0)
    expect(entry.totalMaterials).toBe(Math.round(sumMaterial))
  })

  it('assemblySummary total + cable = pricing.total when markup is zero', () => {
    // With zero markup, assembly per-row totals + cable should reconcile
    const rows = [{ asmId: 'ASM-001', qty: 4, variantId: null, wallSplits: null }]
    const cableLines = [
      { name: 'NYM-J 3×2.5', code: 'MAT-021', qty: 20, unit: 'm', hours: 0, materialCost: 3000, type: 'cable', systemType: 'power' },
    ]
    const pricing = {
      materialCost: 7000,
      laborCost: 2000,
      laborHours: 2,
      total: 9000,
      lines: [
        { name: 'Dugalj', code: 'MAT-001', qty: 4, unit: 'db', hours: 0, materialCost: 4000, type: 'material', systemType: 'power' },
        { name: 'Szerelés', code: 'WI-001', qty: 4, unit: 'db', hours: 2, materialCost: 0, type: 'labor', systemType: 'power' },
        ...cableLines,
      ],
      warnings: [],
    }

    const assemblies = [{ id: 'ASM-001', name: 'Dugalj', category: 'socket', components: [] }]

    // Stub that returns exact per-row costs (no cable)
    const stub = ({ takeoffRows: [r] }) => ({
      materialCost: r.qty * 1000,
      laborCost: r.qty * 500,
      laborHours: r.qty * 0.5,
      total: r.qty * 1500,
      lines: [], warnings: [],
    })

    const summary = buildAssemblySummary(rows, pricing, assemblies, [], [], null, 0, 8500, 'normal', stub)

    // Assembly: 4 * 1500 = 6000, Cable: 3000
    const totalFromSummary = summary.reduce((s, e) => s + (e.totalPrice || 0), 0)
    // This should be assembly cost + cable cost
    expect(totalFromSummary).toBe(6000 + 3000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Smoke scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe('smoke: standard recognized plan (no merge, no synthetic)', () => {
  it('fully recognized items → ready, all trainable', () => {
    const items = [
      makeItem({ blockName: 'A', confidence: 0.95, matchType: 'exact' }),
      makeItem({ blockName: 'B', confidence: 0.88, matchType: 'rule' }),
    ]
    const classified = classifyAllItems(items)
    expect(classified[0].reviewStatus).toBe('confirmed')
    expect(classified[1].reviewStatus).toBe('auto_high')
    expect(shouldTrainMemory(classified[0])).toBe(true)
    expect(shouldTrainMemory(classified[1])).toBe(true)

    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.90)
    expect(readiness.status).toBe('ready')
  })
})

describe('smoke: corrected plan', () => {
  it('user override → confirmed, trainable', () => {
    const item = makeItem({ blockName: 'X', asmId: null, confidence: 0 })
    const overrides = { X: 'ASM-005' }
    const status = classifyItem(item, overrides)
    expect(status).toBe('confirmed')

    const classified = { ...item, reviewStatus: status }
    expect(shouldTrainMemory(classified)).toBe(true)
  })
})

describe('smoke: merge/synthetic plan', () => {
  it('all PREFILL_ items → confirmed, NOT trainable', () => {
    const items = [
      makeSyntheticItem({ blockName: 'PREFILL_socket', asmId: 'ASM-001' }),
      makeSyntheticItem({ blockName: 'PREFILL_light', asmId: 'ASM-003' }),
      makeSyntheticItem({ blockName: 'PREFILL_switch', asmId: 'ASM-002' }),
    ]
    const classified = classifyAllItems(items)
    expect(classified.every(i => i.reviewStatus === 'confirmed')).toBe(true)
    expect(classified.every(i => !shouldTrainMemory(i))).toBe(true)

    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, null)
    expect(readiness.status).toBe('ready')
  })

  it('mix of synthetic + real items, one unresolved → review_required', () => {
    const items = [
      makeSyntheticItem({ blockName: 'PREFILL_socket', asmId: 'ASM-001' }),
      makeItem({ blockName: 'UNKNOWN_BLK', asmId: null, confidence: 0 }),
    ]
    const classified = classifyAllItems(items)
    expect(classified[0].reviewStatus).toBe('confirmed')
    expect(classified[1].reviewStatus).toBe('unresolved')

    const summary = buildReviewSummary(classified)
    expect(summary.unresolved).toBe(1)
    const readiness = computeQuoteReadiness(summary)
    expect(readiness.status).toBe('review_required')
  })
})

describe('smoke: weak cable plan', () => {
  it('all items trusted but cable weak → ready_with_warnings', () => {
    const items = [makeItem({ blockName: 'A', confidence: 0.95, matchType: 'exact' })]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.55)
    expect(readiness.status).toBe('ready_with_warnings')
    expect(readiness.reasons.some(r => r.includes('55%'))).toBe(true)
  })

  it('strong cable → ready', () => {
    const items = [makeItem({ blockName: 'A', confidence: 0.95, matchType: 'exact' })]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.92)
    expect(readiness.status).toBe('ready')
  })
})

describe('smoke: unresolved items still block quote readiness', () => {
  it('unresolved → review_required regardless of cable', () => {
    const items = [
      makeItem({ blockName: 'A', confidence: 0.95, matchType: 'exact' }),
      makeItem({ blockName: 'B', asmId: null, confidence: 0 }),
    ]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    expect(summary.unresolved).toBe(1)
    const readiness = computeQuoteReadiness(summary, 0.99)
    expect(readiness.status).toBe('review_required')
  })

  it('excluded items do not block readiness', () => {
    const items = [
      makeItem({ blockName: 'A', confidence: 0.95, matchType: 'exact' }),
      makeItem({ blockName: 'B', asmId: null, confidence: 0 }),
    ]
    const deleted = new Set(['B'])
    const classified = classifyAllItems(items, {}, deleted)
    const summary = buildReviewSummary(classified)
    expect(summary.unresolved).toBe(0)
    expect(summary.excluded).toBe(1)
    const readiness = computeQuoteReadiness(summary, null)
    expect(readiness.status).toBe('ready')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Backward compatibility — existing classifyItem behavior unchanged
// ═══════════════════════════════════════════════════════════════════════════════

describe('classifyItem backward compat (non-synthetic)', () => {
  it('exact match ≥0.95 → confirmed', () => {
    expect(classifyItem(makeItem({ matchType: 'exact', confidence: 0.96 }))).toBe('confirmed')
  })

  it('rule match 0.85 → auto_high', () => {
    expect(classifyItem(makeItem({ matchType: 'rule', confidence: 0.85 }))).toBe('auto_high')
  })

  it('memory match 0.70 → auto_low', () => {
    expect(classifyItem(makeItem({ matchType: 'memory', confidence: 0.70 }))).toBe('auto_low')
  })

  it('no asmId → unresolved', () => {
    expect(classifyItem(makeItem({ asmId: null }))).toBe('unresolved')
  })

  it('override → confirmed', () => {
    expect(classifyItem(makeItem(), { BLK_TEST: 'ASM-999' })).toBe('confirmed')
  })

  it('override to null → unresolved', () => {
    expect(classifyItem(makeItem(), { BLK_TEST: null })).toBe('unresolved')
  })

  it('deleted → excluded', () => {
    expect(classifyItem(makeItem(), {}, new Set(['BLK_TEST']))).toBe('excluded')
  })
})
