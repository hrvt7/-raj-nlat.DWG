import { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { C, ConfirmDialog, EmptyState, Button, useToast } from '../components/ui.jsx'
import { isDemoSeeded, seedDemoData } from '../data/demoSeed.js'
import {
  loadPlans, getPlanFile, hasPlanFileLocally, savePlan, deletePlan,
  generatePlanId, savePlanThumbnail, getPlanThumbnail, getPlansByProject,
  updatePlanMeta,
} from '../data/planStore.js'
import { supabaseConfigured } from '../supabase.js'
import {
  loadProjects, saveProject, deleteProject, generateProjectId, getProject,
  ensureFallbackProject,
} from '../data/projectStore.js'
import {
  loadTemplates, getTemplatesByProject, deleteTemplatesByProject,
} from '../data/legendStore.js'
import {
  inferPlanMeta, inferMetaFromText, mergeMeta, extractPdfText,
  SYSTEM_TYPES, SYSTEM_TYPE_LABELS, DOC_TYPES, DOC_TYPE_LABELS,
} from '../utils/planMetaInference.js'
import { callAiMetaVision, mergeAiMeta, renderFirstPageImage } from '../utils/aiMetaVision.js'
import { parseDxfFile } from '../dxfParser.js'
import { normalizeDxfResult } from '../utils/dxfParseContract.js'
import { countQuotesForPlan } from '../utils/quoteOrphans.js'
import { clearProjectMemory } from '../data/recognitionMemory.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

// ─── File type support ───────────────────────────────────────────────────────
const FILE_TYPE_MAP = {
  'dxf': { color: '#00E5A0', label: 'DXF', bg: 'rgba(0,229,160,0.15)', border: 'rgba(0,229,160,0.3)' },
  'dwg': { color: '#FFD166', label: 'DWG', bg: 'rgba(255,209,102,0.15)', border: 'rgba(255,209,102,0.3)' },
  'pdf': { color: '#FF6B6B', label: 'PDF', bg: 'rgba(255,107,107,0.15)', border: 'rgba(255,107,107,0.3)' },
}

function getFileType(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop()
  if (ext === 'dwg') return 'dwg'
  if (ext === 'dxf') return 'dxf'
  return 'pdf'
}

const ALLOWED_EXTENSIONS = ['.pdf', '.dxf', '.dwg']
function isAllowedPlan(filename) {
  const lower = (filename || '').toLowerCase()
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext))
}

const MIME_TYPES = { pdf: 'application/pdf', dxf: 'text/plain', dwg: 'application/octet-stream' }
const FALLBACK_NAMES = { pdf: 'terv.pdf', dxf: 'terv.dxf', dwg: 'terv.dwg' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtSize = (bytes) => {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return iso }
}

