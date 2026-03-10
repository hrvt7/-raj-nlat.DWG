// ─── Manual Cable Mode + Reference Panel Assist Tests ────────────────────────
// Tests for: reference panel store, panel-assisted estimate, cable audit
// integration, cable model priority, and architecture boundaries.
//
// Covers the 5 smoke scenarios from the sprint brief:
// 1. Open DXF with low confidence → CTA appears → enter manual mode
// 2. Select recognized panel → estimate updates → shows panel_assisted source
// 3. Click block on drawing → manual_panel entry added → estimate recalculates
// 4. Remove all panels → fallback to previous estimate tier
// 5. Reload plan → reference panels restored from planAnnotations

import { describe, it, expect } from 'vitest'

// ── Imports under test ──────────────────────────────────────────────────────
import {
  panelEntryId,
  buildRecognizedPanelEntries,
  buildManualPanelEntries,
  toggleReferencePanelBlock,
} from '../utils/referencePanelStore.js'

import {
  computePanelAssistedEstimate,
  canComputePanelAssisted,
} from '../utils/panelAssistedEstimate.js'

import {
  computeCableAudit,
  CABLE_AUDIT_MODE,
} from '../utils/cableAudit.js'

import {
  CABLE_SOURCE,
  normalizeCableEstimate,
  shouldOverwrite,
} from '../utils/cableModel.js'

// ── Test fixtures ───────────────────────────────────────────────────────────
const MOCK_INSERTS = [
  { name: 'PANEL_1', x: 1000, y: 2000 },
  { name: 'PANEL_1', x: 5000, y: 2000 },
  { name: 'LIGHT_A', x: 1500, y: 3000 },
  { name: 'LIGHT_A', x: 2000, y: 4000 },
  { name: 'SOCKET_B', x: 3000, y: 2500 },
  { name: 'SWITCH_C', x: 4000, y: 3500 },
  { name: 'OTHER_D', x: 4500, y: 1000 },
]

const MOCK_RECOGNIZED = [
  { blockName: 'PANEL_1', qty: 2, asmId: 'ASM-018', confidence: 0.95 },
  { blockName: 'LIGHT_A', qty: 2, asmId: 'ASM-003', confidence: 0.9 },
  { blockName: 'SOCKET_B', qty: 1, asmId: 'ASM-001', confidence: 0.85 },
  { blockName: 'SWITCH_C', qty: 1, asmId: 'ASM-002', confidence: 0.8 },
  { blockName: 'OTHER_D', qty: 1, asmId: null, confidence: 0.5 },
]

const MOCK_REFERENCE_PANELS = [
  { id: 'rpnl_PANEL_1_1000_2000', blockName: 'PANEL_1', x: 1000, y: 2000, label: 'PANEL_1', source: 'recognized_panel' },
  { id: 'rpnl_PANEL_1_5000_2000', blockName: 'PANEL_1', x: 5000, y: 2000, label: 'PANEL_1', source: 'recognized_panel' },
]

