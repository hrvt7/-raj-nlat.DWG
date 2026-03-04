import { describe, it, expect } from 'vitest'
import { extractGeometry, estimateCablesFallback } from '../cableAgent.js'

// ── DXF fixture builder ───────────────────────────────────────────────────────

function buildDxf({ insunits = 4, inserts = [], polylines = [] } = {}) {
  const lines = []
  const add = (code, val) => { lines.push(String(code).padStart(3)); lines.push(String(val)) }

  add(0, 'SECTION'); add(2, 'HEADER')
  add(9, '$INSUNITS'); add(70, insunits)
  add(0, 'ENDSEC')

  add(0, 'SECTION'); add(2, 'ENTITIES')

  for (const ins of inserts) {
    add(0, 'INSERT')
    add(8, ins.layer || 'DEFAULT')
    add(2, ins.name)
    add(10, ins.x ?? 0)
    add(20, ins.y ?? 0)
  }

  for (const poly of polylines) {
    add(0, 'LWPOLYLINE')
    add(8, poly.layer || 'DEFAULT')
    add(70, poly.closed ? 1 : 0)
    for (const [px, py] of poly.points) {
      add(10, px); add(20, py)
    }
  }

  add(0, 'ENDSEC')
  add(0, 'EOF')
  return lines.join('\n')
}


// ── extractGeometry ───────────────────────────────────────────────────────────

describe('extractGeometry', () => {
  it('returns expected top-level keys', () => {
    const dxf = buildDxf()
    const result = extractGeometry(dxf)
    expect(result).toHaveProperty('scale')
    expect(result).toHaveProperty('bounds')
    expect(result).toHaveProperty('inserts')
    expect(result).toHaveProperty('devices')
    expect(result).toHaveProperty('panels')
    expect(result).toHaveProperty('polylines')
    expect(result).toHaveProperty('stats')
  })

  it('reads $INSUNITS = 4 (mm) and sets factor to 0.001', () => {
    const dxf = buildDxf({ insunits: 4 })
    const result = extractGeometry(dxf)
    expect(result.scale.unit).toBe('mm')
    expect(result.scale.factor).toBeCloseTo(0.001)
  })

  it('parses INSERT entities with coordinates', () => {
    const dxf = buildDxf({
      inserts: [
        { name: 'DUGALJ_2P', layer: 'DEVICES', x: 1000, y: 2000 },
        { name: 'SPOT_LED',  layer: 'LIGHTING', x: 3000, y: 4000 },
      ],
    })
    const result = extractGeometry(dxf)
    expect(result.inserts).toHaveLength(2)
    expect(result.inserts[0].name).toBe('DUGALJ_2P')
    expect(result.inserts[0].x).toBe(1000)
    expect(result.inserts[0].y).toBe(2000)
  })

  it('classifies socket devices by keyword in name', () => {
    const dxf = buildDxf({
      inserts: [
        { name: 'DUGALJ_2P', layer: 'DEVICES', x: 100, y: 100 },
      ],
    })
    const result = extractGeometry(dxf)
    expect(result.devices.some(d => d.type === 'socket')).toBe(true)
    expect(result.panels).toHaveLength(0)
  })

  it('classifies panel by keyword in block name', () => {
    const dxf = buildDxf({
      inserts: [
        { name: 'ELOSZTO_FOGYASZTO', layer: 'PANEL_LAYER', x: 0, y: 0 },
      ],
    })
    const result = extractGeometry(dxf)
    expect(result.panels).toHaveLength(1)
    expect(result.panels[0].type).toBe('panel')
    // Panels don't appear in devices list
    expect(result.devices.some(d => d.name === 'ELOSZTO_FOGYASZTO')).toBe(false)
  })

  it('classifies light device by keyword in block name', () => {
    const dxf = buildDxf({
      inserts: [{ name: 'DOWNLIGHT_LED', layer: 'LIGHTING', x: 500, y: 500 }],
    })
    const result = extractGeometry(dxf)
    expect(result.devices[0].type).toBe('light')
  })

  it('computes bounds from insert positions when header extents absent', () => {
    const dxf = buildDxf({
      insunits: 4,
      inserts: [
        { name: 'A', x: 0,    y: 0,    layer: 'L' },
        { name: 'B', x: 5000, y: 3000, layer: 'L' },
      ],
    })
    const result = extractGeometry(dxf)
    expect(result.bounds.minX).toBe(0)
    expect(result.bounds.maxX).toBe(5000)
    expect(result.bounds.minY).toBe(0)
    expect(result.bounds.maxY).toBe(3000)
  })
})


// ── estimateCablesFallback ────────────────────────────────────────────────────

