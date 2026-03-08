// ─── PDF Detection Review Integration Tests ──────────────────────────────────
// Tests for:
//   1. Candidate adapter — shape, bucket mapping, batch operations
//   2. Batch accept green / ignore red
//   3. Yellow review state
//   4. Accepted candidate → takeoff flow handoff shape (marker fields)
//   5. Truth source boundary — adapter reads only from DetectionCandidate[]
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  adaptCandidate,
  adaptCandidates,
  groupByBucket,
  batchAcceptGreen,
  batchIgnoreRed,
  toMarkerFields,
} from '../services/pdfDetection/candidateAdapter.js'
import { CONFIDENCE_BUCKET } from '../services/pdfDetection/ruleEngine.js'

// ── Test fixtures ──────────────────────────────────────────────────────────────

function makeCandidate(overrides = {}) {
  return {
    symbolId: 'SYM-SOCKET',
    symbolType: 'Dugalj',
    pageNumber: 1,
    bbox: { x: 100, y: 200, w: 10, h: 10 },
    confidence: 0.75,
    confidenceBucket: CONFIDENCE_BUCKET.HIGH,
    evidence: {
      text: { score: 0.8, matchedPatterns: ['dugalj'], mentionCount: 3 },
      geometry: null,
      legacy: { score: 0.6, originalConfidence: 0.72, qty: 5 },
    },
    source: 'hybrid',
    requiresReview: false,
    qty: 5,
    asmId: 'ASM-001',
    legacyType: 'socket',
    ...overrides,
  }
}

const PLAN_ID = 'plan-test-001'

// ── 1. Candidate adapter shape ───────────────────────────────────────────────

describe('candidateAdapter — adaptCandidate', () => {
  it('produces the correct shape for the review panel', () => {
    const candidate = makeCandidate()
    const adapted = adaptCandidate(candidate, PLAN_ID)

    expect(adapted).toHaveProperty('id')
    expect(adapted.id).toMatch(/^pdfdet-/)
    expect(adapted.planId).toBe(PLAN_ID)
    expect(adapted.pageNum).toBe(1)
    expect(adapted.x).toBe(100)
    expect(adapted.y).toBe(200)
    expect(adapted.score).toBe(0.75)
    expect(adapted.category).toBe('socket')
    expect(adapted.color).toBe('#FF8C42')
    expect(adapted.label).toBe('Dugalj')
    expect(adapted.confidenceBucket).toBe('high')
    expect(adapted.evidence).toBeDefined()
    expect(adapted.requiresReview).toBe(false)
    expect(adapted.symbolId).toBe('SYM-SOCKET')
    expect(adapted.qty).toBe(5)
    expect(adapted.asmId).toBe('ASM-001')
    expect(adapted.source).toBe('pdf_rule_engine')
  })

  it('maps SYM-SWITCH to switch category', () => {
    const adapted = adaptCandidate(makeCandidate({ symbolId: 'SYM-SWITCH', symbolType: 'Kapcsoló' }), PLAN_ID)
    expect(adapted.category).toBe('switch')
    expect(adapted.color).toBe('#A78BFA')
  })

  it('maps SYM-LIGHT to light category', () => {
    const adapted = adaptCandidate(makeCandidate({ symbolId: 'SYM-LIGHT', symbolType: 'Lámpa' }), PLAN_ID)
    expect(adapted.category).toBe('light')
    expect(adapted.color).toBe('#FFD166')
  })

  it('maps SYM-CONDUIT to conduit category', () => {
    const adapted = adaptCandidate(makeCandidate({ symbolId: 'SYM-CONDUIT', symbolType: 'Kábelvédőcső' }), PLAN_ID)
    expect(adapted.category).toBe('conduit')
    expect(adapted.color).toBe('#06B6D4')
  })

  it('maps SYM-BREAKER to panel category', () => {
    const adapted = adaptCandidate(makeCandidate({ symbolId: 'SYM-BREAKER', symbolType: 'Kismegszakító' }), PLAN_ID)
    expect(adapted.category).toBe('panel')
    expect(adapted.color).toBe('#FF6B6B')
  })

  it('maps unknown symbolId to other', () => {
    const adapted = adaptCandidate(makeCandidate({ symbolId: 'SYM-UNKNOWN' }), PLAN_ID)
    expect(adapted.category).toBe('other')
    expect(adapted.color).toBe('#71717A')
  })

  it('handles missing bbox gracefully', () => {
    const adapted = adaptCandidate(makeCandidate({ bbox: null }), PLAN_ID)
    expect(adapted.x).toBe(0)
    expect(adapted.y).toBe(0)
  })
})

