// ─── Recipe Refinement Loop Tests ───────────────────────────────────────────
// Tests for recipe refinement features:
//   - strictness presets (strict / balanced / broad)
//   - assembly swap
//   - recipe refinement persistence
//   - quality hint / usage feedback
//   - architecture boundary
//   - unarchive / restore
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

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
  createRecipe,
  saveRecipe,
  updateRecipe,
  archiveRecipe,
  restoreRecipe,
  updateRecipeRunStats,
  getRecipesByProject,
  getAllRecipesByProject,
  clearAllRecipes,
  RECIPE_SCOPE,
  RECIPE_STATUS,
  MATCH_STRICTNESS,
} from '../data/recipeStore.js'

import {
  resolveStrictnessPreset,
  STRICTNESS_PRESETS,
  computeRecipeMatchConfidence,
  SCOPE_PENALTY_WHOLE_PLAN,
} from '../services/recipeMatching/scoring.js'

// ── Setup ───────────────────────────────────────────────────────────────────

const PROJECT = 'proj-refine-test'

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
  clearAllRecipes()
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. Strictness presets
// ═══════════════════════════════════════════════════════════════════════════

describe('strictness presets', () => {
  it('resolveStrictnessPreset returns correct preset for strict', () => {
    const p = resolveStrictnessPreset('strict')
    expect(p.nccThresholdDelta).toBe(0.10)
    expect(p.maxMatchesPerPage).toBe(15)
    expect(p.scopePenaltyMul).toBe(2.0)
  })

  it('resolveStrictnessPreset returns correct preset for balanced', () => {
    const p = resolveStrictnessPreset('balanced')
    expect(p.nccThresholdDelta).toBe(0)
    expect(p.maxMatchesPerPage).toBe(30)
    expect(p.scopePenaltyMul).toBe(1.0)
  })

  it('resolveStrictnessPreset returns correct preset for broad', () => {
    const p = resolveStrictnessPreset('broad')
    expect(p.nccThresholdDelta).toBe(-0.08)
    expect(p.maxMatchesPerPage).toBe(50)
    expect(p.scopePenaltyMul).toBe(0.5)
  })

  it('resolveStrictnessPreset falls back to balanced for unknown', () => {
    const p = resolveStrictnessPreset('invalid')
    expect(p).toEqual(STRICTNESS_PRESETS.balanced)
  })

  it('resolveStrictnessPreset falls back to balanced for null', () => {
    const p = resolveStrictnessPreset(null)
    expect(p).toEqual(STRICTNESS_PRESETS.balanced)
  })

  it('strict preset produces lower confidence via higher scope penalty', () => {
    const evidence = { nccScore: 0.7, textHintScore: 0.5, aspectScore: 0.8 }
    const balanced = computeRecipeMatchConfidence(evidence, {
      isWholePlan: true, scopePenaltyMul: 1.0,
    })
    const strict = computeRecipeMatchConfidence(evidence, {
      isWholePlan: true, scopePenaltyMul: 2.0,
    })
    expect(strict.confidence).toBeLessThan(balanced.confidence)
  })

  it('broad preset produces higher confidence via lower scope penalty', () => {
    const evidence = { nccScore: 0.6, textHintScore: 0.4, aspectScore: 0.7 }
    const balanced = computeRecipeMatchConfidence(evidence, {
      isWholePlan: true, scopePenaltyMul: 1.0,
    })
    const broad = computeRecipeMatchConfidence(evidence, {
      isWholePlan: true, scopePenaltyMul: 0.5,
    })
    expect(broad.confidence).toBeGreaterThan(balanced.confidence)
  })

  it('new recipe defaults to balanced strictness', () => {
    const recipe = makeTestRecipe()
    expect(recipe.matchStrictness).toBe(MATCH_STRICTNESS.BALANCED)
  })

  it('recipe can be created with explicit strictness', () => {
    const recipe = makeTestRecipe({ matchStrictness: MATCH_STRICTNESS.STRICT })
    expect(recipe.matchStrictness).toBe('strict')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Assembly swap
// ═══════════════════════════════════════════════════════════════════════════

describe('assembly swap', () => {
  it('updateRecipe changes assemblyId and assemblyName', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    const updated = updateRecipe(recipe.id, {
      assemblyId: 'ASM-002',
      assemblyName: 'Lámpa 1',
    })
    expect(updated.assemblyId).toBe('ASM-002')
    expect(updated.assemblyName).toBe('Lámpa 1')
  })

  it('assembly swap persists across reload', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    updateRecipe(recipe.id, { assemblyId: 'ASM-003', assemblyName: 'Elosztó' })
    const loaded = getRecipesByProject(PROJECT)
    const found = loaded.find(r => r.id === recipe.id)
    expect(found.assemblyId).toBe('ASM-003')
    expect(found.assemblyName).toBe('Elosztó')
  })

  it('assembly swap does not change other recipe fields', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    const original = { ...recipe }
    updateRecipe(recipe.id, { assemblyId: 'ASM-004', assemblyName: 'Új' })
    const loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.projectId).toBe(original.projectId)
    expect(loaded.scope).toBe(original.scope)
    expect(loaded.matchStrictness).toBe(original.matchStrictness)
    expect(loaded.bbox).toEqual(original.bbox)
  })

  it('assembly swap updates timestamp', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    const updated = updateRecipe(recipe.id, { assemblyId: 'ASM-005' })
    expect(updated.updatedAt).toBeTruthy()
    expect(typeof updated.updatedAt).toBe('string')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Recipe refinement persistence
// ═══════════════════════════════════════════════════════════════════════════

describe('recipe refinement persistence', () => {
  it('strictness change persists', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    updateRecipe(recipe.id, { matchStrictness: MATCH_STRICTNESS.STRICT })
    const loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.matchStrictness).toBe('strict')
  })

  it('strictness can cycle through all presets', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)

    updateRecipe(recipe.id, { matchStrictness: MATCH_STRICTNESS.STRICT })
    let loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.matchStrictness).toBe('strict')

    updateRecipe(recipe.id, { matchStrictness: MATCH_STRICTNESS.BROAD })
    loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.matchStrictness).toBe('broad')

    updateRecipe(recipe.id, { matchStrictness: MATCH_STRICTNESS.BALANCED })
    loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.matchStrictness).toBe('balanced')
  })

  it('multiple refinements on same recipe all persist', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    updateRecipe(recipe.id, {
      matchStrictness: MATCH_STRICTNESS.BROAD,
      assemblyId: 'ASM-NEW',
      assemblyName: 'Changed Assembly',
      scope: RECIPE_SCOPE.CURRENT_PAGE,
      label: 'Refined recipe',
    })
    const loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.matchStrictness).toBe('broad')
    expect(loaded.assemblyId).toBe('ASM-NEW')
    expect(loaded.scope).toBe('current_page')
    expect(loaded.label).toBe('Refined recipe')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Quality hint / usage feedback
