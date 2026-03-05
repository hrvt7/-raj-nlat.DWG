// ─── Symbol Dictionary — Block Name Normalization ──────────────────────────
// Maps raw DXF block names → standardized assembly types
// Pipeline: user overrides → regex match → fuzzy match → unknown
//
// assemblyType values align with TakeoffPro assembly categories

const LS_KEY = 'takeoffpro_symbol_overrides'

// ── Default rules (regex-based, ordered by specificity) ────────────────────
// Each rule: { pattern: RegExp, assemblyType: string, label: string }

export const ASSEMBLY_TYPES = [
  { key: 'CEILING_LIGHT',    label: 'Mennyezeti lámpa' },
  { key: 'WALL_LIGHT',       label: 'Fali lámpatest' },
  { key: 'EMERGENCY_LIGHT',  label: 'Vészvilágítás' },
  { key: 'LED_PANEL',        label: 'LED panel' },
  { key: 'DOWNLIGHT',        label: 'Süllyesztett lámpa' },
  { key: 'SOCKET',           label: 'Dugalj' },
  { key: 'SOCKET_DOUBLE',    label: 'Dupla dugalj' },
  { key: 'SOCKET_FLOOR',     label: 'Padló dugalj' },
  { key: 'SOCKET_IP44',      label: 'IP44 dugalj' },
  { key: 'SWITCH',           label: 'Kapcsoló' },
  { key: 'SWITCH_DIMMER',    label: 'Dimmer' },
  { key: 'SWITCH_DOUBLE',    label: 'Csillárkapcsoló' },
  { key: 'SWITCH_ALTER',     label: 'Váltókapcsoló' },
  { key: 'CABLE_TRAY',       label: 'Kábeltálca' },
  { key: 'JUNCTION_BOX',     label: 'Kötődoboz' },
  { key: 'CIRCUIT_BREAKER',  label: 'Kismegszakító' },
  { key: 'RCD',              label: 'FI-relé' },
  { key: 'DISTRIBUTION',     label: 'Elosztó' },
  { key: 'SMOKE_DETECTOR',   label: 'Füstérzékelő' },
  { key: 'HEAT_DETECTOR',    label: 'Hőérzékelő' },
  { key: 'MANUAL_CALL',      label: 'Kézi jelzésadó' },
  { key: 'SOUNDER',          label: 'Hang-fényjelző' },
  { key: 'DATA_OUTLET',      label: 'Adataljzat' },
  { key: 'TV_OUTLET',        label: 'TV aljzat' },
  { key: 'CAMERA',           label: 'Kamera' },
  { key: 'MOTION_SENSOR',    label: 'Mozgásérzékelő' },
  { key: 'THERMOSTAT',       label: 'Termosztát' },
  { key: 'DOORBELL',         label: 'Csengő' },
  { key: 'CEE_OUTLET',       label: 'CEE dugalj' },
]

