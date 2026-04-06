/**
 * usePlanAnnotationSave — shared save orchestration for PDF and DXF viewers.
 *
 * Provides deterministic debounced auto-save with visual state tracking.
 * Both viewers have identical save semantics:
 *   1. markDirty() on any annotation change → "Nem mentett" (dirty)
 *   2. 2s debounce → persist to IDB → "Mentve" (saved)
 *   3. 3s → auto-clear to "clean"
 *   4. Unmount → cancel pending debounce (unmount save is a separate effect in each viewer)
 *
 * Usage:
 *   const { saveState, markDirty, markSaved, debounceSaveTimerRef } = usePlanAnnotationSave({
 *     planId,
 *     hydratedRef,
 *     buildPayload,     // () => annotation payload object (viewer-specific fields)
 *     mergeWithStored,  // (stored, payload) => merged object to save (viewer-specific merge)
 *     onDirtyChange,    // optional parent callback
 *   })
 */
import { useState, useRef, useCallback } from 'react'
import { getPlanAnnotations, savePlanAnnotations } from '../data/planStore.js'

const DEBOUNCE_MS = 2000
const SAVED_DISPLAY_MS = 3000

export default function usePlanAnnotationSave({ planId, hydratedRef, buildPayload, mergeWithStored, onDirtyChange }) {
  const [saveState, setSaveState] = useState('clean') // 'clean' | 'dirty' | 'saved'
  const saveStateTimerRef = useRef(null)
  const debounceSaveTimerRef = useRef(null)
  const dirtyRef = useRef(false)

  // Show "saved" indicator for 3s then revert to "clean"
  const showSaved = useCallback(() => {
    dirtyRef.current = false
    if (onDirtyChange) onDirtyChange(false)
    setSaveState('saved')
    if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current)
    saveStateTimerRef.current = setTimeout(() => setSaveState('clean'), SAVED_DISPLAY_MS)
  }, [onDirtyChange])

  // Persist current state to IDB via the viewer's buildPayload callback
  const persistNow = useCallback(() => {
    if (!planId || !hydratedRef?.current) return
    const payload = buildPayload()
    getPlanAnnotations(planId).then(stored => {
      const merged = mergeWithStored ? mergeWithStored(stored, payload) : { ...stored, ...payload }
      savePlanAnnotations(planId, merged, { silent: true })
      showSaved()
    }).catch(() => {})
  }, [planId, hydratedRef, buildPayload, mergeWithStored, showSaved])

  // Mark as dirty and start debounce timer
  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true
      if (onDirtyChange) onDirtyChange(true)
    }
    setSaveState('dirty')
    if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current)
    if (debounceSaveTimerRef.current) clearTimeout(debounceSaveTimerRef.current)
    debounceSaveTimerRef.current = setTimeout(persistNow, DEBOUNCE_MS)
  }, [onDirtyChange, persistNow])

  // Explicit "saved" indicator (used after assignment/quoteOverrides persist)
  const markSaved = showSaved

  return { saveState, markDirty, markSaved, debounceSaveTimerRef, setSaveState }
}
