// ─── Playwright E2E: Welcome Hero → Try Demo → QuoteView ─────────────────────
// Verifies the first-time user onboarding flow:
// 1. Welcome hero card is visible when no quotes exist
// 2. "Kipróbálom a demót" button seeds demo data and opens first demo quote
// 3. QuoteView renders correctly with enriched demo data

import { test, expect } from '@playwright/test'

// ── Test 31: Welcome hero shows on empty state ──────────────────────────────
test('welcome hero is visible when no quotes exist', async ({ page }) => {
  // Clear all takeoffpro data before navigating
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('takeoffpro_')) localStorage.removeItem(k)
    })
    // Seed minimal empty state
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify({ _v: 1, data: [] }))
    localStorage.setItem('takeoffpro_quotes', JSON.stringify({ _v: 1, data: [] }))
  })

  await page.goto('/#app')

  // Dashboard should load
  const welcomeHero = page.locator('[data-testid="welcome-hero"]')
  await expect(welcomeHero).toBeVisible({ timeout: 10_000 })

  // The CTA button should be visible
  const ctaBtn = page.locator('[data-testid="welcome-try-demo"]')
  await expect(ctaBtn).toBeVisible()
  await expect(ctaBtn).toContainText('Kipróbálom a demót')
})

// ── Test 32: Welcome hero disappears after demo quotes exist ────────────────
test('welcome hero not visible when quotes already exist', async ({ page }) => {
  const existingQuote = {
    id: 'QT-EXISTING-001',
    projectName: 'Meglévő projekt',
    project_name: 'Meglévő projekt',
    name: 'Meglévő projekt',
    clientName: 'Teszt Kft.',
    client_name: 'Teszt Kft.',
    clientAddress: '',
    clientTaxNumber: '',
    projectAddress: '',
    createdAt: new Date().toISOString(),
    created_at: new Date().toISOString(),
    status: 'draft',
    outputMode: 'combined',
    groupBy: 'none',
    vatPercent: 27,
    gross: 100000,
    totalMaterials: 60000,
    totalLabor: 40000,
    totalHours: 5,
    summary: { grandTotal: 100000, totalWorkHours: 5 },
    pricingData: { hourlyRate: 9000, markup_pct: 0 },
    assemblySummary: [],
    items: [],
  }

  await page.addInitScript((qJson) => {
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_quotes', wrap([JSON.parse(qJson)]))
    localStorage.setItem('takeoffpro_projects_meta', wrap([]))
  }, JSON.stringify(existingQuote))

  await page.goto('/#app')

  // Welcome hero should NOT be visible
  const welcomeHero = page.locator('[data-testid="welcome-hero"]')
  await expect(welcomeHero).not.toBeVisible({ timeout: 5_000 })
})

// ── Test 33: Try Demo button seeds data and navigates to QuoteView ──────────
test('try demo button seeds data and opens QuoteView', async ({ page }) => {
  // Start with fully empty state
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('takeoffpro_')) localStorage.removeItem(k)
    })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify({ _v: 1, data: [] }))
    localStorage.setItem('takeoffpro_quotes', JSON.stringify({ _v: 1, data: [] }))
  })

  await page.goto('/#app')

  // Wait for and click the try demo button
  const ctaBtn = page.locator('[data-testid="welcome-try-demo"]')
  await expect(ctaBtn).toBeVisible({ timeout: 10_000 })
  await ctaBtn.click()

  // Should navigate into QuoteView — look for "Adatok" section heading
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 8_000 })

  // Demo project name should appear somewhere in the view (may appear more than once)
  await expect(page.locator('text=Szombathely').first()).toBeVisible({ timeout: 3_000 })

  // The client name input should have the demo value
  const clientNameInput = page.locator('input[placeholder="Ügyfél neve…"]')
  await expect(clientNameInput).toHaveValue(/Kovács/)

  // The client address input should have the demo value
  const addrInput = page.locator('input[placeholder="Ügyfél címe…"]')
  await expect(addrInput).toHaveValue(/Szombathely/)

  // The tax number input should have the demo value
  const taxInput = page.locator('input[placeholder="Adószám…"]')
  await expect(taxInput).toHaveValue(/12345678/)
})

// ── Test 34: Demo quote has assemblies visible in QuoteView ─────────────────
test('demo quote shows assembly rows in QuoteView', async ({ page }) => {
  // Start with fully empty state
  await page.addInitScript(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('takeoffpro_')) localStorage.removeItem(k)
    })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify({ _v: 1, data: [] }))
    localStorage.setItem('takeoffpro_quotes', JSON.stringify({ _v: 1, data: [] }))
  })

  await page.goto('/#app')

  // Click try demo
  const ctaBtn = page.locator('[data-testid="welcome-try-demo"]')
  await expect(ctaBtn).toBeVisible({ timeout: 10_000 })
  await ctaBtn.click()

  // Wait for QuoteView to render
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 8_000 })

  // Assembly summary table should be visible — check for the heading
  await expect(page.locator('text=munkacsoport').first()).toBeVisible({ timeout: 5_000 })

  // At least one assembly name should be visible
  await expect(page.locator('text=Fali lámpatest').first()).toBeVisible({ timeout: 3_000 })
})
