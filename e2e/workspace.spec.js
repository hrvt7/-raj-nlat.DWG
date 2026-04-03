// ─── Playwright Workspace Smoke Tests — TakeoffPro Save/Reopen Flow ──────────
// Protects: workspace entry with real DXF → save → reopen round-trip
// Uses a tiny DXF fixture (5 INSERT entities) seeded into IndexedDB before test.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load the tiny DXF fixture ──────────────────────────────────────────────
const DXF_FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures', 'smoke-plan.dxf'),
  'utf-8',
)

const PLAN_ID = 'E2E-PLN-001'
const PROJECT_ID = 'E2E-PRJ-001'

/**
 * Seed project + plan metadata into localStorage (versioned envelope)
 * AND inject the DXF file blob into IndexedDB (localforage's plan_files store).
 */
async function seedWorkspaceData(page, dxfText) {
  await page.addInitScript((args) => {
    const { planId, projectId, dxfText } = args

    const wrap = (data) => JSON.stringify({ _v: 1, data })

    // Projects (raw array, no envelope)
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Smoke workspace project',
        description: 'E2E test project for workspace smoke',
        createdAt: new Date().toISOString(),
      },
    ]))

    // Plans (versioned envelope)
    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planId,
        name: 'E2E – Smoke DXF plan.dxf',
        fileType: 'dxf',
        fileSize: dxfText.length,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
    ]))

    // Quotes (versioned envelope, empty)
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { planId: PLAN_ID, projectId: PROJECT_ID, dxfText: DXF_FIXTURE })

  // After page loads, inject the DXF file blob into IndexedDB
  // (localforage uses IndexedDB with DB name 'takeoffpro', store 'plan_files')
  await page.goto('/#app')

  // Wait for app to bootstrap (localforage creates the DB/stores lazily)
  await page.waitForTimeout(500)

  // Write DXF blob directly into IndexedDB using the raw API
  await page.evaluate(async (args) => {
    const { planId, dxfText } = args

    // Open the localforage IndexedDB database
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

    // Write the DXF text as a Blob
    const blob = new Blob([dxfText], { type: 'text/plain' })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_files', 'readwrite')
      const store = tx.objectStore('plan_files')
      const req = store.put(blob, planId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })

    db.close()
  }, { planId: PLAN_ID, dxfText: DXF_FIXTURE })
}

// ─── Test 4: DXF file opens into workspace with recognized items ─────────────
test('DXF plan opens into workspace with recognized items', async ({ page }) => {
  await seedWorkspaceData(page, DXF_FIXTURE)

  // Navigate to Projektek
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  // Open the project
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Click "Megnyitás" on the plan card
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible()
  await openBtn.click()

  // Workspace should render with the DXF file loaded
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // Verify the file name appears in the workspace header
  await expect(workspace).toContainText('E2E – Smoke DXF plan.dxf')

  // Verify recognized items appeared (the sticky bar should show item/assembly counts)
  // Our DXF has 5 inserts → 2 unique blocks (DUGALJ_2P_F × 3, KAPCSOLO_1G × 2)
  // Both should auto-match → 2 assemblies in takeoff
  await expect(workspace).toContainText('elem', { timeout: 5_000 })

  // Verify no crash — error boundary text should not be present
  const errorBoundary = page.locator('text=összeomlott')
  await expect(errorBoundary).toHaveCount(0)
})

// ─── Test 5: Save persists data and shows success indicator ──────────────────
test('workspace save persists calculation and shows success', async ({ page }) => {
  await seedWorkspaceData(page, DXF_FIXTURE)

  // Navigate to workspace
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await openBtn.click()

  // Wait for workspace to fully load
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('elem', { timeout: 5_000 })

  // Switch to Kalkuláció tab to access the save button
  const calcTab = page.locator('button', { hasText: 'Kalkuláció' })
  await expect(calcTab).toBeVisible({ timeout: 5_000 })
  await calcTab.click()

  // Click the save button (should NOT be disabled for auto_high items)
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeVisible({ timeout: 5_000 })
  await expect(saveBtn).toBeEnabled({ timeout: 3_000 })
  await saveBtn.click()

  // Save success indicator should appear
  const saveSuccess = page.locator('[data-testid="workspace-save-success"]')
  await expect(saveSuccess).toBeVisible({ timeout: 10_000 })
  await expect(saveSuccess).toContainText('Kalkuláció mentve')

  // Verify plan metadata was updated in localStorage with calc snapshot
  const calcTotal = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    const plan = plans.find(p => p.id === planId)
    return plan?.calcTotal ?? null
  }, PLAN_ID)

  // calcTotal should be a positive number (actual pricing depends on assembly DB)
  expect(calcTotal).not.toBeNull()
  expect(calcTotal).toBeGreaterThan(0)
})

// ─── Test 6: Reopen plan restores saved state ────────────────────────────────
test('reopening a saved plan restores calculation state', async ({ page }) => {
  await seedWorkspaceData(page, DXF_FIXTURE)

  // ── First pass: open workspace and save ──
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ }).click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('elem', { timeout: 5_000 })

  // Save
  await page.locator('button', { hasText: 'Kalkuláció' }).click()
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  await saveBtn.click()
  await expect(page.locator('[data-testid="workspace-save-success"]')).toBeVisible({ timeout: 10_000 })

  // Capture saved calcTotal for later comparison
  const savedCalcTotal = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? 0
  }, PLAN_ID)
  expect(savedCalcTotal).toBeGreaterThan(0)

  // ── Navigate back to Projektek ──
  // Click "Vissza" or use sidebar to go back
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()

  // ── Verify plan card shows updated calc total ──
  // The plan card should now reflect the saved calculation
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards.first()).toBeVisible({ timeout: 5_000 })

  // Plan card should show some pricing indication (calcTotal > 0 means "Szerkesztés" button
  // appears instead of "Megnyitás" for a plan with saved calc data)
  // The button text changes from "Megnyitás" to "Szerkesztés" after save
  const reopenBtn = planCards.first().locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(reopenBtn).toBeVisible()

  // ── Second pass: reopen the plan ──
  await reopenBtn.click()

  // Workspace should render again
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('E2E – Smoke DXF plan.dxf')
  await expect(workspace).toContainText('elem', { timeout: 5_000 })

  // Verify calcTotal survived the round-trip (still in localStorage)
  const reopenCalcTotal = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? 0
  }, PLAN_ID)

  // Same calcTotal should persist after reopen
  expect(reopenCalcTotal).toBe(savedCalcTotal)

  // Verify no crash — error boundary should not appear
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App should remain functional — sidebar still present
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
