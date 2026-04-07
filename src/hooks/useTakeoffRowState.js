/**
 * useTakeoffRowState — Derived takeoff row chain for TakeoffWorkspace.
 *
 * Pure derived-state hook: all outputs are useMemo-based, no side effects.
 * Computes: recognizedItems → effectiveItems → unknownItems/progress → takeoffRows
 */

import { useMemo } from 'react'
import { buildRecognitionRows, buildMarkerRows, mergeTakeoffRows } from '../utils/takeoffRows.js'

/**
 * @param {Object} params
 * @param {Array} params.recognizedItems
 * @param {Set} params.deletedItems
 * @param {Object} params.itemQtyOverrides
 * @param {Object} params.asmOverrides
 * @param {Object} params.qtyOverrides
 * @param {Object} params.variantOverrides
 * @param {Object} params.wallSplits
 * @param {Array} params.pdfMarkers
 * @returns {{ effectiveItems, totalItems, unknownItems, unknownProgress, recognitionTakeoffRows, markerTakeoffRows, takeoffRows }}
 */
export default function useTakeoffRowState({
  recognizedItems, deletedItems, itemQtyOverrides,
  asmOverrides, qtyOverrides, variantOverrides, wallSplits,
  pdfMarkers,
}) {
  const effectiveItems = useMemo(() => {
    return recognizedItems
      .filter(i => !deletedItems.has(i.blockName))
      .map(i => itemQtyOverrides[i.blockName] != null
        ? { ...i, qty: itemQtyOverrides[i.blockName] }
        : i
      )
  }, [recognizedItems, deletedItems, itemQtyOverrides])

  const totalItems = effectiveItems.reduce((s, i) => s + i.qty, 0)

  // ── Unknown items: blocks with no asmId AND no override ────────────────
  const unknownItems = useMemo(() => {
    return effectiveItems.filter(i => {
      const resolvedAsmId = asmOverrides[i.blockName] !== undefined ? asmOverrides[i.blockName] : i.asmId
      return !resolvedAsmId
    })
  }, [effectiveItems, asmOverrides])

  // ── Unknown block resolution progress (for UnknownBlockPanel progress bar) ──
  const unknownProgress = useMemo(() => {
    const totalTypes = effectiveItems.length
    const unresolvedTypes = unknownItems.length
    const resolvedTypes = totalTypes - unresolvedTypes
    const totalQty = effectiveItems.reduce((s, i) => s + i.qty, 0)
    const unresolvedQty = unknownItems.reduce((s, i) => s + i.qty, 0)
    const resolvedQty = totalQty - unresolvedQty
    const coveragePct = totalQty > 0 ? Math.round((resolvedQty / totalQty) * 100) : 0
    return { resolvedTypes, totalTypes, resolvedQty, totalQty, coveragePct }
  }, [effectiveItems, unknownItems])

  // ── Derived: takeoff rows (grouped by assembly) ───────────────────────────
  const recognitionTakeoffRows = useMemo(() => {
    return buildRecognitionRows(effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits)
  }, [effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits])

  const markerTakeoffRows = useMemo(() => {
    return buildMarkerRows(pdfMarkers, variantOverrides, wallSplits)
  }, [pdfMarkers, variantOverrides, wallSplits])

  // Merged takeoff rows: recognition + manual markers (no duplicates)
  const takeoffRows = useMemo(() => {
    return mergeTakeoffRows(recognitionTakeoffRows, markerTakeoffRows)
  }, [recognitionTakeoffRows, markerTakeoffRows])

  return { effectiveItems, totalItems, unknownItems, unknownProgress, recognitionTakeoffRows, markerTakeoffRows, takeoffRows }
}
