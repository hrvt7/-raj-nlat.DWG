import React, { useState, useMemo, useCallback } from 'react'
import { COUNT_CATEGORIES, CABLE_TRAY_COLOR } from './DxfViewer/DxfToolbar.jsx'
import { loadAssemblies, loadMaterials, loadWorkItems, loadSettings, trackAsmUsage } from '../data/store.js'
import { getAssemblyComponents, calcProductivityFactor, getComponentQty } from '../data/workItemsDb.js'
import { saveCategoryAssemblyDefault } from '../data/categoryAssemblyMap.js'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
  orange: '#FF8C42',
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
  // Callback to retroactively assign cable tray category to an existing measurement by index
  onMeasureCategoryChange,
}) {
  const [tab, setTab] = useState('summary')

  // Load data stores
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])
  const materials  = useMemo(() => { try { return loadMaterials()  } catch { return [] } }, [])
  const workItems  = useMemo(() => { try { return loadWorkItems()  } catch { return [] } }, [])
  const settings   = useMemo(() => { try { return loadSettings()   } catch { return {} } }, [])

  // ── Assembly cost helpers (uses actual components structure) ──
  const getAsmMaterialCost = useCallback((asm, vars = {}) => {
    // 1.3 Hulladékfaktor: waste_pct per component increases order quantity
    return (asm.components || [])
      .filter(c => c.itemType === 'material')
      .reduce((sum, c) => {
        const mat = materials.find(m => m.code === c.itemCode)
        if (!mat) return sum
        const baseQty  = getComponentQty(c, vars)                          // 1.2 formula
        const wasteMul = 1 + (c.waste_pct || 0) / 100                     // 1.3 waste
        const finalPrice = mat.price * (1 - (mat.discount || 0) / 100)    // discount applied
        return sum + baseQty * wasteMul * finalPrice
      }, 0)
  }, [materials])

  const getAsmLaborMinutes = useCallback((asm, vars = {}, productivityFactor = 1) => {
    // 1.1 Per-item normaóra: p50 (normál) vagy p90 (nehéz) a difficulty_mode alapján
    const diffMode = settings?.labor?.difficulty_mode || 'normal'
    return (asm.components || [])
      .filter(c => c.itemType === 'workitem')
      .reduce((sum, c) => {
        const wi = workItems.find(w => w.code === c.itemCode)
        if (!wi) return sum
        // Select base labor column
        const baseMinutes = diffMode === 'very_difficult' ? (wi.p90 || wi.p50 || 0)
                          : diffMode === 'difficult'       ? Math.round(((wi.p50 || 0) + (wi.p90 || wi.p50 || 0)) / 2)
                          : (wi.p50 || 0)
        const qty = getComponentQty(c, vars)                               // 1.2 formula
        return sum + qty * baseMinutes * productivityFactor                // 1.5 NECA factor
      }, 0)
  }, [workItems, settings])

  const getAsmMaterialCount = useCallback((asm) => {
    return (asm.components || []).filter(c => c.itemType === 'material').length
  }, [])

  // ── Count summary ──
  const countByCategory = useMemo(() => {
    const map = {}
    for (const m of markers) map[m.category] = (map[m.category] || 0) + 1
    return map
  }, [markers])

  // ── Count by assembly ID (unified source of truth for pricing) ──
  // Groups markers by their asmId. Markers without asmId fall back to
  // the assignments dict (for detection markers or legacy data).
  const countByAsmId = useMemo(() => {
    const map = {}  // { [asmId]: { qty, category } }
    for (const m of markers) {
      if (m.category === 'panel') continue  // panel is reference only
      const asmId = m.asmId || assignments[m.category]?.assemblyId
      if (!asmId) continue
      if (!map[asmId]) map[asmId] = { qty: 0, category: m.category }
      map[asmId].qty += 1
    }
    return map
  }, [markers, assignments])

  const totalMarkers = markers.length
  const panelMarker  = markers.find(m => m.category === 'panel')

  // ── Cable calculations ──
  // Device connection allowance: extra cable needed at the device end (not in floor plan distance)
  const DEVICE_CABLE_ALLOWANCE_M = { switch: 0.3, socket: 0.3 }

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

    let totalHorizontal = 0, totalVertical = 0, totalAllowance = 0
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
      else if (dev.category === 'elosztok')  deviceHeight = ceilingHeight * 0.5
      else if (dev.category === 'panel')    deviceHeight = ceilingHeight * 0.5

      const verticalRun  = (ceilingHeight - deviceHeight) + (ceilingHeight - 0.1)
      // Extra connection allowance per device (e.g. 0.3m for switch/socket junction box tail)
      const allowance    = DEVICE_CABLE_ALLOWANCE_M[dev.category] || 0

      totalHorizontal += realDist
      totalVertical   += verticalRun
      totalAllowance  += allowance
      routes.push({
        fromX: panelMarker.x, fromY: panelMarker.y,
        toX: dev.x, toY: dev.y,
        horizontal: realDist,
        vertical:   verticalRun,
        allowance,
        total:      realDist + verticalRun + allowance,
        category:   dev.category,
      })
    }

    const totalCable     = totalHorizontal + totalVertical
    const wastePercent   = 15
    const totalWithWaste = (totalCable + totalAllowance) * (1 + wastePercent / 100)
    return {
      routes, totalHorizontal, totalVertical, totalAllowance,
      totalCable, wastePercent, totalWithWaste, deviceCount: devices.length,
    }
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
    // Persist as default for future detection runs (cross-project learning)
    saveCategoryAssemblyDefault(category, assemblyId || null)
  }, [onAssignmentsChange])

  const handleOverride = useCallback((category, field, value) => {
    onAssignmentsChange?.(prev => ({
      ...prev,
      [category]: { ...(prev[category] || {}), [field]: value },
    }))
  }, [onAssignmentsChange])

  // ── Missing assignments (categories with counts but no assembly) ──
  const unassignedCategories = useMemo(() => {
    return COUNT_CATEGORIES.filter(c => {
      if (!countByCategory[c.key]) return false  // no markers
      if (c.key === 'panel') return false         // panel doesn't need assembly
      const asgn = assignments[c.key]
      return !asgn?.assemblyId
    })
  }, [countByCategory, assignments])

  // ── Cable breakdown by device category ──
  const cableBreakdown = useMemo(() => {
    if (!cableData?.routes) return []
    const map = {}
    for (const r of cableData.routes) {
      if (!map[r.category]) map[r.category] = { meters: 0, count: 0 }
      map[r.category].meters += r.total
      map[r.category].count++
    }
    return COUNT_CATEGORIES
      .filter(c => map[c.key])
      .map(c => ({ ...c, meters: map[c.key].meters, count: map[c.key].count }))
  }, [cableData])

  // ── Cost estimate ──
  // UNIFIED: groups by asmId (from markers directly) instead of category,
  // ensuring alignment with TakeoffWorkspace's markerTakeoffRows.
  const costEstimate = useMemo(() => {
    // ── 1.5 NECA Produktivitási faktor kiszámítása ──
    const contextDefaults = settings?.context_defaults || {}
    const productivityFactor = calcProductivityFactor(contextDefaults)

    let totalMaterial = 0, totalLaborMinutes = 0
    const categoryDetails = [] // per-assembly breakdown for summary

    // ── Primary: iterate by asmId (unified with TakeoffWorkspace) ──
    for (const [asmId, info] of Object.entries(countByAsmId)) {
      const asm = assemblies.find(a => a.id === asmId)
      if (!asm) continue

      const cat    = info.category
      const catDef = COUNT_CATEGORIES.find(c => c.key === cat)
      const qty    = info.qty
      const ov     = quoteOverrides[cat] || quoteOverrides[asmId]
      const formulaVars = { COUNT: qty, METER: 0 }

      if (catDef?.isCableTray) {
        const linkedMeasures = measurements.filter(m => m.category === cat)
        let totalMeters
        if (linkedMeasures.length > 0 && scale.calibrated && scale.factor) {
          totalMeters = linkedMeasures.reduce((sum, m) => sum + m.dist * scale.factor, 0)
        } else {
          const lengthPerUnit = ov?.lengthPerUnit ?? 1
          totalMeters = qty * lengthPerUnit
        }
        const ctVars   = { COUNT: qty, METER: totalMeters }
        const matPerM  = ov?.matPerUnit != null ? ov.matPerUnit : getAsmMaterialCost(asm, ctVars)
        const labPerM  = ov?.laborMin   != null ? ov.laborMin   : getAsmLaborMinutes(asm, ctVars, productivityFactor)
        const matCost  = matPerM * totalMeters
        const labMin   = labPerM * totalMeters
        totalMaterial     += matCost
        totalLaborMinutes += labMin
        categoryDetails.push({ key: asmId, label: asm.name || catDef?.label || cat, color: catDef?.color || C.muted, qty, matCost, labMin, isCT: true, totalMeters })
      } else {
        const asgn = assignments[cat] || {}
        const matPerUnit = ov?.matPerUnit != null ? ov.matPerUnit : (asgn.materialOverride != null ? asgn.materialOverride : getAsmMaterialCost(asm, formulaVars))
        const labPerUnit = ov?.laborMin   != null ? ov.laborMin   : getAsmLaborMinutes(asm, formulaVars, productivityFactor)
        const matCost    = matPerUnit * qty
        const labMin     = labPerUnit * qty
        totalMaterial     += matCost
        totalLaborMinutes += labMin
        categoryDetails.push({ key: asmId, label: asm.name || catDef?.label || cat, color: catDef?.color || C.muted, qty, matCost, labMin, isCT: false })
      }
    }

    // Cable cost: per-meter rate for device wiring
    const cableTotal   = cableData?.totalWithWaste ?? 0
    const cableCostPm  = quoteOverrides._cablePricePerM ?? 800
    const cableCost    = cableTotal * cableCostPm
    const laborHours   = totalLaborMinutes / 60
    const defaultLaborRate = settings?.labor?.hourly_rate || 9000
    const laborRate    = quoteOverrides._laborRate ?? defaultLaborRate
    const laborCost    = laborHours * laborRate

    // ── 1.4 Markup vs Margin kalkuláció ──────────────────────────────────────
    // markup: grandTotal = subtotal × (1 + pct/100)
    // margin: grandTotal = subtotal / (1 − pct/100)
    const rawMarkup     = quoteOverrides._markupPercent ?? (settings?.labor?.markup_percent ?? 15)
    const markupPercent = Number.isFinite(rawMarkup) ? rawMarkup : 15
    const markupType    = quoteOverrides._markupType    ?? (settings?.labor?.markup_type    ?? 'markup')
    const subtotal      = totalMaterial + cableCost + laborCost
    let grandTotal
    if (markupType === 'margin') {
      const marginRatio = markupPercent / 100
      // Guard: marginRatio >= 1 would cause division by zero or negative — cap at 10× multiplier
      grandTotal = marginRatio >= 1 ? subtotal * 10 : subtotal / (1 - marginRatio)
    } else {
      grandTotal = subtotal * (1 + markupPercent / 100)
    }
    // Final NaN/Infinity guard
    if (!Number.isFinite(grandTotal)) grandTotal = subtotal
    const markupAmount = grandTotal - subtotal

    return {
      materialCost: totalMaterial, cableCost, laborMinutes: totalLaborMinutes,
      laborHours, laborRate, laborCost, totalCable: cableTotal, cableCostPm,
      // 1.4 Markup/margin
      markupPercent, markupType, markupAmount, subtotal, grandTotal, categoryDetails,
      // 1.5 Productivity
      productivityFactor,
      // Legacy compat aliases
      marginPercent: markupPercent, overheadCost: markupAmount,
    }
  }, [countByAsmId, assignments, quoteOverrides, countByCategory, assemblies, cableData, measurements, scale, settings, getAsmMaterialCost, getAsmLaborMinutes])

  const TABS = [
    { id: 'summary', label: 'Összesítő' },
    { id: 'cables',  label: 'Kábelek'   },
    { id: 'assign',  label: 'Assemblyk' },
    { id: 'quote',   label: 'Kalkuláció'},
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bgCard }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 17, color: C.text }}>Kalkuláció</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, padding: '2px 8px', background: C.bg, borderRadius: 4, border: `1px solid ${C.border}` }}>
            {markers.length} pont
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontSize: 16, padding: '4px 10px', lineHeight: 1, borderRadius: 6, fontFamily: 'Syne' }}>✕ Bezár</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '12px 8px', cursor: 'pointer',
            background: 'none', border: 'none', fontSize: 13, fontFamily: 'Syne', fontWeight: 700,
            color: tab === t.id ? C.accent : C.muted,
            borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
            transition: 'all 0.15s', letterSpacing: '0.02em',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {tab === 'summary' && (
          <SummaryTab countByCategory={countByCategory} totalMarkers={totalMarkers} measurements={measurements} scale={scale} cableData={cableData} panelMarker={panelMarker} onMeasureCategoryChange={onMeasureCategoryChange} />
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
            unassignedCategories={unassignedCategories}
          />
        )}
        {tab === 'quote' && (
          <QuoteTab
            costEstimate={costEstimate}
            countByCategory={countByCategory}
            assignments={assignments}
            assemblies={assemblies}
            cableData={cableData}
            cableBreakdown={cableBreakdown}
            getAsmMaterialCost={getAsmMaterialCost}
            getAsmLaborMinutes={getAsmLaborMinutes}
            quoteOverrides={quoteOverrides}
            onQuoteOverridesChange={onQuoteOverridesChange}
            onCreateQuote={onCreateQuote}
            measurements={measurements}
            scale={scale}
            unassignedCategories={unassignedCategories}
            settings={settings}
          />
        )}
      </div>
    </div>
  )
}

