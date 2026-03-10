// ─── DXF Parser Web Worker ────────────────────────────────────────────────────
// Runs heavy DXF parsing in a background thread so the UI never freezes.
// Supports files of any size (tested with 125 MB / 11.5M line files).
//
// Message protocol:
//   IN:  { type: 'parse', text: string }
//   OUT: { type: 'progress', pct: number }        (periodic)
//         { type: 'result',   data: ParsedDxf }   (success)
//         { type: 'error',    message: string }    (failure)
//
// NOTE: This file cannot use ES imports (Web Worker context).
// The INSUNITS_MAP below is a copy of the canonical map from utils/dxfUnits.js.
// If you update dxfUnits.js, update this map too (consistency test will catch drift).

// ── INSUNITS_MAP (canonical copy — must match src/utils/dxfUnits.js) ────────
const INSUNITS_MAP = {
  0:  ['unknown',     null],
  1:  ['inches',      0.0254],
  2:  ['feet',        0.3048],
  3:  ['miles',       1609.34],
  4:  ['mm',          0.001],
  5:  ['cm',          0.01],
  6:  ['m',           1.0],
  7:  ['km',          1000.0],
  8:  ['microinches', 2.54e-8],
  9:  ['mils',        2.54e-5],
  10: ['yards',       0.9144],
  11: ['angstroms',   1e-10],
  12: ['nanometers',  1e-9],
  13: ['microns',     1e-6],
  14: ['decimeters',  0.1],
  15: ['decameters',  10.0],
  16: ['hectometers', 100.0],
  17: ['gigameters',  1e9],
  18: ['AU',          1.496e11],
  19: ['light-years', 9.461e15],
  20: ['parsecs',     3.086e16],
}

// ── Unit auto-detect (must match guessUnitsFromGeometry in dxfUnits.js) ──────
function guessUnits(maxRawLength, bboxSpan) {
  const ref = Math.max(maxRawLength, bboxSpan)
  if (ref > 10000)  return { name: 'mm (guessed)', factor: 0.001, isGuessed: true }
  if (ref >= 100)   return { name: 'cm (guessed)', factor: 0.01,  isGuessed: true }
  return { name: 'm (guessed)', factor: 1.0, isGuessed: true }
}

// ── resolveUnits (must match resolveUnits in dxfUnits.js) ───────────────────
function resolveUnits(insunitsCode, maxRawLength, bboxSpan) {
  const entry = INSUNITS_MAP[insunitsCode]
  if (entry && entry[1] !== null) {
    return { insunits: insunitsCode, name: entry[0], factor: entry[1], isGuessed: false }
  }
  const g = guessUnits(maxRawLength || 0, bboxSpan || 0)
  return { insunits: insunitsCode, name: g.name, factor: g.factor, isGuessed: true }
}

function parseLayerName(layer) {
  const up = layer.toUpperCase()
  const info = {}
  const trayM = up.match(/(\d{2,4})[xX×](\d{2,4})/)
  if (trayM) { info.tray_width = +trayM[1]; info.tray_height = +trayM[2]; info.type = 'tray' }
  const cableM = up.match(/(\d+)[xX×](\d+\.?\d*)/)
  if (cableM && !info.type) { info.cores = +cableM[1]; info.cross_section = +cableM[2]; info.type = 'cable' }
  for (const t of ['NYY','CYKY','YKY','NAYY','NYM','H07V']) {
    if (up.includes(t)) { info.cable_type = t; if (!info.type) info.type = 'cable'; break }
  }
  for (const t of ['TRAY','TALCA','TÁLCA','CABLE_TRAY']) {
    if (up.includes(t)) { if (!info.type) info.type = 'tray'; break }
  }
  return Object.keys(info).length ? info : null
}

