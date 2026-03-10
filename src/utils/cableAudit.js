// ─── Cable Audit + Confidence Transparency ───────────────────────────────────
// Pure function: parsedDxf + recognizedItems + cableEstimate → cable audit object.
// No side effects, no React — safe for testing.
//
// Five cable modes:
//   DIRECT_GEOMETRY  — DXF has cable-named layers with measured lengths
//   MST_ESTIMATE     — device positions exist → MST graph-based estimate
//   AVERAGE_FALLBACK — only device count × average cable per type
//   UNAVAILABLE      — nothing usable for cable estimation
//   MANUAL_REQUIRED  — confidence too low, manual cable mode recommended

// ── Cable mode constants ─────────────────────────────────────────────────────
export const CABLE_AUDIT_MODE = {
  DIRECT_GEOMETRY:  'DIRECT_GEOMETRY',
  PANEL_ASSISTED:   'PANEL_ASSISTED',
  MST_ESTIMATE:     'MST_ESTIMATE',
  AVERAGE_FALLBACK: 'AVERAGE_FALLBACK',
  UNAVAILABLE:      'UNAVAILABLE',
  MANUAL_REQUIRED:  'MANUAL_REQUIRED',
}

// ── Keywords (aligned with TakeoffWorkspace detectDxfCableLengths) ───────────
const CABLE_KEYWORDS = [
  'KABEL','CABLE','NYM','NYY','CYKY','YKY','NAYY','H07V','WIRE',
  'VEZETÉK','VEZETEK','VILLAMOS','ARAM',
]

const PANEL_KEYWORDS = [
  'PANEL','DB_PANEL','ELOSZTO','ELOSZTÓ','MDB','SZEKRÉNY','SZEKRENY',
  'DISTRIBUTION','BOARD','TABLOU','HAUPTVERTEIL','VERTEILER',
]

// ── Human-readable labels (Hungarian) ────────────────────────────────────────
const MODE_META = {
  [CABLE_AUDIT_MODE.DIRECT_GEOMETRY]: {
    label: 'Közvetlen geometria',
    emoji: '📏',
    explanation: 'Kábelhossz közvetlenül rajzi geometriából számolva.',
    confidenceLabel: 'magas',
  },
  [CABLE_AUDIT_MODE.PANEL_ASSISTED]: {
    label: 'Elosztó-alapú becslés',
    emoji: '🔧',
    explanation: 'Kábelhossz referenciaelosztó–eszköz távolságból becsülve. Pontosabb, mint az átlagos becslés, de nem nyomvonal-alapú.',
    confidenceLabel: 'közepes',
  },
  [CABLE_AUDIT_MODE.MST_ESTIMATE]: {
    label: 'Pozícióalapú becslés',
    emoji: '🌐',
    explanation: 'Kábelhossz pozícióalapú becslésből (MST) számolva.',
    confidenceLabel: 'közepes',
  },
  [CABLE_AUDIT_MODE.AVERAGE_FALLBACK]: {
    label: 'Átlagos becslés',
    emoji: '📊',
    explanation: 'Kábelhossz átlagos fallback alapján becsült — eszközszám × átlag kábelhossz.',
    confidenceLabel: 'alacsony',
  },
  [CABLE_AUDIT_MODE.UNAVAILABLE]: {
    label: 'Nem elérhető',
    emoji: '—',
    explanation: 'Nem találtunk használható kábelréteget vagy pozícióadatot.',
    confidenceLabel: 'nincs',
  },
  [CABLE_AUDIT_MODE.MANUAL_REQUIRED]: {
    label: 'Kézi kábelmód javasolt',
    emoji: '✋',
    explanation: 'Nem találtunk használható kábelréteget vagy referenciaelosztót. Kézi kábelmód javasolt.',
    confidenceLabel: 'nincs',
  },
}

// ── Main cable audit function ────────────────────────────────────────────────
/**
 * Compute a structured cable audit from parsed DXF data.
 *
 * @param {object|null} parsedDxf - Output of dxfParser
 * @param {Array} recognizedItems - Recognized block items from recognition pipeline
 * @param {object|null} cableEstimate - Current cable estimate from state (optional, for source awareness)
 * @returns {object} Cable audit object
 */
