// ─── Match Quality + Scope Polish — Regression Tests ──────────────────────────
// Covers:
//   - False positive reduction: min seed area, dedup, caps
//   - Scope differences: current_page vs whole_plan confidence penalty
//   - Relevant recipe recommendation logic
//   - Confidence bucket calibration with modifiers
//   - Cross-recipe proximity dedup
//   - Safety limits (per-page and total)
//   - Page grouping in review
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock localStorage ─────────────────────────────────────────────────────────
const storage = {}
vi.stubGlobal('localStorage', {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, val) => { storage[key] = val },
  removeItem: (key) => { delete storage[key] },
})

// ── Mock sessionStorage ───────────────────────────────────────────────────────
const sessionStore = {}
vi.stubGlobal('sessionStorage', {
  getItem: (key) => sessionStore[key] ?? null,
  setItem: (key, val) => { sessionStore[key] = val },
  removeItem: (key) => { delete sessionStore[key] },
})

// ── Mock localforage (IndexedDB not available in test env) ────────────────────
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      setItem: vi.fn().mockResolvedValue(undefined),
      getItem: vi.fn().mockResolvedValue(null),
      clear: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

import {
  scoreTextHints,
  scoreAspectRatio,
  computeRecipeMatchConfidence,
  seedAreaPenalty,
  isSeedTooSmall,
  MIN_SEED_AREA,
  SCOPE_PENALTY_WHOLE_PLAN,
} from '../services/recipeMatching/scoring.js'
import {
  deduplicateMatchesByProximity,
  DEDUP_RADIUS_PX,
  MAX_TOTAL_MATCHES,
} from '../services/recipeMatching/matcher.js'
import {
  createMatchCandidate,
  groupByBucket,
  groupByPage,
} from '../services/recipeMatching/index.js'
import {
  getRelevantRecipes,
  getRelevantRecipeCount,
  getRecipesByProject,
  clearAllRecipes,
  saveRecipe,
  createRecipe,
  RECIPE_SCOPE,
} from '../data/recipeStore.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch(overrides = {}) {
  return {
    x: 100, y: 200, pageNum: 1,
    confidence: 0.85,
    confidenceBucket: 'high',
    evidence: { ncc: { score: 0.8, weight: 0.7 }, textHint: { score: 0.5, weight: 0.2 }, aspect: { score: 1.0, weight: 0.1 } },
    matchBbox: { x: 90, y: 190, w: 20, h: 20 },
    recipeId: 'RCP-test1',
    ...overrides,
  }
}

function makeRecipe(overrides = {}) {
  return {
    id: 'RCP-test1',
    assemblyId: 'asm-001',
    assemblyName: 'Dugalj 2P+F',
    label: 'Dugalj egyszerű',
    ...overrides,
  }
}

// ── 1. False Positive Reduction: Seed Area ───────────────────────────────────

describe('seed area quality guard', () => {
  it('isSeedTooSmall returns true for tiny seeds', () => {
    expect(isSeedTooSmall({ w: 5, h: 5 })).toBe(true)   // 25 < 100
    expect(isSeedTooSmall({ w: 3, h: 10 })).toBe(true)   // 30 < 100
  })

  it('isSeedTooSmall returns false for normal seeds', () => {
    expect(isSeedTooSmall({ w: 20, h: 20 })).toBe(false)  // 400 > 100
    expect(isSeedTooSmall({ w: 10, h: 10 })).toBe(false)  // 100 = 100 is NOT < 100
  })

  it('isSeedTooSmall returns false for unknown bbox (penalty handles it)', () => {
    expect(isSeedTooSmall(null)).toBe(false)
    expect(isSeedTooSmall({})).toBe(false)
  })

  it('seedAreaPenalty returns 1.0 for healthy seeds (≥ 2× MIN_SEED_AREA)', () => {
    expect(seedAreaPenalty({ w: 20, h: 20 })).toBe(1.0)   // 400 ≥ 200
  })

  it('seedAreaPenalty returns 0.85 for borderline seeds', () => {
    expect(seedAreaPenalty({ w: 10, h: 12 })).toBe(0.85)  // 120 ≥ 100 but < 200
  })

  it('seedAreaPenalty returns 0.5 for tiny seeds', () => {
    expect(seedAreaPenalty({ w: 5, h: 5 })).toBe(0.5)    // 25 < 100
  })

  it('seedAreaPenalty returns 1.0 for null/undefined bbox (backward compat)', () => {
    expect(seedAreaPenalty(null)).toBe(1.0)
    expect(seedAreaPenalty(undefined)).toBe(1.0)
  })

  it('seedAreaPenalty returns 0.7 for provided-but-invalid bbox', () => {
    expect(seedAreaPenalty({ w: 0, h: 0 })).toBe(0.7)
  })

  it('MIN_SEED_AREA is 100 px²', () => {
    expect(MIN_SEED_AREA).toBe(100)
  })
})

