// ─── Playwright PDF Smoke Tests — Manual Marker Workflow ──────────────────────
// Protects: PDF plan → workspace entry → marker-based takeoff → save → reopen
// Uses a tiny PDF fixture (1 blank page) + seeded marker annotations in IndexedDB.
//
// Strategy: Seed pre-built markers rather than automating brittle canvas clicks.
// This proves the full PDF persistence round-trip without flaky UI interaction.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load the tiny PDF fixture ──────────────────────────────────────────────
const PDF_FIXTURE = readFileSync(
  resolve(import.meta.dirname, 'fixtures', 'smoke-plan.pdf'),
)

const PLAN_ID = 'E2E-PDF-PLN-001'
const PROJECT_ID = 'E2E-PDF-PRJ-001'

/**
 * Seed markers that simulate a manual PDF takeoff:
 *   2× ASM-001 (dugalj/socket)  → 1 takeoff row, qty 2
 *   1× ASM-003 (lámpa/light)    → 1 takeoff row, qty 1
 *
 * This reaches stage 'ready' (3 markers → 2 takeoff rows → pricing computes → save enabled).
 */
const SEED_MARKERS = [
  { id: 'MRK-E2E-1', x: 100, y: 200, pageNum: 1, category: 'ASM-001', color: '#FF6B35', asmId: 'ASM-001', source: 'manual', confidence: null, createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'MRK-E2E-2', x: 300, y: 200, pageNum: 1, category: 'ASM-001', color: '#FF6B35', asmId: 'ASM-001', source: 'manual', confidence: null, createdAt: '2025-01-01T00:00:01.000Z' },
  { id: 'MRK-E2E-3', x: 200, y: 400, pageNum: 1, category: 'ASM-003', color: '#FFD166', asmId: 'ASM-003', source: 'manual', confidence: null, createdAt: '2025-01-01T00:00:02.000Z' },
]

/**
 * Seed project + plan meta (localStorage) + PDF blob + annotations (IndexedDB).
 * Follows the same pattern as workspace.spec.js but for PDF + pre-built markers.
 */
async function seedPdfWorkspaceData(page) {
  // Phase 1: localStorage seeds (runs before page load via addInitScript)
  await page.addInitScript((args) => {
    const { planId, projectId } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    // Project (versioned envelope)
    localStorage.setItem('takeoffpro_projects_meta', wrap([
      {
        id: projectId,
        name: 'E2E – PDF smoke project',
        description: 'E2E test project for PDF smoke',
        createdAt: new Date().toISOString(),
      },
    ]))

    // Plan (versioned envelope) — fileType: 'pdf' is key
    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planId,
        name: 'E2E – Smoke PDF plan.pdf',
        fileType: 'pdf',
        fileSize: 328,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 3,
      },
    ]))

    // Quotes (versioned envelope, empty)
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { planId: PLAN_ID, projectId: PROJECT_ID })

  // Phase 2: Navigate to app to bootstrap IndexedDB
  await page.goto('/#app')
  await page.waitForTimeout(500)

  // Phase 3: Inject PDF blob + marker annotations into IndexedDB
  await page.evaluate(async (args) => {
    const { planId, pdfBytes, markers } = args

    // Open the localforage IndexedDB database
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('takeoffpro')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('plan_files')) db.createObjectStore('plan_files')
        if (!db.objectStoreNames.contains('plan_annotations')) db.createObjectStore('plan_annotations')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    // Write PDF blob into plan_files
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_files', 'readwrite')
      const store = tx.objectStore('plan_files')
      store.put(blob, planId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    // Write marker annotations into plan_annotations
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_annotations', 'readwrite')
      const store = tx.objectStore('plan_annotations')
      store.put({
        markers,
        measurements: [],
        scale: { factor: null, calibrated: false },
        cableRoutes: [],
        ceilingHeight: 3.0,
        socketHeight: 0.3,
      }, planId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    db.close()
  }, {
    planId: PLAN_ID,
    pdfBytes: Array.from(PDF_FIXTURE),
    markers: SEED_MARKERS,
  })
}

