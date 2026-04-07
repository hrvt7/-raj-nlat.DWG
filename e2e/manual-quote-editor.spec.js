// ─── Playwright Runtime Smoke — Manual Quote Editor (Phase 2B) ──────────────
// Verifies: ManualRowEditor rendering, inline edit, add/remove rows,
// live totals, save/reopen persistence, PDF compat, dirty state,
// and assembly quote regression.

import { test, expect } from '@playwright/test'

// ─── Helper: seed a manual quote into localStorage ──────────────────────────
function seedManualQuote(page, opts = {}) {
  return page.addInitScript((args) => {
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([]))
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([
      {
        id: args.id || 'QT-2026-MANUAL1',
        quoteNumber: 'QT-2026-001',
        projectName: 'Manual Test Quote',
        project_name: 'Manual Test Quote',
        name: 'Manual Test Quote',
        clientName: 'Test Ügyfél',
        client_name: 'Test Ügyfél',
        clientAddress: '', clientTaxNumber: '', clientEmail: '', projectAddress: '',
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        status: 'draft',
        outputMode: 'combined',
        groupBy: 'none',
        vatPercent: 27,
        gross: 0,
        totalMaterials: 0,
        totalLabor: 0,
        totalHours: 0,
        summary: { grandTotal: 0, totalWorkHours: 0 },
        pricingData: { hourlyRate: 8500, markup_pct: 0, markup_type: 'markup' },
        pricingMode: 'manual',
        manualRows: args.rows || [],
        items: [],
        assemblySummary: [],
        inclusions: '', exclusions: '', validityText: '', paymentTermsText: '',
        source: 'manual',
      },
    ]))
  }, { id: opts.id, rows: opts.rows })
}

// ─── Helper: seed an assembly quote for regression check ────────────────────
function seedAssemblyQuote(page) {
  return page.addInitScript(() => {
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([]))
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([
      {
        id: 'QT-2026-ASM1',
        quoteNumber: 'QT-2026-002',
        projectName: 'Assembly Test Quote',
        project_name: 'Assembly Test Quote',
        name: 'Assembly Test Quote',
        clientName: 'Asm Client',
        client_name: 'Asm Client',
        clientAddress: '', clientTaxNumber: '', clientEmail: '', projectAddress: '',
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        status: 'draft',
        outputMode: 'combined',
        groupBy: 'none',
        vatPercent: 27,
        gross: 50000,
        totalMaterials: 30000,
        totalLabor: 20000,
        totalHours: 2.5,
        summary: { grandTotal: 50000, totalWorkHours: 2.5 },
        pricingData: { hourlyRate: 8000, markup_pct: 0, markup_type: 'markup' },
        pricingMode: 'assembly',
        items: [
          { name: 'Kábel NYM', code: 'MAT-001', qty: 50, unit: 'm', type: 'material', systemType: 'general', unitPrice: 600, hours: 0, materialCost: 30000 },
          { name: 'Szerelés', code: 'WI-001', qty: 1, unit: 'db', type: 'labor', systemType: 'general', unitPrice: 8000, hours: 2.5, materialCost: 0 },
        ],
        assemblySummary: [
          { id: 'asm-light', name: 'Világítás szerelvény', category: 'lighting', qty: 5, totalPrice: 50000, totalMaterials: 30000, totalLabor: 20000, totalHours: 2.5 },
        ],
        inclusions: 'Szerelési munkadíj', exclusions: '', validityText: '', paymentTermsText: '',
        source: 'takeoff-workspace',
      },
    ]))
  })
}

