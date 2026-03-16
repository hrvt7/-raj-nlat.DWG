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

// ── Promotion thresholds ─────────────────────────────────────────────────────
const PROMO_PROJECT_COUNT = 2   // 2+ distinct projects → promote to account

// ── Max raw blockNames tracked per entry (memory hygiene) ────────────────────
const MAX_BLOCK_NAMES = 20

// ── Max account-level entries (LRU eviction above this cap) ──────────────────
export const MAX_ACCOUNT_ENTRIES = 2000

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
//   'kap_dugalj-2p_01'  → 'KAP_DUGALJ_2P'  (only trailing _01 stripped)
//   'LIGHT_SPOT.03'     → 'LIGHT_SPOT'
//   'kapcsoló-2G'       → 'KAPCSOLÓ_2G'     (2G not trailing digits)

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

// ── Layer signature normalization ─────────────────────────────────────────────
// Strategy:
//   1. Strip common electrical prefixes: E_, EL_, ELEC_, ELECTRICAL_
//   2. Uppercase, separator→_, strip ALL digits, dedup, trim
//   NOTE: Strips ALL digit sequences (not just trailing) — more aggressive
//   than normalizeSignature, to collapse layer variants like SOCKET_2P / SOCKET_3P.
//
// Examples:
//   'E_SOCKET_2P'  → 'SOCKET_P'
//   'EL-LIGHT.01'  → 'LIGHT'
//   'EROSARAM_ALJ' → 'EROSARAM_ALJ'

/**
 * Normalize a layer name into a canonical signature for memory matching.
 * Strips electrical prefixes (E_, EL_, ELEC_, ELECTRICAL_),
 * then strips ALL digit sequences to collapse variants.
 * @param {string} layer — raw layer name from DXF
 * @returns {string} — normalized layer signature (uppercase, stripped)
 */
export function normalizeLayerSignature(layer) {
  if (!layer || typeof layer !== 'string') return '_EMPTY_'

  let sig = layer
    .toUpperCase()
    .replace(/^(ELECTRICAL|ELEC|EL|E)[-_.\s]+/i, '')  // strip electrical prefix
    .replace(/[-_.\s]+/g, '_')
    .replace(/\d+/g, '')         // strip ALL digit sequences
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  if (!sig) return '_EMPTY_'
  if (sig.length > MAX_SIGNATURE_LENGTH) sig = sig.slice(0, MAX_SIGNATURE_LENGTH)
  return sig
}

// ── ATTRIB signature normalization ──────────────────────────────────────────
// Strategy:
//   1. Filter out skip-tags (HANDLE, XDATA, ID, OWNER, etc.)
//   2. Sort by tag name
//   3. Uppercase values
//   4. Strip ALL digit sequences from values (collapses variants)
//   5. Join as TAG1=VAL1|TAG2=VAL2
//
// Example:
//   [{tag:'TYPE', value:'socket_2p'}, {tag:'HANDLE', value:'FF01'}]
//   → 'TYPE=SOCKET_P'

const ATTRIB_SKIP_TAGS = new Set([
  'HANDLE', 'XDATA', 'ID', 'OWNER', 'XREF', 'BLOCK_ID',
  'ENTITY_HANDLE', 'LAYER_ID', 'LINETYPE',
])

/**
 * Normalize ATTRIB tag/value pairs into a canonical signature.
 * Filters skip-tags, sorts by tag, uppercases values, joins as TAG=VAL|TAG=VAL.
 * @param {Array<{tag: string, value: string}>} attribs — ATTRIB pairs
 * @returns {string} — normalized attrib signature
 */
export function normalizeAttribSignature(attribs) {
  if (!attribs || !Array.isArray(attribs) || attribs.length === 0) return '_EMPTY_'

  const parts = []
  for (const { tag, value } of attribs) {
    if (!tag || ATTRIB_SKIP_TAGS.has(tag.toUpperCase())) continue
    const normVal = (value || '')
      .toUpperCase()
      .replace(/[-_.\s]+/g, '_')
      .replace(/\d+/g, '')         // strip ALL digit sequences
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    if (normVal) {
      parts.push(`${tag.toUpperCase()}=${normVal}`)
    }
  }

  if (parts.length === 0) return '_EMPTY_'
  parts.sort()
  const sig = parts.join('|')
  return sig.length > MAX_SIGNATURE_LENGTH ? sig.slice(0, MAX_SIGNATURE_LENGTH) : sig
}

