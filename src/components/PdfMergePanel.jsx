import React, { useState, useEffect, useCallback } from 'react'
import { getPlanAnnotations } from '../data/planStore.js'
import { loadAssemblies, loadWorkItems, loadMaterials, loadSettings } from '../data/store.js'
import { computePricing } from '../utils/pricing.js'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgModal: '#0D0D10', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', textSub: '#A1A1AA',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
}

// ─── COUNT_CATEGORIES ─────────────────────────────────────────────────────────
const COUNT_CATEGORIES = [
  { key: 'socket',     label: 'Dugalj',        color: '#FF8C42', asmHint: 'dugalj' },
  { key: 'switch',     label: 'Kapcsoló',       color: '#A78BFA', asmHint: 'kapcsolo' },
  { key: 'light',      label: 'Lámpa',          color: '#FFD166', asmHint: 'lampa' },
  { key: 'panel',      label: 'Elosztó',        color: '#FF6B6B', asmHint: 'eloszto' },
  { key: 'junction',   label: 'Kötődoboz',      color: '#4CC9F0', asmHint: 'kotodoboz' },
  { key: 'conduit',    label: 'Cső/Védőcs.',    color: '#06B6D4', asmHint: 'cso' },
  { key: 'cable_tray', label: 'Kábeltálca',     color: '#818CF8', asmHint: 'kabeltalca' },
  { key: 'other',      label: 'Egyéb',          color: '#71717A', asmHint: null },
]

function getCat(key) {
  return COUNT_CATEGORIES.find(c => c.key === key) || COUNT_CATEGORIES[COUNT_CATEGORIES.length - 1]
}

function fmt(n) { return Number(n || 0).toLocaleString('hu-HU') }
function fmtFt(n) { return fmt(Math.round(n || 0)) + ' Ft' }

