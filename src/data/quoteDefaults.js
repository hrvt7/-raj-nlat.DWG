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
  kabeltalca:   'general',    // kábeltálca = általános (erős + gyenge közös)
  meres:        'general',    // mérési csomag = általános
  foldeles:     'power',      // földelés / EPH = erősáram
  // nyomvonal, bontas, dobozolas, kotesek → 'general' (fallback)
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

// ─── Grouping ─────────────────────────────────────────────────────────────────

/** Valid groupBy values for quotes */
export const GROUP_BY_OPTIONS = ['none', 'system', 'floor']

/** Hungarian labels for groupBy modes */
export const GROUP_BY_LABELS = {
  none:   'Nincs csoportosítás',
  system: 'Rendszer szerint',
  floor:  'Szint szerint',
}

/** Fallback label for items with no floor metadata */
export const FLOOR_UNKNOWN_KEY = '_unknown_floor'
export const FLOOR_UNKNOWN_LABEL = 'Nem meghatározott'

/** Extended labels including 'mixed' for merge edge-case */
export const SYSTEM_GROUP_LABELS = {
  ...SYSTEM_TYPE_LABELS,
  mixed: 'Vegyes rendszer',
}

/**
 * Resolve the effective system type for a quote item.
 * Priority: item.systemType → item.sourcePlanSystemType → 'general'
 */
export function resolveItemSystemType(item) {
  const st = item?.systemType
  if (st && st !== 'general' && st !== 'mixed') return st
  const spt = item?.sourcePlanSystemType
  if (spt && spt !== 'general' && spt !== 'mixed') return spt
  return st || spt || 'general'
}

/**
 * Group quote items by system type.
 * Returns array of { key, label, items, subtotalMaterial, subtotalLabor, subtotalHours }
 * Ordered: known systems first (in SYSTEM_TYPES order), then general last.
 */
export function groupItemsBySystem(items) {
  const groups = {}
  for (const item of (items || [])) {
    const key = resolveItemSystemType(item)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  // Sort: known system types in canonical order, then general/mixed last
  const ORDER = ['power', 'lighting', 'fire_alarm', 'low_voltage', 'security', 'general', 'mixed']
  const sorted = ORDER.filter(k => groups[k]).map(k => ({
    key: k,
    label: SYSTEM_GROUP_LABELS[k] || k,
    items: groups[k],
    subtotalMaterial: groups[k].reduce((s, i) => s + (i.materialCost || 0), 0),
    subtotalLabor:    groups[k].reduce((s, i) => s + (i.hours || 0), 0),
  }))
  // Any unknown keys not in ORDER
  for (const k of Object.keys(groups)) {
    if (!ORDER.includes(k)) {
      sorted.push({
        key: k, label: SYSTEM_GROUP_LABELS[k] || k, items: groups[k],
        subtotalMaterial: groups[k].reduce((s, i) => s + (i.materialCost || 0), 0),
        subtotalLabor:    groups[k].reduce((s, i) => s + (i.hours || 0), 0),
      })
    }
  }
  return sorted
}

// ─── Floor grouping ──────────────────────────────────────────────────────────

/**
 * Resolve the floor key for a quote item.
 * Priority: item.sourcePlanFloor → FLOOR_UNKNOWN_KEY
 */
export function resolveItemFloor(item) {
  return item?.sourcePlanFloor || FLOOR_UNKNOWN_KEY
}

/**
 * Resolve the floor label for a quote item.
 * Priority: item.sourcePlanFloorLabel → FLOOR_UNKNOWN_LABEL
 */
export function resolveItemFloorLabel(item) {
  return item?.sourcePlanFloorLabel || FLOOR_UNKNOWN_LABEL
}

/**
 * Sort floor keys in logical building order.
 * Order: pince → fsz → 1_emelet → 2_emelet → ... → teto → _unknown_floor
 */
function floorSortOrder(key) {
  if (!key || key === FLOOR_UNKNOWN_KEY) return 9000
  if (key === 'pince') return 0
  if (key === 'fsz') return 100
  if (key === 'teto') return 8000
  // Numeric floors: "2_emelet" → 200+2=202
  const m = key.match(/^(\d+)_emelet$/)
  if (m) return 200 + parseInt(m[1], 10)
  // Fallback: sort alphabetically after known floors
  return 5000
}

/**
 * Group quote items by floor.
 * Returns array of { key, label, items, subtotalMaterial, subtotalLabor }
 * Ordered in logical building order (basement → ground → floors → roof → unknown).
 */
export function groupItemsByFloor(items) {
  const groups = {}
  const labels = {}
  for (const item of (items || [])) {
    const key = resolveItemFloor(item)
    const label = resolveItemFloorLabel(item)
    if (!groups[key]) { groups[key] = []; labels[key] = label }
    groups[key].push(item)
  }
  // Sort by logical building order
  return Object.keys(groups)
    .sort((a, b) => floorSortOrder(a) - floorSortOrder(b))
    .map(key => ({
      key,
      label: labels[key] || key,
      items: groups[key],
      subtotalMaterial: groups[key].reduce((s, i) => s + (i.materialCost || 0), 0),
      subtotalLabor:    groups[key].reduce((s, i) => s + (i.hours || 0), 0),
    }))
}
