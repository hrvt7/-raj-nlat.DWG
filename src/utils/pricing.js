// ─── Shared Pricing Engine ────────────────────────────────────────────────────
// Used by TakeoffWorkspace (single-plan) and MergePlansView (multi-plan DXF/PDF)
// so both views always produce identical numbers.

import { calcProductivityFactor, WALL_FACTORS } from '../data/workItemsDb.js'

/**
 * computePricing — core pricing calculation.
 *
 * @param {object} params
 * @param {Array<{asmId, qty, variantId, wallSplits, wallType}>} params.takeoffRows
 * @param {Array}        params.assemblies      - from loadAssemblies()
 * @param {Array}        params.workItems       - from loadWorkItems()
 * @param {Array}        params.materials       - from loadMaterials()
 * @param {object|null}  params.context         - { access, project_type, height } or null → multiplier 1
 * @param {number}       params.markup          - fraction e.g. 0.15 for 15%
 * @param {number}       params.hourlyRate      - Ft/h
 * @param {object|null}  params.cableEstimate   - cable estimate object or null
 * @param {string}       params.difficultyMode  - 'normal' | 'difficult' | 'very_difficult'
 * @returns {{ materialCost, laborCost, laborHours, subtotal, markup, total, lines }}
 */
export function computePricing({
  takeoffRows,
  assemblies,
  workItems,
  materials,
  context,
  markup,
  hourlyRate,
  cableEstimate,
  difficultyMode,
}) {
  const ctxMultiplier = calcProductivityFactor(context)   // null → returns 1.0
  const mode = difficultyMode || 'normal'

  let materialCost = 0
  let laborHours = 0
  const lines = []

  for (const row of takeoffRows) {
    const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
    if (!asm) continue

    // Build per-wall-type splits: [[wallKey, qty], ...]
    const splits = row.wallSplits
      ? Object.entries(row.wallSplits).filter(([, n]) => n > 0)
      : [[row.wallType || 'brick', row.qty]]

    for (const [wallKey, splitQty] of splits) {
      if (splitQty <= 0) continue
      const wallFactor = WALL_FACTORS[wallKey] ?? 1.0

      for (const comp of (asm.components || [])) {
        const compQty = comp.qty * splitQty
        if (comp.itemType === 'workitem') {
          const wi = workItems.find(w => w.code === comp.itemCode)
                  || workItems.find(w => w.name === comp.name)
          const baseNorm = wi
            ? (mode === 'very_difficult' ? wi.p90
              : mode === 'difficult'      ? (wi.p50 + wi.p90) / 2
              : wi.p50)
            : 0
          const normMin = baseNorm * ctxMultiplier * wallFactor
          const hours = (normMin * compQty) / 60
          laborHours += hours
          lines.push({ name: comp.name, qty: compQty, unit: comp.unit, hours, materialCost: 0, type: 'labor' })
        } else {
          const mat = materials.find(m => m.code === comp.itemCode)
                   || materials.find(m => m.name === comp.name)
          const unitPrice = mat ? mat.price * (1 - (mat.discount || 0) / 100) : 0
          const cost = unitPrice * compQty
          materialCost += cost
          lines.push({ name: comp.name, qty: compQty, unit: comp.unit, hours: 0, materialCost: cost, type: 'material' })
        }
      }
    }
  }

  // Cable estimate integration
  if (cableEstimate && cableEstimate.cable_total_m > 0) {
    const cableTypes = cableEstimate.cable_by_type || {}
    const cableData = [
      { code: 'MAT-020', fallback: 'NYM-J 3×1.5', m: cableTypes.light_m  || 0 },
      { code: 'MAT-021', fallback: 'NYM-J 3×2.5', m: cableTypes.socket_m || 0 },
      { code: 'MAT-021', fallback: 'NYM-J 3×2.5', m: cableTypes.switch_m || 0 },
      { code: 'MAT-022', fallback: 'NYM-J 5×2.5', m: cableTypes.other_m  || 0 },
    ]
    for (const c of cableData) {
      if (c.m <= 0) continue
      const mat = materials.find(m => m.code === c.code)
               || materials.find(m => m.name?.includes(c.fallback))
      const unitPrice = mat ? mat.price * (1 - (mat.discount || 0) / 100) : 0
      const cost = unitPrice * c.m
      materialCost += cost
      lines.push({ name: c.fallback, qty: Math.round(c.m), unit: 'm', hours: 0, materialCost: cost, type: 'cable' })
    }
    const cableNormMin = 3  // min/m average
    const cableHours = (cableEstimate.cable_total_m * cableNormMin * ctxMultiplier) / 60
    laborHours += cableHours
  }

  const laborCost = laborHours * hourlyRate
  const subtotal = materialCost + laborCost
  const markupAmount = subtotal * (markup || 0)
  const total = subtotal + markupAmount

  return { materialCost, laborCost, laborHours, subtotal, markup: markupAmount, total, lines }
}
