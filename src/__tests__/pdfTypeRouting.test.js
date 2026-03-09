// ─── PDF Type Routing + Raster Limited Mode Tests ────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── pdfTypeRouter ──────────────────────────────────────────────────────────
import {
  routePdfType,
  DETECTION_MODE,
  LIMITED_MODE_CONFIDENCE_CAP,
  isPageLimited,
  isGeometryDisabled,
  getPageConfidenceCap,
} from '../services/pdfDetection/pdfTypeRouter.js'

// ── ruleEngine (with route-awareness) ──────────────────────────────────────
import { runRuleEngine, CONFIDENCE_BUCKET, toBucket } from '../services/pdfDetection/ruleEngine.js'

// ── candidateAdapter ────────────────────────────────────────────────────────
import {
  adaptCandidate,
  adaptCandidates,
  batchAcceptGreen,
  DETECTION_SOURCE,
  DETECTION_MODE_LABEL,
} from '../services/pdfDetection/candidateAdapter.js'

// ── detection entry point ───────────────────────────────────────────────────
import { extractDetectionSummary } from '../services/pdfDetection/index.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAnalysis(sourceType, pages = []) {
  return {
    analysisVersion: '1.0.0',
    provider: 'test',
    generatedAt: new Date().toISOString(),
    sourceType,
    pageCount: pages.length,
    pages,
    metadata: { floor: null, floorLabel: null, systemType: null, docType: null, drawingNumber: null, revision: null, projectName: null, designer: null, confidence: 0 },
    symbols: { totalCount: 0, byType: {}, items: [] },
    cableEstimate: { totalMeters: 0, byType: {}, topology: null, source: null },
    confidenceHints: { overall: 0, metadata: 0, symbols: 0, cables: 0 },
    unsupportedReasons: [],
    warnings: [],
  }
}

function makePage(pageNumber, sourceType, opts = {}) {
  return {
    pageNumber,
    width: 595,
    height: 842,
    sourceType,
    textBlocks: opts.textBlocks || [],
    drawings: opts.drawings || [],
    images: [],
    detectedSymbols: [],
    probableTitleBlockZones: [],
    probableLegendZones: [],
    warnings: [],
  }
}

// ─── routePdfType tests ──────────────────────────────────────────────────────

describe('routePdfType', () => {
  it('returns FULL mode for vector PDF', () => {
    const analysis = makeAnalysis('vector', [makePage(1, 'vector')])
    const result = routePdfType(analysis)
    expect(result.detectionMode).toBe(DETECTION_MODE.FULL)
    expect(result.rasterPageNumbers).toEqual([])
    expect(result.limitedModeReasons).toEqual([])
    expect(result.confidenceCap).toBe(1.0)
  })

  it('returns LIMITED mode for raster PDF', () => {
    const analysis = makeAnalysis('raster', [makePage(1, 'raster')])
    const result = routePdfType(analysis)
    expect(result.detectionMode).toBe(DETECTION_MODE.LIMITED)
    expect(result.rasterPageNumbers).toEqual([1])
    expect(result.limitedModeReasons.length).toBeGreaterThan(0)
    expect(result.confidenceCap).toBe(LIMITED_MODE_CONFIDENCE_CAP)
  })

  it('returns LIMITED mode for unknown PDF', () => {
    const analysis = makeAnalysis('unknown', [makePage(1, 'unknown')])
    const result = routePdfType(analysis)
    expect(result.detectionMode).toBe(DETECTION_MODE.LIMITED)
    expect(result.rasterPageNumbers).toEqual([1])
  })

  it('returns MIXED mode for mixed PDF with vector + raster pages', () => {
    const analysis = makeAnalysis('mixed', [
      makePage(1, 'vector'),
      makePage(2, 'raster'),
      makePage(3, 'vector'),
    ])
    const result = routePdfType(analysis)
    expect(result.detectionMode).toBe(DETECTION_MODE.MIXED)
    expect(result.rasterPageNumbers).toEqual([2])
    expect(result.confidenceCap).toBe(LIMITED_MODE_CONFIDENCE_CAP)
  })

  it('treats mixed PDF with all vector pages as FULL', () => {
    const analysis = makeAnalysis('mixed', [
      makePage(1, 'vector'),
      makePage(2, 'vector'),
    ])
    const result = routePdfType(analysis)
    expect(result.detectionMode).toBe(DETECTION_MODE.FULL)
  })

  it('treats mixed PDF with all raster pages as LIMITED', () => {
    const analysis = makeAnalysis('mixed', [
      makePage(1, 'raster'),
      makePage(2, 'raster'),
    ])
    const result = routePdfType(analysis)
    expect(result.detectionMode).toBe(DETECTION_MODE.LIMITED)
  })

  it('returns LIMITED for null/empty analysis', () => {
    expect(routePdfType(null).detectionMode).toBe(DETECTION_MODE.LIMITED)
    expect(routePdfType({}).detectionMode).toBe(DETECTION_MODE.LIMITED)
    expect(routePdfType({ pages: [] }).detectionMode).toBe(DETECTION_MODE.LIMITED)
  })

  it('disables geometry layer for raster pages', () => {
    const analysis = makeAnalysis('mixed', [
      makePage(1, 'vector'),
      makePage(2, 'raster'),
    ])
    const result = routePdfType(analysis)
    const p1 = result.pageRoutes.find(p => p.pageNumber === 1)
    const p2 = result.pageRoutes.find(p => p.pageNumber === 2)
    expect(p1.disabledLayers).toEqual([])
    expect(p2.disabledLayers).toContain('geometry')
  })
})

