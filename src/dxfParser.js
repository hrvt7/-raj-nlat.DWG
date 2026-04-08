// ─── Lightweight browser-side DXF parser ──────────────────────────────────────
// For small files: parses inline (fast).
// For large files (>5MB): uses a Web Worker to avoid freezing the UI.
// No file size limit.

import { INSUNITS_MAP, resolveUnits } from './utils/dxfUnits.js'

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
export function parseDxfTextInWorker(text, onProgress) {
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

  // ── Find BLOCKS + ENTITIES sections ────────────────────────────────────────
  let entityStart = -1, blocksStart = -1, blocksEnd = -1
  {
    let inSection = false
    for (let i = 0; i < tokens.length; i++) {
      const [code, val] = tokens[i]
      if (code === 0 && val === 'SECTION') { inSection = true; continue }
      if (inSection && code === 2) {
        inSection = false
        if (val === 'ENTITIES') entityStart = i + 1
        if (val === 'BLOCKS') blocksStart = i + 1
      }
      if (code === 0 && val === 'ENDSEC') {
        if (blocksStart > 0 && blocksEnd < 0 && entityStart < 0) blocksEnd = i
        if (blocksStart > 0 && entityStart > 0 && blocksEnd < 0) blocksEnd = i // safety
      }
    }
    // If no ENDSEC found for BLOCKS, estimate its end
    if (blocksStart > 0 && blocksEnd < 0) blocksEnd = entityStart > 0 ? entityStart - 2 : tokens.length
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

  // ── Text entity spatial capture ──────────────────────────────────────────
  const textEntities = []              // [{text, x, y, layer}] — text with positions
  const MAX_TEXT_ENTS = 2000
  let textX = null, textY = null

  let entityType = null, entityLayer = 'DEFAULT', pts = [], ptX = null, ptY = null
  let closed = false, lineStart = null, textVal = null
  // INSERT position tracking + ATTRIB collection
  let insName = null, insX = null, insY = null
  let insAttribs = []                  // [{tag, value}] for current INSERT's ATTRIBs
  let attribTag = null                 // current ATTRIB tag name being collected

  let polylineLayer = 'DEFAULT' // track POLYLINE layer separately (VERTEX has its own layer code)

  const flushPolyline = () => {
    // Push the last pending point before computing length
    if (ptX !== null) { pts.push([ptX, ptY || 0]); ptX = null; ptY = null }
    if ((entityType === 'LWPOLYLINE' || entityType === 'POLYLINE') && pts.length > 1) {
      const pLayer = entityType === 'POLYLINE' ? polylineLayer : entityLayer
      let L = 0
      for (let j = 0; j + 1 < pts.length; j++) {
        const dx = pts[j+1][0]-pts[j][0], dy = pts[j+1][1]-pts[j][1]
        L += Math.sqrt(dx*dx+dy*dy)
      }
      if (closed) { const dx=pts[0][0]-pts[pts.length-1][0], dy=pts[0][1]-pts[pts.length-1][1]; L+=Math.sqrt(dx*dx+dy*dy) }
      lengthByLayer[pLayer] = (lengthByLayer[pLayer]||0) + L
      allLayers.add(pLayer)
      // Capture polyline points for SVG
      if (polylineGeom.length < MAX_POLYS && pts.length > 1) {
        polylineGeom.push({ layer: pLayer, points: [...pts], closed })
      }
    }
  }

  const flushInsert = () => {
    if (insName !== null && insX !== null) {
      const key = `${insName}||${entityLayer}`
      blockCounts[key] = (blockCounts[key]||0) + 1
      insertPositions.push({
        name: insName, layer: entityLayer, x: insX, y: insY ?? 0,
        attribs: insAttribs.length ? [...insAttribs] : null,
      })
      insName = null; insX = null; insY = null; insAttribs = []
    }
  }

  // ── BLOCKS: extract entities from *MODEL_SPACE / *PAPER_SPACE ───────────
  // Many modern DXF files store all geometry inside block definitions rather
  // than the top-level ENTITIES section. We parse those blocks and prepend
  // their entities so the main loop can process them identically.
  const blocksTokens = []
  if (blocksStart > 0 && blocksEnd > blocksStart) {
    let inModelSpace = false
    for (let i = blocksStart; i < blocksEnd; i++) {
      const [code, val] = tokens[i]
      if (code === 0 && val === 'BLOCK') { inModelSpace = false; continue }
      if (code === 2 && !inModelSpace) {
        // Check if this block is *MODEL_SPACE or *PAPER_SPACE
        const up = val.toUpperCase()
        if (up === '*MODEL_SPACE' || up === '*PAPER_SPACE') inModelSpace = true
        continue
      }
      if (code === 0 && val === 'ENDBLK') { inModelSpace = false; continue }
      if (inModelSpace) blocksTokens.push(tokens[i])
    }
  }

  // Build combined entity token stream: BLOCKS entities first, then ENTITIES section
  const entityTokenStream = []
  if (blocksTokens.length > 0) entityTokenStream.push(...blocksTokens)
  // Add ENTITIES section tokens
  if (entityStart >= 0) {
    for (let i = entityStart; i < tokens.length; i++) {
      const [code, val] = tokens[i]
      if (code === 0 && val === 'ENDSEC') break
      entityTokenStream.push(tokens[i])
    }
  }

  for (let i = 0; i < entityTokenStream.length; i++) {
    const [code, val] = entityTokenStream[i]

    if (code === 0) {
      // ATTRIB entities follow INSERT — collect tag/value pairs
      if (val === 'ATTRIB') {
        entityType = 'ATTRIB'; attribTag = null; continue
      }
      // VERTEX entities follow classic POLYLINE — collect points
      if (val === 'VERTEX') {
        entityType = 'VERTEX'; continue
      }
      // SEQEND terminates both ATTRIB (INSERT) and VERTEX (POLYLINE) sequences
      if (val === 'SEQEND') {
        if (pts.length > 0 || ptX !== null) {
          entityType = 'POLYLINE' // restore for flushPolyline check
          flushPolyline()
          pts = []; ptX = null; ptY = null
        }
        flushInsert()
        entityType = null; continue
      }
      flushPolyline()
      flushInsert()
      // Save POLYLINE layer before it gets overwritten by VERTEX layer codes
      if (val === 'POLYLINE') polylineLayer = 'DEFAULT'
      entityType = val; entityLayer = 'DEFAULT'; pts = []; ptX = null; ptY = null
      closed = false; lineStart = null; textVal = null
      insName = null; insX = null; insY = null
      insAttribs = []; attribTag = null
      textX = null; textY = null
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

    // Classic POLYLINE: capture layer and closed flag
    if (entityType === 'POLYLINE') {
      if (code === 8) polylineLayer = val
      if (code === 70) closed = !!(parseInt(val, 10) & 1)
    }

    // Classic VERTEX: capture point coordinates
    if (entityType === 'VERTEX') {
      if (code === 10) { if (ptX !== null) pts.push([ptX, ptY || 0]); ptX = parseFloat(val); ptY = null }
      if (code === 20) ptY = parseFloat(val)
    }

    // Collect ATTRIB tag/value pairs for the current INSERT
    if (entityType === 'ATTRIB') {
      if (code === 2) attribTag = val
      if (code === 1 && attribTag) {
        insAttribs.push({ tag: attribTag, value: val })
        attribTag = null
      }
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
        const next = entityTokenStream[i+1]
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

    if (entityType === 'TEXT' || entityType === 'MTEXT') {
      if (code === 10) textX = parseFloat(val)
      if (code === 20) textY = parseFloat(val)
      if (code === 1) {
        const trimmed = val.trim()
        if (trimmed.length > 1) {
          allText.push(trimmed)
          // Capture text position for evidence extraction
          if (textX !== null && textEntities.length < MAX_TEXT_ENTS) {
            textEntities.push({ text: trimmed, x: textX, y: textY ?? 0, layer: entityLayer })
          }
          const lu = entityLayer.toUpperCase()
          if (['TITLE','CIM','FEJLEC','BORDER','KERET'].some(k=>lu.includes(k))) {
            if (!titleBlock[entityLayer]) titleBlock[entityLayer] = []
            titleBlock[entityLayer].push(trimmed)
          }
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

  // ── Resolve units via canonical pipeline ──────────────────────────────────
  const maxRaw = Math.max(...Object.values(lengthByLayer), 0)
  const span = hasBounds ? Math.max(maxX - minX, maxY - minY) : 0
  const resolvedUnits = resolveUnits(insunits, maxRaw, span)
  unitName = resolvedUnits.name
  unitFactor = resolvedUnits.factor

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
    units: { insunits, name: unitName, factor: unitFactor, auto_detected: resolvedUnits.isGuessed },
    title_block: titleBlock,
    all_text: allText,                   // all TEXT/MTEXT for metadata inference
    // ── Geometry for SVG viewer overlay ───────────────────────────────────
    inserts: insertPositions,          // [{name, layer, x, y, attribs}]
    lineGeom,                          // [{layer, x1, y1, x2, y2}]
    polylineGeom,                      // [{layer, points: [[x,y],...], closed}]
    geomBounds,                        // {minX, maxX, minY, maxY, width, height}
    textEntities,                      // [{text, x, y, layer}] — text with positions
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

// ── DXF codepage detection + encoding-aware decode ───────────────────────────
// DXF files declare their encoding via $DWGCODEPAGE in the HEADER section.
// Common values: ANSI_1250 (Central European), ANSI_1252 (Western), ANSI_932 (Japanese).
// If the DXF is not UTF-8, we must decode with the correct encoding.
const CODEPAGE_TO_ENCODING = {
  'ANSI_1250': 'windows-1250',  // Hungarian, Czech, Polish, etc.
  'ANSI_1251': 'windows-1251',  // Cyrillic
  'ANSI_1252': 'windows-1252',  // Western European
  'ANSI_1253': 'windows-1253',  // Greek
  'ANSI_1254': 'windows-1254',  // Turkish
  'ANSI_1255': 'windows-1255',  // Hebrew
  'ANSI_1256': 'windows-1256',  // Arabic
  'ANSI_932':  'shift-jis',     // Japanese
  'ANSI_936':  'gbk',           // Simplified Chinese
  'ANSI_949':  'euc-kr',        // Korean
  'ANSI_950':  'big5',          // Traditional Chinese
}

/**
 * Detect DXF codepage from raw bytes (first ~4KB of file).
 * Looks for $DWGCODEPAGE header variable.
 * @param {ArrayBuffer} buffer
 * @returns {string} encoding label for TextDecoder (default: 'utf-8')
 */
function detectDxfEncoding(buffer) {
  // Read first 4KB as ASCII to find DWGCODEPAGE (safe — codepage name is always ASCII)
  const preview = new TextDecoder('ascii').decode(buffer.slice(0, Math.min(buffer.byteLength, 4096)))
  const match = preview.match(/\$DWGCODEPAGE[\s\S]*?\n\s*3\s*\n\s*(\S+)/i)
  if (match) {
    const codepage = match[1].trim().toUpperCase()
    const encoding = CODEPAGE_TO_ENCODING[codepage]
    if (encoding) {
      console.log(`[dxfParser] Detected codepage: ${codepage} → using ${encoding}`)
      return encoding
    }
    // Unknown codepage — might already be UTF-8 or unsupported
    if (codepage === 'UTF-8' || codepage === 'UTF8') return 'utf-8'
    console.warn(`[dxfParser] Unknown codepage "${codepage}" — falling back to utf-8`)
  }
  return 'utf-8'
}

// ── parseDxfFile — main entry point ──────────────────────────────────────────
// Large files (>5 MB) → Web Worker (non-blocking)
// Small files (<5 MB) → main thread (fast, no worker overhead)
export async function parseDxfFile(file, onProgress) {
  const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024 // 5 MB

  // Read as binary first to detect encoding, then decode with correct codepage
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
  const encoding = detectDxfEncoding(buffer)
  const text = new TextDecoder(encoding).decode(buffer)

  if (file.size > LARGE_FILE_THRESHOLD) {
    // Large file — use Web Worker to avoid freezing the UI
    try {
      return await parseDxfTextInWorker(text, onProgress)
    } catch (workerErr) {
      console.warn('[dxfParser] Worker failed, falling back to main thread:', workerErr.message)
      // Fallback to main thread (will be slow but won't fail silently)
      return parseDxfText(text)
    }
  } else {
    // Small file — parse inline
    return parseDxfText(text)
  }
}
