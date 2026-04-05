/**
 * Financial consistency regression tests.
 *
 * Covers:
 * 1. Assembly summary field name correctness (totalMaterials/totalLabor)
 * 2. VAT nullish-safe fallback (0% is valid, not 27%)
 * 3. quoteDisplayTotals consistency
 */
import { describe, it, expect } from 'vitest'
import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'

describe('VAT nullish-safe fallback', () => {
  const base = { totalLabor: 100000, totalMaterials: 200000, cableCost: 0, markupPct: 0, markupType: 'markup' }

  it('vatPct = 27 → standard Hungarian VAT', () => {
    const r = quoteDisplayTotals({ ...base, vatPct: 27 })
    expect(r.displayVat).toBe(Math.round(300000 * 0.27))
    expect(r.displayGross).toBe(300000 + Math.round(300000 * 0.27))
  })

  it('vatPct = 0 → zero VAT (NOT fallback to 27)', () => {
    const r = quoteDisplayTotals({ ...base, vatPct: 0 })
    expect(r.displayVat).toBe(0)
    expect(r.displayGross).toBe(300000)
  })

  it('vatPct = null → fallback to 27', () => {
    const r = quoteDisplayTotals({ ...base, vatPct: null })
    expect(r.displayVat).toBe(Math.round(300000 * 0.27))
  })

  it('vatPct = undefined → fallback to 27', () => {
    const r = quoteDisplayTotals({ ...base, vatPct: undefined })
    expect(r.displayVat).toBe(Math.round(300000 * 0.27))
  })

  it('vatPct = 5 → 5% VAT', () => {
    const r = quoteDisplayTotals({ ...base, vatPct: 5 })
    expect(r.displayVat).toBe(Math.round(300000 * 0.05))
  })
})

describe('assembly summary field names', () => {
  // Simulates the field resolution logic used by QuoteView and generatePdf
  function resolveAssemblyFields(a) {
    const matCost = Math.round(a.totalMaterials ?? a.materialCost ?? 0)
    const laborCost = Math.round(a.totalLabor ?? a.laborCost ?? (a.totalPrice || 0) - matCost)
    return { matCost, laborCost }
  }

  it('reads totalMaterials and totalLabor from pricingContract format', () => {
    const a = { totalPrice: 50000, totalMaterials: 30000, totalLabor: 20000 }
    const r = resolveAssemblyFields(a)
    expect(r.matCost).toBe(30000)
    expect(r.laborCost).toBe(20000)
  })

  it('falls back to materialCost / laborCost if totalMaterials missing', () => {
    const a = { totalPrice: 50000, materialCost: 30000, laborCost: 20000 }
    const r = resolveAssemblyFields(a)
    expect(r.matCost).toBe(30000)
    expect(r.laborCost).toBe(20000)
  })

  it('derives labor from totalPrice - matCost when both fields missing', () => {
    const a = { totalPrice: 50000 }
    const r = resolveAssemblyFields(a)
    expect(r.matCost).toBe(0)
    expect(r.laborCost).toBe(50000)
  })

  it('split view: materials NOT zero when pricingContract provides totalMaterials', () => {
    // This was the original bug: materialCost was read but totalMaterials was provided
    const assemblySummary = [
      { id: 'ASM-001', name: 'Dugalj dupla', totalPrice: 45000, totalMaterials: 25000, totalLabor: 20000 },
      { id: 'ASM-002', name: 'Kapcsoló', totalPrice: 30000, totalMaterials: 15000, totalLabor: 15000 },
    ]
    for (const a of assemblySummary) {
      const r = resolveAssemblyFields(a)
      expect(r.matCost).toBeGreaterThan(0)
      expect(r.laborCost).toBeGreaterThan(0)
      expect(r.matCost + r.laborCost).toBeLessThanOrEqual(a.totalPrice + 1) // allow 1 Ft rounding
    }
  })
})

describe('quoteDisplayTotals consistency', () => {
  it('headline net = materials + labor + cable + markup', () => {
    const r = quoteDisplayTotals({
      totalLabor: 100000, totalMaterials: 200000, cableCost: 50000,
      markupPct: 0.15, markupType: 'markup', vatPct: 27,
    })
    const expectedNet = Math.round(350000 * 1.15)
    expect(r.displayNet).toBe(expectedNet)
  })

  it('gross = net + VAT', () => {
    const r = quoteDisplayTotals({
      totalLabor: 100000, totalMaterials: 200000, cableCost: 0,
      markupPct: 0, markupType: 'markup', vatPct: 27,
    })
    expect(r.displayGross).toBe(r.displayNet + r.displayVat)
  })

  it('labor_only mode: net = markup(labor only)', () => {
    const r = quoteDisplayTotals({
      outputMode: 'labor_only',
      totalLabor: 100000, totalMaterials: 200000, cableCost: 50000,
      markupPct: 0.10, markupType: 'markup', vatPct: 27,
    })
    const expectedNet = Math.round(100000 * 1.10)
    expect(r.displayNet).toBe(expectedNet)
  })
})