describe('estimateCablesFallback', () => {
  /**
   * Build a minimal geometry object (as returned by extractGeometry)
   * for use in fallback estimation tests.
   */
  function makeGeometry({ devices = [], panels = [], polylines = [], uf = 0.001 } = {}) {
    const allX = [...devices, ...panels].map(d => d.x)
    const allY = [...devices, ...panels].map(d => d.y)
    return {
      scale: { unit: 'mm', factor: uf, insunits: 4 },
      bounds: {
        minX: allX.length ? Math.min(...allX) : 0,
        maxX: allX.length ? Math.max(...allX) : 1000,
        minY: allY.length ? Math.min(...allY) : 0,
        maxY: allY.length ? Math.max(...allY) : 1000,
      },
      inserts: [],
      devices,
      panels,
      polylines,
    }
  }

  it('returns success: true', () => {
    const geo = makeGeometry()
    const result = estimateCablesFallback(geo)
    expect(result.success).toBe(true)
  })

  it('returns zero cable when no devices exist', () => {
    const geo = makeGeometry({ panels: [{ type: 'panel', name: 'DB', layer: 'PANEL', x: 0, y: 0 }] })
    const result = estimateCablesFallback(geo)
    expect(result.cable_total_m).toBe(0)
  })

  it('calculates cable_total_m > 0 when devices are present', () => {
    const geo = makeGeometry({
      panels: [{ type: 'panel', name: 'DB', layer: 'PANEL', x: 0, y: 0 }],
      devices: [
        { type: 'socket', name: 'DUGALJ', layer: 'DEV', x: 5000, y: 0 },
        { type: 'socket', name: 'DUGALJ', layer: 'DEV', x: 0, y: 3000 },
        { type: 'light',  name: 'LAMPA',  layer: 'DEV', x: 2000, y: 2000 },
      ],
    })
    const result = estimateCablesFallback(geo)
    // Panel at (0,0), sockets at (5000, 0) and (0, 3000):
    // Manhattan distances in mm: 5000 + 3000 = 8000 mm = 8 m (before scale factor)
    expect(result.cable_total_m).toBeGreaterThan(0)
    expect(result.cable_by_type.socket_m).toBeGreaterThan(0)
    expect(result.cable_by_type.light_m).toBeGreaterThan(0)
  })

  it('uses centroid as panel when no panel found', () => {
    const geo = makeGeometry({
      devices: [
        { type: 'socket', name: 'DUGALJ', layer: 'DEV', x: 1000, y: 1000 },
      ],
    })
    const result = estimateCablesFallback(geo)
    expect(result.success).toBe(true)
    // Warning about missing panel expected
    expect(result.warnings.some(w => w.includes('Elosztó'))).toBe(true)
  })

  it('lower confidence when panel not found', () => {
    const withPanel = makeGeometry({
      panels: [{ type: 'panel', name: 'DB', layer: 'PANEL', x: 0, y: 0 }],
      devices: [{ type: 'socket', name: 'S', layer: 'DEV', x: 500, y: 0 }],
    })
    const withoutPanel = makeGeometry({
      devices: [{ type: 'socket', name: 'S', layer: 'DEV', x: 500, y: 0 }],
    })
    const r1 = estimateCablesFallback(withPanel)
    const r2 = estimateCablesFallback(withoutPanel)
    expect(r1.confidence).toBeGreaterThan(r2.confidence)
  })

  it('uses higher confidence (Szint A) when tray polylines exist', () => {
    const geo = makeGeometry({
      panels: [{ type: 'panel', name: 'DB', layer: 'PANEL', x: 0, y: 0 }],
      devices: [{ type: 'socket', name: 'S', layer: 'DEV', x: 500, y: 0 }],
      polylines: [
        {
          layer: '200x60',
          points: [[0, 0], [500, 0]],
          isClosed: false,
          info: { type: 'tray', tray_width: 200, tray_height: 60 },
        },
      ],
    })
    const result = estimateCablesFallback(geo)
    expect(result.method).toContain('Kábeltálca')
    expect(result.confidence).toBeGreaterThan(0.7)
  })

  it('sets _source to fallback_js', () => {
    const geo = makeGeometry()
    const result = estimateCablesFallback(geo)
    expect(result._source).toBe('fallback_js')
  })

  it('handles block_data_direct shortcut path', () => {
    const geo = {
      _from_blocks: true,
      _cable_m: 120,
      _tray_m: 30,
      scale: { factor: 0.001 },
      bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 },
      devices: [{ type: 'socket', name: 'S', layer: 'L', x: 0, y: 0 }],
      panels: [],
      polylines: [],
    }
    const result = estimateCablesFallback(geo)
    expect(result._source).toBe('block_data_direct')
    expect(result.cable_total_m).toBe(150)  // 120 + 30
  })
})
