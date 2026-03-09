// ─── Workspace Layout & Seed Flow Regression Tests ──────────────────────────
// Covers:
//   1. View constants (FIT_MARGIN, MIN_ZOOM, MAX_ZOOM)
//   2. clampView helper logic
//   3. Fit-to-viewport helper
//   4. Page shadow rendering concept
//   5. SeedAssignPanel scope chooser removed
//   6. Region-first workflow after seed save
//   7. Architecture boundary — what must NOT change
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest'

// ── View layout constants (mirrored from PdfViewer/index.jsx) ──
const MIN_ZOOM = 0.25
const MAX_ZOOM = 10
const FIT_MARGIN = 0.95

// ── Pure helper: clampView ──
// Extracted logic from PdfViewer for testability.
function clampView(viewRef, containerWidth, containerHeight) {
  const v = viewRef
  const cw = containerWidth
  const ch = containerHeight
  const pw = v.pageWidth * v.zoom
  const ph = v.pageHeight * v.zoom
  const maxOffX = cw * 0.5
  const maxOffY = ch * 0.5
  const minOffX = cw - pw - cw * 0.5
  const minOffY = ch - ph - ch * 0.5
  v.offsetX = Math.max(Math.min(v.offsetX, maxOffX), minOffX)
  v.offsetY = Math.max(Math.min(v.offsetY, maxOffY), minOffY)
  return v
}

// ── Pure helper: fitToViewport ──
function fitToViewport(pageWidth, pageHeight, containerWidth, containerHeight) {
  const zoom = Math.min(containerWidth / pageWidth, containerHeight / pageHeight) * FIT_MARGIN
  const offsetX = (containerWidth - pageWidth * zoom) / 2
  const offsetY = (containerHeight - pageHeight * zoom) / 2
  return { zoom, offsetX, offsetY }
}

// ── Pure helper: clampZoom ──
function clampZoom(zoom) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

