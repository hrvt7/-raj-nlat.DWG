// ─── RecipeListPanel ─────────────────────────────────────────────────────────
// Lightweight popover panel showing all project recipes with quick actions.
//
// BOUNDARY: This component ONLY operates on recipeStore data.
// It does NOT touch DetectionCandidate[], generic detection state,
// or the PDF rule engine. Recipe matching goes through the existing
// runRecipeMatching path.
//
// Props:
//   recipes         — SymbolRecipe[] (already filtered by project)
//   onRun           — (recipe) => void — run single recipe on current plan
//   onRunAll        — () => void — run all project recipes
//   onRename        — (recipeId, newLabel) => void
//   onDelete        — (recipeId) => void
//   onScopeToggle   — (recipeId, newScope) => void
//   onClose         — () => void
//   isRunning       — boolean
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { RECIPE_SCOPE } from '../data/recipeStore.js'

const C = {
  bg: '#09090B', bgCard: '#111113', bgHover: '#17171A',
  border: '#1E1E22', borderLight: '#2A2A30',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

export default function RecipeListPanel({
  recipes, onRun, onRunAll, onRename, onDelete, onScopeToggle, onClose, isRunning,
}) {
  const panelRef = useRef(null)

  // Click-outside to close
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    // Delay attachment to avoid immediate close from the button click that opened us
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Escape to close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!recipes?.length) {
    return (
      <div ref={panelRef} style={panelStyle}>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>
            Projekt minták
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
            Nincs mentett minta ebben a projektben.
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 4 }}>
            Azonosítás módban jelölj ki egy szimbólumot a tervrajzon.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>
          Projekt minták
          <span style={{
            marginLeft: 6, background: C.blue, color: C.bg,
            borderRadius: 10, padding: '1px 7px', fontSize: 10,
            fontWeight: 700, fontFamily: 'DM Mono',
          }}>
            {recipes.length}
          </span>
        </div>
        <button onClick={onClose} style={closeBtnStyle} title="Bezárás (Esc)">✕</button>
      </div>

      {/* Run all button */}
      <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onRunAll} disabled={isRunning} style={{
          width: '100%', padding: '7px 12px', borderRadius: 6,
          cursor: isRunning ? 'wait' : 'pointer',
          background: C.accent, border: 'none', color: C.bg,
          fontSize: 12, fontFamily: 'Syne', fontWeight: 700,
          opacity: isRunning ? 0.5 : 1, transition: 'all 0.12s',
        }}>
          {isRunning ? 'Keresés...' : `Összes futtatása (${recipes.length})`}
        </button>
      </div>

      {/* Recipe list */}
      <div style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
        {recipes.map(recipe => (
          <RecipeRow
            key={recipe.id}
            recipe={recipe}
            onRun={() => onRun(recipe)}
            onRename={(newLabel) => onRename(recipe.id, newLabel)}
            onDelete={() => onDelete(recipe.id)}
            onScopeToggle={() => {
              const newScope = recipe.scope === RECIPE_SCOPE.CURRENT_PAGE
                ? RECIPE_SCOPE.WHOLE_PLAN : RECIPE_SCOPE.CURRENT_PAGE
              onScopeToggle(recipe.id, newScope)
            }}
            isRunning={isRunning}
          />
        ))}
      </div>
    </div>
  )
}

// ── RecipeRow ──────────────────────────────────────────────────────────────────

