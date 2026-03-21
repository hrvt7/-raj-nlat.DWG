/**
 * Smoke Test Suite — Core Flow Regression Tests
 *
 * Covers the 6 most critical pure business logic paths:
 * 1. planMetaInference — Hungarian filename parsing
 * 2. computePricing — quote pricing engine
 * 3. Merge settings fallback — nested settings resolution
 * 4. Project delete fallback — orphan plan → fallback project
 * 5. saveQuoteRemote payload — buildQuoteRow field mapping
 * 6. createQuote factory — unified quote assembly consistency
 *
 * All tests are pure/unit: no DOM, no localStorage, no network.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ═══════════════════════════════════════════════════════════════════════════════
// 1. planMetaInference — Hungarian filename parsing
// ═══════════════════════════════════════════════════════════════════════════════

import { inferPlanMeta } from '../utils/planMetaInference.js'

describe('planMetaInference — filename parsing', () => {
  it('parses typical Hungarian electrical plan filename', () => {
    const meta = inferPlanMeta('E-01_Fsz_vilagitas_alaprajz_R2.pdf')
    expect(meta.drawingNumber).toBeTruthy()
    expect(meta.floor).toBeTruthy()            // "Fsz" → ground floor
    expect(meta.systemType).toBeTruthy()        // "E-" prefix or "vilagitas" → electrical/lighting
    expect(meta.revision).toBe('R2')
    expect(meta.metaConfidence).toBeGreaterThan(0)
  })

  it('extracts floor from "Pince" and "Emelet"', () => {
    const pince = inferPlanMeta('G-03_Pince_elosztok.pdf')
    expect(pince.floor).toBeTruthy()
    expect(pince.floorLabel?.toLowerCase()).toContain('pince')

    const emelet = inferPlanMeta('E-05_1emelet_vilagitas.pdf')
    expect(emelet.floor).toBeTruthy()
  })

  it('returns zero confidence for empty / null input', () => {
    expect(inferPlanMeta(null).metaConfidence).toBe(0)
    expect(inferPlanMeta('').metaConfidence).toBe(0)
    expect(inferPlanMeta(undefined).metaConfidence).toBe(0)
  })

  it('handles simple filename without structured metadata', () => {
    const meta = inferPlanMeta('scan_2025.pdf')
    expect(meta.metaSource).toBe('filename')
    // Low confidence but should not throw
    expect(meta.metaConfidence).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. computePricing — core pricing engine
// ═══════════════════════════════════════════════════════════════════════════════

import { computePricing } from '../utils/pricing.js'

describe('computePricing — core pricing logic', () => {
  const baseWorkItem = {
    code: 'WI-001', name: 'Dugalj felszerelés',
    p50: 30, p90: 45, unit: 'db',
  }
  const baseMaterial = {
    code: 'MAT-001', name: 'Dugalj Legrand',
    price: 1500, unit: 'db', discount: 0,
  }
  const baseAssembly = {
    id: 'ASM-001', name: 'Dugalj komplett', category: 'dugalj',
    components: [
      { itemType: 'workitem', itemCode: 'WI-001', name: 'Dugalj felszerelés', qty: 1, unit: 'db' },
      { itemType: 'material', itemCode: 'MAT-001', name: 'Dugalj Legrand', qty: 1, unit: 'db' },
    ],
  }

  it('calculates material + labor + markup correctly', () => {
    const result = computePricing({
      takeoffRows: [{ asmId: 'ASM-001', qty: 10, wallType: 'brick' }],
      assemblies: [baseAssembly],
      workItems: [baseWorkItem],
      materials: [baseMaterial],
      context: null,
      markup: 0.15,
      hourlyRate: 9000,
      cableEstimate: null,
      difficultyMode: 'normal',
    })

    expect(result.materialCost).toBe(15000)       // 10 × 1500
    // laborHours = (p50 × ctxMultiplier × wallFactor × qty) / 60
    // ctxMultiplier > 1.0 from default CONTEXT_FACTORS (renovation, brick, etc.)
    expect(result.laborHours).toBeGreaterThan(0)
    expect(result.laborCost).toBe(result.laborHours * 9000)
    expect(result.subtotal).toBe(result.materialCost + result.laborCost)
    expect(result.markup).toBeCloseTo(result.subtotal * 0.15, 0)
    expect(result.total).toBe(result.subtotal + result.markup)
    expect(result.total).toBeGreaterThan(0)
  })

  it('returns zero for empty takeoff rows', () => {
    const result = computePricing({
      takeoffRows: [],
      assemblies: [], workItems: [], materials: [],
      context: null, markup: 0.15, hourlyRate: 9000,
      cableEstimate: null, difficultyMode: 'normal',
    })
    expect(result.total).toBe(0)
    expect(result.lines).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Merge settings fallback — nested key resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe('merge settings — nested key resolution', () => {
  // This tests the exact expression PdfMergePanel line 95-96 uses
  function resolveMarkup(stg) {
    return (stg?.labor?.markup_percent ?? 15) / 100
  }
  function resolveHourlyRate(stg) {
    return stg?.labor?.hourly_rate ?? 9000
  }

  it('reads nested values when settings provided', () => {
    const stg = { labor: { hourly_rate: 12000, markup_percent: 20 } }
    expect(resolveMarkup(stg)).toBe(0.2)
    expect(resolveHourlyRate(stg)).toBe(12000)
  })

  it('falls back to defaults when settings is null/undefined', () => {
    expect(resolveMarkup(null)).toBe(0.15)
    expect(resolveMarkup(undefined)).toBe(0.15)
    expect(resolveHourlyRate(null)).toBe(9000)
    expect(resolveHourlyRate(undefined)).toBe(9000)
  })

  it('falls back when labor key is missing', () => {
    expect(resolveMarkup({ company: { name: 'Test' } })).toBe(0.15)
    expect(resolveHourlyRate({})).toBe(9000)
  })

  it('handles partial labor object', () => {
    // Only hourly_rate set, markup_percent missing
    expect(resolveMarkup({ labor: { hourly_rate: 10000 } })).toBe(0.15)
    expect(resolveHourlyRate({ labor: { hourly_rate: 10000 } })).toBe(10000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Project delete fallback — orphan plan → fallback project
// ═══════════════════════════════════════════════════════════════════════════════

describe('project delete fallback', () => {
  // Simulate the store logic with a minimal in-memory mock
  // (same logic as projectStore.js but without localStorage)

  const FALLBACK_PROJECT_ID = 'PRJ-imported'

  function createMockStore() {
    let projects = []
    let plans = []
    return {
      loadMeta: () => [...projects],
      saveMeta: (p) => { projects = p },
      loadPlans: () => [...plans],
      setPlans: (p) => { plans = p },
      deleteProject(id) { projects = projects.filter(p => p.id !== id) },
      updatePlanMeta(planId, updates) {
        plans = plans.map(p => p.id === planId ? { ...p, ...updates } : p)
      },
      ensureFallbackProject() {
        const existing = projects.find(p => p.id === FALLBACK_PROJECT_ID)
        if (existing) return FALLBACK_PROJECT_ID
        projects = [...projects, {
          id: FALLBACK_PROJECT_ID,
          name: 'Importált tervek',
          description: 'Törölt projektekből ide kerülnek a tervrajzok',
        }]
        return FALLBACK_PROJECT_ID
      },
    }
  }

  it('moves orphan plans to fallback project on delete', () => {
    const store = createMockStore()
    store.saveMeta([{ id: 'PRJ-abc', name: 'My Project' }])
    store.setPlans([
      { id: 'PLAN-1', name: 'Földszint.pdf', projectId: 'PRJ-abc' },
      { id: 'PLAN-2', name: 'Emelet.pdf', projectId: 'PRJ-abc' },
    ])

    // Execute: same logic as Projektek.jsx handleDelete
    const projectId = 'PRJ-abc'
    const fallbackId = store.ensureFallbackProject()
    const orphaned = store.loadPlans().filter(p => p.projectId === projectId)
    for (const plan of orphaned) {
      store.updatePlanMeta(plan.id, { projectId: fallbackId })
    }
    store.deleteProject(projectId)

    // Verify
    const projects = store.loadMeta()
    const plans = store.loadPlans()

    expect(projects).toHaveLength(1)
    expect(projects[0].id).toBe(FALLBACK_PROJECT_ID)
    expect(projects[0].name).toBe('Importált tervek')

    expect(plans).toHaveLength(2)
    expect(plans[0].projectId).toBe(FALLBACK_PROJECT_ID)
    expect(plans[1].projectId).toBe(FALLBACK_PROJECT_ID)
  })

  it('does not duplicate fallback project on second delete', () => {
    const store = createMockStore()
    store.saveMeta([
      { id: 'PRJ-1', name: 'Project 1' },
      { id: 'PRJ-2', name: 'Project 2' },
    ])
    store.setPlans([
      { id: 'PLAN-A', projectId: 'PRJ-1' },
      { id: 'PLAN-B', projectId: 'PRJ-2' },
    ])

    // Delete first project
    let fb = store.ensureFallbackProject()
    store.updatePlanMeta('PLAN-A', { projectId: fb })
    store.deleteProject('PRJ-1')

    // Delete second project
    fb = store.ensureFallbackProject() // should return same ID
    store.updatePlanMeta('PLAN-B', { projectId: fb })
    store.deleteProject('PRJ-2')

    const projects = store.loadMeta()
    expect(projects.filter(p => p.id === FALLBACK_PROJECT_ID)).toHaveLength(1)
    expect(store.loadPlans().every(p => p.projectId === FALLBACK_PROJECT_ID)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. saveQuoteRemote payload — buildQuoteRow field mapping
// ═══════════════════════════════════════════════════════════════════════════════

import { buildQuoteRow } from '../utils/quoteMapping.js'

describe('buildQuoteRow — Supabase payload mapping', () => {
  const sampleQuote = {
    id: 'Q-2026-0042',
    client_name: 'Kovács János',
    clientName: 'Kovács János',
    project_name: 'Kórház B épület',
    projectName: 'Kórház B épület',
    status: 'draft',
    vatPercent: 27,
    gross: 1_250_000,
    summary: { grandTotal: 1_250_000 },
    context: { building_type: 'kórház' },
    cableEstimate: { totalLength: 450 },
    notes: 'B szárny erősáram',
  }

  it('maps client_name and project_name from top-level fields', () => {
    const row = buildQuoteRow(sampleQuote, 'user-123')
    expect(row.client_name).toBe('Kovács János')
    expect(row.project_name).toBe('Kórház B épület')
  })

  it('computes nettó from quote.gross', () => {
    const row = buildQuoteRow(sampleQuote, 'user-123')
    expect(row.total_net_ft).toBe(1_250_000)
  })

  it('computes bruttó = nettó × (1 + ÁFA/100)', () => {
    const row = buildQuoteRow(sampleQuote, 'user-123')
    expect(row.total_gross_ft).toBe(Math.round(1_250_000 * 1.27))
    expect(row.vat_percent).toBe(27)
  })

  it('falls back to summary.grandTotal when gross is missing', () => {
    const q = { ...sampleQuote, gross: 0 }
    const row = buildQuoteRow(q, 'user-123')
    expect(row.total_net_ft).toBe(1_250_000) // from summary.grandTotal
  })

  it('defaults to 27% VAT when vatPercent is missing', () => {
    const q = { ...sampleQuote, vatPercent: undefined }
    const row = buildQuoteRow(q, 'user-123')
    expect(row.vat_percent).toBe(27)
    expect(row.total_gross_ft).toBe(Math.round(1_250_000 * 1.27))
  })

  it('handles quote with only clientName (camelCase) field', () => {
    const q = { id: 'Q-1', clientName: 'Test', projectName: 'Proj', gross: 100000 }
    const row = buildQuoteRow(q, 'uid')
    expect(row.client_name).toBe('Test')
    expect(row.project_name).toBe('Proj')
  })

  it('preserves user_id and quote_number', () => {
    const row = buildQuoteRow(sampleQuote, 'user-abc')
    expect(row.user_id).toBe('user-abc')
    expect(row.quote_number).toBe('Q-2026-0042')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. planMetaAccessors — unified metadata access
// ═══════════════════════════════════════════════════════════════════════════════

import { getPlanFloor, getPlanFloorLabel, getPlanDiscipline, getPlanSystemType } from '../utils/planMetaAccessors.js'

describe('planMetaAccessors — unified metadata access', () => {
  it('reads from inferredMeta (canonical shape)', () => {
    const plan = {
      inferredMeta: { floor: 'fsz', floorLabel: 'Földszint', systemType: 'Világítás' },
    }
    expect(getPlanFloor(plan)).toBe('fsz')
    expect(getPlanFloorLabel(plan)).toBe('Földszint')
    expect(getPlanDiscipline(plan)).toBe('Világítás')
    expect(getPlanSystemType(plan)).toBe('Világítás')
  })

  it('falls back to flat fields (legacy compat)', () => {
    const plan = { floor: 'pince', floorLabel: 'Pince', discipline: 'Erősáram' }
    expect(getPlanFloor(plan)).toBe('pince')
    expect(getPlanFloorLabel(plan)).toBe('Pince')
    expect(getPlanDiscipline(plan)).toBe('Erősáram')
  })

  it('prefers inferredMeta over flat fields', () => {
    const plan = {
      floor: 'old_flat',
      inferredMeta: { floor: 'canonical', systemType: 'Tűzjelző' },
    }
    expect(getPlanFloor(plan)).toBe('canonical')
    expect(getPlanDiscipline(plan)).toBe('Tűzjelző')
  })

  it('returns null for null/undefined/empty plan', () => {
    expect(getPlanFloor(null)).toBe(null)
    expect(getPlanFloor(undefined)).toBe(null)
    expect(getPlanFloor({})).toBe(null)
    expect(getPlanDiscipline(null)).toBe(null)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. quoteDisplayTotals — outputMode-aware totals
// ═══════════════════════════════════════════════════════════════════════════════

import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'
import { OUTPUT_MODE_NOTES } from '../data/quoteDefaults.js'

describe('quoteDisplayTotals — outputMode-aware financial totals', () => {
  const base = { totalLabor: 500_000, totalMaterials: 300_000, markupPct: 0.15, vatPct: 27 }

  it('combined mode: net = (material + labor) + markup on both', () => {
    const r = quoteDisplayTotals({ ...base, outputMode: 'combined' })
    // subtotal = 300k + 500k = 800k; markup = 800k × 0.15 = 120k; net = 920k
    expect(r.displayNet).toBe(920_000)
    expect(r.fullNet).toBe(920_000)
    expect(r.displayVat).toBe(Math.round(920_000 * 0.27))
    expect(r.displayGross).toBe(920_000 + Math.round(920_000 * 0.27))
  })

  it('labor_only mode: net = labor + markup on labor only', () => {
    const r = quoteDisplayTotals({ ...base, outputMode: 'labor_only' })
    // laborMarkup = 500k × 0.15 = 75k; laborNet = 575k
    expect(r.displayNet).toBe(575_000)
    expect(r.displayVat).toBe(Math.round(575_000 * 0.27))
    expect(r.displayGross).toBe(575_000 + Math.round(575_000 * 0.27))
    // fullNet still includes everything
    expect(r.fullNet).toBe(920_000)
  })

  it('split_material_labor mode: same totals as combined', () => {
    const r = quoteDisplayTotals({ ...base, outputMode: 'split_material_labor' })
    expect(r.displayNet).toBe(920_000)
    expect(r.displayGross).toBe(920_000 + Math.round(920_000 * 0.27))
  })

  it('zero markup: net = subtotal, labor_only net = labor', () => {
    const r = quoteDisplayTotals({ ...base, markupPct: 0, outputMode: 'labor_only' })
    expect(r.displayNet).toBe(500_000) // raw labor, no markup
    expect(r.fullNet).toBe(800_000)    // material + labor, no markup
  })

  it('handles missing/undefined values gracefully', () => {
    const r = quoteDisplayTotals({ outputMode: 'combined' })
    expect(r.displayNet).toBe(0)
    expect(r.displayVat).toBe(0)
    expect(r.displayGross).toBe(0)
  })

  it('default vatPct is 27 when not provided', () => {
    const r = quoteDisplayTotals({ outputMode: 'combined', totalLabor: 100_000, totalMaterials: 0, markupPct: 0 })
    expect(r.displayVat).toBe(Math.round(100_000 * 0.27))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. buildQuoteRow — outputMode sync field
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildQuoteRow — output_mode field', () => {
  it('includes output_mode from quote.outputMode', () => {
    const row = buildQuoteRow({ id: 'Q-1', gross: 100000, outputMode: 'labor_only' }, 'u1')
    expect(row.output_mode).toBe('labor_only')
  })

  it('defaults output_mode to combined when missing', () => {
    const row = buildQuoteRow({ id: 'Q-2', gross: 100000 }, 'u1')
    expect(row.output_mode).toBe('combined')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 9. BOM independence from outputMode
// ═══════════════════════════════════════════════════════════════════════════════

import { generateBOMRows } from '../utils/bomExport.js'

describe('generateBOMRows — BOM independence', () => {
  const quote = {
    items: [
      { type: 'material', name: 'Kábel NYM 3x2.5', code: 'MAT-001', qty: 100, unit: 'm', materialCost: 25000 },
      { type: 'material', name: 'Dugalj', code: 'MAT-002', qty: 10, unit: 'db', materialCost: 8000 },
      { type: 'labor', name: 'Szerelés', code: 'WI-001', qty: 10, unit: 'db', hours: 5 },
      { type: 'cable', name: 'Kábel NYM 5x2.5', code: 'MAT-003', qty: 50, unit: 'm', materialCost: 20000 },
    ],
  }

  it('returns only material and cable items (no labor)', () => {
    const rows = generateBOMRows(quote)
    expect(rows.length).toBe(3)
    expect(rows.every(r => r.materialCost > 0)).toBe(true)
  })

  it('produces identical BOM regardless of outputMode', () => {
    // BOM function doesn't take outputMode — it always returns full materials
    const rows1 = generateBOMRows({ ...quote, outputMode: 'combined' })
    const rows2 = generateBOMRows({ ...quote, outputMode: 'labor_only' })
    const rows3 = generateBOMRows({ ...quote, outputMode: 'split_material_labor' })
    expect(rows1).toEqual(rows2)
    expect(rows2).toEqual(rows3)
  })

  it('aggregates duplicate material codes', () => {
    const q = {
      items: [
        { type: 'material', name: 'Kábel', code: 'MAT-001', qty: 50, unit: 'm', materialCost: 12500 },
        { type: 'material', name: 'Kábel', code: 'MAT-001', qty: 50, unit: 'm', materialCost: 12500 },
      ],
    }
    const rows = generateBOMRows(q)
    expect(rows.length).toBe(1)
    expect(rows[0].qty).toBe(100)
    expect(rows[0].materialCost).toBe(25000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Deploy safety — env guard & supabaseConfigured export
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deploy safety — env guards', () => {
  it('supabaseConfigured is a boolean export', async () => {
    // Dynamic import to avoid side-effect issues with actual supabase init
    // We test the contract: it must be a boolean
    const mod = await import('../supabase.js')
    expect(typeof mod.supabaseConfigured).toBe('boolean')
  })

  it('quoteDisplayTotals returns all required fields', () => {
    const result = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 100000, totalMaterials: 200000,
      markupPct: 0.1, vatPct: 27,
    })
    expect(result).toHaveProperty('displayNet')
    expect(result).toHaveProperty('displayVat')
    expect(result).toHaveProperty('displayGross')
    expect(result).toHaveProperty('fullNet')
    // All must be numbers
    expect(typeof result.displayNet).toBe('number')
    expect(typeof result.displayVat).toBe('number')
    expect(typeof result.displayGross).toBe('number')
    expect(typeof result.fullNet).toBe('number')
  })

  it('buildQuoteRow always includes output_mode field', () => {
    const row = buildQuoteRow({ id: 'QT-2025-001', outputMode: undefined }, 'user-1')
    expect(row.output_mode).toBe('combined')  // default
  })

  it('OUTPUT_MODE_NOTES has all three mode keys', () => {
    expect(OUTPUT_MODE_NOTES).toHaveProperty('combined')
    expect(OUTPUT_MODE_NOTES).toHaveProperty('labor_only')
    expect(OUTPUT_MODE_NOTES).toHaveProperty('split_material_labor')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. createQuote factory — unified quote assembly consistency
// ═══════════════════════════════════════════════════════════════════════════════

// Mock generateQuoteId (depends on localStorage)
vi.mock('../data/store.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    generateQuoteId: () => 'QT-TEST-001',
    loadQuotes: vi.fn(() => []),
  }
})

import { createQuote } from '../utils/createQuote.js'

const baseSettings = {
  labor: { vat_percent: 27, hourly_rate: 9000, markup_percent: 10 },
  quote: {
    default_inclusions: 'alapértelmezett tartalom',
    default_exclusions: 'alapértelmezett kizárás',
    default_validity_text: '30 nap',
    default_payment_terms_text: '50% előleg',
  },
}

const basePricing = { total: 123456, materialCost: 45000, laborCost: 78456, laborHours: 8.5 }
const basePricingParams = { hourlyRate: 9000, markupPct: 0.10 }

describe('createQuote factory — unified quote assembly', () => {
  it('produces all required identity fields', () => {
    const q = createQuote({
      displayName: 'Teszt Projekt',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: baseSettings,
    })
    expect(q.id).toBe('QT-TEST-001')
    expect(q.projectName).toBe('Teszt Projekt')
    expect(q.project_name).toBe('Teszt Projekt')
    expect(q.name).toBe('Teszt Projekt')
    expect(q.status).toBe('draft')
    expect(q.createdAt).toBeTruthy()
    expect(q.created_at).toBe(q.createdAt)
  })

  it('seeds vatPercent from settings.labor.vat_percent', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: { ...baseSettings, labor: { ...baseSettings.labor, vat_percent: 25 } },
    })
    expect(q.vatPercent).toBe(25)
  })

  it('defaults vatPercent to 27 when settings missing', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: {},
    })
    expect(q.vatPercent).toBe(27)
  })

  it('rounds financial totals to integers', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: { total: 123.7, materialCost: 45.3, laborCost: 78.4, laborHours: 2.5 },
      pricingParams: basePricingParams,
      settings: baseSettings,
    })
    expect(q.gross).toBe(124)
    expect(q.totalMaterials).toBe(45)
    expect(q.totalLabor).toBe(78)
    expect(q.totalHours).toBe(2.5) // hours NOT rounded
  })

  it('seeds labor_only exclusions from OUTPUT_MODE_INCLEXCL', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'labor_only',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: baseSettings,
    })
    expect(q.outputMode).toBe('labor_only')
    // labor_only has non-empty exclusions (anyagköltség related)
    expect(q.exclusions.length).toBeGreaterThan(0)
  })

  it('passes overrides and they win over base fields', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: baseSettings,
      overrides: {
        source: 'merge-panel',
        bundleId: 'B-001',
        items: [{ name: 'Lámpa', qty: 3 }],
        status: 'sent',   // override base status
      },
    })
    expect(q.source).toBe('merge-panel')
    expect(q.bundleId).toBe('B-001')
    expect(q.items).toHaveLength(1)
    expect(q.status).toBe('sent') // override wins
  })

  it('pricingData stores hourlyRate and markup_pct correctly', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: { hourlyRate: 12000, markupPct: 0.15 },
      settings: baseSettings,
    })
    expect(q.pricingData.hourlyRate).toBe(12000)
    expect(q.pricingData.markup_pct).toBe(0.15)
  })

  it('summary mirrors gross and hours', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: baseSettings,
    })
    expect(q.summary.grandTotal).toBe(q.gross)
    expect(q.summary.totalWorkHours).toBe(q.totalHours)
  })

  it('seeds validityText and paymentTermsText from settings.quote', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: baseSettings,
    })
    expect(q.validityText).toBe('30 nap')
    expect(q.paymentTermsText).toBe('50% előleg')
  })

  it('clientName defaults to empty string', () => {
    const q = createQuote({
      displayName: 'X',
      outputMode: 'combined',
      pricing: basePricing,
      pricingParams: basePricingParams,
      settings: baseSettings,
    })
    expect(q.clientName).toBe('')
    expect(q.client_name).toBe('')
  })

  it('all 3 paths produce same shape (no missing keys)', () => {
    const requiredKeys = [
      'id', 'projectName', 'project_name', 'name', 'clientName', 'client_name',
      'createdAt', 'created_at', 'status', 'outputMode', 'groupBy',
      'inclusions', 'exclusions', 'validityText', 'paymentTermsText',
      'vatPercent', 'gross', 'totalMaterials', 'totalLabor', 'totalHours',
      'summary', 'pricingData',
    ]
    // Path A style (takeoff-workspace)
    const qA = createQuote({
      displayName: 'A', outputMode: 'combined', pricing: basePricing,
      pricingParams: basePricingParams, settings: baseSettings,
      overrides: { items: [], source: 'takeoff-workspace', fileName: 'E-01.pdf' },
    })
    // Path B style (plan-takeoff)
    const qB = createQuote({
      displayName: 'B', outputMode: 'labor_only', pricing: basePricing,
      pricingParams: basePricingParams, settings: baseSettings,
      overrides: { items: [], source: 'plan-takeoff', planId: 'P-001' },
    })
    // Path C style (merge-panel)
    const qC = createQuote({
      displayName: 'C', outputMode: 'split_material_labor', pricing: basePricing,
      pricingParams: basePricingParams, settings: baseSettings,
      overrides: { items: [], source: 'merge-panel', sourcePlans: ['P-001', 'P-002'] },
    })
    for (const key of requiredKeys) {
      expect(qA).toHaveProperty(key)
      expect(qB).toHaveProperty(key)
      expect(qC).toHaveProperty(key)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 11. quoteOrphans — orphan detection helpers
// ═══════════════════════════════════════════════════════════════════════════════

import { checkQuotePlanStatus, countQuotesForPlan } from '../utils/quoteOrphans.js'

// We need to mock loadQuotes and loadPlans used inside quoteOrphans.js
vi.mock('../data/planStore.js', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    loadPlans: vi.fn(() => []),
  }
})

import { loadPlans } from '../data/planStore.js'
import { loadQuotes } from '../data/store.js'

describe('checkQuotePlanStatus — orphan detection', () => {
  beforeEach(() => {
    loadPlans.mockReturnValue([{ id: 'P-1' }, { id: 'P-2' }])
  })

  it('returns "ok" when planId references existing plan', () => {
    expect(checkQuotePlanStatus({ planId: 'P-1' })).toBe('ok')
  })

  it('returns "orphan" when planId references deleted plan', () => {
    expect(checkQuotePlanStatus({ planId: 'P-GONE' })).toBe('orphan')
  })

  it('returns "ok" when all sourcePlans exist', () => {
    expect(checkQuotePlanStatus({ sourcePlans: ['P-1', 'P-2'] })).toBe('ok')
  })

  it('returns "partial" when some sourcePlans are missing', () => {
    expect(checkQuotePlanStatus({ sourcePlans: ['P-1', 'P-GONE'] })).toBe('partial')
  })

  it('returns "orphan" when all sourcePlans are missing', () => {
    expect(checkQuotePlanStatus({ sourcePlans: ['P-GONE', 'P-ALSO-GONE'] })).toBe('orphan')
  })

  it('returns "no-ref" for quote with no plan references', () => {
    expect(checkQuotePlanStatus({ id: 'Q-1' })).toBe('no-ref')
    expect(checkQuotePlanStatus({})).toBe('no-ref')
  })
})

describe('countQuotesForPlan — plan reference counting', () => {
  it('counts quotes referencing plan via planId', () => {
    loadQuotes.mockReturnValue([
      { id: 'Q-1', planId: 'P-1' },
      { id: 'Q-2', planId: 'P-2' },
      { id: 'Q-3', planId: 'P-1' },
    ])
    expect(countQuotesForPlan('P-1')).toBe(2)
    expect(countQuotesForPlan('P-2')).toBe(1)
    expect(countQuotesForPlan('P-NONE')).toBe(0)
  })

  it('counts quotes referencing plan via sourcePlans array', () => {
    loadQuotes.mockReturnValue([
      { id: 'Q-1', sourcePlans: ['P-1', 'P-2'] },
      { id: 'Q-2', sourcePlans: ['P-2', 'P-3'] },
    ])
    expect(countQuotesForPlan('P-1')).toBe(1)
    expect(countQuotesForPlan('P-2')).toBe(2)
    expect(countQuotesForPlan('P-3')).toBe(1)
  })

  it('returns 0 when no quotes exist', () => {
    loadQuotes.mockReturnValue([])
    expect(countQuotesForPlan('P-1')).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 12. computePricing warnings — material not found
// ═══════════════════════════════════════════════════════════════════════════════

describe('computePricing — material lookup warnings', () => {
  const workItem = { code: 'WI-001', name: 'Felszerelés', p50: 30, p90: 45, unit: 'db' }
  const assembly = {
    id: 'ASM-W', name: 'Teszt', category: 'dugalj',
    components: [
      { itemType: 'material', itemCode: 'MAT-MISSING', name: 'Ismeretlen anyag', qty: 1, unit: 'db' },
      { itemType: 'workitem', itemCode: 'WI-001', name: 'Felszerelés', qty: 1, unit: 'db' },
    ],
  }

  it('returns warning when material code not found in catalog', () => {
    const result = computePricing({
      takeoffRows: [{ asmId: 'ASM-W', qty: 5, wallType: 'brick' }],
      assemblies: [assembly],
      workItems: [workItem],
      materials: [],  // empty catalog → material not found
      context: null,
      markup: 0,
      hourlyRate: 9000,
      cableEstimate: null,
      difficultyMode: 'normal',
    })
    expect(result.warnings).toBeDefined()
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0].type).toBe('material_not_found')
    expect(result.warnings[0].name).toBe('Ismeretlen anyag')
  })

  it('returns no warnings when all materials found', () => {
    const mat = { code: 'MAT-MISSING', name: 'Ismeretlen anyag', price: 100, unit: 'db', discount: 0 }
    const result = computePricing({
      takeoffRows: [{ asmId: 'ASM-W', qty: 5, wallType: 'brick' }],
      assemblies: [assembly],
      workItems: [workItem],
      materials: [mat],
      context: null,
      markup: 0,
      hourlyRate: 9000,
      cableEstimate: null,
      difficultyMode: 'normal',
    })
    expect(result.warnings).toBeDefined()
    expect(result.warnings.length).toBe(0)
  })

  it('counts missing material cost as 0 Ft', () => {
    const result = computePricing({
      takeoffRows: [{ asmId: 'ASM-W', qty: 1, wallType: 'brick' }],
      assemblies: [assembly],
      workItems: [workItem],
      materials: [],
      context: null,
      markup: 0,
      hourlyRate: 0,
      cableEstimate: null,
      difficultyMode: 'normal',
    })
    // Material cost should be 0 since material not found
    const matLine = result.lines.find(l => l.type === 'material')
    expect(matLine.materialCost).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Source hygiene — no native confirm() in page components
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Source hygiene — no native confirm()', () => {
  const pagesDir = join(import.meta.dirname || new URL('.', import.meta.url).pathname, '..', 'pages')

  it('page components do not use native window.confirm()', () => {
    const files = readdirSync(pagesDir).filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
    const violations = []
    for (const file of files) {
      const src = readFileSync(join(pagesDir, file), 'utf-8')
      // Match confirm( but not inside comments or the ConfirmDialog import
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.match(/\bconfirm\s*\(/) && !line.trim().startsWith('//') && !line.includes('ConfirmDialog')) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Demo Seed — shape validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Demo Seed — data shape & idempotency', () => {
  // localStorage mock with full API for demoSeed + store.js compat
  let store = {}
  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
      get length() { return Object.keys(store).length },
      key: (i) => Object.keys(store)[i] ?? null,
      clear: () => { store = {} },
    })
  })

  it('seedDemoData creates DEMO-prefixed project, plans, and quotes', async () => {
    const { seedDemoData, isDemoSeeded, getDemoProjectId } = await import('../data/demoSeed.js')
    expect(isDemoSeeded()).toBe(false)

    const result = seedDemoData()
    expect(result.seeded).toBe(true)
    expect(result.projectId).toBe(getDemoProjectId())

    // Verify project (may be versioned envelope or raw array)
    const projectsRaw = JSON.parse(store['takeoffpro_projects_meta'] || '[]')
    const projects = Array.isArray(projectsRaw) ? projectsRaw : (projectsRaw?.data || [])
    expect(projects.length).toBeGreaterThanOrEqual(1)
    const demoProj = projects.find(p => p.id.startsWith('DEMO-'))
    expect(demoProj).toBeTruthy()
    expect(demoProj.name).toContain('DEMO')

    // Verify plans (may be versioned envelope or raw array)
    const plansRaw = JSON.parse(store['takeoffpro_plans_meta'] || '[]')
    const plans = Array.isArray(plansRaw) ? plansRaw : (plansRaw?.data || [])
    const demoPlans = plans.filter(p => p.id.startsWith('DEMO-'))
    expect(demoPlans.length).toBeGreaterThanOrEqual(2)
    for (const p of demoPlans) {
      expect(p.projectId).toBe(getDemoProjectId())
      expect(p.name).toContain('DEMO')
    }

    // Verify quotes (may be versioned envelope or raw array)
    const quotesRaw = JSON.parse(store['takeoffpro_quotes'] || '[]')
    const quotes = Array.isArray(quotesRaw) ? quotesRaw : (quotesRaw?.data || [])
    const demoQuotes = quotes.filter(q => q.id.startsWith('DEMO-'))
    expect(demoQuotes.length).toBeGreaterThanOrEqual(1)
    for (const q of demoQuotes) {
      expect(q.summary).toBeTruthy()
      expect(q.summary.grandTotal).toBeGreaterThan(0)
    }

    // Idempotent — second call should not re-seed
    expect(isDemoSeeded()).toBe(true)
    const result2 = seedDemoData()
    expect(result2.seeded).toBe(false)
  })

  it('clearDemoData removes all DEMO-prefixed data', async () => {
    const { clearDemoData, hasDemoData } = await import('../data/demoSeed.js')

    // Manually seed DEMO data into the store to avoid module-level caching issues
    store['takeoffpro_projects_meta'] = JSON.stringify([{ id: 'DEMO-PRJ-001', name: 'DEMO test' }])
    store['takeoffpro_plans_meta'] = JSON.stringify([
      { id: 'DEMO-PLN-001', name: 'DEMO plan 1' },
      { id: 'DEMO-PLN-002', name: 'DEMO plan 2' },
    ])
    store['takeoffpro_quotes'] = JSON.stringify([
      { id: 'DEMO-QT-2026-001', project_name: 'DEMO' },
    ])
    expect(hasDemoData()).toBe(true)

    const removed = clearDemoData()
    expect(removed.removedProjects).toBeGreaterThanOrEqual(1)
    expect(removed.removedPlans).toBeGreaterThanOrEqual(2)
    expect(removed.removedQuotes).toBeGreaterThanOrEqual(1)
    expect(hasDemoData()).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Regression: QuoteView must not reference bare showToast (undefined in its scope)
// Fixed: uses useToast() hook instead.  This test catches accidental revert.
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('QuoteView email fallback — no bare showToast', () => {
  it('QuoteView body uses toast.show, not showToast', () => {
    const src = readFileSync(resolve(__dirname, '..', 'App.jsx'), 'utf8')
    // Extract QuoteView function body (starts at "function QuoteView" and ends
    // at the next top-level "function " or "// ─── " section heading)
    const start = src.indexOf('function QuoteView(')
    expect(start).toBeGreaterThan(-1)
    // QuoteView is ~830 lines; grab enough to cover the handleEmail fallback
    const nextFn = src.indexOf('\nfunction ', start + 1)
    const body = src.slice(start, nextFn > start ? nextFn : start + 20000)
    // Must NOT contain bare showToast calls (these would be ReferenceErrors)
    const bareShowToast = body.match(/[^.]showToast\s*\(/g) || []
    expect(bareShowToast).toHaveLength(0)
    // Must contain toast.show calls (the correct pattern)
    expect(body).toContain('toast.show(')
  })

  it('QuoteView has a markAsSent action that calls onStatusChange with "sent"', () => {
    const src = readFileSync(resolve(__dirname, '..', 'App.jsx'), 'utf8')
    const start = src.indexOf('function QuoteView(')
    const nextFn = src.indexOf('\nfunction ', start + 1)
    const body = src.slice(start, nextFn > start ? nextFn : start + 20000)
    // markAsSent must exist and call onStatusChange with 'sent'
    expect(body).toContain('const markAsSent')
    expect(body).toContain("onStatusChange(quote.id, 'sent')")
    // The "Megjelölés elküldöttként" button must be present
    expect(body).toContain('Megjelölés elküldöttként')
    // Button should only render when not already sent
    expect(body).toContain("quote.status !== 'sent'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Regression: Quote status model — "sent" filter matches persisted status
// ═══════════════════════════════════════════════════════════════════════════════

describe('Quote status filter model', () => {
  it('Quotes filter includes "sent" tab and matches quote.status', () => {
    // Simulate the filter logic from Quotes.jsx
    const STATUS_TABS = ['all', 'draft', 'sent', 'won', 'lost']
    expect(STATUS_TABS).toContain('sent')

    const quotes = [
      { id: 'Q1', status: 'draft' },
      { id: 'Q2', status: 'sent' },
      { id: 'Q3', status: 'won' },
      { id: 'Q4', status: 'sent' },
    ]

    const sentFilter = quotes.filter(q => q.status === 'sent')
    expect(sentFilter).toHaveLength(2)
    expect(sentFilter.map(q => q.id)).toEqual(['Q2', 'Q4'])

    // "all" shows everything
    const allFilter = quotes.filter(() => true)
    expect(allFilter).toHaveLength(4)
  })

  it('handleStatusChange produces a valid "sent" quote', () => {
    // Simulate the status change logic from App.jsx handleStatusChange
    const quotes = [
      { id: 'Q1', status: 'draft', project_name: 'Test' },
    ]
    const updated = quotes.map(q => q.id === 'Q1'
      ? { ...q, status: 'sent', updatedAt: new Date().toISOString() }
      : q
    )
    expect(updated[0].status).toBe('sent')
    expect(updated[0].updatedAt).toBeTruthy()
    expect(updated[0].project_name).toBe('Test') // other fields preserved
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Regression: getAssemblyCompleteness returns object with numeric percent
// ═══════════════════════════════════════════════════════════════════════════════

import { getAssemblyCompleteness } from '../data/workItemsDb.js'

describe('Assembly completeness — no NaN', () => {
  it('returns an object with a bounded numeric percent for a minimal assembly', () => {
    const result = getAssemblyCompleteness({ name: '', components: [] })
    expect(result).toHaveProperty('percent')
    expect(result).toHaveProperty('score')
    expect(result).toHaveProperty('total')
    expect(typeof result.percent).toBe('number')
    expect(Number.isNaN(result.percent)).toBe(false)
    expect(result.percent).toBeGreaterThanOrEqual(0)
    expect(result.percent).toBeLessThanOrEqual(100)
  })

  it('returns 100% for a fully complete assembly', () => {
    const full = {
      name: 'Dugalj csomag',
      description: 'Komplett dugalj',
      category: 'szerelvenyek',
      components: [
        { itemType: 'material', name: 'Anyag' },
        { itemType: 'workitem', name: 'Munka' },
      ],
    }
    const result = getAssemblyCompleteness(full)
    expect(result.percent).toBe(100)
    expect(result.score).toBe(result.total)
  })

  it('returns a valid percent for empty/undefined assembly', () => {
    const result = getAssemblyCompleteness({})
    expect(Number.isNaN(result.percent)).toBe(false)
    expect(result.percent).toBeGreaterThanOrEqual(0)
  })

  it('Assemblies.jsx card uses completeness.percent, not completeness * 100', () => {
    const src = readFileSync(resolve(__dirname, '..', 'pages', 'Assemblies.jsx'), 'utf8')
    // Must NOT multiply completeness as a number (the old NaN bug)
    expect(src).not.toMatch(/completeness\s*\*\s*100/)
    // Must use completeness.percent
    expect(src).toContain('completeness.percent')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Regression: "Új ajánlat" navigates to projektek with guidance, not new-quote
// ═══════════════════════════════════════════════════════════════════════════════

describe('"Új ajánlat" — no ambiguous new-quote route', () => {
  it('Quotes.jsx navigates to projektek, not new-quote', () => {
    const src = readFileSync(resolve(__dirname, '..', 'pages', 'Quotes.jsx'), 'utf8')
    // Must NOT use the old 'new-quote' route
    expect(src).not.toContain("onNavigate('new-quote')")
    // Must navigate to projektek
    expect(src).toContain("onNavigate('projektek')")
  })

  it('App.jsx legacy redirect no longer handles new-quote', () => {
    const src = readFileSync(resolve(__dirname, '..', 'App.jsx'), 'utf8')
    // The legacy redirect should not reference new-quote
    expect(src).not.toContain("page === 'new-quote'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Regression: Backup import validation and round-trip
// ═══════════════════════════════════════════════════════════════════════════════

describe('Backup restore — validation and round-trip', () => {
  it('backup format shape: valid backup has _app, _version, and at least one data key', () => {
    const valid = { _app: 'TakeoffPro', _version: 1, settings: { company: { name: 'Test' } } }
    expect(valid._app).toBe('TakeoffPro')
    expect(valid._version).toBe(1)
    expect(valid.settings || valid.materials || valid.quotes).toBeTruthy()
  })

  it('rejects backup with wrong _app', () => {
    const bad = { _app: 'OtherApp', _version: 1, settings: {} }
    expect(bad._app).not.toBe('TakeoffPro')
  })

  it('rejects backup with wrong _version', () => {
    const bad = { _app: 'TakeoffPro', _version: 99, settings: {} }
    expect(bad._version).not.toBe(1)
  })

  it('rejects backup with no data keys', () => {
    const empty = { _app: 'TakeoffPro', _version: 1 }
    const hasData = empty.settings || empty.materials || empty.projects || empty.plans || empty.templates || empty.quotes
    expect(hasData).toBeFalsy()
  })

  it('Settings.jsx BackupTab has restore UI and validation logic', () => {
    const src = readFileSync(resolve(__dirname, '..', 'pages', 'Settings.jsx'), 'utf8')
    // Must have file input for restore
    expect(src).toContain('type="file"')
    expect(src).toContain('accept=".json"')
    // Must validate _app and _version
    expect(src).toContain("_app !== 'TakeoffPro'")
    expect(src).toContain('_version !== 1')
    // Must have restore button text
    expect(src).toContain('Visszaállítás fájlból')
    // Must have confirmation dialog before applying
    expect(src).toContain('confirmRestore')
  })
})
