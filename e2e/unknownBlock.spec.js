// ─── Playwright Smoke Test — UnknownBlockPanel Resolution ────────────────────
// Protects: unknown DXF block → panel visible → user assigns assembly → resolved
// Uses a tiny DXF fixture with one recognizable + one unrecognizable block.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load the DXF fixture with an unknown block ──────────────────────────────
const DXF_FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures', 'unknown-plan.dxf'),
  'utf-8',
)

const PLAN_ID = 'E2E-UNK-001'
const PROJECT_ID = 'E2E-PRJ-UNK'

/**
 * Seed project + plan metadata into localStorage (versioned envelope)
 * AND inject the DXF file blob into IndexedDB (localforage's plan_files store).
 * Same pattern as workspace.spec.js seedWorkspaceData.
 */
async function seedUnknownBlockData(page, dxfText) {
  await page.addInitScript((args) => {
    const { planId, projectId, dxfText } = args

    const wrap = (data) => JSON.stringify({ _v: 1, data })

    // Projects (raw array, no envelope)
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Unknown block test project',
        description: 'E2E test for unknown block resolution',
        createdAt: new Date().toISOString(),
      },
    ]))

    // Plans (versioned envelope)
    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planId,
        name: 'E2E – Unknown block plan.dxf',
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
  await page.goto('/#app')

  // Wait for app to bootstrap (localforage creates the DB/stores lazily)
  await page.waitForTimeout(500)

  // Write DXF blob directly into IndexedDB using the raw API
  await page.evaluate(async (args) => {
    const { planId, dxfText } = args

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

// ─── Test 7: Unknown block panel appears and user can resolve it ─────────────
test('unknown DXF block triggers panel, user assigns assembly, save becomes enabled', async ({ page }) => {
  await seedUnknownBlockData(page, DXF_FIXTURE)

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
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés/ })
  await expect(openBtn).toBeVisible()
  await openBtn.click()

  // Workspace should render with the DXF file loaded
  // Default tab is "Felmérés" (takeoff) — the UnknownBlockPanel lives here
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // ── Assert 1: UnknownBlockPanel is visible on default Felmérés tab ──
  const unknownPanel = page.locator('[data-testid="unknown-block-panel"]')
  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })

  // ── Assert 2: Panel shows "ismeretlen blokk" header ──
  await expect(unknownPanel).toContainText('ismeretlen blokk')

  // ── Assert 3: Panel shows the unknown block name ──
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  // ── Assert 4: There is exactly 1 unknown block row ──
  const unknownRows = page.locator('[data-testid="unknown-block-row"]')
  await expect(unknownRows).toHaveCount(1)

  // ── Assert 5: Assign assembly via dropdown (resolve the unknown block) ──
  // The select has an option for ASM-001 "Dugalj 2P+F alap (komplett)"
  const selectDropdown = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectDropdown).toBeVisible({ timeout: 3_000 })
  await selectDropdown.selectOption({ value: 'ASM-001' })

  // ── Assert 6: After assignment, the unknown panel disappears ──
  await expect(unknownPanel).toHaveCount(0, { timeout: 5_000 })

  // ── Assert 7: Save button becomes enabled after resolution ──
  // Switch to Kalkuláció tab to access the save button
  const calcTab = page.locator('button', { hasText: 'Kalkuláció' })
  await expect(calcTab).toBeVisible({ timeout: 5_000 })
  await calcTab.click()

  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeVisible({ timeout: 5_000 })
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })

  // ── Assert 8: No crash — error boundary absent ──
  const errorBoundary = page.locator('text=összeomlott')
  await expect(errorBoundary).toHaveCount(0)

  // ── Assert 9: App remains functional — sidebar still present ──
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
