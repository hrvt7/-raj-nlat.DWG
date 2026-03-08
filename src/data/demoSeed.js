// ─── Demo Seed Data ──────────────────────────────────────────────────────────
// Creates DEMO-prefixed sample data for sales demos and first-launch experience.
// All demo items use 'DEMO-' prefix for easy identification and removal.
// No file blobs are created — only metadata in localStorage.

import { saveProject, loadProjects } from './projectStore.js'

const DEMO_PREFIX = 'DEMO-'
const DEMO_PROJECT_ID = 'DEMO-PRJ-001'

// ── Seed data definitions ────────────────────────────────────────────────────

function createDemoProject() {
  return {
    id: DEMO_PROJECT_ID,
    name: 'DEMO – Szombathely, Kossuth u. 12.',
    description: 'Bemutató projekt: 3 szintes irodaház villamos felújítás',
    legendPlanId: null,
    defaultQuoteOutputMode: 'combined',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), // 1 week ago
  }
}

function createDemoPlans() {
  return [
    {
      id: 'DEMO-PLN-001',
      name: 'DEMO – Fsz. világítás terv',
      fileType: 'dxf',
      fileSize: 2450000,
      units: 'mm',
      projectId: DEMO_PROJECT_ID,
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      markerCount: 24,
      measureCount: 3,
      hasScale: true,
      floor: 'Fsz',
      discipline: 'Világítás',
      parseResult: {
        blocks: [
          { name: 'LÁMPA_LED_60x60', count: 18, layer: 'VILÁGÍTÁS' },
          { name: 'LÁMPA_FALI', count: 6, layer: 'VILÁGÍTÁS' },
          { name: 'KAPCSOLÓ_1G', count: 4, layer: 'KAPCSOLÓK' },
          { name: 'KAPCSOLÓ_2G', count: 2, layer: 'KAPCSOLÓK' },
        ],
        summary: { totalBlocks: 30, totalLayers: 2, fileSize: '2.3 MB' },
      },
    },
    {
      id: 'DEMO-PLN-002',
      name: 'DEMO – Fsz. erősáram terv',
      fileType: 'dxf',
      fileSize: 1870000,
      units: 'mm',
      projectId: DEMO_PROJECT_ID,
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      markerCount: 16,
      measureCount: 2,
      hasScale: true,
      floor: 'Fsz',
      discipline: 'Erősáram',
      parseResult: {
        blocks: [
          { name: 'DUGALJ_2P_F', count: 12, layer: 'ERŐSÁRAM' },
          { name: 'DUGALJ_IP44', count: 3, layer: 'ERŐSÁRAM' },
          { name: 'ELOSZTÓ_24M', count: 1, layer: 'ELOSZTÓK' },
        ],
        summary: { totalBlocks: 16, totalLayers: 2, fileSize: '1.8 MB' },
      },
    },
  ]
}

