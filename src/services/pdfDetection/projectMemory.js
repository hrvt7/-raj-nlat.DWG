// ─── Project Memory Matching Engine ──────────────────────────────────────────
// Scans a PdfAnalysisResult for matches against project-scoped custom symbols.
//
// This is a lightweight evidence layer that runs AFTER the standard rule engine.
// It produces additional DetectionCandidate[] with source='project_memory'.
//
// Design constraints:
//   - Same DetectionCandidate shape as ruleEngine.js (single truth source)
//   - Conservative: confidence capped at 0.65 (never auto-HIGH)
//   - Always requiresReview: true (project memory is a hint, not a certainty)
//   - Deduplicates against standard candidates: if standard library already
//     detected the same symbol on the same page, project memory doesn't duplicate
//   - No AI/ML — pure text pattern matching
//   - No cross-project leakage — only matches against this project's custom symbols
// ──────────────────────────────────────────────────────────────────────────────

import { toBucket } from './ruleEngine.js'

// ── Confidence caps ─────────────────────────────────────────────────────────

/**
 * Project memory confidence is intentionally capped below the HIGH threshold
 * (0.7) so project memory matches NEVER auto-accept.
 */
const PROJECT_MEMORY_CONFIDENCE_CAP = 0.65

/**
 * Base confidence when at least one text pattern matches.
 * Lower than standard library (0.6) to reflect less-vetted patterns.
 */
const BASE_CONFIDENCE = 0.45

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run project memory matching against a PdfAnalysisResult.
 *
 * @param {Object[]} customSymbols — from customSymbolStore.getCustomSymbolsByProject()
 * @param {import('../pdfAnalysis/types.js').PdfAnalysisResult} analysisResult
 * @param {import('./ruleEngine.js').DetectionCandidate[]} [standardCandidates=[]] — already-detected candidates from rule engine (for dedup)
 * @returns {{ candidates: import('./ruleEngine.js').DetectionCandidate[], matchedSymbolIds: string[] }}
 */
export function runProjectMemory(customSymbols, analysisResult, standardCandidates = []) {
  if (!customSymbols || !customSymbols.length || !analysisResult?.pages) {
    return { candidates: [], matchedSymbolIds: [] }
  }

  // Build a set of already-detected standard symbol keys for dedup
  const standardKeys = new Set(
    standardCandidates.map(c => `${c.symbolId}:${c.pageNumber}`)
  )

  const allCandidates = []
  const matchedIds = new Set()

  for (const page of analysisResult.pages) {
    const pageNumber = page.pageNumber || 1
    const textLower = (page.textBlocks || []).map(tb => (tb.text || '').toLowerCase())
    const allText = textLower.join(' ')

    for (const sym of customSymbols) {
      if (!sym.textPatterns || !sym.textPatterns.length) continue

      // Check if standard engine already detected something on this page
      // that maps to the same custom symbol category — skip if so
      const dedupeKey = `${sym.id}:${pageNumber}`
      // Also check standard candidates by category+page to avoid duplicating
      const standardHasCategory = standardCandidates.some(c =>
        c.pageNumber === pageNumber &&
        _categoriesOverlap(c.symbolId, sym.category)
      )
      if (standardHasCategory) continue

      // ── Text pattern matching (reuses same logic as ruleEngine) ──
      const textResult = _scoreTextPatterns(sym.textPatterns, allText)
      if (textResult.score === 0) continue

      // ── Confidence calculation (capped) ──
      const confidence = Math.min(PROJECT_MEMORY_CONFIDENCE_CAP, textResult.score)
      const bucket = toBucket(confidence)

      allCandidates.push({
        symbolId: sym.id,                      // Custom symbol ID (CSYM-...)
        symbolType: sym.label,
        pageNumber,
        bbox: { x: 0, y: 0, w: 0, h: 0 },    // Position unknown for text-based
        confidence,
        confidenceBucket: bucket,
        evidence: {
          text: {
            score: textResult.score,
            matchedPatterns: textResult.matchedPatterns,
            mentionCount: textResult.mentionCount,
          },
          geometry: null,
          legacy: null,
          projectMemory: {                      // Extra evidence field
            customSymbolId: sym.id,
            customSymbolLabel: sym.label,
            projectId: sym.projectId,
          },
        },
        source: 'project_memory',               // Distinctive source tag
        requiresReview: true,                    // ALWAYS requires review
        qty: textResult.mentionCount || 1,
        asmId: null,
        legacyType: null,
        // ── Extended fields for project memory ──
        customCategory: sym.category,
        customColor: sym.color,
      })

      matchedIds.add(sym.id)
    }
  }

  // Deduplicate: same custom symbol + same page → keep highest confidence
  const deduped = _deduplicateCandidates(allCandidates)

  return { candidates: deduped, matchedSymbolIds: [...matchedIds] }
}

// ── Text pattern scorer (mirrors ruleEngine._scoreTextEvidence) ─────────────

function _scoreTextPatterns(patterns, allText) {
  let matchedPatterns = []
  let mentionCount = 0

  for (const pattern of patterns) {
    if (!pattern) continue
    const patLower = pattern.toLowerCase()
    let idx = 0
    let count = 0
    while ((idx = allText.indexOf(patLower, idx)) !== -1) {
      count++
      idx += patLower.length
    }
    if (count > 0) {
      matchedPatterns.push(patLower)
      mentionCount += count
    }
  }

  if (matchedPatterns.length === 0) {
    return { score: 0, matchedPatterns: [], mentionCount: 0 }
  }

  // Score: base + bonus for multiple patterns + bonus for repetitions
  // Intentionally lower than standard library scoring
  let score = BASE_CONFIDENCE
  score += Math.min(0.15, (matchedPatterns.length - 1) * 0.05)
  if (mentionCount >= 3) score += 0.03
  if (mentionCount >= 5) score += 0.02

  return {
    score: Math.min(PROJECT_MEMORY_CONFIDENCE_CAP, score),
    matchedPatterns,
    mentionCount,
  }
}

// ── Category overlap check ──────────────────────────────────────────────────

/**
 * Simple check: does a standard symbolId map to a category that overlaps
 * with a custom symbol's category?  Prevents double-detection.
 */
const STANDARD_SYMBOL_CATEGORIES = {
  'SYM-SOCKET':  'socket',
  'SYM-SWITCH':  'switch',
  'SYM-LIGHT':   'light',
  'SYM-CONDUIT': 'conduit',
  'SYM-BREAKER': 'panel',
}

function _categoriesOverlap(standardSymbolId, customCategory) {
  const stdCat = STANDARD_SYMBOL_CATEGORIES[standardSymbolId]
  if (!stdCat) return false
  return stdCat === customCategory
}

// ── Deduplication ───────────────────────────────────────────────────────────

function _deduplicateCandidates(candidates) {
  const byKey = new Map()
  for (const c of candidates) {
    const key = `${c.symbolId}:${c.pageNumber}`
    const existing = byKey.get(key)
    if (!existing || c.confidence > existing.confidence) {
      byKey.set(key, c)
    }
  }
  return Array.from(byKey.values())
}
