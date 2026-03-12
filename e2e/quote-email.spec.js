// ─── Playwright E2E: clientEmail field + "Email küldése" mailto button ─────────
// Verifies:
//   1. clientEmail input renders and persists through save → reopen
//   2. dirty check triggers on clientEmail change
//   3. "Email küldése" button wires handleEmail → window.location.href = mailto:…
//   4. mailto URL contains correct recipient, subject, body components
//   5. missing clientEmail degrades safely (empty recipient)

import { test, expect } from '@playwright/test'

// ── Seed: one quote with clientEmail empty ────────────────────────────────────
const SEED_QUOTE = {
  id: 'QT-2026-EMAIL',
  projectName: 'Email E2E Projekt',
  project_name: 'Email E2E Projekt',
  name: 'Email E2E Projekt',
  clientName: 'Kovács Kft.',
  client_name: 'Kovács Kft.',
  clientAddress: '1111 Budapest, Fő utca 1.',
  clientTaxNumber: '11111111-1-11',
  clientEmail: '',
  projectAddress: '2222 Budapest, Váci utca 2.',
  createdAt: '2026-03-10T10:00:00Z',
  created_at: '2026-03-10T10:00:00Z',
  status: 'draft',
  outputMode: 'combined',
  groupBy: 'none',
  vatPercent: 27,
  gross: 200000,
  totalMaterials: 100000,
  totalLabor: 100000,
  totalHours: 11,
  summary: { grandTotal: 200000, totalWorkHours: 11 },
  pricingData: { hourlyRate: 9000, markup_pct: 0 },
  assemblySummary: [
    { id: 'ASM-001', name: 'Dugalj 2P+F', qty: 4, totalPrice: 100000, materialCost: 50000, laborCost: 50000 },
  ],
  items: [
    { name: 'Schneider 2P+F', type: 'material', qty: 4, unitPrice: 12500, unit: 'db', hours: 0 },
    { name: 'Szerelés', type: 'labor', qty: 1, unitPrice: 0, unit: 'tétel', hours: 11 },
  ],
  inclusions: '',
  exclusions: '',
  notes: '',
  validityText: '',
  paymentTermsText: '',
}

const SEED_SETTINGS = {
  company: {
    name: 'Teszt Villanyszerelés Kft.',
    address: '1234 Budapest, Teszt u. 1.',
    tax_number: '99999999-2-99',
    phone: '+36 30 999 9999',
    email: 'info@tesztvill.hu',
    bank_account: '11111111-22222222-33333333',
  },
  labor: { vat_percent: 27 },
  quote: {},
}

async function seedData(page) {
  await page.addInitScript((args) => {
    const { quoteJson, settingsJson } = JSON.parse(args)
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_quotes', wrap([JSON.parse(quoteJson)]))
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([]))
    localStorage.setItem('takeoffpro_settings', settingsJson)
  }, JSON.stringify({ quoteJson: JSON.stringify(SEED_QUOTE), settingsJson: JSON.stringify(SEED_SETTINGS) }))
}

async function openSeededQuote(page) {
  await page.goto('/#app')
  const quotesNav = page.locator('[data-testid="sidebar-nav-quotes"]')
  await expect(quotesNav).toBeVisible({ timeout: 10_000 })
  await quotesNav.click()
  const openBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 5_000 })
}

// ─── Test: clientEmail input renders with correct placeholder ────────────────
test('clientEmail input renders in QuoteView sidebar', async ({ page }) => {
  await seedData(page)
  await openSeededQuote(page)

  const emailInput = page.locator('input[placeholder="Email cím…"]')
  await expect(emailInput).toBeVisible()
  await expect(emailInput).toHaveAttribute('type', 'email')
  await expect(emailInput).toHaveValue('')  // seeded empty
})

// ─── Test: clientEmail persists through save → reopen ────────────────────────
test('clientEmail persists through save and reopen', async ({ page }) => {
  await seedData(page)
  await openSeededQuote(page)

  const emailInput = page.locator('input[placeholder="Email cím…"]')
  await emailInput.fill('ugyfel@example.com')

  // Dirty → "Mentés" visible
  const saveBtn = page.locator('button', { hasText: 'Mentés' })
  await expect(saveBtn).toBeVisible({ timeout: 3_000 })
  await saveBtn.click()

  // After save: "✓ Mentve"
  await expect(page.locator('button', { hasText: '✓ Mentve' })).toBeVisible({ timeout: 3_000 })

  // Navigate away
  await page.locator('[data-testid="sidebar-nav-quotes"]').click()
  const openBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()
  await expect(page.locator('text=Adatok')).toBeVisible({ timeout: 5_000 })

  // Verify persisted
  const emailInput2 = page.locator('input[placeholder="Email cím…"]')
  await expect(emailInput2).toHaveValue('ugyfel@example.com')
})

