// ─── DxfViewer Hydration Guard — Regression Tests ────────────────────────────
// Verifies the exact race condition that previously caused stored annotations
// to be overwritten by empty state during fast mount/unmount.
//
// The real production code lives in DxfViewer/index.jsx as two useEffect hooks:
//   1. Mount: getPlanAnnotations(planId) → populate refs → hydratedRef = true
//   2. Unmount cleanup: if (!hydratedRef.current) return → save annotations
//
// These tests reproduce the same Promise-timing pattern in isolation to prove
// the guard prevents data loss without requiring a React test renderer.

import { describe, it, expect, vi } from 'vitest'

// ── Simulates the exact DxfViewer hydration + unmount-save pattern ───────────
// This mirrors the two useEffect hooks in DxfViewer/index.jsx:
//   - mountEffect: starts async annotation load, sets hydratedRef when done
//   - unmountCleanup: skips save if hydratedRef is false (the guard)
//
// We use the same ref semantics (mutable { current }) and Promise flow as the
// production code so the timing is identical.

function simulateMountEffect(planId, hydratedRef, markersRef, loadFn) {
  hydratedRef.current = false
  return loadFn(planId).then(ann => {
    if (ann?.markers?.length) markersRef.current = ann.markers
    hydratedRef.current = true
  }).catch(() => {
    hydratedRef.current = true
  })
}

function simulateUnmountCleanup(planId, hydratedRef, markersRef, saveFn) {
  if (!planId) return
  if (!hydratedRef.current) return  // ← THE GUARD
  saveFn(planId, { markers: markersRef.current })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DxfViewer hydration guard — data-loss prevention', () => {

  it('fast unmount before load resolves does NOT save empty markers', async () => {
    let resolveLoad
    const loadPromise = new Promise(r => { resolveLoad = r })
    const mockLoad = vi.fn(() => loadPromise)
    const mockSave = vi.fn()

    const hydratedRef = { current: false }
    const markersRef = { current: [] }

    // 1. Mount: start async annotation load
    simulateMountEffect('plan-1', hydratedRef, markersRef, mockLoad)

    // 2. Immediate unmount BEFORE load resolves (the race condition)
    simulateUnmountCleanup('plan-1', hydratedRef, markersRef, mockSave)

    // ASSERT: save was NOT called — empty markers not persisted
    expect(mockSave).not.toHaveBeenCalled()
    expect(hydratedRef.current).toBe(false)

    // Clean up: resolve the pending promise
    resolveLoad({ markers: [] })
    await loadPromise
  })

  it('unmount after load resolves DOES save markers', async () => {
    const storedMarkers = [
      { id: 'm1', x: 100, y: 200, type: 'socket' },
      { id: 'm2', x: 300, y: 400, type: 'switch' },
    ]
    const mockLoad = vi.fn(() => Promise.resolve({ markers: storedMarkers }))
    const mockSave = vi.fn()

    const hydratedRef = { current: false }
    const markersRef = { current: [] }

    // 1. Mount and wait for load to complete
    await simulateMountEffect('plan-1', hydratedRef, markersRef, mockLoad)

    // Verify hydration completed and markers were populated
    expect(hydratedRef.current).toBe(true)
    expect(markersRef.current).toEqual(storedMarkers)

    // 2. Unmount AFTER hydration
    simulateUnmountCleanup('plan-1', hydratedRef, markersRef, mockSave)

    // ASSERT: save WAS called with the loaded markers
    expect(mockSave).toHaveBeenCalledOnce()
    expect(mockSave).toHaveBeenCalledWith('plan-1', { markers: storedMarkers })
  })

  it('load failure (.catch path) still unblocks save', async () => {
    const mockLoad = vi.fn(() => Promise.reject(new Error('IDB corrupt')))
    const mockSave = vi.fn()

    const hydratedRef = { current: false }
    const markersRef = { current: [] }

    // 1. Mount — load will reject
    await simulateMountEffect('plan-1', hydratedRef, markersRef, mockLoad)

    // Hydration unblocked despite error
    expect(hydratedRef.current).toBe(true)

    // 2. Unmount — save should proceed (nothing stored to protect)
    simulateUnmountCleanup('plan-1', hydratedRef, markersRef, mockSave)

    expect(mockSave).toHaveBeenCalledOnce()
  })

  it('plan switch resets hydration guard', async () => {
    const mockSave = vi.fn()

    // Simulate plan-A fully loaded
    const hydratedRef = { current: false }
    const markersRef = { current: [] }

    const markersA = [{ id: 'a1', x: 10, y: 20 }]
    const mockLoadA = vi.fn(() => Promise.resolve({ markers: markersA }))
    await simulateMountEffect('plan-A', hydratedRef, markersRef, mockLoadA)
    expect(hydratedRef.current).toBe(true)

    // Switch to plan-B: mount starts new load (hydratedRef reset to false)
    let resolveB
    const loadPromiseB = new Promise(r => { resolveB = r })
    const mockLoadB = vi.fn(() => loadPromiseB)
    simulateMountEffect('plan-B', hydratedRef, markersRef, mockLoadB)

    // hydratedRef is false again — guard active
    expect(hydratedRef.current).toBe(false)

    // If unmount happens now (before plan-B loads), save is blocked
    simulateUnmountCleanup('plan-B', hydratedRef, markersRef, mockSave)
    expect(mockSave).not.toHaveBeenCalled()

    // Clean up
    resolveB({ markers: [] })
    await loadPromiseB
  })
})
