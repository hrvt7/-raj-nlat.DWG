import React, { useState, useRef, useCallback, useEffect } from 'react'
import Landing from './Landing.jsx'
import { supabase, signIn, signUp, signOut, onAuthChange, saveQuoteRemote, getSubscriptionStatus } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Quotes from './pages/Quotes.jsx'
import WorkItems from './pages/WorkItems.jsx'
import Settings from './pages/Settings.jsx'
import AssembliesPage from './pages/Assemblies.jsx'
import PlansPage from './pages/Plans.jsx'
import MaterialsPage from './pages/Materials.jsx'
import { loadSettings, saveSettings, loadWorkItems, loadMaterials, loadQuotes } from './data/store.js'
import { Button, Badge, Input, Select, StatCard, Table, QuoteStatusBadge, fmt, fmtM } from './components/ui.jsx'
import SuccessPage from './pages/Success.jsx'
import TakeoffWorkspace from './components/TakeoffWorkspace.jsx'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', sidebar: '#0D0D0F',
  textSub: '#A1A1AA', textMuted: '#71717A',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
  bgHover: 'rgba(255,255,255,0.03)', redDim: 'rgba(255,107,107,0.08)',
}

// ─── QuoteView ────────────────────────────────────────────────────────────────
function QuoteView({ quote, onBack, onStatusChange }) {
  const statuses = ['draft', 'sent', 'won', 'lost']
  const statusLabels = { draft: 'Piszkozat', sent: 'Elküldve', won: 'Nyertes', lost: 'Elveszett' }
  const statusColors = { draft: C.muted, sent: C.blue, won: C.accent, lost: C.red }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 }}>←</button>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 20 }}>{quote.projectName}</div>
          <div style={{ color: C.muted, fontSize: 13 }}>{quote.id}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <QuoteStatusBadge status={quote.status} />
        </div>
      </div>

      <div style={{
        background: `linear-gradient(135deg, ${C.accent}15, ${C.blue}10)`,
        border: `1px solid ${C.accent}40`, borderRadius: 12, padding: 24, marginBottom: 24,
      }}>
        <div style={{ color: C.muted, fontSize: 13 }}>BRUTTÓ VÉGÖSSZEG</div>
        <div style={{ color: C.accent, fontSize: 36, fontWeight: 800 }}>{fmt(Math.round(quote.gross || 0))} Ft</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Részletek</div>
          {[
            ['Megrendelő', quote.clientName || '—'],
            ['Létrehozva', new Date(quote.createdAt).toLocaleDateString('hu-HU')],
            ['Munkaóra', (quote.totalHours || 0).toFixed(1) + ' ó'],
            ['Anyagköltség', fmt(Math.round(quote.totalMaterials || 0)) + ' Ft'],
            ['Munkadíj', fmt(Math.round(quote.totalLabor || 0)) + ' Ft'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}30` }}>
              <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Státusz módosítása</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {statuses.map(s => (
              <button key={s} onClick={() => onStatusChange(quote.id, s)}
                style={{
                  padding: '10px 14px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  background: quote.status === s ? statusColors[s] + '20' : C.bg,
                  border: `1px solid ${quote.status === s ? statusColors[s] : C.border}`,
                  color: quote.status === s ? statusColors[s] : C.muted,
                  fontWeight: quote.status === s ? 700 : 400,
                }}>{statusLabels[s]}</button>
            ))}
          </div>
        </div>
      </div>

      {(quote.items || []).length > 0 && (
        <div>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 12 }}>Tételek</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Megnevezés', 'Menny.', 'Anyag', 'Munkadíj', 'Összesen'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: C.muted, textAlign: h === 'Megnevezés' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, i) => {
                const rate = quote.pricingData?.hourlyRate || 9000
                const mat = (item.unitPrice || 0) * item.qty
                const labor = (item.hours || 0) * rate
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: '8px 10px', color: C.text }}>{item.name}</td>
                    <td style={{ padding: '8px 10px', color: C.muted, textAlign: 'right' }}>{item.qty} {item.unit}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.text }}>{fmt(Math.round(mat))} Ft</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.blue }}>{fmt(Math.round(labor))} Ft</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.text, fontWeight: 600 }}>{fmt(Math.round(mat + labor))} Ft</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── AuthModal ─────────────────────────────────────────────────────────────────
function AuthModal({ onAuth }) {
  const [mode, setMode]         = useState('login') // login | register
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password, name)
      }
      onAuth()
    } catch (e) {
      setError(e.message || 'Hiba történt')
    } finally { setLoading(false) }
  }

  const inp = {
    width: '100%', padding: '10px 14px', background: '#1A1F2E',
    border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '36px 32px', width: '100%', maxWidth: 400, boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          {mode === 'login' ? 'Bejelentkezés' : 'Regisztráció'}
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>TakeoffPro fiók</div>

        {mode === 'register' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Teljes név</div>
            <input style={inp} placeholder="Kovács János" value={name}
              onChange={e => setName(e.target.value)} />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>E-mail</div>
          <input style={inp} type="email" placeholder="email@ceg.hu" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Jelszó</div>
          <input style={inp} type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {error && (
          <div style={{ background: '#FF6B6B18', border: '1px solid #FF6B6B40',
            color: '#FF6B6B', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !email || !password}
          style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: loading ? C.accentDim : C.accent, color: '#0A0E1A',
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Folyamatban...' : (mode === 'login' ? 'Bejelentkezés' : 'Fiók létrehozása')}
        </button>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: C.muted }}>
          {mode === 'login' ? 'Még nincs fiókod?' : 'Már van fiókod?'}{' '}
          <span
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{ color: C.accent, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {mode === 'login' ? 'Regisztráció' : 'Bejelentkezés'}
          </span>
        </div>

        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: C.muted }}>
          Folytatás bejelentkezés nélkül →{' '}
          <span onClick={onAuth} style={{ color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>
            vendégként
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── SaaS Shell ────────────────────────────────────────────────────────────────
function SaaSShell() {
  const [page, setPage] = useState('dashboard')
  const [settings, setSettings] = useState(loadSettings)
  const [materials, setMaterials] = useState(loadMaterials)
  const [quotes, setQuotes] = useState(loadQuotes)
  const [viewingQuote, setViewingQuote] = useState(null)
  const [prefillData, setPrefillData] = useState(null)

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUserEmail(session?.user?.email || '')
      setAuthChecked(true)
    })
    const { data: { subscription } } = onAuthChange(s => {
      setSession(s)
      setUserEmail(s?.user?.email || '')
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Subscription state ─────────────────────────────────────────────────────
  const [subStatus, setSubStatus] = useState({ plan: 'free', active: false })
  useEffect(() => {
    if (session) {
      getSubscriptionStatus()
        .then(s => setSubStatus(s))
        .catch(() => setSubStatus({ plan: 'free', active: false }))
    }
  }, [session])

  const handleSignOut = async () => {
    await signOut()
    setSession(null)
    setUserEmail('')
    setSubStatus({ plan: 'free', active: false })
  }

  const pageTitles = {
    dashboard: 'Dashboard', quotes: 'Ajánlatok', 'new-quote': 'Új ajánlat',
    plans: 'Tervek', 'work-items': 'Munkatételek', materials: 'Anyagok',
    assemblies: 'Assemblyk', settings: 'Beállítások',
  }

  const [workItems, setWorkItems] = useState(loadWorkItems)

  const handleQuotesChange = (updated) => {
    localStorage.setItem('tpro_quotes', JSON.stringify(updated))
    setQuotes(updated)
  }

  const handleQuoteSaved = quote => {
    const updated = loadQuotes()
    setQuotes(updated)
    setViewingQuote(quote)
    setPage('quotes')
    if (session) saveQuoteRemote(quote).catch(console.error)
  }

  const handleStatusChange = (quoteId, newStatus) => {
    const all = loadQuotes()
    const updated = all.map(q => q.id === quoteId ? { ...q, status: newStatus } : q)
    localStorage.setItem('tpro_quotes', JSON.stringify(updated))
    setQuotes(updated)
    if (viewingQuote?.id === quoteId) setViewingQuote(prev => ({ ...prev, status: newStatus }))
  }

  const handleSettingsChange = newSettings => {
    saveSettings(newSettings)
    setSettings(newSettings)
  }

  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const sidebarW = 220
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {showAuth && <AuthModal onAuth={() => setShowAuth(false)} />}
      <Sidebar
        active={page}
        onNavigate={p => { setViewingQuote(null); setPage(p) }}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
      />
      <div style={{ marginLeft: isMobile ? 0 : sidebarW, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>

        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <div style={{
          height: 52, background: C.bgCard, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '0 16px',
          justifyContent: 'space-between', flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setSidebarMobileOpen(true)} style={{
                background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7,
                padding: '6px 8px', cursor: 'pointer', flexShrink: 0,
                display: 'flex', flexDirection: 'column', gap: 3.5, alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ display: 'block', width: 15, height: 1.5, background: C.muted, borderRadius: 1 }} />
                <span style={{ display: 'block', width: 15, height: 1.5, background: C.muted, borderRadius: 1 }} />
                <span style={{ display: 'block', width: 15, height: 1.5, background: C.muted, borderRadius: 1 }} />
              </button>
            )}
            <div style={{ color: C.text, fontWeight: 600, fontSize: isMobile ? 14 : 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {viewingQuote ? viewingQuote.projectName : pageTitles[page] || page}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {session ? (
              <>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 20, padding: '3px 10px', maxWidth: 160,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ⚡ {userEmail}
                </span>
                <button onClick={handleSignOut} style={{
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
                  color: C.muted, fontSize: 12,
                }}>Ki</button>
              </>
            ) : (
              <>
                <span style={{
                  fontFamily: 'DM Mono', fontSize: 10, color: '#FFD166',
                  background: 'rgba(255,209,102,0.1)', border: '1px solid rgba(255,209,102,0.3)',
                  borderRadius: 20, padding: '2px 8px',
                }}>⚠️ TESZT – vendég mód</span>
                <button onClick={() => setShowAuth(true)} style={{
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 7, padding: '5px 14px', cursor: 'pointer',
                  color: C.accent, fontSize: 12, fontWeight: 600,
                }}>Bejelentkezés</button>
              </>
            )}
          </div>
        </div>

        {/* ── Content — full-height for TakeoffWorkspace, padded for other pages ── */}
        {page === 'new-quote' ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <TakeoffWorkspace
              settings={settings}
              materials={materials}
              onSaved={quote => { setPrefillData(null); handleQuoteSaved(quote) }}
              onCancel={() => { setPrefillData(null); setPage('quotes') }}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 14px' : '32px 28px' }}>
            <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
              {viewingQuote && page === 'quotes' ? (
                <QuoteView quote={viewingQuote} onBack={() => setViewingQuote(null)}
                  onStatusChange={handleStatusChange} />
              ) : page === 'dashboard' ? (
                <Dashboard quotes={quotes} settings={settings}
                  onNavigate={p => { setViewingQuote(null); setPage(p) }} />
              ) : page === 'quotes' ? (
                <Quotes quotes={quotes} onQuotesChange={handleQuotesChange}
                  onNavigate={p => setPage(p)}
                  onOpenQuote={q => { setViewingQuote(q); setPage('quotes') }} />
              ) : page === 'work-items' ? (
                <WorkItems workItems={workItems} onWorkItemsChange={wis => { setWorkItems(wis) }} />
              ) : page === 'materials' ? (
                <MaterialsPage materials={materials} onMaterialsChange={m => { setMaterials(m) }} />
              ) : page === 'plans' ? (
                <PlansPage onNavigate={(p, data) => { if (data) setPrefillData(data); setPage(p) }} />
              ) : page === 'assemblies' ? (
                <AssembliesPage />
              ) : page === 'settings' ? (
                <Settings settings={settings} materials={materials}
                  onSettingsChange={handleSettingsChange}
                  onMaterialsChange={m => { setMaterials(m) }} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CSS animations ────────────────────────────────────────────────────────────
const styleEl = document.createElement('style')
styleEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(styleEl)

// ─── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [route, setRoute] = useState(() => {
    const path = window.location.pathname
    const hash = window.location.hash
    if (path === '/success' || hash === '#success') return 'success'
    if (hash === '#app') return 'app'
    return 'landing'
  })

  if (route === 'success') return <SuccessPage />
  if (route === 'app') return <SaaSShell />
  return <Landing onStart={() => { window.location.hash = '#app'; setRoute('app') }} />
}
