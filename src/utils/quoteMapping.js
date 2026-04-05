// ─── Quote → Supabase Row Mapping ────────────────────────────────────────────
// Pure function — no network, no Supabase client, fully testable.
// Used by saveQuoteRemote() and by smoke tests.

/**
 * Build the Supabase upsert row from a quote object.
 * @param {object} quote - quote from TakeoffWorkspace or MergePanel
 * @param {string} userId - authenticated user ID
 * @returns {object} row ready for supabase.from('quotes').upsert()
 */
export function buildQuoteRow(quote, userId) {
  const netFt = Math.round(quote.gross || quote.summary?.grandTotal || 0)
  const vat = quote.vatPercent || 27
  const grossFt = Math.round(netFt * (1 + vat / 100))
  return {
    user_id:        userId,
    quote_number:   quote.id,  // internal collision-safe ID used as DB unique key
    status:         quote.status || 'draft',
    client_name:    quote.client_name || quote.clientName || '',
    project_name:   quote.project_name || quote.projectName || '',
    context:        quote.context || {},
    pricing_data:   quote,
    cable_estimate: quote.cableEstimate || {},
    total_net_ft:   netFt,
    total_gross_ft: grossFt,
    vat_percent:    vat,
    output_mode:    quote.outputMode || 'combined',
    notes:          quote.notes || '',
  }
}
