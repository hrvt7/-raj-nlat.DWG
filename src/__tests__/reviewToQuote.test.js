// ─── Review-to-Quote Hardening Tests ────────────────────────────────────────
// Tests for:
//   - Review state classification
//   - Review summary building
//   - Quote readiness logic
//   - Memory training gate
//   - Smoke scenarios (fully recognized, corrected, unresolved, weak cable)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  classifyItem,
  classifyAllItems,
  buildReviewSummary,
  computeQuoteReadiness,
  shouldTrainMemory,
  getEffectiveAsmId,
  CONFIDENCE_HIGH,
  CONFIDENCE_CONFIRMED,
  CABLE_CONFIDENCE_STRONG,
  REVIEW_STATUSES,
  READINESS_LABELS,
  STATUS_LABELS,
} from '../utils/reviewState.js'

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    blockName: 'TEST_BLOCK',
    asmId: 'ASM-001',
    confidence: 0.85,
    matchType: 'partial',
    qty: 5,
    ...overrides,
  }
}

// ─── classifyItem ────────────────────────────────────────────────────────────

describe('classifyItem', () => {
  it('returns "excluded" for deleted items', () => {
    const item = makeItem()
    const deleted = new Set(['TEST_BLOCK'])
    expect(classifyItem(item, {}, deleted)).toBe('excluded')
  })

  it('returns "excluded" for deleted items (array form)', () => {
    const item = makeItem()
    expect(classifyItem(item, {}, ['TEST_BLOCK'])).toBe('excluded')
  })

  it('returns "confirmed" when user override exists', () => {
    const item = makeItem({ confidence: 0.40 })
    expect(classifyItem(item, { TEST_BLOCK: 'ASM-002' })).toBe('confirmed')
  })

  it('returns "unresolved" when user overrides to null', () => {
    const item = makeItem({ asmId: 'ASM-001', confidence: 1.0 })
    expect(classifyItem(item, { TEST_BLOCK: null })).toBe('unresolved')
  })

  it('returns "unresolved" when no asmId', () => {
    const item = makeItem({ asmId: null, confidence: 0, matchType: 'unknown' })
    expect(classifyItem(item)).toBe('unresolved')
  })

  it('returns "confirmed" for exact match with high confidence', () => {
    const item = makeItem({ confidence: 1.0, matchType: 'exact' })
    expect(classifyItem(item)).toBe('confirmed')
  })

  it('returns "confirmed" for exact match at threshold', () => {
    const item = makeItem({ confidence: CONFIDENCE_CONFIRMED, matchType: 'exact' })
    expect(classifyItem(item)).toBe('confirmed')
  })

  it('returns "auto_high" for exact match below confirmed threshold', () => {
    const item = makeItem({ confidence: 0.90, matchType: 'exact' })
    expect(classifyItem(item)).toBe('auto_high')
  })

  it('returns "auto_high" for partial match >= 0.80', () => {
    const item = makeItem({ confidence: 0.85, matchType: 'partial' })
    expect(classifyItem(item)).toBe('auto_high')
  })

  it('returns "auto_high" at exactly 0.80 threshold', () => {
    const item = makeItem({ confidence: CONFIDENCE_HIGH, matchType: 'partial' })
    expect(classifyItem(item)).toBe('auto_high')
  })

  it('returns "auto_low" for partial match below 0.80', () => {
    const item = makeItem({ confidence: 0.62, matchType: 'partial' })
    expect(classifyItem(item)).toBe('auto_low')
  })

  it('returns "auto_high" for memory match with high confidence', () => {
    const item = makeItem({ confidence: 0.85, matchType: 'memory' })
    expect(classifyItem(item)).toBe('auto_high')
  })

  it('returns "auto_low" for memory match with low confidence', () => {
    const item = makeItem({ confidence: 0.70, matchType: 'memory' })
    expect(classifyItem(item)).toBe('auto_low')
  })

  it('returns "unresolved" for null/undefined item', () => {
    expect(classifyItem(null)).toBe('unresolved')
    expect(classifyItem(undefined)).toBe('unresolved')
  })

  it('returns "unresolved" for item without blockName', () => {
    expect(classifyItem({ asmId: 'ASM-001', confidence: 1.0 })).toBe('unresolved')
  })

  it('deleted takes priority over override', () => {
    const item = makeItem()
    const deleted = new Set(['TEST_BLOCK'])
    expect(classifyItem(item, { TEST_BLOCK: 'ASM-002' }, deleted)).toBe('excluded')
  })

  it('override takes priority over confidence', () => {
    const item = makeItem({ confidence: 0.62 })
    expect(classifyItem(item, { TEST_BLOCK: 'ASM-001' })).toBe('confirmed')
  })
})

