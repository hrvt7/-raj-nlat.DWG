// ─── Workflow Status Tests ───────────────────────────────────────────────────
// Tests for computeWorkflowStatus, getSaveGating, getSaveLabel, getSaveColor.
// Pure functions — no mocking needed.

import { describe, it, expect } from 'vitest'
import {
  computeWorkflowStatus,
  getSaveGating,
  getSaveLabel,
  getSaveColor,
} from '../utils/workflowStatus.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReviewSummary(overrides = {}) {
  return {
    confirmed: 0, autoHigh: 0, autoLow: 0, unresolved: 0, excluded: 0, total: 0,
    confirmedQty: 0, autoHighQty: 0, autoLowQty: 0, unresolvedQty: 0, excludedQty: 0, totalQty: 0,
    ...overrides,
  }
}

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

function makeCableAudit(overrides = {}) {
  return {
    cableMode: 'DIRECT_GEOMETRY',
    cableConfidence: 0.85,
    manualCableRecommended: false,
    cableWarnings: [],
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
describe('computeWorkflowStatus', () => {
  // ── Stage: empty ───────────────────────────────────────────────────────────
  describe('empty stage', () => {
    it('returns empty when no file loaded', () => {
      const result = computeWorkflowStatus({ hasFile: false })
      expect(result.stage).toBe('empty')
      expect(result.statusColor).toBe('muted')
      expect(result.cta).toBeNull()
    })

    it('returns empty with default args', () => {
      const result = computeWorkflowStatus()
      expect(result.stage).toBe('empty')
    })

    it('returns empty for PDF with no rows', () => {
      const result = computeWorkflowStatus({ isPdf: true, hasFile: true, takeoffRowCount: 0 })
      expect(result.stage).toBe('empty')
      expect(result.statusLine).toContain('Jelölj ki')
    })
  })

  // ── Stage: parse_failed ────────────────────────────────────────────────────
  describe('parse_failed stage', () => {
    it('detects PARSE_LIMITED status from dxfAudit', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit({ status: 'PARSE_LIMITED', missing: ['DXF beolvasás sikertelen'] }),
      })
      expect(result.stage).toBe('parse_failed')
      expect(result.statusColor).toBe('red')
      expect(result.cta.action).toBe('retry')
      expect(result.badges.takeoff).toBe('error')
    })

    it('detects EXPLODED_RISK as parse_failed when no recognition', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: ['Robbantott rajz'] }),
        takeoffRowCount: 0,
      })
      expect(result.stage).toBe('parse_failed')
      expect(result.statusLine).toContain('Robbantott')
      expect(result.cta.action).toBe('reexport')
    })

    it('falls through to normal flow if exploded but has rows', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK' }),
        reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
        quoteReadiness: { status: 'ready', reasons: [] },
        takeoffRowCount: 5,
      })
      // With rows and ready readiness → should not be parse_failed
      expect(result.stage).toBe('ready')
    })
  })

  // ── Stage: unresolved_blocks ───────────────────────────────────────────────
  describe('unresolved_blocks stage', () => {
    it('detects review_required status', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit({ status: 'PARTIAL_AUTO' }),
        reviewSummary: makeReviewSummary({
          confirmed: 3, autoHigh: 2, unresolved: 4, unresolvedQty: 8, total: 9,
          confirmedQty: 6, autoHighQty: 4, autoLowQty: 0,
        }),
        quoteReadiness: { status: 'review_required', reasons: ['4 blokk nincs hozzárendelve (8 db)'] },
        takeoffRowCount: 5,
      })
      expect(result.stage).toBe('unresolved_blocks')
      expect(result.statusColor).toBe('red')
      expect(result.cta.action).toBe('review_blocks')
      expect(result.statusLine).toContain('4 ismeretlen')
      expect(result.badges.takeoff).toBe('error')
      expect(result.badges.calc).toBe('blocked')
    })

    it('detail includes reasons from quoteReadiness', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({ unresolved: 2, unresolvedQty: 3, total: 5 }),
        quoteReadiness: { status: 'review_required', reasons: ['2 blokk nincs hozzárendelve (3 db)'] },
        takeoffRowCount: 3,
      })
      expect(result.detail.reasons).toHaveLength(1)
      expect(result.detail.reasons[0]).toContain('2 blokk')
    })
  })

  // ── Stage: review_warnings ─────────────────────────────────────────────────
  describe('review_warnings stage', () => {
    it('detects auto_low warnings', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, autoLow: 2, autoLowQty: 4, total: 10,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['2 tétel gyenge felismeréssel (4 db)'] },
        takeoffRowCount: 8,
      })
      expect(result.stage).toBe('review_warnings')
      expect(result.statusColor).toBe('yellow')
      expect(result.cta.action).toBe('accept_all')
      expect(result.badges.takeoff).toBe('warning')
    })

    it('suggests cable check when cable is weak and no auto_low', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (40%)'] },
        cableAudit: makeCableAudit({ cableConfidence: 0.4, manualCableRecommended: false }),
        takeoffRowCount: 8,
      })
      expect(result.stage).toBe('review_warnings')
      expect(result.cta.action).toBe('check_cable')
    })

    it('surfaces cable warnings in detail.reasons when cable is weak', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (35%)'] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.35,
          manualCableRecommended: false,
          cableWarnings: ['Nincs kábelvonal a rajzban', 'Elosztó nem azonosítható'],
        }),
        takeoffRowCount: 8,
      })
      expect(result.stage).toBe('review_warnings')
      // Original quoteReadiness reason + top 2 cable warnings
      expect(result.detail.reasons).toHaveLength(3)
      expect(result.detail.reasons[0]).toContain('Kábelbecslés')
      expect(result.detail.reasons[1]).toContain('Nincs kábelvonal')
      expect(result.detail.reasons[2]).toContain('Elosztó nem azonosítható')
    })

    it('limits cable warnings to 2 in reasons', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (30%)'] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.3,
          cableWarnings: ['Warning A', 'Warning B', 'Warning C', 'Warning D'],
        }),
        takeoffRowCount: 8,
      })
      // 1 quoteReadiness reason + 2 cable warnings (capped)
      expect(result.detail.reasons).toHaveLength(3)
    })

    it('uses activate_manual_cable CTA when manualCableRecommended and weak cable', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (20%)'] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.2,
          manualCableRecommended: true,
          cableWarnings: ['Elosztó nem azonosítható'],
        }),
        takeoffRowCount: 8,
      })
      expect(result.stage).toBe('review_warnings')
      expect(result.cta.action).toBe('activate_manual_cable')
      expect(result.cta.label).toContain('Elosztó')
    })

    it('keeps check_cable CTA when weak cable but manualCableRecommended is false', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (40%)'] },
        cableAudit: makeCableAudit({ cableConfidence: 0.4, manualCableRecommended: false }),
        takeoffRowCount: 8,
      })
      expect(result.cta.action).toBe('check_cable')
    })

    it('does not add cable warnings when cable is strong', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoLow: 2, total: 7,
          confirmedQty: 10, autoLowQty: 4,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['2 tétel gyenge felismeréssel (4 db)'] },
        cableAudit: makeCableAudit({ cableConfidence: 0.9, cableWarnings: ['Should not appear'] }),
        takeoffRowCount: 7,
      })
      // Only the quoteReadiness reason, no cable warnings (cable is strong)
      expect(result.detail.reasons).toHaveLength(1)
      expect(result.detail.reasons[0]).toContain('tétel gyenge')
    })

    it('falls back to save CTA when warnings are minor', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb'] },
        cableAudit: makeCableAudit({ cableConfidence: 0.8 }),
        takeoffRowCount: 8,
      })
      expect(result.cta.action).toBe('save')
    })
  })

  // ── Stage: ready ───────────────────────────────────────────────────────────
  describe('ready stage', () => {
    it('returns ready when all confirmed', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 8, autoHigh: 2, total: 10,
          confirmedQty: 16, autoHighQty: 4,
        }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit(),
        takeoffRowCount: 10,
      })
      expect(result.stage).toBe('ready')
      expect(result.statusColor).toBe('accent')
      expect(result.cta.action).toBe('save')
      expect(result.badges.takeoff).toBeNull()
      expect(result.badges.calc).toBeNull()
    })

    it('surfaces cable warnings in ready stage when cable badge is active', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 8, autoHigh: 2, total: 10,
          confirmedQty: 16, autoHighQty: 4,
        }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.5,
          cableWarnings: ['Nincs kábelvonal a rajzban'],
        }),
        takeoffRowCount: 10,
      })
      expect(result.stage).toBe('ready')
      expect(result.cta.action).toBe('save')
      expect(result.badges.cable).toBe('warning')
      // Cable warning appears in detail.reasons even in ready stage
      expect(result.detail.reasons).toHaveLength(1)
      expect(result.detail.reasons[0]).toContain('Nincs kábelvonal')
    })

    it('no cable reasons in ready stage when cable is strong', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 8, autoHigh: 2, total: 10,
          confirmedQty: 16, autoHighQty: 4,
        }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit({ cableConfidence: 0.9, cableWarnings: [] }),
        takeoffRowCount: 10,
      })
      expect(result.stage).toBe('ready')
      expect(result.detail.reasons).toHaveLength(0)
    })

    it('ready for PDF with rows', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        isPdf: true,
        takeoffRowCount: 5,
      })
      expect(result.stage).toBe('ready')
      expect(result.statusLine).toContain('5 tétel')
      expect(result.cta.action).toBe('save')
    })
  })

  // ── cableReviewed suppression ────────────────────────────────────────────
  describe('cableReviewed suppresses cable warnings for PANEL_ASSISTED', () => {
    it('suppresses weak cable CTA when cableReviewed + PANEL_ASSISTED', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (62%)'] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.62,
          cableMode: 'PANEL_ASSISTED',
          manualCableRecommended: false,
          cableWarnings: ['Elosztó alapú becslés'],
        }),
        takeoffRowCount: 8,
        cableReviewed: true,
      })
      // weakCable suppressed → no cable CTA, falls back to save
      expect(result.cta.action).toBe('save')
    })

    it('suppresses cable badge when cableReviewed + PANEL_ASSISTED', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.62,
          cableMode: 'PANEL_ASSISTED',
          cableWarnings: [],
        }),
        takeoffRowCount: 8,
        cableReviewed: true,
      })
      expect(result.badges.cable).toBeNull()
    })

    it('does NOT suppress cable CTA when cableReviewed but NOT PANEL_ASSISTED', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (40%)'] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.4,
          cableMode: 'MST_ESTIMATE',
          manualCableRecommended: false,
        }),
        takeoffRowCount: 8,
        cableReviewed: true,
      })
      // Not PANEL_ASSISTED → cableReviewed doesn't suppress
      expect(result.cta.action).toBe('check_cable')
      expect(result.badges.cable).toBe('warning')
    })

    it('does NOT suppress cable CTA when NOT cableReviewed', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoHigh: 3, total: 8,
          confirmedQty: 10, autoHighQty: 6,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['Kábelbecslés bizonytalanabb (62%)'] },
        cableAudit: makeCableAudit({
          cableConfidence: 0.62,
          cableMode: 'PANEL_ASSISTED',
          manualCableRecommended: false,
        }),
        takeoffRowCount: 8,
        cableReviewed: false,
      })
      // Not reviewed → still shows cable CTA
      expect(result.cta.action).toBe('check_cable')
    })
  })

  // ── Tab badges ─────────────────────────────────────────────────────────────
  describe('tab badges', () => {
    it('cable badge shows warning for low confidence', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit({ cableConfidence: 0.5 }),
        takeoffRowCount: 5,
      })
      expect(result.badges.cable).toBe('warning')
    })

    it('cable badge shows warning for manual cable recommended', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit({ manualCableRecommended: true, cableConfidence: 0.2 }),
        takeoffRowCount: 5,
      })
      expect(result.badges.cable).toBe('warning')
    })

    it('no cable badge for high confidence cable', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: makeCableAudit({ cableConfidence: 0.9 }),
        takeoffRowCount: 5,
      })
      expect(result.badges.cable).toBeNull()
    })

    it('no badges when no cable audit', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
        quoteReadiness: { status: 'ready', reasons: [] },
        cableAudit: null,
        takeoffRowCount: 5,
      })
      expect(result.badges.cable).toBeNull()
    })
  })

  // ── Review stats ───────────────────────────────────────────────────────────
  describe('review stats in detail', () => {
    it('passes review stats through to detail.stats', () => {
      const summary = makeReviewSummary({
        confirmed: 3, autoHigh: 2, autoLow: 1, unresolved: 1, excluded: 1, total: 8,
        confirmedQty: 6, autoHighQty: 4, autoLowQty: 2, unresolvedQty: 1, excludedQty: 2,
      })
      const result = computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: summary,
        quoteReadiness: { status: 'review_required', reasons: ['1 blokk nincs hozzárendelve'] },
        takeoffRowCount: 6,
      })
      expect(result.detail.stats.confirmed).toBe(3)
      expect(result.detail.stats.autoHigh).toBe(2)
      expect(result.detail.stats.autoLow).toBe(1)
      expect(result.detail.stats.unresolved).toBe(1)
      expect(result.detail.stats.excluded).toBe(1)
      expect(result.detail.stats.total).toBe(8)
    })

    it('returns empty stats when no reviewSummary', () => {
      const result = computeWorkflowStatus({
        hasFile: true,
        isPdf: true,
        takeoffRowCount: 3,
      })
      expect(result.detail.stats).toEqual({})
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('getSaveGating', () => {
  it('disabled for empty stage', () => {
    const ws = computeWorkflowStatus({ hasFile: false })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(true)
    expect(gating.reason).toBeNull()
  })

  it('disabled for parse_failed stage', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'PARSE_LIMITED' }),
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(true)
  })

  it('disabled for unresolved_blocks stage with reason', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit(),
      reviewSummary: makeReviewSummary({ unresolved: 3, unresolvedQty: 6, total: 8 }),
      quoteReadiness: { status: 'review_required', reasons: ['3 blokk'] },
      takeoffRowCount: 5,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(true)
    expect(gating.reason).toBeTruthy()
    expect(gating.reason).toContain('ismeretlen')
  })

  it('enabled for review_warnings stage', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit(),
      reviewSummary: makeReviewSummary({ confirmed: 5, autoLow: 2, total: 7, confirmedQty: 10, autoLowQty: 4 }),
      quoteReadiness: { status: 'ready_with_warnings', reasons: ['2 tétel gyenge'] },
      takeoffRowCount: 7,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(false)
    expect(gating.reason).toBeNull()
  })

  it('enabled for ready stage', () => {
    const ws = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit(),
      reviewSummary: makeReviewSummary({ confirmed: 5, total: 5, confirmedQty: 10 }),
      quoteReadiness: { status: 'ready', reasons: [] },
      takeoffRowCount: 5,
    })
    const gating = getSaveGating(ws)
    expect(gating.disabled).toBe(false)
  })

  it('handles null workflowStatus', () => {
    const gating = getSaveGating(null)
    expect(gating.disabled).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('getSaveLabel', () => {
  it('returns saving indicator when saving', () => {
    expect(getSaveLabel(null, null, true)).toBe('...')
  })

  it('returns review label for unresolved_blocks', () => {
    const ws = { stage: 'unresolved_blocks' }
    expect(getSaveLabel(ws, null, false)).toContain('Felülvizsgálat')
  })

  it('returns plan label when planId exists', () => {
    const ws = { stage: 'ready' }
    expect(getSaveLabel(ws, 'plan-123', false)).toContain('mentése')
  })

  it('returns create label when no planId', () => {
    const ws = { stage: 'ready' }
    expect(getSaveLabel(ws, null, false)).toContain('létrehozása')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
describe('getSaveColor', () => {
  it('returns gray for unresolved_blocks', () => {
    const color = getSaveColor({ stage: 'unresolved_blocks' })
    expect(color).toBe('#71717A')
  })

  it('returns yellow for review_warnings', () => {
    const color = getSaveColor({ stage: 'review_warnings' })
    expect(color).toBe('#FFD166')
  })

  it('returns accent green for ready', () => {
    const color = getSaveColor({ stage: 'ready' })
    expect(color).toBe('#00E5A0')
  })

  it('returns accent green for null', () => {
    const color = getSaveColor(null)
    expect(color).toBe('#00E5A0')
  })
})