// ─── Test 8: PDF opens into workspace with seeded markers ────────────────────
test('PDF plan opens into workspace with seeded markers and takeoff rows', async ({ page }) => {
  await seedPdfWorkspaceData(page)

  // Navigate to Projektek
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  // Open the project
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Plan card should show the PDF plan
  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  await expect(planCard).toContainText('Smoke PDF plan.pdf')

  // Open the plan
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  // Workspace should render
  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // Verify the file name appears
  await expect(workspace).toContainText('Smoke PDF plan.pdf')

  // Verify takeoff rows appeared from seeded markers (3 markers → 2 assembly rows)
  // The workspace header shows "N elem · M assembly" format
  await expect(workspace).toContainText('2 assembly', { timeout: 10_000 })

  // Verify no crash — error boundary text should not be present
  await expect(page.locator('text=összeomlott')).toHaveCount(0)

  // App should remain functional — sidebar still present
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})

// ─── Test 9: PDF save persists and shows success ─────────────────────────────
test('PDF workspace save persists calculation and shows success', async ({ page }) => {
  await seedPdfWorkspaceData(page)

  // Navigate to workspace
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ }).click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('2 assembly', { timeout: 10_000 })

  // Switch to Kalkuláció tab to access the save button
  const calcTab = page.locator('button', { hasText: 'Kalkuláció' })
  await expect(calcTab).toBeVisible({ timeout: 5_000 })
  await calcTab.click()

  // Save button should be enabled (stage = 'ready', not 'empty')
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeVisible({ timeout: 5_000 })
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  await saveBtn.click()

  // Save success indicator
  const saveSuccess = page.locator('[data-testid="workspace-save-success"]')
  await expect(saveSuccess).toBeVisible({ timeout: 10_000 })
  await expect(saveSuccess).toContainText('Kalkuláció mentve')

  // Verify plan metadata was updated with calc snapshot
  const calcTotal = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    const plan = plans.find(p => p.id === planId)
    return plan?.calcTotal ?? null
  }, PLAN_ID)

  expect(calcTotal).not.toBeNull()
  expect(calcTotal).toBeGreaterThan(0)
})

// ─── Test 10: PDF reopen restores saved state ────────────────────────────────
test('reopening a saved PDF plan restores calculation state', async ({ page }) => {
  await seedPdfWorkspaceData(page)

  // ── First pass: open workspace and save ──
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()
  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 5_000 })
  planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ }).click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('2 assembly', { timeout: 10_000 })

  // Save
  await page.locator('button', { hasText: 'Kalkuláció' }).click()
  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
  await saveBtn.click()
  await expect(page.locator('[data-testid="workspace-save-success"]')).toBeVisible({ timeout: 10_000 })

  // Capture saved calcTotal
  const savedCalcTotal = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? 0
  }, PLAN_ID)
  expect(savedCalcTotal).toBeGreaterThan(0)

  // ── Navigate back to Projektek ──
  await page.locator('[data-testid="sidebar-nav-projektek"]').click()

  // ── Second pass: reopen ──
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards.first()).toBeVisible({ timeout: 5_000 })
  const reopenBtn = planCards.first().locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(reopenBtn).toBeVisible()
  await reopenBtn.click()

  // Workspace should render again with PDF
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(workspace).toContainText('Smoke PDF plan.pdf')
  await expect(workspace).toContainText('2 assembly', { timeout: 10_000 })

  // Verify calcTotal survived the round-trip
  const reopenCalcTotal = await page.evaluate((planId) => {
    const raw = localStorage.getItem('takeoffpro_plans_meta')
    const parsed = JSON.parse(raw)
    const plans = parsed._v ? parsed.data : parsed
    return plans.find(p => p.id === planId)?.calcTotal ?? 0
  }, PLAN_ID)
  expect(reopenCalcTotal).toBe(savedCalcTotal)

  // Verify no crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
