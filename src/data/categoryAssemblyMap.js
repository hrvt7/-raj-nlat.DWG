// ─── Category → Assembly Default Map ─────────────────────────────────────────
// Persists the last assembly assigned to each detection category (per project).
// When detection markers arrive without assembly bindings, this map provides
// sensible defaults so the calculation pipeline can price them immediately.
//
// Storage: localStorage key per project (or global fallback).
// Shape: { [category]: assemblyId }   e.g. { socket: 'ASM-003', light: 'ASM-017' }

const LS_PREFIX = 'takeoffpro_cat_asm_map'

function storageKey(projectId) {
  return projectId ? `${LS_PREFIX}_${projectId}` : `${LS_PREFIX}_global`
}

/**
 * Load saved category → assembly defaults.
 * @param {string|null} projectId
 * @returns {Object} { [category]: assemblyId }
 */
export function loadCategoryAssemblyMap(projectId = null) {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (raw) return JSON.parse(raw)
    // Fallback: if project-specific not found, try global
    if (projectId) {
      const global = localStorage.getItem(storageKey(null))
      return global ? JSON.parse(global) : {}
    }
    return {}
  } catch { return {} }
}

/**
 * Save a single category → assembly mapping (merge into existing).
 * Saves both project-specific AND global so future projects inherit.
 * @param {string} category — e.g. 'socket', 'switch', 'light'
 * @param {string|null} assemblyId — e.g. 'ASM-003' or null to clear
 * @param {string|null} projectId
 */
export function saveCategoryAssemblyDefault(category, assemblyId, projectId = null) {
  if (!category) return
  try {
    // Project-specific
    const projMap = loadCategoryAssemblyMap(projectId)
    if (assemblyId) {
      projMap[category] = assemblyId
    } else {
      delete projMap[category]
    }
    localStorage.setItem(storageKey(projectId), JSON.stringify(projMap))

    // Also save to global (latest wins — cross-project learning)
    if (projectId) {
      const globalMap = loadCategoryAssemblyMap(null)
      if (assemblyId) {
        globalMap[category] = assemblyId
      } else {
        delete globalMap[category]
      }
      localStorage.setItem(storageKey(null), JSON.stringify(globalMap))
    }
  } catch { /* localStorage full — non-critical */ }
}

/**
 * Save an entire assignments object as category defaults (batch).
 * Used when EstimationPanel's assignments change.
 * @param {Object} assignments — { [category]: { assemblyId, ... } }
 * @param {string|null} projectId
 */
export function saveCategoryAssemblyBatch(assignments, projectId = null) {
  if (!assignments || typeof assignments !== 'object') return
  for (const [cat, asgn] of Object.entries(assignments)) {
    if (asgn?.assemblyId) {
      saveCategoryAssemblyDefault(cat, asgn.assemblyId, projectId)
    }
  }
}

/**
 * Given current assignments and a category→assembly default map,
 * return merged assignments where missing categories get defaults.
 * Only fills in categories that have NO existing assemblyId.
 * @param {Object} currentAssignments — { [category]: { assemblyId, ... } }
 * @param {Object} defaults — { [category]: assemblyId }
 * @returns {Object} merged assignments (new object if anything was added, same ref if no changes)
 */
export function applyDefaultAssignments(currentAssignments, defaults) {
  if (!defaults || Object.keys(defaults).length === 0) return currentAssignments

  let changed = false
  const merged = { ...currentAssignments }

  for (const [cat, asmId] of Object.entries(defaults)) {
    if (!asmId) continue
    const existing = merged[cat]
    if (!existing?.assemblyId) {
      merged[cat] = { ...(existing || {}), assemblyId: asmId }
      changed = true
    }
  }

  return changed ? merged : currentAssignments
}
