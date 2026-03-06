// ─── Cable Pipeline Model ─────────────────────────────────────────────────────
// Unified cable estimate shape, normalization, and priority guard.
// All cable data flows through normalizeCableEstimate() before entering state.

// ── Source constants (priority order: lower index = higher priority) ──────────
export const CABLE_SOURCE = {
  PDF_MARKERS:  'pdf_markers',   // P0 — manual marker placement (highest)
  DXF_LAYERS:   'dxf_layers',    // P1 — measured cable geometry from DXF layers
  PDF_TAKEOFF:  'pdf_takeoff',   // P2 — PDF API + MST estimation
  DXF_MST:      'dxf_mst',       // P3 — MST from device positions
  DEVICE_COUNT: 'device_count',  // P4 — qty × average (lowest)
}

const PRIORITY = [
  CABLE_SOURCE.PDF_MARKERS,
  CABLE_SOURCE.DXF_LAYERS,
  CABLE_SOURCE.PDF_TAKEOFF,
  CABLE_SOURCE.DXF_MST,
  CABLE_SOURCE.DEVICE_COUNT,
]

// Default p90 multipliers per source
const P90_MULTIPLIER = {
  [CABLE_SOURCE.PDF_MARKERS]:  1.2,
  [CABLE_SOURCE.DXF_LAYERS]:   1.15,
  [CABLE_SOURCE.PDF_TAKEOFF]:  1.35,
  [CABLE_SOURCE.DXF_MST]:      1.35,
  [CABLE_SOURCE.DEVICE_COUNT]: 1.5,
}

// ── Validation ───────────────────────────────────────────────────────────────
/**
 * Check if a cable estimate is "valid and usable":
 * - not null/undefined
 * - has cable_total_m > 0
 * - has a recognized _source
 */
export function isValidEstimate(est) {
  if (!est) return false
  if (typeof est.cable_total_m !== 'number' || est.cable_total_m <= 0) return false
  if (!est._source) return false
  return true
}

// ── Normalization ────────────────────────────────────────────────────────────
/**
 * Normalize any raw cable result into the unified CableEstimate shape.
 *
 * Handles:
 * - cable_by_system → cable_by_type mapping (from estimateCablesMST)
 * - _source tag
 * - p90 generation if missing
 * - null return if total <= 0
 *
 * @param {object} raw - Raw cable result from any source
 * @param {string} source - One of CABLE_SOURCE values
 * @returns {object|null} Normalized CableEstimate or null
 */
export function normalizeCableEstimate(raw, source) {
  if (!raw) return null

  // ── Resolve cable_by_type ──────────────────────────────────────────────
  let byType = raw.cable_by_type

  // MST output uses cable_by_system with nested objects
  if (!byType && raw.cable_by_system) {
    const sys = raw.cable_by_system
    byType = {
      light_m:  0,
      socket_m: 0,
      switch_m: 0,
      other_m:  0,
    }
    for (const [key, val] of Object.entries(sys)) {
      const m = typeof val === 'number' ? val : (val?.estimated_m ?? val?.raw_distance ?? 0)
      if (/light|vilag/i.test(key))       byType.light_m  += m
      else if (/socket|dugalj/i.test(key)) byType.socket_m += m
      else if (/switch|kapcs/i.test(key))  byType.switch_m += m
      else                                 byType.other_m  += m
    }
  }

  if (!byType) {
    byType = { light_m: 0, socket_m: 0, switch_m: 0, other_m: 0 }
  }

  // ── Resolve total ──────────────────────────────────────────────────────
  const total = typeof raw.cable_total_m === 'number' ? raw.cable_total_m : 0
  if (total <= 0) return null

  // ── Resolve p50 / p90 ─────────────────────────────────────────────────
  const p50 = raw.cable_total_m_p50 ?? total
  const p90 = raw.cable_total_m_p90 ?? Math.round(total * (P90_MULTIPLIER[source] ?? 1.35))

  return {
    cable_total_m: Math.round(total * 10) / 10,
    cable_total_m_p50: Math.round(p50 * 10) / 10,
    cable_total_m_p90: Math.round(p90 * 10) / 10,
    cable_by_type: {
      light_m:  Math.round((byType.light_m  ?? 0) * 10) / 10,
      socket_m: Math.round((byType.socket_m ?? 0) * 10) / 10,
      switch_m: Math.round((byType.switch_m ?? 0) * 10) / 10,
      other_m:  Math.round((byType.other_m  ?? 0) * 10) / 10,
    },
    method: raw.method ?? source,
    confidence: raw.confidence ?? 0.5,
    _source: source,
  }
}

// ── Priority guard ───────────────────────────────────────────────────────────
/**
 * Decide whether `incoming` should overwrite `current` in state.
 *
 * Rules (in order):
 * 1. If current is null/invalid/empty (cable_total_m <= 0), valid incoming always wins.
 * 2. If incoming is null/invalid, never overwrite.
 * 3. Between two valid estimates, higher priority (lower index) wins.
 *    Same priority: incoming wins (fresher data).
 *
 * @param {object|null} current - Current cableEstimate in state
 * @param {object|null} incoming - New candidate
 * @returns {boolean} true if incoming should replace current
 */
export function shouldOverwrite(current, incoming) {
  const incomingValid = isValidEstimate(incoming)
  const currentValid  = isValidEstimate(current)

  // Rule 2: invalid incoming never overwrites
  if (!incomingValid) return false

  // Rule 1: invalid/null/empty current → valid incoming always wins
  if (!currentValid) return true

  // Rule 3: both valid → compare priority (lower index = higher priority)
  const currentPriority  = PRIORITY.indexOf(current._source)
  const incomingPriority = PRIORITY.indexOf(incoming._source)

  // Unknown source gets lowest priority
  const cp = currentPriority  === -1 ? PRIORITY.length : currentPriority
  const ip = incomingPriority === -1 ? PRIORITY.length : incomingPriority

  // Higher priority (lower index) or same priority (fresher) → overwrite
  return ip <= cp
}
