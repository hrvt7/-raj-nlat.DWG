// ─── Playwright PDF Marker Reopen Visibility Test ──────────────────────────
// Protects: PDF manual markers are visually drawn on the overlay canvas after
// save → navigate away → reopen.
//
// Root causes fixed:
// 1. TakeoffWorkspace never passed planId prop to PdfViewerPanel — annotation
//    restore useEffect returned early, so markersRef stayed empty.
// 2. PdfViewer drawOverlay() was never triggered by the async annotation
//    restore because setRenderTick(t+1) had no useEffect listener.
// 3. React StrictMode double-mount caused auto-save cleanup to fire before
//    annotation restore completed, overwriting IDB markers with [].
//
// Strategy: Seed PDF plan with 3 manual markers → open workspace → save →
// navigate back → reopen → assert overlay canvas has non-transparent pixels
// (markers drawn) AND takeoff rows still present.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Fixtures ────────────────────────────────────────────────────────────────
const PDF_FIXTURE = readFileSync(resolve(__dirname, 'fixtures', 'smoke-plan.pdf'))

const PLAN_ID = 'E2E-PDF-REOPEN-PLN-001'
const PROJECT_ID = 'E2E-PDF-REOPEN-PRJ-001'

const SEED_MARKERS = [
  { id: 'MRK-RO-1', x: 100, y: 200, pageNum: 1, category: 'socket', color: '#FF6B35', asmId: 'ASM-001', source: 'manual', confidence: null, createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'MRK-RO-2', x: 300, y: 200, pageNum: 1, category: 'socket', color: '#FF6B35', asmId: 'ASM-001', source: 'manual', confidence: null, createdAt: '2025-01-01T00:00:01.000Z' },
  { id: 'MRK-RO-3', x: 200, y: 400, pageNum: 1, category: 'light', color: '#FFD166', asmId: 'ASM-003', source: 'manual', confidence: null, createdAt: '2025-01-01T00:00:02.000Z' },
]

async function seedPdfWorkspaceData(page) {
  await page.addInitScript((args) => {
    const { planId, projectId } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', wrap([
      { id: projectId, name: 'E2E – PDF marker reopen project', description: 'test', createdAt: new Date().toISOString() },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([
      { id: planId, name: 'E2E – PDF reopen markers.pdf', fileType: 'pdf', fileSize: 328, units: 'mm', projectId, createdAt: new Date().toISOString(), markerCount: 3 },
    ]))

    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { planId: PLAN_ID, projectId: PROJECT_ID })

  await page.goto('/#app')
  await page.waitForTimeout(500)

  await page.evaluate(async (args) => {
    const { planId, pdfBytes, markers } = args

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('takeoffpro')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('plan_files')) db.createObjectStore('plan_files')
        if (!db.objectStoreNames.contains('plan_annotations')) db.createObjectStore('plan_annotations')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_files', 'readwrite')
      tx.objectStore('plan_files').put(blob, planId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_annotations', 'readwrite')
      tx.objectStore('plan_annotations').put({
        markers,
        measurements: [],
        scale: { factor: null, calibrated: false },
        cableRoutes: [],
        ceilingHeight: 3.0,
        socketHeight: 0.3,
      }, planId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  }, { planId: PLAN_ID, pdfBytes: Array.from(PDF_FIXTURE), markers: SEED_MARKERS })
}

/**
 * Check that the overlay canvas has at least `minPixels` non-transparent pixels.
 * Markers drawn by drawMarker() produce colored arcs/strokes with non-zero alpha.
 * A blank overlay (no markers drawn) has all alpha=0 pixels.
 */
async function overlayHasVisibleMarkers(page, minPixels = 20) {
  return page.evaluate((minPx) => {
    const canvas = document.querySelector('[data-testid="pdf-overlay-canvas"]')
    if (!canvas) return false
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    // The PDF itself is drawn onto the overlay (drawImage), so there will be
    // many non-transparent pixels from the PDF. We check for colored pixels
    // (non-gray) which come from markers.
    // Markers use colors like #FF6B35, #FFD166 — high R/G values with saturation.
    let coloredPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 10) continue // skip transparent
      // Marker colors are saturated (R or G > 150, not all equal like gray)
      const maxC = Math.max(r, g, b)
      const minC = Math.min(r, g, b)
      if (maxC > 150 && (maxC - minC) > 50) coloredPixels++
    }
    return coloredPixels >= minPx
  }, minPixels)
}

// ─── Test 15: PDF markers are visually drawn on overlay after reopen ────────
test('PDF markers are visually drawn on overlay canvas after save and reopen', async ({ page }) => {
  await seedPdfWorkspaceData(page)

  // ── First pass: open workspace ──
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  planCard.locator('button', { hasText: /Megnyitás|Szerkesztés/ }).click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('2 assembly', { timeout: 10_000 })

  // Verify markers are visible on overlay (first open)
  const overlayCanvas = page.locator('[data-testid="pdf-overlay-canvas"]')
  await expect(overlayCanvas).toBeVisible({ timeout: 5_000 })

  // Give drawOverlay time to paint after async annotation restore
  await page.waitForTimeout(1000)
  const firstOpenVisible = await overlayHasVisibleMarkers(page)
  expect(firstOpenVisible).toBe(true)

  // ── Save ──
  await page.locator('button', { hasText: 'Kalkuláció' }).click()
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  await saveBtn.click()
  await expect(page.locator('[data-testid="workspace-save-success"]')).toBeVisible({ timeout: 10_000 })

  // ── Navigate back ──
  await sidebar.click()
  await page.waitForTimeout(500)

  // ── Reopen ──
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards.first()).toBeVisible({ timeout: 5_000 })
  const reopenBtn = planCards.first().locator('button', { hasText: /Megnyitás|Szerkesztés/ })
  await expect(reopenBtn).toBeVisible()
  await reopenBtn.click()

  // Workspace renders again
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('PDF reopen markers.pdf')
  await expect(workspace).toContainText('2 assembly', { timeout: 10_000 })

  // ── THE KEY ASSERTION: markers are visually drawn after reopen ──
  await expect(overlayCanvas).toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(1000) // allow drawOverlay to fire after async restore

  const reopenVisible = await overlayHasVisibleMarkers(page)
  expect(reopenVisible).toBe(true)

  // ── Verify markers survived in IDB ──
  const markerCount = await page.evaluate(async (planId) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('takeoffpro')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const ann = await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_annotations', 'readonly')
      const req = tx.objectStore('plan_annotations').get(planId)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return ann?.markers?.length ?? 0
  }, PLAN_ID)
  expect(markerCount).toBe(3)

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
  await expect(sidebar).toBeVisible()
})
