/**
 * Quote Pruning — localStorage retention cap tests
 *
 * Proves:
 * 1. Saving quotes beyond MAX_QUOTES prunes oldest
 * 2. Newest quotes are retained
 * 3. Normal save/load still works under the cap
 * 4. Updating an existing quote does not trigger pruning if under cap
 * 5. MAX_QUOTES is exported and equals 100
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

import { loadQuotes, saveQuote, saveQuotes, MAX_QUOTES } from '../data/store.js'

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQuote(id, createdAt) {
  return {
    id,
    createdAt: createdAt || new Date().toISOString(),
    created_at: createdAt || new Date().toISOString(),
    status: 'draft',
    items: [{ name: 'test-item', qty: 1 }],
  }
}

function seedQuotes(n) {
  const quotes = []
  for (let i = 0; i < n; i++) {
    quotes.push(makeQuote(`QT-SEED-${String(i).padStart(4, '0')}`))
  }
  saveQuotes(quotes)
  return quotes
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  store = {}
  vi.clearAllMocks()
})

describe('MAX_QUOTES export', () => {
  it('is exported and equals 100', () => {
    expect(MAX_QUOTES).toBe(100)
  })
})

describe('quote pruning on save', () => {
  it('does NOT prune when under cap', () => {
    seedQuotes(50)
    saveQuote(makeQuote('QT-NEW-001'))
    const result = loadQuotes()
    expect(result.length).toBe(51)
    expect(result[0].id).toBe('QT-NEW-001')
  })

  it('does NOT prune at exactly MAX_QUOTES', () => {
    seedQuotes(MAX_QUOTES - 1)
    saveQuote(makeQuote('QT-NEW-AT-CAP'))
    const result = loadQuotes()
    expect(result.length).toBe(MAX_QUOTES)
    expect(result[0].id).toBe('QT-NEW-AT-CAP')
  })

  it('prunes oldest when exceeding MAX_QUOTES', () => {
    seedQuotes(MAX_QUOTES)
    // Array is now exactly at cap. Adding one more should prune the last.
    const lastSeed = loadQuotes()[MAX_QUOTES - 1]
    saveQuote(makeQuote('QT-OVERFLOW'))
    const result = loadQuotes()
    expect(result.length).toBe(MAX_QUOTES)
    // Newest is at position 0
    expect(result[0].id).toBe('QT-OVERFLOW')
    // The oldest seed quote should be gone
    expect(result.find(q => q.id === lastSeed.id)).toBeUndefined()
  })

  it('prunes multiple excess quotes to exactly MAX_QUOTES', () => {
    // Simulate a scenario where raw saveQuotes wrote more than MAX_QUOTES
    // (e.g., from a remote sync or older version without pruning)
    const oversized = []
    for (let i = 0; i < MAX_QUOTES + 20; i++) {
      oversized.push(makeQuote(`QT-OLD-${String(i).padStart(4, '0')}`))
    }
    saveQuotes(oversized) // raw save, no pruning
    expect(loadQuotes().length).toBe(MAX_QUOTES + 20)

    // Now saveQuote triggers pruning
    saveQuote(makeQuote('QT-TRIGGER'))
    const result = loadQuotes()
    expect(result.length).toBe(MAX_QUOTES)
    expect(result[0].id).toBe('QT-TRIGGER')
  })

  it('retains newest quotes and drops oldest', () => {
    seedQuotes(MAX_QUOTES)
    const before = loadQuotes()
    const firstFiveIds = before.slice(0, 5).map(q => q.id)

    // Add 3 new quotes
    saveQuote(makeQuote('QT-A'))
    saveQuote(makeQuote('QT-B'))
    saveQuote(makeQuote('QT-C'))

    const after = loadQuotes()
    expect(after.length).toBe(MAX_QUOTES)
    // All 3 new quotes are present at front
    expect(after[0].id).toBe('QT-C')
    expect(after[1].id).toBe('QT-B')
    expect(after[2].id).toBe('QT-A')
    // Earlier seed quotes (positions 0-4 before) are still present
    for (const id of firstFiveIds) {
      expect(after.find(q => q.id === id)).toBeDefined()
    }
    // Last 3 seed quotes should have been pruned
    const last3 = before.slice(-3).map(q => q.id)
    for (const id of last3) {
      expect(after.find(q => q.id === id)).toBeUndefined()
    }
  })
})

describe('quote update does not spuriously prune', () => {
  it('updating existing quote does not change array length', () => {
    seedQuotes(MAX_QUOTES)
    const before = loadQuotes()
    const target = before[50]

    saveQuote({ ...target, status: 'sent', items: [{ name: 'updated', qty: 99 }] })

    const after = loadQuotes()
    expect(after.length).toBe(MAX_QUOTES)
    // Updated quote is at same position
    const updated = after.find(q => q.id === target.id)
    expect(updated).toBeDefined()
    expect(updated.status).toBe('sent')
    expect(updated.items[0].qty).toBe(99)
  })
})

describe('normal save/load behavior preserved', () => {
  it('saveQuote + loadQuotes round-trip works', () => {
    const q = makeQuote('QT-ROUND-TRIP')
    saveQuote(q)
    const loaded = loadQuotes()
    expect(loaded.length).toBe(1)
    expect(loaded[0].id).toBe('QT-ROUND-TRIP')
    expect(loaded[0].items).toEqual([{ name: 'test-item', qty: 1 }])
  })

  it('new quotes are prepended (newest-first order)', () => {
    saveQuote(makeQuote('QT-FIRST'))
    saveQuote(makeQuote('QT-SECOND'))
    saveQuote(makeQuote('QT-THIRD'))
    const loaded = loadQuotes()
    expect(loaded.map(q => q.id)).toEqual(['QT-THIRD', 'QT-SECOND', 'QT-FIRST'])
  })
})
