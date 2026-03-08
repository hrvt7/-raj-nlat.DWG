// ─── TakeoffWorkspace ─────────────────────────────────────────────────────────
// DXF/PDF felmérési munkaterület.
// Elrendezés: Bal = tervrajz nézegető, Jobb = elemfelismerés + felmérés + kábelbecslés.
// Kábelbecslés: 1. mért DXF rétegek → 2. MST pozíciókból → 3. eszközszám alapján.

import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react'

// ── Lazy imports with retry: handles stale chunk hashes after Vercel deploys ──
// If the dynamic import fails (chunk 404), retry once and reload if still failing.
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      // First retry — browser may have stale HTML with old chunk hashes
      return importFn().catch((err) => {
        // If still failing, force a full page reload to fetch fresh HTML
        console.error('Chunk load failed after retry, reloading page:', err)
        window.location.reload()
        // Return never-resolving promise so React doesn't render an error
        return new Promise(() => {})
      })
    })
  )
}
const DxfViewerPanel = lazyRetry(() => import('./DxfViewer/index.jsx'))
const PdfViewerPanel = lazyRetry(() => import('./PdfViewer/index.jsx'))
import { parseDxfFile, parseDxfText } from '../dxfParser.js'
import { runPdfTakeoff, estimateCablesMST } from '../pdfTakeoff.js'
import { loadAssemblies, loadWorkItems, loadMaterials, saveQuote, generateQuoteId, loadSettings } from '../data/store.js'
import { savePlanAnnotations, getPlanAnnotations, updatePlanMeta, onAnnotationsChanged, getPlanMeta } from '../data/planStore.js'
import { getProject } from '../data/projectStore.js'
import { OUTPUT_MODE_INCLEXCL } from '../data/quoteDefaults.js'
import { WALL_FACTORS, calcProductivityFactor } from '../data/workItemsDb.js'
import { addUserOverride, ASSEMBLY_TYPES } from '../data/symbolDictionary.js'
import { computePricing } from '../utils/pricing.js'
import { normalizeCableEstimate, shouldOverwrite, isCrossContextMarkerConflict, CABLE_SOURCE } from '../utils/cableModel.js'
import { normalizeMarkers } from '../utils/markerModel.js'
import ConfidenceBadge from './ConfidenceBadge.jsx'
import { ApiErrorBanner } from '../hooks/useApiCall.jsx'

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

  // Phase 1: exact match — return immediately (perfect confidence)
  for (const rule of BLOCK_ASM_RULES) {
    for (const pattern of rule.patterns) {
      if (up === pattern) return { asmId: rule.asmId, confidence: 1.0, matchType: 'exact', rule }
    }
  }

  // Phase 2: partial match — collect ALL matches, return the BEST one
  let bestMatch = null
  for (const rule of BLOCK_ASM_RULES) {
    for (const pattern of rule.patterns) {
      if (up.includes(pattern)) {
        const normalizedLen = up.replace(/ /g, '').length
        const specificity = Math.min(pattern.length / Math.max(normalizedLen, 1), 1)
        const confidence = 0.60 + specificity * 0.35
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { asmId: rule.asmId, confidence, matchType: 'partial', rule }
        }
      }
    }
  }
  if (bestMatch) return bestMatch

  return { asmId: null, confidence: 0, matchType: 'unknown', rule: null }
}

// ─── DXF cable-layer detection ────────────────────────────────────────────────
// Priority 1: if DXF has cable route geometry (layers with cable keywords + lengths),
// use measured lengths directly.  Returns null if nothing suitable found.
const CABLE_GENERIC_KW = ['KABEL','CABLE','NYM','NYY','CYKY','WIRE','VEZETEK','VILLAMOS','ARAM']
const CABLE_TYPE_KW = {
  light:  ['VILAG','LIGHT','3X1','1X1','LAMPA','VIL_KAB','LAMP','VILAGIT'],
  socket: ['DUGALJ','SOCKET','3X2','1X2','DUG_KAB','KONNEKTOR','OUTLET'],
  switch: ['KAPCS','SWITCH','KAPCSOL','KAP_KAB'],
  other:  ['NYY','5X','FOGYASZT','PANEL_KAB'],
}
function detectDxfCableLengths(parsedDxf) {
  if (!parsedDxf?.lengths?.length) return null
  let total = 0
  const byType = { light: 0, socket: 0, switch: 0, other: 0 }
  let layerCount = 0
  for (const l of parsedDxf.lengths) {
    if (!l.length || l.length <= 0) continue
    const up = (l.layer || '').toUpperCase()
    if (!CABLE_GENERIC_KW.some(k => up.includes(k))) continue
    layerCount++
    total += l.length
    if      (CABLE_TYPE_KW.light.some(k  => up.includes(k))) byType.light  += l.length
    else if (CABLE_TYPE_KW.socket.some(k => up.includes(k))) byType.socket += l.length
    else if (CABLE_TYPE_KW.switch.some(k => up.includes(k))) byType.switch += l.length
    else if (CABLE_TYPE_KW.other.some(k  => up.includes(k))) byType.other  += l.length
    else byType.socket += l.length  // ismeretlen → dugalj (leggyakoribb)
  }
  if (!layerCount || total <= 0) return null
  const r = v => Math.round(v * 10) / 10
  return {
    cable_total_m: r(total),
    cable_total_m_p50: r(total),
    cable_total_m_p90: null,
    cable_by_type: { light_m: r(byType.light), socket_m: r(byType.socket), switch_m: r(byType.switch), other_m: r(byType.other) },
    method: `Mért kábelvonalak (${layerCount} réteg, ${Math.round(total)} m)`,
    confidence: 0.92,
    _source: 'dxf_layers',
  }
}

