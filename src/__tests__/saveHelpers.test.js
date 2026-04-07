// ─── saveHelpers — unit tests ────────────────────────────────────────────────
// Covers: buildSnapshotItems shape fidelity, trainMemoryFromSave gate logic.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock recognitionMemory before importing saveHelpers ─────────────────────
vi.mock('../data/recognitionMemory.js', () => ({
  recordConfirmation: vi.fn(),
}))
vi.mock('../utils/reviewState.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // Keep real shouldTrainMemory and getEffectiveAsmId so gate logic is tested faithfully
  }
})

import { buildSnapshotItems, trainMemoryFromSave } from '../utils/saveHelpers.js'
import { recordConfirmation } from '../data/recognitionMemory.js'

// ═════════════════════════════════════════════════════════════════════════════
// 1. buildSnapshotItems
// ═════════════════════════════════════════════════════════════════════════════

describe('buildSnapshotItems', () => {
  const pricingLines = [
    { name: 'Lámpa', code: 'L1', qty: 4, unit: 'db', type: 'assembly', systemType: 'erosaram', materialCost: 2000, hours: 1 },
    { name: 'Kapcsoló', qty: 2, unit: 'db', type: 'work', materialCost: 800, hours: 0.5 },
  ]
  const measurementItems = [
    { label: 'Kábeltálca', totalMeters: 12.345, matchedAsmId: 'CT1', isAutoPriced: true, pricePerUnit: 500, cost: 6000 },
    { label: 'Kézi mérés', totalMeters: 5.1, key: 'M1', isAutoPriced: false, pricePerUnit: 1000, cost: 5000 },
    { label: 'Nulla', totalMeters: 0, key: 'M2', isAutoPriced: true, pricePerUnit: 100, cost: 0 },
  ]

  it('maps pricing lines with correct shape', () => {
    const items = buildSnapshotItems(pricingLines, [], 'erosaram', 'F1', 'Földszint')
    expect(items).toHaveLength(2)

    const lamp = items[0]
    expect(lamp.name).toBe('Lámpa')
    expect(lamp.code).toBe('L1')
    expect(lamp.qty).toBe(4)
    expect(lamp.unit).toBe('db')
    expect(lamp.type).toBe('assembly')
    expect(lamp.systemType).toBe('erosaram')
    expect(lamp.sourcePlanSystemType).toBe('erosaram')
    expect(lamp.sourcePlanFloor).toBe('F1')
    expect(lamp.sourcePlanFloorLabel).toBe('Földszint')
    expect(lamp.unitPrice).toBe(500) // 2000/4
    expect(lamp.hours).toBe(1)
    expect(lamp.materialCost).toBe(2000)
  })

  it('defaults code to empty string when missing', () => {
    const items = buildSnapshotItems(pricingLines, [], 'general', null, null)
    expect(items[1].code).toBe('')
  })

  it('defaults systemType to general when missing', () => {
    const lines = [{ name: 'X', qty: 1, unit: 'db', type: 'work', materialCost: 100, hours: 0 }]
    const items = buildSnapshotItems(lines, [], 'general', null, null)
    expect(items[0].systemType).toBe('general')
  })

  it('computes unitPrice as 0 when qty is 0', () => {
    const lines = [{ name: 'Zero', qty: 0, unit: 'db', type: 'work', materialCost: 100, hours: 0 }]
    const items = buildSnapshotItems(lines, [], 'general', null, null)
    expect(items[0].unitPrice).toBe(0)
  })

  it('includes measurement items with _fromMeasurement flag', () => {
    const items = buildSnapshotItems([], measurementItems, 'general', null, null)
    // 3rd measurement has totalMeters=0, should be skipped
    expect(items).toHaveLength(2)

    const tray = items[0]
    expect(tray.name).toBe('Kábeltálca') // isAutoPriced=true → no suffix
    expect(tray.code).toBe('CT1')
    expect(tray.qty).toBe(12.3) // Math.round(12.345*10)/10
    expect(tray.unit).toBe('m')
    expect(tray.type).toBe('material')
    expect(tray.systemType).toBe('general')
    expect(tray.unitPrice).toBe(500)
    expect(tray.hours).toBe(0)
    expect(tray.materialCost).toBe(6000)
    expect(tray._fromMeasurement).toBe(true)
  })

  it('appends (kézi ár) suffix for non-auto-priced measurements', () => {
    const items = buildSnapshotItems([], measurementItems, 'general', null, null)
    expect(items[1].name).toBe('Kézi mérés (kézi ár)')
  })

  it('uses mi.key when matchedAsmId is missing', () => {
    const items = buildSnapshotItems([], measurementItems, 'general', null, null)
    expect(items[1].code).toBe('M1')
  })

  it('skips measurement items with totalMeters <= 0', () => {
    const items = buildSnapshotItems([], [
      { label: 'A', totalMeters: -1, key: 'X', isAutoPriced: true, pricePerUnit: 0, cost: 0 },
      { label: 'B', totalMeters: 0, key: 'Y', isAutoPriced: true, pricePerUnit: 0, cost: 0 },
    ], 'general', null, null)
    expect(items).toHaveLength(0)
  })

  it('handles null/undefined pricingLines gracefully', () => {
    const items = buildSnapshotItems(null, [], 'general', null, null)
    expect(items).toEqual([])
    const items2 = buildSnapshotItems(undefined, [], 'general', null, null)
    expect(items2).toEqual([])
  })

  it('passes plan meta fields to measurement items too', () => {
    const items = buildSnapshotItems([], measurementItems, 'tuzjelzo', 'F2', '2. emelet')
    expect(items[0].sourcePlanSystemType).toBe('tuzjelzo')
    expect(items[0].sourcePlanFloor).toBe('F2')
    expect(items[0].sourcePlanFloorLabel).toBe('2. emelet')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. trainMemoryFromSave
// ═════════════════════════════════════════════════════════════════════════════

describe('trainMemoryFromSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when memProjectId is falsy', () => {
    trainMemoryFromSave([{ blockName: 'B', reviewStatus: 'accepted', confidence: 0.9, asmId: 'A1' }], {}, null, new Map())
    expect(recordConfirmation).not.toHaveBeenCalled()

    trainMemoryFromSave([{ blockName: 'B', reviewStatus: 'accepted', confidence: 0.9, asmId: 'A1' }], {}, undefined, new Map())
    expect(recordConfirmation).not.toHaveBeenCalled()

    trainMemoryFromSave([{ blockName: 'B', reviewStatus: 'accepted', confidence: 0.9, asmId: 'A1' }], {}, '', new Map())
    expect(recordConfirmation).not.toHaveBeenCalled()
  })

  it('skips items with reviewStatus === excluded', () => {
    const items = [
      { blockName: 'B1', reviewStatus: 'excluded', confidence: 0.95, asmId: 'A1' },
    ]
    trainMemoryFromSave(items, {}, 'proj1', new Map())
    expect(recordConfirmation).not.toHaveBeenCalled()
  })

  it('calls recordConfirmation for confirmed high-confidence items', () => {
    const evidence = new Map([['B1', { source: 'dxf' }]])
    const items = [
      { blockName: 'B1', reviewStatus: 'confirmed', confidence: 0.95, asmId: 'A1' },
    ]
    trainMemoryFromSave(items, {}, 'proj1', evidence)
    expect(recordConfirmation).toHaveBeenCalledWith('B1', 'A1', 'proj1', 'save_plan', { source: 'dxf' })
  })

  it('calls recordConfirmation for auto_high items', () => {
    const items = [
      { blockName: 'B2', reviewStatus: 'auto_high', confidence: 0.92, asmId: 'A2' },
    ]
    trainMemoryFromSave(items, {}, 'proj1', new Map())
    expect(recordConfirmation).toHaveBeenCalledWith('B2', 'A2', 'proj1', 'save_plan', undefined)
  })

  it('does NOT train auto_low items (shouldTrainMemory gate)', () => {
    const items = [
      { blockName: 'B3', reviewStatus: 'auto_low', confidence: 0.5, asmId: 'A3' },
    ]
    trainMemoryFromSave(items, {}, 'proj1', new Map())
    expect(recordConfirmation).not.toHaveBeenCalled()
  })

  it('respects asmOverrides over item.asmId', () => {
    const overrides = { B1: 'OVERRIDE_ASM' }
    const items = [
      { blockName: 'B1', reviewStatus: 'confirmed', confidence: 0.95, asmId: 'A1' },
    ]
    trainMemoryFromSave(items, overrides, 'proj1', new Map())
    expect(recordConfirmation).toHaveBeenCalledWith('B1', 'OVERRIDE_ASM', 'proj1', 'save_plan', undefined)
  })
})
