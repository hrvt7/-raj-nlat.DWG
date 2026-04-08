// ─── Block recognition rules & DXF cable detection ───────────────────────────
// Extracted from TakeoffWorkspace.jsx for testability and reuse.

export const BLOCK_ASM_RULES = [
  { patterns: ['LIGHT','LAMP','VILÁG','VILAG','LÁMPA','LAMPA','LED','SPOT','DOWNLIGHT','CEILING','MENNYEZET'], asmId: 'ASM-003', label: 'Lámpatest' },
  { patterns: ['SWITCH','KAPCS','KAPCSOL','DIMMER','TOGGLE','NYOMÓ','NYOMO'], asmId: 'ASM-002', label: 'Kapcsoló' },
  { patterns: ['SOCKET','DUGALJ','ALJZAT','OUTLET','PLUG','CSATLAKOZ','RECEPT','ERŐÁTVITELI','EROATVITELI'], asmId: 'ASM-001', label: 'Dugalj' },
  { patterns: ['PANEL','DB_PANEL','ELOSZTO','ELOSZTÓ','MDB','SZEKRÉNY','SZEKRENY','DISTRIBUTION','BOARD','TABLOU'], asmId: 'ASM-018', label: 'Elosztó' },
  { patterns: ['SMOKE','FÜST','FUST','DETECTOR','ÉRZÉKEL','ERZEKEL','ALARM'], asmId: null, label: 'Érzékelő' },
]

export const ASM_COLORS = {
  'ASM-001': '#4CC9F0',   // socket → blue
  'ASM-002': '#FFD166',   // switch → yellow
  'ASM-003': '#00E5A0',   // lamp → green
  'ASM-018': '#FF6B6B',   // panel → red
  null: '#9CA3AF',         // unknown → gray
}

/**
 * Two-phase block name recognizer.
 * Phase 1: exact match (confidence 1.0)
 * Phase 2: partial match (confidence 0.60–0.95, based on specificity)
 * Returns: { asmId, confidence, matchType, rule }
 */
export function recognizeBlock(blockName) {
  const up = (blockName || '').toUpperCase().replace(/[_\-\.]/g, ' ')

  // Phase 1: exact match — return immediately (perfect confidence)
  for (const rule of BLOCK_ASM_RULES) {
    for (const pattern of rule.patterns) {
      if (up === pattern) return { asmId: rule.asmId, confidence: 1.0, matchType: 'exact', rule }
    }
  }

  // Phase 2: partial match — collect ALL matches, return the BEST one
  let bestMatch = null
  for (const rule of BLOCK_ASM_RULES) {
    for (const pattern of rule.patterns) {
      if (up.includes(pattern)) {
        const normalizedLen = up.replace(/ /g, '').length
        const specificity = Math.min(pattern.length / Math.max(normalizedLen, 1), 1)
        const confidence = 0.60 + specificity * 0.35
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { asmId: rule.asmId, confidence, matchType: 'partial', rule }
        }
      }
    }
  }
  if (bestMatch) return bestMatch

  return { asmId: null, confidence: 0, matchType: 'unknown', rule: null }
}

// ─── DXF block junk filter ────────────────────────────────────────────────────
// Filters out CAD-internal / technical / annotation blocks that are never
// real electrical components. Conservative list — when in doubt, keep the block.

const JUNK_BLOCK_PREFIXES = [
  '*',            // *MODEL_SPACE, *PAPER_SPACE, *D, *U, *T, etc.
  '_',            // _ARCHTICK, _DOT, _OPEN, _CLOSED, _OBLIQUE
  'ACAD_',        // AutoCAD internal blocks
  'A$C',          // AutoCAD anonymous blocks (A$C0, A$C1, ...)
  'ASC_',         // AutoCAD system components
]

