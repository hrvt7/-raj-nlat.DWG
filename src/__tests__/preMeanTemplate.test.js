/**
 * Pre-mean-subtracted template NCC equivalence tests.
 *
 * Proves that precomputing tplNorm[i] = tpl[i] - tMean produces
 * mathematically identical NCC scores as the inline subtraction.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ═══════════════════════════════════════════════════════════════════════════
// 1. NUMERICAL EQUIVALENCE
// ═══════════════════════════════════════════════════════════════════════════

describe('NCC mathematical equivalence: inline vs pre-subtracted', () => {
  // Old formula (inline):
  // ncc += (img[idx] - iMean) * (tpl[idx] - tMean)
  // result = ncc / (N * iStd * tStd)

  // New formula (pre-subtracted):
  // tplNorm[idx] = tpl[idx] - tMean (precomputed)
  // ncc += (img[idx] - iMean) * tplNorm[idx]
  // result = ncc / (N * iStd * tStd)

  function nccOld(img, tpl, N, iMean, iStd, tMean, tStd) {
    let ncc = 0
    for (let i = 0; i < N; i++) {
      ncc += (img[i] - iMean) * (tpl[i] - tMean)
    }
    return ncc / (N * iStd * tStd)
  }

  function nccNew(img, tplNorm, N, iMean, iStd, tStd) {
    let ncc = 0
    for (let i = 0; i < N; i++) {
      ncc += (img[i] - iMean) * tplNorm[i]
    }
    return ncc / (N * iStd * tStd)
  }

  function computeStats(arr) {
    const N = arr.length
    let sum = 0
    for (let i = 0; i < N; i++) sum += arr[i]
    const mean = sum / N
    let variance = 0
    for (let i = 0; i < N; i++) { const d = arr[i] - mean; variance += d * d }
    return { mean, std: Math.sqrt(variance / N) }
  }

  it('produces identical scores for random data', () => {
    const N = 100
    const img = Array.from({ length: N }, () => Math.random())
    const tpl = Array.from({ length: N }, () => Math.random())
    const iStats = computeStats(img)
    const tStats = computeStats(tpl)
    const tplNorm = tpl.map(v => v - tStats.mean)

    const oldScore = nccOld(img, tpl, N, iStats.mean, iStats.std, tStats.mean, tStats.std)
    const newScore = nccNew(img, tplNorm, N, iStats.mean, iStats.std, tStats.std)

    expect(newScore).toBeCloseTo(oldScore, 12) // 12 decimal places
  })

  it('produces identical scores for uniform-ish data', () => {
    const N = 25
    const img = Array.from({ length: N }, (_, i) => 0.5 + i * 0.01)
    const tpl = Array.from({ length: N }, (_, i) => 0.3 + i * 0.02)
    const iStats = computeStats(img)
    const tStats = computeStats(tpl)
    const tplNorm = tpl.map(v => v - tStats.mean)

    const oldScore = nccOld(img, tpl, N, iStats.mean, iStats.std, tStats.mean, tStats.std)
    const newScore = nccNew(img, tplNorm, N, iStats.mean, iStats.std, tStats.std)

    expect(newScore).toBeCloseTo(oldScore, 12)
  })

  it('produces identical scores for high-contrast data', () => {
    const N = 50
    const img = Array.from({ length: N }, (_, i) => i % 2 === 0 ? 0.0 : 1.0)
    const tpl = Array.from({ length: N }, (_, i) => i % 2 === 0 ? 0.1 : 0.9)
    const iStats = computeStats(img)
    const tStats = computeStats(tpl)
    const tplNorm = tpl.map(v => v - tStats.mean)

    const oldScore = nccOld(img, tpl, N, iStats.mean, iStats.std, tStats.mean, tStats.std)
    const newScore = nccNew(img, tplNorm, N, iStats.mean, iStats.std, tStats.std)

    expect(newScore).toBeCloseTo(oldScore, 12)
  })

  it('perfect match scores 1.0 in both formulas', () => {
    const N = 16
    const data = Array.from({ length: N }, () => Math.random())
    const stats = computeStats(data)
    const dataNorm = data.map(v => v - stats.mean)

    const oldScore = nccOld(data, data, N, stats.mean, stats.std, stats.mean, stats.std)
    const newScore = nccNew(data, dataNorm, N, stats.mean, stats.std, stats.std)

    expect(oldScore).toBeCloseTo(1.0, 10)
    expect(newScore).toBeCloseTo(1.0, 10)
    expect(newScore).toBeCloseTo(oldScore, 12)
  })

  it('anti-correlated data scores negative in both formulas', () => {
    const N = 10
    const img = Array.from({ length: N }, (_, i) => i / N)
    const tpl = Array.from({ length: N }, (_, i) => 1 - i / N) // reversed
    const iStats = computeStats(img)
    const tStats = computeStats(tpl)
    const tplNorm = tpl.map(v => v - tStats.mean)

    const oldScore = nccOld(img, tpl, N, iStats.mean, iStats.std, tStats.mean, tStats.std)
    const newScore = nccNew(img, tplNorm, N, iStats.mean, iStats.std, tStats.std)

    expect(oldScore).toBeLessThan(0)
    expect(newScore).toBeCloseTo(oldScore, 12)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. SOURCE CODE CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

describe('worker source contract for pre-mean-subtracted NCC', () => {
  const src = readFileSync(
    resolve(import.meta.dirname, '..', 'workers', 'templateMatch.worker.js'), 'utf-8'
  )

  it('nccAtPosition accepts tplNorm (not tpl + tMean)', () => {
    // New signature: no tMean parameter
    expect(src).toContain('function nccAtPosition(img, iW, tplNorm, tW, tH, x, y, iMean, iStd, tStd, N)')
    // Inner loop uses tplNorm directly (no subtraction)
    expect(src).toContain('tplNorm[tplRowOff + tx]')
    // Should NOT contain the old inline subtraction pattern
    expect(src).not.toContain('tpl[ty * tW + tx] - tMean')
  })

  it('matchDualChannel precomputes tplNormG and tplNormS', () => {
    expect(src).toContain('tplNormG[i] = d')
    expect(src).toContain('tplNormS[i] = d')
    expect(src).toContain('new Float32Array(N)')
  })

  it('call sites pass tplNormG/tplNormS instead of tplGray/tplSat', () => {
    expect(src).toContain('nccAtPosition(imgGray, iW, tplNormG')
    expect(src).toContain('nccAtPosition(imgSat, iW, tplNormS')
    // Should NOT pass tMeanG/tMeanS to nccAtPosition
    expect(src).not.toMatch(/nccAtPosition\(.*tMeanG/)
    expect(src).not.toMatch(/nccAtPosition\(.*tMeanS/)
  })

  it('other matcher components unchanged', () => {
    // NMS
    expect(src).toContain('const minDist = Math.max(tW, tH) * 0.6')
    // Hue filter
    expect(src).toContain('HUE_MAX_DISTANCE = 0.12')
    // 6 orientations
    expect(src).toContain("label: '0°'")
    expect(src).toContain("label: 'mirror+90°'")
  })
})
