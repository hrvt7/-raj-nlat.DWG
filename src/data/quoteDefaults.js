// ─── Shared quote seed defaults ─────────────────────────────────────────────
// Centralised so all 3 quote creation paths (TakeoffWorkspace, PdfMergePanel,
// App.jsx buildQuoteFromPlan) reference the same source of truth.

/**
 * Default inclusions / exclusions text per outputMode.
 * Used as the first-priority seed; falls back to Settings when empty.
 */
export const OUTPUT_MODE_INCLEXCL = {
  combined:              { inclusions: '', exclusions: '' },
  labor_only:            { inclusions: '', exclusions: 'Az anyagköltség nem része az ajánlatnak.\nAz anyagbiztosítás a megrendelő feladata.' },
  split_material_labor:  { inclusions: '', exclusions: '' },
}
