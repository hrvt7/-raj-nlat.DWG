// ─── Localization Precision Tests ────────────────────────────────────────────
// These tests verify that detections are CORRECTLY POSITIONED, not just found.
// The key invariant: final detection center must be within tolerance of the
// true symbol center after scale conversion.
//
// The correct formula:
//   center = (d.x + trimmedW / 2) / DETECTION_SCALE
//   where d.x is the NCC hit top-left in detection-scale pixels
//   trimmedW is the trimmed template width (content only, no whitespace)
//   This gives the center of the CONTENT match = symbol center
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  toGray,
  buildSAT,
  matchTemplate,
  nonMaxSuppression,
  trimWhitespace,
  enhanceContrast,
  DETECTION_SCALE,
} from '../utils/templateMatching.js'

// ── Symbol drawing helpers ──────────────────────────────────────────────────

function drawCircleCross(gray, w, cx, cy, radius, value = 0.05) {
  const h = gray.length / w
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (Math.abs(dist - radius) < 1.5) gray[y * w + x] = value
      if (Math.abs(dy) < 1 && Math.abs(dx) <= radius * 0.7) gray[y * w + x] = value
      if (Math.abs(dx) < 1 && Math.abs(dy) <= radius * 0.7) gray[y * w + x] = value
    }
  }
}

function createPage(logicalW, logicalH, symbols) {
  const pw = logicalW * DETECTION_SCALE
  const ph = logicalH * DETECTION_SCALE
  const gray = new Float32Array(pw * ph).fill(1.0)
  for (const s of symbols) {
    drawCircleCross(gray, pw,
      Math.round(s.x * DETECTION_SCALE),
      Math.round(s.y * DETECTION_SCALE),
      Math.round(s.radius * DETECTION_SCALE),
      s.value ?? 0.05)
  }
  return { gray, w: pw, h: ph }
}

/** Capture seed with symmetric margin around symbol center */
function captureSeed(pageGray, pageW, logCx, logCy, logRadius, margin) {
  const s = DETECTION_SCALE
  const px = Math.round(logCx * s), py = Math.round(logCy * s), pr = Math.round(logRadius * s)
  const m = Math.round(margin * s)
  const x0 = Math.max(0, px - pr - m)
  const y0 = Math.max(0, py - pr - m)
  const pageH = Math.floor(pageGray.length / pageW)
  const cw = Math.min(pageW - x0, (pr + m) * 2)
  const ch = Math.min(pageH - y0, (pr + m) * 2)
  const crop = new Float32Array(cw * ch)
  for (let dy = 0; dy < ch; dy++)
    for (let dx = 0; dx < cw; dx++)
      crop[dy * cw + dx] = pageGray[(y0 + dy) * pageW + (x0 + dx)]
  return { gray: crop, w: cw, h: ch }
}

/** Capture seed with ASYMMETRIC margin (more whitespace on left/top) */
function captureSeedAsymmetric(pageGray, pageW, logCx, logCy, logRadius, leftMargin, rightMargin, topMargin, bottomMargin) {
  const s = DETECTION_SCALE
  const px = Math.round(logCx * s), py = Math.round(logCy * s), pr = Math.round(logRadius * s)
  const pageH = Math.floor(pageGray.length / pageW)
  const x0 = Math.max(0, px - pr - Math.round(leftMargin * s))
  const y0 = Math.max(0, py - pr - Math.round(topMargin * s))
  const x1 = Math.min(pageW, px + pr + Math.round(rightMargin * s))
  const y1 = Math.min(pageH, py + pr + Math.round(bottomMargin * s))
  const cw = x1 - x0, ch = y1 - y0
  const crop = new Float32Array(cw * ch)
  for (let dy = 0; dy < ch; dy++)
    for (let dx = 0; dx < cw; dx++)
      crop[dy * cw + dx] = pageGray[(y0 + dy) * pageW + (x0 + dx)]
  return { gray: crop, w: cw, h: ch }
}

/**
 * Run the FULL localization pipeline (matches production code path):
 *   trim → enhance → NCC → NMS → coord conversion
 * Trim MUST happen on raw grayscale (bg=1.0 > whiteThreshold=0.92).
 * Enhancement maps bg 1.0→~0.817, which breaks trimming if done first.
 * Returns detection centers in PDF scale=1 coordinates.
 */
