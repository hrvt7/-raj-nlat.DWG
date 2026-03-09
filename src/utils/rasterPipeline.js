// ─── Unified Raster Pipeline for PDF Region Matching ─────────────────────────
// Both sample and target are rasterized from the PDF at the SAME fixed DPI,
// go through the SAME preprocessing (grayscale → trim → contrast), and are
// matched in the SAME pixel space. This eliminates:
//   - Sample capture resolution mismatch (viewer zoom ≠ detection scale)
//   - PNG encode/decode quality loss
//   - Different preprocessing paths for sample vs target
//
// BOUNDARY: This module only does raster preparation + matching.
// It does NOT touch sessions, candidates, materialization, rule engine, or BOM.
// ─────────────────────────────────────────────────────────────────────────────

import {
  toGray,
  trimWhitespace,
  enhanceContrast,
  buildSAT,
  matchTemplate,
  nonMaxSuppression,
  renderPageImageData,
} from './templateMatching.js'

// ── DPI Strategy ────────────────────────────────────────────────────────────
// 150 DPI ≈ scale 2.083 (close to legacy DETECTION_SCALE=2 = 144 DPI).
// Slightly better detail for small symbols, still fast for region-only matching.
// A4 at 150 DPI = ~1240×1754 px total page; typical quarter-region = ~620×877 px.

/** Fixed DPI for raster matching — same for both sample and target */
export const RASTER_DPI = 150

/** Render scale factor (DPI / 72, pdf.js native unit) */
export const RASTER_SCALE = RASTER_DPI / 72

/** Max region pixel count to prevent OOM / runaway NCC */
export const MAX_REGION_PIXELS = 4_000_000

/** Minimum region pixel dimension for useful NCC */
export const MIN_REGION_PX = 8

// ── Region extraction ───────────────────────────────────────────────────────

/**
 * Extract a rectangular region from a pre-rendered page ImageData as grayscale.
 * Clamps bbox to page pixel bounds. Returns null if region too small or too large.
 *
 * @param {ImageData} imageData – full page RGBA pixels
 * @param {number} pageW – page pixel width
 * @param {number} pageH – page pixel height
 * @param {{ x: number, y: number, w: number, h: number }} bbox – PDF scale=1 bbox
 * @param {number} scale – render scale used for imageData
 * @returns {{ gray: Float32Array, w: number, h: number } | null}
 */
export function extractRegionGray(imageData, pageW, pageH, bbox, scale) {
  const px = Math.max(0, Math.floor(bbox.x * scale))
  const py = Math.max(0, Math.floor(bbox.y * scale))
  const pw = Math.min(pageW - px, Math.ceil(bbox.w * scale))
  const ph = Math.min(pageH - py, Math.ceil(bbox.h * scale))

  if (pw < MIN_REGION_PX || ph < MIN_REGION_PX) return null
  if (pw * ph > MAX_REGION_PIXELS) return null

  // Copy region pixels
  const regionData = new Uint8ClampedArray(pw * ph * 4)
  for (let y = 0; y < ph; y++) {
    const srcOff = ((py + y) * pageW + px) * 4
    const dstOff = y * pw * 4
    regionData.set(imageData.data.subarray(srcOff, srcOff + pw * 4), dstOff)
  }

  return { gray: toGray(new ImageData(regionData, pw, ph)), w: pw, h: ph }
}

// ── Unified preprocessing ───────────────────────────────────────────────────

/**
 * Preprocess a grayscale raster through the standard pipeline.
 * This is the SINGLE preprocessing path — used for both sample and target.
 *
 * @param {Float32Array} gray – grayscale [0,1]
 * @param {number} w
 * @param {number} h
 * @param {Object} [options]
 * @param {boolean} [options.trim=false] – trim whitespace (for template only)
 * @param {boolean} [options.contrast=true] – enhance contrast
 * @param {number} [options.contrastStrength=3.0]
 * @returns {{ gray: Float32Array, w: number, h: number, trimRect: Object|null } | null}
 */
export function preprocessRaster(gray, w, h, options = {}) {
  const { trim = false, contrast = true, contrastStrength = 3.0 } = options

  let out = gray
  let ow = w
  let oh = h
  let trimRect = null

  if (trim) {
    const result = trimWhitespace(out, ow, oh)
    if (!result) return null // entirely blank
    out = result.gray
    ow = result.w
    oh = result.h
    trimRect = result.trimRect
  }

  if (contrast) {
    out = enhanceContrast(out, contrastStrength)
  }

  return { gray: out, w: ow, h: oh, trimRect }
}

// ── Core raster matching ────────────────────────────────────────────────────

