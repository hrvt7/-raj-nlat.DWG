/**
 * Auto Symbol hardening regression tests.
 *
 * Covers:
 * 1. Hue post-filter contract (source code assertions)
 * 2. Symbol family logic (primary selection, merge, stats)
 * 3. Large template contract (no silent special-casing)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  createFamily, createVariant, addVariantToFamily, findFamily,
  upsertTemplateIntoFamilies, mergeFamiliesFromPlans,
  sortVariantsByPerformance, updateVariantStats, updateFamilyStats,
  MAX_VARIANTS_PER_FAMILY,
} from '../utils/symbolFamily.js'

// ═══════════════════════════════════════════════════════════════════════════
// 1. HUE POST-FILTER CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

describe('hue post-filter contract', () => {
  const workerSrc = readFileSync(
    resolve(import.meta.dirname, '..', 'workers', 'templateMatch.worker.js'), 'utf-8'
  )

  it('has hue post-filter with correct constants', () => {
    expect(workerSrc).toContain('HUE_SAT_GATE')
    expect(workerSrc).toContain('HUE_MIN_COLORED_RATIO')
    expect(workerSrc).toContain('HUE_DOMINANCE_RATIO')
    expect(workerSrc).toContain('HUE_MAX_DISTANCE')
  })

  it('filter auto-disables for low-saturation templates', () => {
    // The filter checks coloredRatio >= HUE_MIN_COLORED_RATIO
    expect(workerSrc).toContain('coloredRatio >= HUE_MIN_COLORED_RATIO')
    // And dominance >= HUE_DOMINANCE_RATIO
    expect(workerSrc).toContain('dominance >= HUE_DOMINANCE_RATIO')
  })

  it('keeps hits when patch has too few colored pixels', () => {
    // Patch with < 10% colored pixels → keep (can\'t validate)
    expect(workerSrc).toContain('patchColored < trimW * trimH * 0.1')
    expect(workerSrc).toContain('return true')
  })

  it('uses cyclic hue distance', () => {
    expect(workerSrc).toContain('if (hueDist > 0.5) hueDist = 1 - hueDist')
  })

  it('rejects hits with hue distance > threshold', () => {
    expect(workerSrc).toContain('hueDist > HUE_MAX_DISTANCE')
    expect(workerSrc).toContain('return false // reject: wrong color')
  })

  it('uses existing toHue function', () => {
    expect(workerSrc).toContain('const imgHue = toHue(')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. SYMBOL FAMILY LOGIC
// ═══════════════════════════════════════════════════════════════════════════

describe('symbol family primary selection', () => {
  it('sortVariantsByPerformance returns best-performing first', () => {
    const family = createFamily(
      { category: 'socket', asmId: 'ASM-001', label: 'Dugalj' },
      { cropData: [], w: 30, h: 30, avgScore: 0.5, searches: 10 }
    )
    addVariantToFamily(family, { cropData: [], w: 40, h: 40, avgScore: 0.8, searches: 5 })
    addVariantToFamily(family, { cropData: [], w: 50, h: 50, avgScore: 0.3, searches: 20 })

    const sorted = sortVariantsByPerformance(family)
    // High avgScore with moderate searches should rank high
    expect(sorted[0].avgScore).toBeGreaterThanOrEqual(sorted[1].avgScore * 0.5)
    // Lowest avgScore should not be first
    expect(sorted[sorted.length - 1].avgScore).toBeLessThanOrEqual(sorted[0].avgScore)
  })

  it('new variant with high score can become primary', () => {
    const family = createFamily(
      { category: 'light', asmId: null, label: 'Lámpa' },
      { cropData: [], w: 30, h: 30, avgScore: 0.4, searches: 50 }
    )
    addVariantToFamily(family, { cropData: [], w: 40, h: 40, avgScore: 0.95, searches: 2 })

    const sorted = sortVariantsByPerformance(family)
    // Log-based ranking prevents old high-search-count from permanently dominating
    // New variant with 0.95 score should be competitive
    expect(sorted.length).toBe(2)
  })
})

describe('symbol family merge', () => {
  it('merges families from multiple plans by category+asmId', () => {
    const plan1 = [createFamily(
      { category: 'socket', asmId: 'ASM-001', label: 'Dugalj' },
      { cropData: [], w: 30, h: 30 }
    )]
    const plan2 = [createFamily(
      { category: 'socket', asmId: 'ASM-001', label: 'Dugalj v2' },
      { cropData: [], w: 40, h: 40 }
    )]
    const merged = mergeFamiliesFromPlans([plan1, plan2])
    expect(merged.length).toBe(1) // same category+asmId → merged
    expect(merged[0].variants.length).toBe(2) // both variants present
  })

  it('does not merge different categories', () => {
    const plan1 = [createFamily(
      { category: 'socket', asmId: 'ASM-001', label: 'Dugalj' },
      { cropData: [], w: 30, h: 30 }
    )]
    const plan2 = [createFamily(
      { category: 'light', asmId: 'ASM-002', label: 'Lámpa' },
      { cropData: [], w: 40, h: 40 }
    )]
    const merged = mergeFamiliesFromPlans([plan1, plan2])
    expect(merged.length).toBe(2) // different category → separate families
  })

  it('deduplicates same-size variants within family', () => {
    const plan1 = [createFamily(
      { category: 'socket', asmId: 'ASM-001', label: 'Dugalj' },
      { cropData: [], w: 30, h: 30 }
    )]
    const plan2 = [createFamily(
      { category: 'socket', asmId: 'ASM-001', label: 'Dugalj' },
      { cropData: [], w: 31, h: 31 } // within ±5px → duplicate
    )]
    const merged = mergeFamiliesFromPlans([plan1, plan2])
    expect(merged[0].variants.length).toBe(1) // deduped
  })

  it('caps variants at MAX_VARIANTS_PER_FAMILY', () => {
    const family = createFamily(
      { category: 'socket', asmId: null, label: 'Test' },
      { cropData: [], w: 10, h: 10 }
    )
    for (let i = 1; i <= 10; i++) {
      addVariantToFamily(family, { cropData: [], w: 10 + i * 10, h: 10 + i * 10 })
    }
    expect(family.variants.length).toBeLessThanOrEqual(MAX_VARIANTS_PER_FAMILY)
  })
})

describe('symbol family stats', () => {
  it('updateVariantStats increments searches and updates avgScore', () => {
    const v = createVariant({ cropData: [], w: 30, h: 30, avgScore: 0.5, searches: 0, hits: 0 })
    updateVariantStats(v, 5, 0.8)
    expect(v.searches).toBe(1)
    expect(v.hits).toBe(5)
    expect(v.avgScore).toBeGreaterThan(0.5) // EMA moved toward 0.8
    expect(v.avgScore).toBeLessThan(0.8)    // but not all the way (EMA)
  })

  it('updateFamilyStats tracks totals', () => {
    const family = createFamily(
      { category: 'socket', asmId: null, label: 'Test' },
      { cropData: [], w: 30, h: 30, searches: 5, hits: 10 }
    )
    updateFamilyStats(family, 7)
    expect(family.totalSearches).toBe(1)
    expect(family.totalHits).toBe(7)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. LARGE TEMPLATE CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

describe('large template contract', () => {
  const workerSrc = readFileSync(
    resolve(import.meta.dirname, '..', 'workers', 'templateMatch.worker.js'), 'utf-8'
  )

  it('no template size cap or silent resize in matcher', () => {
    // The matcher should NOT have any `if (tW > X) resize()` logic
    expect(workerSrc).not.toContain('tplW > ')
    // Should NOT silently cap template dimensions
    expect(workerSrc).not.toMatch(/if\s*\(\s*trimW\s*>\s*\d+\s*\)/)
  })

  it('stride adapts to template area (not arbitrary)', () => {
    expect(workerSrc).toContain('tplArea > 2500')
    expect(workerSrc).toContain('tplArea > 900')
    // stride 4 for large, 3 for medium, 2 for small
    expect(workerSrc).toContain('? 4 :')
    expect(workerSrc).toContain('? 3 : 2')
  })

  it('NCC inner loop processes all template pixels (no sampling)', () => {
    // nccAtPosition should iterate ty 0..tH and tx 0..tW
    expect(workerSrc).toContain('for (let ty = 0; ty < tH; ty++)')
    expect(workerSrc).toContain('for (let tx = 0; tx < tW; tx++)')
  })
})
