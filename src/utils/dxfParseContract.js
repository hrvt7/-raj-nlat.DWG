// ─── DXF Parse Contract — Normalization Layer ────────────────────────────────
// Transforms raw parser outputs from ANY variant into a single normalized shape.
// All downstream consumers (dxfAudit, cableAudit, recognition, TakeoffWorkspace)
// read from this contract — never directly from raw parser output.
//
// Supported parser variants:
//   'browser'      — src/dxfParser.js  parseDxfText / parseDxfFile
//   'worker'       — src/workers/dxfParser.worker.js
//   'cable_agent'  — src/cableAgent.js  extractGeometry
//   'server'       — api/parse-dxf.py
//
// No side effects, no React, no DOM — safe for testing and Web Workers.

import { resolveUnits } from './dxfUnits.js'

// ── Normalized contract shape (all fields documented) ───────────────────────
//
// {
//   success:          boolean
//   units: {
//     insunits:       number       — raw $INSUNITS code
//     name:           string       — 'mm', 'cm (guessed)', etc.
//     factor:         number       — meters-per-drawing-unit multiplier
//     isGuessed:      boolean      — true if auto-detected
//     confidence:     'high'|'low' — from resolveUnits
//     auto_detected:  boolean      — legacy compat (= isGuessed)
//   }
//   blocks:           [{ name, layer, count }]
//   insertPositions:  [{ name, layer, x, y }]
//   lengths:          [{ layer, length, length_raw, info }]
//   layerInfo:        { [layer]: { type, cable_type?, cores?, ... } }
//   layers:           string[]
//   allText:          string[]
//   titleBlock:       { [layer]: string[] }
//   geomBounds:       { minX, maxX, minY, maxY, width, height } | null
//   lineGeom:         [{ layer, x1, y1, x2, y2 }]          — pass-through
//   polylineGeom:     [{ layer, points, closed }]           — pass-through
//   summary: {
//     total_block_types: number
//     total_blocks:      number
//     total_layers:      number
//     layers_with_lines: number
//     total_inserts:     number
//   }
//   warnings:         string[]       — normalized parser warnings
//   caps: {
//     linesCapped:    boolean
//     polysCapped:    boolean
//     maxLines:       number
//     maxPolys:       number
//   } | null
//   _source:          string          — 'browser' | 'worker' | 'cable_agent' | 'server'
//   _normalizedAt:    number          — Date.now() timestamp
// }

// ── Known geometry caps from browser/worker parsers ─────────────────────────
const DEFAULT_MAX_LINES = 3000
const DEFAULT_MAX_POLYS = 800

// ── Normalization entry point ───────────────────────────────────────────────
/**
 * Normalize any raw parser result into the unified DXF parse contract.
 *
 * @param {object} raw    — Raw output from any parser variant
 * @param {string} source — Parser variant: 'browser'|'worker'|'cable_agent'|'server'
 * @returns {object}      — Normalized contract (always has success field)
 */
export function normalizeDxfResult(raw, source = 'browser') {
  if (!raw) {
    return {
      success: false,
      error: 'No parser output',
      ...emptyContract(source),
    }
  }

  // Route to variant-specific normalizer
  if (source === 'cable_agent') {
    return normalizeCableAgent(raw, source)
  }

  // Browser / worker / server — all share the same output shape
  return normalizeBrowserLike(raw, source)
}

