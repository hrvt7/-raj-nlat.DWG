import React, { useState, useEffect, useRef, useCallback } from 'react'
import { C, fmt, Card, Button, Badge, Input, SectionHeader, EmptyState } from '../components/ui.jsx'
import { WORK_ITEM_CATEGORIES, generateAssemblyId } from '../data/workItemsDb.js'
import { loadAssemblies, saveAssemblies, loadWorkItems, loadMaterials } from '../data/store.js'

// ─── Assembly Editor v3.0 – Grid + Modal ──────────────────────────────────────

export default function AssembliesPage() {
  const [assemblies, setAssemblies] = useState(loadAssemblies)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')

  const selected = assemblies.find(a => a.id === selectedId) || null

  const persist = useCallback((updated) => {
    setAssemblies(updated)
    saveAssemblies(updated)
  }, [])

  const filtered = assemblies.filter(a => {
    const matchCat = catFilter === 'all' || a.category === catFilter
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const handleCreate = () => {
    const id = generateAssemblyId(assemblies)
    const now = new Date().toISOString()
    const newAsm = {
      id, name: 'Új assembly', category: 'szerelvenyek',
      description: '', components: [],
      createdAt: now, updatedAt: now,
    }
    const updated = [newAsm, ...assemblies]
    persist(updated)
    setSelectedId(id)
  }

  const handleUpdate = (updatedAsm) => {
    const updated = assemblies.map(a => a.id === updatedAsm.id
      ? { ...updatedAsm, updatedAt: new Date().toISOString() } : a)
    persist(updated)
  }

  const handleDuplicate = (asm) => {
    const id = generateAssemblyId(assemblies)
    const now = new Date().toISOString()
    const dup = { ...asm, id, name: `${asm.name} (másolat)`, createdAt: now, updatedAt: now,
      components: asm.components.map(c => ({ ...c })) }
    const updated = [dup, ...assemblies]
    persist(updated)
    setSelectedId(id)
  }

  const handleDelete = (id) => {
    const updated = assemblies.filter(a => a.id !== id)
    persist(updated)
    if (selectedId === id) setSelectedId(null)
  }

  // Close modal on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: C.text }}>Assemblyk</h1>
          <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, marginTop: 4 }}>
            Előre összeállított szerelvénycsomagok · {assemblies.length} assembly
          </p>
        </div>
        <Button size="sm" onClick={handleCreate} icon="＋">Új assembly</Button>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', maxWidth: 300 }}>
          <Input value={search} onChange={setSearch} placeholder="Keresés..." />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <FilterChip label="Összes" active={catFilter === 'all'} onClick={() => setCatFilter('all')} />
          {WORK_ITEM_CATEGORIES.filter(c => assemblies.some(a => a.category === c.key)).map(c => (
            <FilterChip key={c.key} label={c.label} active={catFilter === c.key}
              onClick={() => setCatFilter(c.key)} />
          ))}
        </div>
      </div>

      {/* 3-column grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Nincs találat"
          desc="Hozz létre új assembly-t a jobb felső + gombbal"
          action={<Button onClick={handleCreate}>Új assembly</Button>}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(asm => (
            <AssemblyGridCard
              key={asm.id}
              assembly={asm}
              onClick={() => setSelectedId(asm.id)}
            />
          ))}
        </div>
      )}

      {/* Modal overlay */}
      {selected && (
        <AssemblyModal
          assembly={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdate}
          onDuplicate={(asm) => { handleDuplicate(asm) }}
          onDelete={(id) => { handleDelete(id); setSelectedId(null) }}
        />
      )}
    </div>
  )
}

// ─── Assembly Grid Card ────────────────────────────────────────────────────────

