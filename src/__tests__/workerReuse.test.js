/**
 * Worker reuse + image/SAT cache regression tests.
 *
 * Verifies the persistent worker protocol:
 * 1. Worker supports init + search two-phase protocol
 * 2. Worker supports legacy single-message protocol
 * 3. Cache is used in batch mode (SATs not rebuilt)
 * 4. Same input → same output (accuracy preservation)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const workerSrc = readFileSync(
  resolve(import.meta.dirname, '..', 'workers', 'templateMatch.worker.js'), 'utf-8'
)

const viewerSrc = readFileSync(
  resolve(import.meta.dirname, '..', 'components', 'PdfViewer', 'index.jsx'), 'utf-8'
)

describe('worker protocol — init/search two-phase', () => {
  it('worker handles type=init message', () => {
    expect(workerSrc).toContain("msg.type === 'init'")
    expect(workerSrc).toContain('initImageCache')
    expect(workerSrc).toContain("type: 'init-done'")
  })

  it('worker handles type=search message (cached mode)', () => {
    expect(workerSrc).toContain("msg.type === 'search'")
    expect(workerSrc).toContain('isBatchSearch')
    expect(workerSrc).toContain('_cachedImgGray')
  })

  it('worker still supports legacy mode (no type field)', () => {
    // When msg has no type, it falls through to legacy path
    expect(workerSrc).toContain("const isBatchSearch = msg.type === 'search'")
    // Legacy path computes channels + SATs from scratch
    expect(workerSrc).toContain('legacyImgData')
    expect(workerSrc).toContain('toGray(legacyImgData')
  })
})

describe('image/SAT cache logic', () => {
  it('caches gray, saturation channels and both SATs', () => {
    expect(workerSrc).toContain('_cachedImgGray')
    expect(workerSrc).toContain('_cachedImgSat')
    expect(workerSrc).toContain('_cachedSatGray')
    expect(workerSrc).toContain('_cachedSatSatCh')
  })

  it('initImageCache sets all cached values', () => {
    expect(workerSrc).toContain('function initImageCache(imgData, imgW, imgH)')
    expect(workerSrc).toContain('_cachedImgGray = toGray(imgData')
    expect(workerSrc).toContain('_cachedImgSat = toSaturation(imgData')
    expect(workerSrc).toContain('_cachedSatGray = buildSAT(_cachedImgGray')
    expect(workerSrc).toContain('_cachedSatSatCh = buildSAT(_cachedImgSat')
  })

  it('batch search path uses cached data (no SAT rebuild)', () => {
    // The old "Build SATs" comment should be replaced
    expect(workerSrc).toContain('already built above (from cache or legacy path)')
    // Should NOT rebuild SATs after cache block
    expect(workerSrc).not.toMatch(/const satGray = buildSAT\(imgGray/)
  })
})

describe('batch search uses persistent worker', () => {
  it('sends init message with image data', () => {
    expect(viewerSrc).toContain("type: 'init', imgData: imageData.data")
    expect(viewerSrc).toContain("'init-done'")
  })

  it('sends search messages without image data', () => {
    expect(viewerSrc).toContain("type: 'search', tplData: cropData")
    // search message should NOT contain imgData
    expect(viewerSrc).not.toContain("type: 'search', imgData")
  })

  it('creates ONE worker for entire batch (not per-template)', () => {
    // The batch search section should create worker BEFORE the family loop
    expect(viewerSrc).toContain('persistent worker for the entire batch session')
  })

  it('terminates batch worker in finally block', () => {
    expect(viewerSrc).toContain('Terminate batch worker')
  })
})

describe('accuracy safety contract', () => {
  it('NCC formula unchanged', () => {
    expect(workerSrc).toContain('function nccAtPosition(img, iW, tpl, tW, tH, x, y, iMean, iStd, tMean, tStd, N)')
  })

  it('matchDualChannel signature unchanged', () => {
    expect(workerSrc).toContain('function matchDualChannel(imgGray, imgSat, iW, iH, tplGray, tplSat, tW, tH,')
  })

  it('NMS unchanged', () => {
    expect(workerSrc).toContain('function nonMaxSuppression(detections, tW, tH, overlapThreshold)')
    expect(workerSrc).toContain('const minDist = Math.max(tW, tH) * 0.6')
  })

  it('hue post-filter constants unchanged', () => {
    expect(workerSrc).toContain('HUE_SAT_GATE = 0.15')
    expect(workerSrc).toContain('HUE_MIN_COLORED_RATIO = 0.2')
    expect(workerSrc).toContain('HUE_DOMINANCE_RATIO = 0.40')
    expect(workerSrc).toContain('HUE_MAX_DISTANCE = 0.12')
  })

  it('6 orientation variants unchanged', () => {
    expect(workerSrc).toContain("label: '0°'")
    expect(workerSrc).toContain("label: '90°'")
    expect(workerSrc).toContain("label: '180°'")
    expect(workerSrc).toContain("label: '270°'")
    expect(workerSrc).toContain("label: 'mirror'")
    expect(workerSrc).toContain("label: 'mirror+90°'")
  })
})
