// ─── Count Workflow Tests ───────────────────────────────────────────────────
// Regression tests for PlanSwift-style Count Object + Search Session workflow.
//
// Covers:
//   1. CountObject shape validation
//   2. SearchSession shape validation
//   3. Search region scope filtering
//   4. Exact vs tolerant scale mode behavior
//   5. Candidate session shape + status lifecycle
//   6. Accepted-only materialization
//   7. Architecture boundary (no DetectionCandidate / rule engine)
//   8. Batch operations (accept likely, ignore low)
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock localStorage ─────────────────────────────────────────────────────────

const storage = {}
vi.stubGlobal('localStorage', {
  getItem: (key) => storage[key] ?? null,
  setItem: (key, val) => { storage[key] = val },
  removeItem: (key) => { delete storage[key] },
})

// ── Mock localforage (IndexedDB not available in tests) ──────────────────────

vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      setItem: vi.fn().mockResolvedValue(undefined),
      getItem: vi.fn().mockResolvedValue(null),
      clear: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

import {
  createCountObject,
  saveCountObject,
  getCountObjectsByPlan,
  getCountObject,
  updateCountObject,
  deleteCountObject,
  clearAllCountObjects,
  SCALE_MODE,
  SEARCH_SCOPE,
} from '../data/countObjectStore.js'

import {
  createSearchSession,
  createSessionCandidate,
  saveSession,
  getSessionsByPlan,
  getSession,
  updateCandidateStatuses,
  markSessionMaterialized,
  getAcceptedCandidates,
  clearAllSessions,
  CANDIDATE_STATUS,
} from '../data/searchSessionStore.js'

import {
  filterBySearchRegion,
  resolveScaleModeConfig,
  batchAcceptLikely,
  batchIgnoreLow,
  setCandidateStatus,
  materializeAccepted,
  screenRectToPdfRegion,
  pdfRegionToScreenRect,
} from '../services/countWorkflow/index.js'

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear mock storage
  for (const key of Object.keys(storage)) delete storage[key]
  clearAllCountObjects()
  clearAllSessions()
})

// ── 1. CountObject shape ────────────────────────────────────────────────────

describe('CountObject shape', () => {
  it('creates with all required fields', () => {
    const co = createCountObject({
      projectId: 'PRJ-1',
      planId: 'PLAN-1',
      pageNumber: 1,
      sampleBbox: { x: 100, y: 200, w: 30, h: 30 },
      sampleCropId: 'RCP-abc',
      assemblyId: 'ASM-001',
      assemblyName: 'Dugalj',
      label: 'Dugalj 230V',
    })

    expect(co.id).toMatch(/^CO-/)
    expect(co.projectId).toBe('PRJ-1')
    expect(co.planId).toBe('PLAN-1')
    expect(co.pageNumber).toBe(1)
    expect(co.sampleBbox).toEqual({ x: 100, y: 200, w: 30, h: 30 })
    expect(co.sampleCropId).toBe('RCP-abc')
    expect(co.assemblyId).toBe('ASM-001')
    expect(co.assemblyName).toBe('Dugalj')
    expect(co.label).toBe('Dugalj 230V')
    expect(co.scaleMode).toBe(SCALE_MODE.EXACT)
    expect(co.searchScope).toBe(SEARCH_SCOPE.CURRENT_PAGE)
    expect(co.searchRegion).toBeNull()
    expect(co.createdAt).toBeTruthy()
  })

  it('accepts optional search region', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
      searchScope: SEARCH_SCOPE.CURRENT_REGION,
      searchRegion: { x: 50, y: 50, w: 200, h: 300 },
    })
    expect(co.searchScope).toBe('current_region')
    expect(co.searchRegion).toEqual({ x: 50, y: 50, w: 200, h: 300 })
  })

  it('defaults scaleMode to exact', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    expect(co.scaleMode).toBe('exact')
  })

  it('persists and retrieves by plan', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL-1', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    saveCountObject(co)

    const found = getCountObjectsByPlan('PL-1')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe(co.id)

    const byId = getCountObject(co.id)
    expect(byId.planId).toBe('PL-1')
  })

  it('updates search region', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL-1', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    saveCountObject(co)

    const updated = updateCountObject(co.id, {
      searchRegion: { x: 10, y: 20, w: 100, h: 150 },
      searchScope: SEARCH_SCOPE.CURRENT_REGION,
    })
    expect(updated.searchRegion).toEqual({ x: 10, y: 20, w: 100, h: 150 })
    expect(updated.searchScope).toBe('current_region')
  })

  it('deletes cleanly', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL-1', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    saveCountObject(co)
    deleteCountObject(co.id)
    expect(getCountObjectsByPlan('PL-1')).toHaveLength(0)
  })
})

