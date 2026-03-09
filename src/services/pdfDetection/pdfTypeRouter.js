// ─── PDF Type Router ──────────────────────────────────────────────────────────
// Decides detection strategy based on PDF sourceType.
//
// The router does NOT produce candidates — it configures HOW the rule engine
// runs (which evidence layers, confidence caps, review defaults) based on
// whether the PDF is vector, raster, mixed, or unknown.
//
// This module sits BETWEEN the analysis result and the rule engine:
//   PdfAnalysisResult → pdfTypeRouter → ruleEngine (configured) → DetectionCandidate[]
//
// Design constraints:
//   - Vector path is UNCHANGED — no regression
//   - Raster path is CONSERVATIVE — limited detection mode
//   - Mixed path routes per-page (vector pages full, raster pages limited)
//   - Router never produces its own candidates
//   - Truth source remains DetectionCandidate[]
// ──────────────────────────────────────────────────────────────────────────────

// ── Detection mode enum ─────────────────────────────────────────────────────

export const DETECTION_MODE = /** @type {const} */ ({
  FULL: 'full',         // vector PDF → all evidence layers active
  LIMITED: 'limited',   // raster / unknown → text + legacy only, capped confidence
  MIXED: 'mixed',       // mixed pages → per-page routing
})

// ── Confidence caps for limited mode ────────────────────────────────────────

/**
 * In limited mode, confidence is capped below the HIGH bucket threshold (0.7).
 * This ensures raster-sourced candidates ALWAYS require review.
 */
export const LIMITED_MODE_CONFIDENCE_CAP = 0.55

// ── Route decision ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} PageRouteDecision
 * @property {number}  pageNumber
 * @property {'full'|'limited'} mode
 * @property {string}  sourceType — the page's sourceType
 * @property {string[]} disabledLayers — evidence layers skipped in this mode
 */

/**
 * @typedef {Object} RouteResult
 * @property {'full'|'limited'|'mixed'} detectionMode — overall mode
 * @property {PageRouteDecision[]}      pageRoutes    — per-page decisions
 * @property {number[]}                 rasterPageNumbers — pages in limited mode
 * @property {string[]}                 limitedModeReasons — human-readable reasons
 * @property {number}                   confidenceCap — max confidence for limited pages
 */

/**
 * Determine the detection strategy for a PdfAnalysisResult.
 *
 * @param {import('../pdfAnalysis/types.js').PdfAnalysisResult} analysisResult
 * @returns {RouteResult}
 */
export function routePdfType(analysisResult) {
  if (!analysisResult || !analysisResult.pages || analysisResult.pages.length === 0) {
    return _limitedResult([], ['Nincs elemzési adat'])
  }

  const topSourceType = analysisResult.sourceType || 'unknown'

  // ── Fast path: pure vector ─────────────────────────────────────────────
  if (topSourceType === 'vector') {
    const pageRoutes = analysisResult.pages.map(p => ({
      pageNumber: p.pageNumber,
      mode: 'full',
      sourceType: 'vector',
      disabledLayers: [],
    }))
    return {
      detectionMode: DETECTION_MODE.FULL,
      pageRoutes,
      rasterPageNumbers: [],
      limitedModeReasons: [],
      confidenceCap: 1.0,
    }
  }

  // ── Fast path: pure raster or unknown ──────────────────────────────────
  if (topSourceType === 'raster' || topSourceType === 'unknown') {
    const reasons = topSourceType === 'raster'
      ? ['Szkennelt/raster PDF — nincs vektoros rajzi adat']
      : ['Ismeretlen PDF típus — konzervatív mód']

    const pageRoutes = analysisResult.pages.map(p => ({
      pageNumber: p.pageNumber,
      mode: 'limited',
      sourceType: topSourceType,
      disabledLayers: ['geometry'],
    }))

    return _limitedResult(pageRoutes, reasons)
  }

  // ── Mixed: per-page routing ────────────────────────────────────────────
  const pageRoutes = []
  const rasterPageNumbers = []

  for (const page of analysisResult.pages) {
    const pageType = page.sourceType || topSourceType
    const isVector = pageType === 'vector'

    pageRoutes.push({
      pageNumber: page.pageNumber,
      mode: isVector ? 'full' : 'limited',
      sourceType: pageType,
      disabledLayers: isVector ? [] : ['geometry'],
    })

    if (!isVector) {
      rasterPageNumbers.push(page.pageNumber)
    }
  }

  // If ALL pages ended up full despite mixed top-level → treat as full
  if (rasterPageNumbers.length === 0) {
    return {
      detectionMode: DETECTION_MODE.FULL,
      pageRoutes,
      rasterPageNumbers: [],
      limitedModeReasons: [],
      confidenceCap: 1.0,
    }
  }

  // If ALL pages ended up limited → treat as limited
  if (rasterPageNumbers.length === analysisResult.pages.length) {
    return _limitedResult(pageRoutes, ['Vegyes PDF — minden oldal raster'])
  }

  return {
    detectionMode: DETECTION_MODE.MIXED,
    pageRoutes,
    rasterPageNumbers,
    limitedModeReasons: [
      `Vegyes PDF — ${rasterPageNumbers.length} oldal raster/korlátozott módban`,
    ],
    confidenceCap: LIMITED_MODE_CONFIDENCE_CAP,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _limitedResult(pageRoutes, reasons) {
  return {
    detectionMode: DETECTION_MODE.LIMITED,
    pageRoutes,
    rasterPageNumbers: pageRoutes.map(p => p.pageNumber),
    limitedModeReasons: reasons,
    confidenceCap: LIMITED_MODE_CONFIDENCE_CAP,
  }
}

// ── Page-level query helpers ──────────────────────────────────────────────

/**
 * Check if a specific page is in limited mode.
 *
 * @param {RouteResult} routeResult
 * @param {number} pageNumber
 * @returns {boolean}
 */
export function isPageLimited(routeResult, pageNumber) {
  if (!routeResult || !routeResult.pageRoutes) return false
  const pageRoute = routeResult.pageRoutes.find(p => p.pageNumber === pageNumber)
  return pageRoute ? pageRoute.mode === 'limited' : false
}

/**
 * Check if geometry evidence is disabled for a page.
 *
 * @param {RouteResult} routeResult
 * @param {number} pageNumber
 * @returns {boolean}
 */
export function isGeometryDisabled(routeResult, pageNumber) {
  if (!routeResult || !routeResult.pageRoutes) return false
  const pageRoute = routeResult.pageRoutes.find(p => p.pageNumber === pageNumber)
  return pageRoute ? pageRoute.disabledLayers.includes('geometry') : false
}

/**
 * Get the confidence cap for a page (1.0 for full mode, LIMITED_MODE_CONFIDENCE_CAP for limited).
 *
 * @param {RouteResult} routeResult
 * @param {number} pageNumber
 * @returns {number}
 */
export function getPageConfidenceCap(routeResult, pageNumber) {
  if (!routeResult) return 1.0
  return isPageLimited(routeResult, pageNumber) ? LIMITED_MODE_CONFIDENCE_CAP : 1.0
}
