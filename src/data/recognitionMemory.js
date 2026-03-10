// ─── Recognition Memory — 3-Tier Learning Store ──────────────────────────────
// Learns from confirmed user actions (block→assembly mappings) and reuses
// those mappings across sessions, projects, and (Phase 2) accounts.
//
// Tier 1 — Project memory:  1 explicit confirmation → saved for this project
// Tier 2 — Account memory:  promoted when 2+ projects agree on the same mapping
// Tier 3 — Global memory:   Phase 2 stub (Supabase shared table)
//
// No side effects, no React, no DOM — safe for Web Workers and tests.
// All persistence uses localStorage via store.js-compatible helpers.
//
// IMPORTANT: Learning ONLY happens from explicit user actions:
//   - 'user_override'  — user manually selected an assembly for a block
//   - 'accept_all'     — user clicked "Accept all high-confidence" button
//   - 'save_plan'      — user saved/confirmed the takeoff plan
// Automatic/background processes must NEVER call recordConfirmation().

// ── Storage key prefixes ─────────────────────────────────────────────────────
const PROJECT_PREFIX = 'takeoffpro_recmem_proj_'
const ACCOUNT_PREFIX = 'takeoffpro_recmem_account_'
const CONFLICT_KEY   = 'takeoffpro_recmem_conflicts'

// ── Confidence values per tier ───────────────────────────────────────────────
const CONFIDENCE = {
  project: 0.85,
  account: 0.90,
  global:  0.50,  // Phase 2 — suggestion only
}

// ── Promotion thresholds ─────────────────────────────────────────────────────
const PROMO_PROJECT_COUNT = 2   // 2+ distinct projects → promote to account

// ── Max raw blockNames tracked per entry (memory hygiene) ────────────────────
const MAX_BLOCK_NAMES = 20

// ── Max signature length (truncate absurdly long names) ──────────────────────
const MAX_SIGNATURE_LENGTH = 120