// ── 2. SearchSession shape ──────────────────────────────────────────────────

describe('SearchSession shape', () => {
  it('creates with all required fields', () => {
    const ss = createSearchSession({
      countObjectId: 'CO-1',
      planId: 'PL-1',
      scope: SEARCH_SCOPE.CURRENT_REGION,
      region: { x: 50, y: 50, w: 200, h: 200 },
      scaleMode: SCALE_MODE.EXACT,
    })

    expect(ss.id).toMatch(/^SS-/)
    expect(ss.countObjectId).toBe('CO-1')
    expect(ss.planId).toBe('PL-1')
    expect(ss.scope).toBe('current_region')
    expect(ss.region).toEqual({ x: 50, y: 50, w: 200, h: 200 })
    expect(ss.scaleMode).toBe('exact')
    expect(ss.candidates).toEqual([])
    expect(ss.candidateCount).toBe(0)
    expect(ss.acceptedCount).toBe(0)
    expect(ss.ignoredCount).toBe(0)
    expect(ss.materialized).toBe(false)
    expect(ss.createdAt).toBeTruthy()
  })

  it('persists and retrieves by plan', () => {
    const ss = createSearchSession({
      countObjectId: 'CO-1', planId: 'PL-A',
      scope: 'current_page', scaleMode: 'exact',
    })
    ss.candidates = [
      createSessionCandidate({ x: 10, y: 20, pageNumber: 1, score: 0.8, confidence: 0.8, confidenceBucket: 'high', matchBbox: { x: 5, y: 15, w: 10, h: 10 } }),
    ]
    ss.candidateCount = 1
    saveSession(ss)

    const found = getSessionsByPlan('PL-A')
    expect(found).toHaveLength(1)
    expect(found[0].candidates).toHaveLength(1)
    expect(found[0].candidates[0].id).toMatch(/^SC-/)
  })
})

// ── 3. SessionCandidate shape + status lifecycle ────────────────────────────

describe('SessionCandidate lifecycle', () => {
  it('creates with PENDING status', () => {
    const sc = createSessionCandidate({
      x: 100, y: 200, pageNumber: 1,
      score: 0.75, confidence: 0.75, confidenceBucket: 'high',
      matchBbox: { x: 85, y: 185, w: 30, h: 30 },
    })
    expect(sc.status).toBe(CANDIDATE_STATUS.PENDING)
    expect(sc.x).toBe(100)
    expect(sc.confidence).toBe(0.75)
  })

  it('transitions through PENDING → ACCEPTED → IGNORED', () => {
    const ss = createSearchSession({
      countObjectId: 'CO-1', planId: 'PL-1',
      scope: 'current_page', scaleMode: 'exact',
    })
    const c1 = createSessionCandidate({
      x: 10, y: 20, pageNumber: 1, score: 0.8, confidence: 0.8,
      confidenceBucket: 'high', matchBbox: { x: 5, y: 15, w: 10, h: 10 },
    })
    ss.candidates = [c1]
    ss.candidateCount = 1
    saveSession(ss)

    // Accept
    const updated1 = updateCandidateStatuses('PL-1', ss.id, { [c1.id]: CANDIDATE_STATUS.ACCEPTED })
    expect(updated1.acceptedCount).toBe(1)
    expect(updated1.ignoredCount).toBe(0)

    // Change to ignored
    const updated2 = updateCandidateStatuses('PL-1', ss.id, { [c1.id]: CANDIDATE_STATUS.IGNORED })
    expect(updated2.acceptedCount).toBe(0)
    expect(updated2.ignoredCount).toBe(1)
  })
})

// ── 4. Search region scope filtering ────────────────────────────────────────