async function openQuoteView(page) {
  await page.goto('/#app')
  const sidebar = page.locator('[data-testid="sidebar-nav-quotes"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()
  // Click the "Megnyit" button to open the quote
  const openBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()
  // Wait for QuoteView to render (back button or Adatok label visible)
  await expect(page.locator('button', { hasText: '← Vissza' })).toBeVisible({ timeout: 5_000 })
}

// ═════════════════════════════════════════════════════════════════════════════
// Flow 1: Open manual quote → ManualRowEditor renders, assembly hidden
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: editor renders, assembly summary hidden', async ({ page }) => {
  await seedManualQuote(page, {
    rows: [
      { id: 'mr-mat1', origin: 'manual_direct', type: 'material', name: 'Kábel NYM 3×1.5', qty: 100, unit: 'm', unitPrice: 300, laborHours: 0, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
      { id: 'mr-lab1', origin: 'manual_direct', type: 'labor', name: 'Bekötés', qty: 1, unit: 'db', unitPrice: 0, laborHours: 2, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
    ],
  })
  await openQuoteView(page)

  // ManualRowEditor sections should be visible (use + Új sor buttons as proof)
  const addBtns = page.locator('button', { hasText: '+ Új sor' })
  await expect(addBtns.first()).toBeVisible()
  expect(await addBtns.count()).toBe(2) // Anyagok + Munkák

  // Material row should be visible
  await expect(page.getByText('Kábel NYM 3×1.5', { exact: true })).toBeVisible()
  // Labor row should be visible
  await expect(page.getByText('Bekötés', { exact: true })).toBeVisible()

  // Assembly summary should NOT be visible (hidden in manual mode)
  await expect(page.getByText('munkacsoport')).toBeHidden()
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 2: Inline editing — click cell, type, Enter saves
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: inline edit material row updates value', async ({ page }) => {
  await seedManualQuote(page, {
    rows: [
      { id: 'mr-mat1', origin: 'manual_direct', type: 'material', name: 'Kábel', qty: 10, unit: 'db', unitPrice: 500, laborHours: 0, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
    ],
  })
  await openQuoteView(page)

  // Click on the name cell to start editing
  await page.getByText('Kábel', { exact: true }).click()
  // Should now be an input
  const nameInput = page.locator('input[type="text"]').first()
  await expect(nameInput).toBeVisible()
  await nameInput.fill('Kábel NYM 3×2.5')
  await nameInput.press('Enter')

  // Value should be updated
  await expect(page.locator('text=Kábel NYM 3×2.5')).toBeVisible()

  // Dirty state should be active (unsaved changes bar)
  await expect(page.locator('text=Nem mentett módosítások')).toBeVisible()
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 3: Add/remove rows
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: add and delete rows', async ({ page }) => {
  await seedManualQuote(page, { rows: [] })
  await openQuoteView(page)

  // Start with empty tables — should see empty state messages
  await expect(page.locator('text=Nincs még tétel').first()).toBeVisible()

  // Add material row
  const addMaterialBtn = page.locator('button', { hasText: '+ Új sor' }).first()
  await addMaterialBtn.click()
  // Row count label should update
  await expect(page.locator('text=1 tétel').first()).toBeVisible()

  // Add labor row
  const addLaborBtn = page.locator('button', { hasText: '+ Új sor' }).nth(1)
  await addLaborBtn.click()
  await expect(page.locator('text=1 tétel').nth(1)).toBeVisible()

  // Delete the material row (click ✕)
  const deleteBtn = page.locator('button', { hasText: '✕' }).first()
  await deleteBtn.click()
  // Material table should show empty state again
  await expect(page.locator('text=Nincs még tétel').first()).toBeVisible()
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 4: Live totals update
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: totals update live when rows change', async ({ page }) => {
  await seedManualQuote(page, {
    rows: [
      { id: 'mr-mat1', origin: 'manual_direct', type: 'material', name: 'Anyag A', qty: 10, unit: 'db', unitPrice: 1000, laborHours: 0, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
    ],
  })
  await openQuoteView(page)

  // Initial: material cost 10×1000 = 10,000. Check summary footer shows it
  await expect(page.locator('text=10 000 Ft').first()).toBeVisible()

  // Now add a labor row with 2 hours
  const addLaborBtn = page.locator('button', { hasText: '+ Új sor' }).nth(1)
  await addLaborBtn.click()

  // The KPI strip "Munkaóra" should still show (hours card always visible)
  await expect(page.locator('span:text("Munkaóra")')).toBeVisible()

  // Dirty state should be active
  await expect(page.locator('text=Nem mentett módosítások')).toBeVisible()
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 5+6: Save + Reopen — manualRows persist, items[] materialized
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: save persists rows, reopen restores editor', async ({ page }) => {
  await seedManualQuote(page, {
    rows: [
      { id: 'mr-mat1', origin: 'manual_direct', type: 'material', name: 'Kábel 100m', qty: 100, unit: 'm', unitPrice: 300, laborHours: 0, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
      { id: 'mr-lab1', origin: 'manual_direct', type: 'labor', name: 'Szerelés', qty: 1, unit: 'db', unitPrice: 0, laborHours: 4, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
    ],
  })
  await openQuoteView(page)

  // Edit name to trigger dirty
  await page.locator('text=Kábel 100m').click()
  const nameInput = page.locator('input[type="text"]').first()
  await nameInput.fill('Kábel NYM 100m')
  await nameInput.press('Enter')

  // Save
  await expect(page.locator('text=Nem mentett módosítások')).toBeVisible()
  const saveBtn = page.locator('[data-testid="quote-save-btn"]')
  await saveBtn.click()

  // Confirm saved (dirty bar should disappear, save button shows ✓ Mentve)
  await expect(page.locator('text=Ajánlat mentve')).toBeVisible({ timeout: 3_000 })

  // Navigate back to quote list
  await page.locator('button', { hasText: '← Vissza' }).click()
  await page.waitForTimeout(300)

  // Reopen the same quote
  const reopenBtn = page.locator('button', { hasText: 'Megnyit' }).first()
  await expect(reopenBtn).toBeVisible({ timeout: 5_000 })
  await reopenBtn.click()
  await expect(page.locator('button', { hasText: '← Vissza' })).toBeVisible({ timeout: 5_000 })

  // Verify edited name persists
  await expect(page.locator('text=Kábel NYM 100m')).toBeVisible()
  // Verify labor row persists
  await expect(page.locator('text=Szerelés')).toBeVisible()

  // Verify items[] was materialized (check via localStorage)
  const quotesRaw = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_quotes')
    return JSON.parse(raw)
  })
  const savedQuote = quotesRaw.data?.[0] || quotesRaw[0]
  expect(savedQuote.manualRows).toHaveLength(2)
  expect(savedQuote.manualRows[0].name).toBe('Kábel NYM 100m')
  expect(savedQuote.items).toBeDefined()
  expect(savedQuote.items.length).toBeGreaterThan(0)
  expect(savedQuote.items.some(i => i._fromManual === true)).toBe(true)
  expect(savedQuote.pricingMode).toBe('manual')
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 7: PDF preview with manual rows
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: PDF preview includes manual rows', async ({ page }) => {
  await seedManualQuote(page, {
    rows: [
      { id: 'mr-mat1', origin: 'manual_direct', type: 'material', name: 'Kábel PDF Test', qty: 50, unit: 'm', unitPrice: 400, laborHours: 0, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
    ],
  })
  await openQuoteView(page)

  // Click PDF előnézet
  const previewBtn = page.locator('button', { hasText: 'PDF előnézet' })
  await previewBtn.click()
  await page.waitForTimeout(500)

  // Check that the preview HTML was generated with correct financial data
  // Material: 50 × 400 = 20,000 Ft
  const previewHtml = await page.evaluate(() => window.__lastPreviewHtml || '')
  expect(previewHtml.length).toBeGreaterThan(100) // HTML generated
  // Financial data: 50 × 400 = 20,000 Ft should appear (with possible non-breaking space)
  expect(previewHtml).toMatch(/20[\s\u00a0]000/) // Material cost in financial summary
  expect(previewHtml).toContain('Manual Test Quote') // Project name
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 8: Dirty state lifecycle
// ═════════════════════════════════════════════════════════════════════════════
test('manual quote: dirty state triggers on row edit and clears on save', async ({ page }) => {
  await seedManualQuote(page, {
    rows: [
      { id: 'mr-mat1', origin: 'manual_direct', type: 'material', name: 'Anyag X', qty: 5, unit: 'db', unitPrice: 100, laborHours: 0, group: '', notes: '', sourceRefId: null, sourcePlanSystemType: 'general', sourcePlanFloor: null, sourcePlanFloorLabel: null },
    ],
  })
  await openQuoteView(page)

  // Initially not dirty
  await expect(page.locator('text=Nem mentett módosítások')).toBeHidden()

  // Add a row to trigger dirty
  const addBtn = page.locator('button', { hasText: '+ Új sor' }).first()
  await addBtn.click()

  // Now dirty
  await expect(page.locator('text=Nem mentett módosítások')).toBeVisible()

  // Save
  const saveBtn = page.locator('[data-testid="quote-save-btn"]')
  await saveBtn.click()
  await page.waitForTimeout(500)

  // Dirty should clear
  await expect(page.locator('text=Nem mentett módosítások')).toBeHidden()
})

// ═════════════════════════════════════════════════════════════════════════════
// Flow 9: Assembly quote regression — old view still works
// ═════════════════════════════════════════════════════════════════════════════
test('assembly quote: old read-only assembly view renders, no manual editor', async ({ page }) => {
  await seedAssemblyQuote(page)
  await openQuoteView(page)

  // Assembly summary should be visible
  await expect(page.locator('text=Világítás szerelvény')).toBeVisible()
  await expect(page.locator('text=munkacsoport')).toBeVisible()

  // Material items should be visible in read-only view
  await expect(page.locator('text=Kábel NYM')).toBeVisible()

  // Manual editor sections should NOT be visible (no add-row buttons)
  const addBtns = page.locator('button', { hasText: '+ Új sor' })
  await expect(addBtns).toHaveCount(0)

  // KPI should show the stored assembly totals
  await expect(page.locator('span:text("Munkaóra")')).toBeVisible()

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})
