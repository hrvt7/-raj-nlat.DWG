// ─── DXF Import Audit ────────────────────────────────────────────────────────
// Pure function: parsedDxf + recognizedItems → structured audit object
// No side effects, no React, no DOM — safe for testing and SSR.
//
// Five quality statuses:
//   GOOD_FOR_AUTO   — DXF has named blocks, most auto-recognized
//   PARTIAL_AUTO    — some blocks recognized, some need manual assignment
//   MANUAL_HEAVY    — blocks exist but recognition failed on most
//   EXPLODED_RISK   — geometry without named blocks (exploded drawing)
//   PARSE_LIMITED   — parse returned minimal/no useful data

// ── Status constants ────────────────────────────────────────────────────────
export const DXF_STATUS = {
  GOOD_FOR_AUTO:  'GOOD_FOR_AUTO',
  PARTIAL_AUTO:   'PARTIAL_AUTO',
  MANUAL_HEAVY:   'MANUAL_HEAVY',
  EXPLODED_RISK:  'EXPLODED_RISK',
  PARSE_LIMITED:  'PARSE_LIMITED',
}

// ── Cable mode constants ────────────────────────────────────────────────────
export const CABLE_MODE = {
  GEOMETRY:    'geometry',     // DXF has cable layers → measured lengths
  MST:         'mst',          // DXF has insert positions → MST estimate
  DEVICE_AVG:  'device_avg',   // only device count → average cable per device
  UNAVAILABLE: 'unavailable',  // no cable data possible
}

// ── Human-readable labels (Hungarian) ───────────────────────────────────────
const STATUS_LABELS = {
  [DXF_STATUS.GOOD_FOR_AUTO]:  { label: 'Automatikus felmérés', emoji: '✅', color: '#06D6A0' },
  [DXF_STATUS.PARTIAL_AUTO]:   { label: 'Részleges felismerés', emoji: '🟡', color: '#FFD166' },
  [DXF_STATUS.MANUAL_HEAVY]:   { label: 'Manuális hozzárendelés szükséges', emoji: '🟠', color: '#FF8C42' },
  [DXF_STATUS.EXPLODED_RISK]:  { label: 'Robbantott rajz (nincs blokk)', emoji: '🔴', color: '#FF6B6B' },
  [DXF_STATUS.PARSE_LIMITED]:  { label: 'Korlátozott elemzés', emoji: '⚪', color: '#888' },
}

const CABLE_MODE_LABELS = {
  [CABLE_MODE.GEOMETRY]:    { label: 'Mért kábelvonalak (DXF rétegből)', confidence: 'magas' },
  [CABLE_MODE.MST]:         { label: 'MST becslés eszközpozíciókból', confidence: 'közepes' },
  [CABLE_MODE.DEVICE_AVG]:  { label: 'Átlagos kábelhossz × eszközszám', confidence: 'alacsony' },
  [CABLE_MODE.UNAVAILABLE]: { label: 'Kábelbecslés nem lehetséges', confidence: 'nincs' },
}

// ── Cable keywords (must match detectDxfCableLengths in TakeoffWorkspace) ───
const CABLE_KEYWORDS = ['CABLE','KABEL','KÁBEL','NYM','NYY','CYKY','YKY','NAYY','H07V','WIRE','VEZETÉK','VEZETEK']

