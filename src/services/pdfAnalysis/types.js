// ─── PDF Analysis Contract ────────────────────────────────────────────────────
// Parser-agnostic extraction schema.  Any PDF provider (legacy server API,
// future local vector parser, OCR engine, etc.) MUST return data conforming
// to this contract so consumers (detection, legend extraction, metadata
// inference, cable estimation) can work independently of the provider.
//
// IMPORTANT: This file is the single source of truth for the analysis shape.
// If you need to change the schema, bump analysisVersion.
// ──────────────────────────────────────────────────────────────────────────────

export const ANALYSIS_VERSION = '1.0.0'

// ── Enums / allowed values ──────────────────────────────────────────────────

/** How the PDF content was produced — drives downstream confidence & fallback decisions. */
export const SOURCE_TYPES = /** @type {const} */ (['vector', 'raster', 'mixed', 'unknown'])

/** Known electrical system types (shared with planMetaInference). */
export const SYSTEM_TYPES = /** @type {const} */ ([
  'power', 'lighting', 'fire_alarm', 'low_voltage', 'security', 'general',
])

/** Document types a plan page can represent. */
export const DOC_TYPES = /** @type {const} */ ([
  'floor_plan', 'legend', 'schematic', 'section', 'title_page', 'other',
])

/** Symbol detection match quality tiers. */
export const MATCH_TIERS = /** @type {const} */ (['exact', 'probable', 'uncertain'])

// ── Factory helpers ─────────────────────────────────────────────────────────

/**
 * Create a blank page analysis object.
 * @param {number} pageNumber — 1-based page index
 * @returns {PdfPageAnalysis}
 */
export function createPageAnalysis(pageNumber) {
  return {
    pageNumber,
    width: 0,         // PDF points (1 pt = 1/72 inch)
    height: 0,
    sourceType: 'unknown',

    textBlocks: [],    // { text, x, y, w, h, fontSize?, fontName? }
    drawings: [],      // { type:'path'|'rect'|'circle'|'line', points, stroke?, fill?, lineWidth? }
    images: [],        // { x, y, w, h, bitsPerComponent?, colorSpace? }

    detectedSymbols: [],          // { symbolType, x, y, w, h, confidence, matchTier, label?, asmId?, cableType? }
    probableTitleBlockZones: [],  // { x, y, w, h, confidence }
    probableLegendZones: [],      // { x, y, w, h, confidence }

    warnings: [],      // { code, message, severity:'info'|'warn'|'error' }
  }
}

/**
 * Create a blank top-level analysis result.
 * @param {string} provider — identifier of the analysis provider (e.g. 'legacy', 'vectorV2')
 * @returns {PdfAnalysisResult}
 */
export function createAnalysisResult(provider) {
  return {
    analysisVersion: ANALYSIS_VERSION,
    provider,
    generatedAt: new Date().toISOString(),

    sourceFile: {
      name: '',
      sizeBytes: 0,
      mimeType: 'application/pdf',
    },

    sourceType: 'unknown',  // overall doc source type (vector / raster / mixed / unknown)
    pageCount: 0,
    pages: [],               // PdfPageAnalysis[]

    metadata: {
      floor: null,
      floorLabel: null,
      systemType: null,
      docType: null,
      drawingNumber: null,
      revision: null,
      projectName: null,
      designer: null,
      confidence: 0,
    },

    symbols: {
      totalCount: 0,
      byType: {},            // { [symbolType]: count }
      items: [],             // flattened detectedSymbols from all pages
    },

    cableEstimate: {
      totalMeters: 0,
      byType: {},            // { [cableType]: meters }
      topology: null,        // 'star' | 'loop' | 'mixed' | null
      source: null,          // 'mst' | 'per_device' | 'provider' | null
    },

    confidenceHints: {
      overall: 0,            // 0–1 aggregate score
      metadata: 0,
      symbols: 0,
      cables: 0,
    },

    unsupportedReasons: [],  // string[] — why analysis might be partial
    warnings: [],            // { code, message, severity }
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Lightweight runtime check that a result object has the required top-level
 * keys.  Does NOT deep-validate every nested shape (that would be a full
 * JSON-schema lib).  Returns { ok, reasons }.
 */
export function validateAnalysisResult(result) {
  const reasons = []

  if (!result || typeof result !== 'object') {
    return { ok: false, reasons: ['result is not an object'] }
  }

  const required = [
    'analysisVersion', 'provider', 'generatedAt', 'sourceType',
    'pageCount', 'pages', 'metadata', 'symbols', 'cableEstimate',
    'confidenceHints',
  ]

  for (const key of required) {
    if (!(key in result)) reasons.push(`missing required key: ${key}`)
  }

  if (!SOURCE_TYPES.includes(result.sourceType)) {
    reasons.push(`invalid sourceType: ${result.sourceType}`)
  }

  if (!Array.isArray(result.pages)) {
    reasons.push('pages must be an array')
  }

  if (typeof result.pageCount !== 'number' || result.pageCount < 0) {
    reasons.push('pageCount must be a non-negative number')
  }

  return { ok: reasons.length === 0, reasons }
}

// ── JSDoc type definitions (no TypeScript, pure JSDoc) ──────────────────────

/**
 * @typedef {Object} PdfTextBlock
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} [fontSize]
 * @property {string} [fontName]
 */

/**
 * @typedef {Object} PdfDrawing
 * @property {'path'|'rect'|'circle'|'line'} type
 * @property {number[][]} points
 * @property {string} [stroke]
 * @property {string} [fill]
 * @property {number} [lineWidth]
 */

/**
 * @typedef {Object} PdfImage
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} [bitsPerComponent]
 * @property {string} [colorSpace]
 */

/**
 * @typedef {Object} DetectedSymbol
 * @property {string} symbolType
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} confidence — 0–1
 * @property {'exact'|'probable'|'uncertain'} matchTier
 * @property {string} [label]
 * @property {string} [asmId]
 * @property {string} [cableType]
 */

/**
 * @typedef {Object} Zone
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} confidence
 */

/**
 * @typedef {Object} AnalysisWarning
 * @property {string} code
 * @property {string} message
 * @property {'info'|'warn'|'error'} severity
 */

/**
 * @typedef {Object} PdfPageAnalysis
 * @property {number} pageNumber
 * @property {number} width
 * @property {number} height
 * @property {string} sourceType
 * @property {PdfTextBlock[]} textBlocks
 * @property {PdfDrawing[]} drawings
 * @property {PdfImage[]} images
 * @property {DetectedSymbol[]} detectedSymbols
 * @property {Zone[]} probableTitleBlockZones
 * @property {Zone[]} probableLegendZones
 * @property {AnalysisWarning[]} warnings
 */

/**
 * @typedef {Object} PdfAnalysisResult
 * @property {string} analysisVersion
 * @property {string} provider
 * @property {string} generatedAt
 * @property {{ name: string, sizeBytes: number, mimeType: string }} sourceFile
 * @property {string} sourceType
 * @property {number} pageCount
 * @property {PdfPageAnalysis[]} pages
 * @property {{ floor: string|null, floorLabel: string|null, systemType: string|null, docType: string|null, drawingNumber: string|null, revision: string|null, projectName: string|null, designer: string|null, confidence: number }} metadata
 * @property {{ totalCount: number, byType: Object, items: DetectedSymbol[] }} symbols
 * @property {{ totalMeters: number, byType: Object, topology: string|null, source: string|null }} cableEstimate
 * @property {{ overall: number, metadata: number, symbols: number, cables: number }} confidenceHints
 * @property {string[]} unsupportedReasons
 * @property {AnalysisWarning[]} warnings
 */
