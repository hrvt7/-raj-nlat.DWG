// ─── Playwright Corrupt PDF Upload Smoke Test ───────────────────────────────
// Protects: .pdf file with invalid content → workspace entry → PDF viewer
// shows visible error overlay → app remains functional.
// Uses a .pdf file with garbage content (not valid PDF bytes).

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const CORRUPT_PDF_PATH = resolve(__dirname, 'fixtures', 'corrupt.pdf')
const PROJECT_ID = 'E2E-CORRUPT-PDF-PRJ-001'

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
        name: 'E2E – Corrupt PDF project',
        description: 'E2E test project for corrupt PDF upload',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 13: Corrupt PDF upload shows visible viewer error ─────────────────
test('corrupt PDF upload shows visible viewer error in workspace', async ({ page }) => {
  await seedProjectOnly(page)
  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload the corrupt PDF (passes extension check, content is garbage)
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(CORRUPT_PDF_PATH)

  // A plan card should be created (product behavior: plan stub persists)
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('corrupt.pdf')

  // Open the plan in workspace
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Workspace should render
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // The file name should appear in the header
  await expect(workspace).toContainText('corrupt.pdf')

  // PDF viewer error overlay should appear (pdf.js rejects invalid bytes)
  const pdfError = page.locator('[data-testid="pdf-viewer-error"]')
  await expect(pdfError).toBeVisible({ timeout: 10_000 })

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