// ── 2. Confidence with modifiers ─────────────────────────────────────────────

describe('confidence with seed area and scope penalty', () => {
  it('healthy seed + current_page → no penalty', () => {
    const r = computeRecipeMatchConfidence(
      { nccScore: 0.8, textHintScore: 0.5, aspectScore: 1.0 },
      { seedBbox: { w: 20, h: 20 }, isWholePlan: false },
    )
    // 0.7*0.8 + 0.2*0.5 + 0.1*1.0 = 0.56 + 0.10 + 0.10 = 0.76, × 1.0, - 0 = 0.76
    expect(r.confidence).toBeCloseTo(0.76, 2)
    expect(r.confidenceBucket).toBe('high')
  })

  it('healthy seed + whole_plan → scope penalty applied', () => {
    const r = computeRecipeMatchConfidence(
      { nccScore: 0.8, textHintScore: 0.5, aspectScore: 1.0 },
      { seedBbox: { w: 20, h: 20 }, isWholePlan: true },
    )
    // 0.76 × 1.0 - 0.05 = 0.71
    expect(r.confidence).toBeCloseTo(0.71, 2)
    expect(r.confidenceBucket).toBe('high')
  })

  it('borderline confidence + whole_plan → drops from high to review', () => {
    // This is the critical test: scope penalty shifts borderline results
    const r = computeRecipeMatchConfidence(
      { nccScore: 0.85, textHintScore: 0.0, aspectScore: 1.0 },
      { seedBbox: { w: 20, h: 20 }, isWholePlan: true },
    )
    // 0.7*0.85 + 0.2*0 + 0.1*1.0 = 0.595 + 0 + 0.1 = 0.695, × 1.0, - 0.05 = 0.645
    expect(r.confidence).toBeCloseTo(0.645, 2)
    expect(r.confidenceBucket).toBe('review')  // NOT high
  })

  it('tiny seed penalty reduces confidence significantly', () => {
    const r = computeRecipeMatchConfidence(
      { nccScore: 0.9, textHintScore: 0.5, aspectScore: 1.0 },
      { seedBbox: { w: 5, h: 5 }, isWholePlan: false },
    )
    // raw = 0.7*0.9 + 0.2*0.5 + 0.1*1.0 = 0.63 + 0.10 + 0.10 = 0.83, × 0.5 = 0.415
    expect(r.confidence).toBeCloseTo(0.415, 2)
    expect(r.confidenceBucket).toBe('review')  // was HIGH without penalty
  })

  it('evidence includes areaPenalty and scopePenalty fields', () => {
    const r = computeRecipeMatchConfidence(
      { nccScore: 0.8, textHintScore: 0.5, aspectScore: 1.0 },
      { seedBbox: { w: 20, h: 20 }, isWholePlan: true },
    )
    expect(r.evidence.areaPenalty).toBe(1.0)
    expect(r.evidence.scopePenalty).toBe(SCOPE_PENALTY_WHOLE_PLAN)
  })

  it('SCOPE_PENALTY_WHOLE_PLAN is 0.05', () => {
    expect(SCOPE_PENALTY_WHOLE_PLAN).toBe(0.05)
  })
})

