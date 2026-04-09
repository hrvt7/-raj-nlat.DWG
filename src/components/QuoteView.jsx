// ─── QuoteView — Quote detail / edit / export component ──────────────────────
// Extracted from App.jsx for maintainability (1029 lines).

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { C, QuoteStatusBadge, fmt, useToast } from './ui.jsx'
import { quoteDisplayTotals } from '../utils/quoteDisplayTotals.js'
import { generateBOMRows, exportBOM } from '../utils/bomExport.js'
import { createQuoteShare } from '../supabase.js'
import { OUTPUT_MODE_INCLEXCL, OUTPUT_MODE_NOTES, GROUP_BY_OPTIONS, GROUP_BY_LABELS, groupItemsBySystem, groupItemsByFloor } from '../data/quoteDefaults.js'
import ManualRowEditor from './ManualRowEditor.jsx'
import { computeManualTotals, materializeManualRowsToItems } from '../utils/manualPricingRow.js'

const PDF_LEVELS = [
  { key: 'compact',  label: 'Tömör',       icon: '▣', desc: 'Összesítő, KPI-k, pénzügyi táblázat' },
  { key: 'summary',  label: 'Összesített',  icon: '▤', desc: '+ Munkacsoport-bontás' },
  { key: 'detailed', label: 'Részletes',    icon: '▦', desc: '+ Minden tétel, anyagok, munka' },
]

const OUTPUT_MODES = [
  { key: 'combined',              label: 'Teljes',                     desc: 'Anyag + munkadíj összesítve' },
  { key: 'labor_only',            label: 'Csak munkadíj',              desc: 'Csak munkadíj jelenik meg' },
  { key: 'split_material_labor',  label: 'Anyag + munkadíj külön',     desc: 'Anyag és munkadíj külön bontásban' },
]

export default function QuoteView({ quote, settings, session, onBack, onStatusChange, onSaveQuote }) {
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

  // ── Manual pricing rows state (only active for pricingMode === 'manual') ──
  const isManualMode = (quote.pricingMode || 'assembly') === 'manual'
  const [manualRows, setManualRows] = useState(quote.manualRows || [])

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
      setManualRows(quote.manualRows || [])
      prevQuoteRef.current = quote.id
    }
  }, [quote.id, quote.projectName, quote.clientName, quote.pricingData?.hourlyRate, quote.pricingData?.markup_pct, quote.outputMode])

  // ── Derived pricing from editable rate + markup ────────────────────────────
  const vatPct = quote.vatPercent != null ? Number(quote.vatPercent) : (settings?.labor?.vat_percent != null ? Number(settings.labor.vat_percent) : 27)
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
    || (isManualMode && JSON.stringify(manualRows) !== JSON.stringify(quote.manualRows || []))
  // ── Navigation guard: warn before leaving with unsaved changes ───────────
  useEffect(() => {
    if (!isDirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ── Totals: manual mode computes from manualRows, assembly mode from stored snapshot ──
  const _manualTotals = isManualMode ? computeManualTotals(manualRows, effectiveRate) : null
  const totalHours = isManualMode ? (_manualTotals.totalHours || 0) : (quote.totalHours || 0)
  const totalMaterials = isManualMode ? _manualTotals.totalMaterials : Math.round(quote.totalMaterials || 0)
  const cableCost = isManualMode ? 0 : Math.round(quote.cableCost || 0)
  const newTotalLabor = isManualMode ? _manualTotals.totalLabor : Math.round(totalHours * effectiveRate)
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
      totalMaterials: isManualMode ? _manualTotals.totalMaterials : quote.totalMaterials,
      totalHours: isManualMode ? _manualTotals.totalHours : quote.totalHours,
      summary: { ...quote.summary, grandTotal: net, totalWorkHours: totalHours },
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
    // Manual mode: persist manualRows + materialize items[] for compatibility
    if (isManualMode) {
      updated.manualRows = manualRows
      updated.items = materializeManualRowsToItems(manualRows, effectiveRate)
      // Clear assembly-specific fields that don't apply to manual quotes
      updated.assemblySummary = []
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
        if (e.name === 'AbortError') { setPdfGenerating(false); toast.show('PDF mentés megszakítva.', 'info'); return } // user cancelled
        fileHandle = null // other error → fall through to anchor download
      }
    }

    // Build a live quote snapshot for PDF so it uses current edits (even unsaved)
    const liveQuoteManual = isManualMode ? {
      items: materializeManualRowsToItems(manualRows, effectiveRate),
      assemblySummary: [],
      manualRows,
      totalMaterials: _manualTotals.totalMaterials,
      totalHours: _manualTotals.totalHours,
    } : {}
    const liveQuote = {
      ...quote,
      ...liveQuoteManual,
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
      const { generatePdf } = await import('../utils/generatePdf.js')
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
    const { buildMailtoUrl } = await import('../utils/generatePdf.js')
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
    const { buildQuoteHtml } = await import('../utils/generatePdf.js')
    const _lqManual = isManualMode ? {
      items: materializeManualRowsToItems(manualRows, effectiveRate),
      assemblySummary: [],
      manualRows,
      totalMaterials: _manualTotals.totalMaterials,
      totalHours: _manualTotals.totalHours,
    } : {}
    const liveQuote = {
      ...quote,
      ..._lqManual,
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
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 2 }}>{quote.quoteNumber || quote.id}</div>
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
            <span>{totalHours.toFixed(1)}</span>
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

        {/* LEFT – items table (manual editor or assembly tables) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Manual mode: inline editable rows ─────────────────────────── */}
          {isManualMode && (
            <ManualRowEditor
              rows={manualRows}
              hourlyRate={effectiveRate}
              onChange={setManualRows}
            />
          )}

          {/* ── Assembly mode: read-only summary + items ──────────────────── */}
          {/* Assembly summary if available */}
          {!isManualMode && (quote.assemblySummary || []).length > 0 && (
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
                    const matCost   = Math.round(a.totalMaterials ?? a.materialCost ?? 0)
                    const laborCost = Math.round(a.totalLabor ?? a.laborCost ?? (a.totalPrice || 0) - matCost)
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

          {/* ── Items render: flat (none) or grouped (system/floor) — assembly mode only ── */}
          {!isManualMode && ((groupBy === 'system' || groupBy === 'floor') ? (
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
          ))}

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
              ['Ajánlat szám', quote.quoteNumber || quote.id],
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
