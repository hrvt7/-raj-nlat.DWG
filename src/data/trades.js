// ─── TakeoffPro Trade / Szakterület rendszer ───────────────────────────────
// 3 szakterület: erősáram, gyengeáram, tűzjelző
// Subscription-alapú hozzáférés – test mode: minden nyitva
// ────────────────────────────────────────────────────────────────────────────

// ── Trade definitions ───────────────────────────────────────────────────────

export const TRADES = [
  {
    id: 'erosaram',
    label: 'Erősáram',
    shortLabel: 'Erős',
    icon: '⚡',
    color: '#FFD166',
    colorDim: 'rgba(255,209,102,0.12)',
    colorBorder: 'rgba(255,209,102,0.25)',
    description: 'Erősáramú villanyszerelés: szerelvények, világítás, elosztók, kábeltálca, mérés.',
    // Melyik WORK_ITEM_CATEGORIES kulcsok tartoznak ide
    categories: [
      'bontas', 'nyomvonal', 'dobozolas', 'kabelezes', 'kotesek',
      'szerelvenyek', 'vilagitas', 'kabeltalca', 'elosztok', 'meres',
    ],
    // Melyik material category-k tartoznak ide
    materialCategories: [
      'doboz', 'szerelvenyek', 'kabel', 'talca', 'vedelem',
      'ipari', 'elosztok', 'seged', 'vilagitas',
    ],
    sortOrder: 0,
  },
  {
    id: 'gyengaram',
    label: 'Gyengeáram',
    shortLabel: 'Gyenge',
    icon: '📡',
    color: '#4CC9F0',
    colorDim: 'rgba(76,201,240,0.12)',
    colorBorder: 'rgba(76,201,240,0.25)',
    description: 'Gyengeáramú rendszerek: strukturált hálózat, CCTV, riasztó, kaputelefon, beléptetés.',
    categories: ['gyengaram'],
    materialCategories: ['gyengaram', 'gyengaram_halozat', 'gyengaram_biztonsag'],
    sortOrder: 1,
  },
  {
    id: 'tuzjelzo',
    label: 'Tűzjelző',
    shortLabel: 'Tűz',
    icon: '🔥',
    color: '#FF6B6B',
    colorDim: 'rgba(255,107,107,0.12)',
    colorBorder: 'rgba(255,107,107,0.25)',
    description: 'Tűzjelző rendszerek: érzékelők, jelzésadók, központ, hang-fényjelzők, tűzgátló áttörések.',
    categories: ['tuzjelzo'],
    materialCategories: ['tuzjelzo', 'tuzjelzo_erzekelo', 'tuzjelzo_kozpont'],
    sortOrder: 2,
  },
]

// Közös kategóriák – minden trade számára elérhetők (alap infrastruktúra)
export const SHARED_CATEGORIES = [
  'bontas', 'nyomvonal', 'dobozolas', 'kabelezes', 'kotesek',
]

export const SHARED_MATERIAL_CATEGORIES = [
  'doboz', 'kabel', 'seged',
]

// ── Subscription state ──────────────────────────────────────────────────────

const LS_KEY_TRADES = 'takeoffpro_trade_subscriptions'
const LS_KEY_TEST_MODE = 'takeoffpro_test_mode'

// Test mode: ha true, minden trade elérhető (fejlesztés/teszt közben)
export function isTestMode() {
  try {
    const v = localStorage.getItem(LS_KEY_TEST_MODE)
    // Default = true (test fázis)
    return v === null ? true : v === 'true'
  } catch { return true }
}

export function setTestMode(on) {
  try { localStorage.setItem(LS_KEY_TEST_MODE, String(on)) } catch {}
}

// Feliratkozott trade-ek
export function loadTradeSubscriptions() {
  try {
    const raw = localStorage.getItem(LS_KEY_TRADES)
    if (raw) return JSON.parse(raw)
  } catch {}
  // Default: erősáram aktív (alap csomag)
  return { erosaram: true, gyengaram: false, tuzjelzo: false }
}

export function saveTradeSubscriptions(subs) {
  try { localStorage.setItem(LS_KEY_TRADES, JSON.stringify(subs)) } catch {}
}

// ── Hozzáférés ellenőrzés ───────────────────────────────────────────────────

export function isTradeUnlocked(tradeId) {
  if (isTestMode()) return true
  const subs = loadTradeSubscriptions()
  return subs[tradeId] === true
}

export function getUnlockedTrades() {
  if (isTestMode()) return TRADES.map(t => t.id)
  const subs = loadTradeSubscriptions()
  return TRADES.filter(t => subs[t.id] === true).map(t => t.id)
}

export function getTradeById(tradeId) {
  return TRADES.find(t => t.id === tradeId) || null
}

// ── Kategória → Trade mapping ───────────────────────────────────────────────

export function getTradeForCategory(categoryKey) {
  // Közös kategóriák minden trade-hez elérhetők
  if (SHARED_CATEGORIES.includes(categoryKey)) return null // null = shared
  for (const trade of TRADES) {
    if (trade.categories.includes(categoryKey)) return trade.id
  }
  return null
}

export function getTradeForMaterialCategory(materialCategory) {
  if (SHARED_MATERIAL_CATEGORIES.includes(materialCategory)) return null
  for (const trade of TRADES) {
    if (trade.materialCategories.includes(materialCategory)) return trade.id
  }
  return null
}

// Szűrés: adott trade-hez tartozó + közös kategóriák
export function getCategoriesForTrade(tradeId) {
  const trade = getTradeById(tradeId)
  if (!trade) return []
  return [...new Set([...SHARED_CATEGORIES, ...trade.categories])]
}

export function getMaterialCategoriesForTrade(tradeId) {
  const trade = getTradeById(tradeId)
  if (!trade) return []
  return [...new Set([...SHARED_MATERIAL_CATEGORIES, ...trade.materialCategories])]
}

// ── Assembly trade mapping ──────────────────────────────────────────────────
// Assembly-k a category alapján kapják a trade-et

export function getTradeForAssembly(assembly) {
  if (assembly.trade) return assembly.trade  // explicit override
  return getTradeForCategory(assembly.category)
}
