// ─── TakeoffWorkspace ─────────────────────────────────────────────────────────
// Enterprise-style DXF/PDF takeoff workspace. Replaces the old 6-step wizard.
// Layout: Left = live DXF/PDF viewer, Right = recognition + takeoff + pricing.
// Cable estimation: MST-based for PDF, fallback multiplier for DXF.

import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
const DxfViewerCanvas = lazy(() => import('./DxfViewer/DxfViewerCanvas.jsx'))
const PdfViewerPanel = lazy(() => import('./PdfViewer/index.jsx'))
import { parseDxfFile, parseDxfText } from '../dxfParser.js'
import { runPdfTakeoff } from '../pdfTakeoff.js'
import { loadAssemblies, loadWorkItems, loadMaterials, saveQuote, generateQuoteId } from '../data/store.js'
import { calcProductivityFactor, WALL_FACTORS } from '../data/workItemsDb.js'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgHover: '#17171A',
  border: '#1E1E22', borderLight: '#2A2A30',
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.12)',
  yellow: '#FFD166', yellowDim: 'rgba(255,209,102,0.15)',
  red: '#FF6B6B', redDim: 'rgba(255,107,107,0.12)',
  blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

// ─── Block recognition rules ──────────────────────────────────────────────────
const BLOCK_ASM_RULES = [
  { patterns: ['LIGHT','LAMP','VILÁG','VILAG','LÁMPA','LAMPA','LED','SPOT','DOWNLIGHT','CEILING','MENNYEZET'], asmId: 'ASM-003', icon: '💡', label: 'Lámpatest' },
  { patterns: ['SWITCH','KAPCS','KAPCSOL','DIMMER','TOGGLE','NYOMÓ','NYOMO'], asmId: 'ASM-002', icon: '🔘', label: 'Kapcsoló' },
  { patterns: ['SOCKET','DUGALJ','ALJZAT','OUTLET','PLUG','CSATLAKOZ','RECEPT','ERŐÁTVITELI','EROATVITELI'], asmId: 'ASM-001', icon: '🔌', label: 'Dugalj' },
  { patterns: ['PANEL','DB_PANEL','ELOSZTO','ELOSZTÓ','MDB','SZEKRÉNY','SZEKRENY','DISTRIBUTION','BOARD','TABLOU'], asmId: 'ASM-018', icon: '⚡', label: 'Elosztó' },
  { patterns: ['SMOKE','FÜST','FUST','DETECTOR','ÉRZÉKEL','ERZEKEL','ALARM'], asmId: null, icon: '🔔', label: 'Érzékelő' },
]

// Assembly overlay colors (for SVG dots on DXF)
const ASM_COLORS = {
  'ASM-001': '#4CC9F0',   // socket → blue
  'ASM-002': '#FFD166',   // switch → yellow
  'ASM-003': '#00E5A0',   // lamp → green
  'ASM-018': '#FF6B6B',   // panel → red
  null: '#9CA3AF',         // unknown → gray
}

function recognizeBlock(blockName) {
  const up = (blockName || '').toUpperCase().replace(/[_\-\.]/g, ' ')
  for (const rule of BLOCK_ASM_RULES) {
    for (const pattern of rule.patterns) {
      if (up === pattern) return { asmId: rule.asmId, confidence: 1.0, matchType: 'exact', rule }
    }
  }
  for (const rule of BLOCK_ASM_RULES) {
    for (const pattern of rule.patterns) {
      if (up.includes(pattern)) {
        const specificity = Math.min(pattern.length / Math.max(up.replace(/ /g,'').length, 1), 1)
        const confidence = 0.60 + specificity * 0.35
        return { asmId: rule.asmId, confidence, matchType: 'partial', rule }
      }
    }
  }
  return { asmId: null, confidence: 0, matchType: 'unknown', rule: null }
}

// ─── Pricing computation ──────────────────────────────────────────────────────
function computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode }) {
  const ctxMultiplier = calcProductivityFactor(context)  // height + access + project_type
  // difficulty_mode: 'normal' → p50, 'difficult' → avg(p50,p90), 'very_difficult' → p90
  const mode = difficultyMode || 'normal'

  let materialCost = 0, laborHours = 0
  const lines = []

  for (const row of takeoffRows) {
    const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
    if (!asm) continue

    // Build per-wall-type splits: [[wallKey, qty], ...]
    // row.wallSplits = { drywall: N, ytong: N, brick: N, concrete: N } when user has split the qty
    // Fall back to single wallType (or brick) when no splits set
    const splits = row.wallSplits
      ? Object.entries(row.wallSplits).filter(([, n]) => n > 0)
      : [[row.wallType || 'brick', row.qty]]

    for (const [wallKey, splitQty] of splits) {
      if (splitQty <= 0) continue
      const wallFactor = WALL_FACTORS[wallKey] ?? 1.0

      for (const comp of (asm.components || [])) {
        const compQty = comp.qty * splitQty
        if (comp.itemType === 'workitem') {
          const wi = workItems.find(w => w.code === comp.itemCode) || workItems.find(w => w.name === comp.name)
          // Select norm time based on difficulty mode
          const baseNorm = wi
            ? (mode === 'very_difficult' ? wi.p90
              : mode === 'difficult' ? (wi.p50 + wi.p90) / 2
              : wi.p50)
            : 0
          const normMin = baseNorm * ctxMultiplier * wallFactor
          const hours = (normMin * compQty) / 60
          laborHours += hours
          lines.push({ name: comp.name, qty: compQty, unit: comp.unit, hours, materialCost: 0, type: 'labor' })
        } else {
          const mat = materials.find(m => m.code === comp.itemCode) || materials.find(m => m.name === comp.name)
          const unitPrice = mat ? mat.price * (1 - (mat.discount || 0) / 100) : 0
          const cost = unitPrice * compQty
          materialCost += cost
          lines.push({ name: comp.name, qty: compQty, unit: comp.unit, hours: 0, materialCost: cost, type: 'material' })
        }
      }
    }
  }

  // Cable estimate integration
  if (cableEstimate && cableEstimate.cable_total_m > 0) {
    const cableTypes = cableEstimate.cable_by_type || {}
    const cableData = [
      { code: 'MAT-020', fallback: 'NYM-J 3×1.5', m: cableTypes.light_m || 0 },
      { code: 'MAT-021', fallback: 'NYM-J 3×2.5', m: cableTypes.socket_m || 0 },
      { code: 'MAT-021', fallback: 'NYM-J 3×2.5', m: cableTypes.switch_m || 0 },
      { code: 'MAT-022', fallback: 'NYM-J 5×2.5', m: cableTypes.other_m || 0 },
    ]
    for (const c of cableData) {
      if (c.m <= 0) continue
      const mat = materials.find(m => m.code === c.code) || materials.find(m => m.name?.includes(c.fallback))
      const unitPrice = mat ? mat.price * (1 - (mat.discount || 0) / 100) : 0
      const cost = unitPrice * c.m
      materialCost += cost
      lines.push({ name: c.fallback, qty: Math.round(c.m), unit: 'm', hours: 0, materialCost: cost, type: 'cable' })
    }
    // Cable labor (apply context multiplier for consistency with assembly labor)
    const cableNormMin = 3 // min/m average
    const cableHours = (cableEstimate.cable_total_m * cableNormMin * ctxMultiplier) / 60
    laborHours += cableHours
  }

  const laborCost = laborHours * hourlyRate
  const subtotal = materialCost + laborCost
  const markupAmount = subtotal * markup
  const total = subtotal + markupAmount

  return { materialCost, laborCost, laborHours, subtotal, markup: markupAmount, total, lines }
}

