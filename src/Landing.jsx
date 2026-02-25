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
    name: 'Alapcsomag', price: 9990, color: '#888',
    desc: 'Kisebb vállalkozásoknak. 1–3 szerelő, rendszeres ajánlatkészítés.',
    trial: '14 napos ingyenes próba',
    features: [
      '3 felhasználói fiók',
      'Korlátlan ajánlat',
      'DXF & DWG feltöltés',
      'PDF ajánlat generálás',
      'Normaidő-adatbázis (olvasás)',
      'Email támogatás',
    ],
    missing: ['Normaidő szerkesztés', 'Assembly szerkesztő', 'API hozzáférés'],
    cta: '14 nap ingyen kipróbálom', highlight: false,
  },
  {
    name: 'Pro', price: 24990, color: '#00E5A0',
    desc: '5–15 fős kivitelező cégeknek. Teljes workflow, saját adatbázis.',
    trial: '14 napos ingyenes próba',
    features: [
      '8 felhasználói fiók',
      'Korlátlan ajánlat',
      'DXF & DWG feltöltés',
      'PDF ajánlat generálás',
      'Normaidő-adatbázis (szerkeszthető)',
      'Assembly szerkesztő (v2.1)',
      'Anyagárlista + kedvezmény kezelés',
      'Szerepkörök (szerelő / irodai)',
      'Priority email támogatás',
    ],
    missing: ['API hozzáférés'],
    cta: '14 nap ingyen kipróbálom', highlight: true,
  },
  {
    name: 'Vállalati', price: 49990, color: '#4CC9F0',
    desc: '15+ fős cégeknek, több telephellyel vagy alvállalkozói hálóval.',
    trial: 'Személyes onboarding',
    features: [
      'Korlátlan felhasználó',
      'Minden a Pro-ból',
      'Több telephely kezelése',
      'Közös sablon könyvtár',
      'API hozzáférés + webhook',
      'SSO / SAML bejelentkezés',
      'SLA garancia (99.9%)',
      'Dedikált account manager',
    ],
    missing: [],
    cta: 'Ajánlatot kérek', highlight: false,
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

function TakeoffAnimation() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <style>{`
          .tp-bp-wall   { fill: none; stroke: #1E4030; stroke-width: 3px; }
          .tp-bp-sym    { fill: none; stroke: #1E4030; stroke-width: 2px; }
          .tp-bp-active { fill: none; stroke: #00E5A0; stroke-width: 3px; opacity: 0; }
          .tp-ui-label  { font-family: 'DM Mono', monospace; font-size: 16px; fill: #3A6A52; letter-spacing: 2px; text-transform: uppercase; }
          .tp-ui-zero   { font-family: 'DM Mono', monospace; font-size: 32px; fill: #1A3028; }
          .tp-ui-val    { font-family: 'DM Mono', monospace; font-size: 32px; fill: #00E5A0; }
          .tp-scan-beam { fill: url(#tpScanGrad); }
          @keyframes tpScan {
            0%   { transform: translateX(-100px); }
            100% { transform: translateX(1700px); }
          }
          .tp-scan-anim { animation: tpScan 6s linear infinite; }
        `}</style>

        {/* Scanner gradient – green beam */}
        <linearGradient id="tpScanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00E5A0" stopOpacity="0" />
          <stop offset="35%"  stopColor="#00E5A0" stopOpacity="0.08" />
          <stop offset="50%"  stopColor="#00E5A0" stopOpacity="0.35" />
          <stop offset="65%"  stopColor="#00E5A0" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00E5A0" stopOpacity="0" />
        </linearGradient>

        {/* Symbol glow radial */}
        <radialGradient id="tpSymGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#00E5A0" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00E5A0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Grid */}
      <pattern id="tpGrid" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#00E5A0" strokeWidth="0.5" opacity="0.04"/>
      </pattern>
      <rect width="100%" height="100%" fill="url(#tpGrid)" />

      {/* ── Blueprint floorplan ── */}
      <g transform="translate(100, 100)">

        {/* Walls – identical layout to original */}
        <path className="tp-bp-wall" d="M50,50 L50,600 L400,600 L400,400 L800,400 L800,50 L50,50 Z" />
        <path className="tp-bp-wall" d="M400,600 L800,600 L800,400" />
        <line className="tp-bp-wall" x1="400" y1="50" x2="400" y2="400" />

        {/* Interior partition lines */}
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="200" y1="50" x2="200" y2="600" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="50"  y1="300" x2="400" y2="300" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="600" y1="50"  x2="600" y2="400" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="400" y1="500" x2="800" y2="500" />

        {/* Door arcs */}
        <path stroke="#1A3828" strokeWidth="1.5" fill="none" d="M50,300 Q80,270 110,300" />
        <path stroke="#1A3828" strokeWidth="1.5" fill="none" d="M400,400 Q430,370 460,400" />

        {/* ── SOCKET symbols (X in circle) ── */}
        <g transform="translate(150, 550)">
          <circle className="tp-bp-sym" r="10" />
          <path className="tp-bp-sym" d="M-7,-7 L7,7 M-7,7 L7,-7" />
          <circle className="tp-bp-active" r="20">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="1s" repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="scale" values="0.8;1.2;1" keyTimes="0;0.2;0.4" dur="6s" begin="1s" repeatCount="indefinite" />
          </circle>
          <circle r="28" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="1s" repeatCount="indefinite" />
          </circle>
        </g>

        <g transform="translate(250, 550)">
          <circle className="tp-bp-sym" r="10" />
          <path className="tp-bp-sym" d="M-7,-7 L7,7 M-7,7 L7,-7" />
          <circle className="tp-bp-active" r="20">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="1.2s" repeatCount="indefinite" />
          </circle>
          <circle r="28" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="1.2s" repeatCount="indefinite" />
          </circle>
        </g>

        <g transform="translate(600, 200)">
          <circle className="tp-bp-sym" r="10" />
          <path className="tp-bp-sym" d="M-7,-7 L7,7 M-7,7 L7,-7" />
          <circle className="tp-bp-active" r="20">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="2.5s" repeatCount="indefinite" />
          </circle>
          <circle r="28" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="2.5s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── SWITCH symbols (plain circle) ── */}
        <g transform="translate(350, 400)">
          <circle className="tp-bp-sym" r="12" />
          <circle className="tp-bp-active" r="20">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="1.8s" repeatCount="indefinite" />
          </circle>
          <circle r="28" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="1.8s" repeatCount="indefinite" />
          </circle>
        </g>

        <g transform="translate(750, 400)">
          <circle className="tp-bp-sym" r="12" />
          <circle className="tp-bp-active" r="20">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="3s" repeatCount="indefinite" />
          </circle>
          <circle r="28" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="3s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── LAMP symbols (circle + crosshair) ── */}
        <g transform="translate(225, 225)">
          <circle className="tp-bp-sym" r="15" />
          <path className="tp-bp-sym" d="M-15,0 L15,0 M0,-15 L0,15" />
          <circle className="tp-bp-active" r="25">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="1.5s" repeatCount="indefinite" />
          </circle>
          <circle r="34" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="1.5s" repeatCount="indefinite" />
          </circle>
        </g>

        <g transform="translate(600, 500)">
          <circle className="tp-bp-sym" r="15" />
          <path className="tp-bp-sym" d="M-15,0 L15,0 M0,-15 L0,15" />
          <circle className="tp-bp-active" r="25">
            <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="6s" begin="2.8s" repeatCount="indefinite" />
          </circle>
          <circle r="34" fill="url(#tpSymGlow)" opacity="0">
            <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="6s" begin="2.8s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── Scanner beam & line ── */}
        <rect className="tp-scan-beam tp-scan-anim" x="-20" y="0" width="40" height="700" />
        <line className="tp-scan-anim" x1="20" y1="0" x2="20" y2="700"
          stroke="#00E5A0" strokeWidth="1.5" opacity="0.9" />
      </g>

      {/* ── UI panel (right) ── */}
      <g transform="translate(1020, 150)">

        {/* Card */}
        <rect width="360" height="400" rx="10" fill="#060E0A"
          stroke="#00E5A0" strokeWidth="1" strokeOpacity="0.25" />
        {/* Top accent strip */}
        <rect width="360" height="3" rx="1" fill="#00E5A0" opacity="0.7" />

        {/* Title */}
        <text x="28" y="44"
          fontFamily="'DM Mono',monospace" fontSize="14" fontWeight="bold"
          fill="#C8D8D0" letterSpacing="2">QUANTITY TAKEOFF</text>
        <line x1="28" y1="60" x2="332" y2="60"
          stroke="#00E5A0" strokeWidth="0.5" strokeOpacity="0.2" />

        {/* Scanning indicator */}
        <circle cx="28" cy="84" r="4" fill="#00E5A0">
          <animate attributeName="opacity" values="1;0.25;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <text x="40" y="89"
          fontFamily="'DM Mono',monospace" fontSize="10" fill="#2A5040" letterSpacing="2">
          SCANNING...
        </text>

        {/* ── Row: DUGALJ ── */}
        <g transform="translate(28, 134)">
          <text className="tp-ui-label" x="0" y="0">DUGALJ (DB)</text>
          <text className="tp-ui-zero" x="304" y="0" textAnchor="end">
            00
            <animate attributeName="opacity" values="1;0" dur="6s" begin="1.2s" fill="freeze" repeatCount="indefinite" />
          </text>
          <text className="tp-ui-val" x="304" y="0" textAnchor="end" opacity="0">
            12
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="6s" begin="1.2s" fill="freeze" repeatCount="indefinite" />
          </text>
          <line x1="0" y1="16" x2="304" y2="16" stroke="#0A1E14" strokeWidth="1" />
        </g>

        {/* ── Row: KAPCSOLÓ ── */}
        <g transform="translate(28, 220)">
          <text className="tp-ui-label" x="0" y="0">KAPCSOLÓ (DB)</text>
          <text className="tp-ui-zero" x="304" y="0" textAnchor="end">
            00
            <animate attributeName="opacity" values="1;0" dur="6s" begin="3s" fill="freeze" repeatCount="indefinite" />
          </text>
          <text className="tp-ui-val" x="304" y="0" textAnchor="end" opacity="0">
            07
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="6s" begin="3s" fill="freeze" repeatCount="indefinite" />
          </text>
          <line x1="0" y1="16" x2="304" y2="16" stroke="#0A1E14" strokeWidth="1" />
        </g>

        {/* ── Row: LÁMPA ── */}
        <g transform="translate(28, 306)">
          <text className="tp-ui-label" x="0" y="0">LÁMPA (DB)</text>
          <text className="tp-ui-zero" x="304" y="0" textAnchor="end">
            00
            <animate attributeName="opacity" values="1;0" dur="6s" begin="2.8s" fill="freeze" repeatCount="indefinite" />
          </text>
          <text className="tp-ui-val" x="304" y="0" textAnchor="end" opacity="0">
            18
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" dur="6s" begin="2.8s" fill="freeze" repeatCount="indefinite" />
          </text>
          <line x1="0" y1="16" x2="304" y2="16" stroke="#0A1E14" strokeWidth="1" />
        </g>

        {/* ── Total ── */}
        <g transform="translate(28, 370)">
          <text fontFamily="'DM Mono',monospace" fontSize="10" fill="#2A5040" letterSpacing="2" x="0" y="0">
            ÖSSZES TÉTEL
          </text>
          <text fontFamily="'DM Mono',monospace" fontSize="22" fill="#00E5A0"
            x="304" y="0" textAnchor="end"
            style={{ filter: 'drop-shadow(0 0 8px rgba(0,229,160,0.6))' }}>
            37
            <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.5;0.65;1" dur="6s" begin="0s" repeatCount="indefinite" />
          </text>
        </g>
      </g>

      {/* Dashed connector: blueprint → UI */}
      <line x1="900" y1="430" x2="1020" y2="340"
        stroke="#00E5A0" strokeWidth="1" strokeDasharray="5,4" opacity="0.15" />
    </svg>
  )
}