// ── Nearby text signature normalization ─────────────────────────────────────
// Quality gate: at least one token must contain a BLOCK_ASM_RULES keyword
// OR be a specific alphabetic token ≥4 chars not on the blocklist.
// Returns null if no token passes quality gate → signal not recorded.

const TEXT_QUALITY_KEYWORDS = new Set([
  'DUGALJ', 'KAPCS', 'LAMP', 'LIGHT', 'PANEL', 'SOCKET', 'SWITCH', 'OUTLET',
  'FÉNYCSÖ', 'SPOT', 'LÁMPA', 'KAPCSOLÓ', 'ÉRINTKEZŐ', 'BIZTOSÍTÉK',
  'KISMEGSZAKÍTÓ', 'FI', 'ÁRAMVÉDŐ', 'ELOSZTÓ', 'TŰZJELZŐ', 'MOZGÁS',
  'PIR', 'FÜST', 'VÉSZVILÁGÍT', 'MENEKÜLŐ', 'EXIT',
])

const TEXT_BLOCKLIST = new Set([
  '2P', '1P', '3P',
  '16A', '10A', '6A', '20A', '25A', '32A', '40A', '63A',
  'IP20', 'IP44', 'IP54', 'IP65', 'IP67', 'IP68',
  '230V', '400V', '24V', '12V',
  'DB', 'ST', 'PCS', 'MM', 'CM', 'M', 'KG', 'NR',
])

/**
 * Check if a token passes the nearby_text quality gate.
 * @param {string} token — uppercase token
 * @returns {boolean}
 */
function passesTextQualityGate(token) {
  // Blocked tokens
  if (TEXT_BLOCKLIST.has(token)) return false
  // Pure numbers
  if (/^\d+$/.test(token)) return false
  // Digits + unit suffix (e.g. 16A, 230V)
  if (/^\d+[A-Z]{1,2}$/.test(token)) return false
  // Too short
  if (token.length < 3) return false

  // Contains a known keyword → passes
  for (const kw of TEXT_QUALITY_KEYWORDS) {
    if (token.includes(kw)) return true
  }

  // Specific alphabetic token ≥4 chars → passes
  if (token.length >= 4 && /^[A-ZÁÉÍÓÖŐÚÜŰ]+$/.test(token)) return true

  return false
}

/**
 * Normalize nearby text into a canonical signature.
 * Quality gate: at least one token must contain a BLOCK_ASM_RULES keyword
 * OR be a specific alphabetic token ≥4 chars not on the blocklist.
 * Returns null if no token passes quality gate (signal not recorded).
 * @param {string[]} texts — nearby text strings
 * @returns {string|null} — normalized text signature, or null if quality gate fails
 */
export function normalizeTextSignature(texts) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) return null

  // Filter and normalize
  const tokens = []
  for (const t of texts) {
    if (!t || typeof t !== 'string') continue
    const upper = t.trim().toUpperCase()
    if (upper.length < 2 || upper.length > 30) continue
    if (/^\d+$/.test(upper)) continue  // pure numbers
    if (TEXT_BLOCKLIST.has(upper)) continue
    tokens.push(upper)
  }

  if (tokens.length === 0) return null

  // Quality gate: at least one token must pass
  const hasQualityToken = tokens.some(t => passesTextQualityGate(t))
  if (!hasQualityToken) return null

  // Deduplicate, sort by length, take top 3
  const unique = [...new Set(tokens)]
    .sort((a, b) => a.length - b.length)
    .slice(0, 3)

  const sig = unique.join('|')
  return sig.length > MAX_SIGNATURE_LENGTH ? sig.slice(0, MAX_SIGNATURE_LENGTH) : sig
}

