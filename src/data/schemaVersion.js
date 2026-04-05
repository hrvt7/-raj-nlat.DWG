// ─── Schema Versioning Helpers ─────────────────────────────────────────────────
// Minimal versioned envelope for localStorage persistence.
// On save: data is wrapped as { _v: <version>, data: <payload> }
// On load: legacy raw values (arrays) pass through; envelopes are unwrapped;
//          unknown future versions or corrupt data return a safe fallback.

/**
 * Unwrap a versioned envelope, or accept a legacy raw value.
 *
 * @param {*} parsed  - The JSON.parse'd value from localStorage
 * @param {number} currentVersion - The highest schema version this code supports
 * @param {*} fallback - Returned when data is null, corrupt, or from a future version
 * @returns {*} The unwrapped payload (array)
 */
export function unwrapVersioned(parsed, currentVersion, fallback = []) {
  // Null / undefined → first-time use, return fallback
  if (parsed == null) return fallback

  // Legacy format: raw array (version 0 — pre-versioning)
  if (Array.isArray(parsed)) return parsed

  // Versioned envelope
  if (typeof parsed === 'object' && typeof parsed._v === 'number') {
    if (parsed._v <= currentVersion && Array.isArray(parsed.data)) {
      return parsed.data
    }
    if (parsed._v > currentVersion) {
      console.warn(
        `[TakeoffPro] Schema v${parsed._v} is newer than supported v${currentVersion} — using fallback`
      )
      return fallback
    }
  }

  // Unrecognized format → corrupt
  console.warn('[TakeoffPro] Unrecognized storage format — using fallback')
  return fallback
}

/**
 * Wrap data in a versioned envelope.
 *
 * @param {*} data    - The payload to wrap (typically an array)
 * @param {number} version - Schema version number
 * @returns {{ _v: number, data: * }}
 */
export function wrapVersioned(data, version) {
  return { _v: version, data, _updatedAt: new Date().toISOString() }
}

/**
 * Extract the _updatedAt timestamp from a versioned envelope.
 * Returns null if not present (legacy data).
 */
export function getEnvelopeTimestamp(raw) {
  if (raw && typeof raw === 'object' && raw._updatedAt) return raw._updatedAt
  return null
}
