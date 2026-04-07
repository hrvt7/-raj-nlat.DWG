/**
 * usePricingPipeline — pricing orchestration extracted from TakeoffWorkspace.
 *
 * Pure derived computation chain (no side effects):
 *   takeoffRows → pricing → measurementItems → measurementCostTotal → fullCalc
 *                                                                   → unitCostByAsmByWall
 *
 * All formulas are in utils/pricing.js, utils/fullCalc.js — this hook only
 * orchestrates the useMemo chain and measurement cost integration.
 */
import { useMemo } from 'react'
import { computePricing } from '../utils/pricing.js'
import { computeFullCalc, computeUnitCostByAsmByWall, applyMarkupToSubtotal } from '../utils/fullCalc.js'

/**
 * @param {object} inputs
 * @returns {{ pricing, measurementItems, measurementCostTotal, fullCalc, unitCostByAsmByWall }}
 */
export default function usePricingPipeline({
  takeoffRows, assemblies, workItems, materials, context, markup, markupType,
  hourlyRate, vatPercent, cablePricePerM, cableEstimate, difficultyMode,
  pdfMeasurements, measurementPrices,
  customItemMeta,
}) {
  // ── Step 1: Core pricing from takeoff rows ──
  const pricing = useMemo(() => {
    if (!takeoffRows.length) return null
    return computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode })
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode])

  // ── Step 2: Measurement cost (auto-pricing from assembly + manual fallback) ──
  const measurementItems = useMemo(() => {
    if (!pdfMeasurements.length) return []
    const groups = {}
    for (const seg of pdfMeasurements) {
      const key = seg.category || '_general'
      if (!groups[key]) groups[key] = { key, label: seg.category || 'Általános mérés', totalDist: 0, totalMeters: 0, count: 0 }
      groups[key].totalDist += seg.dist
      groups[key].totalMeters += seg.distMeters || 0
      groups[key].count++
    }
    // Pre-build cable tray assembly index
    const cableTrayAsms = assemblies
      .filter(a => a.category === 'kabeltalca')
      .map(a => {
        const m = a.name?.match(/(\d{2,4})\s*(?:mm|×)/)
        return m ? { asm: a, width: parseInt(m[1], 10) } : null
      })
      .filter(Boolean)

    return Object.values(groups).map(g => {
      let matchedAsm = null
      let autoPrice = 0

      if (g.key.startsWith('ASM-')) {
        matchedAsm = assemblies.find(a => a.id === g.key) || null
      } else if (g.key.startsWith('kt_asm_')) {
        const asmId = g.key.replace('kt_asm_', '')
        matchedAsm = assemblies.find(a => a.id === asmId) || null
      } else if (g.key.startsWith('kt_')) {
        const targetWidth = parseInt(g.key.split('_')[1], 10)
        if (targetWidth) {
          const exact = cableTrayAsms.find(c => c.width === targetWidth && !c.asm.variantOf)
            || cableTrayAsms.find(c => c.width === targetWidth)
          if (exact) matchedAsm = exact.asm
        }
      }

      if (matchedAsm) {
        const asmPricing = computePricing({
          takeoffRows: [{ asmId: matchedAsm.id, qty: 1, variantId: null, wallSplits: null }],
          assemblies, workItems, materials, context, markup: 0, hourlyRate, cableEstimate: null, difficultyMode,
        })
        const asmBaseQty = (matchedAsm.components || []).find(c => c.unit === 'm')?.qty || 10
        autoPrice = asmPricing.total / Math.max(asmBaseQty, 1)
      }
      const effectivePrice = measurementPrices[g.key] !== undefined && measurementPrices[g.key] > 0
        ? measurementPrices[g.key]
        : autoPrice
      return {
        ...g,
        label: matchedAsm ? matchedAsm.name : g.label,
        matchedAsmId: matchedAsm?.id || null,
        autoPrice,
        pricePerUnit: effectivePrice,
        cost: (g.totalMeters || 0) * effectivePrice,
        isAutoPriced: effectivePrice === autoPrice && autoPrice > 0,
      }
    })
  }, [pdfMeasurements, measurementPrices, assemblies, workItems, materials, context, hourlyRate, difficultyMode])

  // ── Step 2.5: Custom item cost total (Egyéni tételek) ──
  const customItemsCost = useMemo(() => {
    if (!customItemMeta || !takeoffRows.length) return 0
    let total = 0
    for (const row of takeoffRows) {
      if (row._sourceType !== 'custom') continue
      const meta = customItemMeta[row._customItemId]
      if (meta?.unitPrice) total += row.qty * meta.unitPrice
    }
    return Math.round(total)
  }, [takeoffRows, customItemMeta])

  // ── Step 3: Measurement cost total ──
  const measurementCostTotal = useMemo(() => {
    return measurementItems.reduce((s, item) => s + item.cost, 0)
  }, [measurementItems])

  // ── Step 4: Full calc (markup/margin, cable $/m, VAT, measurement injection) ──
  const fullCalc = useMemo(() => {
    let base = computeFullCalc({
      pricing, cableEstimate, cablePricePerM, markup, markupType, vatPercent,
      context, takeoffRows, assemblies, workItems, materials, hourlyRate, difficultyMode,
    })
    // Minimal calc when only measurements or custom items exist (no assembly takeoff rows)
    if (!base && (measurementItems.length > 0 || customItemsCost > 0)) {
      const markupPct = markup * 100
      base = {
        materialCost: 0, laborCost: 0, laborHours: 0, lines: [],
        cableTotalM: 0, cablePricePerM: 0, cableCost: 0,
        subtotal: 0, markupType, markupPct, markupAmount: 0,
        grandTotal: 0, bruttoTotal: 0, vatPercent,
        bySystem: {}, byAssembly: {},
      }
    }
    if (!base) return null
    // Add measurement + custom item costs to the total
    const extraCost = measurementCostTotal + customItemsCost
    if (extraCost > 0) {
      base.subtotal += extraCost
      base.measurementCost = measurementCostTotal
      base.customItemsCost = customItemsCost
      base.grandTotal = applyMarkupToSubtotal(base.subtotal, base.markupPct / 100, base.markupType)
      base.markupAmount = base.grandTotal - base.subtotal
      base.bruttoTotal = base.grandTotal * (1 + base.vatPercent / 100)
    } else {
      base.measurementCost = 0
      base.customItemsCost = 0
    }
    base.measurementLines = measurementItems
    return base
  }, [pricing, cableEstimate, cablePricePerM, markup, markupType, vatPercent, context, takeoffRows, assemblies, workItems, materials, hourlyRate, difficultyMode, measurementCostTotal, measurementItems, customItemsCost])

  // ── Step 5: Per-assembly unit cost ──
  const unitCostByAsmByWall = useMemo(() => {
    return computeUnitCostByAsmByWall({
      takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, difficultyMode,
    })
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, difficultyMode])

  return { pricing, measurementItems, measurementCostTotal, fullCalc, unitCostByAsmByWall }
}
