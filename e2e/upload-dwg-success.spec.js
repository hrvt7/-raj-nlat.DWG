// ─── Playwright DWG Happy-Path Smoke Test ──────────────────────────────────
// Protects: .dwg upload → CloudConvert conversion succeeds → converted DXF
// is parsed → workspace opens with recognized items → app stable.
//
// Strategy:
// Route interception simulates all 4 CloudConvert steps returning success.
// The "downloaded DXF" is the real smoke-plan.dxf fixture content served from
// a fake CDN URL.  The DWG code path in TakeoffWorkspace.jsx is fully exercised:
// fetchWithRetry, job creation, S3 upload, polling, DXF download, worker parse,
// normalization, and recognition.
//
// What is NOT tested: real CloudConvert network (inherently flaky, CI-hostile).

import { test, expect } from '@playwright/test'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// ── Fixtures ────────────────────────────────────────────────────────────────
// The corrupt.dwg fixture is a tiny non-DXF binary — its content doesn't
// matter because route interception returns the real DXF text as the
// "converted" result.  What matters is the .dwg extension.
const DWG_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'corrupt.dwg')

// The real DXF fixture that will be returned as the "converted" output.
// 5 INSERT entities → 2 unique blocks → auto-matched → recognizable state.
const CONVERTED_DXF_TEXT = readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'smoke-plan.dxf'),
  'utf-8',
)

const PROJECT_ID = 'E2E-DWG-SUCCESS-PRJ-001'
const FAKE_DOWNLOAD_URL = 'https://fake-cc-cdn.test/converted-output.dxf'

/**
 * Seed only a project into localStorage (no plans, no IndexedDB blobs).
 * The DWG upload flow will create the plan via the real file input.
 */
async function seedProjectOnly(page) {
  await page.addInitScript((args) => {
    const { projectId } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – DWG success project',
        description: 'E2E test project for successful DWG conversion',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 13: Successful DWG upload → conversion → workspace with items ─────
test('successful DWG upload converts to DXF and opens workspace with recognized items', async ({ page }) => {
  await seedProjectOnly(page)

  // ── Route interception: simulate all 4 CloudConvert steps ─────────────

  // Track which step we've seen to correctly dispatch /api/convert-dwg calls
  await page.route('**/api/convert-dwg', async (route) => {
    const postData = route.request().postData() || '{}'
    let body
    try { body = JSON.parse(postData) } catch { body = {} }

    if (body.filename) {
      // Step 1: Job creation → return success with fake upload URL + params
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'fake-success-job-001',
          uploadUrl: 'https://fake-cc-upload.test/upload',
          uploadParams: { key: 'fake-param' },
        }),
      })
    } else if (body.jobId) {
      // Step 3: Polling → immediately return 'finished' with download URL
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'finished',
          downloadUrl: FAKE_DOWNLOAD_URL,
        }),
      })
    }
  })

  // Step 2: Intercept the fake S3 upload URL → return success
  await page.route('https://fake-cc-upload.test/**', async (route) => {
    await route.fulfill({ status: 200, body: 'OK' })
  })

  // Step 4: Intercept the fake CDN download URL → return real DXF content
  await page.route(FAKE_DOWNLOAD_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: CONVERTED_DXF_TEXT,
    })
  })

  // ── Navigate to project ───────────────────────────────────────────────
  await page.goto('/#app')

  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // ── Upload the DWG file ───────────────────────────────────────────────
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(DWG_FIXTURE_PATH)

  // Plan card should appear with the .dwg file name
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('corrupt.dwg')

  // ── Open the plan → triggers DWG conversion flow ──────────────────────
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // ── Workspace should render after successful conversion ───────────────
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 20_000 })

  // The DWG conversion error panel should NOT be visible
  const dwgError = page.locator('[data-testid="dwg-conversion-error"]')
  await expect(dwgError).toHaveCount(0)

  // Workspace header should show the .dwg file name
  await expect(workspace).toContainText('corrupt.dwg')

  // ── Verify recognition: items detected from the converted DXF ─────────
  // smoke-plan.dxf has 5 inserts (DUGALJ_2P_F × 3 + KAPCSOLO_1G × 2)
  // Both blocks are known → auto-matched → takeoff rows generated
  await expect(workspace).toContainText('elem', { timeout: 10_000 })

  // ── Verify no crash ───────────────────────────────────────────────────
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // ── Verify app remains functional ─────────────────────────────────────
  await expect(sidebar).toBeVisible()
})
