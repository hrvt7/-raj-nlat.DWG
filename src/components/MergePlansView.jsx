import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { C, Button, Badge } from './ui.jsx'
import { COUNT_CATEGORIES } from './DxfViewer/DxfToolbar.jsx'
import { getPlanAnnotations, getPlanThumbnail } from '../data/planStore.js'
import { loadAssemblies, loadWorkItems, loadMaterials, loadSettings } from '../data/store.js'
import { computePricing } from '../utils/pricing.js'
import { ASSEMBLY_TYPES, addUserOverride, getAssemblyTypeLabel } from '../data/symbolDictionary.js'
import { mergeParseResults, getAggregatedRows, deduplicateUnknowns } from '../utils/mergeParseResults.js'
import { downloadCSV } from '../utils/csvExport.js'
import { normalizeMarker } from '../utils/markerModel.js'

// ═══════════════════════════════════════════════════════════════════════════
// MergePlansView — Combine annotations from multiple plans into one estimate
// Three modes: "manual" (marker-based), "dxf" (auto block recognition), "pdf" (Vision AI)
// ═══════════════════════════════════════════════════════════════════════════

export default function MergePlansView({ plans, onClose, onCreateQuote }) {
  // Auto-select the most data-rich tab on open
  const hasDxfResults = plans.some(p => p.parseResult?.blocks?.length > 0)
  const hasPdfResults = plans.some(p => p.fileType === 'pdf' && p.pdfRecognition?.status === 'done')
  const defaultTab = hasDxfResults ? 'dxf' : hasPdfResults ? 'pdf' : 'manual'
  const [activeTab, setActiveTab] = useState(defaultTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button onClick={onClose} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '6px 12px', cursor: 'pointer', color: C.text, fontSize: 13, fontFamily: 'Syne',
        }}>← Vissza</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 700, fontFamily: 'Syne' }}>
            Tervek összevonása
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
        <TabButton active={activeTab === 'manual'} onClick={() => setActiveTab('manual')}>
          📌 Kézi jelölések
        </TabButton>
        <TabButton active={activeTab === 'dxf'} onClick={() => setActiveTab('dxf')}>
          📊 DXF elemzés
          {hasDxfResults && <span style={{ marginLeft: 5, width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block', verticalAlign: 'middle' }} />}
        </TabButton>
        <TabButton active={activeTab === 'pdf'} onClick={() => setActiveTab('pdf')}>
          📄 PDF felismerés
          {hasPdfResults && <span style={{ marginLeft: 5, width: 6, height: 6, borderRadius: '50%', background: '#4CC9F0', display: 'inline-block', verticalAlign: 'middle' }} />}
        </TabButton>
      </div>

      {activeTab === 'manual' ? (
        <ManualMergeTab plans={plans} onCreateQuote={onCreateQuote} onSwitchToDxf={() => setActiveTab('dxf')} />
      ) : activeTab === 'dxf' ? (
        <DxfAnalysisTab plans={plans} onCreateQuote={onCreateQuote} />
      ) : (
        <PdfRecognitionTab plans={plans} onCreateQuote={onCreateQuote} />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px', cursor: 'pointer', fontFamily: 'Syne', fontSize: 13, fontWeight: 600,
      border: 'none', borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
      background: 'transparent', color: active ? C.accent : C.muted,
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Manual Merge Tab (existing functionality, unchanged)
// ═══════════════════════════════════════════════════════════════════════════

function ManualMergeTab({ plans, onCreateQuote, onSwitchToDxf }) {
  const [selected, setSelected] = useState({})
  const [annotations, setAnnotations] = useState({})
  const [thumbnails, setThumbnails] = useState({})
  const [loading, setLoading] = useState(false)
  const [ceilingHeight, setCeilingHeight] = useState(3.0)
  const [socketHeight, setSocketHeight] = useState(0.3)
  const [assignments, setAssignments] = useState({})
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])
  const workItems  = useMemo(() => { try { return loadWorkItems()  } catch { return [] } }, [])
  const materials  = useMemo(() => { try { return loadMaterials()  } catch { return [] } }, [])

  useEffect(() => {
    Promise.all(plans.map(async p => {
      const thumb = await getPlanThumbnail(p.id)
      return { id: p.id, thumb }
    })).then(results => {
      const map = {}
      for (const r of results) { if (r.thumb) map[r.id] = r.thumb }
      setThumbnails(map)
    })
  }, [plans])

  useEffect(() => {
    const ids = Object.keys(selected).filter(id => selected[id])
    if (ids.length === 0) return
    setLoading(true)
    Promise.all(ids.map(async id => {
      const ann = await getPlanAnnotations(id)
      return { id, ann }
    })).then(results => {
      const map = {}
      for (const r of results) map[r.id] = r.ann
      setAnnotations(prev => ({ ...prev, ...map }))
      setLoading(false)
    })
  }, [selected])

  const toggleSelect = useCallback((id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const selectedIds = Object.keys(selected).filter(id => selected[id])

  const mergedMarkers = useMemo(() => {
    const all = []
    for (const id of selectedIds) {
      const ann = annotations[id]
      if (ann?.markers) {
        for (const m of ann.markers) all.push({ ...normalizeMarker(m), sourcePlan: id })
      }
    }
    return all
  }, [selectedIds, annotations])

  const countByCategory = useMemo(() => {
    const map = {}
    for (const m of mergedMarkers) map[m.category] = (map[m.category] || 0) + 1
    return map
  }, [mergedMarkers])

  const bestScale = useMemo(() => {
    for (const id of selectedIds) {
      const ann = annotations[id]
      if (ann?.scale?.calibrated && ann?.scale?.factor) return ann.scale
    }
    return { factor: null, calibrated: false }
  }, [selectedIds, annotations])

  const cableData = useMemo(() => {
    if (!bestScale.calibrated || !bestScale.factor) return null
    const panelMarkers = mergedMarkers.filter(m => m.category === 'panel')
    const devices = mergedMarkers.filter(m => m.category !== 'panel')
    if (panelMarkers.length === 0 || devices.length === 0) return null
    let totalHorizontal = 0, totalVertical = 0
    const panel = panelMarkers[0]
    for (const dev of devices) {
      const dx = Math.abs(dev.x - panel.x)
      const dy = Math.abs(dev.y - panel.y)
      const realDist = (dx + dy) * bestScale.factor
      let deviceHeight = socketHeight
      if (dev.category === 'switch') deviceHeight = 1.2
      else if (dev.category === 'light') deviceHeight = 0
      else if (dev.category === 'junction') deviceHeight = ceilingHeight - 0.3
      else if (dev.category === 'conduit') deviceHeight = ceilingHeight - 0.1
      const verticalRun = (ceilingHeight - deviceHeight) + (ceilingHeight - 0.1)
      totalHorizontal += realDist
      totalVertical += verticalRun
    }
    const totalCable = totalHorizontal + totalVertical
    return {
      totalHorizontal, totalVertical, totalCable,
      wastePercent: 15, totalWithWaste: totalCable * 1.15, deviceCount: devices.length,
    }
  }, [mergedMarkers, bestScale, ceilingHeight, socketHeight])

  const costEstimate = useMemo(() => {
    const settings  = loadSettings()
    const hourlyRate = Number(settings?.labor?.hourly_rate) || 9000
    const vatPct     = Number(settings?.labor?.vat_percent)  || 27

    const takeoffRows = Object.entries(countByCategory)
      .map(([cat, qty]) => ({ asmId: assignments[cat], qty, variantId: null, wallSplits: null }))
      .filter(r => r.asmId && r.qty > 0)

    const cableTotal  = cableData ? cableData.totalWithWaste : 0
    const cableEst    = cableTotal > 0
      ? { cable_total_m: cableTotal, cable_by_type: { socket_m: cableTotal } }
      : null

    if (takeoffRows.length === 0 && !cableEst) {
      return { materialCost: 0, laborCost: 0, laborHours: 0, subtotal: 0, markup: 0, total: 0, lines: [], vatPct, totalCable: cableTotal }
    }
    const result = computePricing({
      takeoffRows, assemblies, workItems, materials,
      context: null, markup: 0, hourlyRate,
      cableEstimate: cableEst, difficultyMode: 'normal',
    })
    return { ...result, vatPct, totalCable: cableTotal }
  }, [assignments, countByCategory, assemblies, workItems, materials, cableData])

  return (
    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
      {/* Left: Plan selection */}
      <div style={{ width: 280, overflow: 'auto', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
          Tervrajzok
        </div>
        {plans.map(plan => {
          const isSelected = !!selected[plan.id]
          return (
            <div key={plan.id} onClick={() => toggleSelect(plan.id)} style={{
              background: isSelected ? C.accent + '10' : C.bgCard,
              border: `1px solid ${isSelected ? C.accent + '40' : C.border}`,
              borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'pointer',
              display: 'flex', gap: 10, alignItems: 'center', transition: 'all 0.15s',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 6, overflow: 'hidden',
                background: C.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {thumbnails[plan.id] ? (
                  <img src={thumbnails[plan.id]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{plan.fileType?.toUpperCase()}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: C.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{plan.name}</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                  {(plan.fileType === 'dxf' || plan.fileType === 'dwg')
                    ? (plan.parseResult?.blocks?.length > 0
                        ? `${plan.parseResult.summary?.total_blocks || plan.parseResult.blocks.length} blokk azonosítva`
                        : plan.parsedAt ? 'Elemzett (0 blokk)' : 'Nincs elemezve')
                    : `${plan.markerCount || 0} jelölés${plan.hasScale ? ' • Kalibrálva' : ''}`
                  }
                </div>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                border: `2px solid ${isSelected ? C.accent : C.border}`,
                background: isSelected ? C.accent : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.bg, fontSize: 12, fontWeight: 700,
              }}>{isSelected ? '✓' : ''}</div>
            </div>
          )
        })}
      </div>

      {/* Right: Merged summary */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {selectedIds.length === 0 ? (
          <EmptyState icon="📋" title="Válassz ki legalább egy tervrajzot" subtitle="Az annotációk (markerek, mérések) összesítésre kerülnek" />
        ) : (
          <>
            {loading && <div style={{ color: C.accent, fontSize: 12, fontFamily: 'DM Mono' }}>Betöltés...</div>}

            {/* Hint: DXF blocks available but using manual tab */}
            {mergedMarkers.length === 0 && selectedIds.some(id => {
              const p = plans.find(pl => pl.id === id)
              return p?.parseResult?.blocks?.length > 0
            }) && (
              <div style={{
                background: 'rgba(76,201,240,0.08)', border: '1px solid rgba(76,201,240,0.3)',
                borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: '#4CC9F0' }}>
                    Ez a terv DXF blokk adatokat tartalmaz
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 2 }}>
                    A „Kézi jelölések" fül a manuálisan rajzolt markereket összesíti — az automatikusan felismert DXF blokkok a{' '}
                    <span style={{ color: '#4CC9F0', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={onSwitchToDxf}>
                      📊 DXF elemzés
                    </span>
                    {' '}fülön érhetők el.
                  </div>
                </div>
              </div>
            )}

            {/* Merged count summary */}
            <SectionCard title={`Összesített jelölések (${mergedMarkers.length})`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {COUNT_CATEGORIES.filter(c => countByCategory[c.key]).map(c => (
                  <div key={c.key} style={{ background: C.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${c.color}20` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: c.color }}>{c.label}</span>
                    </div>
                    <div style={{ fontFamily: 'Syne', fontSize: 20, fontWeight: 800, color: c.color }}>{countByCategory[c.key]}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Scale + Cable info */}
            <div style={{ display: 'flex', gap: 12 }}>
              <SectionCard title="Kábel becslés" style={{ flex: 1 }}>
                {!bestScale.calibrated ? (
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>⚠ Nincs kalibrált skála — kalibráld valamelyik tervrajzot</div>
                ) : !cableData ? (
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>⚠ Jelölj be elosztót + eszközöket</div>
                ) : (
                  <>
                    <Row label="Vízszintes" value={`${cableData.totalHorizontal.toFixed(1)} m`} />
                    <Row label="Függőleges" value={`${cableData.totalVertical.toFixed(1)} m`} />
                    <Row label="Összesen" value={`${cableData.totalCable.toFixed(1)} m`} accent />
                    <Row label={`+ ${cableData.wastePercent}% hulladék`} value={`${cableData.totalWithWaste.toFixed(1)} m`} />
                  </>
                )}
              </SectionCard>
              <div style={{ width: 200, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Beállítások</div>
                <label style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Belmagasság (m)</label>
                <input type="number" min={2} max={6} step={0.1} value={ceilingHeight}
                  onChange={e => setCeilingHeight(parseFloat(e.target.value) || 3)}
                  style={inputStyle} />
                <label style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Dugalj magasság (m)</label>
                <input type="number" min={0.1} max={2} step={0.05} value={socketHeight}
                  onChange={e => setSocketHeight(parseFloat(e.target.value) || 0.3)}
                  style={inputStyle} />
              </div>
            </div>

            {/* Assembly assignment */}
            <SectionCard title="Assembly hozzárendelés">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {COUNT_CATEGORIES.filter(c => countByCategory[c.key]).map(c => (
                  <div key={c.key} style={{ background: C.bg, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: c.color }}>{c.label} ({countByCategory[c.key]})</span>
                    </div>
                    <select value={assignments[c.key] || ''} onChange={e => setAssignments(p => ({ ...p, [c.key]: e.target.value || null }))}
                      style={selectStyle}>
                      <option value="">— Assembly —</option>
                      {assemblies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Cost summary */}
            <SectionCard title="Költségbecslés">
              <Row label="Anyagköltség" value={`${Math.round(costEstimate.materialCost).toLocaleString('hu-HU')} Ft`} />
              {(costEstimate.totalCable || 0) > 0 && (
                <Row label={`Kábel (~${Math.round(costEstimate.totalCable || 0)} m)`} value={`— (anyagköltségbe számítva)`} />
              )}
              <Row label={`Munkadíj (${(costEstimate.laborHours || 0).toFixed(1)} óra)`} value={`${Math.round(costEstimate.laborCost).toLocaleString('hu-HU')} Ft`} />
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
                <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>{Math.round(costEstimate.subtotal || costEstimate.total || 0).toLocaleString('hu-HU')} Ft</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó ({costEstimate.vatPct ?? 27}% ÁFA)</span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round((costEstimate.subtotal || 0) * (1 + (costEstimate.vatPct ?? 27) / 100)).toLocaleString('hu-HU')} Ft</span>
              </div>
            </SectionCard>

            <button onClick={() => onCreateQuote?.({
              mergedFrom: selectedIds, countByCategory, assignments, cableData, costEstimate, markers: mergedMarkers,
            })} style={primaryButtonStyle}>
              Ajánlat létrehozása az összesítésből
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DXF Analysis Tab — Auto block recognition aggregated across plans
// ═══════════════════════════════════════════════════════════════════════════

function DxfAnalysisTab({ plans, onCreateQuote }) {
  const [selected, setSelected] = useState({})
  const [assignments, setAssignments] = useState({}) // assemblyType → assemblyId
  const [showUnknowns, setShowUnknowns] = useState(false)
  const [unknownAssignments, setUnknownAssignments] = useState({}) // blockName → assemblyType
  const [filterFloor, setFilterFloor] = useState('') // '' = all
  const [filterDiscipline, setFilterDiscipline] = useState('')
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])
  const workItems  = useMemo(() => { try { return loadWorkItems()  } catch { return [] } }, [])
  const materials  = useMemo(() => { try { return loadMaterials()  } catch { return [] } }, [])

  // Only show plans that have been parsed (have parseResult with blocks)
  const parsedPlans = useMemo(() =>
    plans.filter(p => p.parseResult?.blocks?.length > 0),
  [plans])

  const unparsedPlans = useMemo(() =>
    plans.filter(p => !p.parseResult?.blocks?.length && (p.fileType === 'dxf' || p.fileType === 'dwg')),
  [plans])

  const toggleSelect = useCallback((id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const selectAll = useCallback(() => {
    const all = {}
    for (const p of parsedPlans) all[p.id] = true
    setSelected(all)
  }, [parsedPlans])

  const selectedIds = Object.keys(selected).filter(id => selected[id])
  const selectedPlans = parsedPlans.filter(p => selectedIds.includes(p.id))

  // Apply floor/discipline filter
  const filteredPlans = useMemo(() => {
    let result = selectedPlans
    if (filterFloor) result = result.filter(p => p.floor === filterFloor)
    if (filterDiscipline) result = result.filter(p => p.discipline === filterDiscipline)
    return result
  }, [selectedPlans, filterFloor, filterDiscipline])

  // Merge parse results
  const mergeResult = useMemo(() => mergeParseResults(filteredPlans), [filteredPlans])
  const rows = useMemo(() => getAggregatedRows(mergeResult), [mergeResult])
  const dedupedUnknowns = useMemo(() => deduplicateUnknowns(mergeResult.unknowns), [mergeResult.unknowns])

  // Available floors/disciplines for filters
  const availableFloors = useMemo(() => [...new Set(selectedPlans.map(p => p.floor).filter(Boolean))], [selectedPlans])
  const availableDisciplines = useMemo(() => [...new Set(selectedPlans.map(p => p.discipline).filter(Boolean))], [selectedPlans])
  const floorList = useMemo(() => Object.keys(mergeResult.byFloor), [mergeResult.byFloor])

  // Grand total count (recognized only)
  const grandTotal = useMemo(() => Object.values(mergeResult.total).reduce((s, v) => s + v, 0), [mergeResult.total])

  // Total block count (recognized + unknown) — matches Plans card "N blokk" display
  const totalBlockCount = useMemo(() => {
    return filteredPlans.reduce((sum, p) => sum + (p.parseResult?.blocks?.length || 0), 0)
  }, [filteredPlans])

  // ── View toggle state: 'total' | 'byFloor' | 'byDiscipline' ───────────────
  const [viewMode, setViewMode] = useState('total')

  // Discipline breakdown (analogous to floorList / rows)
  const disciplineList = useMemo(() => Object.keys(mergeResult.byDiscipline), [mergeResult.byDiscipline])

  const disciplineRows = useMemo(() => {
    const { byDiscipline, assemblyTypes, total } = mergeResult
    return assemblyTypes.map(type => {
      const label = rows.find(r => r.assemblyType === type)?.label || type
      return {
        assemblyType: type,
        label,
        disciplines: disciplineList.reduce((acc, d) => {
          acc[d] = byDiscipline[d]?.[type] || 0
          return acc
        }, {}),
        total: total[type] || 0,
      }
    })
  }, [mergeResult, rows, disciplineList])

  // Cost estimate for DXF — uses the shared computePricing engine (same as TakeoffWorkspace)
  const costEstimate = useMemo(() => {
    const settings = loadSettings()
    const hourlyRate = Number(settings?.labor?.hourly_rate) || 9000
    const vatPct     = Number(settings?.labor?.vat_percent)  || 27

    // Convert assemblyType→count map into takeoffRows format
    const takeoffRows = Object.entries(mergeResult.total)
      .filter(([asmType, count]) => assignments[asmType] && count > 0)
      .map(([asmType, count]) => ({
        asmId: assignments[asmType],
        qty:   count,
        variantId: null,
        wallSplits: null,
      }))

    if (takeoffRows.length === 0) {
      return { materialCost: 0, laborCost: 0, laborHours: 0, subtotal: 0, markup: 0, total: 0, lines: [], vatPct }
    }

    const result = computePricing({
      takeoffRows, assemblies, workItems, materials,
      context: null,        // no height/access multiplier at merge stage
      markup: 0,
      hourlyRate,
      cableEstimate: null,
      difficultyMode: 'normal',
    })
    return { ...result, vatPct }
  }, [assignments, mergeResult.total, assemblies, workItems, materials])

  // CSV export — uses costEstimate lines from computePricing (same engine as TakeoffWorkspace)
  const handleExportCSV = useCallback(() => {
    const vatPct = costEstimate.vatPct ?? 27
    const header = ['Tétel', 'Mennyiség', 'Egység', 'Anyagköltség (Ft)', 'Munkadíj (Ft)',
      'Összeg nettó (Ft)', 'ÁFA (Ft)', 'Összeg bruttó (Ft)']

    // Per-row breakdown using computePricing per assembly type
    const settings = loadSettings()
    const hourlyRate = Number(settings?.labor?.hourly_rate) || 9000
    const dataRows = rows.map(row => {
      const asmId = assignments[row.assemblyType]
      if (!asmId) return [row.label, row.total, 'db', 0, 0, 0, 0, 0]
      const singleResult = computePricing({
        takeoffRows: [{ asmId, qty: row.total, variantId: null, wallSplits: null }],
        assemblies, workItems, materials, context: null, markup: 0, hourlyRate,
        cableEstimate: null, difficultyMode: 'normal',
      })
      const matCost  = Math.round(singleResult.materialCost)
      const laborCst = Math.round(singleResult.laborCost)
      const net      = Math.round(singleResult.subtotal)
      const vat      = Math.round(net * vatPct / 100)
      return [row.label, row.total, 'db', matCost, laborCst, net, vat, net + vat]
    })

    const totMat   = Math.round(costEstimate.materialCost)
    const totLabor = Math.round(costEstimate.laborCost)
    const totNet   = Math.round(costEstimate.subtotal)
    const totVat   = Math.round(totNet * vatPct / 100)
    const allRows  = [header, ...dataRows, [],
      ['ÖSSZESEN', grandTotal, '', totMat, totLabor, totNet, totVat, totNet + totVat]]
    const BOM = '\uFEFF'
    const csv = BOM + allRows.map(r => r.join(';')).join('\r\n')
    downloadCSV(csv, `dxf_osszesito_${new Date().toISOString().slice(0, 10)}.csv`)
  }, [rows, assignments, assemblies, workItems, materials, costEstimate, grandTotal])

  // Save unknown symbol assignments
  const handleSaveUnknowns = useCallback(() => {
    for (const [blockName, asmType] of Object.entries(unknownAssignments)) {
      if (asmType) addUserOverride(blockName, asmType)
    }
    setShowUnknowns(false)
    setUnknownAssignments({})
    // Force re-render by toggling selection
    setSelected(prev => ({ ...prev }))
  }, [unknownAssignments])

  return (
    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
      {/* Left: Plan selection */}
      <div style={{ width: 280, minWidth: 220, overflow: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
            Elemzett rajzok
          </div>
          {parsedPlans.length > 0 && (
            <button onClick={selectAll} style={{
              background: 'transparent', border: 'none', color: C.accent,
              fontFamily: 'DM Mono', fontSize: 10, cursor: 'pointer', textDecoration: 'underline',
            }}>Mind kiválaszt</button>
          )}
        </div>

        {parsedPlans.length === 0 ? (
          <div style={{
            padding: 20, textAlign: 'center', background: C.bgCard,
            borderRadius: 8, border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
            <div style={{ fontFamily: 'Syne', fontSize: 12, color: C.textSub }}>Nincs elemzett rajz</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 4 }}>
              Elemezd a rajzokat a Tervrajzok oldalon a 🔍 gombbal
            </div>
          </div>
        ) : parsedPlans.map(plan => {
          const isSelected = !!selected[plan.id]
          const blockCount = plan.parseResult?.blocks?.length || 0
          const recognizedCount = (plan.parseResult?.blocks || []).filter(b => b.assemblyType && b.assemblyType !== 'unknown').length
          return (
            <div key={plan.id} onClick={() => toggleSelect(plan.id)} style={{
              background: isSelected ? C.accent + '10' : C.bgCard,
              border: `1px solid ${isSelected ? C.accent + '40' : C.border}`,
              borderRadius: 8, padding: 10, marginBottom: 6, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{plan.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {plan.floor && <MiniTag text={plan.floor} />}
                    {plan.discipline && <MiniTag text={plan.discipline} color={C.accent} />}
                    <MiniTag text={recognizedCount < blockCount ? `${recognizedCount}/${blockCount} blokk` : `${blockCount} blokk`} color={recognizedCount < blockCount ? '#f59e0b' : '#888'} />
                  </div>
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginLeft: 8,
                  border: `2px solid ${isSelected ? C.accent : C.border}`,
                  background: isSelected ? C.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.bg, fontSize: 11, fontWeight: 700,
                }}>{isSelected ? '✓' : ''}</div>
              </div>
            </div>
          )
        })}

        {unparsedPlans.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b30' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#92400e' }}>
              ⚠ {unparsedPlans.length} elemzetlen DXF/DWG — elemezd a Tervrajzok oldalon
            </div>
          </div>
        )}
      </div>

      {/* Right: Aggregated results */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {selectedIds.length === 0 ? (
          <EmptyState icon="📊" title="Válassz ki elemzett rajzokat" subtitle="Az automatikus blokkfelismerés eredménye összesítésre kerül" />
        ) : (
          <>
            {/* Filters + View toggle + CSV export */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge color="blue">{selectedIds.length} rajz · {grandTotal} felismert{totalBlockCount > grandTotal ? ` / ${totalBlockCount} blokk` : ' elem'}</Badge>
              <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} style={filterSelectStyle}>
                <option value="">Összes emelet</option>
                {availableFloors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={filterDiscipline} onChange={e => setFilterDiscipline(e.target.value)} style={filterSelectStyle}>
                <option value="">Összes diszciplína</option>
                {availableDisciplines.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {/* View mode toggle */}
              <div style={{ display: 'flex', background: C.bg, borderRadius: 7, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                {[
                  { key: 'total', label: 'TOTAL' },
                  { key: 'byFloor', label: 'Emeletek' },
                  { key: 'byDiscipline', label: 'Diszciplínák' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setViewMode(key)} style={{
                    padding: '5px 11px', border: 'none', cursor: 'pointer',
                    fontFamily: 'DM Mono', fontSize: 10,
                    background: viewMode === key ? C.accent + '25' : 'transparent',
                    color: viewMode === key ? C.accent : C.muted,
                    borderRight: `1px solid ${C.border}`,
                    fontWeight: viewMode === key ? 700 : 400,
                    transition: 'all 0.12s',
                  }}>{label}</button>
                ))}
              </div>
              {/* CSV export */}
              {rows.length > 0 && (
                <button onClick={handleExportCSV} style={{
                  padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: `1px solid ${C.border}`,
                  color: C.textSub, fontFamily: 'DM Mono', fontSize: 10,
                }}>⬇ CSV</button>
              )}
            </div>

            {/* Unknown symbol warning */}
            {dedupedUnknowns.length > 0 && (
              <div onClick={() => setShowUnknowns(true)} style={{
                padding: '10px 14px', background: '#fef3c7', borderRadius: 8,
                border: '1px solid #f59e0b40', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                    ⚠ {dedupedUnknowns.length} ismeretlen szimbólum
                  </span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#b45309', marginLeft: 8 }}>
                    — Kattints a hozzárendeléshez
                  </span>
                </div>
                <span style={{ fontFamily: 'DM Mono', fontSize: 16, color: '#92400e' }}>→</span>
              </div>
            )}

            {/* Aggregated table — view depends on viewMode */}
            <SectionCard title={
              viewMode === 'total' ? 'Összesítő (TOTAL)' :
              viewMode === 'byFloor' ? 'Összesítő emeletek szerint' :
              'Összesítő diszciplínák szerint'
            }>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Mono', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      <th style={thStyle}>Szerelvény típus</th>
                      {viewMode === 'byFloor' && floorList.map(f => <th key={f} style={thStyleCenter}>{f}</th>)}
                      {viewMode === 'byDiscipline' && disciplineList.map(d => <th key={d} style={thStyleCenter}>{d}</th>)}
                      <th style={{ ...thStyleCenter, color: C.accent, fontWeight: 800 }}>ÖSSZ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewMode === 'byDiscipline' ? disciplineRows : rows).map(row => (
                      <tr key={row.assemblyType} style={{ borderBottom: `1px solid ${C.border}10` }}>
                        <td style={tdStyle}>{row.label}</td>
                        {viewMode === 'byFloor' && floorList.map(f => (
                          <td key={f} style={tdStyleCenter}>{row.floors[f] || '—'}</td>
                        ))}
                        {viewMode === 'byDiscipline' && disciplineList.map(d => (
                          <td key={d} style={tdStyleCenter}>{row.disciplines[d] || '—'}</td>
                        ))}
                        <td style={{ ...tdStyleCenter, fontWeight: 700, color: C.accent }}>{row.total}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={
                          viewMode === 'byFloor' ? floorList.length + 2 :
                          viewMode === 'byDiscipline' ? disciplineList.length + 2 : 2
                        } style={{ ...tdStyleCenter, color: C.muted, padding: 20 }}>
                          {dedupedUnknowns.length > 0
                            ? <span>Nincs felismert elem — <span onClick={() => setShowUnknowns(true)} style={{ color: '#f59e0b', cursor: 'pointer', textDecoration: 'underline' }}>rendeld hozzá a(z) {dedupedUnknowns.length} ismeretlen szimbólumot ↑</span></span>
                            : 'Nincs felismert elem'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.border}` }}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>ÖSSZESEN</td>
                        {viewMode === 'byFloor' && floorList.map(f => {
                          const sum = Object.values(mergeResult.byFloor[f] || {}).reduce((s, v) => s + v, 0)
                          return <td key={f} style={{ ...tdStyleCenter, fontWeight: 700 }}>{sum}</td>
                        })}
                        {viewMode === 'byDiscipline' && disciplineList.map(d => {
                          const sum = Object.values(mergeResult.byDiscipline[d] || {}).reduce((s, v) => s + v, 0)
                          return <td key={d} style={{ ...tdStyleCenter, fontWeight: 700 }}>{sum}</td>
                        })}
                        <td style={{ ...tdStyleCenter, fontWeight: 800, color: C.accent, fontSize: 13 }}>{grandTotal}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </SectionCard>

            {/* Assembly assignment for DXF types */}
            {rows.length > 0 && (
              <SectionCard title="Assembly hozzárendelés (DXF)">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {rows.map(row => (
                    <div key={row.assemblyType} style={{ background: C.bg, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, marginBottom: 4 }}>
                        {row.label} <span style={{ color: C.muted }}>({row.total})</span>
                      </div>
                      <select value={assignments[row.assemblyType] || ''}
                        onChange={e => setAssignments(p => ({ ...p, [row.assemblyType]: e.target.value || null }))}
                        style={selectStyle}>
                        <option value="">— Assembly —</option>
                        {assemblies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Cost estimate — uses same computePricing engine as TakeoffWorkspace */}
            {rows.length > 0 && (
              <SectionCard title="Költségbecslés (DXF)">
                {costEstimate.total === 0 && Object.values(assignments).every(v => !v) && (
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 10 }}>
                    ℹ Rendelj hozzá assembly-ket a fenti panelben az árak megjelenítéséhez
                  </div>
                )}
                <Row label="Anyagköltség" value={`${Math.round(costEstimate.materialCost).toLocaleString('hu-HU')} Ft`} />
                <Row label={`Munkadíj (${(costEstimate.laborHours || 0).toFixed(1)} óra)`} value={`${Math.round(costEstimate.laborCost).toLocaleString('hu-HU')} Ft`} />
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>{Math.round(costEstimate.subtotal || costEstimate.total || 0).toLocaleString('hu-HU')} Ft</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó ({costEstimate.vatPct ?? 27}% ÁFA)</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>
                    {Math.round((costEstimate.subtotal || 0) * (1 + (costEstimate.vatPct ?? 27) / 100)).toLocaleString('hu-HU')} Ft
                  </span>
                </div>
              </SectionCard>
            )}

            {/* Create quote */}
            <button onClick={() => onCreateQuote?.({
              source: 'dxf_analysis',
              mergedFrom: selectedIds,
              countByAssemblyType: mergeResult.total,
              byFloor: mergeResult.byFloor,
              assignments,
              costEstimate,
            })} disabled={rows.length === 0} style={{
              ...primaryButtonStyle,
              opacity: rows.length === 0 ? 0.5 : 1,
              cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
            }}>
              📥 Árajánlat létrehozása (DXF elemzésből)
            </button>
          </>
        )}

        {/* Unknown symbol modal */}
        {showUnknowns && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }} onClick={() => setShowUnknowns(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: C.bgCard, borderRadius: 14, padding: 24, width: 500, maxHeight: '70vh',
              overflow: 'auto', border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>
                Ismeretlen szimbólumok
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 16 }}>
                Rendeld hozzá az ismeretlen DXF blokkokat a megfelelő szerelvény típushoz.
                Az összerendelések mentésre kerülnek a szimbólum szótárba.
              </div>
              {dedupedUnknowns.map(u => (
                <div key={u.blockName} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: `1px solid ${C.border}10`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{u.blockName}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
                      {u.totalCount}× — {u.plans.map(p => p.planName).join(', ')}
                    </div>
                  </div>
                  <select value={unknownAssignments[u.blockName] || ''}
                    onChange={e => setUnknownAssignments(p => ({ ...p, [u.blockName]: e.target.value }))}
                    style={{ ...selectStyle, width: 180 }}>
                    <option value="">— Típus —</option>
                    {ASSEMBLY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setShowUnknowns(false)} style={{
                  flex: 1, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                  background: C.bg, border: `1px solid ${C.border}`, color: C.text,
                  fontFamily: 'Syne', fontSize: 13, fontWeight: 600,
                }}>Mégse</button>
                <button onClick={handleSaveUnknowns} style={{
                  flex: 1, ...primaryButtonStyle, width: 'auto',
                }}>Mentés a szótárba</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF Recognition Tab — Vision AI results aggregated across PDF plans
// ═══════════════════════════════════════════════════════════════════════════

function PdfRecognitionTab({ plans, onCreateQuote }) {
  const [selected, setSelected] = useState({})
  const [assignments, setAssignments] = useState({}) // _pdfType → assemblyId override
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])
  const workItems  = useMemo(() => { try { return loadWorkItems()  } catch { return [] } }, [])
  const materials  = useMemo(() => { try { return loadMaterials()  } catch { return [] } }, [])

  // Plans with successful Vision AI recognition
  const recognizedPlans = useMemo(() =>
    plans.filter(p => p.fileType === 'pdf' && p.pdfRecognition?.status === 'done'),
  [plans])

  // Plans that are still pending or errored
  const pendingPlans = useMemo(() =>
    plans.filter(p => p.fileType === 'pdf' && p.pdfRecognition?.status !== 'done'),
  [plans])

  const toggleSelect = useCallback((id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const selectAll = useCallback(() => {
    const all = {}
    for (const p of recognizedPlans) all[p.id] = true
    setSelected(all)
  }, [recognizedPlans])

  const selectedIds = Object.keys(selected).filter(id => selected[id])
  const selectedPlans = recognizedPlans.filter(p => selectedIds.includes(p.id))

  // Aggregate recognized items: group by _pdfType, sub-group by plan.floor
  const aggregated = useMemo(() => {
    // { _pdfType: { label, icon, asmId, confidences[], floors: { floorName: qty }, total } }
    const map = {}
    for (const plan of selectedPlans) {
      const floor = plan.floor || 'Egyéb'
      for (const item of (plan.pdfRecognition?.recognizedItems || [])) {
        const type = item._pdfType || item.blockName
        if (!map[type]) {
          map[type] = {
            label: item.label || type,
            icon: item.icon || '▪',
            asmId: item.asmId || null,
            confidences: [],
            floors: {},
            total: 0,
          }
        }
        map[type].floors[floor] = (map[type].floors[floor] || 0) + (item.qty || 0)
        map[type].total += item.qty || 0
        if (item.confidence != null) map[type].confidences.push(item.confidence)
      }
    }
    return map
  }, [selectedPlans])

  const pdfTypes = Object.keys(aggregated)

  // All floors present across selected plans (for column headers)
  const floorList = useMemo(() => {
    const floors = new Set()
    for (const plan of selectedPlans) {
      floors.add(plan.floor || 'Egyéb')
    }
    return [...floors]
  }, [selectedPlans])

  // Cable estimate: sum across selected plans
  const totalCableM = useMemo(() => {
    return selectedPlans.reduce((s, p) => s + (p.pdfRecognition?.cableEstimate?.cable_total_m || 0), 0)
  }, [selectedPlans])

  // Grand total
  const grandTotal = useMemo(() =>
    Object.values(aggregated).reduce((s, v) => s + v.total, 0),
  [aggregated])

  // Average confidence
  const avgConfidence = useMemo(() => {
    const all = Object.values(aggregated).flatMap(d => d.confidences)
    if (all.length === 0) return null
    return Math.round(all.reduce((s, v) => s + v, 0) / all.length * 100)
  }, [aggregated])

  // Cost estimate: computePricing (same engine as TakeoffWorkspace + DxfAnalysisTab)
  const costEstimate = useMemo(() => {
    const settings = loadSettings()
    const hourlyRate = Number(settings?.labor?.hourly_rate) || 9000
    const vatPct     = Number(settings?.labor?.vat_percent)  || 27

    // Build takeoffRows: each PDF-recognised type + user assignment overrides
    const takeoffRows = Object.entries(aggregated)
      .map(([type, data]) => ({
        asmId: assignments[type] || data.asmId,
        qty:   data.total,
        variantId: null,
        wallSplits: null,
      }))
      .filter(r => r.asmId && r.qty > 0)

    // Build a synthetic cable estimate from the summed cable metres across plans
    const cableEst = totalCableM > 0
      ? { cable_total_m: totalCableM, cable_by_type: { socket_m: totalCableM } }
      : null

    if (takeoffRows.length === 0 && !cableEst) {
      return { materialCost: 0, laborCost: 0, laborHours: 0, subtotal: 0, markup: 0, total: 0, lines: [], vatPct }
    }

    const result = computePricing({
      takeoffRows, assemblies, workItems, materials,
      context: null, markup: 0, hourlyRate,
      cableEstimate: cableEst, difficultyMode: 'normal',
    })
    return { ...result, vatPct }
  }, [assignments, aggregated, assemblies, workItems, materials, totalCableM])

  return (
    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
      {/* Left: Plan selection */}
      <div style={{ width: 280, minWidth: 220, overflow: 'auto', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
            Felismert PDF-ek
          </div>
          {recognizedPlans.length > 0 && (
            <button onClick={selectAll} style={{
              background: 'transparent', border: 'none', color: C.accent,
              fontFamily: 'DM Mono', fontSize: 10, cursor: 'pointer', textDecoration: 'underline',
            }}>Mind kiválaszt</button>
          )}
        </div>

        {recognizedPlans.length === 0 ? (
          <div style={{
            padding: 20, textAlign: 'center', background: C.bgCard,
            borderRadius: 8, border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
            <div style={{ fontFamily: 'Syne', fontSize: 12, color: C.textSub }}>Nincs felismert PDF</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 4 }}>
              A Vision AI elemzés automatikusan indul PDF feltöltéskor
            </div>
          </div>
        ) : recognizedPlans.map(plan => {
          const isSelected = !!selected[plan.id]
          const pr = plan.pdfRecognition
          const itemCount = pr?.recognizedItems?.length || 0
          const cableM = pr?.cableEstimate?.cable_total_m
          return (
            <div key={plan.id} onClick={() => toggleSelect(plan.id)} style={{
              background: isSelected ? C.accent + '10' : C.bgCard,
              border: `1px solid ${isSelected ? C.accent + '40' : C.border}`,
              borderRadius: 8, padding: 10, marginBottom: 6, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{plan.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {plan.floor && <MiniTag text={plan.floor} />}
                    {plan.discipline && <MiniTag text={plan.discipline} color={C.accent} />}
                    <MiniTag text={`${itemCount} elem`} color="#888" />
                    {cableM != null && <MiniTag text={`~${Math.round(cableM)}m kábel`} color="#4CC9F0" />}
                  </div>
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginLeft: 8,
                  border: `2px solid ${isSelected ? C.accent : C.border}`,
                  background: isSelected ? C.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.bg, fontSize: 11, fontWeight: 700,
                }}>{isSelected ? '✓' : ''}</div>
              </div>
            </div>
          )
        })}

        {/* Pending / errored PDF notice */}
        {pendingPlans.length > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,209,102,0.05)', borderRadius: 8, border: '1px solid rgba(255,209,102,0.2)' }}>
            {(() => {
              const errored = pendingPlans.filter(p => p.pdfRecognition?.status === 'error').length
              const running = pendingPlans.filter(p => p.pdfRecognition?.status === 'running').length
              const unstarted = pendingPlans.filter(p => !p.pdfRecognition).length
              const msg = errored > 0 ? `${errored} PDF felismerés sikertelen — kézi jelölés szükséges`
                : running > 0 ? `${running} PDF elemzés folyamatban…`
                : `${unstarted} PDF még nem elemzett`
              return (
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#FFD166' }}>⚠ {msg}</div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Right: Aggregated results */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {selectedIds.length === 0 ? (
          <EmptyState icon="📄" title="Válassz ki felismert PDF terveket" subtitle="A Vision AI által azonosított elemek összesítésre kerülnek" />
        ) : (
          <>
            {/* Summary bar */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge color="red">{selectedIds.length} PDF · {grandTotal} elem</Badge>
              {totalCableM > 0 && (
                <Badge color="blue">~{Math.round(totalCableM)}m kábel</Badge>
              )}
              {avgConfidence != null && (
                <span style={{
                  fontFamily: 'DM Mono', fontSize: 10,
                  color: avgConfidence >= 80 ? C.accent : avgConfidence >= 60 ? '#FFD166' : '#FF6B6B',
                  padding: '3px 8px', borderRadius: 4,
                  background: 'rgba(255,209,102,0.08)', border: '1px solid rgba(255,209,102,0.2)',
                }}>
                  🎯 Konfidencia: {avgConfidence}%
                </span>
              )}
            </div>

            {/* Confidence disclaimer */}
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(255,209,102,0.05)', border: '1px solid rgba(255,209,102,0.18)',
            }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#FFD166' }}>
                ⚠ Vision AI becslés — nem determinisztikus. Az értékek ±15–25%-kal eltérhetnek.
                DXF rajz elérhető esetén a DXF elemzés pontosabb.
              </span>
            </div>

            {/* Aggregated table */}
            <SectionCard title="Összesítő (PDF felismerés)">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Mono', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      <th style={thStyle}>Elem típus</th>
                      {floorList.map(f => <th key={f} style={thStyleCenter}>{f}</th>)}
                      <th style={{ ...thStyleCenter, color: C.accent, fontWeight: 800 }}>ÖSSZ</th>
                      <th style={{ ...thStyleCenter, color: '#FFD166', fontWeight: 700 }}>Konfid.</th>
                      <th style={{ ...thStyleCenter, color: '#4CC9F0', fontSize: 9, fontWeight: 600 }}>Forrás</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdfTypes.map(type => {
                      const data = aggregated[type]
                      const conf = data.confidences.length > 0
                        ? Math.round(data.confidences.reduce((s, v) => s + v, 0) / data.confidences.length * 100)
                        : null
                      const confColor = conf == null ? C.muted : conf >= 80 ? C.accent : conf >= 60 ? '#FFD166' : '#FF6B6B'
                      return (
                        <tr key={type} style={{ borderBottom: `1px solid ${C.border}10` }}>
                          <td style={tdStyle}>
                            <span>{data.icon} {data.label}</span>
                            {!data.asmId && !assignments[type] && (
                              <span title="Nincs Assembly hozzárendelés" style={{ color: '#FFD166', marginLeft: 6, fontSize: 10 }}>⚠</span>
                            )}
                          </td>
                          {floorList.map(f => (
                            <td key={f} style={tdStyleCenter}>{data.floors[f] || '—'}</td>
                          ))}
                          <td style={{ ...tdStyleCenter, fontWeight: 700, color: C.accent }}>{data.total}</td>
                          <td style={{ ...tdStyleCenter, color: confColor }}>
                            {conf != null ? `${conf}%` : '—'}
                          </td>
                          <td style={{ ...tdStyleCenter, color: '#4CC9F0', fontSize: 9 }}>[PDF]</td>
                        </tr>
                      )
                    })}
                    {pdfTypes.length === 0 && (
                      <tr>
                        <td colSpan={floorList.length + 4} style={{ ...tdStyleCenter, color: C.muted, padding: 20 }}>
                          Nincs felismert elem
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {pdfTypes.length > 0 && totalCableM > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.border}` }}>
                        <td colSpan={floorList.length + 1} style={{ ...tdStyle, fontWeight: 800, color: C.textSub }}>Kábel becslés</td>
                        <td style={{ ...tdStyleCenter, color: '#4CC9F0', fontWeight: 700 }}>~{Math.round(totalCableM)}m</td>
                        <td colSpan={2} style={{ ...tdStyleCenter, color: C.muted, fontSize: 9 }}>MST / konzervatív</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </SectionCard>

            {/* Assembly override — only for types without pre-mapped asmId */}
            {pdfTypes.some(t => !aggregated[t].asmId) && (
              <SectionCard title="Assembly hozzárendelés (hiányzó)">
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 10 }}>
                  A ⚠ jelű elemekhez nincs automatikus Assembly — rendeld hozzá manuálisan:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {pdfTypes.filter(t => !aggregated[t].asmId).map(type => (
                    <div key={type} style={{ background: C.bg, borderRadius: 8, padding: 10, border: '1px solid rgba(255,209,102,0.25)' }}>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#FFD166', marginBottom: 4 }}>
                        {aggregated[type].icon} {aggregated[type].label} ({aggregated[type].total})
                      </div>
                      <select
                        value={assignments[type] || ''}
                        onChange={e => setAssignments(p => ({ ...p, [type]: e.target.value || null }))}
                        style={selectStyle}
                      >
                        <option value="">— Assembly —</option>
                        {assemblies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Cost estimate */}
            {pdfTypes.length > 0 && (
              <SectionCard title="Költségbecslés (PDF)">
                <Row label="Anyagköltség" value={`${Math.round(costEstimate.materialCost).toLocaleString('hu-HU')} Ft`} />
                {totalCableM > 0 && (
                  <Row label={`Kábel (~${Math.round(totalCableM)} m)`} value={`(anyagköltségbe számítva)`} />
                )}
                <Row label={`Munkadíj (${(costEstimate.laborHours || 0).toFixed(1)} óra)`} value={`${Math.round(costEstimate.laborCost).toLocaleString('hu-HU')} Ft`} />
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>{Math.round(costEstimate.subtotal || costEstimate.total || 0).toLocaleString('hu-HU')} Ft</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó ({costEstimate.vatPct ?? 27}% ÁFA)</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round((costEstimate.subtotal || 0) * (1 + (costEstimate.vatPct ?? 27) / 100)).toLocaleString('hu-HU')} Ft</span>
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginTop: 8 }}>
                  ⚠ Vision AI becslés alapján — ellenőrizd DXF rajz alapján, ha elérhető
                </div>
              </SectionCard>
            )}

            {/* Create quote button */}
            <button
              onClick={() => onCreateQuote?.({
                source: 'pdf_recognition',
                mergedFrom: selectedIds,
                recognizedItems: pdfTypes.map(type => ({
                  _pdfType: type,
                  label: aggregated[type].label,
                  icon: aggregated[type].icon,
                  total: aggregated[type].total,
                  byFloor: aggregated[type].floors,
                  asmId: assignments[type] || aggregated[type].asmId,
                })),
                totalCableM,
                costEstimate,
              })}
              disabled={pdfTypes.length === 0}
              style={{
                ...primaryButtonStyle,
                opacity: pdfTypes.length === 0 ? 0.5 : 1,
                cursor: pdfTypes.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              📥 Árajánlat létrehozása (PDF felismerésből)
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared UI components
// ═══════════════════════════════════════════════════════════════════════════

function SectionCard({ title, children, style = {} }) {
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, ...style }}>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontFamily: 'Syne', fontSize: 14, color: C.textSub }}>{title}</div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 6 }}>{subtitle}</div>
      </div>
    </div>
  )
}

function MiniTag({ text, color }) {
  return (
    <span style={{
      fontFamily: 'DM Mono', fontSize: 9, padding: '2px 6px', borderRadius: 4,
      background: (color || C.text) + '15', color: color || C.textSub,
    }}>{text}</span>
  )
}

function Row({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: accent ? C.accent : C.textSub }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: accent ? C.accent : C.text, fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '5px 8px', borderRadius: 5, marginBottom: 8, boxSizing: 'border-box',
  background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'DM Mono',
}

const selectStyle = {
  width: '100%', padding: '6px 8px', borderRadius: 5,
  background: C.bgCard, border: `1px solid ${C.border}`, color: C.text,
  fontSize: 11, fontFamily: 'DM Mono',
}

const filterSelectStyle = {
  padding: '5px 10px', borderRadius: 6, background: C.bgCard,
  border: `1px solid ${C.border}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono',
}

const thStyle = {
  textAlign: 'left', padding: '8px 10px', color: C.textSub, fontWeight: 700, fontSize: 11,
}

const thStyleCenter = {
  textAlign: 'center', padding: '8px 10px', color: C.textSub, fontWeight: 700, fontSize: 11,
}

const tdStyle = {
  textAlign: 'left', padding: '7px 10px', color: C.text, fontSize: 11,
}

const tdStyleCenter = {
  textAlign: 'center', padding: '7px 10px', color: C.text, fontSize: 11,
}

const primaryButtonStyle = {
  padding: '14px 24px', borderRadius: 10, cursor: 'pointer',
  background: C.accent, border: 'none', color: C.bg,
  fontSize: 15, fontFamily: 'Syne', fontWeight: 700, width: '100%',
}
