// ─── Playwright Smoke Test — Recognition Memory Conflict Safety ───────────────
// Protects: when 2 different projects resolve the same unknown block to
// DIFFERENT assemblies, the system must NOT promote an unsafe account-level
// mapping. A 3rd project must still surface the block as unresolved.
//
// Scenario:
//   Project A: BLK_OPAQUE_001 → user assigns ASM-001 (Dugalj)
//   Project B: BLK_OPAQUE_001 → user assigns ASM-002 (Kapcsoló) — DIFFERENT
//              → maybePromoteToAccount detects disagreement → recordConflict
//              → NO promotion to account memory
//   Project C: same block → no project memory, no account memory
//              → lookupMemory returns null → UnknownBlockPanel APPEARS
//              → user can still resolve manually
//
// This is the safety complement to Test 9 (accountPromotion.spec.js).

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── DXF fixture: 1 recognized block + 1 opaque block ────────────────────────
const DXF_FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures', 'unknown-plan.dxf'),
  'utf-8',
)

const PROJECT_A_ID = 'E2E-PRJ-CONF-A'
const PROJECT_B_ID = 'E2E-PRJ-CONF-B'
const PROJECT_C_ID = 'E2E-PRJ-CONF-C'
const PLAN_A_ID    = 'E2E-CONF-PLN-A'
const PLAN_B_ID    = 'E2E-CONF-PLN-B'
const PLAN_C_ID    = 'E2E-CONF-PLN-C'

/**
 * Seed 3 projects, each with 1 plan using the same DXF.
 */
async function seedThreeProjects(page, dxfText) {
  await page.addInitScript((args) => {
    const { projects, plans } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify(projects))
    localStorage.setItem('takeoffpro_plans_meta', wrap(plans))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, {
    projects: [
      { id: PROJECT_A_ID, name: 'E2E – Conflict A', description: 'Conflict test — project A', createdAt: '2025-02-01T00:00:00.000Z' },
      { id: PROJECT_B_ID, name: 'E2E – Conflict B', description: 'Conflict test — project B', createdAt: '2025-02-02T00:00:00.000Z' },
      { id: PROJECT_C_ID, name: 'E2E – Conflict C', description: 'Conflict test — project C', createdAt: '2025-02-03T00:00:00.000Z' },
    ],
    plans: [
      { id: PLAN_A_ID, name: 'E2E – Conflict Plan A.dxf', fileType: 'dxf', fileSize: dxfText.length, units: 'mm', projectId: PROJECT_A_ID, createdAt: '2025-02-01T00:00:01.000Z', markerCount: 0 },
      { id: PLAN_B_ID, name: 'E2E – Conflict Plan B.dxf', fileType: 'dxf', fileSize: dxfText.length, units: 'mm', projectId: PROJECT_B_ID, createdAt: '2025-02-02T00:00:01.000Z', markerCount: 0 },
      { id: PLAN_C_ID, name: 'E2E – Conflict Plan C.dxf', fileType: 'dxf', fileSize: dxfText.length, units: 'mm', projectId: PROJECT_C_ID, createdAt: '2025-02-03T00:00:01.000Z', markerCount: 0 },
    ],
    dxfText: DXF_FIXTURE,
  })

  await page.goto('/#app')
  await page.waitForTimeout(500)

  // Inject DXF blobs for all 3 plans into IndexedDB
  await page.evaluate(async (args) => {
    const { planIds, dxfText } = args

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

    for (const planId of planIds) {
      const blob = new Blob([dxfText], { type: 'text/plain' })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('plan_files', 'readwrite')
        const store = tx.objectStore('plan_files')
        store.put(blob, planId).onsuccess = () => resolve()
        store.onerror = () => reject()
      })
    }

    db.close()
  }, { planIds: [PLAN_A_ID, PLAN_B_ID, PLAN_C_ID], dxfText: DXF_FIXTURE })
}

/**
 * From the projects list, open the Nth project card (0-indexed),
 * then open its first (only) plan.
 */
async function openProjectPlan(page, projectIndex) {
  const sidebar       = page.locator('[data-testid="sidebar-nav-projektek"]')
  const workspace     = page.locator('[data-testid="workspace-container"]')
  const projectCards  = page.locator('[data-testid="project-card"]')
  const planCards     = page.locator('[data-testid="plan-card"]')

  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  await expect(projectCards.first()).toBeVisible({ timeout: 5_000 })
  await projectCards.nth(projectIndex).click()

  await expect(planCards.first()).toBeVisible({ timeout: 5_000 })

  const openBtn = planCards.first().locator('button', { hasText: /Megnyitás|Szerkesztés/ })
  await expect(openBtn).toBeVisible()
  await openBtn.click()

  await expect(workspace).toBeVisible({ timeout: 15_000 })
}

