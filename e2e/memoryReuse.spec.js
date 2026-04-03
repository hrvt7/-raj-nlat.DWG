// ─── Playwright Smoke Test — Recognition Memory Reuse ─────────────────────────
// Protects: after resolving an unknown block once, the same block auto-resolves
// on a later plan open within the same project — zero manual work needed.
//
// Scenario:
//   Plan A: BLK_OPAQUE_001 is unknown → user assigns ASM-001 → memory recorded
//   Plan B: same block → memory lookup → auto-resolved → no UnknownBlockPanel
//
// Memory tier: project (single project, single confirmation → project-tier at 0.85)
// Threshold: 0.85 ≥ 0.80 → auto-match applied in recognition cascade

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── DXF fixture: 1 recognized block + 1 opaque block ────────────────────────
const DXF_FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures', 'unknown-plan.dxf'),
  'utf-8',
)

const PROJECT_ID = 'E2E-PRJ-MEM'
const PLAN_A_ID  = 'E2E-MEM-PLN-A'
const PLAN_B_ID  = 'E2E-MEM-PLN-B'

/**
 * Seed project with TWO plans (both using the same DXF with an opaque block).
 * Injects project + plan metadata into localStorage, DXF blobs into IndexedDB.
 */
async function seedTwoPlans(page, dxfText) {
  await page.addInitScript((args) => {
    const { projectId, planAId, planBId, dxfText } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      {
        id: projectId,
        name: 'E2E – Memory reuse project',
        description: 'Tests recognition memory across plans',
        createdAt: new Date().toISOString(),
      },
    ]))

    localStorage.setItem('takeoffpro_plans_meta', wrap([
      {
        id: planAId,
        name: 'E2E – Plan A (first encounter).dxf',
        fileType: 'dxf',
        fileSize: dxfText.length,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
      {
        id: planBId,
        name: 'E2E – Plan B (memory reuse).dxf',
        fileType: 'dxf',
        fileSize: dxfText.length,
        units: 'mm',
        projectId,
        createdAt: new Date().toISOString(),
        markerCount: 0,
      },
    ]))

    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID, planAId: PLAN_A_ID, planBId: PLAN_B_ID, dxfText: DXF_FIXTURE })

  await page.goto('/#app')
  await page.waitForTimeout(500)

  // Inject DXF blobs for BOTH plans into IndexedDB
  await page.evaluate(async (args) => {
    const { planAId, planBId, dxfText } = args

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('takeoffpro')
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('plan_files')) {
          db.createObjectStore('plan_files')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const blob = new Blob([dxfText], { type: 'text/plain' })
    // Write Plan A blob
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_files', 'readwrite')
      const store = tx.objectStore('plan_files')
      store.put(blob, planAId).onsuccess = () => resolve()
      store.onerror = () => reject()
    })
    // Write Plan B blob (same DXF content)
    const blob2 = new Blob([dxfText], { type: 'text/plain' })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('plan_files', 'readwrite')
      const store = tx.objectStore('plan_files')
      store.put(blob2, planBId).onsuccess = () => resolve()
      store.onerror = () => reject()
    })

    db.close()
  }, { planAId: PLAN_A_ID, planBId: PLAN_B_ID, dxfText: DXF_FIXTURE })
}

// ─── Test 8: Memory reuse — second plan auto-resolves learned block ──────────
test('recognition memory reuse: second plan auto-resolves a previously unknown block', async ({ page }) => {
  await seedTwoPlans(page, DXF_FIXTURE)

  const sidebar  = page.locator('[data-testid="sidebar-nav-projektek"]')
  const workspace = page.locator('[data-testid="workspace-container"]')
  const unknownPanel = page.locator('[data-testid="unknown-block-panel"]')

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 1: Open Plan A — resolve the unknown block manually
  // ═══════════════════════════════════════════════════════════════════════════

  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Plan A is the first card (ordered by creation)
  const planCards = page.locator('[data-testid="plan-card"]')
  await expect(planCards.first()).toBeVisible({ timeout: 5_000 })

  // Click "Megnyitás" on Plan A (first card)
  const planAOpen = planCards.nth(0).locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(planAOpen).toBeVisible()
  await planAOpen.click()

  // Workspace should load with BLK_OPAQUE_001 as unknown
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  // Resolve: assign ASM-001 (Dugalj) via dropdown
  const selectDropdown = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectDropdown).toBeVisible({ timeout: 3_000 })
  await selectDropdown.selectOption({ value: 'ASM-001' })

  // Panel should disappear (block resolved)
  await expect(unknownPanel).toHaveCount(0, { timeout: 5_000 })

  // ── Verify memory was persisted to localStorage ──
  const memoryWritten = await page.evaluate((projectId) => {
    const key = `takeoffpro_recmem_proj_${projectId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const mem = JSON.parse(raw)
    // Look for any entry that maps to ASM-001 (the signature is BLK_OPAQUE)
    for (const [sig, entry] of Object.entries(mem)) {
      if (entry.asmId === 'ASM-001' && sig === 'BLK_OPAQUE') {
        return { signature: sig, asmId: entry.asmId, source: entry.source }
      }
    }
    return null
  }, PROJECT_ID)

  expect(memoryWritten).not.toBeNull()
  expect(memoryWritten.asmId).toBe('ASM-001')
  expect(memoryWritten.source).toBe('user_override')

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 2: Navigate back to project, open Plan B — memory should auto-resolve
  // ═══════════════════════════════════════════════════════════════════════════

  // Navigate back via sidebar — goes to project detail (plan cards view)
  await sidebar.click()

  // Plan cards should be visible (we're back in the project detail)
  await expect(planCards.nth(1)).toBeVisible({ timeout: 5_000 })

  // Open Plan B (second card)
  const planBOpen = planCards.nth(1).locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(planBOpen).toBeVisible()
  await planBOpen.click()

  // Workspace should load successfully
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // ── CRITICAL ASSERTION: UnknownBlockPanel does NOT appear ──
  // BLK_OPAQUE_001 should be auto-resolved via project-tier memory (0.85 confidence)
  // Wait a moment for parsing to complete, then verify panel is absent
  await page.waitForTimeout(1000)
  await expect(unknownPanel).toHaveCount(0)

  // ── Save button should be enabled (no unresolved_blocks gating) ──
  const calcTab = page.locator('button', { hasText: 'Kalkuláció' })
  await expect(calcTab).toBeVisible({ timeout: 5_000 })
  await calcTab.click()

  const saveBtn = page.locator('[data-testid="workspace-save-btn"]')
  await expect(saveBtn).toBeVisible({ timeout: 5_000 })
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 })

  // ── No crash ──
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
  await expect(sidebar).toBeVisible()
})
