// ─── Plan Store (IndexedDB via localforage) ──────────────────────────────────
// Stores large DXF/DWG plan files in IndexedDB to handle 10+ MB files
// Metadata (name, date, units, etc.) in localStorage for quick access
// File blobs in localforage (IndexedDB) for large binary storage
// Plan annotations (markers, measurements, scale) persist per plan

import localforage from 'localforage'

// Configure localforage instances
const planFileStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'plan_files',
  description: 'DXF/DWG/PDF plan file binary storage',
})

const planThumbStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'plan_thumbnails',
  description: 'PDF/DXF plan thumbnail image data URLs',
})

const planAnnotStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'plan_annotations',
  description: 'Plan markers, measurements, scale calibration',
})

const parseCacheStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'parse_cache',
  description: 'SHA-256 based DXF parse result cache',
})

const LS_KEY = 'takeoffpro_plans_meta'

// ── Floor / Discipline constants ────────────────────────────────────────────
export const FLOOR_OPTIONS = ['Pince', 'Fsz', '1. emelet', '2. emelet', 'Tető', 'Egyéb']
export const DISCIPLINE_OPTIONS = ['Világítás', 'Erősáram', 'Kábeltálca', 'Tűzjelző', 'Gyengeáram']

// ─── Plan metadata (localStorage) ────────────────────────────────────────────

function loadPlansMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw === null) return []
    return JSON.parse(raw)
  } catch (err) {
    console.warn(`[TakeoffPro] planStore load failed:`, err.message)
    return []
  }
}

