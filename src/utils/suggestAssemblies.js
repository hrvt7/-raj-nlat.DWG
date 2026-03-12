// ─── Quick-pick suggestion engine for unknown blocks ────────────────────────
// Deterministic, no ML. Extracts tokens from evidence signals and matches
// against pattern rules + assembly tags/names.
// Returns max 3 scored assemblies for quick-pick UI.
//
// Used by UnknownBlockPanel to show quick-pick buttons above the dropdown.
// Pure function — no side effects, no DOM, safe for tests.

// Tokens too generic to be useful for suggestion scoring
const SUGGESTION_SKIP_TOKENS = new Set([
  '2P','1P','3P','16A','10A','6A','20A','25A','32A','40A','63A',
  'IP20','IP44','IP54','IP65','IP67','IP68','230V','400V','24V','12V',
  'DB','ST','PCS','MM','CM','KG','NR',
])

// Default BLOCK_ASM_RULES patterns for suggestion scoring.
// Matches the main recognizeBlock rules from TakeoffWorkspace.
const DEFAULT_RULES = [
  { patterns: ['LIGHT','LAMP','VILÁG','VILAG','LÁMPA','LAMPA','LED','SPOT','DOWNLIGHT','CEILING','MENNYEZET'], asmId: 'ASM-003' },
  { patterns: ['SWITCH','KAPCS','KAPCSOL','DIMMER','TOGGLE','NYOMÓ','NYOMO'], asmId: 'ASM-002' },
  { patterns: ['SOCKET','DUGALJ','ALJZAT','OUTLET','PLUG','CSATLAKOZ','RECEPT','ERŐÁTVITELI','EROATVITELI'], asmId: 'ASM-001' },
  { patterns: ['PANEL','DB_PANEL','ELOSZTO','ELOSZTÓ','MDB','SZEKRÉNY','SZEKRENY','DISTRIBUTION','BOARD','TABLOU'], asmId: 'ASM-018' },
  { patterns: ['SMOKE','FÜST','FUST','DETECTOR','ÉRZÉKEL','ERZEKEL','ALARM','TŰZJELZ','TUZJELZ'], asmId: null },
  // Additional patterns for wider coverage
  { patterns: ['KÁBELTÁLCA','KABELTALCA','CABLE_TRAY','TRAY','TÁLCA','TALCA'], asmId: 'ASM-023' },
  { patterns: ['CAMERA','KAMERA','CCTV'], asmId: 'ASM-043' },
  { patterns: ['WIFI','ACCESS_POINT'], asmId: 'ASM-041' },
  { patterns: ['RJ45','CAT6','ADAT','DATA'], asmId: 'ASM-026' },
  { patterns: ['VÉSZVILÁG','VESZVILAG','EXIT_LIGHT','EMERGENCY'], asmId: 'ASM-017' },
]

/**
 * Extract tokens from a string (uppercase, split by separators, min 3 chars).
 * Filters out skip tokens and pure digits.
 * @param {string} str
 * @param {Set<string>} into — token set to add to
 */
function extractTokens(str, into) {
  if (!str) return
  const parts = str.toUpperCase().replace(/[_\-\.\/\\,;:()]/g, ' ').split(/\s+/)
  for (const t of parts) {
    if (t.length >= 3 && !SUGGESTION_SKIP_TOKENS.has(t) && !/^\d+$/.test(t)) {
      into.add(t)
    }
  }
}

/**
 * Suggest top-N assemblies for an unknown block based on evidence signals.
 *
 * @param {string} blockName — raw DXF block name
 * @param {object|null} evidence — evidence object from buildBlockEvidence
 *   { layer, attribs: [{tag,value}], nearbyText: string[] }
 * @param {Array} assemblies — full ASSEMBLIES_DEFAULT array
 * @param {object} [options]
 * @param {Array} [options.rules] — pattern rules (default: DEFAULT_RULES)
 * @param {number} [options.maxResults] — max suggestions (default: 3)
 * @returns {Array} — scored assembly objects, max `maxResults`
 */
export function suggestAssemblies(blockName, evidence, assemblies, options = {}) {
  const rules = options.rules || DEFAULT_RULES
  const maxResults = options.maxResults || 3

  // ── Collect tokens from all available signals ──────────────────────────
  const tokens = new Set()

  // Block name tokens
  extractTokens(blockName, tokens)

  // Layer tokens (skip DEFAULT)
  if (evidence?.layer && evidence.layer !== 'DEFAULT') {
    // Strip common electrical prefixes before tokenizing
    const layerClean = evidence.layer.replace(/^(E_|EL_|ELEC_|ELECTRICAL_)/i, '')
    extractTokens(layerClean, tokens)
  }

  // Nearby text tokens
  if (evidence?.nearbyText?.length) {
    for (const txt of evidence.nearbyText) extractTokens(txt, tokens)
  }

  // ATTRIB value tokens
  if (evidence?.attribs?.length) {
    for (const a of evidence.attribs) extractTokens(a.value, tokens)
  }

  if (tokens.size === 0) return []

  // ── Score assemblies ──────────────────────────────────────────────────
  const scored = []

  for (const asm of assemblies) {
    if (asm.variantOf) continue // skip variants
    let score = 0

    // Phase 1: Check tokens against pattern rules (strong signal)
    // Only token.includes(pattern) — NOT reverse. Prevents short tokens
    // like 'KAP' from falsely matching longer patterns like 'KAPCS'.
    for (const rule of rules) {
      if (rule.asmId === asm.id) {
        for (const token of tokens) {
          for (const pattern of rule.patterns) {
            if (token.includes(pattern)) {
              score += 5  // strong: pattern rule match
            }
          }
        }
      }
    }

    // Phase 2: Check tokens against assembly tags (medium signal)
    const asmTags = (asm.tags || []).map(t => t.toUpperCase())
    for (const token of tokens) {
      for (const tag of asmTags) {
        if (tag.includes(token) || token.includes(tag)) {
          score += 2
        }
      }
    }

    // Phase 3: Check tokens against assembly name (medium signal)
    const asmNameUp = (asm.name || '').toUpperCase()
    for (const token of tokens) {
      if (asmNameUp.includes(token)) score += 2
    }

    // Phase 4: Check tokens against category label (weak signal)
    const asmCatUp = (asm.category || '').toUpperCase()
    for (const token of tokens) {
      if (asmCatUp.includes(token)) score += 1
    }

    if (score > 0) scored.push({ asm, score })
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxResults).map(s => s.asm)
}
