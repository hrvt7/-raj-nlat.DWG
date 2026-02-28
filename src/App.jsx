import React, { useState, useRef, useCallback, useEffect } from 'react'
import Landing from './Landing.jsx'
import { supabase, signIn, signUp, signOut, onAuthChange, saveQuoteRemote, getSubscriptionStatus } from './supabase.js'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Quotes from './pages/Quotes.jsx'
import WorkItems from './pages/WorkItems.jsx'
import Settings from './pages/Settings.jsx'
import AssembliesPage from './pages/Assemblies.jsx'
import PlansPage from './pages/Plans.jsx'
import { loadSettings, saveSettings, loadWorkItems, loadMaterials, loadQuotes, saveQuote, generateQuoteId, loadAssemblies } from './data/store.js'
import { WORK_ITEMS_DEFAULT as WORK_ITEMS_DB, CONTEXT_FACTORS } from './data/workItemsDb.js'
import { Button, Badge, Input, Select, StatCard, Table, QuoteStatusBadge, fmt, fmtM } from './components/ui.jsx'
import DxfViewerPanel from './components/DxfViewer/index.jsx'
import { parseDxfFile, parseDxfText } from './dxfParser.js'
import { extractGeometry, runCableAgent, estimateCablesFallback } from './cableAgent.js'
import SuccessPage from './pages/Success.jsx'

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', sidebar: '#0D0D0F',
  textSub: '#A1A1AA', textMuted: '#71717A',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
  bgHover: 'rgba(255,255,255,0.03)', redDim: 'rgba(255,107,107,0.08)',
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

// Build assembly suggestions (prefixed with 📦)
function getAssemblySuggestions() {
  try {
    const assemblies = loadAssemblies()
    return assemblies.map(a => ({ id: a.id, label: `📦 ${a.name}`, name: a.name }))
  } catch { return [] }
}

// ─── WizardStepBar ─────────────────────────────────────────────────────────────
function WizardStepBar({ step }) {
  const steps = ['Feltöltés', 'Ellenőrzés', 'Kábelterv', 'Körülmények', 'Árazás', 'Ajánlat']
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

  // Combine regular suggestions + assembly suggestions
  const asmSuggestions = getAssemblySuggestions()
  const regularFiltered = ITEM_SUGGESTIONS.filter(s => s.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
  const asmFiltered = asmSuggestions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase().includes(query.toLowerCase())).slice(0, 4)

  const hasResults = regularFiltered.length > 0 || asmFiltered.length > 0

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
      {open && hasResults && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 240, overflowY: 'auto',
        }}>
          {/* Assembly suggestions first */}
          {asmFiltered.length > 0 && (
            <>
              <div style={{ padding: '6px 12px', fontSize: 10, color: C.textMuted, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: '0.06em', background: C.bg }}>
                Assemblyk
              </div>
              {asmFiltered.map(a => (
                <div key={a.id} onMouseDown={() => { setQuery(a.id); onChange(a.id); setOpen(false) }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: C.accent,
                    borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.target.style.background = C.bg}
                  onMouseLeave={e => e.target.style.background = 'transparent'}
                >{a.label} <span style={{ fontSize: 10, color: C.textMuted }}>{a.id}</span></div>
              ))}
            </>
          )}
          {/* Regular suggestions */}
          {regularFiltered.length > 0 && (
            <>
              {asmFiltered.length > 0 && (
                <div style={{ padding: '6px 12px', fontSize: 10, color: C.textMuted, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: '0.06em', background: C.bg }}>
                  Tételek
                </div>
              )}
              {regularFiltered.map(s => (
                <div key={s} onMouseDown={() => { setQuery(s); onChange(s); setOpen(false) }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: C.text,
                    borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.target.style.background = C.bg}
                  onMouseLeave={e => e.target.style.background = 'transparent'}
                >{s}</div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── File Processing Animation ────────────────────────────────────────────────
function FileProcessingAnimation({ status, filename }) {
  const isDone = status === 'done'
  const ext = filename?.split('.').pop()?.toLowerCase()
  const label = status === 'parsing' ? (
    ext === 'pdf' ? 'Vision AI elemzés (PDF)...' :
    ext === 'dwg' ? 'DWG elemzés folyamatban...' :
    'DXF elemzés folyamatban...'
  ) : 'Kész!'
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden',
      border: `1px solid ${isDone ? '#00E5A020' : '#00E5A015'}`,
      background: '#060E0A', transition: 'all 0.4s' }}>

      {/* Top accent strip */}
      <div style={{ height: 2, background: isDone
        ? 'linear-gradient(90deg, #00E5A0, #4CC9F0)'
        : 'linear-gradient(90deg, transparent, #00E5A0, transparent)',
        backgroundSize: isDone ? '100%' : '200% 100%',
        animation: isDone ? 'none' : 'shimmer 2s linear infinite',
      }} />

      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 200 }}>
        <defs>
          <style>{`
            .fu-neutral  { stroke: #1E4030; fill: none; stroke-width: 2px; stroke-linecap: round; stroke-linejoin: round; }
            .fu-primary  { stroke: #00E5A0; fill: none; stroke-width: 2px; stroke-linecap: round; stroke-linejoin: round; }
            .fu-pulse    { stroke: #00E5A0; fill: none; stroke-width: 4px; stroke-linecap: round; }
            .fu-success  { stroke: #00E5A0; fill: none; stroke-width: 4px; stroke-linecap: round; stroke-linejoin: round; }
            .fu-cable-out { stroke: #0A2018; stroke-width: 16px; fill: none; stroke-linecap: round; opacity: 0.9; }
            .fu-cable-in  { stroke: #00E5A0; stroke-width: 2px; fill: none; stroke-linecap: round; stroke-dasharray: 8 8; }
            .fu-textline  { stroke: #1E4030; stroke-width: 4px; stroke-linecap: round; }
            @keyframes fuFlow { to { stroke-dashoffset: -16; } }
            .fu-flow { animation: fuFlow 1s linear infinite; }
            @keyframes fuPulse { 0%,100%{ transform:scale(1); opacity:0.4; } 50%{ transform:scale(1.35); opacity:1; } }
            .fu-np1 { animation: fuPulse 2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
            .fu-np2 { animation: fuPulse 2s ease-in-out infinite; animation-delay:0.5s; transform-origin: center; transform-box: fill-box; }
            @keyframes fuBob { 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-6px); } }
            .fu-bob { animation: fuBob 2s ease-in-out infinite; }
            @keyframes shimmer { 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }
          `}</style>

          <filter id="fuGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>

          <pattern id="fuDots" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1.5" fill="#00E5A0" opacity="0.05"/>
          </pattern>

          <path id="fuCablePath" d="M 260 200 L 400 200 C 460 200 460 280 520 280 L 680 280 C 740 280 740 200 800 200 L 940 200"/>
        </defs>

        <rect width="100%" height="100%" fill="url(#fuDots)"/>

        {/* Corner brackets */}
        <path d="M 40,80 L 40,40 L 80,40"  stroke="#1E4030" fill="none" strokeWidth="2" opacity="0.5"/>
        <path d="M 1160,320 L 1160,360 L 1120,360" stroke="#1E4030" fill="none" strokeWidth="2" opacity="0.5"/>
        <path d="M 1160,80 L 1160,40 L 1120,40" stroke="#1E4030" fill="none" strokeWidth="2" opacity="0.2"/>
        <path d="M 40,320 L 40,360 L 80,360" stroke="#1E4030" fill="none" strokeWidth="2" opacity="0.2"/>

        {/* Cable */}
        <path d="M 260 200 L 400 200 C 460 200 460 280 520 280 L 680 280 C 740 280 740 200 800 200 L 940 200"
          className="fu-cable-out"/>
        <path d="M 260 200 L 400 200 C 460 200 460 280 520 280 L 680 280 C 740 280 740 200 800 200 L 940 200"
          className="fu-cable-in fu-flow"/>

        {/* Cable endpoints */}
        <circle cx="260" cy="200" r="8" stroke="#1E4030" strokeWidth="2" fill="none"/>
        <circle cx="260" cy="200" r="3" fill="#00E5A0"/>
        <circle cx="940" cy="200" r="8" stroke="#1E4030" strokeWidth="2" fill="none"/>
        <circle cx="940" cy="200" r="3" fill="#00E5A0"/>

        {/* Travelling pulses */}
        <g>
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.25;0.3;1" dur="4s" repeatCount="indefinite"/>
          <line x1="-20" y1="0" x2="20" y2="0" className="fu-pulse" filter="url(#fuGlow)">
            <animateMotion dur="4s" repeatCount="indefinite" keyTimes="0;0.3;1" keyPoints="0;1;1" calcMode="linear" rotate="auto">
              <mpath href="#fuCablePath"/>
            </animateMotion>
          </line>
        </g>
        <g>
          <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.15;0.2;0.4;0.45;1" dur="4s" repeatCount="indefinite"/>
          <line x1="-20" y1="0" x2="20" y2="0" className="fu-pulse" filter="url(#fuGlow)">
            <animateMotion dur="4s" repeatCount="indefinite" keyTimes="0;0.15;0.45;1" keyPoints="0;0;1;1" calcMode="linear" rotate="auto">
              <mpath href="#fuCablePath"/>
            </animateMotion>
          </line>
        </g>
        <g>
          <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.3;0.35;0.55;0.6;1" dur="4s" repeatCount="indefinite"/>
          <line x1="-20" y1="0" x2="20" y2="0" className="fu-pulse" filter="url(#fuGlow)">
            <animateMotion dur="4s" repeatCount="indefinite" keyTimes="0;0.3;0.6;1" keyPoints="0;0;1;1" calcMode="linear" rotate="auto">
              <mpath href="#fuCablePath"/>
            </animateMotion>
          </line>
        </g>

        {/* Left: upload cloud icon */}
        <g transform="translate(140, 200)">
          <circle cx="0" cy="0" r="45" stroke="#1E4030" strokeWidth="2" fill="none"
            strokeDasharray="4 4" opacity="0.3">
            <animateTransform attributeName="transform" type="rotate" values="0;360" dur="20s" repeatCount="indefinite"/>
          </circle>
          <g className="fu-bob">
            <path stroke="#1E4030" fill="none" strokeWidth="2" strokeLinecap="round"
              d="M -15,10 L -25,10 C -35,10 -35,-5 -25,-10 C -25,-25 -5,-30 5,-15 C 15,-30 35,-25 35,-5 C 45,-5 45,10 35,10 L 15,10"/>
          </g>
          <g className="fu-bob">
            <path stroke="#00E5A0" fill="none" strokeWidth="2.5" strokeLinecap="round"
              d="M 5,20 L 5,-8 M -5,2 L 5,-8 L 15,2"/>
          </g>
          <g transform="translate(0,70)">
            <line x1="-25" y1="0" x2="25" y2="0" className="fu-textline">
              <animate attributeName="stroke" values="#1E4030;#00E5A0;#1E4030" dur="2s" repeatCount="indefinite"/>
            </line>
            <line x1="-25" y1="12" x2="10" y2="12" className="fu-textline"/>
          </g>
        </g>

        {/* Right: progress circle → checkmark */}
        <g transform="translate(1060, 200)">
          {/* Background circle */}
          <circle cx="0" cy="0" r="50" stroke="#1E4030" strokeWidth="2" fill="none" opacity="0.4"/>

          {/* Progress ring – loops when processing, stays full when done */}
          {!isDone ? (
            <circle cx="0" cy="0" r="50" strokeWidth="6" strokeLinecap="round" fill="none"
              stroke="#00E5A0" strokeDasharray="314.16" strokeDashoffset="314.16"
              transform="rotate(-90)">
              <animate attributeName="stroke-dashoffset"
                values="314.16;314.16;209.44;209.44;104.72;104.72;0;0;314.16;314.16"
                keyTimes="0;0.3;0.35;0.45;0.5;0.6;0.65;0.85;0.9;1"
                dur="4s" repeatCount="indefinite" calcMode="ease-in-out"/>
            </circle>
          ) : (
            <circle cx="0" cy="0" r="50" strokeWidth="6" strokeLinecap="round" fill="none"
              stroke="#00E5A0" strokeDasharray="314.16" strokeDashoffset="0"
              transform="rotate(-90)"/>
          )}

          {/* File icon (hide when done) */}
          {!isDone && (
            <g>
              <path stroke="#1E4030" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                d="M -16,-22 L 4,-22 L 16,-10 L 16,22 L -16,22 Z"/>
              <path stroke="#1E4030" fill="none" strokeWidth="2"
                d="M 4,-22 L 4,-10 L 16,-10"/>
              <line x1="-8" y1="2" x2="8" y2="2" stroke="#1E4030" strokeWidth="2" opacity="0.5"/>
              <line x1="-8" y1="10" x2="4" y2="10" stroke="#1E4030" strokeWidth="2" opacity="0.5"/>
            </g>
          )}

          {/* Checkmark (show when done) */}
          {isDone && (
            <g>
              <circle cx="0" cy="0" r="28" fill="#00E5A0" opacity="0.12">
                <animate attributeName="r" values="24;30;24" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite"/>
              </circle>
              <path stroke="#00E5A0" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="32" strokeDashoffset="0"
                d="M -10,-1 L -3,6 L 12,-7" transform="translate(0,2)"/>
            </g>
          )}
        </g>
      </svg>

      {/* Filename + status overlay */}
      <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12,
          color: isDone ? '#00E5A0' : '#4A8A6A', letterSpacing: '0.05em' }}>
          {filename}
        </span>
        <span style={{ color: '#1E4030' }}>·</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11,
          color: isDone ? '#00E5A0' : '#2A6A4A', letterSpacing: '0.08em' }}>
          {label}
        </span>
        {!isDone && (
          <div style={{ width: 10, height: 10, borderRadius: '50%',
            border: '1.5px solid #1E4030', borderTopColor: '#00E5A0',
            animation: 'spin 0.8s linear infinite', flexShrink: 0 }}/>
        )}
      </div>
    </div>
  )
}


