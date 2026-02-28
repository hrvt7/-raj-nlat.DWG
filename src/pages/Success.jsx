/**
 * Success.jsx
 * Stripe Checkout sikeres fizetés utáni oldal.
 * URL: /success?session_id=xxx
 */
import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

export default function Success() {
  const [status, setStatus] = useState('loading') // loading | ok | error

  useEffect(() => {
    // Supabase sesison frissítés (plan webhook már frissítette DB-t)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus('ok')
      else setStatus('ok') // vendégnek is mutatjuk a thank you oldalt
    })
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Mono, monospace', padding: 24,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        {/* Animated checkmark */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(0,229,160,0.1)', border: '2px solid rgba(0,229,160,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 32px',
          boxShadow: '0 0 60px rgba(0,229,160,0.15)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="#00E5A0" strokeWidth="2.5" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>

        <div style={{ fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em',
          textTransform: 'uppercase', marginBottom: 16 }}>
          Sikeres előfizetés
        </div>

        <h1 style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 900,
          fontSize: 'clamp(28px, 5vw, 40px)', color: '#F0F0F0',
          letterSpacing: '-0.02em', marginBottom: 16, lineHeight: 1.1,
        }}>
          Üdvözlünk a<br/>TakeoffPro-ban!
        </h1>

        <p style={{ fontSize: 14, color: '#888', lineHeight: 1.8, marginBottom: 32 }}>
          14 napos ingyenes próbaidőszakod most kezdődik.<br/>
          Nincs mit beállítani — egyből használhatod az alkalmazást.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 40 }}>
          {['DXF / DWG feldolgozás', 'AI kábelmérés', 'Árajánlat generálás', 'Normaidő kalkulátor'].map(f => (
            <span key={f} style={{
              background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)',
              borderRadius: 999, padding: '5px 14px', fontSize: 11, color: '#00E5A0',
            }}>{f}</span>
          ))}
        </div>

        <a href="/"
          style={{
            display: 'inline-block', padding: '14px 40px', borderRadius: 10,
            background: '#00E5A0', color: '#0A0A0A',
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15,
            textDecoration: 'none', boxShadow: '0 0 30px rgba(0,229,160,0.3)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.target.style.transform='translateY(-1px)'; e.target.style.boxShadow='0 0 50px rgba(0,229,160,0.5)' }}
          onMouseLeave={e => { e.target.style.transform='none'; e.target.style.boxShadow='0 0 30px rgba(0,229,160,0.3)' }}
        >
          Megnyitom az alkalmazást →
        </a>

        <p style={{ fontSize: 11, color: '#333', marginTop: 20 }}>
          Kérdés? · hello@takeoffpro.hu
        </p>
      </div>
    </div>
  )
}
