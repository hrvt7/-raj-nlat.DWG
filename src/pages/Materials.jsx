import React, { useState } from 'react'
import { C, fmt, Button, Badge, Input } from '../components/ui.jsx'
import { ViewToggle, DraggableCardWrapper, ListTable, ListRow, useDraggableOrder } from '../components/CardGrid.jsx'
import { CATALOG_GRID_STYLE, catalogCardShell, CARD_HEADER_STYLE, CARD_TITLE_STYLE, CARD_DIVIDER_STYLE, CARD_STAT_LABEL, CARD_STAT_ACCENT, CARD_STAT_YELLOW, CARD_STAT_UNIT, CARD_CODE_STYLE, categoryChipStyle, deleteButtonStyle } from '../components/catalogCardStyles.js'
import { saveMaterials, DEFAULT_MATERIALS } from '../data/store.js'
import { getMaterialCategoriesForTrade } from '../data/trades.js'

// ─── Material categories ────────────────────────────────────────────────────
export const MATERIAL_CATEGORIES = [
  { key: 'doboz',       label: 'Dobozok',       color: '#A78BFA' },
  { key: 'szerelvenyek', label: 'Szerelvények',  color: '#00E5A0' },
  { key: 'kabel',       label: 'Kábelek',       color: '#4CC9F0' },
  { key: 'talca',       label: 'Kábeltálcák',   color: '#F59E0B' },
  { key: 'vedelem',     label: 'Védelem',       color: '#FF6B6B' },
  { key: 'ipari',       label: 'Ipari',         color: '#EC4899' },
  { key: 'elosztok',    label: 'Elosztók',      color: '#FFD166' },
  { key: 'gyengaram',   label: 'Gyengeáram',    color: '#06B6D4' },
  { key: 'seged',       label: 'Segédanyag',    color: '#71717A' },
  { key: 'vilagitas',   label: 'Világítás',     color: '#FBBF24' },
  // New trade-specific categories
  { key: 'gyengaram_halozat',   label: 'Hálózat (GY)',      color: '#22D3EE' },
  { key: 'gyengaram_biztonsag', label: 'Biztonság (GY)',     color: '#0EA5E9' },
  { key: 'tuzjelzo_erzekelo',   label: 'Érzékelők (TŰZ)',   color: '#EF4444' },
  { key: 'tuzjelzo_kozpont',    label: 'Központ (TŰZ)',      color: '#DC2626' },
]