// ─── DWG Vision Modal ──────────────────────────────────────────────────────────
function DwgVisionModal({ filename, weakResult, apiBase, onResult, onClose }) {
  const [tab, setTab]           = useState('screenshot') // screenshot | dxf
  const [imgFile, setImgFile]   = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const [dxfFile, setDxfFile]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const imgRef  = useRef()
  const dxfRef  = useRef()

  const weakBlocks = weakResult?.summary?.total_blocks || 0
  const confidence = weakResult?._confidence || 0

  const handleImageSelect = (file) => {
    setImgFile(file)
    setError('')
    const reader = new FileReader()
    reader.onload = e => setImgPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleImageDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleImageSelect(file)
  }

  const handleVisionAnalyze = async () => {
    if (!imgFile) return
    setLoading(true); setError('')
    try {
      const b64Full = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = e => res(e.target.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(imgFile)
      })
      // Also send original DWG base64 if available in weakResult
      const res = await fetch(`${apiBase}/api/parse-dwg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dwg_base64: weakResult?._dwg_base64 || btoa(''),
          filename,
          screenshot_base64: b64Full,
        }),
      })
      if (!res.ok) throw new Error('Vision elemzés sikertelen')
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Ismeretlen hiba')
      onResult(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDxfUpload = async () => {
    if (!dxfFile) return
    setLoading(true); setError('')
    try {
      const text = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = e => res(e.target.result)
        r.onerror = rej
        r.readAsText(dxfFile, 'utf-8')
      })
      const result = parseDxfText(text)
      if (!result.success) throw new Error(result.error || 'DXF elemzési hiba')
      onResult({ ...result, _source: 'dxf_replacement', _original_dwg: filename })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const tabBtn = (id, label) => (
    <button onClick={() => { setTab(id); setError('') }} style={{
      flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
      background: tab === id ? C.accent : 'transparent',
      color: tab === id ? '#0A0E1A' : C.muted,
      fontWeight: tab === id ? 700 : 400, fontSize: 13, cursor: 'pointer',
      transition: 'all 0.15s',
    }}>{label}</button>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 16,
    }}>
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 16, width: '100%', maxWidth: 480,
        boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                📐 DWG pontosítás
              </div>
              <div style={{ color: C.muted, fontSize: 12, fontFamily: 'DM Mono', marginBottom: 8 }}>
                {filename}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              color: C.muted, fontSize: 13, flexShrink: 0,
            }}>✕</button>
          </div>

          {/* Weak result warning */}
          <div style={{
            background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#FFC107',
            marginBottom: 4,
          }}>
            ⚠️ Bináris kinyerésből csak <strong>{weakBlocks} elem</strong> olvasható ki
            {confidence > 0 && ` (${Math.round(confidence * 100)}% bizalom)`}.
            Pontosabb elemzéshez válassz az alábbi opciók közül.
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={{
            display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)',
            borderRadius: 10, padding: 4, marginBottom: 20,
          }}>
            {tabBtn('screenshot', '📸 Képernyőkép → Vision AI')}
            {tabBtn('dxf', '📄 DXF feltöltés')}
          </div>

          {/* ── Screenshot tab ── */}
          {tab === 'screenshot' && (
            <div>
              <div style={{ color: C.muted, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
                Nyisd meg a DWG-t bármelyik CAD nézőben, zoom ki hogy az egész terv látsszon, majd küldj egy képernyőképet.
                <br/>
                <span style={{ color: C.accent }}>
                  Ingyenes nézők: AutoCAD DWG TrueView · DraftSight · A360 Viewer
                </span>
              </div>

              {/* Image drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleImageDrop}
                onClick={() => !imgPreview && imgRef.current?.click()}
                style={{
                  border: `2px dashed ${imgPreview ? C.accent : C.border}`,
                  borderRadius: 10, padding: imgPreview ? 8 : '28px 20px',
                  textAlign: 'center', cursor: imgPreview ? 'default' : 'pointer',
                  background: imgPreview ? 'transparent' : C.bg,
                  marginBottom: 14, transition: 'all 0.2s',
                }}
              >
                {imgPreview ? (
                  <div style={{ position: 'relative' }}>
                    <img src={imgPreview} alt="preview" style={{
                      width: '100%', borderRadius: 8, display: 'block', maxHeight: 220, objectFit: 'contain',
                    }} />
                    <button onClick={() => { setImgFile(null); setImgPreview(null) }} style={{
                      position: 'absolute', top: 6, right: 6,
                      background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 4,
                      color: '#fff', fontSize: 12, padding: '2px 8px', cursor: 'pointer',
                    }}>✕ Töröl</button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
                    <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                      Húzd ide vagy kattints a képhez
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>PNG · JPG · WEBP</div>
                  </>
                )}
              </div>
              <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => e.target.files[0] && handleImageSelect(e.target.files[0])} />

              <button
                onClick={handleVisionAnalyze}
                disabled={!imgFile || loading}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                  background: !imgFile || loading ? C.accentDim : C.accent,
                  color: '#0A0E1A', fontWeight: 700, fontSize: 14,
                  cursor: !imgFile || loading ? 'not-allowed' : 'pointer',
                  marginBottom: 8,
                }}
              >
                {loading ? '🔍 Vision AI elemez...' : '🤖 Elemzés Vision AI-val'}
              </button>

              {/* TrueView link */}
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px',
                fontSize: 11, color: C.muted, marginTop: 4,
              }}>
                💡 <strong style={{ color: C.text }}>Nincs CAD szoftvered?</strong>{' '}
                <a href="https://www.autodesk.com/products/dwg-trueview/overview"
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: C.accent }}>
                  AutoCAD DWG TrueView →
                </a>{' '}
                ingyenes nézőprogram, DXF exporttal is.
              </div>
            </div>
          )}

          {/* ── DXF tab ── */}
          {tab === 'dxf' && (
            <div>
              <div style={{ color: C.muted, fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
                Ha a DWG-t meg tudod nyitni, exportáld DXF formátumba és töltsd fel – ez adja a legjobb eredményt.
              </div>

              {/* How to export steps */}
              <div style={{
                background: 'rgba(0,229,160,0.05)', border: `1px solid ${C.accentBorder}`,
                borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12,
              }}>
                <div style={{ color: C.accent, fontWeight: 700, marginBottom: 8 }}>
                  AutoCAD / DWG TrueView → DXF export:
                </div>
                {['Nyisd meg a DWG fájlt', 'Fájl → Mentés másként → DXF', 'Verzió: AutoCAD 2010 DXF ajánlott', 'Töltsd fel az alábbi mezőbe'].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, color: C.muted }}>
                    <span style={{ color: C.accent, fontWeight: 700, minWidth: 16 }}>{i+1}.</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>

              <div
                onClick={() => dxfRef.current?.click()}
                style={{
                  border: `2px dashed ${dxfFile ? C.accent : C.border}`,
                  borderRadius: 10, padding: '20px', textAlign: 'center',
                  cursor: 'pointer', background: C.bg, marginBottom: 14,
                }}
              >
                {dxfFile ? (
                  <div style={{ color: C.accent, fontSize: 13, fontFamily: 'DM Mono' }}>
                    ✓ {dxfFile.name}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
                    <div style={{ color: C.text, fontSize: 13 }}>Kattints a DXF fájl kiválasztásához</div>
                  </>
                )}
              </div>
              <input ref={dxfRef} type="file" accept=".dxf" style={{ display: 'none' }}
                onChange={e => { setDxfFile(e.target.files[0]); setError('') }} />

              <button
                onClick={handleDxfUpload}
                disabled={!dxfFile || loading}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                  background: !dxfFile || loading ? C.accentDim : C.accent,
                  color: '#0A0E1A', fontWeight: 700, fontSize: 14,
                  cursor: !dxfFile || loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Elemzés...' : '📐 DXF elemzése'}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: '#FF6B6B18', border: '1px solid #FF6B6B40',
              color: '#FF6B6B', fontSize: 12, padding: '10px 14px',
              borderRadius: 8, marginTop: 12,
            }}>{error}</div>
          )}

          {/* Skip */}
          <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
            <span onClick={onClose} style={{
              color: C.muted, fontSize: 12, cursor: 'pointer',
              textDecoration: 'underline',
            }}>
              Folytatás a jelenlegi eredménnyel ({weakBlocks} elem)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Step 0: Upload ────────────────────────────────────────────────────────────
function UploadStep({ onParsed }) {
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const apiBase = import.meta.env.VITE_API_URL || ''

  // DWG Vision modal state
  const [dwgModal, setDwgModal] = useState(null) // { filename, weakResult } | null

  // Auto-trigger modal when DWG result is weak
  const DWG_CONFIDENCE_THRESHOLD = 0.5
  const DWG_MIN_BLOCKS = 3

  const processFiles = useCallback(async (fileList) => {
    const arr = Array.from(fileList)
    const newFiles = arr.map(f => ({ file: f, name: f.name, status: 'waiting', result: null, error: null }))
    setFiles(prev => [...prev, ...newFiles])

    // Jelmagyarázat fájlok azonosítása – ezeket először dolgozzuk fel
    const LEGEND_KW = ['jelmagyarazat', 'jelmagyarázat', 'legend', 'jeloles', 'jelölés', 'jelmag', 'jelkulcs']
    const isLegendFile = name => LEGEND_KW.some(kw => name.toLowerCase().includes(kw))

    // Jelmagyarázat PDF-ek előre
    const sorted = [...newFiles].sort((a, b) =>
      (isLegendFile(a.name) ? 0 : 1) - (isLegendFile(b.name) ? 0 : 1)
    )

    // Globális legend kontextus a többi PDF elemzéséhez
    let legendContext = null

    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i]
      const isDwg = f.name.toLowerCase().endsWith('.dwg')
      const isPdf = f.name.toLowerCase().endsWith('.pdf')

      setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'parsing' } : x))

      try {
        let result
        if (isPdf) {
          const base64 = await fileToBase64(f.file)
          result = await parsePdfBase64(base64, f.name, legendContext, apiBase)
          // Ha jelmagyarázat eredményt adott vissza, tárold el kontextusként
          if (result._legend && result._legend.length > 0) {
            legendContext = result._legend
          }
        } else if (isDwg) {
          const base64 = await fileToBase64(f.file)
          result = await parseDwgBase64(base64, f.name, apiBase)
          result._dwg_base64 = base64
        } else {
          // Large DXF files are parsed in a Web Worker — report progress
          result = await parseDxfFile(f.file, (pct) => {
            setFiles(prev => prev.map(x =>
              x.name === f.name ? { ...x, status: 'parsing', progress: pct } : x
            ))
          })
        }

        if (!result.success) throw new Error(result.error || 'Elemézési hiba')
        setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'done', result } : x))

        if (isDwg) {
          const blocks = result?.summary?.total_blocks || 0
          const conf   = result?._confidence || 0
          if (conf < DWG_CONFIDENCE_THRESHOLD || blocks < DWG_MIN_BLOCKS) {
            setDwgModal({ filename: f.name, weakResult: result })
          }
        }
      } catch (err) {
        // DWG-nél ne error status – mindig done + Vision modal
        if (isDwg) {
          const fallback = {
            success: true, blocks: [], lengths: [{ layer: 'DWG', length: 0, length_raw: 0, info: null }],
            layers: ['DWG'], units: { name: 'DWG' }, title_block: {},
            summary: { total_block_types: 0, total_blocks: 0, total_layers: 0, layers_with_lines: 0 },
            _source: 'dwg_text', _confidence: 0.1, _filename: f.name,
            _note: 'DWG feldolgozási hiba – Vision AI pontosítás szükséges.',
            warnings: [err.message],
          }
          setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'done', result: fallback } : x))
          setDwgModal({ filename: f.name, weakResult: fallback })
        } else {
          setFiles(prev => prev.map(x => x.name === f.name ? { ...x, status: 'error', error: err.message } : x))
        }
      }
    }
  }, [apiBase])

  const handleDrop = e => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }

  // When Vision/DXF result comes back from modal – override the DWG file's result
  const handleDwgImprove = (filename, newResult) => {
    setFiles(prev => prev.map(x => x.name === filename ? { ...x, result: newResult } : x))
    setDwgModal(null)
  }

  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const anyDone = files.some(f => f.status === 'done')

  const handleNext = () => {
    // Jelmagyarázat fájlok nem kerülnek az elemzési összesítőbe (csak kontextus szerepük volt)
    const results = files.filter(f => f.status === 'done' && f.result?._source !== 'legend_pdf').map(f => ({ name: f.name, rawFile: f.file, ...f.result }))
    onParsed(results)
  }

  return (
    <div>
      {dwgModal && (
        <DwgVisionModal
          filename={dwgModal.filename}
          weakResult={dwgModal.weakResult}
          apiBase={apiBase}
          onResult={result => handleDwgImprove(dwgModal.filename, result)}
          onClose={() => setDwgModal(null)}
        />
      )}
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
          Húzd ide a DXF / DWG / PDF fájlokat
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>vagy kattints a böngészéshez</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent, background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 4, padding: '2px 8px' }}>
            DXF – korlátlan méret ✓
          </span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent, background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 4, padding: '2px 8px' }}>
            DWG – direkt elemzés ✓
          </span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px' }}>
            PDF – Vision AI 🤖
          </span>
        </div>
        <input ref={inputRef} type="file" multiple accept=".dxf,.dwg,.pdf" style={{ display: 'none' }}
          onChange={e => processFiles(e.target.files)} />
      </div>

      {files.length > 0 && (() => {
        // Find the currently active (processing) file
        const activeFile = files.find(f => f.status === 'parsing')
        // Find last finished file to show done state briefly
        const lastDone = !activeFile && files.find(f => f.status === 'done')

        return (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Show big animation when a file is processing or just finished */}
            {(activeFile || (files.some(f => f.status === 'done') && files.some(f => f.status !== 'error'))) && (
              <div style={{ marginBottom: 4 }}>
                <FileProcessingAnimation
                  status={activeFile ? activeFile.status : 'done'}
                  filename={activeFile ? activeFile.name : (files.find(f => f.status === 'done')?.name || '')}
                />
              </div>
            )}

            {/* File list rows – always shown */}
            {files.map(f => (
              <div key={f.name} style={{
                background: C.bgCard,
                border: `1px solid ${f.status === 'done' ? '#00E5A020' : f.status === 'error' ? '#FF6B6B20' : C.border}`,
                borderRadius: 8, padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                transition: 'border-color 0.3s',
              }}>
                <span style={{ fontSize: 14, color: f.status === 'done' ? C.accent : f.status === 'error' ? C.red : C.muted }}>
                  {f.status === 'done' ? '✓' : f.status === 'error' ? '✕' : '…'}
                </span>
                <span style={{ flex: 1, color: C.text, fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{f.name}</span>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace',
                  color: f.status === 'error' ? C.red : f.status === 'done' ? C.accent : C.muted }}>
                  {f.status === 'waiting'    ? 'Várakozás...' :
                   f.status === 'parsing'    ? (
                     f.name.toLowerCase().endsWith('.pdf') ? '📐 PDF elemzés...' :
                     f.name.toLowerCase().endsWith('.dwg') ? '🔍 DWG elemzés...' :
                     f.progress != null ? `⚙️ DXF feldolgozás... ${f.progress}%` : '⚙️ DXF elemzés...'
                   ) :
                   f.status === 'done'       ? (() => {
                     const src = f.result?._source || ''
                     const blocks = f.result?.summary?.total_blocks || 0
                     if (src === 'legend_pdf')       return `📖 Jelmagyarázat: ${f.result?._legend?.length || 0} szimbólum`
                     if (src === 'vision_screenshot') return `🤖 Vision: ${blocks} elem`
                     if (src === 'dxf_replacement')  return `📐 DXF: ${blocks} elem`
                     if (src === 'vision_gpt4o')     return `🤖 Vision: ${blocks} elem (${Math.round((f.result?._vision_confidence||0)*100)}%)`
                     if (src === 'pdf_vector')        return `📐 PDF vektor: ${blocks} elem`
                     if (src === 'vision_gpt4o' || src === 'vision_pdf') return `🤖 Vision AI: ${blocks} elem`
                     if (src.startsWith('dwg'))      return `📐 DWG: ${blocks} elem`
                     return `${(f.result?.blocks?.length||0) + (f.result?.lengths?.length||0)} elem`
                   })() :
                   f.error || 'Hiba'}
                </span>
                {/* Pontosít gomb – DWG done és gyenge eredmény esetén */}
                {f.status === 'done' && f.name.toLowerCase().endsWith('.dwg') &&
                 !['vision_screenshot','dxf_replacement'].includes(f.result?._source) && (
                  <button
                    onClick={() => setDwgModal({ filename: f.name, weakResult: f.result })}
                    style={{
                      background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                      borderRadius: 6, padding: '3px 8px', fontSize: 11,
                      color: C.accent, cursor: 'pointer', flexShrink: 0,
                      fontFamily: 'DM Mono, monospace',
                    }}
                  >🔍 Pontosít</button>
                )}
              </div>
            ))}
          </div>
        )
      })()}

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

// ─── DXF Fullscreen Modal ─────────────────────────────────────────────────────
function DxfFullscreenModal({ file, unitFactor, onClose }) {
  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: C.bgCard, borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📐</span>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>
            Tervrajz megtekintő
          </span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginLeft: 4 }}>
            — Kattints a számláláshoz, húzd a méréshez
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)', border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
            fontFamily: 'Syne', fontWeight: 600, fontSize: 13, color: C.text,
          }}
        >✕ Bezárás</button>
      </div>

      {/* Full-height viewer */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <DxfViewerPanel
          file={file}
          unitFactor={unitFactor}
          compact={false}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}

// ─── Step 1: Review (Split Panel — Viewer left, Data right) ────────────────
function ReviewStep({ parsedFiles, onNext, onBack }) {
  const [activeFile, setActiveFile] = useState(0)
  const [merged, setMerged] = useState(false)
  const [blockMappings, setBlockMappings] = useState({})
  const [lengthMappings, setLengthMappings] = useState({})
  const [showViewer, setShowViewer] = useState(false)
  const [fullscreenViewer, setFullscreenViewer] = useState(false)

  const file = parsedFiles[activeFile] || parsedFiles[0]
  const blocks = file?.blocks || []
  const lengths = file?.lengths || []
  const isDwgOrDxf = file?.name?.toLowerCase().endsWith('.dwg') || file?.name?.toLowerCase().endsWith('.dxf')

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

  // Get raw file for the active (non-merged) selection
  const rawFile = !merged && file?.rawFile && isDwgOrDxf ? file.rawFile : null
  const unitFactor = file?.units?.factor || null

  // Data panel content (shared between both layouts)
  const dataPanel = (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {/* File selector tabs */}
      {parsedFiles.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {parsedFiles.map((f, i) => (
            <button key={i} onClick={() => { setMerged(false); setActiveFile(i) }}
              style={{
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                background: !merged && activeFile === i ? C.accent + '20' : C.bgCard,
                border: `1px solid ${!merged && activeFile === i ? C.accent : C.border}`,
                color: !merged && activeFile === i ? C.accent : C.text,
              }}>{f.name}</button>
          ))}
          <button onClick={() => setMerged(true)}
            style={{
              padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
              background: merged ? C.accent + '20' : C.bgCard,
              border: `1px solid ${merged ? C.accent : C.border}`,
              color: merged ? C.accent : C.text,
            }}>🔀 Összesített</button>
        </div>
      )}

      {allBlocks.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            Blokkok ({allBlocks.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.muted }}>Rajz azonosító</th>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.muted }}>Db</th>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.muted }}>Anyag / Tétel</th>
              </tr>
            </thead>
            <tbody>
              {allBlocks.map((b, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  <td style={{ padding: '6px 10px', color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>{b.name}</td>
                  <td style={{ padding: '6px 10px', color: C.accent, fontWeight: 600 }}>{b.count}</td>
                  <td style={{ padding: '6px 10px', minWidth: 160 }}>
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
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.text, fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            📏 Hosszak ({allLengths.length} layer)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.muted }}>Layer</th>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.muted }}>Hossz (m)</th>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: C.muted }}>Anyag / Tétel</th>
              </tr>
            </thead>
            <tbody>
              {allLengths.map((l, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}30` }}>
                  <td style={{ padding: '6px 10px', color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>{l.layer}</td>
                  <td style={{ padding: '6px 10px', color: C.blue, fontWeight: 600 }}>{fmtM(l.length)}</td>
                  <td style={{ padding: '6px 10px', minWidth: 160 }}>
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
        <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
          <div style={{ fontSize: 36 }}>📭</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>Nem találtunk elemzendő adatot</div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Fullscreen viewer portal */}
      {fullscreenViewer && rawFile && (
        <DxfFullscreenModal
          file={rawFile}
          unitFactor={unitFactor}
          onClose={() => setFullscreenViewer(false)}
        />
      )}

      {/* Viewer buttons */}
      {rawFile && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setShowViewer(v => !v)}
            style={{
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              fontSize: 11, fontFamily: 'DM Mono',
              background: showViewer ? C.accent + '10' : 'transparent',
              border: `1px solid ${showViewer ? C.accent + '40' : C.border}`,
              color: showViewer ? C.accent : C.muted,
            }}
          >
            {showViewer ? '📐 Előnézet elrejtése' : '📐 Kis előnézet'}
          </button>
          <button
            onClick={() => setFullscreenViewer(true)}
            style={{
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              fontSize: 11, fontFamily: 'DM Mono',
              background: C.accent + '15',
              border: `1px solid ${C.accent + '50'}`,
              color: C.accent, fontWeight: 600,
            }}
          >⛶ Teljes képernyő — Mérés & Számlálás</button>
        </div>
      )}

      {/* Split panel (viewer + data) or just data */}
      <div style={{
        display: 'flex', gap: 16, flex: 1, minHeight: 0,
        flexDirection: showViewer && rawFile ? 'row' : 'column',
      }}>
        {/* Left: DXF Viewer (small preview) */}
        {showViewer && rawFile && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 400, position: 'relative' }}>
            <DxfViewerPanel
              file={rawFile}
              unitFactor={unitFactor}
              compact={true}
              style={{ height: '100%' }}
            />
            {/* Overlay hint */}
            <div
              onClick={() => setFullscreenViewer(true)}
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent',
                cursor: 'pointer',
                opacity: 0,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}
            >
              <div style={{
                background: 'rgba(0,0,0,0.75)',
                border: `1px solid ${C.accent}`,
                borderRadius: 8, padding: '10px 20px',
                color: C.accent, fontFamily: 'Syne', fontWeight: 700, fontSize: 14,
              }}>⛶ Teljes képernyőn megnyitás</div>
            </div>
          </div>
        )}

        {/* Right: Data tables */}
        <div style={{
          flex: showViewer && rawFile ? '0 0 420px' : 1,
          display: 'flex', flexDirection: 'column', minHeight: 0,
          maxWidth: showViewer && rawFile ? 420 : '100%',
        }}>
          {dataPanel}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, flexShrink: 0 }}>
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
function PricingStep({ reviewData, context, settings, materials, cableEstimate, onNext, onBack }) {
  const [laborMode, setLaborMode] = useState('hourly')
  const [hourlyRate, setHourlyRate] = useState(settings.labor.hourly_rate)
  const [margin, setMargin] = useState(settings.labor.default_margin)
  const [vat, setVat] = useState(settings.labor.vat_percent)
  const [items, setItems] = useState(() => buildInitialItems(reviewData, context, materials))

  function buildInitialItems(rd, ctx, mats) {
    const result = []
    const allWI = loadWorkItems()
    const allAssemblies = loadAssemblies()

    // Context factor
    const wallF = CONTEXT_FACTORS.wall_material.options.find(o => o.key === ctx.wall_material)?.factor || 1
    const accessF = CONTEXT_FACTORS.access.options.find(o => o.key === ctx.access)?.factor || 1
    const projF = CONTEXT_FACTORS.project_type.options.find(o => o.key === ctx.project_type)?.factor || 1
    const heightF = CONTEXT_FACTORS.height.options.find(o => o.key === ctx.height)?.factor || 1

    // Helper: expand a single item (or assembly) into result rows
    const expandItem = (mappedName, qty, unit, sourceId, type) => {
      // Check if mappedName is an assembly ID (ASM-xxx)
      const assembly = allAssemblies.find(a => a.id === mappedName)
      if (assembly) {
        // Assembly group header (non-priced, just for visual grouping)
        result.push({
          id: `${sourceId}-asm-header`,
          name: `📦 ${assembly.name}`,
          qty: qty, unit: unit,
          normMinutes: 0, hours: 0, unitPrice: 0,
          type: 'assembly-header', isGroupHeader: true,
        })
        // Expand each component × block quantity
        assembly.components.forEach((comp, ci) => {
          const compQty = comp.qty * qty
          if (comp.itemType === 'workitem') {
            const wi = allWI.find(w => w.code === comp.itemCode) || allWI.find(w => w.name === comp.name) || WORK_ITEMS_DB.find(w => w.name === comp.name)
            const normMinutes = wi ? wi.p50 * wallF * accessF * projF * (wi.heightFactor ? heightF : 1) : 0
            result.push({
              id: `${sourceId}-asm-${ci}`,
              name: `  ↳ ${comp.name}`, qty: compQty, unit: comp.unit,
              normMinutes, hours: (normMinutes * compQty) / 60,
              unitPrice: 0, type: type, assemblyId: assembly.id,
            })
          } else {
            // material
            const mat = mats.find(m => m.code === comp.itemCode) || mats.find(m => m.name === comp.name)
            const wi = allWI.find(w => w.name === comp.name)
            const normMinutes = wi ? wi.p50 * wallF * accessF * projF * (wi.heightFactor ? heightF : 1) : 0
            result.push({
              id: `${sourceId}-asm-${ci}`,
              name: `  ↳ ${comp.name}`, qty: compQty, unit: comp.unit,
              normMinutes, hours: (normMinutes * compQty) / 60,
              unitPrice: mat?.price * (1 - (mat?.discount || 0) / 100) || 0,
              type: type, assemblyId: assembly.id,
            })
          }
        })
        return
      }

      // Regular item (not assembly)
      const wi = allWI.find(w => w.name === mappedName) || WORK_ITEMS_DB.find(w => w.name === mappedName)
      const normMinutes = wi ? wi.p50 * wallF * accessF * projF * (wi.heightFactor ? heightF : 1) : 0
      const mat = mats.find(m => m.name === mappedName)
      result.push({
        id: sourceId,
        name: mappedName, qty, unit,
        normMinutes, hours: (normMinutes * qty) / 60,
        unitPrice: mat?.price * (1 - (mat?.discount || 0) / 100) || 0,
        type,
      })
    }

    // Blocks
    ;(rd?.blocks || []).forEach(b => {
      const name = rd?.blockMappings?.[b.name] || b.name
      expandItem(name, b.count, 'db', `b-${b.name}`, 'block')
    })

    // Lengths
    ;(rd?.lengths || []).forEach(l => {
      const name = rd?.lengthMappings?.[l.layer] || l.layer
      expandItem(name, l.length, 'm', `l-${l.layer}`, 'length')
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
        {[['hourly', 'Órabéres', 'Össz munkaórák × óradíj'], ['per_item', 'Tételes', 'Minden tétel egyedi munkadíj']].map(([key, label, desc]) => (
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
            onChange={v => setHourlyRate(parseFloat(v) || 0)} suffix="Ft/ó" />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <Input label="Árrés szorzó" type="number" value={margin} step="0.01"
            onChange={v => setMargin(parseFloat(v) || 1)} />
        </div>
        <div style={{ flex: 1, minWidth: 100 }}>
          <Input label="ÁFA (%)" type="number" value={vat}
            onChange={v => setVat(parseFloat(v) || 27)} suffix="%" />
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
                if (item.isGroupHeader) {
                  return (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}20`, background: 'rgba(0,229,160,0.04)' }}>
                      <td colSpan={5} style={{ padding: '8px 10px', color: C.accent, fontWeight: 700, fontSize: 12 }}>
                        {item.name} <span style={{ color: C.textMuted, fontWeight: 400 }}>× {item.qty}</span>
                      </td>
                    </tr>
                  )
                }
                const laborCost = (item.hours || 0) * hourlyRate
                return (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: '8px 10px', color: item.assemblyId ? C.textSub : C.text, fontSize: item.assemblyId ? 11 : 12 }}>{item.name}</td>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 16 }}>
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
    if (!w) { alert('A böngésző blokkolta a nyomtatási ablakot. Engedélyezd a felugró ablakokat ehhez az oldalhoz.'); return }
    w.document.write(html)
    w.document.close()
    w.print()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input label="Projekt neve" value={projectName} onChange={v => setProjectName(v)}
            placeholder="pl. Belvárosi iroda felújítás" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input label="Megrendelő neve" value={clientName} onChange={v => setClientName(v)}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
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
              <span style={{ color: C.accent, fontSize: 13 }}>Mentve: {quoteId}</span>
              <Button variant="secondary" onClick={onNewProject}>+ Új projekt</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Assemblies: moved to pages/Assemblies.jsx ────────────────────────────────

// ─── Quote View ────────────────────────────────────────────────────────────────
function QuoteView({ quote, onBack, onStatusChange }) {
  const statuses = ['draft', 'sent', 'won', 'lost']
  const statusLabels = { draft: 'Piszkozat', sent: 'Elküldve', won: 'Nyertes', lost: 'Elveszett' }
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
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

// ─── CableEstimateStep ─────────────────────────────────────────────────────────
function CableEstimateStep({ parsedFiles, reviewData, onNext, onBack }) {
  const [status, setStatus] = useState('idle') // idle | extracting | ai_running | fallback | done | error
  const [estimate, setEstimate] = useState(null)
  const [error, setError] = useState(null)
  // Editable approved values (user can adjust before proceeding)
  const [approved, setApproved] = useState(null) // { socket_m, light_m, switch_m, other_m, total_m }
  const [editMode, setEditMode] = useState(false)
  const apiBase = import.meta.env.VITE_API_URL || ''

  const run = useCallback(async (withAI = true) => {
    setStatus('extracting')
    setError(null)
    setEstimate(null)
    setApproved(null)

    try {
      // Csak valódi DXF fájlból nyerünk geometriát – DWG/PDF esetén a reviewData alapján becsülünk
      const dxfFile = parsedFiles.find(f => f.name?.toLowerCase().endsWith('.dxf'))

      let geometry
      if (dxfFile?._rawText) {
        // DXF szöveg már kinyerve
        geometry = extractGeometry(dxfFile._rawText)
      } else if (dxfFile?.file instanceof Blob) {
        // DXF fájl Blob-ként elérhető
        const text = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload = e => res(e.target.result)
          reader.onerror = rej
          reader.readAsText(dxfFile.file, 'utf-8')
        })
        geometry = extractGeometry(text)
      } else {
        // DWG/PDF esetén: a már feldolgozott reviewData-ból építjük fel a geometriát
        geometry = buildGeometryFromBlocks(reviewData)
      }

      if (!withAI) {
        setStatus('fallback')
        const result = estimateCablesFallback(geometry)
        setEstimate(result)
        setApproved(buildApproved(result))
        setStatus('done')
        return
      }

      setStatus('ai_running')
      try {
        const result = await runCableAgent({ geometry, screenshotBase64: null, apiBase })
        setEstimate(result)
        setApproved(buildApproved(result))
        setStatus('done')
      } catch (aiErr) {
        const result = estimateCablesFallback(geometry)
        result._fallback_reason = aiErr.message
        setEstimate(result)
        setApproved(buildApproved(result))
        setStatus('done')
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [parsedFiles, reviewData, apiBase])

  const buildApproved = (est) => ({
    socket_m: est.cable_by_type?.socket_m ?? 0,
    light_m:  est.cable_by_type?.light_m ?? 0,
    switch_m: est.cable_by_type?.switch_m ?? 0,
    other_m:  est.cable_by_type?.other_m ?? 0,
    total_m:  est.cable_total_m ?? 0,
  })

  const updateApproved = (key, val) => {
    const v = Math.max(0, parseInt(val) || 0)
    setApproved(prev => {
      const next = { ...prev, [key]: v }
      next.total_m = next.socket_m + next.light_m + next.switch_m + next.other_m
      return next
    })
  }

  const handleProceed = () => {
    onNext({
      ...estimate,
      cable_total_m: approved.total_m,
      cable_by_type: {
        socket_m: approved.socket_m,
        light_m:  approved.light_m,
        switch_m: approved.switch_m,
        other_m:  approved.other_m,
      },
      _user_approved: true,
      _approved_at: new Date().toISOString(),
    })
  }

  const confidenceColor = (c) => c >= 0.75 ? C.accent : c >= 0.5 ? '#FFD166' : '#FF6B6B'
  const confidenceLabel = (c) => c >= 0.75 ? 'Magas' : c >= 0.5 ? 'Közepes' : 'Alacsony'

  const EditableRow = ({ label, icon, field, color }) => {
    if (!approved) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{icon}</span>
        <span style={{ flex: 1, fontFamily: 'DM Mono', fontSize: 13, color: C.text }}>{label}</span>
        {editMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min="0" value={approved[field] ?? 0}
              onChange={e => updateApproved(field, e.target.value)}
              style={{ width: 80, background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '4px 8px', color: C.text, fontFamily: 'DM Mono', fontSize: 14, textAlign: 'right' }}
            />
            <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>m</span>
          </div>
        ) : (
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: color || C.text }}>
            {(approved[field] ?? 0).toLocaleString('hu-HU')} m
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: C.text }}>AI Kábelterv becslés</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>Ellenőrizd és szükség esetén módosítsd az AI becslést mielőtt az anyaglistába kerül</div>
          </div>
        </div>
      </div>

      {/* ── IDLE ── */}
      {status === 'idle' && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔌</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: C.text, marginBottom: 8 }}>
            Kábelhossz automatikus becslése
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.muted, marginBottom: 28, maxWidth: 480, margin: '0 auto 28px' }}>
            A Vision AI elemzi a tervrajzot, azonosítja az elosztókat, csoportosítja az áramköröket és kiszámolja a becsült kábelhosszt. Az eredményt jóváhagyhatod vagy módosíthatod.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => run(true)} style={{ padding: '12px 28px', background: C.accent, color: C.bg, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>
              🧠 AI Vision elemzés
            </button>
            <button onClick={() => run(false)} style={{ padding: '12px 22px', background: C.bgCard, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 13 }}>
              📐 Gyors becslés (AI nélkül)
            </button>
          </div>
          <div style={{ marginTop: 16, fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
            Vagy:{' '}
            <button onClick={() => onNext(null)} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono' }}>
              kihagyom ezt a lépést →
            </button>
          </div>
        </div>
      )}

      {/* ── RUNNING ── */}
      {(status === 'extracting' || status === 'ai_running' || status === 'fallback') && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 16, color: C.text, marginBottom: 8 }}>
            {status === 'extracting' ? 'Geometria kinyerése...'
              : status === 'ai_running' ? 'AI Vision elemzés folyamatban...'
              : 'Gyors becslés számítása...'}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>
            {status === 'ai_running'
              ? 'Claude claude-sonnet-4-6 Vision elemzi a tervrajzot · ha nem válaszol, GPT-4o veszi át (30–90 mp)'
              : 'Koordináta alapú Manhattan-becslés...'}
          </div>
          {/* Progress steps */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {['Geometria', 'Elosztók', 'Áramkörök', 'Kábelhossz'].map((s, i) => {
              const stepIdx = status === 'extracting' ? 0 : status === 'ai_running' ? 2 : 3
              return (
                <div key={i} style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: i <= stepIdx ? 'rgba(0,229,160,0.12)' : 'transparent',
                  color: i <= stepIdx ? C.accent : C.muted,
                  border: `1px solid ${i <= stepIdx ? 'rgba(0,229,160,0.25)' : C.border}`,
                }}>{s}</div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {status === 'error' && (
        <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 14, padding: 24 }}>
          <div style={{ color: '#FF6B6B', fontFamily: 'Syne', fontWeight: 600, marginBottom: 8 }}>Hiba történt</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, marginBottom: 16 }}>{error}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => run(false)} style={{ padding: '8px 16px', background: C.bgCard, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>📐 Gyors becslés</button>
            <button onClick={() => onNext(null)} style={{ padding: '8px 16px', background: 'transparent', color: C.muted, border: 'none', cursor: 'pointer', fontSize: 13 }}>Kihagyás</button>
          </div>
        </div>
      )}

      {/* ── DONE – APPROVAL UI ── */}
      {status === 'done' && estimate && approved && (
        <div>
          {/* AI badge + confidence */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '4px 10px', borderRadius: 20, background: estimate._source === 'n8n_claude_vision' ? 'rgba(0,229,160,0.1)' : estimate._source === 'n8n_gpt4o_fallback' ? 'rgba(76,201,240,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${estimate._source?.includes('n8n') ? (estimate._source === 'n8n_claude_vision' ? 'rgba(0,229,160,0.25)' : 'rgba(76,201,240,0.25)') : C.border}`, color: estimate._source === 'n8n_claude_vision' ? C.accent : estimate._source === 'n8n_gpt4o_fallback' ? '#4CC9F0' : C.muted }}>
              {estimate._source === 'n8n_claude_vision' ? '🧠 Claude Vision AI' : estimate._source === 'n8n_gpt4o_fallback' ? '🤖 GPT-4o (fallback)' : '📐 Determinisztikus becslés'}
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'transparent', border: `1px solid ${confidenceColor(estimate.confidence)}`, color: confidenceColor(estimate.confidence) }}>
              {confidenceLabel(estimate.confidence)} bizalom · {Math.round((estimate.confidence || 0) * 100)}%
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>{estimate.method}</div>
          </div>

          {/* Total + edit toggle */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 4 }}>JÓVÁHAGYOTT KÁBEL ÖSSZESEN</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {editMode ? (
                  <input type="number" min="0" value={approved.total_m}
                    onChange={e => setApproved(p => ({ ...p, total_m: Math.max(0, parseInt(e.target.value) || 0) }))}
                    style={{ width: 120, background: C.bg, border: `1px solid ${C.accent}`, borderRadius: 8, padding: '4px 10px', color: C.accent, fontFamily: 'Syne', fontWeight: 900, fontSize: 36, textAlign: 'right' }}
                  />
                ) : (
                  <div style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 42, color: C.accent, lineHeight: 1 }}>
                    {approved.total_m.toLocaleString('hu-HU')}
                  </div>
                )}
                <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 22, color: C.muted }}>m</span>
                {estimate.cable_total_m !== approved.total_m && (
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#FFD166' }}>
                    (AI: {estimate.cable_total_m?.toLocaleString('hu-HU')} m)
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setEditMode(e => !e)} style={{ padding: '8px 16px', background: editMode ? C.accent + '20' : C.bg, border: `1px solid ${editMode ? C.accent : C.border}`, borderRadius: 8, cursor: 'pointer', color: editMode ? C.accent : C.muted, fontFamily: 'DM Mono', fontSize: 12 }}>
              {editMode ? '✓ Szerkesztés kész' : '✏ Módosítás'}
            </button>
          </div>

          {/* Breakdown – editable rows */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 13, color: C.text }}>Bontás típusonként</span>
              {editMode && <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent }}>✏ Szerkeszthető</span>}
            </div>
            <EditableRow label="Dugalj körök" icon="🔌" field="socket_m" color="#4CC9F0" />
            <EditableRow label="Lámpa körök" icon="💡" field="light_m" color="#FFD166" />
            <EditableRow label="Kapcsolók" icon="🔘" field="switch_m" color={C.muted} />
            <EditableRow label="Egyéb" icon="⚡" field="other_m" color={C.muted} />
          </div>

          {/* Circuits summary (collapsed) */}
          {estimate.circuits?.length > 0 && (
            <details style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14, padding: '10px 16px', cursor: 'pointer' }}>
              <summary style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 13, color: C.text, listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}>
                <span>Áramkörök részletezés ({estimate.circuits.length} kör)</span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>▼ részletek</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                {estimate.circuits.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: i < estimate.circuits.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 14 }}>{c.type === 'socket' ? '🔌' : c.type === 'light' ? '💡' : '⚡'}</span>
                    <span style={{ flex: 1, fontFamily: 'DM Mono', fontSize: 12, color: C.text }}>{c.id} – {c.notes || c.type}</span>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted }}>{c.device_count} eszköz</span>
                    <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>{c.estimated_length_m} m</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Warnings */}
          {estimate.warnings?.length > 0 && (
            <div style={{ background: 'rgba(255,209,102,0.06)', border: '1px solid rgba(255,209,102,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              {estimate.warnings.map((w, i) => (
                <div key={i} style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#FFD166', marginBottom: i < estimate.warnings.length - 1 ? 3 : 0 }}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* AI reasoning */}
          {estimate.reasoning && (
            <div style={{ background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.1)', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.accent, letterSpacing: '0.08em', marginBottom: 4 }}>AI INDOKLÁS</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{estimate.reasoning}</div>
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setStatus('idle'); setEstimate(null); setApproved(null) }} style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.muted, fontFamily: 'DM Mono', fontSize: 12 }}>
                ↺ Újrafuttatás
              </button>
              <button onClick={onBack} style={{ padding: '9px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.text, fontFamily: 'DM Mono', fontSize: 13 }}>
                ← Vissza
              </button>
            </div>
            <button onClick={handleProceed} style={{ padding: '11px 32px', background: C.accent, color: C.bg, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 15 }}>
              Jóváhagyom · Tovább →
            </button>
          </div>
        </div>
      )}

      {/* Back when idle */}
      {status === 'idle' && (
        <div style={{ marginTop: 16 }}>
          <button onClick={onBack} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', color: C.muted, fontFamily: 'DM Mono', fontSize: 13 }}>
            ← Vissza
          </button>
        </div>
      )}
    </div>
  )
}

// Build minimal geometry from block data (when no DXF text available)
function buildGeometryFromBlocks(reviewData) {
  const blocks = reviewData?.blocks || []
  const lengths = reviewData?.lengths || []
  const PANEL_KW = ['ELOSZTO', 'PANEL', 'DB', 'MDB', 'SZEKRÉNY', 'ELOSZTÓ']
  const SOCKET_KW = ['DUGALJ', 'SOCKET', 'ALJZAT', 'ERŐÁTVITELI', 'EROATVITELI']
  const LIGHT_KW = ['LAMPA', 'LÁMPA', 'LIGHT', 'LED', 'VILAGITAS', 'VILÁGÍTÁS']
  const TRAY_KW = ['TALCA', 'TÁLCA', 'TRAY', 'KABELTALCA', 'KÁBELTÁLCA']
  const classify = (name) => {
    const up = (name || '').toUpperCase()
    if (PANEL_KW.some(k => up.includes(k))) return 'panel'
    if (SOCKET_KW.some(k => up.includes(k))) return 'socket'
    if (LIGHT_KW.some(k => up.includes(k))) return 'light'
    return 'unknown'
  }
  const devices = [], panels = []
  let x = 0
  for (const b of blocks) {
    for (let i = 0; i < (b.count || 1); i++) {
      const type = classify(b.name)
      const d = { type, name: b.name, layer: b.layer || '', x: x * 1000, y: 0 }
      x += 1
      if (type === 'panel') panels.push(d)
      else devices.push(d)
    }
  }

  // Kábel/tálca hosszak beépítése polyline-ként
  const polylines = []
  let hasTray = false
  for (const lenEntry of lengths) {
    const lengthM = lenEntry.length || lenEntry.length_raw || 0
    if (lengthM <= 0) continue
    const info = lenEntry.info || {}
    const isTray = TRAY_KW.some(k => (info.name || lenEntry.layer || '').toUpperCase().includes(k))
    if (isTray) hasTray = true
    // Reprezentálj egy egyenes polyline-t a megadott hosszal (mm-ben)
    polylines.push({
      layer: lenEntry.layer || 'CABLE',
      length: lengthM * 1000,  // mm-be konvertálva
      isTray,
      color: info.color || null,
    })
  }

  const scaleFactor = reviewData?._scale?.m_per_pt || 0.001
  return {
    devices, panels, polylines,
    scale: { factor: scaleFactor, unit: 'm' },
    bounds: { minX: 0, maxX: Math.max(x * 1000, 10000), minY: 0, maxY: 5000 },
    stats: { has_tray_layers: hasTray, has_wall_layers: false },
    _from_blocks: true,
    _block_count: devices.length + panels.length,
    _cable_m: polylines.filter(p => !p.isTray).reduce((s, p) => s + p.length / 1000, 0),
    _tray_m: polylines.filter(p => p.isTray).reduce((s, p) => s + p.length / 1000, 0),
  }
}

// ─── New Quote Wizard (full) ───────────────────────────────────────────────────
function NewQuoteWizard({ settings, materials, onSaved, onCancel }) {
  const [step, setStep] = useState(0)
  const [parsedFiles, setParsedFiles] = useState([])
  const [reviewData, setReviewData] = useState(null)
  const [cableEstimate, setCableEstimate] = useState(null)
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
        <CableEstimateStep
          parsedFiles={parsedFiles}
          reviewData={reviewData}
          onNext={est => { setCableEstimate(est); setStep(3) }}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <ContextStep context={context} onChange={setContext} settings={settings} onNext={() => setStep(4)} onBack={() => setStep(2)} />
      )}
      {step === 4 && (
        <PricingStep reviewData={reviewData} context={context} settings={settings} materials={materials} cableEstimate={cableEstimate}
          onNext={pd => { setPricingData(pd); setStep(5) }} onBack={() => setStep(3)} />
      )}
      {step === 5 && (
        <QuoteResultStep pricingData={pricingData} context={context} settings={settings}
          onBack={() => setStep(4)} onSaved={onSaved} onNewProject={onCancel} />
      )}
    </div>
  )
}

