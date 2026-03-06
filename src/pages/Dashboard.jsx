import React, { useMemo, useState, useEffect } from 'react'
import { C, fmt, StatCard, Card, QuoteStatusBadge, Button, EmptyState } from '../components/ui.jsx'
import { loadWorkItems, loadMaterials, loadAssemblies } from '../data/store.js'

export default function Dashboard({ quotes, settings, onNavigate, onOpenQuote }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
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
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          {settings?.company?.name ? `${settings?.company?.name}` : 'Dashboard'}
        </h1>
        <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub }}>
          Villanyszerelési árajánlat rendszer
        </p>
      </div>

      {/* ── Gyors indítás – TOP CENTER ── */}
      <Card style={{ padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', background: `linear-gradient(135deg, rgba(0,229,160,0.05) 0%, transparent 60%)`, border: `1px solid rgba(0,229,160,0.15)` }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 3 }}>Gyors indítás</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted }}>Hozz létre új ajánlatot DXF/DWG terv feltöltésével</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <Button onClick={() => onNavigate('new-quote')}>
            + Új ajánlat
          </Button>
          <Button variant="secondary" onClick={() => onNavigate('settings')}>
            Beállítások
          </Button>
        </div>
      </Card>

      {/* Stats row – quotes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
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
          sub="Ft (bruttó)"
          color={C.blue}
        />
      </div>

      {/* Database stats strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20,
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
          label="Rezsióradíj"
          value={`${fmt(settings?.labor?.hourly_rate)}`}
          suffix="Ft/ó"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>}
          color={C.accent}
          onClick={() => onNavigate('settings')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: 18 }}>
        {/* Recent quotes table */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>Utolsó ajánlatok</h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('quotes')}>Mind →</Button>
          </div>

          {recentQuotes.length === 0 ? (
            <EmptyState
              title="Még nincs ajánlat"
              desc="Hozd létre az első ajánlatot DXF/DWG feltöltéssel."
              action={<Button onClick={() => onNavigate('new-quote')}>Új ajánlat</Button>}
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Projekt / Azonosító', 'Megrendelő', 'Összeg', 'Munkaóra', 'Státusz', ''].map(h => (
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
                    onClick={() => onOpenQuote?.(q) || onNavigate('quotes')}
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

          {/* Labor rate display */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aktív óradíj</div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: C.accent }}>
              {fmt(settings?.labor?.hourly_rate)} Ft<span style={{ fontSize: 14, color: C.textSub }}>/ó</span>
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, marginTop: 6 }}>
              Árrés: {settings?.labor?.markup_percent ?? 15}% {settings?.labor?.markup_type === "margin" ? "(margin)" : "(markup)"} · ÁFA: {settings?.labor?.vat_percent}%
            </div>
          </Card>

          {/* Quick nav links */}
          <Card style={{ padding: 14 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gyors navigáció</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Tervek', page: 'plans', color: '#EC4899' },
                { label: 'Munkatételek', page: 'work-items', color: '#4CC9F0' },
                { label: 'Anyagok', page: 'materials', color: '#A78BFA' },
                { label: 'Assemblyk', page: 'assemblies', color: '#FFD166' },
              ].map(item => (
                <button key={item.page} onClick={() => onNavigate(item.page)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer', background: 'transparent',
                  border: `1px solid transparent`, transition: 'all 0.12s',
                  width: '100%', textAlign: 'left',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.bgHover; e.currentTarget.style.borderColor = C.border }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: C.textSub }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>→</span>
                </button>
              ))}
            </div>
          </Card>
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