// ─── Summary Tab ────────────────────────────────────────────────────────────

function SummaryTab({ countByCategory, totalMarkers, measurements, scale, cableData, panelMarker, onMeasureCategoryChange }) {
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
          {(cableData.totalAllowance || 0) > 0 && (
            <StatRow label="Ráhagyás (kapcs./dugalj)" value={`+ ${(cableData.totalAllowance || 0).toFixed(1)} m`} />
          )}
          <StatRow label="Összesen" value={`${(cableData.totalCable + (cableData.totalAllowance || 0)).toFixed(1)} m`} accent />
          <StatRow label={`+ ${cableData.wastePercent}% hulladék`} value={`${cableData.totalWithWaste.toFixed(1)} m`} />
        </div>
      )}

      {measurements.length > 0 && scale.calibrated && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginTop: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>
            Mérések ({measurements.length})
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 10 }}>
            Minden méréshez rendelj kábeltálca típust — a kalkuláció automatikusan összesíti.
          </div>

          {/* ── All measurements with per-row category selector ── */}
          {measurements.map((m, idx) => {
            const distM = (m.dist * scale.factor).toFixed(2)
            const catDef = m.category ? COUNT_CATEGORIES.find(c => c.key === m.category) : null
            const rowColor = catDef ? CABLE_TRAY_COLOR : C.muted
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                {/* Index + distance */}
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: rowColor, minWidth: 28, fontWeight: catDef ? 700 : 400 }}>
                  #{idx + 1}
                </span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: rowColor, fontWeight: catDef ? 700 : 400, minWidth: 56 }}>
                  {distM} m
                </span>
                {/* Category selector */}
                <select
                  value={m.category || ''}
                  onChange={e => onMeasureCategoryChange?.(idx, e.target.value || undefined)}
                  style={{
                    flex: 1, padding: '3px 5px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono',
                    background: catDef ? 'rgba(255,170,0,0.08)' : C.bgCard,
                    border: `1px solid ${catDef ? CABLE_TRAY_COLOR + '60' : C.border}`,
                    color: catDef ? CABLE_TRAY_COLOR : C.muted,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">— Nincs kategória —</option>
                  {COUNT_CATEGORIES.filter(c => c.isCableTray).map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
            )
          })}

          {/* ── Per-category totals summary ── */}
          {measurements.some(m => m.category) && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Összesítés</div>
              {COUNT_CATEGORIES.filter(c => c.isCableTray).map(c => {
                const linked = measurements.filter(m => m.category === c.key)
                if (!linked.length) return null
                const totalM = linked.reduce((sum, m) => sum + m.dist * scale.factor, 0)
                return (
                  <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 1, background: CABLE_TRAY_COLOR, opacity: 0.8 }} />
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: CABLE_TRAY_COLOR }}>{c.label}</span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>({linked.length}×)</span>
                    </div>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: CABLE_TRAY_COLOR, fontWeight: 700 }}>{totalM.toFixed(2)} m</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cables Tab ─────────────────────────────────────────────────────────────

