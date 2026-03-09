// ─── Count Workflow Service ─────────────────────────────────────────────────
// PlanSwift-style controlled symbol counting workflow.
//
// Flow: CountObject → SearchSession → candidates → review → materialize
//
// Key differences from legacy recipe matching:
//   1. Explicit search region bounding (current_region)
//   2. Scale mode control (exact vs tolerant)
//   3. Candidates are session-scoped entities (not raw detections)
//   4. Markers only created from accepted candidates (not all detections)
//   5. User sees: what, where, how many candidates, how many accepted
//
// BOUNDARY:
//   - Uses detectTemplateOnPage from templateMatching.js (reuse NCC core)
//   - Does NOT use recipe matcher pipeline (separate noise-controlled path)
//   - Does NOT touch DetectionCandidate[] or PDF rule engine
//   - Does NOT touch quote/BOM
// ────────────────────────────────────────────────────────────────────────────

import {
  detectTemplateOnPage,
  detectTemplateInRegion,
  DETECTION_SCALE,
} from '../../utils/templateMatching.js'
import {
  matchRegionRaster,
  RASTER_DPI,
  RASTER_SCALE,
} from '../../utils/rasterPipeline.js'
import { getRecipeCrop } from '../../data/recipeStore.js'
import {
  createSearchSession,
  createSessionCandidate,
  saveSession,
  updateSession,
  CANDIDATE_STATUS,
} from '../../data/searchSessionStore.js'
import { SCALE_MODE, SEARCH_SCOPE } from '../../data/countObjectStore.js'

// ── Scale mode → NCC threshold mapping ───────────────────────────────────────
// 'exact' uses a tight threshold to minimize false positives.
// 'tolerant' relaxes threshold to catch faint / slightly different symbols.

const SCALE_MODE_CONFIG = {
  [SCALE_MODE.EXACT]: {
    nccThreshold: 0.65,     // tight: only strong matches
    maxPerPage: 20,
  },
  [SCALE_MODE.TOLERANT]: {
    nccThreshold: 0.50,     // relaxed: catches more, needs review
    maxPerPage: 40,
  },
}

/**
 * Resolve NCC config from scale mode.
 * @param {string} scaleMode
 * @returns {{ nccThreshold: number, maxPerPage: number }}
 */
export function resolveScaleModeConfig(scaleMode) {
  return SCALE_MODE_CONFIG[scaleMode] || SCALE_MODE_CONFIG[SCALE_MODE.EXACT]
}

// ── Coordinate helpers ──────────────────────────────────────────────────────

/**
 * Convert a screen-coord bbox to PDF scale=1 bbox using the view transform.
 * Used by PdfViewer to convert a drawn region rect to PDF coordinates.
 *
 * @param {{ x: number, y: number, w: number, h: number }} screenRect — canvas/screen coords
 * @param {{ offsetX: number, offsetY: number, zoom: number }} view — current view transform
 * @returns {{ x: number, y: number, w: number, h: number }} — PDF scale=1 bbox
 */
export function screenRectToPdfRegion(screenRect, view) {
  return {
    x: (screenRect.x - view.offsetX) / view.zoom,
    y: (screenRect.y - view.offsetY) / view.zoom,
    w: screenRect.w / view.zoom,
    h: screenRect.h / view.zoom,
  }
}

/**
 * Convert a PDF scale=1 bbox to screen-coord bbox using the view transform.
 * Used for rendering region overlay on canvas.
 *
 * @param {{ x: number, y: number, w: number, h: number }} pdfRect — PDF scale=1 bbox
 * @param {{ offsetX: number, offsetY: number, zoom: number }} view — current view transform
 * @returns {{ x: number, y: number, w: number, h: number }} — screen coords
 */
export function pdfRegionToScreenRect(pdfRect, view) {
  return {
    x: pdfRect.x * view.zoom + view.offsetX,
    y: pdfRect.y * view.zoom + view.offsetY,
    w: pdfRect.w * view.zoom,
    h: pdfRect.h * view.zoom,
  }
}

