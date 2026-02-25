import React, { useMemo } from 'react'
import { C, fmt, StatCard, Card, QuoteStatusBadge, Button, EmptyState } from '../components/ui.jsx'

export default function Dashboard({ quotes, settings, onNavigate }) {
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = quotes.filter(q => {
      const d = new Date(q.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const won  = quotes.filter(q => q.status === 'won')
    const open = quotes.filter(q => q.status === 'sent')
    const total = quotes.reduce((s, q) => s + (q.summary?.grandTotal || 0), 0)
    const wonTotal = won.reduce((s, q) => s + (q.summary?.grandTotal || 0), 0)
    const winRate = quotes.length > 0 ? Math.round((won.length / quotes.length) * 100) : 0
    return { thisMonth: thisMonth.length, won: won.length, open: open.length, total, wonTotal, winRate, all: quotes.length }
  }, [quotes])

  const recentQuotes = quotes.slice(0, 8)

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          {settings.company.name ? `${settings.company.name}` : 'Dashboard'}
        </h1>
        <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub }}>
          Villanyszerelési árajánlat rendszer
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard
          label="Összes ajánlat"
          value={stats.all}
          sub={`${stats.thisMonth} db ez hónapban`}
          color={C.accent}
          icon="📋"
        />
        <StatCard
          label="Nyitott / várakozó"
          value={stats.open}
          sub="Elküldve, döntésre vár"
          color={C.yellow}
          icon="⏳"
        />
        <StatCard
          label="Nyertes ajánlat"
          value={`${stats.winRate}%`}
          sub={`${stats.won} db nyertes`}
          color={C.accent}
          icon="✓"
        />
        <StatCard
          label="Nyertes összérték"
          value={stats.wonTotal > 0 ? `${fmt(stats.wonTotal / 1000000)} M` : '–'}
          sub="Ft (bruttó)"
          color={C.blue}
          icon="💰"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
        {/* Recent quotes table */}
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>Utolsó ajánlatok</h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('quotes')}>Mind →</Button>
          </div>

          {recentQuotes.length === 0 ? (
            <EmptyState
              icon="📋"
              title="Még nincs ajánlat"
              desc="Hozd létre az első ajánlatot DXF/DWG feltöltéssel."
              action={<Button onClick={() => onNavigate('new-quote')} icon="＋">Új ajánlat</Button>}
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
                    onClick={() => onNavigate('quotes', q.id)}
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

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick action */}
          <Card style={{ padding: 20 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 14 }}>Gyors indítás</div>
            <Button onClick={() => onNavigate('new-quote')} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} icon="⚡">
              Új ajánlat (DXF)
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('settings')} style={{ width: '100%', justifyContent: 'center' }} icon="⚙">
              Beállítások
            </Button>
          </Card>

          {/* Settings reminder */}
          {!settings.company.name && (
            <Card style={{ padding: 18, border: `1px solid rgba(255,209,102,0.2)`, background: 'rgba(255,209,102,0.04)' }}>
              <div style={{ fontSize: 16, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.yellow, marginBottom: 6 }}>Céges adatok hiányoznak</div>
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
              {fmt(settings.labor.hourly_rate)} Ft<span style={{ fontSize: 14, color: C.textSub }}>/ó</span>
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, marginTop: 6 }}>
              Árrés: {Math.round((settings.labor.default_margin - 1) * 100)}% · ÁFA: {settings.labor.vat_percent}%
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
