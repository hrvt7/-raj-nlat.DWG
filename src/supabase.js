import { createClient } from '@supabase/supabase-js'
import { buildQuoteRow } from './utils/quoteMapping.js'

// ── Env validation ──────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

/** @type {boolean} true when both required env vars are present */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON)

if (!supabaseConfigured) {
  console.error(
    '[TakeoffPro] Hiányzó Supabase konfiguráció!\n' +
    '  VITE_SUPABASE_URL:      ' + (SUPABASE_URL  ? '✓' : '✗ HIÁNYZIK') + '\n' +
    '  VITE_SUPABASE_ANON_KEY: ' + (SUPABASE_ANON ? '✓' : '✗ HIÁNYZIK') + '\n' +
    '  → A .env fájlból hiányzik. Lásd: .env.example\n' +
    '  → Az app offline módban működik (localStorage only).'
  )
}

// Safe client init — pass dummy values if unconfigured to avoid createClient crash.
// All remote operations guard on supabaseConfigured before calling.
export const supabase = createClient(
  SUPABASE_URL  || 'https://placeholder.supabase.co',
  SUPABASE_ANON || 'eyJ_placeholder',
  { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } },
)

// ── Guard helper ────────────────────────────────────────────────────────────
function requireConfig(op) {
  if (!supabaseConfigured) {
    throw new Error(`[TakeoffPro] ${op}: Supabase nincs konfigurálva. Ellenőrizd a .env fájlt.`)
  }
}

// ── Auth helpers ───────────────────────────────────────────────────────────────
export async function signUp(email, password, fullName) {
  requireConfig('signUp')
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  })
  if (error) throw error
  return data
}
export async function signIn(email, password) {
  requireConfig('signIn')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}
export async function signOut() {
  requireConfig('signOut')
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
export async function getSession() {
  if (!supabaseConfigured) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
export function onAuthChange(cb) {
  if (!supabaseConfigured) return { data: { subscription: { unsubscribe() {} } } }
  return supabase.auth.onAuthStateChange((_e, session) => cb(session))
}

// ── Profile ────────────────────────────────────────────────────────────────────
export async function getProfile() {
  requireConfig('getProfile')
  const { data, error } = await supabase.from('profiles').select('*').single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

// ── Settings ───────────────────────────────────────────────────────────────────
export async function loadSettingsRemote() {
  requireConfig('loadSettingsRemote')
  const { data, error } = await supabase.from('settings').select('data').single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.data || null
}
export async function saveSettingsRemote(obj) {
  requireConfig('saveSettingsRemote')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('settings').upsert(
    { user_id: user.id, data: obj }, { onConflict: 'user_id' }
  )
  if (error) throw error
}

// ── Quotes ─────────────────────────────────────────────────────────────────────
export async function loadQuotesRemote() {
  requireConfig('loadQuotesRemote')
  const { data, error } = await supabase
    .from('quotes').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
// Re-export for external consumers
export { buildQuoteRow } from './utils/quoteMapping.js'

export async function saveQuoteRemote(quote) {
  requireConfig('saveQuoteRemote')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const row = buildQuoteRow(quote, user.id)
  const { error } = await supabase.from('quotes').upsert(row, { onConflict: 'user_id,quote_number' })
  if (error) throw error
}
export async function deleteQuoteRemote(quoteNumber) {
  requireConfig('deleteQuoteRemote')
  const { error } = await supabase.from('quotes').delete().eq('quote_number', quoteNumber)
  if (error) throw error
}

// ── Work items / Materials / Assemblies ────────────────────────────────────────
async function upsertUserBlob(table, dataArray) {
  requireConfig('upsertUserBlob:' + table)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from(table).upsert(
    { user_id: user.id, data: dataArray }, { onConflict: 'user_id' }
  )
  if (error) throw error
}
async function loadUserBlob(table) {
  requireConfig('loadUserBlob:' + table)
  const { data, error } = await supabase.from(table).select('data').single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.data || null
}
export const loadWorkItemsRemote   = () => loadUserBlob('work_items')
export const saveWorkItemsRemote   = (d) => upsertUserBlob('work_items', d)
export const loadMaterialsRemote   = () => loadUserBlob('materials')
export const saveMaterialsRemote   = (d) => upsertUserBlob('materials', d)
export const loadAssembliesRemote  = () => loadUserBlob('assemblies')
export const saveAssembliesRemote  = (d) => upsertUserBlob('assemblies', d)
export const loadProjectsRemote    = () => loadUserBlob('projects')
export const saveProjectsRemote    = (d) => upsertUserBlob('projects', d)

// ── Subscription ───────────────────────────────────────────────────────────────
export async function getSubscriptionStatus() {
  requireConfig('getSubscriptionStatus')
  const { data, error } = await supabase.from('profiles').select('plan, subscription_end').single()
  if (error && error.code !== 'PGRST116') throw error
  if (!data) return { plan: 'free', active: false }
  const plan = data.plan || 'free'
  const active = ['active', 'trial_active'].includes(plan)
  return { plan, active, subscriptionEnd: data.subscription_end }
}

/**
 * Gyors check: van-e aktív előfizetés (active | trial_active)?
 * Usage: const ok = await isSubscribed()
 */
export async function isSubscribed() {
  try {
    const { active } = await getSubscriptionStatus()
    return active
  } catch {
    return false
  }
}

// ── Trade Subscriptions ──────────────────────────────────────────────────────
// Per-trade hozzáférés kezelés (dormant – test módban nem használjuk)

/**
 * Felhasználó trade előfizetéseinek lekérdezése
 * @returns {{ erosaram: boolean, gyengaram: boolean, tuzjelzo: boolean }}
 */
export async function loadTradeSubscriptionsRemote() {
  requireConfig('loadTradeSubscriptionsRemote')
  const { data, error } = await supabase
    .from('trade_subscriptions')
    .select('trade_id, status')
  if (error && error.code !== 'PGRST116') throw error
  const result = { erosaram: false, gyengaram: false, tuzjelzo: false }
  if (data) {
    for (const row of data) {
      if (row.status === 'active' || row.status === 'trial') {
        result[row.trade_id] = true
      }
    }
  }
  return result
}

/**
 * Trade aktiválása/deaktiválása
 */
export async function setTradeSubscriptionRemote(tradeId, active) {
  requireConfig('setTradeSubscriptionRemote')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (active) {
    const { error } = await supabase.from('trade_subscriptions').upsert({
      user_id: user.id,
      trade_id: tradeId,
      status: 'active',
      activated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,trade_id' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('trade_subscriptions')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('trade_id', tradeId)
    if (error) throw error
  }
}
