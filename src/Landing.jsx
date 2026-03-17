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

function FadeIn({ children, delay = 0, style = {}, className = '' }) {
  const [ref, visible] = useInView()
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ease ${delay}s, transform 0.65s ease ${delay}s`,
      ...style
    }}>
      {children}
    </div>
  )
}

function StaggerText({ text, delay = 0, style = {} }) {
  const [ref, visible] = useInView()
  const words = text.split(' ')
  return (
    <span ref={ref} style={{ display: 'inline', ...style }}>
      {words.map((word, i) => (
        <span key={i} style={{
          display: 'inline-block',
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(14px)',
          filter: visible ? 'blur(0)' : 'blur(3px)',
          transition: `all 0.5s cubic-bezier(.16,1,.3,1) ${delay + i * 0.06}s`,
          marginRight: '0.3em',
        }}>{word}</span>
      ))}
    </span>
  )
}

function AnimatedCounter({ value }) {
  const [ref, visible] = useInView()
  const [display, setDisplay] = useState(value)
  const numMatch = value.match(/^[\d]+/)
  useEffect(() => {
    if (!visible || !numMatch) { setDisplay(value); return }
    const target = parseInt(numMatch[0], 10)
    const suffix = value.slice(numMatch[0].length)
    const prefix = value.slice(0, value.indexOf(numMatch[0]))
    let start = 0
    const duration = 1200
    const t0 = performance.now()
    const step = (now) => {
      const progress = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(eased * target)
      setDisplay(prefix + current + suffix)
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [visible])
  return <span ref={ref}>{display}</span>
}

function TiltCard({ children, style = {} }) {
  const ref = useRef(null)
  const handleMove = (e) => {
    const rect = ref.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    ref.current.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) scale(1.02)`
    ref.current.style.background = `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(0,229,160,0.06), rgba(255,255,255,0.015) 60%)`
  }
  const handleLeave = () => {
    ref.current.style.transform = 'perspective(800px) rotateY(0) rotateX(0) scale(1)'
    ref.current.style.background = 'rgba(255,255,255,0.02)'
  }
  return (
    <div ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave}
      style={{ transition: 'transform 0.15s ease-out, background 0.3s', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '32px 28px', cursor: 'default', ...style }}>
      {children}
    </div>
  )
}

function GradientSeparator() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,229,160,0.08), transparent)' }} />
}

function FloatingDecor({ top, left, size = 6, delay = 0 }) {
  return (
    <div style={{
      position: 'absolute', top, left, width: size, height: size,
      borderRadius: '50%', border: '1px solid rgba(0,229,160,0.08)',
      animation: `float 6s ease-in-out infinite ${delay}s`,
      pointerEvents: 'none', zIndex: 0,
    }} />
  )
}

const SvgIcon = ({ path, size = 18, color = '#00E5A0', sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(path) ? path : [path]).map((d, i) => <path key={i} d={d} />)}
  </svg>
)

