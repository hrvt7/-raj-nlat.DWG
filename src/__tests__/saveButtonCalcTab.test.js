// ─── Save Button (Calc Tab) — Regression Tests ──────────────────────────────
// Covers the hotfix for the dead "Kalkuláció mentése" button:
//   1. Save error is visible on the calc tab (not just context tab)
//   2. Save button has type="button" (defensive: prevent form submit default)
//   3. handleSave clears previous error before new attempt
//   4. getSaveGating returns enabled for PDF ready state
//   5. getSaveLabel returns correct label based on planId
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  computeWorkflowStatus,
  getSaveGating,
  getSaveLabel,
  getSaveColor,
} from '../utils/workflowStatus.js'

const workspaceSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/TakeoffWorkspace.jsx'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('Save button — calc tab visibility', () => {
  it('saveError is rendered inside the calc tab (not only context tab)', () => {
    // The saveError display must appear after the save button, inside
    // the calc tab section. We look for the pattern within the calc tab block.
    const calcTabStart = workspaceSrc.indexOf("rightTab === 'calc'")
    const calcTabEnd = workspaceSrc.indexOf("CONTEXT TAB", calcTabStart)
    expect(calcTabStart).toBeGreaterThan(-1)
    expect(calcTabEnd).toBeGreaterThan(calcTabStart)

    const calcTabSection = workspaceSrc.slice(calcTabStart, calcTabEnd)
    // Must contain saveError display
    expect(calcTabSection).toContain('{saveError && (')
    expect(calcTabSection).toContain('{saveError}')
  })

  it('save button has type="button" attribute', () => {
    // Find the save button (the one with onClick={handleSave})
    const saveButtonIdx = workspaceSrc.indexOf('onClick={handleSave}')
    expect(saveButtonIdx).toBeGreaterThan(-1)

    // The type="button" should appear on the same <button> element
    // Look backwards from onClick to find the <button tag
    const buttonTagStart = workspaceSrc.lastIndexOf('<button', saveButtonIdx)
    expect(buttonTagStart).toBeGreaterThan(-1)

    const buttonTag = workspaceSrc.slice(buttonTagStart, saveButtonIdx + 30)
    expect(buttonTag).toContain('type="button"')
  })

  it('handleSave clears saveError at the top before early return checks', () => {
    // The handler must call setSaveError(null) before the takeoffRows check
    const handleSaveIdx = workspaceSrc.indexOf('const handleSave = async')
    expect(handleSaveIdx).toBeGreaterThan(-1)

    const clearErrorIdx = workspaceSrc.indexOf('setSaveError(null)', handleSaveIdx)
    const takeoffCheckIdx = workspaceSrc.indexOf("!takeoffRows.length", handleSaveIdx)
    expect(clearErrorIdx).toBeGreaterThan(handleSaveIdx)
    expect(takeoffCheckIdx).toBeGreaterThan(clearErrorIdx)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Save button — state logic (PDF ready scenario)', () => {
  it('PDF with rows → stage ready, save enabled', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      isPdf: true,
      takeoffRowCount: 1,
    })
    expect(ws.stage).toBe('ready')

    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(false)
    expect(gating.reason).toBeNull()
  })

  it('PDF with rows and planId → label is "Kalkuláció mentése"', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      isPdf: true,
      takeoffRowCount: 1,
    })
    const label = getSaveLabel(ws, 'plan-123', false)
    expect(label).toBe('Kalkuláció mentése')
  })

  it('PDF with rows → save button color is accent green', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      isPdf: true,
      takeoffRowCount: 1,
    })
    const color = getSaveColor(ws)
    expect(color).toBe('#00E5A0')
  })

  it('PDF with no rows → stage empty, save gated', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      isPdf: true,
      takeoffRowCount: 0,
    })
    expect(ws.stage).toBe('empty')

    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Save button — handler wiring', () => {
  it('save button onClick is bound to handleSave', () => {
    // Inside the calc tab, the button must reference handleSave
    const calcTabStart = workspaceSrc.indexOf("rightTab === 'calc'")
    const calcTabEnd = workspaceSrc.indexOf("CONTEXT TAB", calcTabStart)
    const calcSection = workspaceSrc.slice(calcTabStart, calcTabEnd)

    expect(calcSection).toContain('onClick={handleSave}')
  })

  it('save button disabled state uses saving and saveGating.disabled', () => {
    const calcTabStart = workspaceSrc.indexOf("rightTab === 'calc'")
    const calcTabEnd = workspaceSrc.indexOf("CONTEXT TAB", calcTabStart)
    const calcSection = workspaceSrc.slice(calcTabStart, calcTabEnd)

    expect(calcSection).toContain('disabled={saving || saveGating.disabled}')
  })

  it('handleSave sets saving=true after early return checks pass', () => {
    const handleSaveIdx = workspaceSrc.indexOf('const handleSave = async')
    const pricingCheckIdx = workspaceSrc.indexOf("!pricing", handleSaveIdx)
    const setSavingIdx = workspaceSrc.indexOf('setSaving(true)', handleSaveIdx)

    // setSaving(true) comes after the pricing check
    expect(setSavingIdx).toBeGreaterThan(pricingCheckIdx)
  })

  it('handleSave has try/catch/finally with setSaving(false)', () => {
    const handleSaveIdx = workspaceSrc.indexOf('const handleSave = async')
    const nextFnIdx = workspaceSrc.indexOf('\n  const ', handleSaveIdx + 30)
    const handlerBody = workspaceSrc.slice(handleSaveIdx, nextFnIdx)

    expect(handlerBody).toContain('try {')
    expect(handlerBody).toContain('catch (err)')
    expect(handlerBody).toContain('finally {')
    expect(handlerBody).toContain('setSaving(false)')
  })
})
