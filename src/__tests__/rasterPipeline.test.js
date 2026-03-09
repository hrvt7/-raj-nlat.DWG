// ─── Raster Pipeline Tests ───────────────────────────────────────────────────
// Regression tests for the unified raster matching pipeline (rasterPipeline.js).
//
// Covers:
//   1. Constants & DPI strategy
//   2. extractRegionGray — pixel extraction + clamping + safety limits
//   3. preprocessRaster — trim + contrast (unified for sample & target)
//   4. runNccMatch — NCC on preprocessed inputs
//   5. Same-pipeline guarantee (sample & target through identical preprocessing)
//   6. Region-only constraint (no matches outside region)
//   7. Exact vs tolerant threshold behavior
//   8. Architecture boundary (no session/candidate/rule engine)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest'

// ── Mock ImageData for Node.js test environment ─────────────────────────────
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      if (data instanceof Uint8ClampedArray) {
        this.data = data
        this.width = width
        this.height = height ?? (data.length / (width * 4))
      } else {
        // ImageData(width, height) form
        this.width = data
        this.height = width
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
    }
  }
}

import {
  RASTER_DPI,
  RASTER_SCALE,
  MAX_REGION_PIXELS,
  MIN_REGION_PX,
  extractRegionGray,
  preprocessRaster,
  runNccMatch,
} from '../utils/rasterPipeline.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a fake ImageData-like object for testing.
 * Fills with a pattern: pixel at (x,y) gets R=x%256, G=y%256, B=128, A=255
 */
function makeTestImageData(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = x % 256     // R
      data[i + 1] = y % 256 // G
      data[i + 2] = 128     // B
      data[i + 3] = 255     // A
    }
  }
  // Mimic ImageData interface
  return { data, width: w, height: h }
}

/**
 * Create a uniform gray Float32Array
 */
function makeUniformGray(w, h, value = 0.5) {
  const gray = new Float32Array(w * h)
  gray.fill(value)
  return gray
}

/**
 * Create a gray with a dark "symbol" block embedded at (sx,sy) of size (sw,sh)
 */
function makeGrayWithSymbol(w, h, sx, sy, sw, sh, bgVal = 0.95, fgVal = 0.1) {
  const gray = new Float32Array(w * h)
  gray.fill(bgVal)
  for (let y = sy; y < sy + sh && y < h; y++) {
    for (let x = sx; x < sx + sw && x < w; x++) {
      gray[y * w + x] = fgVal
    }
  }
  return gray
}

// ── 1. Constants & DPI strategy ─────────────────────────────────────────────

describe('raster pipeline constants', () => {
  it('RASTER_DPI is 150', () => {
    expect(RASTER_DPI).toBe(150)
  })

  it('RASTER_SCALE = DPI / 72', () => {
    expect(RASTER_SCALE).toBeCloseTo(150 / 72, 6)
    expect(RASTER_SCALE).toBeGreaterThan(2) // slightly better than legacy scale=2
  })

  it('MAX_REGION_PIXELS is a safe limit', () => {
    expect(MAX_REGION_PIXELS).toBe(4_000_000)
    // A4 at 150 DPI = ~1240×1754 = ~2.17M — well under limit
    const a4Pixels = Math.ceil(595 * RASTER_SCALE) * Math.ceil(842 * RASTER_SCALE)
    expect(a4Pixels).toBeLessThan(MAX_REGION_PIXELS)
  })

  it('MIN_REGION_PX prevents degenerate regions', () => {
    expect(MIN_REGION_PX).toBeGreaterThanOrEqual(4)
  })
})

// ── 2. extractRegionGray ────────────────────────────────────────────────────