function CablesTab({ cableData, cableByCategory, scale, panelMarker, countByCategory, ceilingHeight, switchHeight, socketHeight, onCeilingHeightChange, onSwitchHeightChange, onSocketHeightChange }) {
  if (!scale.calibrated) return <HintBox icon="📐" text='1. lépés: Kalibráld a skálát a "Skála" eszközzel a pontos méréshez.' />
  if (!panelMarker)      return <HintBox icon="⚡" text='2. lépés: Jelöld be az elosztó(ka)t az "Elosztó" kategóriával.' />
  if (!cableData || cableData.routes.length === 0) return <HintBox icon="📍" text='3. lépés: Jelölj be eszközöket (kapcsoló, dugalj, lámpa) a tervrajzon — a kábelhossz automatikusan számítódik.' />

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
        {(cableData.totalAllowance || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.orange }}>Ráhagyás (kapcs./dugalj 0.3m/db)</span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.orange, fontWeight: 700 }}>+ {(cableData.totalAllowance || 0).toFixed(1)} m</span>
          </div>
        )}
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

// ─── Category → assembly category mapping ───────────────────────────────────
// Maps COUNT_CATEGORIES keys to the assembly.category field in ASSEMBLIES_DEFAULT
const CATEGORY_ASM_MAP = {
  light:    'vilagitas',
  switch:   'szerelveny',
  socket:   'szerelveny',
  elosztok: 'elosztok',
  junction: 'szerelveny',
  conduit:  'egyeb',
  other:    'egyeb',
}
// Cable trays → 'kabeltálca'

