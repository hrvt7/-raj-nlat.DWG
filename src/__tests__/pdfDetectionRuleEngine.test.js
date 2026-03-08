// ─── PDF Detection Rule Engine Tests ──────────────────────────────────────────
// Tests for: symbolLibrary shape, ruleEngine output, confidence buckets,
// negative cases, and legacy/new truth source boundary.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  SYMBOL_LIBRARY,
  SYMBOL_CATEGORIES,
  getSymbolById,
  getSymbolByLegacyType,
  getAutoDetectableSymbols,
  getSymbolsByCategory,
} from '../services/pdfDetection/symbolLibrary.js'
import {
  runRuleEngine,
  CONFIDENCE_BUCKET,
  toBucket,
} from '../services/pdfDetection/ruleEngine.js'
import {
  extractDetectionSummary,
} from '../services/pdfDetection/index.js'
import {
  createAnalysisResult,
  createPageAnalysis,
} from '../services/pdfAnalysis/types.js'

// ── Symbol Library Shape ─────────────────────────────────────────────────────

describe('symbolLibrary', () => {
  it('has at least 5 symbol definitions', () => {
    expect(SYMBOL_LIBRARY.length).toBeGreaterThanOrEqual(5)
  })

  it('every symbol has required fields', () => {
    for (const sym of SYMBOL_LIBRARY) {
      expect(sym.id).toBeTruthy()
      expect(sym.category).toBeTruthy()
      expect(sym.label).toBeTruthy()
      expect(sym.labelEn).toBeTruthy()
      expect(Array.isArray(sym.textPatterns)).toBe(true)
      expect(sym.textPatterns.length).toBeGreaterThan(0)
      expect(Array.isArray(sym.aliases)).toBe(true)
      expect(typeof sym.autoDetect).toBe('boolean')
      expect(typeof sym.detectionNotes).toBe('string')
    }
  })

  it('symbol IDs are unique', () => {
    const ids = SYMBOL_LIBRARY.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes the five expected first-phase symbols', () => {
    const ids = SYMBOL_LIBRARY.map(s => s.id)
    expect(ids).toContain('SYM-SOCKET')
    expect(ids).toContain('SYM-SWITCH')
    expect(ids).toContain('SYM-LIGHT')
    expect(ids).toContain('SYM-CONDUIT')
    expect(ids).toContain('SYM-BREAKER')
  })

  it('getSymbolById returns correct symbol', () => {
    const socket = getSymbolById('SYM-SOCKET')
    expect(socket).toBeDefined()
    expect(socket.label).toBe('Dugalj')
  })

  it('getSymbolById returns undefined for unknown ID', () => {
    expect(getSymbolById('SYM-NONEXISTENT')).toBeUndefined()
  })

  it('getSymbolByLegacyType maps correctly', () => {
    expect(getSymbolByLegacyType('dugalj')?.id).toBe('SYM-SOCKET')
    expect(getSymbolByLegacyType('kapcsolo')?.id).toBe('SYM-SWITCH')
    expect(getSymbolByLegacyType('lampa')?.id).toBe('SYM-LIGHT')
  })

  it('getAutoDetectableSymbols returns only autoDetect=true entries', () => {
    const auto = getAutoDetectableSymbols()
    expect(auto.every(s => s.autoDetect)).toBe(true)
    expect(auto.length).toBeGreaterThan(0)
  })

  it('first-phase categories are represented', () => {
    const usedCats = new Set(SYMBOL_LIBRARY.map(s => s.category))
    // First phase: power, lighting, infrastructure must be present
    expect(usedCats.has(SYMBOL_CATEGORIES.POWER)).toBe(true)
    expect(usedCats.has(SYMBOL_CATEGORIES.LIGHTING)).toBe(true)
    expect(usedCats.has(SYMBOL_CATEGORIES.INFRASTRUCTURE)).toBe(true)
  })

  it('SYMBOL_CATEGORIES defines all planned categories', () => {
    // fire_safety and low_voltage reserved for future phases
    expect(Object.keys(SYMBOL_CATEGORIES).length).toBeGreaterThanOrEqual(5)
  })

  it('textPatterns are all lowercase', () => {
    for (const sym of SYMBOL_LIBRARY) {
      for (const p of sym.textPatterns) {
        expect(p).toBe(p.toLowerCase())
      }
    }
  })
})

// ── Confidence Buckets ───────────────────────────────────────────────────────

describe('toBucket', () => {
  it('maps >= 0.7 to HIGH', () => {
    expect(toBucket(0.7)).toBe(CONFIDENCE_BUCKET.HIGH)
    expect(toBucket(0.95)).toBe(CONFIDENCE_BUCKET.HIGH)
    expect(toBucket(1.0)).toBe(CONFIDENCE_BUCKET.HIGH)
  })

  it('maps >= 0.4 and < 0.7 to REVIEW', () => {
    expect(toBucket(0.4)).toBe(CONFIDENCE_BUCKET.REVIEW)
    expect(toBucket(0.55)).toBe(CONFIDENCE_BUCKET.REVIEW)
    expect(toBucket(0.69)).toBe(CONFIDENCE_BUCKET.REVIEW)
  })

  it('maps < 0.4 to LOW', () => {
    expect(toBucket(0.0)).toBe(CONFIDENCE_BUCKET.LOW)
    expect(toBucket(0.2)).toBe(CONFIDENCE_BUCKET.LOW)
    expect(toBucket(0.39)).toBe(CONFIDENCE_BUCKET.LOW)
  })
})