const FEATURES = [
  { icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2zM14 2v6h6M9 15l2 2 4-4', title: 'DXF & DWG Import', desc: 'DXF fájlok korlátlan méretben, DWG direkt bináris elemzéssel – nem kell konvertálni. Több emelet egyszerre, automatikus összesítéssel.' },
  { icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14l3 3 5-5', title: 'Automatikus Mennyiségkimutatás', desc: 'Dugaljak, kapcsolók, lámpák, kismegszakítók, kábeltálcák – automatikus felismerés és számlálás. Kábelnyomvonalak hossza méterben, rétegek szerint.' },
  { icon: ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12'], title: 'Intelligens Réteg & Blokk Felismerés', desc: 'Automatikus rétegazonosítás DXF/DWG fájlokban: DUGALJ, LAMPA, KAPCSOLO, KABEL rétegek névkonvenció alapján. Blokkok és vonalak gépi precizitással számlálva.' },
  { icon: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z', 'M14 2v6h6M9 13h6M9 17h4'], title: 'Profi PDF Árajánlat', desc: 'Tételes kalkuláció: anyagköltség + munkadíj + árrés, céglogóval és fejléccel. Egy kattintás – azonnal küldhető az ügyfélnek.' },
  { icon: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'], title: 'Assembly Szerkesztő', desc: 'Saját szerelvény-csomagok építése: pl. "2-pólusú kapcsoló + keret + doboz" egy tételként. Egyszer beállítod, mindig újrahasználod.' },
  { icon: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'], title: 'Szerkeszthető Normaidő-adatbázis', desc: '60+ előre feltöltött normaidő-adat villamos tételekre. Saját normáid, saját anyagáraid – az ajánlat mindig a valós céges adataidat tükrözi.' },
]

const STEPS = [
  { n: '01', title: 'Terv feltöltés',    desc: 'Húzd be a DXF, DWG vagy PDF villamos terveket. Több emelet egyszerre – az app automatikusan összesíti.' },
  { n: '02', title: 'Mennyiség ellenőrzés', desc: 'Az app megszámolja a szerelvényeket és kábelhosszakat. Átnézed, javítod ha kell – 5 perc, nem 3 óra.' },
  { n: '03', title: 'Normaidő kalkuláció', desc: 'Minden tételhez normaidő rendelve az adatbázisból. Tételenként állítható falanyag (GK / Ytong / Tégla / Beton), projekt szinten magasság és hozzáférhetőség – pontosan kalkulált munkadíj.' },
  { n: '04', title: 'Anyagárak és árrés',  desc: 'Saját anyagárlista, saját árrés százalék. Egységárak és összesítés automatikusan kalkulálva.' },
  { n: '05', title: 'PDF ajánlat letöltés', desc: 'Céglogós, tételes PDF egy kattintással. DXF feltöltéstől PDF-ig átlagosan 2 perc.' },
]

const STATS = [
  { value: '80%',      label: 'Kevesebb kalkulációs idő' },
  { value: '< 2 perc', label: 'DXF-től ajánlatig' },
  { value: '60+',      label: 'Normaidő-tétel az adatbázisban' },
  { value: 'DXF·DWG·PDF', label: 'Minden terv formátum támogatva' },
]

const FAQ = [
  { q: 'Milyen fájlformátumokat fogad el?', a: 'DXF natívan, korlátlan méretben. DWG direkt elemzéssel – nem kell konvertálni, az app kinyeri az adatokat a bináris fájlból is. A terv feltöltése után az alkalmazás automatikusan azonosítja a rétegeket és blokkokat. Minden esetben van review lépés, ahol ellenőrizheted az eredményt.' },
  { q: 'Mennyire pontos a mennyiségkimutatás?', a: 'DXF esetén 95%+ pontosság – a blokkok és vonalak gépi precizitással számolhatók. DWG esetén az adatok kinyerése a bináris formátumból közvetlen – a pontosság a terv struktúrájától függ. Minden esetben van review lépés, ahol javíthatsz mielőtt ajánlatot generálsz.' },
  { q: 'Kell AutoCAD a használathoz?', a: 'Nem. DXF-et a tervező exportál AutoCAD-ből, azt feltöltöd – kész. Ha csak DWG-d van, azt is feltöltheted közvetlenül. Az app böngészőben fut, nem kell semmit telepíteni.' },
  { q: 'Mi van a normaidő-adatbázisban?', a: '60+ villamos szerelési normaidő-tétel, magyar szabványok alapján: dugalj, kapcsoló, lámpa, kismegszakító, kábeltálca, kábel fektetés és több. A falanyag (GK / Ytong / Tégla / Beton) tételenként állítható be a Takeoff nézeten. Projekt szintű szorzók: hozzáférhetőség, magasság, projekt típus. Az adatbázis az app beállításaiban szerkeszthető és bővíthető.' },
  { q: 'Mennyit spórolok egy ajánlaton?', a: 'Egy átlagos közepes projekt ajánlata manuálisan 3-8 munkaóra. Az appban ugyanez 15-30 perc. Heti 2-3 ajánlatnál ez havi 20-50 munkaóra megtakarítás – vagyis a szoftver ára a megtakarítás töredéke.' },
  { q: 'Biztonságos a fájlfeltöltés?', a: 'A feltöltött terveket kizárólag az aktuális kalkulációhoz használjuk. A fájlok titkosított csatornán kerülnek feldolgozásra.' },
]

const PLAN = {
  name: 'TakeoffPro', price: 99000, color: '#00E5A0',
  desc: 'Minden funkció egy csomagban. Nincs alap- és pro verzió – az árajánlat pontosságához mindent egyszerre kell használni.',
  trial: '14 napos ingyenes próba',
  features: [
    'DXF import – korlátlan fájlméret',
    'DWG direkt bináris elemzés',
    'Automatikus réteg- és blokkfelismerés',
    'Mennyiségkimutatás (blokkok + kábelhosszak)',
    'Assembly szerkesztő – saját szerelvény-csomagok',
    'Szerkeszthető normaidő-adatbázis (60+ tétel)',
    'Saját anyagárlista és kedvezmény kezelés',
    'Tételes + normaidős PDF árajánlat generálás',
    'Céglogó, fejléc, ügyfélnév a PDF-ben',
    'Korlátlan ajánlat és projekt',
    'Email támogatás (1 munkanapon belül)',
  ],
  cta: '14 nap ingyen kipróbálom',
}

function NavBar({ onStart }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav className="nav-root" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid #181818' : 'none',
      transition: 'all 0.3s', padding: '16px 40px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, background: '#050E08', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0,229,160,0.25)', border: '1px solid rgba(0,229,160,0.2)', flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256" fill="none" aria-hidden="true">
            <defs>
              <clipPath id="nav-scan-clip">
                <rect x="0" y="256" width="256" height="256">
                  <animateTransform attributeName="transform" type="translate" from="0 0" to="0 -256" begin="0s" dur="3s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1" />
                </rect>
              </clipPath>
            </defs>
            <g stroke="#00E5A0" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
              <path d="M48 208H208V48H48V208Z" />
              <path d="M48 128H208" opacity="0.3"/>
              <path d="M128 208V48" opacity="0.3"/>
            </g>
            <g clipPath="url(#nav-scan-clip)" fill="#00E5A0" opacity="0.85">
              <rect x="58" y="58" width="60" height="60" rx="4"/>
              <rect x="138" y="58" width="60" height="60" rx="4"/>
              <rect x="58" y="138" width="60" height="60" rx="4"/>
              <rect x="138" y="138" width="60" height="60" rx="4"/>
            </g>
          </svg>
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', color: '#F0F0F0' }}>Takeoff<span style={{ color: '#00E5A0' }}>Pro</span></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-links">
        {[['Funkciók','#features'],['Hogyan működik','#how'],['Árazás','#pricing'],['GYIK','#faq']].map(([l,h]) => (
          <a key={h} href={h} style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color='#CCC'} onMouseLeave={e => e.target.style.color='#888'}>{l}</a>
        ))}
      </div>
      <button className="nav-cta" onClick={onStart} style={{ padding: '10px 22px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 14, boxShadow: '0 0 20px rgba(0,229,160,0.25)', transition: 'all 0.2s' }}
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

function BlueprintBackground() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <style>{`
          .bp-bg-wall   { fill: none; stroke: #1E4030; stroke-width: 3px; }
          .bp-bg-sym    { fill: none; stroke: #1E4030; stroke-width: 2px; }
          .bp-bg-active { fill: none; stroke: #00E5A0; stroke-width: 3px; opacity: 0; }
          .bp-bg-beam   { fill: url(#bpBgScanGrad); }
          @keyframes bpBgScan {
            0%   { transform: translateX(-100px); }
            100% { transform: translateX(1700px); }
          }
          .bp-bg-scan-anim { animation: bpBgScan 10s linear infinite; }
        `}</style>
        <linearGradient id="bpBgScanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00E5A0" stopOpacity="0" />
          <stop offset="35%"  stopColor="#00E5A0" stopOpacity="0.12" />
          <stop offset="50%"  stopColor="#00E5A0" stopOpacity="0.5" />
          <stop offset="65%"  stopColor="#00E5A0" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#00E5A0" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bpBgSymGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#00E5A0" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00E5A0" stopOpacity="0" />
        </radialGradient>
      </defs>

      <pattern id="bpBgGrid" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#00E5A0" strokeWidth="0.5" opacity="0.04"/>
      </pattern>
      <rect width="100%" height="100%" fill="url(#bpBgGrid)" />

      <g transform="translate(100, 100)">
        <path className="bp-bg-wall" d="M50,50 L50,600 L400,600 L400,400 L800,400 L800,50 L50,50 Z" />
        <path className="bp-bg-wall" d="M400,600 L800,600 L800,400" />
        <line className="bp-bg-wall" x1="400" y1="50" x2="400" y2="400" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="200" y1="50" x2="200" y2="600" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="50"  y1="300" x2="400" y2="300" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="600" y1="50"  x2="600" y2="400" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="400" y1="500" x2="800" y2="500" />
        <path stroke="#1A3828" strokeWidth="1.5" fill="none" d="M50,300 Q80,270 110,300" />
        <path stroke="#1A3828" strokeWidth="1.5" fill="none" d="M400,400 Q430,370 460,400" />

        {[[150,550,'1s'],[250,550,'1.2s'],[600,200,'2.5s']].map(([cx,cy,begin],i) => (
          <g key={i} transform={`translate(${cx}, ${cy})`}>
            <circle className="bp-bg-sym" r="10" />
            <path className="bp-bg-sym" d="M-7,-7 L7,7 M-7,7 L7,-7" />
            <circle className="bp-bg-active" r="20">
              <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="10s" begin={begin} repeatCount="indefinite" />
            </circle>
            <circle r="28" fill="url(#bpBgSymGlow)" opacity="0">
              <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="10s" begin={begin} repeatCount="indefinite" />
            </circle>
          </g>
        ))}

        {[[350,400,'1.8s'],[750,400,'3s']].map(([cx,cy,begin],i) => (
          <g key={i} transform={`translate(${cx}, ${cy})`}>
            <circle className="bp-bg-sym" r="12" />
            <circle className="bp-bg-active" r="20">
              <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="10s" begin={begin} repeatCount="indefinite" />
            </circle>
            <circle r="28" fill="url(#bpBgSymGlow)" opacity="0">
              <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="10s" begin={begin} repeatCount="indefinite" />
            </circle>
          </g>
        ))}

        {[[225,225,'1.5s'],[600,500,'2.8s']].map(([cx,cy,begin],i) => (
          <g key={i} transform={`translate(${cx}, ${cy})`}>
            <circle className="bp-bg-sym" r="15" />
            <path className="bp-bg-sym" d="M-15,0 L15,0 M0,-15 L0,15" />
            <circle className="bp-bg-active" r="25">
              <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;0.2;0.4;1" dur="10s" begin={begin} repeatCount="indefinite" />
            </circle>
            <circle r="34" fill="url(#bpBgSymGlow)" opacity="0">
              <animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;0.5" dur="10s" begin={begin} repeatCount="indefinite" />
            </circle>
          </g>
        ))}

        <rect className="bp-bg-beam bp-bg-scan-anim" x="-20" y="0" width="40" height="700" />
        <line className="bp-bg-scan-anim" x1="20" y1="0" x2="20" y2="700"
          stroke="#00E5A0" strokeWidth="1.5" opacity="0.9" />
      </g>
    </svg>
  )
}

// ─── Hero unified 3-trade animation ──────────────────────────────────────────

function HeroAnimation() {
  const ec = '#00E5A0'
  const fc = '#FF6B6B'
  const lc = '#4CC9F0'
  const st = 'rgba(200,255,240,0.13)'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520"
      preserveAspectRatio="xMidYMid meet" fill="none"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <style>{`
          @keyframes ha-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
          @keyframes ha-scan  { 0%{transform:translateX(-100px);opacity:0} 10%,90%{opacity:1} 100%{transform:translateX(900px);opacity:0} }
          @keyframes ha-pec   { 0%,100%{opacity:.22} 50%{opacity:1;filter:drop-shadow(0 0 5px ${ec})} }
          @keyframes ha-pfc   { 0%,100%{opacity:.22} 50%{opacity:1;filter:drop-shadow(0 0 5px ${fc})} }
          @keyframes ha-plc   { 0%,100%{opacity:.22} 50%{opacity:1;filter:drop-shadow(0 0 5px ${lc})} }
          @keyframes ha-cnt   { 0%,10%{opacity:0;transform:translateY(4px)} 20%,100%{opacity:1;transform:translateY(0)} }
          @keyframes ha-chk   { 0%,80%{opacity:0;transform:scale(.5)} 90%{opacity:1;transform:scale(1.15)} 100%{opacity:1;transform:scale(1)} }
          .ha-fp  { animation:ha-float 6s ease-in-out infinite }
          .ha-sec { animation:ha-scan 8s linear infinite }
          .ha-sfc { animation:ha-scan 8s linear infinite 2.6s; opacity:0 }
          .ha-slc { animation:ha-scan 8s linear infinite 5.3s; opacity:0 }
          .ha-iec { animation:ha-pec 8s ease-in-out infinite; opacity:.22 }
          .ha-ifc { animation:ha-pfc 8s ease-in-out infinite 2.6s; opacity:.22 }
          .ha-ilc { animation:ha-plc 8s ease-in-out infinite 5.3s; opacity:.22 }
          .ha-nec { animation:ha-cnt 8s ease-out infinite; opacity:0 }
          .ha-nfc { animation:ha-cnt 8s ease-out infinite 2.6s; opacity:0 }
          .ha-nlc { animation:ha-cnt 8s ease-out infinite 5.3s; opacity:0 }
          .ha-cec { stroke:${ec}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; animation:ha-chk 8s infinite }
          .ha-cfc { stroke:${fc}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; animation:ha-chk 8s infinite 2.6s }
          .ha-clc { stroke:${lc}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; animation:ha-chk 8s infinite 5.3s }
        `}</style>
        <linearGradient id="ha-ge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={ec} stopOpacity="0"/><stop offset="100%" stopColor={ec} stopOpacity="0.32"/>
        </linearGradient>
        <linearGradient id="ha-gf" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fc} stopOpacity="0"/><stop offset="100%" stopColor={fc} stopOpacity="0.32"/>
        </linearGradient>
        <linearGradient id="ha-gl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={lc} stopOpacity="0"/><stop offset="100%" stopColor={lc} stopOpacity="0.32"/>
        </linearGradient>
        <pattern id="ha-pg" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" stroke="rgba(0,255,170,0.04)" strokeWidth="1" fill="none"/>
        </pattern>
      </defs>

      <rect width="1200" height="520" fill="url(#ha-pg)"/>

      {/* ── Alaprajz ── */}
      <g transform="translate(72,58)">
        <g className="ha-fp">
          <path d="M50,50 h700 v300 h-700 Z M300,50 v300 M550,50 v120 M550,230 v120 M50,180 h250"
            stroke={st} strokeWidth="1.5" fill="none"/>
          <path d="M120,50 v-10 M220,50 v-10 M600,350 v10 M700,350 v10"
            stroke="rgba(200,255,240,0.07)" strokeWidth="1.5" fill="none"/>
        </g>
        {/* erősáram szimbólumok */}
        <circle cx="100" cy="80"  r="4" className="ha-iec" fill={ec}/>
        <circle cx="100" cy="120" r="4" className="ha-iec" fill={ec}/>
        <circle cx="280" cy="80"  r="4" className="ha-iec" fill={ec}/>
        <circle cx="280" cy="320" r="4" className="ha-iec" fill={ec}/>
        <rect x="400" y="100" width="8" height="8" className="ha-iec" fill={ec}/>
        <rect x="400" y="200" width="8" height="8" className="ha-iec" fill={ec}/>
        {/* tűzjelző szimbólumok */}
        <circle cx="450" cy="150" r="6" className="ha-ifc" fill="none" stroke={fc} strokeWidth="2"/>
        <circle cx="150" cy="250" r="6" className="ha-ifc" fill="none" stroke={fc} strokeWidth="2"/>
        <rect x="720" y="120" width="12" height="12" className="ha-ifc" fill={fc}/>
        <path d="M350,300 l10,-10 h-20 z" className="ha-ifc" fill={fc}/>
        {/* gyengeáram szimbólumok */}
        <rect x="500" y="300" width="6"  height="6" className="ha-ilc" fill={lc}/>
        <circle cx="200" cy="100" r="3"  className="ha-ilc" fill={lc}/>
        <rect x="680" y="280" width="10" height="4" className="ha-ilc" fill={lc}/>
        {/* szkenner – erősáram */}
        <g className="ha-sec">
          <rect x="0" y="20" width="60" height="360" fill="url(#ha-ge)" stroke="none"/>
          <line x1="60" y1="20" x2="60" y2="380" stroke={ec} strokeWidth="2" fill="none"/>
        </g>
        {/* szkenner – tűzjelző */}
        <g className="ha-sfc">
          <rect x="0" y="20" width="60" height="360" fill="url(#ha-gf)" stroke="none"/>
          <line x1="60" y1="20" x2="60" y2="380" stroke={fc} strokeWidth="2" fill="none"/>
        </g>
        {/* szkenner – gyengeáram */}
        <g className="ha-slc">
          <rect x="0" y="20" width="60" height="360" fill="url(#ha-gl)" stroke="none"/>
          <line x1="60" y1="20" x2="60" y2="380" stroke={lc} strokeWidth="2" fill="none"/>
        </g>
      </g>

      {/* ── HUD panel ── */}
      <g transform="translate(878,50)">
        <rect width="292" height="426" rx="10" fill="rgba(5,12,8,0.94)"
          stroke={st} strokeWidth="1"/>
        <rect width="292" height="2" rx="1" fill={ec} opacity="0.55"/>
        <text x="20" y="38" fontFamily="'DM Mono',monospace" fontSize="12" fontWeight="bold"
          fill="#B8D0C4" letterSpacing="2">MENNYISÉGKIMUTATÁS</text>
        <line x1="20" y1="52" x2="272" y2="52" stroke={st} strokeWidth="0.5"/>

        {/* erősáram */}
        <g transform="translate(20,66)">
          <circle cx="4" cy="4" r="4" fill={ec}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite"/>
          </circle>
          <text x="15" y="9" fontFamily="'DM Mono',monospace" fontSize="10" fill={ec} letterSpacing="2">ERŐSÁRAM</text>
          <text x="0"   y="30" fontFamily="'DM Mono',monospace" fontSize="12" fill="#3E5E4C">DUGALJ</text>
          <text x="252" y="30" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="14" fill="#D4EDE4" className="ha-nec">12</text>
          <text x="0"   y="50" fontFamily="'DM Mono',monospace" fontSize="12" fill="#3E5E4C">LÁMPA</text>
          <text x="252" y="50" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="14" fill="#D4EDE4" className="ha-nec">18</text>
          <path d="M234,0 l4,4 l8,-8" className="ha-cec" fill="none"/>
        </g>
        <line x1="20" y1="138" x2="272" y2="138" stroke="rgba(200,255,240,0.05)" strokeWidth="0.5"/>

        {/* tűzjelző */}
        <g transform="translate(20,152)">
          <circle cx="4" cy="4" r="4" fill={fc}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin="2.6s" repeatCount="indefinite"/>
          </circle>
          <text x="15" y="9" fontFamily="'DM Mono',monospace" fontSize="10" fill={fc} letterSpacing="2">TŰZJELZŐ</text>
          <text x="0"   y="30" fontFamily="'DM Mono',monospace" fontSize="12" fill="#3E5E4C">ÉRZÉKELŐ</text>
          <text x="252" y="30" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="14" fill="#D4EDE4" className="ha-nfc">05</text>
          <text x="0"   y="50" fontFamily="'DM Mono',monospace" fontSize="12" fill="#3E5E4C">SZIRÉNA</text>
          <text x="252" y="50" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="14" fill="#D4EDE4" className="ha-nfc">02</text>
          <path d="M234,0 l4,4 l8,-8" className="ha-cfc" fill="none"/>
        </g>
        <line x1="20" y1="224" x2="272" y2="224" stroke="rgba(200,255,240,0.05)" strokeWidth="0.5"/>

        {/* gyengeáram */}
        <g transform="translate(20,238)">
          <circle cx="4" cy="4" r="4" fill={lc}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin="5.3s" repeatCount="indefinite"/>
          </circle>
          <text x="15" y="9" fontFamily="'DM Mono',monospace" fontSize="10" fill={lc} letterSpacing="2">GYENGEÁRAM</text>
          <text x="0"   y="30" fontFamily="'DM Mono',monospace" fontSize="12" fill="#3E5E4C">ADATPONT</text>
          <text x="252" y="30" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="14" fill="#D4EDE4" className="ha-nlc">06</text>
          <text x="0"   y="50" fontFamily="'DM Mono',monospace" fontSize="12" fill="#3E5E4C">KAMERA</text>
          <text x="252" y="50" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="14" fill="#D4EDE4" className="ha-nlc">03</text>
          <path d="M234,0 l4,4 l8,-8" className="ha-clc" fill="none"/>
        </g>
        <line x1="20" y1="310" x2="272" y2="310" stroke="rgba(200,255,240,0.05)" strokeWidth="0.5"/>

        {/* progress sáv */}
        <rect x="20" y="328" width="252" height="3" rx="2" fill="rgba(255,255,255,0.05)"/>
        <rect x="20" y="328" width="0"   height="3" rx="2" fill={ec}>
          <animate attributeName="width" values="0;252;0" dur="8s" repeatCount="indefinite"/>
          <animate attributeName="fill" values={`${ec};${fc};${lc};${ec}`} dur="8s" repeatCount="indefinite"/>
        </rect>

        {/* összesítő */}
        <text x="20"  y="362" fontFamily="'DM Mono',monospace" fontSize="10" fill="#1E3828" letterSpacing="2">ÖSSZES TÉTEL</text>
        <text x="272" y="410" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="34"
          fill={ec} style={{ filter: `drop-shadow(0 0 10px ${ec}55)` }}>
          46
          <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.55;0.7" dur="8s" repeatCount="indefinite"/>
        </text>
      </g>

      {/* összekötő szaggatott */}
      <line x1="854" y1="262" x2="878" y2="262"
        stroke={ec} strokeWidth="1" strokeDasharray="4,3" opacity="0.1"/>
    </svg>
  )
}

// ── Mobile hero animation – floor plan top, HUD panel below ─────────────────
function HeroAnimationMobile() {
  const ec = '#00E5A0'
  const fc = '#FF6B6B'
  const lc = '#4CC9F0'
  const st = 'rgba(200,255,240,0.13)'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 660"
      preserveAspectRatio="xMidYMid meet" fill="none"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <style>{`
          @keyframes hm-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
          @keyframes hm-scan  { 0%{transform:translateX(-60px);opacity:0} 10%,90%{opacity:1} 100%{transform:translateX(560px);opacity:0} }
          @keyframes hm-pec   { 0%,100%{opacity:.22} 50%{opacity:1;filter:drop-shadow(0 0 4px ${ec})} }
          @keyframes hm-pfc   { 0%,100%{opacity:.22} 50%{opacity:1;filter:drop-shadow(0 0 4px ${fc})} }
          @keyframes hm-plc   { 0%,100%{opacity:.22} 50%{opacity:1;filter:drop-shadow(0 0 4px ${lc})} }
          @keyframes hm-cnt   { 0%,10%{opacity:0;transform:translateY(3px)} 20%,100%{opacity:1;transform:translateY(0)} }
          @keyframes hm-chk   { 0%,80%{opacity:0;transform:scale(.5)} 90%{opacity:1;transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
          .hm-fp  { animation:hm-float 6s ease-in-out infinite }
          .hm-sec { animation:hm-scan 8s linear infinite }
          .hm-sfc { animation:hm-scan 8s linear infinite 2.6s; opacity:0 }
          .hm-slc { animation:hm-scan 8s linear infinite 5.3s; opacity:0 }
          .hm-iec { animation:hm-pec 8s ease-in-out infinite; opacity:.22 }
          .hm-ifc { animation:hm-pfc 8s ease-in-out infinite 2.6s; opacity:.22 }
          .hm-ilc { animation:hm-plc 8s ease-in-out infinite 5.3s; opacity:.22 }
          .hm-nec { animation:hm-cnt 8s ease-out infinite; opacity:0 }
          .hm-nfc { animation:hm-cnt 8s ease-out infinite 2.6s; opacity:0 }
          .hm-nlc { animation:hm-cnt 8s ease-out infinite 5.3s; opacity:0 }
          .hm-cec { stroke:${ec}; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; animation:hm-chk 8s infinite }
          .hm-cfc { stroke:${fc}; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; animation:hm-chk 8s infinite 2.6s }
          .hm-clc { stroke:${lc}; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; animation:hm-chk 8s infinite 5.3s }
        `}</style>
        <linearGradient id="hm-ge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={ec} stopOpacity="0"/><stop offset="100%" stopColor={ec} stopOpacity="0.32"/>
        </linearGradient>
        <linearGradient id="hm-gf" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fc} stopOpacity="0"/><stop offset="100%" stopColor={fc} stopOpacity="0.32"/>
        </linearGradient>
        <linearGradient id="hm-gl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={lc} stopOpacity="0"/><stop offset="100%" stopColor={lc} stopOpacity="0.32"/>
        </linearGradient>
        <pattern id="hm-pg" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" stroke="rgba(0,255,170,0.04)" strokeWidth="1" fill="none"/>
        </pattern>
      </defs>

      <rect width="520" height="660" fill="url(#hm-pg)"/>

      {/* ── Alaprajz (top) ── */}
      <g transform="translate(30,24)">
        <g className="hm-fp">
          <path d="M0,0 h460 v256 h-460 Z M220,0 v256 M360,0 v100 M360,156 v100 M0,128 h220"
            stroke={st} strokeWidth="1.5" fill="none"/>
          <path d="M80,0 v-8 M160,0 v-8 M380,256 v8 M420,256 v8"
            stroke="rgba(200,255,240,0.07)" strokeWidth="1.5" fill="none"/>
        </g>
        {/* erősáram szimbólumok */}
        <circle cx="70"  cy="50"  r="4" className="hm-iec" fill={ec}/>
        <circle cx="70"  cy="90"  r="4" className="hm-iec" fill={ec}/>
        <circle cx="180" cy="50"  r="4" className="hm-iec" fill={ec}/>
        <rect   x="270"  y="70"  width="8" height="8" className="hm-iec" fill={ec}/>
        <rect   x="270"  y="160" width="8" height="8" className="hm-iec" fill={ec}/>
        {/* tűzjelző szimbólumok */}
        <circle cx="310" cy="100" r="6" className="hm-ifc" fill="none" stroke={fc} strokeWidth="1.8"/>
        <circle cx="110" cy="190" r="6" className="hm-ifc" fill="none" stroke={fc} strokeWidth="1.8"/>
        <rect   x="390"  y="60"  width="12" height="12" className="hm-ifc" fill={fc}/>
        <path   d="M240,220 l8,-8 h-16 z" className="hm-ifc" fill={fc}/>
        {/* gyengeáram szimbólumok */}
        <rect   x="380"  y="200" width="6" height="6" className="hm-ilc" fill={lc}/>
        <circle cx="140" cy="70"  r="3"  className="hm-ilc" fill={lc}/>
        <rect   x="420"  y="180" width="10" height="4" className="hm-ilc" fill={lc}/>
        {/* szkenner – erősáram */}
        <g className="hm-sec">
          <rect x="0" y="0" width="55" height="280" fill="url(#hm-ge)" stroke="none"/>
          <line x1="55" y1="0" x2="55" y2="280" stroke={ec} strokeWidth="1.8" fill="none"/>
        </g>
        {/* szkenner – tűzjelző */}
        <g className="hm-sfc">
          <rect x="0" y="0" width="55" height="280" fill="url(#hm-gf)" stroke="none"/>
          <line x1="55" y1="0" x2="55" y2="280" stroke={fc} strokeWidth="1.8" fill="none"/>
        </g>
        {/* szkenner – gyengeáram */}
        <g className="hm-slc">
          <rect x="0" y="0" width="55" height="280" fill="url(#hm-gl)" stroke="none"/>
          <line x1="55" y1="0" x2="55" y2="280" stroke={lc} strokeWidth="1.8" fill="none"/>
        </g>
      </g>

      {/* összekötő szaggatott */}
      <line x1="260" y1="300" x2="260" y2="318" stroke={ec} strokeWidth="1" strokeDasharray="4,3" opacity="0.12"/>

      {/* ── HUD panel (bottom) – 3 trade columns ── */}
      <g transform="translate(30,328)">
        <rect width="460" height="308" rx="10" fill="rgba(5,12,8,0.95)" stroke={st} strokeWidth="1"/>
        <rect width="460" height="2" rx="1" fill={ec} opacity="0.55"/>
        <text x="20" y="30" fontFamily="'DM Mono',monospace" fontSize="11" fontWeight="bold" fill="#B8D0C4" letterSpacing="2">MENNYISÉGKIMUTATÁS</text>
        <line x1="20" y1="44" x2="440" y2="44" stroke={st} strokeWidth="0.5"/>

        {/* ─── erősáram col ─── */}
        <g transform="translate(20,58)">
          <circle cx="4" cy="4" r="4" fill={ec}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite"/>
          </circle>
          <text x="14" y="9" fontFamily="'DM Mono',monospace" fontSize="9" fill={ec} letterSpacing="1.5">ERŐSÁRAM</text>
          <text x="0"   y="32" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3E5E4C">DUGALJ</text>
          <text x="126" y="32" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="13" fill="#D4EDE4" className="hm-nec">12</text>
          <text x="0"   y="52" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3E5E4C">LÁMPA</text>
          <text x="126" y="52" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="13" fill="#D4EDE4" className="hm-nec">18</text>
          <path d="M108,0 l4,4 l8,-8" className="hm-cec" fill="none"/>
        </g>

        {/* ─── tűzjelző col ─── */}
        <g transform="translate(170,58)">
          <circle cx="4" cy="4" r="4" fill={fc}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin="2.6s" repeatCount="indefinite"/>
          </circle>
          <text x="14" y="9" fontFamily="'DM Mono',monospace" fontSize="9" fill={fc} letterSpacing="1.5">TŰZJELZŐ</text>
          <text x="0"   y="32" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3E5E4C">ÉRZÉKELŐ</text>
          <text x="126" y="32" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="13" fill="#D4EDE4" className="hm-nfc">05</text>
          <text x="0"   y="52" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3E5E4C">SZIRÉNA</text>
          <text x="126" y="52" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="13" fill="#D4EDE4" className="hm-nfc">02</text>
          <path d="M108,0 l4,4 l8,-8" className="hm-cfc" fill="none"/>
        </g>

        {/* ─── gyengeáram col ─── */}
        <g transform="translate(320,58)">
          <circle cx="4" cy="4" r="4" fill={lc}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" begin="5.3s" repeatCount="indefinite"/>
          </circle>
          <text x="14" y="9" fontFamily="'DM Mono',monospace" fontSize="9" fill={lc} letterSpacing="1.5">GYENGEÁRAM</text>
          <text x="0"   y="32" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3E5E4C">ADATPONT</text>
          <text x="126" y="32" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="13" fill="#D4EDE4" className="hm-nlc">06</text>
          <text x="0"   y="52" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3E5E4C">KAMERA</text>
          <text x="126" y="52" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="13" fill="#D4EDE4" className="hm-nlc">03</text>
          <path d="M108,0 l4,4 l8,-8" className="hm-clc" fill="none"/>
        </g>

        {/* divider */}
        <line x1="20" y1="130" x2="440" y2="130" stroke="rgba(200,255,240,0.05)" strokeWidth="0.5"/>

        {/* progress bar */}
        <rect x="20" y="148" width="420" height="3" rx="2" fill="rgba(255,255,255,0.05)"/>
        <rect x="20" y="148" width="0"   height="3" rx="2" fill={ec}>
          <animate attributeName="width" values="0;420;0" dur="8s" repeatCount="indefinite"/>
          <animate attributeName="fill" values={`${ec};${fc};${lc};${ec}`} dur="8s" repeatCount="indefinite"/>
        </rect>

        {/* összesítő */}
        <text x="20"  y="185" fontFamily="'DM Mono',monospace" fontSize="10" fill="#1E3828" letterSpacing="2">ÖSSZES TÉTEL</text>
        <text x="440" y="280" textAnchor="end" fontFamily="'DM Mono',monospace" fontSize="52"
          fill={ec} style={{ filter: `drop-shadow(0 0 10px ${ec}55)` }}>
          46
          <animate attributeName="opacity" values="0;0;1" keyTimes="0;0.55;0.7" dur="8s" repeatCount="indefinite"/>
        </text>
      </g>
    </svg>
  )
}

function HeroSection({ onStart }) {
  return (
    <section className="hero-section" style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Blueprint background — full viewport */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.2, zIndex: 0 }}>
        <BlueprintBackground />
      </div>

      {/* Gradient overlay for text readability */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(180deg, rgba(10,10,10,0.6) 0%, rgba(10,10,10,0.85) 50%, rgba(10,10,10,0.95) 100%)' }} />

      {/* Floating decorative elements */}
      <FloatingDecor top="15%" left="8%" size={8} delay={0} />
      <FloatingDecor top="25%" left="85%" size={5} delay={1.5} />
      <FloatingDecor top="60%" left="12%" size={6} delay={3} />
      <FloatingDecor top="45%" left="90%" size={7} delay={2} />

      {/* Hero content */}
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 48px 140px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', textAlign: 'center' }}>

          <h1 style={{ fontFamily: 'Syne', fontWeight: 900, lineHeight: 1.05, fontSize: 'clamp(28px, 4vw, 52px)', color: '#F0F0F0', marginBottom: 16, letterSpacing: '-0.03em' }}>
            <StaggerText text="DXF-ből profi árajánlat" style={{ display: 'block' }} />
            <span style={{ display: 'block', color: '#00E5A0', animation: 'glowPulse 3s ease-in-out infinite' }}>
              <StaggerText text="2 perc alatt" delay={0.36} />
            </span>
          </h1>

          <FadeIn delay={0.5}>
            <p style={{ fontFamily: 'DM Mono', fontSize: 'clamp(12px, 1.3vw, 15px)', color: '#999', lineHeight: 1.75, maxWidth: 520, margin: '0 auto 28px' }}>
              Töltsd fel a villamossági tervet, az alkalmazás automatikusan megszámolja a szerelvényeket, és generál egy profi PDF ajánlatot.
            </p>
          </FadeIn>

          <FadeIn delay={0.6}>
            <div className="hero-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 28 }}>
              <button onClick={onStart} className="hero-main-cta" style={{
                position: 'relative', padding: '18px 40px',
                background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 10,
                cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 16,
                boxShadow: '0 0 30px rgba(0,229,160,0.35), 0 4px 20px rgba(0,0,0,0.3)',
                animation: 'ctaGlow 3s ease-in-out infinite', transition: 'transform 0.2s',
              }}
                onMouseEnter={e => e.target.style.transform = 'translateY(-2px) scale(1.03)'}
                onMouseLeave={e => e.target.style.transform = 'none'}>
                Próbáld ki 14 napig →
              </button>
              <a href="#how" style={{ padding: '18px 28px', background: 'transparent', border: '1px solid #252525', color: '#999', borderRadius: 10, fontFamily: 'DM Mono', fontSize: 14, textDecoration: 'none', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#CCC' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#252525'; e.currentTarget.style.color = '#999' }}>
                Hogyan működik?
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.7}>
            <div className="hero-frame" style={{
              position: 'relative', borderRadius: 16, overflow: 'hidden',
              border: '1px solid rgba(0,229,160,0.1)',
              boxShadow: '0 0 0 1px #090909, 0 40px 100px rgba(0,0,0,0.7), 0 0 60px rgba(0,229,160,0.04)',
              background: '#040A06',
              width: 'min(780px, calc((100vh - 354px) * 16 / 9))',
              maxWidth: '100%', margin: '0 auto',
            }}>
              {[
                { top: 0, left: 0, borderTop: '1.5px solid #00E5A0', borderLeft: '1.5px solid #00E5A0', borderRadius: '4px 0 0 0' },
                { top: 0, right: 0, borderTop: '1.5px solid #00E5A0', borderRight: '1.5px solid #00E5A0', borderRadius: '0 4px 0 0' },
                { bottom: 0, left: 0, borderBottom: '1.5px solid #00E5A0', borderLeft: '1.5px solid #00E5A0', borderRadius: '0 0 0 4px' },
                { bottom: 0, right: 0, borderBottom: '1.5px solid #00E5A0', borderRight: '1.5px solid #00E5A0', borderRadius: '0 0 4px 0' },
              ].map((s, i) => <div key={i} style={{ position: 'absolute', width: 18, height: 18, opacity: 0.45, zIndex: 2, ...s }} />)}
              <div className="ha-desktop"><HeroAnimation /></div>
              <div className="ha-mobile"><HeroAnimationMobile /></div>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Stats counter bar at hero bottom */}
      <div className="hero-stats-bar" style={{
        position: 'relative', zIndex: 2,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        borderTop: '1px solid rgba(0,229,160,0.08)',
        background: 'rgba(10,10,10,0.6)',
        backdropFilter: 'blur(16px)',
      }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            padding: '28px 0', textAlign: 'center',
            borderRight: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <div style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontFamily: 'Syne', fontWeight: 800, color: '#00E5A0', letterSpacing: '-0.03em' }}>
              <AnimatedCounter value={s.value} />
            </div>
            <div style={{ fontSize: 'clamp(10px, 1vw, 12px)', color: 'rgba(255,255,255,0.35)', marginTop: 6, letterSpacing: '0.06em', fontFamily: 'DM Mono' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Trade Support Section ─────────────────────────────────────────────────────

function GyengeAramSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <style>{`
        .ga-grid-line { stroke: rgba(255,255,255,0.05); stroke-width: 1; }
        .ga-cable-path { stroke: rgba(255,255,255,0.12); stroke-width: 1.5; fill: none; stroke-dasharray: 4 4; }
        .ga-endpoint-node { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 2; }
        .ga-data-packet { fill: #4CC9F0; filter: url(#ga-glow); }
        .ga-endpoint-label { fill: #93C5FD; font-family: 'Segoe UI', Roboto, monospace; font-size: 12px; font-weight: 600; opacity: 0; letter-spacing: 1px; }
        .ga-status-led { fill: #4CC9F0; animation: ga-blink 1.5s step-end infinite; }
        @keyframes ga-blink { 50% { opacity: 0.3; } }
        .ga-label-1 { animation: ga-lf1 3.5s cubic-bezier(0.4,0,0.2,1) infinite; }
        .ga-label-2 { animation: ga-lf2 3.5s cubic-bezier(0.4,0,0.2,1) infinite; }
        .ga-label-3 { animation: ga-lf3 3.5s cubic-bezier(0.4,0,0.2,1) infinite; }
        @keyframes ga-lf1 { 0%,85%{opacity:0} 90%,95%{opacity:1} 100%{opacity:0} }
        @keyframes ga-lf2 { 0%,85%{opacity:0} 90%,95%{opacity:1} 100%{opacity:0} }
        @keyframes ga-lf3 { 0%,85%{opacity:0} 90%,95%{opacity:1} 100%{opacity:0} }
        @media (prefers-reduced-motion: reduce) {
          .ga-endpoint-label { animation: none; opacity: 0.7; }
        }
      `}</style>
      <defs>
        <filter id="ga-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <pattern id="ga-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="1200" height="700" fill="url(#ga-grid)" />
      {/* Rack */}
      <g transform="translate(100, 300)">
        <rect x="0" y="0" width="80" height="120" rx="4" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <rect x="10" y="20" width="60" height="4" rx="2" fill="rgba(255,255,255,0.12)" />
        <rect x="10" y="40" width="60" height="4" rx="2" fill="rgba(255,255,255,0.12)" />
        <rect x="10" y="60" width="60" height="4" rx="2" fill="rgba(255,255,255,0.06)" />
        <circle cx="15" cy="100" r="3" className="ga-status-led" />
        <text x="10" y="-15" fill="rgba(255,255,255,0.2)" fontFamily="monospace" fontSize="10">CORE_RACK_01</text>
      </g>
      {/* Cable paths */}
      <path id="ga-p1" d="M 180 320 L 400 320 L 500 150 L 800 150" className="ga-cable-path" />
      <path id="ga-p2" d="M 180 350 L 600 350 L 700 450 L 950 450" className="ga-cable-path" />
      <path id="ga-p3" d="M 180 380 L 400 380 L 550 580 L 750 580" className="ga-cable-path" />
      {/* Animated data packets via animateMotion */}
      <circle r="5" className="ga-data-packet">
        <animateMotion dur="3.5s" repeatCount="indefinite" begin="0s">
          <mpath href="#ga-p1"/>
        </animateMotion>
      </circle>
      <circle r="5" className="ga-data-packet">
        <animateMotion dur="3.5s" repeatCount="indefinite" begin="1.2s">
          <mpath href="#ga-p2"/>
        </animateMotion>
      </circle>
      <circle r="5" className="ga-data-packet">
        <animateMotion dur="3.5s" repeatCount="indefinite" begin="2.3s">
          <mpath href="#ga-p3"/>
        </animateMotion>
      </circle>
      {/* Endpoint 1 – RJ45 */}
      <g transform="translate(800, 150)">
        <rect x="-15" y="-15" width="30" height="30" rx="2" className="ga-endpoint-node" stroke="#4CC9F0" />
        <circle r="4" fill="#4CC9F0" opacity="0.6" />
        <text x="24" y="5" className="ga-endpoint-label ga-label-1">RJ45 × 24  (CAT6A)</text>
      </g>
      {/* Endpoint 2 – CCTV */}
      <g transform="translate(950, 450)">
        <circle r="15" className="ga-endpoint-node" stroke="#4CC9F0" />
        <circle r="5" fill="#4CC9F0" opacity="0.5" />
        <text x="24" y="5" className="ga-endpoint-label ga-label-2">CCTV × 8  (PoE)</text>
      </g>
      {/* Endpoint 3 – Access reader */}
      <g transform="translate(750, 580)">
        <rect x="-12" y="-18" width="24" height="36" rx="2" className="ga-endpoint-node" stroke="#93C5FD" />
        <circle r="4" fill="#93C5FD" opacity="0.5" cy="-2" />
        <text x="24" y="5" className="ga-endpoint-label ga-label-3">ENTRY_READER × 4</text>
      </g>
      {/* Corner decorations */}
      <path d="M 50 50 L 150 50 M 50 50 L 50 150" stroke="rgba(255,255,255,0.08)" fill="none" strokeWidth="1" />
      <path d="M 1150 650 L 1050 650 M 1150 650 L 1150 550" stroke="rgba(255,255,255,0.08)" fill="none" strokeWidth="1" />
    </svg>
  )
}

function TuzjelzoSvg() {
  const ac = '#FF6B6B'
  const ac2 = '#FFAA6B'
  const wall = 'rgba(255,255,255,0.22)'
  const muted = 'rgba(255,255,255,0.13)'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <style>{`
        .tz-scan { animation: tz-scan 4s linear infinite; }
        @keyframes tz-scan { 0%{transform:translateX(0px)} 100%{transform:translateX(1200px)} }
        .tz-ping-1 { animation: tz-p1 4s linear infinite; transform-origin: 300px 225px; }
        .tz-ping-2 { animation: tz-p2 4s linear infinite; transform-origin: 600px 475px; }
        .tz-ping-3 { animation: tz-p3 4s linear infinite; transform-origin: 900px 225px; }
        .tz-hud-1  { animation: tz-h1 4s linear infinite; }
        .tz-hud-2  { animation: tz-h2 4s linear infinite; }
        .tz-hud-3  { animation: tz-h3 4s linear infinite; }
        @keyframes tz-p1 { 0%,22%,35%,100%{opacity:0.3;transform:scale(1)} 25%{opacity:1;transform:scale(1.18);filter:url(#tz-glow)} }
        @keyframes tz-p2 { 0%,47%,60%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.18);filter:url(#tz-glow)} }
        @keyframes tz-p3 { 0%,72%,85%,100%{opacity:0.3;transform:scale(1)} 75%{opacity:1;transform:scale(1.18);filter:url(#tz-glow)} }
        @keyframes tz-h1 { 0%,22%,35%,100%{opacity:0} 25%,32%{opacity:1} }
        @keyframes tz-h2 { 0%,47%,60%,100%{opacity:0} 50%,57%{opacity:1} }
        @keyframes tz-h3 { 0%,72%,85%,100%{opacity:0} 75%,82%{opacity:1} }
        @media (prefers-reduced-motion: reduce) {
          .tz-scan { display: none; }
          .tz-ping-1,.tz-ping-2,.tz-ping-3 { animation: none; opacity: 0.85; filter: url(#tz-glow); }
          .tz-hud-1,.tz-hud-2,.tz-hud-3 { animation: none; opacity: 1; }
        }
      `}</style>
      <defs>
        <pattern id="tz-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
        </pattern>
        <filter id="tz-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        <linearGradient id="tz-scan-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={ac} stopOpacity="0"/>
          <stop offset="100%" stopColor={ac} stopOpacity="0.12"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="700" fill="url(#tz-grid)" />
      {/* Blueprint walls */}
      <g>
        <path d="M 150 100 L 1050 100 L 1050 600 L 150 600 Z" fill="none" stroke={wall} strokeWidth="2" strokeLinecap="square"/>
        <path d="M 450 100 L 450 250 M 450 350 L 450 600" fill="none" stroke={wall} strokeWidth="2"/>
        <path d="M 750 100 L 750 300 M 750 400 L 750 600" fill="none" stroke={wall} strokeWidth="2"/>
        <path d="M 150 350 L 300 350 M 400 350 L 450 350" fill="none" stroke={wall} strokeWidth="2"/>
        <path d="M 750 350 L 900 350 M 1000 350 L 1050 350" fill="none" stroke={wall} strokeWidth="2"/>
        {/* Corner marks */}
        <path d="M 130 80 L 170 80 M 150 60 L 150 100" stroke={ac2} strokeWidth="1" opacity="0.4"/>
        <path d="M 1030 80 L 1070 80 M 1050 60 L 1050 100" stroke={ac2} strokeWidth="1" opacity="0.4"/>
        <path d="M 130 620 L 170 620 M 150 600 L 150 640" stroke={ac2} strokeWidth="1" opacity="0.4"/>
        <path d="M 1030 620 L 1070 620 M 1050 600 L 1050 640" stroke={ac2} strokeWidth="1" opacity="0.4"/>
        {/* Room labels */}
        <text x="170" y="130" fill={muted} fontFamily="monospace" fontSize="13" letterSpacing="2">LOBBY</text>
        <text x="470" y="130" fill={muted} fontFamily="monospace" fontSize="13" letterSpacing="2">SERVER</text>
        <text x="770" y="130" fill={muted} fontFamily="monospace" fontSize="13" letterSpacing="2">OFFICE</text>
        <text x="470" y="380" fill={muted} fontFamily="monospace" fontSize="11" letterSpacing="2">FOLYOSÓ</text>
      </g>
      {/* Node 1 – Smoke detector */}
      <g className="tz-ping-1">
        <circle cx="300" cy="225" r="22" fill="none" stroke={ac} strokeWidth="2"/>
        <circle cx="300" cy="225" r="10" fill="none" stroke={ac} strokeWidth="2"/>
        <circle cx="300" cy="225" r="2" fill={ac}/>
        <path d="M 300 195 L 300 203 M 300 247 L 300 255 M 270 225 L 278 225 M 322 225 L 330 225" fill="none" stroke={ac} strokeWidth="2"/>
      </g>
      <g className="tz-hud-1">
        <line x1="315" y1="205" x2="340" y2="185" stroke={ac} strokeWidth="1"/>
        <rect x="340" y="170" width="148" height="28" rx="4" fill={`${ac}18`} stroke={ac} strokeWidth="1"/>
        <text x="350" y="189" fill={ac} fontFamily="monospace" fontSize="12" fontWeight="bold">SMOKE DET: ACTIVE</text>
      </g>
      {/* Node 2 – Manual call point */}
      <g className="tz-ping-2">
        <rect x="576" y="451" width="48" height="48" rx="6" fill="none" stroke={ac} strokeWidth="2"/>
        <rect x="584" y="459" width="32" height="32" rx="3" fill="none" stroke={ac} strokeWidth="2"/>
        <circle cx="600" cy="475" r="6" fill={ac}/>
      </g>
      <g className="tz-hud-2">
        <line x1="615" y1="455" x2="640" y2="435" stroke={ac} strokeWidth="1"/>
        <rect x="640" y="420" width="148" height="28" rx="4" fill={`${ac}18`} stroke={ac} strokeWidth="1"/>
        <text x="650" y="439" fill={ac} fontFamily="monospace" fontSize="12" fontWeight="bold">MCP: STANDBY</text>
      </g>
      {/* Node 3 – Siren */}
      <g className="tz-ping-3">
        <path d="M 885 215 L 895 215 L 905 200 L 905 250 L 895 235 L 885 235 Z" fill="none" stroke={ac} strokeWidth="2"/>
        <path d="M 915 210 Q 925 225 915 240" fill="none" stroke={ac} strokeWidth="2"/>
        <path d="M 922 200 Q 936 225 922 250" fill="none" stroke={ac} strokeWidth="2"/>
      </g>
      <g className="tz-hud-3">
        <line x1="915" y1="205" x2="940" y2="185" stroke={ac} strokeWidth="1"/>
        <rect x="940" y="170" width="148" height="28" rx="4" fill={`${ac}18`} stroke={ac} strokeWidth="1"/>
        <text x="950" y="189" fill={ac} fontFamily="monospace" fontSize="12" fontWeight="bold">SIREN: ALARM</text>
      </g>
      {/* Scanner sweep */}
      <g className="tz-scan">
        <rect x="-200" y="50" width="200" height="600" fill="url(#tz-scan-grad)"/>
        <line x1="0" y1="50" x2="0" y2="650" stroke={ac} strokeWidth="2.5" style={{ filter: 'url(#tz-glow)' }}/>
      </g>
    </svg>
  )
}

const TRADE_BLOCKS = [
  {
    id: 'erosaram',
    icon: '⚡',
    badge: 'Erősáram',
    color: '#FFD166',
    colorDim: 'rgba(255,209,102,0.1)',
    colorBorder: 'rgba(255,209,102,0.22)',
    title: 'DXF tervből tételes\nvillamos ajánlat percek alatt',
    desc: 'Importáld a villamossági tervet – az app automatikusan megszámolja a szerelvényeket, megméri a kábelhosszakat, és normaidővel, anyagköltséggel együtt kalkulál.',
    features: [
      'Dugaljak, kapcsolók, lámpák automatikus felismerése és számlálása',
      'Kábeltálca és nyomvonalak hosszmérése réteg szerint',
      '60+ normaidő GK, Ytong, tégla, beton falanyagokra kalibrálva',
      'Tételes PDF árajánlat céglogóval, egy kattintással',
    ],
    svgKey: 'erosaram',
    reverse: false,
  },
  {
    id: 'gyengaram',
    icon: '📡',
    badge: 'Gyengeáram',
    color: '#4CC9F0',
    colorDim: 'rgba(76,201,240,0.1)',
    colorBorder: 'rgba(76,201,240,0.22)',
    title: 'Hálózat, CCTV és beléptető\nrendszer – egy platformon',
    desc: 'Strukturált hálózat, IP kamera rendszer és beléptető kalkuláció – iparági normaidőkkel, kategorizált anyaglistával és tételes PDF ajánlattal.',
    features: [
      'Cat6A hálózati pontok, patchpanel, managed switch normaidőkkel',
      'IP kamera rendszer PoE táplálással, rögzítő, bel- és kültéri szerelés',
      'Beléptető: RFID olvasó, elektromos zár, vezérlőegység',
      'PA rendszer, kaputelefon – teljes gyengeáram szakterület',
    ],
    svgKey: 'gyengaram',
    reverse: false,
  },
  {
    id: 'tuzjelzo',
    icon: '🔥',
    badge: 'Tűzjelző',
    color: '#FF6B6B',
    colorDim: 'rgba(255,107,107,0.1)',
    colorBorder: 'rgba(255,107,107,0.22)',
    title: 'OTSZ-kompatibilis tűzjelző\nkalkuláció automatikusan',
    desc: 'Optikai érzékelőktől a tűzjelző központig – az MSZ EN 54 és OTSZ előírásainak megfelelő JE-H(St)H E30 tűzálló kábellel kalkulálva.',
    features: [
      'Optikai, hő- és multiszenzoros érzékelők normaidőkkel',
      'JE-H(St)H E30 tűzálló kábel – OTSZ FE180/E30 kötelező',
      'Tűzjelző központ, kezelőpanel, I/O modul telepítés',
      'Tűzgátló tömítések, rendszerprogramozás – teljes ajánlat',
    ],
    svgKey: 'tuzjelzo',
    reverse: false,
  },
]

function TradeSupportSection({ onStart }) {
  const [active, setActive] = useState(0)
  const trade = TRADE_BLOCKS[active]
  return (
    <section id="trades" className="sec-100" style={{ background: '#050505', position: 'relative', zIndex: 1 }}>

      {/* ── Section header ── */}
      <FadeIn>
        <div className="section-header-gap" style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            display: 'inline-block', marginBottom: 20,
            background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.18)',
            borderRadius: 100, padding: '6px 18px',
            fontFamily: 'DM Mono', fontSize: 11, letterSpacing: '0.12em',
            color: '#00E5A0', textTransform: 'uppercase',
          }}>Szakterületek</div>
          <h2 style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(28px, 5vw, 52px)',
            color: '#F0F0F0', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20,
          }}>
            Három szakterület,<br />
            <span style={{ color: '#00E5A0' }}>egy ajánlatkészítő</span> platform
          </h2>
          <p style={{
            fontFamily: 'DM Mono', fontSize: 'clamp(13px, 1.8vw, 16px)', lineHeight: 1.8,
            color: '#555', maxWidth: 620, margin: '0 auto',
          }}>
            Villamos kivitelező, gyengeáram- és tűzjelző-szerelő csapatok számára – minden szakterületnek saját normaidő-adatbázis, assembly könyvtár és anyaglista.
          </p>
        </div>
      </FadeIn>

      {/* ── Tab pills ── */}
      <FadeIn delay={0.1}>
        <div className="tabs-row" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 52, flexWrap: 'wrap' }}>
          {TRADE_BLOCKS.map((t, i) => (
            <button key={t.id} onClick={() => setActive(i)} style={{
              padding: '9px 24px', borderRadius: 100,
              border: `1px solid ${active === i ? t.color + '55' : '#1E1E1E'}`,
              background: active === i ? `${t.color}12` : 'transparent',
              color: active === i ? t.color : '#555',
              fontFamily: 'DM Mono', fontSize: 12,
              fontWeight: active === i ? 700 : 400,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
            }}>
              {t.icon} {t.badge}
            </button>
          ))}
        </div>
      </FadeIn>

      {/* ── Active trade content ── */}
      <div key={active} style={{ animation: 'nt-tab-in 0.42s cubic-bezier(0.16,1,0.3,1)' }}>
        <div
          className="trade-block-grid trade-block-inner"
          style={{
            maxWidth: 1280, margin: '0 auto',
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 72, alignItems: 'center',
          }}
        >
          <div className="nt-text" style={{ order: trade.reverse ? 2 : 1 }}>
            <TradeTextBlock trade={trade} />
          </div>
          <div className="nt-svg" style={{ order: trade.reverse ? 1 : 2 }}>
            <div className="anim-frame-169" style={{
              aspectRatio: '16/9', borderRadius: 16, overflow: 'hidden',
              background: '#080808',
              border: `1px solid ${trade.colorBorder}`,
              boxShadow: `0 0 60px ${trade.colorDim}`,
              position: 'relative',
            }}>
              {trade.svgKey === 'erosaram' && <TakeoffAnimation />}
              {trade.svgKey === 'gyengaram' && <GyengeAramSvg />}
              {trade.svgKey === 'tuzjelzo' && <TuzjelzoSvg />}
            </div>
          </div>
        </div>
      </div>

    </section>
  )
}

