// ─── DetectionRunStore — Regression Tests ────────────────────────────────────
// Tests CRUD operations, project filtering, auto-pruning, and marker linking
// against an in-memory localforage mock.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── In-memory localforage mock ───────────────────────────────────────────────
let store = {}
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (k) => store[k] ?? null,
      setItem: async (k, v) => { store[k] = structuredClone(v) },
      removeItem: async (k) => { delete store[k] },
      iterate: async (cb) => { for (const v of Object.values(store)) cb(v) },
    }),
  },
}))

// Import after mock is set up
import {
  generateRunId,
  createDetectionRun,
  getDetectionRun,
  updateDetectionRun,
  listDetectionRuns,
  deleteDetectionRun,
  linkDetectionToMarker,
} from '../data/detectionRunStore.js'

beforeEach(() => { store = {} })

// ─── generateRunId ───────────────────────────────────────────────────────────

describe('generateRunId', () => {
  it('returns a string starting with DRUN-', () => {
    expect(generateRunId()).toMatch(/^DRUN-/)
  })

  it('returns unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateRunId()))
    expect(ids.size).toBe(20)
  })
})

// ─── createDetectionRun ──────────────────────────────────────────────────────

describe('createDetectionRun', () => {
  it('creates a run with correct initial fields', async () => {
    const run = await createDetectionRun({
      projectId: 'P1',
      planIds: ['plan-a'],
      templateIds: ['tpl-1'],
    })
    expect(run.id).toMatch(/^DRUN-/)
    expect(run.projectId).toBe('P1')
    expect(run.planIds).toEqual(['plan-a'])
    expect(run.templateIds).toEqual(['tpl-1'])
    expect(run.status).toBe('running')
    expect(run.results).toEqual([])
    expect(run.completedAt).toBeNull()
    expect(run.startedAt).toBeTruthy()
    expect(run.createdAt).toBeTruthy()
  })

  it('persists the run so getDetectionRun can retrieve it', async () => {
    const run = await createDetectionRun({ projectId: 'P1', planIds: [], templateIds: [] })
    const loaded = await getDetectionRun(run.id)
    expect(loaded).not.toBeNull()
    expect(loaded.id).toBe(run.id)
    expect(loaded.projectId).toBe('P1')
  })

  it('defaults missing fields gracefully', async () => {
    const run = await createDetectionRun({})
    expect(run.projectId).toBeNull()
    expect(run.planIds).toEqual([])
    expect(run.templateIds).toEqual([])
  })
})

// ─── getDetectionRun ─────────────────────────────────────────────────────────

describe('getDetectionRun', () => {
  it('returns null for non-existent ID', async () => {
    expect(await getDetectionRun('DRUN-NOPE')).toBeNull()
  })
})

// ─── updateDetectionRun ──────────────────────────────────────────────────────

describe('updateDetectionRun', () => {
  it('merges patch fields into existing run', async () => {
    const run = await createDetectionRun({ projectId: 'P1', planIds: [], templateIds: [] })
    const updated = await updateDetectionRun(run.id, {
      status: 'completed',
      completedAt: '2026-01-01T00:00:00Z',
      results: [{ id: 'r1', score: 0.95 }],
    })
    expect(updated.status).toBe('completed')
    expect(updated.completedAt).toBe('2026-01-01T00:00:00Z')
    expect(updated.results).toHaveLength(1)
    // Original fields preserved
    expect(updated.projectId).toBe('P1')
  })

  it('returns null when run does not exist', async () => {
    expect(await updateDetectionRun('DRUN-NOPE', { status: 'failed' })).toBeNull()
  })

  it('persists the update for subsequent reads', async () => {
    const run = await createDetectionRun({ projectId: 'P2', planIds: [], templateIds: [] })
    await updateDetectionRun(run.id, { status: 'failed' })
    const reloaded = await getDetectionRun(run.id)
    expect(reloaded.status).toBe('failed')
  })
})

// ─── listDetectionRuns ───────────────────────────────────────────────────────

