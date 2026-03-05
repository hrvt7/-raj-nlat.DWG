// ─── Legend Store ──────────────────────────────────────────────────────────────
// Stores symbol templates extracted from legend PDFs.
// Each template = { id, category, label, color, imageData (base64 PNG), width, height, createdAt }
// Stored in IndexedDB via localforage.

import localforage from 'localforage'

const legendTemplateStore = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'legend_templates',
  description: 'Symbol templates cropped from legend PDFs',
})

const LS_LEGEND_KEY = 'takeoffpro_legend_templates_meta'

// ── Metadata helpers (localStorage) ──────────────────────────────────────────

function loadMeta() {
  try {
    const raw = localStorage.getItem(LS_LEGEND_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveMeta(templates) {
  try {
    localStorage.setItem(LS_LEGEND_KEY, JSON.stringify(templates))
  } catch (err) {
    console.error('[legendStore] save failed:', err)
  }
}

// ── ID generator ──────────────────────────────────────────────────────────────

export function generateTemplateId() {
  return 'TPL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a new template.
 * @param {Object} meta - { id, category, label, color, width, height, createdAt }
 * @param {string} imageDataUrl - base64 PNG data URL of the cropped symbol
 */
export async function saveTemplate(meta, imageDataUrl) {
  const all = loadMeta()
  const existing = all.findIndex(t => t.id === meta.id)
  if (existing >= 0) {
    all[existing] = { ...all[existing], ...meta }
  } else {
    all.unshift(meta)
  }
  saveMeta(all)
  await legendTemplateStore.setItem(meta.id, imageDataUrl)
  return meta
}

/**
 * Load all template metadata (no image data).
 */
export function loadTemplates() {
  return loadMeta()
}

/**
 * Get the image data URL for a template.
 * @param {string} templateId
 * @returns {Promise<string|null>}
 */
export async function getTemplateImage(templateId) {
  return await legendTemplateStore.getItem(templateId)
}

/**
 * Delete a template.
 * @param {string} templateId
 */
export async function deleteTemplate(templateId) {
  const all = loadMeta().filter(t => t.id !== templateId)
  saveMeta(all)
  await legendTemplateStore.removeItem(templateId)
}

/**
 * Load all templates with their image data.
 * @returns {Promise<Array>} Array of { ...meta, imageDataUrl }
 */
export async function loadTemplatesWithImages() {
  const metas = loadMeta()
  const result = []
  for (const meta of metas) {
    const imageDataUrl = await legendTemplateStore.getItem(meta.id)
    result.push({ ...meta, imageDataUrl })
  }
  return result
}

/**
 * Delete all templates (reset).
 */
export async function clearAllTemplates() {
  saveMeta([])
  await legendTemplateStore.clear()
}
