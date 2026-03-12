// ─── Structured Reasons — Recovery Summary Prioritization ────────────────────
// Tests for the structuredReasons field added to computeWorkflowStatus detail.
// Verifies that each stage produces correctly tagged reasons with severity
// (blocker/action/warning/info) and category (parse/recognition/cable/guidance).
//
// Existing detail.reasons string[] behavior is NOT changed — these tests
// only verify the NEW structuredReasons[] field.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeWorkflowStatus,
  REASON_SEVERITIES,
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

/** Extract severity values from structuredReasons */
function severities(result) {
  return (result.detail.structuredReasons || []).map(r => r.severity)
}

/** Extract categories from structuredReasons */
function categories(result) {
  return (result.detail.structuredReasons || []).map(r => r.category)
}

/** Extract texts from structuredReasons */
function texts(result) {
  return (result.detail.structuredReasons || []).map(r => r.text)
}

// ── REASON_SEVERITIES export ────────────────────────────────────────────────

describe('REASON_SEVERITIES', () => {
  it('exports the four severity levels', () => {
    expect(REASON_SEVERITIES).toEqual(['blocker', 'action', 'warning', 'info'])
  })

  it('is frozen', () => {
    expect(Object.isFrozen(REASON_SEVERITIES)).toBe(true)
  })
})

// ── Empty/no-file stages ────────────────────────────────────────────────────

describe('structuredReasons: empty stages', () => {
  it('empty stage returns empty structuredReasons', () => {
    const result = computeWorkflowStatus({ hasFile: false })
    expect(result.detail.structuredReasons).toEqual([])
  })

  it('PDF no rows returns empty structuredReasons', () => {
    const result = computeWorkflowStatus({ hasFile: true, isPdf: true, takeoffRowCount: 0 })
    expect(result.detail.structuredReasons).toEqual([])
  })

  it('PDF ready returns empty structuredReasons', () => {
    const result = computeWorkflowStatus({ hasFile: true, isPdf: true, takeoffRowCount: 5 })
    expect(result.detail.structuredReasons).toEqual([])
  })
})

// ── parse_failed stage ──────────────────────────────────────────────────────

describe('structuredReasons: parse_failed', () => {
  it('PARSE_LIMITED → all reasons are blocker/parse', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({
        status: 'PARSE_LIMITED',
        missing: ['DXF beolvasás sikertelen', 'Hibás fejléc'],
      }),
    })
    expect(result.detail.structuredReasons).toHaveLength(2)
    expect(severities(result)).toEqual(['blocker', 'blocker'])
    expect(categories(result)).toEqual(['parse', 'parse'])
    expect(texts(result)).toEqual(['DXF beolvasás sikertelen', 'Hibás fejléc'])
  })

  it('EXPLODED_RISK → blockers + info guidance hint', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({
        status: 'EXPLODED_RISK',
        missing: ['Robbantott rajz'],
      }),
      takeoffRowCount: 0,
    })
    // 1 audit.missing (blocker) + 1 exploded blocker + 1 alternative hint (info)
    expect(result.detail.structuredReasons).toHaveLength(3)
    expect(severities(result)).toEqual(['blocker', 'blocker', 'info'])
    expect(categories(result)).toEqual(['parse', 'parse', 'guidance'])
    // Last entry is the alternative hint
    expect(texts(result)[2]).toContain('Alternatíva')
  })

  it('no blocks found → blocker/parse', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'GOOD_FOR_AUTO', missing: ['Nincs blokk'] }),
      takeoffRowCount: 0,
    })
    expect(result.stage).toBe('parse_failed')
    expect(result.detail.structuredReasons).toHaveLength(1)
    expect(severities(result)).toEqual(['blocker'])
  })

  it('PARSE_LIMITED with empty missing → empty structuredReasons', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'PARSE_LIMITED', missing: [] }),
    })
    expect(result.detail.structuredReasons).toEqual([])
  })
})

// ── unresolved_blocks stage ─────────────────────────────────────────────────

