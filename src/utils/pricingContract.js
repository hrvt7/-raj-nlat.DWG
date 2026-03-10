// ─── Pricing Input Contract ────────────────────────────────────────────────────
// Normalizes inputs for computePricing so every call site produces
// a consistent, auditable pricing input. No business logic changes —
// this is a plumbing layer that ensures cable, context, markup, and
// difficultyMode are handled identically everywhere.
//
// Problem solved:
//   W8 — assemblySummary snapshots excluded cable, causing the sum of
//         per-assembly totals to diverge from the quote grand total.
//   MergePlansView tabs mapped all cable into socket_m, losing circuit
//         type distribution.
//
// This module does NOT contain pricing math. It only shapes inputs.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a cable summary entry for assemblySummary so cable cost is
 * traceable in the assembly breakdown (PDF, stored quote).
 *
 * @param {object} pricing — full pricing result from computePricing (with cable)
 * @returns {object|null} — cable summary entry or null if no cable in pricing
 */
export function buildCableSummaryEntry(pricing) {
  if (!pricing || !pricing.lines) return null
  const cableLines = pricing.lines.filter(l => l.type === 'cable')
  if (cableLines.length === 0) return null

  const totalMaterials = cableLines.reduce((s, l) => s + (l.materialCost || 0), 0)
  const totalHours = cableLines.reduce((s, l) => s + (l.hours || 0), 0)
  const totalM = cableLines.reduce((s, l) => s + (l.qty || 0), 0)

  return {
    id: '_CABLE_SUMMARY',
    name: 'Kábelezés',
    category: 'cable',
    qty: Math.round(totalM),
    wallSplits: null,
    totalPrice: Math.round(totalMaterials),   // cable has no markup in per-assembly snap
    totalMaterials: Math.round(totalMaterials),
    totalLabor: 0,                             // cable labor is in the grand total laborHours
    totalHours,
    isCableSummary: true,
  }
}

/**
 * Build a complete assemblySummary that includes cable.
 * This replaces the per-row computePricing loop + separate cable handling
 * with a single coherent output.
 *
 * @param {Array} takeoffRows — merged takeoff rows
 * @param {object} pricing — full pricing result (with cable)
 * @param {Array} assemblies — from loadAssemblies()
 * @param {Array} workItems — from loadWorkItems()
 * @param {Array} materials — from loadMaterials()
 * @param {object|null} context — user context { access, project_type, height }
 * @param {number} markup — fraction
 * @param {number} hourlyRate — Ft/h
 * @param {string} difficultyMode
 * @param {function} computePricingFn — reference to computePricing
 * @returns {Array} — assemblySummary entries including cable
 */
export function buildAssemblySummary(
  takeoffRows, pricing, assemblies, workItems, materials,
  context, markup, hourlyRate, difficultyMode, computePricingFn,
) {
  const entries = takeoffRows.map(row => {
    const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
    const rowP = computePricingFn({
      takeoffRows: [row], assemblies, workItems, materials, context, markup, hourlyRate,
      cableEstimate: null, difficultyMode,
    })
    return {
      id: row.asmId,
      name: asm?.name || row.asmId,
      category: asm?.category || '',
      qty: row.qty,
      wallSplits: row.wallSplits || null,
      totalPrice: Math.round(rowP.total),
      totalMaterials: Math.round(rowP.materialCost),
      totalLabor: Math.round(rowP.laborCost),
      totalHours: rowP.laborHours,
    }
  })

  // Append cable summary so assembly breakdown reconciles with grand total
  const cableEntry = buildCableSummaryEntry(pricing)
  if (cableEntry) entries.push(cableEntry)

  return entries
}

/**
 * Detect whether a recognized item is synthetic (from MergePlansView prefill).
 *
 * @param {object} item — recognized item { blockName, ... }
 * @returns {boolean}
 */
export function isSyntheticItem(item) {
  if (!item || !item.blockName) return false
  return item.blockName.startsWith('PREFILL_')
}

/**
 * Normalize a lossy cable estimate (all-to-socket_m) into a properly
 * documented shape. Used by MergePlansView tabs that only have total cable.
 *
 * @param {number} totalM — total cable meters
 * @param {object|null} byType — { light_m, socket_m, switch_m, other_m } or null
 * @returns {object|null} — normalized cable estimate or null if no cable
 */
export function normalizeMergeCableEstimate(totalM, byType = null) {
  if (!totalM || totalM <= 0) return null
  if (byType && (byType.light_m || byType.switch_m || byType.other_m)) {
    // Real distribution available
    return {
      cable_total_m: totalM,
      cable_by_type: {
        light_m: byType.light_m || 0,
        socket_m: byType.socket_m || 0,
        switch_m: byType.switch_m || 0,
        other_m: byType.other_m || 0,
      },
      _lossy: false,
    }
  }
  // Lossy fallback: all cable mapped to socket_m
  return {
    cable_total_m: totalM,
    cable_by_type: { light_m: 0, socket_m: totalM, switch_m: 0, other_m: 0 },
    _lossy: true,
  }
}
