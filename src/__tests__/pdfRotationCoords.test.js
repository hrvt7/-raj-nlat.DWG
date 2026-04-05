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

  it('R=90: center-rotation CW', () => {
    const c = docToCanvas(100, 200, 90, W, H)
    // Rotated 90° CW around center (250, 400)
    expect(c.x).toBeCloseTo(450, 5)
    expect(c.y).toBeCloseTo(250, 5)
  })

  it('R=180: center-rotation 180°', () => {
    const c = docToCanvas(100, 200, 180, W, H)
    expect(c.x).toBeCloseTo(400, 5)
    expect(c.y).toBeCloseTo(600, 5)
  })

  it('R=270: center-rotation CCW', () => {
    const c = docToCanvas(100, 200, 270, W, H)
    expect(c.x).toBeCloseTo(50, 5)
    expect(c.y).toBeCloseTo(550, 5)
  })

  it('page center stays fixed at any rotation', () => {
    const cx = W / 2, cy = H / 2
    for (const rot of [0, 45, 90, 135, 180, 270]) {
      const c = docToCanvas(cx, cy, rot, W, H)
      expect(c.x).toBeCloseTo(cx, 5)
      expect(c.y).toBeCloseTo(cy, 5)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('canvasToDoc', () => {
  it('R=0: identity transform', () => {
    expect(canvasToDoc(100, 200, 0, W, H)).toEqual({ x: 100, y: 200 })
  })

  it('R=90: inverse of center-rotation CW', () => {
    // canvasToDoc undoes the rotation — roundtrip tested separately
    const d = canvasToDoc(450, 250, 90, W, H)
    expect(d.x).toBeCloseTo(100, 5)
    expect(d.y).toBeCloseTo(200, 5)
  })

  it('R=180: inverse of center-rotation 180°', () => {
    const d = canvasToDoc(400, 600, 180, W, H)
    expect(d.x).toBeCloseTo(100, 5)
    expect(d.y).toBeCloseTo(200, 5)
  })

  it('R=270: inverse of center-rotation CCW', () => {
    const d = canvasToDoc(50, 550, 270, W, H)
    expect(d.x).toBeCloseTo(100, 5)
    expect(d.y).toBeCloseTo(200, 5)
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
describe('arbitrary rotation: non-90° angles work', () => {
  it('R=45: center stays fixed, corners rotate', () => {
    const cx = W / 2, cy = H / 2
    const c = docToCanvas(cx, cy, 45, W, H)
    expect(c.x).toBeCloseTo(cx, 5)
    expect(c.y).toBeCloseTo(cy, 5)
  })

  it('R=45: roundtrip preserves point', () => {
    const p = { x: 100, y: 200 }
    const canvas = docToCanvas(p.x, p.y, 45, W, H)
    const doc = canvasToDoc(canvas.x, canvas.y, 45, W, H)
    expect(doc.x).toBeCloseTo(p.x, 10)
    expect(doc.y).toBeCloseTo(p.y, 10)
  })

  it('R=22.5: distance preserved', () => {
    const p1 = { x: 100, y: 200 }
    const p2 = { x: 300, y: 500 }
    const docDist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
    const c1 = docToCanvas(p1.x, p1.y, 22.5, W, H)
    const c2 = docToCanvas(p2.x, p2.y, 22.5, W, H)
    const canvasDist = Math.sqrt((c2.x - c1.x) ** 2 + (c2.y - c1.y) ** 2)
    expect(canvasDist).toBeCloseTo(docDist, 10)
  })

  it('R=135: roundtrip preserves point', () => {
    const p = { x: 350, y: 600 }
    const canvas = docToCanvas(p.x, p.y, 135, W, H)
    const doc = canvasToDoc(canvas.x, canvas.y, 135, W, H)
    expect(doc.x).toBeCloseTo(p.x, 10)
    expect(doc.y).toBeCloseTo(p.y, 10)
  })

  it('R=-30: negative rotation works', () => {
    const p = { x: 200, y: 300 }
    const canvas = docToCanvas(p.x, p.y, -30, W, H)
    const doc = canvasToDoc(canvas.x, canvas.y, -30, W, H)
    expect(doc.x).toBeCloseTo(p.x, 10)
    expect(doc.y).toBeCloseTo(p.y, 10)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('center-rotation properties', () => {
  // With center-rotation, the page center is the fixed point.
  // All rotations preserve this center and distances from it.

  it('R=0: identity on any point', () => {
    expect(canvasToDoc(W, 0, 0, W, H)).toEqual({ x: W, y: 0 })
  })

  it('R=180: opposite corner maps to opposite corner', () => {
    const c = canvasToDoc(W, H, 180, W, H)
    expect(c.x).toBeCloseTo(0, 5)
    expect(c.y).toBeCloseTo(0, 5)
  })

  it('page center is fixed at any angle', () => {
    for (const rot of [0, 30, 45, 60, 90, 120, 180, 270, 315]) {
      const c = docToCanvas(W / 2, H / 2, rot, W, H)
      expect(c.x).toBeCloseTo(W / 2, 5)
      expect(c.y).toBeCloseTo(H / 2, 5)
    }
  })

  it('distance from center preserved at any angle', () => {
    const p = { x: 100, y: 200 }
    const cx = W / 2, cy = H / 2
    const origDist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
    for (const rot of [0, 33, 45, 90, 127, 180, 270]) {
      const c = docToCanvas(p.x, p.y, rot, W, H)
      const rotDist = Math.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2)
      expect(rotDist).toBeCloseTo(origDist, 5)
    }
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