/**
 * Run NCC matching between a preprocessed sample and a preprocessed target region.
 * Both inputs MUST come from the same rasterization + preprocessing pipeline.
 *
 * @param {{ gray: Float32Array, w: number, h: number }} sample – preprocessed sample
 * @param {{ gray: Float32Array, w: number, h: number }} target – preprocessed target region
 * @param {number} threshold – NCC threshold
 * @returns {Array<{x: number, y: number, score: number}>} – detections in target-local pixel coords
 */
export function runNccMatch(sample, target, threshold = 0.65) {
  if (sample.w > target.w || sample.h > target.h) return []
  if (sample.w < 4 || sample.h < 4) return []

  const sat = buildSAT(target.gray, target.w, target.h)
  const raw = matchTemplate(
    target.gray, target.w, target.h,
    sample.gray, sample.w, sample.h,
    sat, threshold,
  )
  return nonMaxSuppression(raw, sample.w, sample.h)
}

// ── High-level: match sample in search region on a single page ──────────────

/**
 * Rasterize sample + search region from a PDF page at the same DPI,
 * preprocess both identically, run NCC, return detections in PDF scale=1.
 *
 * This is THE core function for region-first raster matching.
 *
 * @param {Object} pdfPage – pdf.js page (for the search target)
 * @param {{ x, y, w, h }} sampleBbox – sample bbox in PDF scale=1
 * @param {{ x, y, w, h }} searchRegion – search region bbox in PDF scale=1
 * @param {Object} [options]
 * @param {Object|null} [options.samplePage] – pdf.js page for sample (if different from target)
 * @param {number} [options.threshold=0.65]
 * @param {number} [options.maxResults=20]
 * @param {string} [options.templateId]
 * @param {string} [options.label]
 * @returns {Promise<Array<{x,y,score,matchW,matchH,templateId,label}>>}
 */
export async function matchRegionRaster(pdfPage, sampleBbox, searchRegion, options = {}) {
  const {
    samplePage = null,
    threshold = 0.65,
    maxResults = 20,
    templateId = null,
    label = '',
  } = options

  const scale = RASTER_SCALE

  // 1. Render sample page (may be same as target page)
  const samplePdfPage = samplePage || pdfPage
  const sampleRender = await renderPageImageData(samplePdfPage, scale)

  // 2. Extract sample region
  const sampleRaw = extractRegionGray(
    sampleRender.imageData, sampleRender.width, sampleRender.height,
    sampleBbox, scale,
  )
  if (!sampleRaw) return []

  // 3. Preprocess sample: trim whitespace + contrast (template preprocessing)
  const samplePrep = preprocessRaster(sampleRaw.gray, sampleRaw.w, sampleRaw.h, {
    trim: true, contrast: true,
  })
  if (!samplePrep) return []

  // 4. Render target page (skip if same page as sample — reuse render)
  let targetRender
  if (!samplePage || samplePage === pdfPage) {
    targetRender = sampleRender
  } else {
    targetRender = await renderPageImageData(pdfPage, scale)
  }

  // 5. Extract search region from target page
  const targetRaw = extractRegionGray(
    targetRender.imageData, targetRender.width, targetRender.height,
    searchRegion, scale,
  )
  if (!targetRaw) return []

  // 6. Preprocess target: contrast only, NO trim (target is the search area)
  const targetPrep = preprocessRaster(targetRaw.gray, targetRaw.w, targetRaw.h, {
    trim: false, contrast: true,
  })
  if (!targetPrep) return []

  // 7. Run NCC match
  const detections = runNccMatch(samplePrep, targetPrep, threshold)

  // 8. Convert from target-local pixel coords → PDF scale=1
  const regionPx = Math.max(0, Math.floor(searchRegion.x * scale))
  const regionPy = Math.max(0, Math.floor(searchRegion.y * scale))

  if (import.meta.env?.DEV) {
    console.log(
      `[RasterPipeline] sample=${samplePrep.w}×${samplePrep.h} target=${targetPrep.w}×${targetPrep.h} ` +
      `threshold=${threshold.toFixed(2)} hits=${detections.length} DPI=${RASTER_DPI}`
    )
  }

  return detections.slice(0, maxResults).map(d => {
    const centerX = (regionPx + d.x + samplePrep.w / 2) / scale
    const centerY = (regionPy + d.y + samplePrep.h / 2) / scale
    const matchW = samplePrep.w / scale
    const matchH = samplePrep.h / scale

    return {
      x: centerX,
      y: centerY,
      score: d.score,
      templateId,
      label,
      matchW,
      matchH,
    }
  })
}
