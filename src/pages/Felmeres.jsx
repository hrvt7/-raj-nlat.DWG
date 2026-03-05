import React, { useState, useRef, useEffect, useCallback } from 'react'
import { loadPlans, getPlanFile, savePlan, generatePlanId } from '../data/planStore.js'

// ─── Colors (matches app theme) ──────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', textSub: '#A1A1AA', textMuted: '#71717A',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
  bgHover: 'rgba(255,255,255,0.03)',
  yellowDim: 'rgba(255,209,102,0.08)', yellowBorder: 'rgba(255,209,102,0.2)',
  blueDim: 'rgba(76,201,240,0.08)', blueBorder: 'rgba(76,201,240,0.2)',
}

function fmt(n) {
  return Number(n || 0).toLocaleString('hu-HU')
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function PdfIcon({ size = 20, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z"/>
      <path d="M14 2v6h6"/>
      <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zM15 13h-1v3h1M12 13v3"/>
    </svg>
  )
}

function CheckIcon({ size = 16, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function LayersIcon({ size = 16, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}

function BookOpenIcon({ size = 16, color = C.yellow }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}

function ScanIcon({ size = 16, color = C.blue }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
      <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
      <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>
  )
}

function CalculatorIcon({ size = 16, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="8" y1="6" x2="16" y2="6"/>
      <line x1="8" y1="10" x2="10" y2="10"/>
      <line x1="12" y1="10" x2="14" y2="10"/>
      <line x1="16" y1="10" x2="16" y2="10"/>
      <line x1="8" y1="14" x2="10" y2="14"/>
      <line x1="12" y1="14" x2="14" y2="14"/>
      <line x1="16" y1="14" x2="16" y2="14"/>
      <line x1="8" y1="18" x2="10" y2="18"/>
      <line x1="12" y1="18" x2="16" y2="18"/>
    </svg>
  )
}

function TrashIcon({ size = 14, color = C.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  )
}

function ExternalLinkIcon({ size = 13, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

// ─── Status badges ────────────────────────────────────────────────────────────
function PlanStatusBadge({ plan }) {
  const hasScale = plan.hasScale
  const markerCount = plan.markerCount || 0
  const detectedCount = plan.detectedCount || 0

  if (detectedCount > 0 && !plan.detectionReviewed) {
    return (
      <span style={{
        fontFamily: 'DM Mono', fontSize: 9, color: C.yellow,
        background: C.yellowDim, border: `1px solid ${C.yellowBorder}`,
        borderRadius: 20, padding: '2px 7px',
      }}>⚡ {detectedCount} detektált</span>
    )
  }
  if (markerCount > 0 || plan.detectionReviewed) {
    return (
      <span style={{
        fontFamily: 'DM Mono', fontSize: 9, color: C.accent,
        background: C.accentDim, border: `1px solid ${C.accentBorder}`,
        borderRadius: 20, padding: '2px 7px',
      }}>✓ {markerCount} jelölés</span>
    )
  }
  if (hasScale) {
    return (
      <span style={{
        fontFamily: 'DM Mono', fontSize: 9, color: C.blue,
        background: C.blueDim, border: `1px solid ${C.blueBorder}`,
        borderRadius: 20, padding: '2px 7px',
      }}>📐 Kalibrált</span>
    )
  }
  return (
    <span style={{
      fontFamily: 'DM Mono', fontSize: 9, color: C.muted,
      background: 'rgba(113,113,122,0.08)', border: '1px solid rgba(113,113,122,0.2)',
      borderRadius: 20, padding: '2px 7px',
    }}>Üres</span>
  )
}

// ─── Checkbox ────────────────────────────────────────────────────────────────
function Checkbox({ checked, onChange, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : (e) => { e.stopPropagation(); onChange(!checked) }}
      style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: `2px solid ${checked ? C.accent : C.border}`,
        background: checked ? C.accent : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {checked && <CheckIcon size={11} color="#000" />}
    </div>
  )
}

// ─── Selection toolbar ────────────────────────────────────────────────────────
function SelectionToolbar({ selectedCount, onLegend, onDetect, onMerge, onDeselect }) {
  return (
    <div style={{
      background: '#16161A', border: `1px solid ${C.accentBorder}`,
      borderRadius: 12, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
        background: C.accentDim, border: `1px solid ${C.accentBorder}`,
        borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
      }}>
        {selectedCount} terv kijelölve
      </span>

      <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ToolbarBtn icon={<BookOpenIcon size={14} color={C.yellow} />} label="Jelmagyarázat csatolása" color={C.yellow} onClick={onLegend} />
        <ToolbarBtn icon={<ScanIcon size={14} color={C.blue} />} label="Szimbólumdetektálás" color={C.blue} onClick={onDetect} />
        <ToolbarBtn icon={<CalculatorIcon size={14} color={C.accent} />} label="Összevonás kalkulációhoz" color={C.accent} onClick={onMerge} />
      </div>

      <button
        onClick={onDeselect}
        style={{
          fontFamily: 'DM Mono', fontSize: 11, color: C.muted,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
        }}
      >
        Mégsem
      </button>
    </div>
  )
}

function ToolbarBtn({ icon, label, color, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'DM Mono', fontSize: 11, color: hover ? color : C.textSub,
        background: hover ? `rgba(${color === C.yellow ? '255,209,102' : color === C.blue ? '76,201,240' : '0,229,160'},0.08)` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hover ? (color === C.yellow ? C.yellowBorder : color === C.blue ? C.blueBorder : C.accentBorder) : C.border}`,
        borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, selected, onSelect, onOpen, onDelete, openingId }) {
  const [hover, setHover] = useState(false)
  const isOpening = openingId === plan.id

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: selected ? 'rgba(0,229,160,0.04)' : C.bgCard,
        border: `1px solid ${selected ? C.accentBorder : hover ? '#2E2E36' : C.border}`,
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'all 0.15s',
        cursor: 'default',
      }}
    >
      {/* Checkbox */}
      <Checkbox
        checked={selected}
        onChange={onSelect}
        disabled={isOpening}
      />

      {/* PDF icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
        background: selected ? C.accentDim : 'rgba(0,229,160,0.05)',
        border: `1px solid ${selected ? C.accentBorder : 'rgba(0,229,160,0.1)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        <PdfIcon size={18} color={selected ? C.accent : 'rgba(0,229,160,0.5)'} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {plan.name || plan.fileName || 'Névtelen terv'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
            {fmtDate(plan.uploadedAt || plan.createdAt)}
            {plan.fileSize ? ` · ${fmtSize(plan.fileSize)}` : ''}
          </span>
          <PlanStatusBadge plan={plan} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(plan) }}
          disabled={isOpening}
          style={{
            fontFamily: 'DM Mono', fontSize: 11,
            color: isOpening ? C.muted : C.accent,
            background: isOpening ? 'transparent' : hover ? C.accentDim : 'transparent',
            border: `1px solid ${isOpening ? C.border : hover ? C.accentBorder : 'transparent'}`,
            borderRadius: 7, padding: '5px 10px', cursor: isOpening ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
        >
          {isOpening ? 'Töltés…' : (<><ExternalLinkIcon size={12} color={C.accent} /> Megnyitás</>)}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(plan.id) }}
          title="Törlés"
          style={{
            background: 'transparent', border: '1px solid transparent',
            borderRadius: 7, padding: '5px 7px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            opacity: hover ? 1 : 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,107,0.3)'; e.currentTarget.style.background = 'rgba(255,107,107,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
        >
          <TrashIcon size={13} color={C.red} />
        </button>
      </div>
    </div>
  )
}

// ─── Upload zone (compact, for adding more) ───────────────────────────────────
function AddMoreZone({ onFiles, compact }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  if (compact) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? C.accent : C.border}`,
          borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', background: dragging ? C.accentDim : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }} onChange={e => { onFiles(Array.from(e.target.files)); e.target.value = '' }} />
        <PdfIcon size={15} color={dragging ? C.accent : C.muted} />
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: dragging ? C.accent : C.muted }}>
          + PDF fájlok hozzáadása
        </span>
      </div>
    )
  }

  return null
}

// ─── Main drop zone (empty state) ────────────────────────────────────────────
function MainDropZone({ onFiles }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (files.length > 0) onFiles(files)
  }, [onFiles])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? C.accent : C.border}`,
        borderRadius: 14, padding: '52px 24px',
        textAlign: 'center', cursor: 'pointer',
        background: dragging ? C.accentDim : C.bgCard,
        transition: 'all 0.18s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        style={{ display: 'none' }}
        onChange={e => { onFiles(Array.from(e.target.files)); e.target.value = '' }}
      />

      <div style={{
        width: 58, height: 58, borderRadius: 14,
        background: dragging ? C.accentDim : 'rgba(0,229,160,0.06)',
        border: `1px solid ${dragging ? C.accentBorder : 'rgba(0,229,160,0.12)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.18s',
      }}>
        <PdfIcon size={26} color={dragging ? C.accent : 'rgba(0,229,160,0.6)'} />
      </div>

      <div>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: dragging ? C.accent : C.text }}>
          {dragging ? 'Engedd el a PDF fájlokat' : 'PDF tervrajzok megnyitása'}
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 6 }}>
          Húzd ide a fájlokat, vagy kattints a böngészéshez · Több fájl egyszerre is
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {['PDF', 'Több fájl'].map(tag => (
          <span key={tag} style={{
            fontFamily: 'DM Mono', fontSize: 10, color: C.accent,
            background: C.accentDim, border: `1px solid ${C.accentBorder}`,
            borderRadius: 20, padding: '3px 10px',
          }}>{tag}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Saving indicator ─────────────────────────────────────────────────────────
function SavingBadge({ saving }) {
  if (!saving) return null
  return (
    <span style={{
      fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.accent, animation: 'pulse 1s infinite' }} />
      Mentés…
    </span>
  )
}

// ─── Felmérés page ────────────────────────────────────────────────────────────
export default function FelmeresPage({ onOpenFile, onLegendPanel, onDetectPanel, onMergePanel }) {
  const [pdfPlans, setPdfPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openingId, setOpeningId] = useState(null)
  const [selected, setSelected] = useState({}) // { [planId]: boolean }

  // ── Load saved PDF plans on mount ──
  useEffect(() => {
    const plans = loadPlans()
    const pdfs = plans.filter(p => {
      const name = (p.name || p.fileName || '').toLowerCase()
      return name.endsWith('.pdf')
    })
    setPdfPlans(pdfs)
    setLoading(false)
  }, [])

  // ── Handle new files uploaded ──
  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return
    setSaving(true)

    const newPlans = []
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue
      const plan = {
        id: generatePlanId(),
        name: file.name,
        fileName: file.name,
        fileType: 'pdf',
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        markerCount: 0,
        measureCount: 0,
        hasScale: false,
        detectedCount: 0,
        detectionReviewed: false,
      }
      await savePlan(plan, file)
      newPlans.push(plan)
    }

    setPdfPlans(prev => [...newPlans, ...prev])
    setSaving(false)

    // If single file — open immediately
    if (files.length === 1 && onOpenFile) {
      const file = files[0]
      const plan = newPlans[0]
      if (plan) {
        setOpeningId(plan.id)
        onOpenFile(file)
      }
    }
  }, [onOpenFile])

  // ── Open saved plan ──
  const handleOpenSaved = useCallback(async (plan) => {
    setOpeningId(plan.id)
    try {
      const blob = await getPlanFile(plan.id)
      if (!blob) { setOpeningId(null); return }
      const file = new File([blob], plan.name || plan.fileName || 'terv.pdf', { type: 'application/pdf' })
      onOpenFile(file)
    } catch (err) {
      console.error('[Felmérés] Failed to load saved plan:', err)
      setOpeningId(null)
    }
  }, [onOpenFile])

  // ── Delete plan ──
  const handleDelete = useCallback((planId) => {
    // Remove from local state only (keep in planStore for now — can add full delete later)
    setPdfPlans(prev => prev.filter(p => p.id !== planId))
    setSelected(prev => { const s = { ...prev }; delete s[planId]; return s })
  }, [])

  // ── Selection ──
  const toggleSelect = useCallback((planId, val) => {
    setSelected(prev => ({ ...prev, [planId]: val }))
  }, [])

  const deselectAll = useCallback(() => setSelected({}), [])

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([id]) => id)
  const selectedPlans = pdfPlans.filter(p => selectedIds.includes(p.id))
  const selectedCount = selectedPlans.length

  // ── Legend action ──
  const handleLegend = useCallback(() => {
    if (onLegendPanel) onLegendPanel(selectedPlans)
  }, [selectedPlans, onLegendPanel])

  // ── Detect action ──
  const handleDetect = useCallback(() => {
    if (onDetectPanel) onDetectPanel(selectedPlans)
  }, [selectedPlans, onDetectPanel])

  // ── Merge/calculate action ──
  const handleMerge = useCallback(() => {
    if (onMergePanel) onMergePanel(selectedPlans)
  }, [selectedPlans, onMergePanel])

  // ── Refresh plan list (called after detection/review) ──
  const refreshPlans = useCallback(() => {
    const plans = loadPlans()
    const pdfs = plans.filter(p => (p.name || p.fileName || '').toLowerCase().endsWith('.pdf'))
    setPdfPlans(pdfs)
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.muted, fontFamily: 'DM Mono', fontSize: 12, padding: '40px 0' }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
        Betöltés…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 860 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: C.text, margin: 0, lineHeight: 1.2 }}>
            Felmérés
          </h1>
          <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, margin: '6px 0 0' }}>
            PDF tervrajz alapú helyszíni felmérés — skálakalibráció, eszközjelölés, szimbólumdetektálás
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SavingBadge saving={saving} />
          {pdfPlans.length > 0 && (
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
              {pdfPlans.length} terv
            </span>
          )}
        </div>
      </div>

      {/* ── Main content: empty → full drop zone, else plan list + add more ── */}
      {pdfPlans.length === 0 ? (
        <>
          <MainDropZone onFiles={handleFiles} />

          {/* Feature cards */}
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '18px 20px',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16,
          }}>
            {[
              { icon: '📐', label: 'Skálakalibráció', desc: 'Mértékszám alapú valós méret beállítása' },
              { icon: '📍', label: 'Eszközjelölés', desc: 'Kattintással jelöld be a szerelvényeket' },
              { icon: '🔍', label: 'Szimbólumdetektálás', desc: 'Jelmagyarázat alapú automatikus felismerés' },
              { icon: '📊', label: 'Többterves kalkuláció', desc: 'Több PDF összevonása árajánlatba' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>{item.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>{item.label}</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 3 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* ── Selection toolbar (appears when something selected) ── */}
          {selectedCount > 0 && (
            <SelectionToolbar
              selectedCount={selectedCount}
              onLegend={handleLegend}
              onDetect={handleDetect}
              onMerge={handleMerge}
              onDeselect={deselectAll}
            />
          )}

          {/* ── Plan list header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{
              fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              PDF tervek · {pdfPlans.length} db
              {selectedCount > 0 && <span style={{ color: C.accent, marginLeft: 8 }}>· {selectedCount} kijelölve</span>}
            </div>
            {selectedCount > 0 && (
              <button
                onClick={deselectAll}
                style={{
                  fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
                  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                Kijelölés törlése
              </button>
            )}
          </div>

          {/* ── Plan cards ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pdfPlans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={!!selected[plan.id]}
                onSelect={(val) => toggleSelect(plan.id, val)}
                onOpen={handleOpenSaved}
                onDelete={handleDelete}
                openingId={openingId}
              />
            ))}
          </div>

          {/* ── Add more zone ── */}
          <AddMoreZone onFiles={handleFiles} compact />

          {/* ── Hint ── */}
          {selectedCount === 0 && pdfPlans.length > 0 && (
            <div style={{
              fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
              textAlign: 'center', padding: '4px 0',
            }}>
              💡 Jelölj ki több tervet a szimbólumdetektáláshoz és összevont kalkulációhoz
            </div>
          )}
        </>
      )}

    </div>
  )
}
