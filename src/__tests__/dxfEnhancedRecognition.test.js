// ─── DXF Enhanced Recognition Tests ──────────────────────────────────────────
// Tests for remaining architecture boundaries after feature removal.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

const WORKSPACE_PATH = path.resolve('src/components/TakeoffWorkspace.jsx')

let workspaceSrc

beforeAll(() => {
  workspaceSrc = fs.readFileSync(WORKSPACE_PATH, 'utf8')
})

// ─── Architecture Boundaries ─────────────────────────────────────────────────
describe('Architecture Boundaries', () => {
  it('effectiveItems pipeline unchanged (extracted to useTakeoffRowState)', () => {
    // Pipeline extracted to hook — verify workspace delegates and hook contains the logic
    expect(workspaceSrc).toContain('useTakeoffRowState(')
    const hookSrc = fs.readFileSync(path.resolve('src/hooks/useTakeoffRowState.js'), 'utf8')
    expect(hookSrc).toContain('.filter(i => !deletedItems.has(i.blockName))')
  })

  it('takeoffRows pipeline unchanged', () => {
    expect(workspaceSrc).toContain('for (const item of effectiveItems)')
  })

  it('computePricing import unchanged', () => {
    expect(workspaceSrc).toContain("import { computePricing } from '../utils/pricing.js'")
  })

  it('PDF path not touched (prefill extracted to useTakeoffBootstrap)', () => {
    expect(workspaceSrc).toContain('runPdfTakeoff')
    // pdf_recognition prefill moved to useTakeoffBootstrap hook
    expect(workspaceSrc).toContain('useTakeoffBootstrap(')
    const hookSrc = fs.readFileSync(path.resolve('src/hooks/useTakeoffBootstrap.js'), 'utf8')
    expect(hookSrc).toContain("source === 'pdf_recognition'")
  })

  it('manual DXF tools preserved', () => {
    expect(workspaceSrc).toContain('DxfBlockOverlay')
    expect(workspaceSrc).toContain('DxfViewerPanel')
  })

  it('recognizeBlock is imported from blockRecognition utility', () => {
    expect(workspaceSrc).toContain("import { BLOCK_ASM_RULES, ASM_COLORS, recognizeBlock")
  })
})

// ─── Smoke Scenarios ─────────────────────────────────────────────────────────
describe('Smoke Scenarios', () => {
  it('DxfBlockOverlay imported, cable estimation extracted to hook', () => {
    expect(workspaceSrc).toContain('DxfBlockOverlay')
    expect(workspaceSrc).toContain('useCableEstimation')
    expect(workspaceSrc).toContain('CABLE_GENERIC_KW')
  })

  it('takeoffRows uses extracted aggregation functions (in useTakeoffRowState hook)', () => {
    const hookSrc = fs.readFileSync(path.resolve('src/hooks/useTakeoffRowState.js'), 'utf8')
    expect(hookSrc).toContain("import { buildRecognitionRows, buildMarkerRows, mergeTakeoffRows }")
    expect(hookSrc).toContain('buildRecognitionRows(effectiveItems')
    expect(hookSrc).toContain('mergeTakeoffRows(recognitionTakeoffRows')
  })
})
