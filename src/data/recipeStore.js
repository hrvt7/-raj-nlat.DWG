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

export const MATCH_STRICTNESS = /** @type {const} */ ({
  STRICT: 'strict',
  BALANCED: 'balanced',
  BROAD: 'broad',
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
 * @param {string} [params.matchStrictness] — MATCH_STRICTNESS value
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
  matchStrictness = MATCH_STRICTNESS.BALANCED,
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
    matchStrictness,
    status: RECIPE_STATUS.ACTIVE,
    usageCount: 0,
    lastRunStats: null, // { accepted, rejected, total } — set after matching runs
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
 * Get ALL recipes for a project (including archived).
 * Used by RecipeListPanel to show archived recipes for restore.
 * @param {string} projectId
 * @returns {SymbolRecipe[]}
 */
export function getAllRecipesByProject(projectId) {
  return _loadAll().filter(r => r.projectId === projectId)
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
 *
 * Returns the recipe synchronously for immediate use.
 * The crop persist promise is exposed as `recipe._cropSaved` for callers
 * that need to ensure the crop is written before running matching.
 *
 * @param {SymbolRecipe} recipe
 * @param {string|null} [cropDataUrl] — base64 data URL of crop snapshot
 * @returns {SymbolRecipe}
 */
export function saveRecipe(recipe, cropDataUrl = null) {
  const all = _loadAll()
  all.push(recipe)
  _saveAll(all)

  // Save crop to IndexedDB — expose promise so callers can await if needed
  if (cropDataUrl) {
    recipe._cropSaved = recipeCropStore.setItem(recipe.id, cropDataUrl).catch(err => {
      console.warn('[recipeStore] crop save failed:', err.message)
    })
  } else {
    recipe._cropSaved = Promise.resolve()
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
 * Restore an archived recipe (unarchive).
 * @param {string} recipeId
 * @returns {SymbolRecipe|null}
 */
export function restoreRecipe(recipeId) {
  return updateRecipe(recipeId, { status: RECIPE_STATUS.ACTIVE })
}

/**
 * Update run stats for a recipe after matching completes.
 * @param {string} recipeId
 * @param {{ accepted: number, rejected: number, total: number }} stats
 * @returns {SymbolRecipe|null}
 */
export function updateRecipeRunStats(recipeId, stats) {
  return updateRecipe(recipeId, { lastRunStats: stats })
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

// ── Recommended recipe set ──────────────────────────────────────────────────
// Builds a ranked recommendation: separates "recommended" (high-quality,
// relevant) recipes from "rest" with human-readable reasons.
//
// Scoring combines:
//   - planMeta relevance (floor +3, systemType +2, docType +1)
//   - quality bonus: lastRunStats accept rate ≥ 70% → +3, ≥ 50% → +1
//   - quality penalty: accept rate < 30% → -2
//   - usageCount tiebreak
//
// "Recommended" = score ≥ RECOMMENDED_THRESHOLD (2)
// ─────────────────────────────────────────────────────────────────────────────

const RECOMMENDED_THRESHOLD = 2

/**
 * Compute a recommendation score for a recipe relative to a target plan.
 * @param {SymbolRecipe} recipe
 * @param {Object|null} planMeta — { floor, systemType, docType }
 * @returns {{ score: number, reasons: string[] }}
 */
export function scoreRecipeRecommendation(recipe, planMeta) {
  let score = 0
  const reasons = []

  // ── Plan meta relevance ──
  if (planMeta) {
    const sourceMeta = _getPlanMeta(recipe.sourcePlanId)
    if (sourceMeta) {
      if (planMeta.floor && sourceMeta.floor && planMeta.floor === sourceMeta.floor) {
        score += 3
        reasons.push('same_floor')
      }
      if (planMeta.systemType && sourceMeta.systemType && planMeta.systemType === sourceMeta.systemType) {
        score += 2
        reasons.push('same_system')
      }
      if (planMeta.docType && sourceMeta.docType && planMeta.docType === sourceMeta.docType) {
        score += 1
        reasons.push('same_doc_type')
      }
    }
  }

  // ── Quality bonus / penalty ──
  const stats = recipe.lastRunStats
  if (stats && stats.total > 0) {
    const acceptRate = stats.accepted / stats.total
    if (acceptRate >= 0.7) {
      score += 3
      reasons.push('high_quality')
    } else if (acceptRate >= 0.5) {
      score += 1
      reasons.push('ok_quality')
    } else if (acceptRate < 0.3) {
      score -= 2
      reasons.push('low_quality')
    }
  }

  // ── Usage bonus (mild) ──
  if ((recipe.usageCount || 0) >= 3) {
    score += 1
    reasons.push('frequently_used')
  }

  return { score, reasons }
}

/**
 * Get recommended recipe set for a plan within a project.
 *
 * Returns { recommended, rest, reasons } where:
 *   - recommended: recipes with score ≥ threshold, sorted by score desc
 *   - rest: remaining active recipes, sorted by score desc
 *   - reasons: human-readable summary strings
 *
 * @param {string} projectId
 * @param {Object|null} [planMeta] — { floor, systemType, docType }
 * @returns {{ recommended: SymbolRecipe[], rest: SymbolRecipe[], reasons: string[] }}
 */
export function getRecommendedRecipeSet(projectId, planMeta = null) {
  const all = getRecipesByProject(projectId) // active only
  if (!all.length) return { recommended: [], rest: [], reasons: [] }

  const scored = all.map(recipe => {
    const { score, reasons } = scoreRecipeRecommendation(recipe, planMeta)
    return { recipe, score, reasons }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const usageDiff = (b.recipe.usageCount || 0) - (a.recipe.usageCount || 0)
    if (usageDiff !== 0) return usageDiff
    return (b.recipe.createdAt || '').localeCompare(a.recipe.createdAt || '')
  })

  const recommended = []
  const rest = []
  const reasonSet = new Set()

  for (const item of scored) {
    if (item.score >= RECOMMENDED_THRESHOLD) {
      recommended.push(item.recipe)
      item.reasons.forEach(r => reasonSet.add(r))
    } else {
      rest.push(item.recipe)
    }
  }

  // Build human-readable reasons
  const reasons = []
  if (reasonSet.has('same_floor')) reasons.push('Azonos emelet')
  if (reasonSet.has('same_system')) reasons.push('Azonos rendszer')
  if (reasonSet.has('high_quality')) reasons.push('Magas találati arány')
  if (reasonSet.has('frequently_used')) reasons.push('Gyakran használt')

  return { recommended, rest, reasons }
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
