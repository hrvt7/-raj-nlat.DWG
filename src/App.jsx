import React, { useState, useRef, useCallback, useEffect } from 'react'
import Landing from './Landing.jsx'
import { generatePdf } from './utils/generatePdf.js'
import { supabase, signIn, signUp, signOut, onAuthChange, saveQuoteRemote, getSubscriptionStatus } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Quotes from './pages/Quotes.jsx'
import WorkItems from './pages/WorkItems.jsx'
import Settings from './pages/Settings.jsx'
import AssembliesPage from './pages/Assemblies.jsx'
import ProjektekPage from './pages/Projektek.jsx'
import LegendPanel from './components/LegendPanel.jsx'
import DetectionReviewPanel from './components/DetectionReviewPanel.jsx'
import PdfMergePanel from './components/PdfMergePanel.jsx'
import MaterialsPage from './pages/Materials.jsx'
import { loadSettings, saveSettings, loadWorkItems, loadMaterials, loadQuotes, saveQuotes, saveQuote, generateQuoteId } from './data/store.js'
import { getPlanFile, getPlanMeta, getPlansByProject, loadPlans, updatePlanMeta } from './data/planStore.js'
import { generateProjectId, saveProject, loadProjects } from './data/projectStore.js'
import { Button, Badge, Input, Select, StatCard, Table, QuoteStatusBadge, fmt, fmtM } from './components/ui.jsx'
import SuccessPage from './pages/Success.jsx'
import TakeoffWorkspace from './components/TakeoffWorkspace.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

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

