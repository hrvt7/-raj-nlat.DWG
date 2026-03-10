// ─── Review State Model — Review-to-Quote Hardening ──────────────────────────
// Pure functions for classifying recognition items, computing quote readiness,
// and gating memory training. No side effects, no UI, no storage.
//
// Review statuses:
//   'confirmed'    — user explicitly overrode assembly or exact match (≥0.95)
//   'auto_high'    — auto-recognized with high confidence (≥0.80)
//   'auto_low'     — auto-recognized with low confidence (<0.80), has asmId
//   'unresolved'   — no asmId, unknown block
//   'excluded'     — user explicitly deleted/ignored
//
// Quote readiness:
//   'ready'                — all items confirmed/auto_high, cable strong
//   'ready_with_warnings'  — no unresolved, but auto_low items or weak cable
//   'review_required'      — unresolved items still exist
// ─────────────────────────────────────────────────────────────────────────────

/** Confidence threshold: above this, auto-recognition is trusted */
export const CONFIDENCE_HIGH = 0.80

/** Confidence threshold: above this, exact match = confirmed */
export const CONFIDENCE_CONFIRMED = 0.95

/** Cable confidence threshold: below this, cable is "weak" */
export const CABLE_CONFIDENCE_STRONG = 0.75

/**
 * Valid review statuses.
 * @type {readonly ['confirmed','auto_high','auto_low','unresolved','excluded']}
 */
export const REVIEW_STATUSES = Object.freeze([
  'confirmed', 'auto_high', 'auto_low', 'unresolved', 'excluded',
])

/**
 * Classify a single recognized item into a review status.
 *
 * @param {object} item — recognized item { blockName, asmId, confidence, matchType, ... }
 * @param {object} [asmOverrides={}] — user assembly overrides { blockName: asmId|null }
 * @param {Set|Array} [deletedItems] — set of deleted block names
 * @returns {string} — one of REVIEW_STATUSES
 */
export function classifyItem(item, asmOverrides = {}, deletedItems = new Set()) {
  if (!item || !item.blockName) return 'unresolved'

  // Deleted by user → excluded
  const deleted = deletedItems instanceof Set ? deletedItems : new Set(deletedItems)
  if (deleted.has(item.blockName)) return 'excluded'

  // User explicitly overrode the assembly → confirmed
  if (asmOverrides[item.blockName] !== undefined) {
    // Override to null means user intentionally unset → unresolved
    if (asmOverrides[item.blockName] === null) return 'unresolved'
    return 'confirmed'
  }

  // No assembly ID → unresolved
  if (!item.asmId) return 'unresolved'

  // Exact match with high confidence → confirmed (auto but trustworthy)
  if (item.matchType === 'exact' && item.confidence >= CONFIDENCE_CONFIRMED) {
    return 'confirmed'
  }

  // High confidence (≥0.80) → auto_high (trusted)
  if (item.confidence >= CONFIDENCE_HIGH) return 'auto_high'

  // Has asmId but low confidence → auto_low (needs review)
  return 'auto_low'
}

/**
 * Classify all recognized items and return enriched items with reviewStatus.
 *
 * @param {Array} items — recognized items array
 * @param {object} [asmOverrides={}]
 * @param {Set|Array} [deletedItems]
 * @returns {Array} — items with added `reviewStatus` field
 */
export function classifyAllItems(items, asmOverrides = {}, deletedItems = new Set()) {
  if (!items || !Array.isArray(items)) return []
  return items.map(item => ({
    ...item,
    reviewStatus: classifyItem(item, asmOverrides, deletedItems),
  }))
}

/**
 * Build a review summary from classified items.
 *
 * @param {Array} classifiedItems — items with reviewStatus field
 * @returns {object} — { confirmed, autoHigh, autoLow, unresolved, excluded, total,
 *                        confirmedQty, autoHighQty, autoLowQty, unresolvedQty, excludedQty, totalQty }
 */