// ── Browser / Worker / Server normalizer ────────────────────────────────────
function normalizeBrowserLike(raw, source) {
  if (!raw.success) {
    return {
      success: false,
      error: raw.error || 'Parse failed',
      ...emptyContract(source),
      // Preserve _dwgFailed flag if present
      ...(raw._dwgFailed ? { _dwgFailed: true } : {}),
    }
  }

  const blocks = raw.blocks || []
  const inserts = raw.inserts || []
  const lengths = raw.lengths || []
  const layers = raw.layers || []
  const allText = raw.all_text || []
  const titleBlock = raw.title_block || {}
  const lineGeom = raw.lineGeom || []
  const polylineGeom = raw.polylineGeom || []
  const geomBounds = raw.geomBounds || null
  const summary = raw.summary || {}
  const rawUnits = raw.units || {}

  // ── Resolve units through canonical pipeline ─────────────────────────────
  // Compute geometry metrics for fallback detection
  const maxRawLength = Math.max(...lengths.map(l => l.length_raw || 0), 0)
  const bboxSpan = geomBounds
    ? Math.max(geomBounds.width || 0, geomBounds.height || 0)
    : 0

  const units = resolveUnits(rawUnits.insunits || 0, maxRawLength, bboxSpan)
  // Merge legacy compat fields
  units.auto_detected = units.isGuessed

  // ── Build warnings ───────────────────────────────────────────────────────
  const warnings = []

  if (units.isGuessed) {
    warnings.push(`Mértékegység automatikusan meghatározva: ${units.name}`)
  }

  const linesCapped = lineGeom.length >= DEFAULT_MAX_LINES
  const polysCapped = polylineGeom.length >= DEFAULT_MAX_POLYS
  if (linesCapped) {
    warnings.push(`Vonalgeometria csonkolva (max ${DEFAULT_MAX_LINES} vonal)`)
  }
  if (polysCapped) {
    warnings.push(`Polyline geometria csonkolva (max ${DEFAULT_MAX_POLYS} polyline)`)
  }

  if (layers.length === 0) {
    warnings.push('Nem találtunk rétegeket a DXF-ben')
  }

  if (blocks.length === 0 && inserts.length === 0) {
    warnings.push('Nem találtunk blokkokat vagy INSERT-eket')
  }

  // ── Build layerInfo from lengths ─────────────────────────────────────────
  const layerInfo = {}
  for (const l of lengths) {
    if (l.info) layerInfo[l.layer] = l.info
  }

  // ── Build caps metadata ──────────────────────────────────────────────────
  const caps = (linesCapped || polysCapped) ? {
    linesCapped,
    polysCapped,
    maxLines: DEFAULT_MAX_LINES,
    maxPolys: DEFAULT_MAX_POLYS,
  } : null

  return {
    success: true,
    units,
    blocks,
    insertPositions: inserts,
    lengths,
    layerInfo,
    layers,
    allText,
    titleBlock,
    geomBounds,
    lineGeom,
    polylineGeom,
    summary: {
      total_block_types: summary.total_block_types ?? new Set(blocks.map(b => b.name)).size,
      total_blocks: summary.total_blocks ?? blocks.reduce((s, b) => s + b.count, 0),
      total_layers: summary.total_layers ?? layers.length,
      layers_with_lines: summary.layers_with_lines ?? lengths.length,
      total_inserts: summary.total_inserts ?? inserts.length,
    },
    warnings,
    caps,
    _source: source,
    _normalizedAt: Date.now(),

    // ── Legacy compatibility aliases ───────────────────────────────────────
    // These ensure existing code that reads `parsedDxf.inserts` still works
    // during the transition period.
    inserts,
    all_text: allText,
    title_block: titleBlock,
  }
}

