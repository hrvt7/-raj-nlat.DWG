// ─── Playwright: Takeoff → Manual Pricing Bridge (Phase 2C) ─────────────────
// Verifies: pricing mode toggle, manual quote creation from takeoff,
// seed correctness, QuoteView handoff, save/reopen, PDF, assembly regression.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const DXF_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.dxf')
const PROJECT_ID = 'E2E-BRIDGE-PRJ'

async function seedProjectAndUploadDxf(page) {
  await page.addInitScript((args) => {
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      { id: args.projectId, name: 'E2E Bridge Project', description: '', createdAt: new Date().toISOString() },
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
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

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
// Flow 1+2: Pricing mode toggle + manual quote creation from takeoff
// ═════════════════════════════════════════════════════════════════════════════
test('takeoff → manual: toggle to manual mode and create quote with seeded rows', async ({ page }) => {
  await seedProjectAndUploadDxf(page)

  // Wait for recognized items to appear
  await expect(page.locator('[data-testid="workspace-container"]')).toContainText('elem', { timeout: 10_000 })

  // Switch to Kalkuláció tab (where save button lives)
  const calcTab = page.locator('[data-testid="tab-calc"]')
  await calcTab.click()

  // Pricing mode toggle should be visible
  const toggle = page.locator('[data-testid="pricing-mode-toggle"]')
  await expect(toggle).toBeVisible()

  // Default should be Assembly
  const assemblyBtn = toggle.locator('button', { hasText: 'Assembly' })
  const manualBtn = toggle.locator('button', { hasText: 'Manuális' })
  await expect(assemblyBtn).toBeVisible()
  await expect(manualBtn).toBeVisible()

  // Switch to Manual
  await manualBtn.click()

  // Click save — in manual mode this goes directly to full-quote save
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await saveBtn.click()

  // onSaved fires and navigates — wait for the quotes page or wherever we land
  await page.waitForTimeout(2000)

  // Verify the created quote in localStorage
  const quotesRaw = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_quotes')
    return JSON.parse(raw)
  })
  const quotes = quotesRaw.data || quotesRaw
  const manualQuote = quotes.find(q => q.pricingMode === 'manual')
  expect(manualQuote).toBeTruthy()

  // ── Seed correctness (Flow 2) ──
  expect(manualQuote.manualRows).toBeDefined()
  expect(manualQuote.manualRows.length).toBeGreaterThan(0)

  const firstRow = manualQuote.manualRows[0]
  expect(firstRow.origin).toBe('takeoff_manual_priced')
  expect(firstRow.qty).toBeGreaterThan(0)
  expect(firstRow.unit).toBe('db')
  expect(firstRow.name).toBeTruthy()
  expect(firstRow.name.length).toBeGreaterThan(0)
  expect(firstRow.sourceRefId).toBeTruthy() // asmId
  expect(firstRow.id).toMatch(/^mr-/)
  expect(firstRow.sourcePlanSystemType).toBeTruthy()

  // items[] should be materialized
  expect(manualQuote.items).toBeDefined()
  expect(manualQuote.items.length).toBeGreaterThan(0)
  expect(manualQuote.items[0]._fromManual).toBe(true)

  // assemblySummary should be empty
  expect(manualQuote.assemblySummary).toEqual([])
})

// NOTE: QuoteView manual editor flows (open, inline edit, save/reopen, PDF)
// are thoroughly covered by e2e/manual-quote-editor.spec.js (8 specs).
// Tests here focus on the BRIDGE: workspace → manual quote creation.

// ═════════════════════════════════════════════════════════════════════════════
// Flow 3: Assembly regression — default mode still works
// ═════════════════════════════════════════════════════════════════════════════
test('assembly regression: default assembly mode per-plan save works, no manual quote', async ({ page }) => {
  await seedProjectAndUploadDxf(page)
  await expect(page.locator('[data-testid="workspace-container"]')).toContainText('elem', { timeout: 10_000 })

  // Switch to Kalkuláció tab — pricing mode toggle defaults to Assembly
  await page.locator('[data-testid="tab-calc"]').click()
  const toggle = page.locator('[data-testid="pricing-mode-toggle"]')
  await expect(toggle).toBeVisible()

  // Default is Assembly — save triggers per-plan path (planId is set)
  await page.locator('[data-testid="workspace-save-btn"]').click()
  await page.waitForTimeout(1000)

  // Per-plan save shows success strip
  await expect(page.locator('[data-testid="workspace-save-success"]')).toBeVisible({ timeout: 5_000 })

  // No manual quote in localStorage
  const quotesRaw = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_quotes')
    return JSON.parse(raw)
  })
  const quotes = quotesRaw?.data || quotesRaw || []
  const manualQuote = quotes.find(q => q.pricingMode === 'manual')
  expect(manualQuote).toBeUndefined()

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 7: Normal upload/takeoff regression
// ═════════════════════════════════════════════════════════════════════════════
test('upload + takeoff regression: DXF upload still works with pricing toggle present', async ({ page }) => {
  await seedProjectAndUploadDxf(page)
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toContainText('smoke-plan.dxf', { timeout: 10_000 })
  await expect(workspace).toContainText('elem', { timeout: 10_000 })

  // Pricing toggle should exist but not interfere
  await page.locator('[data-testid="tab-calc"]').click()
  await expect(page.locator('[data-testid="pricing-mode-toggle"]')).toBeVisible()

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})
