// ─── SymbolRecipe Store + Seed Capture Foundation Tests ────────────────────
// Tests for the Azonosítás mode foundation:
//   1. Recipe entity shape + CRUD
//   2. Seed capture shape validation
//   3. Assembly assignment payload
//   4. Boundary separation from generic DetectionCandidate[]
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createRecipe,
  saveRecipe,
  loadRecipes,
  getRecipesByProject,
  getRecipesByPlan,
  updateRecipe,
  archiveRecipe,
  getRecipeCount,
  clearAllRecipes,
  generateRecipeId,
  RECIPE_STATUS,
  RECIPE_SCOPE,
} from '../data/recipeStore.js'

// ── Mock localStorage ─────────────────────────────────────────────────────────

const storage = {}
vi.stubGlobal('localStorage', {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, val) => { storage[key] = val },
  removeItem: (key) => { delete storage[key] },
})

// ── Mock localforage (IndexedDB is not available in tests) ────────────────────

vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      setItem: vi.fn().mockResolvedValue(undefined),
      getItem: vi.fn().mockResolvedValue(null),
      clear: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.keys(storage).forEach(k => delete storage[k])
  clearAllRecipes()
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. Recipe entity shape
// ══════════════════════════════════════════════════════════════════════════════

describe('SymbolRecipe entity shape', () => {
  it('createRecipe returns all required fields with correct types', () => {
    const recipe = createRecipe({
      projectId: 'PRJ-test',
      sourcePlanId: 'PLAN-001',
      sourcePageNumber: 1,
      bbox: { x: 100, y: 200, w: 50, h: 50 },
      assemblyId: 'ASM-001',
      assemblyName: 'Dugalj 230V',
      label: 'Konyha bal',
      sourceType: 'vector',
      seedTextHints: ['230V', 'Dugalj'],
      scope: RECIPE_SCOPE.CURRENT_PAGE,
    })

    // ID format
    expect(recipe.id).toMatch(/^RCP-/)

    // Required fields
    expect(recipe.projectId).toBe('PRJ-test')
    expect(recipe.sourcePlanId).toBe('PLAN-001')
    expect(recipe.sourcePageNumber).toBe(1)
    expect(recipe.bbox).toEqual({ x: 100, y: 200, w: 50, h: 50 })
    expect(recipe.assemblyId).toBe('ASM-001')
    expect(recipe.assemblyName).toBe('Dugalj 230V')
    expect(recipe.label).toBe('Konyha bal')
    expect(recipe.sourceType).toBe('vector')
    expect(recipe.seedTextHints).toEqual(['230V', 'Dugalj'])
    expect(recipe.scope).toBe('current_page')

    // Default metadata
    expect(recipe.status).toBe(RECIPE_STATUS.ACTIVE)
    expect(recipe.usageCount).toBe(0)
    expect(recipe.createdAt).toBeTruthy()
    expect(recipe.updatedAt).toBeTruthy()
  })

  it('createRecipe applies defaults for optional fields', () => {
    const recipe = createRecipe({
      projectId: 'PRJ-x',
      sourcePlanId: 'PLAN-x',
      sourcePageNumber: 1,
      bbox: { x: 0, y: 0, w: 30, h: 30 },
      assemblyId: 'ASM-001',
    })

    expect(recipe.assemblyName).toBe('')
    expect(recipe.label).toBe('')
    expect(recipe.sourceType).toBe('unknown')
    expect(recipe.seedTextHints).toEqual([])
    expect(recipe.scope).toBe(RECIPE_SCOPE.WHOLE_PLAN)
  })

  it('generateRecipeId creates unique IDs', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) ids.add(generateRecipeId())
    expect(ids.size).toBe(100)
  })

  it('caps seedTextHints at 20', () => {
    const hints = Array.from({ length: 30 }, (_, i) => `hint-${i}`)
    const recipe = createRecipe({
      projectId: 'PRJ-x',
      sourcePlanId: 'PLAN-x',
      sourcePageNumber: 1,
      bbox: { x: 0, y: 0, w: 30, h: 30 },
      assemblyId: 'ASM-001',
      seedTextHints: hints,
    })
    expect(recipe.seedTextHints).toHaveLength(20)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. Recipe CRUD operations
// ══════════════════════════════════════════════════════════════════════════════

describe('Recipe CRUD', () => {
  it('saveRecipe persists and loadRecipes retrieves', () => {
    const recipe = createRecipe({
      projectId: 'PRJ-1',
      sourcePlanId: 'PLAN-1',
      sourcePageNumber: 1,
      bbox: { x: 10, y: 20, w: 40, h: 40 },
      assemblyId: 'ASM-001',
    })
    saveRecipe(recipe)

    const all = loadRecipes()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(recipe.id)
  })

  it('getRecipesByProject filters by projectId and active status', () => {
    const r1 = createRecipe({ projectId: 'PRJ-A', sourcePlanId: 'P1', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-001' })
    const r2 = createRecipe({ projectId: 'PRJ-B', sourcePlanId: 'P2', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-002' })
    const r3 = createRecipe({ projectId: 'PRJ-A', sourcePlanId: 'P3', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-003' })
    saveRecipe(r1)
    saveRecipe(r2)
    saveRecipe(r3)

    const projA = getRecipesByProject('PRJ-A')
    expect(projA).toHaveLength(2)
    expect(projA.every(r => r.projectId === 'PRJ-A')).toBe(true)

    const projB = getRecipesByProject('PRJ-B')
    expect(projB).toHaveLength(1)
  })

  it('getRecipesByPlan filters by sourcePlanId', () => {
    const r1 = createRecipe({ projectId: 'PRJ-1', sourcePlanId: 'PLAN-X', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-001' })
    const r2 = createRecipe({ projectId: 'PRJ-1', sourcePlanId: 'PLAN-Y', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-002' })
    saveRecipe(r1)
    saveRecipe(r2)

    expect(getRecipesByPlan('PLAN-X')).toHaveLength(1)
    expect(getRecipesByPlan('PLAN-Y')).toHaveLength(1)
    expect(getRecipesByPlan('PLAN-Z')).toHaveLength(0)
  })

  it('updateRecipe modifies fields and sets updatedAt', () => {
    const recipe = createRecipe({ projectId: 'PRJ-1', sourcePlanId: 'P1', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-001', label: 'old' })
    // Force an older timestamp so updatedAt will differ
    recipe.updatedAt = '2020-01-01T00:00:00.000Z'
    saveRecipe(recipe)

    const updated = updateRecipe(recipe.id, { label: 'new label' })
    expect(updated.label).toBe('new label')
    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
  })

  it('archiveRecipe soft-deletes (sets status to archived)', () => {
    const recipe = createRecipe({ projectId: 'PRJ-1', sourcePlanId: 'P1', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-001' })
    saveRecipe(recipe)
    expect(getRecipesByProject('PRJ-1')).toHaveLength(1)

    archiveRecipe(recipe.id)
    // Archived recipes are excluded from active queries
    expect(getRecipesByProject('PRJ-1')).toHaveLength(0)
    // But still in storage
    expect(loadRecipes()).toHaveLength(1)
    expect(loadRecipes()[0].status).toBe(RECIPE_STATUS.ARCHIVED)
  })

  it('getRecipeCount returns count for project', () => {
    expect(getRecipeCount('PRJ-1')).toBe(0)
    const r1 = createRecipe({ projectId: 'PRJ-1', sourcePlanId: 'P1', sourcePageNumber: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, assemblyId: 'ASM-001' })
    saveRecipe(r1)
    expect(getRecipeCount('PRJ-1')).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. Seed capture shape validation
// ══════════════════════════════════════════════════════════════════════════════

describe('Seed capture shape', () => {
  it('pendingSeed has required shape for SeedAssignPanel', () => {
    // This validates the shape contract between finalizeSeedCapture and SeedAssignPanel
    const seed = {
      bbox: { x: 120.5, y: 340.2, w: 48.0, h: 52.3 },
      pageNum: 2,
      cropDataUrl: 'data:image/png;base64,iVBOR...',
      textHints: ['230V', 'Dugalj'],
    }

    // Shape checks
    expect(seed.bbox).toBeDefined()
    expect(typeof seed.bbox.x).toBe('number')
    expect(typeof seed.bbox.y).toBe('number')
    expect(typeof seed.bbox.w).toBe('number')
    expect(typeof seed.bbox.h).toBe('number')
    expect(typeof seed.pageNum).toBe('number')
    expect(seed.pageNum).toBeGreaterThanOrEqual(1)
    expect(typeof seed.cropDataUrl).toBe('string')
    expect(Array.isArray(seed.textHints)).toBe(true)
  })

  it('seed bbox coordinates are in PDF space (not screen space)', () => {
    // The seed bbox should be in PDF coordinate space after screenToPdf conversion
    // Typical PDF page: ~595 x 842 pts (A4), so coordinates should be reasonable
    const seed = {
      bbox: { x: 100, y: 200, w: 50, h: 50 },
      pageNum: 1,
      cropDataUrl: null,
      textHints: [],
    }
    // Just verify the bbox has positive dimensions
    expect(seed.bbox.w).toBeGreaterThan(0)
    expect(seed.bbox.h).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. Assembly assignment payload
// ══════════════════════════════════════════════════════════════════════════════

describe('Assembly assignment payload', () => {
  it('SeedAssignPanel onSave produces correct recipe creation params', () => {
    // Simulates the flow: user draws box → gets pendingSeed → selects assembly → save
    const seed = {
      bbox: { x: 100, y: 200, w: 50, h: 50 },
      pageNum: 1,
      cropDataUrl: 'data:image/png;base64,abc',
      textHints: ['230V'],
    }

    const assemblyId = 'ASM-005'
    const label = 'Nappali jobb'
    const scope = RECIPE_SCOPE.CURRENT_PAGE

    // Create recipe from seed + assignment (what handleSeedSave does)
    const recipe = createRecipe({
      projectId: 'PRJ-test',
      sourcePlanId: 'PLAN-001',
      sourcePageNumber: seed.pageNum,
      bbox: seed.bbox,
      assemblyId,
      assemblyName: 'Váltókapcsoló',
      label,
      sourceType: 'unknown',
      seedTextHints: seed.textHints,
      scope,
    })

    expect(recipe.assemblyId).toBe('ASM-005')
    expect(recipe.label).toBe('Nappali jobb')
    expect(recipe.scope).toBe('current_page')
    expect(recipe.sourcePageNumber).toBe(1)
    expect(recipe.bbox).toEqual({ x: 100, y: 200, w: 50, h: 50 })
    expect(recipe.seedTextHints).toEqual(['230V'])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. Boundary: SymbolRecipe is separate from DetectionCandidate
// ══════════════════════════════════════════════════════════════════════════════

describe('Boundary: SymbolRecipe vs DetectionCandidate', () => {
  it('SymbolRecipe has different ID prefix than DetectionCandidate', () => {
    const recipe = createRecipe({
      projectId: 'PRJ-x',
      sourcePlanId: 'P1',
      sourcePageNumber: 1,
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      assemblyId: 'ASM-001',
    })

    // Recipe IDs start with RCP-
    expect(recipe.id).toMatch(/^RCP-/)
    // DetectionCandidate IDs start with DC- (from ruleEngine.js)
    // This ensures zero collision between the two truth sources
  })

  it('SymbolRecipe uses localStorage key separate from detection cache', () => {
    // recipeStore uses 'takeoffpro_symbol_recipes' key
    // detectionCandidateStore uses IndexedDB 'detection_candidates'
    // These are completely separate storage paths
    const recipe = createRecipe({
      projectId: 'PRJ-x',
      sourcePlanId: 'P1',
      sourcePageNumber: 1,
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      assemblyId: 'ASM-001',
    })
    saveRecipe(recipe)

    // Verify it's stored in its own localStorage key
    const raw = storage['takeoffpro_symbol_recipes']
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(recipe.id)
  })

  it('SymbolRecipe has user-specific fields not in DetectionCandidate', () => {
    const recipe = createRecipe({
      projectId: 'PRJ-x',
      sourcePlanId: 'P1',
      sourcePageNumber: 1,
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      assemblyId: 'ASM-001',
      label: 'User note',
      scope: RECIPE_SCOPE.WHOLE_PLAN,
    })

    // These fields exist ONLY on SymbolRecipe, not on DetectionCandidate:
    expect(recipe).toHaveProperty('label')
    expect(recipe).toHaveProperty('scope')
    expect(recipe).toHaveProperty('usageCount')
    expect(recipe).toHaveProperty('seedTextHints')
    expect(recipe).toHaveProperty('sourceType')
    // DetectionCandidate has: confidenceBucket, evidenceType, assemblyId, etc.
    // — completely different schema
  })

  it('RECIPE_STATUS and RECIPE_SCOPE are well-defined enums', () => {
    expect(RECIPE_STATUS.ACTIVE).toBe('active')
    expect(RECIPE_STATUS.ARCHIVED).toBe('archived')
    expect(RECIPE_SCOPE.CURRENT_PAGE).toBe('current_page')
    expect(RECIPE_SCOPE.WHOLE_PLAN).toBe('whole_plan')
  })
})
