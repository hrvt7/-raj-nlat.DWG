import React, { useState, useRef, useCallback } from 'react'
import Landing from './Landing.jsx'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Quotes from './pages/Quotes.jsx'
import WorkItems from './pages/WorkItems.jsx'
import Settings from './pages/Settings.jsx'
import { loadSettings, saveSettings, loadWorkItems, loadMaterials, loadQuotes, saveQuote, generateQuoteId } from './data/store.js'
import { WORK_ITEMS_DEFAULT as WORK_ITEMS_DB, CONTEXT_FACTORS } from './data/workItemsDb.js'
import { Button, Badge, Input, Select, StatCard, Table, QuoteStatusBadge, fmt, fmtM } from './components/ui.jsx'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', sidebar: '#0D0D0F',
}

// ─── Item suggestions for inline mapping ──────────────────────────────────────
const ITEM_SUGGESTIONS = [
  'Dugalj 2P+F', 'Dugalj 2P+F vízálló', 'Kapcsoló 1-pólusú', 'Kapcsoló 2-pólusú',
  'Lámpatest mennyezeti', 'Lámpatest spot', 'LED csík', 'Elosztódoboz',
  'NYM-J 3×1.5 kábel', 'NYM-J 3×2.5 kábel', 'NYM-J 5×2.5 kábel',
  'Kábeltálca 100×60', 'Kábeltálca 200×60', 'Kábeltálca 300×60',
  'MCB 1P 16A', 'MCB 1P 20A', 'RCD 2P 25A/30mA', 'Elosztótábla 12M',
  'Kismegszakító', 'FI relé', 'Szekrény', 'Konduit cső', 'Flexibilis cső',
]

