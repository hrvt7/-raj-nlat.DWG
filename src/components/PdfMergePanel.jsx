import React, { useState, useEffect, useCallback } from 'react'
import { loadAssemblies, loadWorkItems, loadMaterials, loadSettings, saveQuote } from '../data/store.js'
import { computePricing } from '../utils/pricing.js'
import { getProject } from '../data/projectStore.js'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgModal: '#0D0D10', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', textSub: '#A1A1AA',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
}

function fmt(n) { return Number(n || 0).toLocaleString('hu-HU') }
function fmtFt(n) { return fmt(Math.round(n || 0)) + ' Ft' }

// ─── Icons ────────────────────────────────────────────────────────────────────
function XIcon({ size = 16, color = C.muted }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ─── PdfMergePanel ────────────────────────────────────────────────────────────
// Reads pre-computed calcTakeoffRows & calcPricing from plan metadata,
// merges rows by asmId, recomputes combined pricing.
export default function PdfMergePanel({ plans, materials: propMaterials, onClose, onSaved, onOpenPlan }) {
  const [loading, setLoading] = useState(true)
  const [assemblies, setAssemblies] = useState([])
  const [workItems, setWorkItems] = useState([])
  const [materials, setMaterials] = useState(propMaterials || [])
  const [settings, setSettings] = useState(null)
  const [mergedRows, setMergedRows] = useState([])   // [{ asmId, qty, wallType }]
  const [perPlanSummary, setPerPlanSummary] = useState([]) // [{ planName, total, itemCount }]
  const [pricing, setPricing] = useState(null)
  const [quoteNote, setQuoteNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [plansWithoutCalc, setPlansWithoutCalc] = useState([])

  // ── Load data + merge calcTakeoffRows from plan metadata ──
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

      // Merge calcTakeoffRows from all selected plans
      const rowMap = {} // asmId → { asmId, qty, wallType }
      const planSums = []
      const noCalc = []

      for (const plan of plans) {
        const rows = plan.calcTakeoffRows
        if (!rows || rows.length === 0) {
          noCalc.push(plan)
          continue
        }
        const planTotal = plan.calcTotal || 0
        const planItems = plan.calcItemCount || 0
        planSums.push({
          planName: plan.name || plan.fileName || 'Terv',
          total: planTotal,
          itemCount: planItems,
        })
        for (const row of rows) {
          const key = row.asmId + '|' + (row.wallType || 'brick')
          if (rowMap[key]) {
            rowMap[key].qty += (row.qty || 0)
          } else {
            rowMap[key] = { asmId: row.asmId, qty: row.qty || 0, wallType: row.wallType || 'brick' }
          }
        }
      }

      const merged = Object.values(rowMap).filter(r => r.qty > 0)
      setMergedRows(merged)
      setPerPlanSummary(planSums)
      setPlansWithoutCalc(noCalc)

      // Compute combined pricing
      if (merged.length > 0) {
        try {
          const result = computePricing({
            takeoffRows: merged,
            assemblies: asms,
            workItems: wis,
            materials: mats,
            context: null,
            markup: stg?.markup ?? 0.15,
            hourlyRate: stg?.hourlyRate ?? 8000,
            cableEstimate: null,
            difficultyMode: 'normal',
          })
          setPricing(result)
        } catch (err) {
          console.error('[PdfMergePanel] pricing error:', err)
          setPricing(null)
        }
      } else {
        setPricing(null)
      }

      setLoading(false)
    })()
  }, [plans, propMaterials])

  // ── Save quote ──
  const handleSave = useCallback(() => {
    if (!pricing) return
    setSaving(true)
    const planNames = plans.map(p => p.name || p.fileName || 'Terv').join(', ')
    const displayName = `Projekt: ${planNames}`
    const totalCount = mergedRows.reduce((s, r) => s + r.qty, 0)

    // Build items from pricing lines
    const items = (pricing.lines || []).map(line => ({
      name:        line.name,
      code:        line.code || '',
      qty:         line.qty,
      unit:        line.unit,
      type:        line.type,
      unitPrice:   line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
      hours:       line.hours || 0,
      materialCost: line.materialCost || 0,
    }))

    // ── Resolve project-level default output mode from first plan ──────
    const firstProjId = plans.find(p => p.projectId)?.projectId
    const mergePrjDefault = firstProjId ? (getProject(firstProjId)?.defaultQuoteOutputMode || 'combined') : 'combined'
    const _inclExclDefaults = { combined: { inclusions: '', exclusions: '' }, labor_only: { inclusions: '', exclusions: 'Az anyagköltség nem része az ajánlatnak.\nAz anyagbiztosítás a megrendelő feladata.' }, split_material_labor: { inclusions: '', exclusions: '' } }
    const _ieD = _inclExclDefaults[mergePrjDefault] || _inclExclDefaults.combined

    const quote = {
      id: 'Q-' + Date.now().toString(36),
      projectName:  displayName,
      project_name: displayName,
      name:         displayName,
      note: quoteNote,
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      status: 'draft',
      outputMode: mergePrjDefault,
      inclusions: _ieD.inclusions,
      exclusions: _ieD.exclusions,
      validityText: 'Az ajánlat kiállítástól számított 30 napig érvényes.',
      paymentTermsText: 'Fizetési feltételek: a teljesítést követően, számla ellenében, 8 napon belül.',
      gross:          Math.round(pricing.total),
      totalMaterials: Math.round(pricing.materialCost),
      totalLabor:     Math.round(pricing.laborCost),
      totalHours:     pricing.laborHours,
      summary: {
        grandTotal:     Math.round(pricing.total),
        totalWorkHours: pricing.laborHours,
      },
      pricingData: {
        hourlyRate: settings?.hourlyRate ?? 8000,
        markup_pct: settings?.markup ?? 0.15,
      },
      items,
      sourceType: 'pdf_merge',
      sourcePlans: plans.map(p => p.id),
      totalCount,
      source: 'merge-panel',
      bundleId: null,   // PdfMergePanel has no bundle context (added for model consistency)
    }

    saveQuote(quote)
    if (onSaved) onSaved(quote)
    setSaving(false)
    setSaved(true)
  }, [pricing, plans, quoteNote, mergedRows, onSaved, settings])

  const totalItems = mergedRows.reduce((s, r) => s + r.qty, 0)

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
              {plans.length === 1 ? 'Ajánlat generálása' : `Közös ajánlat · ${plans.length} terv`}
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 2 }}>
              {plans.length} terv · {totalItems} elem összesítve
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
              <div style={{ fontSize: 28, color: C.accent, fontWeight: 700 }}>✓</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.text }}>Árajánlat létrehozva!</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Az árajánlat megjelenik az Árajánlatok listában.</div>
              <button onClick={onClose} style={{
                fontFamily: 'DM Mono', fontSize: 12, color: '#09090B',
                background: C.accent, border: 'none', borderRadius: 8, padding: '10px 28px', cursor: 'pointer',
              }}>Bezárás</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Per-plan breakdown */}
              <div style={{
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  Tervrajzok kalkulációi
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {perPlanSummary.map((ps, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                      background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                      borderRadius: 8,
                    }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, flex: 1 }}>
                        {ps.planName}
                      </span>
                      <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.accent }}>
                        {fmtFt(ps.total)}
                      </span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
                        {ps.itemCount} elem
                      </span>
                    </div>
                  ))}
                  {plansWithoutCalc.length > 0 && plansWithoutCalc.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                      background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)',
                      borderRadius: 8,
                    }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name || p.fileName || 'Terv'}
                      </span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.red, flexShrink: 0 }}>
                        ⚠ Nincs kalkuláció
                      </span>
                      {onOpenPlan && (
                        <button
                          onClick={() => onOpenPlan(p)}
                          style={{
                            fontFamily: 'DM Mono', fontSize: 10, color: C.blue,
                            background: 'rgba(76,201,240,0.08)', border: '1px solid rgba(76,201,240,0.2)',
                            borderRadius: 5, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(76,201,240,0.15)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(76,201,240,0.08)' }}
                        >
                          Megnyitás →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Merged items detail */}
              {mergedRows.length === 0 ? (
                <div style={{
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '24px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 6 }}>
                    Nincsenek kalkulált elemek
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: plansWithoutCalc.length > 0 ? 14 : 0 }}>
                    Nyisd meg a terveket és készíts kalkulációt, mielőtt ajánlatot generálsz.
                  </div>
                  {plansWithoutCalc.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
                      {plansWithoutCalc.map(p => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)',
                          borderRadius: 8,
                        }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name || p.fileName || 'Terv'}
                          </span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.red, flexShrink: 0 }}>⚠ Nincs kalkuláció</span>
                          {onOpenPlan && (
                            <button
                              onClick={() => onOpenPlan(p)}
                              style={{
                                fontFamily: 'DM Mono', fontSize: 10, color: C.blue,
                                background: 'rgba(76,201,240,0.08)', border: '1px solid rgba(76,201,240,0.2)',
                                borderRadius: 5, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(76,201,240,0.15)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(76,201,240,0.08)' }}
                            >
                              Megnyitás →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Összesített elemek · {mergedRows.length} tétel · {totalItems} db
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {mergedRows.map((row, idx) => {
                      const asm = assemblies.find(a => a.id === row.asmId)
                      const name = asm?.name || row.asmId
                      return (
                        <div
                          key={row.asmId + '|' + row.wallType}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                            borderBottom: idx < mergedRows.length - 1 ? `1px solid ${C.border}` : 'none',
                          }}
                        >
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: asm?.color || C.accent, flexShrink: 0,
                          }} />
                          <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 11, color: C.text, flex: 1 }}>
                            {name}
                          </div>
                          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.accent, flexShrink: 0 }}>
                            {row.qty} db
                          </div>
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
                    Összesített kalkuláció
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
              {mergedRows.length > 0 && (
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
        {!loading && !saved && mergedRows.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderTop: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, flex: 1 }}>
              {mergedRows.length} tétel · {totalItems} elem
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
                color: pricing ? '#09090B' : C.muted,
                background: pricing ? C.accent : 'rgba(113,113,122,0.1)',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                cursor: pricing ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Mentés…' : 'Árajánlat létrehozása'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