// ─── SVG Overlay for block positions ─────────────────────────────────────────
function DxfBlockOverlay({ inserts, asmOverrides, recognizedItems, highlightBlock, onBlockClick, canvasRef }) {
  const svgRef = useRef(null)
  const [screenPositions, setScreenPositions] = useState([])

  const reproject = useCallback(() => {
    if (!canvasRef?.current || !inserts?.length || !svgRef.current) return
    const projected = inserts.map(ins => {
      const screen = canvasRef.current.sceneToScreen(ins.x, ins.y)
      return screen ? { ...ins, sx: screen.x, sy: screen.y } : null
    }).filter(Boolean)
    setScreenPositions(projected)
  }, [inserts, canvasRef])

  useEffect(() => {
    const viewer = canvasRef?.current?.getViewer?.()
    if (!viewer) return
    // Re-project on camera changes
    const unsub = canvasRef.current.subscribe?.('viewChanged', reproject)
    reproject()
    return () => { try { unsub?.() } catch {} }
  }, [reproject, canvasRef])

  // Also re-project when inserts change
  useEffect(() => { reproject() }, [inserts, reproject])

  if (!screenPositions.length) return null

  // Build a map from blockName → asmId
  const nameToAsm = {}
  for (const item of recognizedItems) {
    nameToAsm[item.blockName] = asmOverrides[item.blockName] ?? item.asmId
  }

  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}
      width="100%" height="100%"
    >
      {screenPositions.map((ins, i) => {
        const asmId = nameToAsm[ins.name] ?? null
        const color = ASM_COLORS[asmId] || ASM_COLORS[null]
        const isHighlighted = highlightBlock === ins.name
        const r = isHighlighted ? 9 : 6
        return (
          <g key={i} style={{ pointerEvents: 'auto', cursor: 'pointer' }}
             onClick={() => onBlockClick(ins.name)}>
            <circle cx={ins.sx} cy={ins.sy} r={r + 3} fill="transparent" />
            <circle
              cx={ins.sx} cy={ins.sy} r={r}
              fill={color} fillOpacity={isHighlighted ? 0.9 : 0.65}
              stroke={isHighlighted ? '#fff' : color}
              strokeWidth={isHighlighted ? 2 : 1}
            />
          </g>
        )
      })}
    </svg>
  )
}

