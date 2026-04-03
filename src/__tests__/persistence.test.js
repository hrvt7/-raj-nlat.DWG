// ─── Persistence / Remote Save-Load / Hydration Tests ────────────────────────
// Covers: buildQuoteRow round-trip, quote save→reopen totals, plan snapshot,
// hydration recovery logic, and pre-logout sync contract.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildQuoteRow } from '../utils/quoteMapping.js'
import { createQuote } from '../utils/createQuote.js'
import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'
import { computePricing } from '../utils/pricing.js'
import { computeFullCalc } from '../utils/fullCalc.js'

// ═════════════════════════════════════════════════════════════════════════════
// 1. Quote save → reopen → totals match
// ═════════════════════════════════════════════════════════════════════════════

describe('Quote save → reopen → totals match', () => {
  const assemblies = [
    { id: 'ASM-L', name: 'LED Panel', category: 'vilagitas', components: [
      { itemType: 'material', name: 'LED Panel', itemCode: 'MAT-010', qty: 1, unit: 'db' },
      { itemType: 'workitem', name: 'Lámpa szerelés', itemCode: 'VIL-001', qty: 1, unit: 'db' },
    ]},
  ]
  const workItems = [{ code: 'VIL-001', name: 'Lámpa szerelés', p50: 30, p90: 45, heightFactor: true }]
  const materials = [{ code: 'MAT-010', name: 'LED Panel', price: 12000, discount: 0 }]

  function createTestQuote(overrides = {}) {
    const takeoffRows = [{ asmId: 'ASM-L', qty: 4, variantId: null, wallSplits: null }]
    const pricing = computePricing({ takeoffRows, assemblies, workItems, materials, context: null, markup: 0, hourlyRate: 6000, cableEstimate: null, difficultyMode: 'normal' })
    const fullCalc = computeFullCalc({
      pricing, cableEstimate: null, cablePricePerM: 0,
      markup: 0.15, markupType: overrides.markupType || 'markup', vatPercent: 27,
      context: {}, takeoffRows, assemblies, workItems, materials, hourlyRate: 6000, difficultyMode: 'normal',
    })
    return createQuote({
      displayName: 'Reopen Test',
      outputMode: overrides.outputMode || 'combined',
      pricing: { total: fullCalc.grandTotal, materialCost: pricing.materialCost, laborCost: pricing.laborCost, laborHours: pricing.laborHours },
      pricingParams: { hourlyRate: 6000, markupPct: 0.15, markupType: overrides.markupType || 'markup' },
      settings: { labor: { vat_percent: 27 } },
      overrides: { cableCost: overrides.cableCost || 0 },
    })
  }

  it('markup mode: gross matches displayNet after reopen', () => {
    const quote = createTestQuote()
    const display = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: quote.cableCost || 0,
      markupPct: quote.pricingData.markup_pct,
      markupType: quote.pricingData.markup_type,
      vatPct: 27,
    })
    expect(Math.abs(display.displayNet - quote.gross)).toBeLessThanOrEqual(1)
  })

  it('margin mode: gross matches displayNet after reopen', () => {
    const quote = createTestQuote({ markupType: 'margin' })
    const display = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: quote.cableCost || 0,
      markupPct: quote.pricingData.markup_pct,
      markupType: quote.pricingData.markup_type,
      vatPct: 27,
    })
    expect(Math.abs(display.displayNet - quote.gross)).toBeLessThanOrEqual(1)
  })

  it('with cableCost: gross includes cable after reopen', () => {
    const quote = createTestQuote({ cableCost: 25000 })
    const display = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: quote.cableCost || 0,
      markupPct: quote.pricingData.markup_pct,
      markupType: quote.pricingData.markup_type,
      vatPct: 27,
    })
    // displayNet should be greater than without cable
    const displayNoCable = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: 0,
      markupPct: quote.pricingData.markup_pct,
      markupType: quote.pricingData.markup_type,
      vatPct: 27,
    })
    expect(display.displayNet).toBeGreaterThan(displayNoCable.displayNet)
  })

  it('labor_only mode: materials excluded from displayNet', () => {
    const quote = createTestQuote({ outputMode: 'labor_only' })
    const display = quoteDisplayTotals({
      outputMode: 'labor_only',
      totalLabor: quote.totalLabor,
      totalMaterials: quote.totalMaterials,
      cableCost: 0,
      markupPct: quote.pricingData.markup_pct,
      markupType: quote.pricingData.markup_type,
      vatPct: 27,
    })
    // In labor_only, displayNet = applyMarkup(labor only)
    const laborWithMarkup = Math.round(quote.totalLabor * (1 + quote.pricingData.markup_pct))
    expect(display.displayNet).toBe(laborWithMarkup)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. buildQuoteRow round-trip contract
// ═════════════════════════════════════════════════════════════════════════════

describe('buildQuoteRow → recovery round-trip', () => {
  it('pricing_data contains full quote for recovery', () => {
    const quote = {
      id: 'QT-RT-001', gross: 150000, vatPercent: 27,
      totalMaterials: 80000, totalLabor: 50000, totalHours: 10,
      cableCost: 20000, outputMode: 'combined',
      pricingData: { hourlyRate: 5000, markup_pct: 0.15, markup_type: 'markup' },
      items: [{ name: 'Test item', qty: 1 }],
      assemblySummary: [{ id: 'ASM-1', name: 'Test', qty: 3 }],
    }
    const row = buildQuoteRow(quote, 'user-123')

    // pricing_data IS the full quote — recovery reads this back
    expect(row.pricing_data).toBe(quote)
    expect(row.pricing_data.totalMaterials).toBe(80000)
    expect(row.pricing_data.cableCost).toBe(20000)
    expect(row.pricing_data.items).toHaveLength(1)
    expect(row.pricing_data.assemblySummary).toHaveLength(1)
  })

  it('net and gross FT computed correctly', () => {
    const row = buildQuoteRow({ id: 'QT-1', gross: 100000, vatPercent: 27 }, 'u1')
    expect(row.total_net_ft).toBe(100000)
    expect(row.total_gross_ft).toBe(127000)
  })

  it('handles missing fields gracefully', () => {
    const row = buildQuoteRow({ id: 'QT-EMPTY' }, 'u1')
    expect(row.total_net_ft).toBe(0)
    expect(row.total_gross_ft).toBe(0)
    expect(row.output_mode).toBe('combined')
    expect(row.status).toBe('draft')
    expect(row.client_name).toBe('')
    expect(row.project_name).toBe('')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. Hydration recovery logic contract
// ═════════════════════════════════════════════════════════════════════════════

describe('Hydration recovery gate logic', () => {
  // These test the EXACT logic from App.jsx:1539-1592
  // The recovery checks read raw localStorage, not loaded defaults

  function isArrayRecoverable(raw) {
    try {
      if (raw === null) return true
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return true
      return parsed.length === 0
    } catch { return true }
  }

  function isSettingsRecoverable(raw) {
    try {
      if (raw === null) return true
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return true
      return Object.keys(parsed).length === 0
    } catch { return true }
  }

  function isEnvelopeRecoverable(raw) {
    try {
      if (raw === null) return true
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return true
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : null)
      return !arr || arr.length === 0
    } catch { return true }
  }

  it('null localStorage → recoverable (fresh browser)', () => {
    expect(isArrayRecoverable(null)).toBe(true)
    expect(isSettingsRecoverable(null)).toBe(true)
    expect(isEnvelopeRecoverable(null)).toBe(true)
  })

  it('empty array → recoverable', () => {
    expect(isArrayRecoverable('[]')).toBe(true)
  })

  it('non-empty array → NOT recoverable (local data wins)', () => {
    expect(isArrayRecoverable('[{"id":"x"}]')).toBe(false)
  })

  it('empty object settings → recoverable', () => {
    expect(isSettingsRecoverable('{}')).toBe(true)
  })

  it('populated settings → NOT recoverable', () => {
    expect(isSettingsRecoverable('{"company":{"name":"Test"}}')).toBe(false)
  })

  it('versioned envelope with empty data → recoverable', () => {
    expect(isEnvelopeRecoverable('{"_v":1,"data":[]}')).toBe(true)
  })

  it('versioned envelope with data → NOT recoverable', () => {
    expect(isEnvelopeRecoverable('{"_v":1,"data":[{"id":"p1"}]}')).toBe(false)
  })

  it('malformed JSON → recoverable (triggers remote fetch)', () => {
    expect(isArrayRecoverable('not{json')).toBe(true)
    expect(isSettingsRecoverable('corrupt')).toBe(true)
    expect(isEnvelopeRecoverable('{bad')).toBe(true)
  })

  it('after logout clear (null) → all recoverable → remote fetch fires', () => {
    // Simulates: user logs out (localStorage cleared), logs back in
    const all = [null, null, null, null, null, null, null]
    const allRecoverable = all.every(raw => isArrayRecoverable(raw))
    expect(allRecoverable).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. Plan metadata + calc snapshot contract
// ═════════════════════════════════════════════════════════════════════════════

describe('Plan calc snapshot contract', () => {
  // The per-plan save (TakeoffWorkspace handleSave) builds snapshotItems from
  // pricing.lines. The recent fix also adds measurementItems.
  // This tests the DATA STRUCTURE contract, not the actual save.

  it('snapshotItem has required fields for quote reconstruction', () => {
    const line = {
      name: 'LED Panel', code: 'MAT-010', qty: 5, unit: 'db', type: 'material',
      systemType: 'lighting', hours: 0, materialCost: 75000,
    }
    // Simulate what TakeoffWorkspace.handleSave builds
    const snapshotItem = {
      name: line.name, code: line.code || '', qty: line.qty, unit: line.unit, type: line.type,
      systemType: line.systemType || 'general',
      unitPrice: line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
      hours: line.hours || 0, materialCost: line.materialCost || 0,
    }
    expect(snapshotItem.name).toBe('LED Panel')
    expect(snapshotItem.unitPrice).toBe(15000)
    expect(snapshotItem.materialCost).toBe(75000)
    expect(snapshotItem.qty).toBe(5)
  })

  it('measurement snapshot item has _fromMeasurement flag', () => {
    const mi = { label: 'KT 100×60', totalMeters: 12.5, pricePerUnit: 2500, cost: 31250, key: 'kt_100_60', matchedAsmId: 'ASM-KT', isAutoPriced: true }
    const snapshotItem = {
      name: mi.label + (mi.isAutoPriced ? '' : ' (kézi ár)'),
      code: mi.matchedAsmId || mi.key, qty: Math.round(mi.totalMeters * 10) / 10, unit: 'm',
      type: 'material', systemType: 'general',
      unitPrice: mi.pricePerUnit, hours: 0, materialCost: mi.cost, _fromMeasurement: true,
    }
    expect(snapshotItem._fromMeasurement).toBe(true)
    expect(snapshotItem.name).toBe('KT 100×60')
    expect(snapshotItem.materialCost).toBe(31250)
    expect(snapshotItem.qty).toBe(12.5)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5. Pre-logout sync contract
// ═════════════════════════════════════════════════════════════════════════════

describe('Pre-logout sync contract', () => {
  it('Promise.allSettled captures both success and failure', async () => {
    const results = await Promise.allSettled([
      Promise.resolve('ok'),
      Promise.reject(new Error('sync failed')),
      Promise.resolve('ok2'),
    ])
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[2].status).toBe('fulfilled')
    // allSettled itself never throws
  })

  it('per-quote catch prevents cascade failure', async () => {
    const quotes = [
      { id: 'Q1' }, { id: 'Q2-fail' }, { id: 'Q3' },
    ]
    const saveQuote = async (q) => {
      if (q.id === 'Q2-fail') throw new Error('DB error')
      return 'saved'
    }
    // This mirrors App.jsx:1665 pattern
    const results = await Promise.all(
      quotes.map(q => saveQuote(q).catch(() => {}))
    )
    // Q1 and Q3 succeed, Q2 caught silently
    expect(results[0]).toBe('saved')
    expect(results[1]).toBeUndefined() // caught
    expect(results[2]).toBe('saved')
  })
})
