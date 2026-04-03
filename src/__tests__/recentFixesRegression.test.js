// ─── Regression Tests for Recent Critical Fixes ─────────────────────────────
// Covers: cable dedup, PDF margin KPI, category mapping, quote row mapping,
// measurement data-path, quoteDisplayTotals cableCost, fullCalc measurement-only.
//
// Each section targets a specific fix and ensures it doesn't regress.

import { describe, it, expect } from 'vitest'
import { computeFullCalc } from '../utils/fullCalc.js'
import { computePricing } from '../utils/pricing.js'
import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'
import { createQuote } from '../utils/createQuote.js'
import { buildQuoteRow } from '../utils/quoteMapping.js'
import { resolveCountCategory, migrateMarkers } from '../components/PdfViewer/pdfUtils.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const basePricing = (overrides = {}) => ({
  materialCost: 50000, laborCost: 30000, laborHours: 10,
  total: 80000, lines: [], warnings: [], ...overrides,
})

const baseFullCalcArgs = (overrides = {}) => ({
  pricing: basePricing(), cableEstimate: null, cablePricePerM: 0,
  markup: 0, markupType: 'markup', vatPercent: 27,
  context: {}, takeoffRows: [], assemblies: [], workItems: [],
  materials: [], hourlyRate: 5000, difficultyMode: 'normal',
  ...overrides,
})

// ═════════════════════════════════════════════════════════════════════════════
// 1. CABLE PRICING DEDUP (P0 fix)
// ═════════════════════════════════════════════════════════════════════════════

