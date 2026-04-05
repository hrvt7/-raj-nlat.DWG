/**
 * Save orchestration regression tests.
 *
 * Tests the debounced auto-save logic at the algorithmic level.
 * Verifies:
 * 1. Debounced save fires after delay
 * 2. Multiple rapid changes reset the debounce timer
 * 3. Latest state is always persisted (no stale overwrite)
 * 4. Unmount cancels pending debounce
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('debounced save orchestration', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires save after 2s debounce delay', () => {
    const saveFn = vi.fn()
    let timer = null

    // Simulate markDirty → debounced save
    function markDirty() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(saveFn, 2000)
    }

    markDirty()
    expect(saveFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1999)
    expect(saveFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(saveFn).toHaveBeenCalledTimes(1)
  })

  it('resets debounce on rapid changes — only saves once', () => {
    const saveFn = vi.fn()
    let timer = null

    function markDirty() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(saveFn, 2000)
    }

    // 5 rapid changes within 500ms
    for (let i = 0; i < 5; i++) {
      markDirty()
      vi.advanceTimersByTime(100)
    }

    // Only 500ms have passed since first markDirty, but timer reset each time
    expect(saveFn).not.toHaveBeenCalled()

    // Advance to 2s after the LAST markDirty
    vi.advanceTimersByTime(2000)
    expect(saveFn).toHaveBeenCalledTimes(1)
  })

  it('always saves latest state (ref-based, not closure-captured)', () => {
    const saves = []
    const stateRef = { current: 0 }

    let timer = null
    function markDirtyAndSave() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => saves.push(stateRef.current), 2000)
    }

    stateRef.current = 1
    markDirtyAndSave()

    vi.advanceTimersByTime(500)
    stateRef.current = 2 // change state before save fires
    markDirtyAndSave()   // resets timer

    vi.advanceTimersByTime(500)
    stateRef.current = 3 // change again
    markDirtyAndSave()   // resets timer again

    vi.advanceTimersByTime(2000) // timer fires
    expect(saves).toEqual([3]) // saved the LATEST state, not 1 or 2
  })

  it('unmount cancels pending debounce', () => {
    const saveFn = vi.fn()
    let timer = null

    function markDirty() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(saveFn, 2000)
    }

    function unmount() {
      if (timer) clearTimeout(timer)
      timer = null
    }

    markDirty()
    vi.advanceTimersByTime(1000) // halfway through debounce
    unmount() // cancel pending

    vi.advanceTimersByTime(2000) // would have fired here
    expect(saveFn).not.toHaveBeenCalled() // but unmount cancelled it
  })

  it('save feedback state transitions: clean → dirty → saved → clean', () => {
    let state = 'clean'
    let savedTimer = null
    const saveFn = vi.fn(() => {
      state = 'saved'
      savedTimer = setTimeout(() => { state = 'clean' }, 3000)
    })
    let debounceTimer = null

    function markDirty() {
      state = 'dirty'
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(saveFn, 2000)
    }

    expect(state).toBe('clean')

    markDirty()
    expect(state).toBe('dirty')

    vi.advanceTimersByTime(2000)
    expect(state).toBe('saved')
    expect(saveFn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(3000)
    expect(state).toBe('clean')
  })
})
