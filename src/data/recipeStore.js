// ─── SymbolRecipe Store ──────────────────────────────────────────────────────
// Persistent project-scoped storage for user-captured symbol recipes.
//
// A SymbolRecipe is a seed capture: a bounding box on a specific PDF page
// linked to an assembly. This is the foundation for future similarity search.
//
// BOUNDARY: This is NOT the generic DetectionCandidate[] truth source.
// Recipes are user-taught seeds — they do NOT generate markers automatically.
//
// Storage:
//   - Metadata → localStorage (fast, synchronous reads)
//   - Crop snapshots → IndexedDB via localforage (large blobs)
// ──────────────────────────────────────────────────────────────────────────────

import localforage from 'localforage'

// ── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'takeoffpro_symbol_recipes'

export const RECIPE_STATUS = /** @type {const} */ ({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
})

export const RECIPE_SCOPE = /** @type {const} */ ({
  CURRENT_PAGE: 'current_page',
  WHOLE_PLAN: 'whole_plan',
})

// ── IndexedDB store for crop snapshots ──────────────────────────────────────

const recipeCropStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'recipe_crops',
  description: 'Crop snapshot images for symbol recipes',
})

// ── ID generation ────────────────────────────────────────────────────────────

let _seqCounter = 0
export function generateRecipeId() {
  _seqCounter++
  return `RCP-${Date.now().toString(36)}-${_seqCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Shape factory ────────────────────────────────────────────────────────────

/**
 * Create a SymbolRecipe object with all required fields.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.sourcePlanId
 * @param {number} params.sourcePageNumber — 1-based
 * @param {{ x: number, y: number, w: number, h: number }} params.bbox — PDF coordinate space
 * @param {string} params.assemblyId — primary assembly (e.g. 'ASM-001')
 * @param {string} [params.assemblyName] — snapshot of assembly name at capture time
 * @param {string} [params.label] — user label / note
 * @param {string} [params.sourceType] — 'vector' | 'raster' | 'mixed' | 'unknown'
 * @param {string[]} [params.seedTextHints] — nearby text strings from PDF
 * @param {string} [params.scope] — RECIPE_SCOPE value
 * @returns {import('./recipeStore.js').SymbolRecipe}
 */
export function createRecipe({
  projectId,
  sourcePlanId,
  sourcePageNumber,
  bbox,
  assemblyId,
  assemblyName = '',
  label = '',
  sourceType = 'unknown',
  seedTextHints = [],
  scope = RECIPE_SCOPE.WHOLE_PLAN,
}) {
  const now = new Date().toISOString()
  return {
    id: generateRecipeId(),
    projectId,
    sourcePlanId,
    sourcePageNumber,
    bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
    assemblyId,
    assemblyName,
    label,
    sourceType,
    seedTextHints: seedTextHints.slice(0, 20), // cap at 20 hints
    scope,
    status: RECIPE_STATUS.ACTIVE,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

// ── CRUD operations ──────────────────────────────────────────────────────────

function _loadAll() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function _saveAll(recipes) {
  localStorage.setItem(LS_KEY, JSON.stringify(recipes))
}

/**
 * Load all recipes.
 * @returns {SymbolRecipe[]}
 */
export function loadRecipes() {
  return _loadAll()
}

/**
 * Get recipes for a specific project.
 * @param {string} projectId
 * @returns {SymbolRecipe[]}
 */
export function getRecipesByProject(projectId) {
  return _loadAll().filter(r => r.projectId === projectId && r.status === RECIPE_STATUS.ACTIVE)
}

/**
 * Get recipes for a specific plan.
 * @param {string} planId
 * @returns {SymbolRecipe[]}
 */
export function getRecipesByPlan(planId) {
  return _loadAll().filter(r => r.sourcePlanId === planId && r.status === RECIPE_STATUS.ACTIVE)
}

/**
 * Save a new recipe + optional crop snapshot.
 * @param {SymbolRecipe} recipe
 * @param {string|null} [cropDataUrl] — base64 data URL of crop snapshot
 * @returns {SymbolRecipe}
 */
export function saveRecipe(recipe, cropDataUrl = null) {
  const all = _loadAll()
  all.push(recipe)
  _saveAll(all)

  // Save crop to IndexedDB (fire-and-forget)
  if (cropDataUrl) {
    recipeCropStore.setItem(recipe.id, cropDataUrl).catch(err => {
      console.warn('[recipeStore] crop save failed:', err.message)
    })
  }

  return recipe
}

/**
 * Update an existing recipe.
 * @param {string} recipeId
 * @param {Partial<SymbolRecipe>} updates
 * @returns {SymbolRecipe|null}
 */
export function updateRecipe(recipeId, updates) {
  const all = _loadAll()
  const idx = all.findIndex(r => r.id === recipeId)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() }
  _saveAll(all)
  return all[idx]
}

/**
 * Delete a recipe (soft delete — sets status to archived).
 * @param {string} recipeId
 */
export function archiveRecipe(recipeId) {
  updateRecipe(recipeId, { status: RECIPE_STATUS.ARCHIVED })
}

/**
 * Get crop snapshot for a recipe.
 * @param {string} recipeId
 * @returns {Promise<string|null>} — data URL or null
 */
export async function getRecipeCrop(recipeId) {
  try {
    return await recipeCropStore.getItem(recipeId)
  } catch {
    return null
  }
}

/**
 * Increment usage count for a recipe (called by future matching engine).
 * @param {string} recipeId
 */
export function incrementRecipeUsage(recipeId) {
  updateRecipe(recipeId, { usageCount: (_loadAll().find(r => r.id === recipeId)?.usageCount || 0) + 1 })
}

/**
 * Get recipe count for a project.
 * @param {string} projectId
 * @returns {number}
 */
export function getRecipeCount(projectId) {
  return getRecipesByProject(projectId).length
}

/**
 * Get relevant recipes for a plan, filtered by plan metadata similarity.
 * Falls back to all project recipes if no metadata match is possible.
 *
 * Relevance criteria (when plan meta is available):
 *   - Same floor → highest relevance
 *   - Same systemType → high relevance
 *   - Same docType → moderate relevance
 *   - Different meta → still included but ranked lower
 *
 * Always sorted: relevance desc, then usageCount desc, then newest first.
 *
 * @param {string} projectId
 * @param {Object} [planMeta] — { floor, systemType, docType }
 * @returns {SymbolRecipe[]} — sorted by relevance
 */
export function getRelevantRecipes(projectId, planMeta = null) {
  const all = getRecipesByProject(projectId)
  if (!all.length) return []

  // If no plan metadata, fall back to all project recipes (backward compat)
  if (!planMeta || (!planMeta.floor && !planMeta.systemType && !planMeta.docType)) {
    return all.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
  }

  // Load source plan meta for each recipe to score relevance
  // We use the recipe's sourcePlanId to look up stored plan metadata.
  // Plan metadata is stored in localStorage under plan entries.
  const scored = all.map(recipe => {
    let relevance = 0
    const sourceMeta = _getPlanMeta(recipe.sourcePlanId)

    if (sourceMeta) {
      if (planMeta.floor && sourceMeta.floor && planMeta.floor === sourceMeta.floor) relevance += 3
      if (planMeta.systemType && sourceMeta.systemType && planMeta.systemType === sourceMeta.systemType) relevance += 2
      if (planMeta.docType && sourceMeta.docType && planMeta.docType === sourceMeta.docType) relevance += 1
    }

    return { recipe, relevance }
  })

  scored.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance
    const usageDiff = (b.recipe.usageCount || 0) - (a.recipe.usageCount || 0)
    if (usageDiff !== 0) return usageDiff
    return (b.recipe.createdAt || '').localeCompare(a.recipe.createdAt || '')
  })

  return scored.map(s => s.recipe)
}

/**
 * Get count of relevant recipes for a plan.
 * @param {string} projectId
 * @param {Object} [planMeta]
 * @returns {number}
 */
export function getRelevantRecipeCount(projectId, planMeta = null) {
  return getRelevantRecipes(projectId, planMeta).length
}

/**
 * Load plan metadata from localStorage.
 * Plan entries may store floor, systemType, docType.
 * @param {string} planId
 * @returns {{ floor?: string, systemType?: string, docType?: string }|null}
 */
function _getPlanMeta(planId) {
  if (!planId) return null
  try {
    // Plans are stored under 'takeoffpro_plans' key
    const raw = localStorage.getItem('takeoffpro_plans')
    if (!raw) return null
    const plans = JSON.parse(raw)
    const plan = Array.isArray(plans)
      ? plans.find(p => p.id === planId)
      : plans[planId]
    if (!plan) return null
    return {
      floor: plan.floor || null,
      systemType: plan.systemType || null,
      docType: plan.docType || null,
    }
  } catch {
    return null
  }
}

/**
 * Clear all recipes (for testing).
 */
export function clearAllRecipes() {
  _saveAll([])
  recipeCropStore.clear().catch(() => {})
}
