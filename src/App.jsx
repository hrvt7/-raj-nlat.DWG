import React, { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react'
import Landing from './Landing.jsx'
import { supabase, supabaseConfigured, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword, onAuthChange, saveQuoteRemote, saveSettingsRemote, saveAssembliesRemote, saveMaterialsRemote, saveWorkItemsRemote, saveProjectsRemote, savePlansRemote, loadSettingsRemote, loadQuotesRemote, loadAssembliesRemote, loadMaterialsRemote, loadWorkItemsRemote, loadProjectsRemote, loadPlansRemote, createQuoteShare } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'

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
import { getPlanFile, getPlanMeta, getPlansByProject, loadPlans, updatePlanMeta, saveAllPlansMeta } from './data/planStore.js'
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
function QuoteView({ quote, settings, onBack, onStatusChange, onSaveQuote }) {
  const toast = useToast()
  const statuses = ['draft', 'sent', 'won', 'lost', 'expired']
  const statusLabels = { draft: 'Piszkozat', sent: 'Elküldve', won: 'Nyertes', lost: 'Elveszett', expired: 'Lejárt' }
  const statusColors = { draft: C.muted, sent: C.blue, won: C.accent, lost: C.red, expired: C.yellow }
  const [pdfLevel, setPdfLevel] = useState('summary')
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [outputMode, setOutputMode] = useState(quote.outputMode || 'combined')
  const [groupBy, setGroupBy] = useState(quote.groupBy || 'none')

  // ── Editable meta state ────────────────────────────────────────────────────
  const [editName, setEditName] = useState(quote.projectName || '')
  const [editClient, setEditClient] = useState(quote.clientName || '')
  const [editClientAddr, setEditClientAddr] = useState(quote.clientAddress || '')
  const [editClientTax, setEditClientTax] = useState(quote.clientTaxNumber || '')
  const [editClientEmail, setEditClientEmail] = useState(quote.clientEmail || '')
  const [editProjectAddr, setEditProjectAddr] = useState(quote.projectAddress || '')
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
      setEditClientAddr(quote.clientAddress || '')
      setEditClientTax(quote.clientTaxNumber || '')
      setEditClientEmail(quote.clientEmail || '')
      setEditProjectAddr(quote.projectAddress || '')
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

  // ── Derived pricing from editable rate + markup ────────────────────────────
  const vatPct = Number(settings?.labor?.vat_percent) || 27
  // Guard: empty input falls back to stored rate, then 9000 — prevents silent zero labor
  const effectiveRate = editRate === '' ? (Number(quote.pricingData?.hourlyRate) || 9000) : Number(editRate)

  // ── Dirty check (normalized numeric comparison) ────────────────────────────
  const isDirty = editName !== (quote.projectName || '')
    || editClient !== (quote.clientName || '')
    || editClientAddr !== (quote.clientAddress || '')
    || editClientTax !== (quote.clientTaxNumber || '')
    || editClientEmail !== (quote.clientEmail || '')
    || editProjectAddr !== (quote.projectAddress || '')
    || effectiveRate !== (Number(quote.pricingData?.hourlyRate) || 9000)
    || Math.abs(Number(editMarkup) - ((quote.pricingData?.markup_pct || 0) * 100)) > 0.001
    || outputMode !== (quote.outputMode || 'combined')
    || groupBy !== (quote.groupBy || 'none')
    || editInclusions !== (quote.inclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.inclusions ?? '')
    || editExclusions !== (quote.exclusions ?? OUTPUT_MODE_INCLEXCL[quote.outputMode || 'combined']?.exclusions ?? '')
    || editValidity !== (quote.validityText ?? '')
    || editPaymentTerms !== (quote.paymentTermsText ?? '')
  // ── Navigation guard: warn before leaving with unsaved changes ───────────
  useEffect(() => {
    if (!isDirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const totalHours = quote.totalHours || 0
  const totalMaterials = Math.round(quote.totalMaterials || 0)
  const cableCost = Math.round(quote.cableCost || 0)
  const newTotalLabor = Math.round(totalHours * effectiveRate)
  const newSubtotal = totalMaterials + newTotalLabor + cableCost
  const markupType = quote.pricingData?.markup_type || 'markup'
  const markupPctRaw = Number(editMarkup) / 100
  let net
  if (markupType === 'margin') {
    net = markupPctRaw >= 1 ? newSubtotal * 10 : Math.round(newSubtotal / (1 - markupPctRaw))
  } else {
    net = Math.round(newSubtotal * (1 + markupPctRaw))
  }
  if (!Number.isFinite(net)) net = newSubtotal
  const newMarkupAmount = net - newSubtotal
  // (Per-component gross values are provided by quoteDisplayTotals below,
  //  with proportional ÁFA allocation so they always sum to displayGross.)

  // ── Share link handler ─────────────────────────────────────────────────────
  const [shareLabel, setShareLabel] = useState('Link megosztása')
  const handleShare = async () => {
    if (!session) { toast.show('Bejelentkezés szükséges a link megosztáshoz.', 'error'); return }
    try {
      setShareLabel('Link generálása…')
      const companyData = {
        name: settings?.company?.name || '',
        email: settings?.company?.email || '',
        phone: settings?.company?.phone || '',
      }
      const token = await createQuoteShare(quote, companyData)
      const url = `${window.location.origin}/q/${token}`
      await navigator.clipboard.writeText(url)
      setShareLabel('✓ Link másolva')
      setTimeout(() => setShareLabel('Link megosztása'), 2200)
    } catch (err) {
      toast.show('Link generálás sikertelen: ' + err.message, 'error')
      setShareLabel('Link megosztása')
    }
  }

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
      clientAddress: editClientAddr,
      clientTaxNumber: editClientTax,
      clientEmail: editClientEmail,
      projectAddress: editProjectAddr,
      gross: net,
      totalLabor: newTotalLabor,
      summary: { ...quote.summary, grandTotal: net },
      pricingData: {
        ...quote.pricingData,
        hourlyRate: effectiveRate,
        markup_pct: Number(editMarkup) / 100,
      },
      inclusions: editInclusions,
      exclusions: editExclusions,
      validityText: editValidity,
      paymentTermsText: editPaymentTerms,
      updatedAt: new Date().toISOString(),
    }
    onSaveQuote(updated)
    toast.show('Ajánlat mentve', 'success')
  }

  const handlePdf = async () => {
    setPdfGenerating(true)

    // ── Acquire file handle IMMEDIATELY while user gesture is still valid ──
    // showSaveFilePicker must be called synchronously from the click handler
    // (before any await) so the browser trusts the user-activation gesture.
    let fileHandle = null
    const safeName = (editName || 'ajanlat').replace(/[<>:"/\\|?*]/g, '').trim().replace(/\s+/g, '_') || 'ajanlat'
    const dateStr = new Date().toISOString().slice(0, 10)
    const suggestedName = `${safeName}_${dateStr}.pdf`
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'PDF dokumentum', accept: { 'application/pdf': ['.pdf'] } }],
        })
      } catch (e) {
        if (e.name === 'AbortError') { setPdfGenerating(false); return } // user cancelled
        fileHandle = null // other error → fall through to anchor download
      }
    }

    // Build a live quote snapshot for PDF so it uses current edits (even unsaved)
    const liveQuote = {
      ...quote,
      outputMode,
      groupBy,
      projectName: editName, project_name: editName, name: editName,
      clientName: editClient, client_name: editClient,
      clientAddress: editClientAddr, clientTaxNumber: editClientTax, clientEmail: editClientEmail, projectAddress: editProjectAddr,
      gross: net, totalLabor: newTotalLabor,
      pricingData: { ...quote.pricingData, hourlyRate: effectiveRate, markup_pct: Number(editMarkup) / 100 },
      inclusions: editInclusions,
      exclusions: editExclusions,
      validityText: editValidity,
      paymentTermsText: editPaymentTerms,
    }
    try {
      const { generatePdf } = await import('./utils/generatePdf.js')
      await generatePdf(liveQuote, settings, pdfLevel, outputMode, groupBy, fileHandle)
    } catch (err) {
      console.error('[App] PDF generation failed:', err)
      toast.show('PDF generálás sikertelen. Kérjük próbáld újra.', 'error')
    } finally {
      setPdfGenerating(false)
    }
  }

  const markAs = (status, label) => {
    if (onStatusChange && quote.status !== status) {
      onStatusChange(quote.id, status)
      toast.show(label, 'success')
    }
  }
  const markAsSent = () => markAs('sent', 'Ajánlat elküldöttként jelölve')
  const markAsWon  = () => markAs('won',  'Ajánlat nyertesként jelölve')
  const markAsLost = () => markAs('lost', 'Ajánlat elveszettként jelölve')

  const handleEmail = async () => {
    const { buildMailtoUrl } = await import('./utils/generatePdf.js')
    const url = buildMailtoUrl({
      clientEmail: editClientEmail,
      clientName: editClient,
      projectName: editName,
      displayGross,
      companyName: settings?.company?.name || '',
      companyEmail: settings?.company?.email || '',
      companyPhone: settings?.company?.phone || '',
    })
    if (typeof window !== 'undefined') window.__lastMailtoUrl = url

    // Detect whether a mail client actually opened.
    // If the page loses focus/visibility within ~1.5 s the OS handed off to a
    // mail app → suppress the fallback.  Otherwise show a helpful toast.
    let opened = false
    const onLeave = () => { opened = true }
    window.addEventListener('blur', onLeave)
    document.addEventListener('visibilitychange', onLeave)

    window.location.href = url

    setTimeout(() => {
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('visibilitychange', onLeave)
      if (opened) {
        // Mail client appeared to open — prompt to mark as sent if still draft
        if (quote.status !== 'sent') {
          toast.show('Email kliens megnyitva — jelöld az ajánlatot elküldöttként, ha elküldted.', 'info')
        }
      } else {
        const to = (editClientEmail || '').trim()
        if (to && navigator.clipboard) {
          navigator.clipboard.writeText(to).then(() => {
            toast.show(`Nem nyílt meg email kliens. A címzett (${to}) a vágólapra másolva.`, 'warning')
          }).catch(() => {
            toast.show('Nem nyílt meg email kliens. Kérjük ellenőrizze az alapértelmezett levelező beállítást.', 'warning')
          })
        } else {
          toast.show('Nem nyílt meg email kliens. Kérjük ellenőrizze az alapértelmezett levelező beállítást.', 'warning')
        }
      }
    }, 1500)
  }

  const buildLiveQuoteHtml = async () => {
    const { buildQuoteHtml } = await import('./utils/generatePdf.js')
    const liveQuote = {
      ...quote,
      outputMode,
      groupBy,
      projectName: editName, project_name: editName, name: editName,
      clientName: editClient, client_name: editClient,
      clientAddress: editClientAddr, clientTaxNumber: editClientTax, clientEmail: editClientEmail, projectAddress: editProjectAddr,
      gross: net, totalLabor: newTotalLabor,
      pricingData: { ...quote.pricingData, hourlyRate: effectiveRate, markup_pct: Number(editMarkup) / 100 },
      inclusions: editInclusions,
      exclusions: editExclusions,
      validityText: editValidity,
      paymentTermsText: editPaymentTerms,
    }
    return buildQuoteHtml(liveQuote, settings, pdfLevel, outputMode, groupBy)
  }

  const handlePrint = async () => {
    const html = await buildLiveQuoteHtml()
    if (typeof window !== 'undefined') window.__lastPrintHtml = html
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html); w.document.close(); w.focus()
      // Wait for fonts to load in the popup before printing — prevents fallback font rendering
      const fontsReady = w.document.fonts?.ready || Promise.resolve()
      fontsReady.then(() => w.print()).catch(() => w.print())
    } else { alert('A böngésző blokkolta a felugró ablakot. Engedélyezd a popupokat ehhez az oldalhoz, majd próbáld újra.') }
  }

  const handlePreview = async () => {
    const html = await buildLiveQuoteHtml()
    if (typeof window !== 'undefined') window.__lastPreviewHtml = html
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html); w.document.close()
      // Hide content until fonts are ready so the user never sees fallback-font first paint
      w.document.body.style.visibility = 'hidden'
      const fontsReady = w.document.fonts?.ready || Promise.resolve()
      const fontTimeout = new Promise(r => setTimeout(r, 2000))
      Promise.race([fontsReady, fontTimeout])
        .then(() => { w.document.body.style.visibility = 'visible'; w.focus() })
        .catch(() => { w.document.body.style.visibility = 'visible'; w.focus() })
    } else { alert('A böngésző blokkolta a felugró ablakot. Engedélyezd a popupokat ehhez az oldalhoz, majd próbáld újra.') }
  }

  // Separate items by type for the grouped table
  const matItems   = (quote.items || []).filter(i => i.type === 'material' || i.type === 'cable')
  const laborItems = (quote.items || []).filter(i => i.type === 'labor')

  // ── Display values per outputMode (internal data untouched) ──────────────
  const { displayNet, displayGross, grossMaterials, grossLabor, grossMarkup, markupAmount } = quoteDisplayTotals({
    outputMode, totalLabor: newTotalLabor, totalMaterials, cableCost,
    markupPct: Number(editMarkup) / 100, markupType, vatPct,
  })

  // ── Markup visibility flag for internal KPI strip ──────────────────────────
  const hasMarkup = Number(editMarkup) > 0

  // ── BOM rows (memoised — only recompute when items change) ──────────────
  const bomRows = React.useMemo(() => generateBOMRows(quote), [quote.items])
  const hasBom = bomRows.length > 0

  // Label style reused throughout
  const labelStyle = { fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }
  const monoVal    = { fontFamily: 'DM Mono', fontSize: 13, color: C.text, fontWeight: 500 }
  const actionBase = { padding: '10px', borderRadius: 9, border: 'none', fontFamily: 'Syne', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', color: '#09090B' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Unsaved changes bar ──────────────────────────────────────────── */}
      {isDirty && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: `${C.accent}12`, backdropFilter: 'blur(12px)',
          border: `1px solid ${C.accent}40`, borderRadius: 10,
          padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent }}>
            Nem mentett módosítások
          </span>
          <button onClick={handleMetaSave} style={{
            padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: C.accent, color: '#09090B',
            fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
          }}>
            Mentés
          </button>
        </div>
      )}

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        {/* Gross — accent hero card */}
        <div className="kpi-card kpi-card-hero" style={{
          background: `linear-gradient(135deg, ${C.accent}18, ${C.blue}0a)`,
          border: `1px solid ${C.accent}40`, borderRadius: 12, padding: '18px 20px',
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
            <span style={labelStyle}>Anyagköltség (bruttó)</span>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.text, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span>{fmt(grossMaterials)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>Ft</span>
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>Nettó {fmt(totalMaterials)} + ÁFA {vatPct}%</div>
          </div>
        )}
        {/* Labor — pure munkadíj (internal auditable view) */}
        <div className="kpi-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>{outputMode === 'labor_only' ? 'Szerelési munkadíj (bruttó)' : 'Munkadíj (bruttó)'}</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.blue, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span>{fmt(grossLabor)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>Ft</span>
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>Nettó {fmt(newTotalLabor)} + ÁFA {vatPct}%</div>
        </div>
        {/* Árrés — separate internal KPI card, visible only when markup > 0 */}
        {hasMarkup && (
          <div className="kpi-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
            <span style={labelStyle}>Árrés ({editMarkup}%)</span>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: '#EF8354', whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span>{fmt(grossMarkup)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>Ft</span>
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>Nettó {fmt(markupAmount)} + ÁFA {vatPct}%</div>
          </div>
        )}
        {/* Hours */}
        <div className="kpi-card" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
          <span style={labelStyle}>Munkaóra</span>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.yellow, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span>{(quote.totalHours || 0).toFixed(1)}</span>
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6 }}>ó</span>
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 6 }}>{fmt(effectiveRate)} Ft/ó óradíj</div>
        </div>
      </div>

      {/* ── Controls card grid (5 cards) ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>

        {/* Card 1 — PDF Export */}
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
            ...actionBase, width: '100%', marginTop: 'auto',
            background: pdfGenerating ? C.accentDim : C.accent,
            cursor: pdfGenerating ? 'wait' : 'pointer',
            opacity: pdfGenerating ? 0.7 : 1,
          }}>
            {pdfGenerating ? 'Generálás...' : 'PDF letöltése'}
          </button>
        </div>

        {/* Card 2 — Anyagjegyzék (BOM) */}
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
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: hasBom ? 1 : 0.5, transition: 'all 0.15s', marginTop: 'auto',
            }}
          >
            {hasBom ? 'Anyagjegyzék letöltése' : 'Nincs anyagtétel'}
          </button>
        </div>

        {/* Card 3 — Ajánlat mód (outputMode) */}
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
          {outputMode === 'labor_only' && totalMaterials > 0 && (
            <div style={{ background: 'rgba(255,209,102,0.08)', border: '1px solid rgba(255,209,102,0.25)', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontFamily: 'DM Mono', fontSize: 10, color: C.yellow, lineHeight: 1.5 }}>
              Az anyagköltség ({fmt(totalMaterials)} Ft) nem jelenik meg az ajánlatban.
            </div>
          )}
        </div>

        {/* Card 4 — Csoportosítás */}
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

        {/* Card 5 — Státusz */}
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
                  {(quote.assemblySummary || []).map((a, i) => {
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
              const grpLaborTotal  = grpLabor.reduce((s, i) => s + (i.hours || 0) * effectiveRate, 0)
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
                        const total = (item.hours || 0) * effectiveRate
                        return [
                          item.name,
                          `${+(item.qty || 0).toFixed(2)} ${item.unit || ''}`,
                          `${fmt(effectiveRate)} Ft/ó`,
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
                const total = (item.hours || 0) * effectiveRate
                return [
                  item.name,
                  `${+(item.qty || 0).toFixed(2)} ${item.unit || ''}`,
                  `${fmt(effectiveRate)} Ft/ó`,
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
                style={{ ...monoVal, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
              <input value={editClientAddr} onChange={e => setEditClientAddr(e.target.value)}
                placeholder="Ügyfél címe…"
                style={{ ...monoVal, fontSize: 11, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
              <input value={editClientTax} onChange={e => setEditClientTax(e.target.value)}
                placeholder="Adószám…"
                style={{ ...monoVal, fontSize: 11, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
              <input value={editClientEmail} onChange={e => setEditClientEmail(e.target.value)}
                placeholder="Email cím…" type="email"
                style={{ ...monoVal, fontSize: 11, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {/* Projekt helyszíne */}
            <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}30` }}>
              <span style={labelStyle}>Projekt helyszíne</span>
              <input value={editProjectAddr} onChange={e => setEditProjectAddr(e.target.value)}
                placeholder="Helyszín címe…"
                style={{ ...monoVal, fontSize: 11, width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', outline: 'none', boxSizing: 'border-box' }} />
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
            <button data-testid="quote-save-btn" onClick={handleMetaSave} disabled={!isDirty}
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

          {/* ── Sidebar action buttons ─────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Export group */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Export</span>
              <button onClick={handlePreview} style={{
                ...actionBase, width: '100%', cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`, color: C.textSub,
              }}>
                PDF előnézet
              </button>
              <button onClick={handlePrint} style={{
                ...actionBase, width: '100%', cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`, color: C.textSub,
              }}>
                PDF nyomtatása
              </button>
            </div>

            {/* Send group */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Küldés</span>
              <button onClick={handleEmail} style={{
                ...actionBase, width: '100%', background: C.blue, cursor: 'pointer',
              }}>
                Email küldése
              </button>
              <button onClick={handleShare} style={{
                ...actionBase, width: '100%', cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.accent}60`, color: C.accent,
              }}>
                Link megosztása
              </button>
            </div>

            {/* Status group — contextual */}
            {(quote.status !== 'won' && quote.status !== 'lost') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Státusz</span>
                {quote.status !== 'sent' && (
                  <button onClick={markAsSent} style={{
                    ...actionBase, width: '100%', cursor: 'pointer',
                    background: 'transparent', border: `1px solid ${C.blue}`, color: C.blue,
                  }}>
                    Megjelölés elküldöttként
                  </button>
                )}
                {quote.status === 'sent' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button onClick={markAsWon} style={{
                      ...actionBase, cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${C.accent}`, color: C.accent,
                    }}>
                      Nyertes
                    </button>
                    <button onClick={markAsLost} style={{
                      ...actionBase, cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${C.red}`, color: C.red,
                    }}>
                      Elveszett
                    </button>
                  </div>
                )}
              </div>
            )}

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

    const settingsNeedsRecovery = isSettingsRecoverable()
    const quotesNeedsRecovery = isQuotesRecoverable()
    const assembliesNeedRecovery = isArrayRecoverable('takeoffpro_assemblies')
    const materialsNeedRecovery = isArrayRecoverable('takeoffpro_materials')
    const workItemsNeedRecovery = isArrayRecoverable('takeoffpro_work_items')
    const projectsNeedRecovery = isEnvelopeRecoverable('takeoffpro_projects_meta')
    const plansNeedRecovery = isEnvelopeRecoverable('takeoffpro_plans_meta')

    if (!settingsNeedsRecovery && !quotesNeedsRecovery &&
        !assembliesNeedRecovery && !materialsNeedRecovery && !workItemsNeedRecovery &&
        !projectsNeedRecovery && !plansNeedRecovery) return

    ;(async () => {
      try {
        if (settingsNeedsRecovery) {
          const remote = await loadSettingsRemote()
          if (remote) { saveSettings(remote); setSettings(loadSettings()) }
        }
        if (quotesNeedsRecovery) {
          const rows = await loadQuotesRemote()
          const mapped = (rows || []).map(r => r.pricing_data).filter(Boolean)
          if (mapped.length > 0) { saveQuotes(mapped); setQuotes(loadQuotes()) }
        }
        if (assembliesNeedRecovery) {
          const remote = await loadAssembliesRemote()
          if (Array.isArray(remote) && remote.length > 0) {
            saveAssemblies(remote); setAsmRev(r => r + 1)
          }
        }
        if (materialsNeedRecovery) {
          const remote = await loadMaterialsRemote()
          if (Array.isArray(remote) && remote.length > 0) {
            saveMaterials(remote); setMaterials(loadMaterials())
          }
        }
        if (workItemsNeedRecovery) {
          const remote = await loadWorkItemsRemote()
          if (Array.isArray(remote) && remote.length > 0) {
            saveWorkItems(remote); setWorkItems(loadWorkItems())
          }
        }
        if (projectsNeedRecovery) {
          const remote = await loadProjectsRemote()
          if (Array.isArray(remote) && remote.length > 0) {
            saveAllProjects(remote); setProjRev(r => r + 1)
          }
        }
        if (plansNeedRecovery) {
          const remote = await loadPlansRemote()
          if (Array.isArray(remote) && remote.length > 0) {
            saveAllPlansMeta(remote); setPlanRev(r => r + 1)
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
      ])
    } catch { /* best-effort sync before logout */ }
    await signOut()
    // Clear all local data to prevent leakage to next user
    const keysToKeep = ['takeoffpro_cookie_consent'] // preserve cookie consent
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith('takeoffpro_'))
    for (const k of allKeys) {
      if (!keysToKeep.includes(k)) localStorage.removeItem(k)
    }
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
    return () => window.removeEventListener('storage', handler)
  }, [])

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
                <QuoteView quote={viewingQuote} settings={settings} onBack={() => setViewingQuote(null)}
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
