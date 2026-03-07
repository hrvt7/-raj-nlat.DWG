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

// ─── System type metadata ───────────────────────────────────────────────────
// Used to tag quote line items for future proposal grouping.

/** @type {readonly string[]} */
export const SYSTEM_TYPES = ['power', 'lighting', 'fire_alarm', 'low_voltage', 'security', 'general']

/** Hungarian labels for each system type */
export const SYSTEM_TYPE_LABELS = {
  power:       'Erősáram',
  lighting:    'Világítás',
  fire_alarm:  'Tűzjelző',
  low_voltage: 'Gyengeáram',
  security:    'Biztonságtechnika',
  general:     'Általános villamos',
}

/**
 * Maps assembly `category` (from workItemsDb.js) to a systemType.
 * Categories not listed here fall back to 'general'.
 */
export const CATEGORY_TO_SYSTEM_TYPE = {
  szerelvenyek: 'power',      // dugaljak, kapcsolók = erősáram
  vilagitas:    'lighting',
  tuzjelzo:     'fire_alarm',
  gyengaram:    'low_voltage',
  elosztok:     'power',      // elosztó tábla, kismegszakító = erősáram
  kabelezes:    'power',      // kábelhúzás typically erősáram
  // nyomvonal, kabeltalca, bontas, dobozolas, kotesek, meres → 'general' (fallback)
}

/**
 * Maps cable sub-type keys (from pricing.js cableData) to systemType.
 */
export const CABLE_TYPE_TO_SYSTEM_TYPE = {
  light_m:  'lighting',
  socket_m: 'power',
  switch_m: 'power',
  other_m:  'general',
}
