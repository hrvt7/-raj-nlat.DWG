// ─── Plan Metadata Accessors ────────────────────────────────────────────────
// Unified getters for plan floor/discipline/systemType.
//
// The canonical data model stores metadata in plan.inferredMeta (nested object).
// Some legacy code paths read flat plan.floor / plan.discipline which were never
// persisted — these accessors unify the read pattern and provide fallback from
// both shapes for backward compatibility.
//
// Usage:
//   import { getPlanFloor, getPlanDiscipline, getPlanSystemType } from '../utils/planMetaAccessors.js'
//   const floor = getPlanFloor(plan)        // string | null
//   const discipline = getPlanDiscipline(plan) // string | null
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the floor identifier from a plan (e.g., 'fsz', 'pince', '1_emelet').
 * Reads from inferredMeta first, falls back to flat plan.floor for compat.
 * @param {object} plan
 * @returns {string|null}
 */
export function getPlanFloor(plan) {
  return plan?.inferredMeta?.floor || plan?.floor || null
}

/**
 * Get the human-readable floor label (e.g., 'Földszint', '1. emelet').
 * @param {object} plan
 * @returns {string|null}
 */
export function getPlanFloorLabel(plan) {
  return plan?.inferredMeta?.floorLabel || plan?.floorLabel || null
}

/**
 * Get the discipline / system type label (e.g., 'Világítás', 'Erősáram').
 * In the canonical model this is inferredMeta.systemType,
 * but MergePlansView/bundleModel historically used plan.discipline.
 * @param {object} plan
 * @returns {string|null}
 */
export function getPlanDiscipline(plan) {
  return plan?.inferredMeta?.systemType || plan?.discipline || null
}

/**
 * Get the system type key (same as discipline in current model).
 * @param {object} plan
 * @returns {string|null}
 */
export function getPlanSystemType(plan) {
  return plan?.inferredMeta?.systemType || plan?.systemType || null
}
