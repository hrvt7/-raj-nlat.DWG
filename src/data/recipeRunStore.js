// ─── Recipe Run Store ──────────────────────────────────────────────────────────
// Lightweight per-plan recipe run history.
// Stores the last MAX_RUNS_PER_PLAN runs in localStorage.
//
// NOT an enterprise audit trail — purely for short-term user visibility:
// "what did I just run, what happened, can I undo?"
//
// Provenance fields (recipeId, batchId, appliedAt) come from markerModel;
// this store adds run-level aggregation on top.
// ────────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'takeoffpro_recipe_runs'
const MAX_RUNS_PER_PLAN = 10

// ── ID generator ──

export function generateRunId() {
  return `RUN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Run shape factory ──

/**
 * @typedef {Object} RecipeRunRecord
 * @property {string} runId
 * @property {string} planId
 * @property {string} createdAt — ISO 8601
 * @property {'current_page'|'whole_plan'} scope
 * @property {string[]} recipeIds
 * @property {number} recipeCount
 * @property {number} totalMatches — NCC candidates found
 * @property {number} acceptedCount — user-accepted matches
 * @property {number} appliedMarkerCount — markers actually created (post-dedup)
 * @property {number} skippedCount — dedup/overlap skipped
 * @property {Object<string,number>} assemblySummary — { assemblyName: count }
 * @property {string|null} batchId — linked to apply batch
 * @property {boolean} undoAvailable
 * @property {string|null} undoneAt — ISO timestamp when undo was performed
 */

/**
 * Create a new run record with sensible defaults.
 * All fields may be overridden.
 * @param {Partial<RecipeRunRecord> & { planId: string }} fields
 * @returns {RecipeRunRecord}
 */
export function createRunRecord(fields) {
  return {
    runId: fields.runId || generateRunId(),
    planId: fields.planId,
    createdAt: fields.createdAt || new Date().toISOString(),
    scope: fields.scope || 'whole_plan',
    recipeIds: fields.recipeIds || [],
    recipeCount: fields.recipeCount ?? 0,
    totalMatches: fields.totalMatches ?? 0,
    acceptedCount: fields.acceptedCount ?? 0,
    appliedMarkerCount: fields.appliedMarkerCount ?? 0,
    skippedCount: fields.skippedCount ?? 0,
    assemblySummary: fields.assemblySummary || {},
    batchId: fields.batchId || null,
    undoAvailable: fields.undoAvailable ?? false,
    undoneAt: fields.undoneAt || null,
  }
}

// ── Persistence helpers ──

function _loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function _saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ── CRUD ──

/**
 * Get runs for a plan, newest-first.
 * @param {string} planId
 * @returns {RecipeRunRecord[]}
 */
export function getRunsByPlan(planId) {
  const all = _loadAll()
  const runs = all[planId] || []
  // Always return newest-first
  return [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Get the most recent run for a plan, or null.
 * @param {string} planId
 * @returns {RecipeRunRecord|null}
 */
export function getLastRun(planId) {
  const runs = getRunsByPlan(planId)
  return runs[0] || null
}

/**
 * Save a new run record.
 * Enforces MAX_RUNS_PER_PLAN by trimming oldest entries.
 * @param {RecipeRunRecord} run
 * @returns {RecipeRunRecord}
 */
export function saveRun(run) {
  const all = _loadAll()
  const runs = all[run.planId] || []
  runs.push(run)
  // Sort newest-first, trim to limit
  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  all[run.planId] = runs.slice(0, MAX_RUNS_PER_PLAN)
  _saveAll(all)
  return run
}

/**
 * Update a run record by runId.
 * @param {string} planId
 * @param {string} runId
 * @param {Partial<RecipeRunRecord>} updates
 * @returns {RecipeRunRecord|null}
 */
export function updateRun(planId, runId, updates) {
  const all = _loadAll()
  const runs = all[planId] || []
  const idx = runs.findIndex(r => r.runId === runId)
  if (idx < 0) return null
  runs[idx] = { ...runs[idx], ...updates }
  all[planId] = runs
  _saveAll(all)
  return runs[idx]
}

/**
 * Mark a run as undone.
 * @param {string} planId
 * @param {string} runId
 * @returns {RecipeRunRecord|null}
 */
export function markRunUndone(planId, runId) {
  return updateRun(planId, runId, {
    undoAvailable: false,
    undoneAt: new Date().toISOString(),
  })
}

/**
 * Find a run by batchId.
 * @param {string} planId
 * @param {string} batchId
 * @returns {RecipeRunRecord|null}
 */
export function getRunByBatchId(planId, batchId) {
  const runs = getRunsByPlan(planId)
  return runs.find(r => r.batchId === batchId) || null
}

/**
 * Clear all runs for a plan (for testing).
 * @param {string} planId
 */
export function clearRunsForPlan(planId) {
  const all = _loadAll()
  delete all[planId]
  _saveAll(all)
}

/**
 * Clear ALL run data (for testing).
 */
export function clearAllRuns() {
  localStorage.removeItem(STORAGE_KEY)
}
