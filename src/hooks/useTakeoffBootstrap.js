/**
 * useTakeoffBootstrap — Bootstrap / prefill lifecycle for TakeoffWorkspace.
 *
 * Handles two mount-time effects:
 *   1. initialData prefill: synthesize recognizedItems from merge/analysis data
 *   2. initialFile autoload: auto-open a file passed as prop
 *
 * Effects-only hook — no owned state.
 */

import { useEffect } from 'react'

/**
 * @param {Object} params
 * @param {Object|null} params.initialData — merge/analysis prefill data
 * @param {File|null} params.initialFile — file to auto-open
 * @param {File|null} params.file — current file state (gate for autoload)
 * @param {Function} params.setRecognizedItems
 * @param {Function} params.setRightTab
 * @param {Function} params.setQuoteName
 * @param {Function} params.handleFile
 */
export default function useTakeoffBootstrap({
  initialData, initialFile, file,
  setRecognizedItems, setRightTab, setQuoteName,
  handleFile,
}) {
  // ── Pre-fill from MergePlansView (DXF / PDF / Manual merge) ─────────────
  // When the user clicks "Ajánlat létrehozása" in MergePlansView, initialData
  // carries the counted assembly quantities.  We synthesise recognizedItems so
  // the normal takeoffRows pipeline picks them up, then jump to the Felmérés tab.
  useEffect(() => {
    if (!initialData) return

    const syntheticItems = []

    if (initialData.source === 'dxf_analysis' && initialData.countByAssemblyType) {
      for (const [asmType, count] of Object.entries(initialData.countByAssemblyType)) {
        const asmId = initialData.assignments?.[asmType]
        if (asmId && count > 0)
          syntheticItems.push({ blockName: `PREFILL_${asmType}`, qty: count, asmId, confidence: 1.0 })
      }
    } else if (initialData.source === 'pdf_recognition' && initialData.recognizedItems) {
      for (const item of initialData.recognizedItems) {
        if (item.asmId && item.total > 0)
          syntheticItems.push({ blockName: `PREFILL_${item._pdfType || item.label}`, qty: item.total, asmId: item.asmId, confidence: 1.0 })
      }
    } else if (initialData.countByCategory && initialData.assignments) {
      // ManualMergeTab
      for (const [cat, count] of Object.entries(initialData.countByCategory)) {
        const asmId = initialData.assignments?.[cat]
        if (asmId && count > 0)
          syntheticItems.push({ blockName: `PREFILL_${cat}`, qty: count, asmId, confidence: 1.0 })
      }
    }

    if (syntheticItems.length > 0) {
      setRecognizedItems(syntheticItems)
      setRightTab('takeoff')
    }
    if (initialData.planName) setQuoteName(initialData.planName)
  }, [initialData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-load file when passed as prop (e.g. from Felmérés page) ────────────
  useEffect(() => {
    if (initialFile && !file) handleFile(initialFile)
  }, [initialFile]) // eslint-disable-line react-hooks/exhaustive-deps
}
