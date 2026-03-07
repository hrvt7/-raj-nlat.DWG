// ─── BOM Export — Internal Bill of Materials (CSV) ────────────────────────────
// Exports aggregated material + cable items from a quote snapshot.
// Independent of customer-facing outputMode — always exports the full BOM.

/** Aggregate material/cable items from quote.items.
 *  Primary key: code + unit (stable material identifier).
 *  Fallback key: name + unit (for old quotes without code). */
export function generateBOMRows(quote) {
  const items = (quote.items || []).filter(
    i => i.type === 'material' || i.type === 'cable'
  )

  // Aggregate: prefer code+unit if code exists, otherwise name+unit
  const map = new Map()
  for (const item of items) {
    const code = (item.code || '').trim()
    const name = (item.name || '').trim()
    const unit = (item.unit || 'db').trim().toLowerCase()
    const key = code
      ? `code::${code.toLowerCase()}||${unit}`
      : `name::${name.toLowerCase()}||${unit}`
    const prev = map.get(key)
    const mc = item.materialCost != null ? item.materialCost : ((item.unitPrice || 0) * (item.qty || 0))
    if (prev) {
      prev.qty += item.qty || 0
      prev.materialCost += mc
    } else {
      map.set(key, {
        name,
        code,
        qty: item.qty || 0,
        unit: (item.unit || 'db').trim(),
        materialCost: mc,
      })
    }
  }

  // Build rows with weighted-average unit price
  const rows = []
  for (const r of map.values()) {
    rows.push({
      name: r.name,
      qty: r.qty,
      unit: r.unit,
      unitPrice: r.qty > 0 ? Math.round(r.materialCost / r.qty) : 0,
      materialCost: Math.round(r.materialCost),
    })
  }
  return rows
}

/** Build CSV string and trigger download. */
export function exportBOM(quote) {
  const rows = generateBOMRows(quote)
  if (rows.length === 0) return

  const headers = ['Cikkszám', 'Megnevezés', 'Mennyiség', 'Egység', 'Egységár (Ft nettó)', 'Összeg (Ft nettó)']
  const lines = [headers]

  for (const r of rows) {
    lines.push([
      csvEsc(r.code),
      csvEsc(r.name),
      fmtNum(r.qty, 2),
      csvEsc(r.unit),
      String(r.unitPrice),
      String(r.materialCost),
    ])
  }

  // Summary row — own aggregate, NOT the customer-facing KPI
  const totalMat = rows.reduce((s, r) => s + r.materialCost, 0)
  lines.push([])
  lines.push(['', 'ÖSSZESEN', '', '', '', String(totalMat)])

  const BOM = '\uFEFF'
  const csv = BOM + lines.map(r => r.join(';')).join('\r\n')

  // Filename
  const slug = (quote.projectName || 'arajanlat')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').substring(0, 40)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `${slug}_BOM_${date}.csv`

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function csvEsc(val) {
  const s = String(val ?? '')
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function fmtNum(n, decimals = 0) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0'
  return decimals > 0 ? num.toFixed(decimals) : String(Math.round(num))
}