// computePricing is imported from '../utils/pricing.js' — shared with MergePlansView

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
function RecognitionRow({ item, asmOverrides, assemblies, onAccept, onOverride, onQtyChange, onDelete, isHighlighted, onHover }) {
  const [showDelete, setShowDelete] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [editVal, setEditVal] = React.useState(String(item.qty))
  const asmId = asmOverrides[item.blockName] !== undefined ? asmOverrides[item.blockName] : item.asmId
  const asm = assemblies.find(a => a.id === asmId)
  const rule = BLOCK_ASM_RULES.find(r => r.asmId === asmId)

  const confColor = item.confidence >= 0.8 ? C.accent : item.confidence >= 0.5 ? C.yellow : C.red
  const confPct = Math.round(item.confidence * 100)

  const handleQtyBlur = () => {
    setEditing(false)
    const v = parseInt(editVal, 10)
    if (!isNaN(v) && v > 0 && v !== item.qty) {
      onQtyChange?.(item.blockName, v)
    } else {
      setEditVal(String(item.qty))
    }
  }

  return (
    <div
      onMouseEnter={() => { onHover(item.blockName); setShowDelete(true) }}
      onMouseLeave={() => { onHover(null); setShowDelete(false) }}
      style={{
        padding: '10px 14px', borderRadius: 8, marginBottom: 4,
        background: isHighlighted ? 'rgba(0,229,160,0.08)' : C.bgCard,
        border: `1px solid ${isHighlighted ? C.accent : C.border}`,
        display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
        position: 'relative',
      }}
    >
      {/* Delete button — visible on hover */}
      {showDelete && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.blockName) }}
          title="Elem törlése"
          style={{
            position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
            background: C.red, border: `2px solid ${C.bgCard}`, color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0, zIndex: 2,
          }}
        >×</button>
      )}

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

      {/* Editable count */}
      {editing ? (
        <input
          autoFocus
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={handleQtyBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleQtyBlur(); if (e.key === 'Escape') { setEditing(false); setEditVal(String(item.qty)) } }}
          style={{
            width: 52, fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.accent,
            background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 6,
            padding: '2px 6px', textAlign: 'right', outline: 'none',
          }}
        />
      ) : (
        <div
          onClick={() => { setEditing(true); setEditVal(String(item.qty)) }}
          title="Kattints a darabszám módosításához"
          style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, flexShrink: 0,
            cursor: 'pointer', padding: '2px 6px', borderRadius: 6,
            border: `1px solid transparent`, transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.borderLight}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
        >
          {item.qty} db
        </div>
      )}

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
    const updated = { ...base, [wallKey]: newVal }

    // If adding to a non-default wall type and base was just initialized,
    // reduce brick to keep total = qty (move items between wall types, don't add new)
    if (!wallSplits && wallKey !== 'brick' && delta > 0) {
      updated.brick = Math.max(0, (updated.brick || 0) - delta)
    }
    onSplitChange(asmId, updated)
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
export default function TakeoffWorkspace({ settings, materials: materialsProp, onSaved, onCancel, initialData, initialFile, planId, focusTarget, onDirtyChange, onQuoteFromPlan }) {
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
  const [itemQtyOverrides, setItemQtyOverrides] = useState({}) // blockName → qty (per-item override)
  const [deletedItems, setDeletedItems] = useState(new Set())   // blockNames removed by user
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
  // ── Calc tab state (ported from EstimationPanel popup) ──────────────────
  const [markupType, setMarkupType] = useState(settings?.labor?.markup_type || 'markup') // 'markup' | 'margin'
  const [cablePricePerM, setCablePricePerM] = useState(settings?.labor?.cable_price_per_m || 800)
  const vatPercent = settings?.labor?.vat_percent || 27

  // ── Unit override ────────────────────────────────────────────────────────
  const [unitOverride, setUnitOverride] = useState(null) // null = auto, or 'mm'|'cm'|'m'|'inches'|'feet'

  // ── Cable estimate (auto) ─────────────────────────────────────────────────
  const [cableEstimate, setCableEstimate] = useState(null)

  // ── PDF manual markers (assembly-based counting from PdfViewer) ─────────
  const [pdfMarkers, setPdfMarkers] = useState([])
  const prevMarkerCountRef = useRef(0)
  useEffect(() => {
    const asmMarkers = pdfMarkers.filter(m => m.asmId || (m.category && m.category.startsWith('ASM-')))
    if (asmMarkers.length > 0 && prevMarkerCountRef.current === 0) {
      setRightTab('takeoff')
    }
    prevMarkerCountRef.current = asmMarkers.length
  }, [pdfMarkers])

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
  const [rightTab, setRightTab] = useState('takeoff') // 'takeoff' | 'cable' | 'calc' | 'context'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false) // per-plan save success strip
  // ── Mobile responsive state ───────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [showDxfOnMobile, setShowDxfOnMobile] = useState(false)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── Pre-fill from MergePlansView (DXF / PDF / Manual merge) ─────────────
  // When the user clicks "Ajánlat létrehozása" in MergePlansView, initialData
  // carries the counted assembly quantities.  We synthesise recognizedItems so
  // the normal takeoffRows pipeline picks them up, then jump to the Felmérés tab.
  useEffect(() => {
    if (!initialData) return

    const syntheticItems = []

    if (initialData.source === 'dxf_analysis' && initialData.countByAssemblyType) {
      for (const [asmType, count] of Object.entries(initialData.countByAssemblyType)) {
        const asmId = initialData.assignments?.[asmType]
        if (asmId && count > 0)
          syntheticItems.push({ blockName: `PREFILL_${asmType}`, qty: count, asmId, confidence: 1.0 })
      }
    } else if (initialData.source === 'pdf_recognition' && initialData.recognizedItems) {
      for (const item of initialData.recognizedItems) {
        if (item.asmId && item.total > 0)
          syntheticItems.push({ blockName: `PREFILL_${item._pdfType || item.label}`, qty: item.total, asmId: item.asmId, confidence: 1.0 })
      }
    } else if (initialData.countByCategory && initialData.assignments) {
      // ManualMergeTab
      for (const [cat, count] of Object.entries(initialData.countByCategory)) {
        const asmId = initialData.assignments?.[cat]
        if (asmId && count > 0)
          syntheticItems.push({ blockName: `PREFILL_${cat}`, qty: count, asmId, confidence: 1.0 })
      }
    }

    if (syntheticItems.length > 0) {
      setRecognizedItems(syntheticItems)
      setRightTab('takeoff')
    }
    if (initialData.planName) setQuoteName(initialData.planName)
  }, [initialData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-load file when passed as prop (e.g. from Felmérés page) ────────────
  useEffect(() => {
    if (initialFile && !file) handleFile(initialFile)
  }, [initialFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved annotations when opening a plan with a planId ───────────
  useEffect(() => {
    if (!planId || !file) return
    ;(async () => {
      const ann = await getPlanAnnotations(planId)
      if (ann && ann.markers && ann.markers.length > 0) {
        setPdfMarkers(normalizeMarkers(ann.markers))
        if (ann.wallSplits) setWallSplits(ann.wallSplits)
        if (ann.variantOverrides) setVariantOverrides(ann.variantOverrides)
        setRightTab('takeoff')
      }
    })()
  }, [planId, file]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Subscribe to external annotation changes (e.g. DetectionReviewPanel apply) ──
  useEffect(() => {
    if (!planId) return
    const unsub = onAnnotationsChanged(planId, ({ markers }) => {
      setPdfMarkers(normalizeMarkers(markers))
    })
    return unsub
  }, [planId])

  // ── Resizable split panel ─────────────────────────────────────────────────
  // panelRatio: left panel width as % of the container (clamp 25–80)
  const [panelRatio, setPanelRatio] = useState(58)
  const containerRef = useRef(null)
  const dragStateRef = useRef({ active: false, startX: 0, startRatio: 58 })

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    dragStateRef.current = { active: true, startX: e.clientX, startRatio: panelRatio }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelRatio])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragStateRef.current.active) return
      const containerW = containerRef.current?.offsetWidth || 1
      const dx = e.clientX - dragStateRef.current.startX
      const delta = (dx / containerW) * 100
      const newRatio = Math.min(80, Math.max(25, dragStateRef.current.startRatio + delta))
      setPanelRatio(newRatio)
    }
    const onUp = () => {
      if (!dragStateRef.current.active) return
      dragStateRef.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── DWG conversion state ───────────────────────────────────────────────────
  const [dwgStatus, setDwgStatus] = useState(null)   // null | 'converting' | 'done' | 'failed'
  const [dwgError, setDwgError] = useState(null)     // actual error message for display
  const [viewerFile, setViewerFile] = useState(null)  // synthetic DXF File for DxfViewerCanvas

  // ── PDF pipeline state ────────────────────────────────────────────────────
  const [pdfConfidence, setPdfConfidence] = useState(null)  // 0–1 overall confidence
  const [pdfSource, setPdfSource] = useState(null)           // 'vector' | 'vision' | 'mixed'
  const [pdfError, setPdfError] = useState(null)             // last PDF API error message
  const [lastPdfFile, setLastPdfFile] = useState(null)       // for retry

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
    setItemQtyOverrides({})
    setDeletedItems(new Set())
    setVariantOverrides({})
    setWallSplits({})
    setCableEstimate(null)
    setPdfMarkers([])
    setDwgStatus(null)
    setDwgError(null)
    setViewerFile(null)
    setUnitOverride(null)

    const ext = f.name.toLowerCase().split('.').pop()

    if (ext === 'pdf') {
      // ── PDF: skip auto-detection, go directly to manual takeoff ──────────
      // The auto-detection pipeline (runPdfTakeoff) is not stable enough for
      // production use — it produces misleading recognition results on most
      // architectural / electrical PDFs.  The engine is preserved but disabled.
      setPdfConfidence(null)
      setPdfSource(null)
      setPdfError(null)
      setLastPdfFile(f)
      setParsedDxf({ success: true, _noDxf: true })
      setRightTab('takeoff')
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

          // ── Helper: fetch with retry + exponential backoff ──────────────
          const MAX_RETRIES = 3
          const fetchWithRetry = async (url, opts, retries = MAX_RETRIES) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
              try {
                const res = await fetch(url, opts)
                if (res.ok || res.status < 500) return res  // only retry on 5xx
                if (attempt < retries) {
                  const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
                  console.warn(`DWG retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms (HTTP ${res.status})`)
                  await new Promise(r => setTimeout(r, delay))
                  continue
                }
                return res  // last attempt, return whatever we got
              } catch (netErr) {
                if (attempt < retries) {
                  const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
                  console.warn(`DWG retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms (${netErr.message})`)
                  await new Promise(r => setTimeout(r, delay))
                  continue
                }
                throw netErr
              }
            }
          }

          // Step 1: Create CloudConvert job (our server, tiny JSON request)
          const createRes = await fetchWithRetry(`${apiUrl}/api/convert-dwg`, {
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
          const uploadRes = await fetchWithRetry(uploadUrl, { method: 'POST', body: formData })
          if (!uploadRes.ok) {
            throw new Error(`Fájl feltöltése CloudConvert-re sikertelen (HTTP ${uploadRes.status})`)
          }

          // Step 3: Poll via our server until conversion finishes (max 2 minutes)
          let downloadUrl = null
          const pollStart = Date.now()
          const MAX_POLL_MS = 120_000
          while (Date.now() - pollStart < MAX_POLL_MS) {
            await new Promise(r => setTimeout(r, 3000))
            const pollRes = await fetchWithRetry(`${apiUrl}/api/convert-dwg`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId }),
            }, 2)
            const pollJson = await pollRes.json()
            if (!pollRes.ok || !pollJson.success) {
              throw new Error(pollJson.error || 'Státusz lekérdezése sikertelen')
            }
            if (pollJson.status === 'finished') { downloadUrl = pollJson.downloadUrl; break }
            if (pollJson.status === 'error') throw new Error(pollJson.error || 'CloudConvert konverzió hiba')
          }
          if (!downloadUrl) throw new Error('CloudConvert időtúllépés (120 mp). Próbáld újra.')

          // Step 4: Download converted DXF directly from CloudConvert CDN
          const dxfRes = await fetchWithRetry(downloadUrl, {}, 2)
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
      if (items.length) setRightTab('takeoff')
    } catch (err) {
      console.error('Parse error:', err)
      setParsedDxf({ success: false, error: err.message || String(err) })
    } finally {
      setParsePending(false)
    }
  }, [fileToBase64])

  // ── Effective items (filtered + overridden) ──────────────────────────────
  const effectiveItems = useMemo(() => {
    return recognizedItems
      .filter(i => !deletedItems.has(i.blockName))
      .map(i => itemQtyOverrides[i.blockName] != null
        ? { ...i, qty: itemQtyOverrides[i.blockName] }
        : i
      )
  }, [recognizedItems, deletedItems, itemQtyOverrides])

  const highConf = effectiveItems.filter(i => i.confidence >= 0.8)
  const midConf  = effectiveItems.filter(i => i.confidence >= 0.5 && i.confidence < 0.8)
  const lowConf  = effectiveItems.filter(i => i.confidence < 0.5)
  const totalItems = effectiveItems.reduce((s, i) => s + i.qty, 0)

  // ── Derived: takeoff rows (grouped by assembly) ───────────────────────────
  // From DXF/PDF auto-recognition pipeline
  const recognitionTakeoffRows = useMemo(() => {
    const rowMap = {}
    for (const item of effectiveItems) {
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
  }, [effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits])

  // From PDF manual markers (assembly-based counting)
  const markerTakeoffRows = useMemo(() => {
    if (!pdfMarkers.length) return []
    const rowMap = {}
    for (const m of pdfMarkers) {
      // Only count markers that have an assembly ID (ASM-xxx)
      const asmId = m.asmId || (m.category?.startsWith('ASM-') ? m.category : null)
      if (!asmId) continue
      if (!rowMap[asmId]) rowMap[asmId] = { asmId, qty: 0, variantId: variantOverrides[asmId] || null, _fromMarkers: true }
      rowMap[asmId].qty += 1
    }
    // Reconcile wallSplits: if splits exist, adjust to match actual marker count
    for (const row of Object.values(rowMap)) {
      const splits = wallSplits[row.asmId]
      if (splits) {
        const splitTotal = Object.values(splits).reduce((s, n) => s + n, 0)
        const diff = row.qty - splitTotal
        if (diff > 0) {
          // New markers added — put extra in 'brick' (default)
          row.wallSplits = { ...splits, brick: (splits.brick || 0) + diff }
        } else if (diff < 0) {
          // Markers removed — reduce from 'brick' first, then others
          const adjusted = { ...splits }
          let toRemove = Math.abs(diff)
          // Remove from brick first
          if (adjusted.brick && adjusted.brick > 0) {
            const take = Math.min(adjusted.brick, toRemove)
            adjusted.brick -= take
            toRemove -= take
          }
          // Remove from others if still needed
          if (toRemove > 0) {
            for (const k of Object.keys(adjusted)) {
              if (toRemove <= 0) break
              if (adjusted[k] > 0) {
                const take = Math.min(adjusted[k], toRemove)
                adjusted[k] -= take
                toRemove -= take
              }
            }
          }
          row.wallSplits = adjusted
        } else {
          row.wallSplits = splits
        }
      } else {
        row.wallSplits = null
      }
    }
    return Object.values(rowMap)
  }, [pdfMarkers, variantOverrides, wallSplits])

  // Merged takeoff rows: recognition + manual markers (no duplicates)
  const takeoffRows = useMemo(() => {
    const rowMap = {}
    // Recognition rows first
    for (const row of recognitionTakeoffRows) {
      rowMap[row.asmId] = { ...row }
    }
    // Marker rows add to or create new entries
    for (const row of markerTakeoffRows) {
      if (rowMap[row.asmId]) {
        const existing = rowMap[row.asmId]
        existing.qty += row.qty
        // Merge wallSplits
        if (row.wallSplits && existing.wallSplits) {
          const merged = { ...existing.wallSplits }
          for (const [k, v] of Object.entries(row.wallSplits)) {
            merged[k] = (merged[k] || 0) + v
          }
          existing.wallSplits = merged
        } else if (row.wallSplits) {
          existing.wallSplits = { ...row.wallSplits }
        }
      } else {
        rowMap[row.asmId] = { ...row }
      }
    }
    return Object.values(rowMap)
  }, [recognitionTakeoffRows, markerTakeoffRows])

  // ── Auto-compute cable estimate for DXF (3-tier cascade) ────────────────
  // P1: DXF layer geometry  (mért kábelvonalak, confidence 0.92)
  // P2: MST becslés eszközpozíciók alapján  (confidence ~0.75)
  // P3: Eszközszám × átlagos kábelhossz  (fallback, confidence 0.55)
  // Guard: shouldOverwrite() prevents lower-priority estimates from replacing
  // higher-priority ones (e.g. pdf_markers won't be overwritten by dxf_mst).
  useEffect(() => {
    if (!takeoffRows.length) {
      // No data — clear DXF-origin estimates only (preserve PDF sources)
      if (cableEstimate?._source !== CABLE_SOURCE.PDF_TAKEOFF && cableEstimate?._source !== CABLE_SOURCE.PDF_MARKERS) {
        setCableEstimate(null)
      }
      return
    }

    // ── Tier 1: tényleges kábelvonalak a DXF rétegeiből ──────────────────
    const layerResult = detectDxfCableLengths(effectiveParsedDxf)
    if (layerResult) {
      const normalized = normalizeCableEstimate(layerResult, CABLE_SOURCE.DXF_LAYERS)
      if (shouldOverwrite(cableEstimate, normalized)) setCableEstimate(normalized)
      return
    }

    // ── Tier 2: MST becslés ha vannak pozícióadatok ──────────────────────
    const inserts = effectiveParsedDxf?.inserts
    if (inserts?.length >= 2) {
      const devices = inserts.map(ins => {
        const recog = recognizedItems.find(r => r.blockName === ins.name)
        const asmId = asmOverrides[ins.name] !== undefined ? asmOverrides[ins.name] : recog?.asmId
        const type = asmId === 'ASM-003' ? 'light' : asmId === 'ASM-001' ? 'socket' : asmId === 'ASM-002' ? 'switch' : 'other'
        return { type, x: ins.x, y: ins.y, name: ins.name }
      })
      const scaleFactor = effectiveParsedDxf?.units?.factor ?? 0.001
      try {
        const mstResult = estimateCablesMST(devices, scaleFactor)
        if (mstResult && mstResult.cable_total_m > 0) {
          mstResult.method = `MST becslés (${devices.length} eszközpozíció alapján)`
          const normalized = normalizeCableEstimate(mstResult, CABLE_SOURCE.DXF_MST)
          if (shouldOverwrite(cableEstimate, normalized)) setCableEstimate(normalized)
          return
        }
      } catch (_e) { /* fallthrough to device-count */ }
    }

    // ── Tier 3: eszközszám × átlag kábelhossz (fallback) ─────────────────
    const lightQty  = takeoffRows.filter(r => r.asmId === 'ASM-003').reduce((s, r) => s + r.qty, 0)
    const socketQty = takeoffRows.filter(r => r.asmId === 'ASM-001').reduce((s, r) => s + r.qty, 0)
    const switchQty = takeoffRows.filter(r => r.asmId === 'ASM-002').reduce((s, r) => s + r.qty, 0)
    const total = lightQty + socketQty + switchQty
    if (!total) { setCableEstimate(null); return }

    const lightM  = lightQty  * 8
    const socketM = socketQty * 6
    const switchM = switchQty * 4
    const totalM  = lightM + socketM + switchM
    const normalized = normalizeCableEstimate({
      cable_total_m: totalM,
      cable_by_type: { light_m: lightM, socket_m: socketM, switch_m: switchM, other_m: 0 },
      method: 'Becslés eszközszám alapján (nincs pozícióadat)',
      confidence: 0.55,
    }, CABLE_SOURCE.DEVICE_COUNT)
    if (shouldOverwrite(cableEstimate, normalized)) setCableEstimate(normalized)
  }, [takeoffRows, effectiveParsedDxf, recognizedItems, asmOverrides])

  // ── Derived: pricing ──────────────────────────────────────────────────────
  const pricing = useMemo(() => {
    if (!takeoffRows.length) return null
    return computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode })
  }, [takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode])

  // ── Extended calc (adds markup/margin, cable $/m override, VAT, NECA badge) ──
  const fullCalc = useMemo(() => {
    if (!pricing) return null
    const productivityFactor = calcProductivityFactor(context || {})
    // Cable cost from cable price per meter
    const cableTotalM = cableEstimate?.cable_total_m || 0
    const cableCost = cableTotalM * cablePricePerM
    // Recalculate subtotal with explicit cable cost
    const subtotal = pricing.materialCost + pricing.laborCost + cableCost
    // Markup vs margin
    let grandTotal
    const markupPct = markup * 100
    if (markupType === 'margin') {
      const marginRatio = markupPct / 100
      grandTotal = marginRatio >= 1 ? subtotal * 10 : subtotal / (1 - marginRatio)
    } else {
      grandTotal = subtotal * (1 + markupPct / 100)
    }
    if (!Number.isFinite(grandTotal)) grandTotal = subtotal
    const markupAmount = grandTotal - subtotal
    const bruttoTotal = grandTotal * (1 + vatPercent / 100)
    // Group pricing lines by systemType for per-category breakdown
    const bySystem = {}
    for (const line of (pricing.lines || [])) {
      const sys = line.systemType || 'general'
      if (!bySystem[sys]) bySystem[sys] = { materialCost: 0, laborHours: 0, lines: [] }
      bySystem[sys].materialCost += line.materialCost || 0
      bySystem[sys].laborHours += line.hours || 0
      bySystem[sys].lines.push(line)
    }
    // Group by assembly for summary
    const byAssembly = {}
    for (const row of takeoffRows) {
      const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
      if (!asm) continue
      const rowP = computePricing({
        takeoffRows: [row], assemblies, workItems, materials, context, markup: 0, hourlyRate,
        cableEstimate: null, difficultyMode,
      })
      byAssembly[row.asmId] = {
        name: asm.name || row.asmId,
        category: asm.category || '',
        qty: row.qty,
        materialCost: rowP.materialCost,
        laborCost: rowP.laborCost,
        laborHours: rowP.laborHours,
      }
    }
    return {
      ...pricing,
      cableTotalM, cablePricePerM, cableCost,
      subtotal, markupType, markupPct, markupAmount, grandTotal, bruttoTotal, vatPercent,
      productivityFactor, bySystem, byAssembly,
    }
  }, [pricing, cableEstimate, cablePricePerM, markup, markupType, vatPercent, context, takeoffRows, assemblies, workItems, materials, hourlyRate, difficultyMode])

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
    let changed = false
    for (const item of effectiveItems) {
      if (item.confidence >= 0.8 && item.asmId && newOverrides[item.blockName] === undefined) {
        // Explicitly confirm the auto-matched assembly so manual overrides won't revert it
        newOverrides[item.blockName] = item.asmId
        changed = true
      }
    }
    if (changed) setAsmOverrides(newOverrides)
    setRightTab('takeoff')
  }

  // ── Save (per-plan or quote) ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!takeoffRows.length) {
      setSaveError('Nincs felvett elem — jelölj ki elemeket a tervrajzon!')
      return
    }
    if (!pricing) {
      setSaveError('Árkalkuláció nem elérhető — ellenőrizd az assemblyket!')
      return
    }
    setSaving(true); setSaveError(null)
    try {
      // ── Per-plan save (Felmérés flow): merge-before-save to avoid partial overwrite ──
      // Read current store state first, then overlay only workspace-owned fields.
      // This preserves measurements, scale, cableRoutes, rotation etc. from the viewer.
      if (planId) {
        const stored = (await getPlanAnnotations(planId)) || {}
        await savePlanAnnotations(planId, {
          ...stored,
          markers: pdfMarkers,
          wallSplits,
          variantOverrides,
        })
        // Persist pricing summary + snapshot for quote generation on plan metadata
        // Resolve plan-level system type from filename inference (fallback: 'general')
        const _planMeta = getPlanMeta(planId)
        const _planSysType = _planMeta?.inferredMeta?.systemType || 'general'
        const _planFloor = _planMeta?.inferredMeta?.floor || null
        const _planFloorLabel = _planMeta?.inferredMeta?.floorLabel || null
        const snapshotItems = (pricing.lines || []).map(line => ({
          name: line.name, code: line.code || '', qty: line.qty, unit: line.unit, type: line.type,
          systemType: line.systemType || 'general',
          sourcePlanSystemType: _planSysType,
          sourcePlanFloor: _planFloor,
          sourcePlanFloorLabel: _planFloorLabel,
          unitPrice: line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
          hours: line.hours || 0, materialCost: line.materialCost || 0,
        }))
        const snapshotAssembly = takeoffRows.map(row => {
          const asm = assemblies.find(a => a.id === (row.variantId || row.asmId))
          const rowP = computePricing({
            takeoffRows: [row], assemblies, workItems, materials, context, markup, hourlyRate,
            cableEstimate: null, difficultyMode,
          })
          return {
            id: row.asmId, name: asm?.name || row.asmId, category: asm?.category || '',
            qty: row.qty, wallSplits: row.wallSplits || null,
            totalPrice: Math.round(rowP.total), totalMaterials: Math.round(rowP.materialCost),
            totalLabor: Math.round(rowP.laborCost), totalHours: rowP.laborHours,
          }
        })
        updatePlanMeta(planId, {
          calcTotal: Math.round(pricing.total),
          calcItemCount: takeoffRows.reduce((s, r) => s + r.qty, 0),
          calcDate: new Date().toISOString(),
          calcTakeoffRows: takeoffRows,
          calcPricing: {
            total: pricing.total,
            materialCost: pricing.materialCost,
            laborCost: pricing.laborCost,
            laborHours: pricing.laborHours,
          },
          calcPricingLines: snapshotItems,
          calcAssemblySummary: snapshotAssembly,
          calcHourlyRate: hourlyRate,
          calcMarkup: markup,
        })
        // Show save-success strip instead of immediately navigating back
        if (onQuoteFromPlan) {
          setSaveSuccess(true)
        } else {
          onSaved?.()
        }
        return
      }

      // ── Full quote save (new-quote flow or merge fallback) ──
      // Note: planId may be null in pure new-quote flow (no plan association)
      const _fqPlanMeta = planId ? getPlanMeta(planId) : null
      const _fqPlanSysType = _fqPlanMeta?.inferredMeta?.systemType || 'general'
      const _fqPlanFloor = _fqPlanMeta?.inferredMeta?.floor || null
      const _fqPlanFloorLabel = _fqPlanMeta?.inferredMeta?.floorLabel || null
      const items = (pricing.lines || []).map(line => ({
        name:        line.name,
        code:        line.code || '',
        qty:         line.qty,
        unit:        line.unit,
        type:        line.type,
        systemType:  line.systemType || 'general',
        sourcePlanSystemType: _fqPlanSysType,
        sourcePlanFloor: _fqPlanFloor,
        sourcePlanFloorLabel: _fqPlanFloorLabel,
        unitPrice:   line.qty > 0 ? (line.materialCost || 0) / line.qty : 0,
        hours:       line.hours || 0,
        materialCost: line.materialCost || 0,
      }))

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
      // ── Resolve output mode: prefer estimation panel override, then project default ──
      const planMeta = planId ? getPlanMeta(planId) : null
      const prjDefault = data?.quoteOverrides?._outputMode
        || (planMeta?.projectId ? (getProject(planMeta.projectId)?.defaultQuoteOutputMode || 'combined') : 'combined')
      const _ieD = OUTPUT_MODE_INCLEXCL[prjDefault] || OUTPUT_MODE_INCLEXCL.combined
      const _qs = loadSettings().quote

      const quote = {
        id:           generateQuoteId(),
        projectName:  displayName,
        project_name: displayName,
        name:         displayName,
        clientName,
        client_name:  clientName,
        createdAt:    new Date().toISOString(),
        created_at:   new Date().toISOString(),
        status:      'draft',
        outputMode:   prjDefault,
        groupBy:      'none',
        inclusions:   _ieD.inclusions || _qs.default_inclusions,
        exclusions:   _ieD.exclusions || _qs.default_exclusions,
        validityText: _qs.default_validity_text,
        paymentTermsText: _qs.default_payment_terms_text,
        gross:          Math.round(pricing.total),
        totalMaterials: Math.round(pricing.materialCost),
        totalLabor:     Math.round(pricing.laborCost),
        totalHours:     pricing.laborHours,
        summary: {
          grandTotal:     Math.round(pricing.total),
          totalWorkHours: pricing.laborHours,
        },
        pricingData: { hourlyRate, markup_pct: markup },
        items,
        assemblySummary,
        context,
        cableEstimate,
        source:   'takeoff-workspace',
        fileName: file?.name,
        // ── Bundle back-reference (from MergePlansView) ──────────────
        bundleId: initialData?.bundleId || null,
      }
      saveQuote(quote)
      onSaved?.(quote)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

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
            <div style={{
              width: 40, height: 40, border: '3px solid #1E1E22',
              borderTopColor: '#00E5A0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>DWG → DXF konverzió…</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>Ez néhány másodpercet vesz igénybe</div>
            <div style={{ width: 200, height: 2, background: C.border, borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '40%', background: C.accent, borderRadius: 1, animation: 'slideProgress 1.5s ease-in-out infinite' }} />
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

        {/* Pricing summary or save-success strip */}
        {saveSuccess && planId ? (
          <>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.accent, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✓ Kalkuláció mentve · {Math.round(fullCalc?.grandTotal || pricing?.total || 0).toLocaleString('hu-HU')} Ft
            </div>
            <button
              onClick={async () => {
                setSaving(true)
                try { await onQuoteFromPlan?.(planId) }
                finally { setSaving(false) }
              }}
              disabled={saving}
              style={{
                marginLeft: 12, padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontFamily: 'Syne', fontWeight: 800, fontSize: 14,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '...' : '📄 Ajánlat generálása'}
            </button>
            <button
              onClick={() => onSaved?.()}
              style={{
                marginLeft: 8, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
                fontFamily: 'Syne', fontWeight: 600, fontSize: 13,
              }}
            >
              ← Vissza a projekthez
            </button>
          </>
        ) : fullCalc ? (
          <>
            <PricingPill label="Anyag" value={fullCalc.materialCost} color={C.blue} />
            <div style={{ width: 1, height: 32, background: C.border, margin: '0 12px' }} />
            <PricingPill label="Munka" value={fullCalc.laborCost} color={C.yellow} />
            {fullCalc.cableCost > 0 && (
              <>
                <div style={{ width: 1, height: 32, background: C.border, margin: '0 12px' }} />
                <PricingPill label="Kábel" value={fullCalc.cableCost} color={C.blue} />
              </>
            )}
            <div style={{ width: 1, height: 32, background: C.border, margin: '0 12px' }} />
            <div style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => setRightTab('calc')} title="Nyisd meg a Kalkuláció fület">
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>Nettó</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.accent }}>
                {Math.round(fullCalc.grandTotal).toLocaleString('hu-HU')} Ft
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
                bruttó: {Math.round(fullCalc.bruttoTotal).toLocaleString('hu-HU')} Ft
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                marginLeft: 16, padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                background: C.accent, border: 'none', color: C.bg,
                fontFamily: 'Syne', fontWeight: 800, fontSize: 14,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? '...' : planId ? '💾 Mentés' : '📄 Ajánlat'}
            </button>
          </>
        ) : (
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>
            Adj hozzá elemeket az árajánlat generálásához
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
      <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Tervrajz nézegető ────────────────────────────────────────── */}
        <div style={{ flex: isMobile ? '0 0 100%' : `0 0 ${panelRatio}%`, position: 'relative', background: '#050507', display: (isMobile && !showDxfOnMobile) ? 'none' : undefined }}>
          {isDxf && viewerFile && (
            <Suspense fallback={<div style={{ width: '100%', height: '100%', background: '#050507' }} />}>
              <DxfViewerPanel
                ref={canvasRef}
                file={viewerFile}
                planId={planId}
                assemblies={assemblies}
                focusTarget={focusTarget}
                onCableData={(data) => {
                  if (data) {
                    const normalized = normalizeCableEstimate(data, CABLE_SOURCE.DXF_MARKERS)
                    // Context guard: never let DXF markers overwrite PDF marker estimate
                    if (isCrossContextMarkerConflict(cableEstimate?._source, CABLE_SOURCE.DXF_MARKERS)) return
                    if (shouldOverwrite(cableEstimate, normalized)) setCableEstimate(normalized)
                  } else if (cableEstimate?._source === CABLE_SOURCE.DXF_MARKERS) {
                    // Markers cleared — drop DXF marker estimate, let DXF useEffect recalculate
                    setCableEstimate(null)
                  }
                }}
                style={{ height: '100%', border: 'none', borderRadius: 0 }}
              />
            </Suspense>
          )}

          {/* SVG overlay with block position dots (uses canvasRef proxied through DxfViewerPanel forwardRef) */}
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
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button onClick={() => file && handleFile(file)} style={{
                      padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                      background: C.accentDim, border: `1px solid ${C.accent}40`,
                      color: C.accent, fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                    }}>🔄 Próbáld újra</button>
                    <button onClick={() => { setFile(null); setParsedDxf(null) }} style={{
                      padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                      background: 'transparent', border: `1px solid ${C.border}`,
                      color: C.textSub, fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                    }}>📁 Másik fájl</button>
                  </div>
                </>
              </div>
            ) : isPdf ? (
              <Suspense fallback={<div style={{ width: '100%', height: '100%', background: C.bg }} />}>
                <PdfViewerPanel
                  file={file}
                  style={{ height: '100%', border: 'none', borderRadius: 0 }}
                  assemblies={assemblies}
                  focusTarget={focusTarget}
                  onDirtyChange={onDirtyChange}
                  onMarkersChange={(markers) => {
                    setPdfMarkers(markers)
                  }}
                  onCableData={(data) => {
                    if (data) {
                      const normalized = normalizeCableEstimate(data, CABLE_SOURCE.PDF_MARKERS)
                      // Context guard: never let PDF markers overwrite DXF marker estimate
                      if (isCrossContextMarkerConflict(cableEstimate?._source, CABLE_SOURCE.PDF_MARKERS)) return
                      if (shouldOverwrite(cableEstimate, normalized)) {
                        setCableEstimate(normalized)
                      }
                    } else if (cableEstimate?._source === CABLE_SOURCE.PDF_MARKERS) {
                      // Markers cleared — fall back to pdf_takeoff or null
                      setCableEstimate(null)
                    }
                  }}
                  onCreateQuote={() => {
                    // Triggered from EstimationPanel inside PdfViewer —
                    // delegate to TakeoffWorkspace's handleSave which uses
                    // the assembly-based takeoffRows + pricing pipeline
                    handleSave()
                  }}
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

        {/* ── Drag handle ──────────────────────────────────────────────────── */}
        {!isMobile && (
          <div
            onMouseDown={handleDividerMouseDown}
            title="Húzd a panel átméretezéséhez"
            style={{
              width: 5, flexShrink: 0, cursor: 'col-resize', background: C.border,
              transition: 'background 0.15s', position: 'relative', zIndex: 10,
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.accent + '60'}
            onMouseLeave={e => e.currentTarget.style.background = C.border}
          />
        )}

        {/* ── RIGHT: Munkaterület panel ─────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: (isMobile && showDxfOnMobile) ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bgCard, flexShrink: 0 }}>
            {[
              { id: 'takeoff',   label: '📋 Felmérés',   badge: takeoffRows.length },
              { id: 'cable',     label: '🔌 Kábel' },
              { id: 'calc',      label: '🧮 Kalkuláció' },
              { id: 'context',   label: '⚙️ Beállítás' },
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

            {/* ── TAKEOFF TAB ─────────────────────────────────────────────── */}
            {rightTab === 'takeoff' && (
              <div>
                {takeoffRows.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Még nincs felvett elem. Használd a Számlálás eszközt a tervrajzon.
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
                        isHighlighted={highlightBlock && effectiveItems.some(i => i.blockName === highlightBlock && (asmOverrides[i.blockName] ?? i.asmId) === row.asmId)}
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
                  🔌 Kábelbecslés
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 16 }}>
                  {isPdf
                    ? 'Jelöld be az elosztót és az eszközöket a tervrajzon, majd kalibráld a léptéket — a kábelhossz a kijelölt pozíciókból számolódik. Ha nincs jelölés, eszközszám × átlagos kábelhossz alapján becsül.'
                    : 'Ha a DXF tartalmaz kábelvonalakat (réteg neve alapján felismeri), azokat méri. Ha nem, MST-algoritmussal becsül eszközpozíciók alapján, végső esetben eszközszám × átlagos kábelhossz értékkel.'
                  }
                </div>

                {cableEstimate ? (
                  <>
                    {[
                      { key: 'light_m', label: 'Világítási kör (NYM-J 3×1.5)', icon: '💡', color: C.accent },
                      { key: 'socket_m', label: 'Dugalj kör (NYM-J 3×2.5)', icon: '🔌', color: C.blue },
                      { key: 'switch_m', label: 'Kapcsoló kör (NYM-J 3×1.5)', icon: '🔘', color: C.yellow },
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
                    <div style={{ marginTop: 12, padding: '12px 14px', background: C.accentDim, borderRadius: 8, border: `1px solid ${C.accent}30` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>Összesen</span>
                        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.accent }}>{Math.round(cableEstimate.cable_total_m)} m</span>
                      </div>
                      {cableEstimate.cable_total_m_p90 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>P50–P90 tartomány</span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>
                            {Math.round(cableEstimate.cable_total_m_p50 || cableEstimate.cable_total_m)}–{Math.round(cableEstimate.cable_total_m_p90)} m
                          </span>
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                        {cableEstimate.method}
                      </span>
                      <span style={{
                        fontFamily: 'DM Mono', fontSize: 10, padding: '1px 7px', borderRadius: 10,
                        background: cableEstimate._source === 'dxf_layers' ? C.accentDim
                          : cableEstimate._source === 'pdf_markers' ? C.accentDim
                          : cableEstimate._source === 'dxf_markers' ? C.accentDim
                          : cableEstimate._source === 'dxf_mst' ? 'rgba(76,201,240,0.12)'
                          : cableEstimate._source === 'pdf_takeoff' ? 'rgba(255,209,102,0.15)'
                          : 'rgba(255,255,255,0.05)',
                        color: cableEstimate._source === 'dxf_layers' ? C.accent
                          : cableEstimate._source === 'pdf_markers' ? C.accent
                          : cableEstimate._source === 'dxf_markers' ? C.accent
                          : cableEstimate._source === 'dxf_mst' ? C.blue
                          : cableEstimate._source === 'pdf_takeoff' ? C.yellow
                          : C.muted,
                        border: `1px solid currentColor`,
                      }}>
                        {cableEstimate._source === 'dxf_layers' ? 'mért'
                          : cableEstimate._source === 'pdf_markers' ? 'jelölt'
                          : cableEstimate._source === 'dxf_markers' ? 'jelölt'
                          : cableEstimate._source === 'dxf_mst' ? 'MST'
                          : cableEstimate._source === 'pdf_takeoff' ? 'PDF'
                          : 'becslés'}
                        {' '}~{Math.round((cableEstimate.confidence || 0.6) * 100)}%
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Adj hozzá elemeket a Felmérés fülön a kábelbecslés elindításához.
                  </div>
                )}
              </div>
            )}

            {/* ── CALC TAB ─────────────────────────────────────────────────── */}
            {rightTab === 'calc' && (
              <div>
                {!fullCalc ? (
                  <div style={{ textAlign: 'center', padding: 32, color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
                    Adj hozzá elemeket a Felmérés fülön a kalkuláció elindításához.
                  </div>
                ) : (
                  <>
                    {/* ── Per-assembly cost breakdown ── */}
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Assembly költségbontás</div>
                      {Object.entries(fullCalc.byAssembly).map(([asmId, info]) => (
                        <div key={asmId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text, fontWeight: 600 }}>{info.name}</div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{info.qty} db · {info.laborHours.toFixed(1)} óra</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.blue }}>{Math.round(info.materialCost).toLocaleString('hu-HU')} Ft</div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.yellow }}>{Math.round(info.laborCost).toLocaleString('hu-HU')} Ft</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Cable cost ── */}
                    {fullCalc.cableTotalM > 0 && (
                      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>🔌</span>
                          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>Kábel költség</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Kábel ár (Ft/m)</div>
                            <input
                              type="number" min={0} step={50}
                              value={cablePricePerM}
                              onChange={e => setCablePricePerM(Math.max(0, parseFloat(e.target.value) || 0))}
                              style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                            />
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Összesen ({Math.round(fullCalc.cableTotalM)} m)</div>
                            <div style={{ padding: '5px 7px', borderRadius: 4, background: 'rgba(76,201,240,0.07)', border: '1px solid rgba(76,201,240,0.18)', fontSize: 11, fontFamily: 'DM Mono', color: C.blue, fontWeight: 700 }}>
                              {Math.round(fullCalc.cableCost).toLocaleString('hu-HU')} Ft
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Rate settings ── */}
                    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>Általános díjak</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Munkadíj (Ft/óra)</div>
                          <input
                            type="number" min={0} step={500}
                            value={hourlyRate}
                            onChange={e => setHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginBottom: 3 }}>Feláras %</div>
                          <input
                            type="number" min={0} max={99} step={1}
                            value={Math.round(markup * 100)}
                            onChange={e => setMarkup(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)) / 100)}
                            style={{ width: '100%', padding: '5px 7px', borderRadius: 4, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.text, fontSize: 11, fontFamily: 'DM Mono', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      {/* Markup vs Margin toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>Számítási mód:</div>
                        {[
                          { key: 'markup', label: 'Markup', tip: `Cost × (1+${fullCalc.markupPct.toFixed(0)}%)` },
                          { key: 'margin', label: 'Margin', tip: `Cost ÷ (1−${fullCalc.markupPct.toFixed(0)}%)` },
                        ].map(opt => (
                          <button key={opt.key}
                            title={opt.tip}
                            onClick={() => setMarkupType(opt.key)}
                            style={{
                              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono',
                              border: `1px solid ${markupType === opt.key ? C.accent : C.border}`,
                              background: markupType === opt.key ? C.accentDim : 'transparent',
                              color: markupType === opt.key ? C.accent : C.muted,
                              cursor: 'pointer',
                            }}>{opt.label}</button>
                        ))}
                        <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono', marginLeft: 4 }}>
                          +{Math.round(fullCalc.markupAmount).toLocaleString('hu-HU')} Ft
                        </span>
                      </div>

                      {/* NECA productivity factor badge */}
                      {fullCalc.productivityFactor !== 1.0 && (
                        <div style={{ marginTop: 8, padding: '5px 10px', borderRadius: 6,
                          background: fullCalc.productivityFactor > 1.2 ? 'rgba(255,107,107,0.1)' : 'rgba(255,209,102,0.1)',
                          border: `1px solid ${fullCalc.productivityFactor > 1.2 ? 'rgba(255,107,107,0.3)' : 'rgba(255,209,102,0.3)'}`,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>NECA produktivitás:</span>
                          <span style={{ fontSize: 10, fontFamily: 'DM Mono', fontWeight: 700,
                            color: fullCalc.productivityFactor > 1.2 ? '#FF6B6B' : '#FFD166' }}>
                            ×{fullCalc.productivityFactor.toFixed(2)}
                          </span>
                          <span style={{ fontSize: 9, color: C.muted, fontFamily: 'DM Mono' }}>
                            ({fullCalc.productivityFactor > 1 ? '+' : ''}{Math.round((fullCalc.productivityFactor - 1) * 100)}% a normaidőre)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── Grand total summary ── */}
                    <div style={{ background: C.bgCard, border: `1px solid ${C.accent}30`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>Összefoglaló</div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Anyagköltség</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round(fullCalc.materialCost).toLocaleString('hu-HU')} Ft</span>
                      </div>
                      {fullCalc.cableCost > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Kábel ({Math.round(fullCalc.cableTotalM)} m × {cablePricePerM.toLocaleString('hu-HU')} Ft/m)</span>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round(fullCalc.cableCost).toLocaleString('hu-HU')} Ft</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>Munkadíj ({fullCalc.laborHours.toFixed(1)} óra × {hourlyRate.toLocaleString('hu-HU')} Ft/óra)</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{Math.round(fullCalc.laborCost).toLocaleString('hu-HU')} Ft</span>
                      </div>

                      {/* Subtotal */}
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, fontWeight: 600 }}>Részösszeg</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{Math.round(fullCalc.subtotal).toLocaleString('hu-HU')} Ft</span>
                      </div>

                      {/* Markup/Margin */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#FF8C42' }}>
                          + Rezsi/árrés ({fullCalc.markupPct.toFixed(0)}% {markupType})
                        </span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#FF8C42', fontWeight: 600 }}>
                          {Math.round(fullCalc.markupAmount).toLocaleString('hu-HU')} Ft
                        </span>
                      </div>

                      {/* Grand total (nettó) */}
                      <div style={{ borderTop: `2px solid ${C.accent}40`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, color: C.accent }}>Összesen (nettó)</span>
                        <span style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 800, color: C.accent }}>{Math.round(fullCalc.grandTotal).toLocaleString('hu-HU')} Ft</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>Bruttó ({vatPercent}% ÁFA)</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>{Math.round(fullCalc.bruttoTotal).toLocaleString('hu-HU')} Ft</span>
                      </div>
                    </div>

                    {/* ── Action: create quote ── */}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        width: '100%', padding: '13px 16px', borderRadius: 8, cursor: 'pointer',
                        background: C.accent, border: 'none', color: C.bg,
                        fontSize: 14, fontFamily: 'Syne', fontWeight: 700, marginBottom: 8,
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      {saving ? '...' : planId ? '💾 Kalkuláció mentése' : '📄 Ajánlat létrehozása →'}
                    </button>
                  </>
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
                  💡 A falanyag tételenként állítható a Felmérés fülön (GK / Ytong / Tégla / Beton). Az alábbi beállítások az egész projektre vonatkoznak.
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
