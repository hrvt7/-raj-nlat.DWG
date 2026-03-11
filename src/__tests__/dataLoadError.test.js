// ─── Data-Load Error Surfacing — Regression Tests ────────────────────────────
// Proves that data-load failures in TakeoffWorkspace are surfaced to the user
// via a visible error banner, using a derived error (not render-phase setState).
//
// Root cause: loadAssemblies/loadWorkItems had try/catch that returned []
// silently. loadMaterials had NO try/catch at all (crash risk).
//
// Fix v1: called setDataLoadError() inside useMemo — render-phase side effect.
// Fix v2 (current): each useMemo returns { data, error }; dataLoadError is
// derived as a plain const from the three .error fields. No state, no effects,
// no render-phase side effects.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const workspaceSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/TakeoffWorkspace.jsx'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — derived (not state)', () => {
  it('dataLoadError is a derived const, not useState', () => {
    expect(workspaceSrc).toContain('const dataLoadError = ')
    expect(workspaceSrc).not.toContain('const [dataLoadError, setDataLoadError]')
  })

  it('dataLoadError is derived from _asmLoad.error || _wiLoad.error || _matLoad.error', () => {
    expect(workspaceSrc).toContain(
      'const dataLoadError = _asmLoad.error || _wiLoad.error || _matLoad.error'
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — useMemo returns { data, error } tuples', () => {
  it('assemblies useMemo returns { data, error } on success', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    expect(idx).toBeGreaterThan(-1)
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx - 60, blockEnd)
    expect(block).toContain('{ data: loadAssemblies(), error: null }')
  })

  it('assemblies useMemo returns { data: [], error } on catch', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('{ data: [], error:')
    expect(block).toContain('catch')
  })

  it('workItems useMemo returns { data, error } on success', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    expect(idx).toBeGreaterThan(-1)
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx - 60, blockEnd)
    expect(block).toContain('{ data: loadWorkItems(), error: null }')
  })

  it('workItems useMemo returns { data: [], error } on catch', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('{ data: [], error:')
    expect(block).toContain('catch')
  })

  it('materials useMemo returns { data, error } on success', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    expect(idx).toBeGreaterThan(-1)
    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    const block = workspaceSrc.slice(idx - 60, blockEnd)
    expect(block).toContain('{ data: loadMaterials(), error: null }')
  })

  it('materials useMemo returns { data: [], error } on catch', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('{ data: [], error:')
    expect(block).toContain('catch')
  })

  it('materials useMemo has try/catch (was missing before original fix)', () => {
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
  it('assemblies fallback is [] on catch', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('data: []')
  })

  it('workItems fallback is [] on catch', () => {
    const idx = workspaceSrc.indexOf('loadWorkItems()')
    const blockEnd = workspaceSrc.indexOf('}, [])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('data: []')
  })

  it('materials fallback is [] on catch', () => {
    const idx = workspaceSrc.indexOf('loadMaterials()')
    const blockEnd = workspaceSrc.indexOf('}, [materialsProp])', idx)
    const block = workspaceSrc.slice(idx, blockEnd)
    expect(block).toContain('data: []')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — normal path unchanged', () => {
  it('assemblies still calls loadAssemblies() in try block', () => {
    const idx = workspaceSrc.indexOf('loadAssemblies()')
    expect(idx).toBeGreaterThan(-1)
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
    const memoStart = workspaceSrc.lastIndexOf('useMemo(', idx)
    expect(memoStart).toBeGreaterThan(-1)
    const block = workspaceSrc.slice(memoStart, idx)
    expect(block).toContain('materialsProp')
  })

  it('assemblies, workItems, materials are derived from .data', () => {
    expect(workspaceSrc).toContain('const assemblies = _asmLoad.data')
    expect(workspaceSrc).toContain('const workItems = _wiLoad.data')
    expect(workspaceSrc).toContain('const materials = _matLoad.data')
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

// ═════════════════════════════════════════════════════════════════════════════
describe('Data-load error — no render-phase state updates (regression)', () => {
  it('no setState call inside any useMemo that calls a load function', () => {
    // Find all useMemo blocks that contain load calls
    const loadPatterns = ['loadAssemblies()', 'loadWorkItems()', 'loadMaterials()']
    for (const pat of loadPatterns) {
      const idx = workspaceSrc.indexOf(pat)
      expect(idx).toBeGreaterThan(-1)

      // Find the enclosing useMemo
      const memoStart = workspaceSrc.lastIndexOf('useMemo(', idx)
      expect(memoStart).toBeGreaterThan(-1)

      // Find the end of this useMemo (closing }), deps])
      // Look for the first '], [' or '], [])' after the load call
      const afterLoad = workspaceSrc.indexOf('])', idx)
      const memoBlock = workspaceSrc.slice(memoStart, afterLoad)

      // Must NOT contain any set* state updater calls
      expect(memoBlock).not.toMatch(/\bset[A-Z]\w*\(/)
    }
  })

  it('setDataLoadError does not exist in TakeoffWorkspace', () => {
    expect(workspaceSrc).not.toContain('setDataLoadError')
  })
})
