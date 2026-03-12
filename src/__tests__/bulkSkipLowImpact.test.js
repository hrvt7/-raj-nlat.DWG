// ─── Bulk-Skip Low-Impact Unknown Blocks ─────────────────────────────────────
// Tests for the bulk-skip feature that excludes all unknown blocks with qty ≤ 2:
//   1. Bulk-skip removes correct blocks from unresolved (only low-qty)
//   2. High-qty unknowns survive the bulk action
//   3. Review summary and quote readiness update correctly after bulk skip
//   4. Save gating unblocks when all remaining unknowns are resolved
//   5. Existing per-item exclude behavior is preserved
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  classifyItem,
  classifyAllItems,
  buildReviewSummary,
  computeQuoteReadiness,
} from '../utils/reviewState.js'
import { computeWorkflowStatus, getSaveGating } from '../utils/workflowStatus.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const BULK_SKIP_THRESHOLD = 2

function makeItem(blockName, qty, asmId = null, confidence = 0) {
  return {
    blockName, qty, asmId,
    confidence: asmId ? confidence || 0.9 : 0,
    matchType: asmId ? 'partial' : 'unknown',
  }
}

/**
 * Simulate the bulk-skip action: collect block names with qty ≤ threshold,
 * add them all to deletedItems. This mirrors handleBulkSkipLowImpact.
 */
function simulateBulkSkip(unknownItems, threshold, existingDeleted = new Set()) {
  const toSkip = unknownItems.filter(i => i.qty <= threshold).map(i => i.blockName)
  const next = new Set(existingDeleted)
  toSkip.forEach(bn => next.add(bn))
  return next
}

/**
 * Simulate full pipeline: items → classify → summary → readiness → workflow.
 */
function simulatePipeline(items, deletedItems, asmOverrides = {}) {
  const classified = classifyAllItems(items, asmOverrides, deletedItems)
  const summary = buildReviewSummary(classified)
  const readiness = computeQuoteReadiness(summary, null)

  // For workflow, compute effective items (non-deleted) and takeoff row count
  const effective = items.filter(i => !deletedItems.has(i.blockName))
  const unknowns = effective.filter(i => {
    const resolved = asmOverrides[i.blockName] !== undefined ? asmOverrides[i.blockName] : i.asmId
    return !resolved
  })
  const takeoffRows = effective.filter(i => {
    const resolved = asmOverrides[i.blockName] !== undefined ? asmOverrides[i.blockName] : i.asmId
    return !!resolved
  })

  return { classified, summary, readiness, unknowns, takeoffRows, effective }
}

// ── Bulk-skip target identification ─────────────────────────────────────────

describe('Bulk-skip: target identification', () => {
  it('identifies only blocks with qty ≤ threshold as low-impact', () => {
    const unknowns = [
      makeItem('BIG_BLK', 50),
      makeItem('MED_BLK', 10),
      makeItem('TINY_A', 2),
      makeItem('TINY_B', 1),
    ]
    const lowImpact = unknowns.filter(i => i.qty <= BULK_SKIP_THRESHOLD)
    expect(lowImpact.map(i => i.blockName)).toEqual(['TINY_A', 'TINY_B'])
  })

  it('returns empty when no blocks are below threshold', () => {
    const unknowns = [
      makeItem('HIGH_A', 20),
      makeItem('HIGH_B', 5),
    ]
    const lowImpact = unknowns.filter(i => i.qty <= BULK_SKIP_THRESHOLD)
    expect(lowImpact).toEqual([])
  })

  it('includes blocks exactly at threshold (qty = 2)', () => {
    const unknowns = [
      makeItem('EXACT_THRESH', 2),
      makeItem('ABOVE', 3),
    ]
    const lowImpact = unknowns.filter(i => i.qty <= BULK_SKIP_THRESHOLD)
    expect(lowImpact.length).toBe(1)
    expect(lowImpact[0].blockName).toBe('EXACT_THRESH')
  })
})

// ── Bulk-skip: review state after action ────────────────────────────────────

describe('Bulk-skip: review state updates', () => {
  it('bulk-skipped blocks become excluded, not unresolved', () => {
    const items = [
      makeItem('BIG', 50),
      makeItem('TINY_A', 2),
      makeItem('TINY_B', 1),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)

    // TINY_A and TINY_B should be excluded
    expect(classifyItem(items[1], {}, deletedItems)).toBe('excluded')
    expect(classifyItem(items[2], {}, deletedItems)).toBe('excluded')
    // BIG should remain unresolved
    expect(classifyItem(items[0], {}, deletedItems)).toBe('unresolved')
  })

  it('review summary counts excluded items correctly after bulk skip', () => {
    const items = [
      makeItem('BIG', 50),
      makeItem('TINY_A', 2),
      makeItem('TINY_B', 1),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)

    const classified = classifyAllItems(items, {}, deletedItems)
    const summary = buildReviewSummary(classified)

    expect(summary.excluded).toBe(2)
    expect(summary.excludedQty).toBe(3) // 2 + 1
    expect(summary.unresolved).toBe(1)
    expect(summary.unresolvedQty).toBe(50)
  })

  it('bulk skip of all unknowns (when all are low-qty) clears unresolved to 0', () => {
    const items = [
      makeItem('LOW_A', 1),
      makeItem('LOW_B', 2),
      makeItem('LOW_C', 1),
      makeItem('RESOLVED', 30, 'ASM-001', 0.9),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)

    const classified = classifyAllItems(items, {}, deletedItems)
    const summary = buildReviewSummary(classified)

    expect(summary.unresolved).toBe(0)
    expect(summary.excluded).toBe(3)
  })
})

