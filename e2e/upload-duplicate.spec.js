// ─── Playwright Duplicate Filename Upload Smoke Test ──────────────────────
// Protects: uploading the same filename twice creates two independent plans
// with distinct IDs → both plan cards visible → no data corruption or
// ghost/merged state → app remains functional.
// Current behavior: each upload generates a unique plan ID via generatePlanId(),
// savePlan deduplicates by ID not filename, so identical filenames coexist.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const DXF_FIXTURE_PATH = resolve(__dirname, 'fixtures', 'smoke-plan.dxf')
const PROJECT_ID = 'E2E-DUPLICATE-PRJ-001'

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
        name: 'E2E – Duplicate filename project',
        description: 'E2E test project for duplicate filename upload',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 19: Duplicate filename upload creates two independent plans ────────
test('uploading the same filename twice creates two independent plans', async ({ page }) => {
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
  await expect(planCards.first()).toContainText('smoke-plan.dxf')

  // Second upload of the same file
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

  // Now exactly 2 plan cards should exist
  await expect(planCards).toHaveCount(2, { timeout: 10_000 })

  // Both cards should show the same filename
  const allCardText = await planCards.allTextContents()
  const matchCount = allCardText.filter(t => t.includes('smoke-plan.dxf')).length
  expect(matchCount).toBe(2)

  // Verify 2 plans in localStorage with distinct IDs
  const planIds = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.map(p => p.id)
  })
  expect(planIds).toHaveLength(2)
  expect(planIds[0]).not.toBe(planIds[1])

  // Verify no crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
