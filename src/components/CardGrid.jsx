import React, { useState, useRef, useCallback, useMemo } from 'react'
import { C } from './ui.jsx'

// ─── ViewToggle ───────────────────────────────────────────────────────────────
export function ViewToggle({ view, onChange }) {
  const IconGrid = () => (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
      <rect x="0"  y="0" width="5" height="5" rx="1.2"/>
      <rect x="7"  y="0" width="5" height="5" rx="1.2"/>
      <rect x="0"  y="7" width="5" height="5" rx="1.2"/>
      <rect x="7"  y="7" width="5" height="5" rx="1.2"/>
    </svg>
  )
  const IconList = () => (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
      <rect x="0" y="1"   width="12" height="1.8" rx="0.9"/>
      <rect x="0" y="5.1" width="12" height="1.8" rx="0.9"/>
      <rect x="0" y="9.2" width="12" height="1.8" rx="0.9"/>
    </svg>
  )
  const btn = (v, Icon, title) => (
    <button key={v} onClick={() => onChange(v)} title={title} style={{
      padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: 'none',
      background: view === v ? C.bgCard : 'transparent',
      color: view === v ? C.text : C.textMuted,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.12s',
    }}>
      <Icon />
    </button>
  )
  return (
    <div style={{
      display: 'flex', gap: 1, background: C.bg,
      border: `1px solid ${C.border}`, borderRadius: 8, padding: 2, flexShrink: 0,
    }}>
      {btn('grid', IconGrid, 'Kártya nézet')}
      {btn('list', IconList, 'Lista nézet')}
    </div>
  )
}

// ─── useDraggableOrder ────────────────────────────────────────────────────────
export function useDraggableOrder(items, storageKey, getKey) {
  const [order, setOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null') }
    catch { return null }
  })
  const [dragOverKey, setDragOverKey] = useState(null)
  const [draggingKey, setDraggingKey] = useState(null)
  const dragKeyRef = useRef(null)

  const orderedItems = useMemo(() => {
    if (!order) return items
    const idx = {}
    order.forEach((k, i) => { idx[k] = i })
    return [...items].sort((a, b) => {
      const ai = idx[getKey(a)] ?? 99999
      const bi = idx[getKey(b)] ?? 99999
      return ai - bi
    })
  }, [items, order, getKey])

  const handleDragStart = useCallback((e, key) => {
    dragKeyRef.current = key
    setDraggingKey(key)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingKey(null)
    setDragOverKey(null)
    dragKeyRef.current = null
  }, [])

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverKey(key)
  }, [])

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverKey(null)
    }
  }, [])

  const handleDrop = useCallback((e, toKey) => {
    e.preventDefault()
    const fromKey = dragKeyRef.current
    setDragOverKey(null)
    setDraggingKey(null)
    dragKeyRef.current = null
    if (!fromKey || fromKey === toKey) return
    const keys = orderedItems.map(getKey)
    const fi = keys.indexOf(fromKey)
    const ti = keys.indexOf(toKey)
    if (fi === -1 || ti === -1) return
    const newOrder = [...keys]
    newOrder.splice(fi, 1)
    newOrder.splice(ti, 0, fromKey)
    localStorage.setItem(storageKey, JSON.stringify(newOrder))
    setOrder(newOrder)
  }, [orderedItems, getKey, storageKey])

  return { orderedItems, dragOverKey, draggingKey, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop }
}

// ─── DraggableCardWrapper ─────────────────────────────────────────────────────
// Wraps any card with drag-to-reorder logic + absolute drag handle
export function DraggableCardWrapper({ itemKey, dragOverKey, draggingKey, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop, borderRadius = 12, children }) {
  const isOver     = dragOverKey  === itemKey
  const isDragging = draggingKey  === itemKey
  return (
    <div
      style={{ position: 'relative', opacity: isDragging ? 0.38 : 1, transition: 'opacity 0.12s', borderRadius }}
      onDragOver={e => handleDragOver(e, itemKey)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, itemKey)}
    >
      {/* Drop indicator ring */}
      <div style={{
        position: 'absolute', inset: -1, borderRadius: borderRadius + 1, pointerEvents: 'none',
        border: isOver ? `2px solid ${C.accent}` : '2px solid transparent',
        boxShadow: isOver ? `0 0 12px ${C.accent}30` : 'none',
        transition: 'border-color 0.12s, box-shadow 0.12s', zIndex: 4,
      }} />
      {/* Drag handle — top-right, absolutely positioned */}
      <div
        draggable="true"
        onDragStart={e => { e.stopPropagation(); handleDragStart(e, itemKey) }}
        onDragEnd={e => { e.stopPropagation(); handleDragEnd() }}
        onClick={e => e.stopPropagation()}
        title="Húzd az átrendezéshez"
        className="drag-handle"
        style={{
          position: 'absolute', top: 7, right: 7, zIndex: 10,
          cursor: 'grab', padding: '4px 5px', borderRadius: 5,
          color: C.textMuted, fontSize: 14, userSelect: 'none',
          background: C.bg, border: `1px solid ${C.border}`,
          lineHeight: 1, opacity: 0.3, transition: 'opacity 0.12s',
          display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
      >
        ⠿
      </div>
      {children}
    </div>
  )
}

// ─── ListTable ────────────────────────────────────────────────────────────────
// Thin wrapper providing the list container and header row styling
export function ListTable({ children }) {
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

// ─── ListRow ──────────────────────────────────────────────────────────────────
// Generic draggable list row shell
export function ListRow({ itemKey, dragOverKey, draggingKey, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop, onClick, onMouseEnter, onMouseLeave, children }) {
  const isOver     = dragOverKey  === itemKey
  const isDragging = draggingKey  === itemKey
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', cursor: 'pointer',
        borderBottom: `1px solid ${C.border}`,
        background: isOver ? `${C.accent}0a` : (isDragging ? `${C.bg}` : 'transparent'),
        opacity: isDragging ? 0.4 : 1,
        outline: isOver ? `2px solid ${C.accent}50` : '2px solid transparent',
        transition: 'background 0.1s, opacity 0.12s',
        position: 'relative',
      }}
      onDragOver={e => handleDragOver(e, itemKey)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, itemKey)}
    >
      {/* Drag handle */}
      <div
        draggable="true"
        onDragStart={e => { e.stopPropagation(); handleDragStart(e, itemKey) }}
        onDragEnd={e => { e.stopPropagation(); handleDragEnd() }}
        onClick={e => e.stopPropagation()}
        title="Húzd az átrendezéshez"
        style={{
          cursor: 'grab', color: C.textMuted, fontSize: 13, userSelect: 'none',
          flexShrink: 0, opacity: 0.35, transition: 'opacity 0.12s', lineHeight: 1, padding: '0 2px',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.35'}
      >
        ⠿
      </div>
      {children}
    </div>
  )
}
