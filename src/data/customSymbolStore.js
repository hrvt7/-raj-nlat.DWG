// ─── Custom Symbol Store ──────────────────────────────────────────────────────
// Project-scoped storage for user-defined symbols captured during PDF review.
//
// Follows the same dual-layer pattern as legendStore.js:
//   - localStorage for metadata (fast, synchronous reads)
//   - IndexedDB for optional binary data (image crops, future use)
//
// Each custom symbol = {
//   id, projectId, category, label, textPatterns[],
//   geometryHints?, color, createdAt, capturedFrom?
// }
//
// These are consumed by projectMemory.js as additional evidence for the
// rule engine.  They are NOT a competing truth source — they add input
// signals only.
// ──────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'takeoffpro_custom_symbols_meta'

// ── Internal helpers ────────────────────────────────────────────────────────

function loadAll() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function persistAll(symbols) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(symbols))
  } catch (err) {
    console.error('[customSymbolStore] persist failed:', err)
  }
}

// ── ID generator ────────────────────────────────────────────────────────────

export function generateCustomSymbolId() {
  return 'CSYM-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Save a new custom symbol or update an existing one.
 *
 * @param {Object} symbol - Must include at least { id, projectId, label, category, textPatterns }
 * @returns {Object} the saved symbol
 */
export function saveCustomSymbol(symbol) {
  if (!symbol.id || !symbol.projectId || !symbol.label) {
    throw new Error('[customSymbolStore] id, projectId, and label are required')
  }

  const entry = {
    id:             symbol.id,
    projectId:      symbol.projectId,
    label:          symbol.label,
    category:       symbol.category || 'other',
    textPatterns:   symbol.textPatterns || [],
    color:          symbol.color || '#71717A',
    geometryHints:  symbol.geometryHints || null,
    capturedFrom:   symbol.capturedFrom || null,  // { symbolId, detectionId, pageNumber }
    createdAt:      symbol.createdAt || new Date().toISOString(),
  }

  const all = loadAll()
  const existingIdx = all.findIndex(s => s.id === entry.id)
  if (existingIdx >= 0) {
    all[existingIdx] = { ...all[existingIdx], ...entry }
  } else {
    all.unshift(entry)
  }
  persistAll(all)
  return entry
}

/**
 * Get all custom symbols for a specific project.
 *
 * @param {string} projectId
 * @returns {Object[]} custom symbols for this project
 */
export function getCustomSymbolsByProject(projectId) {
  return loadAll().filter(s => s.projectId === projectId)
}

/**
 * Get a single custom symbol by ID.
 *
 * @param {string} symbolId
 * @returns {Object|undefined}
 */
export function getCustomSymbol(symbolId) {
  return loadAll().find(s => s.id === symbolId)
}

/**
 * Delete a custom symbol by ID.
 *
 * @param {string} symbolId
 */
export function deleteCustomSymbol(symbolId) {
  const remaining = loadAll().filter(s => s.id !== symbolId)
  persistAll(remaining)
}

/**
 * Delete all custom symbols for a project.
 *
 * @param {string} projectId
 */
export function deleteCustomSymbolsByProject(projectId) {
  const remaining = loadAll().filter(s => s.projectId !== projectId)
  persistAll(remaining)
}

/**
 * Load all custom symbols (all projects).  Used for testing / admin.
 *
 * @returns {Object[]}
 */
export function loadAllCustomSymbols() {
  return loadAll()
}

/**
 * Clear all custom symbols.  Used for testing / reset.
 */
export function clearAllCustomSymbols() {
  persistAll([])
}

/**
 * Create a custom symbol from a review detection that the user identified.
 *
 * This is the primary capture path: during PDF review, the user says
 * "this unknown thing is actually a <label> in category <category>".
 * We extract whatever evidence was present and store it as project memory.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.label          — user-chosen name
 * @param {string} params.category       — user-chosen category
 * @param {string} [params.color]        — optional override
 * @param {Object} [params.detection]    — the adapted detection being captured
 * @returns {Object} the saved custom symbol
 */
export function captureFromDetection({ projectId, label, category, color, detection }) {
  // Extract text patterns from evidence if available
  const textPatterns = []
  if (detection?.evidence?.text?.matchedPatterns) {
    textPatterns.push(...detection.evidence.text.matchedPatterns)
  }
  // Also use the label itself as a pattern (lowercased)
  const labelLower = label.toLowerCase().trim()
  if (labelLower && !textPatterns.includes(labelLower)) {
    textPatterns.push(labelLower)
  }

  const symbol = {
    id: generateCustomSymbolId(),
    projectId,
    label,
    category,
    textPatterns,
    color: color || '#71717A',
    geometryHints: detection?.evidence?.geometry ? {
      matchedShapes: detection.evidence.geometry.matchedShapes || [],
    } : null,
    capturedFrom: detection ? {
      symbolId: detection.symbolId || null,
      detectionId: detection.id || null,
      pageNumber: detection.pageNum || null,
    } : null,
  }

  return saveCustomSymbol(symbol)
}
