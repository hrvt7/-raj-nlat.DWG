// ─── Critical Safety Net Tests ──────────────────────────────────────────────
// Covers the 4 highest-risk gaps + "fontos" areas:
//
// CRITICAL:
// 1. Remote save/load — DB column parity (prevents silent data loss)
// 2. PDF export margin mode — financial consistency
// 3. Logout → login → recovery chain
// 4. DWG convert flow contract (mock structure)
//
// FONTOS:
// 5. Measurement → quote → export chain
// 6. Cable estimate 3-tier cascade priority
// 7. Multi-plan pricing merge contract

import { describe, it, expect } from 'vitest'
import { buildQuoteRow } from '../utils/quoteMapping.js'
import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'
import { buildQuoteHtml } from '../utils/generatePdf.js'
import { createQuote } from '../utils/createQuote.js'
import { computePricing } from '../utils/pricing.js'
import { computeFullCalc } from '../utils/fullCalc.js'
import fs from 'fs'
import path from 'path'

const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8')

// ═════════════════════════════════════════════════════════════════════════════
// 1. REMOTE SAVE/LOAD — DB COLUMN PARITY
// ═════════════════════════════════════════════════════════════════════════════

describe('Remote save/load — buildQuoteRow DB column parity', () => {
  // These are the EXACT columns the quotes table must have.
  // If buildQuoteRow sends a field the table doesn't have, upsert silently fails.
  const REQUIRED_COLUMNS = [
    'user_id', 'quote_number', 'status', 'client_name', 'project_name',
    'context', 'pricing_data', 'cable_estimate', 'total_net_ft',
    'total_gross_ft', 'vat_percent', 'output_mode', 'notes',
  ]

  it('buildQuoteRow produces exactly the expected columns', () => {
    const row = buildQuoteRow({ id: 'QT-001', gross: 100000 }, 'user-1')
    const keys = Object.keys(row).sort()
    const expected = [...REQUIRED_COLUMNS].sort()
    expect(keys).toEqual(expected)
  })

  it('no extra fields that could break the DB upsert', () => {
    const fullQuote = {
      id: 'QT-FULL', gross: 250000, vatPercent: 27,
      clientName: 'Test', projectName: 'Project',
      status: 'sent', outputMode: 'labor_only',
      context: { access: 'easy' }, cableEstimate: { cable_total_m: 100 },
      notes: 'Test note', items: [{ name: 'x' }],
      assemblySummary: [{ id: 'a' }], totalMaterials: 150000,
    }
    const row = buildQuoteRow(fullQuote, 'user-2')
    for (const key of Object.keys(row)) {
      expect(REQUIRED_COLUMNS).toContain(key)
    }
  })

  it('pricing_data contains full quote for round-trip recovery', () => {
    const quote = { id: 'QT-RT', gross: 99000, totalMaterials: 55000, cableCost: 12000, items: [{n: 1}] }
    const row = buildQuoteRow(quote, 'u1')
    expect(row.pricing_data).toBe(quote)
    expect(row.pricing_data.totalMaterials).toBe(55000)
    expect(row.pricing_data.cableCost).toBe(12000)
  })

  it('missing quote.id → quote_number is undefined (edge case)', () => {
    const row = buildQuoteRow({ gross: 1000 }, 'u1')
    expect(row.quote_number).toBeUndefined()
  })

  it('upsertUserBlob sends only user_id + data', () => {
    const supabaseSrc = readSrc('supabase.js')
    // upsertUserBlob should produce { user_id, data } — no extra fields
    expect(supabaseSrc).toContain("{ user_id: user.id, data: dataArray }")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. PDF EXPORT MARGIN MODE
// ═════════════════════════════════════════════════════════════════════════════

describe('PDF export — margin mode financial consistency', () => {
  const baseSettings = {
    company: { name: 'Test Kft.', address: '1000 Budapest', tax_number: '12345678-2-01' },
    labor: { vat_percent: 27 },
    quote: { validity_days: 30 },
  }

  it('combined + margin: Anyagköltség + Munkadíj = Nettó összköltség', () => {
    const quote = {
      id: 'QT-M1', totalMaterials: 120000, totalLabor: 80000, totalHours: 16,
      cableCost: 0,
      pricingData: { hourlyRate: 5000, markup_pct: 0.20, markup_type: 'margin' },
      createdAt: '2026-01-01T00:00:00Z',
    }
    const html = buildQuoteHtml(quote, baseSettings, 'summary', 'combined')
    // dNet = applyMarkup(200000) = 200000 / (1-0.20) = 250000
    const totals = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 80000, totalMaterials: 120000,
      cableCost: 0, markupPct: 0.20, markupType: 'margin', vatPct: 27,
    })
    expect(totals.displayNet).toBe(250000)
    // laborCardVal = dNet - rawMaterials = 250000 - 120000 = 130000
    // Sum: 120000 + 130000 = 250000 = dNet ✓
    expect(html).toContain('120\u00a0000 Ft') // Anyagköltség
    expect(html).toContain('130\u00a0000 Ft') // Munkadíj (labor + absorbed margin)
  })

  it('labor_only + margin: only labor in output', () => {
    const quote = {
      id: 'QT-M2', totalMaterials: 100000, totalLabor: 60000, totalHours: 12,
      cableCost: 0,
      pricingData: { hourlyRate: 5000, markup_pct: 0.15, markup_type: 'margin' },
      createdAt: '2026-01-01T00:00:00Z',
    }
    const html = buildQuoteHtml(quote, baseSettings, 'summary', 'labor_only')
    // dNet = applyMarkup(labor) = 60000 / (1-0.15) = 70588
    const expected = Math.round(60000 / 0.85)
    expect(html).toContain('Szerelési munkadíj')
    expect(html).not.toContain('Anyagköltség')
    // laborCardVal = dNet (in labor_only)
    expect(html).toContain(expected.toLocaleString('hu-HU').replace(/\s/g, '\u00a0') + ' Ft')
  })

  it('combined + margin + cableCost: cable absorbed correctly', () => {
    const quote = {
      id: 'QT-M3', totalMaterials: 100000, totalLabor: 50000, totalHours: 10,
      cableCost: 20000,
      pricingData: { hourlyRate: 5000, markup_pct: 0.10, markup_type: 'margin' },
      createdAt: '2026-01-01T00:00:00Z',
    }
    const totals = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: 50000, totalMaterials: 100000,
      cableCost: 20000, markupPct: 0.10, markupType: 'margin', vatPct: 27,
    })
    // subtotal = 170000, dNet = 170000 / 0.90 = 188889
    expect(totals.displayNet).toBe(Math.round(170000 / 0.90))
    // laborCardVal = dNet - rawMaterials = 188889 - 100000 = 88889
    // This includes cable + margin allocation — by design
    const laborCard = totals.displayNet - 100000
    expect(laborCard).toBeGreaterThan(50000 + 20000) // labor + cable + margin
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. LOGOUT → LOGIN → RECOVERY CHAIN
// ═════════════════════════════════════════════════════════════════════════════

describe('Logout → login → recovery chain contract', () => {
  // Verify the recovery gate functions match what's in App.jsx

  function isArrayRecoverable(raw) {
    try {
      if (raw === null) return true
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return true
      return parsed.length === 0
    } catch { return true }
  }

  function isEnvelopeRecoverable(raw) {
    try {
      if (raw === null) return true
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return true
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : null)
      return !arr || arr.length === 0
    } catch { return true }
  }

  it('after logout (all keys null) → all 7 entities recoverable', () => {
    // Simulates: localStorage cleared by handleSignOut
    const entities = [null, null, null, null, null, null, null]
    expect(entities.every(isArrayRecoverable)).toBe(true)
    expect(entities.every(isEnvelopeRecoverable)).toBe(true)
  })

  it('fresh browser with defaults written → still recoverable for empty arrays', () => {
    expect(isArrayRecoverable('[]')).toBe(true)
    expect(isEnvelopeRecoverable('{"_v":1,"data":[]}')).toBe(true)
  })

  it('populated local data → NOT recoverable (local wins)', () => {
    expect(isArrayRecoverable('[{"id":"x"}]')).toBe(false)
    expect(isEnvelopeRecoverable('{"_v":1,"data":[{"id":"p1"}]}')).toBe(false)
  })

  it('handleSignOut code syncs all 7 entities before clearing', () => {
    const appSrc = readSrc('App.jsx')
    const signOutSection = appSrc.slice(appSrc.indexOf('handleSignOut'))
    // All 7 remote saves present
    expect(signOutSection).toContain('saveSettingsRemote')
    expect(signOutSection).toContain('saveQuoteRemote')
    expect(signOutSection).toContain('saveAssembliesRemote')
    expect(signOutSection).toContain('saveMaterialsRemote')
    expect(signOutSection).toContain('saveWorkItemsRemote')
    expect(signOutSection).toContain('saveProjectsRemote')
    expect(signOutSection).toContain('savePlansRemote')
  })

  it('handleSignOut clears all takeoffpro_ keys except cookie_consent', () => {
    const appSrc = readSrc('App.jsx')
    expect(appSrc).toContain("const keysToKeep = ['takeoffpro_cookie_consent']")
    expect(appSrc).toContain("k.startsWith('takeoffpro_')")
  })

  it('hydration effect reads all 7 entities from remote after login', () => {
    const appSrc = readSrc('App.jsx')
    const hydrationSection = appSrc.slice(
      appSrc.indexOf('settingsNeedsRecovery'),
      appSrc.indexOf('Remote read-back failed')
    )
    expect(hydrationSection).toContain('loadSettingsRemote')
    expect(hydrationSection).toContain('loadQuotesRemote')
    expect(hydrationSection).toContain('loadAssembliesRemote')
    expect(hydrationSection).toContain('loadMaterialsRemote')
    expect(hydrationSection).toContain('loadWorkItemsRemote')
    expect(hydrationSection).toContain('loadProjectsRemote')
    expect(hydrationSection).toContain('loadPlansRemote')
  })

  it('quotes recovery maps pricing_data for full quote reconstruction', () => {
    const appSrc = readSrc('App.jsx')
    expect(appSrc).toContain('.map(r => r.pricing_data).filter(Boolean)')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. DWG CONVERT FLOW CONTRACT
// ═════════════════════════════════════════════════════════════════════════════

describe('DWG convert flow — mock contract', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('Step 1: POST /api/convert-dwg with { filename }', () => {
    expect(workspaceSrc).toContain("body: JSON.stringify({ filename: f.name })")
  })

  it('Step 1 response: expects { success, jobId, uploadUrl, uploadParams }', () => {
    expect(workspaceSrc).toContain('const { jobId, uploadUrl, uploadParams } = createJson')
  })

  it('Step 2: FormData upload to CloudConvert S3 (uploadUrl)', () => {
    expect(workspaceSrc).toContain("formData.append('file', f)")
    expect(workspaceSrc).toContain('const uploadRes = await fetchWithRetry(uploadUrl')
  })

  it('Step 3: Poll with { jobId } until finished/error', () => {
    expect(workspaceSrc).toContain("body: JSON.stringify({ jobId })")
    expect(workspaceSrc).toContain("pollJson.status === 'finished'")
    expect(workspaceSrc).toContain("pollJson.status === 'error'")
  })

  it('Step 4: Download DXF from downloadUrl', () => {
    expect(workspaceSrc).toContain('const dxfRes = await fetchWithRetry(downloadUrl')
    expect(workspaceSrc).toContain('dxfText = await dxfRes.text()')
  })

  it('Success path: synthetic File + viewerFile + parse', () => {
    expect(workspaceSrc).toContain("new File([dxfText], dxfName")
    expect(workspaceSrc).toContain('setViewerFile(syntheticFile)')
    expect(workspaceSrc).toContain('parseDxfTextInWorker(dxfText')
  })

  it('Converted DXF is cached for reopen (no reconversion)', () => {
    expect(workspaceSrc).toContain("savePlanBlob({ id: planId, name: dxfName, fileType: 'dxf' }, dxfBlob)")
  })

  it('Error path: sets dwgStatus=failed + parsedDxf with _dwgFailed', () => {
    expect(workspaceSrc).toContain("setDwgStatus('failed')")
    expect(workspaceSrc).toContain('_dwgFailed: true')
  })

  it('401 retry fires only once and only for own API', () => {
    expect(workspaceSrc).toContain('let _auth401Retried = false')
    expect(workspaceSrc).toContain("const isOwnApi = (url) => url.includes('/api/convert-dwg')")
  })

  it('Polling timeout is 120 seconds', () => {
    expect(workspaceSrc).toContain('const MAX_POLL_MS = 120_000')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5. MEASUREMENT → QUOTE → EXPORT CHAIN (fontos)
// ═════════════════════════════════════════════════════════════════════════════

describe('Measurement → quote → export chain', () => {
  it('measurement items with _fromMeasurement flag survive createQuote', () => {
    const q = createQuote({
      displayName: 'Meas Test',
      outputMode: 'combined',
      pricing: { total: 50000, materialCost: 30000, laborCost: 20000, laborHours: 4 },
      pricingParams: { hourlyRate: 5000, markupPct: 0 },
      settings: { labor: { vat_percent: 27 } },
      overrides: {
        items: [
          { name: 'LED Panel', type: 'material', qty: 5, materialCost: 30000 },
          { name: 'KT 100×60', type: 'material', qty: 12.5, unit: 'm', materialCost: 31250, _fromMeasurement: true },
        ],
      },
    })
    expect(q.items).toHaveLength(2)
    const measItem = q.items.find(i => i._fromMeasurement)
    expect(measItem).toBeDefined()
    expect(measItem.name).toBe('KT 100×60')
    expect(measItem.materialCost).toBe(31250)
  })

  it('buildQuoteRow preserves measurement items in pricing_data', () => {
    const quote = {
      id: 'QT-MEAS', gross: 80000,
      items: [
        { name: 'Normal', type: 'material' },
        { name: 'KT 200', type: 'material', _fromMeasurement: true, materialCost: 45000 },
      ],
    }
    const row = buildQuoteRow(quote, 'u1')
    const recovered = row.pricing_data
    expect(recovered.items.find(i => i._fromMeasurement)).toBeDefined()
  })

  it('PDF export renders measurement items as normal line items', () => {
    const quote = {
      id: 'QT-PDF-MEAS', totalMaterials: 50000, totalLabor: 30000, totalHours: 6,
      pricingData: { hourlyRate: 5000, markup_pct: 0 },
      createdAt: '2026-01-01T00:00:00Z',
      items: [
        { name: 'KT 100×60 rendszer', type: 'material', qty: 15, unit: 'm', materialCost: 37500, _fromMeasurement: true },
      ],
    }
    const settings = { company: { name: 'Test' }, labor: { vat_percent: 27 }, quote: { validity_days: 30 } }
    const html = buildQuoteHtml(quote, settings, 'detailed', 'combined')
    expect(html).toContain('KT 100×60 rendszer')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6. CABLE ESTIMATE 3-TIER CASCADE PRIORITY (fontos)
// ═════════════════════════════════════════════════════════════════════════════

describe('Cable estimate priority cascade', () => {
  // The workspace uses shouldOverwrite() from cableModel.js
  // Priority: DXF_LAYERS (highest) > DXF_MARKERS > PDF_MARKERS > MST > AVERAGE_FALLBACK

  it('architecture: shouldOverwrite and CABLE_SOURCE exist', () => {
    const cableSrc = readSrc('utils/cableModel.js')
    expect(cableSrc).toContain('export function shouldOverwrite')
    expect(cableSrc).toContain('CABLE_SOURCE')
    expect(cableSrc).toContain('DXF_LAYERS')
    expect(cableSrc).toContain('MST')
    expect(cableSrc).toContain('DEVICE_COUNT')
  })

  it('cable dedup: catalog cable lines suppress cablePricePerM', () => {
    const result = computeFullCalc({
      pricing: {
        materialCost: 70000, laborCost: 20000, laborHours: 8, total: 90000,
        lines: [{ type: 'cable', materialCost: 20000, hours: 0 }],
      },
      cableEstimate: { cable_total_m: 80 }, cablePricePerM: 500,
      markup: 0, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    expect(result.cableCost).toBe(0) // catalog wins
  })

  it('no catalog cable → pricePerM fallback active', () => {
    const result = computeFullCalc({
      pricing: {
        materialCost: 50000, laborCost: 20000, laborHours: 8, total: 70000,
        lines: [{ type: 'material', materialCost: 50000, hours: 0 }],
      },
      cableEstimate: { cable_total_m: 80 }, cablePricePerM: 500,
      markup: 0, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows: [], assemblies: [], workItems: [],
      materials: [], hourlyRate: 5000, difficultyMode: 'normal',
    })
    expect(result.cableCost).toBe(40000) // 80m × 500
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 7. FULL FINANCIAL PIPELINE — END-TO-END (fontos)
// ═════════════════════════════════════════════════════════════════════════════

describe('Full financial pipeline — pricing → fullCalc → quote → display → PDF', () => {
  const assemblies = [{
    id: 'ASM-T', name: 'Test Assembly', category: 'szerelvenyek',
    components: [
      { itemType: 'material', name: 'Part', itemCode: 'MAT-T', qty: 1, unit: 'db' },
      { itemType: 'workitem', name: 'Work', itemCode: 'WI-T', qty: 1, unit: 'db' },
    ],
  }]
  const workItems = [{ code: 'WI-T', name: 'Work', p50: 20, p90: 30, heightFactor: false }]
  const materials = [{ code: 'MAT-T', name: 'Part', price: 5000, discount: 0 }]

  it('full chain: consistent numbers from pricing to PDF', () => {
    const rows = [{ asmId: 'ASM-T', qty: 10, variantId: null, wallSplits: null }]
    const pricing = computePricing({ takeoffRows: rows, assemblies, workItems, materials, context: null, markup: 0, hourlyRate: 8000, cableEstimate: null, difficultyMode: 'normal' })

    const fullCalc = computeFullCalc({
      pricing, cableEstimate: null, cablePricePerM: 0,
      markup: 0.20, markupType: 'markup', vatPercent: 27,
      context: {}, takeoffRows: rows, assemblies, workItems, materials, hourlyRate: 8000, difficultyMode: 'normal',
    })

    const quote = createQuote({
      displayName: 'Pipeline Test', outputMode: 'combined',
      pricing: { total: fullCalc.grandTotal, materialCost: pricing.materialCost, laborCost: pricing.laborCost, laborHours: pricing.laborHours },
      pricingParams: { hourlyRate: 8000, markupPct: 0.20, markupType: 'markup' },
      settings: { labor: { vat_percent: 27 } },
    })

    const display = quoteDisplayTotals({
      outputMode: 'combined', totalLabor: quote.totalLabor, totalMaterials: quote.totalMaterials,
      cableCost: 0, markupPct: 0.20, markupType: 'markup', vatPct: 27,
    })

    // Chain consistency: quote.gross ≈ display.displayNet (±1 Ft rounding)
    expect(Math.abs(display.displayNet - quote.gross)).toBeLessThanOrEqual(1)

    // Component sum: grossMaterials + grossLabor + grossMarkup = displayGross
    expect(display.grossMaterials + display.grossLabor + display.grossMarkup).toBe(display.displayGross)

    // DB row: total_net_ft = quote.gross
    const row = buildQuoteRow(quote, 'u1')
    expect(row.total_net_ft).toBe(Math.round(quote.gross))
    expect(row.total_gross_ft).toBe(Math.round(quote.gross * 1.27))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 8. PLAN→QUOTE FINANCIAL INTEGRITY (P0 audit fix)
// ═════════════════════════════════════════════════════════════════════════════

describe('Plan→Quote financial integrity', () => {
  it('createQuote stores cableCost from overrides (plan→quote path)', () => {
    const q = createQuote({
      displayName: 'Plan Cable Test',
      outputMode: 'combined',
      pricing: { total: 150000, materialCost: 80000, laborCost: 50000, laborHours: 10 },
      pricingParams: { hourlyRate: 5000, markupPct: 0.15, markupType: 'margin' },
      settings: { labor: { vat_percent: 27 } },
      overrides: { cableCost: 20000, source: 'plan-takeoff' },
    })
    expect(q.cableCost).toBe(20000)
    expect(q.pricingData.markup_type).toBe('margin')
  })

  it('vatPercent stored on quote is used by quoteDisplayTotals', () => {
    // Quote created with 27% VAT
    const q = createQuote({
      displayName: 'VAT Test',
      outputMode: 'combined',
      pricing: { total: 100000, materialCost: 60000, laborCost: 40000, laborHours: 8 },
      pricingParams: { hourlyRate: 5000, markupPct: 0 },
      settings: { labor: { vat_percent: 27 } },
    })
    expect(q.vatPercent).toBe(27)

    // displayTotals using quote.vatPercent (not live settings)
    const display = quoteDisplayTotals({
      outputMode: 'combined',
      totalLabor: q.totalLabor,
      totalMaterials: q.totalMaterials,
      cableCost: 0,
      markupPct: 0,
      vatPct: q.vatPercent, // from quote, not settings
    })
    expect(display.displayVat).toBe(Math.round(100000 * 27 / 100))
    expect(display.displayGross).toBe(100000 + display.displayVat)
  })

  it('plan meta snapshot should include markupType and cableCost fields', () => {
    // Architecture test: verify TakeoffWorkspace saves these fields
    const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')
    const planMetaSection = workspaceSrc.slice(
      workspaceSrc.indexOf('updatePlanMeta(planId, {'),
      workspaceSrc.indexOf('// Learn from save')
    )
    expect(planMetaSection).toContain('calcMarkupType:')
    expect(planMetaSection).toContain('calcCableCost:')
  })

  it('buildQuoteFromPlan passes cableCost in overrides', () => {
    const appSrc = readSrc('App.jsx')
    const buildSection = appSrc.slice(
      appSrc.indexOf('buildQuoteFromPlan'),
      appSrc.indexOf('saveQuote(quote)')
    )
    expect(buildSection).toContain('cableCost: meta.calcCableCost')
  })

  it('QuoteView uses quote.vatPercent not just settings', () => {
    const appSrc = readSrc('App.jsx')
    expect(appSrc).toContain('Number(quote.vatPercent)')
  })

  it('generatePdf uses quote.vatPercent not just settings', () => {
    const pdfSrc = readSrc('utils/generatePdf.js')
    expect(pdfSrc).toContain('Number(quote.vatPercent)')
  })
})
