// ─── Full Calc Tests ─────────────────────────────────────────────────────────
// Tests for computeFullCalc and computeUnitCostByAsmByWall extracted from TakeoffWorkspace.

import { describe, it, expect } from 'vitest'
import { computeFullCalc, computeUnitCostByAsmByWall } from '../utils/fullCalc.js'

// Minimal mock pricing result
function makePricing(overrides = {}) {
  return {
    materialCost: 50000,
    laborCost: 30000,
    laborHours: 10,
    total: 80000,
    lines: [
      { systemType: 'erosaram', materialCost: 30000, hours: 6 },
      { systemType: 'gyengaram', materialCost: 20000, hours: 4 },
    ],
    ...overrides,
  }
}

describe('computeFullCalc', () => {
  it('returns null when pricing is null', () => {
    expect(computeFullCalc({
      pricing: null, cableEstimate: null, cablePricePerM: 0,
      markup: 0, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })).toBeNull()
  })

  it('computes cable cost from cablePricePerM', () => {
    const result = computeFullCalc({
      pricing: makePricing(), cableEstimate: { cable_total_m: 100 },
      cablePricePerM: 500, markup: 0, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    expect(result.cableCost).toBe(50000)
    expect(result.cableTotalM).toBe(100)
  })

  it('applies markup correctly', () => {
    const result = computeFullCalc({
      pricing: makePricing({ materialCost: 100000, laborCost: 0 }),
      cableEstimate: null, cablePricePerM: 0,
      markup: 0.20, markupType: 'markup', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    // subtotal = 100000, markup 20% → grandTotal = 120000
    expect(result.grandTotal).toBe(120000)
    expect(result.markupAmount).toBe(20000)
  })

  it('applies margin correctly', () => {
    const result = computeFullCalc({
      pricing: makePricing({ materialCost: 100000, laborCost: 0 }),
      cableEstimate: null, cablePricePerM: 0,
      markup: 0.20, markupType: 'margin', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    // subtotal = 100000, margin 20% → grandTotal = 100000 / (1 - 0.20) = 125000
    expect(result.grandTotal).toBe(125000)
  })

  it('applies VAT to bruttoTotal', () => {
    const result = computeFullCalc({
      pricing: makePricing({ materialCost: 100000, laborCost: 0 }),
      cableEstimate: null, cablePricePerM: 0,
      markup: 0, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    expect(result.bruttoTotal).toBe(127000)
  })

  it('groups lines by systemType', () => {
    const result = computeFullCalc({
      pricing: makePricing(), cableEstimate: null, cablePricePerM: 0,
      markup: 0, markupType: 'markup', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    expect(result.bySystem.erosaram.materialCost).toBe(30000)
    expect(result.bySystem.gyengaram.materialCost).toBe(20000)
  })

  it('handles margin >= 100% gracefully (caps at 10x)', () => {
    const result = computeFullCalc({
      pricing: makePricing({ materialCost: 100000, laborCost: 0 }),
      cableEstimate: null, cablePricePerM: 0,
      markup: 1.0, markupType: 'margin', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    expect(result.grandTotal).toBe(1000000) // 10x cap
  })

  // ── P0 regression: cable pricing dedup ─────────────────────────────────────
  it('cableCost = 0 when pricing.lines has catalog cable items (dedup)', () => {
    const pricingWithCable = makePricing({
      materialCost: 80000,  // includes 30000 from catalog cable
      lines: [
        { systemType: 'lighting', materialCost: 30000, hours: 0, type: 'cable' },
        { systemType: 'erosaram', materialCost: 50000, hours: 6, type: 'material' },
      ],
    })
    const result = computeFullCalc({
      pricing: pricingWithCable, cableEstimate: { cable_total_m: 100 },
      cablePricePerM: 800, markup: 0, markupType: 'markup', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    // Catalog cable already in materialCost — pricePerM must NOT add on top
    expect(result.cableCost).toBe(0)
    expect(result.subtotal).toBe(80000 + 30000) // materialCost + laborCost from makePricing
  })

  it('cableCost uses pricePerM fallback when no catalog cable lines', () => {
    const pricingNoCable = makePricing({
      materialCost: 50000,
      lines: [
        { systemType: 'erosaram', materialCost: 50000, hours: 6, type: 'material' },
      ],
    })
    const result = computeFullCalc({
      pricing: pricingNoCable, cableEstimate: { cable_total_m: 100 },
      cablePricePerM: 800, markup: 0, markupType: 'markup', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    // No catalog cable → pricePerM fallback applies
    expect(result.cableCost).toBe(80000) // 100m × 800
    expect(result.subtotal).toBe(50000 + 30000 + 80000)
  })

  it('cableCost uses pricePerM when cable lines have zero materialCost', () => {
    const pricingZeroCable = makePricing({
      lines: [
        { systemType: 'lighting', materialCost: 0, hours: 0, type: 'cable' },
      ],
    })
    const result = computeFullCalc({
      pricing: pricingZeroCable, cableEstimate: { cable_total_m: 50 },
      cablePricePerM: 600, markup: 0, markupType: 'markup', vatPercent: 0,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    // Cable line exists but materialCost=0 (catalog material not found) → fallback
    expect(result.cableCost).toBe(30000) // 50m × 600
  })
})

describe('computeUnitCostByAsmByWall', () => {
  it('returns empty object for empty takeoffRows', () => {
    const result = computeUnitCostByAsmByWall({
      takeoffRows: [], assemblies: [], workItems: [],
      materials: [], context: {}, markup: 0, hourlyRate: 5000,
      difficultyMode: 'normal',
    })
    expect(result).toEqual({})
  })
})
