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

// Dynamic import so the module picks up the stubbed localStorage
// We re-import each describe block's functions at the top level (static) for convenience —
// the stub is set before any test runs.
import {
  normalizeSignature,
  lookupMemory,
  recordConfirmation,
  detectConflict,
  getAllConflicts,
  clearProjectMemory,
  forgetEntry,
  getMemoryStats,
  getAccountId,
} from '../data/recognitionMemory.js'

// ─── normalizeSignature ──────────────────────────────────────────────────────

describe('normalizeSignature', () => {
  it('uppercases and replaces separators with underscore', () => {
    // '2p' is not trailing digits (has letter P after), so kept as-is
    expect(normalizeSignature('kap_dugalj-2p')).toBe('KAP_DUGALJ_2P')
  })

  it('strips trailing digits', () => {
    expect(normalizeSignature('LIGHT_SPOT_03')).toBe('LIGHT_SPOT')
    expect(normalizeSignature('switch_123')).toBe('SWITCH')
  })

  it('deduplicates consecutive underscores', () => {
    expect(normalizeSignature('A__B___C')).toBe('A_B_C')
  })

  it('handles dots and spaces as separators', () => {
    // '2p' ends with 'p' not a digit, so digit stripping doesn't apply
    expect(normalizeSignature('dugalj.alap 2p')).toBe('DUGALJ_ALAP_2P')
  })

  it('returns _EMPTY_ for null/undefined/empty input', () => {
    expect(normalizeSignature(null)).toBe('_EMPTY_')
    expect(normalizeSignature(undefined)).toBe('_EMPTY_')
    expect(normalizeSignature('')).toBe('_EMPTY_')
  })

  it('different raw names can normalize to the same signature', () => {
    const a = normalizeSignature('KAP_DUGALJ_2P_01')
    const b = normalizeSignature('kap-dugalj.2p.02')
    expect(a).toBe(b)
  })

  it('truncates very long block names', () => {
    const long = 'A'.repeat(200)
    const sig = normalizeSignature(long)
    expect(sig.length).toBeLessThanOrEqual(120)
  })

  it('handles unicode characters', () => {
    const sig = normalizeSignature('LÁMPA_MENNYEZET_01')
    expect(sig).toBe('LÁMPA_MENNYEZET')
  })
})

// ─── Project memory (record + lookup) ────────────────────────────────────────

