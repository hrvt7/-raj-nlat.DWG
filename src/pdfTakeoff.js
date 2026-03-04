// ─── PDF Takeoff Pipeline ─────────────────────────────────────────────────────
// Converts PDF floor plans → recognizedItems + MST-based cable estimate.
// Pipeline: PDF → server API (Vision/vector) → symbol positions → room clustering
//   → MST cable routing → assembly mapping → recognizedItems format
//
// This replaces the old "no-op" PDF path and the per-device cable multipliers.
// ──────────────────────────────────────────────────────────────────────────────

// ── Symbol → Assembly mapping ─────────────────────────────────────────────────
// Maps PDF-detected symbol types to assembly IDs (same BLOCK_ASM_RULES as DXF)
const PDF_SYMBOL_ASM_MAP = {
  // Vision API types (from parse-pdf.py SYMBOL_KEYWORDS)
  dugalj:        { asmId: 'ASM-001', icon: '🔌', label: 'Dugalj',     cableType: 'power' },
  kapcsolo:      { asmId: 'ASM-002', icon: '🔘', label: 'Kapcsoló',   cableType: 'power' },
  lampa:         { asmId: 'ASM-003', icon: '💡', label: 'Lámpatest',  cableType: 'power' },
  panel:         { asmId: 'ASM-018', icon: '⚡', label: 'Elosztó',    cableType: 'panel' },
  fi_rele:       { asmId: null,      icon: '🔧', label: 'FI relé',    cableType: 'power' },
  kismegszakito: { asmId: null,      icon: '🔧', label: 'Kismegszakító', cableType: 'power' },

  // Fire alarm types
  smoke_detector:{ asmId: null,      icon: '🔔', label: 'Füstérzékelő', cableType: 'fire_alarm' },
  heat_detector: { asmId: null,      icon: '🌡️', label: 'Hőérzékelő',  cableType: 'fire_alarm' },
  siren:         { asmId: null,      icon: '📢', label: 'Sziréna',      cableType: 'fire_alarm' },

  // Low-voltage types
  data_socket:   { asmId: null,      icon: '🌐', label: 'Adat aljzat',  cableType: 'data' },
  camera:        { asmId: null,      icon: '📷', label: 'Kamera',       cableType: 'cctv' },
  access_reader: { asmId: null,      icon: '🔑', label: 'Beléptető',    cableType: 'access' },
  mcp:           { asmId: null,      icon: '🔥', label: 'Kézi jelzésadó', cableType: 'fire_alarm' },

  // Fallback / generic
  egyeb:         { asmId: null,      icon: '❓', label: 'Egyéb',        cableType: 'power' },
}

// Text-based type guessing for Vision AI results that may use Hungarian names
const TYPE_GUESS_PATTERNS = [
  { patterns: ['dugalj', 'konnektor', 'socket', 'aljzat', '2p+f', 'schuko'], type: 'dugalj' },
  { patterns: ['kapcsoló', 'kapcsolo', 'switch', 'dimmer', 'nyomó'], type: 'kapcsolo' },
  { patterns: ['lámpa', 'lampa', 'light', 'led', 'spot', 'downlight', 'mennyezet', 'fényforrás'], type: 'lampa' },
  { patterns: ['elosztó', 'eloszto', 'panel', 'szekrény', 'tábla', 'db_panel', 'mdb'], type: 'panel' },
  { patterns: ['füst', 'fust', 'smoke', 'detektor', 'érzékelő', 'erzekel'], type: 'smoke_detector' },
  { patterns: ['hő', 'heat', 'thermal'], type: 'heat_detector' },
  { patterns: ['sziréna', 'szirena', 'siren', 'horn'], type: 'siren' },
  { patterns: ['adat', 'data', 'rj45', 'cat5', 'cat6', 'utp'], type: 'data_socket' },
  { patterns: ['kamera', 'camera', 'cctv', 'ip cam'], type: 'camera' },
  { patterns: ['beléptető', 'belepteto', 'access', 'rfid', 'card reader'], type: 'access_reader' },
  { patterns: ['kézi jelzésadó', 'kezi jelzesado', 'mcp', 'manual call'], type: 'mcp' },
]

function guessSymbolType(name, declaredType) {
  // If the API already classified it well, keep it
  if (declaredType && PDF_SYMBOL_ASM_MAP[declaredType]) return declaredType
  // Try matching name against patterns
  const lower = (name || '').toLowerCase()
  for (const { patterns, type } of TYPE_GUESS_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return type
  }
  return declaredType || 'egyeb'
}


