// ─── Playwright E2E: Quote client/project fields — save, reopen, export ──────
// Verifies the new clientAddress, clientTaxNumber, projectAddress fields
// persist through save → reopen and appear in the PDF export HTML.

import { test, expect } from '@playwright/test'

// ── Seed data: one quote with the 3 new fields initially empty ──────────────
const SEED_QUOTE = {
  id: 'QT-2026-E2E',
  projectName: 'E2E Teszt Projekt',
  project_name: 'E2E Teszt Projekt',
  name: 'E2E Teszt Projekt',
  clientName: 'Teszt Kliens Kft.',
  client_name: 'Teszt Kliens Kft.',
  clientAddress: '',
  clientTaxNumber: '',
  projectAddress: '',
  createdAt: '2026-03-10T10:00:00Z',
  created_at: '2026-03-10T10:00:00Z',
  status: 'draft',
  outputMode: 'combined',
  groupBy: 'none',
  vatPercent: 27,
  gross: 150000,
  totalMaterials: 80000,
  totalLabor: 70000,
  totalHours: 8,
  summary: { grandTotal: 150000, totalWorkHours: 8 },
  pricingData: { hourlyRate: 9000, markup_pct: 0 },
  assemblySummary: [
    { id: 'ASM-001', name: 'Dugalj 2P+F', qty: 5, totalPrice: 75000, materialCost: 40000, laborCost: 35000 },
  ],
  items: [
    { name: 'Schneider 2P+F', type: 'material', qty: 5, unitPrice: 8000, unit: 'db', hours: 0 },
    { name: 'Szerelés', type: 'labor', qty: 1, unitPrice: 0, unit: 'tétel', hours: 8 },
  ],
  inclusions: '',
  exclusions: '',
  notes: '',
  validityText: '',
  paymentTermsText: '',
}

async function seedQuoteData(page) {
  await page.addInitScript((quoteJson) => {
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_quotes', wrap([JSON.parse(quoteJson)]))
    // Minimal projects/plans so app boots cleanly
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([]))
  }, JSON.stringify(SEED_QUOTE))
}

// ── Test helper: navigate to Ajánlatok and open the seeded quote ─────────────
async function openSeededQuote(page) {
  await page.goto('/#app')
  const quotesNav = page.locator('[data-testid="sidebar-nav-quotes"]')
  await expect(quotesNav).toBeVisible({ timeout: 10_000 })
  await quotesNav.click()

  // The quote row should show the project name
  const openBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // QuoteView should be visible — check for the "Adatok" heading
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 5_000 })
}

// ─── Test 27: New client/project fields render in QuoteView ─────────────────
test('new client/project fields render with correct placeholders', async ({ page }) => {
  await seedQuoteData(page)
  await openSeededQuote(page)

  // Verify all 3 new input fields exist with correct placeholders
  const addrInput = page.locator('input[placeholder="Ügyfél címe…"]')
  const taxInput = page.locator('input[placeholder="Adószám…"]')
  const projInput = page.locator('input[placeholder="Helyszín címe…"]')

  await expect(addrInput).toBeVisible()
  await expect(taxInput).toBeVisible()
  await expect(projInput).toBeVisible()

  // Initially empty (seeded with '')
  await expect(addrInput).toHaveValue('')
  await expect(taxInput).toHaveValue('')
  await expect(projInput).toHaveValue('')
})

