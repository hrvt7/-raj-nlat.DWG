// ─── PDF Rotation Coordinate Conversion — Unit Tests ──────────────────────
// Tests for the rotation-invariant coordinate helpers used by PdfViewer.
//
// docToCanvas: unrotated document coords → rotated canvas coords
// canvasToDoc: rotated canvas coords → unrotated document coords
//
// Ensures markers placed at a logical drawing point survive rotation changes
// by verifying roundtrip identity and cross-rotation consistency.
// ──────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { docToCanvas, canvasToDoc } from '../components/PdfViewer/index.jsx'

// Test page: 500 wide × 800 tall (unrotated)
const W = 500
const H = 800

// ══════════════════════════════════════════════════════════════════════════
describe('docToCanvas', () => {
  it('R=0: identity transform', () => {
    expect(docToCanvas(100, 200, 0, W, H)).toEqual({ x: 100, y: 200 })
  })

  it('R=90: doc(dx,dy) → canvas(dy, W-dx)', () => {
    const c = docToCanvas(100, 200, 90, W, H)
    expect(c).toEqual({ x: 200, y: 400 }) // (200, 500-100)
  })

  it('R=180: doc(dx,dy) → canvas(W-dx, H-dy)', () => {
    const c = docToCanvas(100, 200, 180, W, H)
    expect(c).toEqual({ x: 400, y: 600 }) // (500-100, 800-200)
  })

  it('R=270: doc(dx,dy) → canvas(H-dy, dx)', () => {
    const c = docToCanvas(100, 200, 270, W, H)
    expect(c).toEqual({ x: 600, y: 100 }) // (800-200, 100)
  })

  it('origin (0,0) at R=90', () => {
    const c = docToCanvas(0, 0, 90, W, H)
    expect(c).toEqual({ x: 0, y: 500 }) // top-left doc → bottom-left of rotated canvas
  })

  it('bottom-right corner at R=90', () => {
    const c = docToCanvas(W, H, 90, W, H)
    expect(c).toEqual({ x: 800, y: 0 }) // bottom-right doc → top-right of rotated canvas (H×W)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('canvasToDoc', () => {
  it('R=0: identity transform', () => {
    expect(canvasToDoc(100, 200, 0, W, H)).toEqual({ x: 100, y: 200 })
  })

  it('R=90: canvas(cx,cy) → doc(W-cy, cx)', () => {
    const d = canvasToDoc(200, 400, 90, W, H)
    expect(d).toEqual({ x: 100, y: 200 }) // (500-400, 200)
  })

  it('R=180: canvas(cx,cy) → doc(W-cx, H-cy)', () => {
    const d = canvasToDoc(400, 600, 180, W, H)
    expect(d).toEqual({ x: 100, y: 200 }) // (500-400, 800-600)
  })

  it('R=270: canvas(cx,cy) → doc(cy, H-cx)', () => {
    const d = canvasToDoc(600, 100, 270, W, H)
    expect(d).toEqual({ x: 100, y: 200 }) // (100, 800-600)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('roundtrip: canvasToDoc(docToCanvas(p)) === p', () => {
  const rotations = [0, 90, 180, 270]
  const points = [
    { x: 0, y: 0 },
    { x: W, y: H },
    { x: 250, y: 400 },
    { x: 100, y: 200 },
    { x: 499, y: 1 },
    { x: W / 2, y: H / 2 }, // center
  ]

  for (const rot of rotations) {
    for (const p of points) {
      it(`R=${rot}: (${p.x}, ${p.y}) survives roundtrip`, () => {
        const canvas = docToCanvas(p.x, p.y, rot, W, H)
        const doc = canvasToDoc(canvas.x, canvas.y, rot, W, H)
        expect(doc.x).toBeCloseTo(p.x, 10)
        expect(doc.y).toBeCloseTo(p.y, 10)
      })
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════
describe('inverse roundtrip: docToCanvas(canvasToDoc(c)) === c', () => {
  const rotations = [0, 90, 180, 270]
  const canvasPoints = [
    { x: 0, y: 0 },
    { x: 300, y: 500 },
    { x: 200, y: 400 },
  ]

  for (const rot of rotations) {
    for (const c of canvasPoints) {
      it(`R=${rot}: canvas(${c.x}, ${c.y}) survives inverse roundtrip`, () => {
        const doc = canvasToDoc(c.x, c.y, rot, W, H)
        const back = docToCanvas(doc.x, doc.y, rot, W, H)
        expect(back.x).toBeCloseTo(c.x, 10)
        expect(back.y).toBeCloseTo(c.y, 10)
      })
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════
describe('cross-rotation consistency: same doc point → same drawing position', () => {
  // A doc point (100, 200) should, when converted to canvas coords for ANY
  // rotation, then rendered and back-converted, always return the same doc coords.
  // This proves markers stored in doc coords survive rotation changes.

  it('doc(100, 200) is stable across all rotations', () => {
    const dx = 100, dy = 200
    for (const rot of [0, 90, 180, 270]) {
      const canvas = docToCanvas(dx, dy, rot, W, H)
      const doc = canvasToDoc(canvas.x, canvas.y, rot, W, H)
      expect(doc.x).toBeCloseTo(dx, 10)
      expect(doc.y).toBeCloseTo(dy, 10)
    }
  })

  it('doc center survives all rotations', () => {
    const dx = W / 2, dy = H / 2
    for (const rot of [0, 90, 180, 270]) {
      const canvas = docToCanvas(dx, dy, rot, W, H)
      const doc = canvasToDoc(canvas.x, canvas.y, rot, W, H)
      expect(doc.x).toBeCloseTo(dx, 10)
      expect(doc.y).toBeCloseTo(dy, 10)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('distance preservation (rotation is isometric)', () => {
  it('distance between two points is the same in doc and canvas coords', () => {
    const p1 = { x: 100, y: 200 }
    const p2 = { x: 300, y: 500 }
    const docDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)

    for (const rot of [0, 90, 180, 270]) {
      const c1 = docToCanvas(p1.x, p1.y, rot, W, H)
      const c2 = docToCanvas(p2.x, p2.y, rot, W, H)
      const canvasDist = Math.sqrt((c2.x - c1.x) ** 2 + (c2.y - c1.y) ** 2)
      expect(canvasDist).toBeCloseTo(docDist, 10)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('backward compat migration: legacy canvas coords → doc coords', () => {
  // Simulates loading legacy annotations saved at a specific rotation
  // and converting them to rotation-invariant doc coords.

  it('legacy marker at R=0 migrates to same coords (identity)', () => {
    const legacy = { x: 100, y: 200 }
    const doc = canvasToDoc(legacy.x, legacy.y, 0, W, H)
    expect(doc).toEqual({ x: 100, y: 200 })
  })

  it('legacy marker at R=90 migrates correctly', () => {
    // Marker was placed at canvas(200, 400) when page was rotated 90°
    // This corresponds to doc(100, 200)
    const legacy = { x: 200, y: 400 }
    const doc = canvasToDoc(legacy.x, legacy.y, 90, W, H)
    expect(doc).toEqual({ x: 100, y: 200 })
  })

  it('legacy marker at R=180 migrates correctly', () => {
    // Canvas(400, 600) at R=180 → doc(100, 200)
    const legacy = { x: 400, y: 600 }
    const doc = canvasToDoc(legacy.x, legacy.y, 180, W, H)
    expect(doc).toEqual({ x: 100, y: 200 })
  })

  it('legacy marker at R=270 migrates correctly', () => {
    // Canvas(600, 100) at R=270 → doc(100, 200)
    const legacy = { x: 600, y: 100 }
    const doc = canvasToDoc(legacy.x, legacy.y, 270, W, H)
    expect(doc).toEqual({ x: 100, y: 200 })
  })

  it('migrated doc coords render correctly at any rotation', () => {
    // Start: legacy canvas(200, 400) saved at R=90
    // Migrate to doc coords
    const doc = canvasToDoc(200, 400, 90, W, H) // → (100, 200)
    expect(doc).toEqual({ x: 100, y: 200 })

    // Now render at R=0 → should appear at (100, 200) on unrotated canvas
    expect(docToCanvas(doc.x, doc.y, 0, W, H)).toEqual({ x: 100, y: 200 })

    // Render at R=90 → should appear at (200, 400) (same as original placement)
    expect(docToCanvas(doc.x, doc.y, 90, W, H)).toEqual({ x: 200, y: 400 })

    // Render at R=180 → consistent transform
    expect(docToCanvas(doc.x, doc.y, 180, W, H)).toEqual({ x: 400, y: 600 })

    // Render at R=270 → consistent transform
    expect(docToCanvas(doc.x, doc.y, 270, W, H)).toEqual({ x: 600, y: 100 })
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('canvas dimension expectations', () => {
  // After rotation, the canvas dimensions should match expected values.
  // R=0/180: canvas is W×H, R=90/270: canvas is H×W.

  it('R=0: top-right corner maps to doc(W, 0)', () => {
    expect(canvasToDoc(W, 0, 0, W, H)).toEqual({ x: W, y: 0 })
  })

  it('R=90: canvas top-right (H, 0) maps to doc(W, H)', () => {
    // Canvas is H×W. Top-right = (H, 0)
    expect(canvasToDoc(H, 0, 90, W, H)).toEqual({ x: W, y: H })
  })

  it('R=180: canvas bottom-right (W, H) maps to doc(0, 0)', () => {
    expect(canvasToDoc(W, H, 180, W, H)).toEqual({ x: 0, y: 0 })
  })

  it('R=270: canvas bottom-left (0, W) maps to doc(W, H)', () => {
    // Canvas is H×W. Bottom-left = (0, W)
    expect(canvasToDoc(0, W, 270, W, H)).toEqual({ x: W, y: H })
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('edge: square page (W === H)', () => {
  const S = 600

  it('roundtrips work for square page', () => {
    for (const rot of [0, 90, 180, 270]) {
      const p = { x: 150, y: 400 }
      const c = docToCanvas(p.x, p.y, rot, S, S)
      const d = canvasToDoc(c.x, c.y, rot, S, S)
      expect(d.x).toBeCloseTo(p.x, 10)
      expect(d.y).toBeCloseTo(p.y, 10)
    }
  })
})