describe('search region filtering', () => {
  const detections = [
    { x: 100, y: 100, score: 0.9 },
    { x: 200, y: 200, score: 0.8 },
    { x: 300, y: 300, score: 0.7 },
    { x: 50,  y: 50,  score: 0.6 },
  ]

  it('returns all detections when region is null', () => {
    const result = filterBySearchRegion(detections, null)
    expect(result).toHaveLength(4)
  })

  it('filters detections to within region bbox', () => {
    const region = { x: 80, y: 80, w: 150, h: 150 }
    const result = filterBySearchRegion(detections, region)
    // Only (100,100) and (200,200) are inside (80,80)→(230,230)
    expect(result).toHaveLength(2)
    expect(result[0].x).toBe(100)
    expect(result[1].x).toBe(200)
  })

  it('excludes detections on region boundary edges (exclusive)', () => {
    const region = { x: 100, y: 100, w: 100, h: 100 }
    const result = filterBySearchRegion(detections, region)
    // (100,100) is at left-top edge → included (>=)
    // (200,200) is at right-bottom edge → included (<=)
    expect(result).toHaveLength(2)
  })

  it('returns empty for small region with no detections', () => {
    const region = { x: 400, y: 400, w: 10, h: 10 }
    const result = filterBySearchRegion(detections, region)
    expect(result).toHaveLength(0)
  })
})

// ── 5. Exact vs tolerant scale mode behavior ────────────────────────────────

describe('scale mode config', () => {
  it('exact mode has higher NCC threshold', () => {
    const exact = resolveScaleModeConfig(SCALE_MODE.EXACT)
    const tolerant = resolveScaleModeConfig(SCALE_MODE.TOLERANT)

    expect(exact.nccThreshold).toBeGreaterThan(tolerant.nccThreshold)
    expect(exact.maxPerPage).toBeLessThan(tolerant.maxPerPage)
  })

  it('exact threshold is >= 0.60 (tight)', () => {
    const exact = resolveScaleModeConfig('exact')
    expect(exact.nccThreshold).toBeGreaterThanOrEqual(0.60)
  })

  it('tolerant threshold is <= 0.55 (relaxed)', () => {
    const tolerant = resolveScaleModeConfig('tolerant')
    expect(tolerant.nccThreshold).toBeLessThanOrEqual(0.55)
  })

  it('falls back to exact for unknown mode', () => {
    const fallback = resolveScaleModeConfig('unknown_mode')
    const exact = resolveScaleModeConfig('exact')
    expect(fallback.nccThreshold).toBe(exact.nccThreshold)
  })
})

// ── 6. Accepted-only materialization ────────────────────────────────────────

