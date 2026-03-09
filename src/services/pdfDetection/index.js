// ─── PDF Detection Service — Entry Point ──────────────────────────────────────
// Bridges the PDF analysis pipeline and the rule-based detection engine.
//
// Flow:
//   1. Receive a PdfAnalysisResult (from analysisRunner / cache)
//   2. Run the deterministic rule engine → DetectionCandidate[]
//   3. Store candidates in the detection cache (IndexedDB)
//   4. Return lightweight summary for plan meta
//
// Truth source hierarchy:
//   - PdfAnalysisResult.symbols.items → raw provider output (input only)
//   - DetectionCandidate[] → rule engine output → single truth source for UI
// ──────────────────────────────────────────────────────────────────────────────

import localforage from 'localforage'
import { runRuleEngine } from './ruleEngine.js'
import { runProjectMemory } from './projectMemory.js'
import { routePdfType, DETECTION_MODE } from './pdfTypeRouter.js'
import { extractOcrText, enrichAnalysisWithOcr, extractOcrHints } from './ocrTextExtractor.js'
import { inferMetaFromText, mergeMeta } from '../../utils/planMetaInference.js'

// ── IndexedDB store for detection candidates ─────────────────────────────────

const detectionCandidateStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'detection_candidates',
  description: 'Rule engine detection candidates keyed by analysis cache key',
})

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run detection on a PdfAnalysisResult and persist candidates.
 * Includes both standard rule engine AND project memory matching.
 *
 * @param {import('../pdfAnalysis/types.js').PdfAnalysisResult} analysisResult
 * @param {string} analysisCacheKey — the analysis cache key (used to link detections)
 * @param {Object[]} [projectCustomSymbols=[]] — custom symbols from customSymbolStore
 * @param {ArrayBuffer|Uint8Array|null} [pdfData=null] — raw PDF bytes for OCR extraction on raster pages
 * @returns {Promise<{ candidates: import('./ruleEngine.js').DetectionCandidate[], meta: import('./ruleEngine.js').DetectionMeta }>}
 */
export async function detectSymbols(analysisResult, analysisCacheKey, projectCustomSymbols = [], pdfData = null) {
  // 0. Route PDF type → determines detection mode per page
  const routeResult = routePdfType(analysisResult)

  // 0b. OCR text extraction for raster/limited pages
  let ocrResult = null
  let enrichedAnalysis = analysisResult
  if (pdfData && routeResult.rasterPageNumbers.length > 0) {
    try {
      ocrResult = await extractOcrText(pdfData, routeResult)
      if (ocrResult.hasAnyText) {
        // Enrich raster pages with OCR text → rule engine gets textBlocks
        enrichedAnalysis = enrichAnalysisWithOcr(analysisResult, ocrResult)
      }
    } catch (err) {
      console.warn('[pdfDetection] OCR extraction failed:', err.message)
    }
  }

  // 0c. OCR metadata assist — use title block text for metadata inference
  let ocrMetaAssist = null
  if (ocrResult?.hasAnyText) {
    try {
      const hints = extractOcrHints(ocrResult)
      if (hints.titleBlockTexts.length > 0 || hints.allTexts.length > 0) {
        const ocrTexts = hints.titleBlockTexts.length > 0
          ? hints.titleBlockTexts
          : hints.allTexts.slice(0, 100)  // limit for perf
        ocrMetaAssist = inferMetaFromText(ocrTexts)
        if (ocrMetaAssist) {
          ocrMetaAssist.metaSource = 'ocr_text'
        }
      }
    } catch (err) {
      console.warn('[pdfDetection] OCR meta assist failed:', err.message)
    }
  }

  // 1. Standard rule engine (canonical symbol library) — route-aware
  //    Uses enriched analysis (with OCR textBlocks) for raster pages
  const { candidates: standardCandidates, meta } = runRuleEngine(enrichedAnalysis, routeResult)

  // Attach routing metadata to meta
  meta.detectionMode = routeResult.detectionMode
  meta.rasterPageNumbers = routeResult.rasterPageNumbers
  meta.limitedModeReasons = routeResult.limitedModeReasons

  // Attach OCR metadata to meta
  meta.ocrResult = ocrResult ? {
    hasAnyText: ocrResult.hasAnyText,
    pagesWithText: ocrResult.pagesWithText,
    pagesWithout: ocrResult.pagesWithout,
    summary: ocrResult.summary,
  } : null
  meta.ocrMetaAssist = ocrMetaAssist

  // 2. Project memory matching (custom symbols from this project)
  let allCandidates = [...standardCandidates]
  if (projectCustomSymbols.length > 0) {
    const { candidates: memoryCandidates } = runProjectMemory(
      projectCustomSymbols,
      analysisResult,
      standardCandidates,  // for dedup
    )
    if (memoryCandidates.length > 0) {
      allCandidates.push(...memoryCandidates)
      // Update meta counts
      for (const mc of memoryCandidates) {
        meta.totalCandidates++
        if (mc.confidenceBucket === 'high') meta.highConfidence++
        else if (mc.confidenceBucket === 'review') meta.reviewNeeded++
        else meta.lowConfidence++
      }
      if (!meta.evidenceSources.includes('project_memory')) {
        meta.evidenceSources.push('project_memory')
      }
    }
  }

  // Persist to IndexedDB (keyed by analysis cache key for 1:1 linkage)
  if (analysisCacheKey) {
    await detectionCandidateStore.setItem(analysisCacheKey, {
      candidates: allCandidates,
      meta,
      detectedAt: new Date().toISOString(),
    }).catch(err => {
      console.warn('[pdfDetection] candidate store write failed:', err.message)
    })
  }

  return { candidates: allCandidates, meta }
}

/**
 * Get cached detection candidates for an analysis cache key.
 *
 * @param {string} analysisCacheKey
 * @returns {Promise<{ candidates: import('./ruleEngine.js').DetectionCandidate[], meta: import('./ruleEngine.js').DetectionMeta }|null>}
 */
export async function getCachedDetection(analysisCacheKey) {
  try {
    return await detectionCandidateStore.getItem(analysisCacheKey)
  } catch {
    return null
  }
}

/**
 * Extract a detection summary safe for plan meta (localStorage).
 *
 * @param {import('./ruleEngine.js').DetectionMeta} meta
 * @returns {Object}
 */
export function extractDetectionSummary(meta) {
  if (!meta) return null
  return {
    totalCandidates: meta.totalCandidates || 0,
    highConfidence: meta.highConfidence || 0,
    reviewNeeded: meta.reviewNeeded || 0,
    lowConfidence: meta.lowConfidence || 0,
    detectedSymbolIds: meta.detectedSymbolIds || [],
    detectionMode: meta.detectionMode || 'full',
    rasterPageNumbers: meta.rasterPageNumbers || [],
    limitedModeReasons: meta.limitedModeReasons || [],
    // OCR info
    ocrResult: meta.ocrResult || null,
    ocrMetaAssist: meta.ocrMetaAssist || null,
  }
}

/**
 * Clear all cached detection candidates.
 */
export async function clearDetectionCache() {
  try {
    await detectionCandidateStore.clear()
  } catch (err) {
    console.warn('[pdfDetection] clear failed:', err.message)
  }
}