export default function MaterialsPage({ materials, onMaterialsChange, activeTrade }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('tpro_mat_view') || 'grid')

  // Trade filtering
  const tradeMaterialCategories = activeTrade ? getMaterialCategoriesForTrade(activeTrade) : null

  const filtered = materials.filter(m => {
    const matchTrade = !tradeMaterialCategories || tradeMaterialCategories.includes(m.category)
    const matchCat = activeCategory === 'all' || m.category === activeCategory
    const matchSearch = !search || [m.name, m.code].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return matchTrade && matchCat && matchSearch
  })

  const drag = useDraggableOrder(filtered, 'tpro_mat_order', m => m.code)

  const saveItem = (item) => {
    let updated
    if (item._isNew) {
      const { _isNew, ...clean } = item
      updated = [...materials, clean]
    } else {
      updated = materials.map(m => m.code === item.code ? item : m)
    }
    onMaterialsChange(updated)
    saveMaterials(updated)
    setEditItem(null)
    setShowAdd(false)
  }

  const deleteItem = (code) => {
    if (!confirm('Törlöd ezt az anyagot?')) return
    const updated = materials.filter(m => m.code !== code)
    onMaterialsChange(updated)
    saveMaterials(updated)
  }

  const resetToDefaults = () => {
    if (!confirm('Visszaállítod az alapértelmezett anyaglistát? A saját módosításaid elvesznek.')) return
    onMaterialsChange([...DEFAULT_MATERIALS])
    saveMaterials(DEFAULT_MATERIALS)
  }

  const newCode = () => {
    const maxNum = materials.reduce((mx, m) => {
      const n = parseInt(m.code.replace('MAT-', ''), 10)
      return isNaN(n) ? mx : Math.max(mx, n)
    }, 0)
    return `MAT-${String(maxNum + 1).padStart(3, '0')}`
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: C.text }}>Anyagok</h1>
          <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, marginTop: 4 }}>
            Anyaglista adatbázis – {materials.length} tétel · Nettó egységárak (Ft)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ViewToggle view={viewMode} onChange={v => { setViewMode(v); localStorage.setItem('tpro_mat_view', v) }} />
          <Button variant="ghost" size="sm" onClick={resetToDefaults}>⟳ Alaphelyzet</Button>
          <Button size="sm" onClick={() => {
            setShowAdd(true)
            setEditItem({
              _isNew: true, code: newCode(), category: 'szerelvenyek',
              name: '', unit: 'db', price: 0, discount: 0
            })
          }} icon="＋">Új anyag</Button>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setActiveCategory('all')} style={{
          padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
          background: activeCategory === 'all' ? C.accent : C.bgCard,
          color: activeCategory === 'all' ? '#09090B' : C.textSub,
          fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
          border: `1px solid ${activeCategory === 'all' ? C.accent : C.border}`
        }}>Összes ({materials.length})</button>
        {MATERIAL_CATEGORIES
          .filter(cat => !tradeMaterialCategories || tradeMaterialCategories.includes(cat.key))
          .map(cat => {
            const count = materials.filter(m => m.category === cat.key).length
            if (count === 0) return null
            const isActive = activeCategory === cat.key
            return (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
                padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                background: isActive ? C.accentDim : C.bgCard,
                color: isActive ? C.accent : C.textSub,
                fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
                border: `1px solid ${isActive ? C.accentBorder : C.border}`
              }}>
                {cat.label} ({count})
              </button>
            )
          })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <Input value={search} onChange={setSearch} placeholder="Keresés: név, kód..." />
      </div>

      {/* Cards grid / List */}
      {drag.orderedItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: C.textMuted, fontFamily: 'DM Mono', fontSize: 13 }}>
          Nincs találat a szűrési feltételekre.
        </div>
      ) : viewMode === 'grid' ? (
        <div style={CATALOG_GRID_STYLE}>
          {drag.orderedItems.map(m => (
            <DraggableCardWrapper key={m.code} itemKey={m.code} {...drag}>
              <MaterialGridCard
                material={m}
                onEdit={() => setEditItem({ ...m })}
                onDelete={() => deleteItem(m.code)}
              />
            </DraggableCardWrapper>
          ))}
        </div>
      ) : (
        <ListTable>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 14, flexShrink: 0 }} />
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', minWidth: 80 }}>Kategória</span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', minWidth: 62 }}>Kód</span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>Megnevezés</span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', minWidth: 120, textAlign: 'right' }}>Ár / Kedv. / Egys.</span>
          </div>
          {drag.orderedItems.map(m => (
            <MaterialListRow
              key={m.code}
              material={m}
              onEdit={() => setEditItem({ ...m })}
              onDelete={() => deleteItem(m.code)}
              itemKey={m.code}
              {...drag}
            />
          ))}
        </ListTable>
      )}

      {/* Info box */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, lineHeight: 1.8 }}>
          ⟶ Az árak <strong style={{ color: C.textSub }}>nettó egységárak</strong> (ÁFA nélkül) ·{' '}
          <strong style={{ color: C.yellow }}>Kedvezmény</strong> % a nagyker beszerzési árengedményt jelöli ·{' '}
          Az assemblykben az anyagok automatikusan kalkulálódnak a normaidővel
        </div>
      </div>

      {/* Edit modal */}
      {editItem && (
        <MaterialModal item={editItem} onSave={saveItem} onClose={() => { setEditItem(null); setShowAdd(false) }} />
      )}
    </div>
  )
}

// ─── MaterialListRow ──────────────────────────────────────────────────────────
function MaterialListRow({ material, onEdit, onDelete, ...dragProps }) {
  const [hovered, setHovered] = useState(false)
  const cat = MATERIAL_CATEGORIES.find(c => c.key === material.category)
  const discountedPrice = material.discount > 0 ? material.price * (1 - material.discount / 100) : material.price
  return (
    <ListRow onClick={onEdit} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} {...dragProps}>
      <span style={{
        fontFamily: 'DM Mono', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0,
        color: cat?.color || C.textSub, background: `${cat?.color || C.textSub}14`,
        border: `1px solid ${cat?.color || C.textSub}28`,
        padding: '2px 8px', borderRadius: 20, minWidth: 80, textAlign: 'center',
      }}>{cat?.label || material.category}</span>
      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, flexShrink: 0, minWidth: 62 }}>{material.code}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{material.name}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.accent, background: C.accentDim, padding: '2px 7px', borderRadius: 5 }}>{fmt(discountedPrice)} Ft</span>
        {material.discount > 0 && (
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.yellow, background: C.yellowDim, padding: '2px 7px', borderRadius: 5 }}>-{material.discount}%</span>
        )}
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, minWidth: 30, textAlign: 'center' }}>{material.unit}</span>
      </div>
      <button onClick={e => { e.stopPropagation(); onDelete() }} style={{
        padding: '4px 7px', background: 'transparent', border: `1px solid ${C.border}`,
        borderRadius: 6, color: C.textMuted, cursor: 'pointer', flexShrink: 0,
        opacity: hovered ? 1 : 0, transition: 'opacity 0.12s',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </ListRow>
  )
}