// ─── Test: dirty check triggers on clientEmail change ────────────────────────
test('dirty check activates when clientEmail changes', async ({ page }) => {
  await seedData(page)
  await openSeededQuote(page)

  await expect(page.locator('button', { hasText: '✓ Mentve' })).toBeVisible({ timeout: 3_000 })

  const emailInput = page.locator('input[placeholder="Email cím…"]')
  await emailInput.fill('test@test.hu')

  // Should be dirty
  await expect(page.locator('button', { hasText: 'Mentés' })).toBeVisible({ timeout: 2_000 })

  // Clear → revert to clean
  await emailInput.fill('')
  await expect(page.locator('button', { hasText: '✓ Mentve' })).toBeVisible({ timeout: 2_000 })
})

// ─── Test: "Email küldése" button produces correct mailto URL with email ─────
test('Email küldése button opens mailto with filled clientEmail', async ({ page }) => {
  await seedData(page)
  await openSeededQuote(page)

  // Fill in clientEmail
  const emailInput = page.locator('input[placeholder="Email cím…"]')
  await emailInput.fill('ugyfel@ceg.hu')

  // Reset hook and suppress actual mailto navigation
  await page.evaluate(() => {
    window.__lastMailtoUrl = null
    // Prevent the browser from following the mailto: link
    window.addEventListener('beforeunload', e => e.preventDefault())
  })

  // Click "Email küldése"
  const emailBtn = page.locator('button', { hasText: 'Email küldése' })
  await expect(emailBtn).toBeVisible({ timeout: 3_000 })
  await emailBtn.click()

  // Wait for the hook to capture the URL
  await page.waitForFunction(() => window.__lastMailtoUrl !== null, { timeout: 10_000 })
  const url = await page.evaluate(() => window.__lastMailtoUrl)

  // Verify structure
  expect(url).toMatch(/^mailto:/)
  expect(url).toContain('ugyfel%40ceg.hu')  // recipient

  // Decode and check subject
  const subjectMatch = url.match(/subject=([^&]+)/)
  expect(subjectMatch).toBeTruthy()
  const subject = decodeURIComponent(subjectMatch[1])
  expect(subject).toContain('Árajánlat')
  expect(subject).toContain('Email E2E Projekt')

  // Decode and check body
  const bodyMatch = url.match(/body=(.+)$/)
  expect(bodyMatch).toBeTruthy()
  const body = decodeURIComponent(bodyMatch[1])
  expect(body).toContain('Tisztelt Kovács Kft.!')          // client greeting
  expect(body).toContain('Email E2E Projekt')               // project name
  expect(body).toContain('PDF')                              // PDF mention
  expect(body).toContain('Teszt Villanyszerelés Kft.')       // company name
  expect(body).toContain('info@tesztvill.hu')                // company email
  expect(body).toContain('+36 30 999 9999')                  // company phone
})

// ─── Test: "Email küldése" degrades safely with empty clientEmail ─────────────
test('Email küldése with empty clientEmail opens mailto with empty recipient', async ({ page }) => {
  await seedData(page)
  await openSeededQuote(page)

  // Don't fill clientEmail — leave it empty

  // Reset hook and suppress actual mailto navigation
  await page.evaluate(() => {
    window.__lastMailtoUrl = null
    window.addEventListener('beforeunload', e => e.preventDefault())
  })

  const emailBtn = page.locator('button', { hasText: 'Email küldése' })
  await emailBtn.click()

  await page.waitForFunction(() => window.__lastMailtoUrl !== null, { timeout: 10_000 })
  const url = await page.evaluate(() => window.__lastMailtoUrl)

  // Should be mailto: with empty recipient
  expect(url).toMatch(/^mailto:\?subject=/)

  // Body should use client name from sidebar (seeded as 'Kovács Kft.')
  const bodyMatch = url.match(/body=(.+)$/)
  const body = decodeURIComponent(bodyMatch[1])
  expect(body).toContain('Tisztelt Kovács Kft.!')  // still uses client name
  expect(body).toContain('PDF')
})