// Keyword filter within a category — ensures switch→kapcsoló, socket→dugalj, etc.
const CATEGORY_KEYWORDS_MAP = {
  switch:   ['kapcsoló', 'váltó', 'mozgás', 'érzékelő', 'dimmer'],
  socket:   ['dugalj', 'aljzat', 'cee', 'ipari'],
  light:    ['lámpa', 'lámpatest', 'downlight', 'fali', 'led', 'vész', 'reflektor', 'spot'],
  junction: ['kötő', 'doboz', 'elosztó doboz'],
  elosztok: ['elosztó', 'tábla', 'szekrény'],
}

function getRecommendedAssemblies(catKey, isCableTray, assemblies) {
  const asmCat = isCableTray ? 'kabeltálca' : (CATEGORY_ASM_MAP[catKey] || null)
  if (!asmCat) return []

  const categoryAssemblies = assemblies.filter(
    a => a.category === asmCat && (a.components || []).length > 0
  )

  // Keyword-based relevance filter within the broad category
  // (e.g. within 'szerelveny', show only kapcsoló-related for switch category)
  const keywords = CATEGORY_KEYWORDS_MAP[catKey]
  if (!keywords || keywords.length === 0) return categoryAssemblies

  const relevant = categoryAssemblies.filter(a => {
    const nameLower = a.name.toLowerCase()
    return keywords.some(kw => nameLower.includes(kw))
  })

  // Fall back to full category list if no keyword match (user's custom assemblies may differ)
  return relevant.length > 0 ? relevant : categoryAssemblies
}

