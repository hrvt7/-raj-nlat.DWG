// ─── Playwright DWG Success-But-Bad-Output Test ─────────────────────────────
// Protects: .dwg upload → CloudConvert conversion succeeds at protocol level →
// but returned DXF is empty/unusable → workspace shows safe failure state
// (no misleading success, save disabled, 0 items) → app remains stable.
//
// This is the intermediate failure case between:
// - "DWG conversion HTTP error" (covered by upload-corrupt-dwg.spec.js)
// - "DWG conversion succeeds with valid DXF" (covered by upload-dwg-success.spec.js)
//
// Strategy:
// Route interception makes all 4 CloudConvert steps succeed, but the
// "downloaded DXF" is an empty string — the most realistic bad-output scenario
// (CloudConvert occasionally returns empty output files).
// The parser tokenizes it to [], finds no ENTITIES, returns { success: true, blocks: [] }.
// The workspace pipeline detects 0 items → parse_failed workflow stage → safe failure.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

// ── Fixtures ────────────────────────────────────────────────────────────────
const DWG_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'corrupt.dwg')

const PROJECT_ID = 'E2E-DWG-EMPTY-PRJ-001'
const FAKE_DOWNLOAD_URL = 'https://fake-cc-cdn.test/empty-output.dxf'

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
        name: 'E2E – DWG empty output project',
        description: 'E2E test project for DWG success-but-bad-output',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })
}

// ─── Test 16: DWG conversion succeeds but output is empty → safe failure ────
test('DWG conversion succeeds but empty DXF output shows safe failure state', async ({ page }) => {
  await seedProjectOnly(page)

  // ── Route interception: all 4 CloudConvert steps succeed ────────────

  await page.route('**/api/convert-dwg', async (route) => {
    const postData = route.request().postData() || '{}'
    let body
    try { body = JSON.parse(postData) } catch { body = {} }

    if (body.filename) {
      // Step 1: Job creation → success
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'fake-empty-job-001',
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

  // Step 2: S3 upload → success
  await page.route('https://fake-cc-upload.test/**', async (route) => {
    await route.fulfill({ status: 200, body: 'OK' })
  })

  // Step 4: Download → return EMPTY string as the "converted DXF"
  // This is the key: CloudConvert says "finished" but the output is empty.
  await page.route(FAKE_DOWNLOAD_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: '',
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

  // Plan card appears
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  await expect(planCard).toContainText('corrupt.dwg')

  // ── Open plan → triggers DWG conversion flow ──────────────────────────
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // ── Workspace should render (conversion "succeeded") ──────────────────
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 20_000 })

  // Workspace header shows the .dwg file name
  await expect(workspace).toContainText('corrupt.dwg')

  // ── KEY: DWG conversion error panel should NOT appear ─────────────────
  // The conversion itself succeeded — dwgStatus is 'done', not 'failed'.
  // The failure is at the parse/audit level, not the conversion level.
  const dwgError = page.locator('[data-testid="dwg-conversion-error"]')
  await expect(dwgError).toHaveCount(0)

  // ── KEY: zero items detected ──────────────────────────────────────────
  // The empty DXF has no blocks → 0 recognized items
  await expect(workspace).toContainText('0 elem', { timeout: 10_000 })

  // ── KEY: workflow status shows safe failure ────────────────────────────
  // computeWorkflowStatus → parse_failed stage because:
  //   dxfAudit.status === 'PARSE_LIMITED' (if success:true but 0 blocks 0 layers)
  //   OR no recognition and no rows → "Nem találtunk tételt a rajzban"
  // Either way, it's a red parse_failed status — not a misleading success.
  await expect(workspace).toContainText(/beolvasása sikertelen|Nem találtunk tételt|Robbantott rajz/, { timeout: 10_000 })

  // ── KEY: save is blocked ──────────────────────────────────────────────
  // parse_failed stage gates save → disabled
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(saveBtn).toBeDisabled()
  }

  // ── No crash ──────────────────────────────────────────────────────────
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // ── App remains functional ────────────────────────────────────────────
  await expect(sidebar).toBeVisible()
})
