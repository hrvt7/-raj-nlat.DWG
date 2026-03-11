// ─── Playwright Drag-and-Drop Upload Smoke Test ───────────────────────────
// Protects: DXF file dropped onto the drop zone → onDrop handler fires →
// plan stub created → plan card visible → app remains functional.
// Uses a synthetic drop event to exercise the real onDrop path,
// NOT the hidden file input shortcut.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const DXF_FIXTURE_PATH = resolve(__dirname, 'fixtures', 'smoke-plan.dxf')
const PROJECT_ID = 'E2E-DRAGDROP-PRJ-001'

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
        name: 'E2E – Drag-drop project',
        description: 'E2E test project for drag-drop upload',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 16: Drag-and-drop DXF upload creates plan card ────────────────────
test('drag-and-drop DXF upload creates plan via drop zone', async ({ page }) => {
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

  // Read the DXF fixture as a base64 string to pass into the browser
  const fixtureBuffer = readFileSync(DXF_FIXTURE_PATH)
  const fixtureBase64 = fixtureBuffer.toString('base64')

  // Simulate a real drop event on the drop zone
  // This constructs a File from the fixture bytes, wraps it in a DataTransfer,
  // and dispatches a native 'drop' event — exercising the real onDrop handler.
  await page.evaluate(({ base64, fileName }) => {
    const dropZoneEl = document.querySelector('[data-testid="plan-drop-zone"]')
    if (!dropZoneEl) throw new Error('Drop zone not found')

    // Decode base64 to binary
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Create a File object
    const file = new File([bytes], fileName, { type: 'text/plain' })

    // Build a DataTransfer with the file
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)

    // Dispatch the drop event
    const dropEvent = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    })
    dropZoneEl.dispatchEvent(dropEvent)
  }, { base64: fixtureBase64, fileName: 'smoke-plan.dxf' })

  // A plan card should appear after the drop
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('smoke-plan.dxf')

  // Exactly 1 plan should exist in localStorage (not 0, not duplicated)
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
