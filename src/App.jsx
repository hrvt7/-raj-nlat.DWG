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

const DEFAULT_NORMS = {
  "Dugalj 2P+F": 45,
  "Kapcsoló 1G": 30,
  "Lámpatest": 60,
  "Elosztó tábla": 240,
  "Kábeltálca 300×60": 18,
  "Kábeltálca 500×60": 22,
  "Kábel NYY-J": 8,
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

function ReviewStep({ parseResult, mapping, setMapping, unitFactor, onContinue }) {
  const [editMapping, setEditMapping] = useState(false)
  const [customMapping, setCustomMapping] = useState(JSON.stringify(mapping, null, 2))

  const applyMapping = (blockName) => {
    if (!blockName) return null
    const bn = blockName.toLowerCase()
    for (const [pattern, mapped] of Object.entries(mapping.blocks || {})) {
      const p = pattern.toLowerCase()
      if (bn.includes(p) || p.includes(bn)) return mapped
    }
    return null
  }

  const applyLayerMapping = (layerName) => {
    for (const [pattern, mapped] of Object.entries(mapping.layers)) {
      if (layerName.toLowerCase().includes(pattern.toLowerCase())) return mapped
      if (pattern.toLowerCase().includes(layerName.toLowerCase())) return mapped
    }
    return null
  }

  const saveMapping = () => {
    try {
      const parsed = JSON.parse(customMapping)
      setMapping(parsed)
      setEditMapping(false)
    } catch (e) {
      alert('Érvénytelen JSON')
    }
  }

  const mappedBlocks = parseResult.blocks.map(b => ({
    ...b,
    mapped: applyMapping(b.name)
  }))

  const mappedLengths = parseResult.lengths.map(l => ({
    ...l,
    length_m: (l.length * unitFactor).toFixed(2),
    mapped: applyLayerMapping(l.layer)
  }))

  const unmappedBlocks = mappedBlocks.filter(b => !b.mapped)
  const unmappedLayers = mappedLengths.filter(l => !l.mapped)

  return (
    <div>
      <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
        Mennyiségek ellenőrzése
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24, fontFamily: 'DM Mono' }}>
        A parser által talált elemek. Ellenőrizd és állítsd be a mapping-et.
      </p>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Block típus', value: parseResult.summary.total_block_types },
          { label: 'Összes db', value: parseResult.summary.total_blocks },
          { label: 'Layer (hossz)', value: parseResult.summary.layers_with_lines },
        ].map(c => (
          <div key={c.label} style={{ background: '#111', borderRadius: 10, padding: 18, border: '1px solid #1E1E1E' }}>
            <div style={{ fontSize: 28, fontFamily: 'Syne', fontWeight: 800, color: '#00E5A0' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#555', fontFamily: 'DM Mono', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {(unmappedBlocks.length > 0 || unmappedLayers.length > 0) && (
        <div style={{ background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13, color: '#FFD966', fontFamily: 'DM Mono' }}>
          ⚠️ {unmappedBlocks.length + unmappedLayers.length} elem nincs mapping-elve → nem kerül az ajánlatba.
          <button onClick={() => setEditMapping(true)} style={{ marginLeft: 12, background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)', color: '#FFD966', padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>
            Mapping szerkesztése
          </button>
        </div>
      )}

      {/* Blocks table */}
      {parseResult.blocks.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 700, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Blokkok (szerelvények)
          </h3>
          <div style={{ border: '1px solid #1E1E1E', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#111' }}>
                  {['Block neve', 'Layer', 'Darab', 'Tétel'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#555', fontFamily: 'DM Mono', fontWeight: 400, borderBottom: '1px solid #1E1E1E' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedBlocks.slice(0, 50).map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #141414', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>{b.name}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 12, color: '#555' }}>{b.layer}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#00E5A0', fontWeight: 500 }}>{b.count}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {b.mapped
                        ? <span style={{ background: 'rgba(0,229,160,0.08)', color: '#00E5A0', padding: '3px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'DM Mono', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <IconCheck /> {b.mapped}
                          </span>
                        : <span style={{ color: '#444', fontSize: 12, fontFamily: 'DM Mono' }}>— nincs mapping</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lengths table */}
      {parseResult.lengths.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 700, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Vonalak / hosszak (tálca, kábel)
          </h3>
          <div style={{ border: '1px solid #1E1E1E', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#111' }}>
                  {['Layer neve', 'Hossz (m)', 'Tétel'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#555', fontFamily: 'DM Mono', fontWeight: 400, borderBottom: '1px solid #1E1E1E' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappedLengths.slice(0, 30).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #141414', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>{l.layer}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#00E5A0', fontWeight: 500 }}>{l.length_m}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {l.mapped
                        ? <span style={{ background: 'rgba(0,229,160,0.08)', color: '#00E5A0', padding: '3px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'DM Mono', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <IconCheck /> {l.mapped}
                          </span>
                        : <span style={{ color: '#444', fontSize: 12, fontFamily: 'DM Mono' }}>— nincs mapping</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mapping editor modal */}
      {editMapping && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 14, padding: 32, width: '90%', maxWidth: 600 }}>
            <h3 style={{ fontFamily: 'Syne', fontWeight: 800, color: '#F0F0F0', marginBottom: 16 }}>Mapping szerkesztése</h3>
            <p style={{ fontSize: 12, color: '#666', fontFamily: 'DM Mono', marginBottom: 16, lineHeight: 1.6 }}>
              blocks: block neve tartalmazza a kulcsot → tétel neve<br/>
              layers: layer neve tartalmazza a kulcsot → tétel neve
            </p>
            <textarea value={customMapping} onChange={e => setCustomMapping(e.target.value)}
              style={{ width: '100%', height: 300, background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: 8, color: '#CCC', fontFamily: 'DM Mono', fontSize: 12, padding: 16, resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={saveMapping} style={{ flex: 1, padding: 12, background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700 }}>
                Mentés
              </button>
              <button onClick={() => setEditMapping(false)} style={{ padding: '12px 20px', background: 'transparent', border: '1px solid #2A2A2A', color: '#666', borderRadius: 8, cursor: 'pointer' }}>
                Mégse
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={onContinue} style={{
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
      <p style={{ color: '#666', fontSize: 14, marginBottom: 28, fontFamily: 'DM Mono' }}>
        Állítsd be az egységárakat és a normaidőket. Ez egyszer kell – utána profil szerint tölti be.
      </p>

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
                  <td style={{ padding: '12px 16px', fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>{item}</td>
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
            unitFactor={unitFactor}
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
