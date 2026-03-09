// ─── Deterministic PDF Symbol Rule Engine ────────────────────────────────────
// Scans PdfAnalysisResult pages for symbol candidates using three evidence
// layers: text patterns, geometry hints, and legacy provider output.
//
// This module produces `DetectionCandidate[]` — the single truth source for
// all downstream symbol consumption (review UI, quote generation, etc.).
//
// Design constraints:
//   - No OCR, no AI, no external APIs
//   - Deterministic: same input → same output, always
//   - Conservative: prefer no-match over false-positive
//   - Legacy adapter: existing provider.symbols.items are ONE input, not a
//     competing truth source
// ──────────────────────────────────────────────────────────────────────────────

import { getAutoDetectableSymbols, getSymbolByLegacyType } from './symbolLibrary.js'
import { isPageLimited, isGeometryDisabled, getPageConfidenceCap } from './pdfTypeRouter.js'

// ── Confidence buckets ───────────────────────────────────────────────────────

export const CONFIDENCE_BUCKET = /** @type {const} */ ({
  HIGH: 'high',       // ≥ 0.7 — auto-eligible
  REVIEW: 'review',   // ≥ 0.4 — needs human confirmation
  LOW: 'low',         // < 0.4 — not actionable without manual override
})

/**
 * Map a 0–1 confidence score to a named bucket.
 * @param {number} confidence
 * @returns {'high'|'review'|'low'}
 */
export function toBucket(confidence) {
  if (confidence >= 0.7) return CONFIDENCE_BUCKET.HIGH
  if (confidence >= 0.4) return CONFIDENCE_BUCKET.REVIEW
  return CONFIDENCE_BUCKET.LOW
}

// ── Evidence weights ─────────────────────────────────────────────────────────

const WEIGHT_TEXT = 0.45
const WEIGHT_GEOMETRY = 0.30
const WEIGHT_LEGACY = 0.25

// ── Core engine ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DetectionCandidate
 * @property {string}  symbolId       — from symbol library (e.g. 'SYM-SOCKET')
 * @property {string}  symbolType     — human label (e.g. 'Dugalj')
 * @property {number}  pageNumber     — 1-based page index
 * @property {{ x: number, y: number, w: number, h: number }} bbox — bounding box (may be 0,0,0,0 if position unknown)
 * @property {number}  confidence     — 0–1 combined score
 * @property {string}  confidenceBucket — 'high' | 'review' | 'low'
 * @property {Object}  evidence       — breakdown of what matched
 * @property {string}  source         — 'text' | 'geometry' | 'legacy' | 'hybrid'
 * @property {boolean} requiresReview — true if confidence < 0.7 or single evidence
 * @property {number}  [qty]          — estimated quantity (from legacy or text counting)
 * @property {string}  [asmId]        — assembly ID if known
 * @property {string}  [legacyType]   — original legacy type if adapted
 */

/**
 * Run the rule engine against a full PdfAnalysisResult.
 *
 * @param {import('../pdfAnalysis/types.js').PdfAnalysisResult} analysisResult
 * @param {import('./pdfTypeRouter.js').RouteResult} [routeResult] — optional type routing config
 * @returns {{ candidates: DetectionCandidate[], meta: DetectionMeta }}
 */
export function runRuleEngine(analysisResult, routeResult) {
  if (!analysisResult || !analysisResult.pages) {
    return { candidates: [], meta: _emptyMeta() }
  }

  const symbols = getAutoDetectableSymbols()
  const allCandidates = []

  for (const page of analysisResult.pages) {
    const pageCandidates = _detectOnPage(page, symbols, analysisResult, routeResult)
    allCandidates.push(...pageCandidates)
  }

  // Deduplicate: if same symbolId + same page has multiple candidates, keep highest confidence
  const deduped = _deduplicateCandidates(allCandidates)

  const meta = _buildMeta(deduped)

  return { candidates: deduped, meta }
}

// ── Page-level detection ─────────────────────────────────────────────────────

/**
 * @private
 */
