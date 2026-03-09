/**
 * Unified Marker Model — single source of truth for marker shape.
 *
 * Every marker in the system (manual, auto-detected, imported) goes through
 * createMarker() or normalizeMarker() so the shape is always consistent.
 *
 * Backward-compatible: all existing fields (x, y, category, color, asmId,
 * pageNum) are preserved.  New fields (id, source, confidence, detectionId,
 * templateId, createdAt) are added with safe defaults so downstream consumers
 * (TakeoffWorkspace, EstimationPanel, planStore, merge logic) keep working
 * without any changes.
 */

let _seq = 0

/**
 * Generate a short, collision-resistant marker id.
 * Format: MRK-<timestamp36>-<seq>
 */
export function generateMarkerId() {
  return `MRK-${Date.now().toString(36)}-${(++_seq).toString(36)}`
}

/**
 * Allowed source values.
 * 'recipe_match' — marker born from recipe matching apply flow
 * @type {readonly ['manual','detection','import','recipe_match']}
 */
export const MARKER_SOURCES = Object.freeze(['manual', 'detection', 'import', 'recipe_match'])

/**
 * Create a brand-new marker with all required fields.
 *
 * @param {object} fields
 * @param {number} fields.x           — PDF/DXF coordinate
 * @param {number} fields.y           — PDF/DXF coordinate
 * @param {string} fields.category    — e.g. 'ASM-001', 'socket', 'panel', …
 * @param {string} fields.color       — hex color
 * @param {string} [fields.source='manual']  — 'manual' | 'detection' | 'import'
 * @param {string|null} [fields.asmId]       — assembly reference
 * @param {number|null} [fields.pageNum]     — 1-indexed page
 * @param {number|null} [fields.confidence]  — 0–1 (detection only)
 * @param {string|null} [fields.detectionId]    — ref to DetectionResult
 * @param {string|null} [fields.detectionRunId] — ref to DetectionRun
 * @param {string|null} [fields.templateId]     — which template matched
 * @param {string|null} [fields.label]          — display label from detection
 * @param {string|null} [fields.recipeId]       — recipe that produced this marker
 * @param {string|null} [fields.appliedAt]      — ISO timestamp of apply action
 * @param {string|null} [fields.batchId]        — batch/run identifier for undo
 * @returns {object} unified marker
 */
export function createMarker(fields) {
  return {
    // ── identity ───────────────────────────────────
    id:           fields.id || generateMarkerId(),

    // ── spatial (required) ─────────────────────────
    x:            fields.x,
    y:            fields.y,
    pageNum:      fields.pageNum ?? null,

    // ── classification (required) ──────────────────
    category:     fields.category,
    color:        fields.color,
    asmId:        fields.asmId ?? null,

    // ── origin tracking (new) ──────────────────────
    source:         fields.source || 'manual',
    confidence:     fields.confidence ?? null,
    detectionId:    fields.detectionId ?? null,
    detectionRunId: fields.detectionRunId ?? null,
    templateId:     fields.templateId ?? null,
    label:          fields.label ?? null,

    // ── recipe provenance ────────────────────────
    recipeId:       fields.recipeId ?? null,
    appliedAt:      fields.appliedAt ?? null,
    batchId:        fields.batchId ?? null,

    // ── audit ──────────────────────────────────────
    createdAt:    fields.createdAt || new Date().toISOString(),
  }
}

/**
 * Normalize a legacy marker (or any partial marker) into the unified shape.
 * Preserves every existing field and fills in safe defaults for missing ones.
 * Idempotent: calling on an already-normalized marker is a no-op (returns same shape).
 *
 * @param {object} m  — marker in any legacy/mixed format
 * @returns {object} unified marker
 */
