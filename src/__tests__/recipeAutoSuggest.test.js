// ─── Recipe Auto-Suggest + Run Preset Tests ──────────────────────────────────
// Tests for:
//   - scoreRecipeRecommendation (quality, usage, planMeta)
//   - getRecommendedRecipeSet (recommended vs rest split, reasons)
//   - ReuseBanner run preset rendering logic
//   - shouldShowReuseBanner helper
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock localStorage ────────────────────────────────────────────────────────
const store = {}
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = String(val) }),
  removeItem: vi.fn((key) => { delete store[key] }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
}
vi.stubGlobal('localStorage', localStorageMock)

// ── Mock sessionStorage ──────────────────────────────────────────────────────
const sessionStore = {}
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn((key) => sessionStore[key] ?? null),
  setItem: vi.fn((key, val) => { sessionStore[key] = String(val) }),
  removeItem: vi.fn((key) => { delete sessionStore[key] }),
  clear: vi.fn(() => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]) }),
})

// ── Mock localforage ────────────────────────────────────────────────────────
vi.mock('localforage', () => {
  const memStore = {}
  return {
    default: {
      createInstance: () => ({
        getItem: async (key) => memStore[key] ?? null,
        setItem: async (key, val) => { memStore[key] = val },
        removeItem: async (key) => { delete memStore[key] },
        clear: async () => { Object.keys(memStore).forEach(k => delete memStore[k]) },
      }),
    },
  }
})

// ── Imports ──────────────────────────────────────────────────────────────────

import {
  createRecipe,
  saveRecipe,
  updateRecipe,
  updateRecipeRunStats,
  getRecommendedRecipeSet,
  scoreRecipeRecommendation,
  clearAllRecipes,
  RECIPE_SCOPE,
  MATCH_STRICTNESS,
} from '../data/recipeStore.js'

import {
  shouldShowReuseBanner,
  dismissReuseBanner,
  getProjectRecipeCount,
} from '../components/ReuseBanner.jsx'

// ── Setup ────────────────────────────────────────────────────────────────────

const PROJECT = 'proj-suggest-test'

function makeTestRecipe(overrides = {}) {
  return createRecipe({
    projectId: PROJECT,
    sourcePlanId: 'plan-001',
    sourcePageNumber: 1,
    bbox: { x: 10, y: 20, w: 30, h: 30 },
    assemblyId: 'ASM-001',
    assemblyName: 'Konnektor 1',
    label: 'Test recipe',
    ...overrides,
  })
}

