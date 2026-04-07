// ─── Takeoff row aggregation logic ───────────────────────────────────────────
// Extracted from TakeoffWorkspace.jsx for testability and reuse.
// Pure functions: no React, no side effects.

/**
 * Build takeoff rows from DXF/PDF recognition results.
 * Groups by asmId, applies overrides, respects wall splits.
 */
export function buildRecognitionRows(effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits) {
  const rowMap = {}
  for (const item of effectiveItems) {
    const asmId = asmOverrides[item.blockName] !== undefined ? asmOverrides[item.blockName] : item.asmId
    if (!asmId) continue
    const splits = wallSplits[asmId] || null
    const qty = splits
      ? Object.values(splits).reduce((s, n) => s + n, 0)
      : (qtyOverrides[asmId] !== undefined ? qtyOverrides[asmId] : (rowMap[asmId]?.qty || 0) + item.qty)
    rowMap[asmId] = { asmId, qty, variantId: variantOverrides[asmId] || null, wallSplits: splits }
  }
  return Object.values(rowMap)
}

/**
 * Build takeoff rows from PDF manual markers.
 * Reconciles wallSplits when marker count changes.
 */
export function buildMarkerRows(pdfMarkers, variantOverrides, wallSplits) {
  if (!pdfMarkers.length) return []
  const rowMap = {}
  const customRows = []
  for (const m of pdfMarkers) {
    // ── Custom markers: each gets its own takeoff row ──
    if (m.sourceType === 'custom') {
      const key = m.customItemId || m.id
      const existing = customRows.find(r => r._customItemId === key)
      if (existing) {
        existing.qty += 1
      } else {
        customRows.push({
          asmId: null,
          _customItemId: key,
          _sourceType: 'custom',
          qty: 1,
          variantId: null,
          wallSplits: null,
          _fromMarkers: true,
        })
      }
      continue
    }
    // ── Assembly markers: existing logic ──
    const asmId = m.asmId || (m.category?.startsWith('ASM-') ? m.category : null)
    if (!asmId) continue
    if (!rowMap[asmId]) rowMap[asmId] = { asmId, qty: 0, variantId: variantOverrides[asmId] || null, _fromMarkers: true }
    rowMap[asmId].qty += 1
  }
  // Reconcile wallSplits
  for (const row of Object.values(rowMap)) {
    const splits = wallSplits[row.asmId]
    if (splits) {
      const splitTotal = Object.values(splits).reduce((s, n) => s + n, 0)
      const diff = row.qty - splitTotal
      if (diff > 0) {
        row.wallSplits = { ...splits, brick: (splits.brick || 0) + diff }
      } else if (diff < 0) {
        const adjusted = { ...splits }
        let toRemove = Math.abs(diff)
        if (adjusted.brick && adjusted.brick > 0) {
          const take = Math.min(adjusted.brick, toRemove)
          adjusted.brick -= take
          toRemove -= take
        }
        if (toRemove > 0) {
          for (const k of Object.keys(adjusted)) {
            if (toRemove <= 0) break
            if (adjusted[k] > 0) {
              const take = Math.min(adjusted[k], toRemove)
              adjusted[k] -= take
              toRemove -= take
            }
          }
        }
        row.wallSplits = adjusted
      } else {
        row.wallSplits = splits
      }
    } else {
      row.wallSplits = null
    }
  }
  return [...Object.values(rowMap), ...customRows]
}

/**
 * Merge recognition rows + marker rows into final takeoff rows.
 * No duplicates — markers add to existing recognition rows.
 */
export function mergeTakeoffRows(recognitionRows, markerRows) {
  const rowMap = {}
  const customRows = []
  for (const row of recognitionRows) {
    rowMap[row.asmId] = { ...row }
  }
  for (const row of markerRows) {
    // Custom rows pass through directly (no merge by asmId)
    if (row._sourceType === 'custom') {
      customRows.push({ ...row })
      continue
    }
    if (rowMap[row.asmId]) {
      const existing = rowMap[row.asmId]
      existing.qty += row.qty
      if (row.wallSplits && existing.wallSplits) {
        const merged = { ...existing.wallSplits }
        for (const [k, v] of Object.entries(row.wallSplits)) {
          merged[k] = (merged[k] || 0) + v
        }
        existing.wallSplits = merged
      } else if (row.wallSplits) {
        existing.wallSplits = { ...row.wallSplits }
      }
    } else {
      rowMap[row.asmId] = { ...row }
    }
  }
  return [...Object.values(rowMap), ...customRows]
}