// ── Cable topology definitions ────────────────────────────────────────────────
// Different systems use different cable routing topologies
const CABLE_TOPOLOGIES = {
  power:      'star',       // star from panel — each device gets its own home-run
  fire_alarm: 'loop',       // loop topology — daisy-chain, return to panel
  data:       'star',       // star from patch panel
  cctv:       'star',       // star from NVR
  access:     'star',       // star from controller
  panel:      null,         // panels don't get cables to themselves
}

// Cable types per system
const CABLE_SPECS = {
  power:      { name: 'NYM-J 3×2.5', unitWeight: 0.12 },  // kg/m placeholder
  fire_alarm: { name: 'JE-H(St)H 2×2×0.8', unitWeight: 0.06 },
  data:       { name: 'Cat6 U/UTP', unitWeight: 0.04 },
  cctv:       { name: 'Cat6 U/UTP + tápkábel', unitWeight: 0.06 },
  access:     { name: 'JE-H(St)H 2×2×0.8', unitWeight: 0.05 },
}

// Routing factor: real cables follow walls, go through ceilings, rise/fall vertically.
// Manhattan distance × routing factor ≈ actual cable length
const ROUTING_FACTOR = 1.25  // 25% overhead for wall routing + vertical drops


// ══════════════════════════════════════════════════════════════════════════════
// MST-based cable estimation
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Manhattan distance (L1) — cables follow walls, not diagonals
 */
function manhattanDist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/**
 * Prim's MST algorithm for a set of points.
 * Returns total MST edge weight (Manhattan distance).
 */
function primMST(points) {
  if (points.length <= 1) return 0
  const n = points.length
  const inMST = new Array(n).fill(false)
  const minEdge = new Array(n).fill(Infinity)
  minEdge[0] = 0
  let totalWeight = 0

  for (let iter = 0; iter < n; iter++) {
    // Find cheapest vertex not yet in MST
    let u = -1
    for (let i = 0; i < n; i++) {
      if (!inMST[i] && (u === -1 || minEdge[i] < minEdge[u])) u = i
    }
    if (u === -1 || minEdge[u] === Infinity) break
    inMST[u] = true
    totalWeight += minEdge[u]

    // Update neighbor edges
    for (let v = 0; v < n; v++) {
      if (!inMST[v]) {
        const d = manhattanDist(points[u], points[v])
        if (d < minEdge[v]) minEdge[v] = d
      }
    }
  }
  return totalWeight
}

/**
 * Loop topology: find shortest Hamiltonian-like path that returns to start.
 * For fire alarm loops. Uses nearest-neighbor heuristic + return to start.
 */
function loopEstimate(panelPos, devices) {
  if (!devices.length) return 0
  const all = [panelPos, ...devices]
  const n = all.length
  const visited = new Array(n).fill(false)
  visited[0] = true
  let current = 0
  let totalDist = 0

  for (let step = 1; step < n; step++) {
    let nearest = -1, nearestDist = Infinity
    for (let j = 0; j < n; j++) {
      if (!visited[j]) {
        const d = manhattanDist(all[current], all[j])
        if (d < nearestDist) { nearest = j; nearestDist = d }
      }
    }
    if (nearest === -1) break
    visited[nearest] = true
    totalDist += nearestDist
    current = nearest
  }
  // Return to panel to close the loop
  totalDist += manhattanDist(all[current], all[0])
  return totalDist
}

/**
 * Star topology: each device gets a home-run cable back to the panel.
 * Total = sum of Manhattan distances from panel to each device.
 * For large rooms, we apply MST optimization (shared trunk + individual drops).
 */
function starEstimate(panelPos, devices) {
  if (!devices.length) return 0

  // For small counts, pure star (each device → panel)
  if (devices.length <= 6) {
    return devices.reduce((sum, d) => sum + manhattanDist(panelPos, d), 0)
  }

  // For larger counts, use MST + panel connection as a better estimate
  // The MST gives us the shared trunk; we add the panel→nearest-device link
  const allPoints = [panelPos, ...devices]
  const mstLen = primMST(allPoints)
  // Star is typically 30-50% more cable than MST for realistic layouts
  // But MST underestimates because real star topologies can't share trunks
  // Compromise: average of pure-star and MST×1.3
  const pureStar = devices.reduce((sum, d) => sum + manhattanDist(panelPos, d), 0)
  return (pureStar + mstLen * 1.3) / 2
}


// ══════════════════════════════════════════════════════════════════════════════
// Room / Zone clustering (simple grid-based)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Simple grid-based room clustering.
 * Groups nearby devices into rooms/zones based on spatial proximity.
 * Returns array of { devices: [...], centroid: {x, y} }
 */
