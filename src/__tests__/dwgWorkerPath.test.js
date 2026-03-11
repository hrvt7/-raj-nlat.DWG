// ─── DWG Worker Path — Structural Regression Tests ───────────────────────────
// Proves that the DWG→DXF converted text is parsed in a Web Worker (off main
// thread), not via the synchronous parseDxfText on the main thread.
//
// Root cause: the DWG path called parseDxfText(dxfText) directly — synchronous,
// main-thread-only. For large DWG files this froze the UI for several seconds.
//
// Fix: the DWG path now calls parseDxfTextInWorker() (with a try/catch fallback
// to parseDxfText for environments where workers fail). This is the same worker
// already used by parseDxfFile for native DXF files >5 MB.
//
// Also verifies: parseDxfTextInWorker is exported from dxfParser.js and imported
// in TakeoffWorkspace.jsx, and the native DXF path is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const workspaceSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/TakeoffWorkspace.jsx'),
  'utf-8'
)

const parserSrc = fs.readFileSync(
  path.resolve(__dirname, '../dxfParser.js'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('DWG path — worker-based parse', () => {
  it('parseDxfTextInWorker is exported from dxfParser.js', () => {
    expect(parserSrc).toContain('export function parseDxfTextInWorker(')
  })

  it('TakeoffWorkspace imports parseDxfTextInWorker', () => {
    expect(workspaceSrc).toContain('parseDxfTextInWorker')
    // Verify it's in the import statement from dxfParser
    const importLine = workspaceSrc.split('\n').find(l =>
      l.includes('dxfParser') && l.includes('import')
    )
    expect(importLine).toBeDefined()
    expect(importLine).toContain('parseDxfTextInWorker')
  })

  it('DWG path uses parseDxfTextInWorker as primary parse method', () => {
    // Find the DWG conversion block (ext === 'dwg')
    const dwgBlockStart = workspaceSrc.indexOf("ext === 'dwg'")
    expect(dwgBlockStart).toBeGreaterThan(-1)

    // Find the end of the DWG block (the else for native DXF)
    const nativeDxfBlock = workspaceSrc.indexOf('Native DXF parse', dwgBlockStart)
    expect(nativeDxfBlock).toBeGreaterThan(dwgBlockStart)

    const dwgBlock = workspaceSrc.slice(dwgBlockStart, nativeDxfBlock)

    // Must call parseDxfTextInWorker
    expect(dwgBlock).toContain('parseDxfTextInWorker(dxfText')
    // Must await the worker call
    expect(dwgBlock).toContain('await parseDxfTextInWorker(')
  })

  it('DWG path has try/catch fallback to parseDxfText', () => {
    const dwgBlockStart = workspaceSrc.indexOf("ext === 'dwg'")
    const nativeDxfBlock = workspaceSrc.indexOf('Native DXF parse', dwgBlockStart)
    const dwgBlock = workspaceSrc.slice(dwgBlockStart, nativeDxfBlock)

    // Must have a catch block with fallback
    expect(dwgBlock).toContain('catch (workerErr)')
    expect(dwgBlock).toContain('parseDxfText(dxfText)')
  })

  it('DWG path reports progress via setParseProgress', () => {
    const dwgBlockStart = workspaceSrc.indexOf("ext === 'dwg'")
    const nativeDxfBlock = workspaceSrc.indexOf('Native DXF parse', dwgBlockStart)
    const dwgBlock = workspaceSrc.slice(dwgBlockStart, nativeDxfBlock)

    expect(dwgBlock).toContain('setParseProgress')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('DWG path — no direct main-thread parse', () => {
  it('DWG primary path does NOT call parseDxfText directly (only in fallback)', () => {
    const dwgBlockStart = workspaceSrc.indexOf("ext === 'dwg'")
    const nativeDxfBlock = workspaceSrc.indexOf('Native DXF parse', dwgBlockStart)
    const dwgBlock = workspaceSrc.slice(dwgBlockStart, nativeDxfBlock)

    // parseDxfText should ONLY appear inside the catch block (fallback),
    // not as the primary parse call
    const workerCallIdx = dwgBlock.indexOf('parseDxfTextInWorker(')
    const catchIdx = dwgBlock.indexOf('catch (workerErr)')
    const fallbackIdx = dwgBlock.indexOf('parseDxfText(dxfText)')

    expect(workerCallIdx).toBeGreaterThan(-1)
    expect(catchIdx).toBeGreaterThan(-1)
    expect(fallbackIdx).toBeGreaterThan(-1)

    // The worker call must come BEFORE the catch
    expect(workerCallIdx).toBeLessThan(catchIdx)
    // The fallback parseDxfText must come AFTER the catch (inside catch block)
    expect(fallbackIdx).toBeGreaterThan(catchIdx)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Native DXF path — unchanged', () => {
  it('native DXF still uses parseDxfFile', () => {
    const nativeDxfIdx = workspaceSrc.indexOf('Native DXF parse')
    expect(nativeDxfIdx).toBeGreaterThan(-1)

    const afterNative = workspaceSrc.slice(nativeDxfIdx, nativeDxfIdx + 200)
    expect(afterNative).toContain('parseDxfFile(f,')
  })

  it('parseDxfFile still has worker threshold for large files', () => {
    expect(parserSrc).toContain('LARGE_FILE_THRESHOLD')
    expect(parserSrc).toContain('parseDxfTextInWorker(text, onProgress)')
  })
})