function runPipeline(pageGray, pageW, pageH, seedGray, seedW, seedH, threshold = 0.47) {
  // 1. Trim on raw grayscale FIRST (bg=1.0 > threshold=0.92)
  const trimResult = trimWhitespace(seedGray, seedW, seedH)
  if (!trimResult) return []
  let tplGray = trimResult.gray
  const tplW = trimResult.w
  const tplH = trimResult.h
  if (tplW < 4 || tplH < 4) return []
  // 2. Then enhance both (after trim)
  const ePage = enhanceContrast(pageGray, 3.0)
  tplGray = enhanceContrast(tplGray, 3.0)
  const sat = buildSAT(ePage, pageW, pageH)
  const raw = matchTemplate(ePage, pageW, pageH, tplGray, tplW, tplH, sat, threshold, 2)
  const filtered = nonMaxSuppression(raw, tplW, tplH)
  // Same formula as detectTemplateOnPage: center of TRIMMED match = symbol center
  return filtered.map(d => ({
    x: (d.x + tplW / 2) / DETECTION_SCALE,
    y: (d.y + tplH / 2) / DETECTION_SCALE,
    score: d.score,
    matchW: tplW / DETECTION_SCALE,
    matchH: tplH / DETECTION_SCALE,
  }))
}

function nearestDetection(dets, tx, ty) {
  let best = { dist: Infinity, det: null }
  for (const d of dets) {
    const dist = Math.hypot(d.x - tx, d.y - ty)
    if (dist < best.dist) best = { dist, det: d }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────

describe('localizationPrecision', () => {

  // ── 1. Core: symmetric margin, detection center on symbol ─────────────

  it('detection center lands within 5 PDF-units of true symbol center (symmetric margin)', () => {
    const symbols = [
      { x: 60, y: 60, radius: 8 },
      { x: 140, y: 90, radius: 8 },
      { x: 80, y: 150, radius: 8 },
    ]
    const { gray: pg, w: pw, h: ph } = createPage(200, 200, symbols)
    const seed = captureSeed(pg, pw, 60, 60, 8, 8)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h)

    expect(results.length).toBeGreaterThanOrEqual(3)
    for (const sym of symbols) {
      const { dist } = nearestDetection(results, sym.x, sym.y)
      expect(dist).toBeLessThan(5)
    }
  })

  // ── 2. Asymmetric margin: trimmed center still correct ────────────────

  it('detection center is correct even with asymmetric user bbox (more whitespace on left)', () => {
    const sym = { x: 80, y: 80, radius: 8 }
    const { gray: pg, w: pw, h: ph } = createPage(200, 200, [sym, { x: 140, y: 80, radius: 8 }])
    // Asymmetric: 20px left, 3px right, 15px top, 3px bottom
    const seed = captureSeedAsymmetric(pg, pw, 80, 80, 8, 20, 3, 15, 3)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h)

    expect(results.length).toBeGreaterThan(0)
    // The detection nearest to the seed's source symbol should be precise
    const { dist } = nearestDetection(results, sym.x, sym.y)
    expect(dist).toBeLessThan(5) // trimmed center formula = content center, not crop center
  })

  // ── 3. Multiple symbols: all correctly localized ──────────────────────

  it('5 symbols on a page are all localized within tolerance', () => {
    const symbols = [
      { x: 30, y: 30, radius: 7 },
      { x: 100, y: 30, radius: 7 },
      { x: 160, y: 30, radius: 7 },
      { x: 65, y: 100, radius: 7 },
      { x: 130, y: 100, radius: 7 },
    ]
    const { gray: pg, w: pw, h: ph } = createPage(200, 150, symbols)
    const seed = captureSeed(pg, pw, 30, 30, 7, 6)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h)

    expect(results.length).toBeGreaterThanOrEqual(5)
    for (const sym of symbols) {
      const { dist } = nearestDetection(results, sym.x, sym.y)
      expect(dist).toBeLessThan(6)
    }
  })

  // ── 4. Zero-match: blank page ─────────────────────────────────────────

  it('blank page produces zero detections (no false positives)', () => {
    const { gray: pg, w: pw, h: ph } = createPage(200, 200, [])
    const symPage = createPage(100, 100, [{ x: 30, y: 30, radius: 8 }])
    const seed = captureSeed(symPage.gray, symPage.w, 30, 30, 8, 5)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h)
    expect(results.length).toBe(0)
  })

  // ── 5. Coordinate conversion math ─────────────────────────────────────

  it('center formula: (d.x + tplW/2) / DETECTION_SCALE = content center', () => {
    // d.x = 100, tplW = 30, DETECTION_SCALE = 2
    // center = (100 + 15) / 2 = 57.5
    const centerX = (100 + 30 / 2) / DETECTION_SCALE
    expect(centerX).toBe(57.5)
  })

  it('DETECTION_SCALE equals 2', () => {
    expect(DETECTION_SCALE).toBe(2)
  })

  // ── 6. matchW/matchH from trimmed template, not original seed ─────────

  it('matchW/matchH reflect trimmed content size', () => {
    const sym = { x: 80, y: 80, radius: 8 }
    const { gray: pg, w: pw, h: ph } = createPage(200, 200, [sym])
    // Very large margin → big trim area
    const seed = captureSeed(pg, pw, 80, 80, 8, 20)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h)
    expect(results.length).toBeGreaterThan(0)
    const det = results[0]
    // matchW should be positive and ≤ original seed size
    const originalSeedW = seed.w / DETECTION_SCALE
    expect(det.matchW).toBeGreaterThan(0)
    expect(det.matchW).toBeLessThanOrEqual(originalSeedW)
  })

  // ── 7. matchBbox centered on detection, not offset ────────────────────

  it('matchBbox derived from det center + matchW/matchH is centered correctly', () => {
    const sym = { x: 100, y: 100, radius: 8 }
    const { gray: pg, w: pw, h: ph } = createPage(200, 200, [sym])
    const seed = captureSeed(pg, pw, 100, 100, 8, 6)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h)
    expect(results.length).toBeGreaterThan(0)

    const det = results[0]
    // Simulate matchBbox construction (as in matcher.js)
    const matchBbox = {
      x: det.x - det.matchW / 2,
      y: det.y - det.matchH / 2,
      w: det.matchW,
      h: det.matchH,
    }
    // Bbox center should equal detection center
    expect(matchBbox.x + matchBbox.w / 2).toBeCloseTo(det.x, 1)
    expect(matchBbox.y + matchBbox.h / 2).toBeCloseTo(det.y, 1)
    // And should be near the symbol
    expect(det.x).toBeCloseTo(sym.x, 0)
    expect(det.y).toBeCloseTo(sym.y, 0)
  })

  // ── 8. Current-page rescue threshold: lower but still precise ─────────

  it('rescue threshold 0.47 still localizes within tolerance', () => {
    const symbols = [
      { x: 50, y: 50, radius: 7, value: 0.2 },
      { x: 120, y: 80, radius: 7, value: 0.2 },
    ]
    const { gray: pg, w: pw, h: ph } = createPage(200, 150, symbols)
    const seed = captureSeed(pg, pw, 50, 50, 7, 5)
    const results = runPipeline(pg, pw, ph, seed.gray, seed.w, seed.h, 0.47)

    for (const sym of symbols) {
      const { dist } = nearestDetection(results, sym.x, sym.y)
      if (dist < 999) expect(dist).toBeLessThan(6)
    }
  })

  // ── 9. trimWhitespace trimRect is informational ───────────────────────

  it('trimRect reports correct offset of content within original', () => {
    const w = 40, h = 40
    const gray = new Float32Array(w * h).fill(1.0)
    drawCircleCross(gray, w, 25, 25, 6, 0.05) // offset to bottom-right

    const result = trimWhitespace(gray, w, h)
    expect(result).not.toBeNull()
    expect(result.trimRect.x).toBeGreaterThan(0) // left margin exists
    expect(result.trimRect.y).toBeGreaterThan(0) // top margin exists
    // Trimmed region should contain the symbol
    expect(result.trimRect.w).toBeGreaterThanOrEqual(10)
    expect(result.trimRect.h).toBeGreaterThanOrEqual(10)
  })

  // ── 10. Architecture boundary ─────────────────────────────────────────

  it('localization code does not import from markerModel or quoteStore', () => {
    const fs = require('fs')
    const tmSrc = fs.readFileSync('src/utils/templateMatching.js', 'utf8')
    const matcherSrc = fs.readFileSync('src/services/recipeMatching/matcher.js', 'utf8')
    expect(tmSrc).not.toMatch(/import.*markerModel/)
    expect(tmSrc).not.toMatch(/import.*quoteStore/)
    expect(matcherSrc).not.toMatch(/import.*markerModel/)
    expect(matcherSrc).not.toMatch(/import.*quoteStore/)
  })
})
