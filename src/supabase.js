import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL      || 'https://pprlbtsqfyrbfhbqjpai.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcmxidHNxZnlyYmZoYnFqcGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODI0MTIsImV4cCI6MjA4Nzg1ODQxMn0.oBGF_sPm9BM4nhwCdDJWrZSSYMWdBN2PF0TxqFy1GwQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  // TakeoffPro Supabase: public schema (nem takeoffpro)
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
})

// ── Auth helpers ───────────────────────────────────────────────────────────────
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  })
  if (error) throw error
  return data
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_e, session) => cb(session))
}

// ── Profile ────────────────────────────────────────────────────────────────────
export async function getProfile() {
  const { data, error } = await supabase.from('profiles').select('*').single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

// ── Settings ───────────────────────────────────────────────────────────────────
export async function loadSettingsRemote() {
  const { data, error } = await supabase.from('settings').select('data').single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.data || null
}
export async function saveSettingsRemote(obj) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('settings').upsert(
    { user_id: user.id, data: obj }, { onConflict: 'user_id' }
  )
  if (error) throw error
}

// ── Quotes ─────────────────────────────────────────────────────────────────────
export async function loadQuotesRemote() {
  const { data, error } = await supabase
    .from('quotes').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function saveQuoteRemote(quote) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('quotes').upsert({
    user_id:        user.id,
    quote_number:   quote.id,
    status:         quote.status || 'draft',
    client_name:    quote.context?.client_name || '',
    project_name:   quote.context?.project_name || '',
    context:        quote.context || {},
    pricing_data:   quote,
    cable_estimate: quote.cableEstimate || {},
    total_net_ft:   Math.round(quote.totalNet || 0),
    total_gross_ft: Math.round(quote.totalGross || 0),
    vat_percent:    quote.vatPercent || 27,
    notes:          quote.notes || '',
  }, { onConflict: 'user_id,quote_number' })
  if (error) throw error
}
export async function deleteQuoteRemote(quoteNumber) {
  const { error } = await supabase.from('quotes').delete().eq('quote_number', quoteNumber)
  if (error) throw error
}

// ── Work items / Materials / Assemblies ────────────────────────────────────────
async function upsertUserBlob(table, dataArray) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from(table).upsert(
    { user_id: user.id, data: dataArray }, { onConflict: 'user_id' }
  )
  if (error) throw error
}
async function loadUserBlob(table) {
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

// ── Subscription ───────────────────────────────────────────────────────────────
export async function getSubscriptionStatus() {
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
