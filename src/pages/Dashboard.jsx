import React, { useMemo, useState, useEffect } from 'react'
import { C, fmt, StatCard, Card, QuoteStatusBadge, Button, EmptyState, useToast } from '../components/ui.jsx'
import { loadWorkItems, loadMaterials, loadAssemblies } from '../data/store.js'
import { isDemoSeeded, seedDemoData, hasDemoData, clearDemoData } from '../data/demoSeed.js'

export default function Dashboard({ quotes, settings, onNavigate, onOpenQuote, onRefresh, onTryDemo }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [demoLoaded, setDemoLoaded] = useState(false)
  const toast = useToast()
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = quotes.filter(q => {
      if (!q.created_at) return false
      const d = new Date(q.created_at)
      if (isNaN(d.getTime())) return false
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const won  = quotes.filter(q => q.status === 'won')
    const open = quotes.filter(q => q.status === 'sent')
    const total = quotes.reduce((s, q) => s + (q.summary?.grandTotal || 0), 0)
    const wonTotal = won.reduce((s, q) => s + (q.summary?.grandTotal || 0), 0)
    const winRate = quotes.length > 0 ? Math.round((won.length / quotes.length) * 100) : 0
    return { thisMonth: thisMonth.length, won: won.length, open: open.length, total, wonTotal, winRate, all: quotes.length }
  }, [quotes])

  const dbStats = useMemo(() => {
    const workItems = loadWorkItems()
    const materials = loadMaterials()
    const assemblies = loadAssemblies()
    return { workItems: workItems.length, materials: materials.length, assemblies: assemblies.length }
  }, [])

  const recentQuotes = quotes.slice(0, 8)

  return (
    <div>

      {/* ── Welcome Hero — first-time users only ──────────────────────────── */}
      {quotes.length === 0 && !isDemoSeeded() && onTryDemo && (
        <div data-testid="welcome-hero" style={{
          background: `linear-gradient(135deg, rgba(0,229,160,0.06) 0%, rgba(76,201,240,0.04) 100%)`,
          border: `1px solid ${C.accentBorder || 'rgba(0,229,160,0.2)'}`,
          borderRadius: 14, padding: isMobile ? '28px 20px' : '36px 32px',
          marginBottom: 22, textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: isMobile ? 20 : 26, color: C.text, marginBottom: 8 }}>
            Üdvözlünk a TakeoffPro-ban!
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, lineHeight: 1.7, maxWidth: 440, margin: '0 auto 20px' }}>
            Nézd meg a bemutató ajánlatot — tervrajz-alapú kalkuláció, PDF export, árazás — 2 perc alatt.
          </div>
          <button
            data-testid="welcome-try-demo"
            onClick={onTryDemo}
            style={{
              background: C.accent, color: '#09090B', border: 'none', borderRadius: 8,
              padding: '12px 32px', fontFamily: 'Syne', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Kipróbálom a demót →
          </button>
        </div>
      )}

      {/* Stats row – quotes */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard
          label="Összes ajánlat"
          value={stats.all}
          sub={`${stats.thisMonth} db ez hónapban`}
          color={C.accent}
        />
        <StatCard
          label="Nyitott / várakozó"
          value={stats.open}
          sub="Elküldve, döntésre vár"
          color={C.yellow}
        />
        <StatCard
          label="Nyertes ajánlat"
          value={`${stats.winRate}%`}
          sub={`${stats.won} db nyertes`}
          color={C.accent}
        />
        <StatCard
          label="Nyertes összérték"
          value={stats.wonTotal > 0 ? `${fmt(stats.wonTotal / 1000000)} M` : '–'}
          sub="Ft (nettó)"
          color={C.blue}
        />
      </div>

      {/* Database stats strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 20,
      }}>
        <DbStatCard
          label="Munkatételek"
          value={dbStats.workItems}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4CC9F0" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
          color="#4CC9F0"
          onClick={() => onNavigate('work-items')}
        />
        <DbStatCard
          label="Anyagok"
          value={dbStats.materials}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r=".01"/></svg>}
          color="#A78BFA"
          onClick={() => onNavigate('materials')}
        />
        <DbStatCard
          label="Assemblyk"
          value={dbStats.assemblies}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD166" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
          color="#FFD166"
          onClick={() => onNavigate('assemblies')}
        />
        <DbStatCard
          label="Aktív óradíj"
          value={`${fmt(settings?.labor?.hourly_rate)}`}
          suffix="Ft/ó"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>}
          color={C.accent}
          onClick={() => onNavigate('settings')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: (!isMobile && !settings?.company?.name) ? '1fr 280px' : '1fr', gap: 18 }}>
        {/* Recent quotes table */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>Utolsó ajánlatok</h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('quotes')}>Mind →</Button>
          </div>

          {recentQuotes.length === 0 ? (
            <EmptyState
              title="Még nincs ajánlat"
              desc="Hozd létre az első projektet, töltsd fel a tervrajzot, majd készíts ajánlatot."
              action={
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Button onClick={() => onNavigate('felmeres')}>Új projekt</Button>
                  {!isDemoSeeded() && onTryDemo && (
                    <Button variant="ghost" onClick={onTryDemo}>Demó ajánlat →</Button>
                  )}
                  {!isDemoSeeded() && !onTryDemo && (
                    <Button variant="ghost" onClick={() => {
                      const { seeded } = seedDemoData()
                      if (seeded) {
                        setDemoLoaded(true)
                        toast.show('Mintaadatok betöltve', 'success')
                        if (onRefresh) onRefresh()
                      }
                    }}>Mintaadatok betöltése</Button>
                  )}
                </div>
              }
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Projekt / Azonosító', 'Megrendelő', 'Összeg (nettó)', 'Munkaóra', 'Státusz', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 10,
                      color: C.textSub, fontFamily: 'DM Mono', fontWeight: 500,
                      borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.06em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentQuotes.map((q, i) => (
                  <tr key={i}
                    style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => onOpenQuote ? onOpenQuote(q) : onNavigate('quotes')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>{q.project_name || 'Névtelen projekt'}</div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginTop: 2 }}>{q.id}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>
                      {q.client_name || '–'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent }}>
                      {q.summary?.grandTotal ? `${fmt(q.summary.grandTotal)} Ft` : '–'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 12, color: C.yellow }}>
                      {q.summary?.totalWorkHours ? `${fmt(q.summary.totalWorkHours)} ó` : '–'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <QuoteStatusBadge status={q.status || 'draft'} />
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted }}>
                      {q.created_at ? new Date(q.created_at).toLocaleDateString('hu-HU') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Right column – info cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Settings reminder */}
          {!settings?.company?.name && (
            <Card style={{ padding: 18, border: `1px solid rgba(255,209,102,0.2)`, background: 'rgba(255,209,102,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.yellow} strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.yellow }}>Céges adatok hiányoznak</div>
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.6, marginBottom: 12 }}>
                Töltsd ki a cégnevét és adatait az ajánlatokhoz.
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('settings')} style={{ width: '100%', justifyContent: 'center' }}>
                Beállítások →
              </Button>
            </Card>
          )}

          {/* Demo path guidance */}
          {quotes.length <= 2 && (
            <Card style={{ padding: 18, border: `1px solid rgba(0,229,160,0.15)`, background: 'rgba(0,229,160,0.03)' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent, marginBottom: 10 }}>
                Javasolt munkafolyamat
              </div>
              {[
                { num: '1', label: 'Projekt létrehozása', desc: 'Felmérés menüpont', page: 'felmeres' },
                { num: '2', label: 'Tervrajz feltöltése', desc: 'DXF/DWG/PDF fájl', page: 'felmeres' },
                { num: '3', label: 'Kalkuláció készítése', desc: 'Automatikus mennyiségkimutatás', page: null },
                { num: '4', label: 'Ajánlat generálása', desc: 'PDF export a megrendelőnek', page: 'quotes' },
              ].map((step, i) => (
                <div key={i}
                  onClick={step.page ? () => onNavigate(step.page) : undefined}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0',
                    cursor: step.page ? 'pointer' : 'default',
                    borderBottom: i < 3 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'DM Mono', fontSize: 10, fontWeight: 700, color: C.accent,
                  }}>{step.num}</div>
                  <div>
                    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>{step.label}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Demo data cleanup */}
          {hasDemoData() && (
            <Card style={{ padding: 14, border: `1px solid ${C.border}`, background: C.bgCard }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted }}>
                  Mintaadatok aktívak
                </div>
                <button onClick={() => {
                  const result = clearDemoData()
                  toast.show(`Mintaadatok törölve (${result.removedProjects + result.removedPlans + result.removedQuotes} elem)`, 'success')
                  if (onRefresh) onRefresh()
                }} style={{
                  background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '4px 10px', fontFamily: 'DM Mono', fontSize: 10, color: C.textSub,
                  cursor: 'pointer',
                }}>Törlés</button>
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}

function DbStatCard({ label, value, suffix, icon, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.boxShadow = `0 4px 16px ${color}10` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color }}>
        {value}
        {suffix && <span style={{ fontSize: 11, fontWeight: 400, color: C.textSub, marginLeft: 4 }}>{suffix}</span>}
      </div>
    </div>
  )
}
