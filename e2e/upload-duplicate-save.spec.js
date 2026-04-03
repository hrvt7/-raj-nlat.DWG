// ─── Playwright Duplicate Filename Save Independence Smoke Test ──────────────
// Protects: two plans share the same filename → open + save plan A →
// plan B's metadata must NOT gain calcTotal → opening plan B starts fresh
// (no inherited markers/calc from plan A) → app remains functional.
// All save/restore paths must be keyed by planId, not filename.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const DXF_FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures', 'smoke-plan.dxf'),
  'utf-8',
)

const PLAN_A = 'E2E-DUPSAVE-PLN-A'
const PLAN_B = 'E2E-DUPSAVE-PLN-B'
const PROJECT_ID = 'E2E-DUPSAVE-PRJ-001'
const SHARED_FILENAME = 'smoke-plan.dxf'

/**
 * Seed a project with TWO plans sharing the same filename but distinct IDs.
 * Both plans have their DXF file blob stored in IndexedDB.
 */
async function seedTwoDuplicatePlans(page) {
  await page.addInitScript((args) => {
    const { planA, planB, projectId, filename } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Duplicate save project',
        description: 'E2E test project for duplicate filename save independence',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planA,
        name: filename,
        fileType: 'dxf',
        fileSize: 500,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
      {
        id: planB,
        name: filename,
        fileType: 'dxf',
        fileSize: 500,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
    ]))

    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { planA: PLAN_A, planB: PLAN_B, projectId: PROJECT_ID, filename: SHARED_FILENAME })

  await page.goto('/#app')
  await page.waitForTimeout(500)

  // Write the same DXF blob into IndexedDB under BOTH plan IDs
  await page.evaluate(async (args) => {
    const { planA, planB, dxfText } = args

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('takeoffpro')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('plan_files')) {
          db.createObjectStore('plan_files')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const blob = new Blob([dxfText], { type: 'text/plain' })
    const tx = db.transaction('plan_files', 'readwrite')
    const store = tx.objectStore('plan_files')

    await new Promise((resolve, reject) => {
      const req = store.put(blob, planA)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    await new Promise((resolve, reject) => {
      const req = store.put(blob.slice(), planB) // clone blob for distinct entry
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })

    db.close()
  }, { planA: PLAN_A, planB: PLAN_B, dxfText: DXF_FIXTURE })
}

// ─── Test 21: Save on plan A does not affect plan B (same filename) ──────────
test('saving one duplicate-filename plan does not affect the other', async ({ page }) => {
  await seedTwoDuplicatePlans(page)

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Both plan cards should be visible with the same filename
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards).toHaveCount(2, { timeout: 5_000 })
  await expect(planCards.nth(0)).toContainText(SHARED_FILENAME)
  await expect(planCards.nth(1)).toContainText(SHARED_FILENAME)

  // ── Open plan A (first card) → workspace → save ──
  const openBtnA = planCards.nth(0).locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtnA).toBeVisible()
  await openBtnA.click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('elem', { timeout: 5_000 })

  // Switch to Kalkuláció tab and save
  const calcTab = page.locator('button', { hasText: 'Kalkuláció' })
  await expect(calcTab).toBeVisible({ timeout: 5_000 })
  await calcTab.click()

  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeVisible({ timeout: 5_000 })
  await expect(saveBtn).toBeEnabled({ timeout: 3_000 })
  await saveBtn.click()

  // Wait for save success
  const saveSuccess = page.locator('[data-testid="workspace-save-success"]')
  await expect(saveSuccess).toBeVisible({ timeout: 10_000 })

  // Verify plan A now has calcTotal > 0
  const planACalc = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? null
  }, PLAN_A)
  expect(planACalc).not.toBeNull()
  expect(planACalc).toBeGreaterThan(0)

  // ── KEY ASSERTION: Plan B must NOT have calcTotal ──
  const planBCalc = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? null
  }, PLAN_B)
  expect(planBCalc).toBeNull()

  // ── Navigate back to project (sidebar keeps activeProjectId → lands on plan list) ──
  await sidebar.click()

  // Both plan cards should still be present (activeProjectId preserved → ProjectDetailView)
  await expect(planCards).toHaveCount(2, { timeout: 10_000 })

  // ── Open plan B (second card) ──
  const openBtnB = planCards.nth(1).locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtnB).toBeVisible({ timeout: 5_000 })
  await openBtnB.click()

  // Workspace should render fresh for plan B
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText(SHARED_FILENAME)

  // Plan B should show recognized items (fresh parse, same DXF) but no saved state
  await expect(workspace).toContainText('elem', { timeout: 5_000 })

  // Verify plan B's metadata still has NO calcTotal after opening
  const planBCalcAfterOpen = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? null
  }, PLAN_B)
  expect(planBCalcAfterOpen).toBeNull()

  // Verify no crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
