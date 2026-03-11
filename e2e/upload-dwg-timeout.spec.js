// ─── Playwright DWG Conversion Timeout Smoke Test ─────────────────────────
// Protects: DWG upload → CloudConvert job created → upload succeeds →
// polling never reaches 'finished' → polling budget (120s) exhausted →
// visible "DWG konverzió sikertelen" + "időtúllépés" error panel →
// app remains functional.
//
// Strategy:
// Route interception makes Steps 1-2 succeed instantly.
// Step 3 polling always returns { status: 'processing' }.
// A Date.now offset trick jumps time forward by 130s after the first poll,
// so the while-loop condition fails on the next check — deterministic and fast.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const DWG_FIXTURE_PATH = resolve(__dirname, 'fixtures', 'corrupt.dwg')
const PROJECT_ID = 'E2E-DWG-TIMEOUT-PRJ-001'

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
        name: 'E2E – DWG timeout project',
        description: 'E2E test project for DWG conversion timeout',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 18: DWG conversion timeout shows visible failure panel ────────────
test('DWG conversion timeout shows visible failure with timeout message', async ({ page }) => {
  await seedProjectOnly(page)

  // Install a Date.now offset hook so we can jump time forward on demand.
  // This avoids waiting 120 real seconds for the polling budget to exhaust.
  await page.addInitScript(() => {
    const _origNow = Date.now.bind(Date)
    let _offset = 0
    window.__addTimeOffset = (ms) => { _offset += ms }
    Date.now = () => _origNow() + _offset
  })

  // Track whether the first poll request has fired (means pollStart is captured)
  let firstPollResolve
  const firstPollPromise = new Promise(resolve => { firstPollResolve = resolve })
  let pollSeen = false

  // Intercept CloudConvert API calls
  await page.route('**/api/convert-dwg', async (route) => {
    const postData = route.request().postData() || '{}'
    let body
    try { body = JSON.parse(postData) } catch { body = {} }

    if (body.filename) {
      // Step 1: Job creation → return success with fake upload URL
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'fake-timeout-job',
          uploadUrl: 'https://fake-cc-upload.test/upload',
          uploadParams: { key: 'fake-param' },
        }),
      })
    } else if (body.jobId) {
      // Step 3: Polling → always return 'processing' (never finishes)
      if (!pollSeen) {
        pollSeen = true
        firstPollResolve()
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'processing',
        }),
      })
    }
  })

  // Intercept the fake CloudConvert upload URL (Step 2)
  await page.route('https://fake-cc-upload.test/**', async (route) => {
    await route.fulfill({ status: 200, body: 'OK' })
  })

  await page.goto('/#app')

  // Navigate to Projektek → open project
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload DWG via file input
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(DWG_FIXTURE_PATH)

  // Plan card should appear
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('corrupt.dwg')

  // Open the plan → conversion flow starts (workspace stays in loading/converting
  // state until conversion resolves — workspace-container testid only appears after)
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Wait for the first poll request — this confirms:
  // - Step 1 (job creation) succeeded via our route
  // - Step 2 (upload) succeeded via our route
  // - Step 3 polling has started, pollStart = Date.now() is captured
  await firstPollPromise

  // Jump Date.now forward by 130 seconds.
  // The next while-loop check: Date.now() - pollStart > 120_000 → exits loop.
  // Then: throw new Error('CloudConvert időtúllépés (120 mp). Próbáld újra.')
  // → dwgStatus='failed' → setParsePending(false) → workspace renders with error panel.
  await page.evaluate(() => window.__addTimeOffset(130_000))

  // DWG conversion error panel should appear with the timeout message
  const dwgError = page.locator('[data-testid="dwg-conversion-error"]')
  await expect(dwgError).toBeVisible({ timeout: 15_000 })

  // Should show the "konverzió sikertelen" heading
  await expect(dwgError).toContainText('konverzió sikertelen')

  // Should show the timeout-specific error message
  await expect(dwgError).toContainText('időtúllépés')

  // Workspace should now be rendered (parsePending=false after timeout)
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 5_000 })

  // Verify no crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App remains functional — sidebar still present
  await expect(sidebar).toBeVisible()
})