// ── 3. Cross-recipe proximity dedup ──────────────────────────────────────────

describe('deduplicateMatchesByProximity', () => {
  it('removes overlapping matches within DEDUP_RADIUS_PX, keeping higher confidence', () => {
    const matches = [
      makeMatch({ x: 100, y: 200, confidence: 0.9, pageNum: 1 }),
      makeMatch({ x: 105, y: 203, confidence: 0.7, pageNum: 1 }),  // within 15px
    ]
    const result = deduplicateMatchesByProximity(matches)
    expect(result.length).toBe(1)
    expect(result[0].confidence).toBe(0.9) // kept the better one
  })

  it('keeps matches that are far apart', () => {
    const matches = [
      makeMatch({ x: 100, y: 200, confidence: 0.8, pageNum: 1 }),
      makeMatch({ x: 200, y: 300, confidence: 0.7, pageNum: 1 }),
    ]
    const result = deduplicateMatchesByProximity(matches)
    expect(result.length).toBe(2)
  })

  it('does not dedup across different pages', () => {
    const matches = [
      makeMatch({ x: 100, y: 200, confidence: 0.9, pageNum: 1 }),
      makeMatch({ x: 105, y: 203, confidence: 0.7, pageNum: 2 }),  // same coords, diff page
    ]
    const result = deduplicateMatchesByProximity(matches)
    expect(result.length).toBe(2)
  })

  it('handles empty input', () => {
    expect(deduplicateMatchesByProximity([])).toEqual([])
    expect(deduplicateMatchesByProximity(null)).toEqual([])
  })

  it('handles cluster of 5 nearby matches — keeps only 1', () => {
    const matches = [
      makeMatch({ x: 100, y: 200, confidence: 0.6, pageNum: 1 }),
      makeMatch({ x: 102, y: 201, confidence: 0.7, pageNum: 1 }),
      makeMatch({ x: 104, y: 203, confidence: 0.8, pageNum: 1 }),
      makeMatch({ x: 106, y: 198, confidence: 0.9, pageNum: 1 }),
      makeMatch({ x: 108, y: 202, confidence: 0.5, pageNum: 1 }),
    ]
    const result = deduplicateMatchesByProximity(matches)
    expect(result.length).toBe(1)
    expect(result[0].confidence).toBe(0.9)
  })

  it('DEDUP_RADIUS_PX is 15', () => {
    expect(DEDUP_RADIUS_PX).toBe(15)
  })
})

// ── 4. Safety limits ─────────────────────────────────────────────────────────

describe('safety limits', () => {
  it('MAX_TOTAL_MATCHES is 200', () => {
    expect(MAX_TOTAL_MATCHES).toBe(200)
  })
})

// ── 5. Page grouping ─────────────────────────────────────────────────────────

describe('groupByPage', () => {
  it('groups candidates by page number', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ pageNum: 1 }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ pageNum: 1 }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ pageNum: 3 }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ pageNum: 5 }), makeRecipe(), 'p1'),
    ]
    const pages = groupByPage(candidates)
    expect(pages.size).toBe(3)
    expect(pages.get(1).length).toBe(2)
    expect(pages.get(3).length).toBe(1)
    expect(pages.get(5).length).toBe(1)
  })

  it('returns empty map for empty input', () => {
    expect(groupByPage([]).size).toBe(0)
  })
})

// ── 6. Relevant recipe recommendation ────────────────────────────────────────