// ─── Icons ────────────────────────────────────────────────────────────────────
function XIcon({ size = 16, color = C.muted }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ─── Assembly selector for a category ────────────────────────────────────────
function AsmSelect({ catKey, assemblies, selected, onSelect }) {
  const cat = getCat(catKey)
  // Filter assemblies relevant to this category by hint or trade
  const relevant = assemblies.filter(a => {
    const name = (a.name || '').toLowerCase()
    const hint = cat.asmHint
    if (!hint) return true
    return name.includes(hint) || (a.tags || []).some(t => t.toLowerCase().includes(hint))
  })
  const options = relevant.length > 0 ? relevant : assemblies.slice(0, 20)

  return (
    <select
      value={selected || ''}
      onChange={e => onSelect(catKey, e.target.value)}
      style={{
        fontFamily: 'DM Mono', fontSize: 10, color: C.text,
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 6, padding: '4px 8px', flex: 1,
        maxWidth: 220, cursor: 'pointer',
      }}
    >
      <option value="">— Assembly kiválasztása</option>
      {options.map(a => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  )
}

// ─── PdfMergePanel ────────────────────────────────────────────────────────────
export default function PdfMergePanel({ plans, materials: propMaterials, onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [aggregated, setAggregated] = useState({}) // { category: count }
  const [assemblies, setAssemblies] = useState([])
  const [workItems, setWorkItems] = useState([])
  const [materials, setMaterials] = useState(propMaterials || [])
  const [settings, setSettings] = useState(null)
  const [asmMap, setAsmMap] = useState({}) // { category: asmId }
  const [pricing, setPricing] = useState(null)
  const [quoteNote, setQuoteNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ── Load assemblies + aggregate markers ──
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const asms = loadAssemblies()
      const wis = loadWorkItems()
      const mats = propMaterials && propMaterials.length > 0 ? propMaterials : loadMaterials()
      const stg = loadSettings()
      setAssemblies(asms)
      setWorkItems(wis)
      setMaterials(mats)
      setSettings(stg)

      // Aggregate markers across all selected plans
      const counts = {}
      for (const plan of plans) {
        const ann = await getPlanAnnotations(plan.id)
        for (const marker of (ann.markers || [])) {
          const cat = marker.category || 'other'
          counts[cat] = (counts[cat] || 0) + 1
        }
      }
      setAggregated(counts)

      // Auto-assign assemblies by hint
      const autoMap = {}
      for (const [cat] of Object.entries(counts)) {
        const catDef = getCat(cat)
        const hint = catDef.asmHint
        if (hint) {
          const match = asms.find(a => {
            const name = (a.name || '').toLowerCase()
            return name.includes(hint) || (a.tags || []).some(t => t.toLowerCase().includes(hint))
          })
          if (match) autoMap[cat] = match.id
        }
      }
      setAsmMap(autoMap)

      setLoading(false)
    })()
  }, [plans, propMaterials])

  // ── Compute pricing whenever asmMap or counts change ──
  useEffect(() => {
    if (loading || assemblies.length === 0) return
    const categories = Object.entries(aggregated).filter(([, cnt]) => cnt > 0)
    if (categories.length === 0) { setPricing(null); return }

    const takeoffRows = []
    for (const [cat, qty] of categories) {
      const asmId = asmMap[cat]
      if (!asmId) continue
      takeoffRows.push({ asmId, qty, wallType: 'brick' })
    }

    if (takeoffRows.length === 0) { setPricing(null); return }

    try {
      const result = computePricing({
        takeoffRows,
        assemblies,
        workItems,
        materials,
        context: null,
        markup: settings?.markup ?? 0.15,
        hourlyRate: settings?.hourlyRate ?? 8000,
        cableEstimate: null,
        difficultyMode: 'normal',
      })
      setPricing(result)
    } catch (err) {
      console.error('[PdfMergePanel] pricing error:', err)
      setPricing(null)
    }
  }, [aggregated, asmMap, assemblies, workItems, materials, settings, loading])

  // ── Assembly selection ──
  const handleAsmSelect = useCallback((catKey, asmId) => {
    setAsmMap(prev => ({ ...prev, [catKey]: asmId || undefined }))
  }, [])

  // ── Save quote ──
  const handleSave = useCallback(() => {
    if (!pricing) return
    setSaving(true)
    const planNames = plans.map(p => p.name || p.fileName || 'Terv').join(', ')
    const quote = {
      id: 'Q-' + Date.now().toString(36),
      name: `Felmérés: ${planNames}`,
      note: quoteNote,
      createdAt: new Date().toISOString(),
      status: 'draft',
      pricing,
      sourceType: 'pdf_merge',
      sourcePlans: plans.map(p => p.id),
      totalCount: Object.values(aggregated).reduce((a, b) => a + b, 0),
    }
    if (onSaved) onSaved(quote)
    setSaving(false)
    setSaved(true)
  }, [pricing, plans, quoteNote, aggregated, onSaved])

  const categoriesWithCounts = Object.entries(aggregated).filter(([, c]) => c > 0)
  const totalMarkers = Object.values(aggregated).reduce((a, b) => a + b, 0)
  const mappedCount = categoriesWithCounts.filter(([cat]) => !!asmMap[cat]).length

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: C.bgModal, border: `1px solid ${C.border}`,
        borderRadius: 16, width: '100%', maxWidth: 680,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: C.text }}>
              Összevonás kalkulációhoz
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 2 }}>
              {plans.length} terv · {totalMarkers} jelölés összesítve
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'flex' }}>
            <XIcon size={18} color={C.muted} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>Betöltés…</span>
            </div>
          ) : saved ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.text }}>Árajánlat létrehozva!</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Az árajánlat megjelenik az Árajánlatok listában.</div>
              <button onClick={onClose} style={{
                fontFamily: 'DM Mono', fontSize: 12, color: '#000',
                background: C.accent, border: 'none', borderRadius: 8, padding: '10px 28px', cursor: 'pointer',
              }}>Bezárás</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Plans summary */}
              <div style={{
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Kijelölt tervek
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {plans.map(p => (
                    <span key={p.id} style={{
                      fontFamily: 'DM Mono', fontSize: 10, color: C.textSub,
                      background: C.bgCard, border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: '3px 8px',
                    }}>
                      📄 {p.name || p.fileName || 'Terv'}
                      {(p.markerCount || 0) > 0 && <span style={{ color: C.accent, marginLeft: 5 }}>· {p.markerCount}</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* Aggregated counts + assembly mapping */}
              {categoriesWithCounts.length === 0 ? (
                <div style={{
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '24px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 6 }}>
                    Nincsenek jelölések a kijelölt terveken
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                    Nyisd meg a terveket és adj hozzá jelöléseket, vagy futtass szimbólumdetektálást.
                  </div>
                </div>
              ) : (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Összesített jelölések · Assembly hozzárendelés
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {categoriesWithCounts.map(([cat, count], idx) => {
                      const catDef = getCat(cat)
                      return (
                        <div
                          key={cat}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                            borderBottom: idx < categoriesWithCounts.length - 1 ? `1px solid ${C.border}` : 'none',
                          }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: catDef.color, flexShrink: 0 }} />
                          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text, width: 100, flexShrink: 0 }}>
                            {catDef.label}
                          </div>
                          <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.accent, width: 50, flexShrink: 0, textAlign: 'right' }}>
                            {count} db
                          </div>
                          <AsmSelect
                            catKey={cat}
                            assemblies={assemblies}
                            selected={asmMap[cat]}
                            onSelect={handleAsmSelect}
                          />
                          {asmMap[cat] ? (
                            <span style={{ fontSize: 14 }}>✅</span>
                          ) : (
                            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>nincs</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pricing result */}
              {pricing && (
                <div style={{
                  background: C.bgCard, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                    Kalkuláció ({mappedCount}/{categoriesWithCounts.length} kategória hozzárendelve)
                  </div>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                    {[
                      { label: 'Anyagköltség', value: fmtFt(pricing.materialCost) },
                      { label: 'Munkadíj', value: fmtFt(pricing.laborCost) },
                      { label: 'Munkaidő', value: `${(pricing.laborHours || 0).toFixed(1)} óra` },
                      { label: 'Részösszeg', value: fmtFt(pricing.subtotal) },
                    ].map(item => (
                      <div key={item.label}>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginBottom: 3 }}>{item.label}</div>
                        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                    borderRadius: 8, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                      Végösszeg (+ {Math.round((settings?.markup ?? 0.15) * 100)}% árrés)
                    </div>
                    <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.accent }}>
                      {fmtFt(pricing.total)}
                    </div>
                  </div>
                </div>
              )}

              {/* Note */}
              {categoriesWithCounts.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 6 }}>
                    Megjegyzés az árajánlathoz (opcionális)
                  </div>
                  <textarea
                    value={quoteNote}
                    onChange={e => setQuoteNote(e.target.value)}
                    placeholder="pl. Földszint + emeleti egyvezetékes rendszer"
                    rows={2}
                    style={{
                      fontFamily: 'DM Mono', fontSize: 11, color: C.text,
                      background: C.bgCard, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: '8px 12px', width: '100%',
                      resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && !saved && categoriesWithCounts.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderTop: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, flex: 1 }}>
              {mappedCount}/{categoriesWithCounts.length} kategória hozzárendelve
              {pricing && ` · Végösszeg: ${fmtFt(pricing.total)}`}
            </span>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'DM Mono', fontSize: 11, color: C.muted,
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Mégse
            </button>
            <button
              onClick={handleSave}
              disabled={!pricing || saving}
              style={{
                fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                color: pricing ? '#000' : C.muted,
                background: pricing ? C.accent : 'rgba(113,113,122,0.1)',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                cursor: pricing ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Mentés…' : '📋 Árajánlat létrehozása'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
