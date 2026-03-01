// ─── TakeoffPro Settings Store ────────────────────────────────────────────────
// localStorage-alapú beállítás kezelés
// Minden céges adat itt tárolódik

import { WORK_ITEMS_DEFAULT, ASSEMBLIES_DEFAULT, generateAssemblyId } from './workItemsDb.js'

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
  // Kismegszakítók bővítés
  { code: 'MAT-045', name: 'Kismegszakító 1P 20A', unit: 'db', price: 1300, discount: 0, category: 'vedelem' },
  { code: 'MAT-046', name: 'Kismegszakító 1P 32A', unit: 'db', price: 1500, discount: 0, category: 'vedelem' },
  { code: 'MAT-047', name: 'Kismegszakító 3P 20A', unit: 'db', price: 4200, discount: 0, category: 'vedelem' },
  { code: 'MAT-048', name: 'Kismegszakító 3P 32A', unit: 'db', price: 5500, discount: 0, category: 'vedelem' },
  // Ipari dugaljak (CEE)
  { code: 'MAT-050', name: 'CEE dugalj 1P+N+F 16A (IP44)', unit: 'db', price: 1800, discount: 0, category: 'ipari' },
  { code: 'MAT-051', name: 'CEE dugalj 1P+N+F 32A (IP44)', unit: 'db', price: 2600, discount: 0, category: 'ipari' },
  { code: 'MAT-052', name: 'CEE dugalj 3P+N+F 16A (IP44)', unit: 'db', price: 2800, discount: 0, category: 'ipari' },
  { code: 'MAT-053', name: 'CEE dugalj 3P+N+F 32A (IP44)', unit: 'db', price: 4200, discount: 0, category: 'ipari' },
  { code: 'MAT-054', name: 'CEE dugasz 3P+N+F 32A', unit: 'db', price: 3800, discount: 0, category: 'ipari' },
  // Elosztótáblák
  { code: 'MAT-060', name: 'Elosztótábla 12M süllyesztett', unit: 'db', price: 4500, discount: 0, category: 'elosztok' },
  { code: 'MAT-061', name: 'Elosztótábla 24M süllyesztett', unit: 'db', price: 7500, discount: 0, category: 'elosztok' },
  { code: 'MAT-062', name: 'Elosztótábla 36M süllyesztett', unit: 'db', price: 11000, discount: 0, category: 'elosztok' },
  { code: 'MAT-063', name: 'DIN sín 1m', unit: 'db', price: 450, discount: 0, category: 'elosztok' },
  { code: 'MAT-064', name: 'N/PE elosztó sín', unit: 'db', price: 380, discount: 0, category: 'elosztok' },
  // Gyengeáram
  { code: 'MAT-070', name: 'Adataljzat RJ45 Cat6 (fehér)', unit: 'db', price: 950, discount: 0, category: 'gyengaram' },
  { code: 'MAT-071', name: 'TV/koax aljzat (fehér)', unit: 'db', price: 650, discount: 0, category: 'gyengaram' },
  { code: 'MAT-072', name: 'Füstérzékelő 230V (optikai)', unit: 'db', price: 3800, discount: 0, category: 'gyengaram' },
  { code: 'MAT-073', name: 'Kaputelefon szett (beltéri + kültéri)', unit: 'db', price: 28000, discount: 0, category: 'gyengaram' },
  { code: 'MAT-074', name: 'Adatkábel Cat6 UTP (doboz 305m)', unit: 'm', price: 120, discount: 0, category: 'gyengaram' },
  // Segédanyagok, kötések
  { code: 'MAT-080', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', price: 120, discount: 0, category: 'seged' },
  { code: 'MAT-081', name: 'WAGO 222-415 (5-pólusú)', unit: 'db', price: 180, discount: 0, category: 'seged' },
  { code: 'MAT-082', name: 'Érjelölő spirál (csomag)', unit: 'csomag', price: 350, discount: 0, category: 'seged' },
  { code: 'MAT-083', name: 'Kábeltömítő M20', unit: 'db', price: 95, discount: 0, category: 'seged' },
  { code: 'MAT-084', name: 'Rugós bilincs 20mm', unit: 'db', price: 45, discount: 0, category: 'seged' },
  // Szerelvények bővítés
  { code: 'MAT-090', name: 'Mozgásérzékelős kapcsoló 230V (fehér)', unit: 'db', price: 3500, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-091', name: 'Digitális programozható termosztát 230V', unit: 'db', price: 8500, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-092', name: 'Csengő nyomógomb (fehér)', unit: 'db', price: 1200, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-093', name: 'Elektronikus csengő 230V', unit: 'db', price: 2500, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-094', name: 'Kábel 2×0.75mm² (csengőkábel, m)', unit: 'm', price: 120, discount: 0, category: 'kabel' },
  { code: 'MAT-095', name: 'Dupla dugalj keret (2×2P+F)', unit: 'db', price: 1800, discount: 0, category: 'szerelvenyek' },
  // Világítás anyagok
  { code: 'MAT-100', name: 'LED szalag 4000K 14W/m IP20 (m)', unit: 'm', price: 1800, discount: 0, category: 'vilagitas' },
  { code: 'MAT-101', name: 'LED szalag tápegység 60W 24V', unit: 'db', price: 2800, discount: 0, category: 'vilagitas' },
  { code: 'MAT-102', name: 'LED szalag alumínium profil (m)', unit: 'm', price: 1200, discount: 0, category: 'vilagitas' },
  { code: 'MAT-103', name: 'Vészvilágítás egység 1h önálló', unit: 'db', price: 12000, discount: 0, category: 'vilagitas' },
  { code: 'MAT-104', name: 'Kábeltálca fedél 100mm (m)', unit: 'm', price: 480, discount: 0, category: 'talca' },
  { code: 'MAT-105', name: 'Kábeltálca fedél 200mm (m)', unit: 'm', price: 750, discount: 0, category: 'talca' },
  { code: 'MAT-106', name: 'Kábeltálca fedél 300mm (m)', unit: 'm', price: 980, discount: 0, category: 'talca' },
  // Speciális kábelek
  { code: 'MAT-110', name: 'NYY-J 5×16 (m)', unit: 'm', price: 5200, discount: 0, category: 'kabel' },
  { code: 'MAT-111', name: 'NYY-J 5×25 (m)', unit: 'm', price: 8200, discount: 0, category: 'kabel' },
  { code: 'MAT-112', name: 'NYY-J 3×6 (m)', unit: 'm', price: 1250, discount: 0, category: 'kabel' },
  { code: 'MAT-113', name: 'NYM-J 5×2.5 (m)', unit: 'm', price: 680, discount: 0, category: 'kabel' },
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
  const stored = load(LS_KEYS.ASSEMBLIES, null)
  // Ha még nincs semmi mentve → adjuk vissza az összes alapértelmezett assembly-t
  if (!stored) return ASSEMBLIES_DEFAULT
  // Migráció: ha meglévő felhasználónak hiányoznak az újabb alapértelmezett
  // assembly-k (pl. ASM-018..ASM-036), hozzáfűzzük a hiányzókat a listájához
  const storedIds = new Set(stored.map(a => a.id))
  const missing = ASSEMBLIES_DEFAULT.filter(a => !storedIds.has(a.id))
  if (missing.length > 0) {
    const merged = [...stored, ...missing]
    save(LS_KEYS.ASSEMBLIES, merged)
    return merged
  }
  return stored
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
