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
  textSub:   '#71717A',
  textMuted: '#3F3F46',
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
  const s = sizes[size]; const v = variants[variant]
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
          {sub && <div style={{ fontSize: 11, color: C.textMuted, fontFamily: 'DM Mono', marginTop: 6 }}>{sub}</div>}
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