function AssemblyGridCard({ assembly, onClick }) {
  const cat = WORK_ITEM_CATEGORIES.find(c => c.key === assembly.category)
  const compCount = assembly.components?.length || 0
  const workItems = assembly.components?.filter(c => c.itemType === 'workitem') || []
  const materials = assembly.components?.filter(c => c.itemType === 'material') || []
  const totalNorm = workItems.reduce((s, c) => s + (parseFloat(c.norm_time) || 0), 0)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(0,229,160,0.04)' : C.bgCard,
        border: `1px solid ${hovered ? 'rgba(0,229,160,0.25)' : C.border}`,
        borderRadius: 14, padding: '20px 20px 16px', cursor: 'pointer',
        transition: 'all 0.18s',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.35)' : 'none',
      }}
    >
      {/* Category badge + ID */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {cat ? (
          <Badge color="green">{cat.icon} {cat.label}</Badge>
        ) : (
          <span />
        )}
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>{assembly.id}</span>
      </div>

      {/* Name */}
      <div style={{
        fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {assembly.name}
      </div>

      {/* Description */}
      {assembly.description && (
        <div style={{
          fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, marginBottom: 14,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {assembly.description}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: C.border, marginBottom: 12 }} />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>{materials.length} anyag</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>{workItems.length} munka</span>
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent }}>
          {compCount} elem
        </div>
      </div>
    </div>
  )
}

// ─── Assembly Modal ────────────────────────────────────────────────────────────

function AssemblyModal({ assembly, onClose, onUpdate, onDuplicate, onDelete }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(4px)',
        }}
      />
      {/* Modal panel */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 1001,
        transform: 'translate(-50%, -50%)',
        width: 'min(740px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 64px)',
        overflowY: 'auto',
        borderRadius: 18,
        boxShadow: '0 32px 96px rgba(0,0,0,0.8)',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 10,
            background: C.bgHover, border: `1px solid ${C.border}`,
            borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
            color: C.textSub, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
        <AssemblyEditorPanel
          assembly={assembly}
          onUpdate={onUpdate}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>
    </>
  )
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 14, cursor: 'pointer', fontSize: 10,
      fontFamily: 'Syne', fontWeight: 700,
      background: active ? C.accentDim : C.bgCard,
      color: active ? C.accent : C.textSub,
      border: `1px solid ${active ? C.accentBorder : C.border}`,
      whiteSpace: 'nowrap',
    }}>{label}</button>
  )
}

// ─── Assembly Card ────────────────────────────────────────────────────────────

function AssemblyCard({ assembly, isSelected, onClick }) {
  const cat = WORK_ITEM_CATEGORIES.find(c => c.key === assembly.category)
  const compCount = assembly.components?.length || 0
  const workItems = assembly.components?.filter(c => c.itemType === 'workitem') || []
  const totalNorm = workItems.reduce((s, c) => s + (parseFloat(c.norm_time) || 0), 0)

  return (
    <div onClick={onClick} style={{
      background: isSelected ? 'rgba(0,229,160,0.06)' : C.bgCard,
      border: `1px solid ${isSelected ? C.accent + '50' : C.border}`,
      borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.bgHover }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = C.bgCard }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: isSelected ? C.accent : C.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {assembly.name}
          </div>
          {assembly.description && (
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {assembly.description}
            </div>
          )}
        </div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, flexShrink: 0, marginTop: 2 }}>
          {assembly.id}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        {cat && <Badge color="green">{cat.icon} {cat.label}</Badge>}
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub }}>
          {compCount} elem
        </span>
      </div>
    </div>
  )
}

// ─── Assembly Editor Panel ────────────────────────────────────────────────────

