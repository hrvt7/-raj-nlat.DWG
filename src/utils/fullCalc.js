// ─── Extended pricing calc (markup/margin, cable $/m, VAT, per-assembly breakdown) ─
// Extracted from TakeoffWorkspace.jsx for testability and reuse.

import { computePricing } from './pricing.js'
import { calcProductivityFactor } from '../data/workItemsDb.js'
import { WALL_FACTORS } from '../data/workItemsDb.js'

/**
 * Compute the full pricing calculation from base pricing.
 * Adds markup/margin, cable cost override, VAT, per-system and per-assembly breakdown.
 */
export function computeFullCalc({
  pricing, cableEstimate, cablePricePerM, markup, markupType, vatPercent,
  context, takeoffRows, assemblies, workItems, materials, hourlyRate, difficultyMode,
}) {
  if (!pricing) return null
  const productivityFactor = calcProductivityFactor(context || {})
  const cableTotalM = cableEstimate?.cable_total_m || 0
  // Cable dedup: if pricing already has catalog-based cable line items, don't add pricePerM on top
  const hasCatalogCable = (pricing.lines || []).some(l => l.type === 'cable' && l.materialCost > 0)
  const cableCost = hasCatalogCable ? 0 : cableTotalM * cablePricePerM
  const subtotal = pricing.materialCost + pricing.laborCost + cableCost
  const markupPct = markup * 100
  let grandTotal
  if (markupType === 'margin') {
    const marginRatio = markupPct / 100
    grandTotal = marginRatio >= 1 ? subtotal * 10 : subtotal / (1 - marginRatio)
  } else {
    grandTotal = subtotal * (1 + markupPct / 100)
  }
  if (!Number.isFinite(grandTotal)) grandTotal = subtotal
  const markupAmount = grandTotal - subtotal
  const bruttoTotal = grandTotal * (1 + vatPercent / 100)

  const bySystem = {}
  for (const line of (pricing.lines || [])) {
    const sys = line.systemType || 'general'
    if (!bySystem[sys]) bySystem[sys] = { materialCost: 0, laborHours: 0, lines: [] }
    bySystem[sys].materialCost += line.materialCost || 0
    bySystem[sys].laborHours += line.hours || 0
    bySystem[sys].lines.push(line)
  }

  // Dedup by asmId: last-row-wins semantics preserved
  const lastByAsm = {}
  for (const row of takeoffRows) lastByAsm[row.asmId] = row
  const byAssembly = {}
  for (const [asmId, row] of Object.entries(lastByAsm)) {
    const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
    if (!asm) continue
    const rowP = computePricing({
      takeoffRows: [row], assemblies, workItems, materials, context, markup: 0, hourlyRate,
      cableEstimate: null, difficultyMode,
    })
    byAssembly[asmId] = {
      name: asm.name || asmId,
      category: asm.category || '',
      qty: row.qty,
      materialCost: rowP.materialCost,
      laborCost: rowP.laborCost,
      laborHours: rowP.laborHours,
    }
  }

  return {
    ...pricing,
    cableTotalM, cablePricePerM, cableCost,
    subtotal, markupType, markupPct, markupAmount, grandTotal, bruttoTotal, vatPercent,
    productivityFactor, bySystem, byAssembly,
  }
}

/**
 * Compute unit cost for each assembly × each wall type.
 * Used by TakeoffRow to display per-split pricing.
 */
export function computeUnitCostByAsmByWall({
  takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, difficultyMode,
}) {
  const map = {}
  const lastRowByAsm = {}
  for (const row of takeoffRows) lastRowByAsm[row.asmId] = row
  for (const [asmId, row] of Object.entries(lastRowByAsm)) {
    map[asmId] = {}
    for (const wallKey of Object.keys(WALL_FACTORS)) {
      const single = computePricing({
        takeoffRows: [{ asmId: row.asmId, qty: 1, variantId: row.variantId, wallSplits: null, wallType: wallKey }],
        assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate: null, difficultyMode,
      })
      map[asmId][wallKey] = single.total
    }
  }
  return map
}
