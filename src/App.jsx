import React, { useState, useCallback, useRef, useEffect } from 'react'
import Landing from './Landing.jsx'

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

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

// Convert file bytes to base64
async function fileToBase64(f) {
  const arrayBuffer = await f.arrayBuffer()
  const uint8 = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// Convert DWG → DXF via CloudConvert API (free tier: 25/day)
async function convertDwgToDxf(file, apiBase) {
  const b64 = await fileToBase64(file)
  const res = await fetch(`${apiBase}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, data: b64 })
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'DWG konverzió sikertelen')
  return data // returns { data: base64_dxf, filename: '...' }
}

// Parse a single DXF file (as base64)
async function parseDxfBase64(b64, filename, apiBase) {
  const res = await fetch(`${apiBase}/api/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, data: b64 })
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data
}

function UploadStep({ onParsed, apiBase }) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([]) // { name, status, result, error }
  const [processing, setProcessing] = useState(false)
  const [globalError, setGlobalError] = useState(null)
  const inputRef = useRef()

  const processFiles = async (fileList) => {
    const validFiles = Array.from(fileList).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase()
      return ['dxf', 'dwg'].includes(ext)
    })
    if (validFiles.length === 0) {
      setGlobalError('Csak .dxf vagy .dwg fájlok tölthetők fel.')
      return
    }
    setGlobalError(null)
    setProcessing(true)
    // Initialize status for all files
    setFiles(validFiles.map(f => ({ name: f.name, status: 'waiting', result: null, error: null })))

    const results = []
    for (let i = 0; i < validFiles.length; i++) {
      const f = validFiles[i]
      const isDwg = f.name.toLowerCase().endsWith('.dwg')
      setFiles(prev => prev.map((x, idx) => idx === i ? { ...x, status: isDwg ? 'converting' : 'parsing' } : x))
      try {
        let b64, fname
        if (isDwg) {
          const converted = await convertDwgToDxf(f, apiBase)
          b64 = converted.data
          fname = f.name.replace(/\.dwg$/i, '.dxf')
        } else {
          b64 = await fileToBase64(f)
          fname = f.name
        }
        setFiles(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'parsing' } : x))
        const parsed = await parseDxfBase64(b64, fname, apiBase)
        results.push({ name: f.name, label: f.name.replace(/\.(dxf|dwg)$/i, '').replace(/_/g, ' '), data: parsed })
        setFiles(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'done', result: parsed } : x))
      } catch (e) {
        setFiles(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'error', error: e.message } : x))
      }
    }

    setProcessing(false)
    const successful = results.filter(r => r.data)
    if (successful.length > 0) {
      onParsed(successful)
    }
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [])

  const statusIcon = (s) => {
    if (s === 'done') return <span style={{ color: '#00E5A0' }}>✓</span>
    if (s === 'error') return <span style={{ color: '#FF6B6B' }}>✗</span>
    if (s === 'converting') return <span style={{ color: '#FFD966' }}>⟳ DWG→DXF...</span>
    if (s === 'parsing') return <span style={{ color: '#00E5A0' }}>⟳ Olvasás...</span>
    return <span style={{ color: '#555' }}>○ várakozik</span>
  }

  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const successCount = files.filter(f => f.status === 'done').length
  const activeProcessing = files.some(f => f.status === 'parsing' || f.status === 'converting')

  const statusLabel = (status) => {
    if (status === 'waiting') return { text: 'Várakozás...', color: '#444' }
    if (status === 'converting') return { text: 'DWG → DXF konverzió...', color: '#FFD966' }
    if (status === 'parsing') return { text: 'Elemzés...', color: '#00E5A0' }
    if (status === 'done') return { text: 'Kész', color: '#00E5A0' }
    if (status === 'error') return { text: 'Hiba', color: '#FF6B6B' }
    return { text: '', color: '#555' }
  }

  return (
    <div style={{ animation: 'fadeUp 0.4s ease' }}>
      <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
        Töltsd fel a terveket
      </h2>
      <p style={{ color: '#555', fontSize: 14, marginBottom: 28, fontFamily: 'DM Mono' }}>
        DXF és DWG fájlok egyaránt — több fájl egyszerre (pl. emeletenként)
      </p>

      {/* Drop zone */}
      <div
        onClick={() => !processing && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? '#00E5A0' : files.length > 0 ? '#1A3A2A' : '#1E1E1E'}`,
          borderRadius: 16, padding: files.length > 0 ? '28px 32px' : '56px 40px',
          textAlign: 'center', cursor: processing ? 'default' : 'pointer',
          background: dragging ? 'rgba(0,229,160,0.03)' : files.length > 0 ? '#0A0F0C' : '#0D0D0D',
          transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
          boxShadow: dragging ? '0 0 40px rgba(0,229,160,0.08) inset' : 'none'
        }}
      >
        {/* Shimmer overlay when processing */}
        {activeProcessing && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(90deg, transparent 0%, rgba(0,229,160,0.04) 50%, transparent 100%)',
            animation: 'shimmer 2s infinite'
          }} />
        )}

        <input ref={inputRef} type="file" accept=".dxf,.dwg" multiple style={{ display: 'none' }}
          onChange={e => e.target.files.length > 0 && processFiles(e.target.files)} />

        {files.length === 0 ? (
          <div>
            <div style={{
              width: 56, height: 56, borderRadius: 14, background: '#111',
              border: '1px solid #1E1E1E', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 20px', color: '#444'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div style={{ fontFamily: 'Syne', fontSize: 20, color: '#666', fontWeight: 700, marginBottom: 10 }}>
              Húzd ide a fájlokat
            </div>
            <div style={{ color: '#333', fontSize: 13, fontFamily: 'DM Mono', lineHeight: 2 }}>
              <span style={{ color: '#3A6A5A', background: 'rgba(0,229,160,0.06)', padding: '2px 8px', borderRadius: 4, marginRight: 6 }}>DXF</span>
              <span style={{ color: '#3A6A5A', background: 'rgba(0,229,160,0.06)', padding: '2px 8px', borderRadius: 4, marginRight: 6 }}>DWG</span>
              <span style={{ color: '#3A6A5A', background: 'rgba(0,229,160,0.06)', padding: '2px 8px', borderRadius: 4 }}>Több fájl</span>
              <br/>
              <span style={{ color: '#2A2A2A' }}>vagy kattints a tallózáshoz</span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            {files.map((f, i) => {
              const sl = statusLabel(f.status)
              const isActive = f.status === 'parsing' || f.status === 'converting'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < files.length - 1 ? '1px solid #111' : 'none' }}>
                  {/* File icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: f.status === 'done' ? 'rgba(0,229,160,0.1)' : f.status === 'error' ? 'rgba(255,80,80,0.08)' : '#111',
                    border: `1px solid ${f.status === 'done' ? '#1A4A3A' : f.status === 'error' ? 'rgba(255,80,80,0.2)' : '#1E1E1E'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
                  }}>
                    {f.status === 'done' ? '✓' : f.status === 'error' ? '✗' : isActive ? (
                      <div style={{ width: 14, height: 14, border: '2px solid #00E5A015', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    ) : '⏳'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: f.status === 'error' ? '#FF8080' : '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11, color: sl.color, fontFamily: 'DM Mono', marginTop: 2 }}>
                      {f.error || sl.text}
                    </div>
                  </div>

                  {/* Progress bar for active */}
                  {isActive && (
                    <div style={{ width: 80, height: 3, background: '#1A1A1A', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{ height: '100%', background: '#00E5A0', borderRadius: 2, animation: 'shimmer 1.5s infinite', width: '40%', position: 'relative', left: '-100%' }} />
                    </div>
                  )}
                </div>
              )
            })}
            {!processing && (
              <div style={{ marginTop: 14, textAlign: 'center', color: '#333', fontSize: 11, fontFamily: 'DM Mono', paddingTop: 12, borderTop: '1px solid #111' }}>
                + További fájlok húzása vagy kattintás
              </div>
            )}
          </div>
        )}
      </div>

      {globalError && (
        <div style={{ background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.15)', borderRadius: 8, padding: '12px 16px', marginTop: 14, color: '#FF8080', fontSize: 12, fontFamily: 'DM Mono' }}>
          {globalError}
        </div>
      )}

      {allDone && successCount > 0 && (
        <div style={{ marginTop: 16, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)', borderRadius: 10, padding: '14px 18px', fontFamily: 'DM Mono', fontSize: 13, color: '#00E5A0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,229,160,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</div>
          {successCount} fájl feldolgozva – továbblépés...
        </div>
      )}
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
                  <th style={thStyle}>Anyag / Tétel neve</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Darab</th>
                  <th style={{ ...thStyle, color: '#333' }}>Azonosító (rajzon)</th>
                </tr>
              </thead>
              <tbody>
                {parseResult.blocks.slice(0, 50).map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '8px 12px', position: 'relative' }}>
                      <InlineItemInput
                        value={blockMap[b.name] || ''}
                        onChange={v => setBlockMap(m => ({ ...m, [b.name]: v }))}
                        onBlur={applyInlineMapping}
                        suggestions={ITEM_SUGGESTIONS}
                        placeholder="Pl. Dugalj 2P+F  — kezdj el gépelni..."
                      />
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 14, color: '#00E5A0', fontWeight: 700, textAlign: 'center' }}>{b.count} db</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 11, color: '#333' }}>
                      {b.name}
                      {b.layer && b.layer !== b.name && <div style={{ fontSize: 10, color: '#2A2A2A', marginTop: 1 }}>{b.layer}</div>}
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
                  <th style={thStyle}>Anyag / Tétel neve</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Hossz (m)</th>
                  <th style={{ ...thStyle, color: '#333' }}>Layer (rajzon)</th>
                </tr>
              </thead>
              <tbody>
                {parseResult.lengths.slice(0, 30).map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                    <td style={{ padding: '8px 12px', position: 'relative' }}>
                      <InlineItemInput
                        value={layerMap[l.layer] || ''}
                        onChange={v => setLayerMap(m => ({ ...m, [l.layer]: v }))}
                        onBlur={applyInlineMapping}
                        suggestions={ITEM_SUGGESTIONS}
                        placeholder="Pl. Kábeltálca 300×60  — kezdj el gépelni..."
                      />
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 14, color: '#00E5A0', fontWeight: 700, textAlign: 'center' }}>{l.length} m</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: 11, color: '#333' }}>
                      {l.layer}
                      {l.info && (l.info.type === 'tray' && l.info.tray_width
                        ? <div style={{ fontSize: 10, color: '#2A4A3A', marginTop: 1 }}>Tálca {l.info.tray_width}×{l.info.tray_height}mm</div>
                        : l.info.type === 'cable'
                        ? <div style={{ fontSize: 10, color: '#2A4A3A', marginTop: 1 }}>{l.info.cable_type || 'Kábel'}{l.info.cores ? ` ${l.info.cores}×${l.info.cross_section}mm²` : ''}</div>
                        : null
                      )}
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
  const [laborMode, setLaborMode] = useState('hourly') // 'hourly' | 'peritem'

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
        Árazás és munkadíj
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24, fontFamily: 'DM Mono' }}>
        Állítsd be az egységárakat és válaszd a munkadíj kalkuláció módját.
      </p>

      {/* Labor mode selector */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: '#555', fontFamily: 'DM Mono', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Munkadíj kalkuláció módja</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'hourly', icon: '⏱', title: 'Órabéres', desc: 'Megadod az óradíjat és normaidőket. Az app kiszámolja a teljes munkadíjat.' },
            { key: 'peritem', icon: '📋', title: 'Tételes', desc: 'Minden tételhez külön munkadíjat adsz meg (Ft/db vagy Ft/m).' }
          ].map(m => (
            <div key={m.key} onClick={() => setLaborMode(m.key)} style={{
              padding: '18px 20px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
              border: `2px solid ${laborMode === m.key ? '#00E5A0' : '#1E1E1E'}`,
              background: laborMode === m.key ? 'rgba(0,229,160,0.05)' : '#0D0D0D',
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: laborMode === m.key ? '#00E5A0' : '#CCC', marginBottom: 6 }}>{m.title}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#555', lineHeight: 1.6 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Global settings */}
      <div style={{ display: 'grid', gridTemplateColumns: laborMode === 'hourly' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 16, marginBottom: 28 }}>
        {laborMode === 'hourly' && (
          <div style={{ background: '#111', borderRadius: 10, padding: 18, border: '1px solid #1E1E1E' }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', display: 'block', marginBottom: 8 }}>Óradíj (Ft/ó)</label>
            <input value={settings.hourlyRate} onChange={e => setSettings(s => ({ ...s, hourlyRate: e.target.value }))} placeholder="8000"
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: '#00E5A0' }} />
          </div>
        )}
        <div style={{ background: '#111', borderRadius: 10, padding: 18, border: '1px solid #1E1E1E' }}>
          <label style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', display: 'block', marginBottom: 8 }}>Árrés szorzó</label>
          <input value={settings.margin} onChange={e => setSettings(s => ({ ...s, margin: e.target.value }))} placeholder="1.15"
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Syne', fontSize: 22, fontWeight: 800, color: '#00E5A0' }} />
        </div>
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
                <th style={thStyle}>Tétel</th>
                <th style={thStyle}>Egységár (Ft)</th>
                {laborMode === 'hourly'
                  ? <th style={thStyle}>Norma (perc)</th>
                  : <th style={thStyle}>Munkadíj (Ft/egység)</th>}
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>{item}</div>
                    <div style={{ fontSize: 10, color: '#444', marginTop: 3 }}>
                      {item.includes('Kábel') && !item.toLowerCase().includes('tálca') ? 'húzás / méter' :
                       item.toLowerCase().includes('tálca') ? 'szerelés / méter' :
                       item.includes('Elosztó') ? 'bekötés, betáblázás' : 'rögzítés + bekötés'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input value={prices[item] || ''} onChange={e => setPrices(p => ({ ...p, [item]: parseFloat(e.target.value) || 0 }))} placeholder="0"
                      style={{ width: 110, background: '#151515', border: '1px solid #222', borderRadius: 6, padding: '6px 10px', color: '#00E5A0', fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }} />
                  </td>
                  {laborMode === 'hourly' ? (
                    <td style={{ padding: '12px 16px' }}>
                      <input value={norms[item] || ''} onChange={e => setNorms(n => ({ ...n, [item]: parseFloat(e.target.value) || 0 }))} placeholder="0"
                        style={{ width: 90, background: '#151515', border: '1px solid #222', borderRadius: 6, padding: '6px 10px', color: '#FFD966', fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }} />
                    </td>
                  ) : (
                    <td style={{ padding: '12px 16px' }}>
                      <input value={settings.perItemLabor?.[item] || ''} onChange={e => setSettings(s => ({ ...s, perItemLabor: { ...s.perItemLabor, [item]: parseFloat(e.target.value) || 0 } }))} placeholder="0"
                        style={{ width: 110, background: '#151515', border: '1px solid rgba(255,217,102,0.3)', borderRadius: 6, padding: '6px 10px', color: '#FFD966', fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }} />
                    </td>
                  )}
                  <td style={{ padding: '12px 16px', fontSize: 11, color: '#444', fontFamily: 'DM Mono' }}>
                    {laborMode === 'hourly' && norms[item] ? `${(norms[item]/60).toFixed(2)} ó` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,80,80,0.05)', border: '1px solid rgba(255,80,80,0.15)', borderRadius: 8, padding: 20, marginBottom: 28, color: '#FF8080', fontFamily: 'DM Mono', fontSize: 13 }}>
          Nincs mapping-elt elem. Menj vissza és állítsd be a tételeket.
        </div>
      )}

      <button onClick={() => onCalculate(laborMode)} style={{
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

// ─── Step 4: AI Assistant ─────────────────────────────────────────────────────

function AIStep({ parseResult, mapping, onContinue, apiBase }) {
  const [specText, setSpecText] = useState('')
  const [specFile, setSpecFile] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [suggestions, setSuggestions] = useState({}) // item → suggestion
  const [loading, setLoading] = useState(false)
  const [loadingItem, setLoadingItem] = useState(null)
  const [error, setError] = useState(null)
  const specRef = useRef()

  // Collect mapped items for suggestions
  const mappedItems = []
  parseResult.blocks.forEach(b => {
    for (const [pattern, mapped] of Object.entries(mapping.blocks)) {
      if (b.name.toLowerCase().includes(pattern.toLowerCase())) {
        if (!mappedItems.find(x => x.name === mapped)) mappedItems.push({ name: mapped, qty: b.count, unit: 'db' })
        break
      }
    }
  })
  parseResult.lengths.forEach(l => {
    for (const [pattern, mapped] of Object.entries(mapping.layers)) {
      if (l.layer.toLowerCase().includes(pattern.toLowerCase())) {
        if (!mappedItems.find(x => x.name === mapped)) mappedItems.push({ name: mapped, qty: l.length, unit: 'm' })
        break
      }
    }
  })

  const readFileAsText = (file) => new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => res(e.target.result)
    reader.onerror = rej
    reader.readAsText(file)
  })

  const handleSpecUpload = async (file) => {
    setSpecFile(file)
    try {
      if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await readFileAsText(file)
        setSpecText(text)
      } else {
        // For PDF/docx signal to user we'll send filename only for now
        setSpecText(`[Feltöltött fájl: ${file.name} – szöveg kinyerés folyamatban...]`)
      }
    } catch(e) {
      setError('Fájl olvasási hiba: ' + e.message)
    }
  }

  const runAnalysis = async () => {
    if (!specText.trim()) { setError('Először töltsd fel a műszaki leírást, vagy írj szöveget.'); return }
    setLoading(true); setError(null); setAnalysisResult(null)
    try {
      const res = await fetch(`${apiBase}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze_spec', spec_text: specText, takeoff_items: mappedItems })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setAnalysisResult(data.result)
    } catch(e) {
      setError('AI elemzés hiba: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const suggestForItem = async (item) => {
    setLoadingItem(item.name)
    try {
      const res = await fetch(`${apiBase}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest_materials', item_name: item.name, quantity: item.qty, unit: item.unit })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setSuggestions(s => ({ ...s, [item.name]: data.result }))
    } catch(e) {
      setError('Anyagajánlás hiba: ' + e.message)
    } finally {
      setLoadingItem(null)
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 800, color: '#F0F0F0', marginBottom: 8 }}>
        AI Asszisztens
      </h2>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 28, fontFamily: 'DM Mono' }}>
        Töltsd fel a műszaki leírást – az AI elemzi a követelményeket és anyagokat javasol. Ez a lépés opcionális.
      </p>

      {/* Spec upload */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#555', fontFamily: 'DM Mono', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Műszaki Leírás</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button onClick={() => specRef.current?.click()} style={{
            padding: '8px 16px', background: '#111', border: '1px solid #2A2A2A', borderRadius: 8,
            color: '#888', fontFamily: 'DM Mono', fontSize: 12, cursor: 'pointer'
          }}>
            📎 Fájl feltöltése (TXT, PDF)
          </button>
          {specFile && <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#555', display: 'flex', alignItems: 'center' }}>{specFile.name}</span>}
          <input ref={specRef} type="file" accept=".txt,.md,.pdf,.docx" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && handleSpecUpload(e.target.files[0])} />
        </div>
        <textarea
          value={specText}
          onChange={e => setSpecText(e.target.value)}
          placeholder="Vagy illeszd be ide a műszaki leírás szövegét...&#10;&#10;Pl: 'A nedves helyiségekben IP44 védettségű szerelvényeket kell alkalmazni. A kábeltálcák 300×60mm méretűek, MSZ HD 60364-7-701 szabvány szerint...'"
          style={{
            width: '100%', minHeight: 140, background: '#0D0D0D', border: '1px solid #1E1E1E',
            borderRadius: 10, padding: '14px 16px', color: '#888', fontFamily: 'DM Mono', fontSize: 12,
            outline: 'none', resize: 'vertical', lineHeight: 1.7, boxSizing: 'border-box'
          }}
        />
        <button onClick={runAnalysis} disabled={loading || !specText.trim()} style={{
          marginTop: 12, padding: '10px 24px', background: loading ? '#1A1A1A' : 'rgba(0,229,160,0.1)',
          border: '1px solid rgba(0,229,160,0.3)', borderRadius: 8, color: loading ? '#555' : '#00E5A0',
          fontFamily: 'Syne', fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer'
        }}>
          {loading ? '⟳ AI elemzés folyamatban...' : '✦ AI Elemzés indítása'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: 8, padding: 14, marginBottom: 20, color: '#FF8080', fontSize: 12, fontFamily: 'DM Mono' }}>
          {error}
        </div>
      )}

      {/* Analysis result */}
      {analysisResult && (
        <div style={{ background: '#0D0D0D', border: '1px solid #1A3025', borderRadius: 12, padding: 24, marginBottom: 28 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: '#00E5A0', marginBottom: 16 }}>✦ AI Elemzés eredménye</div>
          
          {analysisResult.summary && (
            <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#777', lineHeight: 1.7, marginBottom: 16, padding: '12px 14px', background: 'rgba(0,229,160,0.04)', borderRadius: 8, borderLeft: '3px solid #00E5A0' }}>
              {analysisResult.summary}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'IP védettség', value: analysisResult.ip_requirement },
              { label: 'Kábel típus', value: analysisResult.cable_type },
              { label: 'Szabvány', value: analysisResult.standard },
              { label: 'Szerelési mód', value: analysisResult.installation_method },
            ].filter(x => x.value).map((row, i) => (
              <div key={i} style={{ background: '#111', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: '#444', fontFamily: 'DM Mono', marginBottom: 4 }}>{row.label}</div>
                <div style={{ fontSize: 13, color: '#00E5A0', fontFamily: 'DM Mono' }}>{row.value}</div>
              </div>
            ))}
          </div>

          {analysisResult.warnings?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {analysisResult.warnings.map((w, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,217,102,0.06)', border: '1px solid rgba(255,217,102,0.15)', borderRadius: 6, marginBottom: 6, fontSize: 12, color: '#FFD966', fontFamily: 'DM Mono' }}>
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}

          {analysisResult.missing_items?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#555', fontFamily: 'DM Mono', marginBottom: 6 }}>Hiányzó tételek a DXF-ből:</div>
              {analysisResult.missing_items.map((m, i) => (
                <div key={i} style={{ padding: '6px 12px', background: 'rgba(255,80,80,0.06)', borderRadius: 6, marginBottom: 4, fontSize: 12, color: '#FF8080', fontFamily: 'DM Mono' }}>
                  ✗ {m}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Material suggestions per item */}
      {mappedItems.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#555', fontFamily: 'DM Mono', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anyagajánlások tételenként</div>
          {mappedItems.map((item, i) => (
            <div key={i} style={{ border: '1px solid #1A1A1A', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#0D0D0D' }}>
                <div>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#CCC' }}>{item.name}</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444', marginLeft: 10 }}>{item.qty} {item.unit}</span>
                </div>
                {!suggestions[item.name] && (
                  <button onClick={() => suggestForItem(item)} disabled={loadingItem === item.name} style={{
                    padding: '6px 14px', background: 'transparent', border: '1px solid #2A4A3A',
                    borderRadius: 6, color: '#4A8A6A', fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer'
                  }}>
                    {loadingItem === item.name ? '⟳ Keresés...' : '✦ AI Javaslat'}
                  </button>
                )}
              </div>
              {suggestions[item.name] && (
                <div style={{ padding: '14px 16px', background: '#080808' }}>
                  {suggestions[item.name].products?.slice(0, 3).map((p, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: j < 2 ? '1px solid #111' : 'none', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#CCC', marginBottom: 2 }}>{p.brand} – {p.name}</div>
                        {p.type && <div style={{ fontSize: 10, color: '#444', fontFamily: 'DM Mono' }}>{p.type}</div>}
                        {p.pros && <div style={{ fontSize: 10, color: '#3A6A5A', fontFamily: 'DM Mono', marginTop: 2 }}>{p.pros}</div>}
                      </div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#FFD966', flexShrink: 0, textAlign: 'right' }}>
                        {p.price_range}
                      </div>
                    </div>
                  ))}
                  {suggestions[item.name].recommendation && (
                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,229,160,0.04)', borderRadius: 6, fontSize: 11, color: '#4A8A6A', fontFamily: 'DM Mono', lineHeight: 1.6, borderLeft: '2px solid #1A4A3A' }}>
                      {suggestions[item.name].recommendation}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onContinue} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 28px', background: '#00E5A0', color: '#0A0A0A',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'Syne', fontWeight: 800, fontSize: 16
        }}>
          Tovább az árazáshoz <IconArrow />
        </button>
        <button onClick={onContinue} style={{
          padding: '14px 20px', background: 'transparent', border: '1px solid #2A2A2A',
          borderRadius: 8, color: '#555', cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 13
        }}>
          Kihagyom
        </button>
      </div>
    </div>
  )
}

// ─── Step 5: Quote ────────────────────────────────────────────────────────────

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

// ─── StepBar ──────────────────────────────────────────────────────────────────

const STEP_LABELS = ['Feltöltés', 'Ellenőrzés', 'AI Elemzés', 'Árazás', 'Ajánlat']

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40, gap: 0 }}>
      {STEP_LABELS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: done ? '#00E5A0' : active ? 'rgba(0,229,160,0.15)' : '#111',
                border: done ? '2px solid #00E5A0' : active ? '2px solid #00E5A0' : '2px solid #222',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'DM Mono', fontSize: 11, color: done ? '#0A0A0A' : active ? '#00E5A0' : '#333',
                fontWeight: done ? 700 : 400,
                transition: 'all 0.3s'
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{
                fontFamily: 'DM Mono', fontSize: 10, marginTop: 6, color: active ? '#00E5A0' : done ? '#4A8A6A' : '#333',
                transition: 'color 0.3s', whiteSpace: 'nowrap'
              }}>{label}</div>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 2, height: 1, background: i < current ? '#1A4A3A' : '#1A1A1A', marginBottom: 20, transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // Simple hash-based routing: '' or '#' = landing, '#app' = app
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    const fn = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])

  const goToApp = () => { window.location.hash = '#app' }

  // Show landing on '' or '#'
  if (!route || route === '#' || route === '#landing') {
    return <Landing onStart={goToApp} />
  }

  return <AppShell />
}

function AppShell() {
  const [step, setStep] = useState(0)
  const [files, setFiles] = useState([])
  const [activeFile, setActiveFile] = useState(0)
  const [mapping, setMapping] = useState(DEFAULT_MAPPING)
  const [prices, setPrices] = useState(DEFAULT_PRICES)
  const [norms, setNorms] = useState(DEFAULT_NORMS)
  const [settings, setSettings] = useState({ hourlyRate: 8000, margin: 1.15, perItemLabor: {} })
  const [calcResult, setCalcResult] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [editingName, setEditingName] = useState(false)

  const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : ''

  const mergedParseResult = files.length === 0 ? null : {
    blocks: files.flatMap(f => f.data.blocks),
    lengths: files.flatMap(f => f.data.lengths),
    units: files[0]?.data.units,
    summary: {
      total_block_types: new Set(files.flatMap(f => f.data.blocks.map(b => b.name))).size,
      total_blocks: files.reduce((s, f) => s + (f.data.summary?.total_blocks || 0), 0),
      layers_with_lines: files.reduce((s, f) => s + (f.data.summary?.layers_with_lines || 0), 0),
    }
  }

  const handleParsed = (results) => {
    setFiles(results)
    setActiveFile(0)
    setProjectName(results.length === 1
      ? results[0].label
      : results[0].label.replace(/ \d+$/, '') || 'Projekt'
    )
    setTimeout(() => setStep(1), 600)
  }

  const handleCalculate = async (laborMode) => {
    try {
      const body = {
        blocks: mergedParseResult.blocks,
        lengths: mergedParseResult.lengths,
        mapping,
        priceList: prices,
        norms,
        hourlyRate: laborMode === 'hourly' ? parseFloat(settings.hourlyRate) : 0,
        margin: parseFloat(settings.margin),
        lengthUnitFactor: 1.0,
        laborMode: laborMode,
        perItemLabor: settings.perItemLabor || {}
      }
      const res = await fetch(`${API_BASE}/api/calculate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setCalcResult(data)
      setStep(4) // step 4 = quote (0-indexed: upload=0, review=1, ai=2, pricing=3, quote=4)
    } catch (e) {
      alert('Hiba a kalkuláció során: ' + e.message)
    }
  }

  const reset = () => {
    setStep(0); setFiles([]); setCalcResult(null); setActiveFile(0)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#F0F0F0' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        button:focus { outline: none; }
        input:focus { border-color: #00E5A0 !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #141414', padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,10,0.9)' }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, background: '#00E5A0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(0,229,160,0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', color: '#F0F0F0' }}>
            Takeoff<span style={{ color: '#00E5A0' }}>Pro</span>
          </span>
        </a>

        {projectName && step > 0 && (
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#333' }}>●</span>
            {editingName ? (
              <input value={projectName} onChange={e => setProjectName(e.target.value)}
                onBlur={() => setEditingName(false)} autoFocus
                style={{ background: 'transparent', border: '1px solid #2A2A2A', borderRadius: 6, padding: '4px 10px', color: '#888', fontFamily: 'DM Mono', fontSize: 12, outline: 'none' }} />
            ) : (
              <span onClick={() => setEditingName(true)} style={{ cursor: 'pointer', color: '#666' }} title="Kattints a névváltoztatáshoz">{projectName}</span>
            )}
          </div>
        )}
        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#2A2A2A', letterSpacing: '0.05em' }}>v1.0 BETA</div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 80px' }}>
        <StepBar current={step} />

        {/* Step 0: Upload */}
        {step === 0 && <UploadStep onParsed={handleParsed} apiBase={API_BASE} />}

        {/* Step 1: Review */}
        {step === 1 && mergedParseResult && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            {files.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
                {files.map((f, i) => (
                  <button key={i} onClick={() => setActiveFile(i)} style={{
                    padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: activeFile === i ? '#00E5A0' : '#1A1A1A',
                    color: activeFile === i ? '#0A0A0A' : '#666',
                    fontFamily: 'DM Mono', fontSize: 12, fontWeight: activeFile === i ? 700 : 400,
                    transition: 'all 0.15s'
                  }}>
                    {f.label}
                  </button>
                ))}
                <button onClick={() => setActiveFile(-1)} style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: activeFile === -1 ? '#FFD966' : '#1A1A1A',
                  color: activeFile === -1 ? '#0A0A0A' : '#666',
                  fontFamily: 'DM Mono', fontSize: 12, fontWeight: activeFile === -1 ? 700 : 400,
                  transition: 'all 0.15s'
                }}>
                  ∑ Összesített
                </button>
              </div>
            )}
            <ReviewStep
              parseResult={activeFile === -1 ? mergedParseResult : (files[activeFile]?.data || mergedParseResult)}
              mapping={mapping} setMapping={setMapping}
              onContinue={() => setStep(2)}
            />
          </div>
        )}

        {/* Step 2: AI */}
        {step === 2 && mergedParseResult && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <AIStep
              parseResult={mergedParseResult}
              mapping={mapping}
              onContinue={() => setStep(3)}
              apiBase={API_BASE}
            />
          </div>
        )}

        {/* Step 3: Pricing */}
        {step === 3 && mergedParseResult && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <PricingStep
              parseResult={mergedParseResult}
              mapping={mapping}
              unitFactor={1.0}
              prices={prices} setPrices={setPrices}
              norms={norms} setNorms={setNorms}
              settings={settings} setSettings={setSettings}
              onCalculate={handleCalculate}
            />
          </div>
        )}

        {/* Step 4: Quote */}
        {step === 4 && calcResult && (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <QuoteStep result={calcResult} projectName={projectName} onReset={reset} />
          </div>
        )}
      </div>
    </div>
  )
}
