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

  it('asmOverrides flow is preserved (existing RecognitionRow still works)', () => {
    expect(workspaceSrc).toContain('function RecognitionRow(')
    expect(workspaceSrc).toContain('asmOverrides[item.blockName]')
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

  it('DxfViewerPanel onMarkersChange still wired', () => {
    expect(workspaceSrc).toContain('onMarkersChange={(markers) => {')
    expect(workspaceSrc).toContain('setPdfMarkers(markers)')
  })

  it('DxfBlockOverlay still rendered for DXF', () => {
    expect(workspaceSrc).toContain('<DxfBlockOverlay')
    expect(workspaceSrc).toContain('inserts={effectiveParsedDxf.inserts}')
  })
})
