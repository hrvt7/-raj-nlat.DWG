// ─── Playwright E2E — Bulk-skip low-impact unknown blocks ─────────────────────
// Verifies the bulk-skip button in UnknownBlockPanel:
//   1. Button visible when 2+ low-impact unknowns exist (qty ≤ 2)
//   2. Clicking it excludes all low-qty unknowns
//   3. High-qty unknowns survive
//   4. Save gating updates correctly (still gated → then unblocked after assign)
//   5. No crash, app remains functional
//
// Fixture: bulk-skip-plan.dxf
//   - DUGALJ_2P_F × 5  (recognized → ASM-001)
//   - UNKNOWN_BIG × 10  (unknown, high-qty → survives bulk-skip)
//   - DECO_A × 1         (unknown, low-qty → skipped)
//   - DECO_B × 2         (unknown, low-qty → skipped)
//   - DECO_C × 1         (unknown, low-qty → skipped)

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const DXF_FIXTURE = readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'bulk-skip-plan.dxf'),
  'utf-8',
)

const PLAN_ID = 'E2E-BULK-001'
const PROJECT_ID = 'E2E-PRJ-BULK'

async function seedBulkSkipData(page, dxfText) {
  await page.addInitScript((args) => {
    const { planId, projectId, dxfText } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Bulk-skip test project',
        description: 'E2E test for bulk-skip low-impact unknowns',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planId,
        name: 'E2E – Bulk-skip plan.dxf',
        fileType: 'dxf',
        fileSize: dxfText.length,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
    ]))

    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { planId: PLAN_ID, projectId: PROJECT_ID, dxfText: DXF_FIXTURE })

  await page.goto('/#app')
  await page.waitForTimeout(500)

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

test('bulk-skip removes low-impact unknowns, keeps high-impact, and save gates correctly', async ({ page }) => {
  await seedBulkSkipData(page, DXF_FIXTURE)

  // Navigate: Projektek → project → plan → Megnyitás
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible()
  await openBtn.click()

  // Wait for workspace to render with parsed DXF
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // ── Assert 1: UnknownBlockPanel is visible ──
  const unknownPanel = page.locator('[data-testid="unknown-block-panel"]')
  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })

  // ── Assert 2: 4 unknown block rows (UNKNOWN_BIG + DECO_A + DECO_B + DECO_C) ──
  const unknownRows = page.locator('[data-testid="unknown-block-row"]')
  await expect(unknownRows).toHaveCount(4, { timeout: 5_000 })

  // ── Assert 3: Bulk-skip button is visible (3 low-impact unknowns ≥ 2 threshold) ──
  const bulkSkipBtn = page.locator('[data-testid="bulk-skip-low-impact"]')
  await expect(bulkSkipBtn).toBeVisible({ timeout: 3_000 })

  // ── Assert 4: Bulk-skip button text mentions the count ──
  await expect(bulkSkipBtn).toContainText('3')
  await expect(bulkSkipBtn).toContainText('alacsony')

  // ── Assert 5: Click bulk-skip ──
  await bulkSkipBtn.click()

  // ── Assert 6: Only 1 unknown row remains (UNKNOWN_BIG) ──
  await expect(unknownRows).toHaveCount(1, { timeout: 5_000 })

  // ── Assert 7: Remaining unknown is UNKNOWN_BIG ──
  await expect(unknownPanel).toContainText('UNKNOWN_BIG')

  // ── Assert 8: Bulk-skip button is gone (< 2 low-impact remaining) ──
  await expect(bulkSkipBtn).toHaveCount(0, { timeout: 3_000 })

  // ── Assert 9: Save is still gated (UNKNOWN_BIG unresolved) ──
  const calcTab = page.locator('button', { hasText: 'Kalkuláció' })
  await expect(calcTab).toBeVisible({ timeout: 5_000 })
  await calcTab.click()

  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeVisible({ timeout: 5_000 })
  await expect(saveBtn).toBeDisabled({ timeout: 3_000 })

  // ── Assert 10: Switch back to Felmérés, assign UNKNOWN_BIG → save unblocks ──
  const takeoffTab = page.locator('button', { hasText: 'Felmérés' })
  await expect(takeoffTab).toBeVisible({ timeout: 3_000 })
  await takeoffTab.click()

  const selectDropdown = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectDropdown).toBeVisible({ timeout: 3_000 })
  await selectDropdown.selectOption({ value: 'ASM-001' })

  // Unknown panel should disappear (no more unknowns)
  await expect(unknownPanel).toHaveCount(0, { timeout: 5_000 })

  // Switch to Kalkuláció again → save should be enabled
  await calcTab.click()
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })

  // ── Assert 11: No crash ──
  const errorBoundary = page.locator('text=összeomlott')
  await expect(errorBoundary).toHaveCount(0)

  // ── Assert 12: Sidebar still functional ──
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