function TradeTextBlock({ trade }) {
  return (
    <div>
      {/* Badge */}
      <div style={{ marginBottom: 22 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: trade.colorDim, border: `1px solid ${trade.colorBorder}`,
          borderRadius: 100, padding: '7px 16px',
          fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
          color: trade.color, letterSpacing: '0.02em',
        }}>
          {trade.icon} {trade.badge}
        </span>
      </div>
      {/* Headline */}
      <h3 style={{
        fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(22px, 3vw, 36px)',
        lineHeight: 1.15, color: '#F0F0F0', marginBottom: 20,
        letterSpacing: '-0.025em', whiteSpace: 'pre-line',
      }}>
        {trade.title}
      </h3>
      {/* Description */}
      <p style={{
        fontFamily: 'DM Mono', fontSize: 'clamp(13px, 1.4vw, 15px)', lineHeight: 1.75,
        color: '#555', marginBottom: 36, maxWidth: 480,
      }}>
        {trade.desc}
      </p>
      {/* Feature list */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {trade.features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{
              flexShrink: 0, marginTop: 2, width: 18, height: 18,
              borderRadius: '50%', background: trade.colorDim,
              border: `1px solid ${trade.colorBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: trade.color, fontWeight: 800,
            }}>✓</span>
            <span style={{
              fontFamily: 'DM Mono', fontSize: 'clamp(12px, 1.2vw, 14px)',
              color: '#888', lineHeight: 1.55,
            }}>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FeaturesSection() {
  return (
    <section id="features" className="sec-100" style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1 }}>
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
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
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

// ── Compact per-trade normaidő card ────────────────────────────────────────
function NtTradeSvg({ pfx, color, tradeName, items, modifier, total }) {
  const barLen = 220
  const off0 = Math.round(barLen * (1 - items[0].pct))
  const off1 = Math.round(barLen * (1 - items[1].pct))
  const off2 = Math.round(barLen * (1 - items[2].pct))
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 255"
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <style>{`
          @keyframes ${pfx}b0 { 0%,8%{stroke-dashoffset:${barLen}} 62%,90%{stroke-dashoffset:${off0}} 100%{stroke-dashoffset:${barLen}} }
          @keyframes ${pfx}b1 { 0%,8%{stroke-dashoffset:${barLen}} 62%,90%{stroke-dashoffset:${off1}} 100%{stroke-dashoffset:${barLen}} }
          @keyframes ${pfx}b2 { 0%,8%{stroke-dashoffset:${barLen}} 62%,90%{stroke-dashoffset:${off2}} 100%{stroke-dashoffset:${barLen}} }
          @keyframes ${pfx}nf { 0%,18%{opacity:0} 38%,85%{opacity:1} 96%,100%{opacity:0} }
          @keyframes ${pfx}ct { 0%,55%{opacity:0;transform:translateY(3px)} 72%,88%{opacity:1;transform:translateY(0)} 98%,100%{opacity:0;transform:translateY(3px)} }
          .${pfx}-bg { fill:none;stroke:#0D2018;stroke-width:5;stroke-linecap:round }
          .${pfx}-b0 { fill:none;stroke:${color};stroke-width:5;stroke-linecap:round;stroke-dasharray:${barLen};animation:${pfx}b0 4.5s ease-in-out infinite 0.2s }
          .${pfx}-b1 { fill:none;stroke:${color};stroke-width:5;stroke-linecap:round;stroke-dasharray:${barLen};animation:${pfx}b1 4.5s ease-in-out infinite 0.5s }
          .${pfx}-b2 { fill:none;stroke:${color};stroke-width:5;stroke-linecap:round;stroke-dasharray:${barLen};animation:${pfx}b2 4.5s ease-in-out infinite 0.8s }
          .${pfx}-n0 { animation:${pfx}nf 4.5s ease-in-out infinite 0.2s;opacity:0 }
          .${pfx}-n1 { animation:${pfx}nf 4.5s ease-in-out infinite 0.5s;opacity:0 }
          .${pfx}-n2 { animation:${pfx}nf 4.5s ease-in-out infinite 0.8s;opacity:0 }
          .${pfx}-ct { animation:${pfx}ct 4.5s ease-in-out infinite 1.2s;opacity:0 }
        `}</style>
      </defs>
      {/* Card background */}
      <rect width="700" height="255" rx="12" fill="#060E0A" stroke={color} strokeWidth="1" strokeOpacity="0.18" />
      <rect width="700" height="3" rx="1" fill={color} opacity="0.65" />

      {/* Trade badge */}
      <rect x="20" y="18" width="104" height="22" rx="11" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="0.8" strokeOpacity="0.4" />
      <text x="72" y="33" textAnchor="middle" fontFamily="'DM Mono',monospace" fontSize="11" fontWeight="bold" fill={color} letterSpacing="1">{tradeName}</text>
      {/* Header label */}
      <text x="140" y="33" fontFamily="'DM Mono',monospace" fontSize="11" fill="#3A5A4A" letterSpacing="1.5">NORMAIDŐ KALKULÁTOR</text>

      {/* Divider */}
      <line x1="20" y1="56" x2="680" y2="56" stroke={color} strokeWidth="0.4" strokeOpacity="0.2" />

      {/* Row 0 */}
      <text x="20" y="88" fontFamily="'DM Mono',monospace" fontSize="12.5" fill="#9CA3AF">{items[0].label}</text>
      <line className={`${pfx}-bg`} x1="250" y1="85" x2="470" y2="85" />
      <line className={`${pfx}-b0`} x1="250" y1="85" x2="470" y2="85" />
      <text className={`${pfx}-n0`} x="478" y="89" fontFamily="'DM Mono',monospace" fontSize="12" fill={color}>{items[0].time}</text>

      {/* Row 1 */}
      <text x="20" y="138" fontFamily="'DM Mono',monospace" fontSize="12.5" fill="#9CA3AF">{items[1].label}</text>
      <line className={`${pfx}-bg`} x1="250" y1="135" x2="470" y2="135" />
      <line className={`${pfx}-b1`} x1="250" y1="135" x2="470" y2="135" />
      <text className={`${pfx}-n1`} x="478" y="139" fontFamily="'DM Mono',monospace" fontSize="12" fill={color}>{items[1].time}</text>

      {/* Row 2 */}
      <text x="20" y="188" fontFamily="'DM Mono',monospace" fontSize="12.5" fill="#9CA3AF">{items[2].label}</text>
      <line className={`${pfx}-bg`} x1="250" y1="185" x2="470" y2="185" />
      <line className={`${pfx}-b2`} x1="250" y1="185" x2="470" y2="185" />
      <text className={`${pfx}-n2`} x="478" y="189" fontFamily="'DM Mono',monospace" fontSize="12" fill={color}>{items[2].time}</text>

      {/* Bottom strip */}
      <line x1="20" y1="212" x2="680" y2="212" stroke={color} strokeWidth="0.4" strokeOpacity="0.18" />
      <text x="20" y="234" fontFamily="'DM Mono',monospace" fontSize="11.5" fill="#444">{modifier}</text>
      <text className={`${pfx}-ct`} x="670" y="235" textAnchor="end" fontFamily="'DM Mono',monospace"
        fontSize="20" fontWeight="bold" fill={color}>{total}</text>
    </svg>
  )
}

const NT_TRADES = [
  {
    pfx: 'nte', color: '#00E5A0', tradeName: 'ERŐSÁRAM',
    items: [
      { label: 'EL-061  Dugalj beépítés',   time: '0.45 h', pct: 0.50 },
      { label: 'EL-062  Kapcsoló 1-pólusú',  time: '0.25 h', pct: 0.28 },
      { label: 'EL-070  LED Panel 60×60',    time: '0.90 h', pct: 1.00 },
    ],
    modifier: 'Beton fal  ×1.3   •   Magasság 3.5m+  ×1.4',
    total: '4.2 h',
    textBadge: 'Erősáram',
    textTitle: 'Villamos normaidők, tételenként',
    textDesc: '60+ normaidő-adat az MSZ szerinti villamos normák alapján – dugaszoló aljzatoktól a komplex bekötésekig. Tételenként állítható falanyag és projekt szorzók.',
    features: [
      ['60+ villamos tétel', 'Dugalj, kapcsoló, lámpa, kábeltálca, elosztó – előre feltöltve'],
      ['Tételszintű falanyag', 'GK / Ytong / Tégla / Beton – soronként, nem globálisan'],
      ['Projekt szorzók', 'Magasság, hozzáférhetőség, épület típus – az egész projektre'],
    ],
    reverse: false,
  },
  {
    pfx: 'ntg', color: '#4CC9F0', tradeName: 'GYENGEÁRAM',
    items: [
      { label: 'LAN-01  Cat6A hálózati pont', time: '0.35 h', pct: 0.29 },
      { label: 'CAM-03  IP kamera (kültéri)',  time: '1.20 h', pct: 1.00 },
      { label: 'ACC-05  RFID olvasó',          time: '0.85 h', pct: 0.71 },
    ],
    modifier: 'Kültéri szerelés  ×1.2   •   Előszerelt rack  ×0.8',
    total: '3.8 h',
    textBadge: 'Gyengeáram',
    textTitle: 'Gyengeáram normaidők egy platformon',
    textDesc: 'Strukturált hálózat, IP kamera és beléptető rendszer – iparági normaidőkkel. Minden tételhez kategorizált anyaglista, normaidő és tételes PDF ajánlat.',
    features: [
      ['Hálózat', 'Cat6A pont, patchpanel, managed switch – normaidőkkel'],
      ['CCTV és beléptető', 'IP kamera, RFID olvasó, elektromos zár, vezérlőegység'],
      ['PA és kaputelefon', 'Teljes gyengeáram szakterület lefedve'],
    ],
    reverse: false,
  },
  {
    pfx: 'ntt', color: '#FF6B6B', tradeName: 'TŰZJELZŐ',
    items: [
      { label: 'FJ-01  Optikai érzékelő',       time: '0.35 h', pct: 0.14 },
      { label: 'FJ-15  Kábelfektetés /10m',      time: '0.85 h', pct: 0.34 },
      { label: 'FJ-20  Tűzjelző központ',        time: '2.50 h', pct: 1.00 },
    ],
    modifier: 'Álmennyezet  ×1.2   •   Tűzgátló tömítés  ×1.3',
    total: '6.5 h',
    textBadge: 'Tűzjelző',
    textTitle: 'OTSZ-kompatibilis tűzjelző normák',
    textDesc: 'Optikai érzékelőktől a tűzjelző központig – MSZ EN 54 és OTSZ előírások szerint. JE-H(St)H E30 tűzálló kábellel, teljes rendszerszintű kalkulációval.',
    features: [
      ['MSZ EN 54 normák', 'Optikai, hő- és multiszenzoros érzékelők normaidőkkel'],
      ['JE-H(St)H E30 kábel', 'OTSZ FE180/E30 kötelező tűzálló kábel – automatikusan'],
      ['Teljes rendszer', 'Központ, kezelőpanel, I/O modul, programozás, tömítések'],
    ],
    reverse: false,
  },
]

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
  const [active, setActive] = useState(0)
  const trade = NT_TRADES[active]
  return (
    <section className="sec-100" style={{ padding: '100px 24px 80px', background: '#050505', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', width: 700, maxWidth: '100%', height: 500, background: 'radial-gradient(ellipse, rgba(0,229,160,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Section header ── */}
        <FadeIn>
          <div className="section-header-gap" style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
              Normaidő Kalkuláció
            </div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(26px, 4vw, 42px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 16, lineHeight: 1.2 }}>
              Nem becsül –{' '}
              <span style={{ color: '#00E5A0' }}>pontosan számol</span>
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#666', lineHeight: 1.85, maxWidth: 540, margin: '0 auto' }}>
              Minden szakterülethez saját normaidő-adatbázis. Tételenként beállítható falanyag és projekt szorzók.
            </p>
          </div>
        </FadeIn>

        {/* ── Trade tabs ── */}
        <FadeIn delay={0.1}>
          <div className="tabs-row" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 52, flexWrap: 'wrap' }}>
            {NT_TRADES.map((t, i) => (
              <button
                key={t.pfx}
                onClick={() => setActive(i)}
                style={{
                  padding: '9px 24px',
                  borderRadius: 100,
                  border: `1px solid ${active === i ? t.color + '55' : '#1E1E1E'}`,
                  background: active === i ? `${t.color}12` : 'transparent',
                  color: active === i ? t.color : '#555',
                  fontFamily: 'DM Mono',
                  fontSize: 12,
                  fontWeight: active === i ? 700 : 400,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
              >
                {t.textBadge}
              </button>
            ))}
          </div>
        </FadeIn>

        {/* ── Active trade content ── */}
        <div key={active} style={{ animation: 'nt-tab-in 0.42s cubic-bezier(0.16,1,0.3,1)' }}>
          <div
            className="normtime-grid"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}
          >
            {/* Text column */}
            <div className="nt-text" style={{ order: trade.reverse ? 2 : 1 }}>
              <div style={{
                display: 'inline-block', marginBottom: 16,
                background: `${trade.color}12`, border: `1px solid ${trade.color}35`,
                borderRadius: 100, padding: '5px 16px',
                fontFamily: 'DM Mono', fontSize: 11, letterSpacing: '0.1em',
                color: trade.color, textTransform: 'uppercase',
              }}>
                {trade.textBadge}
              </div>
              <h3 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(20px, 2.8vw, 28px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 14, lineHeight: 1.25 }}>
                {trade.textTitle}
              </h3>
              <p style={{ fontFamily: 'DM Mono', fontSize: 13.5, color: '#777', lineHeight: 1.85, marginBottom: 28 }}>
                {trade.textDesc}
              </p>
              {trade.features.map(([title, desc], j) => (
                <div key={j} style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={trade.color} strokeWidth="2.5" strokeLinecap="round">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13.5, color: '#DDD', marginBottom: 3 }}>{title}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#666', lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* SVG card column */}
            <div className="nt-svg" style={{ order: trade.reverse ? 1 : 2 }}>
              <div style={{
                borderRadius: 14, overflow: 'hidden',
                border: `1px solid ${trade.color}22`,
                boxShadow: `0 0 0 1px #0A0A0A, 0 24px 64px rgba(0,0,0,0.55), 0 0 40px ${trade.color}06`,
                background: '#060E0A', position: 'relative',
              }}>
                {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h],ci) => (
                  <div key={ci} style={{
                    position:'absolute', [v]:0, [h]:0, width:14, height:14,
                    [`border${v.charAt(0).toUpperCase()+v.slice(1)}`]: `1.5px solid ${trade.color}`,
                    [`border${h.charAt(0).toUpperCase()+h.slice(1)}`]: `1.5px solid ${trade.color}`,
                    borderRadius: ci===0?'4px 0 0 0':ci===1?'0 4px 0 0':ci===2?'0 0 0 4px':'0 0 4px 0',
                    opacity: 0.45, zIndex: 2,
                  }} />
                ))}
                <NtTradeSvg {...trade} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}

