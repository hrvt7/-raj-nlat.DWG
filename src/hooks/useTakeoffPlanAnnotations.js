/**
 * useTakeoffPlanAnnotations — Plan annotation lifecycle for TakeoffWorkspace.
 *
 * Handles two effects:
 *   1. Hydrate saved annotations when a plan is opened (planId + file present)
 *   2. Subscribe to external annotation changes (e.g. DetectionReviewPanel apply)
 *
 * This is an effects-only hook — no owned state. All state lives in TakeoffWorkspace;
 * this hook calls the passed setters.
 */

import { useEffect } from 'react'
import { getPlanAnnotations, onAnnotationsChanged } from '../data/planStore.js'
import { normalizeMarkers } from '../utils/markerModel.js'

/**
 * @param {Object} params
 * @param {string|null} params.planId — current plan ID
 * @param {File|null} params.file — current file (gate: skip hydrate if no file)
 * @param {Function} params.setPdfMarkers
 * @param {Function} params.setWallSplits
 * @param {Function} params.setVariantOverrides
 * @param {Function} params.setDeletedItems
 * @param {Function} params.setReferencePanels
 * @param {Function} params.setCableReviewed
 * @param {Function} params.setRightTab
 */
export default function useTakeoffPlanAnnotations({
  planId, file,
  setPdfMarkers, setWallSplits, setVariantOverrides,
  setDeletedItems, setReferencePanels, setCableReviewed,
  setRightTab, setCustomItemMeta,
}) {
  // ── Restore saved annotations when opening a plan with a planId ───────────
  useEffect(() => {
    if (!planId || !file) return
    ;(async () => {
      const ann = await getPlanAnnotations(planId)
      if (ann && ann.markers && ann.markers.length > 0) {
        setPdfMarkers(normalizeMarkers(ann.markers))
        if (ann.wallSplits) setWallSplits(ann.wallSplits)
        if (ann.variantOverrides) setVariantOverrides(ann.variantOverrides)
        if (ann.deletedItems) setDeletedItems(new Set(ann.deletedItems))
        setRightTab('takeoff')
      }
      // Restore reference panels (manual cable mode)
      if (ann?.referencePanels?.length > 0) {
        setReferencePanels(ann.referencePanels)
      }
      // Restore cable review flag (suppress stale cable warnings on reopen)
      if (ann?.cableReviewed) {
        setCableReviewed(true)
      }
      // Restore custom item meta (name, unit, unitPrice per custom item)
      if (ann?.customItemMeta && setCustomItemMeta) {
        setCustomItemMeta(ann.customItemMeta)
      }
    })()
  }, [planId, file]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Subscribe to external annotation changes (e.g. DetectionReviewPanel apply) ──
  useEffect(() => {
    if (!planId) return
    const unsub = onAnnotationsChanged(planId, ({ markers }) => {
      setPdfMarkers(normalizeMarkers(markers))
    })
    return unsub
  }, [planId]) // eslint-disable-line react-hooks/exhaustive-deps
}