describe('getRelevantRecipes', () => {
  beforeEach(() => {
    Object.keys(storage).forEach(k => delete storage[k])
    clearAllRecipes()
  })

  it('returns all project recipes when no planMeta provided', () => {
    const r1 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-a', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm1' })
    const r2 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-b', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm2' })
    saveRecipe(r1)
    saveRecipe(r2)

    const result = getRelevantRecipes('proj1')
    expect(result.length).toBe(2)
  })

  it('returns empty for non-existent project', () => {
    expect(getRelevantRecipes('nonexistent')).toEqual([])
  })

  it('sorts by usageCount desc when no meta', () => {
    const r1 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-a', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm1' })
    const r2 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-b', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm2' })
    saveRecipe(r1)
    saveRecipe(r2)

    // Manually update usage count
    const all = JSON.parse(localStorage.getItem('takeoffpro_symbol_recipes'))
    all[0].usageCount = 3
    all[1].usageCount = 10
    localStorage.setItem('takeoffpro_symbol_recipes', JSON.stringify(all))

    const result = getRelevantRecipes('proj1')
    expect(result[0].usageCount).toBe(10) // higher usage first
  })

  it('ranks recipes from same floor higher when planMeta has floor', () => {
    const r1 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-floor1', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm1' })
    const r2 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-floor2', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm2' })
    saveRecipe(r1)
    saveRecipe(r2)

    // Store plan meta
    localStorage.setItem('takeoffpro_plans', JSON.stringify([
      { id: 'plan-floor1', floor: '1.emelet', systemType: 'villamos' },
      { id: 'plan-floor2', floor: '2.emelet', systemType: 'villamos' },
    ]))

    const result = getRelevantRecipes('proj1', { floor: '1.emelet', systemType: 'villamos' })
    // r1 (floor match + systemType match) should rank higher than r2 (only systemType match)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe(r1.id)
  })

  it('getRelevantRecipeCount returns correct count', () => {
    const r1 = createRecipe({ projectId: 'proj1', sourcePlanId: 'plan-a', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 20, h: 20 }, assemblyId: 'asm1' })
    saveRecipe(r1)
    expect(getRelevantRecipeCount('proj1')).toBe(1)
    expect(getRelevantRecipeCount('nonexistent')).toBe(0)
  })
})

// ── 7. Scope-differentiated behavior ─────────────────────────────────────────

describe('current_page vs whole_plan differentiation', () => {
  it('same NCC score → higher confidence in current_page than whole_plan', () => {
    const scores = { nccScore: 0.85, textHintScore: 0.3, aspectScore: 1.0 }
    const bbox = { w: 20, h: 20 }

    const cp = computeRecipeMatchConfidence(scores, { seedBbox: bbox, isWholePlan: false })
    const wp = computeRecipeMatchConfidence(scores, { seedBbox: bbox, isWholePlan: true })

    expect(cp.confidence).toBeGreaterThan(wp.confidence)
    expect(cp.confidence - wp.confidence).toBeCloseTo(SCOPE_PENALTY_WHOLE_PLAN, 3)
  })

  it('whole_plan scope penalty can shift bucket boundary', () => {
    // 0.7*0.9 + 0.2*0.0 + 0.1*1.0 = 0.73 (HIGH in current_page)
    // With penalty: 0.73 - 0.05 = 0.68 (REVIEW in whole_plan)
    const scores = { nccScore: 0.9, textHintScore: 0.0, aspectScore: 1.0 }
    const bbox = { w: 20, h: 20 }

    const cp = computeRecipeMatchConfidence(scores, { seedBbox: bbox, isWholePlan: false })
    const wp = computeRecipeMatchConfidence(scores, { seedBbox: bbox, isWholePlan: true })

    expect(cp.confidenceBucket).toBe('high')
    expect(wp.confidenceBucket).toBe('review')
  })
})

// ── 8. Truth source boundary (regression) ────────────────────────────────────

describe('truth source boundary preserved', () => {
  it('createMatchCandidate still produces RMC- IDs', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.id).toMatch(/^RMC-/)
    expect(c.source).toBe('recipe_match')
  })

  it('groupByBucket still works correctly', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'review' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'low' }), makeRecipe(), 'p1'),
    ]
    const g = groupByBucket(candidates)
    expect(g.green.length).toBe(1)
    expect(g.yellow.length).toBe(1)
    expect(g.red.length).toBe(1)
  })
})
