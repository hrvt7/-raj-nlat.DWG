// ─── Playwright Corrupt DWG Upload Smoke Test ──────────────────────────────
// Protects: .dwg file upload → CloudConvert API failure → workspace shows
// visible "DWG konverzió sikertelen" error panel → app remains functional.
// Uses route interception to simulate CloudConvert API failure (deterministic).

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const CORRUPT_DWG_PATH = resolve(import.meta.dirname, 'fixtures', 'corrupt.dwg')
const PROJECT_ID = 'E2E-CORRUPT-DWG-PRJ-001'

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
        name: 'E2E – Corrupt DWG project',
        description: 'E2E test project for corrupt DWG upload',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 14: Corrupt DWG upload shows visible conversion error ─────────────
test('corrupt DWG upload shows visible conversion error in workspace', async ({ page }) => {
  await seedProjectOnly(page)

  // Intercept CloudConvert API call — simulate server-side failure
  // The DWG path fetches /api/convert-dwg (POST) as step 1 of conversion.
  // Return a 500 with a descriptive error to trigger dwgStatus='failed'.
  await page.route('**/api/convert-dwg', route => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: 'CloudConvert API nem elérhető (E2E test)',
      }),
    })
  })

  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload the corrupt DWG (passes extension check, conversion will fail)
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(CORRUPT_DWG_PATH)

  // A plan card should be created (product behavior: plan stub persists)
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('corrupt.dwg')

  // Open the plan in workspace
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Workspace should render
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // The file name should appear in the header
  await expect(workspace).toContainText('corrupt.dwg')

  // DWG conversion error panel should appear
  const dwgError = page.locator('[data-testid="dwg-conversion-error"]')
  await expect(dwgError).toBeVisible({ timeout: 15_000 })

  // Should show the "DWG konverzió sikertelen" heading
  await expect(dwgError).toContainText('konverzió sikertelen')

  // Should show CAD export instructions (DXF workaround guidance)
  await expect(dwgError).toContainText('DXF')

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
