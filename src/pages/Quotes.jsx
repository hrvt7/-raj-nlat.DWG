import React, { useState, useMemo } from 'react'
import { C, fmt, Card, Button, QuoteStatusBadge, EmptyState, Input, ConfirmDialog, useToast } from '../components/ui.jsx'
import { checkQuotePlanStatus } from '../utils/quoteOrphans.js'
import { isDemoSeeded, seedDemoData } from '../data/demoSeed.js'
import { deleteQuoteRemote } from '../supabase.js'
// saveQuotes handled by parent via onQuotesChange

const STATUS_TABS = [
  { key: 'all',     label: 'Összes' },
  { key: 'draft',   label: 'Piszkozat' },
  { key: 'sent',    label: 'Elküldve' },
  { key: 'won',     label: 'Nyertes' },
  { key: 'lost',    label: 'Elveszett' },
  { key: 'expired', label: 'Lejárt' },
]

export default function QuotesPage({ quotes, onQuotesChange, session, onNavigate, onOpenQuote, onRefresh }) {
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const toast = useToast()

  const filtered = quotes.filter(q => {
    const matchTab = activeTab === 'all' || q.status === activeTab
    const matchSearch = !search || [q.project_name, q.client_name, q.id].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return matchTab && matchSearch
  })

  const updateStatus = (id, status) => {
    const updated = quotes.map(q => q.id === id ? { ...q, status } : q)
    onQuotesChange(updated)
    toast.show('Státusz frissítve', 'success')
  }

  const deleteQuote = (id) => {
    const q = quotes.find(q => q.id === id)
    setConfirmState({
      message: 'Törlöd ezt az ajánlatot?',
      detail: q ? `${q.project_name || 'Névtelen'} (${q.id})` : id,
      confirmLabel: 'Törlés',
      onConfirm: () => {
        const updated = quotes.filter(q => q.id !== id)
        onQuotesChange(updated)
        if (session) {
          deleteQuoteRemote(id).catch(err => {
            console.error('[TakeoffPro] Remote quote delete failed:', err.message)
          })
        }
        setConfirmState(null)
        toast.show('Ajánlat törölve', 'success')
      }
    })
  }

  const totalValue = filtered.reduce((s, q) => s + (q.summary?.grandTotal || 0), 0)

  // Compute orphan status for all quotes (memoized by quotes array ref)
  const orphanMap = useMemo(() => {
    const map = {}
    for (const q of quotes) {
      const status = checkQuotePlanStatus(q)
      if (status === 'orphan' || status === 'partial') map[q.id] = status
    }
    return map
  }, [quotes])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: C.text }}>Ajánlatok</h1>
          <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, marginTop: 4 }}>
            {filtered.length} ajánlat · összesen {fmt(totalValue)} Ft nettó
          </p>
        </div>
        <Button onClick={() => { onNavigate('projektek'); toast.show('Válassz projektet és tervrajzot az ajánlat elkészítéséhez.', 'info', 4000) }} >Új ajánlat</Button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 4, background: C.bgCard, padding: 4, borderRadius: 10, border: `1px solid ${C.border}` }}>
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? quotes.length : quotes.filter(q => q.status === tab.key).length
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: activeTab === tab.key ? C.accent : 'transparent',
                color: activeTab === tab.key ? '#09090B' : C.textSub,
                fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                transition: 'all 0.15s', whiteSpace: 'nowrap'
              }}>
                {tab.label}
                {count > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Input value={search} onChange={setSearch} placeholder="Keresés: projekt, megrendelő..." />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'Nincs találat' : 'Még nincs ajánlat'}
          desc={search ? 'Próbálj más keresési feltételt.' : 'Készítsd el az első ajánlatot: hozz létre projektet, töltsd fel a tervrajzot, majd generálj árajánlatot.'}
          action={!search && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button onClick={() => { onNavigate('projektek'); toast.show('Válassz projektet és tervrajzot az ajánlat elkészítéséhez.', 'info', 4000) }}>Új ajánlat</Button>
              {!isDemoSeeded() && (
                <Button variant="ghost" onClick={() => {
                  const { seeded } = seedDemoData()
                  if (seeded) {
                    toast.show('Mintaadatok betöltve', 'success')
                    if (onRefresh) onRefresh()
                  }
                }}>Mintaadatok betöltése</Button>
              )}
            </div>
          )}
        />
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: C.bgCard }}>
                {['Azonosító', 'Projekt neve', 'Megrendelő', 'Összeg (nettó)', 'Munkaóra', 'Dátum', 'Státusz', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 10,
                    color: C.textSub, fontFamily: 'DM Mono', fontWeight: 500,
                    borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, i) => (
                <tr key={q.id}
                  style={{ borderBottom: `1px solid ${C.border}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted }}>{q.id}</span>
                    {q.bundleId && (
                      <div
                        title={`Bundle: ${q.bundleId}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          marginLeft: 6, padding: '1px 6px', borderRadius: 4,
                          background: 'rgba(168,130,255,0.1)', border: '1px solid rgba(168,130,255,0.2)',
                          fontFamily: 'DM Mono', fontSize: 9, color: '#A882FF',
                          verticalAlign: 'middle', cursor: 'default',
                        }}
                      >
                        📦 Bundle
                      </div>
                    )}
                    {orphanMap[q.id] && (
                      <div
                        title={orphanMap[q.id] === 'orphan'
                          ? 'A forrásterv törölve lett — az ajánlat adatai megmaradtak.'
                          : 'Néhány forrásterv törölve lett.'}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          marginLeft: 6, padding: '1px 6px', borderRadius: 4,
                          background: 'rgba(255,209,102,0.10)', border: '1px solid rgba(255,209,102,0.25)',
                          fontFamily: 'DM Mono', fontSize: 9, color: '#FFD166',
                          verticalAlign: 'middle', cursor: 'default',
                        }}
                      >
                        ⚠ Terv törölve
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => onOpenQuote(q)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left'
                    }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
                        {q.project_name || 'Névtelen projekt'}
                      </div>
                      {q.files_count > 1 && (
                        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                          {q.files_count} DXF fájl
                        </div>
                      )}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>
                    {q.client_name || '–'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.accent }}>
                    {q.summary?.grandTotal ? `${fmt(q.summary.grandTotal)} Ft` : '–'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 12, color: C.yellow }}>
                    {q.summary?.totalWorkHours ? `${fmt(q.summary.totalWorkHours)} ó` : '–'}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted }}>
                    {q.created_at ? new Date(q.created_at).toLocaleDateString('hu-HU') : '–'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusDropdown status={q.status || 'draft'} onChange={s => updateStatus(q.id, s)} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => onOpenQuote(q)} style={{
                        padding: '5px 10px', background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                        borderRadius: 6, color: C.accent, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer'
                      }}>Megnyit</button>
                      <button onClick={() => deleteQuote(q.id)} style={{
                        padding: '5px 8px', background: C.redDim, border: '1px solid rgba(255,107,107,0.2)',
                        borderRadius: 6, color: C.red, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer'
                      }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Card>
      )}

      {/* Confirm dialog */}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          detail={confirmState.detail}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  )
}

function StatusDropdown({ status, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef(null)
  const options = [
    { key: 'draft',   label: 'Piszkozat',  color: 'gray' },
    { key: 'sent',    label: 'Elküldve',   color: 'blue' },
    { key: 'won',     label: 'Nyertes',    color: 'green' },
    { key: 'lost',    label: 'Elveszett',  color: 'red' },
    { key: 'expired', label: 'Lejárt',     color: 'yellow' },
  ]

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <div onClick={e => { e.stopPropagation(); setOpen(!open) }} style={{ cursor: 'pointer' }}>
        <QuoteStatusBadge status={status} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 200,
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: 6, marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', minWidth: 130
        }}>
          {options.map(o => (
            <div key={o.key} onMouseDown={e => { e.stopPropagation(); onChange(o.key); setOpen(false) }} style={{
              padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'DM Mono', fontSize: 12, color: C.textSub,
              background: o.key === status ? C.bgHover : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
            onMouseLeave={e => e.currentTarget.style.background = o.key === status ? C.bgHover : 'transparent'}
            >
              <QuoteStatusBadge status={o.key} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