// ── Main audit function ─────────────────────────────────────────────────────
export function computeDxfAudit(parsedDxf, recognizedItems = []) {
  // Guard: no data at all
  if (!parsedDxf || !parsedDxf.success) {
    return {
      status: DXF_STATUS.PARSE_LIMITED,
      statusMeta: STATUS_LABELS[DXF_STATUS.PARSE_LIMITED],
      error: parsedDxf?.error || 'A DXF elemzés sikertelen',
      scores: { blocks: 0, recognition: 0, geometry: 0, cable: 0, units: 0 },
      worked: [],
      missing: ['DXF fájl beolvasás sikertelen'],
      guidance: [{ action: 'retry', label: 'Próbáld újra', description: 'Töltsd fel újra a fájlt vagy exportáld DXF-ként' }],
      cableMode: CABLE_MODE.UNAVAILABLE,
      cableModeMeta: CABLE_MODE_LABELS[CABLE_MODE.UNAVAILABLE],
      stats: { totalBlocks: 0, totalBlockTypes: 0, totalLayers: 0, recognizedPct: 0, highConfPct: 0 },
    }
  }

  const summary = parsedDxf.summary || {}
  const blocks = parsedDxf.blocks || []
  const lengths = parsedDxf.lengths || []
  const inserts = parsedDxf.inserts || []
  const layers = parsedDxf.layers || []
  const units = parsedDxf.units || {}
  const geomBounds = parsedDxf.geomBounds

  // ── Compute dimension scores (0-1) ───────────────────────────────────────

  // Block score: do named blocks exist?
  const totalBlockTypes = summary.total_block_types || new Set(blocks.map(b => b.name)).size
  const totalBlocks = summary.total_blocks || blocks.reduce((s, b) => s + b.count, 0)
  const blockScore = totalBlockTypes === 0 ? 0 : Math.min(1, totalBlockTypes / 5)

  // Recognition score: what fraction of block instances were recognized?
  const recognized = recognizedItems.filter(i => i.asmId && i.confidence >= 0.5)
  const recognizedQty = recognized.reduce((s, i) => s + i.qty, 0)
  const totalRecQty = recognizedItems.reduce((s, i) => s + i.qty, 0)
  const recognitionScore = totalRecQty === 0 ? 0 : recognizedQty / totalRecQty

  // High confidence: fraction of recognized items with confidence >= 0.8
  const highConf = recognizedItems.filter(i => i.confidence >= 0.8)
  const highConfQty = highConf.reduce((s, i) => s + i.qty, 0)
  const highConfPct = totalRecQty === 0 ? 0 : highConfQty / totalRecQty

  // Geometry score: do we have useful line/polyline geometry?
  const hasLines = (parsedDxf.lineGeom?.length || 0) > 0
  const hasPolys = (parsedDxf.polylineGeom?.length || 0) > 0
  const hasInserts = inserts.length > 0
  const geometryScore = [hasLines, hasPolys, hasInserts, !!geomBounds].filter(Boolean).length / 4

  // Cable score: are there cable-related layers with lengths?
  const cableLayers = lengths.filter(l =>
    CABLE_KEYWORDS.some(kw => l.layer.toUpperCase().includes(kw))
  )
  const hasCableGeometry = cableLayers.length > 0 && cableLayers.some(l => l.length > 0)
  const hasCablePositions = inserts.length >= 2
  const cableScore = hasCableGeometry ? 1 : hasCablePositions ? 0.6 : totalBlocks > 0 ? 0.3 : 0

  // Units score: are units reliably known?
  const unitsGuessed = units.name?.includes('guessed') || units.auto_detected
  const unitsScore = !unitsGuessed ? 1 : units.factor ? 0.6 : 0

  const scores = {
    blocks: round2(blockScore),
    recognition: round2(recognitionScore),
    geometry: round2(geometryScore),
    cable: round2(cableScore),
    units: round2(unitsScore),
  }

  // ── Determine cable mode ─────────────────────────────────────────────────
  let cableMode
  if (hasCableGeometry) {
    cableMode = CABLE_MODE.GEOMETRY
  } else if (hasCablePositions) {
    cableMode = CABLE_MODE.MST
  } else if (totalBlocks > 0) {
    cableMode = CABLE_MODE.DEVICE_AVG
  } else {
    cableMode = CABLE_MODE.UNAVAILABLE
  }

  // ── Exploded drawing detection ────────────────────────────────────────────
  // Heuristic: lots of geometry but no named blocks → exploded
  const geomCount = (parsedDxf.lineGeom?.length || 0) + (parsedDxf.polylineGeom?.length || 0)
  const isExploded = totalBlockTypes === 0 && geomCount > 50

  // ── Classify status ──────────────────────────────────────────────────────
  let status
  if (totalBlockTypes === 0 && geomCount === 0 && inserts.length === 0) {
    status = DXF_STATUS.PARSE_LIMITED
  } else if (isExploded) {
    status = DXF_STATUS.EXPLODED_RISK
  } else if (recognitionScore >= 0.7 && totalBlockTypes >= 3) {
    status = DXF_STATUS.GOOD_FOR_AUTO
  } else if (recognitionScore >= 0.3 || (totalBlockTypes >= 2 && recognized.length >= 1)) {
    status = DXF_STATUS.PARTIAL_AUTO
  } else {
    status = DXF_STATUS.MANUAL_HEAVY
  }

  // ── What worked / what's missing ─────────────────────────────────────────
  const worked = []
  const missing = []

  if (totalBlockTypes > 0) worked.push(`${totalBlockTypes} blokkfajta (${totalBlocks} elem) felismerve`)
  else missing.push('Nem találtunk elnevezett blokkokat')

  if (recognized.length > 0) worked.push(`${recognized.length}/${recognizedItems.length} blokkfajta automatikusan hozzárendelve`)
  else if (totalBlockTypes > 0) missing.push('Egyetlen blokk sem ismerhető fel automatikusan — manuális hozzárendelés szükséges')

  if (highConfPct >= 0.8) worked.push('Magas felismerési biztonság')
  else if (highConfPct >= 0.3) worked.push('Részleges felismerési biztonság — ellenőrzés ajánlott')

  if (hasCableGeometry) worked.push(`Kábel geometria: ${cableLayers.length} réteg mért hosszakkal`)
  else if (hasCablePositions) worked.push(`${inserts.length} eszközpozíció → MST kábelbecslés lehetséges`)
  else missing.push('Nincs kábel réteg vagy pozícióadat — csak átlagos becslés lehetséges')

  if (!unitsGuessed) worked.push(`Mértékegység: ${units.name}`)
  else missing.push(`Mértékegység bizonytalan (${units.name}) — ellenőrizd a Beállítás fülön`)

  if (isExploded) missing.push('A rajz valószínűleg robbantva lett exportálva — a blokkok egyedi entitásokra bomlottak')

  if (layers.length > 100) missing.push(`Nagyon sok réteg (${layers.length}) — a rajz összetett, szűrés ajánlott`)

  if (geomBounds) {
    const span = Math.max(geomBounds.width, geomBounds.height)
    const factor = units.factor || 1
    const spanM = span * factor
    if (spanM > 500) missing.push(`Szokatlanul nagy rajzterület (${Math.round(spanM)}m) — lehet több lap egyben`)
    else if (spanM > 0) worked.push(`Rajzterület: ~${spanM < 1 ? (spanM * 1000).toFixed(0) + 'mm' : spanM.toFixed(1) + 'm'}`)
  }

  // ── Guidance: next-step actions ──────────────────────────────────────────
  const guidance = buildGuidance(status, {
    recognizedItems, recognized, isExploded, unitsGuessed, hasCableGeometry, totalBlockTypes,
  })

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    totalBlocks,
    totalBlockTypes,
    totalLayers: layers.length,
    totalInserts: inserts.length,
    lineGeomCount: parsedDxf.lineGeom?.length || 0,
    polyGeomCount: parsedDxf.polylineGeom?.length || 0,
    cableLayerCount: cableLayers.length,
    recognizedCount: recognized.length,
    recognizedPct: round2(recognitionScore * 100),
    highConfPct: round2(highConfPct * 100),
    unitsName: units.name || 'unknown',
    unitsGuessed,
  }

  return {
    status,
    statusMeta: STATUS_LABELS[status],
    scores,
    worked,
    missing,
    guidance,
    cableMode,
    cableModeMeta: CABLE_MODE_LABELS[cableMode],
    stats,
  }
}

