/**
 * createQuote — Shared quote object factory
 *
 * All 3 quote creation paths (TakeoffWorkspace, buildQuoteFromPlan, PdfMergePanel)
 * MUST use this factory to assemble the quote object.
 *
 * Responsibilities:
 * - Generate quote ID
 * - Seed timestamps, status, groupBy defaults
 * - Resolve outputMode → inclusions/exclusions seed
 * - Seed vatPercent from settings (single source of truth)
 * - Seed validityText / paymentTermsText from settings
 * - Build consistent shape for gross / totalMaterials / totalLabor / totalHours / summary / pricingData
 *
 * The caller passes path-specific overrides (items, source, fileName, etc.)
 * via the `overrides` parameter — these are spread last and win.
 */

import { generateQuoteId, generateQuoteNumber } from '../data/store.js'
import { OUTPUT_MODE_INCLEXCL } from '../data/quoteDefaults.js'

/**
 * @param {object} opts
 * @param {string}  opts.displayName        — Quote / project display name
 * @param {string}  [opts.clientName]       — Client name (default: '')
 * @param {string}  opts.outputMode         — 'combined' | 'labor_only' | 'split_material_labor'
 * @param {object}  opts.pricing            — { total, materialCost, laborCost, laborHours }
 * @param {object}  opts.pricingParams      — { hourlyRate, markupPct, markupType } (markupPct as decimal, e.g. 0.10; markupType: 'markup'|'margin')
 * @param {object}  opts.settings           — Full app settings object (from loadSettings())
 * @param {object}  [opts.overrides]        — Path-specific fields spread last (items, source, fileName, etc.)
 * @returns {object} Fully-formed quote object ready for saveQuote()
 */
export function createQuote({ displayName, clientName, outputMode, pricing, pricingParams, settings, overrides }) {
  const mode = outputMode || 'combined'
  const quoteSettings = settings?.quote || {}

  // ── OutputMode-aware inclusions/exclusions seed ─────────────────────────
  const modeDefaults = OUTPUT_MODE_INCLEXCL[mode] || OUTPUT_MODE_INCLEXCL.combined

  // ── vatPercent: always sourced from settings, stored on quote ────────────
  const vatPercent = Number(settings?.labor?.vat_percent) || 27

  // ── Pricing totals (rounded) ────────────────────────────────────────────
  const total         = Math.round(Number(pricing?.total) || 0)
  const materialCost  = Math.round(Number(pricing?.materialCost) || 0)
  const laborCost     = Math.round(Number(pricing?.laborCost) || 0)
  const laborHours    = Number(pricing?.laborHours) || 0

  const now = new Date().toISOString()

  return {
    // ── Identity ──────────────────────────────────────────────────────────
    id:               generateQuoteId(),       // collision-safe internal key
    quoteNumber:      generateQuoteNumber(),   // human-readable sequential display number
    projectName:      displayName,
    project_name:     displayName,
    name:             displayName,
    clientName:       clientName || '',
    client_name:      clientName || '',
    clientAddress:    '',
    clientTaxNumber:  '',
    clientEmail:      '',
    projectAddress:   '',

    // ── Timestamps & status ──────────────────────────────────────────────
    createdAt:        now,
    created_at:       now,
    status:           'draft',

    // ── Output & display ─────────────────────────────────────────────────
    outputMode:       mode,
    groupBy:          'none',
    inclusions:       modeDefaults.inclusions || quoteSettings.default_inclusions || '',
    exclusions:       modeDefaults.exclusions || quoteSettings.default_exclusions || '',
    validityText:     quoteSettings.default_validity_text || '',
    paymentTermsText: quoteSettings.default_payment_terms_text || '',

    // ── Financial ────────────────────────────────────────────────────────
    vatPercent,
    gross:            total,
    totalMaterials:   materialCost,
    totalLabor:       laborCost,
    totalHours:       laborHours,
    summary: {
      grandTotal:     total,
      totalWorkHours: laborHours,
    },
    pricingData: {
      hourlyRate:     Number(pricingParams?.hourlyRate) || 0,
      markup_pct:     Number(pricingParams?.markupPct) || 0,
      markup_type:    pricingParams?.markupType || 'markup',
    },

    // ── Path-specific overrides (items, source, fileName, planId, etc.) ──
    ...overrides,
  }
}
