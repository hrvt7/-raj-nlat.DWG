// ─── OCR Text Extractor Tests ────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  extractOcrText,
  enrichAnalysisWithOcr,
  extractOcrHints,
  OCR_SOURCE,
} from '../services/pdfDetection/ocrTextExtractor.js'

import { routePdfType, DETECTION_MODE } from '../services/pdfDetection/pdfTypeRouter.js'
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

function makeOcrResult(pages, hasAnyText = true) {
  return {
    pages: pages.map(p => ({
      pageNumber: p.pageNumber,
      textBlocks: p.textBlocks || [],
      source: (p.textBlocks && p.textBlocks.length > 0) ? OCR_SOURCE.PDF_TEXT_LAYER : OCR_SOURCE.NO_TEXT,
      titleBlockHints: p.titleBlockHints || [],
      legendHints: p.legendHints || [],
      symbolTextHints: p.symbolTextHints || [],
      textBlockCount: (p.textBlocks || []).length,
    })),
    hasAnyText,
    pagesWithText: pages.filter(p => p.textBlocks && p.textBlocks.length > 0).length,
    pagesWithout: pages.filter(p => !p.textBlocks || p.textBlocks.length === 0).length,
    summary: hasAnyText ? 'OCR szöveggel' : 'szöveg nélkül',
  }
}

// ─── OCR_SOURCE constants ──────────────────────────────────────────────────

describe('OCR_SOURCE constants', () => {
  it('has the required values', () => {
    expect(OCR_SOURCE.PDF_TEXT_LAYER).toBe('pdf_text_layer')
    expect(OCR_SOURCE.NO_TEXT).toBe('no_text')
  })
})

// ─── extractOcrText ─────────────────────────────────────────────────────────

describe('extractOcrText', () => {
  it('returns empty result when no routeResult', async () => {
    const result = await extractOcrText(new Uint8Array(), null)
    expect(result.hasAnyText).toBe(false)
    expect(result.pages).toEqual([])
    expect(result.summary).toBe('Nincs raster oldal')
  })

  it('returns empty result when no limited pages', async () => {
    const analysis = makeAnalysis('vector', [makePage(1, 'vector')])
    const route = routePdfType(analysis)
    const result = await extractOcrText(new Uint8Array(), route)
    expect(result.hasAnyText).toBe(false)
    expect(result.pages).toEqual([])
  })

  it('reports pages for raster route (pdf.js will fail with empty data but structure is correct)', async () => {
    const analysis = makeAnalysis('raster', [makePage(1, 'raster')])
    const route = routePdfType(analysis)
    // With empty Uint8Array, pdf.js will fail → all pages get no_text
    const result = await extractOcrText(new Uint8Array(), route)
    // Should still return structured result with empty pages
    expect(result.pages.length).toBe(1)
    expect(result.pagesWithout).toBe(1)
    expect(result.hasAnyText).toBe(false)
  })
})

// ─── enrichAnalysisWithOcr ──────────────────────────────────────────────────

describe('enrichAnalysisWithOcr', () => {
  it('returns original analysis when ocrResult is null', () => {
    const analysis = makeAnalysis('raster', [makePage(1, 'raster')])
    const result = enrichAnalysisWithOcr(analysis, null)
    expect(result).toBe(analysis) // same reference
  })

  it('returns original analysis when ocrResult has no text', () => {
    const analysis = makeAnalysis('raster', [makePage(1, 'raster')])
    const ocrResult = makeOcrResult([{ pageNumber: 1 }], false)
    const result = enrichAnalysisWithOcr(analysis, ocrResult)
    expect(result).toBe(analysis)
  })

  it('enriches raster page with OCR textBlocks', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [] }),
    ])
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [
        { text: 'dugalj 2db', x: 10, y: 20, w: 80, h: 12 },
        { text: 'kapcsoló', x: 10, y: 40, w: 60, h: 12 },
      ],
    }])

    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)

    // Should NOT be the same object (immutable)
    expect(enriched).not.toBe(analysis)
    expect(enriched.pages[0].textBlocks.length).toBe(2)
    expect(enriched.pages[0].textBlocks[0].text).toBe('dugalj 2db')
    expect(enriched.pages[0]._ocrEnriched).toBe(true)
    expect(enriched.pages[0]._ocrSource).toBe('pdf_text_layer')
    expect(enriched.pages[0]._ocrBlockCount).toBe(2)
  })

  it('does not duplicate existing textBlocks', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [{ text: 'dugalj', x: 0, y: 0, w: 50, h: 10 }] }),
    ])
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [
        { text: 'dugalj', x: 10, y: 20, w: 80, h: 12 },  // duplicate
        { text: 'kapcsoló', x: 10, y: 40, w: 60, h: 12 }, // new
      ],
    }])

    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)
    // Should have original 1 + 1 new = 2 (not 3, because 'dugalj' is deduped)
    expect(enriched.pages[0].textBlocks.length).toBe(2)
    expect(enriched.pages[0]._ocrBlockCount).toBe(1) // only 1 new block
  })

  it('does not modify pages without OCR data', () => {
    const analysis = makeAnalysis('mixed', [
      makePage(1, 'vector', { textBlocks: [{ text: 'vector text', x: 0, y: 0, w: 50, h: 10 }] }),
      makePage(2, 'raster', { textBlocks: [] }),
    ])
    const ocrResult = makeOcrResult([{
      pageNumber: 2,
      textBlocks: [{ text: 'ocr text', x: 10, y: 20, w: 60, h: 12 }],
    }])

    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)
    // Page 1 should be unchanged (same reference)
    expect(enriched.pages[0]).toBe(analysis.pages[0])
    // Page 2 should be enriched
    expect(enriched.pages[1].textBlocks.length).toBe(1)
    expect(enriched.pages[1]._ocrEnriched).toBe(true)
  })
})