// ── Page boundary clamping ────────────────────────────────────────────────

/**
 * Clamp a PDF region bbox to the actual page bounds.
 * Ensures the search region cannot extend beyond the PDF page content area,
 * eliminating false positives from viewer black background / padding.
 *
 * @param {{ x: number, y: number, w: number, h: number }} region — PDF scale=1
 * @param {{ width: number, height: number }} pageBounds — PDF page dimensions at scale=1
 * @returns {{ x: number, y: number, w: number, h: number }} — clamped region
 */
export function clampRegionToPage(region, pageBounds) {
  const x = Math.max(0, region.x)
  const y = Math.max(0, region.y)
  const x2 = Math.min(pageBounds.width, region.x + region.w)
  const y2 = Math.min(pageBounds.height, region.y + region.h)
  return {
    x,
    y,
    w: Math.max(0, x2 - x),
    h: Math.max(0, y2 - y),
  }
}

// ── Search region filter ────────────────────────────────────────────────────
// Filters detection results to only include candidates whose center falls
// within the specified search region bbox (PDF scale=1 coordinates).

/**
 * Filter detections to those within a search region.
 * @param {Object[]} detections — { x, y, ... } in PDF scale=1
 * @param {{ x: number, y: number, w: number, h: number }} region — PDF scale=1
 * @returns {{ inside: Object[], outside: Object[] }}
 */
export function filterBySearchRegion(detections, region) {
  if (!region) return detections
  const { x: rx, y: ry, w: rw, h: rh } = region
  const inside = []
  const outside = []
  for (const d of detections) {
    if (d.x >= rx && d.x <= rx + rw && d.y >= ry && d.y <= ry + rh) {
      inside.push(d)
    } else {
      outside.push(d)
    }
  }

  // Dev-only diagnostics: region filtering stats
  if (import.meta.env?.DEV) {
    console.log(
      `[CountWorkflow:region] filter region=(${rx.toFixed(1)},${ry.toFixed(1)} ${rw.toFixed(1)}×${rh.toFixed(1)}) ` +
      `total=${detections.length} inside=${inside.length} outside=${outside.length}`
    )
  }

  return inside
}

// ── Main search execution ───────────────────────────────────────────────────

/**
 * Execute a search session for a CountObject.
 *
 * This is the core of the PlanSwift-style workflow:
 *   1. Load the seed crop from the CountObject's linked recipe
 *   2. Determine search scope + region
 *   3. Run NCC detection with scale-mode-appropriate threshold
 *   4. Filter results to search region (if current_region)
 *   5. Create SessionCandidates from detections
 *   6. Return the SearchSession for review
 *
 * @param {Object} countObject — from countObjectStore
 * @param {Object} pdfDoc — pdf.js document
 * @param {Object} [options]
 * @param {Function|null} [options.onProgress] — (fraction) => void
 * @returns {Promise<Object>} — SearchSession with candidates populated
 */
