// ─── Recipe Matcher — NCC + Text Hint Hybrid ─────────────────────────────────
// Matches a SymbolRecipe against PDF page(s) using:
//   1. NCC template matching (primary — visual similarity)
//   2. Text hint proximity (secondary — nearby text overlap)
//   3. Aspect ratio validation (tertiary — shape sanity check)
//
// Reuses templateMatching.js NCC pipeline for visual matching.
// Reuses recipeStore.js for recipe + crop retrieval.
//
// Quality guards (v2):
//   - Min seed area filter (skip tiny seeds)
//   - Per-page match cap (30)
//   - Cross-recipe proximity dedup (15 px radius)
//   - Total match safety limit (200 for whole_plan)
//   - Scope-aware confidence penalty
//
// Truth source: RecipeMatchCandidate[] — separate from DetectionCandidate[]
// ──────────────────────────────────────────────────────────────────────────────

import {
  detectTemplateOnPage,
  renderPageImageData,
  toGray,
  buildSAT,
  DETECTION_SCALE,
} from '../../utils/templateMatching.js'
import { getRecipeCrop } from '../../data/recipeStore.js'
import {
  scoreTextHints,
  scoreAspectRatio,
  computeRecipeMatchConfidence,
  isSeedTooSmall,
  resolveStrictnessPreset,
} from './scoring.js'

// ── NCC matching threshold (lower than generic because user-taught + review) ──
const NCC_THRESHOLD_BASE = 0.55

// ── Safety caps ──────────────────────────────────────────────────────────────
const MAX_MATCHES_PER_PAGE_DEFAULT = 30          // was 50 — reduced to cut noise
export const MAX_TOTAL_MATCHES = 200     // whole_plan safety limit

// ── Proximity dedup radius ──────────────────────────────────────────────────
export const DEDUP_RADIUS_PX = 15        // matches within this distance → keep higher confidence

/**
 * Extract text items in a bbox region from a PDF page.
 * Same pattern as PdfViewer's finalizeSeedCapture.
 *
 * @param {Object} pdfPage — pdf.js page object
 * @param {{ x: number, y: number, w: number, h: number }} bbox — PDF coord bbox
 * @returns {Promise<string[]>} text items found in bbox
 */
async function extractTextInBbox(pdfPage, bbox) {
  try {
    const textContent = await pdfPage.getTextContent()
    const vp = pdfPage.getViewport({ scale: 1 })
    const hints = []

    for (const item of textContent.items) {
      if (!item.str?.trim()) continue
      const tx = item.transform[4]
      const ty = vp.height - item.transform[5]
      // Check if text item center is within or near the bbox (with margin)
      const margin = Math.max(bbox.w, bbox.h) * 0.5
      if (tx >= bbox.x - margin && tx <= bbox.x + bbox.w + margin &&
          ty >= bbox.y - margin && ty <= bbox.y + bbox.h + margin) {
        hints.push(item.str.trim())
      }
    }

    return hints.slice(0, 20)
  } catch {
    return []
  }
}

/**
 * Match a single SymbolRecipe against a single PDF page.
 *
 * @param {Object} recipe — SymbolRecipe from recipeStore
 * @param {Object} pdfPage — pdf.js page object
 * @param {number} pageNum — 1-based page number
 * @param {string|null} cropDataUrl — recipe crop data URL (pre-fetched)
 * @param {object} [scopeOpts] — scope-aware modifiers
 * @param {boolean} [scopeOpts.isWholePlan=false] — apply scope penalty
 * @returns {Promise<Array<{
 *   x: number, y: number, score: number,
 *   nccScore: number, textHintScore: number, aspectScore: number,
 *   confidence: number, confidenceBucket: string, evidence: object
 * }>>}
 */
