/**
 * QuotePortal — Public client-facing quote view
 *
 * Served at /q/:token — no authentication required.
 * Fetches the quote snapshot from Supabase quote_shares by token
 * and allows the client to accept the quote.
 */
import React, { useState, useEffect } from 'react'
import { loadQuoteByToken, acceptQuoteShare } from '../supabase.js'

// ── Design tokens (light-mode for client-facing, professional) ────────────────
const C = {
  bg:       '#F9FAFB',
  bgCard:   '#FFFFFF',
  border:   '#E5E7EB',
  accent:   '#059669',   // emerald-600 — professional green
  accentDim:'rgba(5,150,105,0.08)',
  text:     '#111827',
  textSub:  '#6B7280',
  textMuted:'#9CA3AF',
  red:      '#DC2626',
  yellow:   '#D97706',
}

function fmt(n) {
  return Number(n || 0).toLocaleString('hu-HU') + ' Ft'
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontFamily: 'Inter, sans-serif', color: C.textSub, fontSize: 14 }}>Ajánlat betöltése…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}

// ── Error / expired state ─────────────────────────────────────────────────────
function ErrorState({ type }) {
  const msgs = {
    notfound: { icon: '🔍', title: 'Ajánlat nem található', body: 'Ez a link érvénytelen vagy lejárt. Kérjük, vedd fel a kapcsolatot a vállalkozóval.' },
    expired:  { icon: '⏱', title: 'Az ajánlat lejárt', body: 'Ez az ajánlat már nem érvényes. Kérjük, kérj frissített ajánlatot.' },
  }
  const m = msgs[type] || msgs.notfound
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 24 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 48, maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{m.icon}</div>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 20, color: C.text, marginBottom: 12 }}>{m.title}</h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.textSub, lineHeight: 1.6 }}>{m.body}</p>
      </div>
    </div>
  )
}

