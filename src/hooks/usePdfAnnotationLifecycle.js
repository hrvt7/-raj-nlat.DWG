/**
 * usePdfAnnotationLifecycle — annotation persistence orchestration for PdfViewer.
 *
 * Manages the full annotation lifecycle:
 *   1. Hydrate on mount (markers, measurements, scale, heights, assignments, templates, families)
 *   2. Eager persist of assignments/quoteOverrides on change
 *   3. External annotation sync (DetectionReviewPanel)
 *   4. Unmount save (merge-before-save with detection preservation)
 *   5. Save state tracking (debounced via usePlanAnnotationSave)
 *
 * Effects-only pattern: state and refs are owned by PdfViewer and passed in.
 */
import { useEffect, useCallback } from 'react'
import { savePlanAnnotations, getPlanAnnotations, onAnnotationsChanged } from '../data/planStore.js'
import { normalizeMarkers } from '../utils/markerModel.js'
import { migrateMarkers } from '../components/PdfViewer/pdfUtils.js'
import { loadCategoryAssemblyMap, applyDefaultAssignments } from '../data/categoryAssemblyMap.js'
import usePlanAnnotationSave from './usePlanAnnotationSave.js'

export default function usePdfAnnotationLifecycle({
  planId, assembliesProp, onDirtyChange,
  // Refs (owned by PdfViewer)
  markersRef, measuresRef, scaleRef, savedTemplatesRef, symbolFamiliesRef,
  assignmentsRef, quoteOverridesRef, rotationRef, hydratedRef, migrationRef,
  onMarkersChangeRef,
  // State setters (owned by PdfViewer)
  setCeilingHeight, setSocketHeight, setSwitchHeight,
  setAssignments, setQuoteOverrides, setRotation, setScale,
  setRenderTick, notifyMeasurements,
  // Values for payload
  ceilingHeight, socketHeight, switchHeight, assignments, quoteOverrides,
}) {
  // ── Build payload + merge for debounced save ──
  const buildPdfPayload = useCallback(() => ({
    markers: markersRef.current,
    measurements: measuresRef.current,
    scale: scaleRef.current,
    ceilingHeight, socketHeight, switchHeight,
    assignments: assignmentsRef.current,
    quoteOverrides: quoteOverridesRef.current,
    rotation: rotationRef.current,
    coordVersion: 2,
  }), [ceilingHeight, socketHeight, switchHeight, markersRef, measuresRef, scaleRef, assignmentsRef, quoteOverridesRef, rotationRef])

  const mergePdfWithStored = useCallback((stored, payload) => ({
    ...stored,
    ...payload,
    savedTemplates: savedTemplatesRef.current.length > 0 ? savedTemplatesRef.current : (stored?.savedTemplates || []),
    symbolFamilies: symbolFamiliesRef.current.length > 0 ? symbolFamiliesRef.current : (stored?.symbolFamilies || []),
  }), [savedTemplatesRef, symbolFamiliesRef])

  const { saveState, markDirty, markSaved, debounceSaveTimerRef, setSaveState } = usePlanAnnotationSave({
    planId, hydratedRef,
    buildPayload: buildPdfPayload,
    mergeWithStored: mergePdfWithStored,
    onDirtyChange,
  })

  // ── Eager persist assignments/quoteOverrides ──
  useEffect(() => {
    if (!planId || !hydratedRef.current) return
    getPlanAnnotations(planId).then(stored => {
      if (!stored) return
      savePlanAnnotations(planId, { ...stored, assignments, quoteOverrides }, { silent: true })
      markSaved()
    }).catch(() => {})
  }, [assignments, quoteOverrides, planId, markSaved, hydratedRef])

  // ── Hydrate on mount ──
  useEffect(() => {
    if (!planId) return
    hydratedRef.current = false
    getPlanAnnotations(planId).then(ann => {
      if (ann.markers?.length) {
        const normalized = normalizeMarkers(ann.markers)
        markersRef.current = migrateMarkers(normalized, assembliesProp)
        setRenderTick(t => t + 1)
        if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      }
      if (ann.measurements?.length) { measuresRef.current = ann.measurements; notifyMeasurements() }
      savedTemplatesRef.current = ann.savedTemplates?.length ? ann.savedTemplates : []
      symbolFamiliesRef.current = ann.symbolFamilies?.length ? ann.symbolFamilies : []
      if (ann.scale?.calibrated) { setScale(ann.scale) }
      if (ann.ceilingHeight) setCeilingHeight(ann.ceilingHeight)
      if (ann.socketHeight) setSocketHeight(ann.socketHeight)
      if (ann.switchHeight) setSwitchHeight(ann.switchHeight)
      let loadedAssignments = {}
      if (ann.assignments && typeof ann.assignments === 'object') {
        loadedAssignments = ann.assignments
      }
      const defaults = loadCategoryAssemblyMap()
      const merged = applyDefaultAssignments(loadedAssignments, defaults)
      setAssignments(merged)
      assignmentsRef.current = merged

      if (ann.quoteOverrides && typeof ann.quoteOverrides === 'object') {
        setQuoteOverrides(ann.quoteOverrides)
        quoteOverridesRef.current = ann.quoteOverrides
      }
      if (ann.rotation != null) setRotation(ann.rotation)
      if (!ann.coordVersion || ann.coordVersion < 2) {
        migrationRef.current = { rotation: ann.rotation || 0 }
      }
      if (onDirtyChange) onDirtyChange(false)
      setSaveState('clean')
      hydratedRef.current = true
    })
  }, [planId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── External annotation sync ──
  useEffect(() => {
    if (!planId) return
    const unsub = onAnnotationsChanged(planId, ({ markers, assignments: extAssignments }) => {
      markersRef.current = migrateMarkers(normalizeMarkers(markers), assembliesProp)
      setRenderTick(t => t + 1)
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      const currentAsgn = extAssignments || assignmentsRef.current
      const defaults = loadCategoryAssemblyMap()
      const merged = applyDefaultAssignments(currentAsgn, defaults)
      if (merged !== currentAsgn) {
        setAssignments(merged)
        assignmentsRef.current = merged
      }
    })
    return unsub
  }, [planId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unmount save ──
  useEffect(() => {
    return () => {
      if (debounceSaveTimerRef.current) clearTimeout(debounceSaveTimerRef.current)
      if (!planId) return
      if (!hydratedRef.current) return
      const localMarkers = markersRef.current
      getPlanAnnotations(planId).then(stored => {
        const storedMarkers = normalizeMarkers(stored?.markers || [])
        const localIds = new Set(localMarkers.map(m => m.id))
        const externalDetections = storedMarkers.filter(m => {
          if (m.source !== 'detection') return false
          if (localIds.has(m.id)) return false
          const tooClose = localMarkers.some(lm =>
            lm.category === m.category &&
            Math.hypot(lm.x - m.x, lm.y - m.y) < 15
          )
          return !tooClose
        })
        const merged = [...localMarkers, ...externalDetections]
        savePlanAnnotations(planId, {
          markers: merged,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight, socketHeight, switchHeight,
          assignments: assignmentsRef.current,
          quoteOverrides: quoteOverridesRef.current,
          rotation: rotationRef.current,
          coordVersion: 2,
          savedTemplates: savedTemplatesRef.current.length > 0 ? savedTemplatesRef.current : (stored?.savedTemplates || []),
          symbolFamilies: symbolFamiliesRef.current.length > 0 ? symbolFamiliesRef.current : (stored?.symbolFamilies || []),
        }, { silent: true })
      }).catch(() => {
        savePlanAnnotations(planId, {
          markers: localMarkers,
          measurements: measuresRef.current,
          scale: scaleRef.current,
          ceilingHeight, socketHeight, switchHeight,
          assignments: assignmentsRef.current,
          quoteOverrides: quoteOverridesRef.current,
          rotation: rotationRef.current,
          coordVersion: 2,
          savedTemplates: savedTemplatesRef.current.length > 0 ? savedTemplatesRef.current : [],
          symbolFamilies: symbolFamiliesRef.current.length > 0 ? symbolFamiliesRef.current : [],
        }, { silent: true })
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { saveState, markDirty, markSaved, debounceSaveTimerRef, setSaveState }
}
