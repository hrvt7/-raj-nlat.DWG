// ─── Project Store ────────────────────────────────────────────────────────────
// Stores project metadata for organizing plans + legends per construction site.
// Each project = { id, name, description, legendPlanId, createdAt, defaultQuoteOutputMode? }
// Stored in localStorage for quick sync access.

const LS_KEY = 'takeoffpro_projects_meta'

function loadMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch (err) { console.warn('[projectStore] load failed:', err); return [] }
}

function saveMeta(projects) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects))
  } catch (err) {
    console.error('[projectStore] save failed:', err)
    window.dispatchEvent(new CustomEvent('takeoffpro:storage-error', { detail: { error: err.message } }))
  }
}

// ── ID generator ──────────────────────────────────────────────────────────────

export function generateProjectId() {
  return 'PRJ-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save or update a project.
 * @param {Object} project - { id, name, description?, legendPlanId?, createdAt }
 */
export function saveProject(project) {
  const all = loadMeta()
  const idx = all.findIndex(p => p.id === project.id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...project }
  } else {
    all.unshift(project)
  }
  saveMeta(all)
  return project
}

/**
 * Load all projects.
 */
export function loadProjects() {
  return loadMeta()
}

/**
 * Get a single project by ID.
 * @param {string} projectId
 */
export function getProject(projectId) {
  return loadMeta().find(p => p.id === projectId) || null
}

/**
 * Delete a project.
 * @param {string} projectId
 */
export function deleteProject(projectId) {
  const before = loadMeta()
  const after = before.filter(p => p.id !== projectId)
  saveMeta(after)
  return after.length < before.length  // true if actually removed
}

/**
 * Update project metadata (partial).
 * @param {string} projectId
 * @param {Object} updates
 * @returns {boolean} true if project found and updated
 */
export function updateProject(projectId, updates) {
  const all = loadMeta()
  const idx = all.findIndex(p => p.id === projectId)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates }
    saveMeta(all)
    return true
  }
  return false
}

// ── Fallback project ────────────────────────────────────────────────────────
// When a project is deleted, its plans are moved to this catch-all project
// rather than being orphaned (projectId = undefined).
export const FALLBACK_PROJECT_ID = 'PRJ-imported'

/**
 * Ensure the fallback "Importált tervek" project exists and return its ID.
 */
export function ensureFallbackProject() {
  const existing = loadMeta().find(p => p.id === FALLBACK_PROJECT_ID)
  if (existing) return FALLBACK_PROJECT_ID
  saveMeta([
    ...loadMeta(),
    {
      id: FALLBACK_PROJECT_ID,
      name: 'Importált tervek',
      description: 'Törölt projektekből ide kerülnek a tervrajzok',
      legendPlanId: null,
      defaultQuoteOutputMode: 'combined',
      createdAt: new Date().toISOString(),
    },
  ])
  return FALLBACK_PROJECT_ID
}
