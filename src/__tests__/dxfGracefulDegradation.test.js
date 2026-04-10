// ─── DXF Graceful Degradation Tests ──────────────────────────────────────────
// Tests for architecture boundaries that remain after feature removals.
//
// These are architectural / contract tests — they verify the data flow and
// business logic without mounting React components.

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ── Source code reading helpers ──────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..')
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

// ─────────────────────────────────────────────────────────────────────────────
describe('Architecture Boundaries', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('recognition pipeline feeds into existing takeoffRows (extracted to useTakeoffRowState)', () => {
    // Pipeline extracted to hook — verify workspace delegates and hook contains the chain
    expect(workspaceSrc).toContain('useTakeoffRowState(')
    const hookSrc = readSrc('hooks/useTakeoffRowState.js')
    expect(hookSrc).toContain('buildRecognitionRows(effectiveItems')
    expect(hookSrc).toContain('buildMarkerRows(pdfMarkers')
    expect(hookSrc).toContain('mergeTakeoffRows(recognitionTakeoffRows')
  })

  it('asmOverrides flow is preserved (RecognitionRow imported)', () => {
    expect(workspaceSrc).toContain("import RecognitionRow from './takeoff/RecognitionRow.jsx'")
    expect(workspaceSrc).toContain('asmOverrides')
  })

  it('pricing pipeline is orchestrated via usePricingPipeline hook', () => {
    expect(workspaceSrc).toContain('usePricingPipeline')
  })

  it('cable estimation is orchestrated via useCableEstimation hook', () => {
    expect(workspaceSrc).toContain('useCableEstimation')
  })

  it('PDF path is not modified', () => {
    // Verify PDF viewer is still conditionally rendered
    expect(workspaceSrc).toContain('isPdf ? (')
    expect(workspaceSrc).toContain('<PdfViewerPanel')
  })

  it('DxfViewerPanel onMarkersChange wired to setPdfMarkers', () => {
    // Both DXF and PDF viewers must forward markers into the takeoff pipeline
    const dxfSection = workspaceSrc.split('<DxfViewerPanel')[1]?.split('/>')[0] || ''
    expect(dxfSection).toContain('onMarkersChange')
    expect(dxfSection).toContain('setPdfMarkers')
  })

  it('PdfViewerPanel onMarkersChange wired to setPdfMarkers', () => {
    const pdfSection = workspaceSrc.split('<PdfViewerPanel')[1]?.split('/>')[0] || ''
    expect(pdfSection).toContain('onMarkersChange')
    expect(pdfSection).toContain('setPdfMarkers')
  })

  it('DxfViewerPanel component accepts onMarkersChange prop', () => {
    const dxfViewerSrc = readSrc('components/DxfViewer/index.jsx')
    expect(dxfViewerSrc).toContain('onMarkersChange')
    expect(dxfViewerSrc).toContain('onMarkersChangeRef')
  })

  it('per-plan save snapshot includes measurement items', () => {
    // Snapshot item building (including measurement items) was extracted to saveHelpers.js
    // Verify TakeoffWorkspace delegates to buildSnapshotItems
    expect(workspaceSrc).toContain('buildSnapshotItems(')
    // Verify the helper itself preserves _fromMeasurement flag
    const helperSrc = readSrc('utils/saveHelpers.js')
    expect(helperSrc).toContain('_fromMeasurement: true,')
    expect(helperSrc).toContain('for (const mi of measurementItems)')
  })

  it('Canvas2D markers are sole overlay — DxfBlockOverlay removed', () => {
    // SVG overlay replaced by shared marker model (dxfInsertsToMarkers)
    expect(workspaceSrc).not.toContain('<DxfBlockOverlay')
    expect(workspaceSrc).toContain('dxfInsertsToMarkers')
    expect(workspaceSrc).toContain('visibleAsmIds={visibleAsmIds}')
  })
})
