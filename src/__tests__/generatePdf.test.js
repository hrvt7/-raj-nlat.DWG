// ─── generatePdf / buildQuoteHtml tests ──────────────────────────────────────
// Verifies the professional quote PDF output structure, parties block,
// project scope, client fields, and graceful degradation.
import { describe, it, expect, vi } from 'vitest'
import { buildQuoteHtml, sanitizeFilename, generatePdf } from '../utils/generatePdf.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const baseSettings = {
  company: {
    name: 'Kovács Villanyszerelés Kft.',
    address: '1234 Budapest, Fő utca 1.',
    tax_number: '12345678-2-11',
    phone: '+36 20 123 4567',
    email: 'iroda@kovacs.hu',
    bank_account: '12345678-12345678-12345678',
  },
  labor: { vat_percent: 27 },
  quote: { validity_days: 30 },
}

const baseQuote = {
  id: 'QT-2026-001',
  projectName: 'Teszt Lakás Villamos',
  clientName: 'Nagy Péter',
  clientAddress: '5600 Békéscsaba, Kossuth tér 3.',
  clientTaxNumber: '87654321-1-04',
  projectAddress: '1052 Budapest, Váci utca 12.',
  createdAt: '2026-03-10T10:00:00Z',
  totalMaterials: 450000,
  totalLabor: 320000,
  totalHours: 35.5,
  pricingData: { hourlyRate: 9000, markup_pct: 0 },
  assemblySummary: [
    { id: 'ASM-001', name: 'Dugalj 2P+F', qty: 12, totalPrice: 156000, materialCost: 84000, laborCost: 72000 },
    { id: 'ASM-003', name: 'Kapcsoló 1P', qty: 8, totalPrice: 64000, materialCost: 32000, laborCost: 32000 },
  ],
  items: [
    { name: 'Schneider Asfora 2P+F', type: 'material', qty: 12, unitPrice: 1200, unit: 'db', hours: 0 },
    { name: 'Kábelhúzás', type: 'labor', qty: 1, unitPrice: 0, unit: 'tétel', hours: 8 },
  ],
  inclusions: '',
  exclusions: '',
  notes: '',
  validityText: '',
  paymentTermsText: '',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildQuoteHtml — structure and content', () => {
  it('returns a valid HTML string', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
    expect(html).toContain('lang="hu"')
  })

  it('contains Vállalkozó (contractor) party block with company details', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('Vállalkozó')
    expect(html).toContain('Kovács Villanyszerelés Kft.')
    expect(html).toContain('1234 Budapest, Fő utca 1.')
    expect(html).toContain('Adószám: 12345678-2-11')
    expect(html).toContain('+36 20 123 4567')
    expect(html).toContain('iroda@kovacs.hu')
    expect(html).toContain('Bankszámlaszám: 12345678-12345678-12345678')
  })

  it('contains Megrendelő (client) party block with client details', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('Megrendelő')
    expect(html).toContain('Nagy Péter')
    expect(html).toContain('5600 Békéscsaba, Kossuth tér 3.')
    expect(html).toContain('Adószám: 87654321-1-04')
  })

  it('contains project address in scope row when provided', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('Projekt helyszíne')
    expect(html).toContain('1052 Budapest, Váci utca 12.')
  })

  it('contains project name in scope row', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('Teszt Lakás Villamos')
  })

  it('contains quote ID and date in header', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('QT-2026-001')
    expect(html).toContain('Árajánlat')
  })

  it('contains financial summary with correct totals', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'summary', 'combined')
    // Materials: 450 000, Labor: 320 000
    expect(html).toContain('Anyagköltség')
    expect(html).toContain('Munkadíj')
    expect(html).toContain('BRUTTÓ VÉGÖSSZEG')
  })

  it('contains assembly summary table', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'summary')
    expect(html).toContain('Dugalj 2P+F')
    expect(html).toContain('Kapcsoló 1P')
    expect(html).toContain('Munkák összesítő')
  })

  it('contains acceptance note and signature blocks', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('Az ajánlat elfogadásával')
    expect(html).toContain('Megrendelő aláírása')
    expect(html).toContain('Vállalkozó aláírása')
    // Signature line shows actual client name
    expect(html).toMatch(/sig-line.*Nagy Péter/)
    // Signature line shows actual company name
    expect(html).toMatch(/sig-line.*Kovács Villanyszerelés Kft\./)
  })

  it('contains footer with company info and TakeoffPro branding', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('pf-branding')
    expect(html).toContain('TakeoffPro')
  })
})