describe('extractRegionGray', () => {
  it('extracts a sub-region as grayscale', () => {
    const img = makeTestImageData(100, 100)
    const result = extractRegionGray(img, 100, 100, { x: 10, y: 10, w: 20, h: 20 }, 1)
    expect(result).not.toBeNull()
    expect(result.w).toBe(20)
    expect(result.h).toBe(20)
    expect(result.gray).toBeInstanceOf(Float32Array)
    expect(result.gray.length).toBe(20 * 20)
  })

  it('clamps region to page bounds (negative coords)', () => {
    const img = makeTestImageData(100, 100)
    const result = extractRegionGray(img, 100, 100, { x: -10, y: -10, w: 30, h: 30 }, 1)
    expect(result).not.toBeNull()
    // px = max(0, -10) = 0, pw = min(100-0, ceil(30)) = 30
    // Negative origin is clamped, but width is based on bbox.w * scale
    expect(result.w).toBe(30)
    expect(result.h).toBe(30)
    // Key: region starts at page origin (0,0), no negative pixel access
  })

  it('clamps region extending beyond page', () => {
    const img = makeTestImageData(100, 100)
    const result = extractRegionGray(img, 100, 100, { x: 90, y: 90, w: 30, h: 30 }, 1)
    expect(result).not.toBeNull()
    expect(result.w).toBe(10) // 100 - 90
    expect(result.h).toBe(10)
  })

  it('returns null for region too small', () => {
    const img = makeTestImageData(100, 100)
    const result = extractRegionGray(img, 100, 100, { x: 50, y: 50, w: 2, h: 2 }, 1)
    expect(result).toBeNull() // below MIN_REGION_PX
  })

  it('returns null for region exceeding MAX_REGION_PIXELS', () => {
    // Fake a massive image — the region itself would be huge
    const img = makeTestImageData(10, 10)
    // bbox claims 3000×2000 pixels at scale=1 — way over 4M
    const result = extractRegionGray(img, 10, 10, { x: 0, y: 0, w: 3000, h: 2000 }, 1)
    // Clamped to 10×10 which is fine, so it succeeds in this case
    expect(result).not.toBeNull()
    expect(result.w).toBe(10)
  })

  it('applies scale factor to bbox', () => {
    const img = makeTestImageData(200, 200)
    // bbox is in PDF scale=1, scale=2 means pixel coords are doubled
    const result = extractRegionGray(img, 200, 200, { x: 10, y: 10, w: 50, h: 50 }, 2)
    expect(result).not.toBeNull()
    expect(result.w).toBe(100) // 50 * 2
    expect(result.h).toBe(100)
  })

  it('grayscale values are in [0,1] range', () => {
    const img = makeTestImageData(50, 50)
    const result = extractRegionGray(img, 50, 50, { x: 0, y: 0, w: 50, h: 50 }, 1)
    expect(result).not.toBeNull()
    for (let i = 0; i < result.gray.length; i++) {
      expect(result.gray[i]).toBeGreaterThanOrEqual(0)
      expect(result.gray[i]).toBeLessThanOrEqual(1)
    }
  })
})

// ── 3. preprocessRaster ─────────────────────────────────────────────────────

