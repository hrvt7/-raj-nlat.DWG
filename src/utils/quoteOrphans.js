/**
 * Quote ↔ Plan orphan detection helpers.
 *
 * Lightweight checks for whether quotes reference deleted plans.
 * Used by:
 *  - PlanCard: warn before deleting a plan that has associated quotes
 *  - Quotes page: badge orphan quotes where source plan no longer exists
 */

import { loadQuotes } from '../data/store.js'
import { loadPlans } from '../data/planStore.js'

/**
 * Count how many quotes reference a given planId (via planId or sourcePlans).
 * @param {string} planId
 * @returns {number}
 */
export function countQuotesForPlan(planId) {
  const quotes = loadQuotes()
  return quotes.filter(q =>
    (q.planId === planId) ||
    (Array.isArray(q.sourcePlans) && q.sourcePlans.includes(planId))
  ).length
}

/**
 * Check if a quote's source plan(s) still exist.
 * @param {Object} quote
 * @returns {'ok'|'orphan'|'partial'|'no-ref'}
 *  - 'ok'       — all referenced plans exist
 *  - 'orphan'   — single planId deleted
 *  - 'partial'  — some sourcePlans deleted (merge quote)
 *  - 'no-ref'   — quote has no plan reference (takeoff-workspace source)
 */
export function checkQuotePlanStatus(quote) {
  const planIds = new Set(loadPlans().map(p => p.id))

  // Single plan reference (plan-takeoff)
  if (quote.planId) {
    return planIds.has(quote.planId) ? 'ok' : 'orphan'
  }

  // Multi-plan reference (merge-panel)
  if (Array.isArray(quote.sourcePlans) && quote.sourcePlans.length > 0) {
    const missing = quote.sourcePlans.filter(pid => !planIds.has(pid))
    if (missing.length === 0) return 'ok'
    if (missing.length === quote.sourcePlans.length) return 'orphan'
    return 'partial'
  }

  // No plan reference (takeoff-workspace, or legacy)
  return 'no-ref'
}