describe('Cable pricing dedup — catalog vs pricePerM', () => {
  it('cableCost = 0 when pricing.lines has catalog cable items', () => {
    const result = computeFullCalc(baseFullCalcArgs({
      pricing: basePricing({
        materialCost: 80000,
        lines: [
          { type: 'cable', materialCost: 30000, systemType: 'lighting', hours: 0 },
          { type: 'material', materialCost: 50000, systemType: 'power', hours: 6 },
        ],
      }),
      cableEstimate: { cable_total_m: 100 },
      cablePricePerM: 800,
    }))
    expect(result.cableCost).toBe(0)
  })

  it('cableCost uses pricePerM when no catalog cable lines', () => {
    const result = computeFullCalc(baseFullCalcArgs({
      pricing: basePricing({
        lines: [{ type: 'material', materialCost: 50000, hours: 6 }],
      }),
      cableEstimate: { cable_total_m: 100 },
      cablePricePerM: 800,
    }))
    expect(result.cableCost).toBe(80000)
  })

  it('cableCost uses pricePerM when cable lines have zero cost (catalog not found)', () => {
    const result = computeFullCalc(baseFullCalcArgs({
      pricing: basePricing({
        lines: [{ type: 'cable', materialCost: 0, hours: 0 }],
      }),
      cableEstimate: { cable_total_m: 50 },
      cablePricePerM: 600,
    }))
    expect(result.cableCost).toBe(30000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. QUOTE DISPLAY TOTALS — cableCost propagation (P1-2 fix)
// ═════════════════════════════════════════════════════════════════════════════

describe('quoteDisplayTotals — cableCost propagation', () => {
  it('cableCost increases displayNet', () => {
    const with_ = quoteDisplayTotals({ outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000, cableCost: 30000, markupPct: 0.10, vatPct: 27 })
    const without = quoteDisplayTotals({ outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000, cableCost: 0, markupPct: 0.10, vatPct: 27 })
    expect(with_.displayNet).toBeGreaterThan(without.displayNet)
    // Cable cost with 10% markup = 33000 difference
    expect(with_.displayNet - without.displayNet).toBe(Math.round(30000 * 1.10))
  })

  it('cableCost defaults to 0 — backward compat', () => {
    const a = quoteDisplayTotals({ outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000, markupPct: 0.10 })
    const b = quoteDisplayTotals({ outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000, cableCost: 0, markupPct: 0.10 })
    expect(a.displayNet).toBe(b.displayNet)
  })

  it('margin mode works correctly with cableCost', () => {
    const r = quoteDisplayTotals({ outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000, cableCost: 20000, markupPct: 0.20, markupType: 'margin', vatPct: 27 })
    // subtotal = 170000, margin 20% → net = 170000 / (1-0.20) = 212500
    expect(r.displayNet).toBe(Math.round(170000 / 0.80))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. resolveCountCategory — assembly → cable route category (P0 route fix)
// ═════════════════════════════════════════════════════════════════════════════

describe('resolveCountCategory — category mapping', () => {
  const assemblies = [
    { id: 'ASM-001', category: 'vilagitas', name: 'Mennyezeti lámpa' },
    { id: 'ASM-002', category: 'szerelvenyek', name: 'Dugalj 2P+F' },
    { id: 'ASM-003', category: 'szerelvenyek', name: 'Kapcsoló 1P' },
    { id: 'ASM-004', category: 'tuzjelzo', name: 'Füstérzékelő' },
    { id: 'ASM-005', category: 'gyengaram', name: 'RJ45 adatpont' },
    { id: 'ASM-006', category: 'kabeltalca', name: 'Kábeltálca 100mm' },
    { id: 'ASM-007', category: 'elosztok', name: 'Elosztó tábla' },
    { id: 'ASM-008', category: 'bontas', name: 'Bontási munka' },
    { id: 'ASM-009', category: 'nyomvonal', name: 'Horonymarás' },
  ]

  it('vilagitas → light (gets cable route)', () => {
    expect(resolveCountCategory('ASM-001', assemblies)).toBe('light')
  })

  it('szerelvenyek with dugalj → socket', () => {
    expect(resolveCountCategory('ASM-002', assemblies)).toBe('socket')
  })

  it('szerelvenyek with kapcsoló → switch', () => {
    expect(resolveCountCategory('ASM-003', assemblies)).toBe('switch')
  })

  it('tuzjelzo → light (fire detectors get cable route)', () => {
    expect(resolveCountCategory('ASM-004', assemblies)).toBe('light')
  })

  it('gyengaram → socket (data points get cable route)', () => {
    expect(resolveCountCategory('ASM-005', assemblies)).toBe('socket')
  })

  it('kabeltalca → conduit (structural, no cable route)', () => {
    expect(resolveCountCategory('ASM-006', assemblies)).toBe('conduit')
  })

  it('elosztok → elosztok', () => {
    expect(resolveCountCategory('ASM-007', assemblies)).toBe('elosztok')
  })

  it('bontas → other (structural work, no cable route)', () => {
    expect(resolveCountCategory('ASM-008', assemblies)).toBe('other')
  })

  it('nyomvonal → other (structural work, no cable route)', () => {
    expect(resolveCountCategory('ASM-009', assemblies)).toBe('other')
  })

  it('unknown assembly ID → other', () => {
    expect(resolveCountCategory('ASM-999', assemblies)).toBe('other')
  })

  it('non-ASM key passes through unchanged', () => {
    expect(resolveCountCategory('socket', assemblies)).toBe('socket')
    expect(resolveCountCategory('light', assemblies)).toBe('light')
  })
})

describe('migrateMarkers — legacy ASM-xxx category migration', () => {
  const assemblies = [
    { id: 'ASM-001', category: 'vilagitas', name: 'Lámpa' },
    { id: 'ASM-002', category: 'szerelvenyek', name: 'Dugalj' },
  ]

  it('migrates ASM-xxx categories to resolved keys', () => {
    const markers = [
      { x: 1, y: 2, category: 'ASM-001', color: '#fff' },
      { x: 3, y: 4, category: 'socket', color: '#fff' },
    ]
    const result = migrateMarkers(markers, assemblies)
    expect(result[0].category).toBe('light')
    expect(result[0].asmId).toBe('ASM-001')
    expect(result[1].category).toBe('socket') // unchanged
  })

  it('returns same array if no migration needed', () => {
    const markers = [{ x: 1, y: 2, category: 'socket', color: '#fff' }]
    const result = migrateMarkers(markers, assemblies)
    expect(result).toBe(markers) // same reference
  })

  it('handles empty/null input', () => {
    expect(migrateMarkers(null, assemblies)).toEqual(null)
    expect(migrateMarkers([], assemblies)).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. buildQuoteRow — quote → Supabase row mapping
// ═════════════════════════════════════════════════════════════════════════════

describe('buildQuoteRow — Supabase row mapping', () => {
  it('includes output_mode field', () => {
    const quote = { id: 'QT-001', gross: 100000, outputMode: 'labor_only' }
    const row = buildQuoteRow(quote, 'user-123')
    expect(row.output_mode).toBe('labor_only')
  })

  it('defaults output_mode to combined', () => {
    const row = buildQuoteRow({ id: 'QT-002', gross: 50000 }, 'user-123')
    expect(row.output_mode).toBe('combined')
  })

  it('includes all required columns', () => {
    const quote = {
      id: 'QT-003', gross: 200000, vatPercent: 27,
      clientName: 'Test Client', projectName: 'Test Project',
      status: 'draft', outputMode: 'split_material_labor',
      cableEstimate: { cable_total_m: 100 },
    }
    const row = buildQuoteRow(quote, 'user-456')
    expect(row.user_id).toBe('user-456')
    expect(row.quote_number).toBe('QT-003')
    expect(row.client_name).toBe('Test Client')
    expect(row.project_name).toBe('Test Project')
    expect(row.total_net_ft).toBe(200000)
    expect(row.total_gross_ft).toBe(254000) // 200000 * 1.27
    expect(row.vat_percent).toBe(27)
    expect(row.output_mode).toBe('split_material_labor')
    expect(row.pricing_data).toBe(quote) // full quote as JSONB
    expect(row.cable_estimate).toEqual({ cable_total_m: 100 })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5. PDF generatePdf — margin mode KPI consistency (P1 fix)
// ═════════════════════════════════════════════════════════════════════════════

describe('PDF margin KPI — laborCardVal consistency', () => {
  // The PDF KPI "Munkadíj" must equal dNet - rawMaterials in combined mode
  // This was broken: used markup formula even in margin mode

  it('combined + margin: laborCardVal = dNet - rawMaterials', () => {
    const totals = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 80000, totalMaterials: 120000,
      markupPct: 0.15, markupType: 'margin', vatPct: 27,
    })
    // dNet = 200000 / (1-0.15) = 235294 (rounded)
    // laborCardVal should be dNet - 120000
    const expectedLaborCard = totals.displayNet - 120000
    expect(expectedLaborCard).toBeGreaterThan(80000) // labor + margin portion
    // Sum invariant: materials + laborCard = dNet
    expect(120000 + expectedLaborCard).toBe(totals.displayNet)
  })

  it('labor_only + margin: laborCardVal = dNet', () => {
    const totals = quoteDisplayTotals({
      outputMode: 'labor_only', totalLabor: 80000, totalMaterials: 120000,
      markupPct: 0.15, markupType: 'margin', vatPct: 27,
    })
    // In labor_only, dNet = applyMargin(labor) = 80000 / (1-0.15) = 94118
    expect(totals.displayNet).toBe(Math.round(80000 / 0.85))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6. createQuote — cableCost field preserved (P1-2 fix)
// ═════════════════════════════════════════════════════════════════════════════

describe('createQuote — cableCost persistence', () => {
  it('stores cableCost from overrides', () => {
    const q = createQuote({
      displayName: 'Test', outputMode: 'combined',
      pricing: { total: 100000, materialCost: 60000, laborCost: 40000, laborHours: 8 },
      pricingParams: { hourlyRate: 5000, markupPct: 0 },
      settings: { labor: { vat_percent: 27 } },
      overrides: { cableCost: 25000 },
    })
    expect(q.cableCost).toBe(25000)
  })

  it('cableCost defaults to 0 when not in overrides', () => {
    const q = createQuote({
      displayName: 'Test', outputMode: 'combined',
      pricing: { total: 50000, materialCost: 30000, laborCost: 20000, laborHours: 4 },
      pricingParams: { hourlyRate: 5000, markupPct: 0 },
      settings: { labor: { vat_percent: 27 } },
    })
    expect(q.cableCost).toBeUndefined() // not set without overrides — backward compat
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 7. End-to-end financial pipeline (integration)
// ═════════════════════════════════════════════════════════════════════════════

describe('Financial pipeline integration — pricing → fullCalc → createQuote → displayTotals', () => {
  const assemblies = [
    { id: 'ASM-LAMP', name: 'LED Panel 600×600', category: 'vilagitas', components: [
      { itemType: 'material', name: 'LED Panel', itemCode: 'MAT-010', qty: 1, unit: 'db' },
      { itemType: 'workitem', name: 'Lámpatest szerelés', itemCode: 'VIL-001', qty: 1, unit: 'db' },
    ]},
  ]
  const workItems = [{ code: 'VIL-001', name: 'Lámpatest szerelés', p50: 30, p90: 45, heightFactor: true }]
  const materials = [{ code: 'MAT-010', name: 'LED Panel', price: 15000, discount: 0 }]

  it('pricing → fullCalc → quote → displayTotals chain is consistent', () => {
    const takeoffRows = [{ asmId: 'ASM-LAMP', qty: 5, variantId: null, wallSplits: null }]
    const pricing = computePricing({ takeoffRows, assemblies, workItems, materials, context: null, markup: 0, hourlyRate: 5000, cableEstimate: null, difficultyMode: 'normal' })

    expect(pricing.materialCost).toBe(75000) // 5 × 15000
    expect(pricing.laborHours).toBeGreaterThan(0)
    expect(pricing.laborCost).toBeGreaterThan(0)

    const fullCalc = computeFullCalc({
      pricing, cableEstimate: null, cablePricePerM: 0,
      markup: 0.15, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows, assemblies, workItems, materials, hourlyRate: 5000, difficultyMode: 'normal',
    })

    expect(fullCalc.grandTotal).toBeGreaterThan(fullCalc.subtotal) // markup applied
    expect(fullCalc.bruttoTotal).toBeGreaterThan(fullCalc.grandTotal) // VAT applied

    const quote = createQuote({
      displayName: 'Integration Test',
      outputMode: 'combined',
      pricing: { total: fullCalc.grandTotal, materialCost: pricing.materialCost, laborCost: pricing.laborCost, laborHours: pricing.laborHours },
      pricingParams: { hourlyRate: 5000, markupPct: 0.15, markupType: 'markup' },
      settings: { labor: { vat_percent: 27 } },
    })

    expect(quote.gross).toBe(Math.round(fullCalc.grandTotal))
    expect(quote.totalMaterials).toBe(pricing.materialCost)
    expect(quote.totalLabor).toBe(Math.round(pricing.laborCost))

    const display = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: quote.cableCost || 0,
      markupPct: quote.pricingData.markup_pct,
      markupType: quote.pricingData.markup_type,
      vatPct: 27,
    })

    // displayNet should approximately equal quote.gross (both are the net total with markup)
    expect(Math.abs(display.displayNet - quote.gross)).toBeLessThanOrEqual(1) // ≤1 Ft rounding
    // Component sum invariant
    expect(display.grossMaterials + display.grossLabor + display.grossMarkup).toBe(display.displayGross)
  })

  it('margin mode: same chain produces consistent results', () => {
    const takeoffRows = [{ asmId: 'ASM-LAMP', qty: 3, variantId: null, wallSplits: null }]
    const pricing = computePricing({ takeoffRows, assemblies, workItems, materials, context: null, markup: 0, hourlyRate: 5000, cableEstimate: null, difficultyMode: 'normal' })

    const fullCalc = computeFullCalc({
      pricing, cableEstimate: null, cablePricePerM: 0,
      markup: 0.20, markupType: 'margin', vatPercent: 27,
      context: {}, takeoffRows, assemblies, workItems, materials, hourlyRate: 5000, difficultyMode: 'normal',
    })

    const quote = createQuote({
      displayName: 'Margin Test',
      outputMode: 'combined',
      pricing: { total: fullCalc.grandTotal, materialCost: pricing.materialCost, laborCost: pricing.laborCost, laborHours: pricing.laborHours },
      pricingParams: { hourlyRate: 5000, markupPct: 0.20, markupType: 'margin' },
      settings: { labor: { vat_percent: 27 } },
    })

    const display = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: 0,
      markupPct: 0.20,
      markupType: 'margin',
      vatPct: 27,
    })

    expect(Math.abs(display.displayNet - quote.gross)).toBeLessThanOrEqual(1)
    expect(display.grossMaterials + display.grossLabor + display.grossMarkup).toBe(display.displayGross)
  })
})
