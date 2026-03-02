import React, { useState, useRef, useEffect } from 'react'

const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

export const CABLE_TRAY_COLOR = '#78909C'

export const CABLE_TRAY_SIZES = [
  { key: 'kt_50_35',   width: 50,  height: 35,  label: 'KT 50×35 mm' },
  { key: 'kt_50_50',   width: 50,  height: 50,  label: 'KT 50×50 mm' },
  { key: 'kt_100_35',  width: 100, height: 35,  label: 'KT 100×35 mm' },
  { key: 'kt_100_50',  width: 100, height: 50,  label: 'KT 100×50 mm' },
  { key: 'kt_100_60',  width: 100, height: 60,  label: 'KT 100×60 mm' },
  { key: 'kt_150_35',  width: 150, height: 35,  label: 'KT 150×35 mm' },
  { key: 'kt_150_50',  width: 150, height: 50,  label: 'KT 150×50 mm' },
  { key: 'kt_150_60',  width: 150, height: 60,  label: 'KT 150×60 mm' },
  { key: 'kt_150_100', width: 150, height: 100, label: 'KT 150×100 mm' },
  { key: 'kt_200_50',  width: 200, height: 50,  label: 'KT 200×50 mm' },
  { key: 'kt_200_60',  width: 200, height: 60,  label: 'KT 200×60 mm' },
  { key: 'kt_200_100', width: 200, height: 100, label: 'KT 200×100 mm' },
  { key: 'kt_300_60',  width: 300, height: 60,  label: 'KT 300×60 mm' },
  { key: 'kt_300_100', width: 300, height: 100, label: 'KT 300×100 mm' },
  { key: 'kt_400_60',  width: 400, height: 60,  label: 'KT 400×60 mm' },
  { key: 'kt_400_100', width: 400, height: 100, label: 'KT 400×100 mm' },
  { key: 'kt_500_100', width: 500, height: 100, label: 'KT 500×100 mm' },
  { key: 'kt_600_100', width: 600, height: 100, label: 'KT 600×100 mm' },
]

export const COUNT_CATEGORIES = [
  { key: 'socket',   label: 'Dugalj',      color: '#FF8C42' },
  { key: 'switch',   label: 'Kapcsoló',    color: '#A78BFA' },
  { key: 'light',    label: 'Lámpa',       color: '#FFD166' },
  { key: 'panel',    label: 'Elosztó',     color: '#FF6B6B' },
  { key: 'junction', label: 'Kötődoboz',   color: '#4CC9F0' },
  { key: 'conduit',  label: 'Cső/Védőcs.', color: '#06B6D4' },
  ...CABLE_TRAY_SIZES.map(s => ({
    key: s.key, label: s.label, color: CABLE_TRAY_COLOR,
    isCableTray: true, cableTrayWidth: s.width, cableTrayHeight: s.height,
  })),
  { key: 'other',    label: 'Egyéb',       color: '#71717A' },
]