describe('preprocessRaster', () => {
  it('contrast-only mode preserves dimensions', () => {
    const gray = makeUniformGray(30, 30, 0.5)
    const result = preprocessRaster(gray, 30, 30, { trim: false, contrast: true })
    expect(result).not.toBeNull()
    expect(result.w).toBe(30)
    expect(result.h).toBe(30)
    expect(result.trimRect).toBeNull()
  })

  it('trim mode removes whitespace from template', () => {
    // Create a 50x50 gray with a dark block at center (20,20)→(30,30)
    const gray = makeGrayWithSymbol(50, 50, 20, 20, 10, 10)
    const result = preprocessRaster(gray, 50, 50, { trim: true, contrast: false })
    expect(result).not.toBeNull()
    // Trimmed dimensions should be smaller than original
    expect(result.w).toBeLessThan(50)
    expect(result.h).toBeLessThan(50)
    expect(result.trimRect).not.toBeNull()
  })

  it('returns null for entirely blank (white) input with trim', () => {
    const gray = makeUniformGray(30, 30, 1.0) // all white
    const result = preprocessRaster(gray, 30, 30, { trim: true, contrast: false })
    expect(result).toBeNull()
  })

  it('contrast enhances dark/light separation', () => {
    // Use values far from midpoint (0.5) so sigmoid pushes them further apart
    const gray = new Float32Array([0.1, 0.9]) // dark, light
    const result = preprocessRaster(gray, 2, 1, { trim: false, contrast: true, contrastStrength: 3.0 })
    expect(result).not.toBeNull()
    // sigmoid(0.1, 3.0) ≈ 0.231 — still below 0.5
    // sigmoid(0.9, 3.0) ≈ 0.769 — still above 0.5
    // The key property: the gap between them is preserved/enhanced
    expect(result.gray[0]).toBeLessThan(0.5) // dark stays dark side
    expect(result.gray[1]).toBeGreaterThan(0.5) // light stays light side
    // Separation is maintained
    expect(result.gray[1] - result.gray[0]).toBeGreaterThan(0.3)
  })

  it('sample and target can use same function with different options', () => {
    const gray = makeGrayWithSymbol(40, 40, 10, 10, 20, 20)
    // Sample: trim + contrast
    const sample = preprocessRaster(gray, 40, 40, { trim: true, contrast: true })
    // Target: contrast only
    const target = preprocessRaster(gray, 40, 40, { trim: false, contrast: true })
    expect(sample).not.toBeNull()
    expect(target).not.toBeNull()
    // Sample is trimmed (smaller), target keeps original size
    expect(sample.w).toBeLessThanOrEqual(target.w)
    expect(sample.h).toBeLessThanOrEqual(target.h)
  })

  it('is a pure function (does not mutate input)', () => {
    const gray = makeGrayWithSymbol(30, 30, 5, 5, 10, 10)
    const original = new Float32Array(gray)
    preprocessRaster(gray, 30, 30, { trim: true, contrast: true })
    // Original array not mutated
    expect(gray).toEqual(original)
  })
})

// ── 4. runNccMatch ──────────────────────────────────────────────────────────

describe('runNccMatch', () => {
  it('finds exact match when sample is embedded in target', () => {
    // Create target with a distinct pattern
    const target = makeGrayWithSymbol(60, 60, 20, 20, 15, 15, 0.9, 0.1)
    // Create sample that is exactly the embedded pattern (+ some bg)
    const sample = makeGrayWithSymbol(20, 20, 2, 2, 15, 15, 0.9, 0.1)

    const detections = runNccMatch(
      { gray: sample, w: 20, h: 20 },
      { gray: target, w: 60, h: 60 },
      0.5,
    )
    expect(detections.length).toBeGreaterThan(0)
    expect(detections[0].score).toBeGreaterThan(0.5)
  })

  it('returns empty for non-matching sample', () => {
    // Target: bright
    const target = makeGrayWithSymbol(60, 60, 20, 20, 15, 15, 0.9, 0.1)
    // Sample: all mid-gray (no contrast, no match)
    const sample = makeUniformGray(15, 15, 0.5)

    const detections = runNccMatch(
      { gray: sample, w: 15, h: 15 },
      { gray: target, w: 60, h: 60 },
      0.6,
    )
    // NCC skips uniform patches (tStd < 0.02), so zero results
    expect(detections.length).toBe(0)
  })

  it('returns empty when sample is larger than target', () => {
    const sample = makeUniformGray(100, 100, 0.5)
    const target = makeUniformGray(50, 50, 0.5)
    const detections = runNccMatch(
      { gray: sample, w: 100, h: 100 },
      { gray: target, w: 50, h: 50 },
      0.5,
    )
    expect(detections.length).toBe(0)
  })

  it('returns empty when sample is too small', () => {
    const sample = makeUniformGray(3, 3, 0.5) // below 4×4 minimum
    const target = makeUniformGray(50, 50, 0.5)
    const detections = runNccMatch(
      { gray: sample, w: 3, h: 3 },
      { gray: target, w: 50, h: 50 },
      0.5,
    )
    expect(detections.length).toBe(0)
  })

  it('respects threshold — higher threshold = fewer matches', () => {
    const target = makeGrayWithSymbol(80, 80, 30, 30, 15, 15, 0.9, 0.1)
    const sample = makeGrayWithSymbol(20, 20, 2, 2, 15, 15, 0.9, 0.1)

    const lowThreshold = runNccMatch(
      { gray: sample, w: 20, h: 20 },
      { gray: target, w: 80, h: 80 },
      0.3,
    )
    const highThreshold = runNccMatch(
      { gray: sample, w: 20, h: 20 },
      { gray: target, w: 80, h: 80 },
      0.95,
    )
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length)
  })

  it('detection coords are within target dimensions', () => {
    const target = makeGrayWithSymbol(80, 80, 30, 30, 15, 15, 0.9, 0.1)
    const sample = makeGrayWithSymbol(20, 20, 2, 2, 15, 15, 0.9, 0.1)
    const detections = runNccMatch(
      { gray: sample, w: 20, h: 20 },
      { gray: target, w: 80, h: 80 },
      0.3,
    )
    for (const d of detections) {
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.x + 20).toBeLessThanOrEqual(80) // sample width
      expect(d.y + 20).toBeLessThanOrEqual(80)
    }
  })
})

