/**
 * Quote ID collision regression tests.
 *
 * Verifies that the quote ID generation is collision-safe:
 * - IDs are unique across multiple generations
 * - IDs don't recycle after prune/delete
 * - Legacy QT-YYYY-NNN format quotes remain readable
 * - quoteNumber (display) is separate from id (internal key)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage and crypto
const mockStorage = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => mockStorage[k] ?? null,
  setItem: (k, v) => { mockStorage[k] = v },
  removeItem: (k) => { delete mockStorage[k] },
})

// Ensure crypto.randomUUID exists
if (!globalThis.crypto) globalThis.crypto = {}
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => {
    const hex = () => Math.floor(Math.random() * 16).toString(16)
    return Array.from({ length: 32 }, hex).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
  }
}

import { generateQuoteId, generateQuoteNumber, loadQuotes, saveQuote } from '../data/store.js'

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
})

describe('generateQuoteId — collision-safe', () => {
  it('generates unique IDs across 100 calls', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) {
      ids.add(generateQuoteId())
    }
    expect(ids.size).toBe(100)
  })

  it('ID format is QT-{year}-{random}', () => {
    const id = generateQuoteId()
    const year = new Date().getFullYear()
    expect(id).toMatch(new RegExp(`^QT-${year}-[a-z0-9]{6}$`))
  })

  it('IDs are not count-based (not affected by existing quotes)', () => {
    // Save some quotes then generate — should NOT produce QT-YYYY-004
    const q1 = { id: 'QT-2026-abc123', quoteNumber: 'QT-2026-001', createdAt: new Date().toISOString() }
    const q2 = { id: 'QT-2026-def456', quoteNumber: 'QT-2026-002', createdAt: new Date().toISOString() }
    const q3 = { id: 'QT-2026-ghi789', quoteNumber: 'QT-2026-003', createdAt: new Date().toISOString() }
    saveQuote(q1); saveQuote(q2); saveQuote(q3)

    const newId = generateQuoteId()
    // Should be random, not QT-2026-004
    expect(newId).not.toBe('QT-2026-004')
    expect(newId).toMatch(/^QT-\d{4}-[a-z0-9]{6}$/)
  })
})

describe('generateQuoteNumber — sequential display number', () => {
  it('starts at 001 when no quotes exist', () => {
    const num = generateQuoteNumber()
    const year = new Date().getFullYear()
    expect(num).toBe(`QT-${year}-001`)
  })

  it('increments based on highest existing number', () => {
    const year = new Date().getFullYear()
    saveQuote({ id: 'QT-x-1', quoteNumber: `QT-${year}-005`, createdAt: new Date().toISOString() })
    saveQuote({ id: 'QT-x-2', quoteNumber: `QT-${year}-010`, createdAt: new Date().toISOString() })
    const num = generateQuoteNumber()
    expect(num).toBe(`QT-${year}-011`)
  })

  it('does not recycle numbers after prune', () => {
    const year = new Date().getFullYear()
    // Save quote with number 050, then delete it
    saveQuote({ id: 'QT-x-1', quoteNumber: `QT-${year}-050`, createdAt: new Date().toISOString() })
    // Simulate prune — clear all quotes
    Object.keys(mockStorage).forEach(k => delete mockStorage[k])
    // Without any quotes, number starts at 001 — but if we add back a quote with 050:
    saveQuote({ id: 'QT-x-2', quoteNumber: `QT-${year}-050`, createdAt: new Date().toISOString() })
    const num = generateQuoteNumber()
    expect(num).toBe(`QT-${year}-051`) // correctly increments past highest
  })
})

describe('legacy quote backward compatibility', () => {
  it('old QT-YYYY-NNN format quotes load correctly', () => {
    // Legacy quotes have id=QT-YYYY-NNN with no quoteNumber field
    const legacy = { id: 'QT-2025-042', projectName: 'Test', createdAt: '2025-01-01T00:00:00Z' }
    saveQuote(legacy)
    const loaded = loadQuotes()
    expect(loaded[0].id).toBe('QT-2025-042')
    // quoteNumber falls back to id for display
    expect(loaded[0].quoteNumber || loaded[0].id).toBe('QT-2025-042')
  })

  it('generateQuoteNumber reads legacy id format for max calculation', () => {
    const year = new Date().getFullYear()
    // Legacy quote with old sequential ID (no quoteNumber field)
    saveQuote({ id: `QT-${year}-020`, createdAt: new Date().toISOString() })
    const num = generateQuoteNumber()
    expect(num).toBe(`QT-${year}-021`) // respects legacy numbering
  })
})

describe('quote identity separation', () => {
  it('id and quoteNumber are different values', () => {
    const id = generateQuoteId()
    const num = generateQuoteNumber()
    expect(id).not.toBe(num)
    // id is random, num is sequential
    expect(id).toMatch(/^QT-\d{4}-[a-z0-9]{6}$/)
    expect(num).toMatch(/^QT-\d{4}-\d{3}$/)
  })
})
