// ─── Lightweight browser-side DXF parser ──────────────────────────────────────
// For small files: parses inline (fast).
// For large files (>5MB): uses a Web Worker to avoid freezing the UI.
// No file size limit.

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

// ── Worker-based parse (for large files) ───────────────────────────────────
function parseDxfTextInWorker(text, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./workers/dxfParser.worker.js', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e) => {
      const { type, pct, data, message } = e.data
      if (type === 'progress') {
        onProgress?.(pct)
      } else if (type === 'result') {
        worker.terminate()
        resolve(data)
      } else if (type === 'error') {
        worker.terminate()
        reject(new Error(message))
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message || 'Worker error'))
    }

    worker.postMessage({ type: 'parse', text })
  })
}

// ── Main thread parse (for small files, <5 MB) ────────────────────────────
export function parseDxfText(text) {
  const lines = text.split(/\r?\n/)
  const tokens = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    const val  = lines[i + 1].trim()
    if (!isNaN(code)) tokens.push([code, val])
  }

  // ── HEADER: find $INSUNITS ─────────────────────────────────────────────────
  let insunits = 0
  let inHeader = false, currentVar = null
  for (const [code, val] of tokens) {
    if (code === 0 && val === 'SECTION') { inHeader = false }
    if (code === 2 && val === 'HEADER')  { inHeader = true }
    if (code === 9 && inHeader) { currentVar = val }  // DXF header variable names use group code 9
    if (inHeader && currentVar === '$INSUNITS' && code === 70) { insunits = parseInt(val, 10); break }
  }
  let [unitName, unitFactor] = INSUNITS_MAP[insunits] || ['unknown', null]

  // ── Find ENTITIES section ──────────────────────────────────────────────────
  let entityStart = -1, sectionName = '', inSection = false
  for (let i = 0; i < tokens.length; i++) {
    const [code, val] = tokens[i]
    if (code === 0 && val === 'SECTION') { inSection = true; continue }
    if (inSection && code === 2) { sectionName = val; inSection = false; if (val === 'ENTITIES') { entityStart = i + 1; break } }
  }

  const blockCounts   = {}
  const lengthByLayer = {}
  const allLayers     = new Set()
  const layerInfo     = {}
  const titleBlock    = {}
  const allText       = []               // ALL TEXT/MTEXT strings (for metadata inference)

  // ── Geometry capture for SVG overlay ──────────────────────────────────────
  const insertPositions = []           // [{name, layer, x, y}] — block placements
  const lineGeom        = []           // [{layer, x1, y1, x2, y2}] — capped at 3000
  const polylineGeom    = []           // [{layer, points}] — capped at 800
  const MAX_LINES = 3000, MAX_POLYS = 800

  let entityType = null, entityLayer = 'DEFAULT', pts = [], ptX = null, ptY = null
  let closed = false, lineStart = null, textVal = null
  // INSERT position tracking
  let insName = null, insX = null, insY = null

  const flushPolyline = () => {
    if (entityType === 'LWPOLYLINE' && pts.length > 1) {
      let L = 0
      for (let j = 0; j + 1 < pts.length; j++) {
        const dx = pts[j+1][0]-pts[j][0], dy = pts[j+1][1]-pts[j][1]
        L += Math.sqrt(dx*dx+dy*dy)
      }
      if (closed) { const dx=pts[0][0]-pts[pts.length-1][0], dy=pts[0][1]-pts[pts.length-1][1]; L+=Math.sqrt(dx*dx+dy*dy) }
      lengthByLayer[entityLayer] = (lengthByLayer[entityLayer]||0) + L
      // Capture polyline points for SVG
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

  for (let i = entityStart >= 0 ? entityStart : 0; i < tokens.length; i++) {
    const [code, val] = tokens[i]
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
        const next = tokens[i+1]
        let ey = 0; if (next && next[0] === 21) { ey = parseFloat(next[1]); i++ }
        const dx=ex-lineStart[0], dy=ey-lineStart[1]
        lengthByLayer[entityLayer] = (lengthByLayer[entityLayer]||0) + Math.sqrt(dx*dx+dy*dy)
        // Capture line geometry for SVG
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
  }
  flushPolyline()
  flushInsert()

  // ── Compute bounding box of all geometry ──────────────────────────────────
  // NOTE: must be computed before unit auto-detection (hasBounds used below)
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

  // ── Auto-detect units from raw lengths + bounding box ────────────────────
  if (!unitFactor) {
    const maxRaw = Math.max(...Object.values(lengthByLayer), 0)
    // Also check bounding box span for more reliable detection
    const span = hasBounds ? Math.max(maxX - minX, maxY - minY) : 0
    const ref = Math.max(maxRaw, span)
    if      (ref > 10000)  { unitName='mm (guessed)'; unitFactor=0.001 }
    else if (ref >= 100)   { unitName='cm (guessed)'; unitFactor=0.01 }
    else                   { unitName='m (guessed)';  unitFactor=1.0 }
  }
  if (!unitFactor) unitFactor = 1.0   // last-resort safety

  const blocks = Object.entries(blockCounts)
    .map(([key, count]) => { const [name,layer]=key.split('||'); return {name,layer,count} })
    .sort((a,b)=>b.count-a.count).slice(0,300)

  const lengths = Object.entries(lengthByLayer)
    .filter(([,v])=>v>0.01)
    .map(([layer,v])=>({
      layer,
      length:     Math.round(v * unitFactor * 100000) / 100000,
      length_raw: Math.round(v * 100000) / 100000,
      info: layerInfo[layer]||null,
    }))
    .sort((a,b)=>b.length-a.length)

  return {
    success: true, blocks, lengths,
    layers: [...allLayers].sort(),
    units: { insunits, name: unitName, factor: unitFactor, auto_detected: true },
    title_block: titleBlock,
    all_text: allText,                   // all TEXT/MTEXT for metadata inference
    // ── Geometry for SVG viewer overlay ───────────────────────────────────
    inserts: insertPositions,          // [{name, layer, x, y}]
    lineGeom,                          // [{layer, x1, y1, x2, y2}]
    polylineGeom,                      // [{layer, points: [[x,y],...], closed}]
    geomBounds,                        // {minX, maxX, minY, maxY, width, height}
    summary: {
      total_block_types: new Set(blocks.map(b=>b.name)).size,
      total_blocks: blocks.reduce((s,b)=>s+b.count,0),
      total_layers: allLayers.size,
      layers_with_lines: lengths.length,
      total_inserts: insertPositions.length,
    },
    _source: 'browser',
  }
}

// ── parseDxfFile — main entry point ──────────────────────────────────────────
// Large files (>5 MB) → Web Worker (non-blocking)
// Small files (<5 MB) → main thread (fast, no worker overhead)
export async function parseDxfFile(file, onProgress) {
  const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024 // 5 MB

  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'utf-8')
  })

  if (file.size > LARGE_FILE_THRESHOLD) {
    // Large file — use Web Worker to avoid freezing the UI
    try {
      return await parseDxfTextInWorker(text, onProgress)
    } catch (workerErr) {
      console.warn('DXF Worker failed, falling back to main thread:', workerErr.message)
      // Fallback to main thread (will be slow but won't fail silently)
      return parseDxfText(text)
    }
  } else {
    // Small file — parse inline
    return parseDxfText(text)
  }
}