describe('structuredReasons: unresolved_blocks', () => {
  it('unresolved reasons are blocker/recognition', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'PARTIAL_AUTO' }),
      reviewSummary: makeReviewSummary({
        confirmed: 3, autoHigh: 2, unresolved: 4, unresolvedQty: 8, total: 9,
        confirmedQty: 6, autoHighQty: 4,
      }),
      quoteReadiness: { status: 'review_required', reasons: ['4 blokk nincs hozzárendelve (8 db)'] },
      takeoffRowCount: 5,
    })
    expect(result.detail.structuredReasons).toHaveLength(1)
    expect(severities(result)).toEqual(['blocker'])
    expect(categories(result)).toEqual(['recognition'])
  })

  it('MANUAL_HEAVY adds info/guidance hint', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'MANUAL_HEAVY' }),
      reviewSummary: makeReviewSummary({
        unresolved: 12, unresolvedQty: 45, total: 15,
        confirmed: 1, confirmedQty: 5, autoHigh: 2, autoHighQty: 8,
      }),
      quoteReadiness: { status: 'review_required', reasons: ['12 blokk nincs hozzárendelve (45 db)'] },
      takeoffRowCount: 3,
    })
    expect(result.detail.structuredReasons).toHaveLength(2)
    expect(severities(result)).toEqual(['blocker', 'info'])
    expect(categories(result)).toEqual(['recognition', 'guidance'])
    expect(texts(result)[1]).toContain('legnagyobb darabszám')
  })

  it('non-MANUAL_HEAVY has no guidance hint', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'PARTIAL_AUTO' }),
      reviewSummary: makeReviewSummary({
        unresolved: 3, unresolvedQty: 8, total: 6,
      }),
      quoteReadiness: { status: 'review_required', reasons: ['3 blokk nincs hozzárendelve (8 db)'] },
      takeoffRowCount: 3,
    })
    expect(result.detail.structuredReasons).toHaveLength(1)
    expect(severities(result)).toEqual(['blocker'])
  })
})

// ── review_warnings stage ───────────────────────────────────────────────────

describe('structuredReasons: review_warnings', () => {
  it('auto_low reasons are action/recognition', () => {
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
    expect(result.detail.structuredReasons).toHaveLength(1)
    expect(severities(result)).toEqual(['action'])
    expect(categories(result)).toEqual(['recognition'])
  })

  it('cable-only warnings → warning/cable + info/cable detail', () => {
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
        cableWarnings: ['Nincs kábelvonal a rajzban', 'Elosztó nem azonosítható'],
      }),
      takeoffRowCount: 8,
    })
    // 1 quoteReadiness warning + 2 cable detail info
    expect(result.detail.structuredReasons).toHaveLength(3)
    expect(severities(result)).toEqual(['warning', 'info', 'info'])
    expect(categories(result)).toEqual(['cable', 'cable', 'cable'])
  })

  it('auto_low + weak cable → action reasons + info cable details', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit(),
      reviewSummary: makeReviewSummary({
        confirmed: 3, autoHigh: 2, autoLow: 3, autoLowQty: 6, total: 8,
        confirmedQty: 6, autoHighQty: 4,
      }),
      quoteReadiness: { status: 'ready_with_warnings', reasons: ['3 tétel gyenge felismeréssel (6 db)'] },
      cableAudit: makeCableAudit({
        cableConfidence: 0.4,
        cableWarnings: ['Nincs kábelvonal'],
      }),
      takeoffRowCount: 8,
    })
    // 1 auto_low action + 1 cable detail info
    expect(result.detail.structuredReasons).toHaveLength(2)
    expect(severities(result)).toEqual(['action', 'info'])
    expect(categories(result)[0]).toBe('recognition')
    expect(categories(result)[1]).toBe('cable')
  })

  it('no cable warnings when cable is strong', () => {
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
    expect(result.detail.structuredReasons).toHaveLength(1)
    expect(severities(result)).toEqual(['action'])
  })

  it('cable detail warnings capped at 2', () => {
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
        cableWarnings: ['A', 'B', 'C', 'D'],
      }),
      takeoffRowCount: 8,
    })
    // 1 quoteReadiness + 2 cable (capped from 4)
    expect(result.detail.structuredReasons).toHaveLength(3)
    const cableInfos = result.detail.structuredReasons.filter(r => r.category === 'cable' && r.severity === 'info')
    expect(cableInfos).toHaveLength(2)
  })
})

// ── ready stage ─────────────────────────────────────────────────────────────

