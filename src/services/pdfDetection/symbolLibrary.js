// ─── Symbol Library — First Deterministic Set ────────────────────────────────
// Defines the canonical symbol definitions for rule-based detection.
// Each entry describes what a symbol looks like in a PDF: text patterns,
// geometry hints, and detection metadata.
//
// This library is the single source of truth for "what symbols do we detect
// and how do we identify them".  The rule engine queries this library.
//
// Design principles:
//   - Deterministic patterns only (no AI/ML/OCR)
//   - Conservative: prefer false negatives over false positives
//   - Evidence-rich: multiple independent signals required for high confidence
//   - Extensible: add new symbols by adding entries, not changing the engine
// ──────────────────────────────────────────────────────────────────────────────

// ── Categories ───────────────────────────────────────────────────────────────

export const SYMBOL_CATEGORIES = /** @type {const} */ ({
  POWER: 'power',
  LIGHTING: 'lighting',
  FIRE_SAFETY: 'fire_safety',
  LOW_VOLTAGE: 'low_voltage',
  INFRASTRUCTURE: 'infrastructure',
})

// ── Library entries ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} SymbolDef
 * @property {string}   id            — unique symbol identifier
 * @property {string}   category      — from SYMBOL_CATEGORIES
 * @property {string}   label         — human-readable Hungarian name
 * @property {string}   labelEn       — English name
 * @property {string[]} textPatterns  — lowercase text patterns to match in textBlocks
 * @property {string[]} aliases       — alternative names (for display/search)
 * @property {Object}   geometryHints — expected drawing characteristics
 * @property {string}   [legacyType]  — maps to legacy pdfTakeoff._pdfType
 * @property {string}   [asmId]       — links to assembly for quoting
 * @property {boolean}  autoDetect    — whether rule engine should attempt detection
 * @property {string}   detectionNotes — explains what evidence is reliable
 */

