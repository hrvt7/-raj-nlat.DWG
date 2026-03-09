// ─── Recipe Matcher — NCC + Text Hint Hybrid ─────────────────────────────────
// Matches a SymbolRecipe against PDF page(s) using:
//   1. NCC template matching (primary — visual similarity)
//   2. Text hint proximity (secondary — nearby text overlap)
//   3. Aspect ratio validation (tertiary — shape sanity check)
//
// Reuses templateMatching.js NCC pipeline for visual matching.
// Reuses recipeStore.js for recipe + crop retrieval.
//
// Truth source: RecipeMatchCandidate[] — separate from DetectionCandidate[]
// ──────────────────────────────────────────────────────────────────────────────

import {
  detectTemplateOnPage,
  renderPageImageData,
  toGray,
  buildSAT,
} from '../../utils/templateMatching.js'
import { getRecipeCrop } from '../../data/recipeStore.js'
import { scoreTextHints, scoreAspectRatio, computeRecipeMatchConfidence } from './scoring.js'

// ── NCC matching threshold (lower than generic because user-taught + review) ──
const NCC_THRESHOLD = 0.55

// ── Max matches per recipe per page (safety cap) ──
const MAX_MATCHES_PER_PAGE = 50

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
 * @returns {Promise<Array<{
 *   x: number, y: number, score: number,
 *   nccScore: number, textHintScore: number, aspectScore: number,
 *   confidence: number, confidenceBucket: string, evidence: object
 * }>>}
 */
export async function matchRecipeOnPage(recipe, pdfPage, pageNum, cropDataUrl) {
  if (!cropDataUrl) return []

  // Build a template-compatible shape for detectTemplateOnPage
  const templateLike = {
    id: recipe.id,
    category: recipe.assemblyId || 'other',
    color: '#4CC9F0',
    imageDataUrl: cropDataUrl,
    label: recipe.label || recipe.assemblyName || '',
  }

  // Run NCC matching
  let nccDetections
  try {
    nccDetections = await detectTemplateOnPage(pdfPage, templateLike, 1, NCC_THRESHOLD)
  } catch {
    return [] // canvas/rendering failure
  }

  if (!nccDetections?.length) return []

  // Cap detections
  const capped = nccDetections.slice(0, MAX_MATCHES_PER_PAGE)

  // Recipe bbox aspect for aspect scoring
  const recipeAspect = recipe.bbox?.w && recipe.bbox?.h
    ? recipe.bbox.w / recipe.bbox.h
    : null

  // For each NCC detection, compute full confidence
  const results = []
  for (const det of capped) {
    // Estimate match bbox (centered on detection x,y)
    const matchBbox = {
      x: det.x - (recipe.bbox?.w || 20) / 2,
      y: det.y - (recipe.bbox?.h || 20) / 2,
      w: recipe.bbox?.w || 40,
      h: recipe.bbox?.h || 40,
    }

    // Text hint scoring
    const matchAreaText = await extractTextInBbox(pdfPage, matchBbox)
    const textHintScore = scoreTextHints(recipe.seedTextHints, matchAreaText)

    // Aspect scoring (match region vs recipe seed — for NCC with no scale change it's ~1.0)
    const matchAspect = matchBbox.w / matchBbox.h
    const aspectScore = scoreAspectRatio(recipeAspect, matchAspect)

    // Combined confidence
    const { confidence, confidenceBucket, evidence } = computeRecipeMatchConfidence({
      nccScore: det.score,
      textHintScore,
      aspectScore,
    })

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
    })
  }

  return results
}

/**
 * Match a single recipe against multiple pages (scope-aware).
 *
 * @param {Object} recipe — SymbolRecipe
 * @param {Object} pdfDoc — pdf.js document
 * @param {{ scope: 'current_page'|'whole_plan', currentPage?: number }} options
 * @param {Function|null} onProgress — (fraction, pageNum) => void
 * @returns {Promise<Array>} — raw match results across pages
 */
export async function matchRecipeOnPages(recipe, pdfDoc, options = {}, onProgress = null) {
  const cropDataUrl = await getRecipeCrop(recipe.id)
  if (!cropDataUrl) return []

  const { scope = 'whole_plan', currentPage = 1 } = options
  const numPages = pdfDoc.numPages

  const pageRange = scope === 'current_page'
    ? [currentPage]
    : Array.from({ length: numPages }, (_, i) => i + 1)

  const allResults = []

  for (let i = 0; i < pageRange.length; i++) {
    const pageNum = pageRange[i]
    const pdfPage = await pdfDoc.getPage(pageNum)
    const results = await matchRecipeOnPage(recipe, pdfPage, pageNum, cropDataUrl)
    allResults.push(...results)

    if (onProgress) onProgress((i + 1) / pageRange.length, pageNum)

    // Yield to keep UI responsive
    await new Promise(r => setTimeout(r, 0))
  }

  return allResults
}
