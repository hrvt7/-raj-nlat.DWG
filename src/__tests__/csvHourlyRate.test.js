// ─── CSV Hourly Rate Source Selection — Regression Tests ─────────────────────
// Verifies that quoteToCSV uses the correct hourly-rate fallback chain:
//   1. quote.pricingData.hourlyRate  (quote snapshot — preferred)
//   2. settings.labor.hourly_rate    (global setting — fallback)
//   3. 9000                          (hardcoded default)
//
// A prior bug fix aligned this with the PDF output (which always used the
// quote snapshot). Before the fix, CSV used settings.labor.hourly_rate only,
// so changing global settings after quote creation silently diverged CSV output.

import { describe, it, expect } from 'vitest'
import { quoteToCSV } from '../utils/csvExport.js'

// ── Helper: extract the labor cost from CSV for a single labor item ──────────
// Creates a quote with one labor item (1 hour) and returns the computed
// labor cost from the CSV output, which equals the hourly rate used.
function extractLaborCost(quoteOverrides, settings) {
  const quote = {
    items: [{ name: 'Teszt munka', type: 'labor', qty: 1, hours: 1, unit: 'db' }],
    totalMaterials: 0,
    totalLabor: 0,
    ...quoteOverrides,
  }
  const csv = quoteToCSV(quote, settings || {})
  // CSV format: Tétel;Mennyiség;Egység;Anyag;Munkadíj;Nettó;ÁFA;Bruttó;Típus
  // First data row (after header) contains our labor item
  const lines = csv.split('\r\n')
  const dataLine = lines[1] // line 0 = header (with BOM), line 1 = first item
  const fields = dataLine.split(';')
  return parseInt(fields[4], 10) // Munkadíj column (index 4)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CSV hourly rate source selection', () => {

  it('prefers quote.pricingData.hourlyRate when present', () => {
    const laborCost = extractLaborCost(
      { pricingData: { hourlyRate: 12000 } },
      { labor: { hourly_rate: 8000 } }
    )
    // 1 hour × 12000 Ft/h = 12000 (quote snapshot wins, not settings 8000)
    expect(laborCost).toBe(12000)
  })

  it('falls back to settings.labor.hourly_rate when quote snapshot is missing', () => {
    const laborCost = extractLaborCost(
      { pricingData: {} },
      { labor: { hourly_rate: 7500 } }
    )
    expect(laborCost).toBe(7500)
  })

  it('falls back to 9000 default when both sources are missing', () => {
    const laborCost = extractLaborCost({}, {})
    expect(laborCost).toBe(9000)
  })

  it('quote snapshot is NOT overridden by different settings value', () => {
    // This is the exact regression scenario: settings changed after quote creation
    const laborCost = extractLaborCost(
      { pricingData: { hourlyRate: 15000 } },
      { labor: { hourly_rate: 5000 } }
    )
    // Must use 15000 (quote snapshot), not 5000 (current settings)
    expect(laborCost).toBe(15000)
  })
})
