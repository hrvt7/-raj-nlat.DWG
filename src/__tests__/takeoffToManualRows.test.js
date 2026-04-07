// ─── takeoffToManualRows — Unit Tests ────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { takeoffToManualRows } from '../utils/takeoffToManualRows.js'

const ASSEMBLIES = [
  { id: 'asm-light', name: 'Világítás szerelvény' },
  { id: 'asm-socket', name: 'Dugalj komplett' },
  { id: 'asm-switch', label: 'Kapcsoló' },
]

describe('takeoffToManualRows', () => {
  it('converts takeoff rows to manual row seeds', () => {
    const takeoffRows = [
      { asmId: 'asm-light', qty: 5 },
      { asmId: 'asm-socket', qty: 10 },
    ]
    const rows = takeoffToManualRows(takeoffRows, ASSEMBLIES)
    expect(rows).toHaveLength(2)

    expect(rows[0].name).toBe('Világítás szerelvény')
    expect(rows[0].qty).toBe(5)
    expect(rows[0].origin).toBe('takeoff_manual_priced')
    expect(rows[0].type).toBe('material') // V1 default
    expect(rows[0].unit).toBe('db')
    expect(rows[0].unitPrice).toBe(0)
    expect(rows[0].laborHours).toBe(0)
    expect(rows[0].sourceRefId).toBe('asm-light')
    expect(rows[0].id).toMatch(/^mr-/)

    expect(rows[1].name).toBe('Dugalj komplett')
    expect(rows[1].qty).toBe(10)
    expect(rows[1].sourceRefId).toBe('asm-socket')
  })

  it('resolves assembly name via label fallback', () => {
    const rows = takeoffToManualRows([{ asmId: 'asm-switch', qty: 3 }], ASSEMBLIES)
    expect(rows[0].name).toBe('Kapcsoló')
  })

  it('falls back to asmId when assembly not found', () => {
    const rows = takeoffToManualRows([{ asmId: 'asm-unknown', qty: 1 }], ASSEMBLIES)
    expect(rows[0].name).toBe('asm-unknown')
  })

  it('resolves qty from wallSplits when present', () => {
    const rows = takeoffToManualRows([{
      asmId: 'asm-light', qty: 999,
      wallSplits: { brick: 3, drywall: 2, concrete: 1 },
    }], ASSEMBLIES)
    expect(rows[0].qty).toBe(6) // sum of wallSplits, not row.qty
  })

  it('passes plan metadata to seeds', () => {
    const rows = takeoffToManualRows(
      [{ asmId: 'asm-light', qty: 1 }],
      ASSEMBLIES,
      { systemType: 'erosaram', floor: 'F1', floorLabel: 'Földszint' },
    )
    expect(rows[0].sourcePlanSystemType).toBe('erosaram')
    expect(rows[0].sourcePlanFloor).toBe('F1')
    expect(rows[0].sourcePlanFloorLabel).toBe('Földszint')
  })

  it('returns empty array for null/empty takeoffRows', () => {
    expect(takeoffToManualRows(null, ASSEMBLIES)).toEqual([])
    expect(takeoffToManualRows([], ASSEMBLIES)).toEqual([])
  })

  it('generates unique IDs for each row', () => {
    const rows = takeoffToManualRows([
      { asmId: 'asm-light', qty: 1 },
      { asmId: 'asm-socket', qty: 1 },
    ], ASSEMBLIES)
    expect(rows[0].id).not.toBe(rows[1].id)
  })
})