function _detectOnPage(page, symbols, analysisResult, routeResult) {
  const candidates = []
  const pageNumber = page.pageNumber || 1

  // ── Route-aware config ──────────────────────────────────────────────────
  const pageLimited = routeResult ? isPageLimited(routeResult, pageNumber) : false
  const geometryOff = routeResult ? isGeometryDisabled(routeResult, pageNumber) : false
  const confidenceCap = routeResult ? getPageConfidenceCap(routeResult, pageNumber) : 1.0

  // Pre-index text blocks for pattern matching
  const textLower = (page.textBlocks || []).map(tb => (tb.text || '').toLowerCase())
  const allText = textLower.join(' ')

  // Pre-index legacy symbols for this page
  const legacyItems = (analysisResult.symbols?.items || [])

  for (const sym of symbols) {
    // ── Text evidence ──────────────────────────────────────────────────
    const textResult = _scoreTextEvidence(sym, textLower, allText)

    // ── Geometry evidence (disabled in limited mode) ───────────────────
    const geomResult = geometryOff
      ? { score: 0, matchedShapes: [], bbox: null }
      : _scoreGeometryEvidence(sym, page.drawings || [])

    // ── Legacy evidence ────────────────────────────────────────────────
    const legacyResult = _scoreLegacyEvidence(sym, legacyItems)

    // ── Combine ────────────────────────────────────────────────────────
    const hasAnyEvidence = textResult.score > 0 || geomResult.score > 0 || legacyResult.score > 0
    if (!hasAnyEvidence) continue

    const evidenceCount = [textResult.score > 0, geomResult.score > 0, legacyResult.score > 0].filter(Boolean).length
    const rawConfidence = (
      textResult.score * WEIGHT_TEXT +
      geomResult.score * WEIGHT_GEOMETRY +
      legacyResult.score * WEIGHT_LEGACY
    )
    // Clamp to [0, 1], then apply page confidence cap (limited mode cap)
    const confidence = Math.min(confidenceCap, Math.max(0, rawConfidence))

    // In limited mode: ALWAYS requires review, regardless of confidence
    const requiresReview = pageLimited || confidence < 0.7 || evidenceCount === 1

    // Determine primary source
    const source = _primarySource(textResult.score, geomResult.score, legacyResult.score)

    // Bounding box: prefer legacy position if available, else geometry, else zero
    const bbox = legacyResult.bbox || geomResult.bbox || { x: 0, y: 0, w: 0, h: 0 }

    // Quantity: from legacy if available, else from text count, else 1
    const qty = legacyResult.qty || textResult.mentionCount || (confidence >= 0.4 ? 1 : 0)

    if (qty === 0) continue  // No credible quantity

    candidates.push({
      symbolId: sym.id,
      symbolType: sym.label,
      pageNumber,
      bbox,
      confidence,
      confidenceBucket: toBucket(confidence),
      evidence: {
        text: textResult.score > 0 ? { score: textResult.score, matchedPatterns: textResult.matchedPatterns, mentionCount: textResult.mentionCount } : null,
        geometry: geomResult.score > 0 ? { score: geomResult.score, matchedShapes: geomResult.matchedShapes } : null,
        legacy: legacyResult.score > 0 ? { score: legacyResult.score, originalConfidence: legacyResult.originalConfidence, qty: legacyResult.qty } : null,
      },
      source,
      requiresReview,
      qty,
      asmId: sym.asmId || null,
      legacyType: sym.legacyType || null,
      // ── Limited mode tagging ──
      isLimitedMode: pageLimited,
    })
  }

  return candidates
}

// ── Text evidence scorer ─────────────────────────────────────────────────────

function _scoreTextEvidence(sym, textLower, allText) {
  let matchedPatterns = []
  let mentionCount = 0

  for (const pattern of sym.textPatterns) {
    // Count occurrences across all text blocks
    let idx = 0
    let count = 0
    while ((idx = allText.indexOf(pattern, idx)) !== -1) {
      count++
      idx += pattern.length
    }
    if (count > 0) {
      matchedPatterns.push(pattern)
      mentionCount += count
    }
  }

  if (matchedPatterns.length === 0) {
    return { score: 0, matchedPatterns: [], mentionCount: 0 }
  }

  // Score: base 0.6 for any match, +0.1 per additional unique pattern, +0.05 for 3+ mentions
  let score = 0.6
  score += Math.min(0.3, (matchedPatterns.length - 1) * 0.1)
  if (mentionCount >= 3) score += 0.05
  if (mentionCount >= 5) score += 0.05

  return {
    score: Math.min(1, score),
    matchedPatterns,
    mentionCount,
  }
}

// ── Geometry evidence scorer ─────────────────────────────────────────────────

function _scoreGeometryEvidence(sym, drawings) {
  if (!drawings.length || !sym.geometryHints) {
    return { score: 0, matchedShapes: [], bbox: null }
  }

  const hints = sym.geometryHints
  let matchedShapes = []
  let bestBbox = null

  for (const drawing of drawings) {
    // Check shape type match
    if (!hints.expectedShapes.includes(drawing.type)) continue

    // Check size bounds (approximate from points or line width)
    const size = _estimateDrawingSize(drawing)
    if (size < hints.minSize || size > hints.maxSize) continue

    // Check aspect ratio if applicable
    if (hints.aspectRatioRange && drawing.type !== 'line' && drawing.type !== 'path') {
      const ar = _estimateAspectRatio(drawing)
      if (ar < hints.aspectRatioRange[0] || ar > hints.aspectRatioRange[1]) continue
    }

    matchedShapes.push(drawing.type)
    if (!bestBbox) {
      bestBbox = _drawingToBbox(drawing)
    }
  }

  if (matchedShapes.length === 0) {
    return { score: 0, matchedShapes: [], bbox: null }
  }

  // Geometry alone is weak signal — cap at 0.5
  // More matches = slightly higher score
  let score = 0.3 + Math.min(0.2, matchedShapes.length * 0.05)

  return {
    score: Math.min(0.5, score),
    matchedShapes: [...new Set(matchedShapes)],
    bbox: bestBbox,
  }
}

// ── Legacy evidence scorer ───────────────────────────────────────────────────