// ─── MaterialGridCard ─────────────────────────────────────────────────────────
function MaterialGridCard({ material, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const cat = MATERIAL_CATEGORIES.find(c => c.key === material.category)
  const discountedPrice = material.discount > 0
    ? material.price * (1 - material.discount / 100)
    : material.price

  return (
    <div
      onClick={onEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={catalogCardShell(hovered)}
    >
      {/* Top row: category badge + code */}
      <div style={CARD_HEADER_STYLE}>
        <span style={categoryChipStyle(cat?.color)}>
          {cat?.label || material.category}
        </span>
        <span style={CARD_CODE_STYLE}>{material.code}</span>
      </div>

      {/* Name */}
      <div style={{ ...CARD_TITLE_STYLE, marginBottom: 2 }}>
        {material.name}
      </div>

      {/* Divider */}
      <div style={CARD_DIVIDER_STYLE} />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={CARD_STAT_LABEL}>Ár</div>
          <span style={CARD_STAT_ACCENT}>
            {fmt(discountedPrice)}<span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2, color: C.textSub }}>Ft</span>
          </span>
        </div>
        {material.discount > 0 && (
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={CARD_STAT_LABEL}>Kedv.</div>
            <span style={CARD_STAT_YELLOW}>
              -{material.discount}%
            </span>
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={CARD_STAT_LABEL}>Egys.</div>
          <span style={CARD_STAT_UNIT}>{material.unit}</span>
        </div>
        {/* Delete button */}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={deleteButtonStyle(hovered)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

function MaterialModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({ ...item })
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const discountedPrice = form.discount > 0
    ? form.price * (1 - form.discount / 100)
    : form.price

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }} onClick={onClose}>
      <div style={{
        background: '#111113', border: `1px solid ${C.border}`, borderRadius: 16,
        padding: 32, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 24 }}>
          {form._isNew ? 'Új anyag' : 'Anyag szerkesztése'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Kód</label>
            <Input value={form.code} onChange={v => update('code', v)} placeholder="pl. MAT-200" />
          </div>
          <div>
            <label style={labelStyle}>Egység</label>
            <select value={form.unit} onChange={e => update('unit', e.target.value)} style={selectStyle}>
              <option value="db">db</option><option value="m">m</option>
              <option value="m2">m²</option><option value="kg">kg</option>
              <option value="csomag">csomag</option><option value="tekercs">tekercs</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Megnevezés</label>
          <Input value={form.name} onChange={v => update('name', v)} placeholder="pl. Dugalj 2P+F (fehér, alap)" />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Kategória</label>
          <select value={form.category} onChange={e => update('category', e.target.value)} style={selectStyle}>
            {MATERIAL_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <div>
            <label style={labelStyle}>Nettó egységár (Ft)</label>
            <Input value={form.price} onChange={v => update('price', parseFloat(v) || 0)} type="number" suffix="Ft" />
          </div>
          <div>
            <label style={labelStyle}>Kedvezmény (%)</label>
            <Input value={form.discount} onChange={v => update('discount', parseFloat(v) || 0)} type="number" suffix="%" />
            {form.discount > 0 && (
              <div style={{ fontSize: 10, color: C.yellow, marginTop: 4, fontFamily: 'DM Mono' }}>
                Kedvezményes ár: {fmt(discountedPrice)} Ft
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Mégse</Button>
          <Button onClick={() => onSave(form)}>Mentés</Button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, color: C.textSub,
  fontFamily: 'DM Mono', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em'
}
const selectStyle = {
  width: '100%', background: '#09090B', border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '9px 14px', color: C.text,
  fontFamily: 'DM Mono', fontSize: 13, outline: 'none'
}