function clusterDevicesIntoRooms(devices, cellSizeM = 5) {
  if (!devices.length) return []

  // Grid-based clustering: devices in the same grid cell are in the same room
  const cellMap = {}
  for (const d of devices) {
    const cx = Math.floor(d.x / cellSizeM)
    const cy = Math.floor(d.y / cellSizeM)
    const key = `${cx},${cy}`
    if (!cellMap[key]) cellMap[key] = []
    cellMap[key].push(d)
  }

  // Merge adjacent cells into rooms (union-find simplified)
  const cells = Object.entries(cellMap)
  const parent = {}
  for (const [key] of cells) parent[key] = key

  function find(k) {
    while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k] }
    return k
  }
  function union(a, b) {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Union adjacent cells
  for (const [key] of cells) {
    const [cx, cy] = key.split(',').map(Number)
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
      const neighbor = `${cx+dx},${cy+dy}`
      if (cellMap[neighbor]) union(key, neighbor)
    }
  }

  // Group by root
  const rooms = {}
  for (const [key, devs] of cells) {
    const root = find(key)
    if (!rooms[root]) rooms[root] = []
    rooms[root].push(...devs)
  }

  return Object.values(rooms).map(devs => {
    const cx = devs.reduce((s, d) => s + d.x, 0) / devs.length
    const cy = devs.reduce((s, d) => s + d.y, 0) / devs.length
    return { devices: devs, centroid: { x: cx, y: cy } }
  })
}


// ══════════════════════════════════════════════════════════════════════════════
// Main pipeline: PDF API result → recognizedItems + cable estimate
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Call the server-side PDF parser (Vision AI + vector analysis).
 * Returns the raw server response.
 */
export async function callPdfApi(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      resolve(dataUrl.split(',')[1])  // strip data:...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const apiUrl = import.meta.env.VITE_API_URL || ''

  // Call both endpoints in parallel: Vision AI + Vector analysis
  const [visionRes, vectorRes] = await Promise.allSettled([
    fetch(`${apiUrl}/api/parse-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_base64: base64, filename: file.name }),
    }).then(r => r.json()),
    fetch(`${apiUrl}/api/parse-pdf-vectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_base64: base64, filename: file.name }),
    }).then(r => r.json()),
  ])

  const vision = visionRes.status === 'fulfilled' ? visionRes.value : null
  const vector = vectorRes.status === 'fulfilled' ? vectorRes.value : null

  return { vision, vector }
}

/**
 * Merge Vision AI and Vector analysis results into a unified symbol list.
 * Vision AI provides named items with quantities.
 * Vector analysis provides positioned symbols with coordinates.
 *
 * Returns: {
 *   items: [{ name, type, qty, positions: [{x,y}], confidence }],
 *   scaleFactor: number (meters per coordinate unit),
 *   scaleInfo: { ... },
 *   lengths: [...],
 *   warnings: [...],
 * }
 */