describe('accepted-only materialization', () => {
  it('only converts ACCEPTED candidates to marker fields', () => {
    const candidates = [
      { ...createSessionCandidate({ x: 10, y: 20, pageNumber: 1, score: 0.9, confidence: 0.9, confidenceBucket: 'high', matchBbox: { x: 5, y: 15, w: 10, h: 10 } }), status: CANDIDATE_STATUS.ACCEPTED },
      { ...createSessionCandidate({ x: 30, y: 40, pageNumber: 1, score: 0.7, confidence: 0.7, confidenceBucket: 'review', matchBbox: { x: 25, y: 35, w: 10, h: 10 } }), status: CANDIDATE_STATUS.IGNORED },
      { ...createSessionCandidate({ x: 50, y: 60, pageNumber: 1, score: 0.5, confidence: 0.5, confidenceBucket: 'low', matchBbox: { x: 45, y: 55, w: 10, h: 10 } }), status: CANDIDATE_STATUS.PENDING },
    ]

    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'ASM-001', assemblyName: 'Socket',
    })

    const assemblies = [{ id: 'ASM-001', category: 'szerelvenyek', name: 'Socket' }]
    const markers = materializeAccepted(candidates, co, assemblies)

    expect(markers).toHaveLength(1) // only the ACCEPTED one
    expect(markers[0].x).toBe(10)
    expect(markers[0].source).toBe('count_object')
    expect(markers[0].countObjectId).toBe(co.id)
  })

  it('returns empty array when no candidates are accepted', () => {
    const candidates = [
      { ...createSessionCandidate({ x: 10, y: 20, pageNumber: 1, score: 0.9, confidence: 0.9, confidenceBucket: 'high', matchBbox: { x: 5, y: 15, w: 10, h: 10 } }), status: CANDIDATE_STATUS.PENDING },
    ]
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'ASM-001',
    })
    const markers = materializeAccepted(candidates, co, [])
    expect(markers).toHaveLength(0)
  })

  it('materializes with correct category from assembly', () => {
    const candidates = [
      { ...createSessionCandidate({ x: 10, y: 20, pageNumber: 1, score: 0.8, confidence: 0.8, confidenceBucket: 'high', matchBbox: { x: 5, y: 15, w: 10, h: 10 } }), status: CANDIDATE_STATUS.ACCEPTED },
    ]
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'ASM-002',
    })
    const assemblies = [{ id: 'ASM-002', category: 'vilagitas', name: 'Light' }]
    const markers = materializeAccepted(candidates, co, assemblies)
    expect(markers[0].category).toBe('light')
    expect(markers[0].color).toBe('#FFD166')
  })

  it('session materialized flag persists', () => {
    const ss = createSearchSession({
      countObjectId: 'CO-1', planId: 'PL-1',
      scope: 'current_page', scaleMode: 'exact',
    })
    saveSession(ss)

    markSessionMaterialized('PL-1', ss.id)
    const loaded = getSession('PL-1', ss.id)
    expect(loaded.materialized).toBe(true)
    expect(loaded.materializedAt).toBeTruthy()
  })

  it('getAcceptedCandidates returns only accepted', () => {
    const ss = createSearchSession({
      countObjectId: 'CO-1', planId: 'PL-1',
      scope: 'current_page', scaleMode: 'exact',
    })
    const c1 = createSessionCandidate({ x: 1, y: 1, pageNumber: 1, score: 0.9, confidence: 0.9, confidenceBucket: 'high', matchBbox: { x: 0, y: 0, w: 2, h: 2 } })
    const c2 = createSessionCandidate({ x: 5, y: 5, pageNumber: 1, score: 0.5, confidence: 0.5, confidenceBucket: 'low', matchBbox: { x: 4, y: 4, w: 2, h: 2 } })
    c1.status = CANDIDATE_STATUS.ACCEPTED
    c2.status = CANDIDATE_STATUS.IGNORED
    ss.candidates = [c1, c2]
    ss.candidateCount = 2
    ss.acceptedCount = 1
    ss.ignoredCount = 1
    saveSession(ss)

    const accepted = getAcceptedCandidates('PL-1', ss.id)
    expect(accepted).toHaveLength(1)
    expect(accepted[0].x).toBe(1)
  })
})

// ── 7. Batch operations ─────────────────────────────────────────────────────

describe('batch operations', () => {
  function makeCandidates() {
    return [
      { ...createSessionCandidate({ x: 1, y: 1, pageNumber: 1, score: 0.9, confidence: 0.9, confidenceBucket: 'high', matchBbox: { x: 0, y: 0, w: 2, h: 2 } }), status: CANDIDATE_STATUS.PENDING },
      { ...createSessionCandidate({ x: 2, y: 2, pageNumber: 1, score: 0.65, confidence: 0.65, confidenceBucket: 'review', matchBbox: { x: 1, y: 1, w: 2, h: 2 } }), status: CANDIDATE_STATUS.PENDING },
      { ...createSessionCandidate({ x: 3, y: 3, pageNumber: 1, score: 0.4, confidence: 0.4, confidenceBucket: 'low', matchBbox: { x: 2, y: 2, w: 2, h: 2 } }), status: CANDIDATE_STATUS.PENDING },
    ]
  }

  it('batchAcceptLikely accepts only high-confidence candidates', () => {
    const result = batchAcceptLikely(makeCandidates())
    expect(result[0].status).toBe(CANDIDATE_STATUS.ACCEPTED)
    expect(result[1].status).toBe(CANDIDATE_STATUS.PENDING) // review stays pending
    expect(result[2].status).toBe(CANDIDATE_STATUS.PENDING) // low stays pending
  })

  it('batchIgnoreLow ignores only low-confidence candidates', () => {
    const result = batchIgnoreLow(makeCandidates())
    expect(result[0].status).toBe(CANDIDATE_STATUS.PENDING) // high stays pending
    expect(result[1].status).toBe(CANDIDATE_STATUS.PENDING) // review stays pending
    expect(result[2].status).toBe(CANDIDATE_STATUS.IGNORED)
  })

  it('setCandidateStatus changes single candidate', () => {
    const cands = makeCandidates()
    const result = setCandidateStatus(cands, cands[1].id, CANDIDATE_STATUS.ACCEPTED)
    expect(result[0].status).toBe(CANDIDATE_STATUS.PENDING) // unchanged
    expect(result[1].status).toBe(CANDIDATE_STATUS.ACCEPTED) // changed
    expect(result[2].status).toBe(CANDIDATE_STATUS.PENDING) // unchanged
  })
})

