// ─── PDF Analysis Service — Unified Entry Point ──────────────────────────────
// All PDF analysis consumers should use `analyzePdf()` from this module.
// Under the hood, it delegates to the active provider (legacy, vectorV2, etc.).
//
// Adding a new provider:
//   1. Create `src/services/pdfAnalysis/myProvider.js`
//   2. Export `{ analyze }` that returns a PdfAnalysisResult
//   3. Register it in PROVIDERS below
//   4. Switch ACTIVE_PROVIDER or implement selection logic
// ──────────────────────────────────────────────────────────────────────────────

import { validateAnalysisResult } from './types.js'
import { analyze as legacyAnalyze } from './legacyProvider.js'

// ── Provider registry ───────────────────────────────────────────────────────

/**
 * @typedef {Object} PdfProvider
 * @property {string} id
 * @property {string} label
 * @property {(file: File, options?: AnalyzeOptions) => Promise<import('./types.js').PdfAnalysisResult>} analyze
 */

/** @type {Record<string, PdfProvider>} */
const PROVIDERS = {
  legacy: {
    id: 'legacy',
    label: 'Legacy server API (Vision + Vector)',
    analyze: legacyAnalyze,
  },
  // Future providers go here:
  // vectorV2: { id: 'vectorV2', label: 'Local vector parser', analyze: vectorV2Analyze },
  // ocr:      { id: 'ocr',      label: 'OCR provider',        analyze: ocrAnalyze },
}

const ACTIVE_PROVIDER = 'legacy'

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AnalyzeOptions
 * @property {string}   [provider]   — override the active provider
 * @property {function} [onProgress] — progress callback (0–1)
 * @property {boolean}  [skipCables] — skip cable estimation
 * @property {boolean}  [skipMeta]   — skip metadata inference
 */

/**
 * Analyze a PDF file and return a parser-agnostic PdfAnalysisResult.
 *
 * @param {File} file — PDF File object
 * @param {AnalyzeOptions} [options]
 * @returns {Promise<import('./types.js').PdfAnalysisResult>}
 */
export async function analyzePdf(file, options = {}) {
  const providerId = options.provider || ACTIVE_PROVIDER
  const provider = PROVIDERS[providerId]

  if (!provider) {
    throw new Error(`[pdfAnalysis] Unknown provider: "${providerId}". Available: ${Object.keys(PROVIDERS).join(', ')}`)
  }

  const result = await provider.analyze(file, options)

  // Validate the result against the contract
  const { ok, reasons } = validateAnalysisResult(result)
  if (!ok) {
    console.warn(`[pdfAnalysis] Provider "${providerId}" returned non-conforming result:`, reasons)
    // Don't throw — provider results may be partial but still useful.
    // Consumers should check confidenceHints / warnings.
  }

  return result
}

/**
 * List available providers.
 * @returns {{ id: string, label: string }[]}
 */
export function listProviders() {
  return Object.values(PROVIDERS).map(p => ({ id: p.id, label: p.label }))
}

/**
 * Get the currently active provider ID.
 * @returns {string}
 */
export function getActiveProvider() {
  return ACTIVE_PROVIDER
}