export function mergeAndNormalize(vision, vector) {
  const items = []
  const warnings = []
  let scaleFactor = null
  let scaleInfo = null

  // ── Extract scale from vector result ────────────────────────────────────
  if (vector?.success && vector._scale) {
    scaleInfo = vector._scale
    scaleFactor = vector._scale.m_per_pt || null
  }

  // ── Process Vision AI items (primary source for counts) ────────────────
  if (vision?.success && vision._vision_items) {
    for (const vi of vision._vision_items) {
      const type = guessSymbolType(vi.name, vi.type)
      const mapping = PDF_SYMBOL_ASM_MAP[type] || PDF_SYMBOL_ASM_MAP.egyeb
      const qty = Math.round(Number(vi.quantity) || 0)
      if (qty <= 0) continue

      items.push({
        name: vi.name || mapping.label,
        type,
        qty,
        asmId: mapping.asmId,
        icon: mapping.icon,
        label: mapping.label,
        cableType: mapping.cableType,
        confidence: (vision._vision_confidence || 0.5) * 0.9,
        matchType: 'pdf_vision',
        positions: [],  // Vision API doesn't give coordinates
      })
    }
  }

  // ── Process vector analysis symbols (for positions) ───────────────────
  // Vector analysis gives us RED symbol clusters with positions
  if (vector?.success && vector._symbol_count > 0) {
    // If vision didn't provide items, use vector counts
    if (!items.length) {
      // Vector gives generic "small/medium/large" categories
      for (const block of (vector.blocks || [])) {
        const isSmall = block.layer?.includes('SMALL')
        const isMedium = block.layer?.includes('MEDIUM')
        const type = isSmall ? 'dugalj' : isMedium ? 'lampa' : 'panel'
        const mapping = PDF_SYMBOL_ASM_MAP[type]
        items.push({
          name: block.name,
          type,
          qty: block.count,
          asmId: mapping.asmId,
          icon: mapping.icon,
          label: mapping.label,
          cableType: mapping.cableType,
          confidence: (vector._confidence || 0.5) * 0.7,
          matchType: 'pdf_vector',
          positions: [],
        })
      }
    }
  }

  // ── Process text fallback if nothing else worked ──────────────────────
  if (!items.length && vision?.success && vision.blocks?.length) {
    for (const block of vision.blocks) {
      const type = guessSymbolType(block.name, null)
      const mapping = PDF_SYMBOL_ASM_MAP[type] || PDF_SYMBOL_ASM_MAP.egyeb
      items.push({
        name: block.name,
        type,
        qty: block.count,
        asmId: mapping.asmId,
        icon: mapping.icon,
        label: mapping.label,
        cableType: mapping.cableType,
        confidence: 0.35,
        matchType: 'pdf_text',
        positions: [],
      })
    }
  }

  // ── Collect cable lengths from vector analysis ─────────────────────────
  const lengths = []
  if (vector?.success) {
    for (const l of (vector.lengths || [])) {
      if (l.length > 0) lengths.push(l)
    }
  }
  if (vision?.success) {
    for (const l of (vision.lengths || [])) {
      if (l.length > 0 && l.layer !== 'PDF') lengths.push(l)
    }
  }

  // ── Warnings ──────────────────────────────────────────────────────────
  if (vision?.warnings) warnings.push(...vision.warnings)
  if (vector?.warnings) warnings.push(...vector.warnings)
  if (!items.length) {
    warnings.push('Nem sikerült szimbólumokat azonosítani a PDF-ben. Próbáld DXF formátumban exportálni, vagy használd a kézi számlálás eszközt a PDF nézetben.')
  }

  return { items, scaleFactor, scaleInfo, lengths, warnings }
}


/**
 * Convert merged PDF items → recognizedItems format (compatible with DXF pipeline).
 * Each unique (type, name) becomes one recognizedItem entry.
 */
export function toRecognizedItems(items) {
  return items.map(item => ({
    blockName: `PDF_${item.type}_${item.name}`.replace(/\s+/g, '_').substring(0, 80),
    qty: item.qty,
    asmId: item.asmId,
    confidence: item.confidence,
    matchType: item.matchType,
    rule: item.asmId ? {
      asmId: item.asmId,
      icon: item.icon,
      label: item.label,
    } : null,
    // Extra PDF metadata (not used by DXF pipeline, but useful for UI)
    _pdfType: item.type,
    _pdfName: item.name,
    _pdfCableType: item.cableType,
    _pdfPositions: item.positions,
  }))
}


/**
 * Build cable estimate from PDF symbol positions + topology.
 * Uses MST for power, loop for fire alarm, star for data/CCTV.
 *
 * If no positions available (Vision AI only), falls back to per-device multipliers.
 *
 * @param {Array} items - merged items with positions and cableType
 * @param {number|null} scaleFactor - meters per coordinate unit (null = use fallback)
 * @returns Cable estimate object compatible with TakeoffWorkspace
 */
