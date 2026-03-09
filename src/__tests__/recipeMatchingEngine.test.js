// ─── Recipe Matching Engine — Regression Tests ──────────────────────────────
// Covers: candidate shape, scoring, bucket grouping, batch ops,
//         marker handoff, boundary separation from DetectionCandidate.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  createMatchCandidate,
  groupByBucket,
  batchAcceptGreen,
  batchIgnoreRed,
  toMarkerFields,
  CONFIDENCE_BUCKET,
  toBucket,
} from '../services/recipeMatching/index.js'
import {
  scoreTextHints,
  scoreAspectRatio,
  computeRecipeMatchConfidence,
} from '../services/recipeMatching/scoring.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch(overrides = {}) {
  return {
    x: 100, y: 200, pageNum: 1,
    confidence: 0.85,
    confidenceBucket: CONFIDENCE_BUCKET.HIGH,
    evidence: { ncc: { score: 0.8, weight: 0.7 }, textHint: { score: 0.5, weight: 0.2 }, aspect: { score: 1.0, weight: 0.1 } },
    matchBbox: { x: 90, y: 190, w: 20, h: 20 },
    ...overrides,
  }
}

function makeRecipe(overrides = {}) {
  return {
    id: 'RCP-test1',
    assemblyId: 'asm-001',
    assemblyName: 'Dugalj 2P+F',
    label: 'Dugalj egyszerű',
    ...overrides,
  }
}

// ── RecipeMatchCandidate shape ───────────────────────────────────────────────

describe('RecipeMatchCandidate shape', () => {
  it('has RMC- prefix ID, never DC-', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.id).toMatch(/^RMC-/)
    expect(c.id).not.toMatch(/^DC-/)
  })

  it('carries recipeId, planId, assemblyId', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.recipeId).toBe('RCP-test1')
    expect(c.planId).toBe('plan-1')
    expect(c.assemblyId).toBe('asm-001')
    expect(c.assemblyName).toBe('Dugalj 2P+F')
  })

  it('sets source to recipe_match', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.source).toBe('recipe_match')
    expect(c.source).not.toBe('pdf_rule_engine')
    expect(c.source).not.toBe('project_memory')
  })

  it('NEVER auto-accepts — accepted is always false', () => {
    const highMatch = makeMatch({ confidence: 0.99, confidenceBucket: CONFIDENCE_BUCKET.HIGH })
    const c = createMatchCandidate(highMatch, makeRecipe(), 'plan-1')
    expect(c.accepted).toBe(false)
  })

  it('includes spatial data: x, y, pageNumber, bbox', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.x).toBe(100)
    expect(c.y).toBe(200)
    expect(c.pageNumber).toBe(1)
    expect(c.bbox).toEqual({ x: 90, y: 190, w: 20, h: 20 })
  })

  it('includes confidence, bucket, and evidence', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.confidence).toBe(0.85)
    expect(c.confidenceBucket).toBe('high')
    expect(c.evidence).toBeDefined()
    expect(c.evidence.ncc).toBeDefined()
  })

  it('generates unique IDs for each candidate', () => {
    const ids = new Set()
    for (let i = 0; i < 50; i++) {
      ids.add(createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1').id)
    }
    expect(ids.size).toBe(50)
  })
})

// ── Confidence scoring ───────────────────────────────────────────────────────

describe('Confidence scoring', () => {
  describe('toBucket', () => {
    it('≥0.7 → HIGH', () => expect(toBucket(0.7)).toBe('high'))
    it('≥0.4 → REVIEW', () => expect(toBucket(0.4)).toBe('review'))
    it('<0.4 → LOW', () => expect(toBucket(0.39)).toBe('low'))
    it('1.0 → HIGH', () => expect(toBucket(1.0)).toBe('high'))
    it('0.0 → LOW', () => expect(toBucket(0.0)).toBe('low'))
  })

  describe('scoreTextHints', () => {
    it('returns 0 for empty inputs', () => {
      expect(scoreTextHints([], ['foo'])).toBe(0)
      expect(scoreTextHints(['foo'], [])).toBe(0)
      expect(scoreTextHints(null, null)).toBe(0)
    })

    it('returns 1 for perfect overlap', () => {
      expect(scoreTextHints(['abc', 'def'], ['abc', 'def'])).toBe(1)
    })

    it('returns partial for partial overlap', () => {
      const s = scoreTextHints(['abc', 'def', 'ghi'], ['abc'])
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(1)
    })

    it('is case-insensitive', () => {
      expect(scoreTextHints(['ABC'], ['abc'])).toBe(1)
    })

    it('handles substring matching', () => {
      expect(scoreTextHints(['lamp'], ['lamp230V'])).toBe(1)
    })
  })

  describe('scoreAspectRatio', () => {
    it('returns 1.0 for identical aspects', () => {
      expect(scoreAspectRatio(1.5, 1.5)).toBe(1.0)
    })

    it('returns 1.0 within ±30% tolerance', () => {
      expect(scoreAspectRatio(1.0, 0.8)).toBe(1.0) // 0.8 ratio = within 30%
    })

    it('returns 0.5 for unknown aspects', () => {
      expect(scoreAspectRatio(null, 1.5)).toBe(0.5)
      expect(scoreAspectRatio(1.5, null)).toBe(0.5)
    })

    it('returns 0.2 for very different aspects', () => {
      expect(scoreAspectRatio(1.0, 0.2)).toBe(0.2)
    })
  })

  describe('computeRecipeMatchConfidence', () => {
    it('produces combined score with correct weights', () => {
      const result = computeRecipeMatchConfidence({
        nccScore: 1.0, textHintScore: 1.0, aspectScore: 1.0,
      })
      expect(result.confidence).toBeCloseTo(1.0, 2)
      expect(result.confidenceBucket).toBe('high')
    })

    it('low NCC → low overall (NCC weight = 0.70)', () => {
      const result = computeRecipeMatchConfidence({
        nccScore: 0.2, textHintScore: 1.0, aspectScore: 1.0,
      })
      // 0.7*0.2 + 0.2*1.0 + 0.1*1.0 = 0.14 + 0.2 + 0.1 = 0.44
      expect(result.confidence).toBeCloseTo(0.44, 2)
      expect(result.confidenceBucket).toBe('review')
    })

    it('returns evidence object with all scores', () => {
      const result = computeRecipeMatchConfidence({
        nccScore: 0.8, textHintScore: 0.5, aspectScore: 0.9,
      })
      expect(result.evidence.ncc.score).toBe(0.8)
      expect(result.evidence.textHint.score).toBe(0.5)
      expect(result.evidence.aspect.score).toBe(0.9)
    })

    it('clamps to [0, 1]', () => {
      const r = computeRecipeMatchConfidence({ nccScore: 0, textHintScore: 0, aspectScore: 0 })
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
    })
  })
})