export async function executeSearch(countObject, pdfDoc, options = {}) {
  const { onProgress = null, cropDataUrl: preloadedCrop = null } = options

  // Load seed crop image (use pre-loaded if available)
  const cropDataUrl = preloadedCrop || await getRecipeCrop(countObject.sampleCropId)
  if (!cropDataUrl) {
    throw new Error(`No crop found for count object: ${countObject.id}`)
  }

  // Resolve scale mode config
  const config = resolveScaleModeConfig(countObject.scaleMode)

  // Determine which pages to search
  const scope = countObject.searchScope
  const numPages = pdfDoc.numPages
  let pageRange

  if (scope === SEARCH_SCOPE.CURRENT_REGION || scope === SEARCH_SCOPE.CURRENT_PAGE) {
    pageRange = [countObject.pageNumber]
  } else {
    pageRange = Array.from({ length: numPages }, (_, i) => i + 1)
  }

  // Build template-like shape for detectTemplateOnPage
  const templateLike = {
    id: countObject.id,
    category: countObject.assemblyId || 'other',
    color: '#4CC9F0',
    imageDataUrl: cropDataUrl,
    label: countObject.label || countObject.assemblyName || '',
  }

  // Determine if we have a region for the raster pipeline
  const useRasterPipeline = scope === SEARCH_SCOPE.CURRENT_REGION
    && countObject.searchRegion
    && countObject.sampleBbox

  // Run NCC detection across pages
  const allDetections = []

  // Pre-load sample page for raster pipeline (render once, reuse across pages)
  let samplePage = null
  if (useRasterPipeline) {
    samplePage = await pdfDoc.getPage(countObject.pageNumber)
  }

  for (let i = 0; i < pageRange.length; i++) {
    const pageNum = pageRange[i]
    const pdfPage = await pdfDoc.getPage(pageNum)

    // Get page bounds for clamping (PDF scale=1)
    const viewport = pdfPage.getViewport({ scale: 1 })
    const pageBounds = { width: viewport.width, height: viewport.height }

    let detections
    try {
      if (useRasterPipeline) {
        // ── UNIFIED RASTER PIPELINE ──────────────────────────────────────
        // Both sample and target are rasterized from PDF at RASTER_DPI (150),
        // go through identical preprocessing (gray → trim → contrast).
        // No PNG encode/decode, no resolution mismatch, no viewer-zoom dependency.
        const clampedRegion = clampRegionToPage(countObject.searchRegion, pageBounds)
        if (clampedRegion.w < 8 || clampedRegion.h < 8) {
          detections = []
        } else {
          detections = await matchRegionRaster(
            pdfPage,
            countObject.sampleBbox,
            clampedRegion,
            {
              samplePage: pageNum === countObject.pageNumber ? null : samplePage,
              threshold: config.nccThreshold,
              maxResults: config.maxPerPage,
              templateId: countObject.id,
              label: countObject.label || countObject.assemblyName || '',
            },
          )
        }
      } else if (scope === SEARCH_SCOPE.CURRENT_REGION && countObject.searchRegion) {
        // Fallback: legacy region pre-crop (no sampleBbox available)
        const clampedRegion = clampRegionToPage(countObject.searchRegion, pageBounds)
        if (clampedRegion.w < 8 || clampedRegion.h < 8) {
          detections = []
        } else {
          detections = await detectTemplateInRegion(
            pdfPage, templateLike, clampedRegion, DETECTION_SCALE, config.nccThreshold
          )
        }
      } else {
        // Full page scan (current_page / whole_plan)
        detections = await detectTemplateOnPage(
          pdfPage, templateLike, DETECTION_SCALE, config.nccThreshold
        )
        // For non-region scopes, still clamp results to page bounds
        detections = detections.filter(d =>
          d.x >= 0 && d.x <= pageBounds.width && d.y >= 0 && d.y <= pageBounds.height
        )
      }
    } catch {
      detections = []
    }

    // Cap per-page
    const capped = detections.slice(0, config.maxPerPage)

    // Tag with page number
    for (const d of capped) {
      d.pageNum = pageNum
    }
    allDetections.push(...capped)

    if (onProgress) onProgress((i + 1) / pageRange.length)

    // Yield to UI
    await new Promise(r => setTimeout(r, 0))
  }

  // Dev-only diagnostics
  if (import.meta.env?.DEV) {
    const region = countObject.searchRegion
    console.log(
      `[CountWorkflow:search] scope=${scope} scaleMode=${countObject.scaleMode} ` +
      `pages=${pageRange.join(',')} rasterPipeline=${useRasterPipeline} DPI=${useRasterPipeline ? RASTER_DPI : 'legacy'} ` +
      `detections=${allDetections.length} ` +
      `region=${region ? `(${region.x.toFixed(1)},${region.y.toFixed(1)} ${region.w.toFixed(1)}×${region.h.toFixed(1)})` : 'none'}`
    )
  }

  // Safety net: apply post-filter as second layer of defense for region scope
  const regionFiltered = (useRasterPipeline || countObject.searchRegion)
    ? filterBySearchRegion(allDetections, countObject.searchRegion)
    : allDetections

  // Create SearchSession
  const session = createSearchSession({
    countObjectId: countObject.id,
    planId: countObject.planId,
    scope,
    region: countObject.searchRegion,
    scaleMode: countObject.scaleMode,
  })

  // Convert detections to SessionCandidates
  // Use simple confidence bucketing based on NCC score
  session.candidates = regionFiltered.map(d => {
    const confidence = d.score
    const bucket = confidence >= 0.75 ? 'high'
      : confidence >= 0.60 ? 'review'
      : 'low'

    return createSessionCandidate({
      x: d.x,
      y: d.y,
      pageNumber: d.pageNum,
      score: d.score,
      confidence,
      confidenceBucket: bucket,
      matchBbox: {
        x: d.x - (d.matchW || 20) / 2,
        y: d.y - (d.matchH || 20) / 2,
        w: d.matchW || 40,
        h: d.matchH || 40,
      },
    })
  })

  session.candidateCount = session.candidates.length

  // Persist
  saveSession(session)

  return session
}

