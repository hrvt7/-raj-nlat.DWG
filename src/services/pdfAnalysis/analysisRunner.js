// ─── PDF Analysis Runner ──────────────────────────────────────────────────────
// Orchestrates the full PDF analysis lifecycle:
//   1. Check if analysis is needed (status, version, cache key)
//   2. Hash the file → build cache key → check cache
//   3. On miss: run analyzePdf() → store in IndexedDB cache
//   4. Extract summary → update plan meta with lightweight fields
//
// Trigger points:
//   - After PDF upload (via `triggerAnalysis`)
//   - When opening a plan that has fileType 'pdf' but no analysis (via `ensureAnalysis`)
//
// The runner is stateless — all persistence goes through planStore + analysisCache.
// ──────────────────────────────────────────────────────────────────────────────

import { analyzePdf, getActiveProvider } from './index.js'
import { ANALYSIS_VERSION } from './types.js'
import {
  buildCacheKey,
  getCachedAnalysis,
  setCachedAnalysis,
  extractSummary,
} from './analysisCache.js'
import { hashFile, getPlanFile, updatePlanMeta } from '../../data/planStore.js'

// ── Status constants ─────────────────────────────────────────────────────────

export const ANALYSIS_STATUS = /** @type {const} */ ({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
})

// ── In-flight tracking ───────────────────────────────────────────────────────
// Prevents duplicate parallel runs for the same plan.

/** @type {Map<string, Promise<import('./types.js').PdfAnalysisResult|null>>} */
const _inflight = new Map()

// ── Core runner ──────────────────────────────────────────────────────────────

/**
 * Run PDF analysis for a plan.  Handles caching, dedup, and plan meta updates.
 *
 * @param {string} planId
 * @param {File|Blob} file — the PDF file blob
 * @param {Object} [options]
 * @param {function} [options.onProgress] — progress callback (0–1)
 * @param {function} [options.onStatusChange] — called with (planId, status)
 * @returns {Promise<{ result: import('./types.js').PdfAnalysisResult|null, fromCache: boolean }>}
 */
export async function runAnalysis(planId, file, options = {}) {
  const { onProgress, onStatusChange } = options
  const provider = getActiveProvider()

  // 1. Dedup: if already running for this plan, await the existing promise
  if (_inflight.has(planId)) {
    const result = await _inflight.get(planId)
    return { result, fromCache: false }
  }

  const promise = _runAnalysisInner(planId, file, provider, onProgress, onStatusChange)
  _inflight.set(planId, promise)

  try {
    const out = await promise
    return out
  } finally {
    _inflight.delete(planId)
  }
}

/**
 * @private
 */
async function _runAnalysisInner(planId, file, provider, onProgress, onStatusChange) {
  const _notify = (status) => {
    if (onStatusChange) {
      try { onStatusChange(planId, status) } catch { /* ignore */ }
    }
  }

  try {
    // ── Mark running ──────────────────────────────────────────────────────
    _notify(ANALYSIS_STATUS.RUNNING)
    updatePlanMeta(planId, {
      pdfAnalysisStatus: ANALYSIS_STATUS.RUNNING,
      pdfAnalysisProvider: provider,
      pdfAnalysisVersion: ANALYSIS_VERSION,
      pdfAnalysisError: null,
    })

    // ── Hash file ─────────────────────────────────────────────────────────
    const fileHash = await hashFile(file)
    const cacheKey = buildCacheKey(fileHash, provider)

    // ── Cache check ───────────────────────────────────────────────────────
    const cached = await getCachedAnalysis(cacheKey)
    if (cached) {
      const summary = extractSummary(cached)
      updatePlanMeta(planId, {
        pdfAnalysisStatus: ANALYSIS_STATUS.DONE,
        pdfAnalysisProvider: provider,
        pdfAnalysisVersion: ANALYSIS_VERSION,
        pdfAnalysisCacheKey: cacheKey,
        pdfAnalysisSummary: summary,
        pdfAnalyzedAt: cached.generatedAt || new Date().toISOString(),
        pdfAnalysisError: null,
      })
      _notify(ANALYSIS_STATUS.DONE)
      return { result: cached, fromCache: true }
    }

    // ── Run analysis ──────────────────────────────────────────────────────
    const result = await analyzePdf(file, { onProgress })

    // ── Store in IndexedDB cache ──────────────────────────────────────────
    await setCachedAnalysis(cacheKey, result)

    // ── Update plan meta with summary ─────────────────────────────────────
    const summary = extractSummary(result)
    updatePlanMeta(planId, {
      pdfAnalysisStatus: ANALYSIS_STATUS.DONE,
      pdfAnalysisProvider: provider,
      pdfAnalysisVersion: ANALYSIS_VERSION,
      pdfAnalysisCacheKey: cacheKey,
      pdfAnalysisSummary: summary,
      pdfAnalyzedAt: result.generatedAt || new Date().toISOString(),
      pdfAnalysisError: null,
    })
    _notify(ANALYSIS_STATUS.DONE)

    return { result, fromCache: false }
  } catch (err) {
    console.error(`[pdfAnalysisRunner] analysis failed for plan ${planId}:`, err)

    updatePlanMeta(planId, {
      pdfAnalysisStatus: ANALYSIS_STATUS.FAILED,
      pdfAnalysisError: err.message || 'Unknown analysis error',
    })
    _notify(ANALYSIS_STATUS.FAILED)

    return { result: null, fromCache: false }
  }
}

