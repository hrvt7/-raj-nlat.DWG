// ─── Count Object Store ─────────────────────────────────────────────────────
// Persistent storage for CountObject — PlanSwift-style symbol counting context.
//
// A CountObject represents a controlled search intent:
//   "I want to count THIS symbol, in THIS region, at THIS scale mode"
//
// CountObjects are created from seed captures (SymbolRecipe) but add:
//   - explicit search region (bbox on page)
//   - scale mode (exact vs tolerant)
//   - search scope (current_region, current_page, whole_plan)
//
// BOUNDARY: CountObject is a user-intent wrapper around SymbolRecipe.
// It does NOT create markers directly.
// Flow: sample → CountObject → SearchSession → candidates → accepted → markers
//
// Storage: localStorage (lightweight, same pattern as recipeStore)
// ────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'takeoffpro_count_objects'

// ── Scale modes ──────────────────────────────────────────────────────────────

export const SCALE_MODE = /** @type {const} */ ({
  EXACT: 'exact',       // tight NCC threshold, no multi-scale
  TOLERANT: 'tolerant', // relaxed threshold, mild tolerance
})

// ── Search scopes ────────────────────────────────────────────────────────────

export const SEARCH_SCOPE = /** @type {const} */ ({
  CURRENT_REGION: 'current_region',
  CURRENT_PAGE: 'current_page',
  WHOLE_PLAN: 'whole_plan',
})

// ── ID generation ────────────────────────────────────────────────────────────

let _seqCO = 0
export function generateCountObjectId() {
  _seqCO++
  return `CO-${Date.now().toString(36)}-${_seqCO.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Shape factory ────────────────────────────────────────────────────────────

/**
 * Create a CountObject with all required fields.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.planId
 * @param {number} params.pageNumber — 1-based page where sample was taken
 * @param {{ x: number, y: number, w: number, h: number }} params.sampleBbox — PDF scale=1 bbox of seed
 * @param {string} params.sampleCropId — recipe crop ID (references IndexedDB)
 * @param {string} params.assemblyId
 * @param {string} [params.assemblyName]
 * @param {string} [params.label]
 * @param {string} [params.scaleMode] — SCALE_MODE value
 * @param {string} [params.searchScope] — SEARCH_SCOPE value
 * @param {{ x: number, y: number, w: number, h: number }|null} [params.searchRegion] — PDF scale=1 bbox
 * @param {string[]} [params.seedTextHints]
 * @returns {Object} CountObject
 */
export function createCountObject({
  projectId,
  planId,
  pageNumber,
  sampleBbox,
  sampleCropId,
  assemblyId,
  assemblyName = '',
  label = '',
  scaleMode = SCALE_MODE.EXACT,
  searchScope = SEARCH_SCOPE.CURRENT_PAGE,
  searchRegion = null,
  seedTextHints = [],
}) {
  return {
    id: generateCountObjectId(),
    projectId,
    planId,
    pageNumber,
    sampleBbox: { x: sampleBbox.x, y: sampleBbox.y, w: sampleBbox.w, h: sampleBbox.h },
    sampleCropId,
    assemblyId,
    assemblyName,
    label,
    scaleMode,
    searchScope,
    searchRegion: searchRegion ? { x: searchRegion.x, y: searchRegion.y, w: searchRegion.w, h: searchRegion.h } : null,
    seedTextHints: seedTextHints.slice(0, 20),
    createdAt: new Date().toISOString(),
  }
}

// ── Persistence helpers ──────────────────────────────────────────────────────

function _loadAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

function _saveAll(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items))
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Get count objects for a plan.
 * @param {string} planId
 * @returns {Object[]}
 */
export function getCountObjectsByPlan(planId) {
  return _loadAll().filter(co => co.planId === planId)
}

/**
 * Get a single count object by ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getCountObject(id) {
  return _loadAll().find(co => co.id === id) || null
}

/**
 * Save a new CountObject.
 * @param {Object} countObject
 * @returns {Object}
 */
export function saveCountObject(countObject) {
  const all = _loadAll()
  all.push(countObject)
  _saveAll(all)
  return countObject
}

/**
 * Update a CountObject (e.g. change search region, scale mode).
 * @param {string} id
 * @param {Object} updates
 * @returns {Object|null}
 */
export function updateCountObject(id, updates) {
  const all = _loadAll()
  const idx = all.findIndex(co => co.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...updates }
  _saveAll(all)
  return all[idx]
}

/**
 * Delete a CountObject.
 * @param {string} id
 */
export function deleteCountObject(id) {
  const all = _loadAll().filter(co => co.id !== id)
  _saveAll(all)
}

/**
 * Clear all count objects (for testing).
 */
export function clearAllCountObjects() {
  localStorage.removeItem(LS_KEY)
}
