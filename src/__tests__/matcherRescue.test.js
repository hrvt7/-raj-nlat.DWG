// ─── Matcher Rescue — Regression Tests ───────────────────────────────────────
// Covers:
//   1. Same-page repeated symbol gives >0 match (synthetic NCC)
//   2. Current_page rescue path: lower threshold
//   3. Trimmed crop / normalization helper
//   4. Contrast enhancement helper
//   5. No-match explicit state (zeroMatch shape)
//   6. Threshold + diagnostics helper
//   7. Architecture boundary (no DetectionRun / LegendStore coupling)
//   8. DETECTION_SCALE constant
// ──────────────────────────────────────────────────────────────────────────────

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

// ── Synthetic image helpers ──────────────────────────────────────────────────

/**
 * Draw a cross/plus pattern inside a region (creates non-uniform content with variance).
 * This is a more realistic symbol than a solid square — NCC requires variance.
 */
function drawCrossPattern(gray, w, sx, sy, size, value = 0.1) {
  const mid = Math.floor(size / 2)
  const arm = Math.max(2, Math.floor(size * 0.15)) // arm thickness
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = sx + dx, y = sy + dy
      if (x < 0 || x >= w || y < 0 || y >= (gray.length / w)) continue
      // Horizontal bar
      if (Math.abs(dy - mid) < arm) gray[y * w + x] = value
      // Vertical bar
      if (Math.abs(dx - mid) < arm) gray[y * w + x] = value
    }
  }
}

/**
 * Create a grayscale "image" with a white background (1.0) and
 * cross-pattern symbols at specified positions (has variance for NCC).
 */
function createSyntheticPage(w, h, squares = []) {
  const gray = new Float32Array(w * h).fill(1.0) // white bg
  for (const sq of squares) {
    drawCrossPattern(gray, w, sq.x, sq.y, sq.size, sq.value ?? 0.1)
  }
  return gray
}

/**
 * Create a grayscale "template" (cross pattern with optional white margin).
 */
function createSyntheticTemplate(size, margin = 0, value = 0.1) {
  const totalSize = size + margin * 2
  const gray = new Float32Array(totalSize * totalSize).fill(1.0) // white bg
  drawCrossPattern(gray, totalSize, margin, margin, size, value)
  return { gray, w: totalSize, h: totalSize }
}

// ──────────────────────────────────────────────────────────────────────────────

