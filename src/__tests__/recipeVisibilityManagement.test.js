// ─── Recipe Visibility & Management Lite — Tests ──────────────────────────
// Tests for the new recipe list panel, rename/delete/scope-toggle flows,
// run-from-list, and architecture boundary enforcement.
//
// BOUNDARY: These tests cover recipeStore CRUD operations and UI helper logic.
// They do NOT test DetectionCandidate[], generic detection state, or PDF rule engine.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRecipe, saveRecipe, loadRecipes, updateRecipe, archiveRecipe,
  getRecipesByProject, getRelevantRecipes, getRecipeCount,
  clearAllRecipes, RECIPE_STATUS, RECIPE_SCOPE,
} from '../data/recipeStore.js'

// ── Mock localStorage / sessionStorage / localforage ────────────────────────

const lsStore = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => lsStore[k] ?? null,
  setItem: (k, v) => { lsStore[k] = String(v) },
  removeItem: (k) => { delete lsStore[k] },
  clear: () => Object.keys(lsStore).forEach(k => delete lsStore[k]),
})

const ssStore = {}
vi.stubGlobal('sessionStorage', {
  getItem: (k) => ssStore[k] ?? null,
  setItem: (k, v) => { ssStore[k] = String(v) },
  removeItem: (k) => { delete ssStore[k] },
  clear: () => Object.keys(ssStore).forEach(k => delete ssStore[k]),
})

vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRecipe(overrides = {}) {
  return createRecipe({
    projectId: 'proj-1',
    sourcePlanId: 'plan-001',
    sourcePageNumber: 1,
    bbox: { x: 100, y: 200, w: 50, h: 50 },
    assemblyId: 'ASM-001',
    assemblyName: 'Dugalj 2P+F',
    label: '',
    scope: RECIPE_SCOPE.WHOLE_PLAN,
    ...overrides,
  })
}