function HowSection() {
  return (
    <section id="how" className="sec-100" style={{ padding: '100px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Hogyan működik</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em' }}>5 lépés, 2 perc</h2>
          </div>
        </FadeIn>
        <div style={{ position: 'relative' }}>
          <div className="step-line" style={{ position: 'absolute', left: 28, top: 0, bottom: 0, width: 1, background: 'linear-gradient(to bottom, transparent, #222 10%, #222 90%, transparent)' }} />
          {STEPS.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="step-row" style={{ display: 'flex', gap: 28, marginBottom: 36, alignItems: 'flex-start' }}>
                <div className="step-num" style={{ width: 56, height: 56, flexShrink: 0, background: '#0D0D0D', border: '1px solid #1E1E1E', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.05em', zIndex: 1, position: 'relative' }}>
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
    <section className="sec-100" style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="ai-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          <FadeIn>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Intelligens Elemzés</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(24px, 4vw, 40px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
              Töltsd fel a tervet,<br />
              <span style={{ color: '#00E5A0' }}>az app elvégzi a többit</span>
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', lineHeight: 1.8, marginBottom: 28 }}>
              Az alkalmazás automatikusan azonosítja a DXF/DWG rétegeket, megszámolja a blokkokat és kinyeri a kábelnyomvonalakat – rétegnév-konvenciók alapján, gépi precizitással.
            </p>
            {[
              'Automatikus rétegazonosítás (DUGALJ, LAMPA, KABEL…)',
              'Blokkok számlálása és típusonkénti összesítés',
              'Kábelhossz kinyerése vonalak és polilinék alapján',
              'Hiányzó réteg figyelmeztetések review lépésnél',
            ].map((item, i) => (
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
                <span style={{ fontSize: 12, color: '#888' }}>Réteg- és blokkfelismerés eredménye</span>
              </div>
              {[
                { label: 'DUGALJ réteg',    value: '12 db azonosítva',    ok: true },
                { label: 'LAMPA réteg',     value: '18 db azonosítva',    ok: true },
                { label: 'KAPCSOLO réteg',  value: '7 db azonosítva',     ok: true },
                { label: 'Figyelmeztetés',  value: 'KABEL_NYM6 réteg hiányzik', ok: false },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 3 ? '1px solid #111' : 'none' }}>
                  <span style={{ fontSize: 11, color: '#777' }}>{row.label}</span>
                  <span style={{ fontSize: 12, color: row.ok ? '#00E5A0' : '#FFD966', background: row.ok ? 'rgba(0,229,160,0.08)' : 'rgba(255,217,102,0.08)', padding: '3px 10px', borderRadius: 999 }}>{row.value}</span>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.1)', borderRadius: 8, fontSize: 11, color: '#5A9A7A', lineHeight: 1.6 }}>
                Összes felismert blokk: <strong style={{ color: '#00E5A0' }}>37 db</strong> · Kábelhossz összesen: <strong style={{ color: '#00E5A0' }}>248 m</strong>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}

function PDFOutputAnimation() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <style>{`
          .po-stroke  { fill: none; stroke: #1E4030; stroke-width: 2px; stroke-linecap: round; stroke-linejoin: round; }
          .po-pipe    { fill: none; stroke: #00E5A0; stroke-width: 2.5px; stroke-dasharray: 10,5; opacity: 0.5; }
          .po-node    { fill: #00E5A0; }
          .po-pdf-ln  { fill: none; stroke: #1E4030; stroke-width: 4px; stroke-linecap: round; opacity: 0.6; }
          .po-pdf-acc { fill: none; stroke: #00E5A0; stroke-width: 5px; stroke-linecap: round; }
          .po-dl      { fill: none; stroke: #00E5A0; stroke-width: 2.5px; stroke-linecap: round; stroke-linejoin: round; }
          .po-check   { fill: none; stroke: #00E5A0; stroke-width: 3.5px; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 50; stroke-dashoffset: 50; }
          @keyframes poFlow   { to { stroke-dashoffset: -30; } }
          .po-flow { animation: poFlow 1.2s linear infinite; }
          @keyframes poNode   { 0%,100%{ transform:scale(1); opacity:0.5; } 50%{ transform:scale(1.35); opacity:1; } }
          .po-pulse   { animation: poNode 2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
          .po-pulse2  { animation: poNode 2s ease-in-out infinite; animation-delay: 0.5s; transform-origin: center; transform-box: fill-box; }
          .po-pulse3  { animation: poNode 2s ease-in-out infinite; animation-delay: 1s; transform-origin: center; transform-box: fill-box; }
          @keyframes poReveal { from { stroke-dashoffset:100; opacity:0; } to { stroke-dashoffset:0; opacity:0.6; } }
          .po-rev1 { stroke-dasharray:100; stroke-dashoffset:100; animation: poReveal 2s ease-out forwards infinite; animation-delay:1.0s; }
          .po-rev2 { stroke-dasharray:100; stroke-dashoffset:100; animation: poReveal 2s ease-out forwards infinite; animation-delay:1.2s; }
          .po-rev3 { stroke-dasharray:100; stroke-dashoffset:100; animation: poReveal 2s ease-out forwards infinite; animation-delay:1.4s; }
          .po-rev4 { stroke-dasharray:100; stroke-dashoffset:100; animation: poReveal 2s ease-out forwards infinite; animation-delay:1.6s; }
          .po-rev5 { stroke-dasharray:100; stroke-dashoffset:100; animation: poReveal 2s ease-out forwards infinite; animation-delay:2.0s; }
          @keyframes poBounce { 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-14px); } }
          .po-bounce  { animation: poBounce 2s ease-in-out infinite; animation-delay:2.2s; }
          @keyframes poCheck  { to { stroke-dashoffset:0; } }
          .po-check-anim { animation: poCheck 0.9s ease-out forwards infinite; animation-delay:2.6s; }
          @keyframes poGlow   { 0%,100%{ opacity:0.15; } 50%{ opacity:0.35; } }
          .po-glow { animation: poGlow 2.5s ease-in-out infinite; }
        `}</style>
      </defs>

      {/* Grid */}
      <pattern id="poGrid" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#00E5A0" strokeWidth="0.5" opacity="0.04"/>
      </pattern>
      <rect width="100%" height="100%" fill="url(#poGrid)" />

      <g transform="translate(150, 190)">

        {/* ── Input files (left) ── */}

        {/* DXF file icon */}
        <g transform="translate(0, 0)">
          <rect className="po-stroke" x="0" y="0" width="80" height="100" rx="8" fill="#060E0A" />
          <path className="po-stroke" d="M50,0 L80,30 L80,100 M50,0 L50,30 L80,30" fill="#060E0A" />
          <text x="12" y="72" fontFamily="'DM Mono',monospace" fontWeight="bold" fill="#2A5A42" fontSize="22">DXF</text>
          {/* Top accent dot */}
          <circle cx="70" cy="12" r="3" fill="#00E5A0" opacity="0.4" />
        </g>

        {/* List / spec file icon */}
        <g transform="translate(0, 148)">
          <rect className="po-stroke" x="0" y="0" width="80" height="100" rx="8" fill="#060E0A" />
          <line className="po-stroke" x1="18" y1="30" x2="62" y2="30" />
          <line className="po-stroke" x1="18" y1="48" x2="62" y2="48" />
          <line className="po-stroke" x1="18" y1="66" x2="46" y2="66" />
          <circle className="po-stroke" cx="10" cy="30" r="2" fill="#00E5A0" fillOpacity="0.3" />
          <circle className="po-stroke" cx="10" cy="48" r="2" fill="#00E5A0" fillOpacity="0.3" />
          <circle className="po-stroke" cx="10" cy="66" r="2" fill="#00E5A0" fillOpacity="0.3" />
          <text x="12" y="85" fontFamily="'DM Mono',monospace" fontWeight="bold" fill="#2A5A42" fontSize="13">LISTA</text>
        </g>

        {/* ── Pipeline ── */}
        <g transform="translate(100, 50)">

          {/* Pipe paths */}
          <path className="po-pipe po-flow" d="M0,0 C150,0 150,150 300,150 L500,150" />
          <path className="po-pipe po-flow" d="M0,150 C100,150 200,150 300,150" opacity="0.3" />

          {/* Glow along pipe */}
          <path d="M0,0 C150,0 150,150 300,150 L500,150"
            fill="none" stroke="#00E5A0" strokeWidth="12" className="po-glow" />

          {/* Pulse nodes */}
          <circle className="po-node po-pulse"  cx="0"   cy="0"   r="7" />
          <circle className="po-node po-pulse2" cx="0"   cy="150" r="7" />
          <circle className="po-node po-pulse3" cx="300" cy="150" r="11" />

          {/* Travelling dots */}
          <circle r="5" fill="#00E5A0" opacity="0.9">
            <animateMotion dur="3s" repeatCount="indefinite"
              path="M0,0 C150,0 150,150 300,150 L500,150" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.8;1" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="5" fill="#00E5A0" opacity="0.9">
            <animateMotion dur="3s" begin="1s" repeatCount="indefinite"
              path="M0,150 C100,150 200,150 300,150 L500,150" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.8;1" dur="3s" begin="1s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── PDF document (right) ── */}
        <g transform="translate(648, -60)">

          {/* Card shadow glow */}
          <rect x="-8" y="-8" width="266" height="366" rx="16"
            fill="#00E5A0" opacity="0.03" className="po-glow" />

          {/* Card */}
          <rect x="0" y="0" width="250" height="350" rx="12"
            fill="#060E0A" stroke="#00E5A0" strokeWidth="1" strokeOpacity="0.25" />
          <rect x="0" y="0" width="250" height="3" rx="1" fill="#00E5A0" opacity="0.6" />

          {/* Header area */}
          <rect x="20" y="24" width="70" height="16" rx="4" fill="#0D2018" />
          <rect x="20" y="24" width="70" height="16" rx="4" fill="#00E5A0" fillOpacity="0.07" stroke="#00E5A0" strokeWidth="0.5" strokeOpacity="0.2" />
          <text x="26" y="36" fontFamily="'DM Mono',monospace" fontSize="9" fill="#00E5A0" letterSpacing="1">ÁRAJÁNLAT</text>

          <line x1="20" y1="55" x2="230" y2="55" stroke="#0D2018" strokeWidth="1" />

          {/* Logo placeholder */}
          <rect x="175" y="20" width="55" height="28" rx="4" fill="#0A1A12" stroke="#1E3A28" strokeWidth="1" />
          <text x="186" y="33" fontFamily="'DM Mono',monospace" fontSize="8" fill="#2A5040" letterSpacing="1">LOGO</text>
          <line x1="179" y1="40" x2="226" y2="40" stroke="#00E5A0" strokeWidth="0.5" strokeOpacity="0.3" />

          {/* Animated text lines (content appearing) */}
          <g transform="translate(28, 80)">
            <line className="po-pdf-ln po-rev1" x1="0" y1="0"  x2="150" y2="0" />
            <line className="po-pdf-ln po-rev2" x1="0" y1="28" x2="180" y2="28" />
            <line className="po-pdf-ln po-rev3" x1="0" y1="56" x2="120" y2="56" />
            <line className="po-pdf-ln po-rev4" x1="0" y1="84" x2="160" y2="84" />
            {/* Total line – accent */}
            <line className="po-pdf-acc po-rev5" x1="80" y1="140" x2="190" y2="140" />
          </g>

          {/* Price tag */}
          <g transform="translate(80, 270)">
            <rect x="-4" y="-18" width="100" height="26" rx="5"
              fill="rgba(0,229,160,0.07)" stroke="#00E5A0" strokeWidth="0.5" strokeOpacity="0.25" />
            <text fontFamily="'DM Mono',monospace" fontSize="15" fill="#00E5A0" fontWeight="bold" x="0" y="0">
              2 450 000 Ft
              <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.55;0.7;1" dur="4s" repeatCount="indefinite" />
            </text>
          </g>

          {/* Download icon (bouncing) */}
          <g transform="translate(200, 306)" className="po-bounce">
            <circle cx="0" cy="8" r="16" fill="rgba(0,229,160,0.08)" stroke="#00E5A0" strokeWidth="1" strokeOpacity="0.3" />
            <path className="po-dl" d="M0,-4 L0,10 M-7,4 L0,10 L7,4 M-10,16 L10,16" />
          </g>

          {/* Checkmark badge */}
          <g transform="translate(220, 36)">
            <circle fill="#060E0A" stroke="#00E5A0" strokeWidth="1" strokeOpacity="0.4" r="18" />
            <circle fill="rgba(0,229,160,0.08)" r="18" className="po-glow" />
            <path className="po-check po-check-anim" d="M-8,0 L-2,6 L10,-7" transform="translate(0,1)" />
          </g>
        </g>

      </g>
    </svg>
  )
}

function PDFOutputSection() {
  return (
    <section className="sec-100" style={{ padding: '100px 24px', background: '#060606', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      {/* Radial glow */}
      <div style={{ position: 'absolute', right: '15%', top: '50%', transform: 'translateY(-50%)', width: 500, maxWidth: '100%', height: 400, background: 'radial-gradient(ellipse, rgba(0,229,160,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }} className="pdf-section-grid">

          {/* Left: animated SVG */}
          <FadeIn delay={0.1}>
            <div className="anim-frame-32" style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid #0E2018',
              boxShadow: '0 0 0 1px #0A1A12, 0 32px 80px rgba(0,0,0,0.7), 0 0 60px rgba(0,229,160,0.03)',
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
                  opacity:0.45, zIndex:2 }} />
              ))}
              <PDFOutputAnimation />
            </div>
          </FadeIn>

          {/* Right: explanation */}
          <FadeIn delay={0.2}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
              PDF Generálás
            </div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(26px, 4vw, 42px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
              Egy kattintás –<br />
              <span style={{ color: '#00E5A0' }}>profi ajánlat azonnal</span>
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', lineHeight: 1.85, marginBottom: 32 }}>
              A kalkuláció végén az app összegyűjti a tételeket, a normaidőket és az anyagárakat – és generál egy branded PDF ajánlatot, amit azonnal elküldhetsz az ügyfélnek.
            </p>

            {[
              ['Céglogó és fejléc',    'Saját arculattal, cégadatokkal, ügyfél névvel'],
              ['Tételes bontás',       'Minden sor: tétel, mennyiség, egységár, összeg'],
              ['Normaidő összesítő',   'Munkadíj kalkuláció külön sorban, átláthatóan'],
              ['Egy kattintás',        'DXF feltöltéstől PDF letöltésig < 2 perc'],
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

            {/* CTA hint */}
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(0,229,160,0.05)', border: '1px solid rgba(0,229,160,0.12)', borderRadius: 8, padding: '10px 16px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2v20M2 12l10 10 10-10"/>
              </svg>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#00E5A0' }}>Minta PDF letöltése →</span>
            </div>
          </FadeIn>
        </div>
      </div>

    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" className="sec-100" style={{ padding: '100px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Árazás</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 16 }}>Egy csomag. Minden benne.</h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', maxWidth: 440, margin: '0 auto', lineHeight: 1.7 }}>
              Az árajánlat pontosságához az összes funkció szükséges egyszerre –
              ezért nincs alap- és pro verzió.
            </p>
          </div>
        </FadeIn>

        {/* Single plan card */}
        <FadeIn delay={0.1}>
          <div className="pricing-card" style={{
            background: 'linear-gradient(145deg, #0C1C15 0%, #08120E 100%)',
            border: '1px solid rgba(0,229,160,0.28)',
            borderRadius: 24, padding: '44px 44px 40px',
            position: 'relative',
            boxShadow: '0 0 80px rgba(0,229,160,0.08)',
          }}>
            {/* Top badge */}
            <div className="pricing-badge" style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#00E5A0', color: '#0A0A0A', fontFamily: 'Syne', fontWeight: 800, fontSize: 10, padding: '4px 20px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.1em' }}>
              TELJES CSOMAG · MINDEN FUNKCIÓ
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start' }}>

              {/* Left: contact CTA */}
              <div style={{ flex: '0 0 auto', minWidth: 220 }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>TakeoffPro</div>

                <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#aaa', lineHeight: 1.75, marginBottom: 24, maxWidth: 240 }}>
                  Pontos árakért érdeklődjön – személyre szabott ajánlatot adunk.
                </p>

                {/* Phone CTA */}
                <a href="tel:+36305252336" className="pricing-phone-cta"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 20px', borderRadius: 10,
                    background: '#00E5A0', color: '#0A0A0A',
                    textDecoration: 'none', fontFamily: 'Syne', fontWeight: 700, fontSize: 15,
                    boxShadow: '0 0 30px rgba(0,229,160,0.3)', transition: 'all 0.2s',
                    marginBottom: 14,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow='0 0 50px rgba(0,229,160,0.5)'; e.currentTarget.style.transform='translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='0 0 30px rgba(0,229,160,0.3)'; e.currentTarget.style.transform='none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.64 3.42 2 2 0 0 1 3.62 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/>
                  </svg>
                  +36 30 525 2336
                </a>

                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444', textAlign: 'center' }}>
                  Hétfő–Péntek · 8:00–17:00
                </div>
              </div>

              {/* Right: feature list */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Mit tartalmaz</div>
                {PLAN.features.map((f, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 11 }}>
                    <svg style={{ flexShrink: 0, marginTop: 2 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}

function FAQSection() {
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" className="sec-100" style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1 }}>
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
                <span className="faq-question" style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 600, color: open === i ? '#00E5A0' : '#DDD', transition: 'color 0.2s' }}>{item.q}</span>
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
    <section className="cta-section" style={{ padding: '120px 24px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
      <FadeIn>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,229,160,0.1) 0%, transparent 70%)', margin: '-80px auto 0', pointerEvents: 'none' }} />
          <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.03em', marginBottom: 20 }}>
            Kezdd el ma,<br /><span style={{ color: '#00E5A0' }}>14 napig ingyen</span>
          </h2>
          <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', marginBottom: 40, lineHeight: 1.8 }}>
            Nincs regisztráció bonyolultsága, nincs elköteleződés.<br />Töltsd fel az első tervedet és lásd az eredményt.
          </p>
          <button className="cta-btn" onClick={onStart} style={{ padding: '18px 48px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 18, boxShadow: '0 0 60px rgba(0,229,160,0.3)', transition: 'all 0.2s' }}
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
    <footer className="footer-root" style={{ borderTop: '1px solid #141414', padding: '32px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 26, height: 26, background: '#050E08', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,229,160,0.18)', flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="none" aria-hidden="true">
            <defs>
              <clipPath id="footer-scan-clip">
                <rect x="0" y="256" width="256" height="256">
                  <animateTransform attributeName="transform" type="translate" from="0 0" to="0 -256" begin="0s" dur="3s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1" />
                </rect>
              </clipPath>
            </defs>
            <g stroke="#00E5A0" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
              <path d="M48 208H208V48H48V208Z" />
              <path d="M48 128H208" opacity="0.3"/>
              <path d="M128 208V48" opacity="0.3"/>
            </g>
            <g clipPath="url(#footer-scan-clip)" fill="#00E5A0" opacity="0.85">
              <rect x="58" y="58" width="60" height="60" rx="4"/>
              <rect x="138" y="58" width="60" height="60" rx="4"/>
              <rect x="58" y="138" width="60" height="60" rx="4"/>
              <rect x="138" y="138" width="60" height="60" rx="4"/>
            </g>
          </svg>
        </div>
        <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: '#F0F0F0' }}>Takeoff<span style={{ color: '#00E5A0' }}>Pro</span></span>
      </div>
      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444' }}>© 2026 TakeoffPro · Villamossági árajánlat rendszer</span>
    </footer>
  )
}

export default function Landing({ onStart }) {
  return (
    <div className="landing-root" style={{ background: '#0A0A0A', color: '#F0F0F0', minHeight: '100vh', position: 'relative' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
        body { overflow-x: hidden; }

        /* ─ NAV mobile ─ */
        @media (max-width: 640px) {
          .nav-links { display: none !important; }
          .nav-root  { padding: 10px 16px !important; }
          .nav-cta   { padding: 8px 14px !important; font-size: 13px !important; }
        }

        /* ─ HERO ─ */
        @media (max-width: 900px) {
          .hero-grid    { grid-template-columns: 1fr !important; gap: 36px !important; }
          .hero-section { padding: 90px 24px 56px !important; min-height: auto !important; }
        }
        @media (max-width: 640px) {
          .hero-section { padding: 76px 16px 48px !important; }
          .hero-ctas    { flex-direction: column !important; gap: 10px !important; }
          .hero-ctas > * { width: 100% !important; justify-content: center !important; text-align: center !important; }
        }

        /* ─ SECTION padding ─ */
        @media (max-width: 900px) {
          .sec-100 { padding-top: 72px !important; padding-bottom: 72px !important; }
        }
        @media (max-width: 640px) {
          .sec-100 { padding: 56px 16px !important; }
        }

        /* ─ HERO animation: mobile = portrait SVG ─ */
        .ha-mobile  { display: none; }
        .ha-desktop { display: block; }
        @media (max-width: 768px) {
          .ha-mobile  { display: block !important; }
          .ha-desktop { display: none !important; }
        }

        /* ─ HERO stats bar ─ */
        @media (max-width: 640px) {
          .hero-stats-bar { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* ─ Tab-switch fade-slide animation ─ */
        @keyframes nt-tab-in {
          from { opacity: 0; transform: translateY(22px) scale(0.984); filter: blur(2px); }
          to   { opacity: 1; transform: translateY(0)   scale(1);     filter: blur(0);   }
        }

        /* ─ hero subtext line break: visible only on wide screens ─ */
        .hero-br { display: inline; }
        @media (max-width: 600px) {
          .hero-br { display: none !important; }
        }

        /* ─ Trade block inner padding ─ */
        .trade-block-inner { padding: 0 48px 20px; }
        @media (max-width: 900px) { .trade-block-inner { padding: 0 0 20px; } }
        @media (max-width: 480px) { .trade-block-inner { padding: 0 0 12px; } }

        /* ─ TWO-COLUMN grids ─ */
        @media (max-width: 900px) {
          .hero-grid        { grid-template-columns: 1fr !important; gap: 36px !important; }
          .two-col-grid     { grid-template-columns: 1fr !important; gap: 36px !important; }
          .normtime-grid    { grid-template-columns: 1fr !important; gap: 36px !important; }
          .pdf-section-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .trade-block-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          /* always show text before SVG in single-column mode */
          .trade-text-col   { order: 1 !important; }
          .trade-svg-col    { order: 2 !important; }
          .nt-text          { order: 1 !important; }
          .nt-svg           { order: 2 !important; }
        }
        @media (max-width: 768px) {
          .ai-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
        }

        /* ─ FEATURES cards ─ */
        @media (max-width: 580px) {
          .features-grid { grid-template-columns: 1fr !important; }
        }

        /* ─ PRICING cards ─ */
        @media (max-width: 720px) {
          .pricing-cards { grid-template-columns: 1fr !important; }
        }

        /* ─ HOW steps ─ */
        @media (max-width: 640px) {
          .step-row { gap: 16px !important; margin-bottom: 24px !important; }
          .step-num { width: 44px !important; height: 44px !important; border-radius: 10px !important; }
          .step-line { left: 22px !important; }
        }

        /* ─ FAQ ─ */
        @media (max-width: 640px) {
          .faq-question { font-size: 14px !important; }
        }

        /* ─ CTA ─ */
        @media (max-width: 640px) {
          .cta-section { padding: 72px 16px !important; }
          .cta-btn { width: 100% !important; padding: 16px 24px !important; font-size: 16px !important; }
        }

        /* ─ FOOTER ─ */
        @media (max-width: 640px) {
          .footer-root { padding: 24px 16px !important; flex-direction: column !important; align-items: flex-start !important; }
        }

        /* ─ ANIMATED frames ─ */
        @media (max-width: 768px) {
          .anim-frame-169 { aspect-ratio: 4/3 !important; }
          .anim-frame-32  { aspect-ratio: 4/3 !important; }
        }
        @media (max-width: 480px) {
          .anim-frame-169 { aspect-ratio: 1/1 !important; }
          .anim-frame-32  { aspect-ratio: 1/1 !important; }
        }

        /* ─ Mouse glow: hide on touch devices ─ */
        @media (hover: none) { #mouse-glow { display: none !important; } }

        /* ─ Pricing toggle ─ */
        @media (max-width: 400px) {
          .billing-toggle button { padding: 6px 12px !important; font-size: 11px !important; }
        }

        /* ─ PRICING card responsive ─ */
        @media (max-width: 540px) {
          .pricing-card { padding: 36px 20px 28px !important; }
          .pricing-card > div { gap: 28px !important; flex-direction: column !important; }
          .pricing-badge { font-size: 9px !important; padding: 3px 12px !important; left: 50% !important; transform: translateX(-50%) !important; white-space: normal !important; text-align: center !important; }
          .pricing-phone-cta { width: 100% !important; justify-content: center !important; }
        }

        /* ─ TAB row spacing on mobile ─ */
        @media (max-width: 640px) {
          .tabs-row { margin-bottom: 32px !important; gap: 6px !important; }
          .tabs-row button { padding: 7px 16px !important; font-size: 11px !important; }
        }

        /* ─ Section header gap reduction on mobile ─ */
        @media (max-width: 640px) {
          .section-header-gap { margin-bottom: 36px !important; }
        }

        /* ─ Hero frame: use simple width on mobile ─ */
        @media (max-width: 768px) {
          .hero-frame { width: 100% !important; }
        }

        /* ─ Hero headline: allow wrap on very small screens ─ */
        @media (max-width: 360px) {
          .hero-nowrap { white-space: normal !important; }
        }

        /* ─ PREMIUM ANIMATIONS ─ */
        @keyframes ctaGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(0,229,160,0.3), 0 4px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 50px rgba(0,229,160,0.55), 0 0 80px rgba(0,229,160,0.15), 0 4px 20px rgba(0,0,0,0.3); }
        }
        @keyframes glowPulse {
          0%, 100% { text-shadow: 0 0 30px rgba(0,229,160,0.3); }
          50% { text-shadow: 0 0 50px rgba(0,229,160,0.5), 0 0 80px rgba(0,229,160,0.2); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); filter: blur(3px); }
          to { opacity: 1; transform: none; filter: blur(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }

        /* ─ Overflow guard ─ */
        .landing-root { overflow-x: hidden; }
      `}</style>
      <GlobalMouseGlow />
      <NavBar onStart={onStart} />
      <HeroSection onStart={onStart} />
      <TradeSupportSection onStart={onStart} />
      <NormTimeSection />
      <AISection />
      <PDFOutputSection />
      <HowSection />
      <FeaturesSection />
      <PricingSection />
      <FAQSection />
      <CTASection onStart={onStart} />
      <Footer />
    </div>
  )
}