// ── Confidence values per signal type and tier (v2) ─────────────────────────
const CONFIDENCE_V2 = {
  block_name:          { project: 0.85, account: 0.90 },
  layer_name:          { project: 0.78, account: 0.85 },
  attribute_signature: { project: 0.82, account: 0.88 },
  nearby_text:         { project: 0.70, account: 0.78 },
}

// ── Per-signal promotion thresholds ─────────────────────────────────────────
const PROMO_THRESHOLDS = {
  block_name:          2,   // 2+ distinct projects (unchanged)
  attribute_signature: 2,
  layer_name:          3,   // stricter: layer conventions vary more
  nearby_text:         3,   // stricter + no-conflict required
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

// ── Memory entry shape (v2 — backward compatible) ────────────────────────────
// {
//   signature:         string,     // normalizeSignature(blockName)
//   asmId:             string,     // 'ASM-001'
//   confirmCount:      number,     // times confirmed in this scope
//   projectIds:        string[],   // which projects confirmed (account tier)
//   blockNames:        string[],   // raw names that map here (max 20)
//   firstConfirmed:    number,     // Date.now()
//   lastConfirmed:     number,     // Date.now()
//   source:            string,     // 'user_override' | 'accept_all' | 'save_plan'
//   signalType:        string?,    // v2: 'block_name'|'layer_name'|'attribute_signature'|'nearby_text'
//   supportingSignals: string[]?,  // v2: other signal types that agree (diagnostics)
//   evidenceCount:     number?,    // v2: distinct evidence signals that confirmed
// }
// Old entries without signalType are implicitly 'block_name'. Zero migration.

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
 * Look up memory for a block name, optionally enhanced with multi-signal evidence.
 *
 * Without evidence (backward compat): block_name-only lookup.
 * With evidence: multi-signal cascade with hybrid confidence.
 *
 * Cascade per signal:
 *   1. Project memory (signal-specific confidence)
 *   2. Account memory (signal-specific confidence)
 *
 * Cross-signal conflict policy: if different signals map to different asmIds,
 * return null — block goes to unknown/recovery flow.
 *
 * @param {string} blockName — raw block name
 * @param {string} projectId — current project ID
 * @param {object|null} [evidence] — evidence from buildBlockEvidence (optional)
 * @returns {{ asmId: string, confidence: number, tier: string, source: string, signalType: string } | null}
 */
export function lookupMemory(blockName, projectId, evidence = null) {
  const sig = normalizeSignature(blockName)
  if (sig === '_EMPTY_') return null

  // ── No evidence: original block_name-only path (backward compat) ──────
  if (!evidence) {
    return lookupSingleSignal(sig, 'block_name', projectId)
  }

  // ── With evidence: multi-signal lookup ────────────────────────────────
  const candidates = []

  // 1. block_name signal (always present)
  const blockHit = lookupSingleSignal(sig, 'block_name', projectId)
  if (blockHit) candidates.push(blockHit)

  // 2. layer_name signal
  if (evidence.signals?.layer_name) {
    const layerKey = `layer_name::${evidence.signals.layer_name}`
    const layerHit = lookupSingleSignal(layerKey, 'layer_name', projectId)
    if (layerHit) candidates.push(layerHit)
  }

  // 3. attribute_signature signal
  if (evidence.signals?.attribute_signature) {
    const attribKey = `attribute_signature::${evidence.signals.attribute_signature}`
    const attribHit = lookupSingleSignal(attribKey, 'attribute_signature', projectId)
    if (attribHit) candidates.push(attribHit)
  }

  // 4. nearby_text signal
  if (evidence.signals?.nearby_text) {
    const textKey = `nearby_text::${evidence.signals.nearby_text}`
    const textHit = lookupSingleSignal(textKey, 'nearby_text', projectId)
    if (textHit) candidates.push(textHit)
  }

  if (candidates.length === 0) return null

  // ── Check for cross-signal disagreement ───────────────────────────────
  const uniqueAsmIds = new Set(candidates.map(c => c.asmId))
  if (uniqueAsmIds.size > 1) {
    // Cross-signal conflict → return null (block goes to unknown/recovery)
    return null
  }

  // ── All agree on same asmId ───────────────────────────────────────────
  if (candidates.length === 1) {
    return candidates[0]
  }

  // Hybrid: multiple signals agree → boost confidence
  const maxConf = Math.max(...candidates.map(c => c.confidence))
  const hybridConf = Math.min(0.88, maxConf + 0.05 * (candidates.length - 1))
  const bestCandidate = candidates.reduce((a, b) => a.confidence >= b.confidence ? a : b)

  return {
    asmId: bestCandidate.asmId,
    confidence: hybridConf,
    tier: bestCandidate.tier,
    source: bestCandidate.source,
    signalType: 'hybrid',
  }
}

/**
 * Look up a single signal key in project then account memory.
 * @param {string} sigKey — storage key (plain signature or 'signalType::signature')
 * @param {string} signalType — 'block_name'|'layer_name'|'attribute_signature'|'nearby_text'
 * @param {string} projectId — current project ID
 * @returns {{ asmId: string, confidence: number, tier: string, source: string, signalType: string } | null}
 */
function lookupSingleSignal(sigKey, signalType, projectId) {
  const confTable = CONFIDENCE_V2[signalType] || CONFIDENCE_V2.block_name

  // 1. Project memory
  if (projectId) {
    const projMem = load(projectKey(projectId), {})
    const entry = projMem[sigKey]
    if (entry?.asmId) {
      return {
        asmId: entry.asmId,
        confidence: confTable.project,
        tier: 'project',
        source: entry.source || 'memory',
        signalType,
      }
    }
  }

  // 2. Account memory
  const acctMem = load(accountKey(), {})
  const acctEntry = acctMem[sigKey]
  if (acctEntry?.asmId) {
    return {
      asmId: acctEntry.asmId,
      confidence: confTable.account,
      tier: 'account',
      source: acctEntry.source || 'memory',
      signalType,
    }
  }

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
 * Automatic/background processes must NEVER call this function.
 * This rule applies equally to v2 signals (layer, attrib, text).
 *
 * @param {string} blockName  — raw block name from DXF
 * @param {string} asmId      — assembly ID (e.g. 'ASM-001')
 * @param {string} projectId  — current project ID
 * @param {string} source     — learning trigger source
 * @param {object|null} [evidence] — evidence from buildBlockEvidence (optional)
 */
export function recordConfirmation(blockName, asmId, projectId, source = 'user_override', evidence = null) {
  if (!blockName || !asmId || !projectId) return

  // Validate source — only accept explicit user action sources
  // This gate applies to ALL signals (block_name + v2 signals equally)
  const VALID_SOURCES = ['user_override', 'accept_all', 'save_plan']
  if (!VALID_SOURCES.includes(source)) {
    console.warn(`[RecMem] Rejected non-explicit source: "${source}"`)
    return
  }

  const sig = normalizeSignature(blockName)
  if (sig === '_EMPTY_') return

  // ── 1. Always record block_name signal (existing behavior) ─────────────
  recordSignalEntry(sig, asmId, blockName, projectId, source, 'block_name')

  // ── 2. Record v2 signal entries from evidence ──────────────────────────
  if (evidence && evidence.signals) {
    // layer_name signal
    if (evidence.signals.layer_name && evidence.signals.layer_name !== '_EMPTY_') {
      const layerKey = `layer_name::${evidence.signals.layer_name}`
      recordSignalEntry(layerKey, asmId, blockName, projectId, source, 'layer_name')
    }

    // attribute_signature signal
    if (evidence.signals.attribute_signature && evidence.signals.attribute_signature !== '_EMPTY_') {
      const attribKey = `attribute_signature::${evidence.signals.attribute_signature}`
      recordSignalEntry(attribKey, asmId, blockName, projectId, source, 'attribute_signature')
    }

    // nearby_text signal — only if quality gate passed (non-null)
    if (evidence.signals.nearby_text) {
      const textKey = `nearby_text::${evidence.signals.nearby_text}`
      recordSignalEntry(textKey, asmId, blockName, projectId, source, 'nearby_text')
    }
  }
}

/**
 * Record a single signal entry to project memory and attempt promotion.
 * Internal helper — not exported. All source validation happens in recordConfirmation.
 *
 * @param {string} sigKey      — storage key (plain sig or 'signalType::signature')
 * @param {string} asmId       — assembly ID
 * @param {string} blockName   — raw block name (for tracking)
 * @param {string} projectId   — current project ID
 * @param {string} source      — learning trigger source
 * @param {string} signalType  — signal type identifier
 */
function recordSignalEntry(sigKey, asmId, blockName, projectId, source, signalType) {
  const key = projectKey(projectId)
  const projMem = load(key, {})
  const existing = projMem[sigKey]

  if (existing) {
    existing.asmId = asmId
    existing.confirmCount += 1
    existing.lastConfirmed = Date.now()
    existing.source = source
    existing.signalType = signalType
    // Track raw block names (deduped, capped)
    if (blockName && !existing.blockNames.includes(blockName)) {
      if (existing.blockNames.length < MAX_BLOCK_NAMES) {
        existing.blockNames.push(blockName)
      }
    }
    if (!existing.projectIds.includes(projectId)) {
      existing.projectIds.push(projectId)
    }
  } else {
    const entry = createEntry(sigKey, asmId, blockName, projectId, source)
    entry.signalType = signalType
    projMem[sigKey] = entry
  }

  save(key, projMem)

  // ── Attempt promotion to account memory ────────────────────────────────
  maybePromoteToAccount(sigKey)
}

/**
 * Scan all project memories for a given signature.
 * Promotion thresholds are per-signal-type:
 *   block_name:          2+ distinct projects (unchanged)
 *   attribute_signature: 2+ distinct projects
 *   layer_name:          3+ distinct projects
 *   nearby_text:         3+ distinct projects AND no conflict
 *
 * If different projects disagree on the same signal, record a conflict.
 *
 * @param {string} signature — normalized signature (or signalType::signature)
 */
export function maybePromoteToAccount(signature) {
  // Collect votes from all project memories
  const votes = {}  // { [asmId]: Set<projectId> }
  let signalType = 'block_name' // default for backward compat

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(PROJECT_PREFIX)) continue

      const projMem = load(key, {})
      const entry = projMem[signature]
      if (!entry?.asmId) continue

      // Detect signal type from entry (backward compat: no signalType → block_name)
      if (entry.signalType) signalType = entry.signalType

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

  // ── Promotion check with per-signal thresholds ─────────────────────────
  if (asmIds.length === 1) {
    const asmId = asmIds[0]
    const projectSet = votes[asmId]

    // Determine threshold for this signal type
    const threshold = PROMO_THRESHOLDS[signalType] || PROMO_PROJECT_COUNT

    if (projectSet.size < threshold) return // Not enough projects yet

    // nearby_text has extra condition: must have no conflict on this signature
    if (signalType === 'nearby_text') {
      if (detectConflict(signature)) return // Don't promote if conflict exists
    }

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
      existing.signalType = signalType
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
        signalType,
      }
    }

    save(acctKey, acctMem)
    evictAccountIfNeeded(acctMem, acctKey)
  }
}

/**
 * Evict oldest account-memory entries when size exceeds MAX_ACCOUNT_ENTRIES.
 * Eviction is LRU by lastConfirmed timestamp (oldest evicted first).
 * Saves the pruned object only if eviction actually occurred.
 * @param {Object} acctMem — account memory object (mutated in place)
 * @param {string} acctKey — localStorage key
 */
function evictAccountIfNeeded(acctMem, acctKey) {
  const keys = Object.keys(acctMem)
  if (keys.length <= MAX_ACCOUNT_ENTRIES) return

  // Sort entries by lastConfirmed ascending (oldest first)
  keys.sort((a, b) => (acctMem[a].lastConfirmed || 0) - (acctMem[b].lastConfirmed || 0))

  const excess = keys.length - MAX_ACCOUNT_ENTRIES
  for (let i = 0; i < excess; i++) {
    delete acctMem[keys[i]]
  }

  save(acctKey, acctMem)
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
