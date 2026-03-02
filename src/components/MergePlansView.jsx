import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { C, Button, Badge } from './ui.jsx'
import { COUNT_CATEGORIES } from './DxfViewer/DxfToolbar.jsx'
import { getPlanAnnotations, getPlanThumbnail } from '../data/planStore.js'
import { loadAssemblies } from '../data/store.js'

// ═══════════════════════════════════════════════════════════════════════════
// MergePlansView — Combine annotations from multiple plans into one estimate
// Use case: separate drawings for sockets, switches, cable trays → unified quote
// ═══════════════════════════════════════════════════════════════════════════

export default function MergePlansView({ plans, onClose, onCreateQuote }) {
  const [selected, setSelected] = useState({}) // { planId: true }
  const [annotations, setAnnotations] = useState({}) // { planId: { markers, measurements, scale, ... } }
  const [thumbnails, setThumbnails] = useState({})
  const [loading, setLoading] = useState(false)
  const [ceilingHeight, setCeilingHeight] = useState(3.0)
  const [socketHeight, setSocketHeight] = useState(0.3)
  const [assignments, setAssignments] = useState({})
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])

  // Load thumbnails
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

  // Load annotations for selected plans
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

  // ── Merge all markers from selected plans ──
  const mergedMarkers = useMemo(() => {
    const all = []
    for (const id of selectedIds) {
      const ann = annotations[id]
      if (ann?.markers) {
        for (const m of ann.markers) {
          all.push({ ...m, sourcePlan: id })
        }
      }
    }
    return all
  }, [selectedIds, annotations])

  // ── Count by category ──
  const countByCategory = useMemo(() => {
    const map = {}
    for (const m of mergedMarkers) {
      map[m.category] = (map[m.category] || 0) + 1
    }
    return map
  }, [mergedMarkers])

  // ── Best scale from any plan ──
  const bestScale = useMemo(() => {
    for (const id of selectedIds) {
      const ann = annotations[id]
      if (ann?.scale?.calibrated && ann?.scale?.factor) return ann.scale
    }
    return { factor: null, calibrated: false }
  }, [selectedIds, annotations])

  // ── Cable estimate (simplified for merge: uses average distance) ──
  const cableData = useMemo(() => {
    if (!bestScale.calibrated || !bestScale.factor) return null
    const panelMarkers = mergedMarkers.filter(m => m.category === 'panel')
    const devices = mergedMarkers.filter(m => m.category !== 'panel')
    if (panelMarkers.length === 0 || devices.length === 0) return null

    let totalHorizontal = 0
    let totalVertical = 0
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
      totalHorizontal,
      totalVertical,
      totalCable,
      wastePercent: 15,
      totalWithWaste: totalCable * 1.15,
      deviceCount: devices.length,
    }
  }, [mergedMarkers, bestScale, ceilingHeight, socketHeight])

  // ── Cost estimate ──
  const costEstimate = useMemo(() => {
    let totalMaterial = 0
    let totalLabor = 0
    for (const cat of Object.keys(countByCategory)) {
      const asmId = assignments[cat]
      if (!asmId) continue
      const asm = assemblies.find(a => a.id === asmId)
      if (!asm) continue
      const qty = countByCategory[cat]
      const matCost = (asm.items || []).reduce((s, it) => s + (it.qty || 0) * (it.unit_price || 0), 0)
      totalMaterial += matCost * qty
      totalLabor += (asm.labor_minutes || 0) * qty
    }
    const cableTotal = cableData ? cableData.totalWithWaste : 0
    const cableCost = cableTotal * 800
    return {
      materialCost: totalMaterial, cableCost, laborMinutes: totalLabor,
      laborHours: totalLabor / 60, laborCost: (totalLabor / 60) * 9000,
      totalCable: cableTotal, grandTotal: totalMaterial + cableCost + (totalLabor / 60) * 9000,
    }
  }, [assignments, countByCategory, assemblies, cableData])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={onClose} style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '6px 12px', cursor: 'pointer', color: C.text, fontSize: 13, fontFamily: 'Syne',
        }}>← Vissza</button>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 700, fontFamily: 'Syne' }}>
            Tervek összevonása
          </div>
          <div style={{ color: C.muted, fontSize: 11, fontFamily: 'DM Mono', marginTop: 2 }}>
            Válaszd ki a tervrajzokat, amelyek annotációit egyesíteni akarod
          </div>
        </div>
        <Badge color="blue">{selectedIds.length} kiválasztva</Badge>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Left: Plan selection */}
        <div style={{ width: 280, overflow: 'auto', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
            Tervrajzok
          </div>
          {plans.map(plan => {
            const isSelected = !!selected[plan.id]
            const ann = annotations[plan.id]
            return (
              <div key={plan.id} onClick={() => toggleSelect(plan.id)} style={{
                background: isSelected ? C.accent + '10' : C.bgCard,
                border: `1px solid ${isSelected ? C.accent + '40' : C.border}`,
                borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'pointer',
                display: 'flex', gap: 10, alignItems: 'center', transition: 'all 0.15s',
              }}>
                {/* Thumbnail or icon */}
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
                    {plan.markerCount || 0} elem{plan.hasScale ? ' • Kalibrálva' : ''}
                  </div>
                </div>
                {/* Checkbox */}
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

        {/* Right: Merged summary + estimation */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedIds.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontFamily: 'Syne', fontSize: 14, color: C.textSub }}>
                  Válassz ki legalább egy tervrajzot
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Az annotációk (markerek, mérések) összesítésre kerülnek
                </div>
              </div>
            </div>
          ) : (
            <>
              {loading && (
                <div style={{ color: C.accent, fontSize: 12, fontFamily: 'DM Mono' }}>Betöltés...</div>
              )}

              {/* Merged count summary */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>
                  Összesített elemek ({mergedMarkers.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                  {COUNT_CATEGORIES.filter(c => countByCategory[c.key]).map(c => (
                    <div key={c.key} style={{
                      background: C.bg, borderRadius: 8, padding: '10px 12px',
                      border: `1px solid ${c.color}20`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: c.color }}>{c.label}</span>
                      </div>
                      <div style={{ fontFamily: 'Syne', fontSize: 20, fontWeight: 800, color: c.color }}>
                        {countByCategory[c.key]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scale + Cable info */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
                    Kábel becslés
                  </div>
                  {!bestScale.calibrated ? (
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                      ⚠ Nincs kalibrált skála — kalibráld valamelyik tervrajzot
                    </div>
                  ) : !cableData ? (
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                      ⚠ Jelölj be elosztót + eszközöket
                    </div>
                  ) : (
                    <>
                      <Row label="Vízszintes" value={`${cableData.totalHorizontal.toFixed(1)} m`} />
                      <Row label="Függőleges" value={`${cableData.totalVertical.toFixed(1)} m`} />
                      <Row label="Összesen" value={`${cableData.totalCable.toFixed(1)} m`} accent />
                      <Row label={`+ ${cableData.wastePercent}% hulladék`} value={`${cableData.totalWithWaste.toFixed(1)} m`} />
                    </>
                  )}
                </div>
                <div style={{ width: 200, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
                    Beállítások
                  </div>
                  <label style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>
                    Belmagasság (m)
                  </label>
                  <input type="number" min={2} max={6} step={0.1} value={ceilingHeight}
                    onChange={e => setCeilingHeight(parseFloat(e.target.value) || 3)}
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: 5, marginBottom: 8, boxSizing: 'border-box',
                      background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'DM Mono',
                    }}
                  />
                  <label style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>
                    Dugalj magasság (m)
                  </label>
                  <input type="number" min={0.1} max={2} step={0.05} value={socketHeight}
                    onChange={e => setSocketHeight(parseFloat(e.target.value) || 0.3)}
                    style={{
                      width: '100%', padding: '5px 8px', borderRadius: 5, boxSizing: 'border-box',
                      background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: 'DM Mono',
                    }}
                  />
                </div>
              </div>

              {/* Assembly assignment */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>
                  Assembly hozzárendelés
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {COUNT_CATEGORIES.filter(c => countByCategory[c.key]).map(c => (
                    <div key={c.key} style={{ background: C.bg, borderRadius: 8, padding: 10, border: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: c.color }}>{c.label} ({countByCategory[c.key]})</span>
                      </div>
                      <select value={assignments[c.key] || ''} onChange={e => setAssignments(p => ({ ...p, [c.key]: e.target.value || null }))}
                        style={{
                          width: '100%', padding: '6px 8px', borderRadius: 5,
                          background: C.bgCard, border: `1px solid ${C.border}`, color: C.text,
                          fontSize: 11, fontFamily: 'DM Mono',
                        }}>
                        <option value="">— Assembly —</option>
                        {assemblies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost summary */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 12 }}>
                  Költségbecslés
                </div>
                <Row label="Anyagköltség" value={`${costEstimate.materialCost.toLocaleString('hu-HU')} Ft`} />
                <Row label={`Kábel (${costEstimate.totalCable.toFixed(0)} m)`} value={`${costEstimate.cableCost.toLocaleString('hu-HU')} Ft`} />
                <Row label={`Munkadíj (${costEstimate.laborHours.toFixed(1)} óra)`} value={`${costEstimate.laborCost.toLocaleString('hu-HU')} Ft`} />
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 800, color: C.accent }}>
                    {costEstimate.grandTotal.toLocaleString('hu-HU')} Ft
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó (27% ÁFA)</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>
                    {(costEstimate.grandTotal * 1.27).toLocaleString('hu-HU')} Ft
                  </span>
                </div>
              </div>

              {/* Create quote button */}
              <button onClick={() => onCreateQuote?.({
                mergedFrom: selectedIds,
                countByCategory, assignments, cableData, costEstimate,
                markers: mergedMarkers,
              })} style={{
                padding: '14px 24px', borderRadius: 10, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontSize: 15, fontFamily: 'Syne', fontWeight: 700, width: '100%',
              }}>
                Ajánlat létrehozása az összesítésből
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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
