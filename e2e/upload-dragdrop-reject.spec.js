// ─── Playwright Drag-and-Drop Rejection Smoke Test ────────────────────────
// Protects: mixed drop (unsupported + corrupt-but-allowed) onto the drop zone
// → onDrop handler fires → unsupported file rejected with visible warning →
// corrupt-but-allowed file creates plan stub → no ghost plan for rejected →
// app remains functional.
// Uses synthetic DragEvent to exercise the real onDrop path.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const UNSUPPORTED_PATH = resolve(import.meta.dirname, 'fixtures', 'notes.txt')
const CORRUPT_DXF_PATH = resolve(import.meta.dirname, 'fixtures', 'corrupt.dxf')
const PROJECT_ID = 'E2E-DROPREJECT-PRJ-001'

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
        name: 'E2E – Drop rejection project',
        description: 'E2E test project for drag-drop rejection',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

/**
 * Read a local fixture file and return its content as base64.
 */
function fixtureBase64(filePath) {
  return readFileSync(filePath).toString('base64')
}

// ─── Test 17: Drag-drop mixed rejection — unsupported + corrupt allowed ─────
test('drag-drop rejects unsupported file and keeps corrupt stub via drop zone', async ({ page }) => {
  await seedProjectOnly(page)
  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Drop zone should be visible
  const dropZone = page.locator('[data-testid="plan-drop-zone"]')
  await expect(dropZone).toBeVisible({ timeout: 5_000 })

  // Read both fixtures as base64
  const txtBase64 = fixtureBase64(UNSUPPORTED_PATH)
  const dxfBase64 = fixtureBase64(CORRUPT_DXF_PATH)

  // Simulate dropping 2 files: unsupported .txt + corrupt .dxf
  await page.evaluate(({ files }) => {
    const dropZoneEl = document.querySelector('[data-testid="plan-drop-zone"]')
    if (!dropZoneEl) throw new Error('Drop zone not found')

    const dataTransfer = new DataTransfer()

    for (const { base64, name, mime } of files) {
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const file = new File([bytes], name, { type: mime })
      dataTransfer.items.add(file)
    }

    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    })
    dropZoneEl.dispatchEvent(dropEvent)
  }, {
    files: [
      { base64: txtBase64, name: 'notes.txt', mime: 'text/plain' },
      { base64: dxfBase64, name: 'corrupt.dxf', mime: 'text/plain' },
    ],
  })

  // Warning banner should appear for the rejected .txt file
  const warning = page.locator('[data-testid="upload-warning"]')
  await expect(warning).toBeVisible({ timeout: 5_000 })
  await expect(warning).toContainText('notes.txt')

  // Exactly 1 plan card should be created (corrupt.dxf only)
  // The unsupported .txt must NOT create a plan stub
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards).toHaveCount(1, { timeout: 10_000 })
  await expect(planCards.first()).toContainText('corrupt.dxf')

  // Verify exactly 1 plan in localStorage (no ghost for .txt)
  const planCount = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.length
  })
  expect(planCount).toBe(1)

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
