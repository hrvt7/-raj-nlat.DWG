// ─── PdfViewer Render Concurrency — Regression Tests ──────────────────────────
// Simulates the exact async render guard pattern used in PdfViewer to verify
// that stale render completions cannot overwrite the latest requested page.
//
// PdfViewer.renderPage uses:
//   1. renderIdRef   — monotonic sequence counter, incremented on each call
//   2. renderPageRef — stores the in-flight pdf.js RenderTask for cancellation
//   3. stale checks  — after each await, bail if renderId !== renderIdRef.current
//   4. cancel()      — cancels previous RenderTask, which rejects with
//                       RenderingCancelledException (silently caught)
//
// This test exercises the guard logic in isolation without mounting React.

import { describe, it, expect, vi } from 'vitest'

// ── Simulate the guard pattern extracted from PdfViewer ──────────────────────

function createRenderGuard() {
  let renderIdRef = 0
  let renderPageRef = null
  const canvasWrites = []    // tracks which page was written to canvas
  const postRenderRuns = []  // tracks which page's post-render logic ran

  /**
   * Simulates renderPage(doc, num) with the same concurrency guard.
   * @param {number} pageNum  — page to render
   * @param {number} getPageDelay — ms to simulate getPage latency
   * @param {number} renderDelay — ms to simulate page.render latency
   */
  async function renderPage(pageNum, getPageDelay = 0, renderDelay = 0) {
    // Cancel any in-flight render
    if (renderPageRef) {
      renderPageRef.cancel()
      renderPageRef = null
    }
    const renderId = ++renderIdRef

    // Simulate doc.getPage(num) — async
    await delay(getPageDelay)
    if (renderId !== renderIdRef) return // superseded

    // Simulate page.render() — async with cancellable task
    const task = createCancellableTask(renderDelay)
    renderPageRef = task
    try {
      await task.promise
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return
      throw err
    }
    renderPageRef = null

    if (renderId !== renderIdRef) return // superseded

    // Post-render effects (canvas write + view fit)
    canvasWrites.push(pageNum)
    postRenderRuns.push(pageNum)
  }

  return { renderPage, canvasWrites, postRenderRuns }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function createCancellableTask(ms) {
  let rejectFn
  let settled = false
  const promise = new Promise((resolve, reject) => {
    rejectFn = reject
    setTimeout(() => {
      if (!settled) { settled = true; resolve() }
    }, ms)
  })
  return {
    promise,
    cancel() {
      if (!settled) {
        settled = true
        const err = new Error('Rendering cancelled')
        err.name = 'RenderingCancelledException'
        rejectFn(err)
      }
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PdfViewer render concurrency guard', () => {

  it('single render completes normally', async () => {
    const { renderPage, canvasWrites, postRenderRuns } = createRenderGuard()
    await renderPage(1, 5, 5)
    expect(canvasWrites).toEqual([1])
    expect(postRenderRuns).toEqual([1])
  })

  it('fast page change: only latest page is rendered', async () => {
    const { renderPage, canvasWrites } = createRenderGuard()

    // Page 1 starts (slow render), page 2 immediately supersedes
    const r1 = renderPage(1, 5, 50)
    const r2 = renderPage(2, 5, 10)

    await Promise.all([r1, r2])
    // Only page 2 should have written to canvas
    expect(canvasWrites).toEqual([2])
  })

  it('triple rapid page change: only page 3 renders', async () => {
    const { renderPage, canvasWrites } = createRenderGuard()

    const r1 = renderPage(1, 10, 100)
    const r2 = renderPage(2, 10, 100)
    const r3 = renderPage(3, 10, 10)

    await Promise.all([r1, r2, r3])
    expect(canvasWrites).toEqual([3])
  })

  it('slow getPage on stale render bails before canvas write', async () => {
    const { renderPage, canvasWrites } = createRenderGuard()

    // Page 1 has a very slow getPage; page 2 starts before page 1's getPage completes
    const r1 = renderPage(1, 50, 5)
    await delay(2) // let r1 start but not complete getPage
    const r2 = renderPage(2, 5, 5)

    await Promise.all([r1, r2])
    // Page 1 should have bailed after its getPage completed (stale check)
    expect(canvasWrites).toEqual([2])
  })

  it('cancellation of in-flight render throws RenderingCancelledException silently', async () => {
    const { renderPage, canvasWrites, postRenderRuns } = createRenderGuard()

    // Page 1 starts with a long render
    const r1 = renderPage(1, 2, 200)
    await delay(10) // page 1 is mid-render
    // Page 2 starts → cancels page 1's render task
    const r2 = renderPage(2, 2, 5)

    await Promise.all([r1, r2])
    // Page 1 was cancelled, no canvas write; only page 2 ran post-render
    expect(canvasWrites).toEqual([2])
    expect(postRenderRuns).toEqual([2])
  })

  it('sequential non-overlapping renders all complete', async () => {
    const { renderPage, canvasWrites } = createRenderGuard()

    await renderPage(1, 2, 2)
    await renderPage(2, 2, 2)
    await renderPage(3, 2, 2)

    // Each render completes before the next starts — all should succeed
    expect(canvasWrites).toEqual([1, 2, 3])
  })

  it('rotation trigger during page render: only rotation result wins', async () => {
    const { renderPage, canvasWrites } = createRenderGuard()

    // Simulate: pageNum change starts render, then rotation triggers re-render
    const pageRender = renderPage(5, 5, 50)
    await delay(10) // page render in progress
    const rotationRender = renderPage(5, 5, 10) // same page, rotation trigger

    await Promise.all([pageRender, rotationRender])
    // Only the rotation-triggered render (latest) should complete
    expect(canvasWrites).toEqual([5])
  })
})
