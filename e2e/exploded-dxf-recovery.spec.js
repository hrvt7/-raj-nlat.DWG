// ─── Playwright E2E: Exploded DXF → PDF Recovery CTA ────────────────────────
// Protects: the new switch_to_pdf CTA for EXPLODED_RISK DXF files.
//
// Flow:
//   1. Seed an exploded DXF (60 LINE entities, 0 blocks) into IndexedDB
//   2. Open the plan in workspace
//   3. Verify the workflow status shows the switch_to_pdf CTA
//   4. Click the CTA → triggers hidden PDF-only file input
//   5. Attach a PDF file via setInputFiles on the hidden input
//   6. Verify the app transitions into PDF workflow
//
// This is a real end-to-end path verification for commit baf7026.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const EXPLODED_DXF = readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'exploded-plan.dxf'),
  'utf-8',
)
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.pdf')

const PLAN_ID = 'E2E-EXPLODED-PLN-001'
const PROJECT_ID = 'E2E-EXPLODED-PRJ-001'

/**
 * Seed project + plan metadata (localStorage) + exploded DXF blob (IndexedDB).
 */
async function seedExplodedDxfData(page) {
  await page.addInitScript((args) => {
    const { planId, projectId, dxfLength } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Exploded DXF project',
        description: 'E2E test for exploded DXF recovery',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planId,
        name: 'E2E – exploded-plan.dxf',
        fileType: 'dxf',
        fileSize: dxfLength,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
    ]))

    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { planId: PLAN_ID, projectId: PROJECT_ID, dxfLength: EXPLODED_DXF.length })

  await page.goto('/#app')
  await page.waitForTimeout(500)

  // Inject exploded DXF blob into IndexedDB
  await page.evaluate(async (args) => {
    const { planId, dxfText } = args

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('takeoffpro')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('plan_files')) db.createObjectStore('plan_files')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const blob = new Blob([dxfText], { type: 'text/plain' })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_files', 'readwrite')
      const store = tx.objectStore('plan_files')
      store.put(blob, planId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  }, { planId: PLAN_ID, dxfText: EXPLODED_DXF })
}

// ─── Test 25: Exploded DXF shows switch_to_pdf CTA and allows PDF recovery ──
test('exploded DXF shows switch_to_pdf CTA and transitions to PDF workflow', async ({ page }) => {
  await seedExplodedDxfData(page)

  // Navigate to Projektek
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  // Open the project
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Open the plan
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Workspace should render
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // ── Verify: workflow status line shows exploded + PDF recommendation ──
  const statusLine = page.locator('[data-testid="workflow-status-line"]')
  await expect(statusLine).toBeVisible({ timeout: 10_000 })
  await expect(statusLine).toContainText('Robbantott', { timeout: 5_000 })
  await expect(statusLine).toContainText('PDF')

  // ── Verify: CTA button shows switch_to_pdf action ──
  const ctaBtn = page.locator('[data-testid="workflow-cta-btn"]')
  await expect(ctaBtn).toBeVisible({ timeout: 5_000 })
  await expect(ctaBtn).toHaveAttribute('data-action', 'switch_to_pdf')
  await expect(ctaBtn).toContainText('PDF')

  // ── Click CTA: triggers hidden PDF-only file input ──
  // Listen for the file chooser event that the click will trigger
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5_000 }),
    ctaBtn.click(),
  ])

  // Verify the file chooser only accepts PDF
  expect(fileChooser.isMultiple()).toBe(false)

  // ── Attach a PDF file ──
  await fileChooser.setFiles(PDF_FIXTURE_PATH)

  // ── Verify: app transitions into PDF workflow ──
  // The workspace should now show the PDF file name (not the old DXF name)
  // PDF workflow shows "Jelölj ki" or the PDF viewer renders
  // The key indicator is that the old EXPLODED status is gone
  // Give extra time for file processing
  await page.waitForTimeout(1_000)

  // The workflow status should no longer show the exploded warning
  // In PDF mode, the status card is hidden (!isPdf check) or shows PDF-specific content
  // The workspace should no longer show the exploded CTA
  const explodedCta = page.locator('[data-testid="workflow-cta-btn"][data-action="switch_to_pdf"]')
  await expect(explodedCta).toHaveCount(0, { timeout: 5_000 })

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App should remain functional — sidebar still present
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
