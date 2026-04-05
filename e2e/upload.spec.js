// ─── Playwright Upload Smoke Test — Real DXF Upload/Open Path ────────────────
// Protects: real file input upload → plan creation → workspace entry
// Uses the same tiny DXF fixture (5 INSERT entities) as workspace smoke.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const DXF_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.dxf')
const PROJECT_ID = 'E2E-UPLOAD-PRJ-001'

/**
 * Seed only a project into localStorage (no plans, no IndexedDB blobs).
 * The upload test will create the plan via the real file input.
 */
async function seedProjectOnly(page) {
  await page.addInitScript((args) => {
    const { projectId } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    // Project (raw array, no envelope)
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Upload smoke project',
        description: 'E2E test project for upload smoke',
        createdAt: new Date().toISOString(),
      },
    ]))

    // Empty plans + quotes (versioned envelope)
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 7: Real DXF upload creates plan and opens workspace ────────────────
test('real DXF file upload creates plan and reaches workspace', async ({ page }) => {
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

  // Upload DXF via the hidden file input
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

  // A new plan card should appear after upload
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })

  // The plan card should show the uploaded file name
  await expect(planCard).toContainText('smoke-plan.dxf')

  // Click "Megnyitás" to open the plan in workspace
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Workspace should render with the DXF file loaded
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // Verify the file name appears in workspace header
  await expect(workspace).toContainText('smoke-plan.dxf')

  // Verify recognized items appeared (5 inserts → 2 unique blocks auto-matched)
  await expect(workspace).toContainText('elem', { timeout: 10_000 })

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App should remain functional — sidebar still present
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