// ── Rule Engine Output ───────────────────────────────────────────────────────

describe('runRuleEngine', () => {
  it('returns empty for null input', () => {
    const { candidates, meta } = runRuleEngine(null)
    expect(candidates).toEqual([])
    expect(meta.totalCandidates).toBe(0)
  })

  it('returns empty for result with no pages', () => {
    const result = createAnalysisResult('test')
    const { candidates } = runRuleEngine(result)
    expect(candidates).toEqual([])
  })

  // ── Text evidence detection ──────────────────────────────────────────

  it('detects socket from text evidence', () => {
    const result = _makeResult([
      { text: 'Dugalj 2P+F', x: 10, y: 20, w: 60, h: 12 },
      { text: 'konnektor fali', x: 10, y: 40, w: 60, h: 12 },
    ])

    const { candidates, meta } = runRuleEngine(result)
    const socket = candidates.find(c => c.symbolId === 'SYM-SOCKET')
    expect(socket).toBeDefined()
    expect(socket.confidence).toBeGreaterThan(0)
    expect(socket.evidence.text).toBeDefined()
    expect(socket.evidence.text.matchedPatterns.length).toBeGreaterThan(0)
  })

  it('detects switch from text evidence', () => {
    const result = _makeResult([
      { text: 'Csillárkapcsoló', x: 10, y: 20, w: 80, h: 12 },
    ])
    const { candidates } = runRuleEngine(result)
    const sw = candidates.find(c => c.symbolId === 'SYM-SWITCH')
    expect(sw).toBeDefined()
  })

  it('detects lighting from text evidence', () => {
    const result = _makeResult([
      { text: 'LED spot downlight', x: 10, y: 20, w: 100, h: 12 },
      { text: 'mennyezeti lámpatest', x: 10, y: 40, w: 100, h: 12 },
    ])
    const { candidates } = runRuleEngine(result)
    const light = candidates.find(c => c.symbolId === 'SYM-LIGHT')
    expect(light).toBeDefined()
    expect(light.evidence.text.matchedPatterns.length).toBeGreaterThanOrEqual(2)
  })

  it('detects conduit from text evidence', () => {
    const result = _makeResult([
      { text: 'Kábeltálca 100x50', x: 10, y: 20, w: 100, h: 12 },
    ])
    const { candidates } = runRuleEngine(result)
    const conduit = candidates.find(c => c.symbolId === 'SYM-CONDUIT')
    expect(conduit).toBeDefined()
  })

  it('detects breaker only from clear text', () => {
    const result = _makeResult([
      { text: 'Kismegszakító C16', x: 10, y: 20, w: 80, h: 12 },
    ])
    const { candidates } = runRuleEngine(result)
    const breaker = candidates.find(c => c.symbolId === 'SYM-BREAKER')
    expect(breaker).toBeDefined()
    // Breaker with single text evidence should require review
    expect(breaker.requiresReview).toBe(true)
  })

  // ── Negative / no-match cases ──────────────────────────────────────

  it('does NOT detect anything from irrelevant text', () => {
    const result = _makeResult([
      { text: 'Épület neve: Irodaház', x: 10, y: 20, w: 120, h: 12 },
      { text: 'Tervező: Kiss Péter', x: 10, y: 40, w: 100, h: 12 },
      { text: 'Rajzszám: E-01', x: 10, y: 60, w: 80, h: 12 },
    ])
    const { candidates, meta } = runRuleEngine(result)
    expect(candidates.length).toBe(0)
    expect(meta.totalCandidates).toBe(0)
  })

  it('does NOT detect from empty text blocks', () => {
    const result = _makeResult([])
    const { candidates } = runRuleEngine(result)
    expect(candidates.length).toBe(0)
  })

  // ── Legacy evidence integration ────────────────────────────────────

  it('uses legacy symbols as evidence (not competing truth source)', () => {
    const result = _makeResult([
      { text: 'Dugalj', x: 10, y: 20, w: 40, h: 12 },
    ])
    // Add legacy symbol items
    result.symbols.items = [
      { symbolType: 'dugalj', x: 50, y: 50, w: 10, h: 10, confidence: 0.7, matchTier: 'exact', label: 'Dugalj' },
    ]
    result.symbols.totalCount = 1

    const { candidates } = runRuleEngine(result)
    const socket = candidates.find(c => c.symbolId === 'SYM-SOCKET')
    expect(socket).toBeDefined()
    // Should have both text AND legacy evidence
    expect(socket.evidence.text).toBeDefined()
    expect(socket.evidence.legacy).toBeDefined()
    // Confidence should be higher with combined evidence
    expect(socket.confidence).toBeGreaterThan(0.3)
    // Source should be hybrid
    expect(socket.source).toBe('hybrid')
  })

  it('legacy evidence alone gets review-level confidence', () => {
    const result = createAnalysisResult('test')
    const page = createPageAnalysis(1)
    page.textBlocks = []  // No text evidence
    result.pages = [page]
    result.pageCount = 1
    result.symbols.items = [
      { symbolType: 'lampa', x: 0, y: 0, w: 0, h: 0, confidence: 0.5, matchTier: 'probable', label: 'Lámpatest' },
    ]

    const { candidates } = runRuleEngine(result)
    const light = candidates.find(c => c.symbolId === 'SYM-LIGHT')
    expect(light).toBeDefined()
    // Legacy alone → single evidence → requiresReview
    expect(light.requiresReview).toBe(true)
    expect(light.source).toBe('legacy')
  })

  // ── Candidate shape validation ─────────────────────────────────────

  it('every candidate has the full required shape', () => {
    const result = _makeResult([
      { text: 'Dugalj konnektor', x: 10, y: 20, w: 80, h: 12 },
      { text: 'Kapcsoló dimmer', x: 10, y: 40, w: 80, h: 12 },
      { text: 'LED lámpatest', x: 10, y: 60, w: 80, h: 12 },
    ])

    const { candidates } = runRuleEngine(result)
    expect(candidates.length).toBeGreaterThanOrEqual(3)

    for (const c of candidates) {
      expect(typeof c.symbolId).toBe('string')
      expect(typeof c.symbolType).toBe('string')
      expect(typeof c.pageNumber).toBe('number')
      expect(c.bbox).toBeDefined()
      expect(typeof c.bbox.x).toBe('number')
      expect(typeof c.bbox.y).toBe('number')
      expect(typeof c.confidence).toBe('number')
      expect(c.confidence).toBeGreaterThanOrEqual(0)
      expect(c.confidence).toBeLessThanOrEqual(1)
      expect(['high', 'review', 'low']).toContain(c.confidenceBucket)
      expect(c.evidence).toBeDefined()
      expect(['text', 'geometry', 'legacy', 'hybrid']).toContain(c.source)
      expect(typeof c.requiresReview).toBe('boolean')
    }
  })

  // ── Deduplication ──────────────────────────────────────────────────

  it('deduplicates same symbol on same page (keeps highest confidence)', () => {
    const result = _makeResult([
      { text: 'Dugalj', x: 10, y: 20, w: 40, h: 12 },
    ])
    // This should produce only one SYM-SOCKET candidate for page 1
    const { candidates } = runRuleEngine(result)
    const sockets = candidates.filter(c => c.symbolId === 'SYM-SOCKET' && c.pageNumber === 1)
    expect(sockets.length).toBe(1)
  })

  // ── Meta shape ─────────────────────────────────────────────────────

  it('meta has correct shape', () => {
    const result = _makeResult([
      { text: 'Dugalj és Kapcsoló és Lámpatest', x: 10, y: 20, w: 200, h: 12 },
    ])
    const { meta } = runRuleEngine(result)

    expect(typeof meta.totalCandidates).toBe('number')
    expect(typeof meta.highConfidence).toBe('number')
    expect(typeof meta.reviewNeeded).toBe('number')
    expect(typeof meta.lowConfidence).toBe('number')
    expect(Array.isArray(meta.detectedSymbolIds)).toBe(true)
    expect(Array.isArray(meta.evidenceSources)).toBe(true)
    // Sum of buckets should equal total
    expect(meta.highConfidence + meta.reviewNeeded + meta.lowConfidence).toBe(meta.totalCandidates)
  })
})