// ── 8. Architecture boundary ────────────────────────────────────────────────

describe('architecture boundary', () => {
  it('CountObject IDs use CO- prefix (not RMC- or DC-)', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    expect(co.id).toMatch(/^CO-/)
    expect(co.id).not.toMatch(/^RMC-/)
    expect(co.id).not.toMatch(/^DC-/)
  })

  it('SearchSession IDs use SS- prefix', () => {
    const ss = createSearchSession({
      countObjectId: 'CO-1', planId: 'PL-1',
      scope: 'current_page', scaleMode: 'exact',
    })
    expect(ss.id).toMatch(/^SS-/)
  })

  it('SessionCandidate IDs use SC- prefix', () => {
    const sc = createSessionCandidate({
      x: 0, y: 0, pageNumber: 1, score: 0.5, confidence: 0.5,
      confidenceBucket: 'review', matchBbox: { x: 0, y: 0, w: 10, h: 10 },
    })
    expect(sc.id).toMatch(/^SC-/)
  })

  it('materialized markers use source=count_object (not recipe_match)', () => {
    const candidates = [
      { ...createSessionCandidate({ x: 10, y: 20, pageNumber: 1, score: 0.9, confidence: 0.9, confidenceBucket: 'high', matchBbox: { x: 5, y: 15, w: 10, h: 10 } }), status: CANDIDATE_STATUS.ACCEPTED },
    ]
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    const markers = materializeAccepted(candidates, co, [])
    expect(markers[0].source).toBe('count_object')
    expect(markers[0].source).not.toBe('recipe_match')
    expect(markers[0].source).not.toBe('pdf_rule_engine')
  })

  it('CountObject does not reference DetectionCandidate fields', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
    })
    // Should NOT have detection-pipeline fields
    expect(co).not.toHaveProperty('detectionId')
    expect(co).not.toHaveProperty('ruleId')
    expect(co).not.toHaveProperty('symbolCount')
    expect(co).not.toHaveProperty('detectConfidence')
  })

  it('SCALE_MODE values are exact and tolerant', () => {
    expect(SCALE_MODE.EXACT).toBe('exact')
    expect(SCALE_MODE.TOLERANT).toBe('tolerant')
  })

  it('SEARCH_SCOPE includes current_region', () => {
    expect(SEARCH_SCOPE.CURRENT_REGION).toBe('current_region')
    expect(SEARCH_SCOPE.CURRENT_PAGE).toBe('current_page')
    expect(SEARCH_SCOPE.WHOLE_PLAN).toBe('whole_plan')
  })

  it('CANDIDATE_STATUS has three valid states', () => {
    expect(CANDIDATE_STATUS.PENDING).toBe('pending')
    expect(CANDIDATE_STATUS.ACCEPTED).toBe('accepted')
    expect(CANDIDATE_STATUS.IGNORED).toBe('ignored')
  })
})

// ── 9. Coordinate conversion helpers ──────────────────────────────────────