function HeroSection({ onStart }) {
  return (
    <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1, overflow: 'hidden', padding: '100px 48px 60px' }}>

      {/* Subtle grid bg */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025, backgroundImage: 'linear-gradient(#00E5A0 1px, transparent 1px), linear-gradient(90deg, #00E5A0 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }} className="hero-grid">

        {/* ── Left: text content ── */}
        <div>
          <FadeIn>
            <h1 style={{ fontFamily: 'Syne', fontWeight: 900, lineHeight: 1.05, fontSize: 'clamp(36px, 4.5vw, 64px)', color: '#F0F0F0', marginBottom: 24, letterSpacing: '-0.03em' }}>
              DXF-ből profi<br />
              <span style={{ color: '#00E5A0', textShadow: '0 0 40px rgba(0,229,160,0.35)' }}>árajánlat 2 perc alatt</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p style={{ fontFamily: 'DM Mono', fontSize: 'clamp(13px, 1.4vw, 16px)', color: '#999', lineHeight: 1.85, marginBottom: 40, maxWidth: 480 }}>
              Töltsd fel a villamossági tervet, az AI automatikusan megszámolja a szerelvényeket, javasol anyagokat, és generál egy profi PDF ajánlatot.
            </p>
          </FadeIn>
          <FadeIn delay={0.2}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 56 }}>
              <button onClick={onStart} style={{ padding: '15px 32px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 16, boxShadow: '0 0 40px rgba(0,229,160,0.3)', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.target.style.boxShadow='0 0 60px rgba(0,229,160,0.55)'; e.target.style.transform='translateY(-2px) scale(1.02)' }}
                onMouseLeave={e => { e.target.style.boxShadow='0 0 40px rgba(0,229,160,0.3)'; e.target.style.transform='none' }}>
                Próbáld ki 14 napig →
              </button>
              <a href="#how" style={{ padding: '15px 32px', background: 'transparent', border: '1px solid #252525', color: '#999', borderRadius: 10, fontFamily: 'DM Mono', fontSize: 13, textDecoration: 'none', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#444'; e.currentTarget.style.color='#CCC' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#252525'; e.currentTarget.style.color='#999' }}>
                Hogyan működik?
              </a>
            </div>
          </FadeIn>
          {/* Stats row */}
          <FadeIn delay={0.3}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px 0', borderTop: '1px solid #161616', paddingTop: 32 }}>
              {STATS.map((s, i) => (
                <div key={i} style={{ paddingRight: 24 }}>
                  <div style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 900, color: '#00E5A0', marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#666', lineHeight: 1.4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* ── Right: animated SVG ── */}
        <FadeIn delay={0.15}>
          <div style={{
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid #0E2018',
            boxShadow: '0 0 0 1px #0A1A12, 0 32px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,229,160,0.04)',
            aspectRatio: '16/9',
            background: '#050E08',
          }}>
            {/* Corner accents */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTop: '1.5px solid #00E5A0', borderLeft: '1.5px solid #00E5A0', borderRadius: '4px 0 0 0', opacity: 0.6, zIndex: 2 }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTop: '1.5px solid #00E5A0', borderRight: '1.5px solid #00E5A0', borderRadius: '0 4px 0 0', opacity: 0.6, zIndex: 2 }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottom: '1.5px solid #00E5A0', borderLeft: '1.5px solid #00E5A0', borderRadius: '0 0 0 4px', opacity: 0.6, zIndex: 2 }} />
            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottom: '1.5px solid #00E5A0', borderRight: '1.5px solid #00E5A0', borderRadius: '0 0 4px 0', opacity: 0.6, zIndex: 2 }} />
            {/* File badge */}
            <div style={{ position: 'absolute', top: 12, left: 28, zIndex: 3, background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.18)', borderRadius: 5, padding: '3px 10px', fontFamily: 'DM Mono', fontSize: 10, color: '#00E5A0', letterSpacing: '0.1em' }}>
              alaprajz_1.dxf
            </div>
            <TakeoffAnimation />
          </div>
        </FadeIn>

      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
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

function NormTimeAnimation() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <style>{`
          .nt2-card    { fill: none; stroke: #1A3328; stroke-width: 1.5px; }
          .nt2-header  { font-family: 'DM Mono',monospace; font-size: 18px; fill: #4A8A6A; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; }
          .nt2-item    { font-family: 'DM Mono',monospace; font-size: 17px; fill: #9CA3AF; }
          .nt2-total   { font-family: 'DM Mono',monospace; font-size: 36px; fill: #00E5A0; font-weight: bold; }
          .nt2-conf    { font-family: 'DM Mono',monospace; font-size: 14px; fill: #00E5A0; font-weight: bold; }
          .nt2-prog-bg   { fill: none; stroke: #0D2018; stroke-width: 6px; stroke-linecap: round; }
          .nt2-prog-fill { fill: none; stroke: #00E5A0; stroke-width: 6px; stroke-linecap: round; stroke-dasharray: 200; stroke-dashoffset: 200; }
          .nt2-icon    { fill: none; stroke: #00E5A0; stroke-width: 2px; }
          @keyframes nt2Prog1 { 0% { stroke-dashoffset: 200; } 100% { stroke-dashoffset: 40; } }
          @keyframes nt2Prog2 { 0% { stroke-dashoffset: 200; } 100% { stroke-dashoffset: 90; } }
          @keyframes nt2Prog3 { 0% { stroke-dashoffset: 200; } 100% { stroke-dashoffset: 20; } }
          .nt2-anim1 { animation: nt2Prog1 3s ease-out forwards infinite; animation-delay: 0.5s; }
          .nt2-anim2 { animation: nt2Prog2 3s ease-out forwards infinite; animation-delay: 0.8s; }
          .nt2-anim3 { animation: nt2Prog3 3s ease-out forwards infinite; animation-delay: 1.1s; }
          @keyframes nt2Pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
          .nt2-pulse { animation: nt2Pulse 2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
          @keyframes nt2FadeA { 0%, 45% { opacity: 1; } 50%, 95% { opacity: 0; } }
          @keyframes nt2FadeB { 0%, 45% { opacity: 0; } 50%, 95% { opacity: 1; } }
          .nt2-ctx-a  { animation: nt2FadeA 5s infinite; }
          .nt2-ctx-b  { animation: nt2FadeB 5s infinite; }
          .nt2-ctx-a2 { animation: nt2FadeA 5s infinite; animation-delay: 0.5s; }
          .nt2-ctx-b2 { animation: nt2FadeB 5s infinite; animation-delay: 0.5s; }
        `}</style>
      </defs>

      {/* Subtle grid */}
      <pattern id="nt2Grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#00E5A0" strokeWidth="0.5" opacity="0.04"/>
      </pattern>
      <rect width="100%" height="100%" fill="url(#nt2Grid)" />

      <g transform="translate(300, 150)">
        {/* Card */}
        <rect width="600" height="500" rx="12"
          fill="#060E0A" stroke="#00E5A0" strokeWidth="1" strokeOpacity="0.2" />
        {/* Top accent strip */}
        <rect width="600" height="3" rx="1" fill="#00E5A0" opacity="0.6" />

        {/* Title */}
        <text className="nt2-header" x="30" y="50">NORM-IDŐ KALKULÁTOR</text>
        <line x1="30" y1="70" x2="570" y2="70" stroke="#00E5A0" strokeWidth="0.5" strokeOpacity="0.2" />

        {/* Row 1 */}
        <g transform="translate(30, 130)">
          <text className="nt2-item" y="5">EL-061 Dugalj beépítés</text>
          <line className="nt2-prog-bg"   x1="250" y1="0" x2="450" y2="0" />
          <line className="nt2-prog-fill nt2-anim1" x1="250" y1="0" x2="450" y2="0" />
          <text fontFamily="'DM Mono',monospace" fontSize="12" fill="#4A8A6A" x="460" y="4">0.45 h</text>
        </g>

        {/* Row 2 */}
        <g transform="translate(30, 200)">
          <text className="nt2-item" y="5">EL-062 Kapcsoló 1-pólusú</text>
          <line className="nt2-prog-bg"   x1="250" y1="0" x2="450" y2="0" />
          <line className="nt2-prog-fill nt2-anim2" x1="250" y1="0" x2="450" y2="0" />
          <text fontFamily="'DM Mono',monospace" fontSize="12" fill="#4A8A6A" x="460" y="4">0.25 h</text>
        </g>

        {/* Row 3 */}
        <g transform="translate(30, 270)">
          <text className="nt2-item" y="5">EL-070 LED Panel 60×60</text>
          <line className="nt2-prog-bg"   x1="250" y1="0" x2="450" y2="0" />
          <line className="nt2-prog-fill nt2-anim3" x1="250" y1="0" x2="450" y2="0" />
          <text fontFamily="'DM Mono',monospace" fontSize="12" fill="#4A8A6A" x="460" y="4">0.90 h</text>
        </g>

        {/* Context modifiers */}
        <g transform="translate(30, 350)">
          <text className="nt2-header" style={{ fontSize: '13px' }} y="0">KÖRNYEZETI MÓDOSÍTÓK</text>

          {/* Icon group 1: fal típus (tégla ↔ beton) */}
          <g transform="translate(0, 28)">
            {/* Brick */}
            <g className="nt2-ctx-a">
              <rect className="nt2-icon" x="0" y="0" width="30" height="30" />
              <line className="nt2-icon" x1="0"   y1="15" x2="30"  y2="15" />
              <line className="nt2-icon" x1="15"  y1="0"  x2="15"  y2="15" />
              <line className="nt2-icon" x1="7.5" y1="15" x2="7.5" y2="30" />
              <line className="nt2-icon" x1="22.5" y1="15" x2="22.5" y2="30" />
            </g>
            {/* Concrete */}
            <g className="nt2-ctx-b">
              <rect className="nt2-icon" x="0" y="0" width="30" height="30" />
              <circle className="nt2-icon" cx="10" cy="10" r="2"   fill="#00E5A0" fillOpacity="0.12" />
              <circle className="nt2-icon" cx="20" cy="20" r="3"   fill="#00E5A0" fillOpacity="0.12" />
              <circle className="nt2-icon" cx="22" cy="8"  r="1.5" fill="#00E5A0" fillOpacity="0.12" />
              <circle className="nt2-icon" cx="8"  cy="22" r="2"   fill="#00E5A0" fillOpacity="0.12" />
            </g>
            {/* Modifier value */}
            <text fontFamily="'DM Mono',monospace" fontSize="13" fill="#00E5A0" x="40" y="18">×1.3</text>
          </g>

          {/* Icon group 2: magasság */}
          <g transform="translate(110, 28)">
            {/* Normal height arrow */}
            <g className="nt2-ctx-b2">
              <line className="nt2-icon" x1="5"  y1="22" x2="5"  y2="4" />
              <line className="nt2-icon" x1="2"  y1="8"  x2="5"  y2="4" />
              <line className="nt2-icon" x1="8"  y1="8"  x2="5"  y2="4" />
              <line className="nt2-icon" x1="17" y1="22" x2="17" y2="4" />
              <line className="nt2-icon" x1="14" y1="8"  x2="17" y2="4" />
              <line className="nt2-icon" x1="20" y1="8"  x2="17" y2="4" />
              <line className="nt2-icon" x1="2"  y1="22" x2="22" y2="22" />
            </g>
            {/* Tall height arrow */}
            <g className="nt2-ctx-a2">
              <line className="nt2-icon" x1="5"  y1="30" x2="5"  y2="0" />
              <line className="nt2-icon" x1="2"  y1="6"  x2="5"  y2="0" />
              <line className="nt2-icon" x1="8"  y1="6"  x2="5"  y2="0" />
              <line className="nt2-icon" x1="17" y1="30" x2="17" y2="0" />
              <line className="nt2-icon" x1="14" y1="6"  x2="17" y2="0" />
              <line className="nt2-icon" x1="20" y1="6"  x2="17" y2="0" />
              <line className="nt2-icon" x1="2"  y1="30" x2="22" y2="30" />
            </g>
            <text fontFamily="'DM Mono',monospace" fontSize="13" fill="#00E5A0" x="32" y="18">×1.4</text>
          </g>
        </g>

        {/* Total + Confidence */}
        <g transform="translate(350, 400)">
          <text className="nt2-header" style={{ fontSize: '13px' }} x="220" y="-20" textAnchor="end">BECSÜLT ÖSSZES IDŐ</text>

          <text className="nt2-total" x="220" y="20" textAnchor="end" opacity="1">
            00.0 h
            <animate attributeName="opacity" values="1;0;0" keyTimes="0;0.3;1" dur="5s" repeatCount="indefinite" />
          </text>
          <text className="nt2-total" x="220" y="20" textAnchor="end" opacity="0">
            45.5 h
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.3;0.8;1" dur="5s" repeatCount="indefinite" />
          </text>

          <g transform="translate(180, 60)" className="nt2-pulse">
            <rect x="-44" y="-15" width="88" height="30" rx="15"
              fill="rgba(0,229,160,0.08)" stroke="#00E5A0" strokeWidth="1" strokeOpacity="0.35" />
            <circle cx="-30" cy="0" r="3" fill="#00E5A0">
              <animate attributeName="opacity" values="1;0.2;1" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <text className="nt2-conf" x="-16" y="4" textAnchor="start">
              92% CONF.
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.5;0.8;1" dur="5s" repeatCount="indefinite" />
            </text>
          </g>
        </g>
      </g>
    </svg>
  )
}

function NormTimeSection() {
  return (
    <section style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(0,229,160,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }} className="normtime-grid">

          {/* Left: explanation */}
          <FadeIn>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
              Normaidő Motor
            </div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(26px, 4vw, 42px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
              Nem becsül –<br />
              <span style={{ color: '#00E5A0' }}>pontosan számol</span>
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', lineHeight: 1.85, marginBottom: 32 }}>
              60+ normaidő-adat, tételenként. A motor figyelembe veszi a fal anyagát, a szerelési magasságot és a mennyiségi szorzókat – és P50/P90 becslést ad, nem egy sima átlagot.
            </p>

            {/* Feature bullets */}
            {[
              ['P50 / P90', 'Valószínűségi becslés, nem átlag – látod a kockázatot'],
              ['Kontextus módosítók', 'Tégla vs. beton, normál vs. emelt magasság'],
              ['60+ tétel', 'Magyar elektromos normák alapján előre feltöltve'],
              ['Saját normák', 'Pro csomagban szerkeszthető és bővíthető'],
            ].map(([title, desc], i) => (
              <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'flex-start' }}>
                <div style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: '#DDD', marginBottom: 3 }}>{title}</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#777', lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </FadeIn>

          {/* Right: animated SVG */}
          <FadeIn delay={0.15}>
            <div style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid #0E2018',
              boxShadow: '0 0 0 1px #0A1A12, 0 32px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,229,160,0.03)',
              aspectRatio: '3/2',
              background: '#050E08',
              position: 'relative',
            }}>
              {/* Corner accents */}
              {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h],i) => (
                <div key={i} style={{ position:'absolute', [v]:0, [h]:0, width:18, height:18,
                  [`border${v.charAt(0).toUpperCase()+v.slice(1)}`]: '1.5px solid #00E5A0',
                  [`border${h.charAt(0).toUpperCase()+h.slice(1)}`]: '1.5px solid #00E5A0',
                  borderRadius: i===0?'4px 0 0 0':i===1?'0 4px 0 0':i===2?'0 0 0 4px':'0 0 4px 0',
                  opacity:0.5, zIndex:2 }} />
              ))}
              <NormTimeAnimation />
            </div>
          </FadeIn>

        </div>
      </div>

      <style>{`
        @media (max-width: 900px) { .normtime-grid { grid-template-columns: 1fr !important; } }
      `}</style>
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
                  <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.7, marginBottom: 12 }}>{plan.desc}</p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.12)', borderRadius: 6, padding: '5px 10px', marginBottom: 20 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0' }}>{plan.trial}</span>
                  </div>
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
          <p style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 12, color: '#555', marginTop: 32 }}>
            Minden csomag tartalmaz 14 napos ingyenes próbát. Hitelkártya nem szükséges a regisztrációhoz. Éves előfizetéssel –20%.
          </p>
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
            Kezdd el ma,<br /><span style={{ color: '#00E5A0' }}>14 napig ingyen</span>
          </h2>
          <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', marginBottom: 40, lineHeight: 1.8 }}>
            Nincs regisztráció bonyolultsága, nincs elköteleződés.<br />Töltsd fel az első tervedet és lásd az eredményt.
          </p>
          <button onClick={onStart} style={{ padding: '18px 48px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 18, boxShadow: '0 0 60px rgba(0,229,160,0.3)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.target.style.transform='translateY(-3px) scale(1.02)'; e.target.style.boxShadow='0 0 80px rgba(0,229,160,0.5)' }}
            onMouseLeave={e => { e.target.style.transform='none'; e.target.style.boxShadow='0 0 60px rgba(0,229,160,0.3)' }}>
            14 napos próba indítása →
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
      <NormTimeSection />
      <HowSection />
      <AISection />
      <PricingSection onStart={onStart} />
      <FAQSection />
      <CTASection onStart={onStart} />
      <Footer />
    </div>
  )
}