// ─── classifyAllItems ────────────────────────────────────────────────────────

describe('classifyAllItems', () => {
  it('adds reviewStatus to each item', () => {
    const items = [
      makeItem({ blockName: 'A', confidence: 1.0, matchType: 'exact' }),
      makeItem({ blockName: 'B', confidence: 0.62 }),
      makeItem({ blockName: 'C', asmId: null, confidence: 0 }),
    ]
    const result = classifyAllItems(items)
    expect(result).toHaveLength(3)
    expect(result[0].reviewStatus).toBe('confirmed')
    expect(result[1].reviewStatus).toBe('auto_low')
    expect(result[2].reviewStatus).toBe('unresolved')
  })

  it('handles empty array', () => {
    expect(classifyAllItems([])).toEqual([])
  })

  it('handles null/undefined', () => {
    expect(classifyAllItems(null)).toEqual([])
    expect(classifyAllItems(undefined)).toEqual([])
  })

  it('respects asmOverrides', () => {
    const items = [makeItem({ blockName: 'X', confidence: 0.50 })]
    const result = classifyAllItems(items, { X: 'ASM-003' })
    expect(result[0].reviewStatus).toBe('confirmed')
  })

  it('respects deletedItems', () => {
    const items = [makeItem({ blockName: 'Y' })]
    const result = classifyAllItems(items, {}, new Set(['Y']))
    expect(result[0].reviewStatus).toBe('excluded')
  })
})

// ─── buildReviewSummary ──────────────────────────────────────────────────────

describe('buildReviewSummary', () => {
  it('counts items by review status', () => {
    const items = [
      { ...makeItem({ blockName: 'A', qty: 10 }), reviewStatus: 'confirmed' },
      { ...makeItem({ blockName: 'B', qty: 5 }), reviewStatus: 'auto_high' },
      { ...makeItem({ blockName: 'C', qty: 3 }), reviewStatus: 'auto_low' },
      { ...makeItem({ blockName: 'D', qty: 8 }), reviewStatus: 'unresolved' },
      { ...makeItem({ blockName: 'E', qty: 2 }), reviewStatus: 'excluded' },
    ]
    const summary = buildReviewSummary(items)
    expect(summary.confirmed).toBe(1)
    expect(summary.autoHigh).toBe(1)
    expect(summary.autoLow).toBe(1)
    expect(summary.unresolved).toBe(1)
    expect(summary.excluded).toBe(1)
    expect(summary.total).toBe(5)
    expect(summary.confirmedQty).toBe(10)
    expect(summary.autoHighQty).toBe(5)
    expect(summary.autoLowQty).toBe(3)
    expect(summary.unresolvedQty).toBe(8)
    expect(summary.excludedQty).toBe(2)
    expect(summary.totalQty).toBe(28)
  })

  it('handles empty array', () => {
    const summary = buildReviewSummary([])
    expect(summary.total).toBe(0)
    expect(summary.totalQty).toBe(0)
  })

  it('handles null/undefined', () => {
    expect(buildReviewSummary(null).total).toBe(0)
    expect(buildReviewSummary(undefined).total).toBe(0)
  })

  it('treats unknown reviewStatus as unresolved', () => {
    const items = [{ ...makeItem({ qty: 4 }), reviewStatus: 'bogus_status' }]
    const summary = buildReviewSummary(items)
    expect(summary.unresolved).toBe(1)
    expect(summary.unresolvedQty).toBe(4)
  })

  it('handles items with zero qty', () => {
    const items = [{ ...makeItem({ qty: 0 }), reviewStatus: 'confirmed' }]
    const summary = buildReviewSummary(items)
    expect(summary.confirmed).toBe(1)
    expect(summary.confirmedQty).toBe(0)
  })
})

// ─── computeQuoteReadiness ───────────────────────────────────────────────────