// ─── Page query helpers ───────────────────────────────────────────────────────

describe('isPageLimited / isGeometryDisabled / getPageConfidenceCap', () => {
  const route = routePdfType(
    makeAnalysis('mixed', [makePage(1, 'vector'), makePage(2, 'raster')])
  )

  it('identifies limited pages', () => {
    expect(isPageLimited(route, 1)).toBe(false)
    expect(isPageLimited(route, 2)).toBe(true)
  })

  it('identifies geometry disabled pages', () => {
    expect(isGeometryDisabled(route, 1)).toBe(false)
    expect(isGeometryDisabled(route, 2)).toBe(true)
  })

  it('returns correct confidence cap per page', () => {
    expect(getPageConfidenceCap(route, 1)).toBe(1.0)
    expect(getPageConfidenceCap(route, 2)).toBe(LIMITED_MODE_CONFIDENCE_CAP)
  })

  it('handles null routeResult gracefully', () => {
    expect(isPageLimited(null, 1)).toBe(false)
    expect(isGeometryDisabled(null, 1)).toBe(false)
    expect(getPageConfidenceCap(null, 1)).toBe(1.0)
  })
})

// ─── Rule engine with routing integration ────────────────────────────────────

describe('runRuleEngine route-aware', () => {
  it('vector page: full engine (text + geometry + legacy all active)', () => {
    const analysis = makeAnalysis('vector', [
      makePage(1, 'vector', {
        textBlocks: [
          { text: 'dugalj 2x', x: 0, y: 0, w: 100, h: 20 },
          { text: 'kapcsoló', x: 0, y: 30, w: 100, h: 20 },
        ],
      }),
    ])
    const route = routePdfType(analysis)
    const { candidates } = runRuleEngine(analysis, route)
    // Should find at least one candidate (text match for dugalj/socket)
    expect(candidates.length).toBeGreaterThan(0)
    // Candidates from vector page should NOT be limited mode
    for (const c of candidates) {
      expect(c.isLimitedMode).toBe(false)
    }
  })

  it('raster page: limited mode — geometry disabled, confidence capped', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', {
        textBlocks: [
          { text: 'dugalj 5db', x: 0, y: 0, w: 100, h: 20 },
        ],
        // Even with drawings, geometry should be skipped
        drawings: [
          { type: 'circle', points: [[50, 50], [60, 50]], stroke: '#000', lineWidth: 1 },
        ],
      }),
    ])
    const route = routePdfType(analysis)
    const { candidates } = runRuleEngine(analysis, route)

    for (const c of candidates) {
      expect(c.isLimitedMode).toBe(true)
      expect(c.requiresReview).toBe(true)
      expect(c.confidence).toBeLessThanOrEqual(LIMITED_MODE_CONFIDENCE_CAP)
      // Geometry evidence should be null (disabled)
      expect(c.evidence.geometry).toBeNull()
    }
  })

  it('mixed pages: vector page full, raster page limited', () => {
    const analysis = makeAnalysis('mixed', [
      makePage(1, 'vector', {
        textBlocks: [{ text: 'dugalj', x: 0, y: 0, w: 100, h: 20 }],
      }),
      makePage(2, 'raster', {
        textBlocks: [{ text: 'dugalj', x: 0, y: 0, w: 100, h: 20 }],
      }),
    ])
    const route = routePdfType(analysis)
    const { candidates } = runRuleEngine(analysis, route)

    const vectorCandidate = candidates.find(c => c.pageNumber === 1)
    const rasterCandidate = candidates.find(c => c.pageNumber === 2)

    if (vectorCandidate) {
      expect(vectorCandidate.isLimitedMode).toBe(false)
    }
    if (rasterCandidate) {
      expect(rasterCandidate.isLimitedMode).toBe(true)
      expect(rasterCandidate.confidence).toBeLessThanOrEqual(LIMITED_MODE_CONFIDENCE_CAP)
    }
  })

  it('backward compatible: works without routeResult (null)', () => {
    const analysis = makeAnalysis('vector', [
      makePage(1, 'vector', {
        textBlocks: [{ text: 'dugalj', x: 0, y: 0, w: 100, h: 20 }],
      }),
    ])
    // No routeResult = old behavior
    const { candidates } = runRuleEngine(analysis)
    expect(candidates.length).toBeGreaterThan(0)
    for (const c of candidates) {
      expect(c.isLimitedMode).toBe(false)
    }
  })
})