// ═══════════════════════════════════════════════════════════════════════════

describe('quality hint / usage feedback', () => {
  it('new recipe has null lastRunStats', () => {
    const recipe = makeTestRecipe()
    expect(recipe.lastRunStats).toBeNull()
  })

  it('updateRecipeRunStats sets stats correctly', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    updateRecipeRunStats(recipe.id, { accepted: 8, rejected: 2, total: 10 })
    const loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.lastRunStats).toEqual({ accepted: 8, rejected: 2, total: 10 })
  })

  it('quality stats update overwrites previous stats', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    updateRecipeRunStats(recipe.id, { accepted: 3, rejected: 7, total: 10 })
    updateRecipeRunStats(recipe.id, { accepted: 9, rejected: 1, total: 10 })
    const loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.lastRunStats.accepted).toBe(9)
    expect(loaded.lastRunStats.rejected).toBe(1)
  })

  it('quality stats are preserved alongside other updates', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    updateRecipeRunStats(recipe.id, { accepted: 5, rejected: 5, total: 10 })
    updateRecipe(recipe.id, { label: 'Updated label' })
    const loaded = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(loaded.lastRunStats.accepted).toBe(5)
    expect(loaded.label).toBe('Updated label')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Unarchive / restore
// ═══════════════════════════════════════════════════════════════════════════

describe('unarchive / restore', () => {
  it('restoreRecipe changes status back to active', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    archiveRecipe(recipe.id)
    expect(getRecipesByProject(PROJECT).find(r => r.id === recipe.id)).toBeUndefined()

    restoreRecipe(recipe.id)
    const restored = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(restored).toBeTruthy()
    expect(restored.status).toBe(RECIPE_STATUS.ACTIVE)
  })

  it('getAllRecipesByProject returns both active and archived', () => {
    const r1 = makeTestRecipe({ label: 'Active' })
    const r2 = makeTestRecipe({ label: 'Archived' })
    saveRecipe(r1)
    saveRecipe(r2)
    archiveRecipe(r2.id)

    const active = getRecipesByProject(PROJECT)
    expect(active).toHaveLength(1)

    const all = getAllRecipesByProject(PROJECT)
    expect(all).toHaveLength(2)
  })

  it('restored recipe retains all original fields', () => {
    const recipe = makeTestRecipe({
      matchStrictness: MATCH_STRICTNESS.STRICT,
      assemblyId: 'ASM-KEEP',
    })
    saveRecipe(recipe)
    archiveRecipe(recipe.id)
    restoreRecipe(recipe.id)
    const restored = getRecipesByProject(PROJECT).find(r => r.id === recipe.id)
    expect(restored.matchStrictness).toBe('strict')
    expect(restored.assemblyId).toBe('ASM-KEEP')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Architecture boundary
// ═══════════════════════════════════════════════════════════════════════════

describe('architecture boundary', () => {
  it('MATCH_STRICTNESS is properly exported from recipeStore', () => {
    expect(MATCH_STRICTNESS.STRICT).toBe('strict')
    expect(MATCH_STRICTNESS.BALANCED).toBe('balanced')
    expect(MATCH_STRICTNESS.BROAD).toBe('broad')
  })

  it('STRICTNESS_PRESETS is properly exported from scoring', () => {
    expect(STRICTNESS_PRESETS.strict).toBeDefined()
    expect(STRICTNESS_PRESETS.balanced).toBeDefined()
    expect(STRICTNESS_PRESETS.broad).toBeDefined()
    expect(STRICTNESS_PRESETS.strict.nccThresholdDelta).toBeGreaterThan(0)
    expect(STRICTNESS_PRESETS.broad.nccThresholdDelta).toBeLessThan(0)
  })

  it('recipe store uses independent localStorage key', () => {
    const recipe = makeTestRecipe()
    saveRecipe(recipe)
    const keys = Object.keys(store)
    const recipeKey = keys.find(k => k.includes('recipe'))
    expect(recipeKey).toBeTruthy()
    expect(recipeKey).toMatch(/^takeoffpro_/)
  })

  it('RecipeListPanel can be imported independently', async () => {
    const mod = await import('../components/RecipeListPanel.jsx')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
  })

  it('strictness preset does not affect scoring when not whole_plan', () => {
    const evidence = { nccScore: 0.7, textHintScore: 0.5, aspectScore: 0.8 }
    const withMul2 = computeRecipeMatchConfidence(evidence, {
      isWholePlan: false, scopePenaltyMul: 2.0,
    })
    const withMul05 = computeRecipeMatchConfidence(evidence, {
      isWholePlan: false, scopePenaltyMul: 0.5,
    })
    // No scope penalty applied when not whole_plan, so scopePenaltyMul is irrelevant
    expect(withMul2.confidence).toBe(withMul05.confidence)
  })
})