// ── Cable Agent normalizer ──────────────────────────────────────────────────
// Converts extractGeometry() output → contract shape
function normalizeCableAgent(raw, source) {
  const scale = raw.scale || {}
  const bounds = raw.bounds || {}
  const inserts = raw.inserts || []
  const polylines = raw.polylines || []
  const lines = raw.lines || []
  const stats = raw.stats || {}

  // ── Resolve units through canonical pipeline ─────────────────────────────
  const bboxSpan = Math.max(
    (bounds.maxX || 0) - (bounds.minX || 0),
    (bounds.maxY || 0) - (bounds.minY || 0)
  )
  const units = resolveUnits(scale.insunits || 0, 0, bboxSpan)
  units.auto_detected = units.isGuessed

  // ── Map inserts → blocks (group by name||layer) ──────────────────────────
  const blockCounts = {}
  for (const ins of inserts) {
    const key = `${ins.name}||${ins.layer}`
    blockCounts[key] = (blockCounts[key] || 0) + 1
  }
  const blocks = Object.entries(blockCounts)
    .map(([key, count]) => {
      const [name, layer] = key.split('||')
      return { name, layer, count }
    })
    .sort((a, b) => b.count - a.count)

  // ── Compute lengths from polylines ───────────────────────────────────────
  const lengthByLayer = {}
  for (const p of polylines) {
    let L = 0
    for (let i = 0; i + 1 < p.points.length; i++) {
      const dx = p.points[i + 1][0] - p.points[i][0]
      const dy = p.points[i + 1][1] - p.points[i][1]
      L += Math.sqrt(dx * dx + dy * dy)
    }
    if (p.isClosed && p.points.length > 1) {
      const dx = p.points[0][0] - p.points[p.points.length - 1][0]
      const dy = p.points[0][1] - p.points[p.points.length - 1][1]
      L += Math.sqrt(dx * dx + dy * dy)
    }
    lengthByLayer[p.layer] = (lengthByLayer[p.layer] || 0) + L
  }
  for (const l of lines) {
    const dx = l.x2 - l.x1
    const dy = l.y2 - l.y1
    lengthByLayer[l.layer] = (lengthByLayer[l.layer] || 0) + Math.sqrt(dx * dx + dy * dy)
  }

  const lengths = Object.entries(lengthByLayer)
    .filter(([, v]) => v > 0.01)
    .map(([layer, v]) => ({
      layer,
      length: Math.round(v * (units.factor || 1) * 100000) / 100000,
      length_raw: Math.round(v * 100000) / 100000,
      info: null, // cableAgent doesn't use parseLayerName
    }))
    .sort((a, b) => b.length - a.length)

  // ── Geometry bounds ──────────────────────────────────────────────────────
  const hasBounds = isFinite(bounds.minX)
  const geomBounds = hasBounds ? {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    width: (bounds.maxX || 0) - (bounds.minX || 0),
    height: (bounds.maxY || 0) - (bounds.minY || 0),
  } : null

  // ── All layers ───────────────────────────────────────────────────────────
  const allLayers = new Set()
  for (const ins of inserts) allLayers.add(ins.layer)
  for (const p of polylines) allLayers.add(p.layer)
  for (const l of lines) allLayers.add(l.layer)
  const layers = [...allLayers].sort()

  // ── Warnings ─────────────────────────────────────────────────────────────
  const warnings = []
  if (units.isGuessed) {
    warnings.push(`Mértékegység automatikusan meghatározva: ${units.name}`)
  }
  // Cable agent has no text extraction
  warnings.push('Szöveg/MTEXT entitások nem kerültek kiolvasásra (cableAgent parser)')

  // ── Build polylineGeom for compat ────────────────────────────────────────
  const polylineGeom = polylines.map(p => ({
    layer: p.layer,
    points: p.points,
    closed: p.isClosed || false,
  }))

  // ── Build lineGeom for compat ────────────────────────────────────────────
  const lineGeom = lines.map(l => ({
    layer: l.layer,
    x1: l.x1, y1: l.y1,
    x2: l.x2, y2: l.y2,
  }))

  return {
    success: true,
    units,
    blocks,
    insertPositions: inserts,
    lengths,
    layerInfo: {},
    layers,
    allText: [],
    titleBlock: {},
    geomBounds,
    lineGeom,
    polylineGeom,
    summary: {
      total_block_types: new Set(blocks.map(b => b.name)).size,
      total_blocks: blocks.reduce((s, b) => s + b.count, 0),
      total_layers: layers.length,
      layers_with_lines: lengths.length,
      total_inserts: inserts.length,
    },
    warnings,
    caps: null, // cableAgent has no geometry caps
    _source: source,
    _normalizedAt: Date.now(),

    // Legacy compat aliases
    inserts,
    all_text: [],
    title_block: {},
  }
}

// ── Empty contract (for error states) ───────────────────────────────────────
function emptyContract(source) {
  return {
    units: { insunits: 0, name: 'unknown', factor: 1.0, isGuessed: false, confidence: 'low', auto_detected: false },
    blocks: [],
    insertPositions: [],
    lengths: [],
    layerInfo: {},
    layers: [],
    allText: [],
    titleBlock: {},
    geomBounds: null,
    lineGeom: [],
    polylineGeom: [],
    summary: { total_block_types: 0, total_blocks: 0, total_layers: 0, layers_with_lines: 0, total_inserts: 0 },
    warnings: [],
    caps: null,
    _source: source,
    _normalizedAt: Date.now(),
    inserts: [],
    all_text: [],
    title_block: {},
  }
}