const DEFAULT_RULES = [
  // ── Világítás ──
  { pattern: /^E-WL/i,                assemblyType: 'CEILING_LIGHT' },
  { pattern: /^VIL/i,                 assemblyType: 'CEILING_LIGHT' },
  { pattern: /EMERG|VESZ|NOTBELEUCHT/i, assemblyType: 'EMERGENCY_LIGHT' },
  { pattern: /LED.?PANEL/i,           assemblyType: 'LED_PANEL' },
  { pattern: /DOWNLIGHT|DL-/i,        assemblyType: 'DOWNLIGHT' },
  { pattern: /WALL.?L|FALI.?L/i,      assemblyType: 'WALL_LIGHT' },
  { pattern: /LIGHT|LAMP|LEUCHTE|LÁMPA|LAMPA|VILÁGÍT/i, assemblyType: 'CEILING_LIGHT' },

  // ── Dugaljak (specifikusabb előbb) ──
  { pattern: /SOCKET.?FLOOR|PADLO.?DUG|FLOOR.?SO/i, assemblyType: 'SOCKET_FLOOR' },
  { pattern: /SOCKET.?DOUBLE|DUPLA.?DUG|2X.*DUG|DUG.*2X/i, assemblyType: 'SOCKET_DOUBLE' },
  { pattern: /IP44|BRYZGO/i,          assemblyType: 'SOCKET_IP44' },
  { pattern: /CEE|IPARI.?DUG/i,       assemblyType: 'CEE_OUTLET' },
  { pattern: /^E-SO/i,                assemblyType: 'SOCKET' },
  { pattern: /SOCKET|DUGAL|DUG|STECKDOSE|KONNEKTOR/i, assemblyType: 'SOCKET' },

  // ── Kapcsolók ──
  { pattern: /DIMMER|FÉNYERŐ/i,       assemblyType: 'SWITCH_DIMMER' },
  { pattern: /VALTO|WECHSEL|ALTER/i,   assemblyType: 'SWITCH_ALTER' },
  { pattern: /SWITCH.?2|CSILLAR|DOUBLE.?SW/i, assemblyType: 'SWITCH_DOUBLE' },
  { pattern: /^E-SW/i,                assemblyType: 'SWITCH' },
  { pattern: /SWITCH|KAPCSOL|SCHALTER/i, assemblyType: 'SWITCH' },

  // ── Kábeltálca ──
  { pattern: /^E-KT/i,                assemblyType: 'CABLE_TRAY' },
  { pattern: /TRAY|TALCA|TÁLCA|RINNE|CABLE.?TRAY/i, assemblyType: 'CABLE_TRAY' },

  // ── Kötődoboz ──
  { pattern: /^E-KK|^E-JB/i,          assemblyType: 'JUNCTION_BOX' },
  { pattern: /JUNCTION|KOTO.?DOB|ABZWEIG/i, assemblyType: 'JUNCTION_BOX' },

  // ── Védelem ──
  { pattern: /^E-BR|MCB/i,            assemblyType: 'CIRCUIT_BREAKER' },
  { pattern: /CIRCUIT.?BREAK|KISMEG|SICHERUNG/i, assemblyType: 'CIRCUIT_BREAKER' },
  { pattern: /RCD|FI.?RELE|FI-/i,     assemblyType: 'RCD' },

  // ── Elosztó ──
  { pattern: /DISTRIB|ELOSZTO|ELOSZTÓ|VERTEILER|PANEL.?BOARD/i, assemblyType: 'DISTRIBUTION' },

  // ── Tűzjelző ──
  { pattern: /SMOKE|FUST|FÜST|RAUCH/i, assemblyType: 'SMOKE_DETECTOR' },
  { pattern: /HEAT.?DET|HO.?ERZ|WÄRME/i, assemblyType: 'HEAT_DETECTOR' },
  { pattern: /MANUAL.?CALL|KEZI.?JELZ|HANDFEUER/i, assemblyType: 'MANUAL_CALL' },
  { pattern: /SOUNDER|HANG.?FENY|SIRENE/i, assemblyType: 'SOUNDER' },

  // ── Gyengeáram ──
  { pattern: /DATA|ADAT|RJ45|CAT[56]/i, assemblyType: 'DATA_OUTLET' },
  { pattern: /TV.?OUT|KOAX|TV.?ALJ/i, assemblyType: 'TV_OUTLET' },
  { pattern: /CAMERA|KAMERA/i,        assemblyType: 'CAMERA' },
  { pattern: /MOTION|MOZGAS|MOZGÁS|PIR|BEWEGUNG/i, assemblyType: 'MOTION_SENSOR' },
  { pattern: /THERMOSTAT|TERMOSZT/i,  assemblyType: 'THERMOSTAT' },
  { pattern: /DOORBELL|CSENG|KLINGEL/i, assemblyType: 'DOORBELL' },
]

// ── Levenshtein distance (for short strings) ───────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const d = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1)
    row[0] = i
    return row
  })
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }
  return d[m][n]
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

// ── User overrides (localStorage) ──────────────────────────────────────────

