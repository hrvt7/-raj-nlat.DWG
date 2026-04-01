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
  it('effectiveItems pipeline unchanged', () => {
    expect(workspaceSrc).toContain('const effectiveItems = useMemo(() => {')
    expect(workspaceSrc).toContain('.filter(i => !deletedItems.has(i.blockName))')
  })

  it('takeoffRows pipeline unchanged', () => {
    expect(workspaceSrc).toContain('for (const item of effectiveItems)')
  })

  it('computePricing import unchanged', () => {
    expect(workspaceSrc).toContain("import { computePricing } from '../utils/pricing.js'")
  })

  it('PDF path not touched', () => {
    expect(workspaceSrc).toContain('runPdfTakeoff')
    expect(workspaceSrc).toContain("source === 'pdf_recognition'")
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
  it('manual tools (DxfBlockOverlay present, cable detection imported)', () => {
    expect(workspaceSrc).toContain('function DxfBlockOverlay')
    expect(workspaceSrc).toContain('detectDxfCableLengths')
    expect(workspaceSrc).toContain('CABLE_GENERIC_KW')
  })

  it('takeoffRows uses extracted aggregation functions', () => {
    expect(workspaceSrc).toContain("import { buildRecognitionRows, buildMarkerRows, mergeTakeoffRows }")
    expect(workspaceSrc).toContain('buildRecognitionRows(effectiveItems')
    expect(workspaceSrc).toContain('mergeTakeoffRows(recognitionTakeoffRows')
  })
})