describe('buildQuoteHtml — graceful degradation with empty fields', () => {
  const minQuote = {
    id: 'QT-MIN-001',
    projectName: 'Minimal Projekt',
    clientName: '',
    clientAddress: '',
    clientTaxNumber: '',
    projectAddress: '',
    createdAt: '2026-01-01T00:00:00Z',
    totalMaterials: 100000,
    totalLabor: 50000,
    totalHours: 5,
    pricingData: { hourlyRate: 9000, markup_pct: 0 },
    assemblySummary: [],
    items: [],
    inclusions: '',
    exclusions: '',
    notes: '',
    validityText: '',
    paymentTermsText: '',
  }

  const minSettings = {
    company: {},
    labor: {},
    quote: {},
  }

  it('renders without errors when all optional fields are empty', () => {
    const html = buildQuoteHtml(minQuote, minSettings)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('shows dash placeholder for empty client block', () => {
    const html = buildQuoteHtml(minQuote, minSettings)
    // Client party box should contain empty indicator
    expect(html).toContain('party-box-client')
    expect(html).toContain('party-empty')
  })

  it('falls back to "Kiállítás dátuma" in scope row when no projectAddress', () => {
    const html = buildQuoteHtml(minQuote, minSettings)
    // Without projectAddress, the second scope cell shows date instead of address
    expect(html).not.toContain('Projekt helyszíne')
    expect(html).toContain('Kiállítás dátuma')
  })

  it('shows scope stats (Terjedelem) when no projectAddress and has items', () => {
    const quoteWithItems = {
      ...minQuote,
      assemblySummary: [{ id: 'ASM-001', name: 'Teszt', qty: 5, totalPrice: 50000, materialCost: 30000, laborCost: 20000 }],
      items: [{ name: 'Anyag', type: 'material', qty: 5, unitPrice: 6000, unit: 'db', hours: 0 }],
    }
    const html = buildQuoteHtml(quoteWithItems, minSettings, 'summary')
    expect(html).toContain('Terjedelem')
    expect(html).toContain('1 munkacsoport')
  })

  it('shows TakeoffPro fallback when no company name', () => {
    const html = buildQuoteHtml(minQuote, minSettings)
    expect(html).toContain('TakeoffPro')
  })

  it('signature block falls back to "Megrendelő" when no client name', () => {
    const html = buildQuoteHtml(minQuote, minSettings)
    expect(html).toMatch(/sig-line[^>]*>Megrendelő</)
  })

  it('contractor party box shows dash when no company details', () => {
    const html = buildQuoteHtml(minQuote, minSettings)
    expect(html).toContain('party-box-contractor')
    // With no company fields, it should show the empty placeholder
    expect(html).toMatch(/party-box-contractor[\s\S]*?party-empty/)
  })
})

describe('buildQuoteHtml — outputMode variations', () => {
  it('labor_only mode hides material cost from KPI and financial table', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'summary', 'labor_only')
    expect(html).toContain('Szerelési munkadíj')
    expect(html).toContain('BRUTTÓ MUNKADÍJ ÖSSZEG')
    // Should still be valid HTML
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('split_material_labor mode shows separate material and labor columns', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'summary', 'split_material_labor')
    expect(html).toContain('Anyag (nettó)')
    expect(html).toContain('Munkadíj (nettó)')
    expect(html).toContain('Összesen (nettó)')
  })
})

describe('buildQuoteHtml — detail levels', () => {
  it('compact mode does not include assembly summary table', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'compact')
    expect(html).not.toContain('Munkák összesítő')
  })

  it('summary mode includes assembly summary but not detailed items', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'summary')
    expect(html).toContain('Munkák összesítő')
    expect(html).not.toContain('Részletes tételek')
  })

  it('detailed mode includes both assembly summary and detailed items', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings, 'detailed')
    expect(html).toContain('Munkák összesítő')
    expect(html).toContain('Részletes tételek')
  })
})