// Shared grouped category dropdown — used by both DxfToolbar and PdfViewer
export function CategoryDropdown({ activeCategory, onCategoryChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const cat = COUNT_CATEGORIES.find(c => c.key === activeCategory) || COUNT_CATEGORIES[0]
  const regularCats = COUNT_CATEGORIES.filter(c => !c.isCableTray && c.key !== 'other')
  const cableTrayCATS = COUNT_CATEGORIES.filter(c => c.isCableTray)
  const otherCat = COUNT_CATEGORIES.find(c => c.key === 'other')

  const CatBtn = ({ c }) => (
    <button key={c.key} onClick={() => { onCategoryChange(c.key); setOpen(false) }} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
      background: c.key === activeCategory ? `${c.color}18` : 'transparent',
      border: 'none', color: c.key === activeCategory ? c.color : '#B0B8C8',
      fontSize: 12, fontFamily: 'DM Mono', fontWeight: c.key === activeCategory ? 700 : 500, textAlign: 'left',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: c.isCableTray ? 2 : '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
      {c.key === activeCategory && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
    </button>
  )

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 2 }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
        background: `${cat.color}18`, border: `1px solid ${cat.color}40`, color: cat.color,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: cat.isCableTray ? 2 : '50%', background: cat.color }} />
        {cat.label} <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#111113',
          border: `1px solid #1E1E22`, borderRadius: 8, padding: 4, zIndex: 50, minWidth: 170,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {/* Regular categories */}
          {regularCats.map(c => <CatBtn key={c.key} c={c} />)}

          {/* Cable tray group */}
          <div style={{ margin: '4px 0', borderTop: '1px solid #1E1E22', paddingTop: 4 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 2px',
              fontSize: 10, fontFamily: 'Syne', fontWeight: 700, color: CABLE_TRAY_COLOR, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={CABLE_TRAY_COLOR} strokeWidth="2.5"><rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10"/></svg>
              Kábeltálca
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {cableTrayCATS.map(c => <CatBtn key={c.key} c={c} />)}
            </div>
          </div>

          {/* Egyéb */}
          <div style={{ borderTop: '1px solid #1E1E22', paddingTop: 4, marginTop: 0 }}>
            {otherCat && <CatBtn c={otherCat} />}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolIcon({ id, size = 15, color }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'select') return <svg {...p}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
  if (id === 'count') return <svg {...p}><path d="M4 4h5v5H4z"/><path d="M14 4h6M14 9h4"/><path d="M4 14h5v5H4z"/><path d="M14 14h6M14 19h4"/></svg>
  if (id === 'measure') return <svg {...p}><path d="M2 12h20"/><path d="M6 8v8M18 8v8M10 10v4M14 10v4"/></svg>
  if (id === 'calibrate') return <svg {...p}><path d="M2 2l20 20"/><path d="M2 2v6h6"/><path d="M22 22v-6h-6"/></svg>
  return null
}

const TOOLS = [
  { id: 'select', label: 'Azonosítás', key: 'I' },
  { id: 'count', label: 'Számlálás', key: 'C' },
  { id: 'measure', label: 'Mérés', key: 'M' },
  { id: 'calibrate', label: 'Skála', key: 'S' },
]

export default function DxfToolbar({
  activeTool, onToolChange, onFitView, onZoomIn, onZoomOut,
  onToggleLayers, layersPanelOpen,
  onToggleCountPanel, countPanelOpen,
  activeCategory, onCategoryChange,
  scale, markerCount, measureCount,
  onUndo, onClearAll,
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
      {TOOLS.map(t => {
        const on = activeTool === t.id
        return (
          <button key={t.id} onClick={() => onToolChange(on ? null : t.id)} title={`${t.label} (${t.key})`} style={{
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'Syne', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
            background: on ? 'rgba(0,229,160,0.12)' : 'transparent',
            border: `1px solid ${on ? 'rgba(0,229,160,0.3)' : 'transparent'}`,
            color: on ? C.accent : C.text, transition: 'all 0.12s',
          }}>
            <ToolIcon id={t.id} color={on ? C.accent : C.textSub} />
            <span>{t.label}</span>
            {t.id === 'count' && markerCount > 0 && <span style={{ background: C.accent, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{markerCount}</span>}
            {t.id === 'measure' && measureCount > 0 && <span style={{ background: C.yellow, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{measureCount}</span>}
            {t.id === 'calibrate' && scale?.calibrated && <span style={{ background: C.blue, color: C.bg, borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 700, fontFamily: 'DM Mono' }}>✓</span>}
          </button>
        )
      })}

      {/* Category picker when counting */}
      {activeTool === 'count' && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} />
      )}

      <div style={{ flex: 1 }} />

      {/* Undo/Clear */}
      {(markerCount > 0 || measureCount > 0) && (
        <>
          <BtnIcon onClick={onUndo} title="Visszavonás (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="M3 10l4-4M3 10l4 4"/></svg>
          </BtnIcon>
          <BtnIcon onClick={onClearAll} title="Összes törlése">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
          </BtnIcon>
        </>
      )}

      {/* Count summary */}
      {markerCount > 0 && (
        <BtnIcon onClick={onToggleCountPanel} title="Összesítő" active={countPanelOpen} activeColor={C.accent}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={countPanelOpen ? C.accent : C.muted} strokeWidth="2" strokeLinecap="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>
          </svg>
        </BtnIcon>
      )}

      {/* Layers */}
      <BtnIcon onClick={onToggleLayers} title="Rétegek" active={layersPanelOpen} activeColor={C.blue}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={layersPanelOpen ? C.blue : C.muted} strokeWidth="2" strokeLinecap="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
        </svg>
        <span style={{ fontSize: 11, fontFamily: 'Syne', color: layersPanelOpen ? C.blue : C.muted }}>Rétegek</span>
      </BtnIcon>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
        <ZBtn onClick={onZoomIn}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></ZBtn>
        <ZBtn onClick={onFitView}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></ZBtn>
        <ZBtn onClick={onZoomOut}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSub} strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg></ZBtn>
      </div>
    </div>
  )
}

function BtnIcon({ children, onClick, title, active, activeColor }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'Syne', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 5,
      background: active ? `${activeColor || '#fff'}12` : 'transparent',
      border: `1px solid ${active ? `${activeColor || '#fff'}30` : 'transparent'}`,
      color: '#71717A', transition: 'all 0.12s',
    }}>{children}</button>
  )
}

function ZBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '4px 6px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  )
}
