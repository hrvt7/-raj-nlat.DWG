import { describe, it, expect } from 'vitest'
import { parseDxfText } from '../dxfParser.js'

// ── DXF test fixture helpers ──────────────────────────────────────────────────

/**
 * Build a minimal well-formed DXF text string.
 * Group codes and values alternate line-by-line as per DXF spec.
 */
function buildDxf({ insunits = 0, inserts = [], polylines = [] } = {}) {
  const lines = []

  const add = (code, val) => {
    lines.push(String(code).padStart(3, ' '))
    lines.push(String(val))
  }

  // HEADER section
  add(0, 'SECTION')
  add(2, 'HEADER')
  add(9, '$INSUNITS')
  add(70, insunits)
  add(0, 'ENDSEC')

  // ENTITIES section
  add(0, 'SECTION')
  add(2, 'ENTITIES')

  for (const ins of inserts) {
    add(0, 'INSERT')
    add(8, ins.layer || 'LAYER_A')
    add(2, ins.name)
    add(10, ins.x ?? 0)
    add(20, ins.y ?? 0)
  }

  for (const poly of polylines) {
    add(0, 'LWPOLYLINE')
    add(8, poly.layer || 'LAYER_P')
    add(70, poly.closed ? 1 : 0)
    for (const [px, py] of poly.points) {
      add(10, px)
      add(20, py)
    }
  }

  add(0, 'ENDSEC')
  add(0, 'EOF')

  return lines.join('\n')
}


// ── parseDxfText ──────────────────────────────────────────────────────────────

describe('parseDxfText', () => {
  it('returns a valid result structure for a minimal DXF', () => {
    const dxf = buildDxf()
    const result = parseDxfText(dxf)
    expect(result).toBeDefined()
    expect(result.blocks).toBeDefined()
    expect(result.lengths).toBeDefined()
    expect(result.layers).toBeDefined()
    expect(result.inserts).toBeDefined()
    expect(result.units).toBeDefined()
  })

  it('parses $INSUNITS = 4 (mm) and returns correct unit name and factor', () => {
    const dxf = buildDxf({ insunits: 4 })
    const result = parseDxfText(dxf)
    expect(result.units.insunits).toBe(4)
    expect(result.units.name).toBe('mm')
    expect(result.units.factor).toBeCloseTo(0.001)
  })

  it('parses $INSUNITS = 6 (m) and returns correct unit factor', () => {
    const dxf = buildDxf({ insunits: 6 })
    const result = parseDxfText(dxf)
    expect(result.units.insunits).toBe(6)
    expect(result.units.name).toBe('m')
    expect(result.units.factor).toBe(1.0)
  })

  it('handles unknown $INSUNITS (0) gracefully', () => {
    const dxf = buildDxf({ insunits: 0 })
    const result = parseDxfText(dxf)
    expect(result.units.insunits).toBe(0)
    // factor is auto-detected when insunits is unknown
    expect(result.units.factor).toBeDefined()
  })

  it('counts INSERT entities and groups them into blocks', () => {
    const dxf = buildDxf({
      inserts: [
        { name: 'DUGALJ', layer: 'DEVICES', x: 100, y: 200 },
        { name: 'DUGALJ', layer: 'DEVICES', x: 300, y: 400 },
        { name: 'LAMPA',  layer: 'LIGHTS',  x: 150, y: 250 },
      ],
    })
    const result = parseDxfText(dxf)
    // blocks is an array of {name, layer, count} sorted by count descending
    const dugalj = result.blocks.find(b => b.name === 'DUGALJ')
    const lampa  = result.blocks.find(b => b.name === 'LAMPA')
    expect(dugalj?.count).toBe(2)
    expect(lampa?.count).toBe(1)
  })

  it('records unique layer names', () => {
    const dxf = buildDxf({
      inserts: [
        { name: 'DUGALJ', layer: 'POWER_DEVICES', x: 0, y: 0 },
        { name: 'LAMPA',  layer: 'LIGHTING',      x: 50, y: 50 },
      ],
    })
    const result = parseDxfText(dxf)
    const layers = new Set(result.layers)
    expect(layers.has('POWER_DEVICES')).toBe(true)
    expect(layers.has('LIGHTING')).toBe(true)
  })

  it('records INSERT positions in the inserts array', () => {
    const dxf = buildDxf({
      inserts: [
        { name: 'DUGALJ', layer: 'DEVICES', x: 100, y: 200 },
      ],
    })
    const result = parseDxfText(dxf)
    expect(result.inserts).toHaveLength(1)
    expect(result.inserts[0].name).toBe('DUGALJ')
    expect(result.inserts[0].x).toBe(100)
    expect(result.inserts[0].y).toBe(200)
  })

  it('handles empty DXF (no entities) without throwing', () => {
    const dxf = buildDxf({ inserts: [], polylines: [] })
    expect(() => parseDxfText(dxf)).not.toThrow()
    const result = parseDxfText(dxf)
    expect(result.inserts).toHaveLength(0)
  })

  it('calculates geomBounds from insert positions', () => {
    const dxf = buildDxf({
      insunits: 4,
      inserts: [
        { name: 'A', x: 10,  y: 20,  layer: 'L' },
        { name: 'B', x: 500, y: 800, layer: 'L' },
      ],
    })
    const result = parseDxfText(dxf)
    expect(result.geomBounds).toBeDefined()
    expect(result.geomBounds.minX).toBeLessThanOrEqual(10)
    expect(result.geomBounds.maxX).toBeGreaterThanOrEqual(500)
  })

  it('returns success: true on valid DXF', () => {
    const dxf = buildDxf({ insunits: 4, inserts: [{ name: 'A', x: 1, y: 2, layer: 'L' }] })
    const result = parseDxfText(dxf)
    expect(result.success).toBe(true)
  })
})
