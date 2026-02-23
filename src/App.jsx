import React, { useState, useCallback, useRef } from 'react'

// ─── Default data ────────────────────────────────────────────────────────────

const DEFAULT_MAPPING = {
  blocks: {
    "SOCKET": "Dugalj 2P+F",
    "DUG": "Dugalj 2P+F",
    "SWITCH": "Kapcsoló 1G",
    "KAPCSOLO": "Kapcsoló 1G",
    "LIGHT": "Lámpatest",
    "LAMP": "Lámpatest",
    "LAMPA": "Lámpatest",
    "DB": "Elosztó tábla",
    "PANEL": "Elosztó tábla",
  },
  layers: {
    "TRAY_300": "Kábeltálca 300×60",
    "TRAY_500": "Kábeltálca 500×60",
    "TALCA_300": "Kábeltálca 300×60",
    "TALCA_500": "Kábeltálca 500×60",
    "CABLE": "Kábel NYY-J",
    "KABEL": "Kábel NYY-J",
  }
}

const DEFAULT_PRICES = {
  "Dugalj 2P+F": 2800,
  "Kapcsoló 1G": 1900,
  "Lámpatest": 8500,
  "Elosztó tábla": 45000,
  "Kábeltálca 300×60": 3200,
  "Kábeltálca 500×60": 4800,
  "Kábel NYY-J": 980,
}

// Normák: KÜLÖN módszer (szerelvény szerelés NÉLKÜL kábelhúzás – azt a kábel/tálca méter fedi)
// Dugalj: doboz+szerelvény rögzítés+bekötés (kábel NEM benne)
// Lámpatest: rögzítés+bekötés (kábel NEM benne)  
// Kábeltálca: méterenkénti szerelési idő (tartó+tálca+fedél)
// Kábel NYY-J: méterenkénti húzási+rögzítési idő
const DEFAULT_NORMS = {
  "Dugalj 2P+F": 25,
  "Kapcsoló 1G": 20,
  "Lámpatest": 30,
  "Elosztó tábla": 240,
  "Kábeltálca 300×60": 15,
  "Kábeltálca 500×60": 20,
  "Kábel NYY-J": 6,
}

// ─── Utility ─────────────────────────────────────────────────────────────────

const fmt = (n) => new Intl.NumberFormat('hu-HU').format(Math.round(n))
const fmtM = (n) => n < 1 ? n.toFixed(3) : n.toFixed(1)

// ─── Icons ───────────────────────────────────────────────────────────────────

const IconUpload = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
  </svg>
)
const IconFile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconArrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
)
const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>
)
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M12 2v2M12 20v2"/>
  </svg>
)
const IconZap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Feltöltés', 'Ellenőrzés', 'Árazás', 'Ajánlat']

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 40 }}>
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#00E5A0' : active ? '#0A0A0A' : 'transparent',
                border: `2px solid ${done ? '#00E5A0' : active ? '#00E5A0' : '#2A2A2A'}`,
                color: done ? '#0A0A0A' : active ? '#00E5A0' : '#444',
                fontSize: 12, fontFamily: 'DM Mono', fontWeight: 500,
                transition: 'all 0.3s'
              }}>
                {done ? <IconCheck /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: active ? '#00E5A0' : done ? '#888' : '#444', fontFamily: 'DM Mono', whiteSpace: 'nowrap' }}>
                {s}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, background: done ? '#00E5A0' : '#1A1A1A',
                margin: '0 8px', marginBottom: 22, transition: 'background 0.3s'
              }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

