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
 * @returns {Promise<{ candidates: import('./ruleEngine.js').DetectionCandidate[], meta: import('./ruleEngine.js').DetectionMeta }>}
 */
export async function detectSymbols(analysisResult, analysisCacheKey, projectCustomSymbols = []) {
  // 1. Standard rule engine (canonical symbol library)
  const { candidates: standardCandidates, meta } = runRuleEngine(analysisResult)

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