export function computeCableAudit(parsedDxf, recognizedItems = [], cableEstimate = null, referencePanels = []) {
  // Guard: no data
  if (!parsedDxf || !parsedDxf.success) {
    return buildResult(CABLE_AUDIT_MODE.UNAVAILABLE, {
      cableWarnings: ['DXF elemzés sikertelen — kábelbecslés nem lehetséges'],
    })
  }

  const lengths = parsedDxf.lengths || []
  const blocks = parsedDxf.blocks || []
  const inserts = parsedDxf.inserts || []
  const summary = parsedDxf.summary || {}
  const totalBlocks = summary.total_blocks || blocks.reduce((s, b) => s + b.count, 0)

  // ── Cable layer detection ────────────────────────────────────────────────
  const cableLayers = lengths.filter(l =>
    l.length > 0 && CABLE_KEYWORDS.some(kw => (l.layer || '').toUpperCase().includes(kw))
  )
  const hasCableLikeLayers = cableLayers.length > 0
  const cableLayerCount = cableLayers.length
  const totalCableLengthM = cableLayers.reduce((s, l) => s + l.length, 0)

  // ── Panel / reference block detection ────────────────────────────────────
  const panelBlocks = blocks.filter(b =>
    PANEL_KEYWORDS.some(kw => (b.name || '').toUpperCase().includes(kw))
  )
  const hasPanelLikeBlocks = panelBlocks.length > 0
  const panelCount = panelBlocks.reduce((s, b) => s + b.count, 0)

  // Also check recognized items for panel assemblies (ASM-018)
  const recognizedPanels = recognizedItems.filter(i => i.asmId === 'ASM-018')
  const hasRecognizedPanels = recognizedPanels.length > 0
  const recognizedPanelCount = recognizedPanels.reduce((s, i) => s + i.qty, 0)

  // Effective panel awareness: either from block name patterns or recognition
  const effectiveHasPanels = hasPanelLikeBlocks || hasRecognizedPanels
  const effectivePanelCount = Math.max(panelCount, recognizedPanelCount)

  // ── Reference panel data (manual cable mode) ────────────────────────────
  const userReferencePanels = referencePanels || []
  const hasUserReferencePanels = userReferencePanels.length > 0
  const panelAssistedAvailable = hasUserReferencePanels && inserts.length >= 1

  // ── Availability flags ───────────────────────────────────────────────────
  const geometryLengthAvailable = hasCableLikeLayers && totalCableLengthM > 0
  const mstEstimateAvailable = inserts.length >= 2
  const averageFallbackAvailable = totalBlocks > 0

  // ── Classify cable mode ──────────────────────────────────────────────────
  // If estimate is panel_assisted (from manual cable mode), honor that source
  let cableMode
  if (geometryLengthAvailable) {
    cableMode = CABLE_AUDIT_MODE.DIRECT_GEOMETRY
  } else if (panelAssistedAvailable || cableEstimate?._source === 'panel_assisted') {
    cableMode = CABLE_AUDIT_MODE.PANEL_ASSISTED
  } else if (mstEstimateAvailable) {
    cableMode = CABLE_AUDIT_MODE.MST_ESTIMATE
  } else if (averageFallbackAvailable) {
    cableMode = CABLE_AUDIT_MODE.AVERAGE_FALLBACK
  } else {
    cableMode = CABLE_AUDIT_MODE.UNAVAILABLE
  }

  // ── Compute confidence (0-1) ─────────────────────────────────────────────
  let cableConfidence = computeConfidence(cableMode, {
    effectiveHasPanels, cableLayerCount, inserts, totalBlocks,
  })

  // ── Determine cable source (from actual estimate if available) ───────────
  const cableSource = cableEstimate?._source || mapModeToSource(cableMode)

  // ── Build warnings ───────────────────────────────────────────────────────
  const cableWarnings = []

  if (!hasCableLikeLayers) {
    cableWarnings.push('Nincs kábel nevű réteg a DXF-ben — közvetlen hosszmérés nem lehetséges')
  }

  if (!effectiveHasPanels) {
    cableWarnings.push('Nem található referencia elosztó (panel) blokk — a becslés bizonytalanabb')
  }

  if (cableMode === CABLE_AUDIT_MODE.AVERAGE_FALLBACK) {
    cableWarnings.push('Kábelhossz csak átlagos becsléssel elérhető — az érték tájékoztató jellegű')
  }

  if (cableMode === CABLE_AUDIT_MODE.MST_ESTIMATE && !effectiveHasPanels) {
    cableWarnings.push('MST becslés elosztó nélkül — a tényleges útvonalhossz eltérhet')
  }

  if (inserts.length >= 2 && inserts.length < 5 && cableMode === CABLE_AUDIT_MODE.MST_ESTIMATE) {
    cableWarnings.push('Kevés eszközpozíció az MST becsléshez — az eredmény pontatlan lehet')
  }

  // ── Escalate to MANUAL_REQUIRED if confidence is too low ─────────────────
  // Never escalate if panel-assisted mode is active (user is already in manual cable mode)
  const manualCableRecommended = cableMode !== CABLE_AUDIT_MODE.PANEL_ASSISTED && (
    cableConfidence < 0.35 ||
    cableMode === CABLE_AUDIT_MODE.UNAVAILABLE ||
    (cableMode === CABLE_AUDIT_MODE.AVERAGE_FALLBACK && !effectiveHasPanels)
  )

  if (manualCableRecommended && cableMode !== CABLE_AUDIT_MODE.UNAVAILABLE) {
    cableMode = CABLE_AUDIT_MODE.MANUAL_REQUIRED
    cableConfidence = 0
  } else if (cableMode === CABLE_AUDIT_MODE.UNAVAILABLE) {
    cableConfidence = 0
  }

  // ── Build recovery guidance ──────────────────────────────────────────────
  const guidance = buildCableGuidance(cableMode, {
    hasCableLikeLayers, effectiveHasPanels, mstEstimateAvailable, averageFallbackAvailable,
  })

  return buildResult(cableMode, {
    hasCableLikeLayers,
    cableLayerCount,
    hasPanelLikeBlocks: effectiveHasPanels,
    panelCount: effectivePanelCount,
    cableConfidence: round2(cableConfidence),
    cableSource,
    cableWarnings,
    manualCableRecommended,
    geometryLengthAvailable,
    panelAssistedAvailable,
    mstEstimateAvailable,
    averageFallbackAvailable,
    guidance,
    stats: {
      totalCableLengthM: round1(totalCableLengthM),
      insertsCount: inserts.length,
      totalBlocks,
      panelBlocks: panelBlocks.map(b => b.name),
      recognizedPanelCount,
    },
  })
}