async function generatePdfThumb(file, planId) {
  try {
    const ab = await file.arrayBuffer()
    const doc = await pdfjsLib.getDocument({ data: ab }).promise
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 0.5 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width; canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    await savePlanThumbnail(planId, dataUrl)
    return dataUrl
  } catch { return null }
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function CheckIcon({ size = 11, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function TrashIcon({ size = 13, color = C.muted }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
}
function CalcIcon({ size = 14, color = C.accent }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="12" y1="10" x2="14" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="12" y1="14" x2="14" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="12" y1="18" x2="16" y2="18"/></svg>
}
function BackIcon({ size = 16, color = C.text }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function FolderIcon({ size = 38, color = C.accent }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
}

// ─── Global animation style injection (runs once) ───────────────────────────
// All project card SVGs share a single @keyframes from the document <head>,
// so they stay perfectly in sync regardless of mount order.
let _pcStyleInjected = false
function ensurePcGlobalStyle() {
  if (_pcStyleInjected || typeof document === 'undefined') return
  _pcStyleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes pc-scan-move {
      0%, 100% { transform: translateY(120px); }
      50% { transform: translateY(380px); }
    }
    .pc-scanner-group { animation: pc-scan-move 3s ease-in-out infinite; }
    .pc-grid-bg { stroke: rgba(255,255,255,0.18); stroke-width: 1; opacity: 0.3; }
    .pc-doc-outline { stroke: #17C7FF; stroke-width: 2.5; fill: none; stroke-linejoin: round; stroke-linecap: round; }
    .pc-doc-inner { stroke: rgba(255,255,255,0.18); stroke-width: 2; fill: none; stroke-dasharray: 4 6; stroke-linecap: round; }
    .pc-scan-line { stroke: #21F3A3; stroke-width: 2; }
  `
  document.head.appendChild(style)
}

// ─── Instance counter for unique SVG defs ids ────────────────────────────────
let _pcIdCounter = 0

// ─── Projektkártya illusztráció (document scanner motívum) ───────────────────
function ProjectCardIllustration({ size = 48 }) {
  const idRef = useRef(++_pcIdCounter)
  const uid = idRef.current
  ensurePcGlobalStyle()

  const gridId = `pc-grid-${uid}`
  const glowId = `pc-glow-${uid}`
  const trailId = `pc-trail-${uid}`

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={gridId} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" className="pc-grid-bg" fill="none"/>
        </pattern>
        <filter id={glowId} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id={trailId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#21F3A3" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#21F3A3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" fill={`url(#${gridId})`} />
      <g>
        <path d="M 176 112 L 288 112 L 336 160 L 336 400 L 176 400 Z" className="pc-doc-outline" />
        <path d="M 288 112 L 288 160 L 336 160" className="pc-doc-outline" />
        <line x1="208" y1="208" x2="304" y2="208" className="pc-doc-inner" />
        <line x1="208" y1="256" x2="304" y2="256" className="pc-doc-inner" />
        <line x1="208" y1="304" x2="272" y2="304" className="pc-doc-inner" />
        <path d="M 160 112 L 192 112 M 176 96 L 176 128" stroke="#17C7FF" strokeWidth="1"/>
        <path d="M 160 400 L 192 400 M 176 384 L 176 416" stroke="#17C7FF" strokeWidth="1"/>
        <path d="M 320 400 L 352 400 M 336 384 L 336 416" stroke="#17C7FF" strokeWidth="1"/>
      </g>
      <g className="pc-scanner-group">
        <rect x="156" y="-30" width="200" height="30" fill={`url(#${trailId})`} />
        <line x1="156" y1="0" x2="356" y2="0" className="pc-scan-line" style={{ filter: `url(#${glowId})` }} />
        <polygon points="156,0 150,-5 150,5" fill="#21F3A3" />
        <polygon points="356,0 362,-5 362,5" fill="#21F3A3" />
      </g>
    </svg>
  )
}

// ─── Checkbox ──────────────────────────────────────────────────────────────────
function Checkbox({ checked, onChange }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: `2px solid ${checked ? C.accent : 'rgba(255,255,255,0.4)'}`,
        background: checked ? C.accent : 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {checked && <CheckIcon size={10} color="#000" />}
    </div>
  )
}

// ─── Selection toolbar ────────────────────────────────────────────────────────
function SelectionToolbar({ count, onMerge, onDeselect }) {
  return (
    <div style={{
      background: '#16161A', border: `1px solid rgba(0,229,160,0.25)`,
      borderRadius: 10, padding: '8px 14px',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4,
    }}>
      <span style={{
        fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
        background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)',
        borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap',
      }}>
        {count} terv kijelölve
      </span>
      <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <TlBtn icon={<CalcIcon size={13} color={C.accent} />} label={count === 1 ? "Ajánlat generálása" : "Közös ajánlat generálása"} color={C.accent} onClick={onMerge} />
      </div>
      <button onClick={onDeselect} style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
        Mégsem
      </button>
    </div>
  )
}

function TlBtn({ icon, label, color, onClick }) {
  const [hov, setHov] = useState(false)
  const dim = color === C.yellow ? 'rgba(255,209,102,0.08)' : color === C.blue ? 'rgba(76,201,240,0.08)' : 'rgba(0,229,160,0.08)'
  const bdr = color === C.yellow ? 'rgba(255,209,102,0.25)' : color === C.blue ? 'rgba(76,201,240,0.25)' : 'rgba(0,229,160,0.25)'
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: 'DM Mono', fontSize: 10,
        color: hov ? color : C.textSub,
        background: hov ? dim : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hov ? bdr : C.border}`,
        borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
        transition: 'all 0.12s', whiteSpace: 'nowrap',
      }}>
      {icon}{label}
    </button>
  )
}

// ─── Upload ring SVG (project creation card) ────────────────────────────────
function UploadRingSVG({ label, sublabel, tags }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 96, height: 96, margin: '0 auto 12px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
          <style>{`
            .ur-grid-circle { stroke: rgba(255,255,255,0.18); stroke-width: 1; opacity: 0.4; fill: none; }
            .ur-ring-bg { stroke: rgba(255,255,255,0.18); stroke-width: 3; fill: none; stroke-dasharray: 4 8; }
            .ur-ring-progress {
              stroke: #21F3A3; stroke-width: 4; fill: none; stroke-linecap: round;
              stroke-dasharray: 350; filter: url(#ur-glow-ring);
              animation: ur-spin-load 3s ease-in-out infinite;
              transform-origin: 256px 224px;
            }
            .ur-upload-arrow {
              stroke: #17C7FF; stroke-width: 4; fill: none; stroke-linecap: round; stroke-linejoin: round;
              animation: ur-float 3s ease-in-out infinite;
            }
            .ur-data-line { stroke: rgba(255,255,255,0.18); stroke-width: 2; fill: none; }
            .ur-data-pulse {
              stroke: #21F3A3; stroke-width: 2; fill: none; stroke-linecap: round;
              stroke-dasharray: 15 50; animation: ur-up-flow 2s linear infinite;
            }
            @keyframes ur-spin-load {
              0% { stroke-dashoffset: 350; transform: rotate(-90deg); }
              60% { stroke-dashoffset: 0; transform: rotate(270deg); }
              100% { stroke-dashoffset: 350; transform: rotate(270deg); }
            }
            @keyframes ur-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes ur-up-flow {
              0% { stroke-dashoffset: 65; }
              100% { stroke-dashoffset: 0; }
            }
          `}</style>
          <defs>
            <pattern id="ur-grid3" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M 64 0 L 0 0 0 64" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none" opacity="0.5"/></pattern>
            <filter id="ur-glow-ring" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
          </defs>
          <rect width="512" height="512" fill="url(#ur-grid3)"/>
          <circle cx="256" cy="224" r="180" className="ur-grid-circle"/>
          <circle cx="256" cy="224" r="120" className="ur-grid-circle"/>
          <path d="M 196 336 L 316 336 M 226 352 L 286 352" stroke="#17C7FF" strokeWidth="3" strokeLinecap="round"/>
          <circle cx="256" cy="224" r="72" className="ur-ring-bg"/>
          <circle cx="256" cy="224" r="56" className="ur-ring-progress"/>
          <g className="ur-upload-arrow">
            <path d="M 256 190 L 256 256"/>
            <path d="M 230 216 L 256 190 L 282 216"/>
          </g>
          <path d="M 256 368 L 256 512" className="ur-data-line"/>
          <path d="M 256 368 L 256 512" className="ur-data-pulse"/>
          <path d="M 226 368 L 226 512" className="ur-data-line" opacity="0.6"/>
          <path d="M 226 368 L 226 512" className="ur-data-pulse" style={{ animationDelay: '-0.5s' }}/>
          <path d="M 286 368 L 286 512" className="ur-data-line" opacity="0.6"/>
          <path d="M 286 368 L 286 512" className="ur-data-pulse" style={{ animationDelay: '-1s' }}/>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', background: 'linear-gradient(90deg, #21F3A3 0%, #17C7FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {label}
      </div>
      {sublabel && <div style={{ color: '#17C7FF', fontSize: 12, marginTop: 4, opacity: 0.65, fontFamily: 'DM Mono', letterSpacing: '0.03em' }}>{sublabel}</div>}
      {tags && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          {tags.map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono', background: 'rgba(33,243,163,0.07)', border: '1px solid rgba(33,243,163,0.25)', color: '#21F3A3' }}>{t}</span>)}
        </div>
      )}
    </div>
  )
}

// ─── Animated scanner SVG ─────────────────────────────────────────────────────
function ScannerSVG({ label, sublabel, tags }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 96, height: 96, margin: '0 auto 12px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
          <style>{`
            .pl-grid-bg { stroke: rgba(255,255,255,0.18); stroke-width: 1; opacity: 0.3; }
            .pl-doc-outline { stroke: #17C7FF; stroke-width: 2.5; fill: none; stroke-linejoin: round; stroke-linecap: round; }
            .pl-doc-inner { stroke: rgba(255,255,255,0.18); stroke-width: 2; fill: none; stroke-dasharray: 4 6; stroke-linecap: round; }
            .pl-scan-line { stroke: #21F3A3; stroke-width: 2; filter: url(#pl-glow-scan); }
            .pl-scanner-group { animation: pl-scan-move 3s ease-in-out infinite; }
            @keyframes pl-scan-move { 0%, 100% { transform: translateY(120px); } 50% { transform: translateY(380px); } }
          `}</style>
          <defs>
            <pattern id="pl-grid2" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" className="pl-grid-bg" fill="none"/></pattern>
            <filter id="pl-glow-scan" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>
            <linearGradient id="pl-scan-trail" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#21F3A3" stopOpacity="0.25"/><stop offset="100%" stopColor="#21F3A3" stopOpacity="0"/></linearGradient>
          </defs>
          <rect width="512" height="512" fill="url(#pl-grid2)"/>
          <path d="M 176 112 L 288 112 L 336 160 L 336 400 L 176 400 Z" className="pl-doc-outline"/>
          <path d="M 288 112 L 288 160 L 336 160" className="pl-doc-outline"/>
          <line x1="208" y1="208" x2="304" y2="208" className="pl-doc-inner"/>
          <line x1="208" y1="256" x2="304" y2="256" className="pl-doc-inner"/>
          <line x1="208" y1="304" x2="272" y2="304" className="pl-doc-inner"/>
          <path d="M 160 112 L 192 112 M 176 96 L 176 128" stroke="#17C7FF" strokeWidth="1"/>
          <path d="M 160 400 L 192 400 M 176 384 L 176 416" stroke="#17C7FF" strokeWidth="1"/>
          <path d="M 320 400 L 352 400 M 336 384 L 336 416" stroke="#17C7FF" strokeWidth="1"/>
          <g className="pl-scanner-group">
            <rect x="156" y="-30" width="200" height="30" fill="url(#pl-scan-trail)"/>
            <line x1="156" y1="0" x2="356" y2="0" className="pl-scan-line"/>
            <polygon points="156,0 150,-5 150,5" fill="#21F3A3"/>
            <polygon points="356,0 362,-5 362,5" fill="#21F3A3"/>
          </g>
        </svg>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne', background: 'linear-gradient(90deg, #21F3A3 0%, #17C7FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        {label}
      </div>
      {sublabel && <div style={{ color: '#17C7FF', fontSize: 12, marginTop: 4, opacity: 0.65, fontFamily: 'DM Mono', letterSpacing: '0.03em' }}>{sublabel}</div>}
      {tags && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          {tags.map(t => <span key={t} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono', background: 'rgba(33,243,163,0.07)', border: '1px solid rgba(33,243,163,0.25)', color: '#21F3A3' }}>{t}</span>)}
        </div>
      )}
    </div>
  )
}

// ─── Metadata Copilot strip ──────────────────────────────────────────────────
// Confidence-based badge + inline editable metadata pills

const CONFIDENCE_LEVELS = {
  high:   { label: '✓ felismert', color: C.accent, bg: 'rgba(0,229,160,0.10)', border: 'rgba(0,229,160,0.25)' },
  medium: { label: '? ellenőrizd', color: C.yellow, bg: 'rgba(255,209,102,0.10)', border: 'rgba(255,209,102,0.25)' },
  low:    { label: '— kézi', color: C.textSub, bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)' },
}

function getConfidenceLevel(meta) {
  if (!meta) return 'low'
  const c = meta.metaConfidence || 0
  if (c >= 0.85) return 'high'
  if (c >= 0.60) return 'medium'
  return 'low'
}

const FLOOR_SELECT_OPTIONS = [
  { value: 'pince', label: 'Pince' },
  { value: 'fsz', label: 'Földszint' },
  { value: '1_emelet', label: '1. emelet' },
  { value: '2_emelet', label: '2. emelet' },
  { value: '3_emelet', label: '3. emelet' },
  { value: '4_emelet', label: '4. emelet' },
  { value: 'teto', label: 'Tetőtér' },
]

function MetaPill({ label, value, valueKey, options, onSelect, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const display = value || placeholder || '–'
  const hasValue = !!value

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open) }}
        style={{
          fontFamily: 'DM Mono', fontSize: 8.5, letterSpacing: '0.02em',
          padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
          background: hasValue ? 'rgba(76,201,240,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${hasValue ? 'rgba(76,201,240,0.20)' : 'rgba(255,255,255,0.10)'}`,
          color: hasValue ? C.blue : C.textSub,
          transition: 'all 0.12s', whiteSpace: 'nowrap',
          maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        title={`${label}: ${display}`}
      >
        <span style={{ color: C.textSub, marginRight: 3, fontSize: 7.5 }}>{label}:</span>{display}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 100,
          background: '#1A1A1E', border: `1px solid ${C.border}`, borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 110, maxHeight: 180, overflowY: 'auto',
          padding: '4px 0',
        }} onClick={e => e.stopPropagation()}>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onSelect(opt.value, opt.label); setOpen(false) }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(76,201,240,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              style={{
                padding: '4px 10px', cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
                color: opt.value === valueKey ? C.blue : C.text,
                transition: 'background 0.1s',
              }}
            >
              {opt.label}
            </div>
          ))}
          {value && (
            <div
              onClick={() => { onSelect(null, null); setOpen(false) }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,107,107,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              style={{
                padding: '4px 10px', cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
                color: '#FF6B6B', borderTop: `1px solid ${C.border}`, marginTop: 2,
              }}
            >
              Törlés
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetaCopilotStrip({ plan, onMetaChange }) {
  const meta = plan.inferredMeta || {}
  const level = getConfidenceLevel(meta)
  const conf = CONFIDENCE_LEVELS[level]
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const systemOptions = SYSTEM_TYPES.filter(s => s !== 'general').map(s => ({ value: s, label: SYSTEM_TYPE_LABELS[s] }))
  systemOptions.push({ value: 'general', label: SYSTEM_TYPE_LABELS.general })
  const docTypeOptions = DOC_TYPES.map(d => ({ value: d, label: DOC_TYPE_LABELS[d] }))

  const handleFieldChange = (field, value, labelField, labelValue) => {
    const updates = {
      inferredMeta: {
        ...meta,
        [field]: value,
        ...(labelField ? { [labelField]: labelValue } : {}),
        metaSource: value ? 'manual' : meta.metaSource,
        metaConfidence: value ? 1.0 : meta.metaConfidence,
      },
    }
    onMetaChange(plan.id, updates)
  }

  const isPdf = plan.fileType === 'pdf'

  const handleAiFallback = async (e) => {
    e.stopPropagation()
    if (aiLoading) return
    if (!isPdf) {
      setAiError('AI elemzés jelenleg csak PDF tervekhez érhető el.')
      setTimeout(() => setAiError(null), 4000)
      return
    }
    setAiLoading(true)
    setAiError(null)
    try {
      // 1. Get image: try cached thumbnail first, render on demand if missing
      let imageDataUrl = await getPlanThumbnail(plan.id)
      if (!imageDataUrl) {
        const fileBlob = await getPlanFile(plan.id)
        if (!fileBlob) throw new Error('PDF fájl nem található.')
        imageDataUrl = await renderFirstPageImage(fileBlob, 0.6)
      }

      // 2. Call AI Vision
      const aiResult = await callAiMetaVision(imageDataUrl, meta)

      // 3. Merge with conservative rules
      const merged = mergeAiMeta(meta, aiResult)

      // 4. Update plan metadata
      onMetaChange(plan.id, { inferredMeta: merged })
    } catch (err) {
      console.error('[AI Meta Vision]', err)
      setAiError(err.message || 'AI elemzés sikertelen.')
      setTimeout(() => setAiError(null), 5000)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'DM Mono', fontSize: 8, letterSpacing: '0.04em',
          padding: '1px 6px', borderRadius: 3,
          background: conf.bg, border: `1px solid ${conf.border}`, color: conf.color,
        }}>
          {conf.label}
        </span>
        {meta.drawingNumber && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 8.5, color: C.textSub }} title="Rajzszám">
            {meta.drawingNumber}
          </span>
        )}
        {level !== 'high' && (
          <button
            onClick={handleAiFallback}
            disabled={aiLoading || (!isPdf)}
            style={{
              fontFamily: 'DM Mono', fontSize: 7.5, marginLeft: 'auto',
              padding: '1px 5px', borderRadius: 3,
              cursor: aiLoading || !isPdf ? 'default' : 'pointer',
              background: aiLoading ? 'rgba(76,201,240,0.18)' : 'rgba(76,201,240,0.06)',
              border: `1px solid ${aiLoading ? 'rgba(76,201,240,0.35)' : 'rgba(76,201,240,0.18)'}`,
              color: !isPdf ? C.muted : C.blue, transition: 'all 0.12s',
              opacity: !isPdf ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!aiLoading && isPdf) e.currentTarget.style.background = 'rgba(76,201,240,0.14)' }}
            onMouseLeave={e => { if (!aiLoading) e.currentTarget.style.background = aiLoading ? 'rgba(76,201,240,0.18)' : 'rgba(76,201,240,0.06)' }}
            title={!isPdf ? 'AI elemzés jelenleg csak PDF tervekhez' : 'AI-alapú metadata felismerés'}
          >
            {aiLoading ? '⏳ Elemzés…' : 'AI elemzés'}
          </button>
        )}
        {aiError && (
          <span style={{
            fontFamily: 'DM Mono', fontSize: 7, color: C.red, marginLeft: 4,
            padding: '1px 4px', borderRadius: 3,
            background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)',
          }}>
            {aiError}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <MetaPill
          label="Szint"
          value={meta.floorLabel || null}
          valueKey={meta.floor || null}
          options={FLOOR_SELECT_OPTIONS}
          onSelect={(val, lbl) => handleFieldChange('floor', val, 'floorLabel', lbl)}
        />
        <MetaPill
          label="Rendszer"
          value={meta.systemType ? (SYSTEM_TYPE_LABELS[meta.systemType] || null) : null}
          valueKey={meta.systemType || null}
          options={systemOptions}
          onSelect={(val) => handleFieldChange('systemType', val)}
        />
        <MetaPill
          label="Típus"
          value={meta.docType ? (DOC_TYPE_LABELS[meta.docType] || null) : null}
          valueKey={meta.docType || null}
          options={docTypeOptions}
          onSelect={(val) => handleFieldChange('docType', val)}
        />
      </div>
    </div>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, thumb, selected, onSelect, onOpen, onDelete, openingId, onMetaChange }) {
  const [hov, setHov] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isOpening = openingId === plan.id
  const markerCount = plan.markerCount || 0
  const detected = plan.detectedCount || 0
  const hasScale = plan.hasScale
  const hasCalc = plan.calcTotal != null && plan.calcTotal > 0
  const backupStatus = supabaseConfigured ? (plan.remoteBackupAt === null ? 'failed' : plan.remoteBackupAt ? 'ok' : null) : null
  const calcTotal = plan.calcTotal || 0
  const calcItems = plan.calcItemCount || 0

  return (
    <div
      data-testid="plan-card"
      onMouseOver={e => { setHov(true); e.currentTarget.style.borderColor = '#00E5A040'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,229,160,0.08)' }}
      onMouseOut={e => { setHov(false); e.currentTarget.style.borderColor = selected ? 'rgba(0,229,160,0.3)' : C.border; e.currentTarget.style.boxShadow = 'none' }}
      style={{ background: C.bgCard, border: `1px solid ${selected ? 'rgba(0,229,160,0.3)' : C.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s, box-shadow 0.2s' }}
    >
      <div style={{ height: 120, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.border}`, flexDirection: 'column', gap: 6, overflow: 'hidden', position: 'relative' }}>
        {thumb ? <img src={thumb} alt={plan.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} /> : (() => {
          const ft = plan.fileType || 'pdf'
          const ftInfo = FILE_TYPE_MAP[ft] || FILE_TYPE_MAP.pdf
          return <>
            {ft === 'pdf' ? (
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={ftInfo.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15v-2h1.5a1.5 1.5 0 0 1 0 3H9"/><path d="M15 13h2M15 13v4"/></svg>
            ) : (
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={ftInfo.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>
            )}
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{ftInfo.label} terv</span>
          </>
        })()}
        <div style={{ position: 'absolute', top: 7, left: 7 }}><Checkbox checked={selected} onChange={onSelect} /></div>
        {backupStatus && (
          <span title={backupStatus === 'ok' ? 'Felhőbe mentve' : 'Felhő mentés sikertelen'} style={{ position: 'absolute', top: 7, right: 7, padding: '2px 5px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono', backdropFilter: 'blur(4px)', background: backupStatus === 'ok' ? 'rgba(0,229,160,0.15)' : 'rgba(255,99,99,0.15)', color: backupStatus === 'ok' ? C.accent : '#ff6363', lineHeight: 1 }}>☁{backupStatus === 'ok' ? '' : ' ✗'}</span>
        )}
        {(markerCount > 0 || hasScale || detected > 0) && (
          <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {markerCount > 0 && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono', background: 'rgba(0,229,160,0.2)', color: C.accent, backdropFilter: 'blur(4px)' }}>✓ {markerCount} elem</span>}
            {hasScale && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono', background: 'rgba(76,201,240,0.2)', color: C.blue, backdropFilter: 'blur(4px)' }}>Kalibrálva</span>}
            {detected > 0 && !plan.detectionReviewed && <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono', background: 'rgba(255,209,102,0.2)', color: C.yellow, backdropFilter: 'blur(4px)' }}>⚡ {detected} det.</span>}
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 600, fontFamily: 'Syne', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{plan.name || plan.fileName || 'Névtelen'}</div>
          {(() => { const ftInfo = FILE_TYPE_MAP[plan.fileType] || FILE_TYPE_MAP.pdf; return <span style={{ fontFamily: 'DM Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 4, background: ftInfo.bg, border: `1px solid ${ftInfo.border}`, color: ftInfo.color }}>{ftInfo.label}</span> })()}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.textMuted, fontSize: 10, fontFamily: 'DM Mono', marginBottom: 4 }}>
          <span>{fmtSize(plan.fileSize)}</span><span>{fmtDate(plan.uploadedAt || plan.createdAt)}</span>
        </div>
        <MetaCopilotStrip plan={plan} onMetaChange={onMetaChange} />
        {hasCalc && (
          <div style={{
            background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)',
            borderRadius: 6, padding: '6px 10px', marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.accent }}>
              {Number(calcTotal).toLocaleString('hu-HU')} Ft
            </span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
              {calcItems} elem
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={e => { e.stopPropagation(); onOpen(plan) }} disabled={isOpening} style={{ flex: 1, padding: '6px 0', borderRadius: 5, background: isOpening ? 'transparent' : `${C.accent}12`, border: `1px solid ${isOpening ? C.border : `${C.accent}30`}`, color: isOpening ? C.muted : C.accent, fontSize: 11, fontFamily: 'Syne', fontWeight: 600, cursor: isOpening ? 'wait' : 'pointer', transition: 'all 0.15s' }}>
            {isOpening ? 'Töltés…' : hasCalc ? 'Szerkesztés' : 'Megnyitás'}
          </button>
          <button data-testid="plan-delete-btn" onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            style={{ padding: '6px 10px', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,107,0.4)'; e.currentTarget.style.color = '#FF6B6B' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}>
            <TrashIcon size={13} />
          </button>
        </div>
      </div>
      {confirmDelete && (() => {
        const qCount = countQuotesForPlan(plan.id)
        return (
          <ConfirmDialog
            message={`Törlöd a "${plan.name || 'Névtelen'}" tervrajzot?`}
            detail={
              qCount > 0
                ? `⚠ ${qCount} ajánlat hivatkozik erre a tervrajzra. Törlés után az érintett ajánlatokban a forrásterv nem lesz elérhető.`
                : 'A tervrajz és a hozzá tartozó adatok véglegesen törlődnek.'
            }
            onConfirm={() => { setConfirmDelete(false); onDelete(plan.id) }}
            onCancel={() => setConfirmDelete(false)}
          />
        )
      })()}
    </div>
  )
}

// ─── Project card ────────────────────────────────────────────────────────────
function ProjectCard({ project, planCount, templateCount, onOpen, onDelete }) {
  const [hov, setHov] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div
      data-testid="project-card"
      onClick={() => onOpen(project.id)}
      onMouseOver={() => setHov(true)}
      onMouseOut={() => setHov(false)}
      style={{
        background: C.bgCard, border: `1px solid ${hov ? 'rgba(0,229,160,0.3)' : C.border}`,
        borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hov ? '0 4px 20px rgba(0,229,160,0.08)' : 'none',
      }}
    >
      {/* Thumbnail area */}
      <div style={{ height: 110, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <ProjectCardIllustration size={80} />
      </div>
      {/* Project title — centered chip/band style */}
      <div style={{ padding: '14px 14px 0', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block', maxWidth: '100%',
          padding: '4px 14px', borderRadius: 6,
          fontFamily: 'Syne', fontWeight: 800, fontSize: 13,
          color: C.text, letterSpacing: '0.02em',
          background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.18)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.name}
        </span>
      </div>
      {/* Meta info */}
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono', background: 'rgba(0,229,160,0.10)', color: C.accent }}>{planCount} tervrajz</span>
          {templateCount > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono', background: 'rgba(76,201,240,0.15)', color: C.blue }}>{templateCount} szimbólum</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', color: C.muted, fontSize: 10, fontFamily: 'DM Mono', marginBottom: 10 }}>
          <span>{fmtDate(project.createdAt)}</span>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={e => { e.stopPropagation(); onOpen(project.id) }} style={{ flex: 1, padding: '6px 0', borderRadius: 5, background: `${C.accent}12`, border: `1px solid ${C.accent}30`, color: C.accent, fontSize: 11, fontFamily: 'Syne', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
            Megnyitás
          </button>
          <button onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            style={{ padding: '6px 10px', borderRadius: 5, background: 'transparent', border: `1px solid ${C.border}`, color: '#FF6B6B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: 0.55 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,107,0.4)'; e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.opacity = '0.55' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          message={`Törlöd a "${project.name}" projektet?`}
          detail="A projekt és a hozzá tartozó tervrajzok véglegesen törlődnek."
          onConfirm={() => { setConfirmDelete(false); onDelete(project.id) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── PROJECT LIST VIEW ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function ProjectListView({ onOpenProject }) {
  const [projects, setProjects] = useState([])
  const [projectStats, setProjectStats] = useState({}) // { projectId: { planCount, templateCount, hasLegend } }
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef(null)
  const toast = useToast()

  const reload = useCallback(() => {
    const prjs = loadProjects()
    setProjects(prjs)
    // Compute stats per project
    const allPlans = loadPlans()
    const allTemplates = loadTemplates()
    const stats = {}
    for (const p of prjs) {
      const plans = allPlans.filter(pl => pl.projectId === p.id)
      const templates = allTemplates.filter(t => t.projectId === p.id)
      stats[p.id] = { planCount: plans.length, templateCount: templates.length }
    }
    setProjectStats(stats)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleCreate = () => {
    if (!newName.trim()) return
    try {
      const id = generateProjectId()
      saveProject({ id, name: newName.trim(), description: '', legendPlanId: null, defaultQuoteOutputMode: 'combined', createdAt: new Date().toISOString() })
      setNewName('')
      setShowCreate(false)
      reload()
    } catch (err) {
      console.error('[Projektek] create failed:', err)
    }
  }

  const handleDelete = async (projectId) => {
    try {
      // Delete project templates (async — must await)
      await deleteTemplatesByProject(projectId)
      // Move orphaned plans to the fallback "Importált tervek" project
      const fallbackId = ensureFallbackProject()
      const orphaned = loadPlans().filter(p => p.projectId === projectId)
      for (const plan of orphaned) {
        updatePlanMeta(plan.id, { projectId: fallbackId })
      }
      deleteProject(projectId)
      clearProjectMemory(projectId)
      reload()
    } catch (err) {
      console.error('[Projektek] delete failed:', err)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub, margin: 0 }}>Projektek — építkezésenként külön mappa és tervrajzok</p>
        {projects.length > 0 && <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, flexShrink: 0, marginLeft: 12 }}>{projects.length} projekt</span>}
      </div>

      {/* Create new project zone */}
      {!showCreate ? (
        <div
          onClick={() => { setShowCreate(true); setTimeout(() => inputRef.current?.focus(), 50) }}
          style={{
            border: `2px dashed ${C.border}`, borderRadius: 12, padding: '32px 24px',
            textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: C.bgCard, marginBottom: 24,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.4)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border }}
        >
          <UploadRingSVG label="Új projekt létrehozása" sublabel="Hozz létre egy mappát az építkezésnek" tags={['Tervrajzok', 'Kalkuláció', 'Árajánlat']} />
        </div>
      ) : (
        <div style={{
          border: `2px solid rgba(0,229,160,0.3)`, borderRadius: 12, padding: '20px 24px',
          background: C.bgCard, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <FolderIcon size={28} color={C.accent} />
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewName('') } }}
            placeholder="Projekt neve — pl. Szombathely Kossuth u. 12"
            style={{
              flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
              padding: '8px 12px', color: C.text, fontSize: 14, fontFamily: 'Syne',
              outline: 'none',
            }}
          />
          <button onClick={handleCreate} style={{
            background: C.accent, color: '#09090B', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontFamily: 'Syne', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>
            Létrehozás
          </button>
          <button onClick={() => { setShowCreate(false); setNewName('') }} style={{
            background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '8px 12px', fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer',
          }}>
            Mégsem
          </button>
        </div>
      )}

      {/* Project grid */}
      {projects.length === 0 ? (
        <EmptyState
          title="Még nincsenek projektek"
          desc="Hozd létre az első projektet a fenti mezővel, vagy töltsd be a mintaadatokat a demóhoz."
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button onClick={() => setShowCreate(true)}>Új projekt</Button>
              {!isDemoSeeded() && (
                <Button variant="ghost" onClick={() => {
                  const { seeded } = seedDemoData()
                  if (seeded) {
                    toast.show('Mintaadatok betöltve — frissítsd az oldalt', 'success')
                    // Force re-render by reloading projects
                    window.location.reload()
                  }
                }}>Mintaadatok betöltése</Button>
              )}
            </div>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              planCount={projectStats[p.id]?.planCount || 0}
              templateCount={projectStats[p.id]?.templateCount || 0}
              onOpen={onOpenProject}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── PROJECT DETAIL VIEW ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function ProjectDetailView({ projectId, onBack, onOpenFile, onLegendPanel, onMergePanel, legendPanelOpen }) {
  const [project, setProject] = useState(null)
  const [plans, setPlans] = useState([])
  const [thumbnails, setThumbnails] = useState({})
  const [templates, setTemplates] = useState([])
  const [uploading, setUploading] = useState(false)
  const [openingId, setOpeningId] = useState(null)
  const [selected, setSelected] = useState({})
  const [dragging, setDragging] = useState(false)
  const [uploadWarning, setUploadWarning] = useState(null)
  const planInputRef = useRef(null)
  const toast = useToast()

  const reload = useCallback(async () => {
    const prj = getProject(projectId)
    setProject(prj)
    const prjPlans = getPlansByProject(projectId)
    // Exclude legend plan from the plans grid
    const filtered = prj?.legendPlanId ? prjPlans.filter(p => p.id !== prj.legendPlanId) : prjPlans
    setPlans(filtered)
    const tpls = await getTemplatesByProject(projectId)
    setTemplates(tpls)
  }, [projectId])

  useEffect(() => { reload() }, [reload])

  // Reload project + templates when LegendPanel closes (open → closed transition)
  const prevLegendOpen = useRef(false)
  useEffect(() => {
    if (prevLegendOpen.current && !legendPanelOpen) reload()
    prevLegendOpen.current = !!legendPanelOpen
  }, [legendPanelOpen, reload])

  // Load thumbnails
  useEffect(() => {
    if (plans.length === 0) return
    Promise.all(plans.map(async p => ({ id: p.id, thumb: await getPlanThumbnail(p.id) }))).then(results => {
      const map = {}; results.forEach(r => { if (r.thumb) map[r.id] = r.thumb })
      setThumbnails(prev => ({ ...prev, ...map }))
    })
  }, [plans])

  // Upload plan PDFs to this project
  const handlePlanFiles = useCallback(async (files) => {
    const all = Array.from(files)
    const accepted = all.filter(f => isAllowedPlan(f.name))
    const rejected = all.filter(f => !isAllowedPlan(f.name))
    if (rejected.length > 0) {
      const names = rejected.map(f => f.name).slice(0, 3).join(', ') + (rejected.length > 3 ? ` (+${rejected.length - 3})` : '')
      const msg = accepted.length > 0
        ? `⚠ ${names} — nem támogatott. Csak PDF, DXF, DWG tölthető fel.`
        : `Csak PDF, DXF és DWG fájlok tölthetők fel. (${names})`
      setUploadWarning(msg)
      setTimeout(() => setUploadWarning(null), 4500)
    }
    if (accepted.length === 0) return
    setUploading(true)
    let savedCount = 0
    for (const file of accepted) {
      try {
        const id = generatePlanId()
        const ft = getFileType(file.name)
        const layer1 = inferPlanMeta(file.name)
        const plan = {
          id, name: file.name, fileName: file.name, fileType: ft, fileSize: file.size,
          projectId, uploadedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
          markerCount: 0, measureCount: 0, hasScale: false, detectedCount: 0, detectionReviewed: false,
          inferredMeta: layer1.metaConfidence > 0 ? layer1 : null,
        }
        await savePlan(plan, file)
        savedCount++
        // Thumbnail only for PDF — DXF/DWG get fallback icon
        if (ft === 'pdf') {
          generatePdfThumb(file, id).then(d => { if (d) setThumbnails(prev => ({ ...prev, [id]: d })) }).catch(() => {})
        }
        // ── Layer 2: async text-based metadata enrichment (non-blocking) ──
        ;(async () => {
          try {
            let textLines = []
            if (ft === 'pdf') {
              const buf = await file.arrayBuffer()
              textLines = await extractPdfText(buf)
            } else if (ft === 'dxf') {
              const rawParseResult = await parseDxfFile(file, () => {})
              const parseResult = normalizeDxfResult(rawParseResult, rawParseResult?._source || 'browser')
              const tbTexts = Object.values(parseResult.title_block || {}).flat()
              textLines = tbTexts.length > 0 ? tbTexts : (parseResult.all_text || [])
            }
            if (textLines.length === 0) return
            const layer2 = inferMetaFromText(textLines)
            if (layer2.metaConfidence === 0) return
            const merged = mergeMeta(layer1, layer2)
            if (merged.metaConfidence > (layer1.metaConfidence || 0)) {
              updatePlanMeta(id, { inferredMeta: merged })
              reload()
            }
          } catch { /* silent — Layer 2 is best-effort */ }
        })()
      } catch (err) {
        console.error(`[Projektek] plan save failed: ${file.name}`, err)
      }
    }
    setUploading(false)
    reload()
    if (savedCount === accepted.length) {
      toast.show(`${savedCount} tervrajz feltöltve`, 'success')
    } else if (savedCount > 0) {
      toast.show(`${savedCount}/${accepted.length} tervrajz sikeresen feltöltve`, 'warning')
    } else {
      toast.show('A feltöltés sikertelen', 'error')
    }
  }, [projectId, reload, toast])

  const handleOpenSaved = useCallback(async (plan) => {
    setOpeningId(plan.id)
    try {
      // Check if cloud recovery will be attempted — show feedback if so
      const hasLocal = await hasPlanFileLocally(plan.id)
      const backupKnownFailed = plan.remoteBackupAt === null
      const attemptingRecovery = !hasLocal && supabaseConfigured && !backupKnownFailed
      if (attemptingRecovery) {
        toast.show('A tervfájl visszaállítása a felhőből…', 'info', 8000)
      }

      const blob = await getPlanFile(plan.id)
      if (!blob) { setOpeningId(null); toast.show('A tervrajz fájl nem elérhető. Töltsd fel újra a fájlt.', 'error'); return }

      if (attemptingRecovery) {
        toast.show('Tervfájl sikeresen visszaállítva.', 'success', 2500)
      }

      const ft = plan.fileType || getFileType(plan.name)
      const file = new File([blob], plan.name || FALLBACK_NAMES[ft] || 'terv.pdf', { type: MIME_TYPES[ft] || 'application/octet-stream' })
      if (onOpenFile) onOpenFile(file, plan)
      setOpeningId(null)
    } catch { setOpeningId(null) }
  }, [onOpenFile, toast])

  const handleDelete = useCallback(async (planId) => {
    try {
      await deletePlan(planId)
      setSelected(prev => { const s = { ...prev }; delete s[planId]; return s })
      reload()
    } catch (err) {
      console.error('[Projektek] plan delete failed:', err)
      toast.show('Tervrajz törlése sikertelen', 'error')
    }
  }, [reload, toast])

  const handleMetaChange = useCallback((planId, updates) => {
    updatePlanMeta(planId, updates)
    reload()
    toast.show('Metadata frissítve', 'success')
  }, [reload, toast])

  const toggleSelect = useCallback((planId, val) => setSelected(prev => ({ ...prev, [planId]: val })), [])
  const deselectAll = useCallback(() => setSelected({}), [])
  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([id]) => id)
  const selectedPlans = plans.filter(p => selectedIds.includes(p.id))
  const selectedCount = selectedPlans.length

  if (!project) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.muted, marginBottom: 12 }}>A projekt nem található vagy törölve lett.</p>
      <button onClick={onBack} style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.accent, background: 'none', border: `1px solid ${C.accent}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Vissza a projektekhez</button>
    </div>
  )

  return (
    <div>
      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.muted, fontFamily: 'DM Mono', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>
          <BackIcon size={14} color={C.muted} /> Vissza a projektekhez
        </button>
      </div>



      {/* ── Selection toolbar ── */}
      {selectedCount > 0 && (
        <SelectionToolbar
          count={selectedCount}
          onMerge={() => onMergePanel && onMergePanel(selectedPlans)}
          onDeselect={deselectAll}
        />
      )}

      {/* ── Plans section ── */}
      <div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          Tervrajzok
        </div>

        {/* Plan upload drop zone */}
        <div
          data-testid="plan-drop-zone"
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handlePlanFiles(e.dataTransfer.files) }}
          onClick={() => planInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? C.accent : C.border}`, borderRadius: 10, padding: '24px 16px',
            textAlign: 'center', cursor: 'pointer', background: dragging ? `${C.accent}08` : C.bgCard,
            marginBottom: 16, transition: 'all 0.2s',
          }}
        >
          {dragging ? (
            <div style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 700, color: C.accent, padding: '12px 0' }}>
              Engedd el a fájlokat
            </div>
          ) : (
            <ScannerSVG
              label="+ Tervrajz hozzáadása"
              sublabel="PDF, DXF, DWG · Húzd ide vagy kattints"
              tags={['Tervrajz', 'Alaprajz', 'Villamosság']}
            />
          )}
          {uploading && <div style={{ marginTop: 6, color: C.accent, fontSize: 11, fontFamily: 'DM Mono' }}>Feltöltés…</div>}
          <input data-testid="plan-upload-input" ref={planInputRef} type="file" accept=".pdf,.dxf,.dwg" multiple style={{ display: 'none' }} onChange={e => { handlePlanFiles(e.target.files); e.target.value = '' }} />
        </div>
        {uploadWarning && (
          <div data-testid="upload-warning" style={{
            background: 'rgba(255,107,107,0.10)', border: `1px solid rgba(255,107,107,0.25)`,
            borderRadius: 8, padding: '8px 12px', marginBottom: 12, marginTop: -8,
            fontFamily: 'DM Mono', fontSize: 11, color: '#FF6B6B',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ flexShrink: 0 }}>⚠</span>
            <span style={{ flex: 1 }}>{uploadWarning}</span>
            <button onClick={() => setUploadWarning(null)} style={{
              background: 'transparent', border: 'none', color: '#FF6B6B',
              cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0,
            }}>✕</button>
          </div>
        )}

        {/* Plans grid */}
        {plans.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {plans.map(plan => (
              <PlanCard
                key={plan.id} plan={plan} thumb={thumbnails[plan.id]}
                selected={!!selected[plan.id]} onSelect={val => toggleSelect(plan.id, val)}
                onOpen={handleOpenSaved} onDelete={handleDelete} openingId={openingId}
                onMetaChange={handleMetaChange}
              />
            ))}
          </div>
        )}

        {plans.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
            <div style={{ fontSize: 13, fontFamily: 'Syne', color: C.textSub }}>Még nincsenek tervrajzok</div>
            <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'DM Mono' }}>Töltsd fel a PDF tervrajzokat fentebb</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function FelmeresPage({ onOpenFile, onLegendPanel, onDetectPanel, onMergePanel, onReopenDetection, activeProjectId, onOpenProject, onBackToProjects, legendPanelOpen }) {
  const [currentProjectId, setCurrentProjectId] = useState(activeProjectId || null)

  // Sync with external prop
  useEffect(() => { if (activeProjectId !== undefined) setCurrentProjectId(activeProjectId) }, [activeProjectId])

  const handleOpenProject = useCallback((id) => {
    setCurrentProjectId(id)
    if (onOpenProject) onOpenProject(id)
  }, [onOpenProject])

  const handleBack = useCallback(() => {
    setCurrentProjectId(null)
    if (onBackToProjects) onBackToProjects()
  }, [onBackToProjects])

  if (currentProjectId) {
    return (
      <ProjectDetailView
        projectId={currentProjectId}
        onBack={handleBack}
        onOpenFile={onOpenFile}
        onLegendPanel={onLegendPanel}
        onMergePanel={onMergePanel}
        legendPanelOpen={legendPanelOpen}
      />
    )
  }

  return <ProjectListView onOpenProject={handleOpenProject} />
}
