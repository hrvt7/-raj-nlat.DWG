// ─── Playwright Runtime Smoke — Split Layout + Mobile Shell ─────────────────
// Package #11 verification: useTakeoffSplitLayout extraction did not break
// desktop split, divider drag, mobile toggle, or breakpoint crossing.

import { test, expect } from '@playwright/test'
import { resolve } from 'path'

const DXF_FIXTURE_PATH = resolve(import.meta.dirname, 'fixtures', 'smoke-plan.dxf')
const PROJECT_ID = 'E2E-SPLIT-PRJ-001'

async function seedAndOpenWorkspace(page) {
  // Clear localStorage to avoid cross-test pollution
  await page.addInitScript((args) => {
    const { projectId } = args
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      { id: projectId, name: 'E2E – Split layout smoke', description: '', createdAt: new Date().toISOString() },
    ]))
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })

  await page.goto('/#app')
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click({ force: true })

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  // Upload DXF
  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })

  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })
  return workspace
}

// ─── Flow 1: Desktop load — split layout renders correctly ──────────────────
test('desktop: split layout renders with divider visible', async ({ page }) => {
  const workspace = await seedAndOpenWorkspace(page)

  // Divider should be visible (title attribute)
  const divider = page.locator('[title="Húzd a panel átméretezéséhez"]')
  await expect(divider).toBeVisible({ timeout: 5_000 })

  // Divider should have col-resize cursor
  const cursor = await divider.evaluate(el => getComputedStyle(el).cursor)
  expect(cursor).toBe('col-resize')

  // Two main panels should exist in the flex container
  const flexContainer = workspace.locator('> div').nth(1)
  await expect(flexContainer).toBeVisible()
})

// ─── Flow 2+3: Divider drag and body cleanup ───────────────────────────────
test('desktop: divider drag resizes panels and cleans up body styles', async ({ page }) => {
  await seedAndOpenWorkspace(page)

  const divider = page.locator('[title="Húzd a panel átméretezéséhez"]')
  await expect(divider).toBeVisible({ timeout: 5_000 })

  // Left panel: preceding sibling of divider
  const leftPanel = divider.locator('xpath=preceding-sibling::div[1]')
  const initialWidth = await leftPanel.evaluate(el => el.offsetWidth)
  expect(initialWidth).toBeGreaterThan(100)

  const dividerBox = await divider.boundingBox()
  const startX = dividerBox.x + dividerBox.width / 2
  const startY = dividerBox.y + dividerBox.height / 2

  // Start drag
  await page.mouse.move(startX, startY)
  await page.mouse.down()

  // Verify body styles during drag
  const cursorDuringDrag = await page.evaluate(() => document.body.style.cursor)
  expect(cursorDuringDrag).toBe('col-resize')
  const userSelectDuringDrag = await page.evaluate(() => document.body.style.userSelect)
  expect(userSelectDuringDrag).toBe('none')

  // Drag right → panel should grow
  await page.mouse.move(startX + 100, startY)
  const widthAfterDragRight = await leftPanel.evaluate(el => el.offsetWidth)
  expect(widthAfterDragRight).toBeGreaterThan(initialWidth)

  // Drag left → panel should shrink
  await page.mouse.move(startX - 100, startY)
  const widthAfterDragLeft = await leftPanel.evaluate(el => el.offsetWidth)
  expect(widthAfterDragLeft).toBeLessThan(initialWidth)

  // Release
  await page.mouse.up()

  // Body styles cleaned up
  const cursorAfterUp = await page.evaluate(() => document.body.style.cursor)
  expect(cursorAfterUp).toBe('')
  const userSelectAfterUp = await page.evaluate(() => document.body.style.userSelect)
  expect(userSelectAfterUp).toBe('')

  // Clamp test: drag all the way left
  const dividerBox2 = await divider.boundingBox()
  await page.mouse.move(dividerBox2.x + 2, startY)
  await page.mouse.down()
  await page.mouse.move(0, startY)
  await page.mouse.up()

  const containerWidth = await leftPanel.evaluate(el => el.parentElement.offsetWidth)
  const clampedWidth = await leftPanel.evaluate(el => el.offsetWidth)
  const ratio = (clampedWidth / containerWidth) * 100
  expect(ratio).toBeGreaterThanOrEqual(24) // 25% min with rounding tolerance
})