// ── Batch candidate operations ──────────────────────────────────────────────

/**
 * Accept all likely candidates (high confidence) in a session.
 * Returns updated session.candidates array (not persisted — caller should persist).
 *
 * @param {Object[]} candidates — SessionCandidate[]
 * @returns {Object[]} — updated array
 */
export function batchAcceptLikely(candidates) {
  return candidates.map(c => ({
    ...c,
    status: c.confidenceBucket === 'high' ? CANDIDATE_STATUS.ACCEPTED : c.status,
  }))
}

/**
 * Ignore all low-confidence candidates.
 * @param {Object[]} candidates
 * @returns {Object[]}
 */
export function batchIgnoreLow(candidates) {
  return candidates.map(c => ({
    ...c,
    status: c.confidenceBucket === 'low' ? CANDIDATE_STATUS.IGNORED : c.status,
  }))
}

/**
 * Set individual candidate status.
 * @param {Object[]} candidates
 * @param {string} candidateId
 * @param {string} status — CANDIDATE_STATUS value
 * @returns {Object[]}
 */
export function setCandidateStatus(candidates, candidateId, status) {
  return candidates.map(c =>
    c.id === candidateId ? { ...c, status } : c
  )
}

// ── Materialization helper ──────────────────────────────────────────────────

/**
 * Convert accepted session candidates to marker creation fields.
 * This is the final step — only accepted candidates become markers.
 *
 * @param {Object[]} candidates — SessionCandidate[] (from session)
 * @param {Object} countObject — source CountObject
 * @param {Object[]} assemblies — assembly catalog
 * @returns {Object[]} — fields for createMarker()
 */
export function materializeAccepted(candidates, countObject, assemblies) {
  const accepted = candidates.filter(c => c.status === CANDIDATE_STATUS.ACCEPTED)

  // Resolve assembly category + color
  const asm = assemblies?.find(a => a.id === countObject.assemblyId)
  const ASM_CATEGORY_MAP = {
    szerelvenyek: 'socket', vilagitas: 'light',
    elosztok: 'elosztok', gyengaram: 'other', tuzjelzo: 'other',
  }
  const CATEGORY_COLORS = {
    socket: '#FF8C42', switch: '#A78BFA', light: '#FFD166',
    elosztok: '#FF6B6B', other: '#71717A',
  }
  const category = asm ? (ASM_CATEGORY_MAP[asm.category] || 'other') : 'other'
  const color = CATEGORY_COLORS[category] || '#71717A'

  return accepted.map(c => ({
    x: c.x,
    y: c.y,
    pageNum: c.pageNumber,
    category,
    color,
    source: 'count_object',
    confidence: c.confidence,
    detectionId: c.id,
    countObjectId: countObject.id,
    label: countObject.label || countObject.assemblyName || '',
    asmId: countObject.assemblyId,
  }))
}