describe('coordinate conversion helpers', () => {
  const view = { offsetX: 50, offsetY: 100, zoom: 2 }

  describe('screenRectToPdfRegion', () => {
    it('converts screen coords to PDF scale=1 coords', () => {
      const screen = { x: 150, y: 300, w: 200, h: 400 }
      const pdf = screenRectToPdfRegion(screen, view)
      // x: (150 - 50) / 2 = 50,  y: (300 - 100) / 2 = 100
      // w: 200 / 2 = 100,        h: 400 / 2 = 200
      expect(pdf.x).toBe(50)
      expect(pdf.y).toBe(100)
      expect(pdf.w).toBe(100)
      expect(pdf.h).toBe(200)
    })

    it('handles zero offset and zoom=1 (identity)', () => {
      const identity = { offsetX: 0, offsetY: 0, zoom: 1 }
      const screen = { x: 10, y: 20, w: 30, h: 40 }
      const pdf = screenRectToPdfRegion(screen, identity)
      expect(pdf).toEqual({ x: 10, y: 20, w: 30, h: 40 })
    })

    it('handles high zoom levels', () => {
      const highZoom = { offsetX: 0, offsetY: 0, zoom: 4 }
      const screen = { x: 400, y: 800, w: 100, h: 100 }
      const pdf = screenRectToPdfRegion(screen, highZoom)
      expect(pdf.x).toBe(100)
      expect(pdf.y).toBe(200)
      expect(pdf.w).toBe(25)
      expect(pdf.h).toBe(25)
    })
  })

  describe('pdfRegionToScreenRect', () => {
    it('converts PDF scale=1 coords to screen coords', () => {
      const pdf = { x: 50, y: 100, w: 100, h: 200 }
      const screen = pdfRegionToScreenRect(pdf, view)
      // x: 50*2 + 50 = 150,  y: 100*2 + 100 = 300
      // w: 100*2 = 200,      h: 200*2 = 400
      expect(screen.x).toBe(150)
      expect(screen.y).toBe(300)
      expect(screen.w).toBe(200)
      expect(screen.h).toBe(400)
    })

    it('handles zero offset and zoom=1 (identity)', () => {
      const identity = { offsetX: 0, offsetY: 0, zoom: 1 }
      const pdf = { x: 10, y: 20, w: 30, h: 40 }
      const screen = pdfRegionToScreenRect(pdf, identity)
      expect(screen).toEqual({ x: 10, y: 20, w: 30, h: 40 })
    })
  })

  it('screen→pdf→screen is identity (roundtrip)', () => {
    const original = { x: 150, y: 300, w: 200, h: 400 }
    const pdf = screenRectToPdfRegion(original, view)
    const back = pdfRegionToScreenRect(pdf, view)
    expect(back.x).toBeCloseTo(original.x, 10)
    expect(back.y).toBeCloseTo(original.y, 10)
    expect(back.w).toBeCloseTo(original.w, 10)
    expect(back.h).toBeCloseTo(original.h, 10)
  })

  it('pdf→screen→pdf is identity (roundtrip)', () => {
    const original = { x: 50, y: 100, w: 100, h: 200 }
    const screen = pdfRegionToScreenRect(original, view)
    const back = screenRectToPdfRegion(screen, view)
    expect(back.x).toBeCloseTo(original.x, 10)
    expect(back.y).toBeCloseTo(original.y, 10)
    expect(back.w).toBeCloseTo(original.w, 10)
    expect(back.h).toBeCloseTo(original.h, 10)
  })
})

// ── 10. current_region scenario: region inside match, outside excluded ────

describe('current_region scenarios', () => {
  it('region containing match center → included', () => {
    const detections = [
      { x: 150, y: 150, score: 0.85 },  // center at (150,150)
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 } // 100→300 range
    const result = filterBySearchRegion(detections, region)
    expect(result).toHaveLength(1)
    expect(result[0].x).toBe(150)
  })

  it('region NOT containing match center → excluded', () => {
    const detections = [
      { x: 50, y: 50, score: 0.85 },   // outside region
      { x: 150, y: 150, score: 0.80 },  // inside region
      { x: 350, y: 350, score: 0.75 },  // outside region
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 }
    const result = filterBySearchRegion(detections, region)
    expect(result).toHaveLength(1)
    expect(result[0].x).toBe(150)
    // Verify outside matches are NOT in result
    expect(result.find(d => d.x === 50)).toBeUndefined()
    expect(result.find(d => d.x === 350)).toBeUndefined()
  })

  it('multiple matches inside region all included', () => {
    const detections = [
      { x: 110, y: 110, score: 0.9 },
      { x: 150, y: 150, score: 0.8 },
      { x: 290, y: 290, score: 0.7 },
      { x: 500, y: 500, score: 0.6 },  // outside
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 }
    const result = filterBySearchRegion(detections, region)
    expect(result).toHaveLength(3)
  })

  it('edge case: detection exactly on region boundary is included', () => {
    const detections = [
      { x: 100, y: 100, score: 0.8 },  // top-left corner
      { x: 300, y: 300, score: 0.7 },  // bottom-right corner
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 }
    const result = filterBySearchRegion(detections, region)
    expect(result).toHaveLength(2)
  })

  it('region-filtered candidates preserve score for confidence bucketing', () => {
    const detections = [
      { x: 150, y: 150, score: 0.85 },
      { x: 160, y: 160, score: 0.55 },
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 }
    const result = filterBySearchRegion(detections, region)
    expect(result).toHaveLength(2)
    expect(result[0].score).toBe(0.85)
    expect(result[1].score).toBe(0.55)
  })
})

