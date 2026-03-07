// ─── Plan Metadata Inference (Layer 1 + Layer 2) ────────────────────────────
// Two-layer pipeline for extracting metadata from plans:
//   Layer 1. Filename parser   — regex on filename (fast, always available)
//   Layer 2. Document text scan — pdf.js getTextContent / DXF TEXT+MTEXT
//   (Layer 3. AI vision — future, not implemented)
//
// Input:  filename string (L1), text content array (L2)
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

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Layer 2: Document Text Scan ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Extended floor patterns for text scan (more verbose terms found in title blocks)
const TEXT_FLOOR_PATTERNS = [
  ...FLOOR_PATTERNS,
  // Full words more common in title blocks
  { pattern: /\b(szuteren|szuterén)\b/i, floor: 'pince', label: 'Pince' },
  { pattern: /\b(i+\.?\s*emelet)\b/i, floor: null, label: null, roman: true },
]

function matchFloorFromText(normalized) {
  // First try standard filename patterns
  const std = matchFloor(normalized)
  if (std) return std
  // Relaxed numeric floor: "2. emelet", "2 emelet" (more separators than filename regex)
  const numFloor = normalized.match(/(?:^|[\s_\-.])([\d]{1,2})[\s._\-]*(?:emelet|emeleti)/)
  if (numFloor) {
    const n = parseInt(numFloor[1], 10)
    return { floor: `${n}_emelet`, floorLabel: `${n}. emelet` }
  }
  // Roman numeral floors: I. emelet, II. emelet, III. emelet
  const romanMatch = normalized.match(/\b(i{1,4})\.?\s*emelet/i)
  if (romanMatch) {
    const roman = romanMatch[1].length
    return { floor: `${roman}_emelet`, floorLabel: `${roman}. emelet` }
  }
  return null
}

// Extended system type patterns for text scan (longer keywords)
const TEXT_SYSTEM_PATTERNS = [
  ...SYSTEM_PATTERNS,
  { patterns: ['villamos energia', 'kisfeszultseg', 'kis feszultseg'], type: 'power' },
  { patterns: ['vilagitasi', 'lampa', 'fenyforras', 'fenycso'], type: 'lighting' },
  { patterns: ['tuzjelzo rendszer', 'tuzjelzes', 'tuz jelzo'], type: 'fire_alarm' },
  { patterns: ['strukturalt kabelezés', 'strukturalt', 'informatika', 'telefon', 'utp'], type: 'low_voltage' },
  { patterns: ['kamerarendszer', 'beleptetés', 'vagyonvedelem', 'riaszto rendszer'], type: 'security' },
]

function matchSystemTypeFromText(normalized) {
  for (const sp of TEXT_SYSTEM_PATTERNS) {
    for (const pat of sp.patterns) {
      if (normalized.includes(pat)) return sp.type
    }
  }
  return null
}

// Extended doc type patterns for text scan
const TEXT_DOC_TYPE_PATTERNS = [
  ...DOC_TYPE_PATTERNS,
  { patterns: ['villamos alaprajz', 'elosztoi alaprajz', 'szerelesi rajz'], type: 'plan' },
  { patterns: ['egyvonalas rajz', 'egyvonalas semat'], type: 'single_line' },
  { patterns: ['jel magyarazat', 'jelkulcs'], type: 'legend' },
  { patterns: ['anyag kimutatas', 'anyagjegyzek', 'bom', 'osszesites'], type: 'schedule' },
  { patterns: ['reszletrajz', 'reszletterv'], type: 'detail' },
  { patterns: ['keresztmetszeti', 'csatornarajz'], type: 'section' },
]

function matchDocTypeFromText(normalized) {
  for (const dp of TEXT_DOC_TYPE_PATTERNS) {
    for (const pat of dp.patterns) {
      if (normalized.includes(pat)) return dp.type
    }
  }
  return null
}

// Drawing number from text — look for "Rajzszám:", "Terv szám:", "Tervszám:" prefix
const TEXT_DRAWING_NUMBER_RE = /(?:rajzszam|tervszam|terv\s*szam|drawing\s*n(?:o|umber)|dwg\s*n(?:o|umber))[\s:.\-]*([A-Z]{1,3})[\s_\-.]?(\d{1,4})/i

// Revision from text — "Változat: R2", "Revízió: 3", "Rev.: 2"
const TEXT_REVISION_RE = /(?:valtozat|revizio|rev\.?)[\s:.\-]*(?:r?\s*(\d{1,3}))/i

/**
 * Infer plan metadata from document text content (Layer 2).
 *
 * @param {string[]} textLines — array of text strings from PDF or DXF
 * @param {Object} [options]
 * @param {boolean} [options.titleBlockOnly] — if true, only scan provided lines (assumes pre-filtered)
 * @returns {Object} Same shape as inferPlanMeta result, with metaSource='text_scan'
 */