describe('Project memory', () => {
  it('recordConfirmation writes to localStorage and lookupMemory finds it', () => {
    recordConfirmation('DUGALJ_2P', 'ASM-001', 'PRJ-1', 'user_override')
    const result = lookupMemory('DUGALJ_2P', 'PRJ-1')
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-001')
    expect(result.confidence).toBe(0.85)
    expect(result.tier).toBe('project')
  })

  it('multiple confirmations increment confirmCount', () => {
    recordConfirmation('LAMP_A', 'ASM-003', 'PRJ-1', 'user_override')
    recordConfirmation('LAMP_A', 'ASM-003', 'PRJ-1', 'save_plan')

    // Read raw localStorage to check confirmCount
    const raw = JSON.parse(localStorage.getItem('takeoffpro_recmem_proj_PRJ-1'))
    const sig = normalizeSignature('LAMP_A')
    expect(raw[sig].confirmCount).toBe(2)
  })

  it('tracks multiple raw blockNames per signature', () => {
    recordConfirmation('LAMP_01', 'ASM-003', 'PRJ-1', 'user_override')
    recordConfirmation('LAMP_02', 'ASM-003', 'PRJ-1', 'user_override')

    const raw = JSON.parse(localStorage.getItem('takeoffpro_recmem_proj_PRJ-1'))
    const sig = normalizeSignature('LAMP_01')
    expect(raw[sig].blockNames).toContain('LAMP_01')
    expect(raw[sig].blockNames).toContain('LAMP_02')
  })

  it('forgetEntry removes a project mapping', () => {
    recordConfirmation('DUGALJ_2P', 'ASM-001', 'PRJ-1', 'user_override')
    const sig = normalizeSignature('DUGALJ_2P')
    forgetEntry(sig, 'project', 'PRJ-1')
    expect(lookupMemory('DUGALJ_2P', 'PRJ-1')).toBeNull()
  })

  it('clearProjectMemory wipes all entries for that project', () => {
    recordConfirmation('DUGALJ', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('LAMP', 'ASM-003', 'PRJ-1', 'user_override')
    clearProjectMemory('PRJ-1')
    expect(lookupMemory('DUGALJ', 'PRJ-1')).toBeNull()
    expect(lookupMemory('LAMP', 'PRJ-1')).toBeNull()
  })

  it('rejects non-explicit source types', () => {
    recordConfirmation('DUGALJ', 'ASM-001', 'PRJ-1', 'auto_background')
    expect(lookupMemory('DUGALJ', 'PRJ-1')).toBeNull()
  })

  it('ignores null/undefined blockName, asmId, or projectId', () => {
    recordConfirmation(null, 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('DUGALJ', null, 'PRJ-1', 'user_override')
    recordConfirmation('DUGALJ', 'ASM-001', null, 'user_override')
    // None of these should have written anything
    expect(getMemoryStats().projectEntries).toBe(0)
  })
})

// ─── Account promotion ───────────────────────────────────────────────────────

describe('Account promotion', () => {
  it('does NOT promote with only 1 project', () => {
    recordConfirmation('DUGALJ_2P', 'ASM-001', 'PRJ-1', 'user_override')
    // Account memory should be empty
    const acctKey = `takeoffpro_recmem_account_${getAccountId()}`
    const acctMem = JSON.parse(localStorage.getItem(acctKey) || '{}')
    expect(Object.keys(acctMem)).toHaveLength(0)
  })

  it('promotes when 2 projects agree on same asmId', () => {
    recordConfirmation('DUGALJ_2P', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('DUGALJ_2P', 'ASM-001', 'PRJ-2', 'user_override')

    // Account memory should now have the entry
    const result = lookupMemory('DUGALJ_2P', 'PRJ-3') // different project — tests account fallback
    // First try project memory (PRJ-3 has none), then account
    // But PRJ-3 has no project memory, so it should fall through to account
    // However, lookupMemory checks project first. Let's look without project context:
    const acctKey = `takeoffpro_recmem_account_${getAccountId()}`
    const acctMem = JSON.parse(localStorage.getItem(acctKey) || '{}')
    const sig = normalizeSignature('DUGALJ_2P')
    expect(acctMem[sig]).toBeDefined()
    expect(acctMem[sig].asmId).toBe('ASM-001')
  })

  it('account memory has confidence 0.90', () => {
    recordConfirmation('LAMP_A', 'ASM-003', 'PRJ-1', 'user_override')
    recordConfirmation('LAMP_A', 'ASM-003', 'PRJ-2', 'save_plan')

    // Look up from a project that has no project memory for this block
    const result = lookupMemory('LAMP_A', 'PRJ-3')
    expect(result).not.toBeNull()
    expect(result.confidence).toBe(0.90)
    expect(result.tier).toBe('account')
  })

  it('does NOT promote when projects disagree (conflict)', () => {
    recordConfirmation('GENERIC_BLOCK', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('GENERIC_BLOCK', 'ASM-002', 'PRJ-2', 'user_override')

    // Account memory should NOT have the entry
    const acctKey = `takeoffpro_recmem_account_${getAccountId()}`
    const acctMem = JSON.parse(localStorage.getItem(acctKey) || '{}')
    const sig = normalizeSignature('GENERIC_BLOCK')
    expect(acctMem[sig]).toBeUndefined()
  })
})

// ─── Conflict detection & storage ────────────────────────────────────────────

describe('Conflict detection and storage', () => {
  it('stores conflict with asmIds, projects, and count', () => {
    recordConfirmation('AMBIGUOUS_BLK', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('AMBIGUOUS_BLK', 'ASM-002', 'PRJ-2', 'user_override')

    const sig = normalizeSignature('AMBIGUOUS_BLK')
    const conflict = detectConflict(sig)
    expect(conflict).not.toBeNull()
    expect(conflict.asmIds).toContain('ASM-001')
    expect(conflict.asmIds).toContain('ASM-002')
    expect(conflict.projects['PRJ-1']).toBe('ASM-001')
    expect(conflict.projects['PRJ-2']).toBe('ASM-002')
    expect(conflict.count).toBeGreaterThanOrEqual(1)
    expect(conflict.lastSeen).toBeGreaterThan(0)
  })

  it('getAllConflicts returns all stored conflicts', () => {
    recordConfirmation('BLK_A', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('BLK_A', 'ASM-002', 'PRJ-2', 'user_override')

    const all = getAllConflicts()
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(1)
  })

  it('conflict count increments on repeated detection', () => {
    recordConfirmation('BLK_X', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('BLK_X', 'ASM-002', 'PRJ-2', 'user_override')
    // Record again from a third project with yet another mapping
    recordConfirmation('BLK_X', 'ASM-003', 'PRJ-3', 'user_override')

    const sig = normalizeSignature('BLK_X')
    const conflict = detectConflict(sig)
    expect(conflict.count).toBeGreaterThanOrEqual(2)
    expect(conflict.asmIds.length).toBeGreaterThanOrEqual(2)
  })

  it('conflict is cleared when all projects agree after resolution', () => {
    recordConfirmation('BLK_RESOLVE', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('BLK_RESOLVE', 'ASM-002', 'PRJ-2', 'user_override')

    const sig = normalizeSignature('BLK_RESOLVE')
    expect(detectConflict(sig)).not.toBeNull()

    // "Fix" PRJ-2 to agree with PRJ-1
    recordConfirmation('BLK_RESOLVE', 'ASM-001', 'PRJ-2', 'user_override')

    // After re-recording with agreement, conflict should be cleared and promoted
    expect(detectConflict(sig)).toBeNull()
  })
})

// ─── Cascade priority ────────────────────────────────────────────────────────

describe('Cascade priority', () => {
  it('project memory takes priority over account memory', () => {
    // Set up account memory (via 2 projects agreeing)
    recordConfirmation('SWITCH_A', 'ASM-002', 'PRJ-1', 'user_override')
    recordConfirmation('SWITCH_A', 'ASM-002', 'PRJ-2', 'user_override')

    // Now override in PRJ-1 to a different asmId
    recordConfirmation('SWITCH_A', 'ASM-005', 'PRJ-1', 'user_override')

    const result = lookupMemory('SWITCH_A', 'PRJ-1')
    expect(result.asmId).toBe('ASM-005')  // project wins
    expect(result.tier).toBe('project')
  })

  it('account memory is used when no project memory exists', () => {
    recordConfirmation('SOCKET_X', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('SOCKET_X', 'ASM-001', 'PRJ-2', 'user_override')

    // PRJ-3 has no project memory for SOCKET_X
    const result = lookupMemory('SOCKET_X', 'PRJ-3')
    expect(result).not.toBeNull()
    expect(result.tier).toBe('account')
    expect(result.asmId).toBe('ASM-001')
  })

  it('returns null when no memory exists at any tier', () => {
    const result = lookupMemory('TOTALLY_UNKNOWN_BLOCK', 'PRJ-99')
    expect(result).toBeNull()
  })
})

// ─── getMemoryStats ──────────────────────────────────────────────────────────

describe('getMemoryStats', () => {
  it('returns correct counts', () => {
    recordConfirmation('A', 'ASM-001', 'PRJ-1', 'user_override')
    recordConfirmation('B', 'ASM-002', 'PRJ-1', 'user_override')
    recordConfirmation('A', 'ASM-001', 'PRJ-2', 'user_override')  // triggers promotion

    const stats = getMemoryStats()
    expect(stats.projectEntries).toBeGreaterThanOrEqual(2)
    expect(stats.accountEntries).toBeGreaterThanOrEqual(1)
    expect(stats.projectCount).toBeGreaterThanOrEqual(2)
  })
})

// ─── getAccountId ────────────────────────────────────────────────────────────

describe('getAccountId', () => {
  it('returns a stable ID across calls', () => {
    const id1 = getAccountId()
    const id2 = getAccountId()
    expect(id1).toBe(id2)
    expect(id1.length).toBeGreaterThan(0)
  })

  it('generates anon ID when no Supabase session exists', () => {
    const id = getAccountId()
    expect(id).toMatch(/^anon_/)
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles blockName that normalizes to only digits → _EMPTY_', () => {
    recordConfirmation('12345', 'ASM-001', 'PRJ-1', 'user_override')
    // normalizeSignature('12345') strips trailing digits → '' → '_EMPTY_'
    // recordConfirmation should bail on _EMPTY_ signature
    expect(lookupMemory('12345', 'PRJ-1')).toBeNull()
  })

  it('handles concurrent project scans gracefully', () => {
    // Record many projects quickly
    for (let i = 0; i < 10; i++) {
      recordConfirmation('MASS_BLOCK', 'ASM-001', `PRJ-${i}`, 'user_override')
    }
    const result = lookupMemory('MASS_BLOCK', 'PRJ-999')
    expect(result).not.toBeNull()
    expect(result.tier).toBe('account')
    expect(result.asmId).toBe('ASM-001')
  })

  it('clearProjectMemory on nonexistent project does not throw', () => {
    expect(() => clearProjectMemory('PRJ-NONEXISTENT')).not.toThrow()
  })

  it('lookupMemory without projectId still checks account memory', () => {
    recordConfirmation('ACCT_TEST', 'ASM-003', 'PRJ-1', 'user_override')
    recordConfirmation('ACCT_TEST', 'ASM-003', 'PRJ-2', 'user_override')

    // Call with null/undefined projectId — should still check account
    const result = lookupMemory('ACCT_TEST', null)
    expect(result).not.toBeNull()
    expect(result.tier).toBe('account')
  })
})
