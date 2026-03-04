import React, { useState, useEffect } from 'react'
import { C } from './ui.jsx'
import { TRADES, isTradeUnlocked } from '../data/trades.js'

// ── Nav items: main + settings (trade DB items are generated dynamically) ────
const MAIN_NAV = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'quotes',     label: 'Ajánlatok' },
  { key: 'new-quote',  label: 'Új ajánlat', highlight: true },
  { key: 'plans',      label: 'Tervek' },
]

const SETTINGS_NAV = [
  { key: 'settings', label: 'Beállítások' },
]

// ── SVG path data ────────────────────────────────────────────────────────────
const NAV_PATHS = {
  dashboard:    'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zm-11 0h7v7H3v-7z',
  quotes:       ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z','M14 2v6h6M9 13h6M9 17h4'],
  'new-quote':  'M12 5v14M5 12h14',
  plans:        ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z','M14 2v6h6','M8 13h8M8 17h4M8 9h2'],
  'work-items': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  materials:    ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z','M7 7h.01'],
  assemblies:   ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z','M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12'],
  settings:     'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
}

// ── Lock icon SVG ────────────────────────────────────────────────────────────
function LockIcon({ size = 12, color = '#666' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

function NavIcon({ navKey, color, size = 15 }) {
  const p = NAV_PATHS[navKey]
  if (!p) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {(Array.isArray(p) ? p : [p]).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// ── Trade section sub-nav items ──────────────────────────────────────────────
function getTradeSubItems(tradeId) {
  return [
    { key: `assemblies-${tradeId}`, label: 'Assemblyk', navKey: 'assemblies' },
    { key: `work-items-${tradeId}`, label: 'Munkatételek', navKey: 'work-items' },
    { key: `materials-${tradeId}`,  label: 'Anyagok', navKey: 'materials' },
  ]
}

export default function Sidebar({ active, onNavigate, activeTrade, mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [expandedTrades, setExpandedTrades] = useState(() => {
    // Default: all unlocked trades expanded
    const exp = {}
    TRADES.forEach(t => { exp[t.id] = isTradeUnlocked(t.id) })
    return exp
  })

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const isExpanded = !collapsed || isMobile
  const w = isMobile ? 240 : (collapsed ? 60 : C.sidebarW)

  const handleNav = (key, tradeId) => {
    onNavigate(key, tradeId)
    if (isMobile && onMobileClose) onMobileClose()
  }

  const toggleTradeExpand = (tradeId) => {
    setExpandedTrades(prev => ({ ...prev, [tradeId]: !prev[tradeId] }))
  }

  // ── Render a nav button ──────────────────────────────────────────────────
  const renderNavBtn = (item, isActive, { locked = false, indent = false } = {}) => {
    const color = locked ? C.textMuted : isActive ? C.accent : (item.highlight ? C.accent : C.textSub)
    return (
      <button
        key={item.key}
        onClick={() => !locked && handleNav(item.key, item.tradeId)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: isExpanded ? 10 : 0,
          justifyContent: isExpanded ? 'flex-start' : 'center',
          padding: isExpanded ? (indent ? '8px 10px 8px 28px' : '10px 10px') : '10px 0',
          background: isActive ? 'rgba(0,229,160,0.08)' : item.highlight && !isActive ? 'rgba(0,229,160,0.05)' : 'transparent',
          border: isActive ? '1px solid rgba(0,229,160,0.2)' : '1px solid transparent',
          borderRadius: 8, cursor: locked ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s', marginBottom: 2,
          opacity: locked ? 0.5 : 1,
        }}
      >
        <NavIcon navKey={item.navKey || item.key} color={color} size={indent ? 14 : 16} />
        {isExpanded && (
          <span style={{
            fontFamily: 'Syne', fontWeight: isActive ? 700 : 500,
            fontSize: indent ? 12 : 13, color, whiteSpace: 'nowrap', flex: 1, textAlign: 'left',
          }}>
            {item.highlight && !isActive ? `+ ${item.label}` : item.label}
          </span>
        )}
        {isExpanded && locked && <LockIcon size={12} color={C.textMuted} />}
      </button>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          onClick={onMobileClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 99, backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <div style={{
        width: w,
        minHeight: '100vh',
        background: C.sidebar,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        zIndex: 100,
        transition: 'width 0.2s ease, transform 0.25s ease',
        overflow: 'hidden',
        transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
      }}>
        {/* Logo */}
        <div style={{
          padding: isExpanded ? '20px 20px' : '20px 0',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${C.border}`, minHeight: 64,
          justifyContent: isExpanded ? 'flex-start' : 'center',
        }}>
          <div style={{ width: 28, height: 28, background: C.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 12px rgba(0,229,160,0.35)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          {isExpanded && (
            <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: C.text, whiteSpace: 'nowrap' }}>
              Takeoff<span style={{ color: C.accent }}>Pro</span>
            </span>
          )}
          {isMobile && (
            <button onClick={onMobileClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: isExpanded ? '12px 10px' : '12px 0', overflowY: 'auto' }}>
          {/* ── Main nav ──────────────────────────────────────────────── */}
          <div style={{ marginBottom: 8 }}>
            {MAIN_NAV.map(item => renderNavBtn(item, active === item.key))}
          </div>

          {/* ── Trade sections ────────────────────────────────────────── */}
          {TRADES.map(trade => {
            const unlocked = isTradeUnlocked(trade.id)
            const expanded = expandedTrades[trade.id] && unlocked
            const isActiveTrade = activeTrade === trade.id

            return (
              <div key={trade.id} style={{ marginBottom: 4 }}>
                {/* Trade header */}
                <button
                  onClick={() => unlocked ? toggleTradeExpand(trade.id) : null}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    gap: isExpanded ? 8 : 0,
                    justifyContent: isExpanded ? 'flex-start' : 'center',
                    padding: isExpanded ? '10px 10px' : '10px 0',
                    background: isActiveTrade ? `${trade.colorDim}` : 'transparent',
                    border: isActiveTrade ? `1px solid ${trade.colorBorder}` : '1px solid transparent',
                    borderRadius: 8,
                    cursor: unlocked ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                    marginBottom: 2,
                    opacity: unlocked ? 1 : 0.55,
                  }}
                >
                  {/* Trade icon */}
                  <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{trade.icon}</span>
                  {isExpanded && (
                    <>
                      <span style={{
                        fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                        color: unlocked ? trade.color : C.textMuted,
                        whiteSpace: 'nowrap', flex: 1, textAlign: 'left',
                        letterSpacing: '0.02em',
                      }}>
                        {trade.label}
                      </span>
                      {!unlocked && <LockIcon size={13} color={C.textMuted} />}
                      {unlocked && (
                        <span style={{ fontSize: 10, color: C.textMuted, transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
                      )}
                    </>
                  )}
                </button>

                {/* Trade sub-items (when expanded) */}
                {expanded && isExpanded && (
                  <div style={{ transition: 'all 0.15s' }}>
                    {getTradeSubItems(trade.id).map(sub => {
                      const subItem = { ...sub, tradeId: trade.id }
                      const isSubActive = active === sub.key || (activeTrade === trade.id && active === sub.navKey)
                      return renderNavBtn(subItem, isSubActive, { indent: true })
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* ── Divider ───────────────────────────────────────────────── */}
          <div style={{ height: 1, background: C.border, margin: '8px 10px' }} />

          {/* ── Settings ──────────────────────────────────────────────── */}
          {SETTINGS_NAV.map(item => renderNavBtn(item, active === item.key))}
        </div>

        {/* Collapse toggle – desktop only */}
        {!isMobile && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: collapsed ? '12px 0' : '12px 10px', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
            <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: C.textMuted, fontSize: 11, fontFamily: 'DM Mono', display: 'flex', alignItems: 'center', gap: 4 }}>
              {collapsed ? '→' : '← Összehúz'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