export function estimateCablesMST(items, scaleFactor) {
  // Group devices by cable type (system)
  const bySystem = {}
  for (const item of items) {
    const sys = item.cableType || 'power'
    if (sys === 'panel') continue  // panels are sources, not destinations
    if (!bySystem[sys]) bySystem[sys] = []
    // Add each device (qty times) to the system group
    if (item.positions?.length) {
      for (const pos of item.positions) {
        for (let i = 0; i < Math.ceil(item.qty / Math.max(item.positions.length, 1)); i++) {
          bySystem[sys].push({ x: pos.x, y: pos.y, name: item.name, type: item.type })
        }
      }
    } else {
      // No positions — add dummy entries (will use fallback below)
      for (let i = 0; i < item.qty; i++) {
        bySystem[sys].push({ x: null, y: null, name: item.name, type: item.type })
      }
    }
  }

  // Find panel position (if any)
  const panelItem = items.find(i => i.type === 'panel')
  const panelPos = panelItem?.positions?.[0] || null

  let totalCableM = 0
  const cableBySystem = {}
  const hasPositions = items.some(i => i.positions?.length > 0) && scaleFactor

  for (const [sys, devices] of Object.entries(bySystem)) {
    const topology = CABLE_TOPOLOGIES[sys] || 'star'
    const spec = CABLE_SPECS[sys] || CABLE_SPECS.power
    let rawDist = 0

    if (hasPositions && devices[0]?.x !== null && panelPos) {
      // Position-based estimation (MST / loop)
      const posDevices = devices.filter(d => d.x !== null)
      if (topology === 'loop') {
        rawDist = loopEstimate(panelPos, posDevices) * scaleFactor
      } else {
        rawDist = starEstimate(panelPos, posDevices) * scaleFactor
      }
      rawDist *= ROUTING_FACTOR
    } else {
      // Fallback: per-device multipliers (when no coordinates)
      const FALLBACK_M = {
        power: 7, fire_alarm: 5, data: 12, cctv: 15, access: 10,
      }
      rawDist = devices.length * (FALLBACK_M[sys] || 7)
    }

    cableBySystem[sys] = {
      cable_type: spec.name,
      device_count: devices.length,
      length_m: Math.round(rawDist * 10) / 10,
      topology,
    }
    totalCableM += rawDist
  }

  return {
    cable_total_m: Math.round(totalCableM * 10) / 10,
    cable_by_system: cableBySystem,
    method: hasPositions
      ? 'MST/topológia alapú becslés (pozíciók + lépték alapján)'
      : 'Automatikus becslés (eszközszám × átlag hossz)',
    confidence: hasPositions ? 0.75 : 0.55,
    _source: 'pdf_takeoff',
  }
}


/**
 * Build a synthetic parsedDxf-compatible structure from PDF results.
 * This lets the rest of TakeoffWorkspace (pricing, export) work unchanged.
 */
export function buildParsedDxfFromPdf(merged, cableEst) {
  const { items, scaleFactor, scaleInfo, lengths, warnings } = merged

  const blocks = items.map(item => ({
    name: `PDF_${item.type}_${item.name}`.replace(/\s+/g, '_').substring(0, 80),
    layer: `PDF_${(item.type || 'UNKNOWN').toUpperCase()}`,
    count: item.qty,
  }))

  // Use server-reported lengths if available, otherwise synthesize from cable estimate
  const finalLengths = lengths.length > 0 ? lengths : [{
    layer: 'PDF_CABLE',
    length: cableEst?.cable_total_m || 0,
    length_raw: cableEst?.cable_total_m || 0,
    info: { name: 'Becsült kábelhossz', type: 'kabel' },
  }]

  return {
    success: true,
    blocks,
    lengths: finalLengths,
    layers: [...new Set(blocks.map(b => b.layer))].sort(),
    units: {
      insunits: 0,
      name: scaleInfo ? `PDF (1:${scaleInfo.scale})` : 'PDF',
      factor: scaleFactor || null,
      auto_detected: true,
    },
    title_block: {},
    inserts: [],      // PDF doesn't produce DXF-style inserts
    lineGeom: [],
    polylineGeom: [],
    geomBounds: null,
    summary: {
      total_block_types: new Set(blocks.map(b => b.name)).size,
      total_blocks: blocks.reduce((s, b) => s + b.count, 0),
      total_layers: new Set(blocks.map(b => b.layer)).size,
      layers_with_lines: finalLengths.filter(l => l.length > 0).length,
      total_inserts: 0,
    },
    _source: 'pdf_takeoff',
    _pdfMeta: {
      visionConfidence: merged.items[0]?.confidence || 0,
      scaleInfo,
      warnings,
      itemCount: items.length,
    },
  }
}


/**
 * Full PDF takeoff pipeline — entry point called from TakeoffWorkspace.
 *
 * @param {File} file - PDF file
 * @param {Function} onProgress - progress callback (0-100)
 * @returns {{ parsedDxf, recognizedItems, cableEstimate, warnings }}
 */
export async function runPdfTakeoff(file, onProgress) {
  onProgress?.(10)

  // Step 1: Call server APIs
  const { vision, vector } = await callPdfApi(file)
  onProgress?.(50)

  // Step 2: Merge and normalize results
  const merged = mergeAndNormalize(vision, vector)
  onProgress?.(70)

  // Step 3: Convert to recognizedItems
  const recognizedItems = toRecognizedItems(merged.items)
  onProgress?.(80)

  // Step 4: Estimate cables (MST-based)
  const cableEstimate = estimateCablesMST(merged.items, merged.scaleFactor)
  onProgress?.(90)

  // Step 5: Build parsedDxf-compatible structure
  const parsedDxf = buildParsedDxfFromPdf(merged, cableEstimate)
  onProgress?.(100)

  return {
    parsedDxf,
    recognizedItems,
    cableEstimate,
    warnings: merged.warnings,
  }
}
