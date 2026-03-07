// ─── TakeoffPro PDF Generator ─────────────────────────────────────────────────
// Uses HTML + window.print() for pixel-perfect A4 output (no external deps).
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

const WALL_LABELS = { drywall: 'GK', ytong: 'Ytong', brick: 'Tégla', concrete: 'Beton' }

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Main entry point ─────────────────────────────────────────────────────────
// outputMode: 'combined' | 'labor_only' | 'split_material_labor'
export function generatePdf(quote, settings, detailLevel = 'summary', outputMode = 'combined') {
  const vatPct    = Number(settings?.labor?.vat_percent) || 27
  const net       = Math.round(Number(quote.gross) || 0)
  const vatAmt    = Math.round(net * vatPct / 100)
  const gross     = net + vatAmt

  // Display-only values for labor_only mode (internal data unchanged)
  const laborNet   = outputMode === 'labor_only' ? Math.round(Number(quote.totalLabor) || 0) : net
  const laborVat   = Math.round(laborNet * vatPct / 100)
  const laborGross = laborNet + laborVat
  const dNet   = outputMode === 'labor_only' ? laborNet   : net
  const dVat   = outputMode === 'labor_only' ? laborVat   : vatAmt
  const dGross = outputMode === 'labor_only' ? laborGross : gross
  const company   = settings?.company || {}
  const qSettings = settings?.quote   || {}
  const validity  = parseInt(qSettings.validity_days) || 30
  const createdAt = quote.createdAt || new Date().toISOString()
  const validUntil = new Date(new Date(createdAt).getTime() + validity * 86400000)
  const hourlyRate = Number(quote.pricingData?.hourlyRate) || 9000

  // ── Logo HTML (XSS-safe: only allow data: URIs for base64 images) ──────────
  const logoSrc = company.logo_base64 || ''
  const isSafeDataUri = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(logoSrc)
  const logoHtml = isSafeDataUri
    ? `<img src="${logoSrc}" style="max-height:56px;max-width:180px;object-fit:contain;display:block;" />`
    : `<span class="company-name-text">${escHtml(company.name || 'TakeoffPro')}</span>`

  // ── KPI cards (filtered by outputMode) ────────────────────────────────────
  const kpiCardDefs = [
    outputMode !== 'labor_only' && { label: 'Anyagköltség (nettó)', value: fmtHU(Math.round(quote.totalMaterials || 0)) + ' Ft', accent: false },
    { label: outputMode === 'labor_only' ? 'Szerelési munkadíj (nettó)' : 'Munkadíj (nettó)', value: fmtHU(Math.round(quote.totalLabor || 0)) + ' Ft', accent: false },
    { label: 'Munkaóra',             value: (quote.totalHours || 0).toFixed(1)             + ' ó',  accent: false },
    { label: outputMode === 'labor_only' ? 'Bruttó munkadíj összeg' : 'Bruttó végösszeg', value: fmtHU(dGross) + ' Ft', accent: true },
  ].filter(Boolean)
  const kpiCards = kpiCardDefs.map(k => `
    <div class="kpi-card${k.accent ? ' kpi-accent' : ''}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>`).join('')

  // ── Financial summary table (filtered by outputMode) ─────────────────────
  const isLO = outputMode === 'labor_only'
  const finRows = [
    !isLO && ['Anyagköltség', fmtHU(Math.round(quote.totalMaterials || 0)) + ' Ft'],
    [isLO ? 'Szerelési munkadíj' : 'Munkadíj', fmtHU(Math.round(quote.totalLabor || 0)) + ' Ft'],
    [isLO ? 'Nettó munkadíj összesen' : 'Nettó összköltség', fmtHU(dNet) + ' Ft'],
    [`ÁFA (${vatPct}%)`, fmtHU(dVat) + ' Ft'],
  ].filter(Boolean)

  const finTableRows = finRows.map(([label, val]) => `
    <tr>
      <td class="fin-label">${escHtml(label)}</td>
      <td class="fin-val">${val}</td>
    </tr>`).join('') + `
    <tr class="fin-total-row">
      <td class="fin-label">${isLO ? 'BRUTTÓ MUNKADÍJ ÖSSZEG' : 'BRUTTÓ VÉGÖSSZEG'}</td>
      <td class="fin-val">${fmtHU(dGross)} Ft</td>
    </tr>`

  // ── Assembly summary (Összesített + Részletes) — outputMode aware ──────────
  let assemblySectionHtml = ''
  const assemblyRows = quote.assemblySummary || []
  if (detailLevel !== 'compact' && assemblyRows.length > 0) {
    const isSplit = outputMode === 'split_material_labor'
    const isLaborOnly = outputMode === 'labor_only'

    const rows = assemblyRows.map(a => {
      const wallInfo = a.wallSplits
        ? Object.entries(a.wallSplits)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${WALL_LABELS[k] || k}: ${n}`)
            .join(', ')
        : ''
      const matCost   = Math.round(a.materialCost || 0)
      const laborCost = Math.round(a.laborCost || (a.totalPrice || 0) - matCost)
      const displayTotal = isLaborOnly ? laborCost : (a.totalPrice || 0)
      return `
        <tr>
          <td class="asm-name">${escHtml(a.name || '—')}</td>
          <td class="td-center td-mono">${a.qty}</td>
          <td class="td-center td-mono td-muted">${escHtml(wallInfo || '—')}</td>
          ${isSplit ? `
          <td class="td-right td-mono">${fmtHU(matCost)} Ft</td>
          <td class="td-right td-mono">${fmtHU(laborCost)} Ft</td>` : ''}
          <td class="td-right td-price">${fmtHU(displayTotal)} Ft</td>
        </tr>`
    }).join('')

    const lastColLabel = isLaborOnly ? 'Munkadíj (nettó)' : isSplit ? 'Összesen (nettó)' : 'Összeg (nettó)'
    assemblySectionHtml = `
      <div class="section-header">${isLaborOnly ? 'Munkadíj összesítő' : 'Munkák összesítő'}</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Munkacsoport / Tevékenység</th>
            <th class="th-center">Menny.</th>
            <th class="th-center">Falbontás</th>
            ${isSplit ? '<th class="th-right">Anyag (nettó)</th><th class="th-right">Munkadíj (nettó)</th>' : ''}
            <th class="th-right">${lastColLabel}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  // ── Detailed line items (Részletes) — outputMode aware ────────────────────
  let detailedSectionHtml = ''
  if (detailLevel === 'detailed' && (quote.items || []).length > 0) {
    // Group items by type
    const materials = (quote.items || []).filter(i => i.type === 'material' || i.type === 'cable')
    const labors    = (quote.items || []).filter(i => i.type === 'labor')

    const renderRows = items => items.map(item => {
      const unitPrice = Number(item.unitPrice) || 0
      const qty       = Number(item.qty) || 0
      const hours     = Number(item.hours) || 0
      const matTotal  = unitPrice * qty
      const laborTotal = hours * hourlyRate
      const total = item.type === 'labor' ? laborTotal : matTotal
      return `
        <tr>
          <td class="td-name">${escHtml(item.name || '—')}</td>
          <td class="td-center td-mono">${fmtHU(+qty.toFixed(2))} ${escHtml(item.unit || '')}</td>
          <td class="td-right td-mono">${item.type === 'labor' ? fmtHU(hourlyRate) + ' Ft/ó' : fmtHU(Math.round(unitPrice)) + ' Ft'}</td>
          <td class="td-right td-mono">${hours > 0 ? hours.toFixed(2) + ' ó' : '—'}</td>
          <td class="td-price td-right">${fmtHU(Math.round(total))} Ft</td>
        </tr>`
    }).join('')

    // Material table — hidden in labor_only mode
    const materialTableHtml = outputMode !== 'labor_only' && materials.length > 0 ? `
      <div class="section-header">Részletes tételek – Anyagok</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Megnevezés</th>
            <th class="th-center">Mennyiség</th>
            <th class="th-right">Egységár</th>
            <th class="th-right">Munkaóra</th>
            <th class="th-right">Összeg (nettó)</th>
          </tr>
        </thead>
        <tbody>${renderRows(materials)}</tbody>
      </table>` : ''

    // Labor table — always shown
    const laborTableHtml = labors.length > 0 ? `
      <div class="section-header">${outputMode === 'labor_only' ? 'Részletes tételek – Szerelési munka' : 'Részletes tételek – Munka'}</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Megnevezés</th>
            <th class="th-center">Mennyiség</th>
            <th class="th-right">Óradíj</th>
            <th class="th-right">Munkaóra</th>
            <th class="th-right">${outputMode === 'labor_only' ? 'Munkadíj (nettó)' : 'Összeg (nettó)'}</th>
          </tr>
        </thead>
        <tbody>${renderRows(labors)}</tbody>
      </table>` : ''

    detailedSectionHtml = materialTableHtml + laborTableHtml
  }

  // ── OutputMode customer-facing note ──────────────────────────────────────
  const modeNotes = {
    combined: null,
    labor_only: 'Az ajánlat kizárólag a szerelési munkadíjat tartalmazza. Az anyagköltség nem része az ajánlatnak.',
    split_material_labor: 'Az ajánlat az anyag- és munkadíj költségeket külön bontásban tartalmazza.',
  }
  const modeNote = modeNotes[outputMode] || null
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

    /* ── INFO ROW ─────────────────────────────────────────────────────── */
    .info-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 14px; padding-bottom: 14px; border-bottom: 1.5px solid #E5E7EB; margin-bottom: 14px; }
    .info-cell label { font-family: 'DM Mono', monospace; font-size: 6.5pt; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.09em; display: block; margin-bottom: 3px; }
    .info-cell .iv { font-size: 10pt; font-weight: 600; color: #111827; }
    .info-cell .is { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: #6B7280; margin-top: 2px; }

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

    <!-- ── INFO ROW ──────────────────────────────────────────────────── -->
    <div class="info-row">
      <div class="info-cell">
        <label>Projekt neve</label>
        <div class="iv">${escHtml(quote.projectName || '—')}</div>
      </div>
      <div class="info-cell">
        <label>Megrendelő</label>
        <div class="iv">${escHtml(quote.clientName || '—')}</div>
      </div>
      <div class="info-cell">
        <label>Kiállítás dátuma</label>
        <div class="iv">${fmtDate(createdAt)}</div>
        <div class="is">Érvényes ${validity} napig</div>
      </div>
      <div class="info-cell">
        <label>Érvényes</label>
        <div class="iv">${validUntil.toLocaleDateString('hu-HU')}</div>
        <div class="is">-ig</div>
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
        <div class="sig-line">Megrendelő</div>
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

  // ── Open + print ──────────────────────────────────────────────────────────
  const win = window.open('', '_blank', 'width=900,height=1100')
  if (!win) { alert('Engedélyezd a felugró ablakokat a PDF generáláshoz.'); return }
  win.document.write(html)
  win.document.close()
  // Small delay to let Google Fonts load before triggering print dialog
  setTimeout(() => { win.focus(); win.print() }, 900)
}