function AssemblyEditorPanel({ assembly, onUpdate, onDuplicate, onDelete }) {
  const [name, setName] = useState(assembly.name)
  const [category, setCategory] = useState(assembly.category)
  const [description, setDescription] = useState(assembly.description || '')
  const [components, setComponents] = useState(assembly.components || [])
  const [showPalette, setShowPalette] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  // Reset when assembly changes
  useEffect(() => {
    setName(assembly.name)
    setCategory(assembly.category)
    setDescription(assembly.description || '')
    setComponents(assembly.components || [])
    setShowPalette(false)
    setShowMenu(false)
  }, [assembly.id])

  // Auto-save on changes
  const saveTimeout = useRef(null)
  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      onUpdate({ ...assembly, name, category, description, components })
    }, 400)
    return () => clearTimeout(saveTimeout.current)
  }, [name, category, description, components])

  // ── Component management ──
  const addComponent = (item) => {
    const newComp = {
      itemCode: item.code,
      itemType: item._type, // 'material' or 'workitem'
      name: item.name,
      unit: item.unit,
      qty: 1,
      sortOrder: components.length,
    }
    setComponents(prev => [...prev, newComp])
  }

  const updateComponent = (idx, field, value) => {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const removeComponent = (idx) => {
    setComponents(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sortOrder: i })))
  }

  // ── Drag & drop reorder ──
  const handleDragStart = (e, idx) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `reorder:${idx}`)
  }

  const handleDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIdx(idx)
  }

  const handleDrop = (e, targetIdx) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('text/plain')

    if (data.startsWith('reorder:')) {
      // Reorder within list
      const sourceIdx = parseInt(data.split(':')[1])
      if (sourceIdx === targetIdx) { setDragIdx(null); setDropIdx(null); return }
      const updated = [...components]
      const [moved] = updated.splice(sourceIdx, 1)
      updated.splice(targetIdx, 0, moved)
      setComponents(updated.map((c, i) => ({ ...c, sortOrder: i })))
    } else if (data.startsWith('palette:')) {
      // Add from palette
      try {
        const item = JSON.parse(data.replace('palette:', ''))
        const newComp = {
          itemCode: item.code, itemType: item._type, name: item.name,
          unit: item.unit, qty: 1, sortOrder: targetIdx,
        }
        const updated = [...components]
        updated.splice(targetIdx, 0, newComp)
        setComponents(updated.map((c, i) => ({ ...c, sortOrder: i })))
      } catch {}
    }

    setDragIdx(null)
    setDropIdx(null)
  }

  const handleDragEnd = () => { setDragIdx(null); setDropIdx(null) }

  // Drop zone at end of list
  const handleDropEnd = (e) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('text/plain')

    if (data.startsWith('reorder:')) {
      const sourceIdx = parseInt(data.split(':')[1])
      const updated = [...components]
      const [moved] = updated.splice(sourceIdx, 1)
      updated.push(moved)
      setComponents(updated.map((c, i) => ({ ...c, sortOrder: i })))
    } else if (data.startsWith('palette:')) {
      try {
        const item = JSON.parse(data.replace('palette:', ''))
        addComponent(item)
      } catch {}
    }

    setDragIdx(null)
    setDropIdx(null)
  }

  // ── Summary ──
  const materialCount = components.filter(c => c.itemType === 'material').length
  const workitemCount = components.filter(c => c.itemType === 'workitem').length

  return (
    <Card style={{ padding: 0, overflow: 'visible' }}>
      {/* Editor header */}
      <div style={{
        padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            flex: 1, minWidth: 180, background: 'transparent', border: 'none',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.text, outline: 'none',
          }}
          placeholder="Assembly neve..."
        />
        <select value={category} onChange={e => setCategory(e.target.value)} style={{
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
          padding: '6px 10px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none',
        }}>
          {WORK_ITEM_CATEGORIES.map(c => (
            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
          ))}
        </select>

        {/* ⋯ menu */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowMenu(!showMenu)} style={{
            background: C.bgHover, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '6px 10px', cursor: 'pointer', color: C.textSub, fontSize: 14,
          }}>⋯</button>
          {showMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
              background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 160, overflow: 'hidden',
            }}>
              <MenuBtn label="📋 Duplikálás" onClick={() => { onDuplicate(assembly); setShowMenu(false) }} />
              <MenuBtn label="🗑 Törlés" onClick={() => { if (confirm('Törlöd ezt az assembly-t?')) { onDelete(assembly.id); setShowMenu(false) } }} danger />
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div style={{ padding: '12px 22px 0' }}>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Rövid leírás..."
          style={{
            width: '100%', background: 'transparent', border: 'none',
            fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, outline: 'none',
          }}
        />
      </div>

      {/* Component list */}
      <div style={{ padding: '16px 22px' }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, marginBottom: 10,
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Komponensek ({components.length})
        </div>

        {components.length === 0 && (
          <div
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDrop={handleDropEnd}
            style={{
              border: `2px dashed ${C.border}`, borderRadius: 10, padding: '32px 20px',
              textAlign: 'center', color: C.textMuted, fontSize: 13, fontFamily: 'DM Mono',
            }}
          >
            Húzz ide elemeket a palettáról, vagy kattints az "Elem hozzáadása" gombra
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {components.map((comp, idx) => (
            <React.Fragment key={`${comp.itemCode}-${idx}`}>
              {/* Drop indicator */}
              {dropIdx === idx && dragIdx !== idx && (
                <div style={{ height: 2, background: C.accent, borderRadius: 1, margin: '2px 0' }} />
              )}
              <ComponentRow
                comp={comp} idx={idx}
                isDragging={dragIdx === idx}
                onUpdate={(field, val) => updateComponent(idx, field, val)}
                onRemove={() => removeComponent(idx)}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              />
            </React.Fragment>
          ))}
        </div>

        {/* Drop zone at end */}
        {components.length > 0 && (
          <div
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropIdx(components.length) }}
            onDrop={handleDropEnd}
            onDragLeave={() => setDropIdx(null)}
            style={{
              height: dropIdx === components.length ? 24 : 8,
              background: dropIdx === components.length ? C.accentDim : 'transparent',
              borderRadius: 4, transition: 'all 0.15s', marginTop: 2,
            }}
          />
        )}
      </div>

      {/* Palette toggle */}
      <div style={{ padding: '0 22px 16px' }}>
        <button onClick={() => setShowPalette(!showPalette)} style={{
          width: '100%', padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
          background: showPalette ? C.accentDim : C.bgHover,
          border: `1px solid ${showPalette ? C.accentBorder : C.border}`,
          color: showPalette ? C.accent : C.textSub,
          fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {showPalette ? '▾ Elem hozzáadása' : '▸ Elem hozzáadása'}
        </button>

        {showPalette && (
          <ItemPalette onAdd={addComponent} />
        )}
      </div>

      {/* Summary footer */}
      <div style={{
        padding: '14px 22px', borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 20, flexWrap: 'wrap',
      }}>
        <SummaryItem label="Anyagok" value={materialCount} color={C.text} />
        <SummaryItem label="Munkatételek" value={workitemCount} color={C.blue} />
        <SummaryItem label="Összes elem" value={components.length} color={C.accent} />
      </div>
    </Card>
  )
}

// ─── Component Row ────────────────────────────────────────────────────────────

function ComponentRow({ comp, idx, isDragging, onUpdate, onRemove, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        background: isDragging ? C.accentDim : hovered ? C.bgHover : 'transparent',
        border: `1px solid ${isDragging ? C.accentBorder : 'transparent'}`,
        opacity: isDragging ? 0.5 : 1,
        transition: 'background 0.1s, opacity 0.15s',
        cursor: 'grab',
      }}
    >
      {/* Drag handle */}
      <span style={{ color: C.textMuted, fontSize: 12, cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>⠿</span>

      {/* Type badge */}
      <Badge color={comp.itemType === 'material' ? 'green' : 'blue'}>
        {comp.itemType === 'material' ? 'anyag' : 'munka'}
      </Badge>

      {/* Name */}
      <span style={{
        flex: 1, fontFamily: 'DM Mono', fontSize: 12, color: C.text, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {comp.name}
      </span>

      {/* Qty input */}
      <input
        type="number"
        value={comp.qty}
        onChange={e => onUpdate('qty', parseFloat(e.target.value) || 0)}
        onClick={e => e.stopPropagation()}
        style={{
          width: 56, background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 5, color: C.accent, padding: '4px 6px', fontSize: 12,
          fontFamily: 'DM Mono', textAlign: 'right', outline: 'none',
        }}
      />

      {/* Unit */}
      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, width: 24, flexShrink: 0 }}>
        {comp.unit}
      </span>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: hovered ? C.red : 'transparent', fontSize: 14,
          transition: 'color 0.15s', padding: '0 2px', flexShrink: 0,
        }}
      >✕</button>
    </div>
  )
}