/**
 * From workspace, navigate back to the top-level projects list.
 */
async function navigateBackToProjectsList(page) {
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await sidebar.click()

  const backBtn = page.locator('button', { hasText: 'Vissza a projektekhez' })
  await expect(backBtn).toBeVisible({ timeout: 5_000 })
  await backBtn.click()

  const projectCards = page.locator('[data-testid="project-card"]')
  await expect(projectCards.first()).toBeVisible({ timeout: 5_000 })
}

// ─── Test 10: Conflict safety — disagreeing projects block account promotion ──
test('memory conflict: disagreeing projects prevent account promotion, 3rd project still shows unknown panel', async ({ page }) => {
  await seedThreeProjects(page, DXF_FIXTURE)

  const unknownPanel = page.locator('[data-testid="unknown-block-panel"]')

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 1: Project A — resolve unknown block to ASM-001 (Dugalj)
  // ═══════════════════════════════════════════════════════════════════════════

  await openProjectPlan(page, 0)

  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  const selectA = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectA).toBeVisible({ timeout: 3_000 })
  await selectA.selectOption({ value: 'ASM-001' })
  await expect(unknownPanel).toHaveCount(0, { timeout: 5_000 })

  // ── Verify project A memory written ──
  const memA = await page.evaluate((projectId) => {
    const raw = localStorage.getItem(`takeoffpro_recmem_proj_${projectId}`)
    if (!raw) return null
    const mem = JSON.parse(raw)
    return mem['BLK_OPAQUE'] || null
  }, PROJECT_A_ID)

  expect(memA).not.toBeNull()
  expect(memA.asmId).toBe('ASM-001')

  await navigateBackToProjectsList(page)

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 2: Project B — resolve SAME block to ASM-002 (Kapcsoló) — CONFLICT
  // ═══════════════════════════════════════════════════════════════════════════

  await openProjectPlan(page, 1)

  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  // Assign to a DIFFERENT assembly than project A
  const selectB = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectB).toBeVisible({ timeout: 3_000 })
  await selectB.selectOption({ value: 'ASM-002' })
  await expect(unknownPanel).toHaveCount(0, { timeout: 5_000 })

  // ── Verify project B memory written with DIFFERENT asmId ──
  const memB = await page.evaluate((projectId) => {
    const raw = localStorage.getItem(`takeoffpro_recmem_proj_${projectId}`)
    if (!raw) return null
    const mem = JSON.parse(raw)
    return mem['BLK_OPAQUE'] || null
  }, PROJECT_B_ID)

  expect(memB).not.toBeNull()
  expect(memB.asmId).toBe('ASM-002')

  // ── CRITICAL SAFETY ASSERTION: Account memory must NOT contain BLK_OPAQUE ──
  // maybePromoteToAccount should have detected disagreement (ASM-001 vs ASM-002)
  // and refused to promote.
  const accountState = await page.evaluate(() => {
    const anonKey = localStorage.getItem('takeoffpro_recmem_anon_account_id')
    if (!anonKey) return { hasAccountEntry: false }
    const raw = localStorage.getItem(`takeoffpro_recmem_account_${anonKey}`)
    if (!raw) return { hasAccountEntry: false }
    const mem = JSON.parse(raw)
    return { hasAccountEntry: !!mem['BLK_OPAQUE'], accountEntry: mem['BLK_OPAQUE'] || null }
  })

  expect(accountState.hasAccountEntry).toBe(false)

  // ── Verify conflict record was stored ──
  const conflictState = await page.evaluate(() => {
    const raw = localStorage.getItem('takeoffpro_recmem_conflicts')
    if (!raw) return null
    const conflicts = JSON.parse(raw)
    return conflicts['BLK_OPAQUE'] || null
  })

  expect(conflictState).not.toBeNull()
  expect(conflictState.asmIds).toContain('ASM-001')
  expect(conflictState.asmIds).toContain('ASM-002')
  expect(conflictState.count).toBeGreaterThanOrEqual(1)

  await navigateBackToProjectsList(page)

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 3: Project C — block must NOT auto-resolve (no account memory)
  //         UnknownBlockPanel must still appear
  // ═══════════════════════════════════════════════════════════════════════════

  await openProjectPlan(page, 2)

  // ── CRITICAL SAFETY ASSERTION: UnknownBlockPanel APPEARS ──
  // Project C has no project memory, account memory has no BLK_OPAQUE (blocked),
  // so lookupMemory returns null → block remains unknown → panel renders.
  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  // ── User can still resolve manually in project C ──
  const selectC = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectC).toBeVisible({ timeout: 3_000 })

  // ── No crash ──
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
