// ─── Panel-Assisted Cable Estimate ─────────────────────────────────────────────
// Pure function: device positions + reference panel positions → cable estimate.
// Uses nearest-panel distance for each device with a wiring factor.
// NOT routing — clearly an estimate. Better than average fallback, weaker than MST.
// No side effects, no React — safe for testing.

/**
 * Compute a cable estimate from device positions and reference panel positions.
 *
 * Algorithm:
 *   For each device → find nearest reference panel → straight-line distance × wiring factor.
 *   Minimum cable per device = MIN_CABLE_M (prevents zero-length when device is near panel).
 *   Sum by cable type → total cable estimate.
 *
 * @param {Array} inserts - parsedDxf.inserts (all block INSERT positions)
 * @param {Array} recognizedItems - Recognized block items from recognition pipeline
 * @param {Object} asmOverrides - blockName → asmId overrides
 * @param {Array} referencePanels - Reference panel entries with { x, y, blockName }
 * @param {number} scaleFactor - DXF units to meters conversion factor
 * @returns {object|null} Cable estimate or null if insufficient data
 */
export function computePanelAssistedEstimate(inserts, recognizedItems, asmOverrides, referencePanels, scaleFactor) {
  if (!referencePanels?.length || !inserts?.length) return null

  const panelBlockNames = new Set(referencePanels.map(p => p.blockName))
  const panelPositions = referencePanels.map(p => ({ x: p.x, y: p.y }))

  // Build device list (exclude panel blocks themselves)
  const devices = inserts
    .filter(ins => !panelBlockNames.has(ins.name))
    .map(ins => {
      const rec = (recognizedItems || []).find(r => r.blockName === ins.name)
      const asmId = asmOverrides?.[ins.name] ?? rec?.asmId
      const type = classifyDeviceType(asmId)
      return { type, x: ins.x, y: ins.y }
    })

  if (!devices.length) return null

  // ── Wiring constants ────────────────────────────────────────────────────
  const WIRING_FACTOR = 1.4   // 40% overhead for wall/ceiling routing
  const MIN_CABLE_M   = 2.0   // minimum cable per device (connection overhead)
  const factor = scaleFactor || 0.001 // default: DXF in mm → meters

  // ── Compute per-device cable to nearest panel ──────────────────────────
  const byType = { light: 0, socket: 0, switch: 0, other: 0 }
  let totalDevices = 0

  for (const dev of devices) {
    let minDist = Infinity
    for (const panel of panelPositions) {
      const dx = (dev.x - panel.x) * factor
      const dy = (dev.y - panel.y) * factor
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) minDist = dist
    }

    // Apply wiring factor and minimum cable length
    const cableLen = Math.max(minDist * WIRING_FACTOR, MIN_CABLE_M)
    byType[dev.type] += cableLen
    totalDevices++
  }

  const total = byType.light + byType.socket + byType.switch + byType.other
  if (total <= 0) return null

  const r = v => Math.round(v * 10) / 10

  return {
    cable_total_m: r(total),
    cable_total_m_p50: r(total),
    cable_total_m_p90: null,  // let normalizeCableEstimate compute via p90 multiplier
    cable_by_type: {
      light_m:  r(byType.light),
      socket_m: r(byType.socket),
      switch_m: r(byType.switch),
      other_m:  r(byType.other),
    },
    method: `Panel-alapú becslés (${referencePanels.length} elosztó, ${totalDevices} eszköz)`,
    confidence: 0.62,
    _source: 'panel_assisted',
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyDeviceType(asmId) {
  switch (asmId) {
    case 'ASM-003': return 'light'
    case 'ASM-001': return 'socket'
    case 'ASM-002': return 'switch'
    default: return 'other'
  }
}

/**
 * Quick check: can a panel-assisted estimate be computed?
 * @param {Array} referencePanels
 * @param {Array} inserts
 * @returns {boolean}
 */
export function canComputePanelAssisted(referencePanels, inserts) {
  return !!(referencePanels?.length > 0 && inserts?.length > 0)
}
