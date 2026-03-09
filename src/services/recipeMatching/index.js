// ─── Recipe Matching Service — Entry Point ────────────────────────────────────
// Orchestrates recipe-based symbol matching and produces RecipeMatchCandidate[].
//
// This is the recipe matching equivalent of pdfDetection/index.js,
// but operates on a COMPLETELY SEPARATE truth source.
//
// Input:  SymbolRecipe[] + pdfDoc
// Output: RecipeMatchCandidate[] — separate from DetectionCandidate[]
//
// Integration:
//   - Called from PdfViewer when user triggers recipe matching
//   - Results displayed as overlay + review panel
//   - Accepted matches → createMarker() with source='recipe_match'
// ──────────────────────────────────────────────────────────────────────────────

import { matchRecipeOnPages } from './matcher.js'
import { CONFIDENCE_BUCKET, toBucket } from './scoring.js'
import { incrementRecipeUsage, RECIPE_SCOPE } from '../../data/recipeStore.js'

// Re-export for consumers
export { CONFIDENCE_BUCKET, toBucket }

// ── RecipeMatchCandidate shape ───────────────────────────────────────────────

let _seq = 0

/**
 * Generate a unique candidate ID.
 * Prefix: RMC- (Recipe Match Candidate) — distinct from DC- (DetectionCandidate)
 */
function generateCandidateId() {
  return `RMC-${Date.now().toString(36)}-${(++_seq).toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

/**
 * Create a RecipeMatchCandidate from raw match result + recipe context.
 *
 * @param {Object} match — raw match from matcher.js
 * @param {Object} recipe — source SymbolRecipe
 * @param {string} planId — plan being matched
 * @returns {Object} RecipeMatchCandidate
 */
export function createMatchCandidate(match, recipe, planId) {
  return {
    // ── Identity ──
    id: generateCandidateId(),
    recipeId: recipe.id,

    // ── Spatial ──
    planId,
    pageNumber: match.pageNum,
    x: match.x,
    y: match.y,
    bbox: match.matchBbox || { x: match.x, y: match.y, w: 0, h: 0 },

    // ── Confidence ──
    confidence: match.confidence,
    confidenceBucket: match.confidenceBucket,
    evidence: match.evidence,

    // ── Review state ──
    accepted: false,         // NEVER auto-accept — requires explicit user action
    requiresReview: match.confidenceBucket !== CONFIDENCE_BUCKET.LOW,

    // ── Assembly linkage (from recipe) ──
    assemblyId: recipe.assemblyId,
    assemblyName: recipe.assemblyName || '',
    label: recipe.label || recipe.assemblyName || '',

    // ── Source tag (boundary enforcement) ──
    source: 'recipe_match',  // DISTINCT from 'pdf_rule_engine' / 'project_memory'
  }
}

// ── Batch operations ─────────────────────────────────────────────────────────

/**
 * Group candidates by confidence bucket.
 * @param {Object[]} candidates — RecipeMatchCandidate[]
 * @returns {{ green: Object[], yellow: Object[], red: Object[], total: number }}
 */
export function groupByBucket(candidates) {
  const green = []
  const yellow = []
  const red = []
  for (const c of candidates) {
    if (c.confidenceBucket === CONFIDENCE_BUCKET.HIGH) green.push(c)
    else if (c.confidenceBucket === CONFIDENCE_BUCKET.REVIEW) yellow.push(c)
    else red.push(c)
  }
  return { green, yellow, red, total: candidates.length }
}

/**
 * Accept all green candidates.
 * Recipe matches STILL require explicit user action, so this is called
 * when user clicks "Accept all green".
 *
 * @param {Object[]} candidates — RecipeMatchCandidate[] (NOT mutated)
 * @returns {Object[]} new array with green candidates accepted
 */
export function batchAcceptGreen(candidates) {
  return candidates.map(c => ({
    ...c,
    accepted: c.confidenceBucket === CONFIDENCE_BUCKET.HIGH ? true : c.accepted,
  }))
}

/**
 * Batch ignore all red candidates.
 * @param {Object[]} candidates
 * @returns {Object[]}
 */
export function batchIgnoreRed(candidates) {
  return candidates.map(c => ({
    ...c,
    accepted: c.confidenceBucket === CONFIDENCE_BUCKET.LOW ? false : c.accepted,
  }))
}

/**
 * Convert accepted RecipeMatchCandidate to marker creation fields.
 * This is the handoff from recipe matching to the marker/takeoff system.
 *
 * @param {Object} candidate — accepted RecipeMatchCandidate
 * @param {Object[]} assemblies — available assemblies for category resolution
 * @returns {Object} fields for createMarker()
 */
export function toMarkerFields(candidate, assemblies) {
  // Resolve category from assembly
  const asm = assemblies?.find(a => a.id === candidate.assemblyId)
  const ASM_CATEGORY_MAP = {
    szerelvenyek: 'socket',
    vilagitas: 'light',
    elosztok: 'elosztok',
    gyengaram: 'other',
    tuzjelzo: 'other',
  }
  const CATEGORY_COLORS = {
    socket: '#FF8C42', switch: '#A78BFA', light: '#FFD166',
    elosztok: '#FF6B6B', other: '#71717A',
  }

  const category = asm ? (ASM_CATEGORY_MAP[asm.category] || 'other') : 'other'
  const color = CATEGORY_COLORS[category] || '#71717A'

  return {
    x: candidate.x,
    y: candidate.y,
    pageNum: candidate.pageNumber,
    category,
    color,
    source: 'detection',           // marker model accepts 'detection' — we tag via detectionId
    confidence: candidate.confidence,
    detectionId: candidate.id,     // links back to RMC-xxx
    templateId: candidate.recipeId, // links to RCP-xxx
    label: candidate.label,
    asmId: candidate.assemblyId,
  }
}

// ── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Run recipe matching for one or more recipes against a PDF plan.
 *
 * @param {Object[]} recipes — SymbolRecipe[] to match
 * @param {Object} pdfDoc — pdf.js document
 * @param {string} planId — target plan ID
 * @param {Object} options
 * @param {number} [options.currentPage=1] — current page for scope filtering
 * @param {Function|null} [options.onProgress] — (fraction, recipeId) => void
 * @returns {Promise<Object[]>} RecipeMatchCandidate[]
 */
export async function runRecipeMatching(recipes, pdfDoc, planId, options = {}) {
  const { currentPage = 1, onProgress = null } = options

  if (!recipes?.length || !pdfDoc) return []

  const allCandidates = []

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i]
    const scope = recipe.scope || RECIPE_SCOPE.WHOLE_PLAN

    const rawMatches = await matchRecipeOnPages(recipe, pdfDoc, {
      scope,
      currentPage,
    })

    for (const match of rawMatches) {
      allCandidates.push(createMatchCandidate(match, recipe, planId))
    }

    // Increment usage counter
    try { incrementRecipeUsage(recipe.id) } catch { /* non-critical */ }

    if (onProgress) onProgress((i + 1) / recipes.length, recipe.id)
  }

  return allCandidates
}
