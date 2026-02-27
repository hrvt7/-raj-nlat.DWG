// ─── Cable Agent Client ────────────────────────────────────────────────────────
// Sends geometry + DXF screenshot to n8n Vision agent, gets cable estimate back.

/**
 * Extracts full geometry from parsed DXF tokens including INSERT coordinates.
 * Call this INSTEAD OF / IN ADDITION TO parseDxfText() to get positional data.
 */
export function extractGeometry(dxfText) {
  const lines = dxfText.split(/\r?\n/)
  const tokens = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    const val = lines[i + 1].trim()
    if (!isNaN(code)) tokens.push([code, val])
  }

  // ── HEADER ─────────────────────────────────────────────────────────────────
  let insunits = 0, extmin = null, extmax = null
  let inHeader = false, currentVar = null
  const INSUNITS_MAP = {
    0: ['unknown', null], 1: ['inches', 0.0254], 2: ['feet', 0.3048],
    4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1.0], 14: ['decimeters', 0.1],
  }

  for (let i = 0; i < tokens.length; i++) {
    const [code, val] = tokens[i]
    if (code === 0 && val === 'SECTION') inHeader = false
    if (code === 2 && val === 'HEADER') inHeader = true
    if (code === 2 && val !== 'HEADER' && inHeader) currentVar = val
    if (inHeader) {
      if (currentVar === '$INSUNITS' && code === 70) insunits = parseInt(val, 10)
      if (currentVar === '$EXTMIN' && code === 10) extmin = [parseFloat(val), 0]
      if (currentVar === '$EXTMIN' && code === 20 && extmin) extmin[1] = parseFloat(val)
      if (currentVar === '$EXTMAX' && code === 10) extmax = [parseFloat(val), 0]
      if (currentVar === '$EXTMAX' && code === 20 && extmax) extmax[1] = parseFloat(val)
    }
    if (code === 0 && val === 'ENTITIES') break
  }

  const [unitName, unitFactor] = INSUNITS_MAP[insunits] || ['unknown', null]

  // ── Find ENTITIES ──────────────────────────────────────────────────────────
  let entityStart = 0, inSection = false, sectionName = ''
  for (let i = 0; i < tokens.length; i++) {
    const [code, val] = tokens[i]
    if (code === 0 && val === 'SECTION') { inSection = true; continue }
    if (inSection && code === 2) { sectionName = val; inSection = false; if (val === 'ENTITIES') { entityStart = i + 1; break } }
  }

  // ── Parse entities with full coordinates ──────────────────────────────────
  const inserts = []      // { name, layer, x, y } – every single insert with position
  const polylines = []    // { layer, points[], info, isClosed }
  const lines2 = []       // { layer, x1, y1, x2, y2 }

  let etype = null, elayer = 'DEFAULT'
  let insertName = null, insertX = null, insertY = null
  let pts = [], ptX = null, ptY = null, closed = false
  let lineX1 = null, lineY1 = null

  const flushEntity = () => {
    if (etype === 'INSERT' && insertName !== null && insertX !== null) {
      inserts.push({ name: insertName, layer: elayer, x: insertX, y: insertY ?? 0 })
    }
    if (etype === 'LWPOLYLINE' && pts.length > 1) {
      polylines.push({ layer: elayer, points: [...pts], isClosed: closed, info: parseLayerInfo(elayer) })
    }
  }

  for (let i = entityStart; i < tokens.length; i++) {
    const [code, val] = tokens[i]
    if (code === 0 && val === 'ENDSEC') break
    if (code === 0) {
      flushEntity()
      etype = val; elayer = 'DEFAULT'
      insertName = null; insertX = null; insertY = null
      pts = []; ptX = null; ptY = null; closed = false
      lineX1 = null; lineY1 = null
      continue
    }
    if (code === 8) elayer = val
    if (etype === 'INSERT') {
      if (code === 2) insertName = val
      if (code === 10) insertX = parseFloat(val)
      if (code === 20) insertY = parseFloat(val)
    }
    if (etype === 'LWPOLYLINE') {
      if (code === 70) closed = !!(parseInt(val, 10) & 1)
      if (code === 10) { if (ptX !== null) pts.push([ptX, ptY ?? 0]); ptX = parseFloat(val); ptY = null }
      if (code === 20) ptY = parseFloat(val)
    }
    if (etype === 'LINE') {
      if (code === 10) { lineX1 = parseFloat(val) }
      if (code === 20 && lineX1 !== null) lineY1 = parseFloat(val)
      if (code === 11 && lineX1 !== null) {
        const x2 = parseFloat(val)
        const next = tokens[i + 1]
        const y2 = next && next[0] === 21 ? parseFloat(next[1]) : 0
        lines2.push({ layer: elayer, x1: lineX1, y1: lineY1 ?? 0, x2, y2 })
        lineX1 = null; lineY1 = null
      }
    }
  }
  flushEntity()

  // ── Compute bounds from data if not in header ──────────────────────────────
  if (!extmin || !extmax) {
    const allX = inserts.map(i => i.x)
    const allY = inserts.map(i => i.y)
    polylines.forEach(p => p.points.forEach(([x, y]) => { allX.push(x); allY.push(y) }))
    if (allX.length > 0) {
      extmin = [Math.min(...allX), Math.min(...allY)]
      extmax = [Math.max(...allX), Math.max(...allY)]
    } else {
      extmin = [0, 0]; extmax = [1000, 1000]
    }
  }

  // ── Auto detect unit factor ────────────────────────────────────────────────
  let uf = unitFactor
  if (!uf) {
    const span = Math.max(extmax[0] - extmin[0], extmax[1] - extmin[1])
    if (span > 10000) uf = 0.001       // mm
    else if (span > 100) uf = 0.01     // cm
    else uf = 1.0                       // m
  }

  // ── Classify device types ──────────────────────────────────────────────────
  const deviceTypes = classifyDevices(inserts)

  return {
    scale: { unit: unitName, factor: uf, insunits },
    bounds: { minX: extmin[0], maxX: extmax[0], minY: extmin[1], maxY: extmax[1] },
    inserts,           // raw – all inserts with XY
    devices: deviceTypes.devices,   // classified: { type, name, layer, x, y }
    panels: deviceTypes.panels,     // identified distribution boards
    polylines,         // walls, cable trays, etc.
    lines: lines2,
    stats: {
      total_devices: deviceTypes.devices.length,
      total_panels: deviceTypes.panels.length,
      has_tray_layers: polylines.some(p => p.info?.type === 'tray'),
      has_wall_layers: polylines.some(p => isWallLayer(p.layer)),
    }
  }
}

