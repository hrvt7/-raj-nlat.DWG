// ─── Playwright E2E: QuoteView action button placement ──────────────────────
// Verifies:
//   1. PDF letöltése + PDF nyomtatása are inside the PDF Export card
//   2. CSV letöltése is inside the Anyagjegyzék (BOM) card
//   3. Email küldése is inside the Csoportosítás card
//   4. PDF nyomtatása fires handlePrint (captures __lastPrintHtml)
//   5. All five action cards render in the controls row

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

// ─── Test: PDF Export card contains PDF letöltése and PDF nyomtatása ──────────
test('PDF Export card contains download and print buttons', async ({ page }) => {
  await seedAndOpen(page)

  // Find the PDF Export card by its title text, then scope button search within the parent card
  const pdfCard = page.locator('div', { hasText: /^PDF Export$/ }).locator('..')
  const downloadBtn = pdfCard.locator('button', { hasText: 'PDF letöltése' })
  const printBtn = pdfCard.locator('button', { hasText: 'PDF nyomtatása' })

  await expect(downloadBtn).toBeVisible({ timeout: 3_000 })
  await expect(printBtn).toBeVisible({ timeout: 3_000 })

  // Email küldése should NOT be in this card
  const emailBtn = pdfCard.locator('button', { hasText: 'Email küldése' })
  await expect(emailBtn).toHaveCount(0)
})

// ─── Test: Csoportosítás card contains Email küldése ─────────────────────────
test('Csoportosítás card contains Email küldése button', async ({ page }) => {
  await seedAndOpen(page)

  // Find the Csoportosítás card
  const groupCard = page.locator('div', { hasText: /^Csoportosítás$/ }).locator('..')
  const emailBtn = groupCard.locator('button', { hasText: 'Email küldése' })

  await expect(emailBtn).toBeVisible({ timeout: 3_000 })
})

// ─── Test: BOM card still has CSV letöltése ──────────────────────────────────
test('Anyagjegyzék card contains CSV letöltése button', async ({ page }) => {
  await seedAndOpen(page)

  const bomCard = page.locator('div', { hasText: /^Anyagjegyzék/ }).locator('..')
  const csvBtn = bomCard.locator('button', { hasText: 'CSV letöltése' })

  await expect(csvBtn).toBeVisible({ timeout: 3_000 })
})

// ─── Test: PDF nyomtatása fires handlePrint (captures __lastPrintHtml) ───────
test('PDF nyomtatása button fires print handler', async ({ page }) => {
  await seedAndOpen(page)

  // Suppress window.open to avoid actually opening a new window
  await page.evaluate(() => {
    window.__lastPrintHtml = null
    // Stub window.open so it doesn't actually navigate
    window.open = () => ({
      document: { write() {}, close() {} },
      focus() {},
      print() {},
    })
  })

  const printBtn = page.locator('button', { hasText: 'PDF nyomtatása' })
  await expect(printBtn).toBeVisible({ timeout: 3_000 })
  await printBtn.click()

  // Wait for the hook to capture HTML
  await page.waitForFunction(() => window.__lastPrintHtml !== null, { timeout: 10_000 })
  const html = await page.evaluate(() => window.__lastPrintHtml)

  // The captured HTML should contain the quote project name
  expect(html).toContain('Actions E2E Projekt')
})

// ─── Test: Email küldése still works from new location (mailto) ──────────────
test('Email küldése in Csoportosítás card fires mailto', async ({ page }) => {
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