// ─── Item Palette ─────────────────────────────────────────────────────────────

function ItemPalette({ onAdd }) {
  const [tab, setTab] = useState('materials')
  const [query, setQuery] = useState('')
  const materials = loadMaterials()
  const workItems = loadWorkItems()

  const items = tab === 'materials'
    ? materials.map(m => ({ ...m, _type: 'material' }))
    : workItems.map(w => ({ ...w, _type: 'workitem' }))

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase()) ||
    i.code?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 20)

  return (
    <div style={{
      marginTop: 10, background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        <PaletteTab label="📦 Anyagok" active={tab === 'materials'} onClick={() => setTab('materials')} />
        <PaletteTab label="⚡ Munkatételek" active={tab === 'workitems'} onClick={() => setTab('workitems')} />
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 6px' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Keresés név vagy kód..."
          style={{
            width: '100%', background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '7px 10px', color: C.text,
            fontFamily: 'DM Mono', fontSize: 12, outline: 'none',
          }}
        />
      </div>

      {/* Items */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {filtered.map(item => (
          <PaletteItem key={item.code} item={item} onAdd={() => onAdd(item)} />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 16, color: C.textMuted, fontSize: 12 }}>
            Nincs találat
          </div>
        )}
      </div>
    </div>
  )
}

function PaletteTab({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px', cursor: 'pointer',
      background: active ? C.bgCard : 'transparent',
      border: 'none', borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
      color: active ? C.accent : C.textSub, fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
    }}>{label}</button>
  )
}

function PaletteItem({ item, onAdd }) {
  const [hovered, setHovered] = useState(false)

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('text/plain', `palette:${JSON.stringify(item)}`)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onAdd}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        borderRadius: 6, cursor: 'grab', marginBottom: 2,
        background: hovered ? C.bgHover : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, width: 60, flexShrink: 0 }}>
        {item.code}
      </span>
      <span style={{
        flex: 1, fontFamily: 'DM Mono', fontSize: 12, color: C.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.name}
      </span>
      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>
        {item.unit}
      </span>
      {hovered && (
        <span style={{ color: C.accent, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>+</span>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MenuBtn({ label, onClick, danger }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block', width: '100%', padding: '10px 14px', cursor: 'pointer',
        background: hovered ? (danger ? C.redDim : C.bgHover) : 'transparent',
        border: 'none', borderBottom: `1px solid ${C.border}`,
        color: danger ? C.red : C.text, fontFamily: 'DM Mono', fontSize: 12,
        textAlign: 'left',
      }}>{label}</button>
  )
}

function SummaryItem({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
