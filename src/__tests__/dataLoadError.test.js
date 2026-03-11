// ─── Data-Load Error Surfacing — Regression Tests ────────────────────────────
// Proves that data-load failures in TakeoffWorkspace are no longer silently
// swallowed but are surfaced to the user via a visible error banner.
//
// Root cause: loadAssemblies/loadWorkItems had try/catch that returned []
// silently. loadMaterials had NO try/catch at all (crash risk).
//
// Fix: all three useMemo blocks now catch errors, set dataLoadError state
// with a descriptive message, and fall back to safe defaults.
// A banner using the existing saveError visual pattern is displayed above
// the tab content area on ALL tabs.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const workspaceSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/TakeoffWorkspace.jsx'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — state declaration', () => {
  it('dataLoadError state is declared', () => {
    expect(workspaceSrc).toContain('const [dataLoadError, setDataLoadError] = useState(null)')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — catch blocks set dataLoadError', () => {
  it('assemblies useMemo catches and sets dataLoadError', () => {
    // Find the assemblies useMemo block
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    expect(idx).toBeGreaterThan(-1)

    // The catch block should reference setDataLoadError, not silently return []
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    expect(blockEnd).toBeGreaterThan(idx)

    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('setDataLoadError')
    expect(block).toContain('catch')
  })

  it('workItems useMemo catches and sets dataLoadError', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    expect(idx).toBeGreaterThan(-1)

    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    expect(blockEnd).toBeGreaterThan(idx)

    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('setDataLoadError')
    expect(block).toContain('catch')
  })

  it('materials useMemo catches and sets dataLoadError', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    expect(idx).toBeGreaterThan(-1)

    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    expect(blockEnd).toBeGreaterThan(idx)

    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('setDataLoadError')
    expect(block).toContain('catch')
  })

  it('materials useMemo has try/catch (was missing before fix)', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    expect(idx).toBeGreaterThan(-1)

    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    const block = workspaceSrc.slice(idx - 100, blockEnd)
    expect(block).toContain('try {')
    expect(block).toContain('catch')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — visible banner', () => {
  it('dataLoadError banner is rendered above tab content (visible on ALL tabs)', () => {
    // The banner must appear BEFORE the first tab (TAKEOFF TAB)
    const bannerIdx = workspaceSrc.indexOf('{dataLoadError && (')
    const takeoffTabIdx = workspaceSrc.indexOf("TAKEOFF TAB")

    expect(bannerIdx).toBeGreaterThan(-1)
    expect(takeoffTabIdx).toBeGreaterThan(-1)
    expect(bannerIdx).toBeLessThan(takeoffTabIdx)
  })

  it('dataLoadError banner uses same visual pattern as saveError (DM Mono, red)', () => {
    const bannerIdx = workspaceSrc.indexOf('{dataLoadError && (')
    expect(bannerIdx).toBeGreaterThan(-1)

    const bannerEnd = workspaceSrc.indexOf('{dataLoadError}', bannerIdx)
    expect(bannerEnd).toBeGreaterThan(bannerIdx)

    const bannerBlock = workspaceSrc.slice(bannerIdx, bannerEnd + 30)
    expect(bannerBlock).toContain('C.redDim')
    expect(bannerBlock).toContain('C.red')
    expect(bannerBlock).toContain('DM Mono')
    expect(bannerBlock).toContain('{dataLoadError}')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — safe fallback on failure', () => {
  it('assemblies returns [] on catch', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('return []')
  })

  it('workItems returns [] on catch', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('return []')
  })

  it('materials returns [] on catch', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('return []')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — normal path unchanged', () => {
  it('assemblies still calls loadAssemblies() in try block', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    expect(idx).toBeGreaterThan(-1)

    // Verify it's inside a try block
    const blockStart = workspaceSrc.lastIndexOf('try {', idx)
    expect(blockStart).toBeGreaterThan(-1)
    expect(idx - blockStart).toBeLessThan(50)
  })

  it('workItems still calls loadWorkItems() in try block', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    expect(idx).toBeGreaterThan(-1)

    const blockStart = workspaceSrc.lastIndexOf('try {', idx)
    expect(blockStart).toBeGreaterThan(-1)
    expect(idx - blockStart).toBeLessThan(50)
  })

  it('materials still calls loadMaterials() in try block', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    expect(idx).toBeGreaterThan(-1)

    const blockStart = workspaceSrc.lastIndexOf('try {', idx)
    expect(blockStart).toBeGreaterThan(-1)
    expect(idx - blockStart).toBeLessThan(50)
  })

  it('materials still respects materialsProp when provided', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    // The materialsProp check must come before loadMaterials call
    const memoStart = workspaceSrc.lastIndexOf('useMemo(', idx)
    expect(memoStart).toBeGreaterThan(-1)

    const block = workspaceSrc.slice(memoStart, idx)
    expect(block).toContain('materialsProp')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — error messages are descriptive', () => {
  it('assemblies error message mentions "Szerelvénytár"', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('Szerelvénytár')
  })

  it('workItems error message mentions "Munkatételek"', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('Munkatételek')
  })

  it('materials error message mentions "Anyaglista"', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('Anyaglista')
  })

  it('error messages include err.message for diagnosability', () => {
    const idx1 = workspaceSrc.indexOf('loadAssemblies()')
    const end1 = workspaceSrc.indexOf('}, [])', idx1)
    expect(workspaceSrc.slice(idx1, end1)).toContain('err.message')

    const idx2 = workspaceSrc.indexOf('loadWorkItems()')
    const end2 = workspaceSrc.indexOf('}, [])', idx2)
    expect(workspaceSrc.slice(idx2, end2)).toContain('err.message')

    const idx3 = workspaceSrc.indexOf('loadMaterials()')
    const end3 = workspaceSrc.indexOf('}, [materialsProp])', idx3)
    expect(workspaceSrc.slice(idx3, end3)).toContain('err.message')
  })
})