const MOCK_PARSED_DXF = {
  success: true,
  blocks: [
    { name: 'PANEL_1', count: 2 },
    { name: 'LIGHT_A', count: 2 },
    { name: 'SOCKET_B', count: 1 },
    { name: 'SWITCH_C', count: 1 },
    { name: 'OTHER_D', count: 1 },
  ],
  lengths: [],
  inserts: MOCK_INSERTS,
  summary: { total_blocks: 7 },
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Reference Panel Store — pure functions
// ═══════════════════════════════════════════════════════════════════════════════
describe('referencePanelStore', () => {
  describe('panelEntryId', () => {
    it('generates stable ID from blockName + position', () => {
      const id = panelEntryId('PANEL_1', 1000.4, 2000.6)
      expect(id).toBe('rpnl_PANEL_1_1000_2001')
    })

    it('different positions produce different IDs', () => {
      const id1 = panelEntryId('PANEL_1', 1000, 2000)
      const id2 = panelEntryId('PANEL_1', 5000, 2000)
      expect(id1).not.toBe(id2)
    })
  })

  describe('buildRecognizedPanelEntries', () => {
    it('creates entries for all matching inserts with recognized_panel source', () => {
      const entries = buildRecognizedPanelEntries('PANEL_1', MOCK_INSERTS)
      expect(entries).toHaveLength(2)
      expect(entries[0].source).toBe('recognized_panel')
      expect(entries[0].blockName).toBe('PANEL_1')
      expect(entries[0].x).toBe(1000)
      expect(entries[1].x).toBe(5000)
    })

    it('returns empty array for non-existent block', () => {
      const entries = buildRecognizedPanelEntries('NONEXISTENT', MOCK_INSERTS)
      expect(entries).toHaveLength(0)
    })

    it('handles null/empty inserts', () => {
      expect(buildRecognizedPanelEntries('PANEL_1', null)).toHaveLength(0)
      expect(buildRecognizedPanelEntries('PANEL_1', [])).toHaveLength(0)
    })
  })

  describe('buildManualPanelEntries', () => {
    it('creates entries with manual_panel source', () => {
      const entries = buildManualPanelEntries('LIGHT_A', MOCK_INSERTS)
      expect(entries).toHaveLength(2)
      expect(entries[0].source).toBe('manual_panel')
      expect(entries[0].blockName).toBe('LIGHT_A')
    })
  })

  describe('toggleReferencePanelBlock', () => {
    it('adds all inserts when block is not yet selected', () => {
      const result = toggleReferencePanelBlock([], 'PANEL_1', MOCK_INSERTS, 'recognized_panel')
      expect(result).toHaveLength(2)
      expect(result[0].blockName).toBe('PANEL_1')
      expect(result[0].source).toBe('recognized_panel')
    })

    it('removes all entries when block is already selected', () => {
      const current = buildRecognizedPanelEntries('PANEL_1', MOCK_INSERTS)
      const result = toggleReferencePanelBlock(current, 'PANEL_1', MOCK_INSERTS)
      expect(result).toHaveLength(0)
    })

    it('preserves entries from other blocks when removing', () => {
      const panelEntries = buildRecognizedPanelEntries('PANEL_1', MOCK_INSERTS)
      const lightEntries = buildManualPanelEntries('LIGHT_A', MOCK_INSERTS)
      const combined = [...panelEntries, ...lightEntries]
      const result = toggleReferencePanelBlock(combined, 'PANEL_1', MOCK_INSERTS)
      expect(result).toHaveLength(2) // only LIGHT_A entries remain
      expect(result.every(p => p.blockName === 'LIGHT_A')).toBe(true)
    })

    it('defaults to manual_panel source', () => {
      const result = toggleReferencePanelBlock([], 'SOCKET_B', MOCK_INSERTS)
      expect(result[0].source).toBe('manual_panel')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Panel-Assisted Estimate — nearest-panel algorithm
// ═══════════════════════════════════════════════════════════════════════════════
describe('panelAssistedEstimate', () => {
  describe('canComputePanelAssisted', () => {
    it('returns true when both panels and inserts exist', () => {
      expect(canComputePanelAssisted(MOCK_REFERENCE_PANELS, MOCK_INSERTS)).toBe(true)
    })

    it('returns false with no panels', () => {
      expect(canComputePanelAssisted([], MOCK_INSERTS)).toBe(false)
    })

    it('returns false with no inserts', () => {
      expect(canComputePanelAssisted(MOCK_REFERENCE_PANELS, [])).toBe(false)
    })

    it('returns false with null', () => {
      expect(canComputePanelAssisted(null, MOCK_INSERTS)).toBe(false)
      expect(canComputePanelAssisted(MOCK_REFERENCE_PANELS, null)).toBe(false)
    })
  })

  describe('computePanelAssistedEstimate', () => {
    it('returns null when no reference panels', () => {
      const result = computePanelAssistedEstimate(MOCK_INSERTS, MOCK_RECOGNIZED, {}, [], 0.001)
      expect(result).toBeNull()
    })

    it('returns null when no inserts', () => {
      const result = computePanelAssistedEstimate([], MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001)
      expect(result).toBeNull()
    })

    it('computes estimate with valid inputs', () => {
      const result = computePanelAssistedEstimate(
        MOCK_INSERTS, MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001
      )
      expect(result).not.toBeNull()
      expect(result.cable_total_m).toBeGreaterThan(0)
      expect(result._source).toBe('panel_assisted')
      expect(result.confidence).toBe(0.62)
    })

    it('excludes panel blocks from device list', () => {
      // Panel blocks (PANEL_1) should not appear as devices
      const result = computePanelAssistedEstimate(
        MOCK_INSERTS, MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001
      )
      // 7 total inserts - 2 PANEL_1 inserts = 5 devices
      expect(result.method).toContain('5 eszköz')
    })

    it('has cable_by_type breakdown', () => {
      const result = computePanelAssistedEstimate(
        MOCK_INSERTS, MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001
      )
      expect(result.cable_by_type).toHaveProperty('light_m')
      expect(result.cable_by_type).toHaveProperty('socket_m')
      expect(result.cable_by_type).toHaveProperty('switch_m')
      expect(result.cable_by_type).toHaveProperty('other_m')
    })

    it('applies wiring factor (cable > straight-line distance)', () => {
      // Create a simple scenario: one panel at origin, one device far away
      const simpleInserts = [
        { name: 'PANEL', x: 0, y: 0 },
        { name: 'LIGHT', x: 10000, y: 0 }, // 10m away at scale 0.001
      ]
      const simplePanels = [{ id: 'p1', blockName: 'PANEL', x: 0, y: 0, source: 'manual_panel' }]
      const simpleRecog = [{ blockName: 'LIGHT', asmId: 'ASM-003' }]
      const result = computePanelAssistedEstimate(
        simpleInserts, simpleRecog, {}, simplePanels, 0.001
      )
      // Straight line = 10m, with 1.4 factor → 14m
      expect(result.cable_total_m).toBeCloseTo(14, 0)
    })

    it('enforces minimum cable length per device', () => {
      // Device right next to panel — should still get MIN_CABLE_M (2.0)
      const nearInserts = [
        { name: 'PANEL', x: 0, y: 0 },
        { name: 'LIGHT', x: 10, y: 0 }, // 0.01m away at scale 0.001 → 0.014m after factor
      ]
      const nearPanels = [{ id: 'p1', blockName: 'PANEL', x: 0, y: 0, source: 'manual_panel' }]
      const result = computePanelAssistedEstimate(
        nearInserts, [{ blockName: 'LIGHT', asmId: 'ASM-003' }], {}, nearPanels, 0.001
      )
      expect(result.cable_total_m).toBeGreaterThanOrEqual(2.0)
    })

    it('uses nearest panel for each device', () => {
      // Two panels, one device closer to second panel
      const inserts = [
        { name: 'P1', x: 0, y: 0 },
        { name: 'P2', x: 10000, y: 0 },
        { name: 'DEVICE', x: 9000, y: 0 }, // 9m from P1, 1m from P2
      ]
      const panels = [
        { id: 'p1', blockName: 'P1', x: 0, y: 0, source: 'manual_panel' },
        { id: 'p2', blockName: 'P2', x: 10000, y: 0, source: 'manual_panel' },
      ]
      const result = computePanelAssistedEstimate(
        inserts, [{ blockName: 'DEVICE', asmId: 'ASM-001' }], {}, panels, 0.001
      )
      // Nearest panel is P2 at 1m → cable = max(1 * 1.4, 2.0) = 2.0
      expect(result.cable_total_m).toBeCloseTo(2.0, 0)
    })

    it('method string includes panel and device counts', () => {
      const result = computePanelAssistedEstimate(
        MOCK_INSERTS, MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001
      )
      expect(result.method).toContain('2 elosztó')
      expect(result.method).toContain('eszköz')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Cable Audit — PANEL_ASSISTED mode integration
// ═══════════════════════════════════════════════════════════════════════════════
describe('cableAudit – PANEL_ASSISTED mode', () => {
  it('CABLE_AUDIT_MODE includes PANEL_ASSISTED', () => {
    expect(CABLE_AUDIT_MODE.PANEL_ASSISTED).toBe('PANEL_ASSISTED')
  })

  it('classifies as PANEL_ASSISTED when reference panels exist', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.cableMode).toBe(CABLE_AUDIT_MODE.PANEL_ASSISTED)
  })

  it('classifies as PANEL_ASSISTED when cableEstimate._source is panel_assisted', () => {
    const est = { cable_total_m: 100, _source: 'panel_assisted' }
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, est, [])
    expect(audit.cableMode).toBe(CABLE_AUDIT_MODE.PANEL_ASSISTED)
  })

  it('DIRECT_GEOMETRY still wins over PANEL_ASSISTED', () => {
    const dxfWithCables = {
      ...MOCK_PARSED_DXF,
      lengths: [{ layer: 'KABEL_01', length: 150, length_raw: 150000 }],
    }
    const audit = computeCableAudit(dxfWithCables, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.cableMode).toBe(CABLE_AUDIT_MODE.DIRECT_GEOMETRY)
  })

  it('falls back to MST when no reference panels and enough inserts', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, [])
    expect(audit.cableMode).toBe(CABLE_AUDIT_MODE.MST_ESTIMATE)
  })

  it('has panelAssistedAvailable flag', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.panelAssistedAvailable).toBe(true)
  })

  it('PANEL_ASSISTED confidence is around 0.60', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.cableConfidence).toBeGreaterThanOrEqual(0.55)
    expect(audit.cableConfidence).toBeLessThanOrEqual(0.70)
  })

  it('PANEL_ASSISTED mode does not escalate to MANUAL_REQUIRED', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.manualCableRecommended).toBe(false)
    expect(audit.cableMode).not.toBe(CABLE_AUDIT_MODE.MANUAL_REQUIRED)
  })

  it('PANEL_ASSISTED has guidance entries', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.guidance.length).toBeGreaterThan(0)
    expect(audit.guidance.some(g => g.action === 'review_estimate')).toBe(true)
  })

  it('PANEL_ASSISTED has mode meta with Hungarian labels', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.cableModeMeta.label).toBe('Elosztó-alapú becslés')
    expect(audit.cableModeMeta.emoji).toBe('🔧')
    expect(audit.cableModeMeta.confidenceLabel).toBe('közepes')
  })

  it('maps PANEL_ASSISTED source correctly', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    expect(audit.cableSource).toBe('panel_assisted')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Cable Model — PANEL_ASSISTED source + priority
// ═══════════════════════════════════════════════════════════════════════════════
describe('cableModel – PANEL_ASSISTED', () => {
  it('CABLE_SOURCE includes PANEL_ASSISTED', () => {
    expect(CABLE_SOURCE.PANEL_ASSISTED).toBe('panel_assisted')
  })

  it('PANEL_ASSISTED normalizes correctly', () => {
    const raw = {
      cable_total_m: 100,
      cable_by_type: { light_m: 40, socket_m: 30, switch_m: 20, other_m: 10 },
      method: 'test',
      confidence: 0.62,
    }
    const normalized = normalizeCableEstimate(raw, CABLE_SOURCE.PANEL_ASSISTED)
    expect(normalized._source).toBe('panel_assisted')
    expect(normalized.cable_total_m).toBe(100)
    // p90 should use 1.25 multiplier
    expect(normalized.cable_total_m_p90).toBe(125)
  })

  it('panel_assisted beats dxf_mst in priority', () => {
    const mst = normalizeCableEstimate(
      { cable_total_m: 80, method: 'MST', confidence: 0.7 },
      CABLE_SOURCE.DXF_MST
    )
    const panel = normalizeCableEstimate(
      { cable_total_m: 100, method: 'panel', confidence: 0.62 },
      CABLE_SOURCE.PANEL_ASSISTED
    )
    // panel_assisted should overwrite dxf_mst
    expect(shouldOverwrite(mst, panel)).toBe(true)
    // dxf_mst should NOT overwrite panel_assisted
    expect(shouldOverwrite(panel, mst)).toBe(false)
  })

  it('panel_assisted beats device_count in priority', () => {
    const devCount = normalizeCableEstimate(
      { cable_total_m: 60, method: 'device', confidence: 0.55 },
      CABLE_SOURCE.DEVICE_COUNT
    )
    const panel = normalizeCableEstimate(
      { cable_total_m: 100, method: 'panel', confidence: 0.62 },
      CABLE_SOURCE.PANEL_ASSISTED
    )
    expect(shouldOverwrite(devCount, panel)).toBe(true)
  })

  it('dxf_layers beats panel_assisted in priority', () => {
    const layers = normalizeCableEstimate(
      { cable_total_m: 120, method: 'layers', confidence: 0.92 },
      CABLE_SOURCE.DXF_LAYERS
    )
    const panel = normalizeCableEstimate(
      { cable_total_m: 100, method: 'panel', confidence: 0.62 },
      CABLE_SOURCE.PANEL_ASSISTED
    )
    // layers should overwrite panel_assisted
    expect(shouldOverwrite(panel, layers)).toBe(true)
    // panel_assisted should NOT overwrite dxf_layers
    expect(shouldOverwrite(layers, panel)).toBe(false)
  })

  it('manual markers (pdf/dxf) beat panel_assisted', () => {
    const markers = normalizeCableEstimate(
      { cable_total_m: 90, method: 'markers', confidence: 0.95 },
      CABLE_SOURCE.PDF_MARKERS
    )
    const panel = normalizeCableEstimate(
      { cable_total_m: 100, method: 'panel', confidence: 0.62 },
      CABLE_SOURCE.PANEL_ASSISTED
    )
    expect(shouldOverwrite(panel, markers)).toBe(true)
    expect(shouldOverwrite(markers, panel)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Architecture Boundaries
// ═══════════════════════════════════════════════════════════════════════════════
describe('architecture boundaries', () => {
  it('panelAssistedEstimate is a pure function (no React, no I/O)', () => {
    // Verify it works purely with data in / data out
    const result = computePanelAssistedEstimate(
      MOCK_INSERTS, MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001
    )
    expect(result).toBeDefined()
    expect(typeof result.cable_total_m).toBe('number')
  })

  it('panel-assisted estimate does NOT claim routing accuracy', () => {
    const result = computePanelAssistedEstimate(
      MOCK_INSERTS, MOCK_RECOGNIZED, {}, MOCK_REFERENCE_PANELS, 0.001
    )
    // Method should say "becslés" (estimate), not "mérés" (measurement)
    expect(result.method.toLowerCase()).toContain('becslés')
    // Confidence should be below 0.7 — not pretending to be accurate
    expect(result.confidence).toBeLessThan(0.7)
  })

  it('cableAudit correctly warns about estimate limitations', () => {
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, MOCK_REFERENCE_PANELS)
    // Should still have warnings since no cable layers exist
    expect(audit.cableWarnings.length).toBeGreaterThan(0)
  })

  it('referencePanelStore functions are pure (no async I/O in toggle/build)', () => {
    // toggle and build functions are synchronous and side-effect-free
    const result = toggleReferencePanelBlock([], 'PANEL_1', MOCK_INSERTS)
    expect(Array.isArray(result)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Smoke Scenarios
// ═══════════════════════════════════════════════════════════════════════════════
describe('smoke scenarios', () => {
  it('Scenario 1: low confidence DXF → MANUAL_REQUIRED with guidance', () => {
    // DXF with very few inserts, no cable layers, no panels → should recommend manual
    const weakDxf = {
      success: true,
      blocks: [{ name: 'THING', count: 2 }],
      lengths: [],
      inserts: [{ name: 'THING', x: 0, y: 0 }],  // only 1 insert — below MST threshold
      summary: { total_blocks: 2 },
    }
    const audit = computeCableAudit(weakDxf, [], null, [])
    // Should be AVERAGE_FALLBACK or MANUAL_REQUIRED
    expect([CABLE_AUDIT_MODE.AVERAGE_FALLBACK, CABLE_AUDIT_MODE.MANUAL_REQUIRED]).toContain(audit.cableMode)
    expect(audit.guidance.some(g => g.action === 'manual_cable')).toBe(true)
  })

  it('Scenario 2: recognized panel → panel_assisted estimate', () => {
    // User selects a recognized panel → builds entries → estimate computed
    const entries = buildRecognizedPanelEntries('PANEL_1', MOCK_INSERTS)
    expect(entries.length).toBe(2)
    const estimate = computePanelAssistedEstimate(
      MOCK_INSERTS, MOCK_RECOGNIZED, {}, entries, 0.001
    )
    expect(estimate).not.toBeNull()
    expect(estimate._source).toBe('panel_assisted')
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, estimate, entries)
    expect(audit.cableMode).toBe(CABLE_AUDIT_MODE.PANEL_ASSISTED)
  })

  it('Scenario 3: manual block click → manual_panel entry added', () => {
    // User clicks a non-panel block → toggleReferencePanelBlock adds it
    const result = toggleReferencePanelBlock([], 'LIGHT_A', MOCK_INSERTS, 'manual_panel')
    expect(result.length).toBe(2) // LIGHT_A has 2 inserts
    expect(result[0].source).toBe('manual_panel')
    expect(result[0].blockName).toBe('LIGHT_A')
    // Estimate can now be computed
    const estimate = computePanelAssistedEstimate(
      MOCK_INSERTS, MOCK_RECOGNIZED, {}, result, 0.001
    )
    expect(estimate).not.toBeNull()
    expect(estimate._source).toBe('panel_assisted')
  })

  it('Scenario 4: remove all panels → fallback to MST or lower', () => {
    // Start with panels → remove → audit falls back
    const panels = buildRecognizedPanelEntries('PANEL_1', MOCK_INSERTS)
    const afterRemove = toggleReferencePanelBlock(panels, 'PANEL_1', MOCK_INSERTS)
    expect(afterRemove).toHaveLength(0)
    // Without panels, estimate returns null
    const estimate = computePanelAssistedEstimate(
      MOCK_INSERTS, MOCK_RECOGNIZED, {}, afterRemove, 0.001
    )
    expect(estimate).toBeNull()
    // Audit without reference panels falls back to MST (enough inserts)
    const audit = computeCableAudit(MOCK_PARSED_DXF, MOCK_RECOGNIZED, null, [])
    expect(audit.cableMode).toBe(CABLE_AUDIT_MODE.MST_ESTIMATE)
  })

  it('Scenario 5: reference panels persist in data model', () => {
    // Build entries → serialize → deserialize → should be identical
    const entries = buildRecognizedPanelEntries('PANEL_1', MOCK_INSERTS)
    const serialized = JSON.stringify(entries)
    const deserialized = JSON.parse(serialized)
    expect(deserialized).toEqual(entries)
    // Can be used to recompute estimate after restore
    const estimate = computePanelAssistedEstimate(
      MOCK_INSERTS, MOCK_RECOGNIZED, {}, deserialized, 0.001
    )
    expect(estimate).not.toBeNull()
    expect(estimate._source).toBe('panel_assisted')
  })
})
