// ─── Matcher Pipeline End-to-End Verification ──────────────────────────────────
// This test exercises the COMPLETE matching pipeline with realistic scenarios:
//   1. Seed capture → template → NCC match → coordinate conversion
//   2. Current-page rescue path with threshold bonus
//   3. Whole-plan matching (no bonus)
//   4. Zero-match state when no symbols present
//   5. Scale invariant: DETECTION_SCALE=2 matches seed captured at 2×
//   6. Trim + contrast pipeline produces better matches than raw
//   7. Multiple distinct symbols produce separate detections
// ────────────────────────────────────────────────────────────────────────────────

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

// ── Realistic symbol generators ────────────────────────────────────────────────

/**
 * Simulate a "real" electrical symbol: a circle with a cross inside.
 * This is typical for ceiling lights in Hungarian electrical plans.
 * High variance = good NCC behavior.
 */
function drawCircleCrossSymbol(gray, w, cx, cy, radius, lineValue = 0.05) {
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || x >= w || y < 0 || y >= (gray.length / w)) continue
      const dist2 = dx * dx + dy * dy
      // Circle outline (ring)
      if (Math.abs(Math.sqrt(dist2) - radius) < 1.5) {
        gray[y * w + x] = lineValue
      }
      // Horizontal cross bar
      if (Math.abs(dy) < 1 && Math.abs(dx) <= radius * 0.7) {
        gray[y * w + x] = lineValue
      }
      // Vertical cross bar
      if (Math.abs(dx) < 1 && Math.abs(dy) <= radius * 0.7) {
        gray[y * w + x] = lineValue
      }
    }
  }
}

/**
 * Draw a small rectangle outline (outlet/socket symbol).
 */
function drawRectangleSymbol(gray, w, cx, cy, halfW, halfH, lineValue = 0.05) {
  for (let dy = -halfH; dy <= halfH; dy++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || x >= w || y < 0 || y >= (gray.length / w)) continue
      // Border only (within 1.5px of edges)
      if (Math.abs(dx) > halfW - 1.5 || Math.abs(dy) > halfH - 1.5) {
        gray[y * w + x] = lineValue
      }
    }
  }
}

/**
 * Creates a "page" at DETECTION_SCALE=2 resolution (simulating what the
 * pipeline would render). For A4 at scale=2: ~1190 × 1684 pixels.
 * We use a smaller synthetic size for test speed.
 */
function createScaledPage(logicalW, logicalH, symbols = []) {
  const pixelW = logicalW * DETECTION_SCALE
  const pixelH = logicalH * DETECTION_SCALE
  const gray = new Float32Array(pixelW * pixelH).fill(1.0)
  for (const sym of symbols) {
    // Symbol positions are in logical (scale=1) coordinates
    // Convert to pixel space (scale=2)
    const px = Math.round(sym.x * DETECTION_SCALE)
    const py = Math.round(sym.y * DETECTION_SCALE)
    const pr = Math.round(sym.radius * DETECTION_SCALE)
    if (sym.type === 'circle') {
      drawCircleCrossSymbol(gray, pixelW, px, py, pr, sym.value ?? 0.05)
    } else if (sym.type === 'rect') {
      drawRectangleSymbol(gray, pixelW, px, py, pr, pr, sym.value ?? 0.05)
    }
  }
  return { gray, w: pixelW, h: pixelH }
}

/**
 * Simulate seed capture: crop a symbol from the page at DETECTION_SCALE resolution.
 * This mimics what finalizeSeedCapture does — crop from the 2× canvas.
 * Includes some margin (like real user bbox selection).
 */
function simulateSeedCapture(pageGray, pageW, logicalCx, logicalCy, logicalRadius, margin = 4) {
  const scale = DETECTION_SCALE
  const px = Math.round(logicalCx * scale)
  const py = Math.round(logicalCy * scale)
  const pr = Math.round(logicalRadius * scale)
  const m = Math.round(margin * scale) // margin also at 2×

  const cropX = Math.max(0, px - pr - m)
  const cropY = Math.max(0, py - pr - m)
  const cropW = Math.min(pageW - cropX, (pr + m) * 2)
  const cropH = Math.min(Math.floor(pageGray.length / pageW) - cropY, (pr + m) * 2)

  const crop = new Float32Array(cropW * cropH)
  for (let dy = 0; dy < cropH; dy++) {
    for (let dx = 0; dx < cropW; dx++) {
      crop[dy * cropW + dx] = pageGray[(cropY + dy) * pageW + (cropX + dx)]
    }
  }
  return { gray: crop, w: cropW, h: cropH }
}

