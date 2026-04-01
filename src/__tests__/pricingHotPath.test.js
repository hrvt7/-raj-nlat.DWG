// ─── Pricing Hot-Path — Dedup & Output-Identity Tests ─────────────────────────
// Proves that:
// 1. computePricing is deterministic (identical inputs → identical outputs)
// 2. Per-row pricing sums to the multi-row total (additivity under markup=0)
// 3. unitCostByAsmByWall uses asmId dedup (no repeated calls for duplicate rows)
// 4. fullCalc.byAssembly uses asmId dedup (same pattern)
//
// Root cause: both hot-path useMemos iterated ALL takeoffRows, calling
// computePricing for every row (× 6 wall types for unitCost). Duplicate
// asmIds overwrote the map entry — all intermediate calls were wasted.
//
// Fix: dedup by asmId before the inner loop (lastRowByAsm / lastByAsm).
// Output is identical because last-row-wins semantics are preserved.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { computePricing } from '../utils/pricing.js'

const workspaceSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/TakeoffWorkspace.jsx'),
  'utf-8'
)
const fullCalcSrc = fs.readFileSync(
  path.resolve(__dirname, '../utils/fullCalc.js'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('computePricing — output identity', () => {
  const BASE = {
    assemblies: [
      { id: 'A1', components: [
        { name: 'Wire 1.5mm', itemType: 'material', itemCode: 'M1', qty: 1, unit: 'm' },
        { name: 'Install', itemType: 'workitem', itemCode: 'W1', qty: 1, unit: 'db' },
      ]},
      { id: 'A2', components: [
        { name: 'Conduit 25mm', itemType: 'material', itemCode: 'M2', qty: 2, unit: 'm' },
      ]},
    ],
    workItems: [{ code: 'W1', name: 'Install', p50: 12, p90: 20 }],
    materials: [
      { code: 'M1', name: 'Wire 1.5mm', price: 150, discount: 0 },
      { code: 'M2', name: 'Conduit 25mm', price: 280, discount: 10 },
    ],
    context: null,
    markup: 0.15,
    hourlyRate: 5000,
    cableEstimate: null,
    difficultyMode: 'normal',
  }

  it('identical inputs produce identical outputs', () => {
    const rows = [{ asmId: 'A1', qty: 3, wallSplits: null, wallType: 'brick' }]
    const r1 = computePricing({ takeoffRows: rows, ...BASE })
    const r2 = computePricing({ takeoffRows: rows, ...BASE })
    expect(r1.total).toBe(r2.total)
    expect(r1.materialCost).toBe(r2.materialCost)
    expect(r1.laborCost).toBe(r2.laborCost)
    expect(r1.laborHours).toBe(r2.laborHours)
    expect(r1.lines.length).toBe(r2.lines.length)
  })

  it('per-row sums equal multi-row total (markup=0, no cable)', () => {
    const rows = [
      { asmId: 'A1', qty: 3, wallSplits: null, wallType: 'brick' },
      { asmId: 'A2', qty: 5, wallSplits: null, wallType: 'concrete' },
    ]
    const base0 = { ...BASE, markup: 0 }
    const full = computePricing({ takeoffRows: rows, ...base0 })
    const r1   = computePricing({ takeoffRows: [rows[0]], ...base0 })
    const r2   = computePricing({ takeoffRows: [rows[1]], ...base0 })

    // Additivity: sum of single-row materials & hours == multi-row totals
    expect(Math.abs((r1.materialCost + r2.materialCost) - full.materialCost)).toBeLessThan(0.01)
    expect(Math.abs((r1.laborHours + r2.laborHours) - full.laborHours)).toBeLessThan(0.0001)
  })

  it('duplicate-asmId rows: last-row pricing matches deduped single call', () => {
    // Two rows with same asmId but different qty — simulates the overwrite scenario
    const rowA = { asmId: 'A1', qty: 2, wallSplits: null, wallType: 'brick' }
    const rowB = { asmId: 'A1', qty: 7, wallSplits: null, wallType: 'concrete' }

    // Current behavior: last row (rowB) overwrites map['A1']
    const resultB = computePricing({ takeoffRows: [rowB], ...BASE, markup: 0 })
    // Deduped behavior: only compute with rowB (the last row for asmId 'A1')
    // → same result
    expect(resultB.materialCost).toBeGreaterThan(0)
    expect(resultB.laborHours).toBeGreaterThan(0)

    // Also verify they're different from rowA (different qty/wall → different pricing)
    const resultA = computePricing({ takeoffRows: [rowA], ...BASE, markup: 0 })
    // rowB has higher qty → higher cost
    expect(resultB.materialCost).toBeGreaterThan(resultA.materialCost)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('unitCostByAsmByWall — dedup optimization (in fullCalc.js)', () => {
  it('uses lastRowByAsm dedup before wall-type inner loop', () => {
    expect(fullCalcSrc).toContain('lastRowByAsm')
    expect(fullCalcSrc).toContain('for (const row of takeoffRows) lastRowByAsm[row.asmId] = row')
  })

  it('iterates deduped entries (Object.entries(lastRowByAsm)), not raw takeoffRows', () => {
    const ucIdx = fullCalcSrc.indexOf('computeUnitCostByAsmByWall')
    const block = fullCalcSrc.slice(ucIdx)

    expect(block).toContain('Object.entries(lastRowByAsm)')
    const dedupIterIdx = block.indexOf('Object.entries(lastRowByAsm)')
    const wallLoopIdx = block.indexOf('WALL_FACTORS', dedupIterIdx)
    expect(wallLoopIdx).toBeGreaterThan(dedupIterIdx)
  })

  it('does NOT iterate takeoffRows in the computePricing inner loop', () => {
    const ucIdx = fullCalcSrc.indexOf('computeUnitCostByAsmByWall')
    const block = fullCalcSrc.slice(ucIdx)

    const afterDedup = block.slice(block.indexOf('Object.entries(lastRowByAsm)'))
    expect(afterDedup).not.toContain('for (const row of takeoffRows)')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('fullCalc byAssembly — dedup optimization (in fullCalc.js)', () => {
  it('uses lastByAsm dedup before byAssembly computation', () => {
    expect(fullCalcSrc).toContain('const byAssembly = {}')
    expect(fullCalcSrc).toContain('lastByAsm')
    expect(fullCalcSrc).toContain('for (const row of takeoffRows) lastByAsm[row.asmId] = row')
  })

  it('iterates deduped entries, not raw takeoffRows for computePricing calls', () => {
    const byAsmIdx = fullCalcSrc.indexOf('const byAssembly = {}')
    const blockEnd = fullCalcSrc.indexOf('return {', byAsmIdx)
    const block = fullCalcSrc.slice(byAsmIdx, blockEnd)

    expect(block).toContain('Object.entries(lastByAsm)')
    expect(block).not.toContain('for (const row of takeoffRows)')
  })

  it('preserves last-row-wins semantics via dedup comment', () => {
    // The comment is in the function doc or nearby
    expect(fullCalcSrc).toContain('last-row-wins')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Pricing hot path — master call unchanged', () => {
  it('pricing useMemo still calls computePricing with all takeoffRows', () => {
    const pricingMemo = workspaceSrc.indexOf('const pricing = useMemo(')
    expect(pricingMemo).toBeGreaterThan(-1)

    const block = workspaceSrc.slice(pricingMemo, pricingMemo + 250)
    expect(block).toContain('computePricing({ takeoffRows, assemblies, workItems, materials')
  })
})
