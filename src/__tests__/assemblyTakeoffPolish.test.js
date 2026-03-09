// ─── Assembly-Driven Takeoff Polish Tests ────────────────────────────────────
// Tests for:
//   - Marker provenance fields (recipeId, batchId, appliedAt, source)
//   - Apply summary shape
//   - Last apply undo / rollback helper
//   - Batch/run identification
//   - Architecture boundary (recipe_match vs detection)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock localStorage ────────────────────────────────────────────────────────
const store = {}
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = String(val) }),
  removeItem: vi.fn((key) => { delete store[key] }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
}
vi.stubGlobal('localStorage', localStorageMock)

// ── Mock localforage ────────────────────────────────────────────────────────
vi.mock('localforage', () => {
  const memStore = {}
  return {
    default: {
      createInstance: () => ({
        getItem: async (key) => memStore[key] ?? null,
        setItem: async (key, val) => { memStore[key] = val },
        removeItem: async (key) => { delete memStore[key] },
        clear: async () => { Object.keys(memStore).forEach(k => delete memStore[k]) },
      }),
    },
  }
})

// ── Imports ──────────────────────────────────────────────────────────────────

import {
  createMarker,
  normalizeMarker,
  MARKER_SOURCES,
  deduplicateMarkersManualFirst,
} from '../utils/markerModel.js'

import {
  toMarkerFields,
  generateBatchId,
} from '../services/recipeMatching/index.js'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Marker provenance fields
// ═══════════════════════════════════════════════════════════════════════════