// ─── candidateAdapter limited mode ──────────────────────────────────────────

describe('candidateAdapter limited mode', () => {
  const baseCand = {
    symbolId: 'SYM-SOCKET',
    symbolType: 'Dugalj',
    pageNumber: 1,
    bbox: { x: 10, y: 20, w: 30, h: 30 },
    confidence: 0.52,
    confidenceBucket: 'review',
    evidence: { text: { score: 0.5, matchedPatterns: ['dugalj'], mentionCount: 2 }, geometry: null, legacy: null },
    source: 'text',
    requiresReview: true,
    qty: 2,
    asmId: null,
    legacyType: null,
    isLimitedMode: true,
  }

  it('preserves isLimitedMode in adapted detection', () => {
    const adapted = adaptCandidate(baseCand, 'plan-1')
    expect(adapted.isLimitedMode).toBe(true)
  })

  it('non-limited candidate has isLimitedMode=false', () => {
    const adapted = adaptCandidate({ ...baseCand, isLimitedMode: false }, 'plan-1')
    expect(adapted.isLimitedMode).toBe(false)
  })

  it('batchAcceptGreen skips limited mode candidates even if HIGH', () => {
    const highLimited = adaptCandidate({
      ...baseCand,
      confidence: 0.8,
      confidenceBucket: 'high',
      isLimitedMode: true,
    }, 'plan-1')

    const highNormal = adaptCandidate({
      ...baseCand,
      confidence: 0.8,
      confidenceBucket: 'high',
      isLimitedMode: false,
    }, 'plan-1')

    const result = batchAcceptGreen([highLimited, highNormal])
    const limited = result.find(d => d.isLimitedMode)
    const normal = result.find(d => !d.isLimitedMode)

    expect(limited.accepted).toBe(false)  // never auto-accept in limited mode
    expect(normal.accepted).toBe(true)    // standard auto-accept
  })

  it('DETECTION_MODE_LABEL has all keys', () => {
    expect(DETECTION_MODE_LABEL.full).toBeDefined()
    expect(DETECTION_MODE_LABEL.limited).toBeDefined()
    expect(DETECTION_MODE_LABEL.mixed).toBeDefined()
  })
})

// ─── extractDetectionSummary routing info ────────────────────────────────────