// ── localStorage helpers (mirrors store.js pattern) ──────────────────────────
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[RecMem] localStorage write failed for "${key}":`, err.message)
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key)
  } catch { /* ignore */ }
}

// ── Signal normalization ─────────────────────────────────────────────────────
// Canonical form for cross-project matching.
// Strategy:
//   1. Uppercase
//   2. Replace all separators (-, _, ., space) with _
//   3. Strip trailing digit sequences (e.g. _01, _123)
//   4. Deduplicate consecutive underscores
//   5. Trim leading/trailing underscores
//   6. Truncate to MAX_SIGNATURE_LENGTH
//
// Examples:
//   'kap_dugalj-2p_01'  → 'KAP_DUGALJ_P'
//   'LIGHT_SPOT.03'     → 'LIGHT_SPOT'
//   'kapcsoló-2G'       → 'KAPCSOLÓ_G'

/**
 * Normalize a raw block name into a canonical signature for memory matching.
 * @param {string} blockName — raw block name from DXF
 * @returns {string} — normalized signature (uppercase, stripped)
 */
export function normalizeSignature(blockName) {
  if (!blockName || typeof blockName !== 'string') return '_EMPTY_'

  let sig = blockName
    .toUpperCase()
    .replace(/[-_.\s]+/g, '_')   // all separators → single _
    .replace(/\d+$/g, '')        // strip trailing digits
    .replace(/_+/g, '_')         // dedupe underscores
    .replace(/^_|_$/g, '')       // trim leading/trailing _

  if (!sig) return '_EMPTY_'
  if (sig.length > MAX_SIGNATURE_LENGTH) sig = sig.slice(0, MAX_SIGNATURE_LENGTH)
  return sig
}

// ── Account ID resolution ────────────────────────────────────────────────────
// For account-scoped storage we need a stable account identifier.
// In authenticated mode: supabase user.id
// In offline/unauthenticated mode: deterministic fallback from localStorage.

/**
 * Get a stable account identifier for memory scoping.
 * Checks localStorage for cached user ID (set by auth flow), falls back to
 * a generated anonymous ID.
 * @returns {string} — account ID string
 */
export function getAccountId() {
  // 1. Check for Supabase session in localStorage (standard key pattern)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw)
          const userId = parsed?.user?.id
          if (userId) return userId
        }
      }
    }
  } catch { /* ignore parse errors */ }

  // 2. Fallback: generate and persist an anonymous account ID
  const ANON_KEY = 'takeoffpro_recmem_anon_account_id'
  let anonId = localStorage.getItem(ANON_KEY)
  if (!anonId) {
    anonId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    try { localStorage.setItem(ANON_KEY, anonId) } catch { /* ignore */ }
  }
  return anonId
}

// ── Storage key builders ─────────────────────────────────────────────────────
function projectKey(projectId) {
  return `${PROJECT_PREFIX}${projectId}`
}

function accountKey(accountId) {
  return `${ACCOUNT_PREFIX}${accountId || getAccountId()}`
}

// ── Memory entry shape ───────────────────────────────────────────────────────
// {
//   signature:      string,     // normalizeSignature(blockName)
//   asmId:          string,     // 'ASM-001'
//   confirmCount:   number,     // times confirmed in this scope
//   projectIds:     string[],   // which projects confirmed (account tier)
//   blockNames:     string[],   // raw names that map here (max 20)
//   firstConfirmed: number,     // Date.now()
//   lastConfirmed:  number,     // Date.now()
//   source:         string,     // 'user_override' | 'accept_all' | 'save_plan'
// }

function createEntry(signature, asmId, blockName, projectId, source) {
  const now = Date.now()
  return {
    signature,
    asmId,
    confirmCount: 1,
    projectIds: projectId ? [projectId] : [],
    blockNames: blockName ? [blockName] : [],
    firstConfirmed: now,
    lastConfirmed: now,
    source,
  }
}

// ── Conflict entry shape ─────────────────────────────────────────────────────
// Stored in takeoffpro_recmem_conflicts
// {
//   [signature]: {
//     asmIds:   string[],   // conflicting assembly IDs
//     projects: { [projectId]: asmId },  // which project voted for what
//     lastSeen: number,     // Date.now()
//     count:    number,     // how many times conflict was detected
//   }
// }

// ── Lookup (read path) ──────────────────────────────────────────────────────

/**
 * Look up memory for a block name. Cascade:
 *   1. Project memory (confidence 0.85)
 *   2. Account memory (confidence 0.90)
 *   3. null (no memory)
 *
 * @param {string} blockName — raw block name
 * @param {string} projectId — current project ID
 * @returns {{ asmId: string, confidence: number, tier: string, source: string } | null}
 */
export function lookupMemory(blockName, projectId) {
  const sig = normalizeSignature(blockName)
  if (sig === '_EMPTY_') return null

  // 1. Project memory
  if (projectId) {
    const projMem = load(projectKey(projectId), {})
    const entry = projMem[sig]
    if (entry?.asmId) {
      return {
        asmId: entry.asmId,
        confidence: CONFIDENCE.project,
        tier: 'project',
        source: entry.source || 'memory',
      }
    }
  }

  // 2. Account memory
  const acctMem = load(accountKey(), {})
  const acctEntry = acctMem[sig]
  if (acctEntry?.asmId) {
    return {
      asmId: acctEntry.asmId,
      confidence: CONFIDENCE.account,
      tier: 'account',
      source: acctEntry.source || 'memory',
    }
  }

  // 3. No memory
  return null
}

// ── Write path (confirmation + promotion) ────────────────────────────────────

/**
 * Record a confirmed block→assembly mapping.
 * Writes to project memory and attempts promotion to account memory.
 *
 * MUST ONLY be called from explicit user actions:
 *   - 'user_override' — manual assembly selection
 *   - 'accept_all'    — "Accept all high-confidence" button click
 *   - 'save_plan'     — user saves/confirms the takeoff plan
 *
 * @param {string} blockName  — raw block name from DXF
 * @param {string} asmId      — assembly ID (e.g. 'ASM-001')
 * @param {string} projectId  — current project ID
 * @param {string} source     — learning trigger source
 */
export function recordConfirmation(blockName, asmId, projectId, source = 'user_override') {
  if (!blockName || !asmId || !projectId) return

  // Validate source — only accept explicit user action sources
  const VALID_SOURCES = ['user_override', 'accept_all', 'save_plan']
  if (!VALID_SOURCES.includes(source)) {
    console.warn(`[RecMem] Rejected non-explicit source: "${source}"`)
    return
  }

  const sig = normalizeSignature(blockName)
  if (sig === '_EMPTY_') return

  // ── Write to project memory ────────────────────────────────────────────
  const key = projectKey(projectId)
  const projMem = load(key, {})
  const existing = projMem[sig]

  if (existing) {
    existing.asmId = asmId
    existing.confirmCount += 1
    existing.lastConfirmed = Date.now()
    existing.source = source
    // Track raw block names (deduped, capped)
    if (blockName && !existing.blockNames.includes(blockName)) {
      if (existing.blockNames.length < MAX_BLOCK_NAMES) {
        existing.blockNames.push(blockName)
      }
    }
    // Ensure projectId is in the list
    if (!existing.projectIds.includes(projectId)) {
      existing.projectIds.push(projectId)
    }
  } else {
    projMem[sig] = createEntry(sig, asmId, blockName, projectId, source)
  }

  save(key, projMem)

  // ── Attempt promotion to account memory ────────────────────────────────
  maybePromoteToAccount(sig)
}

/**
 * Scan all project memories for a given signature.
 * If 2+ distinct projects agree on the same asmId, promote to account memory.
 * If different projects disagree, record a conflict.
 *
 * @param {string} signature — normalized signature
 */
export function maybePromoteToAccount(signature) {
  // Collect votes from all project memories
  const votes = {}  // { [asmId]: Set<projectId> }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(PROJECT_PREFIX)) continue

      const projMem = load(key, {})
      const entry = projMem[signature]
      if (!entry?.asmId) continue

      if (!votes[entry.asmId]) votes[entry.asmId] = new Set()
      // Add all projectIds from the entry
      for (const pid of (entry.projectIds || [])) {
        votes[entry.asmId].add(pid)
      }
    }
  } catch (err) {
    console.warn('[RecMem] Error scanning project memories:', err.message)
    return
  }

  const asmIds = Object.keys(votes)

  // ── Conflict detection ─────────────────────────────────────────────────
  if (asmIds.length > 1) {
    recordConflict(signature, votes)
    return // Do NOT promote when there's disagreement
  }

  // ── Promotion check ────────────────────────────────────────────────────
  if (asmIds.length === 1) {
    const asmId = asmIds[0]
    const projectSet = votes[asmId]

    if (projectSet.size >= PROMO_PROJECT_COUNT) {
      // Clear any previous conflict for this signature (now resolved)
      clearConflict(signature)

      // Write to account memory
      const acctKey = accountKey()
      const acctMem = load(acctKey, {})
      const existing = acctMem[signature]

      if (existing) {
        existing.asmId = asmId
        existing.confirmCount += 1
        existing.lastConfirmed = Date.now()
        existing.projectIds = [...projectSet]
      } else {
        acctMem[signature] = {
          signature,
          asmId,
          confirmCount: projectSet.size,
          projectIds: [...projectSet],
          blockNames: [],
          firstConfirmed: Date.now(),
          lastConfirmed: Date.now(),
          source: 'promotion',
        }
      }

      save(acctKey, acctMem)
    }
  }
}

// ── Conflict storage ─────────────────────────────────────────────────────────

/**
 * Record a conflict: same signature maps to different asmIds across projects.
 * @param {string} signature
 * @param {Object} votes — { [asmId]: Set<projectId> }
 */
function recordConflict(signature, votes) {
  const conflicts = load(CONFLICT_KEY, {})

  const projects = {}
  for (const [asmId, projectSet] of Object.entries(votes)) {
    for (const pid of projectSet) {
      projects[pid] = asmId
    }
  }

  const existing = conflicts[signature]
  if (existing) {
    existing.asmIds = Object.keys(votes)
    existing.projects = { ...existing.projects, ...projects }
    existing.lastSeen = Date.now()
    existing.count += 1
  } else {
    conflicts[signature] = {
      asmIds: Object.keys(votes),
      projects,
      lastSeen: Date.now(),
      count: 1,
    }
  }

  save(CONFLICT_KEY, conflicts)
  console.warn(`[RecMem] Conflict: "${signature}" → ${Object.keys(votes).join(' vs ')}`)
}

/**
 * Clear a conflict entry (e.g. when all projects now agree).
 * @param {string} signature
 */
function clearConflict(signature) {
  const conflicts = load(CONFLICT_KEY, {})
  if (conflicts[signature]) {
    delete conflicts[signature]
    save(CONFLICT_KEY, conflicts)
  }
}

/**
 * Detect if a signature has a stored conflict.
 * @param {string} signature — normalized signature
 * @returns {{ asmIds: string[], projects: Object, count: number, lastSeen: number } | null}
 */
export function detectConflict(signature) {
  const conflicts = load(CONFLICT_KEY, {})
  return conflicts[signature] || null
}

/**
 * Get all stored conflicts (for debugging / future UI).
 * @returns {Object} — { [signature]: conflictEntry }
 */
export function getAllConflicts() {
  return load(CONFLICT_KEY, {})
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Remove a specific memory entry.
 * @param {string} signature — normalized signature
 * @param {'project'|'account'} tier
 * @param {string} [projectId] — required for project tier
 */
export function forgetEntry(signature, tier, projectId) {
  if (tier === 'project' && projectId) {
    const key = projectKey(projectId)
    const mem = load(key, {})
    delete mem[signature]
    save(key, mem)
  } else if (tier === 'account') {
    const key = accountKey()
    const mem = load(key, {})
    delete mem[signature]
    save(key, mem)
  }
}

/**
 * Clear all recognition memory for a project.
 * Called when a project is deleted.
 * Does NOT affect account-level memory (already promoted entries stay).
 * @param {string} projectId
 */
export function clearProjectMemory(projectId) {
  if (!projectId) return
  remove(projectKey(projectId))
}

// ── Stats / debug ────────────────────────────────────────────────────────────

/**
 * Get memory statistics for debugging and (future) UI display.
 * @returns {{ projectEntries: number, accountEntries: number, conflicts: number, projectCount: number }}
 */
export function getMemoryStats() {
  let projectEntries = 0
  let projectCount = 0

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PROJECT_PREFIX)) {
        projectCount++
        const mem = load(key, {})
        projectEntries += Object.keys(mem).length
      }
    }
  } catch { /* ignore */ }

  const acctMem = load(accountKey(), {})
  const accountEntries = Object.keys(acctMem).length

  const conflicts = load(CONFLICT_KEY, {})
  const conflictCount = Object.keys(conflicts).length

  return {
    projectEntries,
    accountEntries,
    conflicts: conflictCount,
    projectCount,
  }
}