function createDemoQuotes() {
  const year = new Date().getFullYear()
  return [
    {
      id: `DEMO-QT-${year}-001`,
      project_name: 'DEMO – Szombathely, Kossuth u. 12.',
      client_name: 'DEMO Kft.',
      status: 'sent',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      files_count: 2,
      summary: {
        grandTotal: 2850000,
        totalWorkHours: 86,
        materialTotal: 1420000,
        laborTotal: 774000,
        overheadTotal: 7000,
        markupTotal: 330150,
        totalItems: 46,
      },
      items: [],
      notes: 'Bemutató ajánlat – a mennyiségek és árak illusztrációs célúak.',
    },
    {
      id: `DEMO-QT-${year}-002`,
      project_name: 'DEMO – Szombathely, Kossuth u. 12.',
      client_name: 'DEMO Kft.',
      status: 'won',
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      files_count: 1,
      summary: {
        grandTotal: 1240000,
        totalWorkHours: 38,
        materialTotal: 620000,
        laborTotal: 342000,
        overheadTotal: 7000,
        markupTotal: 145350,
        totalItems: 22,
      },
      items: [],
      notes: 'Bemutató ajánlat – 1. emelet világítás',
    },
  ]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if demo data has been seeded.
 */
export function isDemoSeeded() {
  const projects = loadProjects()
  return projects.some(p => p.id === DEMO_PROJECT_ID)
}

/**
 * Check if any demo data exists in the system.
 */
export function hasDemoData() {
  const projects = loadProjects()
  let quotes = []
  try { quotes = JSON.parse(localStorage.getItem('takeoffpro_quotes') || '[]') } catch {}
  return projects.some(p => p.id?.startsWith(DEMO_PREFIX)) ||
         quotes.some(q => q.id?.startsWith(DEMO_PREFIX))
}

/**
 * Seed demo data into localStorage.
 * Idempotent — skips if already seeded.
 * @returns {{ seeded: boolean, projectId: string }}
 */
export function seedDemoData() {
  if (isDemoSeeded()) {
    return { seeded: false, projectId: DEMO_PROJECT_ID }
  }

  // 1. Project
  saveProject(createDemoProject())

  // 2. Plans — save to localStorage only (no IndexedDB file blobs)
  const plans = createDemoPlans()
  const LS_KEY = 'takeoffpro_plans_meta'
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    const merged = [...plans, ...existing]
    localStorage.setItem(LS_KEY, JSON.stringify(merged))
  } catch (err) {
    console.warn('[demoSeed] plan save failed:', err)
  }

  // 3. Quotes — direct localStorage to avoid store.js module caching issues
  const demoQuotes = createDemoQuotes()
  const LS_QUOTES = 'takeoffpro_quotes'
  try {
    const existing = JSON.parse(localStorage.getItem(LS_QUOTES) || '[]')
    localStorage.setItem(LS_QUOTES, JSON.stringify([...demoQuotes, ...existing]))
  } catch (err) {
    console.warn('[demoSeed] quote save failed:', err)
  }

  return { seeded: true, projectId: DEMO_PROJECT_ID }
}

/**
 * Remove all DEMO-prefixed data.
 * @returns {{ removedProjects: number, removedPlans: number, removedQuotes: number }}
 */
export function clearDemoData() {
  let removedProjects = 0
  let removedPlans = 0
  let removedQuotes = 0

  // Projects
  const LS_PROJ = 'takeoffpro_projects_meta'
  try {
    const projects = JSON.parse(localStorage.getItem(LS_PROJ) || '[]')
    const filtered = projects.filter(p => !p.id?.startsWith(DEMO_PREFIX))
    removedProjects = projects.length - filtered.length
    localStorage.setItem(LS_PROJ, JSON.stringify(filtered))
  } catch (err) { console.warn('[demoSeed] project cleanup failed:', err) }

  // Plans
  const LS_PLANS = 'takeoffpro_plans_meta'
  try {
    const plans = JSON.parse(localStorage.getItem(LS_PLANS) || '[]')
    const filtered = plans.filter(p => !p.id?.startsWith(DEMO_PREFIX))
    removedPlans = plans.length - filtered.length
    localStorage.setItem(LS_PLANS, JSON.stringify(filtered))
  } catch (err) { console.warn('[demoSeed] plan cleanup failed:', err) }

  // Quotes
  const LS_QUOTES = 'takeoffpro_quotes'
  try {
    const quotes = JSON.parse(localStorage.getItem(LS_QUOTES) || '[]')
    const filteredQ = quotes.filter(q => !q.id?.startsWith(DEMO_PREFIX))
    removedQuotes = quotes.length - filteredQ.length
    localStorage.setItem(LS_QUOTES, JSON.stringify(filteredQ))
  } catch (err) { console.warn('[demoSeed] quote cleanup failed:', err) }

  return { removedProjects, removedPlans, removedQuotes }
}

/**
 * Get the demo project ID constant.
 */
export function getDemoProjectId() {
  return DEMO_PROJECT_ID
}
