// ─── Playwright Corrupt Upload Smoke Test ───────────────────────────────────
// Protects: allowed-extension file with invalid content → workspace shows
// visible parse failure → save is blocked → app remains functional.
// Uses a .dxf file with garbage content (no valid DXF entities).

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const CORRUPT_DXF_PATH = resolve(__dirname, 'fixtures', 'corrupt.dxf')
const PROJECT_ID = 'E2E-CORRUPT-PRJ-001'

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
        name: 'E2E – Corrupt upload project',
        description: 'E2E test project for corrupt upload',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 12: Corrupt DXF upload creates plan but workspace shows parse failure
test('corrupt DXF upload shows visible parse failure in workspace', async ({ page }) => {
  await seedProjectOnly(page)
  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload the corrupt DXF (passes extension check, content is garbage)
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(CORRUPT_DXF_PATH)

  // A plan card should be created (product behavior: plan stub persists)
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('corrupt.dxf')

  // Open the plan in workspace
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Workspace should render
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // The file name should appear in the header
  await expect(workspace).toContainText('corrupt.dxf')

  // Workflow status card should show red parse failure message
  // "A fájl beolvasása sikertelen" = "File parsing failed"
  await expect(workspace).toContainText('beolvasása sikertelen', { timeout: 10_000 })

  // The takeoff should show 0 items (no blocks recognized)
  await expect(workspace).toContainText('0 elem')

  // Save button should be disabled (parse_failed stage gates save)
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(saveBtn).toBeDisabled()
  }

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