export function inferMetaFromText(textLines, options = {}) {
  const empty = {
    drawingNumber: null, revision: null,
    floor: null, floorLabel: null,
    systemType: null, docType: null,
    projectName: null, designer: null,
    metaSource: 'text_scan', metaConfidence: 0,
    metaExtractedAt: new Date().toISOString(),
  }
  if (!textLines || textLines.length === 0) return empty

  // Join all text into one big string for scanning (limit to first 500 lines to stay fast)
  const lines = textLines.slice(0, 500)
  const joined = lines.join(' ')
  const normalized = norm(joined)

  // ── Floor ──
  const floorMatch = matchFloorFromText(normalized)

  // ── System type ──
  const systemFromText = matchSystemTypeFromText(normalized)
  // Also try drawing number prefix from text
  const drawingFromText = matchDrawingNumberFromText(joined)
  let systemType = systemFromText
  if (!systemType && drawingFromText?.prefix) {
    systemType = PREFIX_SYSTEM_MAP[drawingFromText.prefix] || null
  }

  // ── Doc type ──
  const docType = matchDocTypeFromText(normalized)

  // ── Drawing number from text ──
  const drawingNumber = drawingFromText?.drawingNumber || null

  // ── Revision from text ──
  const revMatch = normalized.match(TEXT_REVISION_RE)
  const revision = revMatch ? `R${revMatch[1]}` : matchRevision(normalized)

  const result = {
    drawingNumber,
    revision: revision || null,
    floor: floorMatch?.floor || null,
    floorLabel: floorMatch?.floorLabel || null,
    systemType: systemType || null,
    docType: docType || null,
    projectName: null,
    designer: null,
    metaSource: 'text_scan',
    metaConfidence: 0,
    metaExtractedAt: new Date().toISOString(),
  }

  result.metaConfidence = calcConfidence(result)
  return result
}

function matchDrawingNumberFromText(text) {
  const upper = text.toUpperCase()
  // First try labeled pattern: "Rajzszám: E-01"
  const labeledMatch = upper.match(TEXT_DRAWING_NUMBER_RE)
  if (labeledMatch) {
    const prefix = labeledMatch[1]
    const num = labeledMatch[2]
    if (PREFIX_SYSTEM_MAP[prefix]) {
      return { drawingNumber: `${prefix}-${num.padStart(2, '0')}`, prefix }
    }
  }
  // Fallback: look for standalone drawing numbers like "E-01" anywhere
  const m = upper.match(DRAWING_NUMBER_RE)
  if (m && PREFIX_SYSTEM_MAP[m[1]]) {
    return { drawingNumber: `${m[1]}-${m[2].padStart(2, '0')}`, prefix: m[1] }
  }
  return null
}

// ─── Merge Layer 1 + Layer 2 ─────────────────────────────────────────────────

const META_FIELDS = ['drawingNumber', 'revision', 'floor', 'floorLabel', 'systemType', 'docType']

/**
 * Merge Layer 1 (filename) and Layer 2 (text_scan) metadata results.
 * Strategy:
 *  - Per field: Layer 2 fills nulls from Layer 1
 *  - If both agree on a field → confidence boost (+0.05 per agreeing field)
 *  - If Layer 2 has a value but Layer 1 doesn't → use Layer 2
 *  - If both have a value but disagree → prefer the one with higher overall confidence,
 *    or Layer 1 (filename) as tiebreaker since it's more reliable for drawingNumber
 *  - metaSource reflects which layers contributed
 *
 * @param {Object} layer1 — result from inferPlanMeta (filename)
 * @param {Object} layer2 — result from inferMetaFromText (text_scan)
 * @returns {Object} Merged metadata
 */
export function mergeMeta(layer1, layer2) {
  // If only one layer has data, return it directly
  if (!layer2 || layer2.metaConfidence === 0) return { ...layer1 }
  if (!layer1 || layer1.metaConfidence === 0) return { ...layer2 }

  const merged = {
    projectName: null,
    designer: null,
    metaExtractedAt: new Date().toISOString(),
  }

  let usedFilename = false
  let usedText = false
  let agreeCount = 0

  for (const field of META_FIELDS) {
    const v1 = layer1[field]
    const v2 = layer2[field]

    if (v1 && v2) {
      if (v1 === v2) {
        // Both agree — great confidence
        merged[field] = v1
        agreeCount++
        usedFilename = true
        usedText = true
      } else {
        // Disagree: filename wins for drawingNumber, higher confidence wins otherwise
        if (field === 'drawingNumber') {
          merged[field] = v1
          usedFilename = true
        } else if (layer2.metaConfidence > layer1.metaConfidence) {
          merged[field] = v2
          usedText = true
        } else {
          merged[field] = v1
          usedFilename = true
        }
      }
    } else if (v1) {
      merged[field] = v1
      usedFilename = true
    } else if (v2) {
      merged[field] = v2
      usedText = true
    } else {
      merged[field] = null
    }
  }

  // Determine source label
  if (usedFilename && usedText) {
    merged.metaSource = 'filename+text_scan'
  } else if (usedText) {
    merged.metaSource = 'text_scan'
  } else {
    merged.metaSource = 'filename'
  }

  // Confidence: start from higher of the two, boost for agreements
  const baseConf = Math.max(layer1.metaConfidence, layer2.metaConfidence)
  merged.metaConfidence = Math.min(0.98, baseConf + agreeCount * 0.03)

  // Recalculate if merged actually has fewer recognized fields (shouldn't happen, but safety)
  const mergedFieldConf = calcConfidence(merged)
  if (mergedFieldConf > merged.metaConfidence) {
    merged.metaConfidence = mergedFieldConf
  }

  return merged
}

// ─── PDF text extraction helper ──────────────────────────────────────────────

/**
 * Extract all text strings from the first page of a PDF using pdf.js.
 * Lightweight — does not render the page, only reads the text layer.
 *
 * @param {ArrayBuffer} pdfData — raw PDF file as ArrayBuffer
 * @returns {Promise<string[]>} Array of text strings
 */
export async function extractPdfText(pdfData) {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    const doc = await pdfjsLib.getDocument({ data: pdfData }).promise
    // Scan first page (title block is almost always on page 1)
    const page = await doc.getPage(1)
    const textContent = await page.getTextContent()
    const texts = textContent.items
      .map(item => (item.str || '').trim())
      .filter(s => s.length > 1)
    doc.destroy()
    return texts
  } catch {
    return []
  }
}