// ─── Test 28: Fill new fields → save → reopen → values persist ──────────────
test('new fields persist through save and reopen', async ({ page }) => {
  await seedQuoteData(page)
  await openSeededQuote(page)

  const addrInput = page.locator('input[placeholder="Ügyfél címe…"]')
  const taxInput = page.locator('input[placeholder="Adószám…"]')
  const projInput = page.locator('input[placeholder="Helyszín címe…"]')

  // Fill in all 3 new fields
  await addrInput.fill('1052 Budapest, Váci utca 12.')
  await taxInput.fill('12345678-2-42')
  await projInput.fill('1013 Budapest, Attila út 20.')

  // The save button should become active (shows "Mentés")
  const saveBtn = page.locator('button', { hasText: 'Mentés' })
  await expect(saveBtn).toBeVisible({ timeout: 3_000 })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()

  // After save, button should show "✓ Mentve"
  await expect(page.locator('button', { hasText: '✓ Mentve' })).toBeVisible({ timeout: 3_000 })

  // Navigate away — use sidebar nav (reliable, has data-testid)
  await page.locator('[data-testid="sidebar-nav-quotes"]').click()

  // Wait for quote list
  const openBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // QuoteView should reload — verify the 3 fields persisted
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 5_000 })

  const addrInput2 = page.locator('input[placeholder="Ügyfél címe…"]')
  const taxInput2 = page.locator('input[placeholder="Adószám…"]')
  const projInput2 = page.locator('input[placeholder="Helyszín címe…"]')

  await expect(addrInput2).toHaveValue('1052 Budapest, Váci utca 12.')
  await expect(taxInput2).toHaveValue('12345678-2-42')
  await expect(projInput2).toHaveValue('1013 Budapest, Attila út 20.')
})

// ─── Test 29: PDF export receives new field values ──────────────────────────
test('PDF export HTML contains new client/project field values', async ({ page }) => {
  await seedQuoteData(page)
  await openSeededQuote(page)

  const addrInput = page.locator('input[placeholder="Ügyfél címe…"]')
  const taxInput = page.locator('input[placeholder="Adószám…"]')
  const projInput = page.locator('input[placeholder="Helyszín címe…"]')

  // Fill in all 3 new fields
  await addrInput.fill('5600 Békéscsaba, Kossuth tér 3.')
  await taxInput.fill('87654321-1-04')
  await projInput.fill('1052 Budapest, Váci utca 12.')

  // Reset the E2E hook and suppress save picker (avoids native dialog in test)
  await page.evaluate(() => {
    window.__lastPdfHtml = null
    delete window.showSaveFilePicker
  })

  // Click the PDF button — find the button with PDF-related text
  const pdfBtn = page.locator('button', { hasText: /PDF|Generálás|Letöltés/ }).first()
  await expect(pdfBtn).toBeVisible({ timeout: 3_000 })
  await pdfBtn.click()

  // Wait for the HTML to be captured (set before html2canvas runs)
  await page.waitForFunction(() => window.__lastPdfHtml !== null, { timeout: 15_000 })

  // Extract the captured HTML
  const pdfHtml = await page.evaluate(() => window.__lastPdfHtml)

  // Verify the parties block contains the new field values
  expect(pdfHtml).toContain('Vállalkozó')
  expect(pdfHtml).toContain('Megrendelő')
  expect(pdfHtml).toContain('5600 Békéscsaba, Kossuth tér 3.')
  expect(pdfHtml).toContain('Adószám: 87654321-1-04')
  expect(pdfHtml).toContain('Projekt helyszíne')
  expect(pdfHtml).toContain('1052 Budapest, Váci utca 12.')

  // Verify the client name appears in the signature line
  expect(pdfHtml).toMatch(/sig-line[^>]*>Teszt Kliens Kft\./)
})

// ─── Test 30: Dirty check activates on new field changes ────────────────────
test('dirty check triggers when only new fields are changed', async ({ page }) => {
  await seedQuoteData(page)
  await openSeededQuote(page)

  // Initially, save button should show "✓ Mentve"
  await expect(page.locator('button', { hasText: '✓ Mentve' })).toBeVisible({ timeout: 3_000 })

  // Type into just the client address field
  const addrInput = page.locator('input[placeholder="Ügyfél címe…"]')
  await addrInput.fill('Teszt cím')

  // Save button should change to "Mentés" (dirty)
  await expect(page.locator('button', { hasText: 'Mentés' })).toBeVisible({ timeout: 2_000 })

  // Clear it back to empty — should revert to "✓ Mentve"
  await addrInput.fill('')
  await expect(page.locator('button', { hasText: '✓ Mentve' })).toBeVisible({ timeout: 2_000 })
})
