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
export async function resetPassword(email) {
  requireConfig('resetPassword')
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  if (error) throw error
}
export async function resendConfirmation(email) {
  requireConfig('resendConfirmation')
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
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

/**
 * Build headers for authenticated API calls.
 * Includes Supabase access_token as Bearer if session exists.
 */
export async function getAuthHeaders(contentType = 'application/json') {
  const headers = { 'Content-Type': contentType }
  try {
    const session = await getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  } catch { /* no session available — headers without auth */ }
  return headers
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('quotes').delete()
    .eq('user_id', user.id)
    .eq('quote_number', quoteNumber)
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
export const loadPlansRemote       = () => loadUserBlob('plans_meta')
export const savePlansRemote       = (d) => upsertUserBlob('plans_meta', d)

// ── Plan annotations (per-plan, keyed by user_id + plan_id) ─────────────────
export async function saveAnnotationsRemote(planId, annotations) {
  requireConfig('saveAnnotationsRemote')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('plan_annotations').upsert(
    { user_id: user.id, plan_id: planId, data: annotations },
    { onConflict: 'user_id,plan_id' }
  )
  if (error) throw error
}
export async function loadAnnotationsRemote(planId) {
  requireConfig('loadAnnotationsRemote')
  const { data, error } = await supabase.from('plan_annotations')
    .select('data').eq('plan_id', planId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.data || null
}

// ── Plan annotation cleanup ─────────────────────────────────────────────────
export async function deleteAnnotationsRemote(planId) {
  requireConfig('deleteAnnotationsRemote')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('plan_annotations')
    .delete()
    .eq('user_id', user.id)
    .eq('plan_id', planId)
  if (error) throw error
}

// ── Plan file/blob Storage backup ────────────────────────────────────────────
const PLAN_FILES_BUCKET = 'plan-files'

const EXT_MAP = { pdf: 'pdf', dxf: 'dxf', dwg: 'dwg' }

export async function uploadPlanBlob(planId, fileBlob, fileType) {
  requireConfig('uploadPlanBlob')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const ext = EXT_MAP[fileType?.toLowerCase()] || 'bin'
  const path = `${user.id}/${planId}.${ext}`
  const { error } = await supabase.storage
    .from(PLAN_FILES_BUCKET)
    .upload(path, fileBlob, { upsert: true, contentType: fileBlob.type || 'application/octet-stream' })
  if (error) throw error
}

export async function downloadPlanBlob(planId, fileType) {
  requireConfig('downloadPlanBlob')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const ext = EXT_MAP[fileType?.toLowerCase()] || 'bin'
  const path = `${user.id}/${planId}.${ext}`
  const { data, error } = await supabase.storage
    .from(PLAN_FILES_BUCKET)
    .download(path)
  if (error) throw error
  return data // Blob
}

export async function deletePlanBlob(planId, fileType) {
  requireConfig('deletePlanBlob')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const ext = EXT_MAP[fileType?.toLowerCase()] || 'bin'
  const path = `${user.id}/${planId}.${ext}`
  const { error } = await supabase.storage
    .from(PLAN_FILES_BUCKET)
    .remove([path])
  if (error) throw error
}

// ── Quote Shares (client-facing portal) ─────────────────────────────────────

/**
 * Creates a shareable link token for a quote.
 * Stores a snapshot of the quote + company data so the link stays valid
 * even if the original quote is edited later.
 *
 * @param {object} quote        — Full quote object
 * @param {object} companyData  — { name, email, phone } from settings
 * @returns {string} The public share token (32-char hex)
 */
export async function createQuoteShare(quote, companyData = {}) {
  requireConfig('createQuoteShare')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nem vagy bejelentkezve.')

  // Check if a share already exists for this quote
  const { data: existing } = await supabase
    .from('quote_shares')
    .select('token, status')
    .eq('quote_id', quote.id)
    .eq('user_id', user.id)
    .neq('status', 'expired')
    .maybeSingle()

  if (existing) return existing.token

  const { data, error } = await supabase
    .from('quote_shares')
    .insert({
      quote_id: quote.id,
      user_id: user.id,
      quote_data: quote,
      company_data: companyData,
    })
    .select('token')
    .single()

  if (error) throw error
  return data.token
}

/**
 * Loads a quote share by its public token.
 * No authentication required — used by the client portal.
 *
 * @param {string} token
 * @returns {{ quote_data, company_data, status, expires_at, accepted_by_name } | null}
 */
export async function loadQuoteByToken(token) {
  if (!supabaseConfigured) return null
  const { data, error } = await supabase
    .from('quote_shares')
    .select('quote_data, company_data, status, expires_at, accepted_by_name, accepted_at')
    .eq('token', token)
    .single()
  if (error) return null
  return data
}

/**
 * Marks a quote share as accepted by the client.
 * No authentication required — uses the public RLS policy.
 * After acceptance, fires a best-effort notification to the contractor.
 *
 * @param {string} token
 * @param {string} acceptedByName — Client's name
 */
export async function acceptQuoteShare(token, acceptedByName) {
  if (!supabaseConfigured) throw new Error('Supabase nincs konfigurálva.')
  const { error } = await supabase
    .from('quote_shares')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by_name: acceptedByName,
    })
    .eq('token', token)
    .eq('status', 'pending')
  if (error) throw error

  // Best-effort email notification to contractor — errors are silently ignored
  // so the acceptance flow is never blocked by a missing email config.
  try {
    const apiBase = import.meta.env.VITE_API_URL || window.location.origin
    await fetch(`${apiBase}/api/notify-quote-accepted`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    })
  } catch {
    // Non-critical — acceptance already recorded above
  }
}
