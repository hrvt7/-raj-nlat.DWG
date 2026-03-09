// ─── Search Session Store ────────────────────────────────────────────────────
// Persistent storage for SearchSession — a single search execution context.
//
// A SearchSession tracks one run of a CountObject:
//   - which CountObject was searched
//   - what scope/region was used
//   - how many candidates were found
//   - candidate-level state (accepted/ignored)
//   - accepted-only materialization as endpoint
//
// BOUNDARY: SearchSession does NOT create markers.
// The materialization step reads accepted candidates from the session
// and converts them into markers in a separate, explicit step.
//
// Flow: CountObject → SearchSession → candidates → review → accept → materialize
//
// Storage: localStorage
// ────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'takeoffpro_search_sessions'
const MAX_SESSIONS_PER_PLAN = 20

// ── Candidate status ─────────────────────────────────────────────────────────

export const CANDIDATE_STATUS = /** @type {const} */ ({
  PENDING: 'pending',     // not yet reviewed
  ACCEPTED: 'accepted',   // user approved → will become marker
  IGNORED: 'ignored',     // user rejected → won't become marker
})

// ── ID generation ────────────────────────────────────────────────────────────

let _seqSS = 0
export function generateSessionId() {
  _seqSS++
  return `SS-${Date.now().toString(36)}-${_seqSS.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

let _seqSC = 0
export function generateSessionCandidateId() {
  _seqSC++
  return `SC-${Date.now().toString(36)}-${_seqSC.toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

// ── SearchSession shape ─────────────────────────────────────────────────────

/**
 * Create a new SearchSession.
 *
 * @param {Object} params
 * @param {string} params.countObjectId
 * @param {string} params.planId
 * @param {string} params.scope — SEARCH_SCOPE value at time of search
 * @param {{ x: number, y: number, w: number, h: number }|null} params.region — actual region searched
 * @param {string} params.scaleMode — SCALE_MODE value at time of search
 * @returns {Object} SearchSession (without candidates — add via addCandidates)
 */
export function createSearchSession({
  countObjectId,
  planId,
  scope,
  region = null,
  scaleMode,
}) {
  return {
    id: generateSessionId(),
    countObjectId,
    planId,
    scope,
    region: region ? { x: region.x, y: region.y, w: region.w, h: region.h } : null,
    scaleMode,
    candidates: [],       // SessionCandidate[] — populated after search
    candidateCount: 0,
    acceptedCount: 0,
    ignoredCount: 0,
    materialized: false,  // true after markers are created from accepted candidates
    materializedAt: null,
    createdAt: new Date().toISOString(),
  }
}

// ── SessionCandidate shape ──────────────────────────────────────────────────

/**
 * Create a SessionCandidate from a raw detection result.
 *
 * @param {Object} params
 * @param {number} params.x — PDF scale=1 center x
 * @param {number} params.y — PDF scale=1 center y
 * @param {number} params.pageNumber
 * @param {number} params.score — NCC score
 * @param {number} params.confidence — combined confidence
 * @param {string} params.confidenceBucket — HIGH/REVIEW/LOW
 * @param {{ x: number, y: number, w: number, h: number }} params.matchBbox
 * @param {Object} [params.evidence] — scoring breakdown
 * @returns {Object} SessionCandidate
 */
export function createSessionCandidate({
  x, y, pageNumber, score, confidence, confidenceBucket, matchBbox, evidence = null,
}) {
  return {
    id: generateSessionCandidateId(),
    x,
    y,
    pageNumber,
    score,
    confidence,
    confidenceBucket,
    matchBbox: matchBbox ? { ...matchBbox } : { x, y, w: 0, h: 0 },
    evidence: evidence || null,
    status: CANDIDATE_STATUS.PENDING,
  }
}

// ── Persistence helpers ──────────────────────────────────────────────────────

function _loadAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

function _saveAll(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Get sessions for a plan, newest-first.
 * @param {string} planId
 * @returns {Object[]}
 */
export function getSessionsByPlan(planId) {
  const all = _loadAll()
  const sessions = all[planId] || []
  return [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Get a single session by ID.
 * @param {string} planId
 * @param {string} sessionId
 * @returns {Object|null}
 */
export function getSession(planId, sessionId) {
  const sessions = _loadAll()[planId] || []
  return sessions.find(s => s.id === sessionId) || null
}

/**
 * Save a new session.
 * @param {Object} session
 * @returns {Object}
 */
export function saveSession(session) {
  const all = _loadAll()
  const planSessions = all[session.planId] || []
  planSessions.push(session)
  planSessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  all[session.planId] = planSessions.slice(0, MAX_SESSIONS_PER_PLAN)
  _saveAll(all)
  return session
}

/**
 * Update session (e.g. after candidate review or materialization).
 * @param {string} planId
 * @param {string} sessionId
 * @param {Object} updates
 * @returns {Object|null}
 */
export function updateSession(planId, sessionId, updates) {
  const all = _loadAll()
  const sessions = all[planId] || []
  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx < 0) return null
  sessions[idx] = { ...sessions[idx], ...updates }
  all[planId] = sessions
  _saveAll(all)
  return sessions[idx]
}

/**
 * Update candidate statuses within a session.
 * Recomputes acceptedCount and ignoredCount.
 * @param {string} planId
 * @param {string} sessionId
 * @param {Object<string, string>} statusMap — { candidateId: CANDIDATE_STATUS }
 * @returns {Object|null} updated session
 */
export function updateCandidateStatuses(planId, sessionId, statusMap) {
  const all = _loadAll()
  const sessions = all[planId] || []
  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx < 0) return null

  const session = sessions[idx]
  for (const c of session.candidates) {
    if (statusMap[c.id] !== undefined) {
      c.status = statusMap[c.id]
    }
  }
  session.acceptedCount = session.candidates.filter(c => c.status === CANDIDATE_STATUS.ACCEPTED).length
  session.ignoredCount = session.candidates.filter(c => c.status === CANDIDATE_STATUS.IGNORED).length

  sessions[idx] = session
  all[planId] = sessions
  _saveAll(all)
  return session
}

/**
 * Mark a session as materialized (markers have been created from accepted candidates).
 * @param {string} planId
 * @param {string} sessionId
 * @returns {Object|null}
 */
export function markSessionMaterialized(planId, sessionId) {
  return updateSession(planId, sessionId, {
    materialized: true,
    materializedAt: new Date().toISOString(),
  })
}

/**
 * Get accepted candidates from a session.
 * @param {string} planId
 * @param {string} sessionId
 * @returns {Object[]} — SessionCandidate[] with status=accepted
 */
export function getAcceptedCandidates(planId, sessionId) {
  const session = getSession(planId, sessionId)
  if (!session) return []
  return session.candidates.filter(c => c.status === CANDIDATE_STATUS.ACCEPTED)
}

/**
 * Clear all sessions (for testing).
 */
export function clearAllSessions() {
  localStorage.removeItem(LS_KEY)
}
