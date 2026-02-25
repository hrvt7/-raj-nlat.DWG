import React, { useEffect, useRef, useState } from 'react'

function GlobalMouseGlow() {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 })
  useEffect(() => {
    const fn = (e) => setPos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight })
    window.addEventListener('mousemove', fn)
    return () => window.removeEventListener('mousemove', fn)
  }, [])
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
      background: `radial-gradient(ellipse 55% 45% at ${pos.x * 100}% ${pos.y * 100}%, rgba(0,229,160,0.055) 0%, transparent 70%)`,
      transition: 'background 0.25s ease'
    }} />
  )
}

function useInView(threshold = 0.12) {
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
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ease ${delay}s, transform 0.65s ease ${delay}s`,
      ...style
    }}>
      {children}
    </div>
  )
}

const SvgIcon = ({ path, size = 18, color = '#00E5A0', sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(path) ? path : [path]).map((d, i) => <path key={i} d={d} />)}
  </svg>
)

const FEATURES = [
  { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2zM14 2v6h6M9 15l2 2 4-4', title: 'DXF & DWG Import', desc: 'Töltsd be a terveidet közvetlenül – DXF natívan, DWG automatikus konverzióval. Több fájl egyszerre, emeletenként.' },
  { icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14l3 3 5-5', title: 'Automatikus Mennyiségkimutatás', desc: 'Blokkok, vonalak, rétegek automatikus felismerése. Szerelvények darabszáma és kábelnyomvonalak hossza másodpercek alatt.' },
  { icon: ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12'], title: 'AI Asszisztens', desc: 'Töltsd fel a műszaki leírást – az AI kiszedi az IP védettséget, kábelkeresztmetszetet, szabványokat és anyagkövetelményeket.' },
  { icon: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z', 'M14 2v6h6M9 13h6M9 17h4'], title: 'Profi Árajánlat', desc: 'Órabéres vagy tételes kalkuláció. Egységárak, normaidők, árrés. PDF ajánlat egy kattintással, logóval és dátummal.' },
  { icon: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'], title: 'Több Szint, Egy Projekt', desc: 'Húzd be egyszerre az összes emeleti tervet. Szintenként külön megtekintés, összesített kalkuláció – nincs manuális összeadás.' },
  { icon: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'], title: 'Anyagajánlás', desc: 'Nem tudod milyen terméket válassz? Az AI javasol konkrét, magyar piacon kapható termékeket árakkal és típusszámokkal.' },
]

const STEPS = [
  { n: '01', title: 'Fájl feltöltés',   desc: 'Húzd be a DXF vagy DWG terveket. Több fájl egyszerre is feltölthető – pl. emeletenként külön terv.' },
  { n: '02', title: 'Mennyiség review',  desc: 'Az app automatikusan felismeri a szerelvényeket és nyomvonalakat. Rendeld hozzá a tételneveket.' },
  { n: '03', title: 'AI elemzés',        desc: 'Opcionálisan töltsd fel a műszaki leírást. Az AI azonosítja a követelményeket és anyagajánlásokat ad.' },
  { n: '04', title: 'Árazás',            desc: 'Állítsd be az egységárakat és normákat. Válaszd az órabéres vagy tételes kalkulációs módszert.' },
  { n: '05', title: 'PDF ajánlat',       desc: 'Egy kattintással generálj profi PDF árajánlatot, amit azonnal elküldhetsz az ügyfélnek.' },
]

const STATS = [
  { value: '80%',      label: 'Kevesebb kalkulációs idő' },
  { value: '< 2 perc', label: 'DXF-től ajánlatig' },
  { value: '100%',     label: 'Magyar piacra szabva' },
  { value: '60+',      label: 'Normaidő-adatbázis' },
]

const FAQ = [
  { q: 'Milyen fájlformátumokat fogad el?',    a: 'DXF és DWG fájlokat egyaránt. A DWG-t automatikusan konvertáljuk – nem kell semmit letölteni vagy külön programot futtatni.' },
  { q: 'Mekkora tervekkel működik?',            a: 'Kisebb lakóépülettől nagyobb ipari létesítményig. Több emeletes projekteknél emeletenként külön fájlokat tölthet fel, az app összesíti az adatokat.' },
  { q: 'Kell AutoCAD a használathoz?',          a: 'Nem. Elegendő a DXF vagy DWG fájl – azt a tervező exportálja, és már lehet is feltölteni.' },
  { q: 'Milyen pontosak az AI anyagajánlások?', a: 'Az AI valós, magyar piacon kapható termékeket javasol tájékoztató jelleggel. A végső döntés mindig a kivitelezőé.' },
  { q: 'Biztonságos a fájlfeltöltés?',          a: 'A feltöltött terveket kizárólag a kalkulációhoz használjuk, nem tároljuk tartósan. A konverzió biztonságos, titkosított csatornán zajlik.' },
]

const PLANS = [
  {
    name: 'Indulás', price: 4990, color: '#888',
    desc: 'Egyszemélyes vállalkozásoknak, akik most váltanak digitálisra.',
    features: ['15 ajánlat / hónap', 'DXF & DWG feltöltés', 'PDF ajánlat generálás', 'Normaidő-adatbázis (olvasás)', 'Email támogatás'],
    missing: ['Saját normaidők szerkesztése', 'Assembly szerkesztő', 'Több felhasználó'],
    cta: 'Kipróbálom', highlight: false,
  },
  {
    name: 'Pro', price: 9990, color: '#00E5A0',
    desc: '1–5 fős vállalkozásoknak, akik rendszeresen adnak árajánlatot.',
    features: ['Korlátlan ajánlat', 'DXF & DWG feltöltés', 'PDF ajánlat generálás', 'Normaidő-adatbázis (szerkeszthető)', 'Assembly szerkesztő (v2.1)', 'Anyagárlista kezelés', 'Priority email támogatás'],
    missing: ['Több felhasználó'],
    cta: 'Kipróbálom – 14 nap ingyen', highlight: true,
  },
  {
    name: 'Csapat', price: 22990, color: '#4CC9F0',
    desc: '5–20 fős cégeknek, ahol több szerelő is árajánlatot készít.',
    features: ['Minden a Pro-ból', '5 felhasználói fiók', 'Közös normaidő-adatbázis', 'Szerepkörök (szerelő / irodai)', 'Ajánlat sablon könyvtár', 'API hozzáférés', 'Dedikált onboarding'],
    missing: [],
    cta: 'Kapcsolatfelvétel', highlight: false,
  },
]

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
      borderBottom: scrolled ? '1px solid #181818' : 'none',
      transition: 'all 0.3s', padding: '16px 40px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, background: '#00E5A0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0,229,160,0.4)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', color: '#F0F0F0' }}>Takeoff<span style={{ color: '#00E5A0' }}>Pro</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-links">
        {[['Funkciók','#features'],['Hogyan működik','#how'],['Árazás','#pricing'],['GYIK','#faq']].map(([l,h]) => (
          <a key={h} href={h} style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color='#CCC'} onMouseLeave={e => e.target.style.color='#888'}>{l}</a>
        ))}
      </div>
      <button onClick={onStart} style={{ padding: '10px 22px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 14, boxShadow: '0 0 20px rgba(0,229,160,0.25)', transition: 'all 0.2s' }}
        onMouseEnter={e => { e.target.style.boxShadow='0 0 30px rgba(0,229,160,0.5)'; e.target.style.transform='translateY(-1px)' }}
        onMouseLeave={e => { e.target.style.boxShadow='0 0 20px rgba(0,229,160,0.25)'; e.target.style.transform='none' }}>
        Kipróbálom →
      </button>
    </nav>
  )
}

function HeroSection({ onStart }) {
  return (
    <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, overflow: 'hidden', padding: '120px 24px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.028, backgroundImage: 'linear-gradient(#00E5A0 1px, transparent 1px), linear-gradient(90deg, #00E5A0 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <div style={{ maxWidth: 800, textAlign: 'center', position: 'relative' }}>
        <FadeIn>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 900, lineHeight: 1.05, fontSize: 'clamp(38px, 7vw, 72px)', color: '#F0F0F0', marginBottom: 24, letterSpacing: '-0.03em' }}>
            DXF-ből profi<br />
            <span style={{ color: '#00E5A0', textShadow: '0 0 40px rgba(0,229,160,0.4)' }}>árajánlat 2 perc alatt</span>
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p style={{ fontFamily: 'DM Mono', fontSize: 'clamp(14px, 2vw, 17px)', color: '#999', marginBottom: 48, lineHeight: 1.8, maxWidth: 560, margin: '0 auto 48px' }}>
            Töltsd fel a villamossági tervet, az AI kiszámolja a mennyiségeket,<br />javasol anyagokat, és generál egy profi PDF ajánlatot.
          </p>
        </FadeIn>
        <FadeIn delay={0.2}>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onStart} style={{ padding: '16px 36px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 17, boxShadow: '0 0 40px rgba(0,229,160,0.3)', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.target.style.boxShadow='0 0 60px rgba(0,229,160,0.5)'; e.target.style.transform='translateY(-2px) scale(1.02)' }}
              onMouseLeave={e => { e.target.style.boxShadow='0 0 40px rgba(0,229,160,0.3)'; e.target.style.transform='none' }}>
              Ingyenes próba →
            </button>
            <a href="#how" style={{ padding: '16px 36px', background: 'transparent', border: '1px solid #2A2A2A', color: '#999', borderRadius: 10, fontFamily: 'DM Mono', fontSize: 14, textDecoration: 'none', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#444'; e.currentTarget.style.color='#CCC' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='#2A2A2A'; e.currentTarget.style.color='#999' }}>
              Hogyan működik?
            </a>
          </div>
        </FadeIn>
        <FadeIn delay={0.3}>
          <div style={{ display: 'flex', gap: 0, marginTop: 72, justifyContent: 'center', flexWrap: 'wrap', borderTop: '1px solid #181818', paddingTop: 40 }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ flex: '1 1 140px', padding: '0 24px', textAlign: 'center', borderRight: i < STATS.length - 1 ? '1px solid #181818' : 'none' }}>
                <div style={{ fontFamily: 'Syne', fontSize: 28, fontWeight: 900, color: '#00E5A0', marginBottom: 6 }}>{s.value}</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#777', lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section id="features" style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Funkciók</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 16 }}>Minden ami kell a profi ajánlathoz</h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
              Nem egy általános eszköz – villamossági kivitelezőkre szabva, magyar szabványokkal és piaci árakkal.
            </p>
          </div>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {FEATURES.map((f, i) => (
            <FadeIn key={i} delay={i * 0.07}>
              <div style={{ background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 16, padding: 28, transition: 'all 0.3s', cursor: 'default', height: '100%' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#2A4A3A'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 20px 60px rgba(0,0,0,0.4)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#1A1A1A'; e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ width: 40, height: 40, background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <SvgIcon path={f.icon} size={18} />
                </div>
                <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17, color: '#F0F0F0', marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.75 }}>{f.desc}</p>
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
    <section id="how" style={{ padding: '100px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Hogyan működik</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em' }}>5 lépés, 2 perc</h2>
          </div>
        </FadeIn>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 28, top: 0, bottom: 0, width: 1, background: 'linear-gradient(to bottom, transparent, #222 10%, #222 90%, transparent)' }} />
          {STEPS.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div style={{ display: 'flex', gap: 28, marginBottom: 36, alignItems: 'flex-start' }}>
                <div style={{ width: 56, height: 56, flexShrink: 0, background: '#0D0D0D', border: '1px solid #1E1E1E', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.05em', zIndex: 1, position: 'relative' }}>
                  {s.n}
                </div>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17, color: '#F0F0F0', marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.75 }}>{s.desc}</div>
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
    <section style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="ai-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          <FadeIn>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>AI Asszisztens</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(24px, 4vw, 40px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
              Töltsd fel a műszaki leírást, az AI elvégzi a többit
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', lineHeight: 1.8, marginBottom: 28 }}>
              Az AI elemzi az OTÉK-ot, szabványszámokat, IP besorolásokat és anyagkövetelményeket – és figyelmeztet, ha valami hiányzik a tervből.
            </p>
            {['IP védettség automatikus azonosítás', 'MSZ HD szabványok ellenőrzése', 'Anyag- és típusajánlások', 'Hiányzó réteg figyelmeztetések'].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#aaa' }}>{item}</span>
              </div>
            ))}
          </FadeIn>
          <FadeIn delay={0.2}>
            <div style={{ background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 16, padding: 24, fontFamily: 'DM Mono' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1A1A1A' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 8px #00E5A0' }} />
                <span style={{ fontSize: 12, color: '#888' }}>AI Elemzés eredménye</span>
              </div>
              {[
                { label: 'IP védettség',   value: 'IP44 – nedves helyiségek',   ok: true },
                { label: 'Kábel típus',    value: 'NYY-J 3×2.5mm²',            ok: true },
                { label: 'Szabvány',       value: 'MSZ HD 60364-7-701',         ok: true },
                { label: 'Figyelmeztetés', value: 'TRAY_100x60 réteg hiányzik', ok: false },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid #111' : 'none' }}>
                  <span style={{ fontSize: 11, color: '#777' }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: row.ok ? '#00E5A0' : '#FFD966', background: row.ok ? 'rgba(0,229,160,0.08)' : 'rgba(255,217,102,0.08)', padding: '3px 10px', borderRadius: 999 }}>{row.value}</span>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.1)', borderRadius: 8, fontSize: 11, color: '#5A9A7A', lineHeight: 1.6 }}>
                "A tervek megfelelnek az MSZ HD szabványnak. A nedves helyiségekben IP44 védettségű szerelvények szükségesek."
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}

function PricingSection({ onStart }) {
  const [annual, setAnnual] = useState(false)
  return (
    <section id="pricing" style={{ padding: '100px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Árazás</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 16 }}>Egyszerű, átlátható árak</h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', maxWidth: 420, margin: '0 auto 28px', lineHeight: 1.7 }}>
              Nincs rejtett díj. 14 napos ingyenes próba, lemondható bármikor.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#111', border: '1px solid #1E1E1E', borderRadius: 999, padding: 4 }}>
              <button onClick={() => setAnnual(false)} style={{ padding: '7px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 12, background: !annual ? '#00E5A0' : 'transparent', color: !annual ? '#0A0A0A' : '#777', transition: 'all 0.2s' }}>Havi</button>
              <button onClick={() => setAnnual(true)} style={{ padding: '7px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'DM Mono', fontSize: 12, background: annual ? '#00E5A0' : 'transparent', color: annual ? '#0A0A0A' : '#777', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}>
                Éves <span style={{ background: annual ? 'rgba(0,0,0,0.15)' : 'rgba(0,229,160,0.15)', color: annual ? '#0A0A0A' : '#00E5A0', fontSize: 10, padding: '1px 6px', borderRadius: 999 }}>-20%</span>
              </button>
            </div>
          </div>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 20, alignItems: 'stretch' }}>
          {PLANS.map((plan, i) => {
            const price = annual ? Math.round(plan.price * 0.8) : plan.price
            return (
              <FadeIn key={i} delay={i * 0.08}>
                <div style={{ background: plan.highlight ? 'linear-gradient(145deg, #0C1C15 0%, #08120E 100%)' : '#0D0D0D', border: `1px solid ${plan.highlight ? 'rgba(0,229,160,0.28)' : '#1A1A1A'}`, borderRadius: 20, padding: 32, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: plan.highlight ? '0 0 60px rgba(0,229,160,0.07)' : 'none' }}>
                  {plan.highlight && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#00E5A0', color: '#0A0A0A', fontFamily: 'Syne', fontWeight: 800, fontSize: 10, padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>
                      LEGNÉPSZERŰBB
                    </div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: plan.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{plan.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 40, color: '#F0F0F0', letterSpacing: '-0.02em' }}>{price.toLocaleString('hu')}</span>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#777' }}>Ft/hó</span>
                  </div>
                  {annual && <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', marginBottom: 6 }}>Éves számlázással – {Math.round(price * 12).toLocaleString('hu')} Ft/év</div>}
                  <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.7, marginBottom: 24 }}>{plan.desc}</p>
                  <button onClick={onStart} style={{ padding: '13px 20px', borderRadius: 10, border: plan.highlight ? 'none' : `1px solid ${plan.color}33`, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 14, background: plan.highlight ? '#00E5A0' : 'transparent', color: plan.highlight ? '#0A0A0A' : plan.color, marginBottom: 24, transition: 'all 0.2s', boxShadow: plan.highlight ? '0 0 30px rgba(0,229,160,0.25)' : 'none' }}
                    onMouseEnter={e => { if (plan.highlight) { e.target.style.boxShadow='0 0 50px rgba(0,229,160,0.45)'; e.target.style.transform='translateY(-1px)' } else e.target.style.background=`${plan.color}18` }}
                    onMouseLeave={e => { if (plan.highlight) { e.target.style.boxShadow='0 0 30px rgba(0,229,160,0.25)'; e.target.style.transform='none' } else e.target.style.background='transparent' }}>
                    {plan.cta}
                  </button>
                  <div style={{ flex: 1 }}>
                    {plan.features.map((f, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#bbb' }}>{f}</span>
                      </div>
                    ))}
                    {plan.missing.map((f, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11, opacity: 0.32 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#555' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            )
          })}
        </div>
        <FadeIn delay={0.3}>
          <p style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 12, color: '#555', marginTop: 32 }}>
            Minden csomag tartalmaz 14 napos ingyenes próbát. Nem szükséges bankkártya a regisztrációhoz.
          </p>
        </FadeIn>
      </div>
    </section>
  )
}

function FAQSection() {
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>GYIK</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 44px)', color: '#F0F0F0', letterSpacing: '-0.02em' }}>Gyakori kérdések</h2>
          </div>
        </FadeIn>
        {FAQ.map((item, i) => (
          <FadeIn key={i} delay={i * 0.06}>
            <div style={{ borderBottom: '1px solid #181818', padding: '20px 0', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(open === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 600, color: open === i ? '#00E5A0' : '#DDD', transition: 'color 0.2s' }}>{item.q}</span>
                <span style={{ color: open === i ? '#00E5A0' : '#555', fontSize: 20, transition: 'transform 0.2s, color 0.2s', transform: open === i ? 'rotate(45deg)' : 'none', flexShrink: 0 }}>+</span>
              </div>
              {open === i && <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.8, marginTop: 14 }}>{item.a}</p>}
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

function CTASection({ onStart }) {
  return (
    <section style={{ padding: '120px 24px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
      <FadeIn>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,229,160,0.1) 0%, transparent 70%)', margin: '-80px auto 0', pointerEvents: 'none' }} />
          <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Kezdd el ma,<br /><span style={{ color: '#00E5A0' }}>ingyen</span>
          </h2>
          <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', marginBottom: 40, lineHeight: 1.8 }}>
            Nincs regisztráció, nincs hitelkártya.<br />Töltsd fel az első tervedet most.
          </p>
          <button onClick={onStart} style={{ padding: '18px 48px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 18, boxShadow: '0 0 60px rgba(0,229,160,0.3)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.target.style.transform='translateY(-3px) scale(1.02)'; e.target.style.boxShadow='0 0 80px rgba(0,229,160,0.5)' }}
            onMouseLeave={e => { e.target.style.transform='none'; e.target.style.boxShadow='0 0 60px rgba(0,229,160,0.3)' }}>
            Kipróbálom ingyen →
          </button>
        </div>
      </FadeIn>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #141414', padding: '32px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, background: '#00E5A0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: '#F0F0F0' }}>Takeoff<span style={{ color: '#00E5A0' }}>Pro</span></span>
      </div>
      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444' }}>© 2025 TakeoffPro · Villamossági árajánlat rendszer</span>
    </footer>
  )
}

export default function Landing({ onStart }) {
  return (
    <div style={{ background: '#0A0A0A', color: '#F0F0F0', minHeight: '100vh', position: 'relative' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        @media (max-width: 640px) { .nav-links { display: none !important; } }
        @media (max-width: 768px) { .ai-grid { grid-template-columns: 1fr !important; } }
      `}</style>
      <GlobalMouseGlow />
      <NavBar onStart={onStart} />
      <HeroSection onStart={onStart} />
      <FeaturesSection />
      <HowSection />
      <AISection />
      <PricingSection onStart={onStart} />
      <FAQSection />
      <CTASection onStart={onStart} />
      <Footer />
    </div>
  )
}