// ── Bulk-skip: save gating ──────────────────────────────────────────────────

describe('Bulk-skip: save gating integration', () => {
  it('save remains gated when high-qty unknowns survive bulk skip', () => {
    const items = [
      makeItem('BIG', 50),
      makeItem('TINY_A', 2),
      makeItem('TINY_B', 1),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)

    const { summary, readiness } = simulatePipeline(items, deletedItems)

    expect(readiness.status).toBe('review_required')
    expect(summary.unresolved).toBe(1) // BIG still unresolved

    const ws = computeWorkflowStatus({
      hasFile: true,
      reviewSummary: summary,
      quoteReadiness: readiness,
      takeoffRowCount: 0,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(true)
  })

  it('save unblocks when bulk-skip removes all unknowns + resolved items exist', () => {
    const items = [
      makeItem('RESOLVED_A', 30, 'ASM-001', 0.9),
      makeItem('RESOLVED_B', 20, 'ASM-002', 0.85),
      makeItem('TINY_X', 1),
      makeItem('TINY_Y', 2),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)

    const { summary, readiness, takeoffRows } = simulatePipeline(items, deletedItems)

    expect(readiness.status).not.toBe('review_required')
    expect(summary.unresolved).toBe(0)
    expect(takeoffRows.length).toBe(2)

    const ws = computeWorkflowStatus({
      hasFile: true,
      reviewSummary: summary,
      quoteReadiness: readiness,
      takeoffRowCount: 2,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(false)
  })

  it('bulk skip + manual assign of remaining high-qty unknowns unblocks save', () => {
    const items = [
      makeItem('BIG', 50),
      makeItem('TINY_A', 2),
      makeItem('TINY_B', 1),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)

    // User then assigns the big one
    const overrides = { BIG: 'ASM-001' }
    const { summary, readiness } = simulatePipeline(items, deletedItems, overrides)

    expect(summary.unresolved).toBe(0)
    expect(summary.confirmed).toBe(1) // BIG assigned
    expect(summary.excluded).toBe(2) // TINY_A, TINY_B
    expect(readiness.status).not.toBe('review_required')

    const ws = computeWorkflowStatus({
      hasFile: true,
      reviewSummary: summary,
      quoteReadiness: readiness,
      takeoffRowCount: 1,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(false)
  })
})

// ── Existing per-item exclude behavior preserved ────────────────────────────

describe('Bulk-skip: per-item exclude still works', () => {
  it('per-item exclude of high-qty block still works after bulk skip', () => {
    const items = [
      makeItem('BIG', 50),
      makeItem('TINY', 1),
    ]
    const unknowns = items.filter(i => !i.asmId)

    // Bulk skip first
    let deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)
    expect(deletedItems.has('TINY')).toBe(true)
    expect(deletedItems.has('BIG')).toBe(false)

    // Then per-item exclude the big one
    deletedItems = new Set(deletedItems)
    deletedItems.add('BIG')

    expect(classifyItem(items[0], {}, deletedItems)).toBe('excluded')
    expect(classifyItem(items[1], {}, deletedItems)).toBe('excluded')
  })

  it('already-excluded items are not double-counted after bulk skip', () => {
    const items = [
      makeItem('TINY_A', 1),
      makeItem('TINY_B', 2),
    ]

    // Per-item exclude TINY_A first
    const preDeleted = new Set(['TINY_A'])
    // Then bulk skip (TINY_B also qualifies)
    const unknowns = items.filter(i => !preDeleted.has(i.blockName) && !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD, preDeleted)

    // Both should be in deleted
    expect(deletedItems.has('TINY_A')).toBe(true)
    expect(deletedItems.has('TINY_B')).toBe(true)

    const classified = classifyAllItems(items, {}, deletedItems)
    const summary = buildReviewSummary(classified)
    expect(summary.excluded).toBe(2)
    expect(summary.unresolved).toBe(0)
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('Bulk-skip: edge cases', () => {
  it('no unknowns → bulk skip is a no-op', () => {
    const items = [
      makeItem('RESOLVED', 30, 'ASM-001', 0.9),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)
    expect(deletedItems.size).toBe(0)
  })

  it('all unknowns above threshold → bulk skip skips nothing', () => {
    const items = [
      makeItem('HIGH_A', 10),
      makeItem('HIGH_B', 5),
      makeItem('HIGH_C', 3),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)
    expect(deletedItems.size).toBe(0)
  })

  it('single low-qty unknown → bulk skip still works (but button hidden in UI when <2)', () => {
    const items = [
      makeItem('SOLO', 1),
    ]
    const unknowns = items.filter(i => !i.asmId)
    const deletedItems = simulateBulkSkip(unknowns, BULK_SKIP_THRESHOLD)
    expect(deletedItems.has('SOLO')).toBe(true)
  })
})