describe('extractDetectionSummary with routing', () => {
  it('includes detectionMode and raster info in summary', () => {
    const meta = {
      totalCandidates: 3,
      highConfidence: 0,
      reviewNeeded: 3,
      lowConfidence: 0,
      detectedSymbolIds: ['SYM-SOCKET'],
      evidenceSources: ['text'],
      detectionMode: 'limited',
      rasterPageNumbers: [1, 2],
      limitedModeReasons: ['Szkennelt PDF'],
    }
    const summary = extractDetectionSummary(meta)
    expect(summary.detectionMode).toBe('limited')
    expect(summary.rasterPageNumbers).toEqual([1, 2])
    expect(summary.limitedModeReasons).toEqual(['Szkennelt PDF'])
  })

  it('defaults to full when no routing info', () => {
    const meta = {
      totalCandidates: 1,
      highConfidence: 1,
      reviewNeeded: 0,
      lowConfidence: 0,
      detectedSymbolIds: ['SYM-SOCKET'],
      evidenceSources: ['text'],
    }
    const summary = extractDetectionSummary(meta)
    expect(summary.detectionMode).toBe('full')
    expect(summary.rasterPageNumbers).toEqual([])
    expect(summary.limitedModeReasons).toEqual([])
  })

  it('returns null for null meta', () => {
    expect(extractDetectionSummary(null)).toBeNull()
  })
})

// ─── Truth source boundary ───────────────────────────────────────────────────

describe('truth source boundary (routing)', () => {
  it('raster candidates have same DetectionCandidate shape as vector candidates', () => {
    const requiredKeys = [
      'symbolId', 'symbolType', 'pageNumber', 'bbox', 'confidence',
      'confidenceBucket', 'evidence', 'source', 'requiresReview', 'qty',
    ]
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', {
        textBlocks: [{ text: 'dugalj 3db', x: 0, y: 0, w: 100, h: 20 }],
      }),
    ])
    const route = routePdfType(analysis)
    const { candidates } = runRuleEngine(analysis, route)

    for (const c of candidates) {
      for (const key of requiredKeys) {
        expect(c).toHaveProperty(key)
      }
    }
  })

  it('vector path unchanged when no routeResult', () => {
    const analysis = makeAnalysis('vector', [
      makePage(1, 'vector', {
        textBlocks: [{ text: 'dugalj 2db kapcsoló', x: 0, y: 0, w: 200, h: 20 }],
      }),
    ])
    // With route
    const route = routePdfType(analysis)
    const withRoute = runRuleEngine(analysis, route)
    // Without route (backward compat)
    const withoutRoute = runRuleEngine(analysis)

    expect(withRoute.candidates.length).toBe(withoutRoute.candidates.length)
    for (let i = 0; i < withRoute.candidates.length; i++) {
      expect(withRoute.candidates[i].confidence).toBe(withoutRoute.candidates[i].confidence)
      expect(withRoute.candidates[i].symbolId).toBe(withoutRoute.candidates[i].symbolId)
    }
  })

  it('limited mode candidates never produce HIGH bucket (capped)', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', {
        textBlocks: [
          { text: 'dugalj dugalj dugalj dugalj dugalj', x: 0, y: 0, w: 200, h: 20 },
        ],
      }),
    ])
    // Even with strong text evidence, confidence is capped
    const route = routePdfType(analysis)
    const { candidates } = runRuleEngine(analysis, route)
    for (const c of candidates) {
      expect(c.confidence).toBeLessThanOrEqual(LIMITED_MODE_CONFIDENCE_CAP)
      // 0.55 < 0.7 → should be REVIEW bucket at most
      expect(c.confidenceBucket).not.toBe('high')
    }
  })
})

// ─── DETECTION_MODE enum ────────────────────────────────────────────────────

describe('DETECTION_MODE constants', () => {
  it('has the required values', () => {
    expect(DETECTION_MODE.FULL).toBe('full')
    expect(DETECTION_MODE.LIMITED).toBe('limited')
    expect(DETECTION_MODE.MIXED).toBe('mixed')
  })
})