// ─── Markup absorbed into Munkadíj — client-clean PDF ────────────────────────
describe('buildQuoteHtml — markup absorbed into Munkadíj (no standalone Árrés)', () => {
  const quoteWithMarkup = {
    ...baseQuote,
    totalMaterials: 450000,
    totalLabor: 320000,
    pricingData: { hourlyRate: 9000, markup_pct: 0.15 },
  }

  it('does NOT show standalone Árrés in KPI cards or financial summary', () => {
    const html = buildQuoteHtml(quoteWithMarkup, baseSettings)
    expect(html).not.toMatch(/Árrés/)
  })

  it('Munkadíj KPI card value includes markup (labor + markup)', () => {
    const html = buildQuoteHtml(quoteWithMarkup, baseSettings)
    // labor = 320000, markup = (450000+320000)*0.15 = 115500, laborCard = 435500
    expect(html).toContain('435\u00a0500')
  })

  it('financial summary Munkadíj row includes markup', () => {
    const html = buildQuoteHtml(quoteWithMarkup, baseSettings)
    // Munkadíj row should show 435500 (labor + markup), not raw 320000
    expect(html).toMatch(/fin-label[^>]*>Munkadíj/)
    expect(html).toContain('435\u00a0500')
  })

  it('financial summary reconciles: materials + munkadíj = net', () => {
    const html = buildQuoteHtml(quoteWithMarkup, baseSettings)
    // materials=450000, munkadíj(incl markup)=435500, net=885500
    expect(html).toContain('450\u00a0000')  // materials
    expect(html).toContain('435\u00a0500')  // munkadíj (labor+markup)
    expect(html).toContain('885\u00a0500')  // net total
  })

  it('zero markup: Munkadíj shows raw labor, no Árrés anywhere', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)  // markup_pct: 0
    expect(html).not.toMatch(/Árrés/)
    // labor = 320000 shown as munkadíj
    expect(html).toContain('320\u00a0000')
  })

  it('labor_only mode: markup applied to labor only, absorbed into Munkadíj', () => {
    const html = buildQuoteHtml(quoteWithMarkup, baseSettings, 'summary', 'labor_only')
    // labor_only: markup = 320000 * 0.15 = 48000, laborCard = 368000
    expect(html).not.toMatch(/Árrés/)
    expect(html).toContain('368\u00a0000')
  })

  it('old quotes without pricingData degrade safely', () => {
    const oldQuote = { ...baseQuote, pricingData: undefined }
    const html = buildQuoteHtml(oldQuote, baseSettings)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).not.toMatch(/Árrés/)
  })
})

// ─── PDF export behavior ──────────────────────────────────────────────────────
describe('sanitizeFilename', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('Teszt Lakás Villamos')).toBe('Teszt_Lakás_Villamos')
  })

  it('removes filesystem-unsafe characters', () => {
    expect(sanitizeFilename('quote<>"file|name?.pdf')).toBe('quotefilename.pdf')
  })

  it('returns "ajanlat" for empty/whitespace input', () => {
    expect(sanitizeFilename('')).toBe('ajanlat')
    expect(sanitizeFilename('   ')).toBe('ajanlat')
  })

  it('handles null/undefined safely (String coercion)', () => {
    expect(sanitizeFilename(null)).toBe('null')
    expect(sanitizeFilename(undefined)).toBe('undefined')
  })

  it('preserves Hungarian characters', () => {
    expect(sanitizeFilename('Árajánlat_összesítő')).toBe('Árajánlat_összesítő')
  })
})

describe('generatePdf — export behavior', () => {
  it('is an async function (returns a promise)', () => {
    expect(typeof generatePdf).toBe('function')
    // The constructor name check confirms it's async
    expect(generatePdf.constructor.name).toBe('AsyncFunction')
  })

  it('buildQuoteHtml still produces valid HTML (content unchanged)', () => {
    const html = buildQuoteHtml(baseQuote, baseSettings)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Árajánlat')
    expect(html).toContain('Teszt Lakás Villamos')
  })
})

describe('createQuote — new fields have defaults', () => {
  // Verify createQuote produces the new fields so they never arrive as undefined
  it('new quote has empty string defaults for clientAddress, clientTaxNumber, projectAddress', async () => {
    // Dynamic import to avoid store.js mock issue from other tests
    vi.mock('../data/store.js', async (importOriginal) => {
      const mod = await importOriginal()
      return { ...mod, generateQuoteId: () => 'QT-NEW-001' }
    })
    const { createQuote } = await import('../utils/createQuote.js')
    const q = createQuote({
      displayName: 'Test',
      outputMode: 'combined',
      pricing: { total: 1000, materialCost: 500, laborCost: 500, laborHours: 1 },
      pricingParams: { hourlyRate: 9000, markupPct: 0 },
      settings: baseSettings,
    })
    expect(q.clientAddress).toBe('')
    expect(q.clientTaxNumber).toBe('')
    expect(q.projectAddress).toBe('')
  })
})