/** @type {SymbolDef[]} */
export const SYMBOL_LIBRARY = [
  // ── Sockets / Dugaljak ──────────────────────────────────────────────────
  {
    id: 'SYM-SOCKET',
    category: SYMBOL_CATEGORIES.POWER,
    label: 'Dugalj',
    labelEn: 'Socket / Outlet',
    textPatterns: [
      'dugalj', 'konnektor', 'socket', 'aljzat', '2p+f', 'schuko',
      'csatlakozó aljzat', 'fali aljzat',
    ],
    aliases: ['konnektor', 'konnektoraljzat', 'fali dugalj', 'schuko'],
    geometryHints: {
      // Typical: small filled semicircle or rectangle with pins
      expectedShapes: ['rect', 'circle'],
      minSize: 3,   // PDF points
      maxSize: 20,
      aspectRatioRange: [0.5, 2.0],
    },
    legacyType: 'dugalj',
    asmId: 'ASM-001',
    autoDetect: true,
    detectionNotes: 'Text pattern matching is highly reliable for Hungarian plans. Geometry matching is supplementary.',
  },

  // ── Switches / Kapcsolók ────────────────────────────────────────────────
  {
    id: 'SYM-SWITCH',
    category: SYMBOL_CATEGORIES.POWER,
    label: 'Kapcsoló',
    labelEn: 'Switch',
    textPatterns: [
      'kapcsoló', 'kapcsolo', 'switch', 'dimmer', 'nyomó', 'nyomógomb',
      'csillárkapcsoló', 'váltókapcsoló', 'alternating switch',
    ],
    aliases: ['villanykapcsoló', 'csillárkapcsoló', 'váltókapcsoló', 'dimmer'],
    geometryHints: {
      expectedShapes: ['circle', 'line'],
      minSize: 3,
      maxSize: 15,
      aspectRatioRange: [0.8, 1.2],  // Tends to be near-circular
    },
    legacyType: 'kapcsolo',
    asmId: 'ASM-002',
    autoDetect: true,
    detectionNotes: 'Switch symbols are typically circles with a slash. Text "kapcsoló" is very reliable.',
  },

  // ── Lighting / Lámpatestek ──────────────────────────────────────────────
  {
    id: 'SYM-LIGHT',
    category: SYMBOL_CATEGORIES.LIGHTING,
    label: 'Lámpatest',
    labelEn: 'Light fixture',
    textPatterns: [
      'lámpa', 'lampa', 'light', 'led', 'spot', 'downlight',
      'mennyezeti', 'fényforrás', 'lámpatest', 'világítótest',
      'beépíthető lámpa', 'süllyesztett',
    ],
    aliases: ['lámpatest', 'világítótest', 'spotlámpa', 'LED panel'],
    geometryHints: {
      // Typically: circle (recessed), rectangle (surface), X-in-circle
      expectedShapes: ['circle', 'rect'],
      minSize: 4,
      maxSize: 25,
      aspectRatioRange: [0.3, 3.0],  // Wide range: panels vs spots
    },
    legacyType: 'lampa',
    asmId: 'ASM-003',
    autoDetect: true,
    detectionNotes: 'Lighting is the most common symbol in electrical plans. Text is very reliable; circle geometry is a good secondary signal.',
  },

  // ── Conduit / Cable tray ────────────────────────────────────────────────
  {
    id: 'SYM-CONDUIT',
    category: SYMBOL_CATEGORIES.INFRASTRUCTURE,
    label: 'Kábeltálca / Védőcső',
    labelEn: 'Conduit / Cable tray',
    textPatterns: [
      'kábeltálca', 'kabelalca', 'cable tray', 'védőcső',
      'vedocso', 'conduit', 'csatorna', 'mü cső', 'flexibilis cső',
      'kábel nyomvonal', 'kábelút',
    ],
    aliases: ['védőcső', 'kábeltálca', 'flexcső', 'kábelcsatorna'],
    geometryHints: {
      // Typically: long dashed/solid lines (path elements)
      expectedShapes: ['line', 'path'],
      minSize: 50,   // Long elements
      maxSize: 2000,
      aspectRatioRange: [0, 0.1],  // Very elongated
    },
    legacyType: null,  // Not in legacy detection
    asmId: null,
    autoDetect: true,
    detectionNotes: 'Conduits are detected primarily by text labels near long line paths. Geometry alone is unreliable (many long lines in a plan).',
  },

  // ── Breaker / Kismegszakító ─────────────────────────────────────────────
  {
    id: 'SYM-BREAKER',
    category: SYMBOL_CATEGORIES.POWER,
    label: 'Kismegszakító',
    labelEn: 'Circuit breaker',
    textPatterns: [
      'kismegszakító', 'kismegszakito', 'mcb', 'breaker',
      'megszakító', 'circuit breaker',
    ],
    aliases: ['automata biztosíték', 'MCB'],
    geometryHints: {
      expectedShapes: ['rect'],
      minSize: 4,
      maxSize: 15,
      aspectRatioRange: [0.5, 2.0],
    },
    legacyType: 'kismegszakito',
    asmId: null,
    autoDetect: true,  // Low-risk: only text-based, no aggressive geometry match
    detectionNotes: 'Only detect when clear text evidence exists. Breakers typically appear in schematic panels, not floor plans.',
  },
]

// ── Lookup helpers ───────────────────────────────────────────────────────────

/** @type {Map<string, SymbolDef>} */
const _byId = new Map(SYMBOL_LIBRARY.map(s => [s.id, s]))

/** @type {Map<string, SymbolDef>} */
const _byLegacyType = new Map(
  SYMBOL_LIBRARY.filter(s => s.legacyType).map(s => [s.legacyType, s])
)

/**
 * Get a symbol definition by its ID.
 * @param {string} id
 * @returns {SymbolDef|undefined}
 */
export function getSymbolById(id) {
  return _byId.get(id)
}

/**
 * Get a symbol definition by legacy pdfTakeoff type.
 * @param {string} legacyType
 * @returns {SymbolDef|undefined}
 */
export function getSymbolByLegacyType(legacyType) {
  return _byLegacyType.get(legacyType)
}

/**
 * Get all auto-detectable symbols.
 * @returns {SymbolDef[]}
 */
export function getAutoDetectableSymbols() {
  return SYMBOL_LIBRARY.filter(s => s.autoDetect)
}

/**
 * Get all symbols in a category.
 * @param {string} category
 * @returns {SymbolDef[]}
 */
export function getSymbolsByCategory(category) {
  return SYMBOL_LIBRARY.filter(s => s.category === category)
}