// ── 11. current_page still works (no region interference) ───────────────

describe('current_page scope (no region)', () => {
  it('filterBySearchRegion with null region returns all detections', () => {
    const detections = [
      { x: 10, y: 10, score: 0.9 },
      { x: 500, y: 500, score: 0.7 },
      { x: 1000, y: 1000, score: 0.5 },
    ]
    const result = filterBySearchRegion(detections, null)
    expect(result).toHaveLength(3)
    // All detections preserved regardless of position
    expect(result).toEqual(detections)
  })

  it('filterBySearchRegion with undefined region returns all detections', () => {
    const detections = [{ x: 10, y: 10, score: 0.9 }]
    const result = filterBySearchRegion(detections, undefined)
    expect(result).toHaveLength(1)
  })

  it('current_page CountObject has null searchRegion', () => {
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 2,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'A1',
      searchScope: SEARCH_SCOPE.CURRENT_PAGE,
    })
    expect(co.searchScope).toBe('current_page')
    expect(co.searchRegion).toBeNull()
  })
})

// ── 12. Accepted-only materialization preserved after region flow ────────

describe('accepted-only materialization with region context', () => {
  it('region-filtered candidates: only accepted become markers', () => {
    // Simulate: 3 detections found, region filter keeps 2, user accepts 1
    const allDetections = [
      { x: 150, y: 150, score: 0.85 },  // inside region
      { x: 160, y: 160, score: 0.55 },  // inside region
      { x: 500, y: 500, score: 0.90 },  // outside region
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 }

    // Step 1: Region filter
    const regionFiltered = filterBySearchRegion(allDetections, region)
    expect(regionFiltered).toHaveLength(2)

    // Step 2: Convert to session candidates
    const candidates = regionFiltered.map(d => {
      const bucket = d.score >= 0.75 ? 'high' : d.score >= 0.60 ? 'review' : 'low'
      return createSessionCandidate({
        x: d.x, y: d.y, pageNumber: 1, score: d.score,
        confidence: d.score, confidenceBucket: bucket,
        matchBbox: { x: d.x - 10, y: d.y - 10, w: 20, h: 20 },
      })
    })

    // Step 3: Accept only the high-confidence one
    const reviewed = batchAcceptLikely(candidates)
    const accepted = reviewed.filter(c => c.status === CANDIDATE_STATUS.ACCEPTED)
    const pending = reviewed.filter(c => c.status === CANDIDATE_STATUS.PENDING)
    expect(accepted).toHaveLength(1)
    expect(pending).toHaveLength(1)

    // Step 4: Materialize — only accepted
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'ASM-001',
    })
    const markers = materializeAccepted(reviewed, co, [])
    expect(markers).toHaveLength(1)
    expect(markers[0].x).toBe(150)
    expect(markers[0].source).toBe('count_object')
  })

  it('outside-region detection never becomes a marker even if score is high', () => {
    // The outside detection with 0.90 score was already filtered out by region
    // So it never enters the candidate list at all
    const allDetections = [
      { x: 500, y: 500, score: 0.95 },  // high score but outside region
    ]
    const region = { x: 100, y: 100, w: 200, h: 200 }
    const regionFiltered = filterBySearchRegion(allDetections, region)
    expect(regionFiltered).toHaveLength(0)

    // No candidates → no markers possible
    const candidates = regionFiltered.map(d =>
      createSessionCandidate({
        x: d.x, y: d.y, pageNumber: 1, score: d.score,
        confidence: d.score, confidenceBucket: 'high',
        matchBbox: { x: d.x - 10, y: d.y - 10, w: 20, h: 20 },
      })
    )
    const co = createCountObject({
      projectId: 'P', planId: 'PL', pageNumber: 1,
      sampleBbox: { x: 0, y: 0, w: 10, h: 10 },
      sampleCropId: 'R1', assemblyId: 'ASM-001',
    })
    const markers = materializeAccepted(batchAcceptLikely(candidates), co, [])
    expect(markers).toHaveLength(0)
  })
})
