import React from 'react'
import { C } from '../takeoff/designTokens.js'
import { CategoryDropdown, AssemblyDropdown } from '../DxfViewer/DxfToolbar.jsx'
import TinyBtn from './TinyBtn.jsx'

// ─── PDF Toolbar ────────────────────────────────────────────────────────────

export default function PdfToolbar({
  activeTool, onToolChange,
  activeCategory, onCategoryChange,
  scale, markerCount, measureCount,
  onFitView, onZoomIn, onZoomOut,
  onUndo, onClearAll,
  onToggleCountPanel, countPanelOpen,
  pageNum, numPages, onPrevPage, onNextPage,
  /* onToggleEstimation, estimationOpen — removed with Részletek button */
  showCableRoutes, onToggleCableRoutes,
  rotation, onRotateLeft, onRotateRight,
  assemblies,
  autoSymbolActive, autoSymbolPhase, autoSymbolCount, autoSymbolAcceptedCount, autoSymbolSearching, autoSymbolError,
  autoSymbolThreshold, autoSymbolCategory, autoSymbolLabel,
  onAutoSymbolToggle, onAutoSymbolThresholdChange, onAutoSymbolClear, onAutoSymbolSearchFull,
  onAutoSymbolAcceptAll, onAutoSymbolRejectAll, onAutoSymbolCategoryChange, onAutoSymbolLabelChange, onAutoSymbolFinalize,
}) {
  const TOOLS = [
    { id: 'count', label: 'Számlálás', key: 'C' },
    { id: 'measure', label: 'Mérés', key: 'M' },
    { id: 'calibrate', label: 'Skála', key: 'S' },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', background: C.bgCard, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
      {/* Page nav */}
      {numPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8, background: C.bg, borderRadius: 6, padding: 2 }}>
          <TinyBtn onClick={onPrevPage} disabled={pageNum <= 1} title="Előző oldal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </TinyBtn>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, padding: '0 2px', userSelect: 'none' }}>{pageNum}/{numPages}</span>
          <TinyBtn onClick={onNextPage} disabled={pageNum >= numPages} title="Következő oldal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </TinyBtn>
        </div>
      )}

      {/* Tool buttons */}
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
            {t.label}
            {t.id === 'count' && markerCount > 0 && <span style={{ background: C.accent, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{markerCount}</span>}
            {t.id === 'measure' && measureCount > 0 && <span style={{ background: C.yellow, color: C.bg, borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{measureCount}</span>}
            {t.id === 'calibrate' && scale.calibrated && <span style={{ background: C.blue, color: C.bg, borderRadius: 10, padding: '1px 5px', fontSize: 9, fontWeight: 700, fontFamily: 'DM Mono' }}>✓</span>}
          </button>
        )
      })}

      {/* Assembly/Category picker — shown for count + measure */}
      {activeTool === 'count' && assemblies?.length > 0 && (
        <AssemblyDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} assemblies={assemblies} />
      )}
      {activeTool === 'count' && (!assemblies || !assemblies.length) && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} />
      )}
      {activeTool === 'measure' && (
        <CategoryDropdown activeCategory={activeCategory} onCategoryChange={onCategoryChange} assemblies={assemblies} />
      )}

      {/* ── Auto Symbol POC ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, borderLeft: `1px solid ${C.border}`, paddingLeft: 8 }}>
        <button onClick={onAutoSymbolToggle} title="Auto szimbólum keresés (BETA)" style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'Syne', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 5,
          background: autoSymbolActive ? 'rgba(255,140,66,0.12)' : 'transparent',
          border: `1px solid ${autoSymbolActive ? 'rgba(255,140,66,0.3)' : 'transparent'}`,
          color: autoSymbolActive ? '#FF8C42' : C.text, transition: 'all 0.12s',
        }}>
          ⚡ Auto
          {autoSymbolCount > 0 && <span style={{ background: '#FF8C42', color: '#09090B', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono' }}>{autoSymbolCount}</span>}
        </button>
        {autoSymbolActive && autoSymbolPhase === 'picking' && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#FF8C42' }}>① Jelölj ki mintát ↓</span>
        )}
        {autoSymbolActive && autoSymbolPhase === 'areaSelect' && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#4CC9F0' }}>② Keresési terület (opcionális) ↓</span>
        )}
        {autoSymbolActive && autoSymbolPhase === 'areaSelect' && (
          <button onClick={onAutoSymbolSearchFull}
            style={{ padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontFamily: 'DM Mono', background: '#FF8C42', border: 'none', color: '#09090B', fontWeight: 700 }}>
            Keresés teljes oldalon →
          </button>
        )}
        {autoSymbolSearching && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#FF8C42' }}>Keresés…</span>
        )}
        {autoSymbolError && !autoSymbolSearching && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: autoSymbolCount === 0 ? '#FF8C42' : '#FF6B6B' }}>{autoSymbolError}</span>
        )}
        {autoSymbolPhase === 'done' && (
          <>
            <label style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
              Küszöb
              <button onClick={() => onAutoSymbolThresholdChange(Math.max(0.30, autoSymbolThreshold - 0.05))}
                style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, color: '#FF8C42', cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>−</button>
              <input type="range" min="0.30" max="0.95" step="0.05" value={autoSymbolThreshold}
                onChange={e => onAutoSymbolThresholdChange(parseFloat(e.target.value))}
                style={{ width: 55, accentColor: '#FF8C42' }} />
              <button onClick={() => onAutoSymbolThresholdChange(Math.min(0.95, autoSymbolThreshold + 0.05))}
                style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${C.border}`, background: C.bg, color: '#FF8C42', cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</button>
              <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#FF8C42', width: 28 }}>{(autoSymbolThreshold * 100).toFixed(0)}%</span>
            </label>
            <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.accent }}>
              {autoSymbolAcceptedCount}/{autoSymbolCount}
            </span>
            <button onClick={onAutoSymbolAcceptAll} title="Összes elfogadása" style={{
              padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
              background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: C.accent,
            }}>✓ Mind</button>
            <button onClick={onAutoSymbolRejectAll} title="Összes kizárása" style={{
              padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
              background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#FF6B6B',
            }}>✕ Mind</button>
            {assemblies?.length > 0 ? (
              <AssemblyDropdown activeCategory={autoSymbolCategory} onCategoryChange={onAutoSymbolCategoryChange} assemblies={assemblies} />
            ) : (
              <CategoryDropdown activeCategory={autoSymbolCategory} onCategoryChange={onAutoSymbolCategoryChange} />
            )}
            <input value={autoSymbolLabel} onChange={e => onAutoSymbolLabelChange(e.target.value)}
              placeholder="Címke…" style={{ width: 80, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono', background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            <button onClick={onAutoSymbolFinalize} disabled={autoSymbolAcceptedCount === 0 || autoSymbolSearching} title="Elfogadott találatok hozzáadása a takeoff-hoz" style={{
              padding: '3px 10px', borderRadius: 5, cursor: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? 'pointer' : 'default', fontSize: 10, fontFamily: 'Syne', fontWeight: 700,
              background: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? '#FF8C42' : C.bgCard, border: 'none', color: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? '#09090B' : C.muted,
              opacity: (autoSymbolAcceptedCount > 0 && !autoSymbolSearching) ? 1 : 0.5,
            }}>+ Takeoff ({autoSymbolAcceptedCount})</button>
            <button onClick={onAutoSymbolClear} title="Új minta" style={{
              padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, fontFamily: 'DM Mono',
              background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
            }}>Új minta</button>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Undo/Clear */}
      {(markerCount > 0 || measureCount > 0) && (
        <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
          <TinyBtn onClick={onUndo} title="Visszavonás (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="M3 10l4-4M3 10l4 4"/></svg>
          </TinyBtn>
          <TinyBtn onClick={onClearAll} title="Összes törlése" style={{ color: C.red }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </TinyBtn>
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

      {/* Cable routes toggle */}
      {markerCount > 0 && (
        <button onClick={onToggleCableRoutes} style={{
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          fontFamily: 'Syne', fontWeight: 700,
          background: showCableRoutes ? 'rgba(255,209,102,0.15)' : 'transparent',
          border: `1px solid ${showCableRoutes ? C.yellow : C.border}`,
          color: showCableRoutes ? C.yellow : C.muted,
          transition: 'all 0.12s',
        }}>
          {showCableRoutes ? 'Kábelvonalak ✓' : 'Kábelvonalak'}
        </button>
      )}

      {/* Rotation controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }} title="Terv forgatása">
        <TinyBtn onClick={onRotateLeft} title="Forgatás balra (−90°)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2v6h6"/><path d="M2.5 8a10 10 0 1 1 3.17-4.39"/></svg>
        </TinyBtn>
        {rotation !== 0 && (
          <span style={{ fontSize: 9, fontFamily: 'DM Mono', color: C.muted, padding: '4px 3px', alignSelf: 'center' }}>{rotation}°</span>
        )}
        <TinyBtn onClick={onRotateRight} title="Forgatás jobbra (+90°)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.5 2v6h-6"/><path d="M21.5 8A10 10 0 1 0 18.33 3.61"/></svg>
        </TinyBtn>
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 1, marginLeft: 4, background: C.bg, borderRadius: 6, padding: 2 }}>
        <TinyBtn onClick={onZoomIn} title="Nagyítás"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg></TinyBtn>
        <TinyBtn onClick={onFitView} title="Illesztés"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></TinyBtn>
        <TinyBtn onClick={onZoomOut} title="Kicsinyítés"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg></TinyBtn>
      </div>
    </div>
  )
}