const JUNK_BLOCK_EXACT = new Set([
  'SOLID', 'HATCH', 'DIMENSION', 'MTEXT', 'TEXT', 'ATTDEF', 'ATTRIB',
  'POINT', 'LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE', 'POLYLINE',
  'LWPOLYLINE', 'TRACE', 'VIEWPORT', 'IMAGE', 'WIPEOUT', 'XLINE', 'RAY',
  'OLE2FRAME', 'OLEFRAME', 'TOLERANCE', 'LEADER', 'MLEADER', 'MULTILEADER',
  'TABLE', 'SHAPE', 'REGION', 'BODY', '3DSOLID', '3DFACE', 'MESH',
])

/**
 * Check if a DXF block name is a known CAD junk / technical block.
 * Returns true if the block should be EXCLUDED from recognition.
 *
 * @param {string} blockName
 * @returns {boolean}
 */
export function isJunkBlock(blockName) {
  if (!blockName) return true
  const up = blockName.toUpperCase().trim()
  if (up.length <= 1) return true // single char blocks are always internal
  // Prefix check
  for (const prefix of JUNK_BLOCK_PREFIXES) {
    if (up.startsWith(prefix.toUpperCase())) return true
  }
  // Exact match
  if (JUNK_BLOCK_EXACT.has(up)) return true
  return false
}

// ─── DXF cable-layer detection ────────────────────────────────────────────────
export const CABLE_GENERIC_KW = ['KABEL','CABLE','NYM','NYY','CYKY','WIRE','VEZETEK','VILLAMOS','ARAM']
export const CABLE_TYPE_KW = {
  light:  ['VILAG','LIGHT','3X1','1X1','LAMPA','VIL_KAB','LAMP','VILAGIT'],
  socket: ['DUGALJ','SOCKET','3X2','1X2','DUG_KAB','KONNEKTOR','OUTLET'],
  switch: ['KAPCS','SWITCH','KAPCSOL','KAP_KAB'],
  data:   ['CAT6','CAT5','UTP','FTP','KOAX','COAX','RJ45','ADAT','DATA','PATCH','GYENGE','LAN','WIFI'],
  fire:   ['TUZ','FIRE','JE-H','JELSTH','TUZVEDELM','TUZJELZO','SMOKE','DETECTOR','ALARM','E30','FE180'],
  other:  ['NYY','5X','FOGYASZT','PANEL_KAB'],
}

/**
 * Detect cable lengths from DXF layer geometry.
 * Returns structured cable estimate or null if no cable layers found.
 */
export function detectDxfCableLengths(parsedDxf) {
  if (!parsedDxf?.lengths?.length) return null
  let total = 0
  const byType = { light: 0, socket: 0, switch: 0, data: 0, fire: 0, other: 0 }
  let layerCount = 0
  for (const l of parsedDxf.lengths) {
    if (!l.length || l.length <= 0) continue
    const up = (l.layer || '').toUpperCase()
    if (!CABLE_GENERIC_KW.some(k => up.includes(k))) continue
    layerCount++
    total += l.length
    if      (CABLE_TYPE_KW.light.some(k  => up.includes(k))) byType.light  += l.length
    else if (CABLE_TYPE_KW.socket.some(k => up.includes(k))) byType.socket += l.length
    else if (CABLE_TYPE_KW.switch.some(k => up.includes(k))) byType.switch += l.length
    else if (CABLE_TYPE_KW.data.some(k   => up.includes(k))) byType.data   += l.length
    else if (CABLE_TYPE_KW.fire.some(k   => up.includes(k))) byType.fire   += l.length
    else if (CABLE_TYPE_KW.other.some(k  => up.includes(k))) byType.other  += l.length
    else byType.socket += l.length  // ismeretlen → dugalj (leggyakoribb)
  }
  if (!layerCount || total <= 0) return null
  const r = v => Math.round(v * 10) / 10
  return {
    cable_total_m: r(total),
    cable_total_m_p50: r(total),
    cable_total_m_p90: null,
    cable_by_type: { light_m: r(byType.light), socket_m: r(byType.socket), switch_m: r(byType.switch), data_m: r(byType.data), fire_m: r(byType.fire), other_m: r(byType.other) },
    method: `Mért kábelvonalak (${layerCount} réteg, ${Math.round(total)} m)`,
    confidence: 0.92,
    _source: 'dxf_layers',
  }
}