describe('listDetectionRuns', () => {
  it('returns only runs for the requested project', async () => {
    await createDetectionRun({ projectId: 'A', planIds: [], templateIds: [] })
    await createDetectionRun({ projectId: 'B', planIds: [], templateIds: [] })
    await createDetectionRun({ projectId: 'A', planIds: [], templateIds: [] })

    const runsA = await listDetectionRuns('A')
    const runsB = await listDetectionRuns('B')
    expect(runsA).toHaveLength(2)
    expect(runsB).toHaveLength(1)
    expect(runsA.every(r => r.projectId === 'A')).toBe(true)
  })

  it('returns runs sorted newest first (by startedAt)', async () => {
    // Create 3 runs with explicit staggered timestamps
    const r1 = await createDetectionRun({ projectId: 'X', planIds: [], templateIds: [] })
    await updateDetectionRun(r1.id, { startedAt: '2026-01-01T00:00:00Z' })

    const r2 = await createDetectionRun({ projectId: 'X', planIds: [], templateIds: [] })
    await updateDetectionRun(r2.id, { startedAt: '2026-01-03T00:00:00Z' })

    const r3 = await createDetectionRun({ projectId: 'X', planIds: [], templateIds: [] })
    await updateDetectionRun(r3.id, { startedAt: '2026-01-02T00:00:00Z' })

    const runs = await listDetectionRuns('X')
    expect(runs[0].id).toBe(r2.id) // newest
    expect(runs[1].id).toBe(r3.id)
    expect(runs[2].id).toBe(r1.id) // oldest
  })

  it('auto-prunes runs beyond the 5-run limit', async () => {
    // Create 7 runs for the same project
    const ids = []
    for (let i = 0; i < 7; i++) {
      const r = await createDetectionRun({ projectId: 'PRUNE', planIds: [], templateIds: [] })
      await updateDetectionRun(r.id, { startedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })
      ids.push(r.id)
    }

    const runs = await listDetectionRuns('PRUNE')
    expect(runs).toHaveLength(5)

    // The two oldest (index 0, 1) should have been pruned
    expect(await getDetectionRun(ids[0])).toBeNull()
    expect(await getDetectionRun(ids[1])).toBeNull()
    // The 5 newest should survive
    for (const r of runs) {
      expect(await getDetectionRun(r.id)).not.toBeNull()
    }
  })

  it('returns empty array for project with no runs', async () => {
    expect(await listDetectionRuns('EMPTY')).toEqual([])
  })
})

// ─── deleteDetectionRun ──────────────────────────────────────────────────────

describe('deleteDetectionRun', () => {
  it('removes the run so get returns null', async () => {
    const run = await createDetectionRun({ projectId: 'D', planIds: [], templateIds: [] })
    await deleteDetectionRun(run.id)
    expect(await getDetectionRun(run.id)).toBeNull()
  })

  it('does not throw for non-existent ID', async () => {
    await expect(deleteDetectionRun('DRUN-NOPE')).resolves.toBeUndefined()
  })
})

// ─── linkDetectionToMarker ───────────────────────────────────────────────────

describe('linkDetectionToMarker', () => {
  it('sets markerId on the matching detection result', async () => {
    const run = await createDetectionRun({ projectId: 'L', planIds: [], templateIds: [] })
    await updateDetectionRun(run.id, {
      results: [
        { id: 'det-1', score: 0.9 },
        { id: 'det-2', score: 0.8 },
      ],
    })

    await linkDetectionToMarker(run.id, 'det-2', 'marker-xyz')

    const reloaded = await getDetectionRun(run.id)
    expect(reloaded.results.find(r => r.id === 'det-2').markerId).toBe('marker-xyz')
    // Other result untouched
    expect(reloaded.results.find(r => r.id === 'det-1').markerId).toBeUndefined()
  })

  it('is a no-op for non-existent run', async () => {
    // Should not throw
    await expect(linkDetectionToMarker('DRUN-NOPE', 'det-1', 'mk-1')).resolves.toBeUndefined()
  })

  it('is a no-op for non-existent result id within run', async () => {
    const run = await createDetectionRun({ projectId: 'L2', planIds: [], templateIds: [] })
    await updateDetectionRun(run.id, { results: [{ id: 'det-1', score: 0.9 }] })

    await linkDetectionToMarker(run.id, 'NONEXISTENT', 'mk-1')

    const reloaded = await getDetectionRun(run.id)
    expect(reloaded.results[0].markerId).toBeUndefined()
  })
})
