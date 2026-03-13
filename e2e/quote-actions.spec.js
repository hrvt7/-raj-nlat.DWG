// ─── Playwright E2E: QuoteView action button bar ─────────────────────────────
// Verifies:
//   1. All 4 action-bar buttons + BOM card button render correctly
//   2. Action buttons are NOT inside the config cards (except BOM)
//   3. PDF nyomtatása fires handlePrint (captures __lastPrintHtml)
//   4. Email küldése fires mailto from action bar
//   5. PDF előnézet fires handlePreview with real quote content
//   6. Anyagjegyzék letöltése is inside the BOM card

import { test, expect } from '@playwright/test'

// ── Seed data ──────────────────────────────────────────────────────────────────
const SEED_QUOTE = {
  id: 'QT-2026-ACT',
  projectName: 'Actions E2E Projekt',
  project_name: 'Actions E2E Projekt',
  name: 'Actions E2E Projekt',
  clientName: 'Teszt Kft.',
  client_name: 'Teszt Kft.',
  clientAddress: '1111 Budapest, Teszt u. 1.',
  clientTaxNumber: '11111111-1-11',
  clientEmail: 'teszt@ceg.hu',
  projectAddress: '2222 Budapest, Projekt u. 2.',
  createdAt: '2026-03-10T10:00:00Z',
  created_at: '2026-03-10T10:00:00Z',
  status: 'draft',
  outputMode: 'combined',
  groupBy: 'none',
  vatPercent: 27,
  gross: 200000,
  totalMaterials: 100000,
  totalLabor: 100000,
  totalHours: 10,
  summary: { grandTotal: 200000, totalWorkHours: 10 },
  pricingData: { hourlyRate: 10000, markup_pct: 0 },
  assemblySummary: [
    { id: 'ASM-001', name: 'Dugalj', qty: 2, totalPrice: 100000, materialCost: 50000, laborCost: 50000 },
  ],
  items: [
    { name: 'Schneider 2P+F', type: 'material', qty: 4, unitPrice: 12500, unit: 'db', hours: 0 },
    { name: 'Szerelés', type: 'labor', qty: 1, unitPrice: 0, unit: 'tétel', hours: 10 },
  ],
  inclusions: '',
  exclusions: '',
  notes: '',
  validityText: '',
  paymentTermsText: '',
}

const SEED_SETTINGS = {
  company: {
    name: 'Villanyász Kft.',
    address: '1234 Budapest, Fő u. 1.',
    tax_number: '99999999-2-99',
    phone: '+36 30 111 2222',
    email: 'info@villanyasz.hu',
    bank_account: '11111111-22222222-33333333',
  },
  labor: { vat_percent: 27 },
  quote: {},
}

async function seedAndOpen(page) {
  await page.addInitScript((args) => {
    const { quoteJson, settingsJson } = JSON.parse(args)
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_quotes', wrap([JSON.parse(quoteJson)]))
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([]))
    localStorage.setItem('takeoffpro_settings', settingsJson)
  }, JSON.stringify({ quoteJson: JSON.stringify(SEED_QUOTE), settingsJson: JSON.stringify(SEED_SETTINGS) }))

  await page.goto('/#app')
  const quotesNav = page.locator('[data-testid="sidebar-nav-quotes"]')
  await expect(quotesNav).toBeVisible({ timeout: 10_000 })
  await quotesNav.click()
  const openBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 5_000 })
}

// ─── Test: All 4 action-bar buttons + BOM button render ──────────────────────
test('Action bar and BOM card buttons are visible', async ({ page }) => {
  await seedAndOpen(page)

  const pdfDownload = page.locator('button', { hasText: 'PDF letöltése' })
  const pdfPrint    = page.locator('button', { hasText: 'PDF nyomtatása' })
  const email       = page.locator('button', { hasText: 'Email küldése' })
  const preview     = page.locator('button', { hasText: 'PDF előnézet' })
  const bomBtn      = page.locator('button', { hasText: 'Anyagjegyzék letöltése' })

  await expect(pdfDownload).toBeVisible({ timeout: 3_000 })
  await expect(pdfPrint).toBeVisible({ timeout: 3_000 })
  await expect(email).toBeVisible({ timeout: 3_000 })
  await expect(preview).toBeVisible({ timeout: 3_000 })
  await expect(bomBtn).toBeVisible({ timeout: 3_000 })
})

