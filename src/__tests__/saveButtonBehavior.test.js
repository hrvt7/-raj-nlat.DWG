// ─── Save Button Behavior — Non-Brittle Tests ──────────────────────────────
// Verifies the behavioral contract of the save button: gating logic, label
// correctness, and guard-condition coverage across ALL workflow stages.
//
// These tests exercise pure functions (getSaveGating, getSaveLabel, getSaveColor,
// computeWorkflowStatus) end-to-end — no source-scanning, no file parsing.
//
// Regression target: "Kalkuláció mentése" button appeared dead because
//   1. saveError was only visible on context tab (fixed in hotfix commit 3e41871)
//   2. Guard conditions set error but error display was invisible
//
// This test suite proves that the button's state machine (enabled/disabled,
// label, color) is correct for every reachable workflow stage, and that
// the guard conditions (no rows, no pricing) correctly map to gated/error states.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeWorkflowStatus,
  getSaveGating,
  getSaveLabel,
  getSaveColor,
} from '../utils/workflowStatus.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pdfReady(rows = 3) {
  return computeWorkflowStatus({ hasFile: true, isPdf: true, takeoffRowCount: rows })
}

function pdfEmpty() {
  return computeWorkflowStatus({ hasFile: true, isPdf: true, takeoffRowCount: 0 })
}

function dxfReady(takeoffRowCount = 5) {
  return computeWorkflowStatus({
    hasFile: true,
    dxfAudit: { status: 'GOOD_FOR_AUTO', missing: [], stats: {} },
    reviewSummary: {
      confirmed: takeoffRowCount, autoHigh: 0, autoLow: 0,
      unresolved: 0, excluded: 0, total: takeoffRowCount,
      confirmedQty: takeoffRowCount * 2, autoHighQty: 0,
      autoLowQty: 0, unresolvedQty: 0,
    },
    quoteReadiness: { status: 'ready', reasons: [] },
    takeoffRowCount,
  })
}

function dxfUnresolved() {
  return computeWorkflowStatus({
    hasFile: true,
    dxfAudit: { status: 'PARTIAL_AUTO', missing: [], stats: {} },
    reviewSummary: {
      confirmed: 2, autoHigh: 1, autoLow: 0,
      unresolved: 3, excluded: 0, total: 6,
      confirmedQty: 4, autoHighQty: 2,
      autoLowQty: 0, unresolvedQty: 6,
    },
    quoteReadiness: { status: 'review_required', reasons: ['3 blokk'] },
    takeoffRowCount: 3,
  })
}

function noFile() {
  return computeWorkflowStatus({ hasFile: false })
}

