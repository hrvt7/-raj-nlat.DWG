import React, { useEffect, useRef, useState } from 'react'

// ─── Scroll animation hook ────────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, visible]
}

function FadeIn({ children, delay = 0, style = {} }) {
  const [ref, visible] = useInView()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      ...style
    }}>
      {children}
    </div>
  )
}

// ─── Static data ──────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: '📐',
    title: 'DXF & DWG Import',
    desc: 'Töltsd be a terveidet közvetlenül – DXF natívan, DWG automatikus konverzióval. Több fájl egyszerre, emeletenként.'
  },
  {
    icon: '⚡',
    title: 'Automatikus Mennyiségkimutatás',
    desc: 'Blokkok, vonalak, rétegek automatikus felismerése. Szerelvények darabszáma és kábelnyomvonalak hossza másodpercek alatt.'
  },
  {
    icon: '🤖',
    title: 'AI Asszisztens',
    desc: 'Töltsd fel a műszaki leírást – az AI kiszedi az IP védettséget, kábelkeresztmetszetet, szabványokat és anyagkövetelményeket.'
  },
  {
    icon: '💰',
    title: 'Profi Árajánlat',
    desc: 'Órabéres vagy tételes kalkuláció. Egységárak, normaidők, árrés. PDF ajánlat egy kattintással, logóval és dátummal.'
  },
  {
    icon: '🏗️',
    title: 'Több Szint, Egy Projekt',
    desc: 'Húzd be egyszerre az összes emeleti tervet. Szintenként külön megtekintés, összesített kalkuláció – nincs manuális összeadás.'
  },
  {
    icon: '📦',
    title: 'Anyagajánlás',
    desc: 'Nem tudod milyen lámpatesztet válassz? Az AI javasol konkrét, magyar piacon kapható termékeket árakkal és típusszámokkal.'
  },
]

const STEPS = [
  { n: '01', title: 'Fájl feltöltés', desc: 'Húzd be a DXF vagy DWG terveket. Több fájl egyszerre is feltölthető – pl. emeletenként külön terv.' },
  { n: '02', title: 'Mennyiség review', desc: 'Az app automatikusan felismeri a szerelvényeket és nyomvonalakat. Rendeld hozzá a tételneveket.' },
  { n: '03', title: 'AI elemzés', desc: 'Opcionálisan töltsd fel a műszaki leírást. Az AI azonosítja a követelményeket és anyagajánlásokat ad.' },
  { n: '04', title: 'Árazás', desc: 'Állítsd be az egységárakat és normákat. Válaszd az órabéres vagy tételes kalkulációs módszert.' },
  { n: '05', title: 'PDF ajánlat', desc: 'Egy kattintással generálj profi PDF árajánlatot, amit azonnal elküldhetsz az ügyfélnek.' },
]

const STATS = [
  { value: '80%', label: 'Kevesebb kalkulációs idő' },
  { value: '< 2 perc', label: 'DXF-től ajánlatig' },
  { value: '0 Ft', label: 'Extra szoftver díj' },
  { value: '100%', label: 'Magyar piacra szabva' },
]

const FAQ = [
  {
    q: 'Milyen fájlformátumokat fogad el?',
    a: 'DXF és DWG fájlokat egyaránt. A DWG-t automatikusan konvertáljuk – nem kell semmit letölteni vagy külön programot futtatni.'
  },
  {
    q: 'Mekkora tervekkel működik?',
    a: 'Kisebb lakóépülettől nagyobb ipari létesítményig. Több emeletes projekteknél emeletenként külön fájlokat tölthet fel, az app összesíti az adatokat.'
  },
  {
    q: 'Kell AutoCAD a használathoz?',
    a: 'Nem. Elegendő a DXF vagy DWG fájl – azt a tervező exportálja, és már lehet is feltölteni.'
  },
  {
    q: 'Milyen pontosak az AI anyagajánlások?',
    a: 'Az AI valós, magyar piacon kapható termékeket javasol tájékoztató jelleggel. A végső döntés mindig a kivitelezőé – az AI csak segít a kiindulópontban.'
  },
  {
    q: 'Biztonságos a fájlfeltöltés?',
    a: 'A feltöltött terveket kizárólag a kalkulációhoz használjuk, nem tároljuk tartósan. A konverzió biztonságos, titkosított csatornán zajlik.'
  },
]

