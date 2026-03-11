/**
 * localStorage concurrency guard — unit + integration tests
 *
 * Proves:
 * 1. guardedWrite writes data and bumps version on clean path
 * 2. guardedWrite retries on cross-tab version conflict
 * 3. guardedWrite falls back after exhausting retries
 * 4. guardedWrite handles corrupt/missing data gracefully
 * 5. Version counter is monotonic across successive writes
 * 6. saveQuote integration: conflict recovery preserves both tabs' writes
 * 7. Plan meta integration: conflict recovery preserves concurrent updates
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

import { guardedWrite } from '../data/lsConcurrency.js'
import { loadQuotes, saveQuote, saveQuotes, MAX_QUOTES, QUOTES_SCHEMA_VERSION } from '../data/store.js'
import { unwrapVersioned, wrapVersioned } from '../data/schemaVersion.js'

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

// ── guardedWrite unit tests ──────────────────────────────────────────────────

describe('guardedWrite — clean path', () => {
  it('writes data and bumps version', () => {
    const writeFn = vi.fn((data) => {
      store['k'] = JSON.stringify(data)
    })
    const result = guardedWrite('k', [], (data) => [...data, 'a'], writeFn)
    expect(result).toEqual(['a'])
    expect(writeFn).toHaveBeenCalledTimes(1)
    expect(store['k__v']).toBe('1')
  })

  it('uses fallback when key is absent', () => {
    const result = guardedWrite('empty', { x: 1 }, (d) => ({ ...d, y: 2 }), (data) => {
      store['empty'] = JSON.stringify(data)
    })
    expect(result).toEqual({ x: 1, y: 2 })
  })

  it('uses fallback when stored JSON is corrupt', () => {
    store['bad'] = 'not{json'
    const result = guardedWrite('bad', [1], (d) => [...d, 2], (data) => {
      store['bad'] = JSON.stringify(data)
    })
    expect(result).toEqual([1, 2])
  })

  it('bumps version monotonically across successive writes', () => {
    const write = (data) => { store['k'] = JSON.stringify(data) }
    guardedWrite('k', 0, () => 1, write)
    expect(store['k__v']).toBe('1')
    guardedWrite('k', 0, () => 2, write)
    expect(store['k__v']).toBe('2')
    guardedWrite('k', 0, () => 3, write)
    expect(store['k__v']).toBe('3')
  })
})

describe('guardedWrite — conflict detection', () => {
  let savedImpl

  beforeEach(() => {
    savedImpl = localStorageMock.getItem.getMockImplementation()
  })

  afterEach(() => {
    // Restore default getItem implementation
    localStorageMock.getItem.mockImplementation(savedImpl || (k => store[k] ?? null))
  })

  it('retries when version changes between read and re-check', () => {
    store['k'] = JSON.stringify(['old'])
    store['k__v'] = '5'

    let vReads = 0
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'k__v') {
        vReads++
        if (vReads === 1) return '5' // v1 read
        if (vReads === 2) {
          // Simulate another tab writing between read and re-check
          store['k'] = JSON.stringify(['old', 'from_tab_b'])
          store['k__v'] = '6'
          return '6' // conflict!
        }
        // Subsequent reads return current store value
        return store['k__v'] ?? '0'
      }
      return store[key] ?? null
    })

    let mutatorCalls = 0
    const result = guardedWrite('k', [], (data) => {
      mutatorCalls++
      return [...data, 'mine']
    }, (data) => {
      store['k'] = JSON.stringify(data)
    })

    expect(mutatorCalls).toBe(2) // retried once
    expect(result).toEqual(['old', 'from_tab_b', 'mine']) // fresh data on retry
  })

  it('writes anyway after exhausting retries', () => {
    store['k'] = JSON.stringify([1])
    store['k__v'] = '0'

    let vReads = 0
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'k__v') {
        vReads++
        // Every call returns a different value → permanent conflict
        return String(vReads)
      }
      return store[key] ?? null
    })

    const writeFn = vi.fn((data) => {
      store['k'] = JSON.stringify(data)
    })

    guardedWrite('k', [], (data) => [...data, 'forced'], writeFn, 2)
    // After 2 retries (3 total attempts), still writes
    expect(writeFn).toHaveBeenCalledTimes(1)
  })
})

// ── saveQuote integration ────────────────────────────────────────────────────

describe('saveQuote — conflict recovery', () => {
  let savedImpl

  beforeEach(() => {
    savedImpl = localStorageMock.getItem.getMockImplementation()
  })

  afterEach(() => {
    localStorageMock.getItem.mockImplementation(savedImpl || (k => store[k] ?? null))
  })

  it('recovers from cross-tab conflict without losing either write', () => {
    // Seed 3 quotes
    saveQuotes([makeQuote('QT-S1'), makeQuote('QT-S2'), makeQuote('QT-S3')])

    const vKey = 'takeoffpro_quotes__v'
    let vReads = 0
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === vKey) {
        vReads++
        if (vReads === 1) return store[vKey] ?? '0' // v1 read
        if (vReads === 2) {
          // Simulate: another tab saved a quote between our read and re-check
          const raw = JSON.parse(store['takeoffpro_quotes'] || 'null')
          const current = unwrapVersioned(raw, QUOTES_SCHEMA_VERSION, [])
          current.unshift({ id: 'QT-OTHER-TAB', status: 'draft', items: [] })
          store['takeoffpro_quotes'] = JSON.stringify(wrapVersioned(current, QUOTES_SCHEMA_VERSION))
          store[vKey] = String((parseInt(store[vKey] || '0', 10)) + 1)
          return store[vKey] // conflict!
        }
        return store[vKey] ?? '0'
      }
      return store[key] ?? null
    })

    saveQuote(makeQuote('QT-OURS'))
    const result = loadQuotes()

    // Both writes are preserved
    expect(result.find(q => q.id === 'QT-OTHER-TAB')).toBeDefined()
    expect(result.find(q => q.id === 'QT-OURS')).toBeDefined()
    // Original seeds still present
    expect(result.find(q => q.id === 'QT-S1')).toBeDefined()
    expect(result.length).toBe(5) // 3 seed + other tab + ours
  })
})

// ── Plan meta integration (pure guardedWrite, no planStore import) ───────────

describe('plan meta — conflict recovery via guardedWrite', () => {
  const PLAN_KEY = 'takeoffpro_plans_meta'
  let savedImpl

  beforeEach(() => {
    savedImpl = localStorageMock.getItem.getMockImplementation()
  })

  afterEach(() => {
    localStorageMock.getItem.mockImplementation(savedImpl || (k => store[k] ?? null))
  })

  it('concurrent updatePlanMeta preserves both updates', () => {
    // Seed plan meta
    const plans = [
      { id: 'P1', name: 'Plan A', markerCount: 0 },
      { id: 'P2', name: 'Plan B', markerCount: 0 },
    ]
    store[PLAN_KEY] = JSON.stringify(plans)

    const vKey = PLAN_KEY + '__v'
    let vReads = 0
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === vKey) {
        vReads++
        if (vReads === 1) return store[vKey] ?? '0'
        if (vReads === 2) {
          // Another tab updates P2 between our read and re-check
          const current = JSON.parse(store[PLAN_KEY])
          const p2 = current.find(p => p.id === 'P2')
          if (p2) p2.markerCount = 7
          store[PLAN_KEY] = JSON.stringify(current)
          store[vKey] = String((parseInt(store[vKey] || '0', 10)) + 1)
          return store[vKey]
        }
        return store[vKey] ?? '0'
      }
      return store[key] ?? null
    })

    // Our write: update P1
    guardedWrite(PLAN_KEY, [], (meta) => {
      const idx = meta.findIndex(p => p.id === 'P1')
      if (idx >= 0) meta[idx] = { ...meta[idx], name: 'Plan A Updated' }
      return meta
    }, (data) => { store[PLAN_KEY] = JSON.stringify(data) })

    const result = JSON.parse(store[PLAN_KEY])
    const p1 = result.find(p => p.id === 'P1')
    const p2 = result.find(p => p.id === 'P2')

    // Both updates preserved
    expect(p1.name).toBe('Plan A Updated')  // our write
    expect(p2.markerCount).toBe(7)          // other tab's write
  })
})