describe('computeQuoteReadiness', () => {
  function makeSummary(overrides = {}) {
    return {
      confirmed: 3, autoHigh: 2, autoLow: 0, unresolved: 0, excluded: 0,
      total: 5, confirmedQty: 15, autoHighQty: 10, autoLowQty: 0,
      unresolvedQty: 0, excludedQty: 0, totalQty: 25,
      ...overrides,
    }
  }

  it('returns "ready" when all items are trusted and cable is strong', () => {
    const result = computeQuoteReadiness(makeSummary(), 0.92)
    expect(result.status).toBe('ready')
    expect(result.reasons).toEqual([])
  })

  it('returns "ready" when no cable estimate', () => {
    const result = computeQuoteReadiness(makeSummary(), null)
    expect(result.status).toBe('ready')
  })

  it('returns "review_required" when unresolved items exist', () => {
    const result = computeQuoteReadiness(makeSummary({ unresolved: 2, unresolvedQty: 6 }), 0.92)
    expect(result.status).toBe('review_required')
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('2')
    expect(result.reasons[0]).toContain('6 db')
  })

  it('returns "review_required" when no active items', () => {
    const result = computeQuoteReadiness(makeSummary({ confirmed: 0, autoHigh: 0, total: 2, excluded: 2 }), null)
    expect(result.status).toBe('review_required')
    expect(result.reasons[0]).toContain('Nincs aktív')
  })

  it('returns "ready_with_warnings" when auto_low items exist', () => {
    const result = computeQuoteReadiness(makeSummary({ autoLow: 1, autoLowQty: 3 }), 0.92)
    expect(result.status).toBe('ready_with_warnings')
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('gyenge')
  })

  it('returns "ready_with_warnings" when cable is weak', () => {
    const result = computeQuoteReadiness(makeSummary(), 0.55)
    expect(result.status).toBe('ready_with_warnings')
    expect(result.reasons).toHaveLength(1)
    expect(result.reasons[0]).toContain('Kábelbecslés')
    expect(result.reasons[0]).toContain('55%')
  })

  it('returns "ready_with_warnings" with multiple warnings', () => {
    const result = computeQuoteReadiness(makeSummary({ autoLow: 2, autoLowQty: 5 }), 0.55)
    expect(result.status).toBe('ready_with_warnings')
    expect(result.reasons).toHaveLength(2)
  })

  it('cable at exactly threshold is "ready"', () => {
    const result = computeQuoteReadiness(makeSummary(), CABLE_CONFIDENCE_STRONG)
    expect(result.status).toBe('ready')
  })

  it('cable just below threshold is "ready_with_warnings"', () => {
    const result = computeQuoteReadiness(makeSummary(), CABLE_CONFIDENCE_STRONG - 0.01)
    expect(result.status).toBe('ready_with_warnings')
  })

  it('unresolved takes priority over auto_low + weak cable', () => {
    const result = computeQuoteReadiness(
      makeSummary({ unresolved: 1, unresolvedQty: 2, autoLow: 3, autoLowQty: 7 }),
      0.40
    )
    expect(result.status).toBe('review_required')
    // Only the unresolved reason (hard blocker) is shown
    expect(result.reasons).toHaveLength(1)
  })

  it('handles null summary', () => {
    const result = computeQuoteReadiness(null, null)
    expect(result.status).toBe('review_required')
  })

  // ── cableReviewed opt ──────────────────────────────────────────────────────
  it('suppresses weak cable warning when cableReviewed is true', () => {
    const result = computeQuoteReadiness(makeSummary(), 0.55, { cableReviewed: true })
    expect(result.status).toBe('ready')
    expect(result.reasons).toEqual([])
  })

  it('does NOT suppress auto_low warnings when cableReviewed is true', () => {
    const result = computeQuoteReadiness(
      makeSummary({ autoLow: 2, autoLowQty: 4 }),
      0.55,
      { cableReviewed: true },
    )
    expect(result.status).toBe('ready_with_warnings')
    expect(result.reasons).toHaveLength(1) // only auto_low, no cable
    expect(result.reasons[0]).toContain('tétel gyenge')
  })

  it('still warns cable when cableReviewed is false', () => {
    const result = computeQuoteReadiness(makeSummary(), 0.55, { cableReviewed: false })
    expect(result.status).toBe('ready_with_warnings')
    expect(result.reasons[0]).toContain('Kábelbecslés')
  })

  it('backward compat: no opts → cable still warns', () => {
    const result = computeQuoteReadiness(makeSummary(), 0.55)
    expect(result.status).toBe('ready_with_warnings')
  })
})

// ─── shouldTrainMemory ───────────────────────────────────────────────────────