// ── Success state after acceptance ───────────────────────────────────────────
function SuccessState({ company, clientName }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 24 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 48, maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 64, height: 64, background: C.accentDim, border: `2px solid ${C.accent}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>
          ✓
        </div>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 22, color: C.text, marginBottom: 10 }}>
          Ajánlat elfogadva!
        </h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: C.textSub, lineHeight: 1.6, marginBottom: 24 }}>
          Köszönjük, <strong style={{ color: C.text }}>{clientName}</strong>! Az elfogadást rögzítettük és értesítettük a vállalkozót.
        </p>
        {company?.name && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', textAlign: 'left' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{company.name}</p>
            {company.email && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.textSub, margin: 0 }}>📧 {company.email}</p>}
            {company.phone && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.textSub, margin: '2px 0 0' }}>📞 {company.phone}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 700, color: accent || C.text }}>{value}</div>
    </div>
  )
}

// ── Main QuotePortal component ────────────────────────────────────────────────
export default function QuotePortal({ token }) {
  const [state, setState] = useState('loading') // loading | ready | accepted | error | expired
  const [shareData, setShareData] = useState(null)
  const [clientName, setClientName] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [showAcceptForm, setShowAcceptForm] = useState(false)
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    loadQuoteByToken(token).then(data => {
      if (!data) return setState('error')

      // Check expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return setState('expired')
      }

      setShareData(data)

      // Already accepted
      if (data.status === 'accepted') {
        setClientName(data.accepted_by_name || '')
        setState('accepted')
      } else {
        setState('ready')
      }
    }).catch(() => setState('error'))
  }, [token])

  const handleAccept = async () => {
    const name = clientName.trim()
    if (!name) { setNameError('Kérjük, add meg a nevedet.'); return }
    setNameError('')
    setAccepting(true)
    try {
      await acceptQuoteShare(token, name)
      setState('accepted')
    } catch (err) {
      setNameError('Hiba történt: ' + err.message)
    } finally {
      setAccepting(false)
    }
  }

  if (state === 'loading') return <LoadingState />
  if (state === 'error')   return <ErrorState type="notfound" />
  if (state === 'expired') return <ErrorState type="expired" />
  if (state === 'accepted') return <SuccessState company={shareData?.company_data} clientName={shareData?.accepted_by_name || clientName} />

  const { quote_data: q, company_data: company } = shareData

  const vatPct    = q.vatPercent != null ? Number(q.vatPercent) : 27
  const netto     = q.gross || 0
  const vat       = Math.round(netto * vatPct / 100)
  const brutto    = netto + vat

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter, sans-serif' }}>
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          {company?.name
            ? <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{company.name}</span>
            : <span style={{ fontWeight: 700, fontSize: 16, color: C.text }}>Ajánlat</span>
          }
          <span style={{ marginLeft: 12, fontSize: 12, color: C.textSub, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 8px' }}>
            #{q.id}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          {new Date(q.createdAt || q.created_at).toLocaleDateString('hu-HU')}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
          {q.projectName || q.project_name || 'Árajánlat'}
        </h1>
        {q.clientName && (
          <p style={{ fontSize: 14, color: C.textSub, margin: '0 0 24px' }}>Megrendelő: <strong style={{ color: C.text }}>{q.clientName}</strong></p>
        )}

        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Nettó összeg" value={fmt(netto)} />
          <KpiCard label="ÁFA" value={`${vatPct}%`} />
          <KpiCard label="Bruttó összeg" value={fmt(brutto)} accent={C.accent} />
          {q.totalHours > 0 && <KpiCard label="Munkaidő" value={`${q.totalHours} ó`} />}
        </div>

        {/* ── Financial breakdown ─────────────────────────────────────────── */}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 13, color: C.text }}>
            Pénzügyi összesítő
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {q.totalMaterials > 0 && (
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSub }}>Anyagköltség</td>
                  <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right' }}>{fmt(q.totalMaterials)}</td>
                </tr>
              )}
              {q.totalLabor > 0 && (
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSub }}>Munkadíj</td>
                  <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right' }}>{fmt(q.totalLabor)}</td>
                </tr>
              )}
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSub }}>Nettó végösszeg</td>
                <td style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right' }}>{fmt(netto)}</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSub }}>ÁFA ({vatPct}%)</td>
                <td style={{ padding: '12px 20px', fontSize: 13, color: C.textSub, textAlign: 'right' }}>{fmt(vat)}</td>
              </tr>
              <tr style={{ background: C.accentDim }}>
                <td style={{ padding: '14px 20px', fontSize: 15, fontWeight: 800, color: C.text }}>Bruttó végösszeg</td>
                <td style={{ padding: '14px 20px', fontSize: 15, fontWeight: 800, color: C.accent, textAlign: 'right' }}>{fmt(brutto)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Inclusions / Exclusions ─────────────────────────────────────── */}
        {(q.inclusions || q.exclusions) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
            {q.inclusions && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.accent }}>✓</span> Tartalmazza
                </div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{q.inclusions}</p>
              </div>
            )}
            {q.exclusions && (
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: C.red }}>✗</span> Nem tartalmazza
                </div>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{q.exclusions}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Terms ──────────────────────────────────────────────────────── */}
        {(q.validityText || q.paymentTermsText) && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
            {q.validityText && (
              <div style={{ marginBottom: q.paymentTermsText ? 12 : 0 }}>
                <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Érvényesség</span>
                <p style={{ fontSize: 13, color: C.textSub, margin: '4px 0 0', lineHeight: 1.6 }}>{q.validityText}</p>
              </div>
            )}
            {q.paymentTermsText && (
              <div>
                <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fizetési feltételek</span>
                <p style={{ fontSize: 13, color: C.textSub, margin: '4px 0 0', lineHeight: 1.6 }}>{q.paymentTermsText}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Accept panel ───────────────────────────────────────────────── */}
        <div style={{
          background: showAcceptForm ? C.bgCard : `linear-gradient(135deg, ${C.accentDim} 0%, ${C.bgCard} 100%)`,
          border: `2px solid ${showAcceptForm ? C.accent : C.border}`,
          borderRadius: 16, padding: 24, transition: 'all 0.2s',
        }}>
          {!showAcceptForm ? (
            <>
              <h2 style={{ fontWeight: 800, fontSize: 17, color: C.text, margin: '0 0 8px' }}>Elfogadod az ajánlatot?</h2>
              <p style={{ fontSize: 13, color: C.textSub, margin: '0 0 20px', lineHeight: 1.6 }}>
                Az elfogadás rögzítésre kerül és a vállalkozó értesítést kap. Digitális jóváhagyás, dokumentum aláírás nélkül.
              </p>
              <button
                onClick={() => setShowAcceptForm(true)}
                style={{
                  background: C.accent, color: '#fff', border: 'none', borderRadius: 10,
                  padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                  width: '100%', transition: 'opacity 0.15s',
                }}
              >
                Ajánlat elfogadása →
              </button>
            </>
          ) : (
            <>
              <h2 style={{ fontWeight: 800, fontSize: 17, color: C.text, margin: '0 0 6px' }}>Add meg a neved</h2>
              <p style={{ fontSize: 13, color: C.textSub, margin: '0 0 16px' }}>Ez kerül rögzítésre az elfogadásnál.</p>
              <input
                type="text"
                value={clientName}
                onChange={e => { setClientName(e.target.value); setNameError('') }}
                placeholder="Teljes neved…"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '11px 14px', fontSize: 14, borderRadius: 8,
                  border: `1px solid ${nameError ? C.red : C.border}`, outline: 'none',
                  fontFamily: 'Inter, sans-serif', color: C.text, background: C.bg,
                  marginBottom: nameError ? 6 : 14,
                }}
                onKeyDown={e => e.key === 'Enter' && handleAccept()}
              />
              {nameError && <p style={{ color: C.red, fontSize: 12, margin: '0 0 12px' }}>{nameError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setShowAcceptForm(false); setNameError('') }}
                  style={{
                    flex: 1, background: 'transparent', border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: '11px', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer', color: C.textSub,
                  }}
                >
                  Mégsem
                </button>
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  style={{
                    flex: 2, background: accepting ? C.textMuted : C.accent, color: '#fff',
                    border: 'none', borderRadius: 10, padding: '11px',
                    fontWeight: 700, fontSize: 14, cursor: accepting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {accepting ? 'Rögzítés…' : '✓ Elfogadom'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {company && (company.email || company.phone) && (
          <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: C.textMuted }}>
            Kérdés? Vedd fel a kapcsolatot:
            {company.email && <a href={`mailto:${company.email}`} style={{ color: C.accent, marginLeft: 6, textDecoration: 'none' }}>{company.email}</a>}
            {company.phone && <span style={{ marginLeft: 8 }}>· {company.phone}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
