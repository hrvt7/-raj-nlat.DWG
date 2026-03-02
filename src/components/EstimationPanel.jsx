import React, { useState, useMemo, useCallback } from 'react'
import { COUNT_CATEGORIES } from './DxfViewer/DxfToolbar.jsx'
import { loadAssemblies } from '../data/store.js'

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
  socketHeight = 0.3,
  onCeilingHeightChange,
  onSocketHeightChange,
  onGenerateCableRoutes,
  cableRoutes = [],      // [{ fromX, fromY, toX, toY, distance, category }]
  onClose,
  onCreateQuote,
}) {
  const [tab, setTab] = useState('summary')
  const [assignments, setAssignments] = useState({}) // { [category]: assemblyId }
  const assemblies = useMemo(() => {
    try { return loadAssemblies() } catch { return [] }
  }, [])

  // ── Count summary ──
  const countByCategory = useMemo(() => {
    const map = {}
    for (const m of markers) {
      map[m.category] = (map[m.category] || 0) + 1
    }
    return map
  }, [markers])

  const totalMarkers = markers.length

  // ── Panel marker (if exists) ──
  const panelMarker = markers.find(m => m.category === 'panel')

  // ── Cable calculations ──
  const cableData = useMemo(() => {
    if (!scale.calibrated || !scale.factor) return null
    if (!panelMarker) return null

    const devices = markers.filter(m => m.category !== 'panel')
    let totalHorizontal = 0
    let totalVertical = 0
    const routes = []

    for (const dev of devices) {
      // Manhattan distance from panel to device
      const dx = Math.abs(dev.x - panelMarker.x)
      const dy = Math.abs(dev.y - panelMarker.y)
      const sceneDist = dx + dy
      const realDist = sceneDist * scale.factor

      // Vertical: ceiling_height - device_height (socket at 30cm, switch at 120cm, etc.)
      let deviceHeight = socketHeight
      if (dev.category === 'switch') deviceHeight = 1.2
      else if (dev.category === 'light') deviceHeight = 0 // ceiling mount
      else if (dev.category === 'junction') deviceHeight = ceilingHeight - 0.3
      else if (dev.category === 'conduit') deviceHeight = ceilingHeight - 0.1

      const verticalRun = (ceilingHeight - deviceHeight) + (ceilingHeight - 0.1) // device drop + panel rise

      totalHorizontal += realDist
      totalVertical += verticalRun

      routes.push({
        fromX: panelMarker.x, fromY: panelMarker.y,
        toX: dev.x, toY: dev.y,
        horizontal: realDist,
        vertical: verticalRun,
        total: realDist + verticalRun,
        category: dev.category,
      })
    }

    return {
      routes,
      totalHorizontal,
      totalVertical,
      totalCable: totalHorizontal + totalVertical,
      deviceCount: devices.length,
      wastePercent: 15,
      get totalWithWaste() { return this.totalCable * (1 + this.wastePercent / 100) },
    }
  }, [markers, scale, panelMarker, ceilingHeight, socketHeight])

  // ── Category cables breakdown ──
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

  // ── Assembly assignment ──
  const handleAssign = useCallback((category, assemblyId) => {
    setAssignments(prev => ({ ...prev, [category]: assemblyId }))
  }, [])

  // ── Calculate total cost ──
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

    // Cable cost (rough: 800 Ft/m for NYM-J 3x2.5)
    const cableTotal = cableData ? cableData.totalWithWaste : 0
    const cableCost = cableTotal * 800

    return {
      materialCost: totalMaterial,
      cableCost,
      laborMinutes: totalLabor,
      laborHours: totalLabor / 60,
      laborCost: (totalLabor / 60) * 9000, // 9000 Ft/hr default
      totalCable: cableTotal,
      grandTotal: totalMaterial + cableCost + (totalLabor / 60) * 9000,
    }
  }, [assignments, countByCategory, assemblies, cableData])

  const TABS = [
    { id: 'summary', label: 'Összesítő' },
    { id: 'cables', label: 'Kábelek' },
    { id: 'assign', label: 'Assemblyk' },
    { id: 'quote', label: 'Kalkuláció' },
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bgCard, borderLeft: `1px solid ${C.border}`,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>
          Kalkuláció
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
          fontSize: 18, padding: 4, lineHeight: 1,
        }}>✕</button>
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
          <SummaryTab
            countByCategory={countByCategory}
            totalMarkers={totalMarkers}
            measurements={measurements}
            scale={scale}
            cableData={cableData}
            panelMarker={panelMarker}
          />
        )}
        {tab === 'cables' && (
          <CablesTab
            cableData={cableData}
            cableByCategory={cableByCategory}
            scale={scale}
            panelMarker={panelMarker}
            ceilingHeight={ceilingHeight}
            socketHeight={socketHeight}
            onCeilingHeightChange={onCeilingHeightChange}
            onSocketHeightChange={onSocketHeightChange}
          />
        )}
        {tab === 'assign' && (
          <AssignTab
            countByCategory={countByCategory}
            assemblies={assemblies}
            assignments={assignments}
            onAssign={handleAssign}
          />
        )}
        {tab === 'quote' && (
          <QuoteTab
            costEstimate={costEstimate}
            countByCategory={countByCategory}
            assignments={assignments}
            assemblies={assemblies}
            cableData={cableData}
            onCreateQuote={onCreateQuote}
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
      {/* Status indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <StatusRow ok={totalMarkers > 0} label={`${totalMarkers} elem bejelölve`} hint="Jelölj be elemeket a tervrajzon" />
        <StatusRow ok={!!panelMarker} label="Elosztó megjelölve" hint="Jelölj be egy elosztó elemet" />
        <StatusRow ok={scale.calibrated} label="Skála kalibrálva" hint='Használd a "Skála" eszközt a kalibráláshoz' />
        <StatusRow ok={!!cableData} label="Kábel számítás kész" hint="Jelölj be elosztót + kalibrálj skálát" />
      </div>

      {/* Count summary */}
      {totalMarkers > 0 && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
            Eszközök ({totalMarkers})
          </div>
          {COUNT_CATEGORIES.filter(c => countByCategory[c.key]).map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: c.color }}>{c.label}</span>
              </div>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: c.color }}>
                {countByCategory[c.key]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Cable summary */}
      {cableData && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
            Kábel összesítő
          </div>
          <StatRow label="Vízszintes" value={`${cableData.totalHorizontal.toFixed(1)} m`} />
          <StatRow label="Függőleges" value={`${cableData.totalVertical.toFixed(1)} m`} />
          <StatRow label="Összesen" value={`${cableData.totalCable.toFixed(1)} m`} accent />
          <StatRow label={`+ ${cableData.wastePercent}% hulladék`} value={`${cableData.totalWithWaste.toFixed(1)} m`} />
        </div>
      )}

      {/* Measurements */}
      {measurements.length > 0 && scale.calibrated && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginTop: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
            Mérések ({measurements.length})
          </div>
          {measurements.map((m, i) => (
            <StatRow key={i} label={`Mérés #${i + 1}`} value={`${(m.dist * scale.factor).toFixed(2)} m`} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Cables Tab ─────────────────────────────────────────────────────────────

function CablesTab({ cableData, cableByCategory, scale, panelMarker, ceilingHeight, socketHeight, onCeilingHeightChange, onSocketHeightChange }) {
  if (!scale.calibrated) {
    return <HintBox icon="📐" text='Először kalibráld a skálát a "Skála" eszközzel, hogy a kábelhossz számítás pontos legyen.' />
  }
  if (!panelMarker) {
    return <HintBox icon="⚡" text='Jelöld be az elosztó(ka)t a tervrajzon az "Elosztó" kategóriával, hogy a kábelútvonalak kiszámolhatóak legyenek.' />
  }
  if (!cableData || cableData.routes.length === 0) {
    return <HintBox icon="📍" text="Jelölj be eszközöket (dugalj, kapcsoló, stb.) a tervrajzon, hogy a kábelhossz számítás elkészüljön." />
  }

  return (
    <div>
      {/* Height settings */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
          Magassági beállítások
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <NumberInput label="Belmagasság (m)" value={ceilingHeight} onChange={onCeilingHeightChange} min={2} max={6} step={0.1} />
          <NumberInput label="Dugalj mag. (m)" value={socketHeight} onChange={onSocketHeightChange} min={0.1} max={2} step={0.05} />
        </div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Mono', marginTop: 8 }}>
          A rendszer automatikusan hozzáadja a függőleges kábelhosszt: elosztótól a mennyezetig + mennyezettől az eszközig.
        </div>
      </div>

      {/* Per-category breakdown */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
          Kábelhossz kategóriánként
        </div>
        {COUNT_CATEGORIES.filter(c => cableByCategory[c.key]).map(c => {
          const d = cableByCategory[c.key]
          return (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: c.color }}>{c.label} ({d.count}×)</span>
              </div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 700 }}>
                {d.total.toFixed(1)} m
              </span>
            </div>
          )
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginTop: 4 }}>
          <span style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: C.accent }}>Összesen</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color: C.accent }}>
            {cableData.totalWithWaste.toFixed(1)} m
          </span>
        </div>
      </div>

      {/* Individual routes */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
          Egyedi útvonalak ({cableData.routes.length})
        </div>
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

function AssignTab({ countByCategory, assemblies, assignments, onAssign }) {
  const categories = COUNT_CATEGORIES.filter(c => countByCategory[c.key])

  if (categories.length === 0) {
    return <HintBox icon="📍" text="Jelölj be elemeket a tervrajzon, hogy assembly-ket rendelhess hozzájuk." />
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 16 }}>
        Rendelj assembly-t minden kategóriához, hogy az anyag- és munkadíj kiszámolható legyen.
      </div>

      {categories.map(c => {
        const count = countByCategory[c.key]
        const selectedId = assignments[c.key]
        const selectedAsm = assemblies.find(a => a.id === selectedId)

        return (
          <div key={c.key} style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 14, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                <span style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</span>
              </div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 700 }}>
                {count} db
              </span>
            </div>

            <select
              value={selectedId || ''}
              onChange={e => onAssign(c.key, e.target.value || null)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                background: C.bgCard, border: `1px solid ${C.border}`, color: C.text,
                fontSize: 12, fontFamily: 'DM Mono',
              }}
            >
              <option value="">— Válassz assembly-t —</option>
              {assemblies.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {selectedAsm && (
              <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'DM Mono', color: C.muted }}>
                {(selectedAsm.items || []).length} tétel · {selectedAsm.labor_minutes || 0} perc munka
                {selectedAsm.items?.length > 0 && (
                  <span> · anyag: {((selectedAsm.items || []).reduce((s, it) => s + (it.qty || 0) * (it.unit_price || 0), 0)).toLocaleString('hu-HU')} Ft</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Quote/Calculation Tab ──────────────────────────────────────────────────

function QuoteTab({ costEstimate, countByCategory, assignments, assemblies, cableData, onCreateQuote }) {
  const hasAssignments = Object.values(assignments).some(v => v)

  return (
    <div>
      {/* Cost breakdown */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>
          Költségbecslés
        </div>
        <StatRow label="Anyagköltség" value={`${costEstimate.materialCost.toLocaleString('hu-HU')} Ft`} />
        <StatRow label={`Kábel (${costEstimate.totalCable.toFixed(0)} m)`} value={`${costEstimate.cableCost.toLocaleString('hu-HU')} Ft`} />
        <StatRow label={`Munkadíj (${costEstimate.laborHours.toFixed(1)} óra)`} value={`${costEstimate.laborCost.toLocaleString('hu-HU')} Ft`} />
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
          <span style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 800, color: C.accent }}>
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

      {/* Per-category cost */}
      {hasAssignments && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>
            Részletes bontás
          </div>
          {COUNT_CATEGORIES.filter(c => countByCategory[c.key] && assignments[c.key]).map(c => {
            const count = countByCategory[c.key]
            const asm = assemblies.find(a => a.id === assignments[c.key])
            if (!asm) return null
            const matPerUnit = (asm.items || []).reduce((s, it) => s + (it.qty || 0) * (it.unit_price || 0), 0)
            return (
              <div key={c.key} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: c.color }}>{c.label} ({count}×)</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 700 }}>
                    {(matPerUnit * count).toLocaleString('hu-HU')} Ft
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'DM Mono', marginTop: 2 }}>
                  {asm.name} · {matPerUnit.toLocaleString('hu-HU')} Ft/db · {asm.labor_minutes} perc/db
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <button
        onClick={() => onCreateQuote?.({
          countByCategory,
          assignments,
          cableData,
          costEstimate,
        })}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
          background: C.accent, border: 'none', color: C.bg,
          fontSize: 14, fontFamily: 'Syne', fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Ajánlat létrehozása
      </button>

      {!hasAssignments && (
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono', textAlign: 'center', marginTop: 4 }}>
          Rendelj assembly-ket az "Assemblyk" fülön a pontos kalkulációhoz
        </div>
      )}
    </div>
  )
}

// ─── Utility components ─────────────────────────────────────────────────────

function StatusRow({ ok, label, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ok ? 'rgba(0,229,160,0.15)' : 'rgba(113,113,122,0.1)',
        color: ok ? C.accent : C.muted, fontSize: 11,
      }}>
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
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 20, textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

function NumberInput({ label, value, onChange, min, max, step }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: C.muted, marginBottom: 4 }}>{label}</div>
      <input
        type="number" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange?.(parseFloat(e.target.value) || min)}
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 5,
          background: C.bgCard, border: `1px solid ${C.border}`, color: C.text,
          fontSize: 13, fontFamily: 'DM Mono', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
