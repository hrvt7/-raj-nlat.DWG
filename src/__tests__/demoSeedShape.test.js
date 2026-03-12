// ─── Demo Seed Shape Tests ──────────────────────────────────────────────────
// Verifies that demo quotes have the full QuoteView-compatible shape
// so they render correctly in QuoteView and generate proper PDFs.
// These tests do NOT touch localStorage — they test the data definitions only.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We need to mock localStorage and the imports that use it
// before importing demoSeed
vi.mock('../data/projectStore.js', () => ({
  saveProject: vi.fn(),
  loadProjects: vi.fn(() => []),
  PROJECTS_SCHEMA_VERSION: 1,
}))

vi.mock('../data/planStore.js', () => ({
  PLANS_META_SCHEMA_VERSION: 1,
}))

vi.mock('../data/store.js', () => ({
  QUOTES_SCHEMA_VERSION: 1,
}))

vi.mock('../data/schemaVersion.js', () => ({
  unwrapVersioned: vi.fn((raw, _v, fallback) => {
    if (Array.isArray(raw)) return raw
    if (raw && raw.data) return raw.data
    return fallback
  }),
  wrapVersioned: vi.fn((data, _v) => ({ _v, data })),
}))

// Mock localStorage
const storage = {}
const localStorageMock = {
  getItem: vi.fn(key => storage[key] ?? null),
  setItem: vi.fn((key, val) => { storage[key] = val }),
  removeItem: vi.fn(key => { delete storage[key] }),
  clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]) }),
}
vi.stubGlobal('localStorage', localStorageMock)

// Now import the module under test
const { seedDemoData } = await import('../data/demoSeed.js')

// ── Required fields for QuoteView rendering ─────────────────────────────────
const QUOTEVIEW_REQUIRED_FIELDS = [
  'id', 'projectName', 'project_name', 'name',
  'clientName', 'client_name',
  'clientAddress', 'clientTaxNumber', 'projectAddress',
  'createdAt', 'created_at', 'status',
  'outputMode', 'groupBy', 'vatPercent',
  'gross', 'totalMaterials', 'totalLabor', 'totalHours',
  'summary', 'pricingData',
  'assemblySummary', 'items',
]

const SUMMARY_REQUIRED_FIELDS = ['grandTotal', 'totalWorkHours']
const PRICING_REQUIRED_FIELDS = ['hourlyRate', 'markup_pct']

describe('Demo seed quote shape', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('seedDemoData produces quotes with all QuoteView-required fields', () => {
    seedDemoData()

    // Extract the quotes from the setItem call
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    expect(quotesCall).toBeTruthy()

    const stored = JSON.parse(quotesCall[1])
    const quotes = stored.data
    expect(quotes.length).toBeGreaterThanOrEqual(2)

    for (const quote of quotes) {
      for (const field of QUOTEVIEW_REQUIRED_FIELDS) {
        expect(quote).toHaveProperty(field)
      }
    }
  })

  it('demo quote summary has required sub-fields', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      for (const field of SUMMARY_REQUIRED_FIELDS) {
        expect(quote.summary).toHaveProperty(field)
        expect(typeof quote.summary[field]).toBe('number')
      }
    }
  })

  it('demo quote pricingData has required sub-fields', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      for (const field of PRICING_REQUIRED_FIELDS) {
        expect(quote.pricingData).toHaveProperty(field)
        expect(typeof quote.pricingData[field]).toBe('number')
      }
    }
  })

  it('demo quote assemblySummary is non-empty array with proper shape', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      expect(Array.isArray(quote.assemblySummary)).toBe(true)
      expect(quote.assemblySummary.length).toBeGreaterThan(0)

      for (const asm of quote.assemblySummary) {
        expect(asm).toHaveProperty('id')
        expect(asm).toHaveProperty('name')
        expect(asm).toHaveProperty('qty')
        expect(asm).toHaveProperty('totalPrice')
        expect(typeof asm.qty).toBe('number')
        expect(typeof asm.totalPrice).toBe('number')
      }
    }
  })

  it('demo quote items is non-empty array with material and labor entries', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      expect(Array.isArray(quote.items)).toBe(true)
      expect(quote.items.length).toBeGreaterThan(0)

      const hasMaterial = quote.items.some(i => i.type === 'material')
      const hasLabor = quote.items.some(i => i.type === 'labor')
      expect(hasMaterial).toBe(true)
      expect(hasLabor).toBe(true)

      for (const item of quote.items) {
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('type')
        expect(item).toHaveProperty('qty')
        expect(item).toHaveProperty('unit')
      }
    }
  })

  it('demo quote has matching projectName / project_name aliases', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      expect(quote.projectName).toBe(quote.project_name)
      expect(quote.clientName).toBe(quote.client_name)
      // All three name fields should be equal
      expect(quote.projectName).toBe(quote.name)
    }
  })

  it('demo quote clientAddress and clientTaxNumber are non-empty strings', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      expect(typeof quote.clientAddress).toBe('string')
      expect(quote.clientAddress.length).toBeGreaterThan(0)
      expect(typeof quote.clientTaxNumber).toBe('string')
      expect(quote.clientTaxNumber.length).toBeGreaterThan(0)
      expect(typeof quote.projectAddress).toBe('string')
      expect(quote.projectAddress.length).toBeGreaterThan(0)
    }
  })

  it('demo quote financial fields are consistent', () => {
    seedDemoData()
    const quotesCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'takeoffpro_quotes')
    const quotes = JSON.parse(quotesCall[1]).data

    for (const quote of quotes) {
      // gross should match summary.grandTotal
      expect(quote.gross).toBe(quote.summary.grandTotal)
      // totalHours should match summary.totalWorkHours
      expect(quote.totalHours).toBe(quote.summary.totalWorkHours)
      // All financial fields should be positive numbers
      expect(quote.gross).toBeGreaterThan(0)
      expect(quote.totalMaterials).toBeGreaterThan(0)
      expect(quote.totalLabor).toBeGreaterThan(0)
      expect(quote.totalHours).toBeGreaterThan(0)
    }
  })
})