// ── Device classification rules ────────────────────────────────────────────
const PANEL_KEYWORDS  = ['ELOSZTO', 'ELOSZTÓ', 'PANEL', 'DB', 'MDB', 'SDB', 'MSB', 'TABLO', 'TÁBLA', 'SZEKRÉNY', 'SZEKRENY', 'FOGYASZTASMER', 'FOGYASZTÁSMÉR']
const SOCKET_KEYWORDS = ['DUGALJ', 'DUGO', 'DUGÓ', 'KONNEKTOR', 'SOCKET', 'ALJZAT']
const SWITCH_KEYWORDS = ['KAPCSOLO', 'KAPCSOLÓ', 'SWITCH', 'VILLANYKAPCS']
const LIGHT_KEYWORDS  = ['LAMPA', 'LÁMPA', 'LIGHT', 'LUMINAIRE', 'LED', 'MENNYEZETI', 'DWNLIGHT', 'DOWNLIGHT', 'SPOT', 'EMERGENCY', 'EXIT', 'NEON']
const JUNCTION_KEYWORDS = ['ELOSZTODOZ', 'JUNCTION', 'KÖTODOZ', 'KÖTOBOX']

function classifyDevices(inserts) {
  const devices = []
  const panels = []

  for (const ins of inserts) {
    const nameUp = (ins.name + ' ' + ins.layer).toUpperCase()
    let type = 'unknown'

    if (PANEL_KEYWORDS.some(k => nameUp.includes(k))) {
      type = 'panel'
    } else if (SOCKET_KEYWORDS.some(k => nameUp.includes(k))) {
      type = 'socket'
    } else if (SWITCH_KEYWORDS.some(k => nameUp.includes(k))) {
      type = 'switch'
    } else if (LIGHT_KEYWORDS.some(k => nameUp.includes(k))) {
      type = 'light'
    } else if (JUNCTION_KEYWORDS.some(k => nameUp.includes(k))) {
      type = 'junction'
    }

    const classified = { type, name: ins.name, layer: ins.layer, x: ins.x, y: ins.y }
    if (type === 'panel') panels.push(classified)
    else devices.push(classified)
  }

  return { devices, panels }
}

function parseLayerInfo(layer) {
  const up = layer.toUpperCase()
  const info = {}
  const trayM = up.match(/(\d{2,4})[xX×](\d{2,4})/)
  if (trayM) { info.tray_width = +trayM[1]; info.tray_height = +trayM[2]; info.type = 'tray'; return info }
  if (['TRAY','TALCA','TÁLCA','CABLE_TRAY','CSATORNA','LADDAR'].some(k => up.includes(k))) { info.type = 'tray'; return info }
  if (['NYY','CYKY','YKY','NAYY','NYM','H07V'].some(k => up.includes(k))) { info.type = 'cable'; return info }
  return null
}

