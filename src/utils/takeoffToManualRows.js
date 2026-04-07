/**
 * takeoffToManualRows — Convert takeoff rows to manual pricing row seeds.
 *
 * Maps assembly-based takeoff rows into the manual pricing row format.
 * Each takeoff row (keyed by asmId) becomes one manual row seed with:
 *   - name: resolved from assemblies catalog
 *   - qty: from takeoff
 *   - unitPrice/laborHours: 0 (user fills in QuoteView editor)
 *   - type: 'material' (V1 default — user can change in editor)
 *   - origin: 'takeoff_manual_priced'
 *   - sourceRefId: original asmId for traceability
 *
 * V1 type strategy: all seeds default to 'material'. Rationale:
 *   - takeoffRows operate at assembly level, not material/labor split
 *   - user adjusts type freely in QuoteView manual editor
 *   - deterministic, transparent, no hidden math errors
 */

import { createManualRow } from './manualPricingRow.js'

/**
 * Look up assembly name from catalog by ID.
 * @param {string} asmId
 * @param {Array} assemblies — assembly catalog
 * @returns {string} — human-readable name or fallback
 */
function resolveAssemblyName(asmId, assemblies) {
  if (!asmId) return 'Ismeretlen tétel'
  const asm = (assemblies || []).find(a => a.id === asmId)
  return asm?.name || asm?.label || asmId
}

/**
 * Convert takeoff rows into manual pricing row seeds.
 *
 * @param {Array<{asmId: string, qty: number, variantId?: string, wallSplits?: object}>} takeoffRows
 * @param {Array} assemblies — assembly catalog for name resolution
 * @param {object} [planMeta] — optional plan metadata for source traceability
 * @param {string} [planMeta.systemType]
 * @param {string} [planMeta.floor]
 * @param {string} [planMeta.floorLabel]
 * @returns {Array<ManualPricingRow>} — seeded manual rows ready for quote creation
 */
export function takeoffToManualRows(takeoffRows, assemblies, planMeta) {
  if (!takeoffRows || !takeoffRows.length) return []

  const sysType = planMeta?.systemType || 'general'
  const floor = planMeta?.floor || null
  const floorLabel = planMeta?.floorLabel || null

  return takeoffRows.map(row => {
    const name = resolveAssemblyName(row.asmId, assemblies)
    const qty = row.wallSplits
      ? Object.values(row.wallSplits).reduce((s, n) => s + n, 0)
      : (row.qty || 0)

    return createManualRow({
      origin:                 'takeoff_manual_priced',
      type:                   'material',           // V1 default — user adjusts in editor
      name,
      qty,
      unit:                   'db',
      unitPrice:              0,                     // User fills in QuoteView
      laborHours:             0,                     // User fills in QuoteView
      sourceRefId:            row.asmId,
      sourcePlanSystemType:   sysType,
      sourcePlanFloor:        floor,
      sourcePlanFloorLabel:   floorLabel,
    })
  })
}
