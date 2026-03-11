import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'

// ─── TakeoffPro Design System ─────────────────────────────────────────────────

export const C = {
  bg:        '#09090B',
  bgCard:    '#111113',
  bgHover:   '#161618',
  border:    '#1E1E22',
  borderHi:  '#2A2A30',
  accent:    '#00E5A0',
  accentDim: 'rgba(0,229,160,0.12)',
  accentBorder: 'rgba(0,229,160,0.25)',
  yellow:    '#FFD166',
  yellowDim: 'rgba(255,209,102,0.12)',
  red:       '#FF6B6B',
  redDim:    'rgba(255,107,107,0.10)',
  blue:      '#4CC9F0',
  text:      '#E8E8EC',
  textSub:   '#9CA3AF',
  textMuted: '#6B7280',
  muted:     '#6B7280',
  sidebar:   '#0D0D0F',
  sidebarW:  220,
}

export const fmt = (n) => new Intl.NumberFormat('hu-HU').format(Math.round(n))
export const fmtM = (n) => n < 1 ? n.toFixed(3) : n.toFixed(1)

// ─── Base UI components ───────────────────────────────────────────────────────

export function Badge({ children, color = 'gray' }) {
  const colors = {
    green:  { bg: 'rgba(0,229,160,0.1)',    color: '#00E5A0',  border: 'rgba(0,229,160,0.2)' },
    yellow: { bg: 'rgba(255,209,102,0.1)',  color: '#FFD166',  border: 'rgba(255,209,102,0.2)' },
    red:    { bg: 'rgba(255,107,107,0.1)',  color: '#FF6B6B',  border: 'rgba(255,107,107,0.2)' },
    blue:   { bg: 'rgba(76,201,240,0.1)',   color: '#4CC9F0',  border: 'rgba(76,201,240,0.2)' },
    gray:   { bg: 'rgba(113,113,122,0.1)',  color: '#71717A',  border: 'rgba(113,113,122,0.2)' },
  }
  const c = colors[color] || colors.gray
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 6,
      fontSize: 11, fontFamily: 'DM Mono', fontWeight: 500,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap'
    }}>{children}</span>
  )
}

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, style, icon }) {
  const sizes = { sm: { padding: '6px 14px', fontSize: 12 }, md: { padding: '10px 20px', fontSize: 13 }, lg: { padding: '13px 26px', fontSize: 15 } }
  const variants = {
    primary: { background: C.accent, color: '#09090B', border: 'none' },
    secondary: { background: C.bgCard, color: C.text, border: `1px solid ${C.border}` },
    ghost: { background: 'transparent', color: C.textSub, border: `1px solid ${C.border}` },
    danger: { background: C.redDim, color: C.red, border: `1px solid rgba(255,107,107,0.25)` },
  }
  const s = sizes[size] || sizes.md; const v = variants[variant] || variants.primary
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      ...s, ...v,
      borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'Syne', fontWeight: 700, whiteSpace: 'nowrap',
      opacity: disabled ? 0.4 : 1, transition: 'all 0.15s',
      ...style
    }}>{icon && icon}{children}</button>
  )
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 12, ...style
    }}>{children}</div>
  )
}

export function StatCard({ label, value, sub, color = C.accent, icon }) {
  return (
    <Card style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
          <div style={{ fontSize: 28, fontFamily: 'Syne', fontWeight: 800, color }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: C.textSub, fontFamily: 'DM Mono', marginTop: 6 }}>{sub}</div>}
        </div>
        {icon && <div style={{ fontSize: 20, opacity: 0.5 }}>{icon}</div>}
      </div>
    </Card>
  )
}

export function Input({ value, onChange, placeholder, type = 'text', style, suffix }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '9px 14px',
          paddingRight: suffix ? 36 : 14,
          color: C.text, fontFamily: 'DM Mono', fontSize: 13,
          outline: 'none', ...style
        }}
      />
      {suffix && <span style={{ position: 'absolute', right: 12, color: C.textMuted, fontSize: 12, fontFamily: 'DM Mono', pointerEvents: 'none' }}>{suffix}</span>}
    </div>
  )
}

export function Select({ value, onChange, options, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: '9px 14px',
        color: C.text, fontFamily: 'DM Mono', fontSize: 13,
        outline: 'none', cursor: 'pointer', ...style
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function SectionHeader({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text }}>{title}</h3>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, desc, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: C.text, marginBottom: 8 }}>{title}</div>
      {desc && <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>{desc}</div>}
      {action}
    </div>
  )
}

export function Table({ columns, rows, onRowClick }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.bgCard }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '11px 16px', textAlign: col.align || 'left',
                fontSize: 11, color: C.textSub, fontFamily: 'DM Mono',
                fontWeight: 500, borderBottom: `1px solid ${C.border}`,
                textTransform: 'uppercase', letterSpacing: '0.05em',
                whiteSpace: 'nowrap'
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: `1px solid ${C.border}`,
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => onRowClick && (e.currentTarget.style.background = C.bgHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: '12px 16px', textAlign: col.align || 'left',
                  fontSize: 13, fontFamily: 'DM Mono', color: C.text,
                  verticalAlign: 'middle'
                }}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Inline Confirm Dialog ────────────────────────────────────────────────────