function UploadStep({ onParsed, apiBase }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [unitFactor, setUnitFactor] = useState('0.001')
  const inputRef = useRef()

  const processFile = async (f) => {
    if (!f.name.endsWith('.dxf')) {
      setError('Csak .dxf fájl tölthető fel. DWG-t előbb konvertáld DXF-re az ODA File Converter-rel (ingyenes).')
      return
    }
    setFile(f)
    setError(null)
    setLoading(true)
    try {
      // base64 JSON upload - more reliable than multipart across all browsers
      const arrayBuffer = await f.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize))
      }
      const b64 = btoa(binary)
      const res = await fetch(`${apiBase}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: f.name, data: b64 })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      onParsed(data, f.name, parseFloat(unitFactor))
    } catch (e) {
      setError('Hiba a feldolgozás során: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }, [unitFactor])

  return (
    <div>
      <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
        Töltsd fel a tervet
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 32, fontFamily: 'DM Mono' }}>
        DXF formátumban. DWG → DXF: ODA File Converter (ingyenes letöltés)
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? '#00E5A0' : file ? '#00E5A0' : '#2A2A2A'}`,
          borderRadius: 12,
          padding: '60px 40px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(0,229,160,0.04)' : file ? 'rgba(0,229,160,0.02)' : 'transparent',
          transition: 'all 0.2s'
        }}
      >
        <input ref={inputRef} type="file" accept=".dxf" style={{ display: 'none' }}
          onChange={e => e.target.files[0] && processFile(e.target.files[0])} />
        
        {loading ? (
          <div>
            <div style={{ color: '#00E5A0', marginBottom: 16, fontFamily: 'Syne', fontSize: 18, fontWeight: 700 }}>
              Feldolgozás...
            </div>
            <div style={{ width: 200, height: 3, background: '#1A1A1A', borderRadius: 2, margin: '0 auto', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: '#00E5A0', animation: 'progress 1.5s ease infinite', borderRadius: 2 }} />
            </div>
          </div>
        ) : file ? (
          <div>
            <div style={{ color: '#00E5A0', marginBottom: 8 }}><IconFile /></div>
            <div style={{ fontFamily: 'DM Mono', color: '#00E5A0', fontSize: 14 }}>{file.name}</div>
            <div style={{ color: '#444', fontSize: 12, marginTop: 4 }}>Kész – kattints a folytatáshoz</div>
          </div>
        ) : (
          <div>
            <div style={{ color: '#444', marginBottom: 16 }}><IconUpload /></div>
            <div style={{ fontFamily: 'Syne', fontSize: 18, color: '#888', fontWeight: 600 }}>
              Húzd ide a DXF fájlt
            </div>
            <div style={{ color: '#555', fontSize: 13, marginTop: 8, fontFamily: 'DM Mono' }}>
              vagy kattints a tallózáshoz
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: 8, padding: 16, marginTop: 16, color: '#FF8080', fontSize: 13, fontFamily: 'DM Mono' }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24, background: '#111', borderRadius: 10, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ color: '#555' }}><IconSettings /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#666', fontFamily: 'DM Mono', marginBottom: 6 }}>Rajz egysége (hossz konverzió)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['0.001', 'mm → m'], ['0.01', 'cm → m'], ['1', 'm → m']].map(([v, l]) => (
              <button key={v} onClick={() => setUnitFactor(v)} style={{
                padding: '6px 14px', borderRadius: 6, border: `1px solid ${unitFactor === v ? '#00E5A0' : '#2A2A2A'}`,
                background: unitFactor === v ? 'rgba(0,229,160,0.08)' : 'transparent',
                color: unitFactor === v ? '#00E5A0' : '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono'
              }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: '14px 18px', background: '#0D1A14', border: '1px solid #1A3025', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: '#4A8A6A', fontFamily: 'DM Mono', lineHeight: 1.7 }}>
          <strong style={{ color: '#00E5A0' }}>DWG → DXF konverzió:</strong> Töltsd le az ODA File Converter-t (ingyenes): <span style={{ color: '#00B87A' }}>opendesign.com/guestfiles/oda_file_converter</span><br/>
          Beállítás: Output format → R2013 DXF
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Review ───────────────────────────────────────────────────────────

// Common item names for the dropdown suggestions
const ITEM_SUGGESTIONS = [
  'Dugalj 2P+F', 'Dugalj 2P+F IP44', 'Dugalj 3P+F+N', 'Kapcsoló 1G', 'Kapcsoló 2G',
  'Kapcsoló 3G', 'Váltókapcsoló', 'Lámpatest', 'Lámpatest mennyezeti', 'Lámpatest fali',
  'Reflektor LED', 'Elosztó tábla', 'Kábeltálca 100×60', 'Kábeltálca 200×60',
  'Kábeltálca 300×60', 'Kábeltálca 400×60', 'Kábeltálca 500×60', 'Kábeltálca 600×60',
  'Kábel NYY-J 3×1.5', 'Kábel NYY-J 3×2.5', 'Kábel NYY-J 5×2.5', 'Kábel NYY-J 5×4',
  'Kábel NYY-J 5×6', 'Kábel NYY-J 5×10', 'Kábel CYKY 3×1.5', 'Kábel CYKY 3×2.5',
  'Vészvilágítás', 'Mozgásérzékelő', 'Termosztát', 'Csengő', 'Diszpécser panel',
]

