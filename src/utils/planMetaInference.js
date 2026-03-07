// ─── Plan Metadata Inference (Layer 1: Filename Parser) ─────────────────────
// Extracts metadata from plan filenames using Hungarian-focused regex patterns.
// This is the first layer of a 3-layer pipeline:
//   1. Filename parser  (this file) ← MVP
//   2. Document text scan (future)
//   3. AI vision fallback (future)
//
// Input:  filename string (e.g. "E-01_Fsz_vilagitas_alaprajz_R2.pdf")
// Output: { drawingNumber, revision, floor, floorLabel, systemType, docType, ... }

// ── Enums ────────────────────────────────────────────────────────────────────

export const SYSTEM_TYPES = ['power', 'lighting', 'fire_alarm', 'low_voltage', 'security', 'general']
export const DOC_TYPES = ['plan', 'single_line', 'legend', 'schedule', 'detail', 'section']

export const SYSTEM_TYPE_LABELS = {
  power:       'Erősáram',
  lighting:    'Világítás',
  fire_alarm:  'Tűzjelző',
  low_voltage: 'Gyengeáram',
  security:    'Biztonságtechnika',
  general:     'Általános',
}

export const DOC_TYPE_LABELS = {
  plan:        'Alaprajz',
  single_line: 'Egyvonalas',
  legend:      'Jelmagyarázat',
  schedule:    'Kimutatás',
  detail:      'Részlet',
  section:     'Metszet',
}

