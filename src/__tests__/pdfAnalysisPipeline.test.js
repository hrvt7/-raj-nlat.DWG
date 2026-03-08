// ─── PDF Analysis Pipeline Tests ──────────────────────────────────────────────
// Tests for: analysisCache, analysisRunner decision logic, summary extraction,
// and plan meta integration.
//
// NOTE: These tests do NOT call the actual server APIs.  They test the
// orchestration layer (cache, runner decisions, summary shape).
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildCacheKey,
  extractSummary,
} from '../services/pdfAnalysis/analysisCache.js'
import {
  needsAnalysis,
  ANALYSIS_STATUS,
} from '../services/pdfAnalysis/analysisRunner.js'
import {
  ANALYSIS_VERSION,
  createAnalysisResult,
  createPageAnalysis,
} from '../services/pdfAnalysis/types.js'

// ── Cache key tests ──────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('produces a deterministic key from hash + provider + version', () => {
    const key = buildCacheKey('abc123', 'legacy')
    expect(key).toBe(`abc123:legacy:${ANALYSIS_VERSION}`)
  })

  it('different hashes produce different keys', () => {
    const a = buildCacheKey('aaa', 'legacy')
    const b = buildCacheKey('bbb', 'legacy')
    expect(a).not.toBe(b)
  })

  it('different providers produce different keys', () => {
    const a = buildCacheKey('abc', 'legacy')
    const b = buildCacheKey('abc', 'vectorV2')
    expect(a).not.toBe(b)
  })

  it('key contains all three segments', () => {
    const key = buildCacheKey('hash', 'prov')
    const parts = key.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('hash')
    expect(parts[1]).toBe('prov')
    expect(parts[2]).toBe(ANALYSIS_VERSION)
  })
})

// ── Summary extraction tests ─────────────────────────────────────────────────

describe('extractSummary', () => {
  it('returns null for null input', () => {
    expect(extractSummary(null)).toBeNull()
  })

  it('extracts correct shape from a factory result', () => {
    const result = createAnalysisResult('test')
    const summary = extractSummary(result)

    expect(summary).toEqual({
      sourceType: 'unknown',
      pageCount: 0,
      textBlockCount: 0,
      drawingCount: 0,
      titleBlockZoneCount: 0,
      legendZoneCount: 0,
      symbolCount: 0,
      cableTotalMeters: 0,
      overallConfidence: 0,
      hasWarnings: false,
    })
  })

  it('counts page-level data from first page', () => {
    const result = createAnalysisResult('test')
    const page = createPageAnalysis(1)
    page.textBlocks = [{ text: 'A', x: 0, y: 0, w: 10, h: 10 }, { text: 'B', x: 0, y: 0, w: 10, h: 10 }]
    page.drawings = [{ type: 'line', points: [] }]
    page.probableTitleBlockZones = [{ x: 0, y: 0, w: 100, h: 50, confidence: 0.8 }]
    page.probableLegendZones = [{ x: 0, y: 0, w: 80, h: 40, confidence: 0.7 }, { x: 0, y: 0, w: 80, h: 40, confidence: 0.6 }]
    result.pages = [page]
    result.pageCount = 1
    result.sourceType = 'vector'
    result.symbols.totalCount = 5
    result.cableEstimate.totalMeters = 42.5
    result.confidenceHints.overall = 0.75
    result.warnings = [{ code: 'W1', message: 'test', severity: 'warn' }]

    const summary = extractSummary(result)
    expect(summary.sourceType).toBe('vector')
    expect(summary.pageCount).toBe(1)
    expect(summary.textBlockCount).toBe(2)
    expect(summary.drawingCount).toBe(1)
    expect(summary.titleBlockZoneCount).toBe(1)
    expect(summary.legendZoneCount).toBe(2)
    expect(summary.symbolCount).toBe(5)
    expect(summary.cableTotalMeters).toBe(42.5)
    expect(summary.overallConfidence).toBe(0.75)
    expect(summary.hasWarnings).toBe(true)
  })

  it('summary fields are all primitive (safe for localStorage)', () => {
    const result = createAnalysisResult('test')
    result.pages = [createPageAnalysis(1)]
    const summary = extractSummary(result)

    for (const [key, value] of Object.entries(summary)) {
      const t = typeof value
      expect(['string', 'number', 'boolean'].includes(t)).toBe(true)
    }
  })
})

// ── needsAnalysis decision tests ─────────────────────────────────────────────

describe('needsAnalysis', () => {
  it('returns false for non-PDF plan', () => {
    expect(needsAnalysis({ fileType: 'dxf' })).toBe(false)
    expect(needsAnalysis({ fileType: 'dwg' })).toBe(false)
  })

  it('returns true for PDF with no analysis status', () => {
    expect(needsAnalysis({ fileType: 'pdf' })).toBe(true)
  })

  it('returns true for PDF with pending status', () => {
    expect(needsAnalysis({ fileType: 'pdf', pdfAnalysisStatus: 'pending' })).toBe(true)
  })

  it('returns true for PDF with failed status (allow retry)', () => {
    expect(needsAnalysis({ fileType: 'pdf', pdfAnalysisStatus: 'failed' })).toBe(true)
  })

  it('returns false for PDF currently running', () => {
    expect(needsAnalysis({ fileType: 'pdf', pdfAnalysisStatus: 'running' })).toBe(false)
  })

  it('returns false for done + current version + current provider', () => {
    expect(needsAnalysis({
      fileType: 'pdf',
      pdfAnalysisStatus: 'done',
      pdfAnalysisVersion: ANALYSIS_VERSION,
      pdfAnalysisProvider: 'legacy',
    })).toBe(false)
  })

  it('returns true for done but outdated version', () => {
    expect(needsAnalysis({
      fileType: 'pdf',
      pdfAnalysisStatus: 'done',
      pdfAnalysisVersion: '0.9.0',
      pdfAnalysisProvider: 'legacy',
    })).toBe(true)
  })

  it('returns true for done but different provider', () => {
    expect(needsAnalysis({
      fileType: 'pdf',
      pdfAnalysisStatus: 'done',
      pdfAnalysisVersion: ANALYSIS_VERSION,
      pdfAnalysisProvider: 'vectorV2',
    })).toBe(true)
  })
})

// ── ANALYSIS_STATUS constants ────────────────────────────────────────────────

describe('ANALYSIS_STATUS', () => {
  it('exports all four statuses', () => {
    expect(ANALYSIS_STATUS.PENDING).toBe('pending')
    expect(ANALYSIS_STATUS.RUNNING).toBe('running')
    expect(ANALYSIS_STATUS.DONE).toBe('done')
    expect(ANALYSIS_STATUS.FAILED).toBe('failed')
  })
})
