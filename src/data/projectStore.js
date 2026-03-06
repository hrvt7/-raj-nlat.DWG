// ─── Project Store ────────────────────────────────────────────────────────────
// Stores project metadata for organizing plans + legends per construction site.
// Each project = { id, name, description, legendPlanId, createdAt }
// Stored in localStorage for quick sync access.

const LS_KEY = 'takeoffpro_projects_meta'

function loadMeta() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

function saveMeta(projects) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects))
  } catch (err) {
    console.error('[projectStore] save failed:', err)
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
  const all = loadMeta().filter(p => p.id !== projectId)
  saveMeta(all)
}

/**
 * Update project metadata (partial).
 * @param {string} projectId
 * @param {Object} updates
 */
export function updateProject(projectId, updates) {
  const all = loadMeta()
  const idx = all.findIndex(p => p.id === projectId)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates }
    saveMeta(all)
  }
}
