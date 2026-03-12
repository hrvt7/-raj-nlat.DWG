// ─── Exploded DXF Recovery Tests ────────────────────────────────────────────
// Tests that EXPLODED_RISK DXF files produce an actionable recovery path
// (switch_to_pdf CTA) instead of the previous dead-end reexport CTA.
//
// Covers:
//   1. Workflow status for EXPLODED_RISK: stage, CTA, statusLine, reasons
//   2. Non-exploded cases are NOT affected
//   3. Save gating preserved for exploded case
//   4. DXF audit classification for exploded detection
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { computeDxfAudit, DXF_STATUS } from '../utils/dxfAudit.js'
import { computeWorkflowStatus, getSaveGating } from '../utils/workflowStatus.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDxfAudit(overrides = {}) {
  return {
    status: 'GOOD_FOR_AUTO',
    statusMeta: { label: 'Automatikus felmérés', emoji: '✅', color: '#06D6A0' },
    scores: { blocks: 1, recognition: 0.9, geometry: 0.75, cable: 0.6, units: 1 },
    worked: ['10 blokkfajta felismerve'],
    missing: [],
    guidance: [],
    cableMode: 'geometry',
    cableModeMeta: { label: 'Mért kábelvonalak', confidence: 'magas' },
    stats: { totalBlocks: 50, totalBlockTypes: 10, totalLayers: 20, recognizedPct: 90, highConfPct: 85 },
    ...overrides,
  }
}

function makeReviewSummary(overrides = {}) {
  return {
    confirmed: 0, autoHigh: 0, autoLow: 0, unresolved: 0, excluded: 0, total: 0,
    confirmedQty: 0, autoHighQty: 0, autoLowQty: 0, unresolvedQty: 0, excludedQty: 0, totalQty: 0,
    ...overrides,
  }
}

function makeExplodedDxf() {
  return {
    success: true,
    blocks: [],
    lengths: [{ layer: 'Layer0', length: 500, length_raw: 500000, info: null }],
    inserts: [],
    layers: ['Layer0', 'Layer1'],
    units: { insunits: 0, name: 'mm (guessed)', factor: 0.001, auto_detected: true },
    lineGeom: Array.from({ length: 200 }, (_, i) => ({
      layer: 'Layer0', x1: i, y1: 0, x2: i + 1, y2: 1,
    })),
    polylineGeom: [],
    geomBounds: { minX: 0, maxX: 200, minY: 0, maxY: 1, width: 200, height: 1 },
    summary: { total_block_types: 0, total_blocks: 0, total_layers: 2, layers_with_lines: 1, total_inserts: 0 },
    _source: 'browser',
  }
}

// ─── EXPLODED_RISK → switch_to_pdf CTA ──────────────────────────────────────

describe('Exploded DXF recovery — workflow status', () => {
  it('EXPLODED_RISK produces switch_to_pdf CTA', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({
        status: 'EXPLODED_RISK',
        missing: ['Nem találtunk elnevezett blokkokat', 'A rajz valószínűleg robbantva lett exportálva'],
      }),
      takeoffRowCount: 0,
    })
    expect(result.stage).toBe('parse_failed')
    expect(result.cta.action).toBe('switch_to_pdf')
    expect(result.cta.label).toContain('PDF')
  })

  it('EXPLODED_RISK statusLine recommends PDF switch', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: [] }),
      takeoffRowCount: 0,
    })
    expect(result.statusLine).toContain('PDF')
    expect(result.statusLine).toContain('Robbantott')
  })

  it('EXPLODED_RISK reasons explain block-based takeoff is not possible', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({
        status: 'EXPLODED_RISK',
        missing: ['Nem találtunk elnevezett blokkokat'],
      }),
      takeoffRowCount: 0,
    })
    const reasons = result.detail.reasons
    // Should contain the original missing reason
    expect(reasons.some(r => r.includes('blokk'))).toBe(true)
    // Should contain the "block-based takeoff not possible" enrichment
    expect(reasons.some(r => r.includes('Blokk-alapú felmérés nem lehetséges'))).toBe(true)
    // Should contain the re-export alternative hint
    expect(reasons.some(r => r.includes('NE robbantva'))).toBe(true)
  })

  it('EXPLODED_RISK has red statusColor', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: [] }),
      takeoffRowCount: 0,
    })
    expect(result.statusColor).toBe('red')
  })

  it('EXPLODED_RISK has error badge on takeoff tab', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: [] }),
      takeoffRowCount: 0,
    })
    expect(result.badges.takeoff).toBe('error')
  })

  it('EXPLODED_RISK passes stats through detail', () => {
    const stats = { totalBlocks: 0, totalBlockTypes: 0, totalLayers: 2 }
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: [], stats }),
      takeoffRowCount: 0,
    })
    expect(result.detail.stats).toEqual(stats)
  })
})

// ─── Non-exploded cases are NOT affected ────────────────────────────────────

describe('Exploded DXF recovery — non-exploded cases unchanged', () => {
  it('PARSE_LIMITED still gets retry CTA', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'PARSE_LIMITED', missing: ['DXF beolvasás sikertelen'] }),
    })
    expect(result.stage).toBe('parse_failed')
    expect(result.cta.action).toBe('retry')
  })

  it('no recognition + no blocks + not exploded gets retry CTA', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'GOOD_FOR_AUTO', missing: [] }),
      takeoffRowCount: 0,
    })
    expect(result.stage).toBe('parse_failed')
    expect(result.cta.action).toBe('retry')
  })

  it('EXPLODED_RISK with rows falls through to normal flow', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK' }),
      reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
      quoteReadiness: { status: 'ready', reasons: [] },
      takeoffRowCount: 5,
    })
    expect(result.stage).toBe('ready')
  })

  it('MANUAL_HEAVY still gets review_blocks CTA (not switch_to_pdf)', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'MANUAL_HEAVY' }),
      reviewSummary: makeReviewSummary({
        unresolved: 10, unresolvedQty: 30, total: 12,
      }),
      quoteReadiness: { status: 'review_required', reasons: ['10 blokk'] },
      takeoffRowCount: 2,
    })
    expect(result.stage).toBe('unresolved_blocks')
    expect(result.cta.action).toBe('review_blocks')
  })
})

// ─── Save gating preserved ──────────────────────────────────────────────────

describe('Exploded DXF recovery — save gating', () => {
  it('save is disabled for EXPLODED_RISK (parse_failed stage)', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: [] }),
      takeoffRowCount: 0,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(true)
  })
})

// ─── DXF audit classification ───────────────────────────────────────────────

describe('Exploded DXF recovery — audit classification', () => {
  it('classifies exploded DXF as EXPLODED_RISK', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    expect(audit.status).toBe(DXF_STATUS.EXPLODED_RISK)
  })

  it('EXPLODED_RISK audit guidance includes manual_count action', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    expect(audit.guidance.some(g => g.action === 'manual_count')).toBe(true)
  })

  it('EXPLODED_RISK audit guidance includes reexport action', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    expect(audit.guidance.some(g => g.action === 'reexport')).toBe(true)
  })

  it('EXPLODED_RISK audit manual_count guidance mentions PDF', () => {
    const audit = computeDxfAudit(makeExplodedDxf(), [])
    const manualCount = audit.guidance.find(g => g.action === 'manual_count')
    expect(manualCount).toBeDefined()
    expect(manualCount.description).toContain('PDF')
  })
})
