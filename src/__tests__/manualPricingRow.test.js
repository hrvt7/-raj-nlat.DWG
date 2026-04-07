// ─── Manual Pricing Row — Unit Tests ──────────────────────────────────────────
// Phase 2A foundation: row factory, derived computation, materialization, validation.

import { describe, it, expect } from 'vitest'
import {
  createManualRow,
  rowMaterialCost,
  rowLaborCost,
  rowLineTotal,
  computeManualTotals,
  materializeManualRowsToItems,
  validateManualRow,
} from '../utils/manualPricingRow.js'
import { createQuote } from '../utils/createQuote.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 1. createManualRow
// ═══════════════════════════════════════════════════════════════════════════════

describe('createManualRow', () => {
  it('creates a row with sensible defaults', () => {
    const row = createManualRow()
    expect(row.id).toMatch(/^mr-/)
    expect(row.origin).toBe('manual_direct')
    expect(row.type).toBe('material')
    expect(row.name).toBe('')
    expect(row.qty).toBe(1)
    expect(row.unit).toBe('db')
    expect(row.unitPrice).toBe(0)
    expect(row.laborHours).toBe(0)
    expect(row.group).toBe('')
    expect(row.notes).toBe('')
    expect(row.sourceRefId).toBeNull()
    expect(row.sourcePlanSystemType).toBe('general')
    expect(row.sourcePlanFloor).toBeNull()
    expect(row.sourcePlanFloorLabel).toBeNull()
  })

  it('accepts overrides', () => {
    const row = createManualRow({
      id: 'custom-id',
      origin: 'takeoff_manual_priced',
      type: 'labor',
      name: 'Konnektorozás',
      qty: 5,
      unit: 'db',
      unitPrice: 2500,
      laborHours: 0.5,
      group: 'Erősáram',
      notes: 'Megjegyzés',
      sourceRefId: 'asm-001',
    })
    expect(row.id).toBe('custom-id')
    expect(row.origin).toBe('takeoff_manual_priced')
    expect(row.type).toBe('labor')
    expect(row.name).toBe('Konnektorozás')
    expect(row.qty).toBe(5)
    expect(row.laborHours).toBe(0.5)
    expect(row.group).toBe('Erősáram')
    expect(row.sourceRefId).toBe('asm-001')
  })

  it('generates unique IDs', () => {
    const ids = new Set()
    for (let i = 0; i < 50; i++) ids.add(createManualRow().id)
    expect(ids.size).toBe(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Derived field computation
// ═══════════════════════════════════════════════════════════════════════════════

describe('rowMaterialCost', () => {
  it('computes qty × unitPrice for material rows', () => {
    expect(rowMaterialCost({ type: 'material', qty: 10, unitPrice: 500 })).toBe(5000)
  })

  it('returns 0 for labor rows', () => {
    expect(rowMaterialCost({ type: 'labor', qty: 10, unitPrice: 500 })).toBe(0)
  })

  it('rounds to integer', () => {
    expect(rowMaterialCost({ type: 'material', qty: 3, unitPrice: 333 })).toBe(999)
  })

  it('handles zero/null gracefully', () => {
    expect(rowMaterialCost({ type: 'material', qty: 0, unitPrice: 500 })).toBe(0)
    expect(rowMaterialCost({ type: 'material', qty: null, unitPrice: 500 })).toBe(0)
  })
})

describe('rowLaborCost', () => {
  it('computes laborHours × hourlyRate for labor rows', () => {
    expect(rowLaborCost({ type: 'labor', laborHours: 2 }, 8500)).toBe(17000)
  })

  it('returns 0 for material rows', () => {
    expect(rowLaborCost({ type: 'material', laborHours: 2 }, 8500)).toBe(0)
  })

  it('handles fractional hours', () => {
    expect(rowLaborCost({ type: 'labor', laborHours: 0.5 }, 8500)).toBe(4250)
  })
})

describe('rowLineTotal', () => {
  it('material: qty × unitPrice', () => {
    expect(rowLineTotal({ type: 'material', qty: 10, unitPrice: 500 }, 8500)).toBe(5000)
  })

  it('labor: laborHours × hourlyRate', () => {
    expect(rowLineTotal({ type: 'labor', laborHours: 2 }, 8500)).toBe(17000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Aggregate totals
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeManualTotals', () => {
  const rows = [
    createManualRow({ type: 'material', name: 'Kábel', qty: 100, unitPrice: 300 }),
    createManualRow({ type: 'material', name: 'Csatlakozó', qty: 20, unitPrice: 800 }),
    createManualRow({ type: 'labor', name: 'Szerelés', laborHours: 4 }),
    createManualRow({ type: 'labor', name: 'Bekötés', laborHours: 1.5 }),
  ]

  it('sums material costs', () => {
    const totals = computeManualTotals(rows, 8500)
    expect(totals.totalMaterials).toBe(30000 + 16000) // 100×300 + 20×800
  })

  it('sums labor costs', () => {
    const totals = computeManualTotals(rows, 8500)
    expect(totals.totalLabor).toBe(4 * 8500 + 1.5 * 8500) // 34000 + 12750
  })

  it('sums labor hours', () => {
    const totals = computeManualTotals(rows, 8500)
    expect(totals.totalHours).toBe(5.5)
  })

  it('returns zeros for empty array', () => {
    const totals = computeManualTotals([], 8500)
    expect(totals.totalMaterials).toBe(0)
    expect(totals.totalLabor).toBe(0)
    expect(totals.totalHours).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Materialization: manualRows → items[]
// ═══════════════════════════════════════════════════════════════════════════════

describe('materializeManualRowsToItems', () => {
  it('produces items[] with correct shape', () => {
    const rows = [
      createManualRow({ name: 'Kábel NYM 3×1.5', type: 'material', qty: 100, unit: 'm', unitPrice: 300 }),
      createManualRow({ name: 'Bekötés', type: 'labor', laborHours: 2 }),
    ]
    const items = materializeManualRowsToItems(rows, 8500)

    expect(items).toHaveLength(2)

    // Material item
    const mat = items[0]
    expect(mat.name).toBe('Kábel NYM 3×1.5')
    expect(mat.qty).toBe(100)
    expect(mat.unit).toBe('m')
    expect(mat.type).toBe('material')
    expect(mat.unitPrice).toBe(300)
    expect(mat.hours).toBe(0)
    expect(mat.materialCost).toBe(30000)
    expect(mat._fromManual).toBe(true)
    expect(mat._manualRowId).toMatch(/^mr-/)
    expect(mat.systemType).toBe('general')
    expect(mat.sourcePlanSystemType).toBe('general')

    // Labor item
    const lab = items[1]
    expect(lab.name).toBe('Bekötés')
    expect(lab.type).toBe('labor')
    expect(lab.unitPrice).toBe(8500) // hourlyRate
    expect(lab.hours).toBe(2)
    expect(lab.materialCost).toBe(0)
    expect(lab._fromManual).toBe(true)
  })

  it('filters out rows with empty name', () => {
    const rows = [
      createManualRow({ name: '', type: 'material', qty: 10, unitPrice: 100 }),
      createManualRow({ name: 'Valami', type: 'material', qty: 5, unitPrice: 200 }),
    ]
    const items = materializeManualRowsToItems(rows, 8500)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Valami')
  })

  it('uses sourceRefId as code when available', () => {
    const row = createManualRow({ name: 'X', sourceRefId: 'asm-123' })
    const items = materializeManualRowsToItems([row], 8500)
    expect(items[0].code).toBe('asm-123')
  })

  it('falls back to row.id as code', () => {
    const row = createManualRow({ name: 'X' })
    const items = materializeManualRowsToItems([row], 8500)
    expect(items[0].code).toBe(row.id)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateManualRow', () => {
  it('returns empty array for valid row', () => {
    const row = createManualRow({ name: 'Kábel', qty: 10, unitPrice: 300 })
    expect(validateManualRow(row)).toEqual([])
  })

  it('requires name', () => {
    const row = createManualRow({ name: '' })
    const errors = validateManualRow(row)
    expect(errors).toContain('Megnevezés kötelező')
  })

  it('rejects negative qty', () => {
    const row = createManualRow({ name: 'X', qty: -1 })
    expect(validateManualRow(row)).toContain('Mennyiség nem lehet negatív')
  })

  it('rejects negative unitPrice', () => {
    const row = createManualRow({ name: 'X', unitPrice: -100 })
    expect(validateManualRow(row)).toContain('Egységár nem lehet negatív')
  })

  it('rejects negative laborHours', () => {
    const row = createManualRow({ name: 'X', laborHours: -0.5 })
    expect(validateManualRow(row)).toContain('Munkaóra nem lehet negatív')
  })

  it('allows zero values', () => {
    const row = createManualRow({ name: 'X', qty: 0, unitPrice: 0, laborHours: 0 })
    expect(validateManualRow(row)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. createQuote backward compatibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('createQuote pricingMode', () => {
  it('defaults pricingMode to assembly for existing callers', () => {
    const q = createQuote({
      displayName: 'Test', outputMode: 'combined',
      pricing: { total: 1000, materialCost: 500, laborCost: 500, laborHours: 1 },
      pricingParams: { hourlyRate: 8500, markupPct: 0.15, markupType: 'markup' },
      settings: {},
    })
    expect(q.pricingMode).toBe('assembly')
    expect(q.manualRows).toBeUndefined()
  })

  it('stores pricingMode and manualRows for manual quotes', () => {
    const rows = [createManualRow({ name: 'Kábel', qty: 10, unitPrice: 300, type: 'material' })]
    const q = createQuote({
      displayName: 'Manual Test', outputMode: 'combined',
      pricing: { total: 3000, materialCost: 3000, laborCost: 0, laborHours: 0 },
      pricingParams: { hourlyRate: 8500, markupPct: 0, markupType: 'markup' },
      settings: {},
      pricingMode: 'manual',
      manualRows: rows,
    })
    expect(q.pricingMode).toBe('manual')
    expect(q.manualRows).toHaveLength(1)
    expect(q.manualRows[0].name).toBe('Kábel')
  })

  it('does not store manualRows if pricingMode is assembly', () => {
    const q = createQuote({
      displayName: 'Asm Test', outputMode: 'combined',
      pricing: { total: 1000, materialCost: 500, laborCost: 500, laborHours: 1 },
      pricingParams: { hourlyRate: 8500, markupPct: 0.15, markupType: 'markup' },
      settings: {},
      pricingMode: 'assembly',
      manualRows: [createManualRow({ name: 'Ignored' })],
    })
    expect(q.pricingMode).toBe('assembly')
    expect(q.manualRows).toBeUndefined()
  })
})