// ── 2. Initial acceptance by confidence bucket ───────────────────────────────

describe('candidateAdapter — initial acceptance', () => {
  it('HIGH bucket → accepted = true (green auto-accept)', () => {
    const adapted = adaptCandidate(makeCandidate({ confidenceBucket: 'high' }), PLAN_ID)
    expect(adapted.accepted).toBe(true)
  })

  it('REVIEW bucket → accepted = true (yellow default accept, review suggested)', () => {
    const adapted = adaptCandidate(
      makeCandidate({ confidenceBucket: 'review', confidence: 0.5, requiresReview: true }),
      PLAN_ID,
    )
    expect(adapted.accepted).toBe(true)
  })

  it('LOW bucket → accepted = false (red default reject)', () => {
    const adapted = adaptCandidate(
      makeCandidate({ confidenceBucket: 'low', confidence: 0.2, requiresReview: true }),
      PLAN_ID,
    )
    expect(adapted.accepted).toBe(false)
  })
})

// ── 3. Batch operations ─────────────────────────────────────────────────────

describe('candidateAdapter — batch operations', () => {
  const candidates = [
    makeCandidate({ symbolId: 'SYM-SOCKET', confidence: 0.8, confidenceBucket: 'high' }),
    makeCandidate({ symbolId: 'SYM-SWITCH', confidence: 0.5, confidenceBucket: 'review' }),
    makeCandidate({ symbolId: 'SYM-LIGHT', confidence: 0.2, confidenceBucket: 'low' }),
  ]
  const adapted = adaptCandidates(candidates, PLAN_ID)

  it('groupByBucket correctly groups', () => {
    const groups = groupByBucket(adapted)
    expect(groups.green.length).toBe(1)
    expect(groups.yellow.length).toBe(1)
    expect(groups.red.length).toBe(1)
    expect(groups.total).toBe(3)
  })

  it('batchAcceptGreen sets all green to accepted', () => {
    // Start with all rejected
    const allRejected = adapted.map(d => ({ ...d, accepted: false }))
    const result = batchAcceptGreen(allRejected)
    // Green should be accepted now
    expect(result.find(d => d.confidenceBucket === 'high').accepted).toBe(true)
    // Others unchanged
    expect(result.find(d => d.confidenceBucket === 'review').accepted).toBe(false)
    expect(result.find(d => d.confidenceBucket === 'low').accepted).toBe(false)
  })

  it('batchIgnoreRed sets all red to rejected', () => {
    // Start with all accepted
    const allAccepted = adapted.map(d => ({ ...d, accepted: true }))
    const result = batchIgnoreRed(allAccepted)
    // Red should be rejected
    expect(result.find(d => d.confidenceBucket === 'low').accepted).toBe(false)
    // Others unchanged
    expect(result.find(d => d.confidenceBucket === 'high').accepted).toBe(true)
    expect(result.find(d => d.confidenceBucket === 'review').accepted).toBe(true)
  })

  it('batchAcceptGreen + batchIgnoreRed combined leaves yellow untouched', () => {
    const mixed = adapted.map(d => ({ ...d, accepted: false }))
    const step1 = batchAcceptGreen(mixed)
    const step2 = batchIgnoreRed(step1)
    expect(step2.find(d => d.confidenceBucket === 'high').accepted).toBe(true)
    expect(step2.find(d => d.confidenceBucket === 'review').accepted).toBe(false)
    expect(step2.find(d => d.confidenceBucket === 'low').accepted).toBe(false)
  })
})

// ── 4. Yellow review state ──────────────────────────────────────────────────

