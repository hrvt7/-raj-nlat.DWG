import React, { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import Landing from './Landing.jsx'
import { supabase, supabaseConfigured, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword, onAuthChange, saveQuoteRemote, saveSettingsRemote, saveAssembliesRemote, saveMaterialsRemote, saveWorkItemsRemote, saveProjectsRemote, savePlansRemote, loadSettingsRemote, loadQuotesRemote, loadAssembliesRemote, loadMaterialsRemote, loadWorkItemsRemote, loadProjectsRemote, loadPlansRemote, createQuoteShare } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'
import QuoteView from './components/QuoteView.jsx'

// ── Lazy-loaded pages (not needed on initial render) ────────────────────────
const Dashboard              = lazy(() => import('./pages/Dashboard.jsx'))
const Quotes                 = lazy(() => import('./pages/Quotes.jsx'))
const WorkItems              = lazy(() => import('./pages/WorkItems.jsx'))
const Settings               = lazy(() => import('./pages/Settings.jsx'))
const AssembliesPage         = lazy(() => import('./pages/Assemblies.jsx'))
const ProjektekPage          = lazy(() => import('./pages/Projektek.jsx'))
const MaterialsPage          = lazy(() => import('./pages/Materials.jsx'))

// ── Lazy-loaded modals (rarely opened) ──────────────────────────────────────
const LegendPanel            = lazy(() => import('./components/LegendPanel.jsx'))
const DetectionReviewPanel   = lazy(() => import('./components/DetectionReviewPanel.jsx'))
const PdfMergePanel          = lazy(() => import('./components/PdfMergePanel.jsx'))
import { loadSettings, saveSettings, loadWorkItems, saveWorkItems, loadMaterials, saveMaterials, loadQuotes, saveQuotes, saveQuote, loadAssemblies, saveAssemblies } from './data/store.js'
import { getPlanFile, getPlanMeta, getPlansByProject, loadPlans, updatePlanMeta, saveAllPlansMeta, syncAllAnnotationsRemote, clearAllLocalPlanData } from './data/planStore.js'
import { generateProjectId, saveProject, saveAllProjects, loadProjects, getProject } from './data/projectStore.js'
import { QuoteStatusBadge, fmt, ToastProvider, useToast } from './components/ui.jsx'
// SuccessPage removed — Stripe payment flow is not active
import TakeoffWorkspace from './components/TakeoffWorkspace.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { OUTPUT_MODE_INCLEXCL, OUTPUT_MODE_NOTES, GROUP_BY_OPTIONS, GROUP_BY_LABELS, groupItemsBySystem, groupItemsByFloor } from './data/quoteDefaults.js'
import { quoteDisplayTotals } from './utils/quoteDisplayTotals.js'
import { generateBOMRows, exportBOM } from './utils/bomExport.js'
import { createQuote } from './utils/createQuote.js'
import { seedDemoData } from './data/demoSeed.js'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', sidebar: '#0D0D0F',
  textSub: '#A1A1AA', textMuted: '#71717A',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
  bgHover: 'rgba(255,255,255,0.03)', redDim: 'rgba(255,107,107,0.08)',
}

// ─── PDF Detail Level Selector ────────────────────────────────────────────────
const OUTPUT_MODES = [
  { key: 'combined',              label: 'Teljes',                     desc: 'Anyag + munkadíj összesítve' },
  { key: 'labor_only',            label: 'Csak munkadíj',              desc: 'Csak munkadíj jelenik meg' },
  { key: 'split_material_labor',  label: 'Anyag + munkadíj külön',     desc: 'Anyag és munkadíj külön bontásban' },
]

// OUTPUT_MODE_NOTES imported from ./data/quoteDefaults.js

// OUTPUT_MODE_INCLEXCL imported from ./data/quoteDefaults.js

const PDF_LEVELS = [
  { key: 'compact',  label: 'Tömör',       icon: '▣', desc: 'Összesítő, KPI-k, pénzügyi táblázat' },
  { key: 'summary',  label: 'Összesített',  icon: '▤', desc: '+ Munkacsoport-bontás' },
  { key: 'detailed', label: 'Részletes',    icon: '▦', desc: '+ Minden tétel, anyagok, munka' },
]

const PDF_PREVIEW_SECTIONS = {
  compact: [
    { label: 'Fejléc + logó',         active: true,  fresh: false },
    { label: 'KPI összesítő kártyák', active: true,  fresh: false },
    { label: 'Pénzügyi táblázat',     active: true,  fresh: false },
    { label: 'Munkacsoport bontás',   active: false, fresh: false },
    { label: 'Részletes tétellista',  active: false, fresh: false },
  ],
  summary: [
    { label: 'Fejléc + logó',         active: true,  fresh: false },
    { label: 'KPI összesítő kártyák', active: true,  fresh: false },
    { label: 'Pénzügyi táblázat',     active: true,  fresh: false },
    { label: 'Munkacsoport bontás',   active: true,  fresh: true  },
    { label: 'Részletes tétellista',  active: false, fresh: false },
  ],
  detailed: [
    { label: 'Fejléc + logó',         active: true,  fresh: false },
    { label: 'KPI összesítő kártyák', active: true,  fresh: false },
    { label: 'Pénzügyi táblázat',     active: true,  fresh: false },
    { label: 'Munkacsoport bontás',   active: true,  fresh: false },
    { label: 'Részletes tétellista',  active: true,  fresh: true  },
  ],
}

const OUTPUT_MODE_LABELS = {
  combined: 'Anyag + munkadíj összesítve',
  labor_only: 'Csak munkadíj jelenik meg',
  split_material_labor: 'Anyag és munkadíj külön bontásban',
}

