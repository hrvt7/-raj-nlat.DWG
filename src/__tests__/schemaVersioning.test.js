/**
 * Schema Versioning — backward-compatible migration guard tests
 *
 * Proves:
 * 1. unwrapVersioned handles legacy arrays, current envelopes, future versions, corrupt data
 * 2. Legacy quote data (raw array) still loads via loadQuotes
 * 3. Legacy plan meta data (raw array) still loads via loadPlans
 * 4. Newly saved quotes carry schema version envelope
 * 5. Newly saved plan meta carries schema version envelope
 * 6. Corrupt or unknown-version data returns safe fallback
 * 7. saveQuote round-trips through envelope correctly
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock localStorage in-memory ──────────────────────────────────────────────
let store = {}
const localStorageMock = {
  getItem: vi.fn(k => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = String(v) }),
  removeItem: vi.fn(k => { delete store[k] }),
  clear: vi.fn(() => { store = {} }),
  get length() { return Object.keys(store).length },
  key: vi.fn(i => Object.keys(store)[i] ?? null),
}
vi.stubGlobal('localStorage', localStorageMock)

import { unwrapVersioned, wrapVersioned } from '../data/schemaVersion.js'
import { loadQuotes, saveQuotes, saveQuote, QUOTES_SCHEMA_VERSION } from '../data/store.js'
import { PLANS_META_SCHEMA_VERSION } from '../data/planStore.js'

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQuote(id) {
  return {
    id,
    createdAt: new Date().toISOString(),
    created_at: new Date().toISOString(),
    status: 'draft',
    items: [{ name: 'test-item', qty: 1 }],
  }
}

beforeEach(() => {
  store = {}
  vi.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. unwrapVersioned — core helper
// ═══════════════════════════════════════════════════════════════════════════════

describe('unwrapVersioned', () => {
  it('returns fallback for null/undefined', () => {
    expect(unwrapVersioned(null, 1, [])).toEqual([])
    expect(unwrapVersioned(undefined, 1, ['default'])).toEqual(['default'])
  })

  it('passes through legacy raw arrays (v0)', () => {
    const legacy = [{ id: 'Q-1' }, { id: 'Q-2' }]
    expect(unwrapVersioned(legacy, 1, [])).toBe(legacy) // same reference
  })

  it('unwraps current-version envelope', () => {
    const data = [{ id: 'Q-1' }]
    const envelope = { _v: 1, data }
    expect(unwrapVersioned(envelope, 1, [])).toBe(data) // same reference
  })

  it('unwraps older-version envelopes (forward compat path)', () => {
    const data = [{ id: 'Q-old' }]
    const envelope = { _v: 1, data }
    // currentVersion=2 should still accept v1 envelopes
    expect(unwrapVersioned(envelope, 2, [])).toBe(data)
  })

  it('returns fallback for future/unknown version', () => {
    const envelope = { _v: 99, data: [{ id: 'future' }] }
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = unwrapVersioned(envelope, 1, [])
    expect(result).toEqual([])
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('v99')
    )
    consoleWarn.mockRestore()
  })

  it('returns fallback for corrupt non-array non-envelope objects', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(unwrapVersioned({ random: 'object' }, 1, [])).toEqual([])
    expect(unwrapVersioned('string', 1, [])).toEqual([])
    expect(unwrapVersioned(42, 1, [])).toEqual([])
    consoleWarn.mockRestore()
  })

  it('returns fallback when envelope has non-array data', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(unwrapVersioned({ _v: 1, data: 'not-array' }, 1, [])).toEqual([])
    consoleWarn.mockRestore()
  })
})

describe('wrapVersioned', () => {
  it('wraps data in envelope with version', () => {
    const data = [{ id: 'Q-1' }]
    expect(wrapVersioned(data, 1)).toEqual({ _v: 1, data })
  })

  it('wraps empty array', () => {
    expect(wrapVersioned([], 1)).toEqual({ _v: 1, data: [] })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Legacy quote data still loads
// ═══════════════════════════════════════════════════════════════════════════════

describe('quotes — legacy data backward compatibility', () => {
  it('loadQuotes returns legacy raw array from localStorage', () => {
    const legacy = [makeQuote('QT-LEGACY-1'), makeQuote('QT-LEGACY-2')]
    store['takeoffpro_quotes'] = JSON.stringify(legacy)

    const result = loadQuotes()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('QT-LEGACY-1')
    expect(result[1].id).toBe('QT-LEGACY-2')
  })

  it('loadQuotes returns empty array when key is absent', () => {
    expect(loadQuotes()).toEqual([])
  })

  it('loadQuotes returns empty array for corrupt JSON', () => {
    store['takeoffpro_quotes'] = 'not{json'
    expect(loadQuotes()).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Legacy plan meta data still loads
// ═══════════════════════════════════════════════════════════════════════════════

describe('plan meta — legacy data backward compatibility', () => {
  it('loadPlans returns legacy raw array from localStorage', async () => {
    const legacy = [
      { id: 'P-1', name: 'Plan A' },
      { id: 'P-2', name: 'Plan B' },
    ]
    store['takeoffpro_plans_meta'] = JSON.stringify(legacy)

    // loadPlans is re-exported from planStore.js
    const { loadPlans } = await import('../data/planStore.js')
    const result = loadPlans()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('P-1')
  })

  it('loadPlans returns empty array when key is absent', async () => {
    const { loadPlans } = await import('../data/planStore.js')
    expect(loadPlans()).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Newly saved data carries schema version envelope
// ═══════════════════════════════════════════════════════════════════════════════

describe('quotes — versioned envelope on save', () => {
  it('saveQuotes wraps data in versioned envelope', () => {
    const quotes = [makeQuote('QT-V1')]
    saveQuotes(quotes)

    const raw = JSON.parse(store['takeoffpro_quotes'])
    expect(raw._v).toBe(QUOTES_SCHEMA_VERSION)
    expect(Array.isArray(raw.data)).toBe(true)
    expect(raw.data[0].id).toBe('QT-V1')
  })

  it('saveQuote wraps data in versioned envelope', () => {
    saveQuote(makeQuote('QT-SINGLE'))

    const raw = JSON.parse(store['takeoffpro_quotes'])
    expect(raw._v).toBe(QUOTES_SCHEMA_VERSION)
    expect(Array.isArray(raw.data)).toBe(true)
    expect(raw.data[0].id).toBe('QT-SINGLE')
  })

  it('QUOTES_SCHEMA_VERSION is exported and equals 1', () => {
    expect(QUOTES_SCHEMA_VERSION).toBe(1)
  })

  it('PLANS_META_SCHEMA_VERSION is exported and equals 1', () => {
    expect(PLANS_META_SCHEMA_VERSION).toBe(1)
  })
})

describe('plan meta — versioned envelope on save', () => {
  it('savePlan wraps plan meta in versioned envelope', async () => {
    const { savePlan } = await import('../data/planStore.js')
    await savePlan({ id: 'PLN-V1', name: 'Versioned Plan' }, null)

    const raw = JSON.parse(store['takeoffpro_plans_meta'])
    expect(raw._v).toBe(PLANS_META_SCHEMA_VERSION)
    expect(Array.isArray(raw.data)).toBe(true)
    expect(raw.data[0].id).toBe('PLN-V1')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Corrupt or unknown-version data fails safely
// ═══════════════════════════════════════════════════════════════════════════════

describe('quotes — safe failure on corrupt/future data', () => {
  it('returns empty for future schema version', () => {
    store['takeoffpro_quotes'] = JSON.stringify({ _v: 99, data: [{ id: 'future' }] })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadQuotes()
    expect(result).toEqual([])
    expect(consoleWarn).toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('returns empty for non-array non-envelope object', () => {
    store['takeoffpro_quotes'] = JSON.stringify({ random: 'object' })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = loadQuotes()
    expect(result).toEqual([])
    consoleWarn.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Round-trip: legacy → save → load preserves data
// ═══════════════════════════════════════════════════════════════════════════════

describe('quotes — legacy-to-versioned round-trip', () => {
  it('legacy data is upgraded to versioned on next save', () => {
    // Simulate legacy data written by old code
    const legacy = [makeQuote('QT-OLD-1'), makeQuote('QT-OLD-2')]
    store['takeoffpro_quotes'] = JSON.stringify(legacy)

    // Load (gets legacy array)
    const loaded = loadQuotes()
    expect(loaded).toHaveLength(2)

    // Save via saveQuote — triggers wrap
    saveQuote(makeQuote('QT-NEW'))

    // Verify stored format is now versioned
    const raw = JSON.parse(store['takeoffpro_quotes'])
    expect(raw._v).toBe(QUOTES_SCHEMA_VERSION)
    expect(raw.data).toHaveLength(3)
    expect(raw.data[0].id).toBe('QT-NEW')

    // Load again — should unwrap correctly
    const reloaded = loadQuotes()
    expect(reloaded).toHaveLength(3)
    expect(reloaded[0].id).toBe('QT-NEW')
    expect(reloaded[1].id).toBe('QT-OLD-1')
  })

  it('saveQuote on versioned envelope preserves existing quotes', () => {
    // Start with versioned data
    saveQuotes([makeQuote('QT-A'), makeQuote('QT-B')])

    // Add one more via saveQuote
    saveQuote(makeQuote('QT-C'))

    const result = loadQuotes()
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('QT-C')
    expect(result[1].id).toBe('QT-A')
    expect(result[2].id).toBe('QT-B')
  })
})
