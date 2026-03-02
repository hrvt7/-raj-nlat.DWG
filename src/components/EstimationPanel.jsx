import React, { useState, useMemo, useCallback } from 'react'
import { COUNT_CATEGORIES, CABLE_TRAY_COLOR } from './DxfViewer/DxfToolbar.jsx'
import { loadAssemblies, loadMaterials, loadWorkItems } from '../data/store.js'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// ═══════════════════════════════════════════════════════════════════════════
// EstimationPanel — Cable estimation + assembly assignment panel
// Shows in a slide-over from the viewer
// ═══════════════════════════════════════════════════════════════════════════

export default function EstimationPanel({
  markers = [],          // [{ x, y, category, color }]
  measurements = [],     // [{ x1, y1, x2, y2, dist }]
  scale = {},            // { factor, calibrated }
  ceilingHeight = 3.0,
  switchHeight = 1.2,
  socketHeight = 0.3,
  onCeilingHeightChange,
  onSwitchHeightChange,
  onSocketHeightChange,
  onGenerateCableRoutes,
  cableRoutes = [],
  onClose,
  onCreateQuote,
  // Lifted state: assignments + quoteOverrides from parent (PdfViewer) for persistence
  assignments = {},
  onAssignmentsChange,
  quoteOverrides = {},
  onQuoteOverridesChange,
}) {
  const [tab, setTab] = useState('summary')

  // Load data stores
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])
  const materials  = useMemo(() => { try { return loadMaterials()  } catch { return [] } }, [])
  const workItems  = useMemo(() => { try { return loadWorkItems()  } catch { return [] } }, [])

  // ── Assembly cost helpers (uses actual components structure) ──
  const getAsmMaterialCost = useCallback((asm) => {
    return (asm.components || [])
      .filter(c => c.itemType === 'material')
      .reduce((sum, c) => {
        const mat = materials.find(m => m.code === c.itemCode)
        return sum + (c.qty || 0) * (mat?.price || 0)
      }, 0)
  }, [materials])

  const getAsmLaborMinutes = useCallback((asm) => {
    return (asm.components || [])
      .filter(c => c.itemType === 'workitem')
      .reduce((sum, c) => {
        const wi = workItems.find(w => w.code === c.itemCode)
        return sum + (c.qty || 0) * (wi?.p50 || 0)
      }, 0)
  }, [workItems])

  const getAsmMaterialCount = useCallback((asm) => {
    return (asm.components || []).filter(c => c.itemType === 'material').length
  }, [])

  // ── Count summary ──
  const countByCategory = useMemo(() => {
    const map = {}
    for (const m of markers) map[m.category] = (map[m.category] || 0) + 1
    return map
  }, [markers])

  const totalMarkers = markers.length
  const panelMarker  = markers.find(m => m.category === 'panel')

  // ── Cable calculations ──
  const cableData = useMemo(() => {
    if (!scale.calibrated || !scale.factor) return null
    if (!panelMarker) return null

    // Cable trays are structural elements — they don't get individual cable runs from the panel
    const devices = markers.filter(m => {
      if (m.category === 'panel') return false
      const catDef = COUNT_CATEGORIES.find(c => c.key === m.category)
      return !catDef?.isCableTray
    })
    if (devices.length === 0) return null

    let totalHorizontal = 0, totalVertical = 0
    const routes = []

    for (const dev of devices) {
      const dx = Math.abs(dev.x - panelMarker.x)
      const dy = Math.abs(dev.y - panelMarker.y)
      const realDist = (dx + dy) * scale.factor

      // Per-category height logic
      let deviceHeight = socketHeight
      if (dev.category === 'switch')   deviceHeight = switchHeight
      else if (dev.category === 'light')    deviceHeight = 0           // ceiling mount
      else if (dev.category === 'junction') deviceHeight = ceilingHeight - 0.3
      else if (dev.category === 'conduit')  deviceHeight = ceilingHeight - 0.1
      else if (dev.category === 'panel')    deviceHeight = ceilingHeight * 0.5

      const verticalRun = (ceilingHeight - deviceHeight) + (ceilingHeight - 0.1)

      totalHorizontal += realDist
      totalVertical   += verticalRun
      routes.push({
        fromX: panelMarker.x, fromY: panelMarker.y,
        toX: dev.x, toY: dev.y,
        horizontal: realDist,
        vertical:   verticalRun,
        total:      realDist + verticalRun,
        category:   dev.category,
      })
    }

    const totalCable     = totalHorizontal + totalVertical
    const wastePercent   = 15
    const totalWithWaste = totalCable * (1 + wastePercent / 100)
    return { routes, totalHorizontal, totalVertical, totalCable, wastePercent, totalWithWaste, deviceCount: devices.length }
  }, [markers, scale, panelMarker, ceilingHeight, switchHeight, socketHeight])

  // ── Cable by category ──
  const cableByCategory = useMemo(() => {
    if (!cableData) return {}
    const map = {}
    for (const r of cableData.routes) {
      if (!map[r.category]) map[r.category] = { count: 0, total: 0 }
      map[r.category].count++
      map[r.category].total += r.total
    }
    return map
  }, [cableData])

  // ── Assignment handlers ──
  const handleAssign = useCallback((category, assemblyId) => {
    onAssignmentsChange?.(prev => ({
      ...prev,
      [category]: { ...(prev[category] || {}), assemblyId: assemblyId || null },
    }))
  }, [onAssignmentsChange])

  const handleOverride = useCallback((category, field, value) => {
    onAssignmentsChange?.(prev => ({
      ...prev,
      [category]: { ...(prev[category] || {}), [field]: value },
    }))
  }, [onAssignmentsChange])

  // ── Cost estimate ──
  const costEstimate = useMemo(() => {
    let totalMaterial = 0, totalLaborMinutes = 0

    for (const cat of Object.keys(countByCategory)) {
      const asgn = assignments[cat]
      if (!asgn?.assemblyId) continue
      const asm = assemblies.find(a => a.id === asgn.assemblyId)
      if (!asm) continue

      const catDef = COUNT_CATEGORIES.find(c => c.key === cat)
      const qty    = countByCategory[cat]
      const ov     = quoteOverrides[cat]

      if (catDef?.isCableTray) {
        // ── Cable tray: use linked measurement totals if available, else count × lengthPerUnit ──
        const linkedMeasures = measurements.filter(m => m.category === cat)
        let totalMeters
        if (linkedMeasures.length > 0 && scale.calibrated && scale.factor) {
          // Sum all measurements tagged with this cable tray category
          totalMeters = linkedMeasures.reduce((sum, m) => sum + m.dist * scale.factor, 0)
        } else {
          // Fallback: manual length-per-piece × count
          const lengthPerUnit = ov?.lengthPerUnit ?? 1
          totalMeters = qty * lengthPerUnit
        }
        const matPerM  = ov?.matPerUnit != null ? ov.matPerUnit : getAsmMaterialCost(asm)
        const labPerM  = ov?.laborMin   != null ? ov.laborMin   : getAsmLaborMinutes(asm)
        totalMaterial     += matPerM * totalMeters
        totalLaborMinutes += labPerM * totalMeters
      } else {
        // ── Regular: piece-based calculation ──
        const matPerUnit = ov?.matPerUnit != null ? ov.matPerUnit : (asgn.materialOverride != null ? asgn.materialOverride : getAsmMaterialCost(asm))
        const labPerUnit = ov?.laborMin   != null ? ov.laborMin   : getAsmLaborMinutes(asm)
        totalMaterial     += matPerUnit * qty
        totalLaborMinutes += labPerUnit * qty
      }
    }

    // Cable cost: 800 Ft/m default (NYM-J 3×2.5 rough)
    const cableTotal   = cableData?.totalWithWaste ?? 0
    const cableCostPm  = quoteOverrides._cablePricePerM ?? 800
    const cableCost    = cableTotal * cableCostPm
    const laborHours   = totalLaborMinutes / 60
    const laborRate    = quoteOverrides._laborRate ?? 9000
    const laborCost    = laborHours * laborRate
    const grandTotal   = totalMaterial + cableCost + laborCost

    return { materialCost: totalMaterial, cableCost, laborMinutes: totalLaborMinutes, laborHours, laborRate, laborCost, totalCable: cableTotal, grandTotal, cableCostPm }
  }, [assignments, quoteOverrides, countByCategory, assemblies, cableData, measurements, scale, getAsmMaterialCost, getAsmLaborMinutes])

  const TABS = [
    { id: 'summary', label: 'Összesítő' },
    { id: 'cables',  label: 'Kábelek'   },
    { id: 'assign',  label: 'Assemblyk' },
    { id: 'quote',   label: 'Kalkuláció'},
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgCard, borderLeft: `1px solid ${C.border}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>Kalkuláció</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '9px 6px', cursor: 'pointer',
            background: 'none', border: 'none', fontSize: 11, fontFamily: 'Syne', fontWeight: 600,
            color: tab === t.id ? C.accent : C.muted,
            borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'summary' && (
          <SummaryTab countByCategory={countByCategory} totalMarkers={totalMarkers} measurements={measurements} scale={scale} cableData={cableData} panelMarker={panelMarker} />
        )}
        {tab === 'cables' && (
          <CablesTab
            cableData={cableData}
            cableByCategory={cableByCategory}
            scale={scale}
            panelMarker={panelMarker}
            countByCategory={countByCategory}
            ceilingHeight={ceilingHeight}
            switchHeight={switchHeight}
            socketHeight={socketHeight}
            onCeilingHeightChange={onCeilingHeightChange}
            onSwitchHeightChange={onSwitchHeightChange}
            onSocketHeightChange={onSocketHeightChange}
          />
        )}
        {tab === 'assign' && (
          <AssignTab
            countByCategory={countByCategory}
            assemblies={assemblies}
            assignments={assignments}
            onAssign={handleAssign}
            onOverride={handleOverride}
            getAsmMaterialCost={getAsmMaterialCost}
            getAsmLaborMinutes={getAsmLaborMinutes}
            getAsmMaterialCount={getAsmMaterialCount}
          />
        )}
        {tab === 'quote' && (
          <QuoteTab
            costEstimate={costEstimate}
            countByCategory={countByCategory}
            assignments={assignments}
            assemblies={assemblies}
            cableData={cableData}
            getAsmMaterialCost={getAsmMaterialCost}
            getAsmLaborMinutes={getAsmLaborMinutes}
            quoteOverrides={quoteOverrides}
            onQuoteOverridesChange={onQuoteOverridesChange}
            onCreateQuote={onCreateQuote}
            measurements={measurements}
            scale={scale}
          />
        )}
      </div>
    </div>
  )
}

// ─── Summary Tab ────────────────────────────────────────────────────────────

function SummaryTab({ countByCategory, totalMarkers, measurements, scale, cableData, panelMarker }) {
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <StatusRow ok={totalMarkers > 0} label={`${totalMarkers} elem bejelölve`} hint="Jelölj be elemeket a tervrajzon" />
        <StatusRow ok={!!panelMarker} label="Elosztó megjelölve" hint='Jelölj be egy elosztó elemet' />
        <StatusRow ok={scale.calibrated} label="Skála kalibrálva" hint='Használd a "Skála" eszközt' />
        <StatusRow ok={!!cableData} label="Kábel számítás kész" hint="Jelölj be elosztót + kalibrálj skálát" />
      </div>

      {totalMarkers > 0 && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Eszközök ({totalMarkers})</div>
          {/* Regular non-cable-tray categories */}
          {COUNT_CATEGORIES.filter(c => !c.isCableTray && countByCategory[c.key]).map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: c.color }}>{c.label}</span>
              </div>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: c.color }}>{countByCategory[c.key]}</span>
            </div>
          ))}
          {/* Cable tray group */}
          {COUNT_CATEGORIES.filter(c => c.isCableTray && countByCategory[c.key]).length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={CABLE_TRAY_COLOR} strokeWidth="2.5"><rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10"/></svg>
                <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 11, color: CABLE_TRAY_COLOR, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kábeltálca</span>
              </div>
              {COUNT_CATEGORIES.filter(c => c.isCableTray && countByCategory[c.key]).map(c => (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 4px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CABLE_TRAY_COLOR, opacity: 0.7 }} />
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: CABLE_TRAY_COLOR }}>{c.label}</span>
                  </div>
                  <span style={{ fontFamily: 'DM Mono', fontWeight: 700, fontSize: 13, color: CABLE_TRAY_COLOR }}>{countByCategory[c.key]} db</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cableData && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Kábel összesítő</div>
          <StatRow label="Vízszintes" value={`${cableData.totalHorizontal.toFixed(1)} m`} />
          <StatRow label="Függőleges" value={`${cableData.totalVertical.toFixed(1)} m`} />
          <StatRow label="Összesen" value={`${cableData.totalCable.toFixed(1)} m`} accent />
          <StatRow label={`+ ${cableData.wastePercent}% hulladék`} value={`${cableData.totalWithWaste.toFixed(1)} m`} />
        </div>
      )}

      {measurements.length > 0 && scale.calibrated && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginTop: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
            Mérések ({measurements.length})
          </div>

          {/* ── Cable tray measurements grouped by category ── */}
          {COUNT_CATEGORIES.filter(c => c.isCableTray).map(c => {
            const linked = measurements.filter(m => m.category === c.key)
            if (!linked.length) return null
            const totalM = linked.reduce((sum, m) => sum + m.dist * scale.factor, 0)
            return (
              <div key={c.key} style={{ marginBottom: 10 }}>
                {/* Category total row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid rgba(255,170,0,0.2)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={CABLE_TRAY_COLOR} strokeWidth="2.5">
                      <rect x="2" y="7" width="20" height="10" rx="1"/>
                      <path d="M6 7v10M10 7v10M14 7v10M18 7v10"/>
                    </svg>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: CABLE_TRAY_COLOR, fontWeight: 700 }}>{c.label}</span>
                  </div>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: CABLE_TRAY_COLOR, fontWeight: 700 }}>{totalM.toFixed(2)} m</span>
                </div>
                {/* Individual segments */}
                {linked.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 3px 14px' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>#{i + 1}</span>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>{(m.dist * scale.factor).toFixed(2)} m</span>
                  </div>
                ))}
              </div>
            )
          })}

          {/* ── Uncategorized (generic) measurements ── */}
          {measurements.filter(m => !m.category).length > 0 && (
            <div style={{ marginTop: measurements.some(m => m.category) ? 8 : 0, paddingTop: measurements.some(m => m.category) ? 8 : 0, borderTop: measurements.some(m => m.category) ? `1px solid ${C.border}` : 'none' }}>
              {measurements.filter(m => !m.category).map((m, i) => (
                <StatRow key={i} label={`Mérés #${i + 1}`} value={`${(m.dist * scale.factor).toFixed(2)} m`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cables Tab ─────────────────────────────────────────────────────────────

function CablesTab({ cableData, cableByCategory, scale, panelMarker, countByCategory, ceilingHeight, switchHeight, socketHeight, onCeilingHeightChange, onSwitchHeightChange, onSocketHeightChange }) {
  if (!scale.calibrated) return <HintBox icon="📐" text='Először kalibráld a skálát a "Skála" eszközzel, hogy a kábelhossz számítás pontos legyen.' />
  if (!panelMarker)      return <HintBox icon="⚡" text='Jelöld be az elosztó(ka)t "Elosztó" kategóriával.' />
  if (!cableData || cableData.routes.length === 0) return <HintBox icon="📍" text="Jelölj be eszközöket a tervrajzon." />

  const hasSockets  = (countByCategory['socket']  || 0) > 0
  const hasSwitches = (countByCategory['switch']   || 0) > 0
  const hasLights   = (countByCategory['light']    || 0) > 0

  return (
    <div>
      {/* Height settings */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Magassági beállítások</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <NumberInput label="Belmagasság (m)" value={ceilingHeight} onChange={onCeilingHeightChange} min={2} max={6} step={0.1} />
          {hasSockets  && <NumberInput label="Dugalj mag. (m)"   value={socketHeight} onChange={onSocketHeightChange} min={0.1} max={1.5} step={0.05} />}
          {hasSwitches && <NumberInput label="Kapcsoló mag. (m)" value={switchHeight} onChange={onSwitchHeightChange} min={0.5} max={2.0} step={0.05} />}
        </div>
        {hasLights && (
          <div style={{ fontSize: 10, color: C.blue, fontFamily: 'DM Mono', marginTop: 8 }}>
            Lámpatest: mennyezeti szerelés (0 m) — automatikus
          </div>
        )}
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Mono', marginTop: 6 }}>
          A rendszer hozzáadja a függőleges kábelhosszt: panel→mennyezet + mennyezet→eszköz.
        </div>
      </div>

      {/* Per-category breakdown */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Kábelhossz kategóriánként</div>
        {COUNT_CATEGORIES.filter(c => cableByCategory[c.key]).map(c => {
          const d = cableByCategory[c.key]
          return (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: c.color }}>{c.label} ({d.count}×)</span>
              </div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 700 }}>{d.total.toFixed(1)} m</span>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginTop: 4 }}>
          <span style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: C.accent }}>Összesen (+ hulladék)</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color: C.accent }}>{cableData.totalWithWaste.toFixed(1)} m</span>
        </div>
      </div>

      {/* Individual routes */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Egyedi útvonalak ({cableData.routes.length})</div>
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          {cableData.routes.map((r, i) => {
            const cat = COUNT_CATEGORIES.find(c => c.key === r.category)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, fontFamily: 'DM Mono' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: cat?.color || C.muted }} />
                <span style={{ color: C.textSub, flex: 1 }}>{cat?.label || r.category} #{i + 1}</span>
                <span style={{ color: C.text }}>H:{r.horizontal.toFixed(1)}m</span>
                <span style={{ color: C.muted }}>V:{r.vertical.toFixed(1)}m</span>
                <span style={{ color: C.yellow, fontWeight: 700 }}>{r.total.toFixed(1)}m</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Assembly Assignment Tab ────────────────────────────────────────────────

function AssignTab({ countByCategory, assemblies, assignments, onAssign, onOverride, getAsmMaterialCost, getAsmLaborMinutes, getAsmMaterialCount }) {
  const [expanded, setExpanded] = useState({}) // { [category]: bool }
  const categories = COUNT_CATEGORIES.filter(c => countByCategory[c.key])

  if (categories.length === 0) return <HintBox icon="📍" text="Jelölj be elemeket a tervrajzon, hogy assembly-ket rendelhess hozzájuk." />

  return (
    <div>
      <div style={{ fontSize: 12, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 16 }}>
        Rendelj assembly-t minden kategóriához az anyag- és munkadíj kalkulációhoz.
      </div>

      {categories.map(c => {
        const count     = countByCategory[c.key]
        const asgn      = assignments[c.key] || {}
        const selectedId = asgn.assemblyId || ''
        const selectedAsm = assemblies.find(a => a.id === selectedId)
        const isExpanded  = expanded[c.key]

        const matCost = selectedAsm
          ? (asgn.materialOverride != null ? asgn.materialOverride : getAsmMaterialCost(selectedAsm))
          : 0
        const laborMin = selectedAsm ? getAsmLaborMinutes(selectedAsm) : 0
        const matCount = selectedAsm ? getAsmMaterialCount(selectedAsm) : 0

        return (
          <div key={c.key} style={{ background: C.bg, border: `1px solid ${isExpanded ? C.accent + '40' : C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: c.isCableTray ? 2 : '50%', background: c.color }} />
                <span style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
              </div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 700 }}>{count} db</span>
            </div>

            {/* Assembly selector */}
            <select
              value={selectedId}
              onChange={e => onAssign(c.key, e.target.value || null)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: C.bgCard, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'DM Mono' }}
            >
              <option value="">— Válassz assembly-t —</option>
              {assemblies.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {/* Assembly info + expand */}
            {selectedAsm && (
              <>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted }}>
                    {matCount} anyagtétel · {laborMin.toFixed(0)} perc munka · {matCost.toLocaleString('hu-HU')} Ft/db
                  </div>
                  <button onClick={() => setExpanded(p => ({ ...p, [c.key]: !p[c.key] }))}
                    style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 10, fontFamily: 'DM Mono', padding: '2px 6px' }}>
                    {isExpanded ? '▲ Kevesebb' : '▼ Részletek'}
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                    {/* Overrides */}
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, marginBottom: 8 }}>Egyedi felülírás (opcionális)</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Anyagköltség (Ft/db)</div>
                        <input
                          type="number" min={0} step={50}
                          value={asgn.materialOverride ?? ''}
                          placeholder={matCost.toFixed(0)}
                          onChange={e => onOverride(c.key, 'materialOverride', e.target.value === '' ? null : parseFloat(e.target.value))}
                          style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bgCard, border: `1px solid ${asgn.materialOverride != null ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Norma perc (perc/db)</div>
                        <input
                          type="number" min={0} step={5}
                          value={asgn.laborMinOverride ?? ''}
                          placeholder={laborMin.toFixed(0)}
                          onChange={e => onOverride(c.key, 'laborMinOverride', e.target.value === '' ? null : parseFloat(e.target.value))}
                          style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bgCard, border: `1px solid ${asgn.laborMinOverride != null ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    {/* Component list */}
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, marginBottom: 6 }}>Assembly tartalma:</div>
                    {(selectedAsm.components || []).map((comp, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 10, fontFamily: 'DM Mono' }}>
                        <span style={{ color: comp.itemType === 'workitem' ? C.yellow : C.blue, minWidth: 24, fontSize: 9 }}>
                          {comp.itemType === 'workitem' ? 'MUN' : 'ANY'}
                        </span>
                        <span style={{ flex: 1, color: C.textSub }}>{comp.name}</span>
                        <span style={{ color: C.muted }}>{comp.qty} {comp.unit}</span>
                      </div>
                    ))}

                    {asgn.materialOverride != null && (
                      <button onClick={() => onOverride(c.key, 'materialOverride', null)}
                        style={{ marginTop: 8, background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono', padding: '3px 8px' }}>
                        ↩ Visszaállítás alapárra
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Quote/Calculation Tab ──────────────────────────────────────────────────

function QuoteTab({ costEstimate, countByCategory, assignments, assemblies, cableData, getAsmMaterialCost, getAsmLaborMinutes, quoteOverrides, onQuoteOverridesChange, onCreateQuote, measurements = [], scale = {} }) {
  const hasAssignments = Object.values(assignments).some(v => v?.assemblyId)

  const setOverride = (key, value) => {
    onQuoteOverridesChange?.(prev => ({ ...prev, [key]: value }))
  }

  const setCatOverride = (catKey, field, value) => {
    onQuoteOverridesChange?.(prev => ({
      ...prev,
      [catKey]: { ...(prev[catKey] || {}), [field]: value },
    }))
  }

  const resetCatOverride = (catKey, field) => {
    onQuoteOverridesChange?.(prev => {
      const catOv = { ...(prev[catKey] || {}) }
      delete catOv[field]
      return { ...prev, [catKey]: catOv }
    })
  }

  const cablePricePerM = quoteOverrides._cablePricePerM ?? 800
  const laborRate      = quoteOverrides._laborRate ?? 9000

  return (
    <div>
      {/* Global rate settings */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Általános díjak</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Kábel ár (Ft/m)</div>
            <input
              type="number" min={0} step={50}
              value={cablePricePerM}
              onChange={e => setOverride('_cablePricePerM', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bgCard, border: `1px solid ${quoteOverrides._cablePricePerM != null ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Munkadíj (Ft/óra)</div>
            <input
              type="number" min={0} step={500}
              value={laborRate}
              onChange={e => setOverride('_laborRate', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bgCard, border: `1px solid ${quoteOverrides._laborRate != null ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      {/* Per-category editable prices */}
      {hasAssignments ? (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Kategóriánkénti árak</div>
          {COUNT_CATEGORIES.filter(c => countByCategory[c.key] && assignments[c.key]?.assemblyId).map(c => {
            const count = countByCategory[c.key]
            const asgn  = assignments[c.key]
            const asm   = assemblies.find(a => a.id === asgn.assemblyId)
            if (!asm) return null

            const defaultMat   = getAsmMaterialCost(asm)
            const defaultLabor = getAsmLaborMinutes(asm)
            const ov           = quoteOverrides[c.key] || {}
            const matPerUnit   = ov.matPerUnit   != null ? ov.matPerUnit   : defaultMat
            const laborMin     = ov.laborMin     != null ? ov.laborMin     : defaultLabor
            const matOverridden = ov.matPerUnit  != null
            const labOverridden = ov.laborMin    != null

            // Cable tray: length-based logic — prefer linked measurements over manual entry
            const isCT = !!c.isCableTray
            const linkedMeasures = isCT ? measurements.filter(m => m.category === c.key) : []
            const hasMeasured    = linkedMeasures.length > 0 && scale.calibrated && scale.factor
            const measuredTotal  = hasMeasured
              ? linkedMeasures.reduce((sum, m) => sum + m.dist * scale.factor, 0)
              : null

            const lengthPerUnit = ov.lengthPerUnit ?? 1          // m per piece (fallback)
            const totalMeters   = hasMeasured ? measuredTotal : count * lengthPerUnit
            const lenOverridden = ov.lengthPerUnit != null

            // Effective unit cost (cable tray = Ft/m; regular = Ft/db)
            const unitTotal = isCT
              ? (matPerUnit * totalMeters)
              : (matPerUnit * count)

            return (
              <div key={c.key} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                {/* Category header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: c.isCableTray ? 2 : '50%', background: c.color }} />
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: c.color, fontWeight: 700 }}>
                      {c.label} × {count} db{isCT ? ` = ${totalMeters.toFixed(2)} m` : ''}{hasMeasured ? ' 📏' : ''}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{asm.name}</span>
                </div>

                {/* Cable tray: show measured total OR manual length-per-piece input */}
                {isCT && (
                  <div style={{ marginBottom: 6 }}>
                    {hasMeasured ? (
                      // Measurement-derived total — shown prominently
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 4, background: 'rgba(255,170,0,0.08)', border: `1px solid rgba(255,170,0,0.3)` }}>
                          <span style={{ fontSize: 11, lineHeight: 1 }}>📏</span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow }}>
                            {linkedMeasures.length} mérés alapján: <strong>{measuredTotal.toFixed(2)} m</strong>
                          </span>
                        </div>
                      </div>
                    ) : (
                      // Fallback: manual length per piece
                      <>
                        <div style={{ fontSize: 9, color: CABLE_TRAY_COLOR, fontFamily: 'DM Mono', marginBottom: 2 }}>Hossz/db (m) — nincs mérés</div>
                        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                          <input
                            type="number" min={0.1} step={0.5}
                            value={lengthPerUnit}
                            onChange={e => setCatOverride(c.key, 'lengthPerUnit', parseFloat(e.target.value) || 1)}
                            style={{ width: 80, padding: '4px 6px', borderRadius: 4, background: C.bgCard, border: `1px solid ${lenOverridden ? CABLE_TRAY_COLOR : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                          />
                          <span style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Mono' }}>m/db → összesen: {totalMeters.toFixed(2)} m</span>
                          {lenOverridden && (
                            <button onClick={() => resetCatOverride(c.key, 'lengthPerUnit')} title="Visszaállítás 1 m/db-re" style={{ padding: '2px 5px', borderRadius: 3, background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 9, flexShrink: 0 }}>↩</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Price inputs */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {/* Material cost per unit/meter */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 2 }}>
                      {isCT ? 'Anyag (Ft/m)' : 'Anyag (Ft/db)'}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <input
                        type="number" min={0} step={50}
                        value={matPerUnit}
                        onChange={e => setCatOverride(c.key, 'matPerUnit', parseFloat(e.target.value) || 0)}
                        style={{ flex: 1, padding: '4px 6px', borderRadius: 4, background: C.bgCard, border: `1px solid ${matOverridden ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box', minWidth: 0 }}
                      />
                      {matOverridden && (
                        <button onClick={() => resetCatOverride(c.key, 'matPerUnit')} title="Visszaállítás assembly alapárra" style={{ padding: '2px 5px', borderRadius: 3, background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 9, flexShrink: 0 }}>↩</button>
                      )}
                    </div>
                  </div>

                  {/* Labor minutes per unit/meter */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 2 }}>
                      {isCT ? 'Norma (perc/m)' : 'Norma (perc/db)'}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <input
                        type="number" min={0} step={5}
                        value={laborMin}
                        onChange={e => setCatOverride(c.key, 'laborMin', parseFloat(e.target.value) || 0)}
                        style={{ flex: 1, padding: '4px 6px', borderRadius: 4, background: C.bgCard, border: `1px solid ${labOverridden ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box', minWidth: 0 }}
                      />
                      {labOverridden && (
                        <button onClick={() => resetCatOverride(c.key, 'laborMin')} title="Visszaállítás assembly normaórára" style={{ padding: '2px 5px', borderRadius: 3, background: 'none', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 9, flexShrink: 0 }}>↩</button>
                      )}
                    </div>
                  </div>

                  {/* Row total */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 2 }}>Összesen</div>
                    <div style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(0,229,160,0.07)', border: `1px solid rgba(0,229,160,0.18)`, fontSize: 11, fontFamily: 'DM Mono', color: C.accent, fontWeight: 700 }}>
                      {unitTotal.toLocaleString('hu-HU')} Ft
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🔗</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono' }}>Rendelj assembly-ket az "Assemblyk" fülön az árak automatikus betöltéséhez</div>
        </div>
      )}

      {/* Grand total summary */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>Összefoglaló</div>
        <StatRow label="Anyagköltség" value={`${costEstimate.materialCost.toLocaleString('hu-HU')} Ft`} />
        <StatRow label={`Kábel (${costEstimate.totalCable.toFixed(0)} m × ${cablePricePerM.toLocaleString('hu-HU')} Ft/m)`} value={`${costEstimate.cableCost.toLocaleString('hu-HU')} Ft`} />
        <StatRow label={`Munkadíj (${costEstimate.laborHours.toFixed(1)} óra × ${laborRate.toLocaleString('hu-HU')} Ft/óra)`} value={`${costEstimate.laborCost.toLocaleString('hu-HU')} Ft`} />
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
          <span style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 800, color: C.accent }}>{costEstimate.grandTotal.toLocaleString('hu-HU')} Ft</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó (27% ÁFA)</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{(costEstimate.grandTotal * 1.27).toLocaleString('hu-HU')} Ft</span>
        </div>
      </div>

      {/* Action */}
      <button
        onClick={() => onCreateQuote?.({ countByCategory, assignments, quoteOverrides, cableData, costEstimate })}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 8, cursor: 'pointer',
          background: C.accent, border: 'none', color: C.bg,
          fontSize: 14, fontFamily: 'Syne', fontWeight: 700, marginBottom: 8,
        }}
      >
        Ajánlat létrehozása →
      </button>
    </div>
  )
}

// ─── Utility components ─────────────────────────────────────────────────────

function StatusRow({ ok, label, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ok ? 'rgba(0,229,160,0.15)' : 'rgba(113,113,122,0.1)', color: ok ? C.accent : C.muted, fontSize: 11 }}>
        {ok ? '✓' : '○'}
      </div>
      <div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: ok ? C.text : C.muted }}>{label}</div>
        {!ok && hint && <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{hint}</div>}
      </div>
    </div>
  )
}

function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: accent ? C.accent : C.textSub }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: accent ? C.accent : C.text, fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  )
}

function HintBox({ icon, text }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

function NumberInput({ label, value, onChange, min, max, step }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted, marginBottom: 4 }}>{label}</div>
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange?.(parseFloat(e.target.value) || min)}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 5, background: C.bgCard, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
      />
    </div>
  )
}