// ── Convenience: trigger on upload ───────────────────────────────────────────

/**
 * Fire-and-forget analysis trigger.  Call after saving a PDF plan.
 * Updates plan meta status but does not block the upload flow.
 *
 * @param {string} planId
 * @param {File|Blob} file
 * @param {Object} [options]
 * @param {function} [options.onStatusChange]
 */
export function triggerAnalysis(planId, file, options = {}) {
  // Mark pending immediately (synchronous)
  updatePlanMeta(planId, {
    pdfAnalysisStatus: ANALYSIS_STATUS.PENDING,
    pdfAnalysisProvider: getActiveProvider(),
    pdfAnalysisVersion: ANALYSIS_VERSION,
  })

  // Run async — caller doesn't await
  runAnalysis(planId, file, options).catch(err => {
    console.warn(`[pdfAnalysisRunner] triggerAnalysis background error:`, err.message)
  })
}

// ── Convenience: ensure analysis on plan open ────────────────────────────────

/**
 * Check whether a plan needs analysis and run it if so.
 * Call when opening an existing PDF plan.
 *
 * @param {Object} plan — plan metadata object
 * @param {Object} [options]
 * @param {function} [options.onStatusChange]
 * @returns {Promise<{ result: import('./types.js').PdfAnalysisResult|null, fromCache: boolean, skipped: boolean }>}
 */
export async function ensureAnalysis(plan, options = {}) {
  // Only PDF plans
  if (plan.fileType !== 'pdf') {
    return { result: null, fromCache: false, skipped: true }
  }

  // Already done with current version + provider?
  if (needsAnalysis(plan) === false) {
    // Try to return cached result
    if (plan.pdfAnalysisCacheKey) {
      const cached = await getCachedAnalysis(plan.pdfAnalysisCacheKey)
      if (cached) return { result: cached, fromCache: true, skipped: false }
    }
    // Cache key exists but cache was evicted — re-run
  }

  // Get file blob from IndexedDB
  const file = await getPlanFile(plan.id)
  if (!file) {
    console.warn(`[pdfAnalysisRunner] no file blob for plan ${plan.id} — cannot analyze`)
    return { result: null, fromCache: false, skipped: true }
  }

  const out = await runAnalysis(plan.id, file, options)
  return { ...out, skipped: false }
}

// ── Decision helper ──────────────────────────────────────────────────────────

/**
 * Determine if a plan needs (re-)analysis.
 * Returns true if analysis should run, false if current analysis is sufficient.
 *
 * @param {Object} plan — plan metadata
 * @returns {boolean}
 */
export function needsAnalysis(plan) {
  // Non-PDF — never
  if (plan.fileType !== 'pdf') return false

  // No analysis yet
  if (!plan.pdfAnalysisStatus || plan.pdfAnalysisStatus === ANALYSIS_STATUS.PENDING) return true

  // Previous failure — allow retry
  if (plan.pdfAnalysisStatus === ANALYSIS_STATUS.FAILED) return true

  // Currently running — don't double-run
  if (plan.pdfAnalysisStatus === ANALYSIS_STATUS.RUNNING) return false

  // Done but version mismatch — re-analyze
  if (plan.pdfAnalysisVersion !== ANALYSIS_VERSION) return true

  // Done but provider changed
  if (plan.pdfAnalysisProvider !== getActiveProvider()) return true

  // Done and current
  return false
}