// ── Normalize helper ────────────────────────────────────────────────────────
// Strips accents + lowercases for accent-tolerant matching
function norm(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Floor patterns ──────────────────────────────────────────────────────────
const FLOOR_PATTERNS = [
  // Basement
  { pattern: /(?:^|[\s_\-.])(pince|alagsor|b[\s_\-.]?1|b[\s_\-.]?2|al\.?\s*sz)(?:$|[\s_\-.])/i, floor: 'pince', label: 'Pince' },
  // Ground floor
  { pattern: /(?:^|[\s_\-.])(foldszint|fsz|gf|f\.?\s*sz)(?:$|[\s_\-.])/i, floor: 'fsz', label: 'Földszint' },
  // Attic / roof
  { pattern: /(?:^|[\s_\-.])(tetoter|padlas|teto|tetoszint)(?:$|[\s_\-.])/i, floor: 'teto', label: 'Tetőtér' },
  // Numbered floors: "2. emelet", "2em", "2_emelet", "2.em"
  { pattern: /(?:^|[\s_\-.])([\d]{1,2})[\s._\-]?(?:emelet|em\b|emeleti)(?:$|[\s_\-.])/i, floor: null, label: null, dynamic: true },
]

function matchFloor(normalized) {
  for (const fp of FLOOR_PATTERNS) {
    const m = normalized.match(fp.pattern)
    if (m) {
      if (fp.dynamic) {
        const n = parseInt(m[1], 10)
        return { floor: `${n}_emelet`, floorLabel: `${n}. emelet` }
      }
      return { floor: fp.floor, floorLabel: fp.label }
    }
  }
  return null
}

// ── System type patterns ────────────────────────────────────────────────────
const SYSTEM_PATTERNS = [
  { patterns: ['erosaram', 'eros_aram', 'power', 'eros'], type: 'power' },
  { patterns: ['vilagitas', 'vilag', 'lighting', 'lamp'], type: 'lighting' },
  { patterns: ['tuzjelzo', 'tuz_jelzo', 'fire_alarm', 'fire', 'tuzv', 'tuzjelzes'], type: 'fire_alarm' },
  { patterns: ['gyengearam', 'gyenge_aram', 'low_voltage', 'gyenge', 'halozat', 'strukturalt'], type: 'low_voltage' },
  { patterns: ['biztonsag', 'security', 'riaszto', 'kamera', 'beleptet', 'vagyon'], type: 'security' },
]

// Drawing number prefix → systemType mapping (E=erősáram, V=világítás, etc.)
const PREFIX_SYSTEM_MAP = {
  'E':  'power',
  'EE': 'power',
  'V':  'lighting',
  'VE': 'lighting',
  'T':  'fire_alarm',
  'TJ': 'fire_alarm',
  'GY': 'low_voltage',
  'GA': 'low_voltage',
  'B':  'security',
  'BT': 'security',
}

function matchSystemType(normalized) {
  for (const sp of SYSTEM_PATTERNS) {
    for (const pat of sp.patterns) {
      // Match as whole token or substring
      if (normalized.includes(pat)) return sp.type
    }
  }
  return null
}

// ── Doc type patterns ───────────────────────────────────────────────────────
const DOC_TYPE_PATTERNS = [
  { patterns: ['alaprajz', 'terv', 'plan', 'layout', 'felviteli'], type: 'plan' },
  { patterns: ['egyvonalas', 'single_line', 'egyvonal', 'singleline'], type: 'single_line' },
  { patterns: ['jelmagyarazat', 'legend', 'jelmagy', 'jel_magy'], type: 'legend' },
  { patterns: ['kimutatas', 'schedule', 'lista', 'osszesito', 'tabl'], type: 'schedule' },
  { patterns: ['reszlet', 'detail', 'reszl'], type: 'detail' },
  { patterns: ['metszet', 'section', 'keresztmetszet'], type: 'section' },
]

function matchDocType(normalized) {
  for (const dp of DOC_TYPE_PATTERNS) {
    for (const pat of dp.patterns) {
      if (normalized.includes(pat)) return dp.type
    }
  }
  return null
}

// ── Drawing number extraction ───────────────────────────────────────────────
// Common patterns: E-01, V-03, GY-02, EE_12, T.01, GA-05
// Also: E01, V03 (no separator)
// Use (?:^|[_\s.\-]) boundary since \b doesn't work across underscores.
const DRAWING_NUMBER_RE = /(?:^|[_\s.\-])([A-Z]{1,3})[\s_\-.]?(\d{1,4})(?:$|[_\s.\-])/

function matchDrawingNumber(original) {
  // Work on original (not normalized) to preserve case
  const stripped = original.replace(/\.[^.]+$/, '') // remove extension
  const upper = stripped.toUpperCase()
  const m = upper.match(DRAWING_NUMBER_RE)
  if (!m) return null

  const prefix = m[1]
  const num = m[2]

  // Only accept known electrical drawing prefixes to avoid false positives
  if (!PREFIX_SYSTEM_MAP[prefix]) return null

  // Normalize to "PREFIX-NUM" format
  const normalized = `${prefix}-${num.padStart(2, '0')}`
  return { drawingNumber: normalized, prefix }
}

// ── Revision extraction ─────────────────────────────────────────────────────
// Patterns: R2, Rev3, rev.1, _r02, -R1
const REVISION_RE = /(?:^|[\s_\-.])(r(?:ev)?\.?\s*(\d{1,3}))(?:$|[\s_\-.])/i

function matchRevision(normalized) {
  const m = normalized.match(REVISION_RE)
  if (!m) return null
  return `R${m[2]}`
}

// ── Confidence calculation ──────────────────────────────────────────────────
function calcConfidence(fields) {
  const recognized = [
    fields.floor,
    fields.systemType,
    fields.docType,
    fields.drawingNumber,
  ].filter(Boolean).length

  if (recognized >= 3) return 0.92
  if (recognized === 2) return 0.80
  if (recognized === 1) return 0.65
  return 0
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Infer plan metadata from a filename string.
 *
 * @param {string} filename — e.g. "E-01_Fsz_vilagitas_alaprajz_R2.pdf"
 * @returns {Object} Inferred metadata with confidence score
 */
export function inferPlanMeta(filename) {
  if (!filename || typeof filename !== 'string') {
    return {
      drawingNumber: null, revision: null,
      floor: null, floorLabel: null,
      systemType: null, docType: null,
      projectName: null, designer: null,
      metaSource: 'filename', metaConfidence: 0,
      metaExtractedAt: new Date().toISOString(),
    }
  }

  // Strip extension for matching
  const base = filename.replace(/\.[^.]+$/, '')
  const normalized = norm(base)

  // Extract each field
  const floorMatch = matchFloor(normalized)
  const systemMatch = matchSystemType(normalized)
  const docMatch = matchDocType(normalized)
  const drawingMatch = matchDrawingNumber(filename) // original case for prefix
  const revision = matchRevision(normalized)

  // If systemType not matched from keywords, try from drawing number prefix
  let systemType = systemMatch
  if (!systemType && drawingMatch?.prefix) {
    systemType = PREFIX_SYSTEM_MAP[drawingMatch.prefix] || null
  }

  const result = {
    drawingNumber: drawingMatch?.drawingNumber || null,
    revision: revision || null,
    floor: floorMatch?.floor || null,
    floorLabel: floorMatch?.floorLabel || null,
    systemType: systemType || null,
    docType: docMatch || null,
    projectName: null,   // Layer 2+
    designer: null,      // Layer 2+
    metaSource: 'filename',
    metaConfidence: 0,
    metaExtractedAt: new Date().toISOString(),
  }

  result.metaConfidence = calcConfidence(result)

  return result
}

/**
 * Human-readable one-liner for a plan's inferred metadata.
 * Used by PlanCard for subtitle / badge text.
 *
 * @param {Object} meta — result from inferPlanMeta or plan.inferredMeta
 * @returns {string} e.g. "E-01 · Földszint · Világítás · Alaprajz"
 */
export function formatInferredMeta(meta) {
  if (!meta || meta.metaConfidence === 0) return ''
  const parts = []
  if (meta.drawingNumber) parts.push(meta.drawingNumber)
  if (meta.floorLabel) parts.push(meta.floorLabel)
  if (meta.systemType && SYSTEM_TYPE_LABELS[meta.systemType]) {
    parts.push(SYSTEM_TYPE_LABELS[meta.systemType])
  }
  if (meta.docType && DOC_TYPE_LABELS[meta.docType]) {
    parts.push(DOC_TYPE_LABELS[meta.docType])
  }
  if (meta.revision) parts.push(meta.revision)
  return parts.join(' · ')
}
