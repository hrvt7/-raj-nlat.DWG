/**
 * manualPricingRow — Manual pricing row model for hybrid quote system.
 *
 * V1 design decisions:
 * - manualRows is the edit source of truth (persisted on quote)
 * - items[] is the compatibility/export layer (materialized from manualRows at save)
 * - Derived fields (materialCost, laborCost, lineTotal) are NEVER persisted —
 *   always computed by helpers to prevent editor ↔ totals drift
 * - pricingMode is quote-level ('assembly' | 'manual'), not row-level
 * - Row-level `origin` tracks provenance for traceability
 */

// ─── Row factory ─────────────────────────────────────────────────────────────

let _rowCounter = 0

/**
 * Generate a stable unique row ID.
 * Uses crypto.randomUUID where available, falls back to timestamp + counter.
 */
function generateRowId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'mr-' + crypto.randomUUID().slice(0, 8)
  }
  return 'mr-' + Date.now().toString(36) + '-' + (++_rowCounter).toString(36)
}

/**
 * Create a new manual pricing row with defaults.
 *
 * @param {Partial<ManualPricingRow>} overrides
 * @returns {ManualPricingRow}
 */
export function createManualRow(overrides = {}) {
  return {
    id:                     overrides.id || generateRowId(),
    origin:                 overrides.origin || 'manual_direct',
    type:                   overrides.type || 'material',       // 'material' | 'labor'
    name:                   overrides.name || '',
    qty:                    overrides.qty ?? 1,
    unit:                   overrides.unit || 'db',
    unitPrice:              overrides.unitPrice ?? 0,
    laborHours:             overrides.laborHours ?? 0,
    group:                  overrides.group || '',
    notes:                  overrides.notes || '',
    sourceRefId:            overrides.sourceRefId || null,
    sourcePlanSystemType:   overrides.sourcePlanSystemType || 'general',
    sourcePlanFloor:        overrides.sourcePlanFloor || null,
    sourcePlanFloorLabel:   overrides.sourcePlanFloorLabel || null,
  }
}

// ─── Derived field computation ───────────────────────────────────────────────

/**
 * Compute the material cost for a row.
 * For material rows: qty × unitPrice.
 * For labor rows: 0 (labor cost is computed separately via hourly rate).
 *
 * @param {ManualPricingRow} row
 * @returns {number}
 */
export function rowMaterialCost(row) {
  if (row.type === 'labor') return 0
  return Math.round((row.qty || 0) * (row.unitPrice || 0))
}

/**
 * Compute the labor cost for a row.
 * For labor rows: laborHours × hourlyRate.
 * For material rows: 0.
 *
 * @param {ManualPricingRow} row
 * @param {number} hourlyRate — Ft/h
 * @returns {number}
 */
export function rowLaborCost(row, hourlyRate) {
  if (row.type !== 'labor') return 0
  return Math.round((row.laborHours || 0) * (hourlyRate || 0))
}

/**
 * Compute the line total for a row.
 *
 * @param {ManualPricingRow} row
 * @param {number} hourlyRate — Ft/h
 * @returns {number}
 */
export function rowLineTotal(row, hourlyRate) {
  return rowMaterialCost(row) + rowLaborCost(row, hourlyRate)
}

// ─── Aggregate totals from manual rows ───────────────────────────────────────

/**
 * Compute aggregate totals from an array of manual rows.
 *
 * @param {ManualPricingRow[]} rows
 * @param {number} hourlyRate — Ft/h
 * @returns {{ totalMaterials: number, totalLabor: number, totalHours: number }}
 */
export function computeManualTotals(rows, hourlyRate) {
  let totalMaterials = 0
  let totalLabor = 0
  let totalHours = 0

  for (const row of rows) {
    totalMaterials += rowMaterialCost(row)
    totalLabor += rowLaborCost(row, hourlyRate)
    totalHours += row.type === 'labor' ? (row.laborHours || 0) : 0
  }

  return {
    totalMaterials: Math.round(totalMaterials),
    totalLabor: Math.round(totalLabor),
    totalHours: Math.round(totalHours * 100) / 100,
  }
}

// ─── Materialization: manualRows → items[] ───────────────────────────────────

/**
 * Materialize manual rows into the standard quote items[] shape.
 * This produces the compatibility/export layer that existing PDF/display/totals
 * logic can consume without changes.
 *
 * @param {ManualPricingRow[]} rows
 * @param {number} hourlyRate — Ft/h (needed to compute labor cost for items)
 * @returns {Array} items — same shape as buildSnapshotItems output
 */
export function materializeManualRowsToItems(rows, hourlyRate) {
  return rows.filter(r => r.name && r.name.trim()).map(row => ({
    name:                   row.name,
    code:                   row.sourceRefId || row.id,
    qty:                    row.qty || 0,
    unit:                   row.unit || 'db',
    type:                   row.type || 'material',
    systemType:             row.sourcePlanSystemType || 'general',
    sourcePlanSystemType:   row.sourcePlanSystemType || 'general',
    sourcePlanFloor:        row.sourcePlanFloor || null,
    sourcePlanFloorLabel:   row.sourcePlanFloorLabel || null,
    unitPrice:              row.type === 'labor' ? (hourlyRate || 0) : (row.unitPrice || 0),
    hours:                  row.type === 'labor' ? (row.laborHours || 0) : 0,
    materialCost:           rowMaterialCost(row),
    _fromManual:            true,
    _manualRowId:           row.id,
  }))
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a manual row. Returns array of error strings (empty = valid).
 *
 * @param {ManualPricingRow} row
 * @returns {string[]}
 */
export function validateManualRow(row) {
  const errors = []
  if (!row.name || !row.name.trim()) errors.push('Megnevezés kötelező')
  if (row.qty != null && row.qty < 0) errors.push('Mennyiség nem lehet negatív')
  if (row.unitPrice != null && row.unitPrice < 0) errors.push('Egységár nem lehet negatív')
  if (row.laborHours != null && row.laborHours < 0) errors.push('Munkaóra nem lehet negatív')
  return errors
}
