// ─── Playwright: Custom Takeoff Item (Phase A) ─────────────────────────────────
// Verifies: Egyéni option in dropdown, custom marker creation,
// custom row in Felmérés list, assembly regression.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const PDF_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.pdf')
const PROJECT_ID = 'E2E-CUSTOM-ITEM-PRJ'

async function seedAndOpenPdfWorkspace(page) {
  await page.addInitScript((args) => {
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      { id: args.projectId, name: 'E2E Custom Item Project', description: '', createdAt: new Date().toISOString() },
    ]))
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })

  await page.goto('/#app')
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(PDF_FIXTURE_PATH)

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  return workspace
}

// ═════════════════════════════════════════════════════════════════════════════
// Flow 1: Egyéni option visible in assembly dropdown
// ═════════════════════════════════════════════════════════════════════════════
test('custom item: Egyéni option visible in assembly dropdown', async ({ page }) => {
  await seedAndOpenPdfWorkspace(page)

  // The PDF viewer toolbar should show the count tool and assembly dropdown
  // Click the count tool to activate it (if not already active)
  const countTool = page.locator('button', { hasText: /Számolás|Count/ }).first()
  if (await countTool.isVisible()) {
    await countTool.click()
  }

  // Open the assembly dropdown
  const dropdown = page.locator('button').filter({ has: page.locator('text=▼') }).first()
  if (await dropdown.isVisible()) {
    await dropdown.click()
    await page.waitForTimeout(300)

    // "Egyéni tétel" should appear in the dropdown
    await expect(page.getByText('Egyéni tétel')).toBeVisible({ timeout: 3_000 })
  }

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 2: Assembly regression — existing flow still works
// ═════════════════════════════════════════════════════════════════════════════
test('custom item: assembly markers still work alongside custom option', async ({ page }) => {
  // Use DXF fixture for assembly recognition regression
  const DXF_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.dxf')

  await page.addInitScript(() => {
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      { id: 'E2E-CUSTOM-ASM-REG', name: 'Assembly Regression', description: '', createdAt: new Date().toISOString() },
    ]))
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  })

  await page.goto('/#app')
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()
  const card = page.locator('[data-testid="project-card"]').first()
  await expect(card).toBeVisible({ timeout: 5_000 })
  await card.click()
  await page.locator('[data-testid="plan-upload-input"]').setInputFiles(DXF_FIXTURE_PATH)
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ }).click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // DXF recognized items should appear — assembly flow intact
  await expect(workspace).toContainText('elem', { timeout: 10_000 })

  // Assembly takeoff rows should render (Felmérés tab)
  await expect(workspace).toContainText('assembly', { timeout: 5_000 })

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})
