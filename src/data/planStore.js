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

// ─── Annotation management (markers, measurements, scale) ──────────────────

/**
 * Save plan annotations
 * @param {string} planId
 * @param {Object} annotations - { markers: [], measurements: [], scale: {}, cableRoutes: [] }
 */
export async function savePlanAnnotations(planId, annotations) {
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
