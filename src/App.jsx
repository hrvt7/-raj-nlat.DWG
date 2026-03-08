import React, { useState, useRef, useCallback, useEffect } from 'react'
import Landing from './Landing.jsx'
import { generatePdf } from './utils/generatePdf.js'
import { exportBOM, generateBOMRows } from './utils/bomExport.js'
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
import { generateProjectId, saveProject, loadProjects, getProject } from './data/projectStore.js'
import { Button, Badge, Input, Select, StatCard, Table, QuoteStatusBadge, fmt, fmtM } from './components/ui.jsx'
import SuccessPage from './pages/Success.jsx'
import TakeoffWorkspace from './components/TakeoffWorkspace.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { OUTPUT_MODE_INCLEXCL, GROUP_BY_OPTIONS, GROUP_BY_LABELS, SYSTEM_GROUP_LABELS, groupItemsBySystem, groupItemsByFloor, resolveItemSystemType } from './data/quoteDefaults.js'

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

// ─── Customer-facing notes per outputMode ─────────────────────────────────────
const OUTPUT_MODE_NOTES = {
  combined: null,
  labor_only: 'Az ajánlat kizárólag a szerelési munkadíjat tartalmazza. Az anyagköltség nem része az ajánlatnak.',
  split_material_labor: 'Az ajánlat az anyag- és munkadíj költségeket külön bontásban tartalmazza.',
}

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
function QuoteView({ quote, settings, onBack, onStatusChange, onSaveQuote }) {
  const statuses = ['draft', 'sent', 'won', 'lost']
  const statusLabels = { draft: 'Piszkozat', sent: 'Elküldve', won: 'Nyertes', lost: 'Elveszett' }
  const statusColors = { draft: C.muted, sent: C.blue, won: C.accent, lost: C.red }
  const [pdfLevel, setPdfLevel] = useState('summary')
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [outputMode, setOutputMode] = useState(quote.outputMode || 'combined')
  const [groupBy, setGroupBy] = useState(quote.groupBy || 'none')

  // ── Editable meta state ────────────────────────────────────────────────────
  const [editName, setEditName] = useState(quote.projectName || '')
  const [editClient, setEditClient] = useState(quote.clientName || '')
  const [editRate, setEditRate] = useState(Number(quote.pricingData?.hourlyRate) || 9000)
  const [editMarkup, setEditMarkup] = useState(((quote.pricingData?.markup_pct) || 0) * 100)
  const [editInclusions, setEditInclusions] = useState(quote.inclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.inclusions ?? '')
  const [editExclusions, setEditExclusions] = useState(quote.exclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.exclusions ?? '')
  const [editValidity, setEditValidity] = useState(quote.validityText ?? '')
  const [editPaymentTerms, setEditPaymentTerms] = useState(quote.paymentTermsText ?? '')

  // ── Sync local state when quote prop changes (e.g. different quote opened, or after save) ──
  const prevQuoteRef = useRef(quote.id)
  useEffect(() => {
    if (quote.id !== prevQuoteRef.current) {
      setEditName(quote.projectName || '')
      setEditClient(quote.clientName || '')
      setEditRate(Number(quote.pricingData?.hourlyRate) || 9000)
      setEditMarkup(((quote.pricingData?.markup_pct) || 0) * 100)
      setOutputMode(quote.outputMode || 'combined')
      setGroupBy(quote.groupBy || 'none')
      setEditInclusions(quote.inclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.inclusions ?? '')
      setEditExclusions(quote.exclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.exclusions ?? '')
      setEditValidity(quote.validityText ?? '')
      setEditPaymentTerms(quote.paymentTermsText ?? '')
      prevQuoteRef.current = quote.id
    }
  }, [quote.id, quote.projectName, quote.clientName, quote.pricingData?.hourlyRate, quote.pricingData?.markup_pct, quote.outputMode])

  // ── Dirty check (normalized numeric comparison) ────────────────────────────
  const isDirty = editName !== (quote.projectName || '')
    || editClient !== (quote.clientName || '')
    || Number(editRate) !== (Number(quote.pricingData?.hourlyRate) || 9000)
    || Math.abs(Number(editMarkup) - ((quote.pricingData?.markup_pct || 0) * 100)) > 0.001
    || outputMode !== (quote.outputMode || 'combined')
    || groupBy !== (quote.groupBy || 'none')
    || editInclusions !== (quote.inclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.inclusions ?? '')
    || editExclusions !== (quote.exclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.exclusions ?? '')
    || editValidity !== (quote.validityText ?? '')
    || editPaymentTerms !== (quote.paymentTermsText ?? '')

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
      outputMode,
      groupBy,
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
      inclusions: editInclusions,
      exclusions: editExclusions,
      validityText: editValidity,
      paymentTermsText: editPaymentTerms,
      updatedAt: new Date().toISOString(),
    }
    onSaveQuote(updated)
  }

  const handlePdf = () => {
    setPdfGenerating(true)
    // Build a live quote snapshot for PDF so it uses current edits (even unsaved)
    const liveQuote = {
      ...quote,
      outputMode,
      groupBy,
      projectName: editName, project_name: editName, name: editName,
      clientName: editClient, client_name: editClient,
      gross: net, totalLabor: newTotalLabor,
      pricingData: { ...quote.pricingData, hourlyRate: Number(editRate), markup_pct: Number(editMarkup) / 100 },
      inclusions: editInclusions,
      exclusions: editExclusions,
      validityText: editValidity,
      paymentTermsText: editPaymentTerms,
    }
    try { generatePdf(liveQuote, settings, pdfLevel, outputMode, groupBy) }
    finally { setTimeout(() => setPdfGenerating(false), 1200) }
  }

  // Separate items by type for the grouped table
  const matItems   = (quote.items || []).filter(i => i.type === 'material' || i.type === 'cable')
  const laborItems = (quote.items || []).filter(i => i.type === 'labor')

  // ── Display values per outputMode (internal data untouched) ──────────────
  const displayNet   = outputMode === 'labor_only' ? newTotalLabor + Math.round(newTotalLabor * (Number(editMarkup) / 100)) : net
  const displayVat   = Math.round(displayNet * vatPct / 100)
  const displayGross = displayNet + displayVat

  // ── BOM rows (memoised — only recompute when items change) ──────────────
  const bomRows = React.useMemo(() => generateBOMRows(quote), [quote.items])
  const hasBom = bomRows.length > 0

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
      <style>{`
        .kpi-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0,229,160,0.07), 0 1px 6px rgba(0,0,0,0.25);
          border-color: rgba(255,255,255,0.12) !important;
        }
        .kpi-card-hero:hover {
          box-shadow: 0 4px 24px rgba(0,229,160,0.13), 0 1px 6px rgba(0,0,0,0.25);
        }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {/* Gross — accent hero card */}
        <div className="kpi-card kpi-card-hero" style={{
          background: `linear-gradient(135deg, ${C.accent}18, ${C.blue}0a)`,
          border: `1px solid ${C.accent}40`, borderRadius: 12, padding: '18px 20px', gridColumn: 'span 1',
        }}>
          <span style={labelStyle}>{outputMode === 'labor_only' ? 'Bruttó munkadíj összeg' : 'Bruttó végösszeg'}</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: C.accent, lineHeight: 1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span>{fmt(displayGross)}</span>
            <span style={{ fontSize: 16, fontWeight: 700, opacity: 0.8 }}>Ft</span>
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>
            {outputMode === 'labor_only' ? 'Nettó munkadíj' : 'Nettó'} {fmt(displayNet)} + ÁFA {vatPct}%
          </div>
        </div>
        {/* Materials — hidden in labor_only */}
        {outputMode !== 'labor_only' && (
          <div className="kpi-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
            <span style={labelStyle}>Anyagköltség (nettó)</span>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.text, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span>{fmt(Math.round(quote.totalMaterials || 0))}</span>
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>Ft</span>
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>nettó anyag összesen</div>
          </div>
        )}
        {/* Labor */}
        <div className="kpi-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>{outputMode === 'labor_only' ? 'Szerelési munkadíj (nettó)' : 'Munkadíj (nettó)'}</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.blue, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span>{fmt(newTotalLabor)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>Ft</span>
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>nettó munkadíj összesen</div>
        </div>
        {/* Hours */}
        <div className="kpi-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>Munkaóra</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.yellow, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span>{(quote.totalHours || 0).toFixed(1)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>ó</span>
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>{fmt(Number(editRate))} Ft/ó óradíj</div>
        </div>
      </div>

      {/* ── OutputMode customer-facing note ─────────────────────────────── */}
      {OUTPUT_MODE_NOTES[outputMode] && (
        <div style={{
          background: `${C.blue}0a`, border: `1px solid ${C.blue}25`,
          borderRadius: 10, padding: '12px 16px',
          fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.55,
        }}>
          {OUTPUT_MODE_NOTES[outputMode]}
        </div>
      )}

      {/* ── Controls card grid (5 cards) ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>

        {/* Card A — Ajánlat mód (outputMode) */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 2 }}>Ajánlat mód</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {OUTPUT_MODES.map(mode => (
              <button key={mode.key} onClick={() => setOutputMode(mode.key)} style={{
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: outputMode === mode.key ? 'rgba(76,201,240,0.10)' : C.bg,
                border: `1px solid ${outputMode === mode.key ? 'rgba(76,201,240,0.30)' : C.border}`,
                color: outputMode === mode.key ? C.blue : C.textSub,
                fontFamily: 'Syne', fontWeight: 700, fontSize: 11, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {mode.label}
                {outputMode === mode.key && (
                  <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 9, opacity: 0.6 }}>&#10003;</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Card B — PDF Export */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 2 }}>PDF Export</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
                  <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 9, opacity: 0.6 }}>&#10003;</span>
                )}
              </button>
            ))}
          </div>
          <button onClick={handlePdf} disabled={pdfGenerating} style={{
            width: '100%', padding: '10px', borderRadius: 9, cursor: pdfGenerating ? 'wait' : 'pointer',
            background: pdfGenerating ? C.accentDim : C.accent,
            border: 'none', color: '#09090B',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            opacity: pdfGenerating ? 0.7 : 1, transition: 'all 0.15s', marginTop: 'auto',
          }}>
            {pdfGenerating ? 'Generálás...' : 'PDF letöltése'}
          </button>
        </div>

        {/* Card C — BOM */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 2 }}>Anyagjegyzék (BOM)</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
            Belső anyagjegyzék — minden anyag- és kábeltétel, outputMode-tól függetlenül.
          </div>
          {hasBom && (
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>
              {bomRows.length} aggregált tétel
            </div>
          )}
          <button
            onClick={() => exportBOM(quote)}
            disabled={!hasBom}
            style={{
              width: '100%', padding: '10px', borderRadius: 9,
              cursor: hasBom ? 'pointer' : 'not-allowed',
              background: hasBom ? C.yellow : C.bgHover,
              border: 'none', color: hasBom ? '#09090B' : C.muted,
              fontFamily: 'Syne', fontWeight: 800, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              opacity: hasBom ? 1 : 0.5, transition: 'all 0.15s', marginTop: 'auto',
            }}
          >
            {hasBom ? 'CSV letöltése' : 'Nincs anyagtétel'}
          </button>
        </div>

        {/* Card D — Státusz */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 2 }}>Státusz</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {statuses.map(s => {
              const active = quote.status === s
              const col = statusColors[s]
              return (
                <button key={s} onClick={() => onStatusChange(quote.id, s)} style={{
                  padding: '7px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  background: active ? col + '18' : C.bg,
                  border: `1px solid ${active ? col + '60' : C.border}`,
                  color: active ? col : C.textSub,
                  fontFamily: 'Syne', fontWeight: active ? 800 : 600, fontSize: 11,
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? col : C.border, flexShrink: 0 }} />
                  {statusLabels[s]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Card E — Csoportosítás */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 2 }}>Csoportosítás</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {GROUP_BY_OPTIONS.map(opt => (
              <button key={opt} onClick={() => setGroupBy(opt)} style={{
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: groupBy === opt ? 'rgba(255,209,102,0.10)' : C.bg,
                border: `1px solid ${groupBy === opt ? 'rgba(255,209,102,0.30)' : C.border}`,
                color: groupBy === opt ? C.yellow : C.textSub,
                fontFamily: 'Syne', fontWeight: 700, fontSize: 11, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {GROUP_BY_LABELS[opt]}
                {groupBy === opt && (
                  <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 9, opacity: 0.6 }}>&#10003;</span>
                )}
              </button>
            ))}
          </div>
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
                <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 13, color: C.text }}>{outputMode === 'labor_only' ? 'Munkadíj összesítő' : 'Munkák összesítő'}</span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{quote.assemblySummary.length} munkacsoport</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {(outputMode === 'split_material_labor'
                      ? ['Tevékenység', 'db', 'Anyag (nettó)', 'Munkadíj (nettó)', 'Összesen (nettó)']
                      : ['Tevékenység', 'db', outputMode === 'labor_only' ? 'Munkadíj (nettó)' : 'Összeg (nettó)']
                    ).map((h, i) => (
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
                  {quote.assemblySummary.map((a, i) => {
                    const matCost   = Math.round(a.materialCost || 0)
                    const laborCost = Math.round(a.laborCost || (a.totalPrice || 0) - matCost)
                    return (
                      <tr key={a.id || i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>{a.name}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 11, color: C.muted, textAlign: 'right' }}>{a.qty}</td>
                        {outputMode === 'split_material_labor' ? (
                          <>
                            <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.muted, textAlign: 'right' }}>{fmt(matCost)} Ft</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.blue, textAlign: 'right' }}>{fmt(laborCost)} Ft</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 500, textAlign: 'right' }}>{fmt(a.totalPrice || 0)} Ft</td>
                          </>
                        ) : (
                          <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: outputMode === 'labor_only' ? C.blue : C.text, fontWeight: 500, textAlign: 'right' }}>
                            {fmt(outputMode === 'labor_only' ? laborCost : (a.totalPrice || 0))} Ft
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Items render: flat (none) or grouped (system/floor) ── */}
          {(groupBy === 'system' || groupBy === 'floor') ? (
            // ── Grouped render (system or floor) ──
            (() => {
              const _grpColor = groupBy === 'floor' ? C.accent : C.yellow
              const _grpBg = groupBy === 'floor' ? 'rgba(0,229,160,0.06)' : 'rgba(255,209,102,0.06)'
              const _grpBorder = groupBy === 'floor' ? 'rgba(0,229,160,0.15)' : 'rgba(255,209,102,0.15)'
              return (groupBy === 'system' ? groupItemsBySystem : groupItemsByFloor)(quote.items || []).map(group => {
              const grpLabor = group.items.filter(i => i.type === 'labor')
              const grpMat   = group.items.filter(i => i.type === 'material' || i.type === 'cable')
              const grpLaborTotal  = grpLabor.reduce((s, i) => s + (i.hours || 0) * Number(editRate), 0)
              const grpMatTotal    = grpMat.reduce((s, i) => s + (i.unitPrice || 0) * i.qty, 0)
              const grpTotal       = outputMode === 'labor_only' ? grpLaborTotal : (grpLaborTotal + grpMatTotal)
              return (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Group header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', background: _grpBg,
                    border: `1px solid ${_grpBorder}`, borderRadius: 10,
                  }}>
                    <span style={{ width: 4, height: 20, borderRadius: 2, background: _grpColor, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 13, color: _grpColor }}>{group.label}</span>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{group.items.length} tétel</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono', fontSize: 12, fontWeight: 600, color: C.text }}>
                      {fmt(Math.round(grpTotal))} Ft
                    </span>
                  </div>
                  {/* Labor items in this group */}
                  {grpLabor.length > 0 && (
                    <ItemsGroup
                      title={`${group.label} · Munka`} count={grpLabor.length} accentColor={C.blue}
                      items={grpLabor}
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
                  {/* Material items in this group */}
                  {outputMode !== 'labor_only' && grpMat.length > 0 && (
                    <ItemsGroup
                      title={`${group.label} · Anyagok`} count={grpMat.length} accentColor={C.text}
                      items={grpMat}
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
              )
            })
            })()
          ) : (
            // ── Flat (no grouping) ──
            <>
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

          {/* Material items — second (hidden in labor_only mode) */}
          {outputMode !== 'labor_only' && matItems.length > 0 && (
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
            </>
          )}

          {/* ── Inclusions / Exclusions block ───────────────────────────── */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 8 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.accent }}>✓</span> Tartalom és kizárások
            </div>
            {/* Inclusions */}
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Tartalmazza
              </span>
              <textarea
                value={editInclusions} onChange={e => setEditInclusions(e.target.value)}
                placeholder="Pl. Szerelési munkadíj, vezetékezés, …"
                rows={3}
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'Inter', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {/* Exclusions */}
            <div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Nem tartalmazza
              </span>
              <textarea
                value={editExclusions} onChange={e => setEditExclusions(e.target.value)}
                placeholder="Pl. Az anyagköltség nem része az ajánlatnak, …"
                rows={3}
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'Inter', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* ── Validity & Payment Terms block ──────────────────────────── */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 8 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 12, color: C.text, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.blue }}>⏱</span> Érvényesség és feltételek
            </div>
            {/* Validity */}
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Érvényesség
              </span>
              <textarea
                value={editValidity} onChange={e => setEditValidity(e.target.value)}
                placeholder="Pl. Az ajánlat 30 napig érvényes…"
                rows={2}
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'Inter', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {/* Payment Terms */}
            <div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Fizetési feltételek
              </span>
              <textarea
                value={editPaymentTerms} onChange={e => setEditPaymentTerms(e.target.value)}
                placeholder="Pl. Számla ellenében, 8 napon belül…"
                rows={2}
                style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontFamily: 'Inter', fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

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
              {isDirty ? 'Mentés' : '✓ Mentve'}
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
            background: loading ? C.accentDim : C.accent, color: '#09090B',
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
      saveProject({ id: projectId, name: 'Importált tervek', defaultQuoteOutputMode: 'combined', createdAt: new Date().toISOString() })
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
    // ── Resolve project-level default output mode ──────────────────
    const planPrjDefault = meta.projectId ? (getProject(meta.projectId)?.defaultQuoteOutputMode || 'combined') : 'combined'

    const planDefaults = OUTPUT_MODE_INCLEXCL[planPrjDefault] || OUTPUT_MODE_INCLEXCL.combined
    const qs = loadSettings().quote
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
      outputMode:     planPrjDefault,
      groupBy:        'none',
      inclusions:     planDefaults.inclusions || qs.default_inclusions,
      exclusions:     planDefaults.exclusions || qs.default_exclusions,
      validityText:   qs.default_validity_text,
      paymentTermsText: qs.default_payment_terms_text,
      gross:          Math.round(p.total),
      totalMaterials: Math.round(p.materialCost),
      totalLabor:     Math.round(p.laborCost),
      totalHours:     p.laborHours,
      summary:        { grandTotal: Math.round(p.total), totalWorkHours: p.laborHours },
      pricingData:    { hourlyRate: meta.calcHourlyRate || 9000, markup_pct: meta.calcMarkup || 0 },
      items:          (meta.calcPricingLines || []).map(item => ({
        ...item,
        systemType: item.systemType || 'general',
        sourcePlanSystemType: item.sourcePlanSystemType || meta.inferredMeta?.systemType || 'general',
        sourcePlanFloor: item.sourcePlanFloor || meta.inferredMeta?.floor || null,
        sourcePlanFloorLabel: item.sourcePlanFloorLabel || meta.inferredMeta?.floorLabel || null,
      })),
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

  const SIDEBAR_FULL = 220
  const SIDEBAR_COLLAPSED = 60
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sidebarW = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_FULL
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {showAuth && <AuthModal onAuth={() => setShowAuth(false)} />}
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
            <div style={{ color: C.text, fontWeight: 600, fontSize: isMobile ? 14 : 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {viewingQuote
                ? viewingQuote.projectName
                : page === 'dashboard'
                  ? (settings?.company?.name || '')
                  : getPageTitle()}
            </div>
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
