/**
 * useTakeoffReviewAuditState — Derived review/audit/readiness/save-gating state.
 *
 * Pure derived-state hook: all outputs are useMemo-based, no side effects.
 * Computes the full review→audit→workflow→gating chain from workspace inputs.
 */

import { useMemo } from 'react'
import { classifyAllItems, buildReviewSummary, computeQuoteReadiness } from '../utils/reviewState.js'
import { computeDxfAudit } from '../utils/dxfAudit.js'
import { computeCableAudit } from '../utils/cableAudit.js'
import { computeWorkflowStatus, getSaveGating } from '../utils/workflowStatus.js'

/**
 * @param {Object} params
 * @param {Array} params.recognizedItems
 * @param {Object} params.asmOverrides
 * @param {Set} params.deletedItems
 * @param {Object|null} params.cableEstimate
 * @param {boolean} params.cableReviewed
 * @param {Object|null} params.parsedDxf
 * @param {boolean} params.isPdf
 * @param {Array} params.referencePanels
 * @param {number} params.takeoffRowCount
 * @returns {{ classifiedItems, reviewSummary, quoteReadiness, dxfAudit, cableAudit, workflowStatus, saveGating }}
 */
export default function useTakeoffReviewAuditState({
  recognizedItems, asmOverrides, deletedItems,
  cableEstimate, cableReviewed,
  parsedDxf, isPdf,
  referencePanels, takeoffRowCount,
}) {
  // ── Review state classification ──────────────────────────────────────────
  const classifiedItems = useMemo(() => {
    return classifyAllItems(recognizedItems, asmOverrides, deletedItems)
  }, [recognizedItems, asmOverrides, deletedItems])

  const reviewSummary = useMemo(() => {
    return buildReviewSummary(classifiedItems)
  }, [classifiedItems])

  const quoteReadiness = useMemo(() => {
    const cableConf = cableEstimate?.confidence ?? null
    return computeQuoteReadiness(reviewSummary, cableConf, { cableReviewed })
  }, [reviewSummary, cableEstimate, cableReviewed])

  // ── DXF Import Audit (structured quality summary) ────────────────────────
  const dxfAudit = useMemo(() => {
    if (!parsedDxf || isPdf) return null
    return computeDxfAudit(parsedDxf, recognizedItems)
  }, [parsedDxf, recognizedItems, isPdf])

  // ── Cable Audit (structured cable confidence/transparency) ───────────────
  const cableAudit = useMemo(() => {
    if (!parsedDxf || isPdf) return null
    return computeCableAudit(parsedDxf, recognizedItems, cableEstimate, referencePanels)
  }, [parsedDxf, recognizedItems, cableEstimate, isPdf, referencePanels])

  // ── Unified workflow status ──────────────────────────────────────────────
  const workflowStatus = useMemo(() => {
    return computeWorkflowStatus({
      dxfAudit, reviewSummary, quoteReadiness, cableAudit,
      takeoffRowCount,
      isPdf, hasFile: !!parsedDxf || isPdf,
      cableReviewed,
    })
  }, [dxfAudit, reviewSummary, quoteReadiness, cableAudit, takeoffRowCount, isPdf, parsedDxf, cableReviewed])

  const saveGating = useMemo(() => getSaveGating(workflowStatus), [workflowStatus])

  return { classifiedItems, reviewSummary, quoteReadiness, dxfAudit, cableAudit, workflowStatus, saveGating }
}
