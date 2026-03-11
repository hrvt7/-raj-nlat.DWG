// ─── Playwright Smoke Test — Account-Tier Recognition Memory Promotion ────────
// Protects: after the same unknown block is resolved the same way in 2 different
// projects, account memory is promoted — and a 3rd project auto-resolves it.
//
// Scenario:
//   Project A: BLK_OPAQUE_001 is unknown → user assigns ASM-001 → project A memory
//   Project B: BLK_OPAQUE_001 is unknown → user assigns ASM-001 → project B memory
//              → maybePromoteToAccount fires → 2 projects agree → account memory written
//   Project C: same block → account memory lookup → conf 0.90 → auto-resolved
//              → no UnknownBlockPanel → save enabled → no crash
//
// Memory tier: account (2+ projects agree → account-tier at 0.90)
// Threshold: 0.90 ≥ 0.80 → auto-match applied in recognition cascade

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── DXF fixture: 1 recognized block + 1 opaque block ────────────────────────
const DXF_FIXTURE = readFileSync(
  resolve(__dirname, 'fixtures', 'unknown-plan.dxf'),
  'utf-8',
)

const PROJECT_A_ID = 'E2E-PRJ-ACCT-A'
const PROJECT_B_ID = 'E2E-PRJ-ACCT-B'
const PROJECT_C_ID = 'E2E-PRJ-ACCT-C'
const PLAN_A_ID    = 'E2E-ACCT-PLN-A'
const PLAN_B_ID    = 'E2E-ACCT-PLN-B'
const PLAN_C_ID    = 'E2E-ACCT-PLN-C'

/**
 * Seed 3 projects, each with 1 plan using the same DXF.
 * Injects project + plan metadata into localStorage, DXF blobs into IndexedDB.
 */
async function seedThreeProjects(page, dxfText) {
  await page.addInitScript((args) => {
    const { projects, plans, dxfText } = args
    const wrap = (data) => JSON.stringify({ _v: 1, data })

    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify(projects))
    localStorage.setItem('takeoffpro_plans_meta', wrap(plans))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, {
    projects: [
      { id: PROJECT_A_ID, name: 'E2E – Project A (first encounter)', description: 'Account promotion test — project A', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: PROJECT_B_ID, name: 'E2E – Project B (second encounter)', description: 'Account promotion test — project B', createdAt: '2025-01-02T00:00:00.000Z' },
      { id: PROJECT_C_ID, name: 'E2E – Project C (account reuse)', description: 'Account promotion test — project C', createdAt: '2025-01-03T00:00:00.000Z' },
    ],
    plans: [
      { id: PLAN_A_ID, name: 'E2E – Plan A.dxf', fileType: 'dxf', fileSize: dxfText.length, units: 'mm', projectId: PROJECT_A_ID, createdAt: '2025-01-01T00:00:01.000Z', markerCount: 0 },
      { id: PLAN_B_ID, name: 'E2E – Plan B.dxf', fileType: 'dxf', fileSize: dxfText.length, units: 'mm', projectId: PROJECT_B_ID, createdAt: '2025-01-02T00:00:01.000Z', markerCount: 0 },
      { id: PLAN_C_ID, name: 'E2E – Plan C.dxf', fileType: 'dxf', fileSize: dxfText.length, units: 'mm', projectId: PROJECT_C_ID, createdAt: '2025-01-03T00:00:01.000Z', markerCount: 0 },
    ],
    dxfText: DXF_FIXTURE,
  })

  await page.goto('/#app')
  await page.waitForTimeout(500)

  // Inject DXF blobs for ALL 3 plans into IndexedDB
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
  const sidebar    = page.locator('[data-testid="sidebar-nav-projektek"]')
  const workspace  = page.locator('[data-testid="workspace-container"]')
  const projectCards = page.locator('[data-testid="project-card"]')
  const planCards    = page.locator('[data-testid="plan-card"]')

  // Navigate to projects list via sidebar
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  // Should see the projects list
  await expect(projectCards.first()).toBeVisible({ timeout: 5_000 })

  // Click the specific project card
  await projectCards.nth(projectIndex).click()

  // Now in project detail — plan cards visible
  await expect(planCards.first()).toBeVisible({ timeout: 5_000 })

  // Open the plan
  const openBtn = planCards.first().locator('button', { hasText: /Megnyitás|Szerkesztés/ })
  await expect(openBtn).toBeVisible()
  await openBtn.click()

  // Wait for workspace to load
  await expect(workspace).toBeVisible({ timeout: 15_000 })
}

/**
 * From workspace, navigate back to the top-level projects list.
 * Sidebar click → project detail → "Vissza a projektekhez" → projects list.
 */