function _scoreLegacyEvidence(sym, legacyItems) {
  if (!sym.legacyType || !legacyItems.length) {
    return { score: 0, originalConfidence: 0, qty: 0, bbox: null }
  }

  // Find legacy items that match this symbol's legacy type
  const matches = legacyItems.filter(item =>
    item.symbolType === sym.legacyType ||
    (item.label && item.label.toLowerCase().includes(sym.legacyType))
  )

  if (matches.length === 0) {
    return { score: 0, originalConfidence: 0, qty: 0, bbox: null }
  }

  // Take the highest-confidence legacy match
  const best = matches.reduce((a, b) => (a.confidence || 0) > (b.confidence || 0) ? a : b)
  const originalConfidence = best.confidence || 0

  // Legacy score: pass through confidence, capped at 0.85 (don't blindly trust legacy)
  const score = Math.min(0.85, originalConfidence)

  // Sum quantities across all matches
  const qty = matches.length  // Each legacy item is one instance

  // Extract bbox from best match
  const bbox = (best.x || best.y) ? {
    x: best.x || 0,
    y: best.y || 0,
    w: best.w || 0,
    h: best.h || 0,
  } : null

  return { score, originalConfidence, qty, bbox }
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function _estimateDrawingSize(drawing) {
  if (!drawing.points || drawing.points.length < 2) return 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const pt of drawing.points) {
    const [x, y] = Array.isArray(pt) ? pt : [pt.x || 0, pt.y || 0]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return Math.max(maxX - minX, maxY - minY)
}

function _estimateAspectRatio(drawing) {
  if (!drawing.points || drawing.points.length < 2) return 1
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const pt of drawing.points) {
    const [x, y] = Array.isArray(pt) ? pt : [pt.x || 0, pt.y || 0]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  return w / h
}

function _drawingToBbox(drawing) {
  if (!drawing.points || drawing.points.length < 2) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const pt of drawing.points) {
    const [x, y] = Array.isArray(pt) ? pt : [pt.x || 0, pt.y || 0]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function _primarySource(textScore, geomScore, legacyScore) {
  if (textScore > 0 && (geomScore > 0 || legacyScore > 0)) return 'hybrid'
  if (textScore > 0) return 'text'
  if (geomScore > 0) return 'geometry'
  if (legacyScore > 0) return 'legacy'
  return 'text'
}

// ── Deduplication ────────────────────────────────────────────────────────────

function _deduplicateCandidates(candidates) {
  const byKey = new Map()  // "symbolId:pageNumber" → best candidate

  for (const c of candidates) {
    const key = `${c.symbolId}:${c.pageNumber}`
    const existing = byKey.get(key)
    if (!existing || c.confidence > existing.confidence) {
      byKey.set(key, c)
    }
  }

  return Array.from(byKey.values())
}

// ── Detection metadata ───────────────────────────────────────────────────────

/**
 * @typedef {Object} DetectionMeta
 * @property {number} totalCandidates
 * @property {number} highConfidence
 * @property {number} reviewNeeded
 * @property {number} lowConfidence
 * @property {string[]} detectedSymbolIds — unique symbol IDs found
 * @property {string[]} evidenceSources — which evidence layers contributed
 */

function _buildMeta(candidates) {
  const meta = {
    totalCandidates: candidates.length,
    highConfidence: 0,
    reviewNeeded: 0,
    lowConfidence: 0,
    detectedSymbolIds: [],
    evidenceSources: new Set(),
  }

  const ids = new Set()
  for (const c of candidates) {
    if (c.confidenceBucket === CONFIDENCE_BUCKET.HIGH) meta.highConfidence++
    else if (c.confidenceBucket === CONFIDENCE_BUCKET.REVIEW) meta.reviewNeeded++
    else meta.lowConfidence++

    ids.add(c.symbolId)
    if (c.evidence.text) meta.evidenceSources.add('text')
    if (c.evidence.geometry) meta.evidenceSources.add('geometry')
    if (c.evidence.legacy) meta.evidenceSources.add('legacy')
  }

  meta.detectedSymbolIds = [...ids]
  meta.evidenceSources = [...meta.evidenceSources]
  return meta
}

function _emptyMeta() {
  return {
    totalCandidates: 0,
    highConfidence: 0,
    reviewNeeded: 0,
    lowConfidence: 0,
    detectedSymbolIds: [],
    evidenceSources: [],
  }
}

// ── Explicit non-detection list ──────────────────────────────────────────────

/**
 * Things this engine explicitly does NOT attempt to detect:
 *
 * - Fire alarm loop wiring topology (requires full schematic tracing)
 * - Panel schedules / circuit breaker tables (structured data, not symbols)
 * - Cable cross-sections or specifications (text parsing, future OCR)
 * - Multi-page legend cross-references (requires multi-page analysis)
 * - Scaled measurements or distances (requires calibrated scale)
 * - Non-Hungarian symbol standards (IEC 60617 only partially covered)
 * - Mechanical / HVAC symbols (out of scope for electrical detection)
 * - Smart home / IoT device symbols (too diverse, no standard)
 */
