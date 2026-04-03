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

  it('recognition pipeline feeds into existing takeoffRows', () => {
    // The existing effectiveItems → takeoffRows pipeline should remain intact
    expect(workspaceSrc).toContain('const recognitionTakeoffRows = useMemo(')
    expect(workspaceSrc).toContain('const markerTakeoffRows = useMemo(')
    expect(workspaceSrc).toContain('const takeoffRows = useMemo(')
  })

  it('asmOverrides flow is preserved (RecognitionRow imported)', () => {
    expect(workspaceSrc).toContain("import RecognitionRow from './takeoff/RecognitionRow.jsx'")
    expect(workspaceSrc).toContain('asmOverrides')
  })

  it('pricing pipeline is untouched (computePricing call unchanged)', () => {
    expect(workspaceSrc).toContain('computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode })')
  })

  it('cable estimation cascade is untouched', () => {
    expect(workspaceSrc).toContain('detectDxfCableLengths(effectiveParsedDxf)')
    expect(workspaceSrc).toContain('estimateCablesMST(devices, scaleFactor)')
    // Tier 3 fallback
    expect(workspaceSrc).toContain("method: 'Becslés eszközszám alapján (nincs pozícióadat)'")
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
    // The snapshotItems should include measurement line items (cable trays, manual measurements)
    expect(workspaceSrc).toContain("_fromMeasurement: true,")
    // Verify both the full-quote path AND the per-plan snapshot path have measurement items
    const perPlanSection = workspaceSrc.split('calcPricingLines: snapshotItems')[0] || ''
    expect(perPlanSection).toContain('for (const mi of measurementItems)')
  })

  it('DxfBlockOverlay still rendered for DXF', () => {
    expect(workspaceSrc).toContain('<DxfBlockOverlay')
    expect(workspaceSrc).toContain('inserts={effectiveParsedDxf.inserts}')
  })
})
