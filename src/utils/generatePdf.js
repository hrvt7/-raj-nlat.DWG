// ─── TakeoffPro PDF Generator ─────────────────────────────────────────────────
// Generates real downloadable PDF files using html2canvas + jsPDF.
// Supports 3 detail levels: compact | summary | detailed

const fmtHU = n => {
  const num = Number(n)
  return Number.isFinite(num) ? num.toLocaleString('hu-HU') : '0'
}
const fmtDate = iso => {
  try {
    const d = new Date(iso || Date.now())
    return isNaN(d.getTime()) ? new Date().toLocaleDateString('hu-HU') : d.toLocaleDateString('hu-HU')
  } catch { return new Date().toLocaleDateString('hu-HU') }
}

import { groupItemsBySystem, groupItemsByFloor, OUTPUT_MODE_NOTES } from '../data/quoteDefaults.js'
import { quoteDisplayTotals } from './quoteDisplayTotals.js'

const WALL_LABELS = { drywall: 'GK', ytong: 'Ytong', brick: 'Tégla', concrete: 'Beton' }

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── HTML builder (exported for testing) ─────────────────────────────────────
// Returns the full HTML string without opening a window or triggering print.
export function buildQuoteHtml(quote, settings, detailLevel = 'summary', outputMode = 'combined', groupBy = 'none') {
  const vatPct    = Number(settings?.labor?.vat_percent) || 27
  const markupPct = Number(quote.pricingData?.markup_pct) || 0

  // Use shared helper for outputMode-aware totals (consistent with UI)
  const markupType = quote.pricingData?.markup_type || 'markup'
  const { displayNet: dNet, displayVat: dVat, displayGross: dGross, fullNet: net } = quoteDisplayTotals({
    outputMode,
    totalLabor: Number(quote.totalLabor) || 0,
    totalMaterials: Number(quote.totalMaterials) || 0,
    cableCost: Number(quote.cableCost) || 0,
    markupPct,
    markupType,
    vatPct,
  })
  const company   = settings?.company || {}
  const qSettings = settings?.quote   || {}
  const validity  = parseInt(qSettings.validity_days) || 30
  const createdAt = quote.createdAt || new Date().toISOString()
  const validUntil = new Date(new Date(createdAt).getTime() + validity * 86400000)
  const hourlyRate = Number(quote.pricingData?.hourlyRate) || 9000

  // ── Per-component amounts for transparent breakdown ──────────────────────
  // Derive laborCardVal from dNet so markup/margin mode is always consistent
  // with quoteDisplayTotals (which already handles both modes correctly).
  const rawMaterials = Math.round(Number(quote.totalMaterials) || 0)

  // ── Logo HTML (XSS-safe: only allow data: URIs for base64 images) ──────────
  const logoSrc = company.logo_base64 || ''
  const isSafeDataUri = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(logoSrc)
  const logoHtml = isSafeDataUri
    ? `<img src="${logoSrc}" style="max-height:56px;max-width:180px;object-fit:contain;display:block;" />`
    : `<span class="company-name-text">${escHtml(company.name || 'TakeoffPro')}</span>`

  // ── KPI cards (filtered by outputMode, markup absorbed into Munkadíj) ─────
  // laborCardVal = dNet - rawMaterials ensures Anyagköltség + Munkadíj = Nettó összesen
  const laborCardVal = outputMode === 'labor_only' ? dNet : (dNet - rawMaterials)
  const kpiCardDefs = [
    outputMode !== 'labor_only' && { label: 'Anyagköltség (nettó)', value: fmtHU(rawMaterials) + ' Ft', accent: false },
    { label: outputMode === 'labor_only' ? 'Szerelési munkadíj (nettó)' : 'Munkadíj (nettó)', value: fmtHU(laborCardVal) + ' Ft', accent: false },
    { label: 'Munkaóra',             value: (quote.totalHours || 0).toFixed(1)             + ' ó',  accent: false },
    { label: outputMode === 'labor_only' ? 'Bruttó munkadíj összeg' : 'Bruttó végösszeg', value: fmtHU(dGross) + ' Ft', accent: true },
  ].filter(Boolean)
  const kpiCards = kpiCardDefs.map(k => `
    <div class="kpi-card${k.accent ? ' kpi-accent' : ''}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>`).join('')

  // ── Financial summary table (filtered by outputMode, markup absorbed) ─────
  const isLO = outputMode === 'labor_only'
  const finRows = [
    !isLO && ['Anyagköltség', fmtHU(rawMaterials) + ' Ft'],
    [isLO ? 'Szerelési munkadíj' : 'Munkadíj', fmtHU(laborCardVal) + ' Ft'],
    [isLO ? 'Nettó munkadíj összesen' : 'Nettó összköltség', fmtHU(dNet) + ' Ft'],
    [`ÁFA (${vatPct}%)`, fmtHU(dVat) + ' Ft'],
  ].filter(Boolean)

  let finTableRows = finRows.map(([label, val]) => `
    <tr>
      <td class="fin-label">${escHtml(label)}</td>
      <td class="fin-val">${val}</td>
    </tr>`).join('') + `
    <tr class="fin-total-row">
      <td class="fin-label">${isLO ? 'BRUTTÓ MUNKADÍJ ÖSSZEG' : 'BRUTTÓ VÉGÖSSZEG'}</td>
      <td class="fin-val">${fmtHU(dGross)} Ft</td>
    </tr>`

  // ── Shared render helpers for assembly + detailed sections ──────────────────
  const isSplit = outputMode === 'split_material_labor'
  const isLaborOnly = outputMode === 'labor_only'

  const renderAssemblyTable = (asmRows, titleOverride) => {
    if (!asmRows || asmRows.length === 0) return ''
    const rows = asmRows.map(a => {
      const wallInfo = a.wallSplits
        ? Object.entries(a.wallSplits).filter(([, n]) => n > 0).map(([k, n]) => `${WALL_LABELS[k] || k}: ${n}`).join(', ')
        : ''
      const matCost = Math.round(a.materialCost || 0)
      const laborCost = Math.round(a.laborCost || (a.totalPrice || 0) - matCost)
      const displayTotal = isLaborOnly ? laborCost : (a.totalPrice || 0)
      return `<tr>
        <td class="asm-name">${escHtml(a.name || '—')}</td>
        <td class="td-center td-mono">${a.qty}</td>
        <td class="td-center td-mono td-muted">${escHtml(wallInfo || '—')}</td>
        ${isSplit ? `<td class="td-right td-mono">${fmtHU(matCost)} Ft</td><td class="td-right td-mono">${fmtHU(laborCost)} Ft</td>` : ''}
        <td class="td-right td-price">${fmtHU(displayTotal)} Ft</td>
      </tr>`
    }).join('')
    const lastColLabel = isLaborOnly ? 'Munkadíj (nettó)' : isSplit ? 'Összesen (nettó)' : 'Összeg (nettó)'
    const title = titleOverride || (isLaborOnly ? 'Munkadíj összesítő' : 'Munkák összesítő')
    return `<div class="section-header">${escHtml(title)}</div>
      <table class="data-table"><thead><tr>
        <th>Munkacsoport / Tevékenység</th><th class="th-center">Menny.</th><th class="th-center">Falbontás</th>
        ${isSplit ? '<th class="th-right">Anyag (nettó)</th><th class="th-right">Munkadíj (nettó)</th>' : ''}
        <th class="th-right">${lastColLabel}</th>
      </tr></thead><tbody>${rows}</tbody></table>`
  }

  const renderDetailRows = items => items.map(item => {
    const unitPrice = Number(item.unitPrice) || 0
    const qty = Number(item.qty) || 0
    const hours = Number(item.hours) || 0
    const total = item.type === 'labor' ? hours * hourlyRate : unitPrice * qty
    return `<tr>
      <td class="td-name">${escHtml(item.name || '—')}</td>
      <td class="td-center td-mono">${fmtHU(+qty.toFixed(2))} ${escHtml(item.unit || '')}</td>
      <td class="td-right td-mono">${item.type === 'labor' ? fmtHU(hourlyRate) + ' Ft/ó' : fmtHU(Math.round(unitPrice)) + ' Ft'}</td>
      <td class="td-right td-mono">${hours > 0 ? hours.toFixed(2) + ' ó' : '—'}</td>
      <td class="td-price td-right">${fmtHU(Math.round(total))} Ft</td>
    </tr>`
  }).join('')

  const renderDetailTables = (items, groupLabel) => {
    const materials = items.filter(i => i.type === 'material' || i.type === 'cable')
    const labors = items.filter(i => i.type === 'labor')
    const prefix = groupLabel ? groupLabel + ' · ' : ''
    let html = ''
    if (outputMode !== 'labor_only' && materials.length > 0) {
      html += `<div class="section-header">${escHtml(prefix)}Részletes tételek – Anyagok</div>
        <table class="data-table"><thead><tr>
          <th>Megnevezés</th><th class="th-center">Mennyiség</th><th class="th-right">Egységár</th>
          <th class="th-right">Munkaóra</th><th class="th-right">Összeg (nettó)</th>
        </tr></thead><tbody>${renderDetailRows(materials)}</tbody></table>`
    }
    if (labors.length > 0) {
      html += `<div class="section-header">${escHtml(prefix + (isLaborOnly ? 'Részletes tételek – Szerelési munka' : 'Részletes tételek – Munka'))}</div>
        <table class="data-table"><thead><tr>
          <th>Megnevezés</th><th class="th-center">Mennyiség</th><th class="th-right">Óradíj</th>
          <th class="th-right">Munkaóra</th><th class="th-right">${isLaborOnly ? 'Munkadíj (nettó)' : 'Összeg (nettó)'}</th>
        </tr></thead><tbody>${renderDetailRows(labors)}</tbody></table>`
    }
    return html
  }

  // ── Assembly summary + Detailed items — with optional system grouping ──────
  let assemblySectionHtml = ''
  let detailedSectionHtml = ''
  const assemblyRows = quote.assemblySummary || []
  const allItems = quote.items || []

  if (groupBy === 'system' || groupBy === 'floor') {
    // ── Grouped rendering (system or floor) ──
    const groups = groupBy === 'system' ? groupItemsBySystem(allItems) : groupItemsByFloor(allItems)

    // Financial subtotals per group (inserted before grand total)
    const groupSubtotals = groups.map(g => {
      const grpMat = g.items.filter(i => i.type === 'material' || i.type === 'cable').reduce((s, i) => s + (i.unitPrice || 0) * i.qty, 0)
      const grpLabor = g.items.filter(i => i.type === 'labor').reduce((s, i) => s + (i.hours || 0) * hourlyRate, 0)
      const grpTotal = isLaborOnly ? grpLabor : (grpMat + grpLabor)
      return `<tr class="fin-subtotal"><td class="fin-label">${escHtml(g.label)}</td><td class="fin-val">${fmtHU(Math.round(grpTotal))} Ft</td></tr>`
    }).join('')
    // Inject group subtotals into financial table
    finTableRows = groupSubtotals + finTableRows

    // Assembly summary — grouped (flat, since assemblies don't carry group metadata)
    if (detailLevel !== 'compact' && assemblyRows.length > 0) {
      assemblySectionHtml = renderAssemblyTable(assemblyRows, null)
    }

    // Detailed items — grouped
    if (detailLevel === 'detailed' && allItems.length > 0) {
      detailedSectionHtml = groups.map(g =>
        `<div class="group-header-pdf">${escHtml(g.label)}</div>` + renderDetailTables(g.items, g.label)
      ).join('')
    }
  } else {
    // ── Flat (no grouping) ──
    if (detailLevel !== 'compact' && assemblyRows.length > 0) {
      assemblySectionHtml = renderAssemblyTable(assemblyRows, null)
    }
    if (detailLevel === 'detailed' && allItems.length > 0) {
      detailedSectionHtml = renderDetailTables(allItems, '')
    }
  }

  // ── OutputMode customer-facing note (from shared constants) ─────────────
  const modeNote = OUTPUT_MODE_NOTES[outputMode] || null
  const modeNoteHtml = modeNote
    ? `<div class="mode-note">${escHtml(modeNote)}</div>`
    : ''

  // ── Inclusions / Exclusions ─────────────────────────────────────────────
  const inclusions = (quote.inclusions || '').trim()
  const exclusions = (quote.exclusions || '').trim()
  const hasInclExcl = inclusions || exclusions
  const inclExclHtml = hasInclExcl ? `
    <div class="incl-excl-row">
      ${inclusions ? `<div class="incl-box"><strong>Tartalmazza:</strong><br/>${escHtml(inclusions).replace(/\n/g, '<br/>')}</div>` : ''}
      ${exclusions ? `<div class="excl-box"><strong>Nem tartalmazza:</strong><br/>${escHtml(exclusions).replace(/\n/g, '<br/>')}</div>` : ''}
    </div>` : ''

  // ── Notes ─────────────────────────────────────────────────────────────────
  const notes = quote.notes || qSettings.default_notes || ''
  const notesHtml = notes
    ? `<div class="notes-box"><strong>Megjegyzés:</strong> ${escHtml(notes)}</div>`
    : ''

  const footerText = qSettings.footer_text || ''

  // ── Company details for header right column ───────────────────────────────
  const companyDetails = [
    company.address,
    company.tax_number ? 'Adószám: ' + company.tax_number : '',
    company.phone,
    company.email,
    company.bank_account ? 'Bankszámla: ' + company.bank_account : '',
  ].filter(Boolean).map(d => `<div class="co-detail">${escHtml(d)}</div>`).join('')

  // ── Parties block: Vállalkozó (contractor) vs Megrendelő (client) ────────
  const contractorLines = [
    company.name,
    company.address,
    company.tax_number ? 'Adószám: ' + company.tax_number : '',
    company.phone,
    company.email,
    company.bank_account ? 'Bankszámlaszám: ' + company.bank_account : '',
  ].filter(Boolean)

  const clientAddr = (quote.clientAddress || '').trim()
  const clientTax  = (quote.clientTaxNumber || '').trim()
  const clientLines = [
    quote.clientName || '',
    clientAddr,
    clientTax ? 'Adószám: ' + clientTax : '',
  ].filter(Boolean)

  // ── Project scope metadata ────────────────────────────────────────────────
  const projectAddr = (quote.projectAddress || '').trim()
  const asmCount = assemblyRows.length
  const itemCount = allItems.length
  const scopeParts = []
  if (asmCount > 0) scopeParts.push(`${asmCount} munkacsoport`)
  if (itemCount > 0) scopeParts.push(`${itemCount} tétel`)
  if (quote.totalHours > 0) scopeParts.push(`${(quote.totalHours).toFixed(1)} munkaóra`)

  // ─── Full HTML document ────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <title>Árajánlat – ${escHtml(quote.id || '')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:ital,wght@0,400;0,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { width: 210mm; background: #fff; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color: #1A1A1F; font-size: 9pt; line-height: 1.5; }

    .page-wrap { padding: 0 14mm 14mm 14mm; }

    /* ── HEADER STRIP ─────────────────────────────────────────────────── */
    .header {
      background: #0A0A0F;
      padding: 18px 14mm;
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 18px;
    }
    .header-left { display: flex; flex-direction: column; gap: 4px; }
    .company-name-text { font-family: 'Syne', sans-serif; font-size: 18pt; font-weight: 800; color: #00E5A0; }
    .co-detail { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: rgba(255,255,255,0.55); margin-top: 1px; }
    .header-right { text-align: right; }
    .doc-type-label { font-family: 'DM Mono', monospace; font-size: 7pt; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.12em; }
    .doc-id { font-family: 'DM Mono', monospace; font-size: 13pt; font-weight: 500; color: #00E5A0; margin-top: 3px; }
    .doc-date { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: rgba(255,255,255,0.45); margin-top: 5px; }

    /* ── PARTIES BLOCK (Vállalkozó / Megrendelő) ─────────────────────── */
    .parties-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .party-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px 16px; }
    .party-box-contractor { background: #F9FAFB; }
    .party-box-client { background: #FEFCE8; border-color: #FDE68A; }
    .party-title { font-family: 'DM Mono', monospace; font-size: 6.5pt; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.10em; margin-bottom: 8px; display: block; }
    .party-box-client .party-title { color: #92400E; }
    .party-name { font-family: 'Inter', sans-serif; font-size: 10.5pt; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .party-line { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: #4B5563; margin-top: 2px; line-height: 1.6; }
    .party-empty { font-family: 'DM Mono', monospace; font-size: 8pt; color: #D1D5DB; font-style: italic; }

    /* ── PROJECT SCOPE ROW ─────────────────────────────────────────────── */
    .scope-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 14px; padding-bottom: 14px; border-bottom: 1.5px solid #E5E7EB; margin-bottom: 14px; }
    .scope-cell label { font-family: 'DM Mono', monospace; font-size: 6.5pt; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.09em; display: block; margin-bottom: 3px; }
    .scope-cell .iv { font-size: 10pt; font-weight: 600; color: #111827; }
    .scope-cell .is { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: #6B7280; margin-top: 2px; }

    /* ── KPI CARDS ────────────────────────────────────────────────────── */
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi-card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 7px; padding: 10px 12px; }
    .kpi-accent { background: #ECFDF5; border-color: #6EE7B7; }
    .kpi-label { font-family: 'DM Mono', monospace; font-size: 6.5pt; color: #6B7280; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
    .kpi-accent .kpi-label { color: #065F46; }
    .kpi-value { font-family: 'Syne', sans-serif; font-size: 13pt; font-weight: 800; color: #111827; }
    .kpi-accent .kpi-value { color: #047857; }

    /* ── FINANCIAL TABLE ──────────────────────────────────────────────── */
    .fin-table-wrap { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .fin-table { width: 100%; border-collapse: collapse; }
    .fin-table tr { border-bottom: 1px solid #F3F4F6; }
    .fin-table tr:last-child { border-bottom: none; }
    .fin-label { padding: 6px 0; color: #374151; font-size: 9pt; }
    .fin-val   { padding: 6px 0; text-align: right; font-family: 'DM Mono', monospace; font-size: 9pt; font-weight: 500; color: #111827; white-space: nowrap; }
    .fin-subtotal .fin-label, .fin-subtotal .fin-val { color: #6B7280; font-size: 8.5pt; }
    .fin-total-row { border-top: 2px solid #D1D5DB !important; border-bottom: none !important; }
    .fin-total-row .fin-label { font-family: 'Syne', sans-serif; font-size: 13pt; font-weight: 800; color: #047857; padding-top: 10px; }
    .fin-total-row .fin-val   { font-family: 'Syne', sans-serif; font-size: 13pt; font-weight: 800; color: #047857; padding-top: 10px; }

    /* ── GROUP HEADER (system grouping) ──────────────────────────────── */
    .group-header-pdf {
      font-family: 'Syne', sans-serif; font-size: 10pt; font-weight: 800;
      color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A;
      border-radius: 6px; padding: 7px 12px; margin-top: 16px; margin-bottom: 8px;
    }

    /* ── SECTION HEADER ───────────────────────────────────────────────── */
    .section-header {
      font-family: 'Syne', sans-serif; font-size: 8.5pt; font-weight: 800;
      color: #374151; text-transform: uppercase; letter-spacing: 0.08em;
      padding: 5px 0; border-bottom: 2px solid #E5E7EB;
      margin-top: 18px; margin-bottom: 10px;
    }

    /* ── DATA TABLE ───────────────────────────────────────────────────── */
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .data-table thead tr { background: #F3F4F6; }
    .data-table th {
      padding: 6px 10px; text-align: left;
      font-family: 'DM Mono', monospace; font-size: 6.5pt; font-weight: 500;
      color: #6B7280; text-transform: uppercase; letter-spacing: 0.07em;
      border-bottom: 1.5px solid #E5E7EB;
    }
    .th-center { text-align: center !important; }
    .th-right  { text-align: right !important; }
    .data-table td { padding: 6px 10px; border-bottom: 1px solid #F3F4F6; font-size: 8.5pt; color: #374151; }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table tbody tr:nth-child(even) td { background: #FAFAFA; }
    .td-name  { font-weight: 500; color: #111827; }
    .asm-name { font-weight: 600; color: #111827; }
    .td-mono  { font-family: 'DM Mono', monospace; font-size: 8pt; }
    .td-muted { color: #9CA3AF !important; font-size: 7.5pt; }
    .td-center { text-align: center; }
    .td-right  { text-align: right; }
    .td-price  { font-family: 'DM Mono', monospace; font-size: 8.5pt; font-weight: 500; color: #111827; }

    /* ── MODE NOTE ────────────────────────────────────────────────────── */
    .mode-note { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 7px; padding: 10px 13px; margin-bottom: 14px; font-family: 'Inter', sans-serif; font-size: 8.5pt; color: #1E40AF; line-height: 1.6; }

    /* ── INCLUSIONS / EXCLUSIONS ─────────────────────────────────────── */
    .incl-excl-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
    .incl-excl-row > div:only-child { grid-column: 1 / -1; }
    .incl-box { background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 7px; padding: 10px 13px; font-size: 8.5pt; color: #065F46; line-height: 1.6; }
    .excl-box { background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 7px; padding: 10px 13px; font-size: 8.5pt; color: #92400E; line-height: 1.6; }

    /* ── NOTES / TERMS ────────────────────────────────────────────────── */
    .notes-box { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 7px; padding: 10px 13px; margin-bottom: 12px; font-size: 8.5pt; color: #92400E; line-height: 1.6; }
    .terms-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 7px; padding: 10px 13px; margin-bottom: 14px; font-size: 8pt; color: #4B5563; line-height: 1.7; }

    /* ── ACCEPTANCE NOTE ──────────────────────────────────────────────── */
    .acceptance-note { font-family: 'Inter', sans-serif; font-size: 8pt; color: #6B7280; font-style: italic; margin-top: 16px; margin-bottom: 6px; text-align: center; }

    /* ── SIGNATURE ────────────────────────────────────────────────────── */
    .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #E5E7EB; page-break-inside: avoid; }
    .sig-block label { font-family: 'DM Mono', monospace; font-size: 6.5pt; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.07em; display: block; margin-bottom: 36px; }
    .sig-line { border-top: 1px solid #D1D5DB; padding-top: 5px; font-family: 'DM Mono', monospace; font-size: 7pt; color: #9CA3AF; }

    /* ── FOOTER ───────────────────────────────────────────────────────── */
    .page-footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; }
    .page-footer span { font-family: 'DM Mono', monospace; font-size: 7pt; color: #9CA3AF; }
    .page-footer .pf-branding { color: #00845A; }

    /* ── PAGE-BREAK QUALITY ──────────────────────────────────────────── */
    .parties-row, .fin-table-wrap, .kpi-row,
    .party-box, .notes-box, .terms-box, .incl-excl-row {
      page-break-inside: avoid; break-inside: avoid;
    }
    .sig-section {
      page-break-inside: avoid; break-inside: avoid;
      page-break-before: auto;
    }
    .section-header, .group-header-pdf {
      page-break-after: avoid; break-after: avoid;
    }
    .data-table tr {
      page-break-inside: avoid; break-inside: avoid;
    }

    /* ── PRINT OVERRIDES ──────────────────────────────────────────────── */
    @media print {
      html, body { width: 210mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

  <!-- ── HEADER ────────────────────────────────────────────────────────── -->
  <div class="header">
    <div class="header-left">
      ${logoHtml}
      ${companyDetails}
    </div>
    <div class="header-right">
      <div class="doc-type-label">Árajánlat</div>
      <div class="doc-id">${escHtml(quote.id || '')}</div>
      <div class="doc-date">${fmtDate(createdAt)}</div>
    </div>
  </div>

  <div class="page-wrap">

    <!-- ── PARTIES (Vállalkozó / Megrendelő) ─────────────────────────── -->
    <div class="parties-row">
      <div class="party-box party-box-contractor">
        <span class="party-title">Vállalkozó</span>
        ${contractorLines.length > 0
          ? `<div class="party-name">${escHtml(contractorLines[0])}</div>` + contractorLines.slice(1).map(l => `<div class="party-line">${escHtml(l)}</div>`).join('')
          : '<div class="party-empty">—</div>'
        }
      </div>
      <div class="party-box party-box-client">
        <span class="party-title">Megrendelő</span>
        ${clientLines.length > 0
          ? `<div class="party-name">${escHtml(clientLines[0])}</div>` + clientLines.slice(1).map(l => `<div class="party-line">${escHtml(l)}</div>`).join('')
          : '<div class="party-empty">—</div>'
        }
      </div>
    </div>

    <!-- ── PROJECT SCOPE ROW ─────────────────────────────────────────── -->
    <div class="scope-row">
      <div class="scope-cell">
        <label>Projekt neve</label>
        <div class="iv">${escHtml(quote.projectName || '—')}</div>
      </div>
      <div class="scope-cell">
        <label>${projectAddr ? 'Projekt helyszíne' : 'Kiállítás dátuma'}</label>
        <div class="iv">${projectAddr ? escHtml(projectAddr) : fmtDate(createdAt)}</div>
        ${projectAddr ? '' : `<div class="is">Érvényes ${validity} napig</div>`}
      </div>
      <div class="scope-cell">
        <label>${projectAddr ? 'Kiállítás dátuma' : 'Érvényes'}</label>
        <div class="iv">${projectAddr ? fmtDate(createdAt) : validUntil.toLocaleDateString('hu-HU')}</div>
        ${projectAddr ? `<div class="is">Érvényes ${validity} napig</div>` : '<div class="is">-ig</div>'}
      </div>
      <div class="scope-cell">
        <label>${projectAddr ? 'Érvényesség' : 'Terjedelem'}</label>
        <div class="iv">${projectAddr ? validUntil.toLocaleDateString('hu-HU') : (scopeParts.length > 0 ? scopeParts[0] : '—')}</div>
        ${projectAddr
          ? '<div class="is">-ig</div>'
          : (scopeParts.length > 1 ? `<div class="is">${scopeParts.slice(1).join(', ')}</div>` : '')
        }
      </div>
    </div>

    <!-- ── KPI CARDS ──────────────────────────────────────────────────── -->
    <div class="kpi-row">${kpiCards}</div>

    <!-- ── OUTPUT MODE NOTE ──────────────────────────────────────────── -->
    ${modeNoteHtml}

    <!-- ── FINANCIAL TABLE ───────────────────────────────────────────── -->
    <div class="fin-table-wrap">
      <table class="fin-table">
        <tbody>${finTableRows}</tbody>
      </table>
    </div>

    <!-- ── ASSEMBLY SUMMARY ──────────────────────────────────────────── -->
    ${assemblySectionHtml}

    <!-- ── DETAILED ITEMS ────────────────────────────────────────────── -->
    ${detailedSectionHtml}

    <!-- ── INCLUSIONS / EXCLUSIONS ─────────────────────────────────── -->
    ${inclExclHtml}

    <!-- ── NOTES ─────────────────────────────────────────────────────── -->
    ${notesHtml}

    <!-- ── TERMS ─────────────────────────────────────────────────────── -->
    ${(() => {
      const vText = (quote.validityText || '').trim()
      const pText = (quote.paymentTermsText || '').trim()
      if (!vText && !pText) return ''
      return `<div class="terms-box">
        <strong>Érvényesség és fizetési feltételek:</strong><br/>
        ${vText ? escHtml(vText).replace(/\n/g, '<br/>') : ''}
        ${vText && pText ? '<br/>' : ''}
        ${pText ? escHtml(pText).replace(/\n/g, '<br/>') : ''}
        ${footerText ? '<br/><br/>' + escHtml(footerText) : ''}
      </div>`
    })()}

    <!-- ── ACCEPTANCE + SIGNATURE ─────────────────────────────────────── -->
    <div class="acceptance-note">Az ajánlat elfogadásával a Megrendelő a dokumentumban foglalt feltételeket elfogadja.</div>
    <div class="sig-section">
      <div class="sig-block">
        <label>Megrendelő aláírása és dátum</label>
        <div class="sig-line">${escHtml(quote.clientName || 'Megrendelő')}</div>
      </div>
      <div class="sig-block">
        <label>Vállalkozó aláírása és dátum</label>
        <div class="sig-line">${escHtml(company.name || 'Vállalkozó')}</div>
      </div>
    </div>

    <!-- ── FOOTER ─────────────────────────────────────────────────────── -->
    <div class="page-footer">
      <span>${escHtml(company.name || '')}${company.address ? ' · ' + escHtml(company.address) : ''}</span>
      <span class="pf-branding">TakeoffPro</span>
    </div>

  </div><!-- /page-wrap -->

</body>
</html>`

  return html
}

// ─── Filename sanitizer ──────────────────────────────────────────────────────
export function sanitizeFilename(name) {
  return String(name)
    .replace(/[<>:"/\\|?*]/g, '')   // Remove filesystem-unsafe chars
    .trim()                          // Trim whitespace
    .replace(/\s+/g, '_')           // Spaces → underscores
    || 'ajanlat'
}

// ─── Main entry point ─────────────────────────────────────────────────────────
// Generates a real downloadable PDF file using html2canvas + jsPDF.
// outputMode: 'combined' | 'labor_only' | 'split_material_labor'
export async function generatePdf(quote, settings, detailLevel = 'summary', outputMode = 'combined', groupBy = 'none', fileHandle = null) {
  const html = buildQuoteHtml(quote, settings, detailLevel, outputMode, groupBy)

  // Expose HTML for E2E tests (zero-cost property assignment)
  if (typeof window !== 'undefined') window.__lastPdfHtml = html

  // ── Parse HTML and create hidden render container ──────────────────────────
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;'

  // Inject Google Font link for Inter (Syne/DM Mono already loaded by main app)
  const addedLinks = []
  parsed.querySelectorAll('link[href*="fonts.googleapis"]').forEach(link => {
    const href = link.getAttribute('href')
    if (href && !document.querySelector(`link[href="${href}"]`)) {
      const clone = link.cloneNode(true)
      document.head.appendChild(clone)
      addedLinks.push(clone)
    }
  })

  // Copy <style> blocks and body content into container
  parsed.querySelectorAll('style').forEach(s => container.appendChild(s.cloneNode(true)))
  Array.from(parsed.body.children).forEach(child => container.appendChild(child.cloneNode(true)))

  document.body.appendChild(container)

  try {
    // Wait for fonts — explicitly trigger loading of each required typeface.
    // document.fonts.ready alone can resolve instantly if the injected <link>
    // hasn't started loading yet. document.fonts.load(spec) forces the browser
    // to fetch the named font and returns a promise that resolves only when
    // that specific face is available.
    const fontFaces = [
      'bold 16px "Syne"',
      '500 10px "DM Mono"',
      '400 10px "Inter"',
    ]
    const fontTimeout = new Promise(r => setTimeout(r, 2000))
    await Promise.race([
      Promise.all([
        document.fonts.ready,
        ...fontFaces.map(f => document.fonts.load(f).catch(() => {})),
      ]),
      fontTimeout,
    ])
    // Force synchronous reflow with final fonts, then wait for two
    // animation frames so the browser has painted the stable layout.
    container.offsetHeight          // eslint-disable-line no-unused-expressions
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

    // ── Pre-capture pagination: push keep-together blocks past page boundaries ──
    // html2canvas ignores CSS page-break rules, so we manually insert invisible
    // spacer divs before blocks that would be split by an A4 page boundary.
    {
      const PAGE_H_PX = Math.round(794 * (297 / 210)) // ≈1123px — A4 aspect at 794px width
      const KEEP_TOGETHER = '.parties-row,.kpi-row,.fin-table-wrap,.sig-section,.section-header,.group-header-pdf,.data-table,.notes-box,.terms-box,.incl-excl-row,.acceptance-note'
      const blocks = container.querySelectorAll(KEEP_TOGETHER)
      const spacers = [] // track inserted spacers for measurement stability

      for (const block of blocks) {
        const top = block.offsetTop
        const height = block.offsetHeight
        if (height <= 0 || height >= PAGE_H_PX) continue // skip empty or taller-than-page

        const pageBottom = Math.ceil((top + 1) / PAGE_H_PX) * PAGE_H_PX
        const wouldSplit = top < pageBottom && (top + height) > pageBottom

        if (!wouldSplit) continue

        // For section headers / group headers: keep together with next sibling
        let keepHeight = height
        const isHeader = block.classList.contains('section-header') || block.classList.contains('group-header-pdf')
        if (isHeader && block.nextElementSibling) {
          keepHeight += block.nextElementSibling.offsetHeight
        }
        // Only push if the combined block fits on one page
        if (keepHeight >= PAGE_H_PX) continue

        const gap = pageBottom - top
        const spacer = document.createElement('div')
        spacer.style.cssText = `height:${gap}px;width:100%;flex-shrink:0;`
        block.parentNode.insertBefore(spacer, block)
        spacers.push(spacer)
      }
    }

    // ── Pass 2: row-level protection for long data tables ────────────────
    // The block-level pass above skips tables taller than one page.
    // Inside those tables, individual <tr> can still split across an A4
    // boundary. Insert spacer rows to push split-risk rows to the next page.
    {
      const PAGE_H = Math.round(794 * (297 / 210))
      const containerTop = container.getBoundingClientRect().top
      const rows = container.querySelectorAll('.data-table tbody tr')
      for (const row of rows) {
        const rect = row.getBoundingClientRect()
        const top = rect.top - containerTop
        const height = rect.height
        if (height <= 0 || height >= PAGE_H) continue

        const pageBottom = Math.ceil((top + 1) / PAGE_H) * PAGE_H
        if (top >= pageBottom || (top + height) <= pageBottom) continue

        const gap = pageBottom - top
        const spacerRow = document.createElement('tr')
        const spacerCell = document.createElement('td')
        spacerCell.setAttribute('colspan', '99')
        spacerCell.style.cssText = `height:${gap}px;padding:0;border:none;line-height:0;font-size:0;`
        spacerRow.appendChild(spacerCell)
        row.parentNode.insertBefore(spacerRow, row)
      }
    }

    // Dynamic import (code-split — keeps main bundle small)
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    // Capture content at 2× resolution
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    // ── Build A4 PDF with pagination ──────────────────────────────────────
    const A4_W = 210  // mm
    const A4_H = 297  // mm
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const imgWidth = A4_W
    const imgHeight = (canvas.height * A4_W) / canvas.width

    let heightLeft = imgHeight
    let position = 0

    // First page
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= A4_H

    // Additional pages — skip orphan last page (footer-only spillover < 15mm)
    const ORPHAN_THRESHOLD_MM = 15
    while (heightLeft > ORPHAN_THRESHOLD_MM) {
      position -= A4_H
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= A4_H
    }

    // ── Build filename ────────────────────────────────────────────────────
    const projectName = sanitizeFilename(quote.projectName || quote.project_name || 'ajanlat')
    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `${projectName}_${dateStr}.pdf`

    // ── Save: prefer File System Access API, fallback to anchor download ─
    const blob = pdf.output('blob')

    if (fileHandle) {
      // File System Access API — file picker was shown pre-render (gesture-valid)
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
    } else {
      // Anchor-based blob download — universal fallback
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 40_000)
    }
  } finally {
    // Clean up hidden container and injected font links
    document.body.removeChild(container)
    addedLinks.forEach(l => l.remove())
  }
}

// ─── Mailto URL builder ────────────────────────────────────────────────────────
// Builds a mailto: URL for composing a quote email in the user's mail client.
// No attachment — body reminds user to attach the previously downloaded PDF.

const fmtHUmail = n => {
  const num = Number(n)
  return Number.isFinite(num) ? num.toLocaleString('hu-HU') : '0'
}

/**
 * @param {object} opts
 * @param {string} [opts.clientEmail]   – recipient email (may be empty)
 * @param {string} [opts.clientName]    – client display name
 * @param {string} [opts.projectName]   – quote / project name
 * @param {number} [opts.displayGross]  – gross total in HUF (for the body summary)
 * @param {string} [opts.companyName]   – sender company name (from settings)
 * @param {string} [opts.companyEmail]  – sender email (from settings)
 * @param {string} [opts.companyPhone]  – sender phone (from settings)
 * @returns {string} mailto: URL
 */
export function buildMailtoUrl({
  clientEmail = '',
  clientName = '',
  projectName = '',
  displayGross = 0,
  companyName = '',
  companyEmail = '',
  companyPhone = '',
} = {}) {
  const to = (clientEmail || '').trim()
  const projLabel = (projectName || '').trim() || 'Árajánlat'

  const subject = `Árajánlat — ${projLabel}`

  const greeting = clientName?.trim()
    ? `Tisztelt ${clientName.trim()}!`
    : 'Tisztelt Partnerünk!'

  const grossLine = displayGross
    ? `\nAz ajánlat végösszege (bruttó): ${fmtHUmail(displayGross)} Ft\n`
    : ''

  const body = [
    greeting,
    '',
    `Mellékeljük árajánlatunkat a(z) „${projLabel}" projekthez.`,
    grossLine,
    'A részletes árajánlatot PDF formátumban csatoltuk az emailhez.',
    '(Amennyiben a PDF nincs csatolva, kérjük töltse le az alkalmazásból és csatolja kézzel.)',
    '',
    'Kérdés esetén készséggel állunk rendelkezésre.',
    '',
    'Üdvözlettel,',
    companyName || '',
    companyEmail ? `Email: ${companyEmail}` : '',
    companyPhone ? `Tel: ${companyPhone}` : '',
  ].filter((line, i, arr) => {
    // Remove trailing empty signature lines (where company info is missing)
    if (i >= arr.length - 3 && line === '') return false
    return true
  }).join('\n')

  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