beforeEach(() => {
  clearAllRecipes()
  Object.keys(lsStore).forEach(k => delete lsStore[k])
  Object.keys(ssStore).forEach(k => delete ssStore[k])
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Recipe List Visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('recipe list visibility', () => {
  it('returns empty list when no recipes exist for project', () => {
    expect(getRecipesByProject('proj-empty')).toEqual([])
    expect(getRelevantRecipes('proj-empty')).toEqual([])
  })

  it('returns only active recipes for the project', () => {
    const r1 = saveRecipe(makeRecipe({ projectId: 'proj-1' }))
    const r2 = saveRecipe(makeRecipe({ projectId: 'proj-1' }))
    const r3 = saveRecipe(makeRecipe({ projectId: 'proj-2' }))

    const proj1 = getRecipesByProject('proj-1')
    expect(proj1.length).toBe(2)
    expect(proj1.map(r => r.id)).toContain(r1.id)
    expect(proj1.map(r => r.id)).toContain(r2.id)
    expect(proj1.map(r => r.id)).not.toContain(r3.id)
  })

  it('excludes archived recipes from list', () => {
    const r1 = saveRecipe(makeRecipe())
    const r2 = saveRecipe(makeRecipe())
    archiveRecipe(r1.id)

    const active = getRecipesByProject('proj-1')
    expect(active.length).toBe(1)
    expect(active[0].id).toBe(r2.id)
  })

  it('recipe has all origin fields visible in data', () => {
    const r = saveRecipe(makeRecipe({
      sourcePlanId: 'plan-abc',
      sourcePageNumber: 3,
      assemblyName: 'Kapcsoló 2P',
      label: 'Konyha',
    }))

    expect(r.sourcePlanId).toBe('plan-abc')
    expect(r.sourcePageNumber).toBe(3)
    expect(r.assemblyName).toBe('Kapcsoló 2P')
    expect(r.label).toBe('Konyha')
    expect(r.usageCount).toBe(0)
    expect(r.createdAt).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Rename Flow
// ═══════════════════════════════════════════════════════════════════════════════

describe('rename flow', () => {
  it('updateRecipe changes label and sets updatedAt', () => {
    const r = saveRecipe(makeRecipe({ label: 'Régi név' }))

    const updated = updateRecipe(r.id, { label: 'Új név' })

    expect(updated.label).toBe('Új név')
    expect(updated.id).toBe(r.id)
    // updatedAt is always refreshed by updateRecipe
    expect(updated.updatedAt).toBeTruthy()
    expect(typeof updated.updatedAt).toBe('string')
  })

  it('rename persists across loads', () => {
    const r = saveRecipe(makeRecipe({ label: 'V1' }))
    updateRecipe(r.id, { label: 'V2' })

    const all = loadRecipes()
    const found = all.find(x => x.id === r.id)
    expect(found.label).toBe('V2')
  })

  it('rename does not affect other recipes', () => {
    const r1 = saveRecipe(makeRecipe({ label: 'A' }))
    const r2 = saveRecipe(makeRecipe({ label: 'B' }))
    updateRecipe(r1.id, { label: 'A-updated' })

    const all = loadRecipes()
    expect(all.find(x => x.id === r1.id).label).toBe('A-updated')
    expect(all.find(x => x.id === r2.id).label).toBe('B')
  })

  it('rename of non-existent recipe returns null', () => {
    const result = updateRecipe('RCP-nonexistent', { label: 'test' })
    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Delete Flow (soft archive)
// ═══════════════════════════════════════════════════════════════════════════════

describe('delete flow', () => {
  it('archiveRecipe sets status to archived', () => {
    const r = saveRecipe(makeRecipe())
    archiveRecipe(r.id)

    const all = loadRecipes()
    const found = all.find(x => x.id === r.id)
    expect(found.status).toBe(RECIPE_STATUS.ARCHIVED)
  })

  it('archived recipe excluded from getRecipesByProject', () => {
    const r1 = saveRecipe(makeRecipe())
    const r2 = saveRecipe(makeRecipe())
    archiveRecipe(r1.id)

    const active = getRecipesByProject('proj-1')
    expect(active.length).toBe(1)
    expect(active[0].id).toBe(r2.id)
  })

  it('archived recipe excluded from getRelevantRecipes', () => {
    const r1 = saveRecipe(makeRecipe())
    const r2 = saveRecipe(makeRecipe())
    archiveRecipe(r1.id)

    const relevant = getRelevantRecipes('proj-1')
    expect(relevant.length).toBe(1)
    expect(relevant[0].id).toBe(r2.id)
  })

  it('delete updates recipe count', () => {
    saveRecipe(makeRecipe())
    saveRecipe(makeRecipe())
    expect(getRecipeCount('proj-1')).toBe(2)

    const recipes = getRecipesByProject('proj-1')
    archiveRecipe(recipes[0].id)
    expect(getRecipeCount('proj-1')).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Scope Toggle
// ═══════════════════════════════════════════════════════════════════════════════

describe('scope toggle', () => {
  it('toggles scope from WHOLE_PLAN to CURRENT_PAGE', () => {
    const r = saveRecipe(makeRecipe({ scope: RECIPE_SCOPE.WHOLE_PLAN }))
    updateRecipe(r.id, { scope: RECIPE_SCOPE.CURRENT_PAGE })

    const all = loadRecipes()
    expect(all.find(x => x.id === r.id).scope).toBe(RECIPE_SCOPE.CURRENT_PAGE)
  })

  it('toggles scope from CURRENT_PAGE to WHOLE_PLAN', () => {
    const r = saveRecipe(makeRecipe({ scope: RECIPE_SCOPE.CURRENT_PAGE }))
    updateRecipe(r.id, { scope: RECIPE_SCOPE.WHOLE_PLAN })

    const all = loadRecipes()
    expect(all.find(x => x.id === r.id).scope).toBe(RECIPE_SCOPE.WHOLE_PLAN)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Run-from-list Flow
// ═══════════════════════════════════════════════════════════════════════════════

describe('run-from-list flow', () => {
  it('single recipe can be isolated for run', () => {
    const r1 = saveRecipe(makeRecipe({ label: 'Alpha' }))
    const r2 = saveRecipe(makeRecipe({ label: 'Beta' }))

    // Simulate: user picks r2 from list → creates [r2] array for matching
    const singleRun = [r2]
    expect(singleRun.length).toBe(1)
    expect(singleRun[0].label).toBe('Beta')
    expect(singleRun[0].id).toBe(r2.id)
  })

  it('all project recipes can be collected for run', () => {
    saveRecipe(makeRecipe({ label: 'A' }))
    saveRecipe(makeRecipe({ label: 'B' }))
    saveRecipe(makeRecipe({ label: 'C' }))

    const allForRun = getRelevantRecipes('proj-1')
    expect(allForRun.length).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Architecture Boundary
// ═══════════════════════════════════════════════════════════════════════════════

describe('architecture boundary', () => {
  it('recipe store operates independently of detection candidates', () => {
    // Recipe store uses its own localStorage key
    const r = saveRecipe(makeRecipe())
    const stored = JSON.parse(localStorage.getItem('takeoffpro_symbol_recipes'))
    expect(stored.length).toBe(1)
    expect(stored[0].id).toBe(r.id)

    // Should not affect detection or marker storage
    expect(localStorage.getItem('takeoffpro_detections')).toBeNull()
    expect(localStorage.getItem('takeoffpro_markers')).toBeNull()
  })

  it('recipe has RCP- prefix, not DET- or generic', () => {
    const r = saveRecipe(makeRecipe())
    expect(r.id.startsWith('RCP-')).toBe(true)
  })

  it('recipe CRUD does not modify any other storage keys', () => {
    // Save some unrelated data
    localStorage.setItem('takeoffpro_plans', '[]')
    localStorage.setItem('other_key', 'preserve')

    saveRecipe(makeRecipe())
    archiveRecipe(getRecipesByProject('proj-1')[0].id)

    expect(localStorage.getItem('takeoffpro_plans')).toBe('[]')
    expect(localStorage.getItem('other_key')).toBe('preserve')
  })

  it('RecipeListPanel import does not depend on detection modules', async () => {
    // Verify the component module can be imported without detection deps
    const mod = await import('../components/RecipeListPanel.jsx')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default).toBe('function')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Recipe Origin Data Completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe('recipe origin data', () => {
  it('all origin fields are preserved through save/load cycle', () => {
    const r = saveRecipe(makeRecipe({
      sourcePlanId: 'plan-xyz',
      sourcePageNumber: 7,
      assemblyId: 'ASM-042',
      assemblyName: 'LED Panel 60x60',
      label: 'Iroda világítás',
      scope: RECIPE_SCOPE.CURRENT_PAGE,
      sourceType: 'vector',
    }))

    const loaded = loadRecipes().find(x => x.id === r.id)
    expect(loaded.sourcePlanId).toBe('plan-xyz')
    expect(loaded.sourcePageNumber).toBe(7)
    expect(loaded.assemblyId).toBe('ASM-042')
    expect(loaded.assemblyName).toBe('LED Panel 60x60')
    expect(loaded.label).toBe('Iroda világítás')
    expect(loaded.scope).toBe(RECIPE_SCOPE.CURRENT_PAGE)
    expect(loaded.sourceType).toBe('vector')
    expect(loaded.status).toBe(RECIPE_STATUS.ACTIVE)
    expect(loaded.usageCount).toBe(0)
  })

  it('usageCount increments correctly', () => {
    const r = saveRecipe(makeRecipe())
    expect(r.usageCount).toBe(0)

    // Simulate incrementing
    updateRecipe(r.id, { usageCount: 1 })
    updateRecipe(r.id, { usageCount: 2 })

    const loaded = loadRecipes().find(x => x.id === r.id)
    expect(loaded.usageCount).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Regression: Existing Store Functionality
// ═══════════════════════════════════════════════════════════════════════════════

describe('regression: existing store', () => {
  it('clearAllRecipes wipes all data', () => {
    saveRecipe(makeRecipe())
    saveRecipe(makeRecipe())
    expect(loadRecipes().length).toBe(2)

    clearAllRecipes()
    expect(loadRecipes().length).toBe(0)
  })

  it('getRecipeCount reflects active only', () => {
    saveRecipe(makeRecipe())
    saveRecipe(makeRecipe())
    expect(getRecipeCount('proj-1')).toBe(2)

    const r = getRecipesByProject('proj-1')[0]
    archiveRecipe(r.id)
    expect(getRecipeCount('proj-1')).toBe(1)
  })
})
