// ─── Playwright Mixed Batch Upload Smoke Test ─────────────────────────────
// Protects: multi-file upload with valid + unsupported + corrupt files →
// unsupported file rejected with visible warning → valid + corrupt-but-allowed
// files create plan stubs → correct plan count → app remains functional.
// Reuses existing fixtures: smoke-plan.dxf, notes.txt, corrupt.dxf.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const VALID_DXF_PATH   = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.dxf')
const UNSUPPORTED_PATH = resolve(import.meta.dirname, 'fixtures', 'notes.txt')
const CORRUPT_DXF_PATH = resolve(import.meta.dirname, 'fixtures', 'corrupt.dxf')
const PROJECT_ID = 'E2E-MIXED-BATCH-PRJ-001'

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
        name: 'E2E – Mixed batch project',
        description: 'E2E test project for mixed batch upload',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 15: Mixed batch upload — valid + unsupported + corrupt ────────────
test('mixed batch upload accepts valid, rejects unsupported, keeps corrupt stub', async ({ page }) => {
  await seedProjectOnly(page)
  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload 3 files at once: valid DXF + unsupported .txt + corrupt DXF
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles([VALID_DXF_PATH, UNSUPPORTED_PATH, CORRUPT_DXF_PATH])

  // Warning banner should appear for the rejected .txt file
  const warning = page.locator('[data-testid="upload-warning"]')
  await expect(warning).toBeVisible({ timeout: 5_000 })
  await expect(warning).toContainText('notes.txt')

  // Exactly 2 plan cards should be created (valid DXF + corrupt DXF)
  // The unsupported .txt must NOT create a plan stub
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards).toHaveCount(2, { timeout: 10_000 })

  // Both accepted file names should appear in plan cards
  const allCardText = await planCards.allTextContents()
  const combined = allCardText.join(' ')
  expect(combined).toContain('smoke-plan.dxf')
  expect(combined).toContain('corrupt.dxf')

  // Verify no ghost plan for .txt in localStorage
  const planCount = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.length
  })
  expect(planCount).toBe(2)

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()

  // Warning auto-clears after ~4.5s
  await expect(warning).toBeHidden({ timeout: 6_000 })
})