function parseDxfText(text) {
  const lines = text.split(/\r?\n/)
  const totalLines = lines.length

  // ── Tokenize in chunks with progress updates ───────────────────────────────
  const tokens = []
  const CHUNK = 500_000
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    const val  = lines[i + 1].trim()
    if (!isNaN(code)) tokens.push([code, val])

    // Report progress every CHUNK lines
    if (i % CHUNK === 0) {
      self.postMessage({ type: 'progress', pct: Math.round((i / totalLines) * 40) })
    }
  }
  self.postMessage({ type: 'progress', pct: 42 })

  // ── HEADER: find $INSUNITS ─────────────────────────────────────────────────
  let insunits = 0
  let inHeader = false, currentVar = null
  for (const [code, val] of tokens) {
    if (code === 0 && val === 'SECTION') { inHeader = false }
    if (code === 2 && val === 'HEADER')  { inHeader = true }
    if (code === 9 && inHeader) { currentVar = val }  // DXF header var names use group code 9, not 2
    if (inHeader && currentVar === '$INSUNITS' && code === 70) { insunits = parseInt(val, 10); break }
  }
  self.postMessage({ type: 'progress', pct: 45 })

  // ── Find ENTITIES section ──────────────────────────────────────────────────
  let entityStart = -1, sectionName = '', inSection = false
  for (let i = 0; i < tokens.length; i++) {
    const [code, val] = tokens[i]
    if (code === 0 && val === 'SECTION') { inSection = true; continue }
    if (inSection && code === 2) {
      sectionName = val; inSection = false
      if (val === 'ENTITIES') { entityStart = i + 1; break }
    }
  }
  self.postMessage({ type: 'progress', pct: 50 })

  const blockCounts   = {}
  const lengthByLayer = {}
  const allLayers     = new Set()
  const layerInfo     = {}
  const titleBlock    = {}
  const allText       = []

  const insertPositions = []
  const lineGeom        = []
  const polylineGeom    = []
  const MAX_LINES = 3000, MAX_POLYS = 800

  let entityType = null, entityLayer = 'DEFAULT', pts = [], ptX = null, ptY = null
  let closed = false, lineStart = null, textVal = null
  let insName = null, insX = null, insY = null

  const flushPolyline = () => {
    if (entityType === 'LWPOLYLINE' && pts.length > 1) {
      let L = 0
      for (let j = 0; j + 1 < pts.length; j++) {
        const dx = pts[j+1][0]-pts[j][0], dy = pts[j+1][1]-pts[j][1]
        L += Math.sqrt(dx*dx+dy*dy)
      }
      if (closed) {
        const dx=pts[0][0]-pts[pts.length-1][0], dy=pts[0][1]-pts[pts.length-1][1]
        L+=Math.sqrt(dx*dx+dy*dy)
      }
      lengthByLayer[entityLayer] = (lengthByLayer[entityLayer]||0) + L
      if (polylineGeom.length < MAX_POLYS) {
        const pointsCopy = [...pts]
        if (ptX !== null) pointsCopy.push([ptX, ptY||0])
        if (pointsCopy.length > 1) polylineGeom.push({ layer: entityLayer, points: pointsCopy, closed })
      }
    }
  }

  const flushInsert = () => {
    if (entityType === 'INSERT' && insName !== null && insX !== null) {
      const key = `${insName}||${entityLayer}`
      blockCounts[key] = (blockCounts[key]||0) + 1
      insertPositions.push({ name: insName, layer: entityLayer, x: insX, y: insY ?? 0 })
      insName = null; insX = null; insY = null
    }
  }

  const entityTokens = tokens.slice(entityStart >= 0 ? entityStart : 0)
  const entityTotal  = entityTokens.length

  for (let i = 0; i < entityTokens.length; i++) {
    const [code, val] = entityTokens[i]
    if (code === 0 && val === 'ENDSEC') { flushPolyline(); flushInsert(); break }

    if (code === 0) {
      flushPolyline()
      flushInsert()
      entityType = val; entityLayer = 'DEFAULT'; pts = []; ptX = null; ptY = null
      closed = false; lineStart = null; textVal = null
      insName = null; insX = null; insY = null
      continue
    }

    if (code === 8) {
      entityLayer = val; allLayers.add(val)
      if (!layerInfo[val]) { const info = parseLayerName(val); if (info) layerInfo[val] = info }
    }

    if (entityType === 'INSERT') {
      if (code === 2) insName = val
      if (code === 10) insX = parseFloat(val)
      if (code === 20) insY = parseFloat(val)
    }

    if (entityType === 'LWPOLYLINE') {
      if (code === 70) closed = !!(parseInt(val,10) & 1)
      if (code === 10) { if (ptX !== null) pts.push([ptX, ptY||0]); ptX = parseFloat(val); ptY = null }
      if (code === 20) ptY = parseFloat(val)
    }

    if (entityType === 'LINE') {
      if (code === 10) lineStart = [parseFloat(val), 0]
      if (code === 20 && lineStart) lineStart[1] = parseFloat(val)
      if (code === 11 && lineStart) {
        const ex = parseFloat(val)
        const next = entityTokens[i+1]
        let ey = 0; if (next && next[0] === 21) { ey = parseFloat(next[1]); i++ }
        const dx=ex-lineStart[0], dy=ey-lineStart[1]
        lengthByLayer[entityLayer] = (lengthByLayer[entityLayer]||0) + Math.sqrt(dx*dx+dy*dy)
        if (lineGeom.length < MAX_LINES) {
          lineGeom.push({ layer: entityLayer, x1: lineStart[0], y1: lineStart[1], x2: ex, y2: ey })
        }
        lineStart = null
      }
    }

    if ((entityType==='TEXT'||entityType==='MTEXT') && code===1) {
      const trimmed = val.trim()
      if (trimmed.length > 1) {
        allText.push(trimmed)
        const lu = entityLayer.toUpperCase()
        if (['TITLE','CIM','FEJLEC','BORDER','KERET'].some(k=>lu.includes(k))) {
          if (!titleBlock[entityLayer]) titleBlock[entityLayer] = []
          titleBlock[entityLayer].push(trimmed)
        }
      }
    }

    // Progress every 500k tokens
    if (i % 500_000 === 0) {
      self.postMessage({ type: 'progress', pct: 50 + Math.round((i / entityTotal) * 45) })
    }
  }
  flushPolyline()
  flushInsert()
  self.postMessage({ type: 'progress', pct: 96 })

  // ── Compute bounding box ──────────────────────────────────────────────────
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const ins of insertPositions) {
    if (ins.x < minX) minX = ins.x; if (ins.x > maxX) maxX = ins.x
    if (ins.y < minY) minY = ins.y; if (ins.y > maxY) maxY = ins.y
  }
  for (const l of lineGeom) {
    if (l.x1 < minX) minX = l.x1; if (l.x1 > maxX) maxX = l.x1
    if (l.x2 < minX) minX = l.x2; if (l.x2 > maxX) maxX = l.x2
    if (l.y1 < minY) minY = l.y1; if (l.y1 > maxY) maxY = l.y1
    if (l.y2 < minY) minY = l.y2; if (l.y2 > maxY) maxY = l.y2
  }
  const hasBounds = isFinite(minX)
  const geomBounds = hasBounds
    ? { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
    : null

  // ── Resolve units via canonical pipeline (matches dxfUnits.js) ────────────
  const maxRaw = Math.max(...Object.values(lengthByLayer), 0)
  const span = hasBounds ? Math.max(maxX - minX, maxY - minY) : 0
  const resolved = resolveUnits(insunits, maxRaw, span)

  const blocks = Object.entries(blockCounts)
    .map(([key, count]) => { const [name,layer]=key.split('||'); return {name,layer,count} })
    .sort((a,b)=>b.count-a.count).slice(0,300)

  const lengths = Object.entries(lengthByLayer)
    .filter(([,v])=>v>0.01)
    .map(([layer,v])=>({
      layer,
      length:     Math.round(v * resolved.factor * 100000) / 100000,
      length_raw: Math.round(v * 100000) / 100000,
      info: layerInfo[layer]||null,
    }))
    .sort((a,b)=>b.length-a.length)

  return {
    success: true, blocks, lengths,
    layers: [...allLayers].sort(),
    units: { insunits, name: resolved.name, factor: resolved.factor, auto_detected: resolved.isGuessed },
    title_block: titleBlock,
    all_text: allText,
    inserts: insertPositions,
    lineGeom,
    polylineGeom,
    geomBounds,
    summary: {
      total_block_types: new Set(blocks.map(b=>b.name)).size,
      total_blocks: blocks.reduce((s,b)=>s+b.count,0),
      total_layers: allLayers.size,
      layers_with_lines: lengths.length,
      total_inserts: insertPositions.length,
    },
    _source: 'worker',
  }
}

// ── Main message handler ────────────────────────────────────────────────────
self.onmessage = function(e) {
  const { type, text } = e.data
  if (type !== 'parse') return

  try {
    self.postMessage({ type: 'progress', pct: 5 })
    const result = parseDxfText(text)
    self.postMessage({ type: 'progress', pct: 100 })
    self.postMessage({ type: 'result', data: result })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message })
  }
}
