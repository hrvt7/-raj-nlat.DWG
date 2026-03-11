// ─── Playwright Duplicate Filename Delete Independence Smoke Test ────────────
// Protects: uploading the same filename twice creates two independent plans →
// deleting one plan (via trash icon + confirm dialog) does NOT affect the other →
// surviving plan card still visible with correct filename → metadata intact →
// app remains functional.
// Depends on: deletePlan() being ID-based (p.id !== planId), not filename-based.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const DXF_FIXTURE_PATH = resolve(__dirname, 'fixtures', 'smoke-plan.dxf')
const PROJECT_ID = 'E2E-DUPDEL-PRJ-001'

/**
 * Seed a project with zero plans.
 */
async function seedProjectOnly(page) {
  await page.addInitScript((args) => {
    const { projectId } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Duplicate delete project',
        description: 'E2E test project for duplicate filename delete independence',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 20: Deleting one duplicate-filename plan leaves the other intact ───
test('deleting one duplicate-filename plan leaves the other intact', async ({ page }) => {
  await seedProjectOnly(page)
  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // First upload of smoke-plan.dxf
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

  // Wait for first plan card
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards).toHaveCount(1, { timeout: 10_000 })

  // Second upload of the same file
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

  // Now exactly 2 plan cards should exist
  await expect(planCards).toHaveCount(2, { timeout: 10_000 })

  // Both should show the same filename
  await expect(planCards.nth(0)).toContainText('smoke-plan.dxf')
  await expect(planCards.nth(1)).toContainText('smoke-plan.dxf')

  // Capture both plan IDs before deletion
  const idsBefore = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.map(p => p.id)
  })
  expect(idsBefore).toHaveLength(2)
  expect(idsBefore[0]).not.toBe(idsBefore[1])

  // Delete the FIRST plan card (click trash icon → confirm)
  const firstDeleteBtn = planCards.first().locator('[data-testid="plan-delete-btn"]')
  await expect(firstDeleteBtn).toBeVisible({ timeout: 3_000 })
  await firstDeleteBtn.click()

  // Confirm deletion in dialog
  const confirmBtn = page.locator('[data-testid="confirm-dialog-confirm"]')
  await expect(confirmBtn).toBeVisible({ timeout: 3_000 })
  await confirmBtn.click()

  // After deletion: exactly 1 plan card should remain
  await expect(planCards).toHaveCount(1, { timeout: 10_000 })

  // Surviving card still shows the correct filename
  await expect(planCards.first()).toContainText('smoke-plan.dxf')

  // Verify exactly 1 plan in localStorage with the surviving ID
  const idsAfter = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.map(p => p.id)
  })
  expect(idsAfter).toHaveLength(1)

  // The surviving ID should be one of the original IDs
  expect(idsBefore).toContain(idsAfter[0])

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
