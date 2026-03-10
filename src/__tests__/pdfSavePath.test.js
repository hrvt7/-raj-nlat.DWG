// ─── PDF Save Path — Regression Tests ───────────────────────────────────────
// Proves that the PDF save path reaches the same effective gating outcome
// as DXF when valid rows/pricing exist.
//
// Root cause: dxfAudit was computed for PDF (because parsedDxf was set to a
// synthetic truthy object { success: true, _noDxf: true }). computeDxfAudit
// returned PARSE_LIMITED for this empty object, and computeWorkflowStatus
// hit the PARSE_LIMITED check BEFORE the isPdf branch → stage 'parse_failed'
// → button disabled.
//
// Fix: added isPdf guard to dxfAudit memo (matching cableAudit pattern).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeWorkflowStatus,
  getSaveGating,
  getSaveLabel,
  getSaveColor,
} from '../utils/workflowStatus.js'
import { computeDxfAudit } from '../utils/dxfAudit.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate the synthetic parsedDxf that handleFile creates for PDF */
const PDF_SYNTHETIC_PARSED = { success: true, _noDxf: true }

/** Build workflow status the way TakeoffWorkspace computes it — BEFORE fix */
function computeWorkflowStatusWithDxfAudit({
  isPdf, takeoffRowCount, parsedDxf, reviewSummary, quoteReadiness, cableAudit,
}) {
  // Simulate the OLD (buggy) dxfAudit computation: no isPdf guard
  const dxfAudit = parsedDxf ? computeDxfAudit(parsedDxf, []) : null
  return computeWorkflowStatus({
    dxfAudit,
    reviewSummary: reviewSummary || null,
    quoteReadiness: quoteReadiness || null,
    cableAudit: cableAudit || null,
    takeoffRowCount,
    isPdf,
    hasFile: !!parsedDxf || isPdf,
  })
}

