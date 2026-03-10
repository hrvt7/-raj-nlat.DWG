// ─── DXF Viewer Interaction Parity — Regression Tests ───────────────────────
// Covers:
//   1. Coordinate system helpers in DxfViewerCanvas
//   2. Right panel receives DXF markers (TakeoffWorkspace wiring)
//   3. Architecture boundary — shared markerModel
//   4. DXF tool availability — manual tools work
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const dxfViewerSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/DxfViewer/index.jsx'),
  'utf-8'
)
const dxfCanvasSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/DxfViewer/DxfViewerCanvas.jsx'),
  'utf-8'
)
const workspaceSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/TakeoffWorkspace.jsx'),
  'utf-8'
)

// ═════════════════════════════════════════════════════════════════════════════
describe('DxfViewerCanvas — coordinate system helpers', () => {
  it('exposes sceneToScreen function', () => {
    expect(dxfCanvasSrc).toContain('sceneToScreen:')
    expect(dxfCanvasSrc).toContain('vec.project(v.camera)')
  })

  it('exposes screenToScene function', () => {
    expect(dxfCanvasSrc).toContain('screenToScene:')
    expect(dxfCanvasSrc).toContain('vec.unproject(v.camera)')
  })

  it('screen→scene uses Three.js normalized device coordinates', () => {
    // Must convert screen pixels to NDC [-1,1] range
    expect(dxfCanvasSrc).toContain('(screenX / canvas.clientWidth) * 2 - 1')
    expect(dxfCanvasSrc).toContain('-(screenY / canvas.clientHeight) * 2 + 1')
  })

  it('scene→screen converts from Three.js projection to pixels', () => {
    expect(dxfCanvasSrc).toContain('(vec.x + 1) / 2 * canvas.clientWidth')
    expect(dxfCanvasSrc).toContain('(-vec.y + 1) / 2 * canvas.clientHeight')
  })

  it('pointer move handler converts screen to scene coords', () => {
    expect(dxfCanvasSrc).toContain('vec.unproject(camera)')
    expect(dxfCanvasSrc).toContain('onPointerMove({ screenX: sx, screenY: sy, sceneX: vec.x, sceneY: vec.y })')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('TakeoffWorkspace — DXF marker wiring to right panel', () => {
  it('pdfMarkers drives assembly count in right panel', () => {
    // pdfMarkers.filter for assembly markers
    expect(workspaceSrc).toContain("pdfMarkers.filter(m => m.asmId")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('Architecture boundary — shared infrastructure', () => {
  it('DxfViewerPanel uses createMarker from markerModel', () => {
    expect(dxfViewerSrc).toContain("import { createMarker")
    expect(dxfViewerSrc).toContain("from '../../utils/markerModel.js'")
  })

  it('DxfViewerPanel uses normalizeMarkers from markerModel', () => {
    expect(dxfViewerSrc).toContain('normalizeMarkers')
  })

  it('DxfViewerPanel uses deduplicateMarkersManualFirst', () => {
    expect(dxfViewerSrc).toContain('deduplicateMarkersManualFirst')
  })

  it('DxfViewerPanel uses savePlanAnnotations', () => {
    expect(dxfViewerSrc).toContain("savePlanAnnotations(planId,")
  })

  it('markerModel createMarker produces valid structure', async () => {
    const { createMarker } = await import('../utils/markerModel.js')
    const m = createMarker({ x: 100, y: 200, category: 'socket', color: '#4CC9F0', source: 'manual' })
    expect(m.id).toMatch(/^MRK-/)
    expect(m.x).toBe(100)
    expect(m.y).toBe(200)
    expect(m.category).toBe('socket')
    expect(m.source).toBe('manual')
    expect(m.createdAt).toBeTruthy()
  })

  it('DXF and PDF use same marker pipeline', () => {
    // Both import from markerModel
    const pdfViewerSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/PdfViewer/index.jsx'),
      'utf-8'
    )
    expect(pdfViewerSrc).toContain("from '../../utils/markerModel.js'")
    expect(dxfViewerSrc).toContain("from '../../utils/markerModel.js'")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('DXF tool availability — manual tools work', () => {
  it('count tool handler exists in handlePointerDown', () => {
    expect(dxfViewerSrc).toContain("if (tool === 'count')")
  })

  it('measure tool handler exists in handlePointerDown', () => {
    expect(dxfViewerSrc).toContain("if (tool === 'measure')")
  })

  it('calibrate tool handler exists in handlePointerDown', () => {
    expect(dxfViewerSrc).toContain("if (tool === 'calibrate')")
  })

  it('keyboard shortcuts C, M, S are active', () => {
    expect(dxfViewerSrc).toContain("e.key === 'c' || e.key === 'C'")
    expect(dxfViewerSrc).toContain("e.key === 'm' || e.key === 'M'")
    expect(dxfViewerSrc).toContain("e.key === 's' || e.key === 'S'")
  })

  it('calibration dialog exists', () => {
    expect(dxfViewerSrc).toContain('Skála kalibrálás')
    expect(dxfViewerSrc).toContain('handleCalibSubmit')
  })
})