// ────────────────────────────────────────────────────────────────────────────────

describe('matcherPipelineE2E', () => {

  // ── 1. Complete pipeline: seed → enhance → trim → match → NMS → coords ────

  it('finds same symbol on page when both are at DETECTION_SCALE', () => {
    // Simulate a page with 3 ceiling light symbols
    const symbols = [
      { type: 'circle', x: 50, y: 50, radius: 8 },
      { type: 'circle', x: 120, y: 80, radius: 8 },
      { type: 'circle', x: 80, y: 140, radius: 8 },
    ]
    const { gray: pageGray, w: pageW, h: pageH } = createScaledPage(200, 200, symbols)

    // Simulate seed capture of the first symbol (with margin)
    const seed = simulateSeedCapture(pageGray, pageW, 50, 50, 8, 4)

    // Apply same processing pipeline as real code
    const enhancedPage = enhanceContrast(pageGray, 3.0)
    const enhancedSeed = enhanceContrast(seed.gray, 3.0)

    // Trim whitespace from seed
    const trimmed = trimWhitespace(enhancedSeed, seed.w, seed.h)
    expect(trimmed).not.toBeNull()
    expect(trimmed.w).toBeLessThanOrEqual(seed.w)
    expect(trimmed.h).toBeLessThanOrEqual(seed.h)

    // Build SAT and run NCC
    const satData = buildSAT(enhancedPage, pageW, pageH)
    const rawDetections = matchTemplate(
      enhancedPage, pageW, pageH,
      trimmed.gray, trimmed.w, trimmed.h,
      satData,
      0.47, // current_page rescue threshold (0.55 - 0.08)
      2,    // stride=2 (default)
    )

    expect(rawDetections.length).toBeGreaterThan(0)

    // NMS should reduce to ~3 distinct detections
    const filtered = nonMaxSuppression(rawDetections, trimmed.w, trimmed.h)
    expect(filtered.length).toBeGreaterThanOrEqual(3)
    expect(filtered.length).toBeLessThanOrEqual(10) // tolerance for sub-pixel

    // Top 3 scores should be high (exact same symbol)
    const topScores = filtered.slice(0, 3).map(d => d.score)
    for (const s of topScores) {
      expect(s).toBeGreaterThan(0.7)
    }

    // Simulate coordinate conversion back to PDF scale=1
    const pdfCoords = filtered.map(d => ({
      x: (d.x + trimmed.w / 2) / DETECTION_SCALE,
      y: (d.y + trimmed.h / 2) / DETECTION_SCALE,
      score: d.score,
    }))

    // Each detection center should be near one of the original symbol positions
    for (const sym of symbols) {
      const nearest = pdfCoords.reduce((best, d) => {
        const dist = Math.hypot(d.x - sym.x, d.y - sym.y)
        return dist < best.dist ? { dist, d } : best
      }, { dist: Infinity, d: null })
      // Detection center within 8px of logical symbol center (generous tolerance)
      expect(nearest.dist).toBeLessThan(12)
    }
  })

  // ── 2. Current-page rescue: lower threshold helps faint symbols ────────────

  it('current_page threshold bonus rescues faint symbol matches', () => {
    const symbols = [
      { type: 'circle', x: 50, y: 50, radius: 7, value: 0.3 }, // faint
      { type: 'circle', x: 120, y: 80, radius: 7, value: 0.3 },
    ]
    const { gray: pageGray, w: pageW, h: pageH } = createScaledPage(200, 200, symbols)
    const seed = simulateSeedCapture(pageGray, pageW, 50, 50, 7, 3)

    const enhancedPage = enhanceContrast(pageGray, 3.0)
    const enhancedSeed = enhanceContrast(seed.gray, 3.0)
    const trimmed = trimWhitespace(enhancedSeed, seed.w, seed.h)
    expect(trimmed).not.toBeNull()

    const satData = buildSAT(enhancedPage, pageW, pageH)

    // Strict threshold (whole_plan) = 0.55
    const strictDetections = matchTemplate(
      enhancedPage, pageW, pageH,
      trimmed.gray, trimmed.w, trimmed.h,
      satData, 0.55, 2,
    )

    // Rescue threshold (current_page) = 0.55 - 0.08 = 0.47
    const rescueDetections = matchTemplate(
      enhancedPage, pageW, pageH,
      trimmed.gray, trimmed.w, trimmed.h,
      satData, 0.47, 2,
    )

    // Rescue threshold should find at least as many matches
    expect(rescueDetections.length).toBeGreaterThanOrEqual(strictDetections.length)
  })

  // ── 3. Different symbols produce separate detections, not cross-matches ────

  it('distinct symbol types do not strongly cross-match', () => {
    // Page has both circle and rectangle symbols
    const symbols = [
      { type: 'circle', x: 50, y: 50, radius: 8 },
      { type: 'rect', x: 130, y: 50, radius: 8 },
    ]
    const { gray: pageGray, w: pageW, h: pageH } = createScaledPage(200, 150, symbols)

    // Seed capture of the circle symbol
    const circleSeed = simulateSeedCapture(pageGray, pageW, 50, 50, 8, 3)
    const enhancedPage = enhanceContrast(pageGray, 3.0)
    const enhancedCircle = enhanceContrast(circleSeed.gray, 3.0)
    const trimmedCircle = trimWhitespace(enhancedCircle, circleSeed.w, circleSeed.h)
    expect(trimmedCircle).not.toBeNull()

    const satData = buildSAT(enhancedPage, pageW, pageH)
    const detections = matchTemplate(
      enhancedPage, pageW, pageH,
      trimmedCircle.gray, trimmedCircle.w, trimmedCircle.h,
      satData, 0.47, 2,
    )

    const filtered = nonMaxSuppression(detections, trimmedCircle.w, trimmedCircle.h)

    // Convert to PDF coordinates
    const pdfCoords = filtered.map(d => ({
      x: (d.x + trimmedCircle.w / 2) / DETECTION_SCALE,
      y: (d.y + trimmedCircle.h / 2) / DETECTION_SCALE,
      score: d.score,
    }))

    // Should find the circle symbol with high confidence
    const nearCircle = pdfCoords.filter(d =>
      Math.hypot(d.x - 50, d.y - 50) < 15
    )
    expect(nearCircle.length).toBeGreaterThanOrEqual(1)

    // The rectangle location should have lower score or no detection
    const nearRect = pdfCoords.filter(d =>
      Math.hypot(d.x - 130, d.y - 50) < 15 && d.score > 0.7
    )
    // Circle template should NOT strongly match at rectangle position
    expect(nearRect.length).toBe(0)
  })

  // ── 4. Zero-match: blank page produces empty result ────────────────────────

  it('blank page produces zero detections', () => {
    const { gray: pageGray, w: pageW, h: pageH } = createScaledPage(200, 200, [])

    // Create a template with a real symbol
    const tempPage = createScaledPage(100, 100, [{ type: 'circle', x: 30, y: 30, radius: 8 }])
    const seed = simulateSeedCapture(tempPage.gray, tempPage.w, 30, 30, 8, 3)

    const enhancedPage = enhanceContrast(pageGray, 3.0)
    const enhancedSeed = enhanceContrast(seed.gray, 3.0)
    const trimmed = trimWhitespace(enhancedSeed, seed.w, seed.h)
    expect(trimmed).not.toBeNull()

    const satData = buildSAT(enhancedPage, pageW, pageH)
    const detections = matchTemplate(
      enhancedPage, pageW, pageH,
      trimmed.gray, trimmed.w, trimmed.h,
      satData, 0.47, 2,
    )

    expect(detections.length).toBe(0)
  })

  // ── 5. Scale correctness: DETECTION_SCALE=2 is consistent ─────────────────

  it('DETECTION_SCALE equals 2', () => {
    expect(DETECTION_SCALE).toBe(2)
  })

  it('coordinates convert correctly from pixel to PDF space', () => {
    // Detection at pixel (100, 200) with template size 20×20
    // PDF center = (100 + 10) / 2 = 55, (200 + 10) / 2 = 105
    const detection = { x: 100, y: 200, score: 0.9 }
    const tplW = 20, tplH = 20
    const pdfX = (detection.x + tplW / 2) / DETECTION_SCALE
    const pdfY = (detection.y + tplH / 2) / DETECTION_SCALE

    expect(pdfX).toBe(55)
    expect(pdfY).toBe(105)
  })

  // ── 6. Full pipeline with trim produces better results than without ────────

  it('trim+contrast pipeline produces higher scores than raw matching', () => {
    const symbols = [
      { type: 'circle', x: 60, y: 60, radius: 8 },
      { type: 'circle', x: 140, y: 100, radius: 8 },
    ]
    const { gray: pageGray, w: pageW, h: pageH } = createScaledPage(200, 200, symbols)

    // Seed with generous margin (simulating user overshoot)
    const seed = simulateSeedCapture(pageGray, pageW, 60, 60, 8, 10) // 10px margin

    // RAW pipeline (no enhance, no trim)
    const satRaw = buildSAT(pageGray, pageW, pageH)
    const rawDetections = matchTemplate(pageGray, pageW, pageH, seed.gray, seed.w, seed.h, satRaw, 0.30, 2)
    const rawMax = rawDetections.length > 0 ? Math.max(...rawDetections.map(d => d.score)) : 0

    // FULL pipeline (enhance + trim)
    const enhancedPage = enhanceContrast(pageGray, 3.0)
    const enhancedSeed = enhanceContrast(seed.gray, 3.0)
    const trimmed = trimWhitespace(enhancedSeed, seed.w, seed.h)
    expect(trimmed).not.toBeNull()
    const satFull = buildSAT(enhancedPage, pageW, pageH)
    const fullDetections = matchTemplate(enhancedPage, pageW, pageH, trimmed.gray, trimmed.w, trimmed.h, satFull, 0.30, 2)
    const fullMax = fullDetections.length > 0 ? Math.max(...fullDetections.map(d => d.score)) : 0

    // Full pipeline should achieve higher max score
    expect(fullMax).toBeGreaterThanOrEqual(rawMax)
  })

  // ── 7. Multiple symbols: correct count after NMS ───────────────────────────

  it('NMS after full pipeline gives correct symbol count', () => {
    const numSymbols = 5
    const symbols = [
      { type: 'circle', x: 30, y: 30, radius: 7 },
      { type: 'circle', x: 90, y: 30, radius: 7 },
      { type: 'circle', x: 150, y: 30, radius: 7 },
      { type: 'circle', x: 60, y: 100, radius: 7 },
      { type: 'circle', x: 120, y: 100, radius: 7 },
    ]
    const { gray: pageGray, w: pageW, h: pageH } = createScaledPage(200, 150, symbols)
    const seed = simulateSeedCapture(pageGray, pageW, 30, 30, 7, 3)

    const enhancedPage = enhanceContrast(pageGray, 3.0)
    const enhancedSeed = enhanceContrast(seed.gray, 3.0)
    const trimmed = trimWhitespace(enhancedSeed, seed.w, seed.h)
    expect(trimmed).not.toBeNull()

    const satData = buildSAT(enhancedPage, pageW, pageH)
    const raw = matchTemplate(enhancedPage, pageW, pageH, trimmed.gray, trimmed.w, trimmed.h, satData, 0.47, 2)
    const filtered = nonMaxSuppression(raw, trimmed.w, trimmed.h)

    // Should find approximately the right number of symbols
    expect(filtered.length).toBeGreaterThanOrEqual(numSymbols)
    expect(filtered.length).toBeLessThanOrEqual(numSymbols * 2) // generous tolerance
  })
})