describe('candidateAdapter — yellow review state', () => {
  it('review bucket candidate has requiresReview = true', () => {
    const candidate = makeCandidate({
      confidenceBucket: 'review',
      confidence: 0.45,
      requiresReview: true,
    })
    const adapted = adaptCandidate(candidate, PLAN_ID)
    expect(adapted.requiresReview).toBe(true)
    expect(adapted.confidenceBucket).toBe('review')
    // Default accepted for yellow, but flagged for manual review
    expect(adapted.accepted).toBe(true)
  })

  it('adapts evidence breakdown for review', () => {
    const candidate = makeCandidate({
      confidenceBucket: 'review',
      confidence: 0.42,
      evidence: {
        text: { score: 0.7, matchedPatterns: ['dugalj', 'konnektor'], mentionCount: 4 },
        geometry: null,
        legacy: null,
      },
    })
    const adapted = adaptCandidate(candidate, PLAN_ID)
    expect(adapted.evidence.text).toBeDefined()
    expect(adapted.evidence.text.matchedPatterns).toContain('dugalj')
    expect(adapted.evidence.geometry).toBeNull()
    expect(adapted.evidence.legacy).toBeNull()
  })
})

// ── 5. Accepted candidate → marker handoff shape ────────────────────────────

describe('candidateAdapter — toMarkerFields (takeoff handoff)', () => {
  it('produces correct createMarker() fields from accepted detection', () => {
    const candidate = makeCandidate({ confidence: 0.82, confidenceBucket: 'high' })
    const adapted = adaptCandidate(candidate, PLAN_ID)
    const markerFields = toMarkerFields(adapted)

    expect(markerFields.x).toBe(100)
    expect(markerFields.y).toBe(200)
    expect(markerFields.pageNum).toBe(1)
    expect(markerFields.category).toBe('socket')
    expect(markerFields.color).toBe('#FF8C42')
    expect(markerFields.source).toBe('detection')
    expect(markerFields.confidence).toBe(0.82)
    expect(markerFields.detectionId).toMatch(/^pdfdet-/)
    expect(markerFields.label).toBe('Dugalj')
    expect(markerFields.asmId).toBe('ASM-001')
  })

  it('marker source is always "detection" regardless of candidate source', () => {
    const adapted = adaptCandidate(makeCandidate({ source: 'text' }), PLAN_ID)
    const markerFields = toMarkerFields(adapted)
    expect(markerFields.source).toBe('detection')
  })
})

// ── 6. Truth source boundary ────────────────────────────────────────────────

describe('candidateAdapter — truth source boundary', () => {
  it('adapter reads only from DetectionCandidate[] — no legacy symbols.items', () => {
    // The adapter function signature takes DetectionCandidate, not symbols.items
    // This test verifies the adapter never references legacyType at top level
    const candidate = makeCandidate({ legacyType: 'socket_legacy' })
    const adapted = adaptCandidate(candidate, PLAN_ID)

    // The adapted detection should NOT have legacyType at top level
    // (it's embedded in evidence only)
    expect(adapted).not.toHaveProperty('legacyType')
    // Legacy info is only accessible via evidence
    expect(adapted.evidence.legacy).toBeDefined()
  })

  it('adaptCandidates handles empty input', () => {
    expect(adaptCandidates([], PLAN_ID)).toEqual([])
    expect(adaptCandidates(null, PLAN_ID)).toEqual([])
    expect(adaptCandidates(undefined, PLAN_ID)).toEqual([])
  })

  it('adapted detection retains symbolId for downstream truth reference', () => {
    const adapted = adaptCandidate(makeCandidate(), PLAN_ID)
    expect(adapted.symbolId).toBe('SYM-SOCKET')
    // symbolId is the link back to the canonical symbol library
  })

  it('adaptCandidates maps multiple candidates correctly', () => {
    const candidates = [
      makeCandidate({ symbolId: 'SYM-SOCKET', pageNumber: 1 }),
      makeCandidate({ symbolId: 'SYM-LIGHT', pageNumber: 2, symbolType: 'Lámpa' }),
    ]
    const adapted = adaptCandidates(candidates, PLAN_ID)
    expect(adapted.length).toBe(2)
    expect(adapted[0].category).toBe('socket')
    expect(adapted[1].category).toBe('light')
    expect(adapted[0].planId).toBe(PLAN_ID)
    expect(adapted[1].planId).toBe(PLAN_ID)
  })
})
