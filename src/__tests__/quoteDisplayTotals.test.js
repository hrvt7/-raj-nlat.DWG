// ─── Quote Display Totals — Rounding Consistency Tests ────────────────────────
// Verifies that per-component gross values (grossMaterials + grossLabor +
// grossMarkup) always sum exactly to displayGross, regardless of input values.
//
// A prior bug computed each component's ÁFA independently via Math.round,
// causing ≤2 Ft drift (Math.round(A×r)+Math.round(B×r) ≠ Math.round((A+B)×r)).
// The fix allocates total ÁFA proportionally with a remainder on the last
// component, guaranteeing the sum invariant.

import { describe, it, expect } from 'vitest'
import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'

// ── Helper: assert the sum invariant ─────────────────────────────────────────
function assertSumInvariant(opts, label) {
  const r = quoteDisplayTotals(opts)
  const componentSum = r.grossMaterials + r.grossLabor + r.grossMarkup
  expect(componentSum, `${label}: component gross sum ≠ displayGross`).toBe(r.displayGross)
  // Also verify: displayGross = displayNet + displayVat
  expect(r.displayGross, `${label}: displayGross ≠ net+vat`).toBe(r.displayNet + r.displayVat)
  return r
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('quoteDisplayTotals per-component rounding consistency', () => {

  // ── Sum invariant: combined mode ────────────────────────────────────────────

  it('component gross sum equals displayGross — basic combined', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 84500, totalMaterials: 127430,
      markupPct: 0.15, vatPct: 27,
    }, 'basic combined')
  })

  it('component gross sum equals displayGross — rounding-trigger values', () => {
    // These values are specifically chosen to cause ≤2 Ft rounding drift
    // under independent per-component Math.round.
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 100001, totalMaterials: 100001,
      markupPct: 0, vatPct: 27,
    }, 'rounding-trigger no markup')
  })

  it('component gross sum equals displayGross — odd VAT %', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 33333, totalMaterials: 66667,
      markupPct: 0.12, vatPct: 19,
    }, 'odd VAT pct')
  })

  it('component gross sum equals displayGross — large values', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 1_500_000, totalMaterials: 3_200_000,
      markupPct: 0.08, vatPct: 27,
    }, 'large values')
  })

  it('component gross sum equals displayGross — zero markup', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 50000, totalMaterials: 75000,
      markupPct: 0, vatPct: 27,
    }, 'zero markup')
  })

  it('component gross sum equals displayGross — zero materials', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 120000, totalMaterials: 0,
      markupPct: 0.20, vatPct: 27,
    }, 'zero materials')
  })

  it('component gross sum equals displayGross — zero labor', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 0, totalMaterials: 250000,
      markupPct: 0.10, vatPct: 27,
    }, 'zero labor')
  })

  it('component gross sum equals displayGross — everything zero', () => {
    assertSumInvariant({
      outputMode: 'combined', totalLabor: 0, totalMaterials: 0,
      markupPct: 0, vatPct: 27,
    }, 'all zero')
  })

  // ── Sum invariant: labor_only mode ──────────────────────────────────────────

  it('component gross sum equals displayGross — labor_only basic', () => {
    const r = assertSumInvariant({
      outputMode: 'labor_only', totalLabor: 120000, totalMaterials: 500000,
      markupPct: 0.15, vatPct: 27,
    }, 'labor_only basic')
    // In labor_only mode, materials must be excluded from display
    expect(r.grossMaterials).toBe(0)
  })

  it('component gross sum equals displayGross — labor_only no markup', () => {
    const r = assertSumInvariant({
      outputMode: 'labor_only', totalLabor: 84500, totalMaterials: 200000,
      markupPct: 0, vatPct: 27,
    }, 'labor_only no markup')
    expect(r.grossMaterials).toBe(0)
    expect(r.grossMarkup).toBe(0)
  })

  // ── Sum invariant: split_material_labor mode ─────────────────────────────

  it('component gross sum equals displayGross — split mode', () => {
    assertSumInvariant({
      outputMode: 'split_material_labor', totalLabor: 100001, totalMaterials: 100001,
      markupPct: 0.10, vatPct: 27,
    }, 'split mode')
  })

  // ── Brute-force sweep (catches any remaining edge cases) ──────────────────

  it('sum invariant holds for 100 quasi-random input combinations', () => {
    const modes = ['combined', 'labor_only', 'split_material_labor']
    // Deterministic pseudo-random (simple LCG)
    let seed = 42
    const rand = (max) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % max }

    for (let i = 0; i < 100; i++) {
      const mode = modes[rand(3)]
      const labor = rand(2_000_000)
      const materials = rand(5_000_000)
      const markupPct = rand(50) / 100
      const vatPct = rand(30) + 5  // 5-34%
      assertSumInvariant({
        outputMode: mode, totalLabor: labor, totalMaterials: materials,
        markupPct, vatPct,
      }, `sweep #${i} mode=${mode} L=${labor} M=${materials} mu=${markupPct} vat=${vatPct}`)
    }
  })

  // ── Specific value checks ────────────────────────────────────────────────

  it('markupAmount reflects outputMode-correct markup base', () => {
    // Combined: markup on full subtotal
    const c = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 100000, totalMaterials: 200000,
      markupPct: 0.10, vatPct: 27,
    })
    expect(c.markupAmount).toBe(Math.round(300000 * 0.10))  // 30000

    // Labor only: markup on labor only
    const lo = quoteDisplayTotals({
      outputMode: 'labor_only', totalLabor: 100000, totalMaterials: 200000,
      markupPct: 0.10, vatPct: 27,
    })
    expect(lo.markupAmount).toBe(Math.round(100000 * 0.10))  // 10000
  })

  it('grossMaterials is 0 in labor_only mode', () => {
    const r = quoteDisplayTotals({
      outputMode: 'labor_only', totalLabor: 100000, totalMaterials: 500000,
      markupPct: 0.15, vatPct: 27,
    })
    expect(r.grossMaterials).toBe(0)
  })

  it('backward compat: displayNet/displayGross/fullNet unchanged', () => {
    // Verify existing return values are not altered by the new fields
    const r = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 84500, totalMaterials: 127430,
      markupPct: 0.15, vatPct: 27,
    })
    // Manual calculation (single-round formula: Math.round(sub × (1 + pct)))
    const labor = 84500
    const materials = 127430
    const sub = materials + labor                             // 211930
    const net = Math.round(sub * (1 + 0.15))                 // 243720 or 243719 depending on float
    const vat = Math.round(net * 27 / 100)
    expect(r.displayNet).toBe(net)
    expect(r.displayVat).toBe(vat)
    expect(r.displayGross).toBe(net + vat)
    expect(r.fullNet).toBe(net)
  })

  // ── P1-2 regression: cable cost must survive QuoteView recalc ──────────────
  it('cableCost included in fullSubtotal and displayNet', () => {
    const withCable = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000,
      cableCost: 30000, markupPct: 0.10, vatPct: 27,
    })
    const withoutCable = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000,
      cableCost: 0, markupPct: 0.10, vatPct: 27,
    })
    // Cable cost should increase displayNet by cable × (1 + markup)
    const expectedDiff = Math.round(30000 * 1.10) // 33000
    expect(withCable.displayNet - withoutCable.displayNet).toBe(expectedDiff)
    // Sum invariant must still hold
    const sum = withCable.grossMaterials + withCable.grossLabor + withCable.grossMarkup
    expect(sum).toBe(withCable.displayGross)
  })

  it('cableCost defaults to 0 — backward compatible', () => {
    const noCable = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000,
      markupPct: 0.10, vatPct: 27,
    })
    const explicitZero = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000,
      cableCost: 0, markupPct: 0.10, vatPct: 27,
    })
    expect(noCable.displayNet).toBe(explicitZero.displayNet)
    expect(noCable.displayGross).toBe(explicitZero.displayGross)
  })

  it('cableCost excluded in labor_only mode', () => {
    const r = quoteDisplayTotals({
      outputMode: 'labor_only', totalLabor: 50000, totalMaterials: 100000,
      cableCost: 30000, markupPct: 0.10, vatPct: 27,
    })
    // labor_only: displayNet = applyMarkup(labor only)
    const expectedNet = Math.round(50000 * 1.10)
    expect(r.displayNet).toBe(expectedNet)
  })
})
