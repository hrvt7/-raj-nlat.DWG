// ─── Manual Cable Mode Panel ──────────────────────────────────────────────────
// Lightweight UI for the manual cable assist workflow.
// Shows: reference panel status, recognized panel selection, click instructions,
// estimate strength, and next actions.
// Rendered in the Cable tab when manualCableMode is active.

import React from 'react'

// ── Design tokens (must match TakeoffWorkspace / CableConfidenceCard) ────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgHover: '#17171A',
  border: '#1E1E22', borderLight: '#2A2A30',
  accent: '#00E5A0', accentDim: 'rgba(0,229,160,0.12)',
  yellow: '#FFD166', yellowDim: 'rgba(255,209,102,0.15)',
  red: '#FF6B6B', redDim: 'rgba(255,107,107,0.12)',
  blue: '#4CC9F0', blueDim: 'rgba(76,201,240,0.08)',
  purple: '#A78BFA', purpleDim: 'rgba(167,139,250,0.1)',
  text: '#E4E4E7', textSub: '#9CA3AF', muted: '#71717A',
}

export default function ManualCableModePanel({
  referencePanels,
  recognizedPanelBlocks,
  cableEstimate,
  cableAudit,
  onAddRecognizedPanel,
  onRemovePanel,
  onExit,
}) {
  const panelCount = referencePanels?.length || 0
  const uniqueBlocks = [...new Set((referencePanels || []).map(p => p.blockName))]
  const hasPanels = panelCount > 0
  const hasEstimate = cableEstimate && cableEstimate._source === 'panel_assisted'

  return (
    <div style={{
      background: C.purpleDim,
      border: `1px solid rgba(167,139,250,0.25)`,
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔧</span>
          <span style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
            color: C.purple,
          }}>
            Kézi kábelmód
          </span>
          {hasPanels && (
            <span style={{
              fontFamily: 'DM Mono', fontSize: 9, padding: '2px 7px',
              borderRadius: 8, background: 'rgba(255,255,255,0.06)',
              color: C.accent,
            }}>
              {panelCount} elosztó
            </span>
          )}
        </div>
        <button
          onClick={onExit}
          title="Kilépés a kézi kábelmódból"
          style={{
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.border}`,
            color: C.muted,
            fontFamily: 'DM Mono', fontSize: 10,
            transition: 'all 0.15s',
          }}
        >
          Kilépés ✕
        </button>
      </div>

      {/* Status message */}
      <div style={{
        fontFamily: 'DM Mono', fontSize: 11, color: C.textSub,
        marginBottom: 12, lineHeight: '1.6',
        padding: '8px 10px', borderRadius: 6,
        background: hasPanels ? 'rgba(0,229,160,0.06)' : 'rgba(255,209,102,0.08)',
        border: `1px solid ${hasPanels ? 'rgba(0,229,160,0.15)' : 'rgba(255,209,102,0.15)'}`,
      }}>
        {hasPanels ? (
          <>
            <span style={{ color: C.accent }}>✓</span>{' '}
            {panelCount} referenciaelosztó megadva ({uniqueBlocks.join(', ')}) — pozícióalapú kábelbecslés használható.
          </>
        ) : (
          <>
            <span style={{ color: C.yellow }}>!</span>{' '}
            Nincs referenciaelosztó — pontosabb kábelbecsléshez jelölj meg legalább egyet.
          </>
        )}
      </div>

      {/* Recognized panel selection */}
      {recognizedPanelBlocks?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 6,
          }}>
            Felismert elosztó blokkok:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recognizedPanelBlocks.map(block => {
              const isSelected = referencePanels?.some(p => p.blockName === block.blockName)
              return (
                <button
                  key={block.blockName}
                  onClick={() => {
                    if (isSelected) {
                      onRemovePanel(block.blockName)
                    } else {
                      onAddRecognizedPanel(block.blockName)
                    }
                  }}
                  style={{
                    padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                    background: isSelected ? C.accentDim : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isSelected ? 'rgba(0,229,160,0.3)' : C.border}`,
                    color: isSelected ? C.accent : C.textSub,
                    fontFamily: 'DM Mono', fontSize: 10,
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11 }}>{isSelected ? '✓' : '+'}</span>
                  <span>{block.blockName}</span>
                  <span style={{ color: C.muted }}>({block.qty} db)</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Click instruction */}
      <div style={{
        fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
        marginBottom: 12, lineHeight: '1.5',
      }}>
        💡 Kattints bármelyik blokkra a tervrajzon, hogy elosztóként jelöld meg.
        {hasPanels && ' Kattints újra egy kijelölt blokkra a visszavonáshoz.'}
      </div>

      {/* Selected panels list */}
      {hasPanels && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 4,
          }}>
            Kijelölt referenciaelosztók:
          </div>
          {uniqueBlocks.map(blockName => {
            const entries = referencePanels.filter(p => p.blockName === blockName)
            const source = entries[0]?.source === 'recognized_panel' ? 'felismert' : 'kézi'
            return (
              <div key={blockName} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.02)',
                marginBottom: 2,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>
                    {blockName}
                  </span>
                  <span style={{
                    fontFamily: 'DM Mono', fontSize: 8, color: C.muted,
                    padding: '1px 4px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)',
                  }}>
                    {source} · {entries.length} pos
                  </span>
                </div>
                <button
                  onClick={() => onRemovePanel(blockName)}
                  style={{
                    background: 'none', border: 'none', color: C.muted,
                    cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 10,
                    padding: '2px 4px',
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Estimate result */}
      {hasEstimate && (
        <div style={{
          padding: '8px 10px', borderRadius: 6,
          background: 'rgba(0,229,160,0.06)',
          border: `1px solid rgba(0,229,160,0.15)`,
          marginBottom: 10,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>
              Panel-alapú becslés
            </span>
            <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.accent }}>
              ~{Math.round(cableEstimate.cable_total_m)} m
            </span>
          </div>
          <div style={{
            fontFamily: 'DM Mono', fontSize: 9, color: C.muted, marginTop: 4,
          }}>
            {cableEstimate.method}
          </div>
        </div>
      )}

      {/* Transparency notice */}
      <div style={{
        fontFamily: 'DM Mono', fontSize: 9, color: C.muted,
        lineHeight: '1.5', padding: '6px 0',
        borderTop: `1px solid rgba(255,255,255,0.04)`,
      }}>
        ⚠ A kábelhossz továbbra is becsült, nem nyomvonal-alapú.
        {hasPanels
          ? ' Az elosztó-eszköz távolságból számolt érték pontosabb, mint az átlagos becslés, de nem helyettesíti a pontos tervezést.'
          : ' Jelölj meg legalább egy referenciaelosztót a pontosabb becsléshez.'
        }
      </div>
    </div>
  )
}