describe('shouldTrainMemory', () => {
  it('allows "confirmed" items to train memory', () => {
    expect(shouldTrainMemory({ reviewStatus: 'confirmed' })).toBe(true)
  })

  it('allows "auto_high" items to train memory', () => {
    expect(shouldTrainMemory({ reviewStatus: 'auto_high' })).toBe(true)
  })

  it('blocks "auto_low" items from training memory', () => {
    expect(shouldTrainMemory({ reviewStatus: 'auto_low' })).toBe(false)
  })

  it('blocks "unresolved" items from training memory', () => {
    expect(shouldTrainMemory({ reviewStatus: 'unresolved' })).toBe(false)
  })

  it('blocks "excluded" items from training memory', () => {
    expect(shouldTrainMemory({ reviewStatus: 'excluded' })).toBe(false)
  })

  it('blocks null/undefined items', () => {
    expect(shouldTrainMemory(null)).toBe(false)
    expect(shouldTrainMemory(undefined)).toBe(false)
  })

  it('blocks items without reviewStatus', () => {
    expect(shouldTrainMemory({ blockName: 'X' })).toBe(false)
  })
})

// ─── getEffectiveAsmId ───────────────────────────────────────────────────────

describe('getEffectiveAsmId', () => {
  it('returns override when present', () => {
    const item = makeItem({ blockName: 'A', asmId: 'ASM-001' })
    expect(getEffectiveAsmId(item, { A: 'ASM-002' })).toBe('ASM-002')
  })

  it('returns null when override is null', () => {
    const item = makeItem({ blockName: 'A', asmId: 'ASM-001' })
    expect(getEffectiveAsmId(item, { A: null })).toBe(null)
  })

  it('returns item asmId when no override', () => {
    const item = makeItem({ blockName: 'A', asmId: 'ASM-003' })
    expect(getEffectiveAsmId(item, {})).toBe('ASM-003')
  })

  it('returns null when no asmId and no override', () => {
    const item = makeItem({ blockName: 'A', asmId: null })
    expect(getEffectiveAsmId(item, {})).toBe(null)
  })

  it('handles null item', () => {
    expect(getEffectiveAsmId(null, {})).toBe(null)
  })
})

// ─── Smoke scenarios ─────────────────────────────────────────────────────────

describe('smoke: fully recognized DXF → ready', () => {
  it('all exact matches with strong cable → ready', () => {
    const items = [
      makeItem({ blockName: 'LIGHT_A', confidence: 1.0, matchType: 'exact', qty: 8 }),
      makeItem({ blockName: 'SOCKET_B', confidence: 1.0, matchType: 'exact', qty: 12 }),
      makeItem({ blockName: 'SWITCH_C', confidence: 0.88, matchType: 'partial', qty: 4 }),
    ]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.92)

    expect(classified[0].reviewStatus).toBe('confirmed')
    expect(classified[1].reviewStatus).toBe('confirmed')
    expect(classified[2].reviewStatus).toBe('auto_high')
    expect(summary.unresolved).toBe(0)
    expect(summary.autoLow).toBe(0)
    expect(readiness.status).toBe('ready')
  })
})

describe('smoke: corrected items → ready or ready_with_warnings', () => {
  it('user-overridden low-conf items become confirmed → ready', () => {
    const items = [
      makeItem({ blockName: 'BLOCK_A', confidence: 0.62, qty: 5 }),
      makeItem({ blockName: 'BLOCK_B', confidence: 0.85, qty: 10 }),
    ]
    const overrides = { BLOCK_A: 'ASM-002' }
    const classified = classifyAllItems(items, overrides)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.80)

    expect(classified[0].reviewStatus).toBe('confirmed')
    expect(classified[1].reviewStatus).toBe('auto_high')
    expect(readiness.status).toBe('ready')

    // Both should train memory
    expect(shouldTrainMemory(classified[0])).toBe(true)
    expect(shouldTrainMemory(classified[1])).toBe(true)
  })
})

describe('smoke: unresolved items → review_required', () => {
  it('unknown blocks block quote readiness', () => {
    const items = [
      makeItem({ blockName: 'KNOWN', confidence: 1.0, matchType: 'exact', qty: 10 }),
      makeItem({ blockName: 'UNKNOWN_1', asmId: null, confidence: 0, matchType: 'unknown', qty: 6 }),
      makeItem({ blockName: 'UNKNOWN_2', asmId: null, confidence: 0, matchType: 'unknown', qty: 3 }),
    ]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.92)

    expect(summary.unresolved).toBe(2)
    expect(summary.unresolvedQty).toBe(9)
    expect(readiness.status).toBe('review_required')

    // Unresolved items must NOT train memory
    expect(shouldTrainMemory(classified[1])).toBe(false)
    expect(shouldTrainMemory(classified[2])).toBe(false)
  })

  it('excluding unknown blocks unblocks readiness', () => {
    const items = [
      makeItem({ blockName: 'KNOWN', confidence: 1.0, matchType: 'exact', qty: 10 }),
      makeItem({ blockName: 'UNKNOWN_1', asmId: null, confidence: 0, matchType: 'unknown', qty: 6 }),
    ]
    const deleted = new Set(['UNKNOWN_1'])
    const classified = classifyAllItems(items, {}, deleted)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.92)

    expect(summary.unresolved).toBe(0)
    expect(summary.excluded).toBe(1)
    expect(readiness.status).toBe('ready')
  })
})