function savePlansMeta(plans) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(plans))
  } catch (err) {
    console.error(`[TakeoffPro] planStore save FAILED:`, err.message)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('takeoffpro:storage-error', {
        detail: { key: LS_KEY, error: err.message, type: 'write' }
      }))
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generatePlanId() {
  return 'PLN-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

/**
 * Save a plan: metadata to localStorage, file blob to IndexedDB
 * @param {Object} plan - { id, name, fileType, fileSize, units, parsedResult, createdAt }
 * @param {File|Blob} fileBlob - The raw DXF/DWG file
 */
export async function savePlan(plan, fileBlob) {
  const meta = loadPlansMeta()
  const existing = meta.findIndex(p => p.id === plan.id)
  if (existing >= 0) {
    meta[existing] = { ...meta[existing], ...plan }
  } else {
    meta.unshift(plan)
  }
  savePlansMeta(meta)

  // Store file blob in IndexedDB
  if (fileBlob) {
    await planFileStore.setItem(plan.id, fileBlob)
  }

  return plan
}

/**
 * Load all plan metadata (no file blobs)
 */
export function loadPlans() {
  return loadPlansMeta()
}

/**
 * Load plans belonging to a specific project.
 * @param {string} projectId
 */
export function getPlansByProject(projectId) {
  return loadPlansMeta().filter(p => p.projectId === projectId)
}

/**
 * Get a plan file blob from IndexedDB
 * @param {string} planId
 * @returns {Promise<Blob|null>}
 */
export async function getPlanFile(planId) {
  return await planFileStore.getItem(planId)
}

/**
 * Delete a plan (both metadata and file blob)
 * @param {string} planId
 */
export async function deletePlan(planId) {
  const meta = loadPlansMeta().filter(p => p.id !== planId)
  savePlansMeta(meta)
  await planFileStore.removeItem(planId)
}

/**
 * Get plan metadata by ID
 * @param {string} planId
 */
export function getPlanMeta(planId) {
  return loadPlansMeta().find(p => p.id === planId) || null
}

// ─── Thumbnail management ──────────────────────────────────────────────────

/**
 * Save a thumbnail data URL for a plan
 * @param {string} planId
 * @param {string} dataUrl - base64 data URL (image/png)
 */
export async function savePlanThumbnail(planId, dataUrl) {
  await planThumbStore.setItem(planId, dataUrl)
}

/**
 * Get a plan thumbnail data URL
 * @param {string} planId
 * @returns {Promise<string|null>}
 */
export async function getPlanThumbnail(planId) {
  return await planThumbStore.getItem(planId)
}

// ─── Annotation change notifications ─────────────────────────────────────────
// Minimal pub/sub so viewers and workspace can react to external marker changes
// (e.g., DetectionReviewPanel applying markers while a viewer is open).
const _annotListeners = new Map() // planId → Set<callback>

/**
 * Subscribe to annotation changes for a specific planId.
 * Callback receives { planId, markers } when savePlanAnnotations is called.
 * @param {string} planId
 * @param {function} callback
 * @returns {function} unsubscribe function
 */
export function onAnnotationsChanged(planId, callback) {
  if (!_annotListeners.has(planId)) _annotListeners.set(planId, new Set())
  _annotListeners.get(planId).add(callback)
  return () => {
    const s = _annotListeners.get(planId)
    if (s) { s.delete(callback); if (s.size === 0) _annotListeners.delete(planId) }
  }
}

function _notifyAnnotListeners(planId, annotations) {
  const s = _annotListeners.get(planId)
  if (s) {
    for (const cb of s) {
      try { cb({ planId, markers: annotations.markers || [] }) } catch (e) {
        console.warn('[planStore] annotation listener error:', e)
      }
    }
  }
}

// ─── Annotation management (markers, measurements, scale) ──────────────────

/**
 * Save plan annotations
 * @param {string} planId
 * @param {Object} annotations - { markers: [], measurements: [], scale: {}, cableRoutes: [] }
 * @param {Object} [opts] - { silent: true } to skip notification (used by viewer unmount save)
 */
export async function savePlanAnnotations(planId, annotations, opts) {
  await planAnnotStore.setItem(planId, annotations)
  // Update plan meta to reflect counts
  const meta = loadPlansMeta()
  const idx = meta.findIndex(p => p.id === planId)
  if (idx >= 0) {
    meta[idx].markerCount = annotations.markers?.length || 0
    meta[idx].measureCount = annotations.measurements?.length || 0
    meta[idx].hasScale = !!annotations.scale?.calibrated
    savePlansMeta(meta)
  }
  // Notify listeners (unless silent — used by viewer unmount to avoid infinite loops)
  if (!opts?.silent) {
    _notifyAnnotListeners(planId, annotations)
  }
}

/**
 * Get plan annotations
 * @param {string} planId
 * @returns {Promise<Object|null>}
 */
export async function getPlanAnnotations(planId) {
  return await planAnnotStore.getItem(planId) || {
    markers: [],
    measurements: [],
    scale: { factor: null, calibrated: false },
    cableRoutes: [],
    ceilingHeight: 3.0,
    socketHeight: 0.3,
  }
}

/**
 * Update plan metadata
 * @param {string} planId
 * @param {Object} updates - partial plan object
 */
export function updatePlanMeta(planId, updates) {
  const meta = loadPlansMeta()
  const idx = meta.findIndex(p => p.id === planId)
  if (idx >= 0) {
    meta[idx] = { ...meta[idx], ...updates }
    savePlansMeta(meta)
  }
}

// ─── SHA-256 File Hashing ────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a File or Blob
 * @param {File|Blob} file
 * @returns {Promise<string>} hex hash
 */
export async function hashFile(file) {
  const buffer = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Parse Cache (IndexedDB) ─────────────────────────────────────────────────

/**
 * Save a parse result to the cache (keyed by file hash)
 * @param {string} fileHash - SHA-256 hex
 * @param {Object} parseResult - { blocks, lengths, layers, summary, ... }
 */
export async function cacheParseResult(fileHash, parseResult) {
  await parseCacheStore.setItem(`pc_${fileHash}`, {
    ...parseResult,
    _cachedAt: Date.now(),
  })
}

/**
 * Get a cached parse result by file hash
 * @param {string} fileHash - SHA-256 hex
 * @returns {Promise<Object|null>}
 */
export async function getCachedParseResult(fileHash) {
  return await parseCacheStore.getItem(`pc_${fileHash}`)
}

/**
 * Save parse result to both cache AND plan metadata
 * @param {string} planId
 * @param {string} fileHash
 * @param {Object} parseResult
 */
export async function saveParseResult(planId, fileHash, parseResult) {
  // Cache by hash (so same file → instant hit regardless of plan)
  await cacheParseResult(fileHash, parseResult)

  // Update plan metadata
  updatePlanMeta(planId, {
    fileHash,
    parsedAt: Date.now(),
    parseResult: {
      blocks: parseResult.blocks || [],
      summary: parseResult.summary || {},
    },
  })
}

/**
 * Cache-aware parse: checks hash first, only parses if not cached
 * @param {string} planId
 * @param {File|Blob} file
 * @param {function} parseFn - async (dxfText) => parseResult
 * @returns {Promise<{parseResult: Object, fromCache: boolean}>}
 */
export async function getOrParse(planId, file, parseFn) {
  // 1. Hash
  const fileHash = await hashFile(file)

  // 2. Check cache
  const cached = await getCachedParseResult(fileHash)
  if (cached) {
    // Update plan meta with cached result
    updatePlanMeta(planId, {
      fileHash,
      parsedAt: cached._cachedAt || Date.now(),
      parseResult: {
        blocks: cached.blocks || [],
        summary: cached.summary || {},
      },
    })
    return { parseResult: cached, fromCache: true }
  }

  // 3. Parse (slow path)
  const dxfText = await file.text()
  const parseResult = await parseFn(dxfText)

  // 4. Save to cache + plan meta
  await saveParseResult(planId, fileHash, parseResult)

  return { parseResult, fromCache: false }
}

// ─── Project Block Dictionary ─────────────────────────────────────────────────
// Stores user-assigned blockName → asmId mappings per project.
// When a user manually assigns an unknown block to an assembly, it's saved here
// so all future DXF files in the same project auto-apply the mapping.

const BLOCK_DICT_PREFIX = 'takeoffpro_block_dict_'

function _normBlockName(name) {
  return (name || '').toUpperCase().replace(/[_\-\.]/g, ' ').trim()
}

/**
 * Load the block dictionary for a project
 * @param {string} projectId
 * @returns {Object} { normalizedBlockName: asmId }
 */
export function loadBlockDictionary(projectId) {
  if (!projectId) return {}
  try {
    const raw = localStorage.getItem(BLOCK_DICT_PREFIX + projectId)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

/**
 * Save a block→assembly mapping to the project dictionary
 * @param {string} projectId
 * @param {string} blockName - raw block name (will be normalized)
 * @param {string|null} asmId - assembly ID or null to remove
 */
export function saveBlockMapping(projectId, blockName, asmId) {
  if (!projectId) return
  const dict = loadBlockDictionary(projectId)
  const key = _normBlockName(blockName)
  if (!key) return
  if (asmId) {
    dict[key] = asmId
  } else {
    delete dict[key]
  }
  try {
    localStorage.setItem(BLOCK_DICT_PREFIX + projectId, JSON.stringify(dict))
  } catch (err) {
    console.warn('[planStore] block dictionary save failed:', err.message)
  }
}

/**
 * Look up a block name in the project dictionary
 * @param {string} projectId
 * @param {string} blockName
 * @returns {string|null} asmId or null
 */
export function lookupBlockInDictionary(projectId, blockName) {
  if (!projectId) return null
  const dict = loadBlockDictionary(projectId)
  return dict[_normBlockName(blockName)] || null
}

/**
 * Bulk-apply project dictionary to recognized items
 * @param {string} projectId
 * @param {Array} items - [{blockName, qty, asmId, confidence, ...}]
 * @returns {Array} items with dictionary-applied asmId where applicable
 */
export function applyBlockDictionary(projectId, items) {
  if (!projectId || !items?.length) return items
  const dict = loadBlockDictionary(projectId)
  if (!Object.keys(dict).length) return items
  return items.map(item => {
    if (item.asmId && item.confidence > 0.5) return item // already recognized well
    const dictAsmId = dict[_normBlockName(item.blockName)]
    if (dictAsmId) {
      return { ...item, asmId: dictAsmId, confidence: 0.85, matchType: 'dictionary', _dictApplied: true }
    }
    return item
  })
}
