// ─── Quote Display Totals ───────────────────────────────────────────────────
// Single source of truth for outputMode-aware totals.
// Used by QuoteView (UI) and generatePdf (PDF) to ensure consistent numbers.
//
// The quote always stores FULL combined pricing internally:
//   quote.gross       = net total (material + labor + markup), BEFORE VAT
//   quote.totalLabor  = raw labor cost (hours × rate), BEFORE markup
//   quote.totalMaterials = raw material cost
//
// In `labor_only` mode, the customer-facing total is labor + markup(labor),
// excluding material cost. The markup is applied proportionally to labor only.

/**
 * Compute display-ready totals for a quote, respecting outputMode.
 *
 * @param {object} opts
 * @param {string}  opts.outputMode  - 'combined' | 'labor_only' | 'split_material_labor'
 * @param {number}  opts.totalLabor  - raw labor cost (hours × hourlyRate)
 * @param {number}  opts.totalMaterials - raw material cost
 * @param {number}  opts.markupPct   - markup as fraction (0.15 = 15%)
 * @param {number}  opts.vatPct      - VAT percent (default 27)
 * @returns {{ displayNet: number, displayVat: number, displayGross: number, fullNet: number, grossMaterials: number, grossLabor: number, grossMarkup: number, markupAmount: number }}
 */
export function quoteDisplayTotals({ outputMode, totalLabor, totalMaterials, markupPct, vatPct = 27 }) {
  const labor = Math.round(Number(totalLabor) || 0)
  const materials = Math.round(Number(totalMaterials) || 0)
  const markup = Number(markupPct) || 0
  const vat = Number(vatPct) || 27

  // Full combined net (always computed the same way)
  const fullSubtotal = materials + labor
  const fullMarkup = Math.round(fullSubtotal * markup)
  const fullNet = fullSubtotal + fullMarkup

  // Labor-only net: labor + markup applied to labor only
  const laborMarkup = Math.round(labor * markup)
  const laborNet = labor + laborMarkup

  const displayNet = outputMode === 'labor_only' ? laborNet : fullNet
  const displayVat = Math.round(displayNet * vat / 100)
  const displayGross = displayNet + displayVat

  // ── Per-component gross for KPI cards ──────────────────────────────────────
  // Allocate total ÁFA proportionally to each component so their sum matches
  // displayGross exactly. Rounding each component's ÁFA independently would
  // drift by ≤2 Ft (e.g. round(A×r)+round(B×r) ≠ round((A+B)×r)).
  const displayMaterials = outputMode === 'labor_only' ? 0 : materials
  const markupAmount = outputMode === 'labor_only' ? laborMarkup : fullMarkup

  const vatMat    = displayNet > 0 ? Math.round(displayMaterials * displayVat / displayNet) : 0
  const vatLabor  = displayNet > 0 ? Math.round(labor            * displayVat / displayNet) : 0
  const vatMarkup = displayVat - vatMat - vatLabor  // absorbs ≤1 Ft rounding remainder

  const grossMaterials = displayMaterials + vatMat
  const grossLabor     = labor            + vatLabor
  const grossMarkup    = markupAmount     + vatMarkup

  return { displayNet, displayVat, displayGross, fullNet, grossMaterials, grossLabor, grossMarkup, markupAmount }
}