describe('structuredReasons: ready', () => {
  it('fully ready with strong cable → empty structuredReasons', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit(),
      reviewSummary: makeReviewSummary({
        confirmed: 8, autoHigh: 2, total: 10,
        confirmedQty: 16, autoHighQty: 4,
      }),
      quoteReadiness: { status: 'ready', reasons: [] },
      cableAudit: makeCableAudit({ cableConfidence: 0.9 }),
      takeoffRowCount: 10,
    })
    expect(result.detail.structuredReasons).toEqual([])
  })

  it('ready with weak cable → info/cable reasons', () => {
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
    expect(result.detail.structuredReasons).toHaveLength(1)
    expect(severities(result)).toEqual(['info'])
    expect(categories(result)).toEqual(['cable'])
  })
})

// ── Backward compat: detail.reasons unchanged ───────────────────────────────

describe('structuredReasons: backward compatibility', () => {
  it('detail.reasons is still plain string[] in unresolved_blocks', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'MANUAL_HEAVY' }),
      reviewSummary: makeReviewSummary({
        unresolved: 10, unresolvedQty: 30, total: 12,
      }),
      quoteReadiness: { status: 'review_required', reasons: ['10 blokk nincs hozzárendelve (30 db)'] },
      takeoffRowCount: 2,
    })
    // detail.reasons is still string[]
    expect(typeof result.detail.reasons[0]).toBe('string')
    expect(result.detail.reasons[0]).toContain('10 blokk')
    // structuredReasons is object[]
    expect(typeof result.detail.structuredReasons[0]).toBe('object')
    expect(result.detail.structuredReasons[0].text).toContain('10 blokk')
  })

  it('detail.reasons and structuredReasons have same length', () => {
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
        cableWarnings: ['Nincs kábelvonal a rajzban', 'Elosztó nem azonosítható'],
      }),
      takeoffRowCount: 8,
    })
    expect(result.detail.reasons.length).toBe(result.detail.structuredReasons.length)
  })

  it('structuredReasons texts match detail.reasons strings', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'PARTIAL_AUTO' }),
      reviewSummary: makeReviewSummary({
        confirmed: 3, autoHigh: 2, unresolved: 2, unresolvedQty: 5, total: 7,
        confirmedQty: 6, autoHighQty: 4,
      }),
      quoteReadiness: { status: 'review_required', reasons: ['2 blokk nincs hozzárendelve (5 db)'] },
      takeoffRowCount: 5,
    })
    const reasonTexts = result.detail.structuredReasons.map(r => r.text)
    expect(reasonTexts).toEqual(result.detail.reasons)
  })
})

// ── structuredReasons shape validation ──────────────────────────────────────

describe('structuredReasons: shape validation', () => {
  it('every structuredReason has text, severity, category', () => {
    const result = computeWorkflowStatus({
      hasFile: true,
      dxfAudit: makeDxfAudit({ status: 'EXPLODED_RISK', missing: ['R1', 'R2'] }),
      takeoffRowCount: 0,
    })
    for (const sr of result.detail.structuredReasons) {
      expect(sr).toHaveProperty('text')
      expect(sr).toHaveProperty('severity')
      expect(sr).toHaveProperty('category')
      expect(typeof sr.text).toBe('string')
      expect(REASON_SEVERITIES).toContain(sr.severity)
      expect(['parse', 'recognition', 'cable', 'guidance']).toContain(sr.category)
    }
  })

  it('all severity values are from REASON_SEVERITIES enum', () => {
    // Test across multiple stages
    const stages = [
      computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit({ status: 'PARSE_LIMITED', missing: ['err'] }),
      }),
      computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({ unresolved: 1, unresolvedQty: 2, total: 3 }),
        quoteReadiness: { status: 'review_required', reasons: ['1 blokk'] },
        takeoffRowCount: 2,
      }),
      computeWorkflowStatus({
        hasFile: true,
        dxfAudit: makeDxfAudit(),
        reviewSummary: makeReviewSummary({
          confirmed: 5, autoLow: 2, total: 7,
          confirmedQty: 10, autoLowQty: 4,
        }),
        quoteReadiness: { status: 'ready_with_warnings', reasons: ['2 tétel gyenge'] },
        cableAudit: makeCableAudit({ cableConfidence: 0.3, cableWarnings: ['W1'] }),
        takeoffRowCount: 7,
      }),
    ]
    for (const result of stages) {
      for (const sr of result.detail.structuredReasons) {
        expect(REASON_SEVERITIES).toContain(sr.severity)
      }
    }
  })
})