// ── Confidence calculator ────────────────────────────────────────────────────
function computeConfidence(mode, ctx) {
  switch (mode) {
    case CABLE_AUDIT_MODE.DIRECT_GEOMETRY: {
      let c = 0.9
      if (!ctx.effectiveHasPanels) c -= 0.1  // no reference point → less certain
      if (ctx.cableLayerCount >= 3) c += 0.05 // more layers → more reliable
      return clamp(c, 0, 1)
    }
    case CABLE_AUDIT_MODE.PANEL_ASSISTED: {
      let c = 0.60
      if (ctx.inserts.length < 5) c -= 0.05    // few devices → less reliable
      if (ctx.inserts.length >= 20) c += 0.05   // many devices → better coverage
      return clamp(c, 0, 1)
    }
    case CABLE_AUDIT_MODE.MST_ESTIMATE: {
      let c = 0.7
      if (!ctx.effectiveHasPanels) c -= 0.15  // no panel as hub → weaker tree
      if (ctx.inserts.length < 5) c -= 0.1     // few positions → rough estimate
      if (ctx.inserts.length >= 20) c += 0.05  // many positions → better coverage
      return clamp(c, 0, 1)
    }
    case CABLE_AUDIT_MODE.AVERAGE_FALLBACK: {
      let c = 0.4
      if (!ctx.effectiveHasPanels) c -= 0.15   // no hub → even weaker
      if (ctx.totalBlocks < 5) c -= 0.1        // very few devices → unreliable
      return clamp(c, 0, 1)
    }
    default:
      return 0
  }
}

