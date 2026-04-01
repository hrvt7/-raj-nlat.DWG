import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { C, fmt, Card, Button, Badge, Input, EmptyState, ConfirmDialog, useToast } from '../components/ui.jsx'
import { WORK_ITEM_CATEGORIES, generateAssemblyId, getAssemblyCompleteness } from '../data/workItemsDb.js'
import { loadAssemblies, saveAssemblies, loadWorkItems, loadMaterials, loadSettings, getAssemblyUsageCount } from '../data/store.js'
import { saveAssembliesRemote } from '../supabase.js'
import { getAssemblyCategoriesForTrade } from '../data/trades.js'
import { ViewToggle, DraggableCardWrapper, ListTable, ListRow, useDraggableOrder } from '../components/CardGrid.jsx'
import { CATALOG_GRID_STYLE, catalogCardShell, CARD_HEADER_STYLE, CARD_TITLE_STYLE, CARD_DESC_STYLE, CARD_DIVIDER_STYLE, CARD_STAT_LABEL, CARD_CODE_STYLE } from '../components/catalogCardStyles.js'

// ─── Assembly Editor v3.0 – Grid + Modal ──────────────────────────────────────

export default function AssembliesPage({ activeTrade, session }) {
  const [assemblies, setAssemblies] = useState(loadAssemblies)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [hideVariants, setHideVariants] = useState(true) // Hide child variants by default
  const [tagFilter, setTagFilter] = useState(null)
  const [_aiPrompt, _setAiPrompt] = useState('') // reserved for future AI builder
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('tpro_asm_view') || 'grid')
  const [confirmState, setConfirmState] = useState(null)
  const toast = useToast()

  // Trade filtering: restrict assemblies to ONLY exclusive categories of the active trade
  // (shared categories like 'kabelezes' are excluded so e.g. Villanytűzhely doesn't appear in Tűzjelző)
  const tradeCategories = useMemo(() => {
    if (!activeTrade) return null // null = show all
    return getAssemblyCategoriesForTrade(activeTrade)
  }, [activeTrade])

  const selected = assemblies.find(a => a.id === selectedId) || null

  const persist = useCallback((updated) => {
    setAssemblies(updated)
    saveAssemblies(updated)
    if (session) {
      saveAssembliesRemote(updated).catch(err => {
        console.error('[TakeoffPro] Remote assemblies sync failed:', err.message)
      })
    }
  }, [session])

  const filtered = useMemo(() => assemblies.filter(a => {
    // Trade filter
    const matchTrade = !tradeCategories || tradeCategories.includes(a.category)
    const matchCat = catFilter === 'all' || a.category === catFilter
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase()) ||
      a.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchVariant = !hideVariants || !a.variantOf
    const matchTag = !tagFilter || a.tags?.includes(tagFilter)
    return matchTrade && matchCat && matchSearch && matchVariant && matchTag
  }), [assemblies, catFilter, search, hideVariants, tagFilter, tradeCategories])

  const drag = useDraggableOrder(filtered, 'tpro_asm_order', a => a.id)

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tags = new Set()
    assemblies.forEach(a => a.tags?.forEach(t => tags.add(t)))
    return [...tags].sort()
  }, [assemblies])

  // AI chat handler — not yet implemented, show clear feedback
  const handleAiSubmit = () => {
    if (!aiPrompt.trim()) return
    toast.show('AI Assembly Builder hamarosan elérhető — ez a funkció még fejlesztés alatt áll.', 'info')
    setAiPrompt('')
  }

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
    toast.show('Assembly mentve', 'success')
  }

  const handleDuplicate = (asm) => {
    const id = generateAssemblyId(assemblies)
    const now = new Date().toISOString()
    const dup = { ...asm, id, name: `${asm.name} (másolat)`, createdAt: now, updatedAt: now,
      components: asm.components.map(c => ({ ...c })) }
    const updated = [dup, ...assemblies]
    persist(updated)
    setSelectedId(id)
    toast.show('Assembly duplikálva', 'success')
  }

  const handleDelete = (id) => {
    const asm = assemblies.find(a => a.id === id)
    setConfirmState({
      message: 'Törlöd ezt az assembly-t?',
      detail: asm ? `${asm.name} (${asm.id})` : id,
      confirmLabel: 'Törlés',
      onConfirm: () => {
        const updated = assemblies.filter(a => a.id !== id)
        persist(updated)
        if (selectedId === id) setSelectedId(null)
        setConfirmState(null)
        toast.show('Assembly törölve', 'success')
      }
    })
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ViewToggle view={viewMode} onChange={v => { setViewMode(v); localStorage.setItem('tpro_asm_view', v) }} />
          <Button size="sm" onClick={handleCreate} icon="＋">Új assembly</Button>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', maxWidth: 300 }}>
          <Input value={search} onChange={setSearch} placeholder="Keresés..." />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <FilterChip label="Összes" active={catFilter === 'all'} onClick={() => setCatFilter('all')} />
          {WORK_ITEM_CATEGORIES
            .filter(c => {
              // Only show categories relevant to the active trade
              if (tradeCategories && !tradeCategories.includes(c.key)) return false
              return assemblies.some(a => a.category === c.key)
            })
            .map(c => (
              <FilterChip key={c.key} label={c.label} active={catFilter === c.key}
                onClick={() => setCatFilter(c.key)} />
            ))}
        </div>

        {/* Variant toggle + tag filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <button onClick={() => setHideVariants(!hideVariants)} style={{
            padding: '4px 10px', borderRadius: 14, cursor: 'pointer', fontSize: 10,
            fontFamily: 'Syne', fontWeight: 700,
            background: hideVariants ? C.accentDim : C.bgCard,
            color: hideVariants ? C.accent : C.textSub,
            border: `1px solid ${hideVariants ? C.accentBorder : C.border}`,
          }}>
            {hideVariants ? '◆ Csoportosított' : '◇ Összes variáns'}
          </button>
        </div>
      </div>

      {/* Grid / List */}
      {drag.orderedItems.length === 0 ? (
        <EmptyState
          title="Nincs találat"
          desc="Hozz létre új assembly-t a jobb felső + gombbal"
          action={<Button onClick={handleCreate}>Új assembly</Button>}
        />
      ) : viewMode === 'grid' ? (
        <div style={CATALOG_GRID_STYLE}>
          {drag.orderedItems.map(asm => (
            <DraggableCardWrapper key={asm.id} itemKey={asm.id} borderRadius={14} {...drag}>
              <AssemblyGridCard
                assembly={asm}
                onClick={() => setSelectedId(asm.id)}
              />
            </DraggableCardWrapper>
          ))}
        </div>
      ) : (
        <ListTable>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px 8px 38px',
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ flex: '0 0 90px', fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID / Kat.</span>
            <span style={{ flex: 1, fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Megnevezés</span>
            <span style={{ flex: '0 0 110px', textAlign: 'right', fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ár</span>
            <span style={{ flex: '0 0 80px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Összetevők</span>
            <span style={{ width: 32 }} />
          </div>
          {drag.orderedItems.map(asm => (
            <AssemblyListRow
              key={asm.id}
              assembly={asm}
              onOpen={() => setSelectedId(asm.id)}
              onDelete={() => handleDelete(asm.id)}
              itemKey={asm.id}
              {...drag}
            />
          ))}
        </ListTable>
      )}

      {/* Modal overlay */}
      {selected && (
        <AssemblyModal
          assembly={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdate}
          onDuplicate={(asm) => { handleDuplicate(asm) }}
          onDelete={(id) => { handleDelete(id) }}
        />
      )}

      {/* Confirm dialog */}
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          detail={confirmState.detail}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  )
}

// ─── Assembly List Row ─────────────────────────────────────────────────────────

function AssemblyListRow({ assembly, onOpen, onDelete, isLast, ...dragProps }) {
  const [hovered, setHovered] = useState(false)
  const cat = WORK_ITEM_CATEGORIES.find(c => c.key === assembly.category)
  const workItemComps = assembly.components?.filter(c => c.itemType === 'workitem') || []
  const materialComps = assembly.components?.filter(c => c.itemType === 'material') || []
  const pricing = calcAssemblyPrice(assembly)
  const displayPrice = assembly.priceOverride != null ? assembly.priceOverride : pricing.total
  const usageCount = getAssemblyUsageCount(assembly.id)

  return (
    <ListRow
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...dragProps}
    >
      {/* ID + category */}
      <div style={{ flex: '0 0 90px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>{assembly.id}</span>
        {cat && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontFamily: 'DM Mono',
            color: C.accent, background: 'rgba(0,229,160,0.08)',
            border: `1px solid rgba(0,229,160,0.15)`,
            borderRadius: 5, padding: '1px 5px', width: 'fit-content',
          }}>
            {cat.icon} {cat.label}
          </span>
        )}
      </div>

      {/* Name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {assembly.name}
        </div>
        {assembly.description && (
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {assembly.description}
          </div>
        )}
      </div>

      {/* Price */}
      <div style={{ flex: '0 0 110px', textAlign: 'right' }}>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 14, color: C.accent }}>
          {fmt(Math.round(displayPrice))}
        </span>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub, marginLeft: 2 }}>Ft</span>
      </div>

      {/* Component counts */}
      <div style={{ flex: '0 0 80px', display: 'flex', justifyContent: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          {materialComps.length}
        </span>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {workItemComps.length}
        </span>
      </div>

      {/* Delete */}
      <div style={{ width: 32, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: C.textMuted, fontSize: 14, padding: '2px 4px', borderRadius: 4,
            opacity: hovered ? 0.7 : 0, transition: 'opacity 0.12s',
          }}
          title="Törlés"
        >✕</button>
      </div>
    </ListRow>
  )
}

// ─── Assembly Grid Card ────────────────────────────────────────────────────────

function calcAssemblyPrice(assembly) {
  const allMaterials = loadMaterials()
  const allWorkItems = loadWorkItems()
  const settings = loadSettings()
  const hourlyRate = settings?.labor?.hourly_rate || 9000

  let materialCost = 0
  let laborMinutes = 0

  for (const comp of (assembly.components || [])) {
    const qty = parseFloat(comp.qty) || 0
    if (comp.itemType === 'material') {
      const mat = allMaterials.find(m => m.code === comp.itemCode)
      if (mat) {
        const price = mat.discount > 0 ? mat.price * (1 - mat.discount / 100) : mat.price
        materialCost += price * qty
      }
    } else if (comp.itemType === 'workitem') {
      const wi = allWorkItems.find(w => w.code === comp.itemCode)
      if (wi) {
        laborMinutes += (wi.p50 || 0) * qty
      }
    }
  }

  const laborCost = (laborMinutes / 60) * hourlyRate
  return { materialCost, laborCost, total: materialCost + laborCost, laborMinutes, hourlyRate }
}

function AssemblyGridCard({ assembly, onClick }) {
  const cat = WORK_ITEM_CATEGORIES.find(c => c.key === assembly.category)
  const compCount = assembly.components?.length || 0
  const workItemComps = assembly.components?.filter(c => c.itemType === 'workitem') || []
  const materialComps = assembly.components?.filter(c => c.itemType === 'material') || []
  const pricing = calcAssemblyPrice(assembly)
  const displayPrice = assembly.priceOverride != null ? assembly.priceOverride : pricing.total
  const [hovered, setHovered] = useState(false)

  // Completeness and usage data
  const completeness = getAssemblyCompleteness(assembly)
  const usageCount = getAssemblyUsageCount(assembly.id)
  const variantCount = (assembly.variants || []).length
  const hasVariants = variantCount > 0

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...catalogCardShell(hovered), paddingRight: 36 }}
    >
      {/* Category badge + right meta (ID + variant) */}
      <div style={{ ...CARD_HEADER_STYLE, alignItems: 'flex-start', marginBottom: 12 }}>
        {cat ? (
          <Badge color="green">{cat.icon} {cat.label}</Badge>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={CARD_CODE_STYLE}>{assembly.id}</span>
          {hasVariants && (
            <span style={{
              background: 'rgba(56,189,248,0.15)', border: `1px solid ${C.blue}25`,
              borderRadius: 12, padding: '2px 8px', fontSize: 9,
              fontFamily: 'Syne', fontWeight: 700, color: C.blue,
            }}>
              {variantCount} variáns
            </span>
          )}
        </div>
      </div>

      {/* Name */}
      <div style={{ ...CARD_TITLE_STYLE, fontSize: 15, marginBottom: 6 }}>
        {assembly.name}
      </div>

      {/* Description */}
      {assembly.description && (
        <div style={{ ...CARD_DESC_STYLE, fontSize: 11, marginBottom: 12 }}>
          {assembly.description}
        </div>
      )}

      {/* Tags */}
      {assembly.tags && assembly.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
          {assembly.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{
              background: 'rgba(56,189,248,0.1)', border: `1px solid ${C.blue}25`,
              borderRadius: 10, padding: '2px 8px', fontSize: 9, color: C.blue,
              fontFamily: 'DM Mono',
            }}>
              {tag}
            </span>
          ))}
          {assembly.tags.length > 3 && (
            <span style={{
              background: C.bgHover, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '2px 8px', fontSize: 9, color: C.textMuted,
              fontFamily: 'DM Mono',
            }}>
              +{assembly.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Completeness progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 4,
        }}>
          <span style={CARD_STAT_LABEL}>Kész</span>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 11, color: C.accent }}>
            {completeness.percent}%
          </span>
        </div>
        <div style={{
          height: 4, background: C.bgHover, borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: C.accent,
            width: `${completeness.percent}%`, transition: 'width 0.2s',
          }} />
        </div>
      </div>

      {/* Price */}
      <div style={{
        background: 'rgba(0,229,160,0.06)', border: `1px solid rgba(0,229,160,0.15)`,
        borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ ...CARD_STAT_LABEL, marginBottom: 0 }}>Kalkulált ár</span>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.accent }}>
          {fmt(Math.round(displayPrice))}<span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, color: C.textSub }}>Ft</span>
        </span>
      </div>

      {/* Divider */}
      <div style={CARD_DIVIDER_STYLE} />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, fontFamily: 'DM Mono' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <span style={{ color: C.textSub }}>{materialComps.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span style={{ color: C.textSub }}>{workItemComps.length}</span>
        </div>
        <div style={{ marginLeft: 'auto', color: C.textMuted }}>
          {usageCount} felhasználás
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
  const [priceOverride, setPriceOverride] = useState(assembly.priceOverride ?? null)
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
    setPriceOverride(assembly.priceOverride ?? null)
    setShowPalette(false)
    setShowMenu(false)
  }, [assembly.id])

  // Auto-save on changes
  const saveTimeout = useRef(null)
  useEffect(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      onUpdate({ ...assembly, name, category, description, components, priceOverride })
    }, 400)
    return () => clearTimeout(saveTimeout.current)
  }, [name, category, description, components, priceOverride])

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
      } catch (err) { console.warn('[Assemblies] Invalid drag data:', err) }
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
      } catch (err) { console.warn('[Assemblies] Invalid palette data:', err) }
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
              <MenuBtn label="🗑 Törlés" onClick={() => { onDelete(assembly.id); setShowMenu(false) }} danger />
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

      {/* Pricing section */}
      <PricingSection
        assembly={{ ...assembly, components, priceOverride }}
        priceOverride={priceOverride}
        onPriceOverrideChange={setPriceOverride}
      />

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

