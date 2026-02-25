// ─── TakeoffPro Settings Store ────────────────────────────────────────────────
// localStorage-alapú beállítás kezelés
// Minden céges adat itt tárolódik

import { WORK_ITEMS_DEFAULT, ASSEMBLIES_DEFAULT } from './workItemsDb.js'

const LS_KEYS = {
  SETTINGS:   'takeoffpro_settings',
  WORK_ITEMS: 'takeoffpro_work_items',
  ASSEMBLIES: 'takeoffpro_assemblies',
  MATERIALS:  'takeoffpro_materials',
  QUOTES:     'takeoffpro_quotes',
}

// ─── Default settings ────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  company: {
    name: '',
    address: '',
    tax_number: '',
    phone: '',
    email: '',
    bank_account: '',
    logo_url: '',
  },
  labor: {
    hourly_rate: 9000,       // Ft/óra
    overtime_multiplier: 1.3,
    weekend_multiplier: 1.5,
    default_margin: 1.15,
    vat_percent: 27,
  },
  overhead: {
    visits: 2,
    minutes_per_visit: 50,  // kiszállás + felvonulás
    travel_cost_per_visit: 3500, // Ft
  },
  context_defaults: {
    wall_material: 'brick',
    access: 'empty',
    project_type: 'renovation',
    height: 'normal',
  },
  quote: {
    validity_days: 30,
    footer_text: 'Az ajánlat mennyiségkimutatáson alapul. Helyszíni felmérés alapján módosítható.',
    default_notes: '',
  }
}

// ─── Default materials ────────────────────────────────────────────────────────
export const DEFAULT_MATERIALS = [
  // Szerelvény dobozok
  { code: 'MAT-001', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', price: 180, discount: 0, category: 'doboz' },
  { code: 'MAT-002', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', price: 120, discount: 0, category: 'doboz' },
  { code: 'MAT-003', name: 'Kötődoboz 80×80mm', unit: 'db', price: 220, discount: 0, category: 'doboz' },
  { code: 'MAT-004', name: 'Kötődoboz 100×100mm', unit: 'db', price: 350, discount: 0, category: 'doboz' },
  // Szerelvények
  { code: 'MAT-010', name: 'Dugalj 2P+F (fehér, alap)', unit: 'db', price: 650, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-011', name: 'Dugalj 2P+F IP44', unit: 'db', price: 1200, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-012', name: 'Kapcsoló 1G (fehér)', unit: 'db', price: 550, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-013', name: 'Kapcsoló 2G (fehér)', unit: 'db', price: 950, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-014', name: 'Váltókapcsoló', unit: 'db', price: 750, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-015', name: 'Fedőlap (fehér)', unit: 'db', price: 280, discount: 0, category: 'szerelvenyek' },
  // Kábelek (Ft/m)
  { code: 'MAT-020', name: 'NYM-J 3×1.5', unit: 'm', price: 280, discount: 0, category: 'kabel' },
  { code: 'MAT-021', name: 'NYM-J 3×2.5', unit: 'm', price: 420, discount: 0, category: 'kabel' },
  { code: 'MAT-022', name: 'NYY-J 3×2.5', unit: 'm', price: 580, discount: 0, category: 'kabel' },
  { code: 'MAT-023', name: 'NYY-J 5×2.5', unit: 'm', price: 920, discount: 0, category: 'kabel' },
  { code: 'MAT-024', name: 'NYY-J 5×4', unit: 'm', price: 1350, discount: 0, category: 'kabel' },
  { code: 'MAT-025', name: 'NYY-J 5×6', unit: 'm', price: 1950, discount: 0, category: 'kabel' },
  { code: 'MAT-026', name: 'NYY-J 5×10', unit: 'm', price: 3200, discount: 0, category: 'kabel' },
  { code: 'MAT-027', name: 'CYKY 3×1.5', unit: 'm', price: 260, discount: 0, category: 'kabel' },
  // Kábeltálca (Ft/m)
  { code: 'MAT-030', name: 'Kábeltálca 100×60 (perforált)', unit: 'm', price: 850, discount: 0, category: 'talca' },
  { code: 'MAT-031', name: 'Kábeltálca 200×60', unit: 'm', price: 1350, discount: 0, category: 'talca' },
  { code: 'MAT-032', name: 'Kábeltálca 300×60', unit: 'm', price: 1850, discount: 0, category: 'talca' },
  { code: 'MAT-033', name: 'Kábeltálca 400×60', unit: 'm', price: 2400, discount: 0, category: 'talca' },
  { code: 'MAT-034', name: 'Kábeltálca 500×60', unit: 'm', price: 3100, discount: 0, category: 'talca' },
  { code: 'MAT-035', name: 'Kábeltálca 600×60', unit: 'm', price: 3800, discount: 0, category: 'talca' },
  { code: 'MAT-036', name: 'Kábeltálca tartó', unit: 'db', price: 380, discount: 0, category: 'talca' },
  // Biztosítékok, megszakítók
  { code: 'MAT-040', name: 'Kismegszakító 1P 10A', unit: 'db', price: 1200, discount: 0, category: 'vedelem' },
  { code: 'MAT-041', name: 'Kismegszakító 1P 16A', unit: 'db', price: 1200, discount: 0, category: 'vedelem' },
  { code: 'MAT-042', name: 'Kismegszakító 3P 16A', unit: 'db', price: 3500, discount: 0, category: 'vedelem' },
  { code: 'MAT-043', name: 'FI-relé 2P 40A 30mA', unit: 'db', price: 8500, discount: 0, category: 'vedelem' },
  { code: 'MAT-044', name: 'FI-relé 4P 40A 30mA', unit: 'db', price: 14000, discount: 0, category: 'vedelem' },
]

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...load(LS_KEYS.SETTINGS, {}) }
}
export function saveSettings(settings) {
  save(LS_KEYS.SETTINGS, settings)
}

export function loadWorkItems() {
  return load(LS_KEYS.WORK_ITEMS, WORK_ITEMS_DEFAULT)
}
export function saveWorkItems(items) {
  save(LS_KEYS.WORK_ITEMS, items)
}

export function loadAssemblies() {
  return load(LS_KEYS.ASSEMBLIES, ASSEMBLIES_DEFAULT)
}
export function saveAssemblies(assemblies) {
  save(LS_KEYS.ASSEMBLIES, assemblies)
}

export function loadMaterials() {
  return load(LS_KEYS.MATERIALS, DEFAULT_MATERIALS)
}
export function saveMaterials(materials) {
  save(LS_KEYS.MATERIALS, materials)
}

export function loadQuotes() {
  return load(LS_KEYS.QUOTES, [])
}
export function saveQuotes(quotes) {
  save(LS_KEYS.QUOTES, quotes)
}

export function saveQuote(quote) {
  const quotes = loadQuotes()
  const idx = quotes.findIndex(q => q.id === quote.id)
  if (idx >= 0) {
    quotes[idx] = quote
  } else {
    quotes.unshift(quote)
  }
  saveQuotes(quotes)
  return quote
}

export function generateQuoteId() {
  const year = new Date().getFullYear()
  const quotes = loadQuotes()
  const yearQuotes = quotes.filter(q => q.id?.startsWith(`QT-${year}`))
  const num = String(yearQuotes.length + 1).padStart(3, '0')
  return `QT-${year}-${num}`
}