// ─── File drop zone ───────────────────────────────────────────────────────────
function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  const handleChange = (e) => { if (e.target.files[0]) onFile(e.target.files[0]) }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: `2px dashed ${dragging ? C.accent : C.border}`,
        borderRadius: 16, background: dragging ? C.accentDim : C.bgCard,
        cursor: 'pointer', transition: 'all 0.2s', padding: 48, gap: 16,
      }}
    >
      {/* Animated upload SVG */}
      <div style={{ width: 160, height: 160, flexShrink: 0 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
          <style>{`
            .dz-grid-circle { stroke: rgba(255,255,255,0.18); stroke-width: 1; opacity: 0.4; fill: none; }
            .dz-ring-bg { stroke: rgba(255,255,255,0.18); stroke-width: 3; fill: none; stroke-dasharray: 4 8; }
            .dz-ring-progress {
              stroke: #21F3A3; stroke-width: 4; fill: none; stroke-linecap: round;
              stroke-dasharray: 350; filter: url(#dz-glow-ring);
              animation: dz-spin-load 3s ease-in-out infinite;
              transform-origin: 256px 224px;
            }
            .dz-upload-arrow {
              stroke: #17C7FF; stroke-width: 4; fill: none; stroke-linecap: round; stroke-linejoin: round;
              animation: dz-float 3s ease-in-out infinite;
            }
            .dz-data-line { stroke: rgba(255,255,255,0.18); stroke-width: 2; fill: none; }
            .dz-data-pulse {
              stroke: #21F3A3; stroke-width: 2; fill: none; stroke-linecap: round;
              stroke-dasharray: 15 50; animation: dz-up-flow 2s linear infinite;
            }
            @keyframes dz-spin-load {
              0% { stroke-dashoffset: 350; transform: rotate(-90deg); }
              60% { stroke-dashoffset: 0; transform: rotate(270deg); }
              100% { stroke-dashoffset: 350; transform: rotate(270deg); }
            }
            @keyframes dz-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes dz-up-flow {
              0% { stroke-dashoffset: 65; }
              100% { stroke-dashoffset: 0; }
            }
          `}</style>
          <defs>
            <pattern id="dz-grid3" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M 64 0 L 0 0 0 64" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none" opacity="0.5"/>
            </pattern>
            <filter id="dz-glow-ring" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <rect width="512" height="512" fill="url(#dz-grid3)" />
          <circle cx="256" cy="224" r="180" className="dz-grid-circle" />
          <circle cx="256" cy="224" r="120" className="dz-grid-circle" />
          <path d="M 196 336 L 316 336 M 226 352 L 286 352" stroke="#17C7FF" strokeWidth="3" strokeLinecap="round" />
          <circle cx="256" cy="224" r="72" className="dz-ring-bg" />
          <circle cx="256" cy="224" r="56" className="dz-ring-progress" />
          <g className="dz-upload-arrow">
            <path d="M 256 190 L 256 256" />
            <path d="M 230 216 L 256 190 L 282 216" />
          </g>
          <path d="M 256 368 L 256 512" className="dz-data-line" />
          <path d="M 256 368 L 256 512" className="dz-data-pulse" />
          <path d="M 226 368 L 226 512" className="dz-data-line" opacity="0.6"/>
          <path d="M 226 368 L 226 512" className="dz-data-pulse" style={{ animationDelay: '-0.5s' }}/>
          <path d="M 286 368 L 286 512" className="dz-data-line" opacity="0.6"/>
          <path d="M 286 368 L 286 512" className="dz-data-pulse" style={{ animationDelay: '-1s' }}/>
        </svg>
      </div>
      {/* Title with gradient matching SVG accent colours */}
      <div style={{
        fontFamily: 'Syne', fontWeight: 700, fontSize: 20,
        background: 'linear-gradient(90deg, #21F3A3 0%, #17C7FF 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        Húzd ide a tervrajzot
      </div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#17C7FF', opacity: 0.7, letterSpacing: '0.04em' }}>
        DXF, DWG vagy PDF formátum
      </div>
      <div style={{
        marginTop: 8, padding: '10px 28px', borderRadius: 10,
        background: 'linear-gradient(90deg, rgba(33,243,163,0.12) 0%, rgba(23,199,255,0.12) 100%)',
        border: '1px solid rgba(33,243,163,0.35)',
        fontFamily: 'Syne', fontWeight: 700, fontSize: 14,
        color: '#21F3A3',
      }}>
        Fájl választása
      </div>
      <input ref={inputRef} type="file" accept=".dxf,.dwg,.pdf" style={{ display: 'none' }} onChange={handleChange} />
    </div>
  )
}

// ─── Recognition row ──────────────────────────────────────────────────────────
function RecognitionRow({ item, asmOverrides, assemblies, onAccept, onOverride, isHighlighted, onHover }) {
  const asmId = asmOverrides[item.blockName] !== undefined ? asmOverrides[item.blockName] : item.asmId
  const asm = assemblies.find(a => a.id === asmId)
  const rule = BLOCK_ASM_RULES.find(r => r.asmId === asmId)

  const confColor = item.confidence >= 0.8 ? C.accent : item.confidence >= 0.5 ? C.yellow : C.red
  const confPct = Math.round(item.confidence * 100)

  return (
    <div
      onMouseEnter={() => onHover(item.blockName)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 4,
        background: isHighlighted ? 'rgba(0,229,160,0.08)' : C.bgCard,
        border: `1px solid ${isHighlighted ? C.accent : C.border}`,
        display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
      }}
    >
      {/* Confidence badge */}
      <div style={{
        width: 40, height: 20, borderRadius: 4, background: confColor + '22',
        border: `1px solid ${confColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Mono', fontSize: 10, color: confColor, fontWeight: 700, flexShrink: 0,
      }}>
        {confPct}%
      </div>

      {/* Block info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.blockName}
        </div>
        <div style={{ fontFamily: 'Syne', fontSize: 12, fontWeight: 600, color: C.text }}>
          {rule?.icon || '❓'} {asm?.name || (asmId ? asmId : 'Ismeretlen')}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, flexShrink: 0 }}>
        {item.qty} db
      </div>

      {/* Override select */}
      <select
        value={asmId || ''}
        onChange={e => onOverride(item.blockName, e.target.value || null)}
        style={{
          background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 6,
          color: C.textSub, fontSize: 11, padding: '3px 6px', fontFamily: 'DM Mono',
          cursor: 'pointer', maxWidth: 120,
        }}
      >
        <option value="">— Nincs —</option>
        {assemblies.filter(a => !a.variantOf).map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Takeoff row ──────────────────────────────────────────────────────────────
const WALL_OPTS = [
  { key: 'drywall',  label: 'GK',    color: '#00E5A0' },
  { key: 'ytong',    label: 'Ytong', color: '#FFD166' },
  { key: 'brick',    label: 'Tégla', color: '#FF9A3C' },
  { key: 'concrete', label: 'Beton', color: '#FF6B6B' },
]

function TakeoffRow({ asmId, qty, variantId, wallSplits, assemblies, onSplitChange, onVariantChange, unitCostByWall, isHighlighted }) {
  const asm = assemblies.find(a => a.id === asmId)
  const variants = assemblies.filter(a => a.variantOf === asmId)
  const rule = BLOCK_ASM_RULES.find(r => r.asmId === asmId)

  // If no splits set yet, treat all qty as brick
  const effectiveSplits = wallSplits || { brick: qty }
  const totalQty = Object.values(effectiveSplits).reduce((s, n) => s + n, 0)

  // Total price = Σ(splitQty × unitCostByWall[wallKey])
  const costs = unitCostByWall || {}
  const totalPrice = Object.entries(effectiveSplits).reduce(
    (s, [wk, n]) => s + n * (costs[wk] ?? costs.brick ?? 0), 0
  )

  const handleDelta = (wallKey, delta) => {
    // On first interaction, initialize full splits from current qty
    const base = wallSplits || { brick: qty }
    const current = base[wallKey] ?? 0
    const newVal = Math.max(0, current + delta)
    onSplitChange(asmId, { ...base, [wallKey]: newVal })
  }

  if (!asm) return null

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, marginBottom: 6,
      background: isHighlighted ? 'rgba(0,229,160,0.06)' : C.bgCard,
      border: `1px solid ${isHighlighted ? C.accent + '60' : C.border}`,
    }}>
      {/* ── Top row: icon / name / total qty / total price ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
          {rule?.icon || '📦'}
        </div>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asm.name}
        </div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, flexShrink: 0 }}>
          {totalQty} db
        </span>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent, minWidth: 72, textAlign: 'right', flexShrink: 0 }}>
          {Math.round(totalPrice).toLocaleString('hu-HU')} Ft
        </div>
      </div>

      {/* ── Per-wall-type split counters ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {WALL_OPTS.map(w => {
          const n = effectiveSplits[w.key] || 0
          const active = n > 0
          return (
            <div key={w.key} style={{
              display: 'flex', alignItems: 'center', gap: 1,
              padding: '2px 5px', borderRadius: 6,
              background: active ? w.color + '15' : 'transparent',
              border: `1px solid ${active ? w.color + '55' : C.border}`,
              transition: 'all 0.12s',
            }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: active ? w.color : C.muted, minWidth: 26, userSelect: 'none' }}>
                {w.label}
              </span>
              <button
                onClick={() => handleDelta(w.key, -1)}
                style={{ width: 17, height: 17, borderRadius: 3, background: 'transparent', border: 'none', color: active ? w.color : C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >−</button>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: active ? w.color : C.muted, minWidth: 16, textAlign: 'center', userSelect: 'none' }}>
                {n}
              </span>
              <button
                onClick={() => handleDelta(w.key, +1)}
                style={{ width: 17, height: 17, borderRadius: 3, background: 'transparent', border: 'none', color: active ? w.color : C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >+</button>
            </div>
          )
        })}
        {variants.length > 0 && (
          <select value={variantId || ''} onChange={e => onVariantChange(asmId, e.target.value || null)}
            style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 4, color: C.textSub, fontSize: 10, padding: '1px 4px', fontFamily: 'DM Mono', cursor: 'pointer' }}>
            <option value="">Standard</option>
            {variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

// ─── Main TakeoffWorkspace ────────────────────────────────────────────────────
export default function TakeoffWorkspace({ settings, materials: materialsProp, onSaved, onCancel }) {
  // ── File & parse state ────────────────────────────────────────────────────
  const [file, setFile] = useState(null)
  const [parsedDxf, setParsedDxf] = useState(null)
  const [parseProgress, setParseProgress] = useState(0)
  const [parsePending, setParsePending] = useState(false)

  // ── Recognition & takeoff state ───────────────────────────────────────────
  const [recognizedItems, setRecognizedItems] = useState([]) // [{blockName, qty, asmId, confidence}]
  const [asmOverrides, setAsmOverrides] = useState({})       // blockName → asmId
  const [variantOverrides, setVariantOverrides] = useState({}) // asmId → variantId
  const [qtyOverrides, setQtyOverrides] = useState({})       // asmId → qty
  // wallSplits[asmId] = { drywall: N, ytong: N, brick: N, concrete: N }
  // Sum of values = total qty for that assembly; individual values = qty per wall material
  const [wallSplits, setWallSplits] = useState({})

  // ── Project context ───────────────────────────────────────────────────────
  const [context, setContext] = useState(settings?.context_defaults || { access: 'empty', project_type: 'renovation', height: 'normal' })
  const [markup, setMarkup] = useState(settings?.labor?.markup_percent != null ? settings.labor.markup_percent / 100 : 0.15)
  const [hourlyRate, setHourlyRate] = useState(settings?.labor?.hourly_rate || 8500)
  const difficultyMode = settings?.labor?.difficulty_mode || 'normal'
  const [quoteName, setQuoteName] = useState('')
  const [clientName, setClientName] = useState('')

  // ── Unit override ────────────────────────────────────────────────────────
  const [unitOverride, setUnitOverride] = useState(null) // null = auto, or 'mm'|'cm'|'m'|'inches'|'feet'

  // ── Cable estimate (auto) ─────────────────────────────────────────────────
  const [cableEstimate, setCableEstimate] = useState(null)

  // ── Effective units (auto or manual override) ────────────────────────────
  const UNIT_FACTORS = { mm: 0.001, cm: 0.01, m: 1.0, inches: 0.0254, feet: 0.3048 }
  const effectiveParsedDxf = useMemo(() => {
    if (!parsedDxf || !parsedDxf.success) return parsedDxf
    if (!unitOverride) return parsedDxf // auto — use as-is
    const newFactor = UNIT_FACTORS[unitOverride]
    if (!newFactor) return parsedDxf
    // Recalculate lengths using length_raw * newFactor
    const newLengths = (parsedDxf.lengths || []).map(l => ({
      ...l,
      length: Math.round(l.length_raw * newFactor * 100000) / 100000,
    }))
    return {
      ...parsedDxf,
      lengths: newLengths,
      units: { ...parsedDxf.units, name: unitOverride + ' (override)', factor: newFactor, auto_detected: false },
    }
  }, [parsedDxf, unitOverride])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [highlightBlock, setHighlightBlock] = useState(null)
  const [rightTab, setRightTab] = useState('recognize') // 'recognize' | 'takeoff' | 'cable' | 'context'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  // ── Mobile responsive state ───────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [showDxfOnMobile, setShowDxfOnMobile] = useState(false)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── DWG conversion state ───────────────────────────────────────────────────
  const [dwgStatus, setDwgStatus] = useState(null)   // null | 'converting' | 'done' | 'failed'
  const [dwgError, setDwgError] = useState(null)     // actual error message for display
  const [viewerFile, setViewerFile] = useState(null)  // synthetic DXF File for DxfViewerCanvas

  // ── Data ──────────────────────────────────────────────────────────────────
  const canvasRef = useRef(null)
  const assemblies = useMemo(() => { try { return loadAssemblies() } catch { return [] } }, [])
  const workItems = useMemo(() => { try { return loadWorkItems() } catch { return [] } }, [])
  const materials = useMemo(() => materialsProp || loadMaterials(), [materialsProp])

  // ── Helper: File → base64 string ──────────────────────────────────────────
  const fileToBase64 = useCallback((file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  }), [])

  // ── Parse file on drop ────────────────────────────────────────────────────
  const handleFile = useCallback(async (f) => {
    setFile(f)
    setParsedDxf(null)
    setRecognizedItems([])
    setAsmOverrides({})
    setQtyOverrides({})
    setVariantOverrides({})
    setWallSplits({})
    setCableEstimate(null)
    setDwgStatus(null)
    setDwgError(null)
    setViewerFile(null)
    setUnitOverride(null)

    const ext = f.name.toLowerCase().split('.').pop()

    if (ext === 'pdf') {
      // ── PDF Takeoff Pipeline ─────────────────────────────────────────
      // Calls Vision AI + vector analysis → MST cable estimation → recognizedItems
      setParsePending(true)
      setParseProgress(0)
      try {
        const result = await runPdfTakeoff(f, pct => setParseProgress(pct))
        setParsedDxf(result.parsedDxf)
        setRecognizedItems(result.recognizedItems)
        setCableEstimate(result.cableEstimate)
        if (result.recognizedItems.length) setRightTab('recognize')
        if (result.warnings?.length) {
          console.warn('PDF takeoff warnings:', result.warnings)
        }
      } catch (err) {
        console.error('PDF takeoff error:', err)
        setParsedDxf({ success: false, error: err.message, _pdfError: true })
      } finally {
        setParsePending(false)
      }
      return
    }

    if (ext !== 'dxf' && ext !== 'dwg') {
      // Unknown format — skip
      setParsedDxf({ success: false, _noDxf: true })
      return
    }

    setParsePending(true)
    setParseProgress(0)

    try {
      let result

      if (ext === 'dwg') {
        // ── CloudConvert DWG → DXF: direct-upload architecture ─────────────
        // 1. Our server creates the CC job → returns upload URL (no file bytes to server)
        // 2. Browser uploads directly to CloudConvert S3 (no Vercel body/timeout limits)
        // 3. Browser polls our server for job status
        // 4. Browser downloads DXF directly from CloudConvert CDN
        setDwgStatus('converting')
        setDwgError(null)
        let dxfText = null
        try {
          const apiUrl = import.meta.env.VITE_API_URL || ''

          // Step 1: Create CloudConvert job (our server, tiny JSON request)
          const createRes = await fetch(`${apiUrl}/api/convert-dwg`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: f.name }),
          })
          const createJson = await createRes.json()
          if (!createRes.ok || !createJson.success) {
            throw new Error(createJson.error || `Job létrehozása sikertelen (${createRes.status})`)
          }
          const { jobId, uploadUrl, uploadParams } = createJson

          // Step 2: Upload file directly from browser to CloudConvert S3
          // (file never passes through our Vercel function — no size or timeout issue)
          const formData = new FormData()
          for (const [key, val] of Object.entries(uploadParams)) {
            formData.append(key, val)
          }
          formData.append('file', f)
          const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData })
          if (!uploadRes.ok) {
            throw new Error(`Fájl feltöltése CloudConvert-re sikertelen (HTTP ${uploadRes.status})`)
          }

          // Step 3: Poll via our server until conversion finishes (max 2 minutes)
          let downloadUrl = null
          const pollStart = Date.now()
          const MAX_POLL_MS = 120_000
          while (Date.now() - pollStart < MAX_POLL_MS) {
            await new Promise(r => setTimeout(r, 3000))
            const pollRes = await fetch(`${apiUrl}/api/convert-dwg`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId }),
            })
            const pollJson = await pollRes.json()
            if (!pollRes.ok || !pollJson.success) {
              throw new Error(pollJson.error || 'Státusz lekérdezése sikertelen')
            }
            if (pollJson.status === 'finished') { downloadUrl = pollJson.downloadUrl; break }
            if (pollJson.status === 'error') throw new Error(pollJson.error || 'CloudConvert konverzió hiba')
          }
          if (!downloadUrl) throw new Error('CloudConvert időtúllépés (120 mp). Próbáld újra.')

          // Step 4: Download converted DXF directly from CloudConvert CDN
          const dxfRes = await fetch(downloadUrl)
          if (!dxfRes.ok) throw new Error(`DXF letöltése sikertelen (HTTP ${dxfRes.status})`)
          dxfText = await dxfRes.text()

        } catch (convErr) {
          console.warn('DWG → DXF conversion failed:', convErr)
          setDwgStatus('failed')
          setDwgError(convErr.message)
          setParsedDxf({ success: false, _dwgFailed: true })
          return
        }

        setDwgStatus('done')
        // Create synthetic DXF file for the viewer and parse for recognition
        const syntheticFile = new File([dxfText], f.name.replace(/\.dwg$/i, '.dxf'), { type: 'text/plain' })
        setViewerFile(syntheticFile)
        result = parseDxfText(dxfText)

      } else {
        // ── Native DXF parse ───────────────────────────────────────────────
        setViewerFile(f)
        result = await parseDxfFile(f, pct => setParseProgress(pct))
      }

      setParsedDxf(result)

      // Run recognition on all unique block types
      const blockMap = {}
      for (const b of (result.blocks || [])) {
        if (!blockMap[b.name]) blockMap[b.name] = 0
        blockMap[b.name] += b.count
      }
      const items = Object.entries(blockMap).map(([blockName, qty]) => {
        const rec = recognizeBlock(blockName)
        return { blockName, qty, ...rec }
      }).sort((a, b) => b.confidence - a.confidence || b.qty - a.qty)

      setRecognizedItems(items)
      if (items.length) setRightTab('recognize')
    } catch (err) {
      console.error('Parse error:', err)
      setParsedDxf({ success: false, error: err.message })
    } finally {
      setParsePending(false)
    }
  }, [fileToBase64])

  // ── Derived: takeoff rows (grouped by assembly) ───────────────────────────
  const takeoffRows = useMemo(() => {
    const rowMap = {}
    for (const item of recognizedItems) {
      const asmId = asmOverrides[item.blockName] !== undefined ? asmOverrides[item.blockName] : item.asmId
      if (!asmId) continue
      const splits = wallSplits[asmId] || null
      // If splits exist, derive qty from their sum; otherwise use manual override or recognized count
      const qty = splits
        ? Object.values(splits).reduce((s, n) => s + n, 0)
        : (qtyOverrides[asmId] !== undefined ? qtyOverrides[asmId] : (rowMap[asmId]?.qty || 0) + item.qty)
      rowMap[asmId] = { asmId, qty, variantId: variantOverrides[asmId] || null, wallSplits: splits }
    }
    return Object.values(rowMap)
  }, [recognizedItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits])

  // ── Auto-compute cable estimate for DXF when takeoff changes ────────────
  // PDF pipeline sets cableEstimate directly (MST-based), so skip if already set by PDF.
  useEffect(() => {
    if (!takeoffRows.length) {
      // Only clear if not already set by PDF pipeline
      if (cableEstimate?._source !== 'pdf_takeoff') setCableEstimate(null)
      return
    }
    // Don't overwrite PDF-provided cable estimate
    if (cableEstimate?._source === 'pdf_takeoff') return

    // DXF fallback: simple per-device multipliers
    const lightQty = takeoffRows.filter(r => r.asmId === 'ASM-003').reduce((s, r) => s + r.qty, 0)
    const socketQty = takeoffRows.filter(r => r.asmId === 'ASM-001').reduce((s, r) => s + r.qty, 0)
    const switchQty = takeoffRows.filter(r => r.asmId === 'ASM-002').reduce((s, r) => s + r.qty, 0)
    const total = lightQty + socketQty + switchQty

    if (!total) { setCableEstimate(null); return }

    const lightM = lightQty * 8
    const socketM = socketQty * 6
    const switchM = switchQty * 4

    setCableEstimate({
      cable_total_m: lightM + socketM + switchM,
      cable_by_type: { light_m: lightM, socket_m: socketM, switch_m: switchM, other_m: 0 },
      method: 'Automatikus becslés (eszközszám alapján)',
      confidence: 0.6,
    })
  }, [takeoffRows])

  // ── Derived: pricing ──────────────────────────────────────────────────────
  const pricing = useMemo(() => {
    if (!takeoffRows.length) return null
    return computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode })
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode])

  // ── Per-assembly unit cost ────────────────────────────────────────────────
  // Compute unit cost for each assembly × each wall type (for per-split pricing display in TakeoffRow)
  const unitCostByAsmByWall = useMemo(() => {
    const map = {}
    for (const row of takeoffRows) {
      map[row.asmId] = {}
      for (const wallKey of Object.keys(WALL_FACTORS)) {
        const single = computePricing({
          takeoffRows: [{ asmId: row.asmId, qty: 1, variantId: row.variantId, wallSplits: null, wallType: wallKey }],
          assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate: null, difficultyMode,
        })
        map[row.asmId][wallKey] = single.total
      }
    }
    return map
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, difficultyMode])

  // ── Accept all high-confidence ────────────────────────────────────────────
  const acceptAllHighConf = () => {
    const newOverrides = { ...asmOverrides }
    for (const item of recognizedItems) {
      if (item.confidence >= 0.8 && item.asmId && newOverrides[item.blockName] === undefined) {
        // Already accepted by default — nothing to do; just transition to takeoff
      }
    }
    setRightTab('takeoff')
  }

  // ── Save quote ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!pricing || !takeoffRows.length) return
    setSaving(true); setSaveError(null)
    try {
      // Map computed lines to items with unitPrice + hours for QuoteView
      const items = (pricing.lines || []).map(line => ({
        name:        line.name,
        qty:         line.qty,
        unit:        line.unit,
        type:        line.type,
        unitPrice:   line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
        hours:       line.hours || 0,
        materialCost: line.materialCost || 0,
      }))

      // Build per-assembly summary for PDF Összesített / Részletes views
      const assemblySummary = takeoffRows.map(row => {
        const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
        const rowPricing = computePricing({
          takeoffRows: [row],
          assemblies, workItems, materials, context, markup, hourlyRate,
          cableEstimate: null, difficultyMode,
        })
        return {
          id:            row.asmId,
          name:          asm?.name || row.asmId,
          category:      asm?.category || '',
          qty:           row.qty,
          wallSplits:    row.wallSplits || null,
          totalPrice:    Math.round(rowPricing.total),
          totalMaterials: Math.round(rowPricing.materialCost),
          totalLabor:    Math.round(rowPricing.laborCost),
          totalHours:    rowPricing.laborHours,
        }
      })

      const displayName = quoteName || `Ajánlat ${new Date().toLocaleDateString('hu-HU')}`
      const quote = {
        id:           generateQuoteId(),
        projectName:  displayName,   // QuoteView (App.jsx) reads projectName
        project_name: displayName,   // Quotes.jsx list reads project_name
        name:         displayName,   // compat alias
        clientName,
        client_name:  clientName,    // Quotes.jsx list reads client_name
        createdAt:    new Date().toISOString(),
        created_at:   new Date().toISOString(),  // Quotes.jsx list reads created_at
        status:      'draft',
        // Top-level fields QuoteView reads directly
        gross:          Math.round(pricing.total),
        totalMaterials: Math.round(pricing.materialCost),
        totalLabor:     Math.round(pricing.laborCost),
        totalHours:     pricing.laborHours,
        // Summary for Quotes list view (q.summary?.grandTotal)
        summary: {
          grandTotal:     Math.round(pricing.total),
          totalWorkHours: pricing.laborHours,
        },
        pricingData: { hourlyRate, markup_pct: markup },
        items,
        assemblySummary,   // per-assembly breakdown for PDF
        context,
        cableEstimate,
        source:   'takeoff-workspace',
        fileName: file?.name,
      }
      saveQuote(quote)
      onSaved?.(quote)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const highConf = recognizedItems.filter(i => i.confidence >= 0.8)
  const midConf  = recognizedItems.filter(i => i.confidence >= 0.5 && i.confidence < 0.8)
  const lowConf  = recognizedItems.filter(i => i.confidence < 0.5)
  const totalItems = recognizedItems.reduce((s, i) => s + i.qty, 0)

  // ── Render: upload screen ─────────────────────────────────────────────────
  if (!file) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 20, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: C.text }}>Új takeoff workspace</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, marginTop: 2 }}>Enterprise szintű tervrajz feldolgozás</div>
          </div>
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, background: C.bgCard, border: `1px solid ${C.border}`, color: C.textSub, cursor: 'pointer', fontFamily: 'Syne', fontSize: 13 }}>
            Mégse
          </button>
        </div>
        <DropZone onFile={handleFile} />
      </div>
    )
  }

  // ── Render: parsing / DWG converting ─────────────────────────────────────
  if (parsePending) {
    const isDwgConverting = dwgStatus === 'converting'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
        {isDwgConverting ? (
          <>
            <div style={{ fontSize: 32 }}>🔄</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 14, color: C.textSub }}>DWG → DXF konverzió (CloudConvert)...</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>Ez néhány másodpercet vesz igénybe</div>
            <div style={{ width: 240, height: 3, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '40%', background: C.accent, borderRadius: 2, animation: 'slideProgress 1.2s ease-in-out infinite' }} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'DM Mono', fontSize: 14, color: C.textSub }}>Tervrajz feldolgozása...</div>
            <div style={{ width: 300, height: 4, background: C.border, borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${parseProgress}%`, background: C.accent, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>{parseProgress}%</div>
          </>
        )}
      </div>
    )
  }

  // isDxf = native DXF file, OR DWG that was successfully converted to DXF
  const isDxf = file.name.toLowerCase().endsWith('.dxf') || dwgStatus === 'done'
  const isPdf = file.name.toLowerCase().endsWith('.pdf')

  // ── Render: main workspace ────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`@keyframes slideProgress { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }`}</style>

      {/* ── Sticky pricing bar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0, padding: isMobile ? '10px 14px' : '12px 20px',
        background: C.bgCard, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        zIndex: 20, flexWrap: 'wrap', rowGap: 8,
      }}>
        {/* File name */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📐 {file.name}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
            {totalItems} elem · {takeoffRows.length} assembly · {cableEstimate ? `~${Math.round(cableEstimate.cable_total_m)} m kábel` : 'kábel: —'}
          </div>
        </div>

        {/* Mobile: DXF viewer toggle button */}
        {isMobile && isDxf && (
          <button
            onClick={() => setShowDxfOnMobile(p => !p)}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              background: showDxfOnMobile ? C.accentDim : C.bgHover,
              border: `1px solid ${showDxfOnMobile ? C.accent : C.border}`,
              color: showDxfOnMobile ? C.accent : C.textSub,
              fontFamily: 'Syne', fontWeight: 700, fontSize: 11, flexShrink: 0,
            }}
          >
            {showDxfOnMobile ? '📋 Takeoff' : '📐 Terv'}
          </button>
        )}

        {/* Pricing summary */}
        {pricing ? (
          <>
            <PricingPill label="Anyag" value={pricing.materialCost} color={C.blue} />
            <div style={{ width: 1, height: 32, background: C.border, margin: '0 16px' }} />
            <PricingPill label="Munka" value={pricing.laborCost} color={C.yellow} />
            <div style={{ width: 1, height: 32, background: C.border, margin: '0 16px' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Összesen</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: C.accent }}>
                {Math.round(pricing.total).toLocaleString('hu-HU')} Ft
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                marginLeft: 20, padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontFamily: 'Syne', fontWeight: 800, fontSize: 14,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '...' : '📄 Ajánlat mentése'}
            </button>
          </>
        ) : (
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>
            Rendelj assembly-ket az elemekhez az árazáshoz
          </div>
        )}

        <button
          onClick={onCancel}
          style={{ marginLeft: 12, padding: '8px 14px', borderRadius: 8, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer', fontFamily: 'Syne', fontSize: 12 }}
        >
          ✕
        </button>
      </div>

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: DXF Viewer ──────────────────────────────────────────────── */}
        <div style={{ flex: isMobile ? '0 0 100%' : '0 0 58%', position: 'relative', background: '#050507', borderRight: `1px solid ${C.border}`, display: (isMobile && !showDxfOnMobile) ? 'none' : undefined }}>
          {isDxf && viewerFile && (
            <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#050507' }} />}>
              <DxfViewerCanvas
                ref={canvasRef}
                file={viewerFile}
                clearColor="#050507"
                style={{ width: '100%', height: '100%' }}
              />
            </Suspense>
          )}

          {/* SVG overlay with block position dots */}
          {isDxf && effectiveParsedDxf?.inserts?.length > 0 && (
            <DxfBlockOverlay
              inserts={effectiveParsedDxf.inserts}
              asmOverrides={asmOverrides}
              recognizedItems={recognizedItems}
              highlightBlock={highlightBlock}
              onBlockClick={name => setHighlightBlock(prev => prev === name ? null : name)}
              canvasRef={canvasRef}
            />
          )}

          {/* No DXF viewer fallback — PDF viewer or failed DWG conversion */}
          {!isDxf && (
            dwgStatus === 'failed' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32 }}>
                <>
                  <div style={{ fontSize: 40 }}>⚠️</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.yellow, textAlign: 'center' }}>
                    DWG konverzió sikertelen
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, textAlign: 'center', maxWidth: 360, lineHeight: 1.7 }}>
                    {dwgError
                      ? <span style={{ color: '#FF9090' }}>{dwgError}</span>
                      : <>A CloudConvert API nem tudta konvertálni a fájlt.</>
                    }<br />
                    Exportáld DXF formátumban, majd töltsd fel újra:
                  </div>
                  <div style={{
                    background: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 10,
                    padding: '16px 20px', maxWidth: 360, width: '100%',
                  }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, lineHeight: 2 }}>
                      <div><span style={{ color: C.accent }}>AutoCAD:</span> File → Export → DXF</div>
                      <div><span style={{ color: C.accent }}>LibreCAD:</span> File → Export as → .dxf</div>
                      <div><span style={{ color: C.accent }}>FreeCAD:</span> File → Export → .dxf</div>
                      <div><span style={{ color: C.accent }}>BricsCAD:</span> Save As → .dxf (R2010)</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                    Ajánlott DXF verzió: AutoCAD 2010 (R18) vagy újabb
                  </div>
                </>
              </div>
            ) : isPdf ? (
              <Suspense fallback={<div style={{ width: '100%', height: '100%', background: C.bg }} />}>
                <PdfViewerPanel
                  file={file}
                  style={{ height: '100%', border: 'none', borderRadius: 0 }}
                />
              </Suspense>
            ) : null
          )}

          {/* Dot legend bottom-left */}
          {parsedDxf?.inserts?.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12, background: 'rgba(9,9,11,0.85)',
              border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px',
              display: 'flex', gap: 10, zIndex: 11, backdropFilter: 'blur(8px)',
            }}>
              {BLOCK_ASM_RULES.filter(r => r.asmId).map(r => (
                <div key={r.asmId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: ASM_COLORS[r.asmId] }} />
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>{r.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Takeoff Panel ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: (isMobile && showDxfOnMobile) ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bgCard, flexShrink: 0 }}>
            {[
              { id: 'recognize', label: '🔍 Felism.', badge: recognizedItems.length },
              { id: 'takeoff',   label: '📋 Takeoff',  badge: takeoffRows.length },
              { id: 'cable',     label: '🔌 Kábel' },
              { id: 'context',   label: '⚙️ Kontextus' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id)}
                style={{
                  flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                  background: 'transparent', borderBottom: `2px solid ${rightTab === tab.id ? C.accent : 'transparent'}`,
                  color: rightTab === tab.id ? C.accent : C.muted,
                  fontFamily: 'Syne', fontWeight: 700, fontSize: 11, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 4, transition: 'color 0.15s',
                }}
              >
                {tab.label}
                {tab.badge != null && (
                  <span style={{ background: rightTab === tab.id ? C.accentDim : 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '1px 5px', fontSize: 10 }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

            {/* ── RECOGNITION TAB ────────────────────────────────────────── */}
            {rightTab === 'recognize' && (
              <div>
                {recognizedItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    {parsedDxf?._dwgFailed
                      ? 'DWG konverzió sikertelen. Exportáld DXF-ként és töltsd fel újra.'
                      : parsedDxf?._noDxf
                      ? 'PDF fájl nem tartalmaz block adatot. Adj hozzá elemeket manuálisan a Takeoff fülön.'
                      : 'Nem találtunk block-okat a DXF-ben.'}
                  </div>
                ) : (
                  <>
                    {/* Summary + bulk accept */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>
                          {highConf.length + midConf.length} / {recognizedItems.length} felismerve
                        </div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                          {highConf.length} biztos · {midConf.length} közepes · {lowConf.length} ismeretlen
                        </div>
                      </div>
                      <button
                        onClick={acceptAllHighConf}
                        style={{
                          padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                          background: C.accentDim, border: `1px solid ${C.accent}`,
                          color: C.accent, fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                        }}
                      >
                        ✓ Elfogad mindent → Takeoff
                      </button>
                    </div>

                    {/* High confidence group */}
                    {highConf.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
                          BIZTOS FELISMERÉS (≥80%)
                        </div>
                        {highConf.map(item => (
                          <RecognitionRow
                            key={item.blockName} item={item} asmOverrides={asmOverrides}
                            assemblies={assemblies}
                            onAccept={() => {}}
                            onOverride={(name, id) => setAsmOverrides(p => ({ ...p, [name]: id }))}
                            isHighlighted={highlightBlock === item.blockName}
                            onHover={setHighlightBlock}
                          />
                        ))}
                      </div>
                    )}

                    {/* Mid confidence */}
                    {midConf.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.yellow, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.yellow, display: 'inline-block' }} />
                          ELLENŐRIZD (50-80%)
                        </div>
                        {midConf.map(item => (
                          <RecognitionRow
                            key={item.blockName} item={item} asmOverrides={asmOverrides}
                            assemblies={assemblies}
                            onAccept={() => {}}
                            onOverride={(name, id) => setAsmOverrides(p => ({ ...p, [name]: id }))}
                            isHighlighted={highlightBlock === item.blockName}
                            onHover={setHighlightBlock}
                          />
                        ))}
                      </div>
                    )}

                    {/* Low confidence / unknown */}
                    {lowConf.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.red, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
                          ISMERETLEN ({lowConf.length} db)
                        </div>
                        {lowConf.map(item => (
                          <RecognitionRow
                            key={item.blockName} item={item} asmOverrides={asmOverrides}
                            assemblies={assemblies}
                            onAccept={() => {}}
                            onOverride={(name, id) => setAsmOverrides(p => ({ ...p, [name]: id }))}
                            isHighlighted={highlightBlock === item.blockName}
                            onHover={setHighlightBlock}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── TAKEOFF TAB ─────────────────────────────────────────────── */}
            {rightTab === 'takeoff' && (
              <div>
                {takeoffRows.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Még nincs felismert elem. Menj a Felismerés fülre és rendelj assembly-ket a blokkokhoz.
                  </div>
                ) : (
                  <>
                    {takeoffRows.map(row => (
                      <TakeoffRow
                        key={row.asmId}
                        asmId={row.asmId}
                        qty={row.qty}
                        variantId={row.variantId}
                        wallSplits={row.wallSplits}
                        assemblies={assemblies}
                        isHighlighted={highlightBlock && recognizedItems.some(i => i.blockName === highlightBlock && (asmOverrides[i.blockName] ?? i.asmId) === row.asmId)}
                        onSplitChange={(id, newSplits) => setWallSplits(p => ({ ...p, [id]: newSplits }))}
                        onVariantChange={(id, vid) => setVariantOverrides(p => ({ ...p, [id]: vid }))}
                        unitCostByWall={unitCostByAsmByWall[row.asmId] || {}}
                      />
                    ))}

                    {/* Cable summary in takeoff */}
                    {cableEstimate && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(76,201,240,0.06)', border: `1px solid rgba(76,201,240,0.2)` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.blue }}>
                            🔌 Kábel (auto) — ~{Math.round(cableEstimate.cable_total_m)} m
                          </div>
                          <button onClick={() => setRightTab('cable')} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono' }}>
                            részletek →
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── CABLE TAB ────────────────────────────────────────────────── */}
            {rightTab === 'cable' && (
              <div>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>
                  🔌 Automatikus kábelbecslés
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 16 }}>
                  Az enterprise szoftverek nem kérnek külön jóváhagyást. A becslés valós időben frissül az eszközszám alapján.
                </div>

                {cableEstimate ? (
                  <>
                    {[
                      { key: 'light_m', label: 'Világítási kör (NYM-J 3×1.5)', icon: '💡', color: C.accent },
                      { key: 'socket_m', label: 'Dugalj kör (NYM-J 3×2.5)', icon: '🔌', color: C.blue },
                      { key: 'switch_m', label: 'Kapcsoló kör (NYM-J 3×2.5)', icon: '🔘', color: C.yellow },
                      { key: 'other_m', label: 'Egyéb (NYM-J 5×2.5)', icon: '⚡', color: C.textSub },
                    ].map(({ key, label, icon, color }) => {
                      const m = cableEstimate.cable_by_type?.[key] || 0
                      if (!m) return null
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.bgCard, borderRadius: 8, marginBottom: 6, border: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: 16 }}>{icon}</span>
                          <span style={{ flex: 1, fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>{label}</span>
                          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color }}>{Math.round(m)} m</span>
                        </div>
                      )
                    })}
                    <div style={{ marginTop: 12, padding: '12px 14px', background: C.accentDim, borderRadius: 8, border: `1px solid ${C.accent}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>Összesen</span>
                      <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.accent }}>{Math.round(cableEstimate.cable_total_m)} m</span>
                    </div>
                    <div style={{ marginTop: 8, fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                      Módszer: {cableEstimate.method} · Konfidencia: ~{Math.round((cableEstimate.confidence || 0.6) * 100)}%
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Adj hozzá assembly-ket a Takeoff fülön a kábelbecsléshez.
                  </div>
                )}
              </div>
            )}

            {/* ── CONTEXT TAB ─────────────────────────────────────────────── */}
            {rightTab === 'context' && (
              <div>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 16 }}>
                  ⚙️ Projekt körülmények
                </div>

                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 14, padding: '8px 10px', background: C.bgCard, borderRadius: 7, border: `1px solid ${C.border}` }}>
                  💡 A falanyag tételenként állítható a Takeoff fülön (GK / Ytong / Tégla / Beton). Az alábbi beállítások az egész projektre vonatkoznak.
                </div>

                {[
                  { key: 'access', label: 'Hozzáférhetőség', options: [['empty','Üres'],['occupied','Berendezett'],['restricted','Korl. hozzáférés']] },
                  { key: 'project_type', label: 'Projekt típus', options: [['new_build','Új építés'],['renovation','Felújítás'],['industrial','Ipari']] },
                  { key: 'height', label: 'Munkavégzési magasság', options: [['normal','Normál (≤2.5m)'],['ladder','Létra (2.5–4m)'],['scaffold','Állvány (4m+)']] },
                ].map(({ key, label, options }) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 6 }}>{label}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {options.map(([val, lbl]) => (
                        <button
                          key={val}
                          onClick={() => setContext(c => ({ ...c, [key]: val }))}
                          style={{
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            background: context[key] === val ? C.accentDim : C.bgCard,
                            border: `1px solid ${context[key] === val ? C.accent : C.border}`,
                            color: context[key] === val ? C.accent : C.textSub,
                            fontFamily: 'Syne', fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* ── Unit override ────────────────────────────────────── */}
                {parsedDxf?.units && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 6 }}>
                      Mértékegység {parsedDxf.units.name?.includes('guessed') ? '⚠️ (becsült)' : `(DXF: ${parsedDxf.units.name})`}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[
                        [null, 'Auto'],
                        ['mm', 'mm'],
                        ['cm', 'cm'],
                        ['m', 'm'],
                        ['inches', 'inch'],
                        ['feet', 'feet'],
                      ].map(([val, lbl]) => (
                        <button
                          key={val ?? 'auto'}
                          onClick={() => setUnitOverride(val)}
                          style={{
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            background: unitOverride === val ? C.yellowDim : C.bgCard,
                            border: `1px solid ${unitOverride === val ? C.yellow : C.border}`,
                            color: unitOverride === val ? C.yellow : C.textSub,
                            fontFamily: 'Syne', fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    {unitOverride && (
                      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow, marginTop: 4 }}>
                        Manuális override aktív — az összes hossz {unitOverride}-ben lesz értelmezve
                      </div>
                    )}
                  </div>
                )}

                <div style={{ height: 1, background: C.border, margin: '16px 0' }} />

                {/* Markup & hourly rate */}
                {[
                  { label: 'Óradíj (Ft)', value: hourlyRate, set: v => setHourlyRate(Math.max(0, parseInt(v) || 0)), unit: 'Ft/óra' },
                  { label: 'Haszonkulcs (%)', value: Math.round(markup * 100), set: v => setMarkup(Math.max(0, Math.min(99, parseInt(v) || 0)) / 100), unit: '%' },
                ].map(({ label, value, set, unit }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number" value={value} onChange={e => set(e.target.value)}
                        style={{ flex: 1, background: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontFamily: 'DM Mono', fontSize: 14 }}
                      />
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>{unit}</span>
                    </div>
                  </div>
                ))}

                <div style={{ height: 1, background: C.border, margin: '16px 0' }} />

                {/* Quote name & client */}
                {[
                  { label: 'Ajánlat neve', value: quoteName, set: setQuoteName, placeholder: `Ajánlat ${new Date().toLocaleDateString('hu-HU')}` },
                  { label: 'Ügyfél neve', value: clientName, set: setClientName, placeholder: 'Ügyfél neve...' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <input
                      type="text" value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                      style={{ width: '100%', background: C.bgCard, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontFamily: 'Syne', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}

                {saveError && (
                  <div style={{ background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 8, padding: '10px 14px', color: C.red, fontFamily: 'DM Mono', fontSize: 12, marginTop: 12 }}>
                    {saveError}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helper: Pricing pill ─────────────────────────────────────────────────────
function PricingPill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 80 }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color }}>
        {Math.round(value).toLocaleString('hu-HU')} Ft
      </div>
    </div>
  )
}
