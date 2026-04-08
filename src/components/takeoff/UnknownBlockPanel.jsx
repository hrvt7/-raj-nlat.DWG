import React, { useMemo, useState } from 'react'
import { C } from './designTokens.js'
import { suggestAssemblies } from '../../utils/suggestAssemblies.js'
import { scoreUnknownBlock } from '../../utils/blockRecognition.js'

// ─── Unknown Block Resolution Panel ──────────────────────────────────────────
// Shows blocks that recognizeBlock + memory could not match. The user picks an
// assembly for each; the override is recorded immediately to recognition memory
// so the same block is auto-matched on future encounters.
/** Threshold for bulk-skip: unknown blocks with qty ≤ this are "low-impact" */
const BULK_SKIP_QTY_THRESHOLD = 2

export default function UnknownBlockPanel({ unknownItems, assemblies, onAssign, onDelete, onBulkSkipLowImpact, evidenceMap, progress, onBlockHover, selectedBlock, onBlockSelect }) {
  const [showLowPriority, setShowLowPriority] = useState(false)

  // Score and split into two tiers
  const { likelyItems, lowItems } = useMemo(() => {
    const scored = (unknownItems || []).map(item => ({
      ...item,
      ...scoreUnknownBlock(item.blockName, item.qty),
    }))
    return {
      likelyItems: scored.filter(i => i.tier === 'likely').sort((a, b) => b.score - a.score || b.qty - a.qty),
      lowItems: scored.filter(i => i.tier === 'low').sort((a, b) => b.qty - a.qty),
    }
  }, [unknownItems])

  // Keep sorted for legacy bulk-skip (operates on all items)
  const sorted = useMemo(() =>
    [...(unknownItems || [])].sort((a, b) => b.qty - a.qty),
    [unknownItems]
  )

  if (!unknownItems || unknownItems.length === 0) return null

  // Build assembly options: only top-level assemblies (not variants), sorted by label
  const asmOptions = assemblies
    .filter(a => !a.variantOf)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'hu'))

  return (
    <div data-testid="unknown-block-panel" style={{
      marginBottom: 14, padding: '10px 14px', borderRadius: 10,
      background: 'rgba(255,107,107,0.04)',
      border: `1px solid rgba(255,107,107,0.18)`,
    }}>
      <div style={{
        fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.red,
        marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>⚠</span>
        {unknownItems.length} ismeretlen blokk — rendelj hozzá tételt
      </div>
      {/* Progress summary: shows resolution coverage when there's work to do */}
      {progress && progress.totalTypes > 0 && (
        <div data-testid="unknown-progress" style={{ marginBottom: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
          }}>
            <div style={{
              flex: 1, height: 3, borderRadius: 1.5,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 1.5,
                width: `${progress.coveragePct}%`,
                background: progress.coveragePct >= 80 ? C.accent
                  : progress.coveragePct >= 40 ? C.yellow : C.red,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{
              fontFamily: 'DM Mono', fontSize: 9, color: C.muted,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {progress.resolvedTypes}/{progress.totalTypes} fajta — {progress.coveragePct}%
            </span>
          </div>
        </div>
      )}
      {/* Bulk-skip: exclude all low-qty unknowns in one click */}
      {(() => {
        const lowImpactCount = sorted.filter(i => i.qty <= BULK_SKIP_QTY_THRESHOLD).length
        if (lowImpactCount < 2 || !onBulkSkipLowImpact) return null
        const lowImpactQty = sorted.filter(i => i.qty <= BULK_SKIP_QTY_THRESHOLD).reduce((s, i) => s + i.qty, 0)
        return (
          <button
            data-testid="bulk-skip-low-impact"
            onClick={() => onBulkSkipLowImpact(BULK_SKIP_QTY_THRESHOLD)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', padding: '6px 10px', marginBottom: 6,
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
              borderRadius: 6, cursor: 'pointer', fontSize: 10,
              fontFamily: 'DM Mono', color: C.muted,
              transition: 'background 0.15s',
            }}
            title={`${lowImpactCount} blokk (≤${BULK_SKIP_QTY_THRESHOLD} db) kihagyása — nem befolyásolja az árajánlatot`}
          >
            <span style={{ fontSize: 12 }}>⏭</span>
            {lowImpactCount} alacsony hatású kihagyása ({lowImpactQty} db, ≤{BULK_SKIP_QTY_THRESHOLD} db/fajta)
          </button>
        )
      })()}
      {/* ── Likely relevant items ── */}
      {likelyItems.map(item => (
        <UnknownBlockRow key={item.blockName} item={item} asmOptions={asmOptions}
          assemblies={assemblies} evidenceMap={evidenceMap}
          onAssign={onAssign} onDelete={onDelete} onBlockHover={onBlockHover}
          isSelected={selectedBlock === item.blockName} onBlockSelect={onBlockSelect} />
      ))}

      {/* ── Low priority items (collapsible) ── */}
      {lowItems.length > 0 && (
        <>
          <button
            onClick={() => setShowLowPriority(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '6px 10px', marginTop: 4,
              background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
              borderRadius: 6, cursor: 'pointer', fontSize: 10,
              fontFamily: 'DM Mono', color: C.muted,
            }}
          >
            <span style={{ fontSize: 10 }}>{showLowPriority ? '▼' : '▶'}</span>
            {lowItems.length} alacsony prioritású blokk
            <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.6 }}>
              {lowItems.reduce((s, i) => s + i.qty, 0)} db
            </span>
          </button>
          {showLowPriority && lowItems.map(item => (
            <UnknownBlockRow key={item.blockName} item={item} asmOptions={asmOptions}
              assemblies={assemblies} evidenceMap={evidenceMap}
              onAssign={onAssign} onDelete={onDelete} onBlockHover={onBlockHover}
              dimmed />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Single unknown block row ────────────────────────────────────────────────
function UnknownBlockRow({ item, asmOptions, assemblies, evidenceMap, onAssign, onDelete, onBlockHover, dimmed, isSelected, onBlockSelect }) {
  const evidence = evidenceMap?.get(item.blockName) || null
  const suggestions = suggestAssemblies(item.blockName, evidence, assemblies)

  return (
    <div data-testid="unknown-block-row" style={{
      padding: '6px 8px', borderTop: `1px solid ${C.border}`,
      opacity: dimmed ? 0.55 : 1,
      borderRadius: 6, cursor: 'pointer',
      background: isSelected ? 'rgba(76,201,240,0.08)' : 'transparent',
      border: isSelected ? '1px solid rgba(76,201,240,0.30)' : '1px solid transparent',
      marginBottom: 2,
      transition: 'background 0.15s, border-color 0.15s',
    }}
      onMouseEnter={() => onBlockHover?.(item.blockName)}
      onMouseLeave={() => { if (!isSelected) onBlockHover?.(null) }}
      onClick={() => onBlockSelect?.(item.blockName)}
    >
      {/* Row 1: block info + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dimmed ? C.border : C.muted, flexShrink: 0,
        }} />
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily: 'DM Mono', fontSize: 11, color: C.textSub,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
          title={item.blockName}
        >
          {item.blockName}
        </div>
        <span style={{
          fontFamily: 'DM Mono', fontSize: 10, color: C.muted, flexShrink: 0,
        }}>
          {item.qty} db
        </span>
        <select
          data-testid="unknown-block-select"
          value=""
          onChange={e => {
            if (e.target.value) onAssign(item.blockName, e.target.value)
          }}
          style={{
            background: C.bg, border: `1px solid ${C.borderLight}`,
            borderRadius: 6, color: C.textSub, fontSize: 10,
            fontFamily: 'DM Mono', padding: '3px 6px', cursor: 'pointer',
            maxWidth: 140, flexShrink: 0,
          }}
        >
          <option value="">Hozzárendelés…</option>
          {asmOptions.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button
          onClick={() => onDelete(item.blockName)}
          title="Kihagyás"
          style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.muted, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', lineHeight: 1, padding: 0, flexShrink: 0,
          }}
        >✕</button>
      </div>
      {/* Row 2: quick-pick suggestion chips (if any) */}
      {suggestions.length > 0 && (
        <div data-testid="quick-pick-row" style={{
          display: 'flex', gap: 4, marginTop: 4, marginLeft: 16,
          flexWrap: 'wrap',
        }}>
          {suggestions.map(asm => (
            <button
              key={asm.id}
              data-testid="quick-pick-btn"
              onClick={() => onAssign(item.blockName, asm.id)}
              title={asm.description || asm.name}
              style={{
                background: 'rgba(76,201,240,0.08)',
                border: `1px solid rgba(76,201,240,0.25)`,
                borderRadius: 5, padding: '2px 8px',
                fontFamily: 'DM Mono', fontSize: 10, fontWeight: 500,
                color: C.blue, cursor: 'pointer',
                whiteSpace: 'nowrap', lineHeight: 1.4,
              }}
            >
              {asm.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
