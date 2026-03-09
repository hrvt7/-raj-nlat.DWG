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

// ── Quality guard: minimum seed area ─────────────────────────────────────────
// Seeds smaller than this (in PDF px²) are too small for reliable NCC matching.
// They match too many regions and produce false positives.
export const MIN_SEED_AREA = 100  // 10×10 px minimum

// ── Scope penalty ────────────────────────────────────────────────────────────
// Whole-plan matching is noisier than single-page matching.
// Apply a small confidence penalty to shift borderline results to a
// more conservative bucket, reducing false positives in whole_plan scope.
export const SCOPE_PENALTY_WHOLE_PLAN = 0.05

// ── Strictness presets ──────────────────────────────────────────────────
// Recipe-level matching tuning. Each preset adjusts NCC threshold,
// per-page cap, and scope penalty multiplier.
//
// 'strict'   — fewer false positives, may miss faint symbols
// 'balanced' — default behavior (backward compat)
// 'broad'    — catches more, but needs more review
//
export const STRICTNESS_PRESETS = {
  strict:   { nccThresholdDelta: +0.10, maxMatchesPerPage: 15, scopePenaltyMul: 2.0 },
  balanced: { nccThresholdDelta:  0.00, maxMatchesPerPage: 30, scopePenaltyMul: 1.0 },
  broad:    { nccThresholdDelta: -0.08, maxMatchesPerPage: 50, scopePenaltyMul: 0.5 },
}

/**
 * Resolve strictness preset parameters.
 * Falls back to 'balanced' for unknown values.
 * @param {string|null|undefined} strictness
 * @returns {{ nccThresholdDelta: number, maxMatchesPerPage: number, scopePenaltyMul: number }}
 */
export function resolveStrictnessPreset(strictness) {
  return STRICTNESS_PRESETS[strictness] || STRICTNESS_PRESETS.balanced
}

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

// ── Seed area penalty ────────────────────────────────────────────────────────

/**
 * Compute a penalty multiplier for undersized seeds.
 * Seeds below MIN_SEED_AREA get a harsh penalty, those just above get moderate.
 * Returns 1.0 (no penalty) when bbox is not provided — backward compat.
 *
 * @param {{ w: number, h: number }|null|undefined} bbox — recipe seed bounding box
 * @returns {number} 0–1 multiplier (1.0 = no penalty)
 */
export function seedAreaPenalty(bbox) {
  if (bbox === null || bbox === undefined) return 1.0 // not provided → no penalty (backward compat)
  if (!bbox.w || !bbox.h) return 0.7 // provided but invalid → moderate penalty
  const area = bbox.w * bbox.h
  if (area >= MIN_SEED_AREA * 2) return 1.0  // healthy size, no penalty
  if (area >= MIN_SEED_AREA) return 0.85     // borderline, slight penalty
  return 0.5                                  // too small, heavy penalty
}

/**
 * Check if a seed is too small to match reliably.
 * @param {{ w: number, h: number }|null} bbox
 * @returns {boolean}
 */
export function isSeedTooSmall(bbox) {
  if (!bbox?.w || !bbox?.h) return false // unknown → allow, penalty handles it
  return (bbox.w * bbox.h) < MIN_SEED_AREA
}

// ── Combined scoring ─────────────────────────────────────────────────────────

/**
 * Combine evidence into final recipe match confidence.
 *
 * @param {object} evidence
 * @param {number} evidence.nccScore — NCC similarity (0–1)
 * @param {number} evidence.textHintScore — text proximity overlap (0–1)
 * @param {number} evidence.aspectScore — aspect ratio similarity (0–1)
 * @param {object} [modifiers]
 * @param {{ w: number, h: number }|null} [modifiers.seedBbox] — for area penalty
 * @param {boolean} [modifiers.isWholePlan=false] — scope penalty
 * @returns {{ confidence: number, confidenceBucket: string, evidence: object }}
 */
export function computeRecipeMatchConfidence({ nccScore, textHintScore, aspectScore }, modifiers = {}) {
  const { seedBbox = null, isWholePlan = false, scopePenaltyMul = 1.0 } = modifiers

  const raw = (
    WEIGHT_NCC * nccScore +
    WEIGHT_TEXT_HINT * textHintScore +
    WEIGHT_ASPECT * aspectScore
  )

  // Apply seed area penalty (undersized seeds get reduced confidence)
  const areaMul = seedAreaPenalty(seedBbox)

  // Apply scope penalty (whole_plan is noisier)
  const scopePen = isWholePlan ? (SCOPE_PENALTY_WHOLE_PLAN * scopePenaltyMul) : 0

  const confidence = Math.max(0, Math.min(1, raw * areaMul - scopePen))
  const confidenceBucket = toBucket(confidence)

  return {
    confidence,
    confidenceBucket,
    evidence: {
      ncc: { score: nccScore, weight: WEIGHT_NCC },
      textHint: { score: textHintScore, weight: WEIGHT_TEXT_HINT },
      aspect: { score: aspectScore, weight: WEIGHT_ASPECT },
      areaPenalty: areaMul,
      scopePenalty: scopePen,
    },
  }
}