function PdfPreview({ level, outputMode = 'combined' }) {
  const rows = PDF_PREVIEW_SECTIONS[level] || PDF_PREVIEW_SECTIONS.compact
  const modeLabel = OUTPUT_MODE_LABELS[outputMode] || OUTPUT_MODE_LABELS.combined
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 14,
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Tartalom előnézet
      </div>
      {/* Output mode description */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3.5px 0', marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: C.blue, boxShadow: `0 0 5px ${C.blue}60` }} />
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.blue }}>{modeLabel}</span>
      </div>
      <div style={{ height: 1, background: C.border, margin: '4px 0 6px' }} />
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3.5px 0' }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: row.active ? (row.fresh ? C.accent : C.blue) : C.border,
            boxShadow: row.fresh ? `0 0 5px ${C.accent}80` : 'none',
          }} />
          <span style={{
            fontFamily: 'DM Mono', fontSize: 10,
            color: row.active ? (row.fresh ? C.accent : C.textSub) : C.muted + '60',
            textDecoration: row.active ? 'none' : 'line-through',
          }}>{row.label}</span>
          {row.fresh && (
            <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 8, color: C.accent, opacity: 0.7, background: C.accentDim, borderRadius: 4, padding: '1px 5px' }}>+ extra</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── QuoteView ────────────────────────────────────────────────────────────────

