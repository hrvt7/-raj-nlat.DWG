import React, { useState, useEffect } from 'react'
import { C } from './ui.jsx'

const NAV_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard',     group: 'main' },
  { key: 'quotes',     label: 'Ajánlatok',      group: 'main' },
  { key: 'new-quote',  label: 'Új ajánlat',     group: 'main', highlight: true },
  { key: 'plans',      label: 'Tervek',         group: 'main' },
  { key: 'work-items', label: 'Munkatételek',   group: 'db' },
  { key: 'assemblies', label: 'Assemblyk',      group: 'db' },
  { key: 'settings',   label: 'Beállítások',    group: 'settings' },
]

const NAV_PATHS = {
  dashboard:    'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zm-11 0h7v7H3v-7z',
  quotes:       ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z','M14 2v6h6M9 13h6M9 17h4'],
  'new-quote':  'M12 5v14M5 12h14',
  plans:        ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z','M14 2v6h6','M8 13h8M8 17h4M8 9h2'],
  'work-items': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  assemblies:   ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z','M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12'],
  settings:     'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
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

export default function Sidebar({ active, onNavigate, mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const groups = [
    { key: 'main', items: NAV_ITEMS.filter(n => n.group === 'main') },
    { key: 'db',   label: 'ADATBÁZIS', items: NAV_ITEMS.filter(n => n.group === 'db') },
    { key: 'settings', items: NAV_ITEMS.filter(n => n.group === 'settings') },
  ]

  // On mobile: always full-width drawer, ignore collapsed state
  const w = isMobile ? 240 : (collapsed ? 60 : C.sidebarW)

  const handleNav = (key) => {
    onNavigate(key)
    if (isMobile && onMobileClose) onMobileClose()
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
        // On mobile: slide in/out; on desktop: always visible
        transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed && !isMobile ? '20px 0' : '20px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${C.border}`, minHeight: 64,
          justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
        }}>
          <div style={{ width: 28, height: 28, background: C.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 12px rgba(0,229,160,0.35)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          {(!collapsed || isMobile) && (
            <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: C.text, whiteSpace: 'nowrap' }}>
              Takeoff<span style={{ color: C.accent }}>Pro</span>
            </span>
          )}
          {/* Close button on mobile */}
          {isMobile && (
            <button onClick={onMobileClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: collapsed && !isMobile ? '12px 0' : '12px 10px', overflowY: 'auto' }}>
          {groups.map(group => (
            <div key={group.key} style={{ marginBottom: 4 }}>
              {group.label && (!collapsed || isMobile) && (
                <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', padding: '12px 10px 6px', textTransform: 'uppercase' }}>{group.label}</div>
              )}
              {group.items.map(item => {
                const isActive = active === item.key
                const color = isActive ? C.accent : (item.highlight ? C.accent : C.textSub)
                return (
                  <button key={item.key} onClick={() => handleNav(item.key)} style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    gap: collapsed && !isMobile ? 0 : 10,
                    justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                    padding: collapsed && !isMobile ? '10px 0' : '10px 10px',
                    background: isActive ? 'rgba(0,229,160,0.08)' : item.highlight && !isActive ? 'rgba(0,229,160,0.05)' : 'transparent',
                    border: isActive ? `1px solid rgba(0,229,160,0.2)` : '1px solid transparent',
                    borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                    marginBottom: 2,
                  }}>
                    <NavIcon navKey={item.key} color={color} size={16} />
                    {(!collapsed || isMobile) && (
                      <span style={{ fontFamily: 'Syne', fontWeight: isActive ? 700 : 500, fontSize: 13, color, whiteSpace: 'nowrap' }}>
                        {item.highlight && !isActive ? `+ ${item.label}` : item.label}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
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
