// ─── CSV Export — Quote Line Items ────────────────────────────────────────────
// Exports quote data to a semicolon-separated CSV file with BOM for Excel.
// Fields: tétel, mennyiség, egység, anyag (Ft), munkadíj (Ft), összeg (Ft), ÁFA (Ft), total (Ft)

/**
 * Convert quote items to a CSV string (semicolon-separated, UTF-8 BOM).
 * @param {Object} quote - Quote object from store (items, totalMaterials, totalLabor, gross, etc.)
 * @param {Object} settings - App settings (labor.vat_percent, labor.hourly_rate)
 * @returns {string} CSV content with BOM
 */
export function quoteToCSV(quote, settings) {
  const vatPct = parseFloat(settings?.labor?.vat_percent ?? 27)
  const hourlyRate = parseFloat(quote?.pricingData?.hourlyRate ?? settings?.labor?.hourly_rate ?? 9000)

  // Header row
  const headers = [
    'Tétel',
    'Mennyiség',
    'Egység',
    'Anyagköltség (Ft)',
    'Munkadíj (Ft)',
    'Összeg nettó (Ft)',
    'ÁFA (Ft)',
    'Összeg bruttó (Ft)',
    'Típus',
  ]

  const rows = [headers]

  const items = quote.items || []
  for (const item of items) {
    const matCost   = item.type === 'material' || item.type === 'cable'
      ? Math.round((item.unitPrice || 0) * (item.qty || 0))
      : 0
    const laborCost = item.type === 'labor'
      ? Math.round((item.hours || 0) * hourlyRate)
      : 0
    const net   = matCost + laborCost
    const vat   = Math.round(net * vatPct / 100)
    const gross = net + vat

    rows.push([
      csvEsc(item.name || ''),
      fmtNum(item.qty || 0),
      csvEsc(item.unit || 'db'),
      fmtNum(matCost),
      fmtNum(laborCost),
      fmtNum(net),
      fmtNum(vat),
      fmtNum(gross),
      csvEsc(item.type || 'egyeb'),
    ])
  }

  // Assembly summary rows if available
  if ((quote.assemblySummary || []).length > 0) {
    rows.push([])  // blank row
    rows.push(['=== Munkák összesítő ===', '', '', '', '', '', '', '', ''])
    for (const asm of quote.assemblySummary) {
      const net = Math.round(asm.totalPrice || 0)
      const vat = Math.round(net * vatPct / 100)
      rows.push([
        csvEsc(asm.name || ''),
        fmtNum(asm.qty || 0),
        'db',
        '',
        fmtNum(net),
        fmtNum(net),
        fmtNum(vat),
        fmtNum(net + vat),
        'assembly',
      ])
    }
  }

  // Summary totals
  const totalMat   = Math.round(quote.totalMaterials || 0)
  const totalLabor = Math.round(quote.totalLabor || 0)
  const netTotal   = totalMat + totalLabor
  const vatTotal   = Math.round(netTotal * vatPct / 100)
  const grossTotal = netTotal + vatTotal

  rows.push([])  // blank row
  rows.push([
    'ÖSSZESEN',
    '',
    '',
    fmtNum(totalMat),
    fmtNum(totalLabor),
    fmtNum(netTotal),
    fmtNum(vatTotal),
    fmtNum(grossTotal),
    '',
  ])

  // Join with semicolons, lines with CRLF, prepend BOM
  const BOM = '\uFEFF'
  const csvContent = BOM + rows.map(r => r.join(';')).join('\r\n')
  return csvContent
}

/**
 * Trigger a browser download of the CSV content.
 * @param {string} csvContent
 * @param {string} filename
 */
export function downloadCSV(csvContent, filename = 'arajanlat.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
}

/**
 * One-shot: build CSV from quote + trigger download.
 * @param {Object} quote
 * @param {Object} settings
 */
export function exportQuoteCSV(quote, settings) {
  const projectSlug = (quote.projectName || 'arajanlat')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .substring(0, 40)
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `${projectSlug}_${dateStr}.csv`
  const csv = quoteToCSV(quote, settings)
  downloadCSV(csv, filename)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Escape a value for CSV: wrap in quotes if it contains semicolons, quotes, or newlines */
function csvEsc(val) {
  const s = String(val ?? '')
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** Format a number — safe against NaN/Infinity/undefined */
function fmtNum(n) {
  const num = Number(n)
  return Number.isFinite(num) ? String(Math.round(num)) : '0'
}