// ─── Test: Anyagjegyzék letöltése is inside the BOM card ─────────────────────
test('Anyagjegyzék card contains Anyagjegyzék letöltése button', async ({ page }) => {
  await seedAndOpen(page)

  const bomCard = page.locator('div', { hasText: /^Anyagjegyzék \(BOM\)$/ }).locator('..')
  const bomBtn = bomCard.locator('button', { hasText: 'Anyagjegyzék letöltése' })

  await expect(bomBtn).toBeVisible({ timeout: 3_000 })
})

// ─── Test: Config cards no longer contain action buttons ─────────────────────
test('PDF Export card does not contain action buttons', async ({ page }) => {
  await seedAndOpen(page)

  const pdfCard = page.locator('div', { hasText: /^PDF Export$/ }).locator('..')
  const downloadBtn = pdfCard.locator('button', { hasText: 'PDF letöltése' })
  const printBtn = pdfCard.locator('button', { hasText: 'PDF nyomtatása' })

  await expect(downloadBtn).toHaveCount(0)
  await expect(printBtn).toHaveCount(0)
})

// ─── Test: PDF nyomtatása fires handlePrint (captures __lastPrintHtml) ───────
test('PDF nyomtatása button fires print handler', async ({ page }) => {
  await seedAndOpen(page)

  await page.evaluate(() => {
    window.__lastPrintHtml = null
    window.open = () => ({
      document: { write() {}, close() {} },
      focus() {},
      print() {},
    })
  })

  const printBtn = page.locator('button', { hasText: 'PDF nyomtatása' })
  await expect(printBtn).toBeVisible({ timeout: 3_000 })
  await printBtn.click()

  await page.waitForFunction(() => window.__lastPrintHtml !== null, { timeout: 10_000 })
  const html = await page.evaluate(() => window.__lastPrintHtml)

  expect(html).toContain('Actions E2E Projekt')
})

// ─── Test: Email küldése fires mailto from action bar ────────────────────────
test('Email küldése in action bar fires mailto', async ({ page }) => {
  await seedAndOpen(page)

  await page.evaluate(() => {
    window.__lastMailtoUrl = null
    window.addEventListener('beforeunload', e => e.preventDefault())
  })

  const emailBtn = page.locator('button', { hasText: 'Email küldése' })
  await expect(emailBtn).toBeVisible({ timeout: 3_000 })
  await emailBtn.click()

  await page.waitForFunction(() => window.__lastMailtoUrl !== null, { timeout: 10_000 })
  const url = await page.evaluate(() => window.__lastMailtoUrl)

  expect(url).toMatch(/^mailto:/)
  expect(url).toContain('teszt%40ceg.hu')
  expect(url).toContain('Actions%20E2E%20Projekt')
})

// ─── Test: PDF előnézet fires preview with real quote content ────────────────
test('PDF előnézet button fires preview with real content', async ({ page }) => {
  await seedAndOpen(page)

  await page.evaluate(() => {
    window.__lastPreviewHtml = null
    window.open = () => ({
      document: { write() {}, close() {} },
      focus() {},
    })
  })

  const previewBtn = page.locator('button', { hasText: 'PDF előnézet' })
  await expect(previewBtn).toBeVisible({ timeout: 3_000 })
  await previewBtn.click()

  await page.waitForFunction(() => window.__lastPreviewHtml !== null, { timeout: 10_000 })
  const html = await page.evaluate(() => window.__lastPreviewHtml)

  // Preview must contain real quote content, not be blank
  expect(html).toContain('Actions E2E Projekt')
  expect(html).toContain('Teszt Kft.')
})

// ─── Test: PDF letöltése triggers real file download ─────────────────────────
test('PDF letöltése triggers real file download with correct content', async ({ page }) => {
  await seedAndOpen(page)

  // Dismiss alert if html2canvas/jsPDF fail in test env
  page.on('dialog', dialog => dialog.dismiss())

  // Ensure no showSaveFilePicker (force anchor download path in test)
  await page.evaluate(() => {
    delete window.showSaveFilePicker
    window.__lastPdfHtml = null
  })

  const pdfBtn = page.locator('button', { hasText: 'PDF letöltése' })
  await expect(pdfBtn).toBeVisible({ timeout: 3_000 })

  // Listen for download event — anchor-based blob download triggers this
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
  await pdfBtn.click()

  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('.pdf')
  expect(download.suggestedFilename()).toContain('Actions_E2E_Projekt')

  // Verify HTML was generated with correct quote content
  const html = await page.evaluate(() => window.__lastPdfHtml)
  expect(html).toContain('Actions E2E Projekt')
  expect(html).toContain('Teszt Kft.')
})