// ── Bucket grouping ──────────────────────────────────────────────────────────

describe('groupByBucket', () => {
  it('groups candidates into green/yellow/red', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'review' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'low' }), makeRecipe(), 'p1'),
    ]
    const g = groupByBucket(candidates)
    expect(g.green.length).toBe(2)
    expect(g.yellow.length).toBe(1)
    expect(g.red.length).toBe(1)
    expect(g.total).toBe(4)
  })

  it('handles empty input', () => {
    const g = groupByBucket([])
    expect(g.total).toBe(0)
  })
})

// ── Batch operations ─────────────────────────────────────────────────────────

describe('batchAcceptGreen', () => {
  it('accepts all HIGH candidates, leaves others unchanged', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'review' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'low' }), makeRecipe(), 'p1'),
    ]
    const result = batchAcceptGreen(candidates)
    expect(result[0].accepted).toBe(true)   // high → accepted
    expect(result[1].accepted).toBe(false)   // review → unchanged
    expect(result[2].accepted).toBe(false)   // low → unchanged
  })

  it('does NOT mutate original array', () => {
    const candidates = [createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1')]
    const result = batchAcceptGreen(candidates)
    expect(candidates[0].accepted).toBe(false)
    expect(result[0].accepted).toBe(true)
    expect(result).not.toBe(candidates)
  })
})

describe('batchIgnoreRed', () => {
  it('sets LOW candidates to accepted=false', () => {
    const candidates = [
      { ...createMatchCandidate(makeMatch({ confidenceBucket: 'low' }), makeRecipe(), 'p1'), accepted: true },
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
    ]
    candidates[1].accepted = true
    const result = batchIgnoreRed(candidates)
    expect(result[0].accepted).toBe(false)  // low → forced false
    expect(result[1].accepted).toBe(true)   // high → unchanged
  })
})

// ── Marker handoff ───────────────────────────────────────────────────────────

describe('toMarkerFields', () => {
  const assemblies = [
    { id: 'asm-001', category: 'szerelvenyek' },
    { id: 'asm-002', category: 'vilagitas' },
  ]

  it('produces correct marker fields from candidate', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    const fields = toMarkerFields(c, assemblies)

    expect(fields.x).toBe(100)
    expect(fields.y).toBe(200)
    expect(fields.pageNum).toBe(1)
    expect(fields.category).toBe('socket')    // szerelvenyek → socket
    expect(fields.source).toBe('detection')
    expect(fields.confidence).toBe(0.85)
    expect(fields.detectionId).toMatch(/^RMC-/)
    expect(fields.templateId).toBe('RCP-test1')
    expect(fields.asmId).toBe('asm-001')
    expect(fields.label).toBe('Dugalj egyszerű')
  })

  it('resolves vilagitas assembly to light category', () => {
    const recipe = makeRecipe({ assemblyId: 'asm-002' })
    const c = createMatchCandidate(makeMatch(), recipe, 'plan-1')
    const fields = toMarkerFields(c, assemblies)
    expect(fields.category).toBe('light')
  })

  it('falls back to other for unknown assembly', () => {
    const recipe = makeRecipe({ assemblyId: 'asm-unknown' })
    const c = createMatchCandidate(makeMatch(), recipe, 'plan-1')
    const fields = toMarkerFields(c, assemblies)
    expect(fields.category).toBe('other')
  })

  it('has color field for marker rendering', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    const fields = toMarkerFields(c, assemblies)
    expect(fields.color).toBeTruthy()
    expect(fields.color).toMatch(/^#/)
  })
})

// ── Boundary separation ──────────────────────────────────────────────────────

describe('boundary: RecipeMatchCandidate vs DetectionCandidate', () => {
  it('RMC IDs never collide with DC IDs', () => {
    const rmcIds = Array.from({ length: 100 }, () =>
      createMatchCandidate(makeMatch(), makeRecipe(), 'p1').id
    )
    // All should start with RMC-
    for (const id of rmcIds) {
      expect(id).toMatch(/^RMC-/)
      expect(id).not.toMatch(/^DC-/)
    }
  })

  it('source is always recipe_match, never pdf_rule_engine', () => {
    const c = createMatchCandidate(makeMatch(), makeRecipe(), 'plan-1')
    expect(c.source).toBe('recipe_match')
  })

  it('CONFIDENCE_BUCKET constants are shared with rule engine', () => {
    expect(CONFIDENCE_BUCKET.HIGH).toBe('high')
    expect(CONFIDENCE_BUCKET.REVIEW).toBe('review')
    expect(CONFIDENCE_BUCKET.LOW).toBe('low')
  })
})
