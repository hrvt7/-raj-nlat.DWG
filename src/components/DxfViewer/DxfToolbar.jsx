import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

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
  { key: 'elosztok', label: 'Elosztó',     color: '#FF6B6B' },
  { key: 'panel',    label: 'Elosztó (ref.)', color: '#FF6B6B' },
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
    <div ref={ref} style={{ position: 'relative', marginLeft: 2 }} onMouseDown={e => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
        background: `${cat.color}18`, border: `1px solid ${cat.color}40`, color: cat.color,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: cat.isCableTray ? 2 : '50%', background: cat.color }} />
        {cat.label} <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </button>
      {open && (
        <div onMouseDown={e => e.stopPropagation()} style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#111113',
          border: `1px solid #1E1E22`, borderRadius: 8, padding: 4, zIndex: 100, minWidth: 170,
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

// ─── Assembly-based dropdown for counting ─────────────────────────────────────
// Shows countSelectable assemblies grouped by category + special items
const ASM_CATEGORY_GROUPS = [
  { key: 'szerelvenyek', label: 'Szerelvények' },
  { key: 'vilagitas', label: 'Világítás' },
  { key: 'elosztok', label: 'Elosztók / Védelem' },
  { key: 'gyengaram', label: 'Gyengeáram' },
  { key: 'tuzjelzo', label: 'Tűzjelző' },
]
export const ASM_COLORS_MAP = {
  'szerelvenyek': '#4CC9F0',
  'vilagitas': '#00E5A0',
  'elosztok': '#FF6B6B',
  'gyengaram': '#A78BFA',
  'tuzjelzo': '#FF8C42',
  '_special': '#FFD166',
}
const SPECIAL_ITEMS = [
  { key: 'panel', label: 'Elosztó (referencia)', color: '#FF6B6B' },
  { key: 'junction', label: 'Kötődoboz', color: '#4CC9F0' },
  { key: 'other', label: 'Egyéb', color: '#71717A' },
]

export function AssemblyDropdown({ activeCategory, onCategoryChange, assemblies }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const [popupPos, setPopupPos] = useState(null)

  // Recalculate popup position when opening
  const updatePopupPos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPopupPos({ top: rect.bottom + 4, left: rect.left })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePopupPos()
    // Close on outside mousedown — check both trigger and portal popup
    const h = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (popupRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Use capture phase to run before any canvas handlers
    document.addEventListener('mousedown', h, true)
    // Reposition on scroll/resize
    window.addEventListener('scroll', updatePopupPos, true)
    window.addEventListener('resize', updatePopupPos)
    return () => {
      document.removeEventListener('mousedown', h, true)
      window.removeEventListener('scroll', updatePopupPos, true)
      window.removeEventListener('resize', updatePopupPos)
    }
  }, [open, updatePopupPos])

  // Only show countSelectable, non-variant assemblies
  const mainAssemblies = (assemblies || []).filter(a => !a.variantOf && a.countSelectable)

  // Find the active item — could be an assembly or a special item
  const activeAsm = mainAssemblies.find(a => a.id === activeCategory)
  const activeSpecial = SPECIAL_ITEMS.find(s => s.key === activeCategory)
  const activeLabel = activeAsm?.name || activeSpecial?.label || 'Válassz...'
  const activeColor = activeAsm ? (ASM_COLORS_MAP[activeAsm.category] || '#9CA3AF') : (activeSpecial?.color || '#9CA3AF')

  const handleSelect = useCallback((id) => {
    onCategoryChange(id)
    setOpen(false)
  }, [onCategoryChange])

  const [hoverId, setHoverId] = useState(null)

  const AsmBtn = ({ id, label, color }) => {
    const isActive = id === activeCategory
    const isHover = id === hoverId
    return (
      <button
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
        onClick={() => handleSelect(id)}
        onMouseEnter={() => setHoverId(id)}
        onMouseLeave={() => setHoverId(null)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
          background: isActive ? `${color}22` : isHover ? `${color}0D` : 'transparent',
          border: 'none',
          color: isActive ? color : isHover ? '#E4E4E7' : '#9CA3AF',
          fontSize: 11, fontFamily: 'DM Mono', fontWeight: isActive ? 700 : 500,
          textAlign: 'left', transition: 'background 0.1s, color 0.1s',
        }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: isActive || isHover ? color : '#555', flexShrink: 0, transition: 'background 0.1s' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {isActive && <span style={{ marginLeft: 'auto', fontSize: 10, flexShrink: 0, color }}>✓</span>}
      </button>
    )
  }

  // Render popup via portal to escape all stacking contexts and overflow clipping
  const popupContent = open && popupPos && createPortal(
    <div
      ref={popupRef}
      onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
      style={{
        position: 'fixed', top: popupPos.top, left: popupPos.left,
        background: '#111113', border: '1px solid #1E1E22', borderRadius: 8,
        padding: 4, zIndex: 99999, minWidth: 240, maxWidth: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', maxHeight: 400, overflowY: 'auto',
      }}
    >
      {/* Assembly groups by category */}
      {ASM_CATEGORY_GROUPS.map((grp, gi) => {
        const grpAsms = mainAssemblies.filter(a => a.category === grp.key)
        if (!grpAsms.length) return null
        const grpColor = ASM_COLORS_MAP[grp.key] || '#9CA3AF'
        return (
          <div key={grp.key} style={{ marginBottom: 2, borderTop: gi > 0 ? '1px solid #1E1E22' : 'none', paddingTop: gi > 0 ? 4 : 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 3px',
              fontSize: 10, fontFamily: 'Syne', fontWeight: 700, color: grpColor, letterSpacing: '0.05em', textTransform: 'uppercase',
              pointerEvents: 'none', userSelect: 'none',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: grpColor, opacity: 0.6 }} />
              {grp.label}
            </div>
            {grpAsms.map(a => (
              <AsmBtn key={a.id} id={a.id} label={a.name} color={grpColor} />
            ))}
          </div>
        )
      })}

      {/* Special items separator */}
      <div style={{ borderTop: '1px solid #1E1E22', paddingTop: 4, marginTop: 2 }}>
        <div style={{
          padding: '5px 10px 3px', fontSize: 10, fontFamily: 'Syne', fontWeight: 700,
          color: '#FFD166', letterSpacing: '0.05em', textTransform: 'uppercase',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          Egyéb elemek
        </div>
        {SPECIAL_ITEMS.map(s => (
          <AsmBtn key={s.key} id={s.key} label={s.label} color={s.color} />
        ))}
      </div>
    </div>,
    document.body
  )

  return (
    <div style={{ position: 'relative', marginLeft: 2 }} onMouseDown={e => e.stopPropagation()}>
      <button ref={triggerRef} onClick={() => setOpen(!open)} style={{
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'DM Mono', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200,
        background: `${activeColor}18`, border: `1px solid ${activeColor}40`, color: activeColor,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeLabel}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▼</span>
      </button>
      {popupContent}
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
  assemblies,
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

      {/* Assembly/Category picker when counting — assembly-first when available */}
      {activeTool === 'count' && assemblies?.length > 0 && (
        <AssemblyDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} assemblies={assemblies} />
      )}
      {activeTool === 'count' && (!assemblies || !assemblies.length) && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} />
      )}

      <div style={{ flex: 1 }} />

      {/* Undo/Clear */}
      {(markerCount > 0 || measureCount > 0) && (
        <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
          <MiniBtn onClick={onUndo} title="Visszavonás (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="M3 10l4-4M3 10l4 4"/></svg>
          </MiniBtn>
          <MiniBtn onClick={onClearAll} title="Összes törlése" color={C.red}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </MiniBtn>
        </div>
      )}

      {/* Összesítő — text pill */}
      {markerCount > 0 && (
        <button onClick={onToggleCountPanel} title="Összesítő panel" style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          fontFamily: 'Syne', fontWeight: 700,
          background: countPanelOpen ? 'rgba(0,229,160,0.15)' : 'transparent',
          border: `1px solid ${countPanelOpen ? 'rgba(0,229,160,0.3)' : C.border}`,
          color: countPanelOpen ? C.accent : C.muted,
          transition: 'all 0.12s',
        }}>
          {countPanelOpen ? 'Összesítő ✓' : 'Összesítő'}
        </button>
      )}

      {/* Layers — text pill */}
      <button onClick={onToggleLayers} title="Rétegek" style={{
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
        fontFamily: 'Syne', fontWeight: 700,
        background: layersPanelOpen ? 'rgba(76,201,240,0.15)' : 'transparent',
        border: `1px solid ${layersPanelOpen ? 'rgba(76,201,240,0.3)' : C.border}`,
        color: layersPanelOpen ? C.blue : C.muted,
        transition: 'all 0.12s',
      }}>
        {layersPanelOpen ? 'Rétegek ✓' : 'Rétegek'}
      </button>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
        <MiniBtn onClick={onZoomIn} title="Nagyítás"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></MiniBtn>
        <MiniBtn onClick={onFitView} title="Illesztés"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></MiniBtn>
        <MiniBtn onClick={onZoomOut} title="Kicsinyítés"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg></MiniBtn>
      </div>
    </div>
  )
}

function MiniBtn({ children, onClick, title, color }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '5px 7px', borderRadius: 4, cursor: 'pointer',
      background: 'transparent', border: 'none',
      color: color || C.muted, fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'color 0.1s',
    }}>{children}</button>
  )
}