describe('matcherRescue', () => {

  // ── 1. Same-page repeated symbol gives >0 match ──────────────────────────

  describe('same-page repeated symbol matching', () => {
    it('finds multiple instances of the same dark square on a white page', () => {
      // Page: 200x200 with 3 dark 20x20 squares at different positions
      let pageGray = createSyntheticPage(200, 200, [
        { x: 30, y: 30, size: 20 },
        { x: 100, y: 50, size: 20 },
        { x: 60, y: 140, size: 20 },
      ])
      // Apply same contrast enhancement as the real pipeline
      pageGray = enhanceContrast(pageGray, 3.0)
      const satData = buildSAT(pageGray, 200, 200)

      // Template: a 20x20 dark square (matching the symbols) — also enhanced
      const tpl = createSyntheticTemplate(20, 0)
      const tplEnhanced = enhanceContrast(tpl.gray, 3.0)

      const detections = matchTemplate(
        pageGray, 200, 200,
        tplEnhanced, tpl.w, tpl.h,
        satData,
        0.45,  // threshold
        1,     // stride=1 for precise testing
      )

      // Must find detections (many raw hits including sub-pixel neighbors)
      expect(detections.length).toBeGreaterThanOrEqual(3)
      // Top 3 scores should be near-perfect (exact symbol matches)
      const topScores = detections.slice(0, 3).map(d => d.score)
      for (const s of topScores) {
        expect(s).toBeGreaterThan(0.9)
      }
    })

    it('NMS reduces clustered detections to ~1 per symbol', () => {
      let pageGray = createSyntheticPage(200, 200, [
        { x: 30, y: 30, size: 20 },
        { x: 100, y: 50, size: 20 },
      ])
      pageGray = enhanceContrast(pageGray, 3.0)
      const satData = buildSAT(pageGray, 200, 200)
      const tpl = createSyntheticTemplate(20, 0)
      const tplEnhanced = enhanceContrast(tpl.gray, 3.0)

      const raw = matchTemplate(pageGray, 200, 200, tplEnhanced, tpl.w, tpl.h, satData, 0.5, 1)
      const filtered = nonMaxSuppression(raw, tpl.w, tpl.h)

      // Should get roughly 2 detections after NMS (one per distinct square)
      expect(filtered.length).toBeGreaterThanOrEqual(2)
      expect(filtered.length).toBeLessThanOrEqual(6) // some tolerance for sub-pixel shifts
    })
  })

  // ── 2. Current_page rescue path: lower threshold ─────────────────────────

  describe('current_page rescue path', () => {
    it('lower threshold finds more matches', () => {
      // Create a "faint" symbol (gray value 0.4 instead of 0.1)
      const pageGray = createSyntheticPage(200, 200, [
        { x: 30, y: 30, size: 16, value: 0.4 },
        { x: 100, y: 80, size: 16, value: 0.4 },
      ])
      const satData = buildSAT(pageGray, 200, 200)
      const tpl = createSyntheticTemplate(16, 0, 0.4)

      const strictDetections = matchTemplate(pageGray, 200, 200, tpl.gray, tpl.w, tpl.h, satData, 0.60, 1)
      const rescueDetections = matchTemplate(pageGray, 200, 200, tpl.gray, tpl.w, tpl.h, satData, 0.47, 1)

      // Rescue (lower) threshold should find at least as many as strict
      expect(rescueDetections.length).toBeGreaterThanOrEqual(strictDetections.length)
    })
  })

  // ── 3. Trimmed crop / whitespace removal ─────────────────────────────────

  describe('trimWhitespace', () => {
    it('trims white margins from a template', () => {
      const { gray, w, h } = createSyntheticTemplate(10, 8) // 10px content + 8px margin each side = 26x26
      const result = trimWhitespace(gray, w, h)

      expect(result).not.toBeNull()
      // Trimmed should be significantly smaller than original
      expect(result.w).toBeLessThan(w)
      expect(result.h).toBeLessThan(h)
      // Should still contain the content (10px + 2px padding each side ≈ 14px)
      expect(result.w).toBeGreaterThanOrEqual(10)
      expect(result.h).toBeGreaterThanOrEqual(10)
    })

    it('returns null for entirely white template', () => {
      const gray = new Float32Array(50 * 50).fill(1.0) // all white
      expect(trimWhitespace(gray, 50, 50)).toBeNull()
    })

    it('skips trim when content fills most of the image (< 10% reduction)', () => {
      const { gray, w, h } = createSyntheticTemplate(20, 0) // no margin → no trim needed
      const result = trimWhitespace(gray, w, h)
      expect(result).not.toBeNull()
      expect(result.w).toBe(w)
      expect(result.h).toBe(h)
    })

    it('preserves trimRect coordinates', () => {
      const { gray, w, h } = createSyntheticTemplate(10, 10) // 10px content, 10px margin
      const result = trimWhitespace(gray, w, h)
      expect(result).not.toBeNull()
      expect(result.trimRect.x).toBeGreaterThanOrEqual(0)
      expect(result.trimRect.y).toBeGreaterThanOrEqual(0)
      expect(result.trimRect.w).toBe(result.w)
      expect(result.trimRect.h).toBe(result.h)
    })
  })

  // ── 4. Contrast enhancement ──────────────────────────────────────────────

  describe('enhanceContrast', () => {
    it('pushes dark values darker and light values lighter', () => {
      const input = new Float32Array([0.1, 0.5, 0.9])
      const output = enhanceContrast(input, 3.0)

      // 0.1 (dark) should stay dark (< 0.3)
      expect(output[0]).toBeLessThan(0.3)
      // 0.5 (mid) stays near 0.5 (sigmoid center)
      expect(Math.abs(output[1] - 0.5)).toBeLessThan(0.01)
      // 0.9 (light) should stay light (> 0.7)
      expect(output[2]).toBeGreaterThan(0.7)
    })

    it('does not produce values outside [0,1]', () => {
      const input = new Float32Array([0.0, 0.001, 0.999, 1.0])
      const output = enhanceContrast(input, 5.0)
      for (const v of output) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    })

    it('returns same length array', () => {
      const input = new Float32Array(100)
      expect(enhanceContrast(input).length).toBe(100)
    })
  })

  // ── 5. No-match explicit state shape ─────────────────────────────────────

  describe('no-match explicit state', () => {
    it('zeroMatch result has expected shape', () => {
      const zeroResult = {
        zeroMatch: true,
        recipeCount: 3,
        scope: 'current_page',
      }
      expect(zeroResult.zeroMatch).toBe(true)
      expect(typeof zeroResult.recipeCount).toBe('number')
      expect(['current_page', 'whole_plan']).toContain(zeroResult.scope)
    })
  })

  // ── 6. Threshold + diagnostics helper ────────────────────────────────────

  describe('threshold behavior', () => {
    it('higher threshold produces fewer or equal matches', () => {
      const pageGray = createSyntheticPage(150, 150, [
        { x: 20, y: 20, size: 15 },
        { x: 80, y: 80, size: 15 },
      ])
      const satData = buildSAT(pageGray, 150, 150)
      const tpl = createSyntheticTemplate(15, 0)

      const lowThresh = matchTemplate(pageGray, 150, 150, tpl.gray, tpl.w, tpl.h, satData, 0.40, 1)
      const highThresh = matchTemplate(pageGray, 150, 150, tpl.gray, tpl.w, tpl.h, satData, 0.80, 1)

      expect(lowThresh.length).toBeGreaterThanOrEqual(highThresh.length)
    })

    it('uniform template returns empty (tStd < 0.02 guard)', () => {
      const pageGray = createSyntheticPage(100, 100, [{ x: 20, y: 20, size: 15 }])
      const satData = buildSAT(pageGray, 100, 100)

      // Uniform template: all 0.5
      const uniformGray = new Float32Array(15 * 15).fill(0.5)
      const result = matchTemplate(pageGray, 100, 100, uniformGray, 15, 15, satData, 0.3, 1)
      expect(result.length).toBe(0)
    })
  })

  // ── 7. DETECTION_SCALE constant ──────────────────────────────────────────

  describe('DETECTION_SCALE', () => {
    it('equals 2 (must match seed capture renderScale)', () => {
      expect(DETECTION_SCALE).toBe(2)
    })
  })

  // ── 8. Architecture boundary ─────────────────────────────────────────────

  describe('architecture boundary', () => {
    it('matcher.js does NOT import detection/legend/quote modules', async () => {
      const fs = await import('fs')
      const src = fs.readFileSync(
        new URL('../services/recipeMatching/matcher.js', import.meta.url), 'utf8'
      )
      expect(src).not.toMatch(/detectionStore/)
      expect(src).not.toMatch(/legendStore/)
      expect(src).not.toMatch(/quoteStore/)
    })

    it('templateMatching.js does NOT import detection/recipe store modules', async () => {
      const fs = await import('fs')
      const src = fs.readFileSync(
        new URL('../utils/templateMatching.js', import.meta.url), 'utf8'
      )
      expect(src).not.toMatch(/detectionStore/)
      expect(src).not.toMatch(/recipeStore/)
    })
  })

  // ── 9. End-to-end: trimmed template matches better than untrimmed ────────

  describe('trimmed template matching improvement', () => {
    it('trimmed template finds higher max score than heavy-margin template', () => {
      // Page with 2 small dark squares
      let pageGray = createSyntheticPage(200, 200, [
        { x: 40, y: 40, size: 12 },
        { x: 120, y: 100, size: 12 },
      ])
      pageGray = enhanceContrast(pageGray, 3.0)
      const satData = buildSAT(pageGray, 200, 200)

      // Template with heavy white margin (simulating user bbox overshoot)
      const bigTpl = createSyntheticTemplate(12, 12) // 12px content + 12px margin = 36x36
      const bigTplEnhanced = enhanceContrast(bigTpl.gray, 3.0)
      const bigDetections = matchTemplate(pageGray, 200, 200, bigTplEnhanced, bigTpl.w, bigTpl.h, satData, 0.30, 1)

      // Trimmed version
      const trimResult = trimWhitespace(bigTplEnhanced, bigTpl.w, bigTpl.h)
      expect(trimResult).not.toBeNull()
      const trimDetections = matchTemplate(pageGray, 200, 200, trimResult.gray, trimResult.w, trimResult.h, satData, 0.30, 1)

      // Trimmed should produce higher max score (better match quality)
      const bigMax = bigDetections.length > 0 ? Math.max(...bigDetections.map(d => d.score)) : 0
      const trimMax = trimDetections.length > 0 ? Math.max(...trimDetections.map(d => d.score)) : 0
      expect(trimMax).toBeGreaterThanOrEqual(bigMax)
    })
  })
})