// ─── SaaS Shell ────────────────────────────────────────────────────────────────

// ── AuthModal ─────────────────────────────────────────────────────────────────
function AuthModal({ onAuth }) {
  const [mode, setMode]       = useState('login') // login | register
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const submit = async () => {
    setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password, name)
      }
      onAuth()
    } catch (e) {
      setError(e.message || 'Hiba történt')
    } finally { setLoading(false) }
  }

  const inp = {
    width: '100%', padding: '10px 14px', background: '#1A1F2E',
    border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: '36px 32px', width: '100%', maxWidth: 400, boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          {mode === 'login' ? 'Bejelentkezés' : 'Regisztráció'}
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>TakeoffPro fiók</div>

        {mode === 'register' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Teljes név</div>
            <input style={inp} placeholder="Kovács János" value={name}
              onChange={e => setName(e.target.value)} />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>E-mail</div>
          <input style={inp} type="email" placeholder="email@ceg.hu" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>Jelszó</div>
          <input style={inp} type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {error && (
          <div style={{ background: '#FF6B6B18', border: '1px solid #FF6B6B40',
            color: '#FF6B6B', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !email || !password}
          style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: loading ? C.accentDim : C.accent, color: '#0A0E1A',
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Folyamatban...' : (mode === 'login' ? 'Bejelentkezés' : 'Fiók létrehozása')}
        </button>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: C.muted }}>
          {mode === 'login' ? 'Még nincs fiókod?' : 'Már van fiókod?'}{' '}
          <span
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{ color: C.accent, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {mode === 'login' ? 'Regisztráció' : 'Bejelentkezés'}
          </span>
        </div>

        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: C.muted }}>
          Folytatás bejelentkezés nélkül →{' '}
          <span onClick={onAuth} style={{ color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>
            vendégként
          </span>
        </div>
      </div>
    </div>
  )
}

function SaaSShell() {
  const [page, setPage] = useState('dashboard')
  const [settings, setSettings] = useState(loadSettings)
  const [materials, setMaterials] = useState(loadMaterials)
  const [quotes, setQuotes] = useState(loadQuotes)
  const [viewingQuote, setViewingQuote] = useState(null)

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [session, setSession] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUserEmail(session?.user?.email || '')
      setAuthChecked(true)
    })
    const { data: { subscription } } = onAuthChange(s => {
      setSession(s)
      setUserEmail(s?.user?.email || '')
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Subscription state ────────────────────────────────────────────────────
  const [subStatus, setSubStatus] = useState({ plan: 'free', active: false })
  useEffect(() => {
    if (session) {
      getSubscriptionStatus()
        .then(s => setSubStatus(s))
        .catch(() => setSubStatus({ plan: 'free', active: false }))
    }
  }, [session])

  const handleSignOut = async () => {
    await signOut()
    setSession(null)
    setUserEmail('')
    setSubStatus({ plan: 'free', active: false })
  }

  const pageTitles = {
    dashboard: 'Dashboard', quotes: 'Ajánlatok', 'new-quote': 'Új ajánlat',
    plans: 'Tervek', 'work-items': 'Munkatételek', assemblies: 'Assemblyk', settings: 'Beállítások',
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
    // Sync to Supabase if logged in
    if (session) saveQuoteRemote(quote).catch(console.error)
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

  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  React.useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const sidebarW = 220
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {showAuth && <AuthModal onAuth={() => setShowAuth(false)} />}
      <Sidebar
        active={page}
        onNavigate={p => { setViewingQuote(null); setPage(p) }}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
      />
      <div style={{ marginLeft: isMobile ? 0 : sidebarW, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }}>
        {/* Top bar */}
        <div style={{
          height: 52, background: C.bgCard, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '0 16px',
          justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setSidebarMobileOpen(true)} style={{
                background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7,
                padding: '6px 8px', cursor: 'pointer', flexShrink: 0,
                display: 'flex', flexDirection: 'column', gap: 3.5, alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ display: 'block', width: 15, height: 1.5, background: C.muted, borderRadius: 1 }} />
                <span style={{ display: 'block', width: 15, height: 1.5, background: C.muted, borderRadius: 1 }} />
                <span style={{ display: 'block', width: 15, height: 1.5, background: C.muted, borderRadius: 1 }} />
              </button>
            )}
            <div style={{ color: C.text, fontWeight: 600, fontSize: isMobile ? 14 : 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {viewingQuote ? viewingQuote.projectName : pageTitles[page] || page}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {session ? (
              <>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 20, padding: '3px 10px', maxWidth: 160,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ⚡ {userEmail}
                </span>
                <button onClick={handleSignOut} style={{
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
                  color: C.muted, fontSize: 12,
                }}>Ki</button>
              </>
            ) : (
              <>
                <span style={{
                  fontFamily: 'DM Mono', fontSize: 10, color: '#FFD166',
                  background: 'rgba(255,209,102,0.1)', border: '1px solid rgba(255,209,102,0.3)',
                  borderRadius: 20, padding: '2px 8px',
                }}>⚠️ TESZT – vendég mód</span>
                <button onClick={() => setShowAuth(true)} style={{
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 7, padding: '5px 14px', cursor: 'pointer',
                  color: C.accent, fontSize: 12, fontWeight: 600,
                }}>Bejelentkezés</button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '20px 14px' : '32px 28px', maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
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
            // TESZT MÓD: login + subscription gate kikapcsolva — éles kiadás előtt visszakapcsolni!
            // Éles kiadásnál:
            //   (!session) ? <LoginWall /> : (!subStatus.active && subStatus.plan !== 'free') ? <UpgradeWall /> :
            <NewQuoteWizard settings={settings} materials={materials}
              onSaved={handleQuoteSaved} onCancel={() => setPage('quotes')} />
          ) : page === 'work-items' ? (
            <WorkItems workItems={workItems} onWorkItemsChange={wis => { setWorkItems(wis) }} />
          ) : page === 'plans' ? (
            <PlansPage />
          ) : page === 'assemblies' ? (
            <AssembliesPage />
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

async function parseDwgBase64(base64, filename, apiBase) {
  const res = await fetch(`${apiBase}/api/parse-dwg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dwg_base64: base64, filename }),
  })
  if (!res.ok) throw new Error('DWG elemzés sikertelen')
  return await res.json()
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

async function parsePdfBase64(base64, filename, legendContext, apiBase) {
  const LEGEND_KW = ['jelmagyarazat', 'jelmagyarázat', 'legend', 'jeloles', 'jelmag', 'jelkulcs']
  const isLegend = LEGEND_KW.some(kw => (filename || '').toLowerCase().includes(kw))

  // Jelmagyarázatnál csak a legend promptot használjuk
  if (isLegend) {
    const res = await fetch(`${apiBase}/api/parse-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_base64: base64, filename, legend_context: null }),
    })
    if (!res.ok) throw new Error('PDF jelmagyarázat elemzés sikertelen')
    return await res.json()
  }

  // 1. Lépés: Vektoros PDF elemzés (gyors, pontos színalapú)
  try {
    const vRes = await fetch(`${apiBase}/api/parse-pdf-vectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf_base64: base64, filename: filename || '' }),
    })
    if (vRes.ok) {
      const vResult = await vRes.json()
      if (vResult.success && vResult._confidence >= 0.60) {
        // Jó vektoros eredmény - nem kérünk Vision AI-t
        return vResult
      }
      // Gyenge vektoros eredmény - folytatjuk Vision AI-val de menti a vektoros adatot
      console.log('PDF vector confidence low:', vResult._confidence, '- falling back to Vision AI')
    }
  } catch (e) {
    console.warn('PDF vector analysis failed:', e.message)
  }

  // 2. Lépés: Vision AI (GPT-4o) - ha vektoros elemzés gyenge volt
  const res = await fetch(`${apiBase}/api/parse-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdf_base64: base64, filename: filename || '', legend_context: legendContext || null }),
  })
  if (!res.ok) throw new Error('PDF elemzés sikertelen')
  return await res.json()
}

// ─── CSS animations ────────────────────────────────────────────────────────────
const styleEl = document.createElement('style')
styleEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(styleEl)

// ─── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [route, setRoute] = useState(() => {
    const path = window.location.pathname
    const hash = window.location.hash
    if (path === '/success' || hash === '#success') return 'success'
    if (hash === '#app') return 'app'
    return 'landing'
  })

  if (route === 'success') return <SuccessPage />
  if (route === 'app') return <SaaSShell />
  return <Landing onStart={() => { window.location.hash = '#app'; setRoute('app') }} />
}