export function normalizeMarker(m) {
  // Already normalized? (has id + source)  → fast path, just ensure all fields exist
  return {
    id:           m.id         || generateMarkerId(),
    x:            m.x,
    y:            m.y,
    pageNum:      m.pageNum    ?? null,
    category:     m.category,
    color:        m.color,
    asmId:        m.asmId      ?? null,
    source:         m.source         || 'manual',
    confidence:     m.confidence     ?? null,
    detectionId:    m.detectionId    ?? null,
    detectionRunId: m.detectionRunId ?? null,
    templateId:     m.templateId     ?? null,
    label:          m.label          ?? null,
    recipeId:       m.recipeId       ?? null,
    appliedAt:      m.appliedAt      ?? null,
    batchId:        m.batchId        ?? null,
    createdAt:    m.createdAt  || new Date().toISOString(),
  }
}

/**
 * Normalize an entire array of markers.  Safe for empty / null input.
 * @param {object[]|null|undefined} markers
 * @returns {object[]}
 */
export function normalizeMarkers(markers) {
  if (!markers || !markers.length) return []
  return markers.map(normalizeMarker)
}

// ── Manual-first proximity dedup ─────────────────────────────────────────────

/** Default proximity threshold (PDF/DXF coordinate pixels). */
export const DEDUP_PROXIMITY = 15

/**
 * Source priority — lower number wins when two markers collide.
 * Manual markers ALWAYS win over detection/import.
 */
const SOURCE_PRIORITY = { manual: 0, import: 1, detection: 2, recipe_match: 2 }

function sourcePriority(marker) {
  return SOURCE_PRIORITY[marker.source] ?? SOURCE_PRIORITY.detection
}

/**
 * Merge newly-detected markers into an existing set, respecting manual-first rule.
 *
 * Rules:
 *   1. If a detected marker is within PROXIMITY of an existing marker with the
 *      same category, it is treated as a duplicate.
 *   2. In a duplicate pair the marker with the HIGHER source priority (lower
 *      number) always survives — i.e. manual > import > detection.
 *   3. If both have the same priority, the first-write (existing) wins.
 *
 * @param {object[]} existing  — markers already in the store (may be manual or detection)
 * @param {object[]} incoming  — new detection markers to merge in
 * @param {number}   [proximity=DEDUP_PROXIMITY]
 * @returns {object[]} merged array — existing markers preserved/upgraded, non-dup incoming appended
 */
export function mergeMarkersManualFirst(existing, incoming, proximity = DEDUP_PROXIMITY) {
  const result = [...existing]

  for (const inc of incoming) {
    const dupIdx = result.findIndex(e =>
      e.category === inc.category &&
      Math.hypot(e.x - inc.x, e.y - inc.y) < proximity
    )

    if (dupIdx === -1) {
      // No duplicate — safe to add
      result.push(inc)
    } else {
      // Duplicate found — higher priority source survives
      const dup = result[dupIdx]
      if (sourcePriority(inc) < sourcePriority(dup)) {
        // Incoming has higher priority (e.g. manual incoming vs detection existing)
        result[dupIdx] = inc
      }
      // else: existing wins (same or better priority) — skip incoming
    }
  }

  return result
}

/**
 * Deduplicate a flat marker array using manual-first proximity rule.
 * Useful for viewer unmount merge where markers from different sources are mixed.
 *
 * Iterates once; when two markers collide, the higher-priority source survives.
 *
 * @param {object[]} markers
 * @param {number}   [proximity=DEDUP_PROXIMITY]
 * @returns {object[]} deduplicated array
 */
export function deduplicateMarkersManualFirst(markers, proximity = DEDUP_PROXIMITY) {
  const result = []

  for (const m of markers) {
    const dupIdx = result.findIndex(e =>
      e.category === m.category &&
      Math.hypot(e.x - m.x, e.y - m.y) < proximity
    )

    if (dupIdx === -1) {
      result.push(m)
    } else {
      const dup = result[dupIdx]
      if (sourcePriority(m) < sourcePriority(dup)) {
        result[dupIdx] = m
      }
    }
  }

  return result
}
