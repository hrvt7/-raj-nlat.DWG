// ─── Playwright Upload Rejection Smoke Test ─────────────────────────────────
// Protects: unsupported file type upload → visible rejection → no ghost plan
// Uses a tiny .txt fixture that fails the isAllowedPlan() extension check.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const TXT_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'notes.txt')
const PROJECT_ID = 'E2E-REJECT-PRJ-001'

/**
 * Seed a project with zero plans so we can verify none are created.
 */
async function seedProjectOnly(page) {
  await page.addInitScript((args) => {
    const { projectId } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Upload rejection project',
        description: 'E2E test project for upload rejection',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 11: Unsupported file type is rejected with visible warning ─────────
test('unsupported file upload is rejected visibly and creates no plan', async ({ page }) => {
  await seedProjectOnly(page)
  await page.goto('/#app')

  // Navigate to Projektek
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  // Open the project
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload unsupported .txt file via the hidden file input
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(TXT_FIXTURE_PATH)

  // Warning banner should appear with rejection message
  const warning = page.locator('[data-testid="upload-warning"]')
  await expect(warning).toBeVisible({ timeout: 5_000 })
  await expect(warning).toContainText('notes.txt')
  await expect(warning).toContainText('PDF, DXF')

  // No plan card should have been created
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards).toHaveCount(0)

  // Verify no ghost plan in localStorage
  const planCount = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.length
  })
  expect(planCount).toBe(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()

  // Warning auto-clears after ~4.5s
  await expect(warning).toBeHidden({ timeout: 6_000 })
})