// ─── Pricing Section ─────────────────────────────────────────────────────────

function PricingSection({ assembly, priceOverride, onPriceOverrideChange }) {
  const pricing = calcAssemblyPrice(assembly)
  const [editingPrice, setEditingPrice] = useState(false)
  const [tempPrice, setTempPrice] = useState('')
  const hasOverride = priceOverride != null

  const handleStartEdit = () => {
    setTempPrice(String(Math.round(hasOverride ? priceOverride : pricing.total)))
    setEditingPrice(true)
  }

  const handleSavePrice = () => {
    const val = parseFloat(tempPrice)
    if (!isNaN(val) && val > 0) {
      onPriceOverrideChange(val)
    }
    setEditingPrice(false)
  }

  const handleResetPrice = () => {
    onPriceOverrideChange(null)
    setEditingPrice(false)
  }

  return (
    <div style={{
      padding: '16px 22px', borderTop: `1px solid ${C.border}`,
      background: 'rgba(0,229,160,0.03)',
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, marginBottom: 12,
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Árkalkuláció
      </div>

      {/* Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Anyagköltség</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>
            {fmt(Math.round(pricing.materialCost))}<span style={{ fontSize: 9, color: C.textSub, marginLeft: 2 }}>Ft</span>
          </div>
        </div>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Munkadíj</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.blue }}>
            {fmt(Math.round(pricing.laborCost))}<span style={{ fontSize: 9, color: C.textSub, marginLeft: 2 }}>Ft</span>
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, marginTop: 2 }}>
            {Math.round(pricing.laborMinutes)}p × {fmt(pricing.hourlyRate)} Ft/ó
          </div>
        </div>
        <div style={{
          background: 'rgba(0,229,160,0.08)', border: `1px solid rgba(0,229,160,0.2)`,
          borderRadius: 8, padding: '10px 12px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>
            {hasOverride ? 'Egyedi ár' : 'Összesen'}
          </div>
          {editingPrice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
              <input
                autoFocus
                type="number"
                value={tempPrice}
                onChange={e => setTempPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePrice(); if (e.key === 'Escape') setEditingPrice(false) }}
                style={{
                  width: 80, background: C.bg, border: `1px solid ${C.accentBorder}`,
                  borderRadius: 4, color: C.accent, padding: '2px 6px', fontSize: 13,
                  fontFamily: 'Syne', fontWeight: 700, textAlign: 'right', outline: 'none',
                }}
              />
              <button onClick={handleSavePrice} style={{
                background: C.accent, border: 'none', borderRadius: 4, padding: '2px 6px',
                color: '#09090B', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>✓</button>
            </div>
          ) : (
            <div onClick={handleStartEdit} style={{ cursor: 'pointer' }} title="Kattints a szerkesztéshez">
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.accent }}>
                {fmt(Math.round(hasOverride ? priceOverride : pricing.total))}<span style={{ fontSize: 9, color: C.textSub, marginLeft: 2 }}>Ft</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={handleStartEdit} style={{
          padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          background: 'transparent', border: `1px solid ${C.border}`,
          color: C.textSub, fontFamily: 'DM Mono', fontSize: 10,
        }}>
          ✎ Ár szerkesztése
        </button>
        {hasOverride && (
          <button onClick={handleResetPrice} style={{
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.yellow, fontFamily: 'DM Mono', fontSize: 10,
          }}>
            ⟳ Kalkulált ár visszaállítása
          </button>
        )}
        {hasOverride && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginLeft: 'auto' }}>
            Kalkulált: {fmt(Math.round(pricing.total))} Ft
          </span>
        )}
      </div>
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

function CompletenessBar({ assembly, label = 'Kész' }) {
  const completeness = getAssemblyCompleteness(assembly)
  const percent = completeness.percent

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.accent }}>
          {percent}%
        </span>
      </div>
      <div style={{
        height: 6, background: C.bgHover, borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', background: C.accent,
          width: `${percent}%`, transition: 'width 0.3s ease-out',
        }} />
      </div>
    </div>
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