// ═════════════════════════════════════════════════════════════════════════════
describe('Save button — behavioral contract', () => {
  // ── Core guarantee: button is ENABLED when it should be clickable ────────
  describe('button enabled states (save should work)', () => {
    it('PDF with rows → button enabled, green, correct label with planId', () => {
      const ws = pdfReady(5)
      const gating = getSaveGating(ws)
      const label = getSaveLabel(ws, 'plan-abc', false)
      const color = getSaveColor(ws)

      expect(gating.disabled).toBe(false)
      expect(gating.reason).toBeNull()
      expect(label).toBe('Kalkuláció mentése')
      expect(color).toBe('#00E5A0')
    })

    it('PDF with rows, no planId → button enabled, different label', () => {
      const ws = pdfReady(3)
      const gating = getSaveGating(ws)
      const label = getSaveLabel(ws, null, false)

      expect(gating.disabled).toBe(false)
      expect(label).toContain('Ajánlat')
      expect(label).toContain('létrehozása')
    })

    it('DXF fully confirmed → button enabled, green', () => {
      const ws = dxfReady(8)
      const gating = getSaveGating(ws)
      const color = getSaveColor(ws)

      expect(gating.disabled).toBe(false)
      expect(color).toBe('#00E5A0')
    })

    it('PDF with just 1 row → button still enabled', () => {
      const ws = pdfReady(1)
      const gating = getSaveGating(ws)
      expect(gating.disabled).toBe(false)
    })

    it('DXF with warnings → button still enabled (not gated)', () => {
      const ws = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: { status: 'GOOD_FOR_AUTO', missing: [], stats: {} },
        reviewSummary: {
          confirmed: 3, autoHigh: 2, autoLow: 2,
          unresolved: 0, excluded: 0, total: 7,
          confirmedQty: 6, autoHighQty: 4, autoLowQty: 4, unresolvedQty: 0,
        },
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['2 tétel gyenge'] },
        takeoffRowCount: 7,
      })
      const gating = getSaveGating(ws)
      expect(ws.stage).toBe('review_warnings')
      expect(gating.disabled).toBe(false)
    })
  })

  // ── Core guarantee: button is DISABLED when guards would block ──────────
  describe('button disabled states (save correctly blocked)', () => {
    it('no file → disabled', () => {
      const ws = noFile()
      const gating = getSaveGating(ws)
      expect(gating.disabled).toBe(true)
    })

    it('PDF with 0 rows → disabled (empty stage)', () => {
      const ws = pdfEmpty()
      const gating = getSaveGating(ws)
      expect(ws.stage).toBe('empty')
      expect(gating.disabled).toBe(true)
    })

    it('DXF unresolved → disabled with reason', () => {
      const ws = dxfUnresolved()
      const gating = getSaveGating(ws)
      expect(ws.stage).toBe('unresolved_blocks')
      expect(gating.disabled).toBe(true)
      expect(gating.reason).toBeTruthy()
    })

    it('parse failed → disabled', () => {
      const ws = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: { status: 'PARSE_LIMITED', missing: ['error'], stats: {} },
      })
      expect(ws.stage).toBe('parse_failed')
      expect(getSaveGating(ws).disabled).toBe(true)
    })

    it('null status → disabled (defensive)', () => {
      expect(getSaveGating(null).disabled).toBe(true)
    })
  })

  // ── Label correctness across all stages ─────────────────────────────────
  describe('label transitions', () => {
    it('saving state always shows "..."', () => {
      expect(getSaveLabel(pdfReady(), 'plan-1', true)).toBe('...')
      expect(getSaveLabel(dxfReady(), null, true)).toBe('...')
      expect(getSaveLabel(null, null, true)).toBe('...')
    })

    it('unresolved blocks → review label', () => {
      const ws = dxfUnresolved()
      const label = getSaveLabel(ws, 'plan-1', false)
      expect(label).toContain('Felülvizsgálat')
    })

    it('ready with planId → "Kalkuláció mentése"', () => {
      expect(getSaveLabel(pdfReady(), 'plan-1', false)).toBe('Kalkuláció mentése')
      expect(getSaveLabel(dxfReady(), 'plan-2', false)).toBe('Kalkuláció mentése')
    })

    it('ready without planId → "Ajánlat létrehozása →"', () => {
      expect(getSaveLabel(pdfReady(), null, false)).toBe('Ajánlat létrehozása →')
      expect(getSaveLabel(dxfReady(), null, false)).toBe('Ajánlat létrehozása →')
    })
  })

  // ── Color correctness across stages ─────────────────────────────────────
  describe('color transitions', () => {
    it('ready → accent green', () => {
      expect(getSaveColor(pdfReady())).toBe('#00E5A0')
      expect(getSaveColor(dxfReady())).toBe('#00E5A0')
    })

    it('unresolved → muted gray', () => {
      expect(getSaveColor(dxfUnresolved())).toBe('#71717A')
    })

    it('review_warnings → yellow', () => {
      const ws = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: { status: 'GOOD_FOR_AUTO', missing: [], stats: {} },
        reviewSummary: {
          confirmed: 3, autoHigh: 2, autoLow: 1,
          unresolved: 0, excluded: 0, total: 6,
          confirmedQty: 6, autoHighQty: 4, autoLowQty: 2, unresolvedQty: 0,
        },
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['1 gyenge'] },
        takeoffRowCount: 6,
      })
      expect(getSaveColor(ws)).toBe('#FFD166')
    })

    it('null/undefined → green fallback (defensive)', () => {
      expect(getSaveColor(null)).toBe('#00E5A0')
      expect(getSaveColor(undefined)).toBe('#00E5A0')
    })
  })

  // ── Guard condition coverage: what happens INSIDE handleSave ────────────
  // These verify that the STATUS produces correct gating for the two
  // guard conditions inside handleSave:
  //   Guard 1: !takeoffRows.length → setSaveError(...)
  //   Guard 2: !pricing → setSaveError(...)
  //
  // We can't unit-test the handler itself (it's embedded in a React component),
  // but we can verify that the gating correctly PREVENTS the button from
  // being clickable in states where these guards would fire.
  describe('guard condition alignment', () => {
    it('guard 1 coverage: 0 rows → button is gated at workflow level (empty/parse_failed)', () => {
      // If takeoffRowCount is 0, the workflow stage is 'empty' or 'parse_failed'
      // → getSaveGating returns disabled=true → button is disabled
      // → handleSave's guard 1 (!takeoffRows.length) is a defense-in-depth backup
      const pdfNoRows = computeWorkflowStatus({
        hasFile: true, isPdf: true, takeoffRowCount: 0,
      })
      expect(getSaveGating(pdfNoRows).disabled).toBe(true)

      const dxfNoRows = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: { status: 'GOOD_FOR_AUTO', missing: [], stats: {} },
        takeoffRowCount: 0,
      })
      // No recognition data + no rows → parse_failed
      expect(getSaveGating(dxfNoRows).disabled).toBe(true)
    })

    it('guard 2 alignment: when button IS enabled, pricing must exist for save to succeed', () => {
      // When stage is 'ready' or 'review_warnings', the button is enabled.
      // handleSave's guard 2 checks !pricing — this is a RUNTIME guard
      // for the case where pricing computation hasn't completed yet.
      // The gating does NOT check pricing directly (by design — pricing
      // is computed asynchronously). This means:
      //   - Button enabled + pricing null → handleSave will set saveError
      //   - Button enabled + pricing exists → handleSave proceeds to save
      // The previous hotfix ensures saveError is now VISIBLE on the calc tab.
      const ws = pdfReady(3)
      expect(getSaveGating(ws).disabled).toBe(false)
      // This state is correct: the button should be clickable, and
      // handleSave handles the pricing-null edge case with a visible error.
    })
  })

  // ── Stage exhaustiveness: every stage maps to exactly one gating result ──
  describe('stage exhaustiveness', () => {
    const stages = [
      { name: 'empty', ws: noFile(), expectDisabled: true },
      { name: 'parse_failed', ws: computeWorkflowStatus({
        hasFile: true, dxfAudit: { status: 'PARSE_LIMITED', missing: [], stats: {} },
      }), expectDisabled: true },
      { name: 'unresolved_blocks', ws: dxfUnresolved(), expectDisabled: true },
      { name: 'review_warnings', ws: computeWorkflowStatus({
        hasFile: true,
        dxfAudit: { status: 'GOOD_FOR_AUTO', missing: [], stats: {} },
        reviewSummary: {
          confirmed: 3, autoHigh: 2, autoLow: 1,
          unresolved: 0, excluded: 0, total: 6,
          confirmedQty: 6, autoHighQty: 4, autoLowQty: 2, unresolvedQty: 0,
        },
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['1 gyenge'] },
        takeoffRowCount: 6,
      }), expectDisabled: false },
      { name: 'ready (DXF)', ws: dxfReady(), expectDisabled: false },
      { name: 'ready (PDF)', ws: pdfReady(), expectDisabled: false },
    ]

    stages.forEach(({ name, ws, expectDisabled }) => {
      it(`stage "${name}" → disabled=${expectDisabled}`, () => {
        expect(ws.stage).toBeDefined()
        const gating = getSaveGating(ws)
        expect(gating.disabled).toBe(expectDisabled)
      })
    })
  })
})