// ── Guidance builder ────────────────────────────────────────────────────────
function buildGuidance(status, ctx) {
  const g = []

  if (status === DXF_STATUS.PARSE_LIMITED) {
    g.push({
      action: 'retry',
      label: 'Újrapróbálás',
      description: 'Exportáld a rajzot DXF formátumban (AutoCAD 2010+) és töltsd fel újra',
    })
    return g
  }

  if (status === DXF_STATUS.EXPLODED_RISK) {
    g.push({
      action: 'manual_count',
      label: 'Manuális számlálás',
      description: 'A rajzban nincsenek blokkok — használd a PDF feltöltést és jelöld kézzel az elemeket',
    })
    g.push({
      action: 'reexport',
      label: 'Újraexportálás',
      description: 'Kérd a tervezőt, hogy NE robbantsa a blokkokat exportálás előtt',
    })
    return g
  }

  // Recognition gaps
  const unrecognized = (ctx.recognizedItems || []).filter(i => !i.asmId || i.confidence < 0.5)
  if (unrecognized.length > 0) {
    g.push({
      action: 'review_blocks',
      label: 'Blokkok ellenőrzése',
      tab: 'takeoff',
      description: `${unrecognized.length} blokknév nem ismerhető fel — nyisd meg a Felmérés fület és rendeld hozzá manuálisan`,
    })
  }

  if (ctx.unitsGuessed) {
    g.push({
      action: 'check_units',
      label: 'Mértékegység ellenőrzése',
      tab: 'context',
      description: 'Az egység automatikusan lett meghatározva — ellenőrizd a Beállítás fülön',
    })
  }

  if (!ctx.hasCableGeometry && ctx.totalBlockTypes > 0) {
    g.push({
      action: 'cable_info',
      label: 'Kábel beállítás',
      tab: 'cable',
      description: 'A DXF-ben nincs kábel geometria — a becslés eszközpozíciókból vagy átlagból számolódik',
    })
  }

  // Status-specific
  if (status === DXF_STATUS.GOOD_FOR_AUTO) {
    g.push({
      action: 'proceed',
      label: 'Tovább a kalkulációhoz',
      tab: 'calc',
      description: 'A felmérés készen áll — ellenőrizd és generálj árajánlatot',
    })
  }

  return g
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function round2(n) { return Math.round(n * 100) / 100 }
