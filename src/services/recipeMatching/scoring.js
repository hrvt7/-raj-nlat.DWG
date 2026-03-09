// ─── Recipe Match Scoring ─────────────────────────────────────────────────────
// Confidence scoring + bucketing for recipe-based symbol matching.
//
// This module is the recipe matching equivalent of ruleEngine.js scoring,
// but SEPARATE from it.  It reuses CONFIDENCE_BUCKET constants but applies
// recipe-specific scoring logic (NCC + text hint + aspect tolerance).
//
// Truth source: RecipeMatchCandidate[] — NOT DetectionCandidate[]
// ──────────────────────────────────────────────────────────────────────────────

import { CONFIDENCE_BUCKET, toBucket } from '../pdfDetection/ruleEngine.js'

// Re-export for consumer convenience
export { CONFIDENCE_BUCKET, toBucket }

// ── Score weights ────────────────────────────────────────────────────────────

const WEIGHT_NCC = 0.70        // template visual similarity (primary)
const WEIGHT_TEXT_HINT = 0.20  // nearby text match
const WEIGHT_ASPECT = 0.10    // bbox aspect ratio similarity

// ── Text hint scoring ────────────────────────────────────────────────────────

/**
 * Score text hint overlap between recipe seed hints and match-area text.
 * Simple word-level Jaccard overlap.
 *
 * @param {string[]} seedHints — text captured at recipe creation
 * @param {string[]} matchAreaText — text found near the match location
 * @returns {number} 0–1 score
 */
export function scoreTextHints(seedHints, matchAreaText) {
  if (!seedHints?.length || !matchAreaText?.length) return 0

  const seedSet = new Set(seedHints.map(h => h.toLowerCase().trim()).filter(Boolean))
  const matchSet = new Set(matchAreaText.map(t => t.toLowerCase().trim()).filter(Boolean))

  if (!seedSet.size || !matchSet.size) return 0

  let overlap = 0
  for (const s of seedSet) {
    for (const m of matchSet) {
      if (m.includes(s) || s.includes(m)) { overlap++; break }
    }
  }

  return Math.min(1, overlap / seedSet.size)
}

// ── Aspect ratio scoring ─────────────────────────────────────────────────────

/**
 * Score aspect ratio similarity between recipe bbox and match region.
 * Returns 1.0 for identical ratios, decays for divergence.
 * Tolerance: ±30% → full score; beyond that → rapid decay.
 *
 * @param {number} recipeAspect — w/h of original recipe bbox
 * @param {number} matchAspect — w/h of matched region
 * @returns {number} 0–1 score
 */
export function scoreAspectRatio(recipeAspect, matchAspect) {
  if (!recipeAspect || !matchAspect) return 0.5 // unknown → neutral
  const ratio = Math.min(recipeAspect, matchAspect) / Math.max(recipeAspect, matchAspect)
  // ratio is 0–1 where 1 = identical
  if (ratio >= 0.7) return 1.0       // within 30% tolerance
  if (ratio >= 0.5) return 0.6       // moderate mismatch
  return 0.2                          // significant mismatch
}

// ── Combined scoring ─────────────────────────────────────────────────────────

/**
 * Combine evidence into final recipe match confidence.
 *
 * @param {object} evidence
 * @param {number} evidence.nccScore — NCC similarity (0–1)
 * @param {number} evidence.textHintScore — text proximity overlap (0–1)
 * @param {number} evidence.aspectScore — aspect ratio similarity (0–1)
 * @returns {{ confidence: number, confidenceBucket: string, evidence: object }}
 */
export function computeRecipeMatchConfidence({ nccScore, textHintScore, aspectScore }) {
  const raw = (
    WEIGHT_NCC * nccScore +
    WEIGHT_TEXT_HINT * textHintScore +
    WEIGHT_ASPECT * aspectScore
  )

  const confidence = Math.max(0, Math.min(1, raw))
  const confidenceBucket = toBucket(confidence)

  return {
    confidence,
    confidenceBucket,
    evidence: {
      ncc: { score: nccScore, weight: WEIGHT_NCC },
      textHint: { score: textHintScore, weight: WEIGHT_TEXT_HINT },
      aspect: { score: aspectScore, weight: WEIGHT_ASPECT },
    },
  }
}
