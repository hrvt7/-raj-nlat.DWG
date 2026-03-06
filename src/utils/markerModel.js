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
 * @type {readonly ['manual','detection','import']}
 */
export const MARKER_SOURCES = Object.freeze(['manual', 'detection', 'import'])

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