function ReviewStep({ parseResult, mapping, setMapping, onContinue }) {
  // Inline mapping: blockName/layerName → item name
  const [blockMap, setBlockMap] = useState(() => {
    const m = {}
    parseResult.blocks.forEach(b => {
      const found = findMapping(b.name, mapping.blocks)
      if (found) m[b.name] = found
    })
    return m
  })
  const [layerMap, setLayerMap] = useState(() => {
    const m = {}
    parseResult.lengths.forEach(l => {
      const found = findMapping(l.layer, mapping.layers)
      if (found) m[l.layer] = found
    })
    return m
  })
  const [showSuggest, setShowSuggest] = useState(null) // key of open suggest

  // Save inline changes back to mapping
  const applyInlineMapping = () => {
    const newBlocks = { ...mapping.blocks }
    Object.entries(blockMap).forEach(([name, item]) => {
      if (item) newBlocks[name] = item
    })
    const newLayers = { ...mapping.layers }
    Object.entries(layerMap).forEach(([layer, item]) => {
      if (item) newLayers[layer] = item
    })
    setMapping({ blocks: newBlocks, layers: newLayers })
  }

  const unmapped = [
    ...parseResult.blocks.filter(b => !blockMap[b.name]),
    ...parseResult.lengths.filter(l => !layerMap[l.layer])
  ].length

  // Auto-detect unit info from parseResult
  const unitInfo = parseResult.units
  const unitLabel = unitInfo ? `${unitInfo.name} (auto)` : 'mm (alapért.)'

  return (
    <div>
      <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
        Mennyiségek ellenőrzése
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20, fontFamily: 'DM Mono' }}>
        A parser megtalálta az alábbi elemeket. Minden sorhoz rendeld hozzá a megfelelő anyagot/tételt.
      </p>

      {/* Unit + summary info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Block típus', value: parseResult.summary.total_block_types },
          { label: 'Összes db', value: parseResult.summary.total_blocks },
          { label: 'Mért layer', value: parseResult.summary.layers_with_lines },
          { label: 'Rajz egység', value: unitLabel, small: true },
        ].map(c => (
          <div key={c.label} style={{ background: '#111', borderRadius: 10, padding: '14px 16px', border: '1px solid #1E1E1E' }}>
            <div style={{ fontSize: c.small ? 14 : 26, fontFamily: 'Syne', fontWeight: 800, color: c.small ? '#FFD966' : '#00E5A0' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {unmapped > 0 && (
        <div style={{ background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#FFD966', fontFamily: 'DM Mono' }}>
          ⚠️ {unmapped} elemhez még nincs tétel rendelve – töltsd ki az alábbi táblázatban.
        </div>
      )}

      {/* BLOCKS TABLE with inline editing */}
      {parseResult.blocks.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Szerelvények (blokkok a rajzon)
          </h3>
          <div style={{ border: '1px solid #1E1E1E', borderRadius: 10, overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#111' }}>
                  <th style={thStyle}>Block neve (rajzon)</th>
                  <th style={thStyle}>Darab</th>
                  <th style={thStyle}>Anyag / Tétel neve <span style={{ color: '#444', fontWeight: 400 }}>(szerkeszthető)</span></th>
                </tr>
              </thead>
              <tbody>
                {parseResult.blocks.slice(0, 50).map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#888' }}>
                      {b.name}
                      <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{b.layer}</div>
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 14, color: '#00E5A0', fontWeight: 700, textAlign: 'center' }}>{b.count} db</td>
                    <td style={{ padding: '8px 12px', position: 'relative' }}>
                      <InlineItemInput
                        value={blockMap[b.name] || ''}
                        onChange={v => setBlockMap(m => ({ ...m, [b.name]: v }))}
                        onBlur={applyInlineMapping}
                        suggestions={ITEM_SUGGESTIONS}
                        placeholder="Pl. Dugalj 2P+F  — kezdj el gépelni..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LENGTHS TABLE with inline editing */}
      {parseResult.lengths.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'Syne', fontSize: 13, fontWeight: 700, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Vonalak / hosszak (tálca, kábel)
          </h3>
          <div style={{ border: '1px solid #1E1E1E', borderRadius: 10, overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#111' }}>
                  <th style={thStyle}>Layer neve (rajzon)</th>
                  <th style={thStyle}>Hossz (m)</th>
                  <th style={thStyle}>Anyag / Tétel neve <span style={{ color: '#444', fontWeight: 400 }}>(szerkeszthető)</span></th>
                </tr>
              </thead>
              <tbody>
                {parseResult.lengths.slice(0, 30).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#888' }}>
                      {l.layer}
                      {l.info && (
                        <div style={{ fontSize: 10, color: '#4A7A6A', marginTop: 2 }}>
                          {l.info.type === 'tray' && l.info.tray_width ? `Tálca ${l.info.tray_width}×${l.info.tray_height}mm` : ''}
                          {l.info.type === 'cable' ? `${l.info.cable_type || 'Kábel'} ${l.info.cores ? l.info.cores+'×'+l.info.cross_section+'mm²' : ''}` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 14, color: '#00E5A0', fontWeight: 700, textAlign: 'center' }}>{l.length} m</td>
                    <td style={{ padding: '8px 12px', position: 'relative' }}>
                      <InlineItemInput
                        value={layerMap[l.layer] || ''}
                        onChange={v => setLayerMap(m => ({ ...m, [l.layer]: v }))}
                        onBlur={applyInlineMapping}
                        suggestions={ITEM_SUGGESTIONS}
                        placeholder="Pl. Kábeltálca 300×60  — kezdj el gépelni..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button onClick={() => { applyInlineMapping(); onContinue() }} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 28px', background: '#00E5A0', color: '#0A0A0A',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'Syne', fontWeight: 800, fontSize: 16
      }}>
        Árazáshoz <IconArrow />
      </button>
    </div>
  )
}

const thStyle = { padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#555', fontFamily: 'DM Mono', fontWeight: 400, borderBottom: '1px solid #1E1E1E' }

function findMapping(name, map) {
  if (!name || !map) return null
  const n = name.toLowerCase()
  for (const [pattern, mapped] of Object.entries(map)) {
    const p = pattern.toLowerCase()
    if (n.includes(p) || p.includes(n)) return mapped
  }
  return null
}

// Inline input with autocomplete suggestions
function InlineItemInput({ value, onChange, onBlur, suggestions, placeholder }) {
  const [open, setOpen] = useState(false)
  const filtered = value.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
    : []
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => { setOpen(false); onBlur() }, 150) }}
        placeholder={placeholder}
        style={{
          width: '100%', background: value ? '#0D1A14' : '#111',
          border: value ? '1px solid #2A5A3A' : '1px solid #222',
          borderRadius: 6, padding: '8px 12px',
          color: value ? '#00E5A0' : '#555',
          fontFamily: 'DM Mono', fontSize: 13, outline: 'none',
          boxSizing: 'border-box'
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: '#161616', border: '1px solid #2A2A2A', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', marginTop: 2, maxHeight: 200, overflowY: 'auto'
        }}>
          {filtered.slice(0, 8).map((s, i) => (
            <div key={i}
              onMouseDown={() => { onChange(s); setOpen(false) }}
              style={{ padding: '8px 14px', fontFamily: 'DM Mono', fontSize: 12, color: '#CCC', cursor: 'pointer', borderBottom: '1px solid #1E1E1E' }}
              onMouseEnter={e => e.target.style.background = '#1A2A1A'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 3: Pricing ──────────────────────────────────────────────────────────


function PricingStep({ parseResult, mapping, unitFactor, prices, setPrices, norms, setNorms, settings, setSettings, onCalculate }) {
  const allItems = new Set()
  
  parseResult.blocks.forEach(b => {
    for (const [pattern, mapped] of Object.entries(mapping.blocks)) {
      if (b.name.toLowerCase().includes(pattern.toLowerCase())) { allItems.add(mapped); break }
    }
  })
  
  parseResult.lengths.forEach(l => {
    for (const [pattern, mapped] of Object.entries(mapping.layers)) {
      if (l.layer.toLowerCase().includes(pattern.toLowerCase())) { allItems.add(mapped); break }
    }
  })

  const items = [...allItems]

  return (
    <div>
      <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
        Árazás és normák
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 16, fontFamily: 'DM Mono' }}>
        Állítsd be az egységárakat és a normaidőket. Ez egyszer kell – utána profil szerint tölti be.
      </p>
      <div style={{ background: '#0D1A14', border: '1px solid #1A3025', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#4A8A6A', fontFamily: 'DM Mono', lineHeight: 1.8 }}>
          <strong style={{ color: '#00E5A0' }}>KÜLÖN módszer</strong> – a normaidők NEM tartalmazzák a kábelhúzást:<br/>
          <span style={{ color: '#5A9A7A' }}>• Szerelvény (dugalj, lámpa, kapcsoló):</span> csak a doboz+szerelvény rögzítés+bekötés ideje<br/>
          <span style={{ color: '#5A9A7A' }}>• Kábel NYY-J (m):</span> húzás+rögzítés ideje méterenként<br/>
          <span style={{ color: '#5A9A7A' }}>• Kábeltálca (m):</span> tartó+tálca+fedél szerelési ideje méterenként<br/>
          <span style={{ color: '#888' }}>Ha a tervben nincs kábelnyomvonal, adj hozzá becslést: dugaljonként ~6m kábel átlagosan.</span>
        </div>
      </div>

      {/* Global settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        {[
          { key: 'hourlyRate', label: 'Óradíj (Ft)', placeholder: '8000' },
          { key: 'margin', label: 'Árrés szorzó', placeholder: '1.15' },
        ].map(f => (
          <div key={f.key} style={{ background: '#111', borderRadius: 10, padding: 18, border: '1px solid #1E1E1E' }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', display: 'block', marginBottom: 8 }}>{f.label}</label>
            <input
              value={settings[f.key]}
              onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: '#00E5A0', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        <div style={{ background: '#111', borderRadius: 10, padding: 18, border: '1px solid #1E1E1E' }}>
          <label style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', display: 'block', marginBottom: 8 }}>ÁFA</label>
          <div style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: '#666' }}>27%</div>
        </div>
      </div>

      {/* Items table */}
      {items.length > 0 ? (
        <div style={{ border: '1px solid #1E1E1E', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#111' }}>
                {['Tétel', 'Egységár (Ft)', 'Norma (perc/egység)', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#555', fontFamily: 'DM Mono', fontWeight: 400, borderBottom: '1px solid #1E1E1E' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>{item}</div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 3 }}>
                      {item.includes('Kábel') && !item.includes('tálca') ? 'húzás+rögzítés / méter' :
                       item.includes('tálca') || item.includes('Tálca') ? 'tartó+tálca+fedél / méter' :
                       item.includes('Elosztó') ? 'teljes bekötés, betáblázás' :
                       'rögzítés+bekötés (kábel nélkül)'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input
                      value={prices[item] || ''}
                      onChange={e => setPrices(p => ({ ...p, [item]: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                      style={{ width: 120, background: '#151515', border: '1px solid #222', borderRadius: 6, padding: '6px 10px', color: '#00E5A0', fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input
                      value={norms[item] || ''}
                      onChange={e => setNorms(n => ({ ...n, [item]: parseFloat(e.target.value) || 0 }))}
                      placeholder="0"
                      style={{ width: 100, background: '#151515', border: '1px solid #222', borderRadius: 6, padding: '6px 10px', color: '#FFD966', fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: '#444', fontFamily: 'DM Mono' }}>
                    {norms[item] ? `${(norms[item]/60).toFixed(2)} ó` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,80,80,0.05)', border: '1px solid rgba(255,80,80,0.15)', borderRadius: 8, padding: 20, marginBottom: 28, color: '#FF8080', fontFamily: 'DM Mono', fontSize: 13 }}>
          Nincs mapping-elt elem. Menj vissza és állítsd be a mapping-et.
        </div>
      )}

      <button onClick={onCalculate} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 28px', background: '#00E5A0', color: '#0A0A0A',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'Syne', fontWeight: 800, fontSize: 16
      }}>
        <IconZap /> Kalkuláció és ajánlat generálása
      </button>
    </div>
  )
}

// ─── Step 4: Quote ────────────────────────────────────────────────────────────

function QuoteStep({ result, projectName, onReset }) {
  const s = result.summary

  const printQuote = () => {
    const w = window.open('', '_blank')
    const lineItemsHtml = result.lineItems
      .filter(item => item.material_cost > 0 || item.work_hours > 0)
      .map(item => `
        <tr>
          <td>${item.key}</td>
          <td style="text-align:center">${item.qty} ${item.unit}</td>
          <td style="text-align:right">${fmt(item.unit_price)} Ft</td>
          <td style="text-align:center">${item.norm_minutes} perc</td>
          <td style="text-align:right">${item.work_hours} ó</td>
          <td style="text-align:right"><strong>${fmt(item.material_cost)} Ft</strong></td>
        </tr>
      `).join('')

    w.document.write(`<!DOCTYPE html>
<html lang="hu"><head><meta charset="UTF-8">
<title>Árajánlat – ${projectName}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; color: #111; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 32px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #F5F5F5; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 10px 12px; border-bottom: 1px solid #EEE; font-size: 13px; }
  .summary { background: #F9F9F9; border-radius: 8px; padding: 24px; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #EEE; }
  .total-row { display: flex; justify-content: space-between; padding: 16px 0; font-size: 20px; font-weight: 700; }
  .footer { margin-top: 40px; font-size: 11px; color: #AAA; }
</style></head><body>
<h1>Árajánlat</h1>
<div class="meta">Projekt: <strong>${projectName}</strong> &nbsp;|&nbsp; Dátum: ${new Date().toLocaleDateString('hu-HU')}</div>
<table>
  <thead><tr>
    <th>Tétel</th><th style="text-align:center">Menny.</th><th style="text-align:right">Egységár</th>
    <th style="text-align:center">Norma</th><th style="text-align:right">Munkaóra</th>
    <th style="text-align:right">Anyagköltség</th>
  </tr></thead>
  <tbody>${lineItemsHtml}</tbody>
</table>
<div class="summary">
  <div class="summary-row"><span>Anyagköltség összesen</span><span><strong>${fmt(s.totalMaterial)} Ft</strong></span></div>
  <div class="summary-row"><span>Munkadíj (${fmt(s.totalWorkHours)} ó × ${fmt(s.workCost / (s.totalWorkHours || 1))} Ft/ó)</span><span><strong>${fmt(s.workCost)} Ft</strong></span></div>
  <div class="summary-row"><span>Részösszeg</span><span>${fmt(s.subtotal)} Ft</span></div>
  <div class="summary-row"><span>Árrés (${Math.round((s.margin-1)*100)}%)</span><span>${fmt(s.totalWithMargin - s.subtotal)} Ft</span></div>
  <div class="summary-row"><span>Nettó összesen</span><span>${fmt(s.totalWithMargin)} Ft</span></div>
  <div class="summary-row"><span>ÁFA (27%)</span><span>${fmt(s.vat)} Ft</span></div>
  <div class="total-row"><span>BRUTTÓ VÉGÖSSZEG</span><span>${fmt(s.grandTotal)} Ft</span></div>
</div>
<div class="footer">Készítette: TakeoffPro &nbsp;|&nbsp; Az ajánlat 30 napig érvényes &nbsp;|&nbsp; Az ajánlat mennyiségkimutatáson alapul, helyszíni felmérés függvényében módosítható.</div>
</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
            Kész az ajánlat
          </h2>
          <p style={{ color: '#666', fontSize: 14, fontFamily: 'DM Mono' }}>{projectName}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={printQuote} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px',
            background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 14
          }}>
            <IconDownload /> PDF nyomtatás
          </button>
          <button onClick={onReset} style={{
            padding: '12px 22px', background: 'transparent', border: '1px solid #2A2A2A',
            color: '#666', borderRadius: 8, cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 13
          }}>
            Új projekt
          </button>
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 28 }}>
        <div style={{ background: '#0D1A14', border: '1px solid #1A3025', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: '#4A8A6A', fontFamily: 'DM Mono', marginBottom: 8 }}>Bruttó végösszeg</div>
          <div style={{ fontSize: 36, fontFamily: 'Syne', fontWeight: 800, color: '#00E5A0' }}>
            {fmt(s.grandTotal)} Ft
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Anyagköltség', value: `${fmt(s.totalMaterial)} Ft` },
            { label: 'Munkadíj', value: `${fmt(s.workCost)} Ft` },
            { label: 'Össz munkaóra', value: `${fmt(s.totalWorkHours)} ó` },
            { label: 'ÁFA (27%)', value: `${fmt(s.vat)} Ft` },
          ].map(c => (
            <div key={c.label} style={{ background: '#111', borderRadius: 10, padding: 16, border: '1px solid #1E1E1E' }}>
              <div style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: '#CCC' }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Line items */}
      <div style={{ border: '1px solid #1E1E1E', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#111' }}>
              {['Tétel', 'Menny.', 'Egységár', 'Munkaóra', 'Anyagköltség'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Tétel' ? 'left' : 'right', fontSize: 11, color: '#555', fontFamily: 'DM Mono', fontWeight: 400, borderBottom: '1px solid #1E1E1E' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.lineItems.filter(item => item.material_cost > 0 || item.work_hours > 0).map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #141414', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>
                  {item.key}
                  {!item.mapped && <span style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>(becslés)</span>}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: '#888' }}>
                  {item.qty} {item.unit}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: '#666' }}>
                  {fmt(item.unit_price)} Ft
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: '#FFD966' }}>
                  {item.work_hours} ó
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: '#00E5A0', fontWeight: 500 }}>
                  {fmt(item.material_cost)} Ft
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState(0)
  const [parseResult, setParseResult] = useState(null)
  const [fileName, setFileName] = useState('')
  const [unitFactor, setUnitFactor] = useState(0.001)
  const [mapping, setMapping] = useState(DEFAULT_MAPPING)
  const [prices, setPrices] = useState(DEFAULT_PRICES)
  const [norms, setNorms] = useState(DEFAULT_NORMS)
  const [settings, setSettings] = useState({ hourlyRate: 8000, margin: 1.15 })
  const [calcResult, setCalcResult] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [editingName, setEditingName] = useState(false)

  const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : ''

  const handleParsed = (data, fname, uf) => {
    setParseResult(data)
    setFileName(fname)
    setUnitFactor(uf)
    setProjectName(fname.replace('.dxf', '').replace(/_/g, ' '))
    setStep(1)
  }

  const handleCalculate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: parseResult.blocks,
          lengths: parseResult.lengths,
          mapping,
          priceList: prices,
          norms,
          hourlyRate: parseFloat(settings.hourlyRate),
          margin: parseFloat(settings.margin),
          lengthUnitFactor: unitFactor
        })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setCalcResult(data)
      setStep(3)
    } catch (e) {
      alert('Hiba a kalkuláció során: ' + e.message)
    }
  }

  const reset = () => {
    setStep(0); setParseResult(null); setCalcResult(null); setFileName('')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#F0F0F0' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes progress { 0% { width: 0%; transform: translateX(-100%) } 50% { width: 60% } 100% { width: 0%; transform: translateX(200%) } }
        button:hover { opacity: 0.85; }
        input:focus { border-color: #00E5A0 !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #141414', padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: '#00E5A0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconZap />
          </div>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
            Takeoff<span style={{ color: '#00E5A0' }}>Pro</span>
          </span>
        </div>
        {projectName && step > 0 && (
          <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 8 }}>
            {editingName ? (
              <input value={projectName} onChange={e => setProjectName(e.target.value)}
                onBlur={() => setEditingName(false)} autoFocus
                style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 6, padding: '4px 10px', color: '#888', fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }} />
            ) : (
              <span onClick={() => setEditingName(true)} style={{ cursor: 'pointer', color: '#666' }}>{projectName}</span>
            )}
          </div>
        )}
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#333' }}>v1.0 beta</div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px' }}>
        <StepBar current={step} />

        {step === 0 && <UploadStep onParsed={handleParsed} apiBase={API_BASE} />}
        {step === 1 && parseResult && (
          <ReviewStep
            parseResult={parseResult}
            mapping={mapping}
            setMapping={setMapping}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && parseResult && (
          <PricingStep
            parseResult={parseResult}
            mapping={mapping}
            unitFactor={unitFactor}
            prices={prices} setPrices={setPrices}
            norms={norms} setNorms={setNorms}
            settings={settings} setSettings={setSettings}
            onCalculate={handleCalculate}
          />
        )}
        {step === 3 && calcResult && (
          <QuoteStep result={calcResult} projectName={projectName} onReset={reset} />
        )}
      </div>
    </div>
  )
}
