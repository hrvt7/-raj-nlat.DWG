// ─── Lightweight browser-side DXF parser ──────────────────────────────────────
// Replicates the Python parse-dxf.py logic, runs 100% client-side.
// No file size limit — parses directly from ArrayBuffer/text in the browser.

const INSUNITS_MAP = {
  0:  ['unknown',     null],
  1:  ['inches',      0.0254],
  2:  ['feet',        0.3048],
  4:  ['mm',          0.001],
  5:  ['cm',          0.01],
  6:  ['m',           1.0],
  14: ['decimeters',  0.1],
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

export async function parseDxfFile(file) {
  const text = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'utf-8')
  })
  return parseDxfText(text)
}

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
    if (code === 2 && val !== 'HEADER' && inHeader) { currentVar = val }
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

  let entityType = null, entityLayer = 'DEFAULT', pts = [], ptX = null, ptY = null
  let closed = false, lineStart = null, textVal = null

  const flushPolyline = () => {
    if (entityType === 'LWPOLYLINE' && pts.length > 1) {
      let L = 0
      for (let j = 0; j + 1 < pts.length; j++) {
        const dx = pts[j+1][0]-pts[j][0], dy = pts[j+1][1]-pts[j][1]
        L += Math.sqrt(dx*dx+dy*dy)
      }
      if (closed) { const dx=pts[0][0]-pts[pts.length-1][0], dy=pts[0][1]-pts[pts.length-1][1]; L+=Math.sqrt(dx*dx+dy*dy) }
      lengthByLayer[entityLayer] = (lengthByLayer[entityLayer]||0) + L
    }
  }

  for (let i = entityStart >= 0 ? entityStart : 0; i < tokens.length; i++) {
    const [code, val] = tokens[i]
    if (code === 0 && val === 'ENDSEC') break

    if (code === 0) {
      flushPolyline()
      entityType = val; entityLayer = 'DEFAULT'; pts = []; ptX = null; ptY = null
      closed = false; lineStart = null; textVal = null
      continue
    }

    if (code === 8) {
      entityLayer = val; allLayers.add(val)
      if (!layerInfo[val]) { const info = parseLayerName(val); if (info) layerInfo[val] = info }
    }

    if (entityType === 'INSERT' && code === 2) {
      const key = `${val}||${entityLayer}`
      blockCounts[key] = (blockCounts[key]||0) + 1
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
        lineStart = null
      }
    }

    if ((entityType==='TEXT'||entityType==='MTEXT') && code===1) {
      const lu = entityLayer.toUpperCase()
      if (['TITLE','CIM','FEJLEC','BORDER','KERET'].some(k=>lu.includes(k))) {
        if (!titleBlock[entityLayer]) titleBlock[entityLayer] = []
        if (val.trim().length > 1) titleBlock[entityLayer].push(val.trim())
      }
    }
  }
  flushPolyline()

  // ── Auto-detect units from raw lengths ────────────────────────────────────
  if (!unitFactor) {
    const maxRaw = Math.max(...Object.values(lengthByLayer), 0)
    if (maxRaw > 10000)    { unitName='mm (guessed)'; unitFactor=0.001 }
    else if (maxRaw > 100) { unitName='cm (guessed)'; unitFactor=0.01 }
    else                   { unitName='m (guessed)';  unitFactor=1.0 }
  }

  const blocks = Object.entries(blockCounts)
    .map(([key, count]) => { const [name,layer]=key.split('||'); return {name,layer,count} })
    .sort((a,b)=>b.count-a.count).slice(0,300)

  const lengths = Object.entries(lengthByLayer)
    .filter(([,v])=>v>0.01)
    .map(([layer,v])=>({
      layer, length: Math.round(v*unitFactor*1000)/1000,
      length_raw: Math.round(v*10000)/10000, info: layerInfo[layer]||null,
    }))
    .sort((a,b)=>b.length-a.length)

  return {
    success: true, blocks, lengths,
    layers: [...allLayers].sort(),
    units: { insunits, name: unitName, factor: unitFactor, auto_detected: true },
    title_block: titleBlock,
    summary: {
      total_block_types: new Set(blocks.map(b=>b.name)).size,
      total_blocks: blocks.reduce((s,b)=>s+b.count,0),
      total_layers: allLayers.size,
      layers_with_lines: lengths.length,
    },
    _source: 'browser',
  }
}