// ─── extractOcrHints ────────────────────────────────────────────────────────

describe('extractOcrHints', () => {
  it('returns empty hints for null ocrResult', () => {
    const hints = extractOcrHints(null)
    expect(hints.titleBlockTexts).toEqual([])
    expect(hints.legendTexts).toEqual([])
    expect(hints.symbolHints).toEqual([])
    expect(hints.allTexts).toEqual([])
  })

  it('extracts title block hints', () => {
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'E-01 Erősáram', x: 0, y: 0, w: 100, h: 12 }],
      titleBlockHints: ['Rajzszám: E-01', 'Tervező: Kovács'],
    }])

    const hints = extractOcrHints(ocrResult)
    expect(hints.titleBlockTexts).toEqual(['Rajzszám: E-01', 'Tervező: Kovács'])
    expect(hints.allTexts).toEqual(['E-01 Erősáram'])
  })

  it('extracts legend hints', () => {
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'Jelmagyarázat', x: 0, y: 0, w: 100, h: 12 }],
      legendHints: ['Jelmagyarázat'],
    }])

    const hints = extractOcrHints(ocrResult)
    expect(hints.legendTexts).toEqual(['Jelmagyarázat'])
  })

  it('extracts symbol text hints', () => {
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'dugalj 2db', x: 0, y: 0, w: 100, h: 12 }],
      symbolTextHints: ['dugalj 2db'],
    }])

    const hints = extractOcrHints(ocrResult)
    expect(hints.symbolHints).toEqual(['dugalj 2db'])
  })

  it('aggregates hints from multiple pages', () => {
    const ocrResult = makeOcrResult([
      {
        pageNumber: 1,
        textBlocks: [{ text: 'p1 text', x: 0, y: 0, w: 50, h: 10 }],
        titleBlockHints: ['TB p1'],
      },
      {
        pageNumber: 2,
        textBlocks: [{ text: 'p2 text', x: 0, y: 0, w: 50, h: 10 }],
        titleBlockHints: ['TB p2'],
        legendHints: ['Legend p2'],
      },
    ])

    const hints = extractOcrHints(ocrResult)
    expect(hints.titleBlockTexts).toEqual(['TB p1', 'TB p2'])
    expect(hints.legendTexts).toEqual(['Legend p2'])
    expect(hints.allTexts).toEqual(['p1 text', 'p2 text'])
  })
})

// ─── extractDetectionSummary with OCR ──────────────────────────────────────