// ─── PasswordResetForm ─────────────────────────────────────────────────────────
function PasswordResetForm({ onDone }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (pw1.length < 6) { setError('A jelszónak legalább 6 karakter hosszúnak kell lennie.'); return }
    if (pw1 !== pw2) { setError('A két jelszó nem egyezik.'); return }
    setLoading(true)
    try {
      await updatePassword(pw1)
      setSuccess(true)
    } catch (e) {
      setError(e.message || 'Jelszó módosítás sikertelen')
    } finally { setLoading(false) }
  }

  const inp = {
    width: '100%', padding: '12px 16px', background: C.bg,
    border: `1px solid ${C.border}`, borderRadius: 10, color: C.text,
    fontFamily: 'DM Mono', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: '44px 36px', width: '100%', maxWidth: 420, boxSizing: 'border-box', position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            TakeoffPro
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 6, letterSpacing: '0.05em' }}>
            {success ? 'Jelszó sikeresen módosítva' : 'Új jelszó beállítása'}
          </div>
        </div>

        {success ? (
          <>
            <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 13, color: C.accent, marginBottom: 28 }}>
              A jelszavad sikeresen megváltozott. Most már bejelentkezhetsz az új jelszóval.
            </div>
            <button onClick={onDone} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)', color: '#09090B', fontFamily: 'Syne', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Tovább az alkalmazásba
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: C.textSub, marginBottom: 6 }}>Új jelszó</div>
              <input style={inp} type="password" placeholder="Legalább 6 karakter" value={pw1}
                onChange={e => setPw1(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: C.textSub, marginBottom: 6 }}>Jelszó megerősítés</div>
              <input style={inp} type="password" placeholder="Írd be újra" value={pw2}
                onChange={e => setPw2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border} />
            </div>

            {error && (
              <div style={{ background: C.redDim, border: `1px solid ${C.red}40`, color: C.red, fontFamily: 'DM Mono', fontSize: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading || !pw1}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: loading ? C.accentDim : 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)', color: '#09090B', fontFamily: 'Syne', fontWeight: 800, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: !pw1 ? 0.5 : 1, transition: 'all 0.2s' }}>
              {loading ? 'Folyamatban...' : 'Jelszó módosítása'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── AuthModal ─────────────────────────────────────────────────────────────────
function AuthModal({ onAuth }) {
  const [mode, setMode]         = useState('login') // login | register | confirm | forgot | forgot-sent
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')

  const submit = async () => {
    setError(''); setInfo(''); setLoading(true)
    try {
      if (mode === 'forgot') {
        await resetPassword(email)
        setMode('forgot-sent')
      } else if (mode === 'login') {
        await signIn(email, password)
        onAuth()
      } else {
        const { data } = await signUp(email, password, name)
        if (data?.user && !data?.session) {
          setMode('confirm')
        } else {
          onAuth()
        }
      }
    } catch (e) {
      setError(e.message || 'Hiba történt')
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setError(''); setInfo(''); setLoading(true)
    try {
      await resendConfirmation(email)
      setInfo('Aktiváló email újraküldve!')
    } catch (e) {
      setError(e.message || 'Újraküldés sikertelen')
    } finally { setLoading(false) }
  }

  const inp = {
    width: '100%', padding: '12px 16px', background: C.bg,
    border: `1px solid ${C.border}`, borderRadius: 10, color: C.text,
    fontFamily: 'DM Mono', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  // ── Forgot password sent screen ──
  if (mode === 'forgot-sent') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: '44px 36px', width: '100%', maxWidth: 420, boxSizing: 'border-box', position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 12 }}>
            Jelszó visszaállítás elküldve
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub, marginBottom: 8 }}>
            Küldtünk egy jelszó-visszaállító linket erre a címre:
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 14, color: C.accent, fontWeight: 600, marginBottom: 24 }}>
            {email}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
            Kattints az emailben kapott linkre az új jelszó beállításához.<br />Nézd meg a spam mappát is!
          </div>
          <button onClick={() => { setMode('login'); setError(''); setInfo('') }} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)', color: '#09090B', fontFamily: 'Syne', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Vissza a bejelentkezéshez
          </button>
        </div>
      </div>
    )
  }

  // ── Email confirmation screen ──
  if (mode === 'confirm') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20,
          padding: '44px 36px', width: '100%', maxWidth: 420, boxSizing: 'border-box',
          position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✉</div>
          <div style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: 22,
            background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            marginBottom: 12,
          }}>
            Erősítsd meg az email címed
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub, marginBottom: 8 }}>
            Küldtünk egy aktiváló linket erre a címre:
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 14, color: C.accent, fontWeight: 600, marginBottom: 24 }}>
            {email}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
            Kattints az emailben kapott linkre, majd térj vissza ide és jelentkezz be.
            <br />Nézd meg a spam mappát is!
          </div>
          {info && (
            <div style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent, fontFamily: 'DM Mono', fontSize: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
              {info}
            </div>
          )}
          {error && (
            <div style={{ background: C.redDim, border: `1px solid ${C.red}40`, color: C.red, fontFamily: 'DM Mono', fontSize: 12, padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
              {error}
            </div>
          )}
          <button
            onClick={() => { setMode('login'); setError(''); setInfo('') }}
            style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)',
              color: '#09090B', fontFamily: 'Syne', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            }}
          >
            Vissza a bejelentkezéshez
          </button>
          <button
            onClick={handleResend}
            disabled={loading}
            style={{
              width: '100%', padding: '11px', borderRadius: 10, marginTop: 10,
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.muted, fontFamily: 'DM Mono', fontSize: 12, cursor: 'pointer',
            }}
          >
            {loading ? 'Küldés...' : 'Nem kaptam meg — újraküldés'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      {/* Subtle grid background */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20,
        padding: '44px 36px', width: '100%', maxWidth: 420, boxSizing: 'border-box',
        position: 'relative', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            TakeoffPro
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 6, letterSpacing: '0.05em' }}>
            {mode === 'forgot' ? 'Jelszó visszaállítás' : mode === 'login' ? 'Jelentkezz be a fiókodba' : 'Hozd létre a fiókodat'}
          </div>
        </div>

        {mode === 'register' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: C.textSub, marginBottom: 6 }}>Teljes név</div>
            <input style={inp} placeholder="Kovács János" value={name}
              onChange={e => setName(e.target.value)}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border} />
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: C.textSub, marginBottom: 6 }}>E-mail cím</div>
          <input style={inp} type="email" placeholder="email@ceg.hu" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            onFocus={e => e.target.style.borderColor = C.accent}
            onBlur={e => e.target.style.borderColor = C.border} />
        </div>
        {mode !== 'forgot' && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: C.textSub, marginBottom: 6 }}>Jelszó</div>
            <input style={inp} type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border} />
            {mode === 'login' && (
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <span onClick={() => { setMode('forgot'); setError(''); setInfo('') }} style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, cursor: 'pointer' }}>
                  Elfelejtett jelszó?
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{
            background: C.redDim, border: `1px solid ${C.red}40`,
            color: C.red, fontFamily: 'DM Mono', fontSize: 12,
            padding: '10px 14px', borderRadius: 10, marginBottom: 18,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !email || (mode !== 'forgot' && !password)}
          style={{
            width: '100%', padding: '13px', borderRadius: 10, border: 'none',
            background: loading ? C.accentDim : 'linear-gradient(135deg, #21F3A3 0%, #17C7FF 100%)',
            color: '#09090B', fontFamily: 'Syne', fontWeight: 800, fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '-0.01em',
            transition: 'all 0.2s', opacity: (!email || (mode !== 'forgot' && !password)) ? 0.5 : 1,
          }}
        >
          {loading ? 'Folyamatban...' : mode === 'forgot' ? 'Jelszó visszaállítás' : mode === 'login' ? 'Bejelentkezés' : 'Fiók létrehozása'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 22, fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>
          {mode === 'forgot' ? (
            <span onClick={() => { setMode('login'); setError(''); setInfo('') }} style={{ color: C.accent, cursor: 'pointer', fontWeight: 600 }}>
              Vissza a bejelentkezéshez
            </span>
          ) : (
            <>
              {mode === 'login' ? 'Még nincs fiókod?' : 'Már van fiókod?'}{' '}
              <span
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setInfo('') }}
                style={{ color: C.accent, cursor: 'pointer', fontWeight: 600 }}
              >
                {mode === 'login' ? 'Regisztráció' : 'Bejelentkezés'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SaaS Shell ────────────────────────────────────────────────────────────────
function SaaSShell() {
  const [page, setPage] = useState('dashboard')
  const [activeTrade, setActiveTrade] = useState(null) // which trade section is active
  const [settings, setSettings] = useState(loadSettings)
  const [materials, setMaterials] = useState(loadMaterials)
  const [quotes, setQuotes] = useState(loadQuotes)
  const [asmRev, setAsmRev] = useState(0)         // cross-tab assemblies reload key
  const [projRev, setProjRev] = useState(0)       // cross-tab projects reload key
  const [planRev, setPlanRev] = useState(0)       // cross-tab plans reload key
  const [viewingQuote, setViewingQuote] = useState(null)

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUserEmail(session?.user?.email || '')
      setAuthChecked(true)
    })
    const { data: { subscription } } = onAuthChange((s, event) => {
      setSession(s)
      setUserEmail(s?.user?.email || '')
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Remote read-back: hydrate empty/broken local state from cloud for signed-in users ──
  // Conservative: only recovers when local data is clearly missing, empty, or corrupted.
  // Does NOT overwrite valid non-empty local data.
  useEffect(() => {
    if (!session) return

    // Detect recoverable local state (missing / empty / malformed)
    const isSettingsRecoverable = () => {
      try {
        const raw = localStorage.getItem('takeoffpro_settings')
        if (raw === null) return true
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return true
        return Object.keys(parsed).length === 0 // empty {}
      } catch { return true } // malformed JSON
    }
    const isQuotesRecoverable = () => {
      try {
        const raw = localStorage.getItem('takeoffpro_quotes')
        if (raw === null) return true
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return true
        // Versioned envelope: { _v, data: [...] } or legacy raw array
        const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : null)
        return !arr || arr.length === 0
      } catch { return true } // malformed JSON
    }
    // Catalog entities: recoverable when missing, unparseable, or empty array
    const isArrayRecoverable = (lsKey) => {
      try {
        const raw = localStorage.getItem(lsKey)
        if (raw === null) return true
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return true
        return parsed.length === 0
      } catch { return true } // malformed JSON
    }

    // Versioned envelope entities: { _v, data: [...] } or legacy raw array
    const isEnvelopeRecoverable = (lsKey) => {
      try {
        const raw = localStorage.getItem(lsKey)
        if (raw === null) return true
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return true
        const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : null)
        return !arr || arr.length === 0
      } catch { return true }
    }

    // ── Cross-device merge: always fetch remote on login, use whichever has more data ──
    // Previous logic only recovered when local was empty. This caused cross-device
    // data loss: switching browsers showed stale/empty data even though remote had
    // the user's full dataset. Now we always fetch remote and merge: if remote has
    // more items than local, remote wins. This covers:
    // - Fresh browser (local empty → remote wins)
    // - Same browser after logout (local empty → remote wins)
    // - Cross-device (local has defaults, remote has real data → remote wins)

    ;(async () => {
      try {
        // Settings: remote wins if local is empty/default
        if (isSettingsRecoverable()) {
          const remote = await loadSettingsRemote()
          if (remote) { saveSettings(remote); setSettings(loadSettings()) }
        }

        // Quotes: union merge by ID — keeps all unique quotes from both sources,
        // preferring the version with the later updatedAt when both have the same ID.
        // This replaces the old count-based merge which could discard newer local quotes.
        {
          const rows = await loadQuotesRemote()
          const remoteQuotes = (rows || []).map(r => r.pricing_data).filter(Boolean)
          const localQuotes = loadQuotes()
          if (remoteQuotes.length > 0) {
            const merged = new Map()
            // Local first — local is authoritative for recently-edited quotes
            for (const q of localQuotes) { if (q.id) merged.set(q.id, q) }
            // Remote — add missing quotes, update if remote is newer
            for (const q of remoteQuotes) {
              if (!q.id) continue
              const existing = merged.get(q.id)
              if (!existing) {
                merged.set(q.id, q) // new from remote
              } else {
                // Prefer the one with later updatedAt (or createdAt fallback)
                const remoteTime = q.updatedAt || q.createdAt || ''
                const localTime = existing.updatedAt || existing.createdAt || ''
                if (remoteTime > localTime) merged.set(q.id, q)
              }
            }
            const unionQuotes = Array.from(merged.values())
              .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            if (unionQuotes.length !== localQuotes.length || unionQuotes.some((q, i) => q.id !== localQuotes[i]?.id)) {
              saveQuotes(unionQuotes); setQuotes(loadQuotes())
            }
          }
        }

        // Catalog blobs: remote wins if local is empty (new device / cleared cache).
        // If both have data, keep local — it's the most recently edited version.
        // This replaces the old count-based merge which could discard local edits.
        const mergeCatalog = async (loadRemoteFn, loadLocalFn, saveLocalFn, onUpdate) => {
          const remote = await loadRemoteFn()
          if (!Array.isArray(remote) || remote.length === 0) return
          const local = loadLocalFn()
          if (!local || local.length === 0) {
            // Local is empty — recover from remote (new device scenario)
            saveLocalFn(remote)
            onUpdate()
          }
          // If both have data, local wins (user's most recent edits are local)
        }
        await mergeCatalog(loadAssembliesRemote, loadAssemblies, saveAssemblies, () => setAsmRev(r => r + 1))
        await mergeCatalog(loadMaterialsRemote, loadMaterials, saveMaterials, () => setMaterials(loadMaterials()))
        await mergeCatalog(loadWorkItemsRemote, loadWorkItems, saveWorkItems, () => setWorkItems(loadWorkItems()))

        // Project/plan metadata: remote wins if local is empty (new device).
        // If both have data, local wins — local metadata reflects the latest user actions.
        {
          const remoteProjects = await loadProjectsRemote()
          if (Array.isArray(remoteProjects) && remoteProjects.length > 0) {
            const localProjects = loadProjects()
            if (!localProjects || localProjects.length === 0) {
              saveAllProjects(remoteProjects); setProjRev(r => r + 1)
            }
          }
        }
        {
          const remotePlans = await loadPlansRemote()
          if (Array.isArray(remotePlans) && remotePlans.length > 0) {
            const localPlans = loadPlans()
            if (!localPlans || localPlans.length === 0) {
              saveAllPlansMeta(remotePlans); setPlanRev(r => r + 1)
            }
          }
        }
      } catch (err) {
        console.warn('[App] Remote read-back failed (non-blocking):', err.message)
      }
    })()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Legacy route redirects → projektek ──────────────────────────────────────
  useEffect(() => {
    if (page === 'plans') setPage('projektek')
  }, [page])

  // ── Orphan plan migration (once, on mount) ────────────────────────────────
  useEffect(() => {
    const orphans = loadPlans().filter(p => !p.projectId)
    if (orphans.length === 0) return
    // Check if "Importált tervek" project already exists
    const existing = loadProjects().find(p => p.name === 'Importált tervek')
    const projectId = existing ? existing.id : generateProjectId()
    if (!existing) {
      saveProject({ id: projectId, name: 'Importált tervek', defaultQuoteOutputMode: 'combined', createdAt: new Date().toISOString() })
    }
    orphans.forEach(p => updatePlanMeta(p.id, { projectId }))
    console.log(`[App] Migrated ${orphans.length} orphan plan(s) → "Importált tervek" project (${projectId})`)
  }, [])

  const handleSignOut = async () => {
    // Sync all local data to remote BEFORE clearing (prevents data loss)
    try {
      await Promise.allSettled([
        saveSettingsRemote(settings),
        saveQuoteRemote && quotes.length > 0 ? Promise.all(quotes.map(q => saveQuoteRemote(q).catch(() => {}))) : Promise.resolve(),
        saveAssembliesRemote(loadAssemblies()),
        saveMaterialsRemote(materials),
        saveWorkItemsRemote(loadWorkItems()),
        saveProjectsRemote(loadProjects()),
        savePlansRemote(loadPlans()),
        syncAllAnnotationsRemote(),
      ])
    } catch { /* best-effort sync before logout */ }
    await signOut()
    // Clear all local data to prevent leakage to next user
    const keysToKeep = ['takeoffpro_cookie_consent'] // preserve cookie consent
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('takeoffpro_'))
    for (const k of allKeys) {
      if (!keysToKeep.includes(k)) localStorage.removeItem(k)
    }
    // Clear IndexedDB stores (plan files, annotations, thumbnails, parse cache)
    // Next login recovers from Supabase remote backup.
    try { await clearAllLocalPlanData() } catch { /* best-effort */ }
    setSession(null)
    setUserEmail('')
    // Redirect to landing
    window.location.hash = ''
    window.location.reload()
  }

  // Trade-specifikus oldal navigáció: "assemblies-erosaram" → page='assemblies', activeTrade='erosaram'
  const handleNavigate = (key, tradeId) => {
    setViewingQuote(null)
    // Parse trade-specific keys like "assemblies-erosaram"
    const tradeMatch = key.match(/^(assemblies|work-items|materials)-(.+)$/)
    if (tradeMatch) {
      setPage(tradeMatch[1])
      setActiveTrade(tradeMatch[2])
    } else {
      setPage(key)
      if (!['assemblies', 'work-items', 'materials'].includes(key)) {
        setActiveTrade(null)
      }
    }
  }

  const getPageTitle = () => {
    const TRADE_LABELS = { erosaram: 'Erősáram', gyengaram: 'Gyengeáram', tuzjelzo: 'Tűzjelző' }
    const tradeLabel = activeTrade ? TRADE_LABELS[activeTrade] : null
    const baseTitles = {
      dashboard: 'Dashboard', quotes: 'Ajánlatok',
      projektek: '', 'projektek-workspace': '',
      'work-items': 'Munkatételek', materials: 'Anyagok',
      assemblies: 'Assemblyk', settings: 'Beállítások',
    }
    const base = baseTitles[page] || page
    return tradeLabel ? `${base} — ${tradeLabel}` : base
  }

  const [felmeresFile, setFelmeresFile] = useState(null)
  const [felmeresOpenPlan, setFelmeresOpenPlan] = useState(null) // plan object when opening from Felmérés
  // ── Unsaved changes guard ──────────────────────────────────────────────────
  const viewerDirtyRef = useRef(false)
  const [autoSaveToast, setAutoSaveToast] = useState(false)
  const handleViewerDirtyChange = useCallback((dirty) => {
    viewerDirtyRef.current = dirty
  }, [])
  const showAutoSaveToast = useCallback(() => {
    setAutoSaveToast(true)
    setTimeout(() => setAutoSaveToast(false), 2500)
  }, [])
  // ── General-purpose toast (icon + message) ──
  const [genToast, setGenToast] = useState(null) // { icon, msg, color? }
  const showToast = useCallback((icon, msg, color) => {
    setGenToast({ icon, msg, color: color || '#FFD166' })
    setTimeout(() => setGenToast(null), 3200)
  }, [])
  // Felmérés project navigation
  const [activeProjectId, setActiveProjectId] = useState(null)
  // Felmérés modal panels
  const [legendPanelData, setLegendPanelData] = useState(null) // null = closed, { projectId?, legendPlanId? }
  const [detectPanelPlans, setDetectPanelPlans] = useState(null) // null = closed, [] = plans
  const [detectPanelProjectId, setDetectPanelProjectId] = useState(null)
  const [detectPanelExistingRun, setDetectPanelExistingRun] = useState(null) // existing run for reopen
  const [mergePanelPlans, setMergePanelPlans] = useState(null)   // null = closed, [] = plans
  const [viewerFocusTarget, setViewerFocusTarget] = useState(null) // { planId, pageNum, x, y } from review locate

  const [workItems, setWorkItems] = useState(loadWorkItems)

  const handleQuotesChange = (updated) => {
    saveQuotes(updated)
    setQuotes(updated)
  }

  const handleQuoteSaved = quote => {
    const updated = loadQuotes()
    setQuotes(updated)
    setViewingQuote(quote)
    setPage('quotes')
    if (session) {
      saveQuoteRemote(quote).catch(err => {
        console.error('[TakeoffPro] Remote quote sync failed:', err.message)
        showToast('⚠', 'Felhő szinkron sikertelen – az adat helyben mentve.', '#FF6B6B')
      })
    }
  }

  // ── Build quote from per-plan snapshot (plan-takeoff flow) ─────────────
  const buildQuoteFromPlan = (pid) => {
    const meta = getPlanMeta(pid) || {}
    if (!meta.calcPricing || !meta.calcPricingLines) {
      console.warn('[App] buildQuoteFromPlan: missing calc snapshot on plan', pid)
      return
    }
    const p = meta.calcPricing
    const displayName = meta.name || `Ajánlat ${new Date().toLocaleDateString('hu-HU')}`
    // ── Resolve project-level default output mode ──────────────────
    const planPrjDefault = meta.projectId ? (getProject(meta.projectId)?.defaultQuoteOutputMode || 'combined') : 'combined'

    const quote = createQuote({
      displayName,
      clientName: '',
      outputMode: planPrjDefault,
      pricing: p,
      pricingParams: { hourlyRate: meta.calcHourlyRate || 9000, markupPct: meta.calcMarkup || 0, markupType: meta.calcMarkupType || settings?.labor?.markup_type || 'markup' },
      settings,
      overrides: {
        items: (meta.calcPricingLines || []).map(item => ({
          ...item,
          systemType: item.systemType || 'general',
          sourcePlanSystemType: item.sourcePlanSystemType || meta.inferredMeta?.systemType || 'general',
          sourcePlanFloor: item.sourcePlanFloor || meta.inferredMeta?.floor || null,
          sourcePlanFloorLabel: item.sourcePlanFloorLabel || meta.inferredMeta?.floorLabel || null,
        })),
        assemblySummary: meta.calcAssemblySummary || [],
        cableCost: meta.calcCableCost || 0,
        source: 'plan-takeoff',
        fileName: meta.fileName || meta.name,
        planId: pid,
      },
    })
    saveQuote(quote)
    handleQuoteSaved(quote)
  }

  // ── Save edited quote meta + pricing (QuoteView inline edit) ────────────
  const handleSaveQuote = (updatedQuote) => {
    saveQuote(updatedQuote)
    setQuotes(loadQuotes())
    setViewingQuote(updatedQuote)
    if (session) {
      saveQuoteRemote(updatedQuote).catch(err => {
        console.error('[TakeoffPro] Remote quote sync failed:', err.message)
        showToast('⚠', 'Felhő szinkron sikertelen – az adat helyben mentve.', '#FF6B6B')
      })
    }
  }

  // ── "Try demo" handler — seeds demo data and opens first demo quote ──────
  const handleTryDemo = () => {
    const { seeded } = seedDemoData()
    const freshQuotes = loadQuotes()
    setQuotes(freshQuotes)
    // Find the first DEMO quote and navigate directly into QuoteView
    const demoQuote = freshQuotes.find(q => q.id?.startsWith('DEMO-'))
    if (demoQuote) {
      setViewingQuote(demoQuote)
      setPage('quotes')
    }
  }

  const handleStatusChange = (quoteId, newStatus) => {
    // Use functional state update to avoid race condition with stale quotes
    setQuotes(prev => {
      const updated = prev.map(q => q.id === quoteId ? { ...q, status: newStatus, updatedAt: new Date().toISOString() } : q)
      saveQuotes(updated)
      return updated
    })
    if (viewingQuote?.id === quoteId) setViewingQuote(prev => ({ ...prev, status: newStatus }))
  }

  const handleSettingsChange = newSettings => {
    saveSettings(newSettings)
    setSettings(newSettings)
    if (session) {
      saveSettingsRemote(newSettings).catch(err => {
        console.error('[TakeoffPro] Remote settings sync failed:', err.message)
      })
    }
  }

  // ── Post-restore full state refresh (backup import) ──────────────────────
  const handleRestoreComplete = useCallback(() => {
    setQuotes(loadQuotes())
    setWorkItems(loadWorkItems())
    setProjRev(r => r + 1)
    setPlanRev(r => r + 1)
    setAsmRev(r => r + 1)
  }, [])

  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── 1.3 Storage quota warning banner ──────────────────────────────────────
  const [storageWarning, setStorageWarning] = useState(null)
  useEffect(() => {
    const handler = (e) => {
      setStorageWarning(e.detail?.error || 'Ismeretlen tárolási hiba')
      // Auto-dismiss after 12 seconds
      setTimeout(() => setStorageWarning(null), 12000)
    }
    window.addEventListener('takeoffpro:storage-error', handler)
    return () => window.removeEventListener('takeoffpro:storage-error', handler)
  }, [])

  // ── 1.4 Cross-tab sync: reload state when another tab modifies localStorage ─
  useEffect(() => {
    const handler = (e) => {
      if (!e.key || !e.key.startsWith('takeoffpro_')) return
      // Reload relevant state based on which key changed
      if (e.key.includes('quotes'))     setQuotes(loadQuotes())
      if (e.key.includes('settings'))   setSettings(loadSettings())
      if (e.key.includes('assemblies')) setAsmRev(r => r + 1)
      if (e.key.includes('materials'))  setMaterials(loadMaterials())
      if (e.key.includes('work_items'))    setWorkItems(loadWorkItems())
      if (e.key.includes('projects_meta')) setProjRev(r => r + 1)
      if (e.key.includes('plans_meta'))    setPlanRev(r => r + 1)
    }
    window.addEventListener('storage', handler)
    // Quote pruning warning — fires when saveQuote trims old quotes beyond MAX_QUOTES
    const pruneHandler = (e) => {
      const { pruned, max } = e.detail || {}
      showToast('⚠', `${pruned} régi ajánlat archiválva (max ${max} tárolható helyben).`, '#FFD166')
    }
    window.addEventListener('takeoffpro:quotes-pruned', pruneHandler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('takeoffpro:quotes-pruned', pruneHandler)
    }
  }, [showToast])

  const SIDEBAR_FULL = 220
  const SIDEBAR_COLLAPSED = 60
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sidebarW = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL
  // ── Auth gate: mandatory login (skip in offline mode when Supabase is not configured) ──
  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{ color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>Betöltés...</div>
      </div>
    )
  }
  if (!session && supabaseConfigured) {
    return <AuthModal onAuth={() => {}} />
  }
  if (passwordRecovery) {
    return <PasswordResetForm onDone={() => setPasswordRecovery(false)} />
  }

  return (
    <ToastProvider>
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      <Sidebar
        active={activeTrade ? `${page}-${activeTrade}` : page}
        activeTrade={activeTrade}
        onNavigate={handleNavigate}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div style={{ marginLeft: isMobile ? 0 : sidebarW, flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0, transition: 'margin-left 0.2s ease' }}>

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
            {page === 'dashboard' && !viewingQuote ? (
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: isMobile ? 16 : 19, letterSpacing: '-0.01em', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {settings?.company?.name || ''}
              </div>
            ) : page === 'projektek' && activeProjectId ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
                <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: isMobile ? 14 : 16, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getProject(activeProjectId)?.name || ''}
                </span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {getPlansByProject(activeProjectId).length} tervrajz
                </span>
              </div>
            ) : (
              <div style={{ color: C.text, fontWeight: 600, fontSize: isMobile ? 14 : 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {viewingQuote ? viewingQuote.projectName : getPageTitle()}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {session && (
              <>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 20, padding: '3px 10px', maxWidth: 160,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail}
                </span>
                <button onClick={handleSignOut} style={{
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
                  color: C.muted, fontSize: 12,
                }}>Ki</button>
              </>
            )}
          </div>
        </div>

        {/* ── Storage warning banner ─────────────────────────────────────── */}
        {storageWarning && (
          <div style={{
            background: '#7f1d1d', borderBottom: '1px solid #991b1b',
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'DM Mono', fontSize: 11,
          }}>
            <span style={{ color: '#fca5a5' }}>⚠ Tárolási hiba: {storageWarning}</span>
            <span style={{ color: '#fca5a5', opacity: 0.7, marginLeft: 'auto', fontSize: 10 }}>
              Töröld a nem használt ajánlatokat a hely felszabadításához
            </span>
            <button onClick={() => setStorageWarning(null)} style={{
              background: 'transparent', border: 'none', color: '#fca5a5',
              cursor: 'pointer', fontSize: 14, padding: '0 4px',
            }}>✕</button>
          </div>
        )}

        {/* ── Content — full-height for TakeoffWorkspace, padded for other pages ── */}
        {page === 'projektek-workspace' ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary
              fallbackLabel="TakeoffWorkspace összeomlott"
              onManualMode={() => setPage('projektek')}
            >
              <TakeoffWorkspace
                settings={settings}
                materials={materials}
                initialFile={felmeresFile}
                planId={felmeresOpenPlan?.id || null}
                focusTarget={viewerFocusTarget}
                onDirtyChange={handleViewerDirtyChange}
                onSaved={() => {
                  // Per-plan save: go back to Projektek (NOT to Ajánlatok)
                  viewerDirtyRef.current = false
                  setFelmeresFile(null)
                  setFelmeresOpenPlan(null)
                  setPage('projektek')
                }}
                onCancel={() => {
                  viewerDirtyRef.current = false
                  setFelmeresFile(null); setFelmeresOpenPlan(null); setPage('projektek')
                }}
                onQuoteFromPlan={(pid) => {
                  viewerDirtyRef.current = false
                  setFelmeresFile(null); setFelmeresOpenPlan(null)
                  buildQuoteFromPlan(pid)
                }}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 14px' : '32px 28px' }}>
            <Suspense fallback={<div style={{ color: C.muted, textAlign: 'center', padding: 40, fontFamily: 'DM Mono', fontSize: 13 }}>Betöltés…</div>}>
            <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
              {viewingQuote && page === 'quotes' ? (
                <QuoteView quote={viewingQuote} settings={settings} session={session} onBack={() => setViewingQuote(null)}
                  onStatusChange={handleStatusChange} onSaveQuote={handleSaveQuote} />
              ) : page === 'dashboard' ? (
                <Dashboard quotes={quotes} settings={settings}
                  onNavigate={p => { setViewingQuote(null); setPage(p) }}
                  onOpenQuote={q => { setViewingQuote(q); setPage('quotes') }}
                  onRefresh={() => setQuotes(loadQuotes())}
                  onTryDemo={handleTryDemo} />
              ) : page === 'quotes' ? (
                <Quotes quotes={quotes} onQuotesChange={handleQuotesChange}
                  session={session}
                  onNavigate={p => setPage(p)}
                  onOpenQuote={q => { setViewingQuote(q); setPage('quotes') }}
                  onRefresh={() => setQuotes(loadQuotes())} />
              ) : page === 'work-items' ? (
                <WorkItems workItems={workItems} onWorkItemsChange={wis => { setWorkItems(wis); if (session) saveWorkItemsRemote(wis).catch(err => console.error('[TakeoffPro] Remote work items sync failed:', err.message)) }} activeTrade={activeTrade} />
              ) : page === 'materials' ? (
                <MaterialsPage materials={materials} onMaterialsChange={m => { setMaterials(m); if (session) saveMaterialsRemote(m).catch(err => console.error('[TakeoffPro] Remote materials sync failed:', err.message)) }} activeTrade={activeTrade} />
              ) : page === 'projektek' ? (
                <ProjektekPage key={`${projRev}-${planRev}`}
                  onOpenFile={(f, plan) => {
                    if (viewerDirtyRef.current) { showAutoSaveToast(); viewerDirtyRef.current = false }
                    setFelmeresFile(f); setFelmeresOpenPlan(plan || null); setPage('projektek-workspace')
                  }}
                  onLegendPanel={(data) => setLegendPanelData(data || {})}
                  onDetectPanel={(plans, projId) => { setDetectPanelPlans(plans); setDetectPanelProjectId(projId || null) }}
                  onMergePanel={plans => setMergePanelPlans(plans)}
                  onReopenDetection={(run) => {
                    setDetectPanelExistingRun(run)
                    setDetectPanelProjectId(run.projectId || null)
                    // Use planIds from the run to provide plans context
                    setDetectPanelPlans((run.planIds || []).map(id => ({ id })))
                  }}
                  activeProjectId={activeProjectId}
                  onOpenProject={id => setActiveProjectId(id)}
                  onBackToProjects={() => setActiveProjectId(null)}
                  legendPanelOpen={!!legendPanelData}
                />
              ) : page === 'assemblies' ? (
                <AssembliesPage key={asmRev} activeTrade={activeTrade} session={session} />
              ) : page === 'settings' ? (
                <Settings settings={settings} materials={materials}
                  onSettingsChange={handleSettingsChange}
                  onMaterialsChange={m => { setMaterials(m); if (session) saveMaterialsRemote(m).catch(err => console.error('[TakeoffPro] Remote materials sync failed:', err.message)) }}
                  onRestoreComplete={handleRestoreComplete} />
              ) : null}
            </div>
            </Suspense>
          </div>
        )}
      </div>

      {/* ── Felmérés modal panels ─────────────────────────────────────────── */}
      <Suspense fallback={null}>
      {legendPanelData && (
        <ErrorBoundary
          fallbackLabel="Jelmagyarázat panel hiba"
          onManualMode={() => setLegendPanelData(null)}
        >
          <LegendPanel
            onClose={() => setLegendPanelData(null)}
            projectId={legendPanelData.projectId}
            legendPlanId={legendPanelData.legendPlanId}
            onRunDetection={({ projectId: projId }) => {
              // Close legend panel, open detection with all project plans
              setLegendPanelData(null)
              const plans = projId ? getPlansByProject(projId) : []
              if (plans.length === 0) {
                showToast('', 'Nincs tervrajz a projektben — tölts fel PDF-et a detektáláshoz.')
                return
              }
              setDetectPanelPlans(plans)
              setDetectPanelProjectId(projId)
              setDetectPanelExistingRun(null)
            }}
          />
        </ErrorBoundary>
      )}
      {detectPanelPlans && (
        <DetectionReviewPanel
          plans={detectPanelPlans}
          projectId={detectPanelProjectId}
          existingRun={detectPanelExistingRun}
          onClose={() => { setDetectPanelPlans(null); setDetectPanelProjectId(null); setDetectPanelExistingRun(null) }}
          onDone={() => { setDetectPanelPlans(null); setDetectPanelProjectId(null); setDetectPanelExistingRun(null) }}
          onLocateDetection={async (target) => {
            // Multi-plan locate: if target is on a different plan, switch to it first
            const needsPlanSwitch = target.planId && target.planId !== (felmeresOpenPlan?.id || null)
            if (needsPlanSwitch && viewerDirtyRef.current) {
              // Inform user that unsaved changes are being auto-saved (unmount save handles persistence)
              showAutoSaveToast()
              viewerDirtyRef.current = false
            }
            if (needsPlanSwitch) {
              try {
                const blob = await getPlanFile(target.planId)
                if (blob) {
                  const meta = getPlanMeta(target.planId) || {}
                  const file = new File([blob], meta.name || 'terv.pdf', { type: 'application/pdf' })
                  setFelmeresOpenPlan({ id: target.planId, name: meta.name || 'Terv' })
                  setFelmeresFile(file)
                  setPage('projektek-workspace')
                }
              } catch (e) {
                console.warn('[App] multi-plan locate: plan load failed', e)
              }
            } else if (!felmeresOpenPlan && target.planId) {
              // No workspace open at all — open the target plan
              try {
                const blob = await getPlanFile(target.planId)
                if (blob) {
                  const meta = getPlanMeta(target.planId) || {}
                  const file = new File([blob], meta.name || 'terv.pdf', { type: 'application/pdf' })
                  setFelmeresOpenPlan({ id: target.planId, name: meta.name || 'Terv' })
                  setFelmeresFile(file)
                  setPage('projektek-workspace')
                }
              } catch (e) {
                console.warn('[App] plan open for locate failed', e)
              }
            }
            // Always set focus target — PdfViewer pendingFocus handles timing
            setViewerFocusTarget({ ...target, _ts: Date.now() })
          }}
        />
      )}
      {mergePanelPlans && (
        <PdfMergePanel
          plans={mergePanelPlans}
          materials={materials}
          onClose={() => setMergePanelPlans(null)}
          onSaved={quote => { handleQuoteSaved(quote); setMergePanelPlans(null) }}
          onOpenPlan={async (plan) => {
            setMergePanelPlans(null)
            try {
              const blob = await getPlanFile(plan.id)
              if (!blob) return
              const meta = getPlanMeta(plan.id) || {}
              const ft = plan.fileType || (plan.name || '').toLowerCase().split('.').pop() || 'pdf'
              const mimeMap = { pdf: 'application/pdf', dxf: 'text/plain', dwg: 'application/octet-stream' }
              const file = new File([blob], plan.name || meta.name || 'terv.pdf', { type: mimeMap[ft] || 'application/octet-stream' })
              setFelmeresOpenPlan(plan)
              setFelmeresFile(file)
              setPage('projektek-workspace')
            } catch (e) {
              console.warn('[App] PdfMergePanel onOpenPlan failed:', e)
            }
          }}
        />
      )}
      </Suspense>
      {/* ── Auto-save toast (informative guard on plan switch) ────────────── */}
      {autoSaveToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1A3A2A', color: '#00E5A0', border: '1px solid #00E5A044',
          borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500,
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          animation: 'fadeInUp 0.25s ease-out',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>✓</span> Módosítások automatikusan mentve
        </div>
      )}
      {/* ── General toast (edge case warnings) ───────────────────────────── */}
      {genToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1A2A3A', color: genToast.color, border: `1px solid ${genToast.color}44`,
          borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 500,
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          animation: 'fadeInUp 0.25s ease-out',
          display: 'flex', alignItems: 'center', gap: 8, maxWidth: 420,
          fontFamily: 'DM Mono',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{genToast.icon}</span> {genToast.msg}
        </div>
      )}
    </div>
    </ToastProvider>
  )
}

// ─── CSS animations ────────────────────────────────────────────────────────────
const styleEl = document.createElement('style')
styleEl.textContent = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
`
document.head.appendChild(styleEl)

// ─── Root App ──────────────────────────────────────────────────────────────────
function routeFromLocation() {
  const path = window.location.pathname
  const hash = window.location.hash
  if (hash === '#app') return 'app'
  if (hash === '#privacy') return 'privacy'
  if (hash === '#terms') return 'terms'
  return 'landing'
}

export default function App() {
  const [route, setRoute] = useState(routeFromLocation)

  // Keep route in sync with browser back/forward and direct hash changes
  useEffect(() => {
    const sync = () => setRoute(routeFromLocation())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  if (route === 'app') return <SaaSShell />
  if (route === 'privacy') return <Landing page="privacy" onStart={() => { window.location.hash = '#app'; setRoute('app') }} />
  if (route === 'terms') return <Landing page="terms" onStart={() => { window.location.hash = '#app'; setRoute('app') }} />
  return <Landing onStart={() => { window.location.hash = '#app'; setRoute('app') }} />
}