// ─── Flow 4: Mobile viewport — divider hidden, no crash ────────────────────
test('mobile: isMobile activates and divider is hidden', async ({ page }) => {
  // Set mobile viewport BEFORE navigation
  await page.setViewportSize({ width: 375, height: 812 })

  // Seed + navigate (use force clicks for mobile-invisible sidebar)
  await page.addInitScript((args) => {
    const { projectId } = args
    localStorage.clear()
    const wrap = (data) => JSON.stringify({ _v: 1, data })
    localStorage.setItem('takeoffpro_projects_meta', JSON.stringify([
      { id: projectId, name: 'E2E – Split layout smoke', description: '', createdAt: new Date().toISOString() },
    ]))
    localStorage.setItem('takeoffpro_plans_meta', wrap([]))
    localStorage.setItem('takeoffpro_quotes', wrap([]))
  }, { projectId: PROJECT_ID })

  // On mobile viewport, navigate to project via hash and upload at desktop width,
  // then shrink to mobile to test the workspace layout
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/#app')
  const sidebar = page.locator('[data-testid="sidebar-nav-projektek"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
  await sidebar.click()

  const projectCard = page.locator('[data-testid="project-card"]').first()
  await expect(projectCard).toBeVisible({ timeout: 5_000 })
  await projectCard.click()

  const fileInput = page.locator('[data-testid="plan-upload-input"]')
  await fileInput.setInputFiles(DXF_FIXTURE_PATH)

  const planCard = page.locator('[data-testid="plan-card"]').first()
  await expect(planCard).toBeVisible({ timeout: 10_000 })
  const openBtn = planCard.locator('button', { hasText: /Megnyitás|Szerkesztés|Munkaterület/ })
  await expect(openBtn).toBeVisible({ timeout: 5_000 })
  await openBtn.click()

  const workspace = page.locator('[data-testid="workspace-container"]')
  await expect(workspace).toBeVisible({ timeout: 15_000 })

  // Now shrink to mobile
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(300)

  // Divider should NOT be visible on mobile
  const divider = page.locator('[title="Húzd a panel átméretezéséhez"]')
  await expect(divider).toBeHidden()

  // Workspace functional, no crash
  await expect(workspace).toContainText('smoke-plan.dxf')
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})

// ─── Flow 5: Breakpoint crossing — desktop to mobile and back ──────────────
test('breakpoint crossing: desktop→mobile→desktop preserves layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const workspace = await seedAndOpenWorkspace(page)

  const divider = page.locator('[title="Húzd a panel átméretezéséhez"]')
  await expect(divider).toBeVisible({ timeout: 5_000 })

  // Shrink to mobile
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(300)
  await expect(divider).toBeHidden({ timeout: 3_000 })

  // Back to desktop
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(300)
  await expect(divider).toBeVisible({ timeout: 3_000 })

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
  await expect(workspace).toBeVisible()
})

// ─── Flow 6: Unmount after drag — no lingering listeners ────────────────────
test('unmount after drag: body styles cleaned after leaving workspace', async ({ page }) => {
  await seedAndOpenWorkspace(page)

  const divider = page.locator('[title="Húzd a panel átméretezéséhez"]')
  await expect(divider).toBeVisible({ timeout: 5_000 })

  // Do a drag
  const dividerBox = await divider.boundingBox()
  await page.mouse.move(dividerBox.x + 2, dividerBox.y + 50)
  await page.mouse.down()
  await page.mouse.move(dividerBox.x + 50, dividerBox.y + 50)
  await page.mouse.up()

  // Body should be clean after drag release
  const cursorAfterDrag = await page.evaluate(() => document.body.style.cursor)
  expect(cursorAfterDrag).toBe('')

  // Navigate away by going to a different hash route
  await page.goto('/#projects')
  await page.waitForTimeout(500)

  // Do mouse interactions on the new page — should not trigger resize behavior
  await page.mouse.move(500, 400)
  await page.mouse.down()
  await page.mouse.move(600, 400)
  await page.mouse.up()

  // Body cursor still clean
  const cursorAfterNav = await page.evaluate(() => document.body.style.cursor)
  expect(cursorAfterNav).toBe('')

  // No crash
  await expect(page.locator('text=összeomlott')).toHaveCount(0)
})