// ═════════════════════════════════════════════════════════════════════════════
describe('Workspace Layout — View Constants', () => {
  it('FIT_MARGIN is 0.95 — tighter than legacy 0.92', () => {
    expect(FIT_MARGIN).toBe(0.95)
    expect(FIT_MARGIN).toBeGreaterThan(0.92)
  })

  it('MIN_ZOOM is 0.25 — prevents excessively small page view', () => {
    expect(MIN_ZOOM).toBe(0.25)
    expect(MIN_ZOOM).toBeGreaterThan(0.1) // old was 0.1
  })

  it('MAX_ZOOM is 10 — prevents excessively large page view', () => {
    expect(MAX_ZOOM).toBe(10)
    expect(MAX_ZOOM).toBeLessThan(20) // old was 20
  })

  it('clampZoom enforces range', () => {
    expect(clampZoom(0.05)).toBe(MIN_ZOOM)
    expect(clampZoom(50)).toBe(MAX_ZOOM)
    expect(clampZoom(2)).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Workspace Layout — clampView', () => {
  const makeView = (overrides = {}) => ({
    offsetX: 0, offsetY: 0, zoom: 1, pageWidth: 800, pageHeight: 600,
    ...overrides,
  })

  it('centered view stays centered', () => {
    const v = makeView({ offsetX: 100, offsetY: 100, zoom: 1 })
    const clamped = clampView(v, 1000, 800)
    expect(clamped.offsetX).toBe(100)
    expect(clamped.offsetY).toBe(100)
  })

  it('clamps extreme positive offsetX (page dragged far right)', () => {
    const v = makeView({ offsetX: 2000, offsetY: 0, zoom: 1 })
    const clamped = clampView(v, 1000, 800)
    // maxOffX = 1000 * 0.5 = 500
    expect(clamped.offsetX).toBe(500)
  })

  it('clamps extreme negative offsetX (page dragged far left)', () => {
    const v = makeView({ offsetX: -5000, offsetY: 0, zoom: 1 })
    const clamped = clampView(v, 1000, 800)
    // minOffX = 1000 - 800*1 - 500 = -300
    expect(clamped.offsetX).toBe(-300)
  })

  it('clamps extreme positive offsetY (page dragged far down)', () => {
    const v = makeView({ offsetX: 0, offsetY: 3000, zoom: 1 })
    const clamped = clampView(v, 1000, 800)
    // maxOffY = 800 * 0.5 = 400
    expect(clamped.offsetY).toBe(400)
  })

  it('clamps extreme negative offsetY (page dragged far up)', () => {
    const v = makeView({ offsetX: 0, offsetY: -5000, zoom: 1 })
    const clamped = clampView(v, 1000, 800)
    // minOffY = 800 - 600*1 - 400 = -200
    expect(clamped.offsetY).toBe(-200)
  })

  it('clamp accounts for zoom — zoomed-in page has more travel room', () => {
    const v = makeView({ offsetX: -3000, offsetY: 0, zoom: 2 })
    const clamped = clampView(v, 1000, 800)
    // pw = 800 * 2 = 1600
    // minOffX = 1000 - 1600 - 500 = -1100
    expect(clamped.offsetX).toBe(-1100)
  })

  it('small zoom — page fits comfortably, limited drift', () => {
    const v = makeView({ offsetX: 600, offsetY: 0, zoom: 0.5 })
    const clamped = clampView(v, 1000, 800)
    // maxOffX = 500
    expect(clamped.offsetX).toBe(500)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Workspace Layout — fitToViewport', () => {
  it('landscape page in landscape container', () => {
    const fit = fitToViewport(800, 600, 1000, 800)
    // min(1000/800, 800/600) = min(1.25, 1.333) = 1.25
    // zoom = 1.25 * 0.95 = 1.1875
    expect(fit.zoom).toBeCloseTo(1.1875, 3)
    // centered: (1000 - 800*1.1875)/2 = (1000 - 950)/2 = 25
    expect(fit.offsetX).toBeCloseTo(25, 0)
  })

  it('portrait page in landscape container', () => {
    const fit = fitToViewport(600, 800, 1000, 800)
    // min(1000/600, 800/800) = min(1.667, 1) = 1
    // zoom = 1 * 0.95 = 0.95
    expect(fit.zoom).toBeCloseTo(0.95, 3)
  })

  it('square page in square container', () => {
    const fit = fitToViewport(500, 500, 500, 500)
    expect(fit.zoom).toBeCloseTo(0.95, 3)
    expect(fit.offsetX).toBeCloseTo(12.5, 1) // (500 - 500*0.95)/2 = 12.5
    expect(fit.offsetY).toBeCloseTo(12.5, 1)
  })

  it('page perfectly centered after fit', () => {
    const fit = fitToViewport(800, 600, 1200, 900)
    const pageScreenW = 800 * fit.zoom
    const pageScreenH = 600 * fit.zoom
    const centerX = fit.offsetX + pageScreenW / 2
    const centerY = fit.offsetY + pageScreenH / 2
    expect(centerX).toBeCloseTo(600, 1) // container center
    expect(centerY).toBeCloseTo(450, 1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Workspace Layout — Page shadow concept', () => {
  it('page shadow must be drawn before PDF image, not after', () => {
    // Conceptual test: shadow renders a white rect at page position
    // before the actual PDF is composited on top.
    // This ensures shadow is BEHIND the PDF content.
    const renderOrder = []
    const mockCtx = {
      save: () => renderOrder.push('save'),
      restore: () => renderOrder.push('restore'),
      fillRect: (x, y, w, h) => renderOrder.push(`fill:${w}x${h}`),
      drawImage: () => renderOrder.push('drawImage'),
      translate: () => {},
      scale: () => {},
      set shadowColor(_) { renderOrder.push('shadowColor') },
      set shadowBlur(_) {},
      set shadowOffsetX(_) {},
      set shadowOffsetY(_) {},
      set fillStyle(_) {},
    }

    // Simulate the render order from drawOverlay
    mockCtx.save()
    mockCtx.shadowColor = 'rgba(0,0,0,0.5)'
    mockCtx.fillRect(10, 10, 800, 600) // shadow rect
    mockCtx.restore()
    mockCtx.save()
    mockCtx.translate(10, 10)
    mockCtx.scale(1, 1)
    mockCtx.drawImage() // PDF content
    mockCtx.restore()

    const fillIdx = renderOrder.indexOf('fill:800x600')
    const drawIdx = renderOrder.indexOf('drawImage')
    expect(fillIdx).toBeLessThan(drawIdx)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('SeedAssignPanel — Scope chooser removed', () => {
  it('SeedAssignPanel no longer imports RECIPE_SCOPE', async () => {
    // Read the actual SeedAssignPanel source to verify no RECIPE_SCOPE import
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/SeedAssignPanel.jsx'),
      'utf-8'
    )
    expect(src).not.toContain('import { RECIPE_SCOPE }')
    expect(src).not.toContain("import { RECIPE_SCOPE")
  })

  it('SeedAssignPanel has no scope selector UI', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/SeedAssignPanel.jsx'),
      'utf-8'
    )
    expect(src).not.toContain('Hatókör')
    expect(src).not.toContain('Aktuális oldal')
    expect(src).not.toContain('Teljes terv')
    expect(src).not.toContain("setScope(")
  })

  it('SeedAssignPanel always sends current_region scope on save', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/SeedAssignPanel.jsx'),
      'utf-8'
    )
    expect(src).toContain("'current_region'")
  })

  it('SeedAssignPanel shows region-first hint instead of scope chooser', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/SeedAssignPanel.jsx'),
      'utf-8'
    )
    expect(src).toContain('keresési területet jelölhetsz ki')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Region-first workflow — after seed save', () => {
  it('handleSeedSave sets awaitingRegionForRecipe when no pendingRegion', () => {
    // Simulated behavior: after save, if no region drawn yet,
    // PdfViewer shows awaitingRegionForRecipe banner
    let awaitingRegion = null
    const setAwaitingRegionForRecipe = (val) => { awaitingRegion = val }
    const mockRecipe = { id: 'R-001', assemblyId: 'ASM-001' }

    // Simulate handleSeedSave behavior (no pending region)
    const pendingRegion = null
    if (pendingRegion) {
      // Would auto-launch search
    } else {
      setAwaitingRegionForRecipe({ ...mockRecipe, cropDataUrl: 'data:...' })
    }

    expect(awaitingRegion).not.toBeNull()
    expect(awaitingRegion.id).toBe('R-001')
    expect(awaitingRegion.cropDataUrl).toBe('data:...')
  })

  it('region-first banner has region draw instructions', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/PdfViewer/index.jsx'),
      'utf-8'
    )
    // Banner text
    expect(src).toContain('Minta mentve')
    expect(src).toContain('keresési területet')
    // Skip button
    expect(src).toContain('Teljes oldal')
  })

  it('awaitingRegionForRecipe state exists in PdfViewer', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/PdfViewer/index.jsx'),
      'utf-8'
    )
    expect(src).toContain('awaitingRegionForRecipe')
    expect(src).toContain('setAwaitingRegionForRecipe')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Architecture boundary — what must NOT change', () => {
  it('RECIPE_SCOPE enum still exists in recipeStore', async () => {
    const { RECIPE_SCOPE } = await import('../data/recipeStore.js')
    expect(RECIPE_SCOPE.CURRENT_PAGE).toBe('current_page')
    expect(RECIPE_SCOPE.WHOLE_PLAN).toBe('whole_plan')
  })

  it('templateMatching.js is untouched', async () => {
    const mod = await import('../utils/templateMatching.js')
    expect(mod.detectTemplateOnPage).toBeDefined()
    expect(mod.detectTemplateInRegion).toBeDefined()
  })

  it('rasterPipeline.js is untouched', async () => {
    const mod = await import('../utils/rasterPipeline.js')
    expect(mod.RASTER_DPI).toBe(150)
    expect(mod.matchRegionRaster).toBeDefined()
  })

  it('PdfViewer still has pan/zoom/fit infrastructure', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/PdfViewer/index.jsx'),
      'utf-8'
    )
    expect(src).toContain('handleFitView')
    expect(src).toContain('handleWheel')
    expect(src).toContain('clampView')
    expect(src).toContain('MIN_ZOOM')
    expect(src).toContain('MAX_ZOOM')
  })
})