// Replaces native confirm() for destructive actions.
// Usage: <ConfirmDialog message="Törlöd?" onConfirm={...} onCancel={...} />

export function ConfirmDialog({ message, detail, onConfirm, onCancel, confirmLabel = 'Törlés', cancelLabel = 'Mégsem' }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#16161A', border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '24px 28px', maxWidth: 380, width: '90%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 8 }}>
          {message}
        </div>
        {detail && (
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, marginBottom: 16, lineHeight: 1.5 }}>
            {detail}
          </div>
        )}
        {!detail && <div style={{ marginBottom: 16 }} />}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 12, fontFamily: 'Syne', fontWeight: 600,
            background: 'transparent', border: `1px solid ${C.border}`, color: C.textSub, cursor: 'pointer',
          }}>{cancelLabel}</button>
          <button data-testid="confirm-dialog-confirm" onClick={onConfirm} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 12, fontFamily: 'Syne', fontWeight: 600,
            background: C.redDim, border: '1px solid rgba(255,107,107,0.3)', color: C.red, cursor: 'pointer',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Toast System ─────────────────────────────────────────────────────────────
// Lightweight toast notifications for save/status feedback.
// Usage: const toast = useToast(); toast.show('Mentve!', 'success')

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const show = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  return React.createElement(ToastContext.Provider, { value: { show } },
    children,
    React.createElement(ToastContainer, { toasts })
  )
}

function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null
  const typeStyles = {
    success: { bg: 'rgba(0,229,160,0.12)', border: 'rgba(0,229,160,0.25)', color: C.accent, icon: '✓' },
    error:   { bg: C.redDim, border: 'rgba(255,107,107,0.25)', color: C.red, icon: '✕' },
    info:    { bg: 'rgba(76,201,240,0.12)', border: 'rgba(76,201,240,0.25)', color: C.blue, icon: 'ℹ' },
    warning: { bg: C.yellowDim, border: 'rgba(255,209,102,0.25)', color: C.yellow, icon: '⚠' },
  }
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const s = typeStyles[t.type] || typeStyles.info
        return (
          <div key={t.id} style={{
            background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8,
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'DM Mono', fontSize: 12, color: s.color,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            animation: 'toast-slide-in 0.25s ease-out',
            pointerEvents: 'auto',
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
            <span>{t.message}</span>
          </div>
        )
      })}
      <style>{`@keyframes toast-slide-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) return { show: () => {} }  // noop fallback
  return ctx
}

// ─── Workflow Stepper ─────────────────────────────────────────────────────────
// Non-intrusive progress indicator for the main project flow.

export function WorkflowStepper({ currentStep = 0 }) {
  const steps = [
    { label: 'Tervek feltöltése', icon: '1' },
    { label: 'Metadata ellenőrzés', icon: '2' },
    { label: 'Kalkuláció', icon: '3' },
    { label: 'Ajánlat', icon: '4' },
  ]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20,
      padding: '8px 0', width: '100%',
    }}>
      {steps.map((step, i) => {
        const isDone = i < currentStep
        const isCurrent = i === currentStep
        const dotColor = isDone ? C.accent : isCurrent ? C.accent : C.border
        const labelColor = isDone ? C.textSub : isCurrent ? C.text : C.textMuted
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{
                flex: 1, height: 1,
                background: isDone ? 'rgba(0,229,160,0.35)' : C.border,
                margin: '0 4px',
              }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontFamily: 'DM Mono', fontWeight: 700,
                background: isDone ? 'rgba(0,229,160,0.15)' : isCurrent ? 'rgba(0,229,160,0.08)' : 'transparent',
                border: `1.5px solid ${dotColor}`,
                color: isDone ? C.accent : isCurrent ? C.accent : C.textMuted,
                transition: 'all 0.2s',
              }}>
                {isDone ? '✓' : step.icon}
              </div>
              <span style={{
                fontFamily: 'DM Mono', fontSize: 10, color: labelColor,
                fontWeight: isCurrent ? 600 : 400,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}>{step.label}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Status badge helper ──────────────────────────────────────────────────────
export function QuoteStatusBadge({ status }) {
  const map = {
    draft:   { label: 'Piszkozat',  color: 'gray'   },
    sent:    { label: 'Elküldve',   color: 'blue'   },
    won:     { label: 'Nyertes',    color: 'green'  },
    lost:    { label: 'Elveszett',  color: 'red'    },
    expired: { label: 'Lejárt',     color: 'yellow' },
  }
  const s = map[status] || map.draft
  return <Badge color={s.color}>{s.label}</Badge>
}
