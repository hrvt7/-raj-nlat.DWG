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
export function quoteDisplayTotals({ outputMode, totalLabor, totalMaterials, cableCost = 0, markupPct, markupType = 'markup', vatPct = 27 }) {
  const labor = Math.round(Number(totalLabor) || 0)
  const materials = Math.round(Number(totalMaterials) || 0)
  const cable = Math.round(Number(cableCost) || 0)
  const markup = Number(markupPct) || 0
  const vat = Number(vatPct) || 27
  const isMargin = markupType === 'margin'

  // Helper: apply markup or margin to a subtotal
  const applyMarkup = (sub) => {
    if (isMargin) {
      return markup >= 1 ? sub * 10 : Math.round(sub / (1 - markup))
    }
    return Math.round(sub * (1 + markup))
  }

  // Full combined net (materials already include measurementCost; cable is separate)
  const fullSubtotal = materials + labor + cable
  const fullNet = applyMarkup(fullSubtotal)
  const fullMarkup = fullNet - fullSubtotal

  // Labor-only net: markup/margin applied to labor only
  const laborNet = applyMarkup(labor)
  const laborMarkup = laborNet - labor

  const displayNet = outputMode === 'labor_only' ? laborNet : fullNet
  const displayVat = Math.round(displayNet * vat / 100)
  const displayGross = displayNet + displayVat

  // ── Per-component gross for KPI cards ──────────────────────────────────────
  // Allocate total ÁFA proportionally to each component so their sum matches
  // displayGross exactly. Rounding each component's ÁFA independently would
  // drift by ≤2 Ft (e.g. round(A×r)+round(B×r) ≠ round((A+B)×r)).
  const displayMaterials = outputMode === 'labor_only' ? 0 : (materials + cable)
  const markupAmount = outputMode === 'labor_only' ? laborMarkup : fullMarkup

  const vatMat    = displayNet > 0 ? Math.round(displayMaterials * displayVat / displayNet) : 0
  const vatLabor  = displayNet > 0 ? Math.round(labor            * displayVat / displayNet) : 0
  const vatMarkup = displayVat - vatMat - vatLabor  // absorbs ≤1 Ft rounding remainder

  const grossMaterials = displayMaterials + vatMat
  const grossLabor     = labor            + vatLabor
  const grossMarkup    = markupAmount     + vatMarkup

  return { displayNet, displayVat, displayGross, fullNet, grossMaterials, grossLabor, grossMarkup, markupAmount }
}
