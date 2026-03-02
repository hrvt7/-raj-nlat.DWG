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

const LS_KEY = 'takeoffpro_plans_meta'

// ─── Plan metadata (localStorage) ────────────────────────────────────────────

function loadPlansMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function savePlansMeta(plans) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(plans)) } catch {}
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