export function getUserOverrides() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function addUserOverride(blockName, assemblyType) {
  const overrides = getUserOverrides()
  const existing = overrides.findIndex(o => o.blockName.toUpperCase() === blockName.toUpperCase())
  if (existing >= 0) {
    overrides[existing].assemblyType = assemblyType
  } else {
    overrides.push({ blockName: blockName.trim(), assemblyType })
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(overrides)) } catch {}
  return overrides
}

export function removeUserOverride(blockName) {
  const overrides = getUserOverrides().filter(o => o.blockName.toUpperCase() !== blockName.toUpperCase())
  try { localStorage.setItem(LS_KEY, JSON.stringify(overrides)) } catch {}
  return overrides
}

// ── Main normalization function ────────────────────────────────────────────

/**
 * Normalize a raw DXF block name to an assemblyType
 * @param {string} rawName - Raw block name from DXF
 * @param {Array} [userOverrides] - Optional, if null loads from localStorage
 * @returns {{ assemblyType: string|null, confidence: number, source: string, label: string|null }}
 */
export function normalizeBlockName(rawName, userOverrides = null) {
  const name = rawName.trim().toUpperCase()
  const overrides = userOverrides ?? getUserOverrides()

  // 1. User override (exact match, highest priority)
  const override = overrides.find(o => o.blockName.toUpperCase() === name)
  if (override) {
    const typeInfo = ASSEMBLY_TYPES.find(t => t.key === override.assemblyType)
    return { assemblyType: override.assemblyType, confidence: 1.0, source: 'user', label: typeInfo?.label || null }
  }

  // 2. Regex pattern matching
  for (const rule of DEFAULT_RULES) {
    if (rule.pattern.test(name)) {
      const typeInfo = ASSEMBLY_TYPES.find(t => t.key === rule.assemblyType)
      return { assemblyType: rule.assemblyType, confidence: 0.9, source: 'regex', label: typeInfo?.label || null }
    }
  }

  // 3. Levenshtein fuzzy match against known assembly type keys
  let bestType = null, bestScore = 0
  for (const type of ASSEMBLY_TYPES) {
    // Compare against key (e.g. "SOCKET") and label stripped of accents
    const keyScore = similarity(name, type.key)
    if (keyScore > bestScore) { bestScore = keyScore; bestType = type }
  }
  if (bestType && bestScore >= 0.7) {
    return { assemblyType: bestType.key, confidence: bestScore, source: 'fuzzy', label: bestType.label }
  }

  // 4. Unknown
  return { assemblyType: null, confidence: 0, source: 'unknown', label: null }
}

/**
 * Normalize all blocks from a parse result
 * @param {Array<{name, layer, count}>} blocks - Raw blocks from dxfParser
 * @returns {{ normalized: Array, unknowns: Array }}
 */
export function normalizeBlocks(blocks) {
  const overrides = getUserOverrides()
  const normalized = []
  const unknowns = []

  for (const block of blocks) {
    const result = normalizeBlockName(block.name, overrides)
    const entry = {
      ...block,
      assemblyType: result.assemblyType,
      assemblyLabel: result.label,
      confidence: result.confidence,
      matchSource: result.source,
    }
    normalized.push(entry)
    if (!result.assemblyType) {
      unknowns.push(entry)
    }
  }

  return { normalized, unknowns }
}

/**
 * Merge normalized blocks by assemblyType (not blockName)
 * @param {Array<{assemblyType, count}>} normalizedBlocks
 * @returns {Object} { assemblyType: totalCount }
 */
export function mergeByAssemblyType(normalizedBlocks) {
  const merged = {}
  for (const b of normalizedBlocks) {
    if (!b.assemblyType) continue
    merged[b.assemblyType] = (merged[b.assemblyType] || 0) + b.count
  }
  return merged
}

/**
 * Get the label for an assembly type key
 */
export function getAssemblyTypeLabel(key) {
  return ASSEMBLY_TYPES.find(t => t.key === key)?.label || key
}