function RecipeRow({ recipe, onRun, onRename, onDelete, onScopeToggle, isRunning }) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const inputRef = useRef(null)

  // Format the origin info
  const originLabel = recipe.sourcePlanId
    ? `${(recipe.sourcePlanId || '').slice(0, 8)}… p${recipe.sourcePageNumber || '?'}`
    : 'Ismeretlen terv'

  const scopeLabel = recipe.scope === RECIPE_SCOPE.CURRENT_PAGE ? 'oldal' : 'terv'
  const usageLabel = recipe.usageCount ? `${recipe.usageCount}×` : '0×'

  // Format date
  const dateLabel = recipe.createdAt
    ? new Date(recipe.createdAt).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })
    : ''

  // Start rename
  const startRename = useCallback(() => {
    setEditVal(recipe.label || recipe.assemblyName || '')
    setEditing(true)
    setShowActions(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [recipe])

  // Submit rename
  const submitRename = useCallback(() => {
    const trimmed = editVal.trim()
    if (trimmed && trimmed !== (recipe.label || recipe.assemblyName || '')) {
      onRename(trimmed)
    }
    setEditing(false)
  }, [editVal, recipe, onRename])

  // Handle delete confirm
  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setShowActions(false)
      // Auto-cancel after 3s
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    onDelete()
    setConfirmDelete(false)
  }, [confirmDelete, onDelete])

  return (
    <div
      style={{
        padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: 3,
        borderBottom: `1px solid ${C.border}20`,
        background: showActions || editing ? C.bgHover : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => !editing && setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setConfirmDelete(false) }}
    >
      {/* Row 1: Name + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Assembly color dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: C.blue, opacity: 0.8,
        }} />

        {/* Name / edit */}
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={submitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') submitRename()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{
              flex: 1, minWidth: 0, padding: '2px 6px', borderRadius: 4,
              background: C.bg, border: `1px solid ${C.accent}40`,
              color: C.text, fontSize: 11, fontFamily: 'DM Mono',
              outline: 'none',
            }}
          />
        ) : (
          <div style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'DM Mono', fontSize: 11, color: C.text,
          }}>
            {recipe.label || recipe.assemblyName || 'Névtelen minta'}
          </div>
        )}

        {/* Quick actions (visible on hover) */}
        {showActions && !editing && !confirmDelete && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <MicroBtn onClick={onRun} disabled={isRunning} title="Futtatás ezen a terven">
              ▶
            </MicroBtn>
            <MicroBtn onClick={startRename} title="Átnevezés">
              ✎
            </MicroBtn>
            <MicroBtn onClick={onScopeToggle} title={`Scope: ${scopeLabel} → váltás`}>
              {recipe.scope === RECIPE_SCOPE.CURRENT_PAGE ? '📄' : '📋'}
            </MicroBtn>
            <MicroBtn onClick={handleDelete} title="Törlés" style={{ color: C.red }}>
              ✕
            </MicroBtn>
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.red }}>Biztos?</span>
            <MicroBtn onClick={handleDelete} style={{ color: C.red, fontWeight: 700 }} title="Igen, törlés">
              ✓
            </MicroBtn>
            <MicroBtn onClick={() => setConfirmDelete(false)} title="Mégse">
              ✕
            </MicroBtn>
          </div>
        )}
      </div>

      {/* Row 2: Origin info */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center', marginLeft: 14,
        fontFamily: 'DM Mono', fontSize: 9, color: C.muted,
      }}>
        <span title="Forrás terv">{originLabel}</span>
        <span>·</span>
        <span title="Assembly">{recipe.assemblyName || recipe.assemblyId}</span>
        <span>·</span>
        <span title="Scope">{scopeLabel}</span>
        <span>·</span>
        <span title="Használat">{usageLabel}</span>
        {dateLabel && <>
          <span>·</span>
          <span title="Létrehozva">{dateLabel}</span>
        </>}
      </div>
    </div>
  )
}

// ── Micro button for inline actions ──────────────────────────────────────────

function MicroBtn({ children, onClick, title, disabled, style: extraStyle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick() }}
      disabled={disabled}
      title={title}
      style={{
        padding: '2px 5px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
        background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
        color: C.textSub, fontSize: 11, lineHeight: 1,
        opacity: disabled ? 0.3 : 1, transition: 'all 0.1s',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  )
}

// ── Panel style ──────────────────────────────────────────────────────────────

const panelStyle = {
  position: 'absolute', top: 44, left: 8, zIndex: 28,
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
  minWidth: 280, maxWidth: 340,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
}

const closeBtnStyle = {
  background: 'none', border: 'none', color: C.muted, cursor: 'pointer',
  fontSize: 14, padding: '2px 4px', borderRadius: 4,
}