// ── Cable guidance builder ───────────────────────────────────────────────────
function buildCableGuidance(mode, ctx) {
  const g = []

  switch (mode) {
    case CABLE_AUDIT_MODE.DIRECT_GEOMETRY:
      if (!ctx.effectiveHasPanels) {
        g.push({
          action: 'add_panel',
          label: 'Elosztó megjelölése',
          tab: 'takeoff',
          description: 'Jelöld meg a referencia elosztót a pontosabb kábelbecsléshez',
        })
      }
      g.push({
        action: 'review_cable',
        label: 'Kábel ellenőrzése',
        tab: 'cable',
        description: 'Ellenőrizd a mért kábelhosszakat a Kábel fülön',
      })
      break

    case CABLE_AUDIT_MODE.PANEL_ASSISTED:
      g.push({
        action: 'review_estimate',
        label: 'Becslés ellenőrzése',
        tab: 'cable',
        description: 'Ellenőrizd az elosztó-alapú kábelbecslést',
      })
      g.push({
        action: 'add_panel',
        label: 'További elosztó hozzáadása',
        tab: 'cable',
        description: 'Több elosztó megjelölésével pontosabb az eredmény',
      })
      break

    case CABLE_AUDIT_MODE.MST_ESTIMATE:
      if (!ctx.effectiveHasPanels) {
        g.push({
          action: 'add_panel',
          label: 'Elosztó megjelölése',
          tab: 'takeoff',
          description: 'Az MST becslés pontosabb, ha van referencia elosztó — jelöld meg a tervrajzon',
        })
      }
      g.push({
        action: 'review_estimate',
        label: 'Becslés ellenőrzése',
        tab: 'cable',
        description: 'Ellenőrizd a pozícióalapú kábelbecslést',
      })
      break

    case CABLE_AUDIT_MODE.AVERAGE_FALLBACK:
      g.push({
        action: 'manual_cable',
        label: 'Kézi kábelmód indítása',
        tab: 'cable',
        description: 'Az átlagos becslés gyenge — használd a kézi kábelmódot a pontos értékekhez',
      })
      g.push({
        action: 'review_estimate',
        label: 'Becslés megtekintése',
        tab: 'cable',
        description: 'Tekintsd meg az átlagos kábelbecslést',
      })
      break

    case CABLE_AUDIT_MODE.MANUAL_REQUIRED:
      g.push({
        action: 'manual_cable',
        label: 'Kézi kábelmód indítása',
        tab: 'cable',
        description: 'A kábelbecslés bizonytalansága magas — kézi megadás javasolt',
      })
      if (!ctx.hasCableLikeLayers) {
        g.push({
          action: 'reexport',
          label: 'Újraexportálás kábel rétegekkel',
          description: 'Kérd a tervezőt, hogy exportálja a kábelrétegeket is a DXF-be',
        })
      }
      break

    case CABLE_AUDIT_MODE.UNAVAILABLE:
      g.push({
        action: 'manual_cable',
        label: 'Kézi kábelmód indítása',
        tab: 'cable',
        description: 'Nincs felhasználható kábel adat — add meg kézzel a kábelhosszakat',
      })
      break
  }

  return g
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapModeToSource(mode) {
  switch (mode) {
    case CABLE_AUDIT_MODE.DIRECT_GEOMETRY:  return 'dxf_layers'
    case CABLE_AUDIT_MODE.PANEL_ASSISTED:   return 'panel_assisted'
    case CABLE_AUDIT_MODE.MST_ESTIMATE:     return 'dxf_mst'
    case CABLE_AUDIT_MODE.AVERAGE_FALLBACK: return 'device_count'
    default: return 'none'
  }
}

function buildResult(cableMode, overrides = {}) {
  return {
    cableMode,
    cableModeMeta: MODE_META[cableMode],
    hasCableLikeLayers: false,
    cableLayerCount: 0,
    hasPanelLikeBlocks: false,
    panelCount: 0,
    cableConfidence: 0,
    cableSource: mapModeToSource(cableMode),
    cableWarnings: [],
    manualCableRecommended: cableMode === CABLE_AUDIT_MODE.UNAVAILABLE || cableMode === CABLE_AUDIT_MODE.MANUAL_REQUIRED,
    geometryLengthAvailable: false,
    panelAssistedAvailable: false,
    mstEstimateAvailable: false,
    averageFallbackAvailable: false,
    guidance: [],
    stats: { totalCableLengthM: 0, insertsCount: 0, totalBlocks: 0, panelBlocks: [], recognizedPanelCount: 0 },
    ...overrides,
  }
}

function round1(n) { return Math.round(n * 10) / 10 }
function round2(n) { return Math.round(n * 100) / 100 }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