// ─── Components ───────────────────────────────────────────────────────────────

function NavBar({ onStart }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid #141414' : 'none',
      transition: 'all 0.3s ease',
      padding: '16px 40px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, background: '#00E5A0', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(0,229,160,0.4)'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', color: '#F0F0F0' }}>
          Takeoff<span style={{ color: '#00E5A0' }}>Pro</span>
        </span>
      </div>

      {/* Nav links - desktop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-links">
        {[['Funkciók', '#features'], ['Hogyan működik', '#how'], ['GYIK', '#faq']].map(([l, h]) => (
          <a key={h} href={h} style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#666', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color = '#CCC'} onMouseLeave={e => e.target.style.color = '#666'}>
            {l}
          </a>
        ))}
      </div>

      <button onClick={onStart} style={{
        padding: '10px 22px', background: '#00E5A0', color: '#0A0A0A',
        border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: 'Syne', fontWeight: 700, fontSize: 14,
        boxShadow: '0 0 20px rgba(0,229,160,0.25)',
        transition: 'all 0.2s'
      }}
        onMouseEnter={e => { e.target.style.boxShadow = '0 0 30px rgba(0,229,160,0.5)'; e.target.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.target.style.boxShadow = '0 0 20px rgba(0,229,160,0.25)'; e.target.style.transform = 'translateY(0)' }}
      >
        Kipróbálom →
      </button>
    </nav>
  )
}

function HeroSection({ onStart }) {
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  useEffect(() => {
    const fn = (e) => setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight })
    window.addEventListener('mousemove', fn)
    return () => window.removeEventListener('mousemove', fn)
  }, [])

  return (
    <section style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: '120px 24px 80px',
    }}>
      {/* Ambient glow background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 60% 50% at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(0,229,160,0.06) 0%, transparent 70%)`,
        transition: 'background 0.3s ease'
      }} />
      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'linear-gradient(#00E5A0 1px, transparent 1px), linear-gradient(90deg, #00E5A0 1px, transparent 1px)',
        backgroundSize: '48px 48px'
      }} />

      <div style={{ maxWidth: 800, textAlign: 'center', position: 'relative' }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 32,
          background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)',
          borderRadius: 999, padding: '6px 16px'
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 8px #00E5A0', animation: 'pulse 2s infinite' }} />
          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#00E5A0' }}>Villanyszerelőknek, villanyszerelőktől</span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: 'Syne', fontWeight: 900, lineHeight: 1.05,
          fontSize: 'clamp(38px, 7vw, 72px)',
          color: '#F0F0F0', marginBottom: 24, letterSpacing: '-0.03em'
        }}>
          DXF-ből profi<br />
          <span style={{
            color: '#00E5A0',
            textShadow: '0 0 40px rgba(0,229,160,0.4)'
          }}>árajánlat 2 perc alatt</span>
        </h1>

        {/* Subtitle */}
        <p style={{
          fontFamily: 'DM Mono', fontSize: 'clamp(14px, 2vw, 17px)',
          color: '#666', marginBottom: 48, lineHeight: 1.8, maxWidth: 560, margin: '0 auto 48px'
        }}>
          Töltsd fel a villamossági tervet, az AI kiszámolja a mennyiségeket,<br />
          javasol anyagokat, és generál egy profi PDF ajánlatot.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onStart} style={{
            padding: '16px 36px', background: '#00E5A0', color: '#0A0A0A',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 17,
            boxShadow: '0 0 40px rgba(0,229,160,0.3)',
            transition: 'all 0.2s'
          }}
            onMouseEnter={e => { e.target.style.boxShadow = '0 0 60px rgba(0,229,160,0.5)'; e.target.style.transform = 'translateY(-2px) scale(1.02)' }}
            onMouseLeave={e => { e.target.style.boxShadow = '0 0 40px rgba(0,229,160,0.3)'; e.target.style.transform = 'none' }}
          >
            Ingyenes próba →
          </button>
          <a href="#how" style={{
            padding: '16px 36px', background: 'transparent',
            border: '1px solid #2A2A2A', color: '#888', borderRadius: 10,
            fontFamily: 'DM Mono', fontSize: 14, textDecoration: 'none',
            transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: 8
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#444'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#2A2A2A'}
          >
            Hogyan működik?
          </a>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 0, marginTop: 72, justifyContent: 'center', flexWrap: 'wrap', borderTop: '1px solid #141414', paddingTop: 40 }}>
          {STATS.map((s, i) => (
            <div key={i} style={{
              flex: '1 1 140px', padding: '0 24px', textAlign: 'center',
              borderRight: i < STATS.length - 1 ? '1px solid #141414' : 'none'
            }}>
              <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 900, color: '#00E5A0', marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444', lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section id="features" style={{ padding: '100px 24px', background: '#050505' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#00E5A0', letterSpacing: '0.1em', marginBottom: 16, textTransform: 'uppercase' }}>Funkciók</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 16 }}>
              Minden ami kell a profi ajánlathoz
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#555', maxWidth: 480, margin: '0 auto' }}>
              Nem egy általános eszköz – villamossági kivitelezőkre szabva, magyar szabványokkal és piaci árakkal.
            </p>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {FEATURES.map((f, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div style={{
                background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 16, padding: 28,
                transition: 'all 0.3s ease', cursor: 'default', height: '100%'
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#2A4A3A'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 20px 60px rgba(0,0,0,0.4)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#1A1A1A'
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: '#F0F0F0', marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#555', lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowSection() {
  return (
    <section id="how" style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#00E5A0', letterSpacing: '0.1em', marginBottom: 16, textTransform: 'uppercase' }}>Hogyan működik</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em' }}>
              5 lépés, 2 perc
            </h2>
          </div>
        </FadeIn>

        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 28, top: 0, bottom: 0, width: 1,
            background: 'linear-gradient(to bottom, transparent, #1E1E1E 10%, #1E1E1E 90%, transparent)'
          }} />

          {STEPS.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div style={{ display: 'flex', gap: 32, marginBottom: 48, alignItems: 'flex-start' }}>
                {/* Step number */}
                <div style={{
                  width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                  background: '#0D0D0D', border: '1px solid #1E1E1E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', zIndex: 1
                }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 13, color: '#00E5A0' }}>{s.n}</span>
                </div>
                {/* Content */}
                <div style={{ paddingTop: 12 }}>
                  <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: '#F0F0F0', marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#555', lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

function AISection() {
  return (
    <section style={{ padding: '100px 24px', background: '#050505' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <FadeIn>
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#00E5A0', letterSpacing: '0.1em', marginBottom: 16, textTransform: 'uppercase' }}>AI Asszisztens</div>
              <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(24px, 4vw, 40px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 20 }}>
                Műszaki leírás?<br />Az AI elolvassa helyetted.
              </h2>
              <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#555', lineHeight: 1.8, marginBottom: 32 }}>
                Töltsd fel a PDF műszaki leírást – az AI kiszedi az IP védettséget, a kábel típusát, a vonatkozó szabványokat és a szerelési követelményeket. Automatikusan jelzi ha valami hiányzik a tervből.
              </p>
              {[
                'IP védettségi követelmények azonosítása',
                'Kábel keresztmetszet validáció',
                'MSZ HD szabvány ellenőrzés',
                'Konkrét termékajánlások magyar piacról',
                'Ajánlat magyarázat ügyfeleknek',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,229,160,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#777' }}>{item}</span>
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn delay={0.2}>
            {/* AI card mockup */}
            <div style={{ background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 16, padding: 24, fontFamily: 'DM Mono' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1A1A1A' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 8px #00E5A0' }} />
                <span style={{ fontSize: 12, color: '#555' }}>AI Elemzés eredménye</span>
              </div>
              {[
                { label: 'IP védettség', value: 'IP44 – nedves helyiségek', ok: true },
                { label: 'Kábel típus', value: 'NYY-J 3×2.5mm²', ok: true },
                { label: 'Szabvány', value: 'MSZ HD 60364-7-701', ok: true },
                { label: 'Figyelmeztetés', value: 'TRAY_100x60 réteg hiányzik', ok: false },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid #111' : 'none' }}>
                  <span style={{ fontSize: 11, color: '#444' }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: row.ok ? '#00E5A0' : '#FFD966', background: row.ok ? 'rgba(0,229,160,0.08)' : 'rgba(255,217,102,0.08)', padding: '3px 10px', borderRadius: 999 }}>{row.value}</span>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.1)', borderRadius: 8, fontSize: 11, color: '#4A8A6A', lineHeight: 1.6 }}>
                "A tervek megfelelnek az MSZ HD szabványnak. A nedves helyiségekben IP44 védettségű szerelvények szükségesek."
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#00E5A0', letterSpacing: '0.1em', marginBottom: 16, textTransform: 'uppercase' }}>GYIK</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 44px)', color: '#F0F0F0', letterSpacing: '-0.02em' }}>
              Gyakori kérdések
            </h2>
          </div>
        </FadeIn>

        {FAQ.map((item, i) => (
          <FadeIn key={i} delay={i * 0.06}>
            <div style={{
              borderBottom: '1px solid #141414', padding: '20px 0',
              cursor: 'pointer', userSelect: 'none'
            }} onClick={() => setOpen(open === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 600, color: open === i ? '#00E5A0' : '#CCC', transition: 'color 0.2s' }}>{item.q}</span>
                <span style={{ color: open === i ? '#00E5A0' : '#444', fontSize: 20, transition: 'transform 0.2s, color 0.2s', transform: open === i ? 'rotate(45deg)' : 'none', flexShrink: 0 }}>+</span>
              </div>
              {open === i && (
                <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#555', lineHeight: 1.8, marginTop: 14 }}>{item.a}</p>
              )}
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

function CTASection({ onStart }) {
  return (
    <section style={{ padding: '120px 24px', background: '#050505', textAlign: 'center' }}>
      <FadeIn>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {/* Glow */}
          <div style={{
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,229,160,0.12) 0%, transparent 70%)',
            margin: '-80px auto 0', pointerEvents: 'none'
          }} />
          <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Kezdd el ma,<br />
            <span style={{ color: '#00E5A0' }}>ingyen</span>
          </h2>
          <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#555', marginBottom: 40, lineHeight: 1.8 }}>
            Nincs regisztráció, nincs hitelkártya.<br />Töltsd fel az első tervedet most.
          </p>
          <button onClick={onStart} style={{
            padding: '18px 48px', background: '#00E5A0', color: '#0A0A0A',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 18,
            boxShadow: '0 0 60px rgba(0,229,160,0.3)',
            transition: 'all 0.2s'
          }}
            onMouseEnter={e => { e.target.style.transform = 'translateY(-3px) scale(1.02)'; e.target.style.boxShadow = '0 0 80px rgba(0,229,160,0.5)' }}
            onMouseLeave={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 0 60px rgba(0,229,160,0.3)' }}
          >
            Kipróbálom ingyen →
          </button>
        </div>
      </FadeIn>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #141414', padding: '32px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, background: '#00E5A0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: '#F0F0F0' }}>Takeoff<span style={{ color: '#00E5A0' }}>Pro</span></span>
      </div>
      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#333' }}>© 2025 TakeoffPro · Villamossági ajánlatkészítő</span>
    </footer>
  )
}

// ─── Main Landing ─────────────────────────────────────────────────────────────
export default function Landing({ onStart }) {
  return (
    <div style={{ background: '#0A0A0A', color: '#F0F0F0', minHeight: '100vh' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100% { opacity: 1; box-shadow: 0 0 8px #00E5A0 } 50% { opacity: 0.6; box-shadow: 0 0 16px #00E5A0 } }
        html { scroll-behavior: smooth; }
        @media (max-width: 640px) {
          .nav-links { display: none !important; }
        }
        @media (max-width: 768px) {
          section > div > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <NavBar onStart={onStart} />
      <HeroSection onStart={onStart} />
      <FeaturesSection />
      <HowSection />
      <AISection />
      <FAQSection />
      <CTASection onStart={onStart} />
      <Footer />
    </div>
  )
}
