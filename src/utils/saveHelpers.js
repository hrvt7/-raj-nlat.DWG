/**
 * saveHelpers — Pure helper functions extracted from TakeoffWorkspace handleSave.
 *
 * These two functions were duplicated in the per-plan save and full-quote save
 * branches. Extracting them eliminates the duplication without changing any
 * behavior, shape, or gate logic.
 */

import { shouldTrainMemory, getEffectiveAsmId } from './reviewState.js'
import { recordConfirmation } from '../data/recognitionMemory.js'

// ─── 1. buildSnapshotItems ────────────────────────────────────────────────────
/**
 * Build the snapshot items array from pricing lines + measurement items.
 * Used by both per-plan save and full-quote save paths.
 *
 * @param {Array} pricingLines  — pricing.lines (or [])
 * @param {Array} measurementItems — measurement-derived items from the workspace
 * @param {string} planSysType — resolved plan system type ('general' fallback)
 * @param {string|null} planFloor — plan floor identifier
 * @param {string|null} planFloorLabel — plan floor display label
 * @returns {Array} items — snapshot items array (exact shape expected by quote/planMeta consumers)
 */
export function buildSnapshotItems(pricingLines, measurementItems, planSysType, planFloor, planFloorLabel) {
  const items = (pricingLines || []).map(line => ({
    name: line.name,
    code: line.code || '',
    qty: line.qty,
    unit: line.unit,
    type: line.type,
    systemType: line.systemType || 'general',
    sourcePlanSystemType: planSysType,
    sourcePlanFloor: planFloor,
    sourcePlanFloorLabel: planFloorLabel,
    unitPrice: line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
    hours: line.hours || 0,
    materialCost: line.materialCost || 0,
  }))

  // Include measurement items (cable trays, manual measurements)
  for (const mi of measurementItems) {
    if (!mi.totalMeters || mi.totalMeters <= 0) continue
    items.push({
      name: mi.label + (mi.isAutoPriced ? '' : ' (kézi ár)'),
      code: mi.matchedAsmId || mi.key,
      qty: Math.round(mi.totalMeters * 10) / 10,
      unit: 'm',
      type: 'material',
      systemType: 'general',
      sourcePlanSystemType: planSysType,
      sourcePlanFloor: planFloor,
      sourcePlanFloorLabel: planFloorLabel,
      unitPrice: mi.pricePerUnit,
      hours: 0,
      materialCost: mi.cost,
      _fromMeasurement: true,
    })
  }

  return items
}

// ─── 1b. buildCustomSnapshotItems ─────────────────────────────────────────────
/**
 * Build snapshot items from custom takeoff rows (Egyéni tételek).
 * Custom items have no assembly BOM — pricing comes from user-entered meta.
 * Output shape matches buildSnapshotItems for QuoteView/PDF compatibility.
 *
 * @param {Array} takeoffRows — all takeoff rows (assembly + custom)
 * @param {Object} customItemMeta — { [customItemId]: { name, unit, unitPrice } }
 * @param {string} planSysType
 * @param {string|null} planFloor
 * @param {string|null} planFloorLabel
 * @returns {Array} items — custom snapshot items in standard shape
 */
export function buildCustomSnapshotItems(takeoffRows, customItemMeta, planSysType, planFloor, planFloorLabel) {
  if (!customItemMeta) return []
  const items = []
  for (const row of takeoffRows) {
    if (row._sourceType !== 'custom') continue
    const meta = customItemMeta[row._customItemId]
    if (!meta?.name) continue // skip unnamed custom items
    const unitPrice = meta.unitPrice || 0
    items.push({
      name: meta.name,
      code: row._customItemId || '',
      qty: row.qty,
      unit: meta.unit || 'db',
      type: 'material', // V1 default — custom items are material-typed
      systemType: 'general',
      sourcePlanSystemType: planSysType || 'general',
      sourcePlanFloor: planFloor || null,
      sourcePlanFloorLabel: planFloorLabel || null,
      unitPrice,
      hours: 0,
      materialCost: Math.round(row.qty * unitPrice),
      _fromCustom: true,
    })
  }
  return items
}

// ─── 2. trainMemoryFromSave ───────────────────────────────────────────────────
/**
 * Train recognition memory from saved items. Only reviewed/trusted items are
 * trained — low-confidence auto-matches are excluded to prevent false-trust
 * feedback loop.
 *
 * @param {Array} classifiedItems — items with reviewStatus from classifyAllItems
 * @param {Map|Object} asmOverrides — user assembly overrides
 * @param {string} memProjectId — project ID for memory scoping
 * @param {Map} evidenceMap — block evidence map
 */
export function trainMemoryFromSave(classifiedItems, asmOverrides, memProjectId, evidenceMap) {
  if (!memProjectId) return
  for (const item of classifiedItems) {
    if (item.reviewStatus === 'excluded') continue
    const finalAsmId = getEffectiveAsmId(item, asmOverrides)
    if (finalAsmId && shouldTrainMemory(item)) {
      recordConfirmation(item.blockName, finalAsmId, memProjectId, 'save_plan', evidenceMap?.get(item.blockName))
    }
  }
}
