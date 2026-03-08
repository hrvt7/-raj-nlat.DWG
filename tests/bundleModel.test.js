/**
 * Unit tests for bundleModel.js
 *
 * Tests the pure-JS bundle factory, snapshot creation, and stale detection.
 * No browser APIs needed — these are pure functions.
 *
 * Migrated from console.assert → Vitest describe/it/expect
 */

import { describe, it, expect } from 'vitest'
import {
  generateBundleId,
  createBundle,
  createPlanSnapshot,
  checkBundleStaleness,
  staleReasonLabel,
  MERGE_TYPES,
} from '../src/utils/bundleModel.js'

// ── generateBundleId ─────────────────────────────────────────────────────────

describe('generateBundleId', () => {
  it('returns BDL- prefixed unique IDs', () => {
    const id1 = generateBundleId()
    const id2 = generateBundleId()
    expect(id1).toMatch(/^BDL-/)
    expect(id1).not.toBe(id2)
  })
})

// ── MERGE_TYPES ──────────────────────────────────────────────────────────────

describe('MERGE_TYPES', () => {
  it('contains manual, dxf, pdf', () => {
    expect(MERGE_TYPES).toContain('manual')
    expect(MERGE_TYPES).toContain('dxf')
    expect(MERGE_TYPES).toContain('pdf')
    expect(MERGE_TYPES).toHaveLength(3)
  })
})

// ── createPlanSnapshot ───────────────────────────────────────────────────────

describe('createPlanSnapshot', () => {
  it('captures plan state correctly', () => {
    const mockPlan = {
      id: 'PLAN-001',
      markerCount: 12,
      parseResult: { blocks: [1, 2, 3, 4, 5] },
      hasScale: true,
      floor: 'Pince',
      discipline: 'Világítás',
      updatedAt: '2025-06-01T10:00:00Z',
    }
    const snap = createPlanSnapshot(mockPlan)
    expect(snap.planId).toBe('PLAN-001')
    expect(snap.markerCount).toBe(12)
    expect(snap.parseBlockCount).toBe(5)
    expect(snap.hasScale).toBe(true)
    expect(snap.floor).toBe('Pince')
    expect(snap.discipline).toBe('Világítás')
    expect(snap.updatedAt).toBe('2025-06-01T10:00:00Z')
  })

  it('handles missing fields gracefully', () => {
    const snap = createPlanSnapshot({ id: 'PLAN-002' })
    expect(snap.markerCount).toBe(0)
    expect(snap.parseBlockCount).toBe(0)
    expect(snap.hasScale).toBe(false)
    expect(snap.floor).toBe(null)
  })

  it('reads floor/discipline from inferredMeta (canonical shape)', () => {
    const plan = {
      id: 'PLAN-003',
      inferredMeta: { floor: 'fsz', floorLabel: 'Földszint', systemType: 'Világítás' },
    }
    const snap = createPlanSnapshot(plan)
    expect(snap.floor).toBe('fsz')
    expect(snap.discipline).toBe('Világítás')
  })
})

// ── createBundle ─────────────────────────────────────────────────────────────

describe('createBundle', () => {
  const plans = [
    { id: 'P1', markerCount: 5, hasScale: true },
    { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
  ]

  it('creates bundle with correct shape', () => {
    const bundle = createBundle({
      name: 'Test Bundle',
      planIds: ['P1', 'P2'],
      mergeType: 'manual',
      assignments: { socket: 'ASM-001' },
      plans,
    })
    expect(bundle.id).toMatch(/^BDL-/)
    expect(bundle.name).toBe('Test Bundle')
    expect(bundle.planIds).toHaveLength(2)
    expect(bundle.mergeType).toBe('manual')
    expect(bundle.assignments.socket).toBe('ASM-001')
    expect(Object.keys(bundle.planSnapshots)).toHaveLength(2)
    expect(bundle.planSnapshots['P1'].markerCount).toBe(5)
    expect(bundle.planSnapshots['P2'].parseBlockCount).toBe(2)
    expect(bundle.createdAt).toBeTruthy()
    expect(bundle.updatedAt).toBeTruthy()
  })

  it('uses defaults — empty assignments, name fallback', () => {
    const bundle = createBundle({ planIds: ['X'], plans: [{ id: 'X' }] })
    expect(bundle.name).toBe('Névtelen csomag')
    expect(bundle.mergeType).toBe('manual')
    expect(Object.keys(bundle.assignments)).toHaveLength(0)
    expect(Object.keys(bundle.unknownMappings)).toHaveLength(0)
  })
})

// ── checkBundleStaleness ─────────────────────────────────────────────────────

describe('checkBundleStaleness', () => {
  const plans = [
    { id: 'P1', markerCount: 5, hasScale: true },
    { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
  ]
  const freshBundle = createBundle({ planIds: ['P1', 'P2'], plans })

  it('returns empty for fresh bundle', () => {
    expect(checkBundleStaleness(freshBundle, plans)).toHaveLength(0)
  })

  it('detects marker count change', () => {
    const changed = [
      { id: 'P1', markerCount: 8, hasScale: true },
      { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
    ]
    const stale = checkBundleStaleness(freshBundle, changed)
    expect(stale).toHaveLength(1)
    expect(stale[0].planId).toBe('P1')
    expect(stale[0].reason).toBe('markers_changed')
  })

  it('detects deleted plan', () => {
    const deleted = [{ id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } }]
    const stale = checkBundleStaleness(freshBundle, deleted)
    expect(stale).toHaveLength(1)
    expect(stale[0].planId).toBe('P1')
    expect(stale[0].reason).toBe('deleted')
  })

  it('detects block count change', () => {
    const changed = [
      { id: 'P1', markerCount: 5, hasScale: true },
      { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2, 3, 4] } },
    ]
    const stale = checkBundleStaleness(freshBundle, changed)
    expect(stale).toHaveLength(1)
    expect(stale[0].reason).toBe('blocks_changed')
  })

  it('detects scale change', () => {
    const changed = [
      { id: 'P1', markerCount: 5, hasScale: false },
      { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
    ]
    const stale = checkBundleStaleness(freshBundle, changed)
    expect(stale).toHaveLength(1)
    expect(stale[0].reason).toBe('scale_changed')
  })
})

// ── staleReasonLabel ─────────────────────────────────────────────────────────

describe('staleReasonLabel', () => {
  it('returns human-readable labels', () => {
    expect(staleReasonLabel('deleted')).toBe('Terv törölve')
    expect(staleReasonLabel('markers_changed')).toBe('Jelölések változtak')
    expect(staleReasonLabel('blocks_changed')).toBe('DXF blokkok változtak')
    expect(staleReasonLabel('scale_changed')).toBe('Kalibráció változott')
    expect(staleReasonLabel('metadata_changed')).toBe('Emelet/szakág változott')
    expect(staleReasonLabel('unknown')).toBe('Változás történt')
  })
})
