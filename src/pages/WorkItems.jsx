import React, { useState } from 'react'
import { C, fmt, Card, Button, Badge, Input, SectionHeader, EmptyState } from '../components/ui.jsx'
import { WORK_ITEM_CATEGORIES } from '../data/workItemsDb.js'
import { saveWorkItems } from '../data/store.js'

export default function WorkItemsPage({ workItems, onWorkItemsChange }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [editItem, setEditItem] = useState(null) // null | item object
  const [showAdd, setShowAdd] = useState(false)

  const filtered = workItems.filter(wi => {
    const matchCat = activeCategory === 'all' || wi.category === activeCategory
    const matchSearch = !search || [wi.name, wi.code].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchSearch
  })

  const saveItem = (item) => {
    let updated
    if (item._isNew) {
      const { _isNew, ...clean } = item
      updated = [...workItems, clean]
    } else {
      updated = workItems.map(wi => wi.code === item.code ? item : wi)
    }
    onWorkItemsChange(updated)
    saveWorkItems(updated)
    setEditItem(null)
    setShowAdd(false)
  }

  const deleteItem = (code) => {
    if (!confirm('Törlöd ezt a munkatételt?')) return
    const updated = workItems.filter(wi => wi.code !== code)
    onWorkItemsChange(updated)
    saveWorkItems(updated)
  }

  const resetToDefaults = () => {
    if (!confirm('Visszaállítod az alapértelmezett normaidőket? A saját módosításaid elvesznek.')) return
    import('../data/workItemsDb.js').then(m => {
      onWorkItemsChange([...m.WORK_ITEMS_DEFAULT])
      saveWorkItems(m.WORK_ITEMS_DEFAULT)
    })
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: C.text }}>Munkatételek</h1>
          <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, marginTop: 4 }}>
            Normaidő adatbázis – {workItems.length} tétel · P50/P90 értékek
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={resetToDefaults}>⟳ Alaphelyzet</Button>
          <Button size="sm" onClick={() => { setShowAdd(true); setEditItem({ _isNew: true, code: '', category: 'szerelvenyek', name: '', unit: 'db', p50: 0, p90: 0, heightFactor: false, desc: '' }) }} icon="＋">Új tétel</Button>
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setActiveCategory('all')} style={{
          padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: activeCategory === 'all' ? C.accent : C.bgCard,
          color: activeCategory === 'all' ? '#09090B' : C.textSub,
          fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
          border: `1px solid ${activeCategory === 'all' ? C.accent : C.border}`
        }}>Összes ({workItems.length})</button>
        {WORK_ITEM_CATEGORIES.map(cat => {
          const count = workItems.filter(wi => wi.category === cat.key).length
          if (count === 0) return null
          const isActive = activeCategory === cat.key
          return (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
              padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: isActive ? C.accentDim : C.bgCard,
              color: isActive ? C.accent : C.textSub,
              fontFamily: 'Syne', fontWeight: 700, fontSize: 11,
              border: `1px solid ${isActive ? C.accentBorder : C.border}`
            }}>
              {cat.icon} {cat.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <Input value={search} onChange={setSearch} placeholder="Keresés: név, kód..." />
      </div>

      {/* Table */}
      <Card style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bgCard }}>
              {['Kód', 'Megnevezés', 'Kategória', 'Egys.', 'P50 (perc)', 'P90 (perc)', 'Magas.faktor', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 10,
                  color: C.textSub, fontFamily: 'DM Mono', fontWeight: 500,
                  borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.06em',
                  whiteSpace: 'nowrap'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((wi, i) => {
              const cat = WORK_ITEM_CATEGORIES.find(c => c.key === wi.category)
              return (
                <tr key={wi.code}
                  style={{ borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted }}>{wi.code}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.text }}>{wi.name}</div>
                    {wi.desc && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{wi.desc}</div>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: cat?.color || C.textSub }}>
                      {cat?.icon} {cat?.label || wi.category}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>
                    {wi.unit}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{
                      fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.accent,
                      background: C.accentDim, padding: '3px 8px', borderRadius: 6
                    }}>{wi.p50}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{
                      fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.yellow,
                      background: C.yellowDim, padding: '3px 8px', borderRadius: 6
                    }}>{wi.p90}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: wi.heightFactor ? C.accent : C.textMuted }}>
                      {wi.heightFactor ? '✓ igen' : '–'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditItem({ ...wi })} style={{
                        padding: '4px 10px', background: C.bgHover, border: `1px solid ${C.border}`,
                        borderRadius: 6, color: C.textSub, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer'
                      }}>✏️</button>
                      <button onClick={() => deleteItem(wi.code)} style={{
                        padding: '4px 8px', background: C.redDim, border: '1px solid rgba(255,107,107,0.15)',
                        borderRadius: 6, color: C.red, fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer'
                      }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Info box */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, lineHeight: 1.8 }}>
          💡 <strong style={{ color: C.textSub }}>P50</strong> = normál körülmények (tégla, üres szoba, normál magasság) ·{' '}
          <strong style={{ color: C.yellow }}>P90</strong> = nehéz körülmények (beton, berendezett, létra/állvány) ·{' '}
          Kontextus szorzók az ajánlat varázslóban állíthatók · Overhead (kiszállás, felvonulás) a Beállításokban
        </div>
      </div>

      {/* Edit modal */}
      {editItem && (
        <WorkItemModal item={editItem} onSave={saveItem} onClose={() => { setEditItem(null); setShowAdd(false) }} />
      )}
    </div>
  )
}

function WorkItemModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({ ...item })
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }} onClick={onClose}>
      <div style={{
        background: '#111113', border: `1px solid ${C.border}`, borderRadius: 16,
        padding: 32, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 24 }}>
          {form._isNew ? 'Új munkatétel' : 'Tétel szerkesztése'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Kód</label>
            <Input value={form.code} onChange={v => update('code', v)} placeholder="pl. SZE-010" />
          </div>
          <div>
            <label style={labelStyle}>Egység</label>
            <select value={form.unit} onChange={e => update('unit', e.target.value)} style={selectStyle}>
              <option value="db">db</option><option value="m">m</option>
              <option value="m2">m²</option><option value="ó">óra</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Megnevezés</label>
          <Input value={form.name} onChange={v => update('name', v)} placeholder="pl. Dugalj 2P+F (alap)" />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Kategória</label>
          <select value={form.category} onChange={e => update('category', e.target.value)} style={selectStyle}>
            {WORK_ITEM_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <div>
            <label style={labelStyle}>P50 normaidő (perc)</label>
            <Input value={form.p50} onChange={v => update('p50', parseFloat(v) || 0)} type="number" suffix="perc" />
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: 'DM Mono' }}>
              = {(form.p50 / 60).toFixed(2)} óra
            </div>
          </div>
          <div>
            <label style={labelStyle}>P90 normaidő (perc)</label>
            <Input value={form.p90} onChange={v => update('p90', parseFloat(v) || 0)} type="number" suffix="perc" />
            <div style={{ fontSize: 10, color: C.yellow, marginTop: 4, fontFamily: 'DM Mono' }}>
              = {(form.p90 / 60).toFixed(2)} óra (nehéz)
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={labelStyle}>Leírás</label>
          <Input value={form.desc || ''} onChange={v => update('desc', v)} placeholder="Rövid leírás, mit tartalmaz a norma" />
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="hf" checked={!!form.heightFactor} onChange={e => update('heightFactor', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: C.accent }} />
          <label htmlFor="hf" style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, cursor: 'pointer' }}>
            Magassági szorzó alkalmazható erre a tételre
          </label>
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