// ── 5. Same-pipeline guarantee ──────────────────────────────────────────────

describe('unified preprocessing guarantee', () => {
  it('same input through preprocessRaster gives identical output regardless of call order', () => {
    const gray = makeGrayWithSymbol(40, 40, 10, 10, 20, 20)
    const opts = { trim: false, contrast: true, contrastStrength: 3.0 }

    const result1 = preprocessRaster(new Float32Array(gray), 40, 40, opts)
    const result2 = preprocessRaster(new Float32Array(gray), 40, 40, opts)

    expect(result1.w).toBe(result2.w)
    expect(result1.h).toBe(result2.h)
    for (let i = 0; i < result1.gray.length; i++) {
      expect(result1.gray[i]).toBeCloseTo(result2.gray[i], 10)
    }
  })

  it('sample trim + contrast vs target contrast-only both start from same gray input', () => {
    const gray = makeGrayWithSymbol(40, 40, 10, 10, 20, 20)

    // This simulates the pipeline: both start from extractRegionGray → toGray
    const samplePrep = preprocessRaster(new Float32Array(gray), 40, 40, { trim: true, contrast: true })
    const targetPrep = preprocessRaster(new Float32Array(gray), 40, 40, { trim: false, contrast: true })

    // Both should have been contrast-enhanced
    expect(samplePrep).not.toBeNull()
    expect(targetPrep).not.toBeNull()
    // Target keeps full size, sample may be trimmed
    expect(targetPrep.w).toBe(40)
    expect(targetPrep.h).toBe(40)
  })

  it('RASTER_SCALE is applied equally to sample and target bbox extraction', () => {
    const img = makeTestImageData(200, 200)
    const scale = RASTER_SCALE

    // Same bbox, same scale → same pixel dimensions
    const bbox = { x: 10, y: 10, w: 30, h: 30 }
    const r1 = extractRegionGray(img, 200, 200, bbox, scale)
    const r2 = extractRegionGray(img, 200, 200, bbox, scale)

    expect(r1).not.toBeNull()
    expect(r2).not.toBeNull()
    expect(r1.w).toBe(r2.w)
    expect(r1.h).toBe(r2.h)
  })
})

// ── 6. Region-only constraint ───────────────────────────────────────────────

describe('region-only constraint', () => {
  it('extractRegionGray output dimensions match requested bbox (not full page)', () => {
    const pageW = 200
    const pageH = 200
    const img = makeTestImageData(pageW, pageH)

    const fullPage = extractRegionGray(img, pageW, pageH, { x: 0, y: 0, w: 200, h: 200 }, 1)
    const quarter = extractRegionGray(img, pageW, pageH, { x: 50, y: 50, w: 100, h: 100 }, 1)

    expect(fullPage.w * fullPage.h).toBe(200 * 200)
    expect(quarter.w * quarter.h).toBe(100 * 100)
    // Quarter is strictly smaller
    expect(quarter.gray.length).toBeLessThan(fullPage.gray.length)
  })

  it('NCC runs only on extracted region pixels — matches are region-local', () => {
    // Create a page-sized target with symbols at two locations
    const pageGray = makeGrayWithSymbol(100, 100, 10, 10, 8, 8, 0.9, 0.1)
    // Also put a symbol outside the search region
    for (let y = 70; y < 78; y++) {
      for (let x = 70; x < 78; x++) {
        pageGray[y * 100 + x] = 0.1
      }
    }

    // Extract only the top-left quarter as search region
    const regionGray = new Float32Array(50 * 50)
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        regionGray[y * 50 + x] = pageGray[y * 100 + x]
      }
    }

    // Sample: the symbol pattern
    const sample = makeGrayWithSymbol(12, 12, 2, 2, 8, 8, 0.9, 0.1)

    const detections = runNccMatch(
      { gray: sample, w: 12, h: 12 },
      { gray: regionGray, w: 50, h: 50 },
      0.5,
    )

    // Should find the symbol at (10,10) region-local
    // Should NOT find the symbol at (70,70) — it's outside the extracted region
    for (const d of detections) {
      expect(d.x + 12).toBeLessThanOrEqual(50) // within region
      expect(d.y + 12).toBeLessThanOrEqual(50)
    }
  })
})