function PdfPreview({ level }) {
  const rows = PDF_PREVIEW_SECTIONS[level] || PDF_PREVIEW_SECTIONS.compact
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 14,
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Tartalom előnézet
      </div>
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
function QuoteView({ quote, settings, onBack, onStatusChange, onSaveQuote }) {
  const statuses = ['draft', 'sent', 'won', 'lost']
  const statusLabels = { draft: 'Piszkozat', sent: 'Elküldve', won: 'Nyertes', lost: 'Elveszett' }
  const statusColors = { draft: C.muted, sent: C.blue, won: C.accent, lost: C.red }
  const [pdfLevel, setPdfLevel] = useState('summary')
  const [pdfGenerating, setPdfGenerating] = useState(false)

  // ── Editable meta state ────────────────────────────────────────────────────
  const [editName, setEditName] = useState(quote.projectName || '')
  const [editClient, setEditClient] = useState(quote.clientName || '')
  const [editRate, setEditRate] = useState(Number(quote.pricingData?.hourlyRate) || 9000)
  const [editMarkup, setEditMarkup] = useState(((quote.pricingData?.markup_pct) || 0) * 100)

  // ── Sync local state when quote prop changes (e.g. different quote opened, or after save) ──
  const prevQuoteRef = useRef(quote.id)
  useEffect(() => {
    if (quote.id !== prevQuoteRef.current) {
      setEditName(quote.projectName || '')
      setEditClient(quote.clientName || '')
      setEditRate(Number(quote.pricingData?.hourlyRate) || 9000)
      setEditMarkup(((quote.pricingData?.markup_pct) || 0) * 100)
      prevQuoteRef.current = quote.id
    }
  }, [quote.id, quote.projectName, quote.clientName, quote.pricingData?.hourlyRate, quote.pricingData?.markup_pct])

  // ── Dirty check (normalized numeric comparison) ────────────────────────────
  const isDirty = editName !== (quote.projectName || '')
    || editClient !== (quote.clientName || '')
    || Number(editRate) !== (Number(quote.pricingData?.hourlyRate) || 9000)
    || Math.abs(Number(editMarkup) - ((quote.pricingData?.markup_pct || 0) * 100)) > 0.001

  // ── Derived pricing from editable rate + markup ────────────────────────────
  const vatPct = Number(settings?.labor?.vat_percent) || 27
  const totalHours = quote.totalHours || 0
  const totalMaterials = Math.round(quote.totalMaterials || 0)
  const newTotalLabor = Math.round(totalHours * Number(editRate))
  const newSubtotal = totalMaterials + newTotalLabor
  const newMarkupAmount = Math.round(newSubtotal * (Number(editMarkup) / 100))
  const net = newSubtotal + newMarkupAmount
  const vat = Math.round(net * vatPct / 100)
  const gross = net + vat

  // ── Save handler: build updated quote, persist ─────────────────────────────
  const handleMetaSave = () => {
    if (!isDirty || !onSaveQuote) return
    const updated = {
      ...quote,
      projectName: editName,
      project_name: editName,
      name: editName,
      clientName: editClient,
      client_name: editClient,
      gross: net,
      totalLabor: newTotalLabor,
      summary: { ...quote.summary, grandTotal: net },
      pricingData: {
        ...quote.pricingData,
        hourlyRate: Number(editRate),
        markup_pct: Number(editMarkup) / 100,
      },
      updatedAt: new Date().toISOString(),
    }
    onSaveQuote(updated)
  }

  const handlePdf = () => {
    setPdfGenerating(true)
    // Build a live quote snapshot for PDF so it uses current edits (even unsaved)
    const liveQuote = {
      ...quote,
      projectName: editName, project_name: editName, name: editName,
      clientName: editClient, client_name: editClient,
      gross: net, totalLabor: newTotalLabor,
      pricingData: { ...quote.pricingData, hourlyRate: Number(editRate), markup_pct: Number(editMarkup) / 100 },
    }
    try { generatePdf(liveQuote, settings, pdfLevel) }
    finally { setTimeout(() => setPdfGenerating(false), 1200) }
  }

  // Separate items by type for the grouped table
  const matItems   = (quote.items || []).filter(i => i.type === 'material' || i.type === 'cable')
  const laborItems = (quote.items || []).filter(i => i.type === 'labor')

  // Label style reused throughout
  const labelStyle = { fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }
  const monoVal    = { fontFamily: 'DM Mono', fontSize: 13, color: C.text, fontWeight: 500 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.textSub, cursor: 'pointer', fontSize: 16, padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono',
          transition: 'border-color 0.15s',
        }}>← Vissza</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: C.text, lineHeight: 1.2 }}>{editName || quote.projectName}</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 2 }}>{quote.id}</div>
        </div>
        <QuoteStatusBadge status={quote.status} />
      </div>

      {/* ── Hero KPI strip ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {/* Gross — accent hero card */}
        <div style={{
          background: `linear-gradient(135deg, ${C.accent}18, ${C.blue}0a)`,
          border: `1px solid ${C.accent}40`, borderRadius: 12, padding: '18px 20px', gridColumn: 'span 1',
        }}>
          <span style={labelStyle}>Bruttó végösszeg</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: C.accent, lineHeight: 1 }}>{fmt(gross)} Ft</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 5 }}>
            Nettó {fmt(net)} + ÁFA {vatPct}%
          </div>
        </div>
        {/* Materials */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>Anyagköltség</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.text }}>{fmt(Math.round(quote.totalMaterials || 0))} Ft</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 5 }}>nettó</div>
        </div>
        {/* Labor */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>Munkadíj</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.blue }}>{fmt(newTotalLabor)} Ft</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 5 }}>nettó</div>
        </div>
        {/* Hours */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>Munkaóra</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.yellow }}>{(quote.totalHours || 0).toFixed(1)} ó</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 5 }}>{fmt(Number(editRate))} Ft/ó</div>
        </div>
      </div>

      {/* ── Main body: left (items) + right (sidebar) ────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 20, alignItems: 'start' }}>

        {/* LEFT – items table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Assembly summary if available */}
          {(quote.assemblySummary || []).length > 0 && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 13, color: C.text }}>Munkák összesítő</span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{quote.assemblySummary.length} munkacsoport</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['Tevékenység', 'db', 'Összeg (nettó)'].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 14px', fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
                        textAlign: i === 0 ? 'left' : 'right', fontWeight: 500,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        borderBottom: `1px solid ${C.border}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quote.assemblySummary.map((a, i) => (
                    <tr key={a.id || i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>{a.name}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 11, color: C.muted, textAlign: 'right' }}>{a.qty}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 500, textAlign: 'right' }}>{fmt(a.totalPrice || 0)} Ft</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Labor items — first */}
          {laborItems.length > 0 && (
            <ItemsGroup
              title="Munka" count={laborItems.length} accentColor={C.blue}
              items={laborItems}
              renderRow={item => {
                const total = (item.hours || 0) * Number(editRate)
                return [
                  item.name,
                  `${+(item.qty || 0).toFixed(2)} ${item.unit || ''}`,
                  `${fmt(Number(editRate))} Ft/ó`,
                  `${(item.hours || 0).toFixed(2)} ó`,
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, fontWeight: 600, color: C.blue }}>{fmt(Math.round(total))} Ft</span>,
                ]
              }}
            />
          )}

          {/* Material items — second */}
          {matItems.length > 0 && (
            <ItemsGroup
              title="Anyagok" count={matItems.length} accentColor={C.text}
              items={matItems}
              renderRow={item => {
                const total = (item.unitPrice || 0) * item.qty
                return [
                  item.name,
                  `${+(item.qty || 0).toFixed(2)} ${item.unit || ''}`,
                  `${fmt(Math.round(item.unitPrice || 0))} Ft`,
                  '—',
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(Math.round(total))} Ft</span>,
                ]
              }}
            />
          )}

        </div>

        {/* RIGHT – sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Metadata card — inline editable */}
          <div style={{ background: C.bgCard, border: `1px solid ${isDirty ? C.accent + '60' : C.border}`, borderRadius: 12, padding: 18, transition: 'border-color 0.2s' }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Adatok
              {isDirty && <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>módosítva</span>}
            </div>
            {/* Ajánlat neve */}
            <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}30` }}>
              <span style={labelStyle}>Ajánlat neve</span>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="Ajánlat neve…"
                style={{ ...monoVal, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {/* Megrendelő */}
            <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}30` }}>
              <span style={labelStyle}>Megrendelő</span>
              <input value={editClient} onChange={e => setEditClient(e.target.value)}
                placeholder="Ügyfél neve…"
                style={{ ...monoVal, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {/* Óradíj */}
            <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}30` }}>
              <span style={labelStyle}>Óradíj</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" value={editRate} onChange={e => setEditRate(e.target.value === '' ? '' : Number(e.target.value))}
                  min={0} step={500}
                  style={{ ...monoVal, width: 100, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Ft/ó</span>
              </div>
            </div>
            {/* Árrés */}
            <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}30` }}>
              <span style={labelStyle}>Árrés</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" value={editMarkup} onChange={e => setEditMarkup(e.target.value === '' ? '' : Number(e.target.value))}
                  min={0} max={100} step={1}
                  style={{ ...monoVal, width: 70, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>%</span>
              </div>
            </div>
            {/* Read-only fields */}
            {[
              ['Dátum',       new Date(quote.createdAt || Date.now()).toLocaleDateString('hu-HU')],
              ['Ajánlat ID',  quote.id],
              ['ÁFA kulcs',   `${vatPct}%`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}30` }}>
                <span style={labelStyle}>{k}</span>
                <span style={monoVal}>{v}</span>
              </div>
            ))}
            {/* Save button */}
            <button onClick={handleMetaSave} disabled={!isDirty}
              style={{
                width: '100%', padding: '9px', borderRadius: 8, cursor: isDirty ? 'pointer' : 'default',
                background: isDirty ? C.accent : C.bg, border: `1px solid ${isDirty ? C.accent : C.border}`,
                color: isDirty ? '#09090B' : C.muted,
                fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                opacity: isDirty ? 1 : 0.5, transition: 'all 0.15s',
              }}>
              {isDirty ? '💾 Mentés' : '✓ Mentve'}
            </button>
          </div>

          {/* Status card */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 12 }}>Státusz</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {statuses.map(s => {
                const active = quote.status === s
                const col = statusColors[s]
                return (
                  <button key={s} onClick={() => onStatusChange(quote.id, s)} style={{
                    padding: '9px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: active ? col + '18' : C.bg,
                    border: `1px solid ${active ? col + '60' : C.border}`,
                    color: active ? col : C.textSub,
                    fontFamily: 'Syne', fontWeight: active ? 800 : 600, fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? col : C.border, flexShrink: 0 }} />
                    {statusLabels[s]}
                    {active && <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 9, opacity: 0.7 }}>✓ aktív</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* PDF export card */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 4 }}>PDF Árajánlat</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 14 }}>Részletezési szint</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
              {PDF_LEVELS.map(lvl => (
                <button key={lvl.key} onClick={() => setPdfLevel(lvl.key)} style={{
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  background: pdfLevel === lvl.key ? C.accentDim : C.bg,
                  border: `1px solid ${pdfLevel === lvl.key ? C.accentBorder : C.border}`,
                  color: pdfLevel === lvl.key ? C.accent : C.textSub,
                  fontFamily: 'Syne', fontWeight: 700, fontSize: 11, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>{lvl.icon}</span>
                  {lvl.label}
                  {pdfLevel === lvl.key && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 9, opacity: 0.6 }}>✓</span>
                  )}
                </button>
              ))}
            </div>

            {/* Live content preview */}
            <PdfPreview level={pdfLevel} />

            <button onClick={handlePdf} disabled={pdfGenerating} style={{
              width: '100%', padding: '11px', borderRadius: 9, cursor: pdfGenerating ? 'wait' : 'pointer',
              background: pdfGenerating ? C.accentDim : C.accent,
              border: 'none', color: '#09090B',
              fontFamily: 'Syne', fontWeight: 800, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              opacity: pdfGenerating ? 0.7 : 1, transition: 'all 0.15s',
            }}>
              {pdfGenerating ? '⏳ Generálás...' : '📄 PDF letöltése'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── ItemsGroup ───────────────────────────────────────────────────────────────
function ItemsGroup({ title, count, accentColor, items, renderRow }) {
  const [open, setOpen] = useState(true)
  const headers = ['Megnevezés', 'Mennyiség', 'Egységár', 'Munkaóra', 'Összesen']
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: open ? `1px solid ${C.border}` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 3, height: 18, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 14, color: C.text }}>{title}</span>
          <span style={{
            fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: '2px 8px',
          }}>{count} tétel</span>
        </div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {headers.map((h, i) => (
                  <th key={h} style={{
                    padding: '9px 16px', fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
                    textAlign: i === 0 ? 'left' : 'right', fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: `1px solid ${C.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const cells = renderRow(item)
                return (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${C.border}`,
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {cells.map((cell, ci) => (
                      <td key={ci} style={{
                        padding: '11px 16px',
                        textAlign: ci === 0 ? 'left' : 'right',
                        ...(ci === 0
                          ? { fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }
                          : { fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }
                        ),
                      }}>{cell}</td>
                    ))}
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
  const [activeTrade, setActiveTrade] = useState(null) // which trade section is active
  const [settings, setSettings] = useState(loadSettings)
  const [materials, setMaterials] = useState(loadMaterials)
  const [quotes, setQuotes] = useState(loadQuotes)
  const [viewingQuote, setViewingQuote] = useState(null)

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

  // ── Legacy route redirects → projektek ──────────────────────────────────────
  useEffect(() => {
    if (page === 'plans' || page === 'new-quote') setPage('projektek')
  }, [page])

  // ── Orphan plan migration (once, on mount) ────────────────────────────────
  useEffect(() => {
    const orphans = loadPlans().filter(p => !p.projectId)
    if (orphans.length === 0) return
    // Check if "Importált tervek" project already exists
    const existing = loadProjects().find(p => p.name === 'Importált tervek')
    const projectId = existing ? existing.id : generateProjectId()
    if (!existing) {
      saveProject({ id: projectId, name: 'Importált tervek', createdAt: new Date().toISOString() })
    }
    orphans.forEach(p => updatePlanMeta(p.id, { projectId }))
    console.log(`[App] Migrated ${orphans.length} orphan plan(s) → "Importált tervek" project (${projectId})`)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    setSession(null)
    setUserEmail('')
    setSubStatus({ plan: 'free', active: false })
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
      projektek: 'Projektek', 'projektek-workspace': 'Projektek',
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
        // Data is safe in localStorage — remote sync will retry on next save
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
    const quote = {
      id:             generateQuoteId(),
      projectName:    displayName,
      project_name:   displayName,
      name:           displayName,
      clientName:     '',
      client_name:    '',
      createdAt:      new Date().toISOString(),
      created_at:     new Date().toISOString(),
      status:         'draft',
      gross:          Math.round(p.total),
      totalMaterials: Math.round(p.materialCost),
      totalLabor:     Math.round(p.laborCost),
      totalHours:     p.laborHours,
      summary:        { grandTotal: Math.round(p.total), totalWorkHours: p.laborHours },
      pricingData:    { hourlyRate: meta.calcHourlyRate || 9000, markup_pct: meta.calcMarkup || 0 },
      items:          meta.calcPricingLines,
      assemblySummary: meta.calcAssemblySummary || [],
      source:         'plan-takeoff',
      fileName:       meta.fileName || meta.name,
      planId:         pid,
    }
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
      })
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
  }

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
      if (e.key.includes('quotes')) setQuotes(loadQuotes())
      if (e.key.includes('settings')) setSettings(loadSettings())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const sidebarW = 220
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {showAuth && <AuthModal onAuth={() => setShowAuth(false)} />}
      <Sidebar
        active={activeTrade ? `${page}-${activeTrade}` : page}
        activeTrade={activeTrade}
        onNavigate={handleNavigate}
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
              {viewingQuote ? viewingQuote.projectName : getPageTitle()}
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
            <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
              {viewingQuote && page === 'quotes' ? (
                <QuoteView quote={viewingQuote} settings={settings} onBack={() => setViewingQuote(null)}
                  onStatusChange={handleStatusChange} onSaveQuote={handleSaveQuote} />
              ) : page === 'dashboard' ? (
                <Dashboard quotes={quotes} settings={settings}
                  onNavigate={p => { setViewingQuote(null); setPage(p) }}
                  onOpenQuote={q => { setViewingQuote(q); setPage('quotes') }} />
              ) : page === 'quotes' ? (
                <Quotes quotes={quotes} onQuotesChange={handleQuotesChange}
                  onNavigate={p => setPage(p)}
                  onOpenQuote={q => { setViewingQuote(q); setPage('quotes') }} />
              ) : page === 'work-items' ? (
                <WorkItems workItems={workItems} onWorkItemsChange={wis => { setWorkItems(wis) }} activeTrade={activeTrade} />
              ) : page === 'materials' ? (
                <MaterialsPage materials={materials} onMaterialsChange={m => { setMaterials(m) }} activeTrade={activeTrade} />
              ) : page === 'projektek' ? (
                <ProjektekPage
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
                <AssembliesPage activeTrade={activeTrade} />
              ) : page === 'settings' ? (
                <Settings settings={settings} materials={materials}
                  onSettingsChange={handleSettingsChange}
                  onMaterialsChange={m => { setMaterials(m) }} />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ── Felmérés modal panels ─────────────────────────────────────────── */}
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
                showToast('📄', 'Nincs tervrajz a projektben — tölts fel PDF-et a detektáláshoz.')
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
