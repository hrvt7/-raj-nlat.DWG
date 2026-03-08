/**
 * Smoke Test Suite — Core Flow Regression Tests
 *
 * Covers the 5 most critical pure business logic paths:
 * 1. planMetaInference — Hungarian filename parsing
 * 2. computePricing — quote pricing engine
 * 3. Merge settings fallback — nested settings resolution
 * 4. Project delete fallback — orphan plan → fallback project
 * 5. saveQuoteRemote payload — buildQuoteRow field mapping
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
