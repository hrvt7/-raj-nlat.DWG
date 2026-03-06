/**
 * DetectionRun Store — local-first persistence for auto-detection history.
 *
 * Stores DetectionRun records in IndexedDB (via localforage) so that
 * detection results survive panel close, page reload, and browser restart.
 *
 * Each DetectionRun captures:
 *   - which plans + templates were used
 *   - every detection candidate with score
 *   - user review decisions (accepted/rejected)
 *   - back-references to created markers
 *
 * Retention: max MAX_RUNS_PER_PROJECT per project (oldest dropped).
 */

import localforage from 'localforage'

const detectionRunsDb = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'detection_runs',
  description: 'Auto-detection run history with review decisions',
})

/** Maximum runs kept per project (oldest are pruned automatically). */
const MAX_RUNS_PER_PROJECT = 5

// ── ID generation ─────────────────────────────────────────────────────────────

let _seq = 0
export function generateRunId() {
  return `DRUN-${Date.now().toString(36)}-${(++_seq).toString(36)}`
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Create and persist a new DetectionRun.
 *
 * @param {object} opts
 * @param {string}   opts.projectId
 * @param {string[]} opts.planIds     — plans that were scanned
 * @param {string[]} opts.templateIds — templates used for matching
 * @returns {object} the created run (status='running', empty results)
 */
export async function createDetectionRun({ projectId, planIds, templateIds }) {
  const run = {
    id: generateRunId(),
    projectId:    projectId || null,
    planIds:      planIds || [],
    templateIds:  templateIds || [],
    startedAt:    new Date().toISOString(),
    completedAt:  null,
    status:       'running',  // running | completed | failed | applied
    results:      [],         // DetectionResult[]
    createdAt:    new Date().toISOString(),
  }
  await detectionRunsDb.setItem(run.id, run)
  return run
}

/**
 * Update an existing DetectionRun (merge fields).
 *
 * @param {string} runId
 * @param {object} patch — partial fields to merge
 * @returns {object|null} updated run or null if not found
 */
export async function updateDetectionRun(runId, patch) {
  const existing = await detectionRunsDb.getItem(runId)
  if (!existing) return null
  const updated = { ...existing, ...patch }
  await detectionRunsDb.setItem(runId, updated)
  return updated
}

/**
 * Get a single run by ID.
 * @param {string} runId
 * @returns {object|null}
 */
export async function getDetectionRun(runId) {
  return await detectionRunsDb.getItem(runId) || null
}

/**
 * List all runs for a given project, newest first.
 * Prunes excess runs beyond MAX_RUNS_PER_PROJECT automatically.
 *
 * @param {string} projectId
 * @returns {object[]} runs sorted by startedAt DESC
 */
export async function listDetectionRuns(projectId) {
  const all = []
  await detectionRunsDb.iterate((run) => {
    if (run.projectId === projectId) all.push(run)
  })
  // Sort newest first
  all.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))

  // Auto-prune old runs
  if (all.length > MAX_RUNS_PER_PROJECT) {
    const toRemove = all.splice(MAX_RUNS_PER_PROJECT)
    for (const old of toRemove) {
      await detectionRunsDb.removeItem(old.id)
    }
  }
  return all
}

/**
 * Delete a single run.
 * @param {string} runId
 */
export async function deleteDetectionRun(runId) {
  await detectionRunsDb.removeItem(runId)
}

/**
 * Set the back-reference markerId on a specific detection result
 * within a run, after the marker is created from that detection.
 *
 * @param {string} runId
 * @param {string} detectionResultId — the result's id within results[]
 * @param {string} markerId — the created marker's id
 */
export async function linkDetectionToMarker(runId, detectionResultId, markerId) {
  const run = await detectionRunsDb.getItem(runId)
  if (!run) return
  const result = run.results.find(r => r.id === detectionResultId)
  if (result) {
    result.markerId = markerId
    await detectionRunsDb.setItem(run.id, run)
  }
}
