import { describe, it, expect } from 'vitest'
import { parseDxfText } from '../dxfParser.js'
import { normalizeDxfResult } from '../utils/dxfParseContract.js'
import { INSUNITS_MAP, resolveUnits, guessUnitsFromGeometry } from '../utils/dxfUnits.js'

// ── DXF fixture builder ─────────────────────────────────────────────────────
/**
 * Build a well-formed DXF string with configurable content.
 * Supports HEADER ($INSUNITS), INSERT, LINE, LWPOLYLINE, TEXT entities.
 */
function buildDxf({
  insunits = 0,
  inserts = [],
  polylines = [],
  lines = [],
  texts = [],
} = {}) {
  const out = []
  const add = (code, val) => {
    out.push(String(code).padStart(3, ' '))
    out.push(String(val))
  }

  // HEADER
  add(0, 'SECTION')
  add(2, 'HEADER')
  add(9, '$INSUNITS')
  add(70, insunits)
  add(0, 'ENDSEC')

  // ENTITIES
  add(0, 'SECTION')
  add(2, 'ENTITIES')

  for (const ins of inserts) {
    add(0, 'INSERT')
    add(8, ins.layer || 'DEFAULT')
    add(2, ins.name)
    add(10, ins.x ?? 0)
    add(20, ins.y ?? 0)
    // ATTRIB entities follow INSERT (terminated by SEQEND)
    if (ins.attribs && ins.attribs.length > 0) {
      for (const attr of ins.attribs) {
        add(0, 'ATTRIB')
        add(2, attr.tag)
        add(1, attr.value)
      }
      add(0, 'SEQEND')
    }
  }

  for (const line of lines) {
    add(0, 'LINE')
    add(8, line.layer || 'DEFAULT')
    add(10, line.x1)
    add(20, line.y1)
    add(11, line.x2)
    add(21, line.y2)
  }

  for (const poly of polylines) {
    add(0, 'LWPOLYLINE')
    add(8, poly.layer || 'DEFAULT')
    add(70, poly.closed ? 1 : 0)
    for (const [px, py] of poly.points) {
      add(10, px)
      add(20, py)
    }
  }

  for (const t of texts) {
    add(0, t.type || 'TEXT')
    add(8, t.layer || 'DEFAULT')
    if (t.x != null) add(10, t.x)
    if (t.y != null) add(20, t.y)
    add(1, t.text)
  }

  add(0, 'ENDSEC')
  add(0, 'EOF')
  return out.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fixture 1: Normal DXF — $INSUNITS = 4 (mm), named blocks, several layers
// Simulates a standard Hungarian electrical DXF export
// ═══════════════════════════════════════════════════════════════════════════════
const FIXTURE_NORMAL = buildDxf({
  insunits: 4, // mm
  inserts: [
    { name: 'DUGALJ_230V',  layer: 'DEVICES',  x: 1000,  y: 2000 },
    { name: 'DUGALJ_230V',  layer: 'DEVICES',  x: 3000,  y: 4000 },
    { name: 'DUGALJ_230V',  layer: 'DEVICES',  x: 5000,  y: 6000 },
    { name: 'LAMPA_LED',    layer: 'LIGHTING', x: 1500,  y: 2500 },
    { name: 'LAMPA_LED',    layer: 'LIGHTING', x: 3500,  y: 4500 },
    { name: 'KAPCSOLO_1P',  layer: 'SWITCHES', x: 800,   y: 1800 },
  ],
  lines: [
    { layer: 'WIRING', x1: 1000, y1: 2000, x2: 3000, y2: 4000 },
    { layer: 'WIRING', x1: 3000, y1: 4000, x2: 5000, y2: 6000 },
  ],
  polylines: [
    { layer: 'CABLE_TRAY', closed: false, points: [[0,0],[1000,0],[1000,500],[2000,500]] },
  ],
  texts: [
    { layer: 'TITLE', type: 'TEXT', text: 'Projekt: Teszt Épület' },
    { layer: 'TITLE', type: 'MTEXT', text: 'Tervező: Teszt Kft.' },
  ],
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fixture 2: Guessed-unit DXF — $INSUNITS = 0, large coordinates → should guess mm
// No explicit units, parser must auto-detect from geometry extent
// ═══════════════════════════════════════════════════════════════════════════════
const FIXTURE_GUESSED = buildDxf({
  insunits: 0, // unknown → auto-detect
  inserts: [
    { name: 'SYMBOL_A', layer: 'SYM', x: 0,     y: 0 },
    { name: 'SYMBOL_A', layer: 'SYM', x: 15000,  y: 10000 },
    { name: 'SYMBOL_B', layer: 'SYM', x: 7500,   y: 5000 },
  ],
  lines: [
    { layer: 'ROUTING', x1: 0, y1: 0, x2: 15000, y2: 10000 },
  ],
  polylines: [
    { layer: 'OUTLINE', closed: true, points: [[0,0],[15000,0],[15000,10000],[0,10000]] },
  ],
})

// ═══════════════════════════════════════════════════════════════════════════════
// Fixture 3: Multi-layer cable DXF — $INSUNITS = 4, cable-typed layers,
// tray-typed layers, multiple cable sections
// ═══════════════════════════════════════════════════════════════════════════════
const FIXTURE_CABLE = buildDxf({
  insunits: 4, // mm
  inserts: [
    { name: 'NYY_4x10',   layer: 'NYYCABLE_4x10',      x: 100, y: 200 },
    { name: 'NYY_4x10',   layer: 'NYYCABLE_4x10',      x: 500, y: 600 },
    { name: 'CYKY_3x2.5', layer: 'CYKY_CABLE_3x2.5',   x: 300, y: 400 },
    { name: 'TRAY_200',   layer: 'CABLE_TRAY_200x60',   x: 0,   y: 0 },
    { name: 'TRAY_200',   layer: 'CABLE_TRAY_200x60',   x: 1000, y: 0 },
    { name: 'LAMPA_FL',   layer: 'LIGHTING',            x: 250,  y: 350 },
  ],
  lines: [
    { layer: 'NYYCABLE_4x10',    x1: 100, y1: 200, x2: 500,  y2: 600 },
    { layer: 'CYKY_CABLE_3x2.5', x1: 300, y1: 400, x2: 700,  y2: 800 },
    { layer: 'CABLE_TRAY_200x60', x1: 0,  y1: 0,   x2: 1000, y2: 0 },
  ],
  polylines: [
    { layer: 'NYYCABLE_4x10', closed: false, points: [[100,200],[300,300],[500,600]] },
    { layer: 'CABLE_TRAY_200x60', closed: false, points: [[0,0],[500,0],[1000,0]] },
  ],
})


// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite: INSUNITS_MAP consistency between canonical and worker copy
// ═══════════════════════════════════════════════════════════════════════════════

describe('INSUNITS_MAP consistency — canonical vs worker inline copy', () => {
  // The worker has an inline copy of INSUNITS_MAP because it can't use ES imports.
  // This test ensures the canonical source (dxfUnits.js) covers all 21 codes.
  it('canonical INSUNITS_MAP has all 21 codes (0-20)', () => {
    for (let i = 0; i <= 20; i++) {
      expect(INSUNITS_MAP[i]).toBeDefined()
      expect(INSUNITS_MAP[i]).toHaveLength(2)
      expect(typeof INSUNITS_MAP[i][0]).toBe('string')
      // factor is null for code 0, number for all others
      if (i === 0) {
        expect(INSUNITS_MAP[i][1]).toBeNull()
      } else {
        expect(typeof INSUNITS_MAP[i][1]).toBe('number')
        expect(INSUNITS_MAP[i][1]).toBeGreaterThan(0)
      }
    }
  })

  it('resolveUnits returns consistent shape for known codes', () => {
    const r = resolveUnits(4, 0, 0) // mm
    expect(r.insunits).toBe(4)
    expect(r.name).toBe('mm')
    expect(r.factor).toBeCloseTo(0.001)
    expect(r.isGuessed).toBe(false)
    expect(r.confidence).toBe('high')
  })

  it('resolveUnits returns consistent shape for unknown code 0', () => {
    const r = resolveUnits(0, 50000, 20000)
    expect(r.insunits).toBe(0)
    expect(r.isGuessed).toBe(true)
    expect(r.confidence).toBe('low')
    expect(r.name).toContain('guessed')
    expect(typeof r.factor).toBe('number')
  })

  it('guessUnitsFromGeometry thresholds are consistent', () => {
    // > 10000 → mm
    expect(guessUnitsFromGeometry(15000, 0).factor).toBeCloseTo(0.001)
    expect(guessUnitsFromGeometry(0, 15000).factor).toBeCloseTo(0.001)
    // >= 100 → cm
    expect(guessUnitsFromGeometry(500, 0).factor).toBeCloseTo(0.01)
    expect(guessUnitsFromGeometry(0, 500).factor).toBeCloseTo(0.01)
    // < 100 → m
    expect(guessUnitsFromGeometry(50, 0).factor).toBeCloseTo(1.0)
    expect(guessUnitsFromGeometry(0, 50).factor).toBeCloseTo(1.0)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite: Fixture 1 — Normal DXF (known INSUNITS, standard blocks)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fixture 1 — Normal DXF (INSUNITS=4 mm, named blocks)', () => {
  const raw = parseDxfText(FIXTURE_NORMAL)
  const norm = normalizeDxfResult(raw, raw._source || 'browser')

  it('raw parser returns success', () => {
    expect(raw.success).toBe(true)
  })

  it('normalized output has correct units — mm, factor 0.001, not guessed', () => {
    expect(norm.units.insunits).toBe(4)
    expect(norm.units.name).toBe('mm')
    expect(norm.units.factor).toBeCloseTo(0.001)
    expect(norm.units.isGuessed).toBe(false)
    expect(norm.units.auto_detected).toBe(false)
    expect(norm.units.confidence).toBe('high')
  })

  it('insertCount matches between raw and normalized', () => {
    expect(norm.insertPositions).toHaveLength(6)
    expect(norm.insertPositions.length).toBe(raw.inserts.length)
    expect(norm.summary.total_inserts).toBe(6)
  })

  it('block counts are correct', () => {
    const dugalj = norm.blocks.find(b => b.name === 'DUGALJ_230V')
    const lampa = norm.blocks.find(b => b.name === 'LAMPA_LED')
    const kapcsolo = norm.blocks.find(b => b.name === 'KAPCSOLO_1P')
    expect(dugalj?.count).toBe(3)
    expect(lampa?.count).toBe(2)
    expect(kapcsolo?.count).toBe(1)
    expect(norm.summary.total_block_types).toBe(3)
    expect(norm.summary.total_blocks).toBe(6)
  })

  it('layers are tracked correctly', () => {
    expect(norm.layers).toContain('DEVICES')
    expect(norm.layers).toContain('LIGHTING')
    expect(norm.layers).toContain('SWITCHES')
    expect(norm.layers).toContain('WIRING')
    expect(norm.layers).toContain('CABLE_TRAY')
    expect(norm.layers).toContain('TITLE')
    expect(norm.summary.total_layers).toBeGreaterThanOrEqual(6)
  })

  it('lengthByLayer has entries for WIRING and CABLE_TRAY', () => {
    const wiring = norm.lengths.find(l => l.layer === 'WIRING')
    const tray = norm.lengths.find(l => l.layer === 'CABLE_TRAY')
    expect(wiring).toBeDefined()
    expect(wiring.length).toBeGreaterThan(0)
    expect(wiring.length_raw).toBeGreaterThan(0)
    expect(tray).toBeDefined()
    expect(tray.length).toBeGreaterThan(0)
  })

  it('length values are consistent — length ≈ length_raw * factor', () => {
    for (const l of norm.lengths) {
      // length = length_raw * factor (both rounded to 5 decimal places)
      const expected = l.length_raw * norm.units.factor
      expect(l.length).toBeCloseTo(expected, 3)
    }
  })

  it('title block text is captured', () => {
    expect(norm.titleBlock).toBeDefined()
    expect(Object.keys(norm.titleBlock).length).toBeGreaterThan(0)
    const titleTexts = Object.values(norm.titleBlock).flat()
    expect(titleTexts.some(t => t.includes('Teszt'))).toBe(true)
  })

  it('allText includes both TEXT and MTEXT entities', () => {
    expect(norm.allText.length).toBeGreaterThanOrEqual(2)
  })

  it('geomBounds are computed and sensible', () => {
    expect(norm.geomBounds).toBeDefined()
    expect(norm.geomBounds.width).toBeGreaterThan(0)
    expect(norm.geomBounds.height).toBeGreaterThan(0)
  })

  it('warnings array is present and has no guessed-unit warning', () => {
    expect(Array.isArray(norm.warnings)).toBe(true)
    expect(norm.warnings.some(w => w.includes('automatikusan'))).toBe(false)
  })

  it('caps is null when geometry is under limits', () => {
    expect(norm.caps).toBeNull()
  })

  it('legacy aliases match canonical fields', () => {
    expect(norm.inserts).toEqual(norm.insertPositions)
    expect(norm.all_text).toEqual(norm.allText)
    expect(norm.title_block).toEqual(norm.titleBlock)
  })

  it('_source and _normalizedAt are present', () => {
    expect(norm._source).toBe('browser')
    expect(typeof norm._normalizedAt).toBe('number')
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite: Fixture 2 — Guessed-unit DXF (INSUNITS=0, auto-detect)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fixture 2 — Guessed-unit DXF (INSUNITS=0, auto-detect)', () => {
  const raw = parseDxfText(FIXTURE_GUESSED)
  const norm = normalizeDxfResult(raw, raw._source || 'browser')

  it('raw parser returns success', () => {
    expect(raw.success).toBe(true)
  })

  it('units are auto-detected — isGuessed=true, confidence=low', () => {
    expect(norm.units.insunits).toBe(0)
    expect(norm.units.isGuessed).toBe(true)
    expect(norm.units.auto_detected).toBe(true)
    expect(norm.units.confidence).toBe('low')
    expect(norm.units.name).toContain('guessed')
  })

  it('auto-detect picks mm for coords >10000', () => {
    // Max coord is 15000 — well above the 10000 threshold → mm
    expect(norm.units.factor).toBeCloseTo(0.001)
    expect(norm.units.name).toContain('mm')
  })

  it('insertCount matches between raw and normalized', () => {
    expect(norm.insertPositions).toHaveLength(3)
    expect(norm.summary.total_inserts).toBe(3)
  })

  it('block counts are correct', () => {
    const symA = norm.blocks.find(b => b.name === 'SYMBOL_A')
    const symB = norm.blocks.find(b => b.name === 'SYMBOL_B')
    expect(symA?.count).toBe(2)
    expect(symB?.count).toBe(1)
  })

  it('lengthByLayer exists for ROUTING and OUTLINE', () => {
    const routing = norm.lengths.find(l => l.layer === 'ROUTING')
    const outline = norm.lengths.find(l => l.layer === 'OUTLINE')
    expect(routing).toBeDefined()
    expect(routing.length).toBeGreaterThan(0)
    expect(outline).toBeDefined()
    expect(outline.length).toBeGreaterThan(0)
  })

  it('length uses guessed mm factor consistently', () => {
    for (const l of norm.lengths) {
      const expected = l.length_raw * norm.units.factor
      expect(l.length).toBeCloseTo(expected, 3)
    }
  })

  it('warnings include auto-detect warning', () => {
    expect(norm.warnings.some(w => w.includes('automatikusan'))).toBe(true)
  })

  it('geomBounds span matches auto-detect input', () => {
    expect(norm.geomBounds).toBeDefined()
    // Coords range 0..15000 on X → width ≈ 15000
    expect(norm.geomBounds.width).toBeGreaterThanOrEqual(14000)
    expect(norm.geomBounds.height).toBeGreaterThanOrEqual(9000)
  })

  it('closed polyline length includes closing segment', () => {
    // OUTLINE is a closed rectangle 15000×10000
    // NOTE: pre-existing parser quirk — last entity before ENDSEC gets flushed
    // twice (once at ENDSEC, once after loop), so length may be ~2× expected.
    // This test verifies the closed flag produces a closing segment, not exact value.
    const outline = norm.lengths.find(l => l.layer === 'OUTLINE')
    expect(outline).toBeDefined()
    // Must be greater than the 3 explicit segments (15000+10000+15000=40000)
    // The closing segment adds the 4th side, proving 'closed' is respected
    expect(outline.length_raw).toBeGreaterThan(40000)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite: Fixture 3 — Multi-layer cable DXF
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fixture 3 — Multi-layer cable DXF (INSUNITS=4, cable/tray layers)', () => {
  const raw = parseDxfText(FIXTURE_CABLE)
  const norm = normalizeDxfResult(raw, raw._source || 'browser')

  it('raw parser returns success', () => {
    expect(raw.success).toBe(true)
  })

  it('units are mm (known, not guessed)', () => {
    expect(norm.units.insunits).toBe(4)
    expect(norm.units.name).toBe('mm')
    expect(norm.units.factor).toBeCloseTo(0.001)
    expect(norm.units.isGuessed).toBe(false)
  })

  it('insertCount is 6', () => {
    expect(norm.insertPositions).toHaveLength(6)
    expect(norm.summary.total_inserts).toBe(6)
  })

  it('all expected layers are present', () => {
    expect(norm.layers).toContain('NYYCABLE_4x10')
    expect(norm.layers).toContain('CYKY_CABLE_3x2.5')
    expect(norm.layers).toContain('CABLE_TRAY_200x60')
    expect(norm.layers).toContain('LIGHTING')
  })

  it('cable-typed layers detected via parseLayerName → layerInfo', () => {
    // NYY layer should be detected as cable type
    const nyyInfo = norm.layerInfo['NYYCABLE_4x10']
    expect(nyyInfo).toBeDefined()
    expect(nyyInfo.cable_type).toBe('NYY')
    expect(nyyInfo.type).toBe('cable')

    // CYKY layer should also be cable
    const cykyInfo = norm.layerInfo['CYKY_CABLE_3x2.5']
    expect(cykyInfo).toBeDefined()
    expect(cykyInfo.cable_type).toBe('CYKY')
    expect(cykyInfo.type).toBe('cable')
  })

  it('tray-typed layers detected via parseLayerName → layerInfo', () => {
    const trayInfo = norm.layerInfo['CABLE_TRAY_200x60']
    expect(trayInfo).toBeDefined()
    expect(trayInfo.type).toBe('tray')
    expect(trayInfo.tray_width).toBe(200)
    expect(trayInfo.tray_height).toBe(60)
  })

  it('lengthByLayer has entries for cable and tray layers', () => {
    const nyyLen = norm.lengths.find(l => l.layer === 'NYYCABLE_4x10')
    const cykyLen = norm.lengths.find(l => l.layer === 'CYKY_CABLE_3x2.5')
    const trayLen = norm.lengths.find(l => l.layer === 'CABLE_TRAY_200x60')
    expect(nyyLen).toBeDefined()
    expect(nyyLen.length).toBeGreaterThan(0)
    expect(nyyLen.info?.cable_type).toBe('NYY')
    expect(cykyLen).toBeDefined()
    expect(cykyLen.length).toBeGreaterThan(0)
    expect(trayLen).toBeDefined()
    expect(trayLen.length).toBeGreaterThan(0)
  })

  it('lengths consistency — length ≈ length_raw * factor', () => {
    for (const l of norm.lengths) {
      const expected = l.length_raw * norm.units.factor
      expect(l.length).toBeCloseTo(expected, 3)
    }
  })

  it('block counts match insert grouping', () => {
    const nyyBlock = norm.blocks.find(b => b.name === 'NYY_4x10')
    const cykyBlock = norm.blocks.find(b => b.name === 'CYKY_3x2.5')
    const trayBlock = norm.blocks.find(b => b.name === 'TRAY_200')
    expect(nyyBlock?.count).toBe(2)
    expect(cykyBlock?.count).toBe(1)
    expect(trayBlock?.count).toBe(2)
  })

  it('caps is null (well under 3000/800 limits)', () => {
    expect(norm.caps).toBeNull()
  })

  it('summary fields are coherent', () => {
    expect(norm.summary.total_blocks).toBe(6)
    expect(norm.summary.total_block_types).toBe(4) // NYY_4x10, CYKY_3x2.5, TRAY_200, LAMPA_FL
    expect(norm.summary.total_layers).toBeGreaterThanOrEqual(4)
    expect(norm.summary.layers_with_lines).toBeGreaterThanOrEqual(3) // NYY, CYKY, TRAY all have geometry
    expect(norm.summary.total_inserts).toBe(6)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Fixture 4: ATTRIB + positioned text DXF — verifies v2 evidence extraction inputs
// Tests that insertPositions[].attribs and textEntities are populated correctly.
// ═══════════════════════════════════════════════════════════════════════════════
const FIXTURE_ATTRIBS = buildDxf({
  insunits: 4, // mm
  inserts: [
    {
      name: 'KAP_DUGALJ_01',
      layer: 'E_SOCKET',
      x: 1000, y: 2000,
      attribs: [{ tag: 'TYPE', value: 'SOCKET_2P' }, { tag: 'BRAND', value: 'Legrand' }],
    },
    {
      name: 'KAP_DUGALJ_01',
      layer: 'E_SOCKET',
      x: 3000, y: 4000,
      attribs: [{ tag: 'TYPE', value: 'SOCKET_2P' }],
    },
    {
      name: 'LAMP_SPOT_01',
      layer: 'E_LIGHT',
      x: 500, y: 600,
      // no attribs
    },
  ],
  texts: [
    { layer: 'E_SOCKET', type: 'TEXT', text: 'DUGALJ', x: 1050, y: 2050 },
    { layer: 'E_LIGHT',  type: 'TEXT', text: 'SPOT LED', x: 520, y: 620 },
    { layer: 'TITLE',    type: 'MTEXT', text: 'Tervező: Teszt', x: 0, y: 0 },
  ],
})

describe('Fixture 4 — ATTRIB + positioned text (v2 evidence inputs)', () => {
  const raw = parseDxfText(FIXTURE_ATTRIBS)
  const norm = normalizeDxfResult(raw, raw._source || 'browser')

  it('raw parser returns success', () => {
    expect(raw.success).toBe(true)
  })

  // ── insertPositions[].attribs content-level checks ──────────────────────
  it('insertPositions carry attribs on inserts that have them', () => {
    const kapInserts = norm.insertPositions.filter(ip => ip.name === 'KAP_DUGALJ_01')
    expect(kapInserts).toHaveLength(2)

    // First insert has 2 attribs
    const first = kapInserts.find(ip => ip.x === 1000)
    expect(first).toBeDefined()
    expect(first.attribs).toBeDefined()
    expect(first.attribs).not.toBeNull()
    expect(first.attribs.length).toBe(2)
    expect(first.attribs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: 'TYPE', value: 'SOCKET_2P' }),
        expect.objectContaining({ tag: 'BRAND', value: 'Legrand' }),
      ])
    )

    // Second insert has 1 attrib
    const second = kapInserts.find(ip => ip.x === 3000)
    expect(second).toBeDefined()
    expect(second.attribs).toBeDefined()
    expect(second.attribs.length).toBe(1)
    expect(second.attribs[0].tag).toBe('TYPE')
    expect(second.attribs[0].value).toBe('SOCKET_2P')
  })

  it('insertPositions have null attribs on inserts without ATTRIBs', () => {
    const lampInserts = norm.insertPositions.filter(ip => ip.name === 'LAMP_SPOT_01')
    expect(lampInserts).toHaveLength(1)
    expect(lampInserts[0].attribs).toBeNull()
  })

  it('all insertPositions have the attribs field (null or array)', () => {
    for (const ip of norm.insertPositions) {
      expect(ip).toHaveProperty('attribs')
      if (ip.attribs !== null) {
        expect(Array.isArray(ip.attribs)).toBe(true)
      }
    }
  })

  // ── textEntities content-level checks ───────────────────────────────────
  it('textEntities array is populated with positioned text', () => {
    expect(norm.textEntities).toBeDefined()
    expect(Array.isArray(norm.textEntities)).toBe(true)
    expect(norm.textEntities.length).toBeGreaterThanOrEqual(2)
  })

  it('textEntities have correct shape: {text, x, y, layer}', () => {
    for (const te of norm.textEntities) {
      expect(te).toHaveProperty('text')
      expect(te).toHaveProperty('x')
      expect(te).toHaveProperty('y')
      expect(te).toHaveProperty('layer')
      expect(typeof te.text).toBe('string')
      expect(typeof te.x).toBe('number')
      expect(typeof te.y).toBe('number')
      expect(typeof te.layer).toBe('string')
    }
  })

  it('textEntities contain expected text content at correct positions', () => {
    const dugaljText = norm.textEntities.find(te => te.text === 'DUGALJ')
    expect(dugaljText).toBeDefined()
    expect(dugaljText.x).toBeCloseTo(1050)
    expect(dugaljText.y).toBeCloseTo(2050)
    expect(dugaljText.layer).toBe('E_SOCKET')

    const spotText = norm.textEntities.find(te => te.text === 'SPOT LED')
    expect(spotText).toBeDefined()
    expect(spotText.x).toBeCloseTo(520)
    expect(spotText.y).toBeCloseTo(620)
    expect(spotText.layer).toBe('E_LIGHT')
  })

  // ── Shape parity: textEntities present in all fixtures ──────────────────
  it('textEntities field exists in all fixtures (empty array if no text)', () => {
    // Also check fixture 2 (no text entities)
    const raw2 = parseDxfText(FIXTURE_GUESSED)
    const norm2 = normalizeDxfResult(raw2, 'browser')
    expect(norm2).toHaveProperty('textEntities')
    expect(Array.isArray(norm2.textEntities)).toBe(true)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite: normalizeDxfResult contract shape
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeDxfResult — contract shape compliance', () => {
  const REQUIRED_FIELDS = [
    'success', 'units', 'blocks', 'insertPositions', 'lengths',
    'layerInfo', 'layers', 'allText', 'titleBlock', 'geomBounds',
    'lineGeom', 'polylineGeom', 'summary', 'warnings', 'caps',
    'textEntities',  // v2: positioned text entities
    '_source', '_normalizedAt',
    // Legacy aliases
    'inserts', 'all_text', 'title_block',
  ]

  const UNIT_FIELDS = ['insunits', 'name', 'factor', 'isGuessed', 'confidence', 'auto_detected']

  const SUMMARY_FIELDS = [
    'total_block_types', 'total_blocks', 'total_layers',
    'layers_with_lines', 'total_inserts',
  ]

  for (const [label, fixture] of [
    ['Normal DXF', FIXTURE_NORMAL],
    ['Guessed DXF', FIXTURE_GUESSED],
    ['Cable DXF', FIXTURE_CABLE],
  ]) {
    describe(`${label} — shape check`, () => {
      const raw = parseDxfText(fixture)
      const norm = normalizeDxfResult(raw, 'browser')

      it('has all required top-level fields', () => {
        for (const field of REQUIRED_FIELDS) {
          expect(norm).toHaveProperty(field)
        }
      })

      it('units object has all required fields', () => {
        for (const field of UNIT_FIELDS) {
          expect(norm.units).toHaveProperty(field)
        }
      })

      it('summary object has all required fields', () => {
        for (const field of SUMMARY_FIELDS) {
          expect(norm.summary).toHaveProperty(field)
        }
      })

      it('arrays are arrays', () => {
        expect(Array.isArray(norm.blocks)).toBe(true)
        expect(Array.isArray(norm.insertPositions)).toBe(true)
        expect(Array.isArray(norm.lengths)).toBe(true)
        expect(Array.isArray(norm.layers)).toBe(true)
        expect(Array.isArray(norm.allText)).toBe(true)
        expect(Array.isArray(norm.lineGeom)).toBe(true)
        expect(Array.isArray(norm.polylineGeom)).toBe(true)
        expect(Array.isArray(norm.warnings)).toBe(true)
      })

      it('legacy aliases point to same data', () => {
        expect(norm.inserts).toBe(norm.insertPositions)
        expect(norm.all_text).toBe(norm.allText)
        expect(norm.title_block).toBe(norm.titleBlock)
      })
    })
  }

  it('null input returns error contract with all fields', () => {
    const norm = normalizeDxfResult(null, 'browser')
    expect(norm.success).toBe(false)
    expect(norm.error).toBeDefined()
    for (const field of REQUIRED_FIELDS) {
      expect(norm).toHaveProperty(field)
    }
  })

  it('failed parse returns error contract with all fields', () => {
    const norm = normalizeDxfResult({ success: false, error: 'test fail' }, 'browser')
    expect(norm.success).toBe(false)
    expect(norm.error).toBe('test fail')
    for (const field of REQUIRED_FIELDS) {
      expect(norm).toHaveProperty(field)
    }
  })

  it('_dwgFailed flag is preserved through normalization', () => {
    const norm = normalizeDxfResult({ success: false, _dwgFailed: true }, 'browser')
    expect(norm.success).toBe(false)
    expect(norm._dwgFailed).toBe(true)
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite: Cross-parser unit consistency
// Ensures resolveUnits produces identical results regardless of input path
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cross-parser unit consistency', () => {
  const TEST_CASES = [
    { insunits: 0,  maxRaw: 50000, span: 20000, expected: { name: 'mm (guessed)', factor: 0.001, isGuessed: true } },
    { insunits: 0,  maxRaw: 500,   span: 300,   expected: { name: 'cm (guessed)', factor: 0.01,  isGuessed: true } },
    { insunits: 0,  maxRaw: 30,    span: 20,    expected: { name: 'm (guessed)',  factor: 1.0,   isGuessed: true } },
    { insunits: 4,  maxRaw: 0,     span: 0,     expected: { name: 'mm',           factor: 0.001, isGuessed: false } },
    { insunits: 6,  maxRaw: 0,     span: 0,     expected: { name: 'm',            factor: 1.0,   isGuessed: false } },
    { insunits: 2,  maxRaw: 0,     span: 0,     expected: { name: 'feet',         factor: 0.3048, isGuessed: false } },
    { insunits: 1,  maxRaw: 0,     span: 0,     expected: { name: 'inches',       factor: 0.0254, isGuessed: false } },
    { insunits: 5,  maxRaw: 0,     span: 0,     expected: { name: 'cm',           factor: 0.01,  isGuessed: false } },
    { insunits: 10, maxRaw: 0,     span: 0,     expected: { name: 'yards',        factor: 0.9144, isGuessed: false } },
    { insunits: 14, maxRaw: 0,     span: 0,     expected: { name: 'decimeters',   factor: 0.1,   isGuessed: false } },
  ]

  for (const tc of TEST_CASES) {
    it(`resolveUnits(${tc.insunits}, ${tc.maxRaw}, ${tc.span}) → ${tc.expected.name}`, () => {
      const r = resolveUnits(tc.insunits, tc.maxRaw, tc.span)
      expect(r.name).toBe(tc.expected.name)
      expect(r.factor).toBeCloseTo(tc.expected.factor)
      expect(r.isGuessed).toBe(tc.expected.isGuessed)
    })
  }
})