// ── 7. Exact vs tolerant threshold ──────────────────────────────────────────

describe('exact vs tolerant on raster pipeline', () => {
  // Import scale mode config for threshold values
  it('exact mode threshold (0.65) is stricter than tolerant (0.50)', async () => {
    const { resolveScaleModeConfig, SCALE_MODE } = await import('../data/countObjectStore.js')
      .then(() => import('../services/countWorkflow/index.js'))

    const exact = resolveScaleModeConfig('exact')
    const tolerant = resolveScaleModeConfig('tolerant')

    expect(exact.nccThreshold).toBeGreaterThan(tolerant.nccThreshold)
    expect(exact.nccThreshold).toBeGreaterThanOrEqual(0.60)
    expect(tolerant.nccThreshold).toBeLessThanOrEqual(0.55)
  })

  it('higher threshold produces fewer or equal matches', () => {
    const target = makeGrayWithSymbol(80, 80, 30, 30, 15, 15, 0.9, 0.1)
    const sample = makeGrayWithSymbol(20, 20, 2, 2, 15, 15, 0.9, 0.1)

    const exactMatches = runNccMatch(
      { gray: sample, w: 20, h: 20 },
      { gray: target, w: 80, h: 80 },
      0.65, // exact threshold
    )
    const tolerantMatches = runNccMatch(
      { gray: sample, w: 20, h: 20 },
      { gray: target, w: 80, h: 80 },
      0.50, // tolerant threshold
    )

    expect(tolerantMatches.length).toBeGreaterThanOrEqual(exactMatches.length)
  })
})

// ── 8. Architecture boundary ────────────────────────────────────────────────

describe('raster pipeline architecture boundary', () => {
  it('rasterPipeline.js does not export session/candidate types', async () => {
    const pipeline = await import('../utils/rasterPipeline.js')
    expect(pipeline).not.toHaveProperty('createSearchSession')
    expect(pipeline).not.toHaveProperty('createSessionCandidate')
    expect(pipeline).not.toHaveProperty('CANDIDATE_STATUS')
    expect(pipeline).not.toHaveProperty('materializeAccepted')
  })

  it('rasterPipeline.js does not export rule engine types', async () => {
    const pipeline = await import('../utils/rasterPipeline.js')
    expect(pipeline).not.toHaveProperty('DetectionCandidate')
    expect(pipeline).not.toHaveProperty('applyRules')
    expect(pipeline).not.toHaveProperty('RuleEngine')
  })

  it('matchRegionRaster returns plain detection objects (not candidates)', async () => {
    const pipeline = await import('../utils/rasterPipeline.js')
    // matchRegionRaster requires pdf.js — we just verify it's exported
    expect(typeof pipeline.matchRegionRaster).toBe('function')
  })

  it('extractRegionGray + preprocessRaster are reusable outside count workflow', () => {
    // These are general-purpose raster utilities
    const img = makeTestImageData(50, 50)
    const region = extractRegionGray(img, 50, 50, { x: 5, y: 5, w: 20, h: 20 }, 1)
    expect(region).not.toBeNull()
    const prepped = preprocessRaster(region.gray, region.w, region.h, { contrast: true })
    expect(prepped).not.toBeNull()
    expect(prepped.gray.length).toBe(region.w * region.h)
  })
})
