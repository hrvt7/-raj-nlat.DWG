// ─── PDF Analysis Contract Tests ──────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import {
  ANALYSIS_VERSION,
  SOURCE_TYPES,
  SYSTEM_TYPES,
  DOC_TYPES,
  MATCH_TIERS,
  createPageAnalysis,
  createAnalysisResult,
  validateAnalysisResult,
} from '../services/pdfAnalysis/types.js'

describe('pdfAnalysis contract', () => {
  // ── Schema constants ────────────────────────────────────────────────────
  it('exports a semver analysisVersion', () => {
    expect(ANALYSIS_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('exports non-empty enum arrays', () => {
    expect(SOURCE_TYPES.length).toBeGreaterThan(0)
    expect(SYSTEM_TYPES.length).toBeGreaterThan(0)
    expect(DOC_TYPES.length).toBeGreaterThan(0)
    expect(MATCH_TIERS.length).toBeGreaterThan(0)
  })

  it('SOURCE_TYPES contains the four canonical types', () => {
    for (const t of ['vector', 'raster', 'mixed', 'unknown']) {
      expect(SOURCE_TYPES).toContain(t)
    }
  })

  // ── Factory: createPageAnalysis ─────────────────────────────────────────
  it('createPageAnalysis returns valid shape with correct page number', () => {
    const page = createPageAnalysis(3)
    expect(page.pageNumber).toBe(3)
    expect(page.width).toBe(0)
    expect(page.height).toBe(0)
    expect(page.sourceType).toBe('unknown')
    expect(Array.isArray(page.textBlocks)).toBe(true)
    expect(Array.isArray(page.drawings)).toBe(true)
    expect(Array.isArray(page.images)).toBe(true)
    expect(Array.isArray(page.detectedSymbols)).toBe(true)
    expect(Array.isArray(page.probableTitleBlockZones)).toBe(true)
    expect(Array.isArray(page.probableLegendZones)).toBe(true)
    expect(Array.isArray(page.warnings)).toBe(true)
  })

  // ── Factory: createAnalysisResult ───────────────────────────────────────
  it('createAnalysisResult returns valid shape', () => {
    const result = createAnalysisResult('testProvider')
    expect(result.analysisVersion).toBe(ANALYSIS_VERSION)
    expect(result.provider).toBe('testProvider')
    expect(result.sourceType).toBe('unknown')
    expect(result.pageCount).toBe(0)
    expect(Array.isArray(result.pages)).toBe(true)
    expect(result.metadata).toBeDefined()
    expect(result.symbols).toBeDefined()
    expect(result.cableEstimate).toBeDefined()
    expect(result.confidenceHints).toBeDefined()
    expect(Array.isArray(result.unsupportedReasons)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('createAnalysisResult sets generatedAt to ISO timestamp', () => {
    const result = createAnalysisResult('test')
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt)
  })

  // ── Validation ──────────────────────────────────────────────────────────
  it('validateAnalysisResult passes for factory-created result', () => {
    const { ok, reasons } = validateAnalysisResult(createAnalysisResult('x'))
    expect(ok).toBe(true)
    expect(reasons).toHaveLength(0)
  })

  it('validateAnalysisResult rejects null', () => {
    const { ok } = validateAnalysisResult(null)
    expect(ok).toBe(false)
  })

  it('validateAnalysisResult rejects empty object', () => {
    const { ok, reasons } = validateAnalysisResult({})
    expect(ok).toBe(false)
    expect(reasons.length).toBeGreaterThan(5)
  })

  it('validateAnalysisResult catches invalid sourceType', () => {
    const result = createAnalysisResult('test')
    result.sourceType = 'INVALID'
    const { ok, reasons } = validateAnalysisResult(result)
    expect(ok).toBe(false)
    expect(reasons.some(r => r.includes('sourceType'))).toBe(true)
  })

  it('validateAnalysisResult catches non-array pages', () => {
    const result = createAnalysisResult('test')
    result.pages = 'not an array'
    const { ok, reasons } = validateAnalysisResult(result)
    expect(ok).toBe(false)
    expect(reasons.some(r => r.includes('pages'))).toBe(true)
  })

  // ── Independence ────────────────────────────────────────────────────────
  it('two factory results do not share references', () => {
    const a = createAnalysisResult('a')
    const b = createAnalysisResult('b')
    a.pages.push(createPageAnalysis(1))
    a.warnings.push({ code: 'X', message: 'y', severity: 'info' })
    expect(b.pages).toHaveLength(0)
    expect(b.warnings).toHaveLength(0)
  })
})
