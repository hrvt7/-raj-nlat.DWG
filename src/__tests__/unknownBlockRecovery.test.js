// ─── Unknown Block Recovery Tests ────────────────────────────────────────────
// Tests for the unknown-block resolution improvement:
//   1. Account-level memory lookup without memProjectId
//   2. classifyItem returns 'confirmed' after user override of unknown block
//   3. shouldTrainMemory gate for user-overridden unknown blocks
//   4. lookupMemory handles null projectId (account-tier fallback)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── localStorage mock (Node environment has no DOM globals) ──────────────────
let store = {}
beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    get length() { return Object.keys(store).length },
    key: (i) => Object.keys(store)[i] ?? null,
    clear: () => { store = {} },
  })
})

import {
  classifyItem,
  shouldTrainMemory,
  getEffectiveAsmId,
} from '../utils/reviewState.js'
import {
  lookupMemory,
  recordConfirmation,
} from '../data/recognitionMemory.js'

// ─── Test helpers ────────────────────────────────────────────────────────────

function unknownItem(blockName = 'OPAQUE_BLK_001', qty = 3) {
  return {
    blockName,
    asmId: null,
    confidence: 0,
    matchType: 'unknown',
    qty,
  }
}

// ─── Review state: unknown → confirmed via override ─────────────────────────

describe('Unknown block → confirmed via override', () => {
  it('unknown block has unresolved status by default', () => {
    const item = unknownItem()
    expect(classifyItem(item)).toBe('unresolved')
  })

  it('user override makes unknown block confirmed', () => {
    const item = unknownItem('BLK_X')
    const overrides = { BLK_X: 'ASM-001' }
    expect(classifyItem(item, overrides)).toBe('confirmed')
  })

  it('null override keeps unknown block unresolved', () => {
    const item = unknownItem('BLK_X')
    const overrides = { BLK_X: null }
    expect(classifyItem(item, overrides)).toBe('unresolved')
  })

  it('override of unknown block enables memory training', () => {
    const item = unknownItem('BLK_X')
    const classified = { ...item, reviewStatus: 'confirmed' }
    expect(shouldTrainMemory(classified)).toBe(true)
  })

  it('unresolved unknown block does NOT enable memory training', () => {
    const item = unknownItem('BLK_X')
    const classified = { ...item, reviewStatus: 'unresolved' }
    expect(shouldTrainMemory(classified)).toBe(false)
  })

  it('getEffectiveAsmId returns override value for unknown block', () => {
    const item = unknownItem('BLK_X')
    const overrides = { BLK_X: 'ASM-002' }
    expect(getEffectiveAsmId(item, overrides)).toBe('ASM-002')
  })

  it('getEffectiveAsmId returns null when unknown block has no override', () => {
    const item = unknownItem('BLK_X')
    expect(getEffectiveAsmId(item, {})).toBeNull()
  })
})

// ─── Memory: account-tier fallback with null projectId ──────────────────────

describe('Account-tier memory lookup with null projectId', () => {
  it('lookupMemory returns null when nothing learned', () => {
    const result = lookupMemory('RANDOM_BLOCK', null)
    expect(result).toBeNull()
  })

  it('lookupMemory finds account-tier entry even with null projectId', () => {
    // Record in project A
    recordConfirmation('TEST_BLK_ACCT', 'ASM-001', 'proj-A', 'user_override')
    // Record in project B → promotes to account
    recordConfirmation('TEST_BLK_ACCT', 'ASM-001', 'proj-B', 'user_override')

    // Lookup with null projectId should find account-tier entry
    const result = lookupMemory('TEST_BLK_ACCT', null)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-001')
    expect(result.tier).toBe('account')
  })

  it('lookupMemory returns null for project-only entry with null projectId', () => {
    // Record in only one project → stays at project tier
    recordConfirmation('TEST_BLK_PROJ', 'ASM-001', 'proj-A', 'user_override')

    // Lookup with null projectId → no account entry, should return null
    const result = lookupMemory('TEST_BLK_PROJ', null)
    expect(result).toBeNull()
  })

  it('lookupMemory finds project entry when projectId is provided', () => {
    recordConfirmation('TEST_BLK_P', 'ASM-003', 'proj-X', 'user_override')

    const result = lookupMemory('TEST_BLK_P', 'proj-X')
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-003')
    expect(result.tier).toBe('project')
  })
})