// ── Detection summary extraction ─────────────────────────────────────────────

describe('extractDetectionSummary', () => {
  it('returns null for null input', () => {
    expect(extractDetectionSummary(null)).toBeNull()
  })

  it('extracts correct summary from meta', () => {
    const meta = {
      totalCandidates: 5,
      highConfidence: 2,
      reviewNeeded: 2,
      lowConfidence: 1,
      detectedSymbolIds: ['SYM-SOCKET', 'SYM-LIGHT'],
      evidenceSources: ['text', 'legacy'],
    }
    const summary = extractDetectionSummary(meta)
    expect(summary.totalCandidates).toBe(5)
    expect(summary.highConfidence).toBe(2)
    expect(summary.reviewNeeded).toBe(2)
    expect(summary.lowConfidence).toBe(1)
    expect(summary.detectedSymbolIds).toEqual(['SYM-SOCKET', 'SYM-LIGHT'])
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function _makeResult(textBlocks) {
  const result = createAnalysisResult('test')
  const page = createPageAnalysis(1)
  page.textBlocks = textBlocks.map(tb => ({
    text: tb.text || '',
    x: tb.x || 0,
    y: tb.y || 0,
    w: tb.w || 0,
    h: tb.h || 0,
  }))
  result.pages = [page]
  result.pageCount = 1
  return result
}
