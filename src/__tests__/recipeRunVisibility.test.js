// ─── Recipe Run Visibility + Lightweight Run History — Regression Tests ──────
// Covers:
//   1. Run record shape (all fields present with correct types)
//   2. Recent-run list: limit, ordering, persistence
//   3. Undo state reflection in run records
//   4. Assembly aggregation in run summary
//   5. Architecture boundary: no DetectionRun / LegendStore / Quote coupling
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock localStorage ───────────────────────────────────────────────────────
const storage = {}
const localStorageMock = {
  getItem: vi.fn((key) => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val }),
  removeItem: vi.fn((key) => { delete storage[key] }),
  clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]) }),
}
vi.stubGlobal('localStorage', localStorageMock)

import {
  generateRunId,
  createRunRecord,
  saveRun,
  getRunsByPlan,
  getLastRun,
  updateRun,
  markRunUndone,
  getRunByBatchId,
  clearRunsForPlan,
  clearAllRuns,
} from '../data/recipeRunStore.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRun(planId, overrides = {}) {
  return createRunRecord({ planId, ...overrides })
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

describe('recipeRunStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    Object.keys(storage).forEach(k => delete storage[k])
  })

  // ── 1. Run record shape ─────────────────────────────────────────────────

  describe('run record shape', () => {
    it('creates a record with all required fields', () => {
      const run = createRunRecord({ planId: 'PLAN-1' })

      expect(run.runId).toMatch(/^RUN-/)
      expect(run.planId).toBe('PLAN-1')
      expect(run.createdAt).toBeTruthy()
      expect(run.scope).toBe('whole_plan')
      expect(Array.isArray(run.recipeIds)).toBe(true)
      expect(typeof run.recipeCount).toBe('number')
      expect(typeof run.totalMatches).toBe('number')
      expect(typeof run.acceptedCount).toBe('number')
      expect(typeof run.appliedMarkerCount).toBe('number')
      expect(typeof run.skippedCount).toBe('number')
      expect(typeof run.assemblySummary).toBe('object')
      expect(run.batchId).toBeNull()
      expect(run.undoAvailable).toBe(false)
      expect(run.undoneAt).toBeNull()
    })

    it('respects overrides', () => {
      const run = createRunRecord({
        planId: 'PLAN-1',
        scope: 'current_page',
        recipeCount: 3,
        totalMatches: 15,
        appliedMarkerCount: 10,
        skippedCount: 2,
        assemblySummary: { 'Dugalj': 5, 'Kapcsoló': 5 },
        batchId: 'BAT-abc',
        undoAvailable: true,
      })

      expect(run.scope).toBe('current_page')
      expect(run.recipeCount).toBe(3)
      expect(run.totalMatches).toBe(15)
      expect(run.appliedMarkerCount).toBe(10)
      expect(run.skippedCount).toBe(2)
      expect(run.assemblySummary).toEqual({ 'Dugalj': 5, 'Kapcsoló': 5 })
      expect(run.batchId).toBe('BAT-abc')
      expect(run.undoAvailable).toBe(true)
    })

    it('generates unique run IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 50; i++) ids.add(generateRunId())
      expect(ids.size).toBe(50)
    })
  })

  // ── 2. Recent-run list: limit, ordering, persistence ────────────────────

  describe('recent-run list', () => {
    it('returns runs newest-first', () => {
      const planId = 'PLAN-ORDER'
      const r1 = makeRun(planId, { createdAt: '2025-01-01T10:00:00Z' })
      const r2 = makeRun(planId, { createdAt: '2025-01-01T12:00:00Z' })
      const r3 = makeRun(planId, { createdAt: '2025-01-01T11:00:00Z' })
      saveRun(r1)
      saveRun(r2)
      saveRun(r3)

      const runs = getRunsByPlan(planId)
      expect(runs.length).toBe(3)
      expect(runs[0].createdAt).toBe('2025-01-01T12:00:00Z')
      expect(runs[1].createdAt).toBe('2025-01-01T11:00:00Z')
      expect(runs[2].createdAt).toBe('2025-01-01T10:00:00Z')
    })

    it('enforces MAX_RUNS_PER_PLAN = 10', () => {
      const planId = 'PLAN-LIMIT'
      for (let i = 0; i < 15; i++) {
        saveRun(makeRun(planId, { createdAt: `2025-01-01T${String(i).padStart(2, '0')}:00:00Z` }))
      }
      const runs = getRunsByPlan(planId)
      expect(runs.length).toBe(10)
      // Most recent should be preserved
      expect(runs[0].createdAt).toBe('2025-01-01T14:00:00Z')
    })

    it('getLastRun returns newest run', () => {
      const planId = 'PLAN-LAST'
      saveRun(makeRun(planId, { createdAt: '2025-01-01T08:00:00Z' }))
      saveRun(makeRun(planId, { createdAt: '2025-01-01T09:00:00Z' }))

      const last = getLastRun(planId)
      expect(last.createdAt).toBe('2025-01-01T09:00:00Z')
    })

    it('getLastRun returns null for empty plan', () => {
      expect(getLastRun('PLAN-EMPTY')).toBeNull()
    })

    it('persists across calls (localStorage roundtrip)', () => {
      const planId = 'PLAN-PERSIST'
      const run = makeRun(planId, { appliedMarkerCount: 7 })
      saveRun(run)

      // Reading uses a fresh parse
      const runs = getRunsByPlan(planId)
      expect(runs.length).toBe(1)
      expect(runs[0].appliedMarkerCount).toBe(7)
    })

    it('isolates runs between plans', () => {
      saveRun(makeRun('PLAN-A'))
      saveRun(makeRun('PLAN-A'))
      saveRun(makeRun('PLAN-B'))

      expect(getRunsByPlan('PLAN-A').length).toBe(2)
      expect(getRunsByPlan('PLAN-B').length).toBe(1)
    })
  })

  // ── 3. Undo state reflection ────────────────────────────────────────────

  describe('undo state', () => {
    it('markRunUndone sets undoneAt and clears undoAvailable', () => {
      const planId = 'PLAN-UNDO'
      const run = makeRun(planId, { undoAvailable: true, batchId: 'BAT-1' })
      saveRun(run)

      const updated = markRunUndone(planId, run.runId)
      expect(updated.undoAvailable).toBe(false)
      expect(updated.undoneAt).toBeTruthy()

      // Persisted
      const fromStore = getLastRun(planId)
      expect(fromStore.undoAvailable).toBe(false)
      expect(fromStore.undoneAt).toBeTruthy()
    })

    it('updateRun allows partial updates', () => {
      const planId = 'PLAN-UPDATE'
      const run = makeRun(planId, { appliedMarkerCount: 5 })
      saveRun(run)

      updateRun(planId, run.runId, { appliedMarkerCount: 8, skippedCount: 1 })
      const updated = getLastRun(planId)
      expect(updated.appliedMarkerCount).toBe(8)
      expect(updated.skippedCount).toBe(1)
      // Other fields unchanged
      expect(updated.planId).toBe(planId)
    })

    it('updateRun returns null for non-existent runId', () => {
      const result = updateRun('PLAN-GHOST', 'RUN-nope', { appliedMarkerCount: 99 })
      expect(result).toBeNull()
    })
  })

  // ── 4. Assembly aggregation ─────────────────────────────────────────────

  describe('assembly aggregation', () => {
    it('stores and retrieves assemblySummary correctly', () => {
      const planId = 'PLAN-ASM'
      const summary = {
        'Dugalj 230V': 8,
        'Egyp. kapcsoló': 4,
        'LED panel': 2,
      }
      const run = makeRun(planId, { assemblySummary: summary })
      saveRun(run)

      const retrieved = getLastRun(planId)
      expect(retrieved.assemblySummary).toEqual(summary)
      expect(Object.keys(retrieved.assemblySummary).length).toBe(3)
    })

    it('defaults to empty object when no assemblySummary', () => {
      const run = createRunRecord({ planId: 'PLAN-NO-ASM' })
      expect(run.assemblySummary).toEqual({})
    })
  })

  // ── 5. Batch lookup ─────────────────────────────────────────────────────

  describe('batch lookup', () => {
    it('getRunByBatchId finds correct run', () => {
      const planId = 'PLAN-BATCH'
      saveRun(makeRun(planId, { batchId: 'BAT-aaa' }))
      saveRun(makeRun(planId, { batchId: 'BAT-bbb' }))

      const found = getRunByBatchId(planId, 'BAT-aaa')
      expect(found).toBeTruthy()
      expect(found.batchId).toBe('BAT-aaa')
    })

    it('getRunByBatchId returns null for unknown batch', () => {
      expect(getRunByBatchId('PLAN-X', 'BAT-missing')).toBeNull()
    })
  })

  // ── 6. Clear helpers ────────────────────────────────────────────────────

  describe('clear helpers', () => {
    it('clearRunsForPlan removes only target plan', () => {
      saveRun(makeRun('PLAN-C1'))
      saveRun(makeRun('PLAN-C2'))

      clearRunsForPlan('PLAN-C1')
      expect(getRunsByPlan('PLAN-C1').length).toBe(0)
      expect(getRunsByPlan('PLAN-C2').length).toBe(1)
    })

    it('clearAllRuns removes everything', () => {
      saveRun(makeRun('PLAN-D1'))
      saveRun(makeRun('PLAN-D2'))

      clearAllRuns()
      expect(getRunsByPlan('PLAN-D1').length).toBe(0)
      expect(getRunsByPlan('PLAN-D2').length).toBe(0)
    })
  })

  // ── 7. Architecture boundary ────────────────────────────────────────────

  describe('architecture boundary', () => {
    it('recipeRunStore does NOT import detection modules', async () => {
      // Read the store source and verify no detection/legend/quote imports
      const fs = await import('fs')
      const src = fs.readFileSync(
        new URL('../data/recipeRunStore.js', import.meta.url), 'utf8'
      )
      expect(src).not.toMatch(/detectionStore/)
      expect(src).not.toMatch(/legendStore/)
      expect(src).not.toMatch(/quoteStore/)
      expect(src).not.toMatch(/DetectionCandidate/)
      // markerModel mentioned in JSDoc comment is fine — check for actual imports
      expect(src).not.toMatch(/import.*markerModel/)
    })

    it('RunHistoryDrawer does NOT import detection modules', async () => {
      const fs = await import('fs')
      const src = fs.readFileSync(
        new URL('../components/RunHistoryDrawer.jsx', import.meta.url), 'utf8'
      )
      expect(src).not.toMatch(/detectionStore/)
      expect(src).not.toMatch(/legendStore/)
      expect(src).not.toMatch(/quoteStore/)
      expect(src).not.toMatch(/DetectionCandidate/)
    })
  })
})