function isWallLayer(layer) {
  const up = layer.toUpperCase()
  return ['FAL','WALL','SZERKEZET','STRUCTURE','A-WALL','ARCH'].some(k => up.includes(k))
}

// ── Run cable estimation via n8n Vision agent ──────────────────────────────
export async function runCableAgent({ geometry, screenshotBase64, apiBase = '' }) {
  const res = await fetch(`${apiBase}/api/cable-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      geometry,
      screenshot_base64: screenshotBase64,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Cable agent hiba: ${res.status}`)
  }
  return await res.json()
}

// ── Fallback: pure JS deterministic estimator (no AI needed) ──────────────
// Used when n8n is unavailable or as quick preview before AI result comes back.
export function estimateCablesFallback(geometry) {
  const { devices, panels, polylines, scale, bounds } = geometry
  const uf = scale.factor || 0.001  // to meters

  // Find panel or use centroid
  let panelX, panelY
  if (panels.length > 0) {
    panelX = panels[0].x; panelY = panels[0].y
  } else {
    panelX = (bounds.minX + bounds.maxX) / 2
    panelY = (bounds.minY + bounds.maxY) / 2
  }

  // Check if we have tray geometry
  const hasTray = polylines.some(p => p.info?.type === 'tray')
  const hasWalls = polylines.some(p => isWallLayer(p.layer))
  const scaleFactor = hasTray ? 1.1 : (hasWalls ? 1.25 : 1.35)

  let confidence = hasTray ? 0.82 : (hasWalls ? 0.65 : 0.48)
  if (!panels.length) confidence -= 0.15

  const method = hasTray ? 'Kábeltálca mentén (Szint A)' :
                 hasWalls ? 'Fal mentén Manhattan (Szint B)' :
                            'Euclidean + ráhagyás (Szint C)'

  // Group devices by type
  const sockets  = devices.filter(d => d.type === 'socket')
  const lights   = devices.filter(d => d.type === 'light')
  const switches = devices.filter(d => d.type === 'switch')
  const others   = devices.filter(d => !['socket','light','switch'].includes(d.type))

  // Manhattan distance from panel to each device (raw units → meters)
  const manhattan = (d) => (Math.abs(d.x - panelX) + Math.abs(d.y - panelY)) * uf

  const socketM  = sockets.reduce((s, d) => s + manhattan(d), 0) * scaleFactor
  const lightM   = lights.reduce((s, d) => s + manhattan(d), 0) * scaleFactor
  const switchM  = switches.reduce((s, d) => s + manhattan(d), 0) * scaleFactor * 0.3  // switches short branch
  const otherM   = others.reduce((s, d) => s + manhattan(d), 0) * scaleFactor

  const total = socketM + lightM + switchM + otherM

  // Simple circuit clustering: group by proximity, max 10/circuit
  const circuits = clusterIntoCircuits(sockets, 'socket', panelX, panelY, uf, scaleFactor)
    .concat(clusterIntoCircuits(lights, 'light', panelX, panelY, uf, scaleFactor))

  return {
    success: true,
    _source: 'fallback_js',
    cable_total_m: Math.round(total),
    cable_by_type: {
      socket_m: Math.round(socketM),
      light_m:  Math.round(lightM),
      switch_m: Math.round(switchM),
      other_m:  Math.round(otherM),
    },
    circuits,
    confidence: Math.max(0.1, Math.round(confidence * 100) / 100),
    method,
    warnings: [
      ...(!panels.length ? ['Elosztó nem azonosítható – centroid becslés'] : []),
      ...(!hasTray ? ['Kábeltálca layer nem található – Manhattan becslés'] : []),
      ...(scale.factor === null ? ['Nincs skálaadat – arányos becslés'] : []),
    ],
    panels_found: panels.map(p => ({ name: p.name, layer: p.layer })),
  }
}

function clusterIntoCircuits(devices, type, panelX, panelY, uf, scaleFactor, maxPerCircuit = 10) {
  if (!devices.length) return []
  const circuits = []
  let remaining = [...devices]
  let circuitNum = 1

  while (remaining.length > 0) {
    // Take up to maxPerCircuit closest devices
    remaining.sort((a, b) => {
      const da = Math.abs(a.x - panelX) + Math.abs(a.y - panelY)
      const db = Math.abs(b.x - panelX) + Math.abs(b.y - panelY)
      return da - db
    })
    const batch = remaining.splice(0, maxPerCircuit)
    const length_m = batch.reduce((s, d) =>
      s + (Math.abs(d.x - panelX) + Math.abs(d.y - panelY)) * uf * scaleFactor, 0)

    circuits.push({
      id: `${type}_${circuitNum++}`,
      type,
      device_count: batch.length,
      estimated_length_m: Math.round(length_m),
      confidence: 0.45,
    })
  }
  return circuits
}