// ─── Assembly Assignment Tab ────────────────────────────────────────────────

function AssignTab({ countByCategory, assemblies, assignments, onAssign, onOverride, getAsmMaterialCost, getAsmLaborMinutes, getAsmMaterialCount, unassignedCategories = [] }) {
  const [expanded, setExpanded] = useState({})
  const categories = COUNT_CATEGORIES.filter(c => countByCategory[c.key] && c.key !== 'panel')

  if (categories.length === 0) return <HintBox icon="📍" text="Jelölj be elemeket a tervrajzon, hogy assembly-ket rendelhess hozzájuk." />

  const assignedCount = categories.filter(c => assignments[c.key]?.assemblyId).length
  const progress = Math.round((assignedCount / categories.length) * 100)

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.textSub, fontFamily: 'DM Mono' }}>
            Assembly hozzárendelés: {assignedCount}/{categories.length}
          </span>
          <span style={{ fontSize: 11, color: progress === 100 ? C.accent : C.yellow, fontFamily: 'DM Mono', fontWeight: 700 }}>
            {progress}%
          </span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: C.border }}>
          <div style={{ height: '100%', borderRadius: 2, background: progress === 100 ? C.accent : C.yellow, width: `${progress}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Unassigned warning */}
      {unassignedCategories.length > 0 && (
        <div style={{ background: 'rgba(255,107,107,0.08)', border: `1px solid rgba(255,107,107,0.25)`, borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.red, fontWeight: 700, marginBottom: 4 }}>
            ⚠ {unassignedCategories.length} kategória assembly nélkül:
          </div>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.red }}>
            {unassignedCategories.map(c => `${c.label} (${countByCategory[c.key]}×)`).join(', ')}
          </div>
        </div>
      )}

      {categories.map(c => {
        const count      = countByCategory[c.key]
        const asgn       = assignments[c.key] || {}
        const selectedId = asgn.assemblyId || ''
        const selectedAsm = assemblies.find(a => a.id === selectedId)
        const isExpanded  = expanded[c.key]

        // Recommended assemblies for this category (from default DB, non-empty)
        const recommended = getRecommendedAssemblies(c.key, !!c.isCableTray, assemblies)
        const recommendedIds = new Set(recommended.map(a => a.id))
        const otherAssemblies = assemblies.filter(a => !recommendedIds.has(a.id))

        const matCost  = selectedAsm ? (asgn.materialOverride != null ? asgn.materialOverride : getAsmMaterialCost(selectedAsm)) : 0
        const laborMin = selectedAsm ? getAsmLaborMinutes(selectedAsm) : 0
        const matCount = selectedAsm ? getAsmMaterialCount(selectedAsm) : 0
        const isEmpty  = selectedAsm && matCount === 0 && laborMin === 0

        // Best suggestion when current is empty or missing
        const suggestion = !selectedAsm || isEmpty
          ? recommended.find(a => a.id !== selectedId) || recommended[0] || null
          : null

        return (
          <div key={c.key} style={{
            background: C.bg,
            border: `1px solid ${!selectedAsm ? C.red + '40' : isEmpty ? C.yellow + '50' : isExpanded ? C.accent + '40' : C.border}`,
            borderRadius: 8, padding: 14, marginBottom: 12,
          }}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: c.isCableTray ? 2 : '50%', background: c.color }} />
                <span style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
                {!selectedAsm && <span style={{ fontSize: 9, color: C.red, fontFamily: 'DM Mono', fontWeight: 700 }}>✗ HIÁNYZIK</span>}
                {isEmpty && <span style={{ fontSize: 9, color: C.yellow, fontFamily: 'DM Mono', fontWeight: 700 }}>⚠ ÜRES</span>}
              </div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 700 }}>{count} db</span>
            </div>

            {/* Suggestion banner — shown when no assembly or empty assembly selected */}
            {suggestion && (
              <div style={{
                marginBottom: 8, padding: '8px 10px', borderRadius: 6,
                background: 'rgba(0,229,160,0.06)', border: `1px solid rgba(0,229,160,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: C.accent, fontFamily: 'DM Mono', fontWeight: 700, marginBottom: 2 }}>
                    ★ JAVASOLT ALAPÉRTELMEZETT
                  </div>
                  <div style={{ fontSize: 11, color: C.text, fontFamily: 'DM Mono', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {suggestion.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.textSub, fontFamily: 'DM Mono', marginTop: 1 }}>
                    {(suggestion.components || []).filter(x => x.itemType === 'material').length} anyag ·{' '}
                    {getAsmLaborMinutes(suggestion).toFixed(0)} perc ·{' '}
                    {getAsmMaterialCost(suggestion).toLocaleString('hu-HU')} Ft/db
                  </div>
                </div>
                <button
                  onClick={() => onAssign(c.key, suggestion.id)}
                  style={{
                    padding: '6px 12px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                    background: C.accent, border: 'none', color: C.bg,
                    fontSize: 11, fontFamily: 'Syne', fontWeight: 700,
                  }}
                >
                  Használ →
                </button>
              </div>
            )}

            {/* Assembly selector — grouped by recommended / other */}
            <select
              value={selectedId}
              onChange={e => onAssign(c.key, e.target.value || null)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6, background: C.bgCard,
                border: `1px solid ${!selectedAsm ? C.red + '60' : isEmpty ? C.yellow + '60' : C.border}`,
                color: C.text, fontSize: 12, fontFamily: 'DM Mono',
              }}
            >
              <option value="">— Válassz assembly-t —</option>
              {recommended.length > 0 && (
                <optgroup label={`★ Ajánlott (${c.label})`}>
                  {recommended.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </optgroup>
              )}
              {otherAssemblies.length > 0 && (
                <optgroup label="Egyéb assemblyk">
                  {otherAssemblies.map(a => {
                    const compCount = (a.components || []).length
                    return <option key={a.id} value={a.id}>{a.name}{compCount === 0 ? ' (üres!)' : ''}</option>
                  })}
                </optgroup>
              )}
            </select>

            {/* Variant picker — when selected assembly has variants */}
            {selectedAsm?.variants?.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>
                  Variáns ({selectedAsm.variants.length} opció)
                </div>
                <select
                  value={asgn.variantKey || selectedAsm.variants.find(v => v.isDefault)?.key || ''}
                  onChange={e => {
                    onOverride(c.key, 'variantKey', e.target.value || null)
                    trackAsmUsage(selectedId, e.target.value)
                  }}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 6, background: C.bgCard,
                    border: `1px solid rgba(56,189,248,0.3)`,
                    color: C.text, fontSize: 11, fontFamily: 'DM Mono',
                  }}
                >
                  {selectedAsm.variants.map(v => (
                    <option key={v.key} value={v.key}>
                      {v.isDefault ? '★ ' : ''}{v.label} — {v.description || ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Empty assembly warning (when suggestion is exhausted or not found) */}
            {isEmpty && !suggestion && (
              <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 4, background: 'rgba(255,209,102,0.1)', border: `1px solid rgba(255,209,102,0.3)` }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.yellow, fontWeight: 700 }}>
                  ⚠ Ez az assembly üres — nincs komponens benne!
                </div>
                <div style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, marginTop: 2 }}>
                  Menj az Assemblyk oldalra és adj hozzá anyag/munka tételeket.
                </div>
              </div>
            )}

            {/* Assembly info + expand */}
            {selectedAsm && !isEmpty && (
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

function QuoteTab({
  costEstimate, countByCategory, assignments, assemblies, cableData, cableBreakdown = [],
  getAsmMaterialCost, getAsmLaborMinutes, quoteOverrides, onQuoteOverridesChange,
  onCreateQuote, measurements = [], scale = {}, unassignedCategories = [], settings = {},
}) {
  const hasAssignments = Object.values(assignments).some(v => v?.assemblyId)
  const vatPercent = settings?.labor?.vat_percent || 27

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

  const cablePricePerM = costEstimate.cableCostPm
  const laborRate      = costEstimate.laborRate

  return (
    <div>
      {/* ── Unassigned categories warning ── */}
      {unassignedCategories.length > 0 && (
        <div style={{ background: 'rgba(255,107,107,0.08)', border: `1px solid rgba(255,107,107,0.25)`, borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: C.red, fontWeight: 700, marginBottom: 4 }}>
            ⚠ Hiányzó assembly hozzárendelés
          </div>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.red, lineHeight: 1.5 }}>
            {unassignedCategories.map(c => (
              <span key={c.key} style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,107,107,0.12)', marginRight: 4, marginBottom: 3 }}>
                {c.label} ({countByCategory[c.key]}×)
              </span>
            ))}
          </div>
          <div style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, marginTop: 4 }}>
            Menj az "Assemblyk" fülre és rendelj hozzá assembly-ket a pontos kalkulációhoz.
          </div>
        </div>
      )}

      {/* ── Cable breakdown by device category ── */}
      {cableBreakdown.length > 0 && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.yellow} strokeWidth="2" strokeLinecap="round"><path d="M2 12h20"/><path d="M6 8v8M18 8v8M10 10v4M14 10v4"/></svg>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>Kábel kategóriánként</span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginLeft: 'auto' }}>
              {cableData?.totalWithWaste?.toFixed(1) || '0'} m (hulladékkal)
            </span>
          </div>
          {cableBreakdown.map(cb => (
            <div key={cb.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cb.color }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: cb.color }}>{cb.label} ({cb.count}×)</span>
              </div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, fontWeight: 700 }}>{(cb.meters || 0).toFixed(1)} m</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Global rate settings ── */}
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
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Feláras % (árrés)</div>
            <input
              type="number" min={0} max={99} step={1}
              value={costEstimate.markupPercent}
              onChange={e => setOverride('_markupPercent', parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bgCard, border: `1px solid ${quoteOverrides._markupPercent != null ? C.yellow : C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* 1.4 Markup vs Margin toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>Számítási mód:</div>
          {[
            { key: 'markup', label: 'Markup', tip: `Cost × (1+${costEstimate.markupPercent}%)` },
            { key: 'margin', label: 'Margin', tip: `Cost ÷ (1−${costEstimate.markupPercent}%)` },
          ].map(opt => (
            <button key={opt.key}
              title={opt.tip}
              onClick={() => setOverride('_markupType', opt.key)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono',
                border: `1px solid ${costEstimate.markupType === opt.key ? C.accent : C.border}`,
                background: costEstimate.markupType === opt.key ? 'rgba(0,229,160,0.12)' : 'transparent',
                color: costEstimate.markupType === opt.key ? C.accent : C.muted,
                cursor: 'pointer',
              }}>{opt.label}</button>
          ))}
          <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginLeft: 4 }}>
            +{Math.round(costEstimate.markupAmount).toLocaleString('hu-HU')} Ft
          </span>
        </div>

        {/* Productivity factor badge */}
        {costEstimate.productivityFactor !== 1.0 && (
          <div style={{ marginTop: 8, padding: '5px 10px', borderRadius: 6,
            background: costEstimate.productivityFactor > 1.2 ? 'rgba(255,107,107,0.1)' : 'rgba(255,209,102,0.1)',
            border: `1px solid ${costEstimate.productivityFactor > 1.2 ? 'rgba(255,107,107,0.3)' : 'rgba(255,209,102,0.3)'}`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>NECA produktivitás:</span>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono', fontWeight: 700,
              color: costEstimate.productivityFactor > 1.2 ? '#FF6B6B' : '#FFD166' }}>
              ×{costEstimate.productivityFactor.toFixed(2)}
            </span>
            <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>
              ({costEstimate.productivityFactor > 1 ? '+' : ''}{Math.round((costEstimate.productivityFactor - 1) * 100)}% a normaidőre)
            </span>
          </div>
        )}
      </div>

      {/* ── Per-category editable prices ── */}
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
            const matPerUnit   = ov.matPerUnit   != null ? ov.matPerUnit   : (asgn.materialOverride != null ? asgn.materialOverride : defaultMat)
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

            const lengthPerUnit = ov.lengthPerUnit ?? 1
            const totalMeters   = hasMeasured ? measuredTotal : count * lengthPerUnit
            const lenOverridden = ov.lengthPerUnit != null

            // Row totals (material + labor value)
            const matTotal = isCT ? (matPerUnit * totalMeters) : (matPerUnit * count)
            const labTotal = isCT ? (laborMin * totalMeters) : (laborMin * count)

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
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 4, background: 'rgba(255,170,0,0.08)', border: `1px solid rgba(255,170,0,0.3)` }}>
                          <span style={{ fontSize: 11, lineHeight: 1 }}>📏</span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow }}>
                            {linkedMeasures.length} mérés alapján: <strong>{measuredTotal.toFixed(2)} m</strong>
                          </span>
                        </div>
                      </div>
                    ) : (
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
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 2 }}>Anyag össz.</div>
                    <div style={{ padding: '4px 6px', borderRadius: 4, background: 'rgba(0,229,160,0.07)', border: `1px solid rgba(0,229,160,0.18)`, fontSize: 11, fontFamily: 'DM Mono', color: C.accent, fontWeight: 700 }}>
                      {matTotal.toLocaleString('hu-HU')} Ft
                    </div>
                  </div>
                </div>

                {/* Labor row total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '2px 0' }}>
                  <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted }}>
                    Munka: {(isCT ? laborMin * totalMeters : laborMin * count).toFixed(0)} perc = {((isCT ? laborMin * totalMeters : laborMin * count) / 60).toFixed(1)} óra
                  </span>
                  <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.yellow }}>
                    {(labTotal / 60 * laborRate).toLocaleString('hu-HU')} Ft
                  </span>
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

      {/* ── Grand total summary ── */}
      <div style={{ background: C.bg, border: `1px solid ${C.accent}30`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>Összefoglaló</div>

        {/* Per-category details */}
        {costEstimate.categoryDetails?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {costEstimate.categoryDetails.map(cd => (
              <div key={cd.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 10, fontFamily: 'DM Mono' }}>
                <span style={{ color: cd.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: cd.isCT ? 1 : '50%', background: cd.color, display: 'inline-block' }} />
                  {cd.label} × {cd.qty}{cd.isCT ? ` (${cd.totalMeters?.toFixed(1)}m)` : ' db'}
                </span>
                <span style={{ color: C.textSub }}>{cd.matCost.toLocaleString('hu-HU')} Ft</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4 }} />
          </div>
        )}

        <StatRow label="Anyagköltség" value={`${costEstimate.materialCost.toLocaleString('hu-HU')} Ft`} />
        <StatRow label={`Kábel (${costEstimate.totalCable.toFixed(0)} m × ${cablePricePerM.toLocaleString('hu-HU')} Ft/m)`} value={`${costEstimate.cableCost.toLocaleString('hu-HU')} Ft`} />
        <StatRow label={`Munkadíj (${costEstimate.laborHours.toFixed(1)} óra × ${laborRate.toLocaleString('hu-HU')} Ft/óra)`} value={`${costEstimate.laborCost.toLocaleString('hu-HU')} Ft`} />

        {/* Subtotal */}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, fontWeight: 600 }}>Részösszeg</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{costEstimate.subtotal.toLocaleString('hu-HU')} Ft</span>
        </div>

        {/* Overhead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.orange }}>
            + Rezsi/árrés ({costEstimate.marginPercent.toFixed(0)}%)
          </span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.orange, fontWeight: 600 }}>
            {costEstimate.overheadCost.toLocaleString('hu-HU')} Ft
          </span>
        </div>

        {/* Grand total */}
        <div style={{ borderTop: `2px solid ${C.accent}40`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
          <span style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, color: C.accent }}>{costEstimate.grandTotal.toLocaleString('hu-HU')} Ft</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó ({vatPercent}% ÁFA)</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{(costEstimate.grandTotal * (1 + vatPercent / 100)).toLocaleString('hu-HU')} Ft</span>
        </div>
      </div>

      {/* Action */}
      <button
        onClick={() => onCreateQuote?.({ countByCategory, assignments, quoteOverrides, cableData, costEstimate, cableBreakdown })}
        disabled={unassignedCategories.length > 0 && !hasAssignments}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 8, cursor: 'pointer',
          background: unassignedCategories.length > 0 ? C.yellow : C.accent,
          border: 'none', color: C.bg,
          fontSize: 14, fontFamily: 'Syne', fontWeight: 700, marginBottom: 8,
          opacity: (!hasAssignments && unassignedCategories.length > 0) ? 0.5 : 1,
        }}
      >
        {unassignedCategories.length > 0 ? `Ajánlat létrehozása (${unassignedCategories.length} hiányzó) →` : 'Ajánlat létrehozása →'}
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