// ─── WizardStepBar ─────────────────────────────────────────────────────────────
function WizardStepBar({ step }) {
  const steps = ['Feltöltés', 'Ellenőrzés', 'Körülmények', 'Árazás', 'Ajánlat']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => {
        const done = i < step
        const active = i === step
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: done ? C.accent : active ? C.accent + '30' : C.bgCard,
                border: `2px solid ${done || active ? C.accent : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done ? C.bg : active ? C.accent : C.muted,
                fontSize: 13, fontWeight: 700,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: active ? C.accent : done ? C.text : C.muted, whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < step ? C.accent : C.border, margin: '0 8px', marginBottom: 22 }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── InlineItemInput ───────────────────────────────────────────────────────────
function InlineItemInput({ value, onChange, placeholder = 'Tétel neve...' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value || '')
  const filtered = ITEM_SUGGESTIONS.filter(s => s.toLowerCase().includes(query.toLowerCase())).slice(0, 8)

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
          color: C.text, padding: '6px 10px', fontSize: 13, width: '100%', outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => { setQuery(s); onChange(s); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: C.text,
                borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => e.target.style.background = C.bg}
              onMouseLeave={e => e.target.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 0: Upload ────────────────────────────────────────────────────────────
function UploadStep({ onParsed }) {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const apiBase = import.meta.env.VITE_API_URL || ''

  const processFiles = useCallback(async (fileList) => {
    const arr = Array.from(fileList)
    const newFiles = arr.map(f => ({ file: f, name: f.name, status: 'waiting', result: null, error: null }))
    setFiles(prev => [...prev, ...newFiles])

    for (let i = 0; i < newFiles.length; i++) {
      const f = newFiles[i]
      const isDwg = f.name.toLowerCase().endsWith('.dwg')

      setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: isDwg ? 'converting' : 'parsing' } : x))

      try {
        let base64
        if (isDwg) {
          base64 = await convertDwgToDxf(f.file, apiBase)
          setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'parsing' } : x))
        } else {
          base64 = await fileToBase64(f.file)
        }
        const result = await parseDxfBase64(base64, apiBase)
        setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'done', result } : x))
      } catch (err) {
        setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'error', error: err.message } : x))
      }
    }
  }, [apiBase])

  const handleDrop = e => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }

  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const anyDone = files.some(f => f.status === 'done')

  const handleNext = () => {
    const results = files.filter(f => f.status === 'done').map(f => ({ name: f.name, ...f.result }))
    onParsed(results)
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.accent : C.border}`,
          borderRadius: 12, padding: '48px 32px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          background: dragging ? C.accent + '08' : C.bgCard,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
        <div style={{ color: C.text, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          Húzd ide a DXF/DWG fájlokat
        </div>
        <div style={{ color: C.muted, fontSize: 13 }}>vagy kattints a böngészéshez</div>
        <input ref={inputRef} type="file" multiple accept=".dxf,.dwg" style={{ display: 'none' }}
          onChange={e => processFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map(f => (
            <div key={f.name} style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 18 }}>
                {f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : '⏳'}
              </span>
              <span style={{ flex: 1, color: C.text, fontSize: 13 }}>{f.name}</span>
              <span style={{ fontSize: 12, color: f.status === 'error' ? C.red : f.status === 'done' ? C.accent : C.yellow }}>
                {f.status === 'waiting' ? 'Várakozás...' :
                  f.status === 'converting' ? 'DWG → DXF konvertálás...' :
                    f.status === 'parsing' ? 'Elemzés...' :
                      f.status === 'done' ? `${(f.result?.blocks?.length || 0) + (f.result?.lengths?.length || 0)} elem` :
                        f.error || 'Hiba'}
              </span>
              {f.status === 'parsing' || f.status === 'converting' ? (
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${C.border}`, borderTopColor: C.accent,
                  animation: 'spin 0.8s linear infinite',
                }} />
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        {anyDone && (
          <Button variant="primary" onClick={handleNext}>
            Tovább az ellenőrzéshez →
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Step 1: Review ────────────────────────────────────────────────────────────
function ReviewStep({ parsedFiles, onNext, onBack }) {
  const [activeFile, setActiveFile] = useState(0)
  const [merged, setMerged] = useState(false)
  const [blockMappings, setBlockMappings] = useState({})
  const [lengthMappings, setLengthMappings] = useState({})

  const file = parsedFiles[activeFile] || parsedFiles[0]
  const blocks = file?.blocks || []
  const lengths = file?.lengths || []

  // Merge all files
  const allBlocks = merged
    ? parsedFiles.flatMap(f => f.blocks || []).reduce((acc, b) => {
      const ex = acc.find(x => x.name === b.name)
      if (ex) ex.count = (ex.count || 1) + (b.count || 1)
      else acc.push({ ...b })
      return acc
    }, [])
    : blocks

  const allLengths = merged
    ? parsedFiles.flatMap(f => f.lengths || []).reduce((acc, l) => {
      const ex = acc.find(x => x.layer === l.layer)
      if (ex) ex.length = (ex.length || 0) + (l.length || 0)
      else acc.push({ ...l })
      return acc
    }, [])
    : lengths

  const handleNext = () => {
    onNext({ blocks: allBlocks, lengths: allLengths, blockMappings, lengthMappings })
  }

  return (
    <div>
      {parsedFiles.length > 1 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {parsedFiles.map((f, i) => (
            <button key={i} onClick={() => { setMerged(false); setActiveFile(i) }}
              style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                background: !merged && activeFile === i ? C.accent + '20' : C.bgCard,
                border: `1px solid ${!merged && activeFile === i ? C.accent : C.border}`,
                color: !merged && activeFile === i ? C.accent : C.text,
              }}>{f.name}</button>
          ))}
          <button onClick={() => setMerged(true)}
            style={{
              padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
              background: merged ? C.accent + '20' : C.bgCard,
              border: `1px solid ${merged ? C.accent : C.border}`,
              color: merged ? C.accent : C.text,
            }}>🔀 Összesített nézet</button>
        </div>
      )}

      {allBlocks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
            📦 Blokkok ({allBlocks.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: C.muted }}>Rajz azonosító</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: C.muted }}>Db</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: C.muted }}>Anyag / Tétel</th>
              </tr>
            </thead>
            <tbody>
              {allBlocks.map((b, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  <td style={{ padding: '8px 12px', color: C.muted, fontFamily: 'monospace' }}>{b.name}</td>
                  <td style={{ padding: '8px 12px', color: C.accent, fontWeight: 600 }}>{b.count}</td>
                  <td style={{ padding: '8px 12px', minWidth: 200 }}>
                    <InlineItemInput
                      value={blockMappings[b.name] || ''}
                      onChange={v => setBlockMappings(prev => ({ ...prev, [b.name]: v }))}
                      placeholder="Rendelj tételhez..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allLengths.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 10, fontSize: 14 }}>
            📏 Hosszak ({allLengths.length} layer)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: C.muted }}>Layer</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: C.muted }}>Hossz (m)</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: C.muted }}>Anyag / Tétel</th>
              </tr>
            </thead>
            <tbody>
              {allLengths.map((l, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  <td style={{ padding: '8px 12px', color: C.muted, fontFamily: 'monospace' }}>{l.layer}</td>
                  <td style={{ padding: '8px 12px', color: C.blue, fontWeight: 600 }}>{fmtM(l.length)}</td>
                  <td style={{ padding: '8px 12px', minWidth: 200 }}>
                    <InlineItemInput
                      value={lengthMappings[l.layer] || ''}
                      onChange={v => setLengthMappings(prev => ({ ...prev, [l.layer]: v }))}
                      placeholder="Rendelj tételhez..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allBlocks.length === 0 && allLengths.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: C.muted }}>
          <div style={{ fontSize: 40 }}>📭</div>
          <div style={{ marginTop: 12 }}>Nem találtunk elemzendő adatot a fájlban</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button variant="secondary" onClick={onBack}>← Vissza</Button>
        <Button variant="primary" onClick={handleNext}>Körülmények →</Button>
      </div>
    </div>
  )
}

// ─── Step 2: Context ───────────────────────────────────────────────────────────
function ContextStep({ context, onChange, settings, onNext, onBack }) {
  const totalFactor = Object.entries(CONTEXT_FACTORS).reduce((acc, [key, group]) => {
    const opt = group.options.find(o => o.key === context[key])
    return acc * (opt?.factor || 1)
  }, 1)

  const effectiveRate = settings.labor.hourly_rate * totalFactor

  return (
    <div>
      <div style={{ color: C.muted, marginBottom: 24, fontSize: 14 }}>
        A körülmény szorzók automatikusan módosítják a normaidőket. Az alapértékeket (1.0) megtarthatod, ha nem tudod pontosan.
      </div>

      {Object.entries(CONTEXT_FACTORS).map(([key, group]) => (
        <div key={key} style={{ marginBottom: 28 }}>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
            {group.icon} {group.label}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {group.options.map(opt => {
              const active = context[key] === opt.key
              const fColor = opt.factor <= 1 ? C.accent : opt.factor <= 1.3 ? C.yellow : C.red
              return (
                <button key={opt.key} onClick={() => onChange({ ...context, [key]: opt.key })}
                  style={{
                    padding: '10px 16px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: active ? fColor + '15' : C.bgCard,
                    border: `2px solid ${active ? fColor : C.border}`,
                    color: active ? fColor : C.muted,
                    transition: 'all 0.15s', minWidth: 120,
                  }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>×{opt.factor.toFixed(1)}</div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: 20, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ color: C.muted, fontSize: 12 }}>Összesített szorzó</div>
          <div style={{
            fontSize: 28, fontWeight: 700,
            color: totalFactor <= 1.1 ? C.accent : totalFactor <= 1.5 ? C.yellow : C.red,
          }}>×{totalFactor.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 12 }}>Alap óradíj</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{fmt(settings.labor.hourly_rate)} Ft/ó</div>
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 12 }}>Effektív óradíj</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.blue }}>{fmt(Math.round(effectiveRate))} Ft/ó</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button variant="secondary" onClick={onBack}>← Vissza</Button>
        <Button variant="primary" onClick={onNext}>Árazás →</Button>
      </div>
    </div>
  )
}

// ─── Step 3: Pricing ───────────────────────────────────────────────────────────
function PricingStep({ reviewData, context, settings, materials, onNext, onBack }) {
  const [laborMode, setLaborMode] = useState('hourly')
  const [hourlyRate, setHourlyRate] = useState(settings.labor.hourly_rate)
  const [margin, setMargin] = useState(settings.labor.default_margin)
  const [vat, setVat] = useState(settings.labor.vat_percent)
  const [items, setItems] = useState(() => buildInitialItems(reviewData, context, materials))

  function buildInitialItems(rd, ctx, mats) {
    const result = []
    const allWI = loadWorkItems()

    // Context factor
    const wallF = CONTEXT_FACTORS.wall_material.options.find(o => o.key === ctx.wall_material)?.factor || 1
    const accessF = CONTEXT_FACTORS.access.options.find(o => o.key === ctx.access)?.factor || 1
    const projF = CONTEXT_FACTORS.project_type.options.find(o => o.key === ctx.project_type)?.factor || 1
    const heightF = CONTEXT_FACTORS.height.options.find(o => o.key === ctx.height)?.factor || 1

    // Blocks
    ;(rd?.blocks || []).forEach(b => {
      const name = rd?.blockMappings?.[b.name] || b.name
      const wi = allWI.find(w => w.name === name) || WORK_ITEMS_DB.find(w => w.name === name)
      const normMinutes = wi ? wi.p50 * wallF * accessF * projF * (wi.heightFactor ? heightF : 1) : 0
      const mat = mats.find(m => m.name === name)
      result.push({
        id: `b-${b.name}`,
        name, qty: b.count, unit: 'db',
        normMinutes, hours: (normMinutes * b.count) / 60,
        unitPrice: mat?.price * (1 - (mat?.discount || 0) / 100) || 0,
        type: 'block',
      })
    })

    // Lengths
    ;(rd?.lengths || []).forEach(l => {
      const name = rd?.lengthMappings?.[l.layer] || l.layer
      const wi = allWI.find(w => w.name === name) || WORK_ITEMS_DB.find(w => w.name === name)
      const normMinutes = wi ? wi.p50 * wallF * accessF * projF * (wi.heightFactor ? heightF : 1) : 0
      const mat = mats.find(m => m.name === name)
      result.push({
        id: `l-${l.layer}`,
        name, qty: l.length, unit: 'm',
        normMinutes, hours: (normMinutes * l.length) / 60,
        unitPrice: mat?.price * (1 - (mat?.discount || 0) / 100) || 0,
        type: 'length',
      })
    })

    return result
  }

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: parseFloat(value) || 0 } : i))
  }

  const totalHours = items.reduce((s, i) => s + (i.hours || 0), 0)
  const totalMaterials = items.reduce((s, i) => s + (i.unitPrice || 0) * (i.qty || 0), 0)
  const totalLabor = totalHours * hourlyRate
  const overheadMin = settings.overhead.visits * settings.overhead.minutes_per_visit
  const overheadLabor = (overheadMin / 60) * hourlyRate
  const overheadTravel = settings.overhead.visits * (settings.overhead.travel_cost_per_visit || 0)
  const subtotal = (totalMaterials + totalLabor + overheadLabor + overheadTravel) * margin
  const vatAmount = subtotal * (vat / 100)
  const gross = subtotal + vatAmount

  const handleNext = () => {
    onNext({ items, laborMode, hourlyRate, margin, vat, totalHours, totalMaterials, totalLabor, overheadLabor, overheadTravel, subtotal, vatAmount, gross })
  }

  return (
    <div>
      {/* Labor mode */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {[['hourly', '⏱ Órabéres', 'Össz munkaórák × óradíj'], ['per_item', '📦 Tételes', 'Minden tétel egyedi munkadíj']].map(([key, label, desc]) => (
          <button key={key} onClick={() => setLaborMode(key)} style={{
            flex: 1, padding: '14px 16px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: laborMode === key ? C.accent + '15' : C.bgCard,
            border: `2px solid ${laborMode === key ? C.accent : C.border}`,
          }}>
            <div style={{ color: laborMode === key ? C.accent : C.text, fontWeight: 600, fontSize: 14 }}>{label}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{desc}</div>
          </button>
        ))}
      </div>

      {/* Global settings */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <Input label="Óradíj (Ft/ó)" type="number" value={hourlyRate}
            onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)} suffix="Ft/ó" />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Input label="Árrés szorzó" type="number" value={margin} step="0.01"
            onChange={e => setMargin(parseFloat(e.target.value) || 1)} />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <Input label="ÁFA (%)" type="number" value={vat}
            onChange={e => setVat(parseFloat(e.target.value) || 27)} suffix="%" />
        </div>
      </div>

      {/* Items table */}
      {items.length > 0 && (
        <div style={{ marginBottom: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: C.muted }}>Megnevezés</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Menny.</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Egységár</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Norma (perc)</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Munkadíj</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const laborCost = (item.hours || 0) * hourlyRate
                return (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: '8px 10px', color: C.text }}>{item.name}</td>
                    <td style={{ padding: '8px 10px', color: C.text, textAlign: 'right' }}>
                      {item.qty} {item.unit}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <input type="number" value={item.unitPrice}
                        onChange={e => updateItem(item.id, 'unitPrice', e.target.value)}
                        style={{
                          width: 80, background: C.bg, border: `1px solid ${C.border}`,
                          borderRadius: 4, color: C.text, padding: '3px 6px', fontSize: 12, textAlign: 'right',
                        }} />
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <input type="number" value={item.normMinutes}
                        onChange={e => {
                          const nm = parseFloat(e.target.value) || 0
                          setItems(prev => prev.map(i => i.id === item.id
                            ? { ...i, normMinutes: nm, hours: (nm * i.qty) / 60 } : i))
                        }}
                        style={{
                          width: 70, background: C.bg, border: `1px solid ${C.border}`,
                          borderRadius: 4, color: C.accent, padding: '3px 6px', fontSize: 12, textAlign: 'right',
                        }} />
                    </td>
                    <td style={{ padding: '8px 10px', color: C.blue, textAlign: 'right', fontWeight: 600 }}>
                      {fmt(Math.round(laborCost))} Ft
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
          {[
            ['Anyagköltség', fmt(Math.round(totalMaterials)) + ' Ft', C.text],
            ['Munkadíj', fmt(Math.round(totalLabor)) + ' Ft', C.blue],
            ['Munkaóra', totalHours.toFixed(1) + ' ó', C.muted],
          ].map(([label, value, color]) => (
            <div key={label}>
              <div style={{ color: C.muted, fontSize: 12 }}>{label}</div>
              <div style={{ color, fontWeight: 600, fontSize: 16 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: C.muted, fontSize: 14 }}>Overhead ({settings.overhead.visits} kiszállás)</span>
            <span style={{ color: C.text }}>{fmt(Math.round(overheadLabor + overheadTravel))} Ft</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ color: C.muted, fontSize: 14 }}>Részösszeg × {margin}</span>
            <span style={{ color: C.text }}>{fmt(Math.round(subtotal))} Ft</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ color: C.muted, fontSize: 14 }}>ÁFA ({vat}%)</span>
            <span style={{ color: C.text }}>{fmt(Math.round(vatAmount))} Ft</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>BRUTTÓ VÉGÖSSZEG</span>
            <span style={{ color: C.accent, fontWeight: 800, fontSize: 22 }}>{fmt(Math.round(gross))} Ft</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Button variant="secondary" onClick={onBack}>← Vissza</Button>
        <Button variant="primary" onClick={handleNext}>Ajánlat generálása →</Button>
      </div>
    </div>
  )
}

// ─── Step 4: Quote Result ──────────────────────────────────────────────────────
function QuoteResultStep({ pricingData, context, settings, onBack, onSaved, onNewProject }) {
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [saved, setSaved] = useState(false)
  const [quoteId, setQuoteId] = useState(null)

  const handleSave = () => {
    const id = generateQuoteId()
    const pn = projectName || 'Névtelen projekt'
    const quote = {
      id,
      // snake_case for Dashboard/Quotes pages
      project_name: pn, client_name: clientName, created_at: new Date().toISOString(),
      summary: { grandTotal: pricingData.gross, totalWorkHours: pricingData.totalHours,
        materialCost: pricingData.totalMaterials, laborCost: pricingData.totalLabor },
      // camelCase for QuoteView
      projectName: pn, clientName, createdAt: new Date().toISOString(),
      status: 'draft', gross: pricingData.gross, totalHours: pricingData.totalHours,
      totalMaterials: pricingData.totalMaterials, totalLabor: pricingData.totalLabor,
      items: pricingData.items, context, pricingData,
    }
    saveQuote(quote)
    setQuoteId(id)
    setSaved(true)
    onSaved(quote)
  }

  const handlePrint = () => {
    const company = settings.company
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Ajánlat - ${projectName || 'Projekt'}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #111; }
  h1 { font-size: 22px; } h2 { font-size: 16px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #f5f5f5; padding: 8px 12px; text-align: left; font-size: 12px; border-bottom: 2px solid #ddd; }
  td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
  .total { font-size: 20px; font-weight: 800; color: #111; }
  .right { text-align: right; }
  .summary td { font-weight: 600; }
</style></head><body>
<table><tr>
  <td><h1>VILLANYSZERELÉSI AJÁNLAT</h1>
    <div><b>${company.name || 'Cég neve'}</b></div>
    <div>${company.address || ''}</div>
    <div>Adószám: ${company.tax_number || ''}</div>
    <div>${company.phone || ''} | ${company.email || ''}</div>
  </td>
  <td class="right">
    <div style="font-size:12px;color:#888">Ajánlat száma</div>
    <div style="font-size:18px;font-weight:700">${quoteId || '---'}</div>
    <div style="font-size:12px;color:#888;margin-top:8px">Dátum: ${new Date().toLocaleDateString('hu-HU')}</div>
    <div style="font-size:12px;color:#888">Érvényes: ${settings.quote?.validity_days || 30} napig</div>
  </td>
</tr></table>
<hr>
<h2>Megrendelő: ${clientName || '—'}</h2>
<h2>Projekt: ${projectName || '—'}</h2>
<table>
  <thead><tr><th>Megnevezés</th><th>Menny.</th><th class="right">Anyagár</th><th class="right">Munkadíj</th><th class="right">Összesen</th></tr></thead>
  <tbody>
    ${(pricingData.items || []).map(item => `<tr>
      <td>${item.name}</td>
      <td>${item.qty} ${item.unit}</td>
      <td class="right">${Math.round((item.unitPrice || 0) * item.qty).toLocaleString('hu-HU')} Ft</td>
      <td class="right">${Math.round((item.hours || 0) * pricingData.hourlyRate).toLocaleString('hu-HU')} Ft</td>
      <td class="right">${Math.round(((item.unitPrice || 0) * item.qty) + ((item.hours || 0) * pricingData.hourlyRate)).toLocaleString('hu-HU')} Ft</td>
    </tr>`).join('')}
  </tbody>
</table>
<table class="summary" style="width:300px;margin-left:auto">
  <tr><td>Anyagköltség:</td><td class="right">${Math.round(pricingData.totalMaterials).toLocaleString('hu-HU')} Ft</td></tr>
  <tr><td>Munkadíj:</td><td class="right">${Math.round(pricingData.totalLabor).toLocaleString('hu-HU')} Ft</td></tr>
  <tr><td>Overhead:</td><td class="right">${Math.round((pricingData.overheadLabor || 0) + (pricingData.overheadTravel || 0)).toLocaleString('hu-HU')} Ft</td></tr>
  <tr><td>Nettó összesen:</td><td class="right">${Math.round(pricingData.subtotal).toLocaleString('hu-HU')} Ft</td></tr>
  <tr><td>ÁFA (${pricingData.vat}%):</td><td class="right">${Math.round(pricingData.vatAmount).toLocaleString('hu-HU')} Ft</td></tr>
  <tr style="border-top:2px solid #111"><td class="total">BRUTTÓ VÉGÖSSZEG:</td><td class="right total">${Math.round(pricingData.gross).toLocaleString('hu-HU')} Ft</td></tr>
</table>
${settings.quote?.footer_text ? `<p style="margin-top:40px;font-size:12px;color:#888">${settings.quote.footer_text}</p>` : ''}
</body></html>`

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input label="Projekt neve" value={projectName} onChange={e => setProjectName(e.target.value)}
            placeholder="pl. Belvárosi iroda felújítás" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input label="Megrendelő neve" value={clientName} onChange={e => setClientName(e.target.value)}
            placeholder="pl. Horváth Kft." />
        </div>
      </div>

      {/* Big total */}
      <div style={{
        background: `linear-gradient(135deg, ${C.accent}15, ${C.blue}15)`,
        border: `1px solid ${C.accent}40`, borderRadius: 12, padding: 28,
        textAlign: 'center', marginBottom: 24,
      }}>
        <div style={{ color: C.muted, fontSize: 14 }}>BRUTTÓ VÉGÖSSZEG</div>
        <div style={{ color: C.accent, fontSize: 42, fontWeight: 800, letterSpacing: '-1px', marginTop: 4 }}>
          {fmt(Math.round(pricingData.gross))} Ft
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
          {pricingData.totalHours.toFixed(1)} munkaóra · {settings.overhead.visits} kiszállás
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          ['Anyagköltség', fmt(Math.round(pricingData.totalMaterials)) + ' Ft', C.text],
          ['Munkadíj', fmt(Math.round(pricingData.totalLabor)) + ' Ft', C.blue],
          ['Munkaóra', pricingData.totalHours.toFixed(1) + ' ó', C.accent],
          ['Overhead', fmt(Math.round((pricingData.overheadLabor || 0) + (pricingData.overheadTravel || 0))) + ' Ft', C.yellow],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
            <div style={{ color: C.muted, fontSize: 11 }}>{label}</div>
            <div style={{ color, fontWeight: 700, fontSize: 16, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Items */}
      {(pricingData.items || []).length > 0 && (
        <div style={{ marginBottom: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: C.muted }}>Megnevezés</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Menny.</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Anyag</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Munkadíj</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', color: C.muted }}>Összesen</th>
              </tr>
            </thead>
            <tbody>
              {pricingData.items.map((item, i) => {
                const matCost = (item.unitPrice || 0) * item.qty
                const laborCost = (item.hours || 0) * pricingData.hourlyRate
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: '8px 10px', color: C.text }}>{item.name}</td>
                    <td style={{ padding: '8px 10px', color: C.muted, textAlign: 'right' }}>{item.qty} {item.unit}</td>
                    <td style={{ padding: '8px 10px', color: C.text, textAlign: 'right' }}>{fmt(Math.round(matCost))} Ft</td>
                    <td style={{ padding: '8px 10px', color: C.blue, textAlign: 'right' }}>{fmt(Math.round(laborCost))} Ft</td>
                    <td style={{ padding: '8px 10px', color: C.text, textAlign: 'right', fontWeight: 600 }}>{fmt(Math.round(matCost + laborCost))} Ft</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={onBack}>← Vissza</Button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={handlePrint}>🖨 PDF nyomtatás</Button>
          {!saved ? (
            <Button variant="primary" onClick={handleSave}>💾 Ajánlat mentése</Button>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: C.accent, fontSize: 13 }}>✅ Mentve: {quoteId}</span>
              <Button variant="secondary" onClick={onNewProject}>+ Új projekt</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Assemblies Placeholder ────────────────────────────────────────────────────
function Assemblies() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 40px' }}>
      <div style={{ fontSize: 56 }}>🔧</div>
      <div style={{ color: C.text, fontSize: 22, fontWeight: 700, marginTop: 16 }}>Assembly szerkesztő</div>
      <div style={{ color: C.muted, fontSize: 14, marginTop: 8, maxWidth: 480, margin: '16px auto 0' }}>
        Egy DXF blokkból automatikusan generálódik az összes szükséges anyag: doboz, szerelvény, fedőlap, kábel ráhagyás, csavarok – és hozzá a normaidő.
      </div>
      <div style={{ marginTop: 20 }}>
        <Badge variant="yellow">v2.1-ben érkezik</Badge>
      </div>
    </div>
  )
}

// ─── Quote View ────────────────────────────────────────────────────────────────
function QuoteView({ quote, onBack, onStatusChange }) {
  const statuses = ['draft', 'sent', 'won', 'lost']
  const statusLabels = { draft: '📝 Piszkozat', sent: '📤 Elküldve', won: '🏆 Nyertes', lost: '❌ Elveszett' }
  const statusColors = { draft: C.muted, sent: C.blue, won: C.accent, lost: C.red }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 }}>←</button>
        <div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 20 }}>{quote.projectName}</div>
          <div style={{ color: C.muted, fontSize: 13 }}>{quote.id}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <QuoteStatusBadge status={quote.status} />
        </div>
      </div>

      <div style={{
        background: `linear-gradient(135deg, ${C.accent}15, ${C.blue}10)`,
        border: `1px solid ${C.accent}40`, borderRadius: 12, padding: 24, marginBottom: 24,
      }}>
        <div style={{ color: C.muted, fontSize: 13 }}>BRUTTÓ VÉGÖSSZEG</div>
        <div style={{ color: C.accent, fontSize: 36, fontWeight: 800 }}>{fmt(Math.round(quote.gross || 0))} Ft</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Részletek</div>
          {[
            ['Megrendelő', quote.clientName || '—'],
            ['Létrehozva', new Date(quote.createdAt).toLocaleDateString('hu-HU')],
            ['Munkaóra', (quote.totalHours || 0).toFixed(1) + ' ó'],
            ['Anyagköltség', fmt(Math.round(quote.totalMaterials || 0)) + ' Ft'],
            ['Munkadíj', fmt(Math.round(quote.totalLabor || 0)) + ' Ft'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}30` }}>
              <span style={{ color: C.muted, fontSize: 13 }}>{k}</span>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Státusz módosítása</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {statuses.map(s => (
              <button key={s} onClick={() => onStatusChange(quote.id, s)}
                style={{
                  padding: '10px 14px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  background: quote.status === s ? statusColors[s] + '20' : C.bg,
                  border: `1px solid ${quote.status === s ? statusColors[s] : C.border}`,
                  color: quote.status === s ? statusColors[s] : C.muted,
                  fontWeight: quote.status === s ? 700 : 400,
                }}>{statusLabels[s]}</button>
            ))}
          </div>
        </div>
      </div>

      {(quote.items || []).length > 0 && (
        <div>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 12 }}>Tételek</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Megnevezés', 'Menny.', 'Anyag', 'Munkadíj', 'Összesen'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: C.muted, textAlign: h === 'Megnevezés' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, i) => {
                const rate = quote.pricingData?.hourlyRate || 9000
                const mat = (item.unitPrice || 0) * item.qty
                const labor = (item.hours || 0) * rate
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: '8px 10px', color: C.text }}>{item.name}</td>
                    <td style={{ padding: '8px 10px', color: C.muted, textAlign: 'right' }}>{item.qty} {item.unit}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.text }}>{fmt(Math.round(mat))} Ft</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.blue }}>{fmt(Math.round(labor))} Ft</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.text, fontWeight: 600 }}>{fmt(Math.round(mat + labor))} Ft</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── New Quote Wizard (full) ───────────────────────────────────────────────────
function NewQuoteWizard({ settings, materials, onSaved, onCancel }) {
  const [step, setStep] = useState(0)
  const [parsedFiles, setParsedFiles] = useState([])
  const [reviewData, setReviewData] = useState(null)
  const [context, setContext] = useState({
    wall_material: 'brick', access: 'empty', project_type: 'renovation', height: 'normal',
  })
  const [pricingData, setPricingData] = useState(null)

  return (
    <div style={{ maxWidth: 780 }}>
      <WizardStepBar step={step} />
      {step === 0 && (
        <UploadStep onParsed={files => { setParsedFiles(files); setStep(1) }} />
      )}
      {step === 1 && (
        <ReviewStep parsedFiles={parsedFiles} onNext={rd => { setReviewData(rd); setStep(2) }} onBack={() => setStep(0)} />
      )}
      {step === 2 && (
        <ContextStep context={context} onChange={setContext} settings={settings} onNext={() => setStep(3)} onBack={() => setStep(1)} />
      )}
      {step === 3 && (
        <PricingStep reviewData={reviewData} context={context} settings={settings} materials={materials}
          onNext={pd => { setPricingData(pd); setStep(4) }} onBack={() => setStep(2)} />
      )}
      {step === 4 && (
        <QuoteResultStep pricingData={pricingData} context={context} settings={settings}
          onBack={() => setStep(3)} onSaved={onSaved} onNewProject={onCancel} />
      )}
    </div>
  )
}

// ─── SaaS Shell ────────────────────────────────────────────────────────────────
function SaaSShell() {
  const [page, setPage] = useState('dashboard')
  const [settings, setSettings] = useState(loadSettings)
  const [materials, setMaterials] = useState(loadMaterials)
  const [quotes, setQuotes] = useState(loadQuotes)
  const [viewingQuote, setViewingQuote] = useState(null)

  const pageTitles = {
    dashboard: 'Dashboard', quotes: 'Ajánlatok', 'new-quote': 'Új ajánlat',
    'work-items': 'Munkatételek', assemblies: 'Assemblyk', settings: 'Beállítások',
  }

  const [workItems, setWorkItems] = useState(loadWorkItems)

  const handleQuotesChange = (updated) => {
    localStorage.setItem('tpro_quotes', JSON.stringify(updated))
    setQuotes(updated)
  }

  const handleQuoteSaved = quote => {
    const updated = loadQuotes()
    setQuotes(updated)
    setViewingQuote(quote)
    setPage('quotes')
  }

  const handleStatusChange = (quoteId, newStatus) => {
    const all = loadQuotes()
    const updated = all.map(q => q.id === quoteId ? { ...q, status: newStatus } : q)
    localStorage.setItem('tpro_quotes', JSON.stringify(updated))
    setQuotes(updated)
    if (viewingQuote?.id === quoteId) setViewingQuote(prev => ({ ...prev, status: newStatus }))
  }

  const handleSettingsChange = newSettings => {
    saveSettings(newSettings)
    setSettings(newSettings)
  }

  const sidebarW = 220
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      <Sidebar activePage={page} onNavigate={p => { setViewingQuote(null); setPage(p) }} />
      <div style={{ marginLeft: sidebarW, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Top bar */}
        <div style={{
          height: 52, background: C.bgCard, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '0 28px',
          justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ color: C.text, fontWeight: 600, fontSize: 16 }}>
            {viewingQuote ? viewingQuote.projectName : pageTitles[page] || page}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>TakeoffPro v2.0</div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px 28px', maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {viewingQuote && page === 'quotes' ? (
            <QuoteView quote={viewingQuote} onBack={() => setViewingQuote(null)}
              onStatusChange={handleStatusChange} />
          ) : page === 'dashboard' ? (
            <Dashboard quotes={quotes} settings={settings}
              onNavigate={p => { setViewingQuote(null); setPage(p) }} />
          ) : page === 'quotes' ? (
            <Quotes quotes={quotes} onQuotesChange={handleQuotesChange}
              onNavigate={p => setPage(p)}
              onOpenQuote={q => { setViewingQuote(q); setPage('quotes') }} />
          ) : page === 'new-quote' ? (
            <NewQuoteWizard settings={settings} materials={materials}
              onSaved={handleQuoteSaved} onCancel={() => setPage('quotes')} />
          ) : page === 'work-items' ? (
            <WorkItems workItems={workItems} onWorkItemsChange={wis => { setWorkItems(wis) }} />
          ) : page === 'assemblies' ? (
            <Assemblies />
          ) : page === 'settings' ? (
            <Settings settings={settings} materials={materials}
              onSettingsChange={handleSettingsChange}
              onMaterialsChange={m => { setMaterials(m) }} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Helper functions ──────────────────────────────────────────────────────────
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function convertDwgToDxf(file, apiBase) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${apiBase}/api/convert-dwg`, { method: 'POST', body: formData })
  if (!res.ok) throw new Error('DWG konverzió sikertelen')
  const data = await res.json()
  return data.dxf_base64
}

async function parseDxfBase64(base64, apiBase) {
  const res = await fetch(`${apiBase}/api/parse-dxf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dxf_base64: base64 }),
  })
  if (!res.ok) throw new Error('DXF elemzés sikertelen')
  return await res.json()
}

// ─── CSS animations ────────────────────────────────────────────────────────────
const styleEl = document.createElement('style')
styleEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(styleEl)

// ─── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [route, setRoute] = useState(() => window.location.hash === '#app' ? 'app' : 'landing')
  return route === 'landing'
    ? <Landing onStart={() => { window.location.hash = '#app'; setRoute('app') }} />
    : <SaaSShell />
}
