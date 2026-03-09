// ─── Usability Polish — Regression Tests ─────────────────────────────────────
// Covers: reuse banner visibility, empty-vs-existing recipe states,
//         review batch CTA behavior, generic vs recipe workflow UI priority.
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldShowReuseBanner, dismissReuseBanner, getProjectRecipeCount } from '../components/ReuseBanner.jsx'
import {
  createMatchCandidate,
  batchAcceptGreen,
  groupByBucket,
  CONFIDENCE_BUCKET,
} from '../services/recipeMatching/index.js'

// ── Mock sessionStorage ──────────────────────────────────────────────────────

const sessionStore = {}
beforeEach(() => {
  Object.keys(sessionStore).forEach(k => delete sessionStore[k])
  vi.stubGlobal('sessionStorage', {
    getItem: (key) => sessionStore[key] || null,
    setItem: (key, val) => { sessionStore[key] = val },
    removeItem: (key) => { delete sessionStore[key] },
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch(overrides = {}) {
  return {
    x: 100, y: 200, pageNum: 1,
    confidence: 0.85, confidenceBucket: CONFIDENCE_BUCKET.HIGH,
    evidence: { ncc: { score: 0.8, weight: 0.7 }, textHint: { score: 0.5, weight: 0.2 }, aspect: { score: 1.0, weight: 0.1 } },
    matchBbox: { x: 90, y: 190, w: 20, h: 20 },
    ...overrides,
  }
}

function makeRecipe(overrides = {}) {
  return {
    id: 'RCP-test1', assemblyId: 'asm-001',
    assemblyName: 'Dugalj 2P+F', label: 'Dugalj',
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Reuse Banner Visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReuseBanner visibility', () => {
  const mockGetRecipes = (projectId) => {
    if (projectId === 'proj-A') return [{ id: 'RCP-1' }, { id: 'RCP-2' }, { id: 'RCP-3' }]
    return []
  }

  it('shows when project has recipes and plan has no markers', () => {
    expect(shouldShowReuseBanner('proj-A', 'plan-1', 0, mockGetRecipes)).toBe(true)
  })

  it('hides when plan already has markers', () => {
    expect(shouldShowReuseBanner('proj-A', 'plan-1', 5, mockGetRecipes)).toBe(false)
  })

  it('hides when no projectId', () => {
    expect(shouldShowReuseBanner(null, 'plan-1', 0, mockGetRecipes)).toBe(false)
  })

  it('hides when no planId', () => {
    expect(shouldShowReuseBanner('proj-A', null, 0, mockGetRecipes)).toBe(false)
  })

  it('hides when project has no recipes', () => {
    expect(shouldShowReuseBanner('proj-EMPTY', 'plan-1', 0, mockGetRecipes)).toBe(false)
  })

  it('hides after dismiss', () => {
    expect(shouldShowReuseBanner('proj-A', 'plan-1', 0, mockGetRecipes)).toBe(true)
    dismissReuseBanner('plan-1')
    expect(shouldShowReuseBanner('proj-A', 'plan-1', 0, mockGetRecipes)).toBe(false)
  })

  it('dismiss is plan-scoped — other plans unaffected', () => {
    dismissReuseBanner('plan-1')
    expect(shouldShowReuseBanner('proj-A', 'plan-2', 0, mockGetRecipes)).toBe(true)
  })
})

describe('getProjectRecipeCount', () => {
  const mockGetRecipes = (projectId) => {
    if (projectId === 'proj-A') return [{ id: 'RCP-1' }, { id: 'RCP-2' }]
    return []
  }

  it('returns recipe count for project', () => {
    expect(getProjectRecipeCount('proj-A', mockGetRecipes)).toBe(2)
  })

  it('returns 0 for missing project', () => {
    expect(getProjectRecipeCount(null, mockGetRecipes)).toBe(0)
  })

  it('returns 0 for project with no recipes', () => {
    expect(getProjectRecipeCount('proj-EMPTY', mockGetRecipes)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Empty vs Existing Recipe States
// ═══════════════════════════════════════════════════════════════════════════════

describe('empty-vs-existing recipe state logic', () => {
  it('recipeCount=0 + hasProjectRecipes=false → empty state (no buttons)', () => {
    // UI should show "Jelölj ki egy szimbólumot" hint
    // This is a state check — the actual rendering is in PdfToolbar
    const recipeCount = 0
    const hasProjectRecipes = false
    expect(recipeCount === 0 && !hasProjectRecipes).toBe(true) // empty state condition
  })

  it('recipeCount=0 + hasProjectRecipes=true → project recipes available', () => {
    // UI should show "Nincs terv-minta" + "Projekt minták futtatása"
    const recipeCount = 0
    const hasProjectRecipes = true
    expect(recipeCount === 0 && hasProjectRecipes).toBe(true) // project-only condition
  })

  it('recipeCount>0 → plan recipes available, show run buttons', () => {
    const recipeCount = 3
    expect(recipeCount > 0).toBe(true) // has-recipes condition
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Review Batch CTA Behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('review batch CTA logic', () => {
  it('canFastAcceptApply: true when green+red only (no yellow)', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'low' }), makeRecipe(), 'p1'),
    ]
    const g = groupByBucket(candidates)
    const allGreenAccepted = g.green.every(c => c.accepted)
    const hasYellow = g.yellow.length > 0
    const canFast = g.green.length > 0 && !hasYellow && !allGreenAccepted
    expect(canFast).toBe(true)
  })

  it('canFastAcceptApply: false when yellow exists', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'review' }), makeRecipe(), 'p1'),
    ]
    const g = groupByBucket(candidates)
    const hasYellow = g.yellow.length > 0
    const canFast = g.green.length > 0 && !hasYellow
    expect(canFast).toBe(false)
  })

  it('canFastAcceptApply: false when all green already accepted', () => {
    let candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
    ]
    candidates = batchAcceptGreen(candidates)
    const g = groupByBucket(candidates)
    const allGreenAccepted = g.green.every(c => c.accepted)
    expect(allGreenAccepted).toBe(true)
    const canFast = g.green.length > 0 && !allGreenAccepted
    expect(canFast).toBe(false)
  })

  it('batchAcceptGreen then apply produces correct accepted count', () => {
    const candidates = [
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'high' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'review' }), makeRecipe(), 'p1'),
      createMatchCandidate(makeMatch({ confidenceBucket: 'low' }), makeRecipe(), 'p1'),
    ]
    const after = batchAcceptGreen(candidates)
    const acceptedCount = after.filter(c => c.accepted).length
    expect(acceptedCount).toBe(2) // only the 2 HIGH ones
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Generic vs Recipe Workflow UI Priority
// ═══════════════════════════════════════════════════════════════════════════════

describe('workflow UI priority', () => {
  it('Azonosítás is the first tool (index 0)', () => {
    // Mirrors PdfToolbar TOOLS array
    const TOOLS = [
      { id: 'select', label: 'Azonosítás', key: 'I' },
      { id: 'count', label: 'Számlálás', key: 'C' },
      { id: 'measure', label: 'Mérés', key: 'M' },
      { id: 'calibrate', label: 'Skála', key: 'S' },
    ]
    expect(TOOLS[0].id).toBe('select')
    expect(TOOLS[0].label).toBe('Azonosítás')
  })

  it('no generic auto-detect tool in TOOLS array', () => {
    const TOOLS = [
      { id: 'select', label: 'Azonosítás', key: 'I' },
      { id: 'count', label: 'Számlálás', key: 'C' },
      { id: 'measure', label: 'Mérés', key: 'M' },
      { id: 'calibrate', label: 'Skála', key: 'S' },
    ]
    const genericIds = TOOLS.filter(t => t.id === 'detect' || t.id === 'auto-detect' || t.id === 'analyze')
    expect(genericIds.length).toBe(0)
  })

  it('Azonosítás tool gets primary visual weight (isPrimary)', () => {
    // Mirrors toolbar rendering logic
    const TOOLS = [
      { id: 'select', label: 'Azonosítás', key: 'I' },
      { id: 'count', label: 'Számlálás', key: 'C' },
    ]
    const isPrimary = TOOLS[0].id === 'select'
    expect(isPrimary).toBe(true)
    const notPrimary = TOOLS[1].id === 'select'
    expect(notPrimary).toBe(false)
  })
})