describe('smoke: weak cable warning', () => {
  it('device-count cable (0.55) triggers warning', () => {
    const items = [
      makeItem({ blockName: 'LIGHT_A', confidence: 1.0, matchType: 'exact', qty: 10 }),
    ]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.55)

    expect(readiness.status).toBe('ready_with_warnings')
    expect(readiness.reasons.some(r => r.includes('Kábelbecslés'))).toBe(true)
    expect(readiness.reasons.some(r => r.includes('55%'))).toBe(true)
  })

  it('DXF layer cable (0.92) is silent', () => {
    const items = [
      makeItem({ blockName: 'LIGHT_A', confidence: 1.0, matchType: 'exact', qty: 10 }),
    ]
    const classified = classifyAllItems(items)
    const summary = buildReviewSummary(classified)
    const readiness = computeQuoteReadiness(summary, 0.92)

    expect(readiness.status).toBe('ready')
    expect(readiness.reasons).toEqual([])
  })
})

describe('smoke: low-confidence auto_low items do NOT train memory', () => {
  it('0.62 partial match classified as auto_low is blocked from memory', () => {
    const item = makeItem({ confidence: 0.62, matchType: 'partial' })
    const classified = classifyAllItems([item])

    expect(classified[0].reviewStatus).toBe('auto_low')
    expect(shouldTrainMemory(classified[0])).toBe(false)
  })

  it('same item after user override becomes confirmed and trains memory', () => {
    const item = makeItem({ blockName: 'WEAK_BLOCK', confidence: 0.62, matchType: 'partial' })
    const classified = classifyAllItems([item], { WEAK_BLOCK: 'ASM-005' })

    expect(classified[0].reviewStatus).toBe('confirmed')
    expect(shouldTrainMemory(classified[0])).toBe(true)
  })
})

// ─── Constants and labels ────────────────────────────────────────────────────

describe('constants', () => {
  it('CONFIDENCE_HIGH is 0.80', () => {
    expect(CONFIDENCE_HIGH).toBe(0.80)
  })

  it('CONFIDENCE_CONFIRMED is 0.95', () => {
    expect(CONFIDENCE_CONFIRMED).toBe(0.95)
  })

  it('CABLE_CONFIDENCE_STRONG is 0.75', () => {
    expect(CABLE_CONFIDENCE_STRONG).toBe(0.75)
  })

  it('REVIEW_STATUSES has 5 values', () => {
    expect(REVIEW_STATUSES).toHaveLength(5)
    expect(REVIEW_STATUSES).toContain('confirmed')
    expect(REVIEW_STATUSES).toContain('unresolved')
  })

  it('READINESS_LABELS covers all 3 states', () => {
    expect(READINESS_LABELS.ready).toBeTruthy()
    expect(READINESS_LABELS.ready_with_warnings).toBeTruthy()
    expect(READINESS_LABELS.review_required).toBeTruthy()
  })

  it('STATUS_LABELS covers all 5 statuses', () => {
    for (const s of REVIEW_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy()
    }
  })
})

// ─── Pricing path safety ─────────────────────────────────────────────────────

describe('pricing path safety', () => {
  it('unresolved items have no asmId — getEffectiveAsmId returns null', () => {
    const item = makeItem({ blockName: 'UNKNOWN', asmId: null, confidence: 0, matchType: 'unknown' })
    expect(getEffectiveAsmId(item)).toBe(null)
    // This confirms the existing takeoffRows logic (if (!asmId) continue) is safe
  })

  it('auto_low items still have asmId — flow into pricing', () => {
    const item = makeItem({ blockName: 'WEAK', asmId: 'ASM-001', confidence: 0.65 })
    expect(getEffectiveAsmId(item)).toBe('ASM-001')
    // auto_low items DO flow into pricing, but with warnings
  })

  it('excluded items have asmId but should not reach pricing (filtered by deletedItems)', () => {
    const item = makeItem({ blockName: 'DELETED', asmId: 'ASM-001' })
    const classified = classifyAllItems([item], {}, new Set(['DELETED']))
    expect(classified[0].reviewStatus).toBe('excluded')
    // In the workspace, effectiveItems filters out deletedItems before reaching takeoffRows
  })
})