describe('extractDetectionSummary with OCR info', () => {
  it('includes ocrResult in summary', () => {
    const meta = {
      totalCandidates: 2,
      highConfidence: 0,
      reviewNeeded: 2,
      lowConfidence: 0,
      detectedSymbolIds: ['SYM-SOCKET'],
      evidenceSources: ['text'],
      detectionMode: 'limited',
      rasterPageNumbers: [1],
      limitedModeReasons: ['Szkennelt PDF'],
      ocrResult: {
        hasAnyText: true,
        pagesWithText: 1,
        pagesWithout: 0,
        summary: '1 raster oldal OCR szöveggel',
      },
      ocrMetaAssist: {
        systemType: 'power',
        metaConfidence: 0.65,
        metaSource: 'ocr_text',
      },
    }
    const summary = extractDetectionSummary(meta)
    expect(summary.ocrResult).toBeDefined()
    expect(summary.ocrResult.hasAnyText).toBe(true)
    expect(summary.ocrResult.pagesWithText).toBe(1)
    expect(summary.ocrMetaAssist).toBeDefined()
    expect(summary.ocrMetaAssist.systemType).toBe('power')
  })

  it('defaults ocrResult to null when missing', () => {
    const meta = {
      totalCandidates: 1,
      highConfidence: 1,
      reviewNeeded: 0,
      lowConfidence: 0,
      detectedSymbolIds: ['SYM-SOCKET'],
      evidenceSources: ['text'],
    }
    const summary = extractDetectionSummary(meta)
    expect(summary.ocrResult).toBeNull()
    expect(summary.ocrMetaAssist).toBeNull()
  })
})

// ─── OCR does not become truth source ──────────────────────────────────────

describe('OCR truth source boundary', () => {
  it('enriched analysis does not change analysisResult.symbols', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [] }),
    ])
    const originalSymbols = analysis.symbols
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'dugalj 5db', x: 10, y: 20, w: 80, h: 12 }],
    }])

    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)
    // symbols should be the same (OCR doesn't create new symbol entries)
    expect(enriched.symbols).toBe(originalSymbols)
  })

  it('OCR text enriches textBlocks only — does not create detectedSymbols', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [] }),
    ])
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'dugalj 5db', x: 10, y: 20, w: 80, h: 12 }],
    }])

    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)
    expect(enriched.pages[0].detectedSymbols).toEqual([])
  })

  it('OCR enrichment preserves sourceType on page', () => {
    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [] }),
    ])
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'test', x: 0, y: 0, w: 50, h: 10 }],
    }])

    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)
    expect(enriched.pages[0].sourceType).toBe('raster')
    expect(enriched.sourceType).toBe('raster')
  })
})

// ─── Limited mode conservatism with OCR ─────────────────────────────────────

describe('OCR + limited mode conservatism', () => {
  it('OCR enriched raster pages still produce limited mode candidates', () => {
    // This test verifies the full pipeline: OCR text → rule engine → limited mode
    const { runRuleEngine } = require('../services/pdfDetection/ruleEngine.js')

    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [] }),
    ])
    const route = routePdfType(analysis)

    // Simulate OCR enrichment
    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [
        { text: 'dugalj 3db', x: 10, y: 20, w: 80, h: 12 },
        { text: 'kapcsoló', x: 10, y: 40, w: 60, h: 12 },
      ],
    }])
    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)

    // Rule engine on enriched analysis
    const { candidates } = runRuleEngine(enriched, route)

    // Should find candidates (OCR text provided evidence)
    expect(candidates.length).toBeGreaterThan(0)

    // All candidates should still be limited mode
    for (const c of candidates) {
      expect(c.isLimitedMode).toBe(true)
      expect(c.requiresReview).toBe(true)
      expect(c.confidence).toBeLessThanOrEqual(0.55) // LIMITED_MODE_CONFIDENCE_CAP
      expect(c.confidenceBucket).not.toBe('high')
    }
  })

  it('OCR enriched candidates never auto-accept in batch', () => {
    const { runRuleEngine } = require('../services/pdfDetection/ruleEngine.js')
    const { adaptCandidates, batchAcceptGreen } = require('../services/pdfDetection/candidateAdapter.js')

    const analysis = makeAnalysis('raster', [
      makePage(1, 'raster', { textBlocks: [] }),
    ])
    const route = routePdfType(analysis)

    const ocrResult = makeOcrResult([{
      pageNumber: 1,
      textBlocks: [{ text: 'dugalj dugalj dugalj', x: 0, y: 0, w: 200, h: 12 }],
    }])
    const enriched = enrichAnalysisWithOcr(analysis, ocrResult)
    const { candidates } = runRuleEngine(enriched, route)

    if (candidates.length > 0) {
      const adapted = adaptCandidates(candidates, 'plan-1')
      const batched = batchAcceptGreen(adapted)

      // None should be auto-accepted
      for (const d of batched) {
        expect(d.accepted).toBe(false)
      }
    }
  })
})
