import React, { useState } from 'react'
import { C } from './ui.jsx'

const NAV_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard',       icon: '▦', group: 'main' },
  { key: 'quotes',     label: 'Ajánlatok',        icon: '📋', group: 'main' },
  { key: 'new-quote',  label: 'Új ajánlat',       icon: '＋', group: 'main', highlight: true },
  { key: 'work-items', label: 'Munkatételek',     icon: '⚡', group: 'db' },
  { key: 'assemblies', label: 'Assemblyk',         icon: '🔧', group: 'db' },
  { key: 'settings',   label: 'Beállítások',      icon: '⚙', group: 'settings' },
]

export default function Sidebar({ active, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

  const groups = [
    { key: 'main', items: NAV_ITEMS.filter(n => n.group === 'main') },
    { key: 'db',   label: 'ADATBÁZIS', items: NAV_ITEMS.filter(n => n.group === 'db') },
    { key: 'settings', items: NAV_ITEMS.filter(n => n.group === 'settings') },
  ]

  const w = collapsed ? 60 : C.sidebarW

  return (
    <div style={{
      width: w, minHeight: '100vh', background: C.sidebar,
      borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
      transition: 'width 0.2s ease',
      overflowX: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '18px 14px' : '18px 20px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer', userSelect: 'none'
      }} onClick={() => onNavigate('dashboard')}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 14px rgba(0,229,160,0.3)'
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        {!collapsed && (
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: C.text, whiteSpace: 'nowrap' }}>
            Takeoff<span style={{ color: C.accent }}>Pro</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {groups.map(group => (
          <div key={group.key}>
            {group.label && !collapsed && (
              <div style={{
                padding: '12px 12px 6px', fontSize: 10, fontFamily: 'DM Mono',
                color: C.textMuted, letterSpacing: '0.1em', fontWeight: 500
              }}>{group.label}</div>
            )}
            {group.items.map(item => {
              const isActive = active === item.key
              return (
                <button key={item.key} onClick={() => onNavigate(item.key)} style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: 10, padding: collapsed ? '10px 14px' : '9px 12px',
                  background: isActive ? C.accentDim : item.highlight ? 'rgba(0,229,160,0.06)' : 'transparent',
                  border: isActive ? `1px solid ${C.accentBorder}` : item.highlight ? `1px solid rgba(0,229,160,0.15)` : '1px solid transparent',
                  borderRadius: 8, cursor: 'pointer',
                  color: isActive ? C.accent : item.highlight ? C.accent : C.textSub,
                  fontFamily: 'Syne', fontWeight: isActive || item.highlight ? 700 : 500,
                  fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden',
                  transition: 'all 0.15s',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
                onMouseEnter={e => !isActive && (e.currentTarget.style.background = C.bgHover)}
                onMouseLeave={e => !isActive && (e.currentTarget.style.background = item.highlight ? 'rgba(0,229,160,0.06)' : 'transparent')}
                title={collapsed ? item.label : ''}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: '12px 8px', borderTop: `1px solid ${C.border}` }}>
        <button onClick={() => setCollapsed(!collapsed)} style={{
          width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10, background: 'transparent', border: '1px solid transparent',
          borderRadius: 8, cursor: 'pointer', color: C.textMuted,
          fontFamily: 'DM Mono', fontSize: 11,
        }}>
          <span style={{ fontSize: 14 }}>{collapsed ? '→' : '←'}</span>
          {!collapsed && 'Összehúz'}
        </button>
      </div>
    </div>
  )
}