async function navigateBackToProjectsList(page) {
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await sidebar.click()

  // We land on project detail view — click "Vissza a projektekhez"
  const backBtn = page.locator('button', { hasText: 'Vissza a projektekhez' })
  await expect(backBtn).toBeVisible({ timeout: 5_000 })
  await backBtn.click()

  // Verify we're back at the projects list
  const projectCards = page.locator('[data-testid="project-card"]')
  await expect(projectCards.first()).toBeVisible({ timeout: 5_000 })
}

// ─── Test 9: Account-tier promotion — 3 projects, cross-project reuse ────────
test('account-tier promotion: block resolved in 2 projects auto-resolves in 3rd project', async ({ page }) => {
  await seedThreeProjects(page, DXF_FIXTURE)

  const unknownPanel = page.locator('[data-testid="unknown-block-panel"]')

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 1: Project A — resolve the unknown block manually
  // ═══════════════════════════════════════════════════════════════════════════

  await openProjectPlan(page, 0)

  // Unknown panel should appear with BLK_OPAQUE_001
  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  // Resolve: assign ASM-001
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

  // ── Verify account memory NOT yet promoted (only 1 project so far) ──
  const acctBeforeB = await page.evaluate(() => {
    const anonKey = localStorage.getItem('takeoffpro_recmem_anon_account_id')
    if (!anonKey) return null
    const raw = localStorage.getItem(`takeoffpro_recmem_account_${anonKey}`)
    if (!raw) return null
    return JSON.parse(raw)
  })
  // Should be null or empty — no promotion with just 1 project
  const hasPromoBeforeB = acctBeforeB && acctBeforeB['BLK_OPAQUE']
  expect(hasPromoBeforeB).toBeFalsy()

  // Navigate back to projects list
  await navigateBackToProjectsList(page)

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 2: Project B — resolve the same block the same way → triggers promotion
  // ═══════════════════════════════════════════════════════════════════════════

  await openProjectPlan(page, 1)

  // Unknown panel should appear (Project B has no project memory yet)
  await expect(unknownPanel).toBeVisible({ timeout: 5_000 })
  await expect(unknownPanel).toContainText('BLK_OPAQUE_001')

  // Resolve: assign ASM-001 (same as project A)
  const selectB = page.locator('[data-testid="unknown-block-select"]').first()
  await expect(selectB).toBeVisible({ timeout: 3_000 })
  await selectB.selectOption({ value: 'ASM-001' })
  await expect(unknownPanel).toHaveCount(0, { timeout: 5_000 })

  // ── Verify project B memory written ──
  const memB = await page.evaluate((projectId) => {
    const raw = localStorage.getItem(`takeoffpro_recmem_proj_${projectId}`)
    if (!raw) return null
    const mem = JSON.parse(raw)
    return mem['BLK_OPAQUE'] || null
  }, PROJECT_B_ID)

  expect(memB).not.toBeNull()
  expect(memB.asmId).toBe('ASM-001')

  // ── CRITICAL: Verify account memory NOW promoted ──
  // maybePromoteToAccount should have fired when Project B recorded confirmation.
  // It scans all takeoffpro_recmem_proj_* keys, finds 2 projects agreeing on
  // BLK_OPAQUE → ASM-001, and writes to takeoffpro_recmem_account_{anonId}.
  const accountPromotion = await page.evaluate(() => {
    const anonKey = localStorage.getItem('takeoffpro_recmem_anon_account_id')
    if (!anonKey) return { error: 'no anon account id' }
    const raw = localStorage.getItem(`takeoffpro_recmem_account_${anonKey}`)
    if (!raw) return { error: 'no account memory' }
    const mem = JSON.parse(raw)
    return mem['BLK_OPAQUE'] || { error: 'no BLK_OPAQUE entry' }
  })

  expect(accountPromotion).not.toBeNull()
  expect(accountPromotion.error).toBeUndefined()
  expect(accountPromotion.asmId).toBe('ASM-001')
  expect(accountPromotion.source).toBe('promotion')
  expect(accountPromotion.projectIds).toContain(PROJECT_A_ID)
  expect(accountPromotion.projectIds).toContain(PROJECT_B_ID)

  // Navigate back to projects list
  await navigateBackToProjectsList(page)

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS 3: Project C — account memory should auto-resolve the block
  // ═══════════════════════════════════════════════════════════════════════════

  await openProjectPlan(page, 2)

  // ── CRITICAL ASSERTION: UnknownBlockPanel does NOT appear ──
  // BLK_OPAQUE_001 should be auto-resolved via account-tier memory (0.90 confidence)
  // Project C has no project memory, but account memory has BLK_OPAQUE → ASM-001
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
  await expect(page.locator('[data-testid="sidebar-nav-projektek"]')).toBeVisible()
})
