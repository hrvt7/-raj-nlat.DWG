/**
 * Bundle Model — first-class entity for multi-plan combined estimation.
 *
 * A Bundle records which plans are combined, the user's assembly assignments,
 * and snapshots of each plan's state at save time so we can detect staleness.
 *
 * The Bundle does NOT store derived data (pricing, cable estimates) — those
 * remain computed via useMemo in the UI layer.  The Bundle only stores
 * the minimum data needed to reconstruct and validate the aggregation.
 *
 * Integration:
 *   - Created/updated in MergePlansView when user saves a bundle
 *   - Stored in bundleStore.js (IndexedDB via localforage)
 *   - Plan snapshots enable stale detection (markerCount, parseBlockCount, updatedAt)
 */

let _seq = 0

/**
 * Generate a short, collision-resistant bundle id.
 * Format: BDL-<timestamp36>-<seq>
 */
export function generateBundleId() {
  return `BDL-${Date.now().toString(36)}-${(++_seq).toString(36)}`
}

/**
 * Allowed merge types — maps 1:1 to MergePlansView tabs.
 * @type {readonly ['manual','dxf','pdf']}
 */
export const MERGE_TYPES = Object.freeze(['manual', 'dxf', 'pdf'])

/**
 * Create a plan snapshot for stale detection.
 * Captures the minimum state of a plan at bundle-save time.
 *
 * @param {object} plan — plan metadata from planStore
 * @returns {object} snapshot
 */
export function createPlanSnapshot(plan) {
  return {
    planId:          plan.id,
    markerCount:     plan.markerCount || 0,
    parseBlockCount: plan.parseResult?.blocks?.length || 0,
    hasScale:        !!plan.hasScale,
    floor:           plan.floor || null,
    discipline:      plan.discipline || null,
    updatedAt:       plan.updatedAt || plan.parsedAt || null,
  }
}

/**
 * Create a brand-new Bundle.
 *
 * @param {object} fields
 * @param {string}   fields.name       — display name
 * @param {string[]} fields.planIds    — ordered list of plan IDs
 * @param {string}   fields.mergeType  — 'manual' | 'dxf' | 'pdf'
 * @param {object}   fields.assignments     — { category/assemblyType → assemblyId }
 * @param {object}   [fields.unknownMappings] — { blockName → assemblyType } (DXF only)
 * @param {object[]} fields.plans      — full plan metadata array (for snapshot extraction)
 * @returns {object} bundle
 */
export function createBundle(fields) {
  const planIds = fields.planIds || []
  const plans   = fields.plans || []

  // Build plan snapshots from current plan metadata
  const planSnapshots = {}
  for (const pid of planIds) {
    const plan = plans.find(p => p.id === pid)
    if (plan) {
      planSnapshots[pid] = createPlanSnapshot(plan)
    }
  }

  return {
    id:               fields.id || generateBundleId(),
    name:             fields.name || 'Névtelen csomag',
    planIds,
    mergeType:        fields.mergeType || 'manual',
    assignments:      fields.assignments || {},
    unknownMappings:  fields.unknownMappings || {},
    planSnapshots,
    createdAt:        fields.createdAt || new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  }
}

/**
 * Check if a bundle is stale — i.e. any source plan has changed since the bundle was saved.
 *
 * Returns an array of { planId, reason } for each stale plan.
 * Empty array = bundle is fresh.
 *
 * @param {object}   bundle — stored bundle
 * @param {object[]} currentPlans — current plan metadata from planStore
 * @returns {{ planId: string, reason: string }[]}
 */
export function checkBundleStaleness(bundle, currentPlans) {
  const stale = []
  if (!bundle?.planSnapshots) return stale

  for (const planId of bundle.planIds) {
    const snapshot = bundle.planSnapshots[planId]
    const current  = currentPlans.find(p => p.id === planId)

    if (!current) {
      stale.push({ planId, reason: 'deleted' })
      continue
    }
    if (!snapshot) {
      stale.push({ planId, reason: 'no_snapshot' })
      continue
    }

    // Check marker count change (manual merge)
    if ((current.markerCount || 0) !== snapshot.markerCount) {
      stale.push({ planId, reason: 'markers_changed' })
      continue
    }

    // Check parse block count change (DXF merge)
    const currentBlockCount = current.parseResult?.blocks?.length || 0
    if (currentBlockCount !== snapshot.parseBlockCount) {
      stale.push({ planId, reason: 'blocks_changed' })
      continue
    }

    // Check scale calibration change
    if (!!current.hasScale !== snapshot.hasScale) {
      stale.push({ planId, reason: 'scale_changed' })
      continue
    }

    // Check metadata change (floor/discipline reassignment)
    if ((current.floor || null) !== snapshot.floor ||
        (current.discipline || null) !== snapshot.discipline) {
      stale.push({ planId, reason: 'metadata_changed' })
      continue
    }
  }

  return stale
}

/**
 * Human-readable stale reason for UI display.
 * @param {string} reason — from checkBundleStaleness
 * @returns {string}
 */
export function staleReasonLabel(reason) {
  const labels = {
    deleted:          'Terv törölve',
    no_snapshot:      'Nincs referencia állapot',
    markers_changed:  'Jelölések változtak',
    blocks_changed:   'DXF blokkok változtak',
    scale_changed:    'Kalibráció változott',
    metadata_changed: 'Emelet/szakág változott',
  }
  return labels[reason] || 'Változás történt'
}