beforeEach(() => {
  localStorageMock.clear()
  Object.keys(sessionStore).forEach(k => delete sessionStore[k])
  clearAllRecipes()
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. scoreRecipeRecommendation
// ═══════════════════════════════════════════════════════════════════════════

describe('scoreRecipeRecommendation', () => {
  it('returns 0 score with no planMeta and no stats', () => {
    const recipe = makeTestRecipe()
    const { score, reasons } = scoreRecipeRecommendation(recipe, null)
    expect(score).toBe(0)
    expect(reasons).toEqual([])
  })

  it('adds quality bonus for high accept rate', () => {
    const recipe = makeTestRecipe()
    recipe.lastRunStats = { accepted: 8, rejected: 2, total: 10 }
    const { score, reasons } = scoreRecipeRecommendation(recipe, null)
    expect(score).toBe(3) // high_quality +3
    expect(reasons).toContain('high_quality')
  })

  it('adds moderate quality bonus for 50-70% accept rate', () => {
    const recipe = makeTestRecipe()
    recipe.lastRunStats = { accepted: 6, rejected: 4, total: 10 }
    const { score, reasons } = scoreRecipeRecommendation(recipe, null)
    expect(score).toBe(1) // ok_quality +1
    expect(reasons).toContain('ok_quality')
  })

  it('penalizes low quality recipes', () => {
    const recipe = makeTestRecipe()
    recipe.lastRunStats = { accepted: 1, rejected: 9, total: 10 }
    const { score, reasons } = scoreRecipeRecommendation(recipe, null)
    expect(score).toBe(-2) // low_quality -2
    expect(reasons).toContain('low_quality')
  })

  it('adds usage bonus for frequently used recipes', () => {
    const recipe = makeTestRecipe()
    recipe.usageCount = 5
    const { score, reasons } = scoreRecipeRecommendation(recipe, null)
    expect(score).toBe(1)
    expect(reasons).toContain('frequently_used')
  })

  it('combines quality and usage bonuses', () => {
    const recipe = makeTestRecipe()
    recipe.lastRunStats = { accepted: 9, rejected: 1, total: 10 }
    recipe.usageCount = 10
    const { score } = scoreRecipeRecommendation(recipe, null)
    expect(score).toBe(4) // high_quality +3 + frequently_used +1
  })

  it('scores planMeta relevance (floor match)', () => {
    const recipe = makeTestRecipe({ sourcePlanId: 'plan-with-meta' })
    // Store plan meta in localStorage
    localStorage.setItem('takeoffpro_plans', JSON.stringify([
      { id: 'plan-with-meta', floor: 'F1', systemType: 'lighting' },
    ]))
    const { score, reasons } = scoreRecipeRecommendation(recipe, { floor: 'F1' })
    expect(score).toBe(3) // same_floor +3
    expect(reasons).toContain('same_floor')
  })

  it('scores multiple planMeta matches', () => {
    const recipe = makeTestRecipe({ sourcePlanId: 'plan-full-meta' })
    localStorage.setItem('takeoffpro_plans', JSON.stringify([
      { id: 'plan-full-meta', floor: 'F2', systemType: 'power', docType: 'layout' },
    ]))
    const { score, reasons } = scoreRecipeRecommendation(recipe, {
      floor: 'F2', systemType: 'power', docType: 'layout',
    })
    expect(score).toBe(6) // floor +3 + system +2 + docType +1
    expect(reasons).toContain('same_floor')
    expect(reasons).toContain('same_system')
    expect(reasons).toContain('same_doc_type')
  })

  it('does not match when planMeta does not overlap', () => {
    const recipe = makeTestRecipe({ sourcePlanId: 'plan-no-match' })
    localStorage.setItem('takeoffpro_plans', JSON.stringify([
      { id: 'plan-no-match', floor: 'F1' },
    ]))
    const { score } = scoreRecipeRecommendation(recipe, { floor: 'F3' })
    expect(score).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. getRecommendedRecipeSet
// ═══════════════════════════════════════════════════════════════════════════

describe('getRecommendedRecipeSet', () => {
  it('returns empty when no recipes', () => {
    const result = getRecommendedRecipeSet(PROJECT, null)
    expect(result.recommended).toHaveLength(0)
    expect(result.rest).toHaveLength(0)
    expect(result.reasons).toEqual([])
  })

  it('splits recipes into recommended and rest based on score threshold', () => {
    // High quality recipe → recommended (score ≥ 2)
    const r1 = makeTestRecipe({ label: 'Good recipe' })
    r1.lastRunStats = { accepted: 9, rejected: 1, total: 10 } // +3 quality
    saveRecipe(r1)

    // Low quality recipe → rest (score < 2)
    const r2 = makeTestRecipe({ label: 'Bad recipe' })
    r2.lastRunStats = { accepted: 1, rejected: 9, total: 10 } // -2 quality
    saveRecipe(r2)

    // No stats recipe → rest (score 0)
    const r3 = makeTestRecipe({ label: 'New recipe' })
    saveRecipe(r3)

    const result = getRecommendedRecipeSet(PROJECT, null)
    expect(result.recommended).toHaveLength(1)
    expect(result.recommended[0].label).toBe('Good recipe')
    expect(result.rest).toHaveLength(2)
  })

  it('all recipes in recommended when all have high quality', () => {
    const r1 = makeTestRecipe({ label: 'R1' })
    r1.lastRunStats = { accepted: 8, rejected: 2, total: 10 }
    saveRecipe(r1)

    const r2 = makeTestRecipe({ label: 'R2' })
    r2.lastRunStats = { accepted: 7, rejected: 3, total: 10 }
    saveRecipe(r2)

    const result = getRecommendedRecipeSet(PROJECT, null)
    expect(result.recommended).toHaveLength(2)
    expect(result.rest).toHaveLength(0)
  })

  it('reasons include quality indicators', () => {
    const r1 = makeTestRecipe({ label: 'Good' })
    r1.lastRunStats = { accepted: 9, rejected: 1, total: 10 }
    r1.usageCount = 5
    saveRecipe(r1)

    const result = getRecommendedRecipeSet(PROJECT, null)
    expect(result.reasons).toContain('Magas találati arány')
    expect(result.reasons).toContain('Gyakran használt')
  })

  it('reasons include floor match when planMeta provided', () => {
    const r1 = makeTestRecipe({ sourcePlanId: 'plan-floor' })
    saveRecipe(r1)
    localStorage.setItem('takeoffpro_plans', JSON.stringify([
      { id: 'plan-floor', floor: 'Fszt' },
    ]))

    const result = getRecommendedRecipeSet(PROJECT, { floor: 'Fszt' })
    expect(result.recommended).toHaveLength(1)
    expect(result.reasons).toContain('Azonos emelet')
  })

  it('recommended sorted by score descending', () => {
    const r1 = makeTestRecipe({ label: 'Medium', sourcePlanId: 'p1' })
    r1.lastRunStats = { accepted: 8, rejected: 2, total: 10 } // +3 quality
    saveRecipe(r1)

    const r2 = makeTestRecipe({ label: 'High', sourcePlanId: 'p2' })
    r2.lastRunStats = { accepted: 9, rejected: 1, total: 10 } // +3 quality
    r2.usageCount = 10 // +1 usage
    saveRecipe(r2)

    const result = getRecommendedRecipeSet(PROJECT, null)
    expect(result.recommended[0].label).toBe('High')
    expect(result.recommended[1].label).toBe('Medium')
  })

  it('excludes archived recipes', () => {
    const r1 = makeTestRecipe({ label: 'Active' })
    r1.lastRunStats = { accepted: 9, rejected: 1, total: 10 }
    saveRecipe(r1)

    const r2 = makeTestRecipe({ label: 'Archived' })
    r2.lastRunStats = { accepted: 9, rejected: 1, total: 10 }
    saveRecipe(r2)
    updateRecipe(r2.id, { status: 'archived' })

    const result = getRecommendedRecipeSet(PROJECT, null)
    // Only active recipes
    expect(result.recommended).toHaveLength(1)
    expect(result.recommended[0].label).toBe('Active')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. shouldShowReuseBanner (existing helper — verify backward compat)
// ═══════════════════════════════════════════════════════════════════════════

describe('shouldShowReuseBanner', () => {
  it('returns true when project has recipes and plan has no markers', () => {
    const r1 = makeTestRecipe()
    saveRecipe(r1)
    const getRecipes = (pid) => [r1]
    expect(shouldShowReuseBanner(PROJECT, 'plan-X', 0, getRecipes)).toBe(true)
  })

  it('returns false when markerCount > 0', () => {
    const getRecipes = () => [makeTestRecipe()]
    expect(shouldShowReuseBanner(PROJECT, 'plan-X', 5, getRecipes)).toBe(false)
  })

  it('returns false when no projectId', () => {
    const getRecipes = () => [makeTestRecipe()]
    expect(shouldShowReuseBanner(null, 'plan-X', 0, getRecipes)).toBe(false)
  })

  it('returns false after dismiss', () => {
    const getRecipes = () => [makeTestRecipe()]
    dismissReuseBanner('plan-Y')
    expect(shouldShowReuseBanner(PROJECT, 'plan-Y', 0, getRecipes)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. ReuseBanner rendering logic (unit test via import)
// ═══════════════════════════════════════════════════════════════════════════

describe('ReuseBanner component import', () => {
  it('can be imported independently', async () => {
    const mod = await import('../components/ReuseBanner.jsx')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
    expect(typeof mod.shouldShowReuseBanner).toBe('function')
    expect(typeof mod.dismissReuseBanner).toBe('function')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Architecture boundary
// ═══════════════════════════════════════════════════════════════════════════

describe('architecture boundary', () => {
  it('getRecommendedRecipeSet is exported from recipeStore', () => {
    expect(typeof getRecommendedRecipeSet).toBe('function')
  })

  it('scoreRecipeRecommendation is exported from recipeStore', () => {
    expect(typeof scoreRecipeRecommendation).toBe('function')
  })

  it('recommendation does not modify recipe objects', () => {
    const r1 = makeTestRecipe()
    r1.lastRunStats = { accepted: 9, rejected: 1, total: 10 }
    saveRecipe(r1)

    const before = JSON.stringify(r1)
    getRecommendedRecipeSet(PROJECT, null)
    const after = JSON.stringify(r1)
    expect(before).toBe(after)
  })

  it('recommendation result contains only Recipe objects, not match candidates', () => {
    const r1 = makeTestRecipe()
    r1.lastRunStats = { accepted: 9, rejected: 1, total: 10 }
    saveRecipe(r1)

    const result = getRecommendedRecipeSet(PROJECT, null)
    for (const recipe of result.recommended) {
      expect(recipe.id).toBeTruthy()
      expect(recipe.projectId).toBe(PROJECT)
      expect(recipe.bbox).toBeDefined()
      // Not a match candidate
      expect(recipe.confidence).toBeUndefined()
      expect(recipe.confidenceBucket).toBeUndefined()
    }
  })
})
