// ─── DXF Viewer Interaction Parity — Regression Tests ───────────────────────
// Covers:
//   1. DxfViewerPanel wiring: onMarkersChange + onMeasurementsChange props
//   2. Notification at every marker/measurement mutation site
//   3. Coordinate system helpers in DxfViewerCanvas
//   4. Right panel receives DXF markers (TakeoffWorkspace wiring)
//   5. Architecture boundary — shared markerModel
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
describe('DxfViewerPanel — onMarkersChange prop wiring', () => {
  it('accepts onMarkersChange in component signature', () => {
    expect(dxfViewerSrc).toContain('onMarkersChange')
  })

  it('accepts onMeasurementsChange in component signature', () => {
    expect(dxfViewerSrc).toContain('onMeasurementsChange')
  })

  it('creates stable ref for onMarkersChange callback', () => {
    expect(dxfViewerSrc).toContain('onMarkersChangeRef')
    expect(dxfViewerSrc).toContain('onMarkersChangeRef.current = onMarkersChange')
  })

  it('creates stable ref for onMeasurementsChange callback', () => {
    expect(dxfViewerSrc).toContain('onMeasurementsChangeRef')
    expect(dxfViewerSrc).toContain('onMeasurementsChangeRef.current = onMeasurementsChange')
  })

  it('defines notifyMarkersChanged helper', () => {
    expect(dxfViewerSrc).toContain('notifyMarkersChanged')
    expect(dxfViewerSrc).toContain('onMarkersChangeRef.current?.(')
  })

  it('defines notifyMeasurementsChanged helper', () => {
    expect(dxfViewerSrc).toContain('notifyMeasurementsChanged')
    expect(dxfViewerSrc).toContain('onMeasurementsChangeRef.current?.(')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('DxfViewerPanel — marker notification at every mutation site', () => {
  // Split into lines for precise checking
  const lines = dxfViewerSrc.split('\n')

  it('notifies after count tool marker creation', () => {
    // The count block must contain both createMarker and notifyMarkersChanged
    const countBlock = dxfViewerSrc.match(/tool === 'count'[\s\S]*?notifyMarkersChanged/)?.[0] || ''
    expect(countBlock).toContain('createMarker(')
    expect(countBlock).toContain('notifyMarkersChanged')
  })

  it('notifies after measure tool completion', () => {
    const measureLines = lines.filter(l => l.includes('notifyMeasurementsChanged()'))
    expect(measureLines.length).toBeGreaterThanOrEqual(1)
  })

  it('notifies after undo (markers)', () => {
    const undoBlock = dxfViewerSrc.match(/handleUndo[\s\S]*?(?=const handle[A-Z])/)?.[0] || ''
    expect(undoBlock).toContain('notifyMarkersChanged()')
  })

  it('notifies after undo (measurements)', () => {
    const undoBlock = dxfViewerSrc.match(/handleUndo[\s\S]*?(?=const handle[A-Z])/)?.[0] || ''
    expect(undoBlock).toContain('notifyMeasurementsChanged()')
  })

  it('notifies after clear all (markers)', () => {
    const clearBlock = dxfViewerSrc.match(/handleClearAll[\s\S]*?(?=\/\/ ──)/)?.[0] || ''
    expect(clearBlock).toContain('notifyMarkersChanged()')
  })

  it('notifies after clear all (measurements)', () => {
    const clearBlock = dxfViewerSrc.match(/handleClearAll[\s\S]*?(?=\/\/ ──)/)?.[0] || ''
    expect(clearBlock).toContain('notifyMeasurementsChanged()')
  })

  it('notifies after annotation load from store', () => {
    const loadBlock = dxfViewerSrc.match(/getPlanAnnotations\(planId\)\.then[\s\S]*?\}\)/)?.[0] || ''
    expect(loadBlock).toContain('notifyMarkersChanged()')
    expect(loadBlock).toContain('notifyMeasurementsChanged()')
  })

  it('notifies after external annotation change', () => {
    const extBlock = dxfViewerSrc.match(/onAnnotationsChanged[\s\S]*?return unsub/)?.[0] || ''
    expect(extBlock).toContain('notifyMarkersChanged()')
  })

  it('notifies after calibration relabels measurements', () => {
    const calibBlock = dxfViewerSrc.match(/handleCalibSubmit[\s\S]*?notifyMeasurementsChanged/)?.[0] || ''
    expect(calibBlock).toContain('notifyMeasurementsChanged')
    expect(calibBlock).toContain('Re-label existing measurements')
  })
})

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
  it('DxfViewerPanel receives onMarkersChange prop', () => {
    // Must have onMarkersChange callback in the DxfViewerPanel JSX
    const dxfBlock = workspaceSrc.match(/<DxfViewerPanel[\s\S]*?\/>/)?.[0] || ''
    expect(dxfBlock).toContain('onMarkersChange')
  })

  it('DxfViewerPanel onMarkersChange calls setPdfMarkers', () => {
    // The callback must route to the shared marker state
    expect(workspaceSrc).toContain('onMarkersChange={(markers) =>')
    // And within that block, setPdfMarkers is called
    const afterMarkers = workspaceSrc.split('onMarkersChange={(markers) =>')[1] || ''
    const callbackBody = afterMarkers.slice(0, 100)
    expect(callbackBody).toContain('setPdfMarkers(markers)')
  })

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
