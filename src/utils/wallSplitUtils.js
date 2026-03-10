// ─── Wall Split Utilities ─────────────────────────────────────────────────────
// Pure functions for wall-type split materialization and reconciliation.
// Used by TakeoffWorkspace to bake preselected wall types into state at
// creation time (not at display time).
//
// Key principle: wallSplits are materialized into state when items are CREATED
// (marker placed, DXF parsed), not when they are DISPLAYED. This ensures items
// don't visually shift when the user changes the wall-type selector.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reconcile wallSplits state after PDF markers change.
 *
 * - New assemblies → default to { [activeWallType]: count }
 * - Existing assemblies with more markers → extras go to activeWallType
 * - Existing assemblies with fewer markers → reduce proportionally
 * - Returns null if no changes needed (caller should keep prev state)
 *
 * @param {object} prevSplits    — current wallSplits state { asmId: { wall: n } }
 * @param {object} asmCounts     — { asmId: markerCount } from current markers
 * @param {string} activeWallType — preselected wall type key
 * @returns {{ next: object, changed: boolean }}
 */
export function reconcileMarkerSplits(prevSplits, asmCounts, activeWallType) {
  const next = { ...prevSplits }
  let changed = false

  for (const [asmId, count] of Object.entries(asmCounts)) {
    const existing = next[asmId]
    if (!existing) {
      // New assembly — default to preselected wall type
      next[asmId] = { [activeWallType]: count }
      changed = true
    } else {
      const splitTotal = Object.values(existing).reduce((s, n) => s + n, 0)
      const diff = count - splitTotal
      if (diff > 0) {
        // Markers added — extras go into active wall type
        next[asmId] = { ...existing, [activeWallType]: (existing[activeWallType] || 0) + diff }
        changed = true
      } else if (diff < 0) {
        // Markers removed — reduce proportionally from first available
        const adjusted = { ...existing }
        let toRemove = Math.abs(diff)
        for (const k of Object.keys(adjusted)) {
          if (toRemove <= 0) break
          if (adjusted[k] > 0) {
            const take = Math.min(adjusted[k], toRemove)
            adjusted[k] -= take
            toRemove -= take
          }
        }
        next[asmId] = adjusted
        changed = true
      }
      // diff === 0 → no change needed
    }
  }

  return { next, changed }
}

/**
 * Initialize wallSplits for newly recognized DXF items.
 *
 * Only creates entries for assemblies NOT already in state.
 * Does NOT modify existing entries.
 *
 * @param {object} prevSplits     — current wallSplits state
 * @param {Array}  takeoffRows    — [{ asmId, qty }]
 * @param {string} activeWallType — preselected wall type key
 * @returns {{ next: object, changed: boolean }}
 */
export function initializeRecognitionSplits(prevSplits, takeoffRows, activeWallType) {
  const next = { ...prevSplits }
  let changed = false

  for (const row of takeoffRows) {
    if (!next[row.asmId]) {
      next[row.asmId] = { [activeWallType]: row.qty }
      changed = true
    }
  }

  return { next, changed }
}

/**
 * Count assemblies from a list of PDF markers.
 *
 * @param {Array} markers — [{ asmId?, category? }]
 * @returns {object} { asmId: count }
 */
export function countMarkerAssemblies(markers) {
  const counts = {}
  for (const m of markers) {
    const asmId = m.asmId || (m.category?.startsWith('ASM-') ? m.category : null)
    if (asmId) counts[asmId] = (counts[asmId] || 0) + 1
  }
  return counts
}