// ─── Memory: user_override source is accepted ──────────────────────────────

describe('recordConfirmation with user_override source', () => {
  it('accepts user_override as valid source', () => {
    recordConfirmation('BLK_OVERRIDE', 'ASM-001', 'proj-1', 'user_override')

    const result = lookupMemory('BLK_OVERRIDE', 'proj-1')
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-001')
  })

  it('user_override from 2 projects promotes to account', () => {
    recordConfirmation('BLK_PROMO', 'ASM-002', 'proj-A', 'user_override')
    recordConfirmation('BLK_PROMO', 'ASM-002', 'proj-B', 'user_override')

    const result = lookupMemory('BLK_PROMO', 'proj-C')
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-002')
    expect(result.tier).toBe('account')
  })

  it('user_override learning persists across lookups', () => {
    recordConfirmation('BLK_PERSIST', 'ASM-003', 'proj-1', 'user_override')

    const r1 = lookupMemory('BLK_PERSIST', 'proj-1')
    expect(r1.asmId).toBe('ASM-003')

    const r2 = lookupMemory('BLK_PERSIST', 'proj-1')
    expect(r2.asmId).toBe('ASM-003')
  })
})

// ─── Smoke: full recovery flow scenario ─────────────────────────────────────

describe('Full unknown-block recovery flow', () => {
  it('S1: unknown block → user assigns → memory learns → future lookup succeeds', () => {
    const blockName = 'KAP_DUGALJ_2P'

    // Step 1: Block is unknown
    const mem1 = lookupMemory(blockName, 'proj-1')
    expect(mem1).toBeNull()

    // Step 2: User assigns via UI → recordConfirmation
    recordConfirmation(blockName, 'ASM-001', 'proj-1', 'user_override')

    // Step 3: Same block in same project → memory succeeds
    const mem2 = lookupMemory(blockName, 'proj-1')
    expect(mem2).not.toBeNull()
    expect(mem2.asmId).toBe('ASM-001')

    // Step 4: Classify with override → confirmed → trains on save too
    const item = unknownItem(blockName)
    const classified = {
      ...item,
      reviewStatus: classifyItem(item, { [blockName]: 'ASM-001' }),
    }
    expect(classified.reviewStatus).toBe('confirmed')
    expect(shouldTrainMemory(classified)).toBe(true)
  })

  it('S2: unknown block mapped in 2 projects → account memory → new project auto-resolves', () => {
    const blockName = 'SPECIAL_LIGHT_X'

    recordConfirmation(blockName, 'ASM-003', 'proj-A', 'user_override')
    recordConfirmation(blockName, 'ASM-003', 'proj-B', 'user_override')

    const mem = lookupMemory(blockName, 'proj-C')
    expect(mem).not.toBeNull()
    expect(mem.asmId).toBe('ASM-003')
    expect(mem.tier).toBe('account')
    expect(mem.confidence).toBeGreaterThanOrEqual(0.88)
  })

  it('S3: account memory reachable without projectId (plan not assigned)', () => {
    const blockName = 'WIDGET_BLOCK_99'

    // Promote to account via 2 projects
    recordConfirmation(blockName, 'ASM-002', 'proj-1', 'user_override')
    recordConfirmation(blockName, 'ASM-002', 'proj-2', 'user_override')

    // Lookup with null projectId (plan not assigned to project) → account still works
    const mem = lookupMemory(blockName, null)
    expect(mem).not.toBeNull()
    expect(mem.asmId).toBe('ASM-002')
    expect(mem.tier).toBe('account')
  })
})