export async function matchRecipeOnPage(recipe, pdfPage, pageNum, cropDataUrl, scopeOpts = {}, strictnessOpts = {}) {
  if (!cropDataUrl) return []

  // Quality guard: skip tiny seeds that produce noisy NCC matches
  if (isSeedTooSmall(recipe.bbox)) return []

  // Build a template-compatible shape for detectTemplateOnPage
  const templateLike = {
    id: recipe.id,
    category: recipe.assemblyId || 'other',
    color: '#4CC9F0',
    imageDataUrl: cropDataUrl,
    label: recipe.label || recipe.assemblyName || '',
  }

  // Resolve strictness preset for this recipe
  const preset = resolveStrictnessPreset(strictnessOpts.matchStrictness)
  const isCurrentPage = scopeOpts.isCurrentPage === true
  // Current-page rescue path: lower threshold for same-page matching (seed is from this page)
  const currentPageBonus = isCurrentPage ? -0.08 : 0
  const effectiveNccThreshold = NCC_THRESHOLD_BASE + preset.nccThresholdDelta + currentPageBonus
  const effectiveMaxPerPage = preset.maxMatchesPerPage || MAX_MATCHES_PER_PAGE_DEFAULT

  // Run NCC matching at DETECTION_SCALE (=2, matches seed capture resolution)
  let nccDetections
  try {
    nccDetections = await detectTemplateOnPage(pdfPage, templateLike, DETECTION_SCALE, effectiveNccThreshold)
  } catch {
    return [] // canvas/rendering failure
  }

  if (!nccDetections?.length) return []

  // Cap detections per page
  const capped = nccDetections.slice(0, effectiveMaxPerPage)

  // Recipe bbox aspect for aspect scoring
  const recipeAspect = recipe.bbox?.w && recipe.bbox?.h
    ? recipe.bbox.w / recipe.bbox.h
    : null

  const { isWholePlan = false } = scopeOpts
  const scopePenaltyMul = preset.scopePenaltyMul || 1.0

  // For each NCC detection, compute full confidence
  const results = []
  for (const det of capped) {
    // Use actual matched region size if available (from trimmed template),
    // fall back to original recipe bbox for backward compat
    const bboxW = det.matchW || recipe.bbox?.w || 40
    const bboxH = det.matchH || recipe.bbox?.h || 40
    // Estimate match bbox (centered on detection x,y — which is now correctly offset)
    const matchBbox = {
      x: det.x - bboxW / 2,
      y: det.y - bboxH / 2,
      w: bboxW,
      h: bboxH,
    }

    // Text hint scoring
    const matchAreaText = await extractTextInBbox(pdfPage, matchBbox)
    const textHintScore = scoreTextHints(recipe.seedTextHints, matchAreaText)

    // Aspect scoring (match region vs recipe seed — for NCC with no scale change it's ~1.0)
    const matchAspect = matchBbox.w / matchBbox.h
    const aspectScore = scoreAspectRatio(recipeAspect, matchAspect)

    // Combined confidence with quality modifiers
    const { confidence, confidenceBucket, evidence } = computeRecipeMatchConfidence(
      { nccScore: det.score, textHintScore, aspectScore },
      { seedBbox: recipe.bbox, isWholePlan, scopePenaltyMul },
    )

    results.push({
      x: det.x,
      y: det.y,
      pageNum,
      nccScore: det.score,
      textHintScore,
      aspectScore,
      confidence,
      confidenceBucket,
      evidence,
      matchBbox,
      recipeId: recipe.id,
    })
  }

  return results
}

/**
 * Proximity-based deduplication across ALL matches (from any recipe).
 * If two matches are within DEDUP_RADIUS_PX of each other (Euclidean),
 * keep only the one with higher confidence.
 *
 * @param {Array} matches — raw match results (must have x, y, confidence, pageNum)
 * @returns {Array} — deduplicated matches
 */
export function deduplicateMatchesByProximity(matches) {
  if (!matches?.length) return []

  // Sort by confidence desc so we keep the best match in each cluster
  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence)
  const kept = []
  const radiusSq = DEDUP_RADIUS_PX * DEDUP_RADIUS_PX

  for (const m of sorted) {
    let isDuplicate = false
    for (const k of kept) {
      // Only compare matches on the same page
      if (k.pageNum !== m.pageNum) continue
      const dx = k.x - m.x
      const dy = k.y - m.y
      if (dx * dx + dy * dy < radiusSq) {
        isDuplicate = true
        break
      }
    }
    if (!isDuplicate) kept.push(m)
  }

  return kept
}

/**
 * Match a single recipe against multiple pages (scope-aware).
 *
 * @param {Object} recipe — SymbolRecipe
 * @param {Object} pdfDoc — pdf.js document
 * @param {{ scope: 'current_page'|'whole_plan', currentPage?: number, searchRegion?: { x: number, y: number, w: number, h: number } }} options
 * @param {Function|null} onProgress — (fraction, pageNum) => void
 * @returns {Promise<Array>} — raw match results across pages
 */
export async function matchRecipeOnPages(recipe, pdfDoc, options = {}, onProgress = null) {
  const cropDataUrl = await getRecipeCrop(recipe.id)
  if (!cropDataUrl) {
    console.warn('[matcher] no crop found for recipe:', recipe.id, recipe.label)
    return []
  }

  const { scope = 'whole_plan', currentPage = 1, searchRegion = null } = options
  // searchRegion: optional PDF scale=1 bbox to restrict matching area (future use)
  const numPages = pdfDoc.numPages
  const isWholePlan = scope !== 'current_page'

  const pageRange = scope === 'current_page'
    ? [currentPage]
    : Array.from({ length: numPages }, (_, i) => i + 1)

  const allResults = []

  for (let i = 0; i < pageRange.length; i++) {
    const pageNum = pageRange[i]
    const pdfPage = await pdfDoc.getPage(pageNum)
    const isCurrentPage = !isWholePlan && pageNum === currentPage
    const results = await matchRecipeOnPage(recipe, pdfPage, pageNum, cropDataUrl, { isWholePlan, isCurrentPage })
    allResults.push(...results)

    if (onProgress) onProgress((i + 1) / pageRange.length, pageNum)

    // Yield to keep UI responsive
    await new Promise(r => setTimeout(r, 0))

    // Safety: abort early if we've already hit the total limit
    if (isWholePlan && allResults.length >= MAX_TOTAL_MATCHES) break
  }

  return allResults
}