export function buildReviewSummary(classifiedItems) {
  const summary = {
    confirmed: 0, autoHigh: 0, autoLow: 0, unresolved: 0, excluded: 0, total: 0,
    confirmedQty: 0, autoHighQty: 0, autoLowQty: 0, unresolvedQty: 0, excludedQty: 0, totalQty: 0,
  }
  if (!classifiedItems || !Array.isArray(classifiedItems)) return summary

  for (const item of classifiedItems) {
    const qty = item.qty || 0
    summary.total++
    summary.totalQty += qty
    switch (item.reviewStatus) {
      case 'confirmed':
        summary.confirmed++; summary.confirmedQty += qty; break
      case 'auto_high':
        summary.autoHigh++; summary.autoHighQty += qty; break
      case 'auto_low':
        summary.autoLow++; summary.autoLowQty += qty; break
      case 'unresolved':
        summary.unresolved++; summary.unresolvedQty += qty; break
      case 'excluded':
        summary.excluded++; summary.excludedQty += qty; break
      default:
        summary.unresolved++; summary.unresolvedQty += qty; break
    }
  }
  return summary
}

/**
 * Compute quote readiness from review summary and cable confidence.
 *
 * @param {object} summary — from buildReviewSummary
 * @param {number|null} cableConfidence — cable estimate confidence (0–1) or null if no cable
 * @returns {object} — { status, reasons[] }
 *   status: 'ready' | 'ready_with_warnings' | 'review_required'
 *   reasons: human-readable warning strings (Hungarian)
 */
export function computeQuoteReadiness(summary, cableConfidence = null) {
  if (!summary) return { status: 'review_required', reasons: ['Nincs felismerési adat'] }

  const reasons = []

  // Hard blocker: unresolved items
  if (summary.unresolved > 0) {
    reasons.push(`${summary.unresolved} blokk nincs hozzárendelve (${summary.unresolvedQty} db)`)
    return { status: 'review_required', reasons }
  }

  // Active items = total minus excluded
  const activeItems = summary.total - summary.excluded
  if (activeItems === 0) {
    reasons.push('Nincs aktív tétel az árazásban')
    return { status: 'review_required', reasons }
  }

  // Warnings: auto_low items
  if (summary.autoLow > 0) {
    reasons.push(`${summary.autoLow} tétel gyenge felismeréssel (${summary.autoLowQty} db)`)
  }

  // Warnings: weak cable
  if (cableConfidence !== null && cableConfidence < CABLE_CONFIDENCE_STRONG) {
    const pct = Math.round(cableConfidence * 100)
    reasons.push(`Kábelbecslés bizonytalanabb (${pct}%)`)
  }

  if (reasons.length > 0) {
    return { status: 'ready_with_warnings', reasons }
  }

  return { status: 'ready', reasons: [] }
}

/**
 * Determine whether a recognized item should train recognition memory.
 *
 * Only items that the user has reviewed or that were auto-recognized with
 * high confidence should train memory. Low-confidence auto-matches must NOT
 * train memory — they would come back at 0.85 project-memory confidence
 * on the next session, creating a false-trust feedback loop.
 *
 * @param {object} item — recognized item with reviewStatus
 * @returns {boolean}
 */
export function shouldTrainMemory(item) {
  if (!item || !item.reviewStatus) return false
  return item.reviewStatus === 'confirmed' || item.reviewStatus === 'auto_high'
}

/**
 * Get the effective assembly ID for an item, considering overrides.
 *
 * @param {object} item — recognized item { blockName, asmId }
 * @param {object} [asmOverrides={}]
 * @returns {string|null}
 */
export function getEffectiveAsmId(item, asmOverrides = {}) {
  if (!item) return null
  if (asmOverrides[item.blockName] !== undefined) return asmOverrides[item.blockName]
  return item.asmId || null
}

/**
 * Quote readiness status labels in Hungarian.
 */
export const READINESS_LABELS = Object.freeze({
  ready: 'Árajánlat kész',
  ready_with_warnings: 'Árajánlat kész (figyelmeztetéssel)',
  review_required: 'Felülvizsgálat szükséges',
})

/**
 * Review status labels in Hungarian.
 */
export const STATUS_LABELS = Object.freeze({
  confirmed: 'Megerősített',
  auto_high: 'Auto (megbízható)',
  auto_low: 'Auto (gyenge)',
  unresolved: 'Ismeretlen',
  excluded: 'Kizárt',
})
