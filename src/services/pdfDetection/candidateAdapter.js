// ─── PDF Detection Candidate Adapter ──────────────────────────────────────────
// Bridges the rule engine's DetectionCandidate[] (truth source) to the
// DetectionReviewPanel's expected shape.
//
// This adapter is the ONLY bridge between the two models.  Downstream UI
// components never read legacy symbols.items directly.
//
// Handles TWO candidate sources:
//   1. Standard library (ruleEngine.js) → source: 'pdf_rule_engine'
//   2. Project memory (projectMemory.js) → source: 'project_memory'
//
// Both produce DetectionCandidate[] with the same shape.  The adapter
// normalizes source tagging, category mapping, and acceptance defaults.
//
// Truth source: DetectionCandidate[] from pdfDetection/ruleEngine.js + projectMemory.js
// Target shape: { id, planId, pageNum, x, y, score, category, color,
//                 templateId, label, accepted, confidenceBucket, evidence,
//                 requiresReview, symbolId, qty, asmId, detectionSource }
// ──────────────────────────────────────────────────────────────────────────────

import { CONFIDENCE_BUCKET } from './ruleEngine.js'

// ── Category → color mapping (mirrors DetectionReviewPanel / DxfToolbar) ─────

const CATEGORY_COLORS = {
  socket:     '#FF8C42',
  switch:     '#A78BFA',
  light:      '#FFD166',
  elosztok:   '#FF6B6B',
  panel:      '#FF6B6B',
  junction:   '#4CC9F0',
  conduit:    '#06B6D4',
  cable_tray: '#818CF8',
  breaker:    '#FF6B6B',
  other:      '#71717A',
}

// ── Symbol ID → review category mapping ──────────────────────────────────────

const SYMBOL_TO_CATEGORY = {
  'SYM-SOCKET':  'socket',
  'SYM-SWITCH':  'switch',
  'SYM-LIGHT':   'light',
  'SYM-CONDUIT': 'conduit',
  'SYM-BREAKER': 'panel', // breakers live in the panel/elosztó category
}

function mapCategory(symbolId) {
  return SYMBOL_TO_CATEGORY[symbolId] || 'other'
}

function mapColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other
}

// ── Detection source constants ──────────────────────────────────────────────

export const DETECTION_SOURCE = /** @type {const} */ ({
  STANDARD: 'standard',
  PROJECT_MEMORY: 'project_memory',
  MANUAL: 'manual',
})

// ── Confidence bucket → initial acceptance ──────────────────────────────────

function initialAcceptance(bucket, candidateSource) {
  // Project memory matches NEVER auto-accept, regardless of bucket
  if (candidateSource === 'project_memory') return false

  if (bucket === CONFIDENCE_BUCKET.HIGH) return true    // green → auto-accept
  if (bucket === CONFIDENCE_BUCKET.REVIEW) return false // yellow → pending, requires explicit review
  return false                                          // red → default reject
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Adapt a single DetectionCandidate to the review panel's detection shape.
 *
 * @param {import('./ruleEngine.js').DetectionCandidate} candidate
 * @param {string} planId — the plan this candidate belongs to
 * @returns {Object} review panel detection object
 */
export function adaptCandidate(candidate, planId) {
  const isProjectMemory = candidate.source === 'project_memory'

  // For project memory candidates, use their custom category/color
  // For standard candidates, map from symbolId
  const category = isProjectMemory
    ? (candidate.customCategory || 'other')
    : mapCategory(candidate.symbolId)
  const color = isProjectMemory
    ? (candidate.customColor || mapColor(category))
    : mapColor(category)

  const detectionSource = isProjectMemory
    ? DETECTION_SOURCE.PROJECT_MEMORY
    : DETECTION_SOURCE.STANDARD

  return {
    // ── identity ──
    id: `pdfdet-${candidate.symbolId}-p${candidate.pageNumber}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,

    // ── spatial ──
    planId,
    pageNum: candidate.pageNumber,
    x: candidate.bbox?.x || 0,
    y: candidate.bbox?.y || 0,

    // ── score / classification ──
    score: candidate.confidence,
    category,
    color,
    templateId: null,  // PDF candidates have no template — rule engine based
    label: candidate.symbolType,

    // ── review state ──
    accepted: initialAcceptance(candidate.confidenceBucket, candidate.source),

    // ── extended fields (for enhanced review UX) ──
    confidenceBucket: candidate.confidenceBucket,
    evidence: candidate.evidence,
    requiresReview: candidate.requiresReview,
    symbolId: candidate.symbolId,
    qty: candidate.qty || 1,
    asmId: candidate.asmId || null,
    source: 'pdf_rule_engine',

    // ── source tagging (standard vs project_memory) ──
    detectionSource,
  }
}

/**
 * Adapt an array of DetectionCandidates for a single plan.
 *
 * @param {import('./ruleEngine.js').DetectionCandidate[]} candidates
 * @param {string} planId
 * @returns {Object[]} array of adapted detections
 */
export function adaptCandidates(candidates, planId) {
  if (!candidates || !candidates.length) return []
  return candidates.map(c => adaptCandidate(c, planId))
}

/**
 * Compute batch action summaries from adapted detections.
 *
 * @param {Object[]} detections — adapted detections
 * @returns {{ green: Object[], yellow: Object[], red: Object[], total: number }}
 */
export function groupByBucket(detections) {
  const green = []
  const yellow = []
  const red = []
  for (const d of detections) {
    if (d.confidenceBucket === CONFIDENCE_BUCKET.HIGH) green.push(d)
    else if (d.confidenceBucket === CONFIDENCE_BUCKET.REVIEW) yellow.push(d)
    else red.push(d)
  }
  return { green, yellow, red, total: detections.length }
}

/**
 * Apply batch accept: set all green to accepted, leave yellow/red as-is.
 *
 * @param {Object[]} detections — adapted detections (mutated in-place for perf)
 * @returns {Object[]} same array, with green items accepted
 */
export function batchAcceptGreen(detections) {
  return detections.map(d => ({
    ...d,
    // Project memory matches never auto-accept in batch, even if scored as HIGH
    accepted: (d.confidenceBucket === CONFIDENCE_BUCKET.HIGH && d.detectionSource !== DETECTION_SOURCE.PROJECT_MEMORY)
      ? true
      : d.accepted,
  }))
}

/**
 * Apply batch ignore: set all red to rejected.
 *
 * @param {Object[]} detections
 * @returns {Object[]}
 */
export function batchIgnoreRed(detections) {
  return detections.map(d => ({
    ...d,
    accepted: d.confidenceBucket === CONFIDENCE_BUCKET.LOW ? false : d.accepted,
  }))
}

/**
 * Convert an accepted adapted detection back to the marker handoff shape
 * that createMarker() expects.  This is the final conversion before entering
 * the takeoff flow.
 *
 * @param {Object} detection — adapted detection that was accepted
 * @returns {Object} fields for createMarker()
 */
export function toMarkerFields(detection) {
  return {
    x: detection.x,
    y: detection.y,
    pageNum: detection.pageNum,
    category: detection.category,
    color: detection.color,
    source: 'detection',
    confidence: detection.score,
    detectionId: detection.id,
    label: detection.label,
    asmId: detection.asmId,
  }
}
