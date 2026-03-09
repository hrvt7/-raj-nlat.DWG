// ─── PDF Symbol Search Feature Flag — Regression Tests ──────────────────────
// Covers:
//   1. Feature flag is OFF — no search UI leaks into production
//   2. Manual counting tools remain fully available
//   3. Right panel only receives manual input (no search-generated data)
//   4. Architecture boundary — search code preserved for future re-enable
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const pdfViewerSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/PdfViewer/index.jsx'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('Feature flag — PDF_SYMBOL_SEARCH_ENABLED is OFF', () => {
  it('PDF_SYMBOL_SEARCH_ENABLED is declared as false', () => {
    expect(pdfViewerSrc).toContain('const PDF_SYMBOL_SEARCH_ENABLED = false')
  })

  it('flag is a simple const, not env-dependent', () => {
    // Must be a plain boolean const for maximum reliability in hotfix
    const match = pdfViewerSrc.match(/const PDF_SYMBOL_SEARCH_ENABLED\s*=\s*(.+)/)
    expect(match).not.toBeNull()
    expect(match[1].trim()).toBe('false')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Feature flag — Search UI hidden from toolbar', () => {
  it('Azonosítás tool is conditionally included in TOOLS array', () => {
    // The TOOLS array must use spread with feature flag
    expect(pdfViewerSrc).toContain("...(PDF_SYMBOL_SEARCH_ENABLED ? [{ id: 'select'")
  })

  it('keyboard shortcut I is guarded by feature flag', () => {
    // Must check PDF_SYMBOL_SEARCH_ENABLED before activating select tool
    expect(pdfViewerSrc).toMatch(/e\.key\s*===\s*'[iI]'.*PDF_SYMBOL_SEARCH_ENABLED/)
  })

  it('Minták button is guarded by feature flag', () => {
    // The always-visible "Minták" button must be behind the flag
    expect(pdfViewerSrc).toContain('PDF_SYMBOL_SEARCH_ENABLED && hasProjectRecipes')
  })

  it('lastRun badge is guarded by feature flag', () => {
    // The last run badge must be behind the flag
    expect(pdfViewerSrc).toContain('PDF_SYMBOL_SEARCH_ENABLED && lastRun')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Feature flag — All search panels/banners guarded', () => {
  const guardedComponents = [
    { name: 'SeedAssignPanel', marker: 'PDF_SYMBOL_SEARCH_ENABLED && pendingSeed' },
    { name: 'RecipeMatchReviewPanel', marker: 'PDF_SYMBOL_SEARCH_ENABLED && recipeMatchPanelOpen' },
    { name: 'CountSessionPanel', marker: 'PDF_SYMBOL_SEARCH_ENABLED && countSessionPanelOpen' },
    { name: 'awaitingRegion banner', marker: 'PDF_SYMBOL_SEARCH_ENABLED && awaitingRegionForRecipe' },
    { name: 'pendingRegion banner', marker: 'PDF_SYMBOL_SEARCH_ENABLED && pendingRegion' },
    { name: 'RecipeListPanel', marker: 'PDF_SYMBOL_SEARCH_ENABLED && recipeListOpen' },
    { name: 'RunHistoryDrawer', marker: 'PDF_SYMBOL_SEARCH_ENABLED && runHistoryOpen' },
    { name: 'ReuseBanner', marker: 'PDF_SYMBOL_SEARCH_ENABLED && <ReuseBanner' },
  ]

  guardedComponents.forEach(({ name, marker }) => {
    it(`${name} is guarded by feature flag`, () => {
      expect(pdfViewerSrc).toContain(marker)
    })
  })

  it('total feature flag guard count is at least 14', () => {
    // 1 const + 1 keyboard + 1 TOOLS + 8 panels + 2 toolbar buttons + 1 lastRun = 14
    const count = (pdfViewerSrc.match(/PDF_SYMBOL_SEARCH_ENABLED/g) || []).length
    expect(count).toBeGreaterThanOrEqual(14)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Manual counting tools — fully available', () => {
  it('count tool is in TOOLS array unconditionally', () => {
    expect(pdfViewerSrc).toContain("{ id: 'count', label: 'Számlálás'")
  })

  it('measure tool is in TOOLS array unconditionally', () => {
    expect(pdfViewerSrc).toContain("{ id: 'measure', label: 'Mérés'")
  })

  it('calibrate tool is in TOOLS array unconditionally', () => {
    expect(pdfViewerSrc).toContain("{ id: 'calibrate', label: 'Skála'")
  })

  it('keyboard shortcut C for counting is NOT guarded by feature flag', () => {
    // Count shortcut must work regardless of flag
    const countLine = pdfViewerSrc.split('\n').find(l => l.includes("e.key === 'c'") || l.includes("e.key === 'C'"))
    expect(countLine).toBeDefined()
    expect(countLine).not.toContain('PDF_SYMBOL_SEARCH_ENABLED')
  })

  it('keyboard shortcut M for measure is NOT guarded by feature flag', () => {
    const measureLine = pdfViewerSrc.split('\n').find(l => l.includes("e.key === 'm'") || l.includes("e.key === 'M'"))
    expect(measureLine).toBeDefined()
    expect(measureLine).not.toContain('PDF_SYMBOL_SEARCH_ENABLED')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Architecture boundary — search code preserved', () => {
  it('SeedAssignPanel import still exists (code not deleted)', () => {
    expect(pdfViewerSrc).toContain("import SeedAssignPanel from")
  })

  it('RecipeMatchReviewPanel import still exists', () => {
    expect(pdfViewerSrc).toContain("import RecipeMatchReviewPanel from")
  })

  it('RecipeListPanel import still exists', () => {
    expect(pdfViewerSrc).toContain("import RecipeListPanel from")
  })

  it('RunHistoryDrawer import still exists', () => {
    expect(pdfViewerSrc).toContain("import RunHistoryDrawer from")
  })

  it('ReuseBanner import still exists', () => {
    expect(pdfViewerSrc).toContain("import ReuseBanner")
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

  it('recipeStore RECIPE_SCOPE enum still exists', async () => {
    const { RECIPE_SCOPE } = await import('../data/recipeStore.js')
    expect(RECIPE_SCOPE.CURRENT_PAGE).toBe('current_page')
    expect(RECIPE_SCOPE.WHOLE_PLAN).toBe('whole_plan')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Right panel integrity — no search data leaks', () => {
  it('Összesítő panel is NOT guarded (manual counts must show)', () => {
    // The Összesítő button must remain visible for manual markers
    expect(pdfViewerSrc).toContain("onClick={onToggleCountPanel}")
    // And it should NOT be behind the feature flag
    const lines = pdfViewerSrc.split('\n')
    const countPanelLine = lines.findIndex(l => l.includes('onToggleCountPanel'))
    if (countPanelLine > 0) {
      const prevLine = lines[countPanelLine - 1]
      expect(prevLine).not.toContain('PDF_SYMBOL_SEARCH_ENABLED')
    }
  })

  it('Undo/Clear buttons remain available', () => {
    expect(pdfViewerSrc).toContain("onClick={onUndo}")
    expect(pdfViewerSrc).toContain("onClick={onClearAll}")
  })

  it('Cable routes toggle remains available', () => {
    expect(pdfViewerSrc).toContain("onToggleCableRoutes")
  })
})