/** Build workflow status the way TakeoffWorkspace computes it — AFTER fix */
function computeWorkflowStatusFixed({
  isPdf, takeoffRowCount, parsedDxf, reviewSummary, quoteReadiness, cableAudit,
}) {
  // Simulate the FIXED dxfAudit computation: isPdf guard added
  const dxfAudit = (parsedDxf && !isPdf) ? computeDxfAudit(parsedDxf, []) : null
  return computeWorkflowStatus({
    dxfAudit,
    reviewSummary: reviewSummary || null,
    quoteReadiness: quoteReadiness || null,
    cableAudit: cableAudit || null,
    takeoffRowCount,
    isPdf,
    hasFile: !!parsedDxf || isPdf,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
describe('PDF save path — regression', () => {

  // ── The actual bug ──────────────────────────────────────────────────────
  describe('bug reproduction: dxfAudit poisons PDF workflow status', () => {
    it('OLD behavior: PDF with markers → PARSE_LIMITED → button disabled (BUG)', () => {
      // This is the bug: computeDxfAudit on synthetic parsedDxf returns PARSE_LIMITED
      const audit = computeDxfAudit(PDF_SYNTHETIC_PARSED, [])
      expect(audit.status).toBe('PARSE_LIMITED')

      // And this PARSE_LIMITED poisons the workflow status
      const ws = computeWorkflowStatusWithDxfAudit({
        isPdf: true,
        takeoffRowCount: 5,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      expect(ws.stage).toBe('parse_failed') // ← BUG: should be 'ready'
      expect(getSaveGating(ws).disabled).toBe(true) // ← BUG: button disabled
    })

    it('FIXED behavior: PDF with markers → ready → button enabled', () => {
      const ws = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 5,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      expect(ws.stage).toBe('ready')
      expect(getSaveGating(ws).disabled).toBe(false)
    })
  })

  // ── PDF path matches DXF outcome when both have valid rows ──────────────
  describe('PDF and DXF reach same gating outcome with valid rows', () => {
    it('PDF ready → same gating as DXF ready', () => {
      const pdfWs = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 5,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })

      const dxfWs = computeWorkflowStatus({
        dxfAudit: null,
        reviewSummary: {
          confirmed: 5, autoHigh: 0, autoLow: 0, unresolved: 0, excluded: 0, total: 5,
          confirmedQty: 10, autoHighQty: 0, autoLowQty: 0, unresolvedQty: 0,
        },
        quoteReadiness: { status: 'ready', reasons: [] },
        takeoffRowCount: 5,
        isPdf: false,
        hasFile: true,
      })

      expect(getSaveGating(pdfWs).disabled).toBe(false)
      expect(getSaveGating(dxfWs).disabled).toBe(false)
      // Both return green button
      expect(getSaveColor(pdfWs)).toBe('#00E5A0')
      expect(getSaveColor(dxfWs)).toBe('#00E5A0')
    })

    it('PDF with planId → correct label "Kalkuláció mentése"', () => {
      const ws = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 3,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      expect(getSaveLabel(ws, 'plan-123', false)).toBe('Kalkuláció mentése')
    })

    it('PDF without planId → correct label "Ajánlat létrehozása →"', () => {
      const ws = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 3,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      expect(getSaveLabel(ws, null, false)).toBe('Ajánlat létrehozása →')
    })
  })

  // ── PDF-specific guards still work correctly ────────────────────────────
  describe('PDF empty states still correctly gated', () => {
    it('PDF with 0 markers → button disabled (empty stage)', () => {
      const ws = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 0,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      expect(ws.stage).toBe('empty')
      expect(getSaveGating(ws).disabled).toBe(true)
    })

    it('PDF with no file → button disabled', () => {
      const ws = computeWorkflowStatus({
        isPdf: true,
        hasFile: false,
        takeoffRowCount: 0,
      })
      expect(ws.stage).toBe('empty')
      expect(getSaveGating(ws).disabled).toBe(true)
    })
  })

  // ── DXF behavior is unchanged ──────────────────────────────────────────
  describe('DXF save path is unchanged by fix', () => {
    it('DXF with GOOD_FOR_AUTO audit + ready review → button enabled', () => {
      const dxfAudit = computeDxfAudit(
        {
          success: true,
          summary: { total_block_types: 5, total_blocks: 20 },
          blocks: [
            { name: 'A', count: 5 }, { name: 'B', count: 5 },
            { name: 'C', count: 4 }, { name: 'D', count: 3 }, { name: 'E', count: 3 },
          ],
          lengths: [], inserts: [], layers: [], units: {},
        },
        [
          { blockName: 'A', qty: 5, asmId: 'ASM-001', confidence: 0.9 },
          { blockName: 'B', qty: 5, asmId: 'ASM-002', confidence: 0.85 },
          { blockName: 'C', qty: 4, asmId: 'ASM-003', confidence: 0.9 },
          { blockName: 'D', qty: 3, asmId: 'ASM-004', confidence: 0.8 },
        ],
      )

      const ws = computeWorkflowStatus({
        dxfAudit,
        reviewSummary: {
          confirmed: 4, autoHigh: 0, autoLow: 0, unresolved: 0, excluded: 0, total: 4,
          confirmedQty: 17, autoHighQty: 0, autoLowQty: 0, unresolvedQty: 0,
        },
        quoteReadiness: { status: 'ready', reasons: [] },
        takeoffRowCount: 4,
        isPdf: false,
        hasFile: true,
      })

      expect(ws.stage).toBe('ready')
      expect(getSaveGating(ws).disabled).toBe(false)
      expect(getSaveColor(ws)).toBe('#00E5A0')
    })

    it('DXF with PARSE_LIMITED → still correctly disabled', () => {
      const dxfAudit = computeDxfAudit({ success: false }, [])
      expect(dxfAudit.status).toBe('PARSE_LIMITED')

      const ws = computeWorkflowStatus({
        dxfAudit,
        takeoffRowCount: 0,
        isPdf: false,
        hasFile: true,
      })

      expect(ws.stage).toBe('parse_failed')
      expect(getSaveGating(ws).disabled).toBe(true)
    })

    it('DXF with unresolved blocks → correctly disabled', () => {
      const ws = computeWorkflowStatus({
        dxfAudit: {
          status: 'PARTIAL_AUTO', missing: [], stats: {},
          scores: { blocks: 0.5, recognition: 0.3, geometry: 0.5, cable: 0, units: 1 },
        },
        reviewSummary: {
          confirmed: 2, autoHigh: 1, autoLow: 0, unresolved: 3, excluded: 0, total: 6,
          confirmedQty: 4, autoHighQty: 2, autoLowQty: 0, unresolvedQty: 6,
        },
        quoteReadiness: { status: 'review_required', reasons: ['3 blokk'] },
        takeoffRowCount: 3,
        isPdf: false,
        hasFile: true,
      })

      expect(ws.stage).toBe('unresolved_blocks')
      expect(getSaveGating(ws).disabled).toBe(true)
    })
  })

  // ── Visible error feedback still works ──────────────────────────────────
  describe('error feedback coverage', () => {
    it('handleSave guard: no rows → would set saveError (PDF empty)', () => {
      // This tests the logical state, not the component directly
      const ws = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 0,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      // When no rows, the button is disabled at workflow level
      expect(getSaveGating(ws).disabled).toBe(true)
      // AND even if the handler runs, guard 1 (!takeoffRows.length) catches it
    })

    it('handleSave guard: pricing null → saveError visible on calc tab', () => {
      // When rows exist but pricing hasn't computed yet, the button is enabled
      // but handleSave guard 2 (!pricing) fires. The error is now visible
      // on the calc tab (from previous hotfix commit 3e41871)
      const ws = computeWorkflowStatusFixed({
        isPdf: true,
        takeoffRowCount: 3,
        parsedDxf: PDF_SYNTHETIC_PARSED,
      })
      expect(getSaveGating(ws).disabled).toBe(false)
      // The button is enabled, clicking it with null pricing → setSaveError fires
      // saveError is visible on calc tab ← verified by saveButtonCalcTab.test.js
    })
  })
})
