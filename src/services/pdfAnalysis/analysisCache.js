// ─── PDF Analysis Cache ────────────────────────────────────────────────────────
// Stores full PdfAnalysisResult objects in IndexedDB (via localforage).
// The plan object only stores a lightweight cache key + summary — not the
// full analysis blob.  This avoids bloating localStorage.
//
// Cache key format: `{fileHash}:{provider}:{analysisVersion}`
// This ensures automatic invalidation when provider or schema version changes.
// ──────────────────────────────────────────────────────────────────────────────

import localforage from 'localforage'
import { ANALYSIS_VERSION } from './types.js'

// ── IndexedDB store ──────────────────────────────────────────────────────────

const analysisStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'pdf_analysis_cache',
  description: 'Full PDF analysis results (keyed by fileHash:provider:version)',
})

// ── Cache key ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key from file hash + provider + version.
 * @param {string} fileHash — SHA-256 hex
 * @param {string} provider — e.g. 'legacy'
 * @returns {string}
 */
export function buildCacheKey(fileHash, provider) {
  return `${fileHash}:${provider}:${ANALYSIS_VERSION}`
}

// ── Read / Write ─────────────────────────────────────────────────────────────

/**
 * Get a cached analysis result.
 * @param {string} cacheKey
 * @returns {Promise<import('./types.js').PdfAnalysisResult|null>}
 */
export async function getCachedAnalysis(cacheKey) {
  try {
    return await analysisStore.getItem(cacheKey)
  } catch (err) {
    console.warn('[pdfAnalysisCache] read failed:', err.message)
    return null
  }
}

/**
 * Store an analysis result in the cache.
 * @param {string} cacheKey
 * @param {import('./types.js').PdfAnalysisResult} result
 */
export async function setCachedAnalysis(cacheKey, result) {
  try {
    await analysisStore.setItem(cacheKey, {
      ...result,
      _cachedAt: Date.now(),
    })
  } catch (err) {
    console.warn('[pdfAnalysisCache] write failed:', err.message)
  }
}

/**
 * Remove a specific cached analysis.
 * @param {string} cacheKey
 */
export async function removeCachedAnalysis(cacheKey) {
  try {
    await analysisStore.removeItem(cacheKey)
  } catch (err) {
    console.warn('[pdfAnalysisCache] remove failed:', err.message)
  }
}

// ── Summary extraction ───────────────────────────────────────────────────────

/**
 * Extract a lightweight summary from a full PdfAnalysisResult.
 * This summary is safe to store on the plan object in localStorage.
 *
 * @param {import('./types.js').PdfAnalysisResult} result
 * @returns {PdfAnalysisSummary}
 */
export function extractSummary(result) {
  if (!result) return null

  const page0 = result.pages?.[0]
  return {
    sourceType: result.sourceType || 'unknown',
    pageCount: result.pageCount || 0,
    textBlockCount: page0?.textBlocks?.length || 0,
    drawingCount: page0?.drawings?.length || 0,
    titleBlockZoneCount: page0?.probableTitleBlockZones?.length || 0,
    legendZoneCount: page0?.probableLegendZones?.length || 0,
    symbolCount: result.symbols?.totalCount || 0,
    cableTotalMeters: result.cableEstimate?.totalMeters || 0,
    overallConfidence: result.confidenceHints?.overall || 0,
    hasWarnings: (result.warnings?.length || 0) > 0,
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Clear the entire analysis cache.  Useful for dev/debug.
 */
export async function clearAnalysisCache() {
  try {
    await analysisStore.clear()
  } catch (err) {
    console.warn('[pdfAnalysisCache] clear failed:', err.message)
  }
}

// ── JSDoc ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PdfAnalysisSummary
 * @property {string} sourceType
 * @property {number} pageCount
 * @property {number} textBlockCount
 * @property {number} drawingCount
 * @property {number} titleBlockZoneCount
 * @property {number} legendZoneCount
 * @property {number} symbolCount
 * @property {number} cableTotalMeters
 * @property {number} overallConfidence
 * @property {boolean} hasWarnings
 */