describe('marker provenance fields', () => {
  it('createMarker includes recipeId, appliedAt, batchId', () => {
    const m = createMarker({
      x: 100, y: 200, category: 'socket', color: '#FF8C42',
      source: 'recipe_match',
      recipeId: 'RCP-abc',
      appliedAt: '2025-01-01T00:00:00.000Z',
      batchId: 'BAT-xyz',
    })
    expect(m.recipeId).toBe('RCP-abc')
    expect(m.appliedAt).toBe('2025-01-01T00:00:00.000Z')
    expect(m.batchId).toBe('BAT-xyz')
    expect(m.source).toBe('recipe_match')
  })

  it('createMarker defaults provenance fields to null', () => {
    const m = createMarker({
      x: 100, y: 200, category: 'socket', color: '#FF8C42',
    })
    expect(m.recipeId).toBeNull()
    expect(m.appliedAt).toBeNull()
    expect(m.batchId).toBeNull()
    expect(m.source).toBe('manual')
  })

  it('normalizeMarker preserves provenance fields', () => {
    const raw = {
      x: 50, y: 60, category: 'light', color: '#FFD166',
      source: 'recipe_match', recipeId: 'RCP-123', batchId: 'BAT-456',
      appliedAt: '2025-06-01T12:00:00.000Z',
    }
    const m = normalizeMarker(raw)
    expect(m.recipeId).toBe('RCP-123')
    expect(m.batchId).toBe('BAT-456')
    expect(m.appliedAt).toBe('2025-06-01T12:00:00.000Z')
    expect(m.source).toBe('recipe_match')
  })

  it('normalizeMarker fills null for missing provenance', () => {
    const legacy = { x: 10, y: 20, category: 'socket', color: '#FF8C42' }
    const m = normalizeMarker(legacy)
    expect(m.recipeId).toBeNull()
    expect(m.batchId).toBeNull()
    expect(m.appliedAt).toBeNull()
  })

  it('MARKER_SOURCES includes recipe_match', () => {
    expect(MARKER_SOURCES).toContain('recipe_match')
    expect(MARKER_SOURCES).toContain('manual')
    expect(MARKER_SOURCES).toContain('detection')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. toMarkerFields source and provenance
// ═══════════════════════════════════════════════════════════════════════════

describe('toMarkerFields provenance', () => {
  const mockCandidate = {
    id: 'RMC-test-001',
    recipeId: 'RCP-recipe-001',
    assemblyId: 'ASM-001',
    x: 100, y: 200,
    pageNumber: 1,
    confidence: 0.85,
    label: 'Konnektor 1',
    score: 0.85,
  }

  const mockAssemblies = [
    { id: 'ASM-001', name: 'Konnektor 1', category: 'szerelvenyek' },
  ]

  it('sets source to recipe_match', () => {
    const fields = toMarkerFields(mockCandidate, mockAssemblies)
    expect(fields.source).toBe('recipe_match')
  })

  it('sets explicit recipeId field', () => {
    const fields = toMarkerFields(mockCandidate, mockAssemblies)
    expect(fields.recipeId).toBe('RCP-recipe-001')
  })

  it('preserves detectionId linking to RMC candidate', () => {
    const fields = toMarkerFields(mockCandidate, mockAssemblies)
    expect(fields.detectionId).toBe('RMC-test-001')
  })

  it('preserves templateId as recipeId for legacy compat', () => {
    const fields = toMarkerFields(mockCandidate, mockAssemblies)
    expect(fields.templateId).toBe('RCP-recipe-001')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. generateBatchId
// ═══════════════════════════════════════════════════════════════════════════

describe('generateBatchId', () => {
  it('returns string starting with BAT-', () => {
    const id = generateBatchId()
    expect(id).toMatch(/^BAT-/)
  })

  it('generates unique IDs', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) ids.add(generateBatchId())
    expect(ids.size).toBe(100)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Batch undo / rollback logic (marker filtering)
// ═══════════════════════════════════════════════════════════════════════════

describe('batch undo / rollback', () => {
  it('can filter markers by batchId to undo an apply', () => {
    const batchId = 'BAT-test-001'
    const markers = [
      createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42', source: 'manual' }),
      createMarker({ x: 30, y: 40, category: 'socket', color: '#FF8C42', source: 'recipe_match', batchId, recipeId: 'RCP-1' }),
      createMarker({ x: 50, y: 60, category: 'light', color: '#FFD166', source: 'recipe_match', batchId, recipeId: 'RCP-2' }),
      createMarker({ x: 70, y: 80, category: 'socket', color: '#FF8C42', source: 'manual' }),
    ]

    // Undo = remove all markers from this batch
    const afterUndo = markers.filter(m => m.batchId !== batchId)
    expect(afterUndo).toHaveLength(2)
    expect(afterUndo.every(m => m.source === 'manual')).toBe(true)
  })

  it('undo does not affect markers from other batches', () => {
    const batch1 = 'BAT-001'
    const batch2 = 'BAT-002'
    const markers = [
      createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42', batchId: batch1, source: 'recipe_match' }),
      createMarker({ x: 30, y: 40, category: 'light', color: '#FFD166', batchId: batch2, source: 'recipe_match' }),
    ]

    const afterUndo = markers.filter(m => m.batchId !== batch1)
    expect(afterUndo).toHaveLength(1)
    expect(afterUndo[0].batchId).toBe(batch2)
  })

  it('undo is safe on empty batch (no markers removed)', () => {
    const markers = [
      createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42', source: 'manual' }),
    ]
    const afterUndo = markers.filter(m => m.batchId !== 'BAT-nonexistent')
    expect(afterUndo).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Dedup respects recipe_match source priority
// ═══════════════════════════════════════════════════════════════════════════

describe('dedup with recipe_match source', () => {
  it('manual marker wins over recipe_match in dedup', () => {
    const manual = createMarker({ x: 100, y: 200, category: 'socket', color: '#FF8C42', source: 'manual' })
    const recipe = createMarker({ x: 102, y: 201, category: 'socket', color: '#FF8C42', source: 'recipe_match', recipeId: 'RCP-1' })

    const result = deduplicateMarkersManualFirst([manual, recipe])
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('manual')
  })

  it('recipe_match and detection are equal priority (first wins)', () => {
    const recipe = createMarker({ x: 100, y: 200, category: 'socket', color: '#FF8C42', source: 'recipe_match', recipeId: 'RCP-1' })
    const detection = createMarker({ x: 102, y: 201, category: 'socket', color: '#FF8C42', source: 'detection' })

    const result = deduplicateMarkersManualFirst([recipe, detection])
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('recipe_match') // first write wins at same priority
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Apply summary shape
// ═══════════════════════════════════════════════════════════════════════════

describe('apply summary shape', () => {
  it('can compute apply summary from markers', () => {
    const batchId = 'BAT-test'
    const appliedAt = new Date().toISOString()
    const newMarkers = [
      createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42', source: 'recipe_match', batchId, appliedAt, recipeId: 'RCP-1', label: 'Konnektor' }),
      createMarker({ x: 30, y: 40, category: 'socket', color: '#FF8C42', source: 'recipe_match', batchId, appliedAt, recipeId: 'RCP-1', label: 'Konnektor' }),
      createMarker({ x: 50, y: 60, category: 'light', color: '#FFD166', source: 'recipe_match', batchId, appliedAt, recipeId: 'RCP-2', label: 'Lámpa' }),
    ]

    // Simulate assembly summary computation (same as PdfViewer handleApply)
    const assemblySummary = {}
    for (const m of newMarkers) {
      const asmName = m.label || m.asmId || m.category || 'egyéb'
      assemblySummary[asmName] = (assemblySummary[asmName] || 0) + 1
    }

    expect(assemblySummary).toEqual({ 'Konnektor': 2, 'Lámpa': 1 })
  })

  it('summary uses category fallback when no label', () => {
    const m = createMarker({ x: 10, y: 20, category: 'other', color: '#71717A', source: 'recipe_match', batchId: 'BAT-1' })
    const asmName = m.label || m.asmId || m.category || 'egyéb'
    expect(asmName).toBe('other')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. Architecture boundary
// ═══════════════════════════════════════════════════════════════════════════

describe('architecture boundary', () => {
  it('recipe_match source is distinct from detection', () => {
    const rm = createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42', source: 'recipe_match', recipeId: 'RCP-1' })
    const det = createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42', source: 'detection', detectionId: 'DC-1' })
    expect(rm.source).not.toBe(det.source)
  })

  it('toMarkerFields does not produce detection source anymore', () => {
    const fields = toMarkerFields(
      { id: 'RMC-1', recipeId: 'RCP-1', assemblyId: 'ASM-1', x: 1, y: 2, pageNumber: 1, confidence: 0.8, label: 'Test' },
      [{ id: 'ASM-1', category: 'szerelvenyek' }],
    )
    expect(fields.source).toBe('recipe_match')
    expect(fields.source).not.toBe('detection')
  })

  it('manual markers are unaffected by provenance fields', () => {
    const m = createMarker({ x: 10, y: 20, category: 'socket', color: '#FF8C42' })
    expect(m.source).toBe('manual')
    expect(m.recipeId).toBeNull()
    expect(m.batchId).toBeNull()
    expect(m.appliedAt).toBeNull()
  })

  it('generateBatchId is exported from recipeMatching index', () => {
    expect(typeof generateBatchId).toBe('function')
  })
})
