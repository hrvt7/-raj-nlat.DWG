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

// ─── Hero Trade Animation Cards ───────────────────────────────────────────────

const HERO_TRADES = [
  {
    id: 'es', color: '#FFD166', bg: '#06050A',
    badge: 'ERŐSÁRAM', filename: 'elosztas.dxf',
    rows: [
      { label: 'DUGALJ (DB)', val: '12', d: 0.6 },
      { label: 'KAPCSOLÓ (DB)', val: '07', d: 1.2 },
      { label: 'LÁMPA (DB)', val: '18', d: 1.8 },
    ],
    total: '37',
  },
  {
    id: 'ga', color: '#4CC9F0', bg: '#02070D',
    badge: 'GYENGEÁRAM', filename: 'gyengaram.dxf',
    rows: [
      { label: 'ADATPONT (DB)', val: '08', d: 0.6 },
      { label: 'KAMERA (DB)', val: '04', d: 1.2 },
      { label: 'BELÉPTETŐRENDSZER', val: '03', d: 1.8 },
    ],
    total: '15',
  },
  {
    id: 'tz', color: '#FF6B6B', bg: '#090304',
    badge: 'TŰZJELZŐ', filename: 'tuzjelzo.dxf',
    rows: [
      { label: 'ÉRZÉKELŐ (DB)', val: '14', d: 0.6 },
      { label: 'KÉZ. JELZÉSADÓ', val: '03', d: 1.2 },
      { label: 'SZIRÉNA (DB)', val: '06', d: 1.8 },
    ],
    total: '23',
  },
]

function HeroTradeCard({ id, color, bg, badge, filename, rows, total }) {
  const corners = [
    { top: 0, left: 0, borderTop: `1.5px solid ${color}`, borderLeft: `1.5px solid ${color}`, borderRadius: '4px 0 0 0' },
    { top: 0, right: 0, borderTop: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}`, borderRadius: '0 4px 0 0' },
    { bottom: 0, left: 0, borderBottom: `1.5px solid ${color}`, borderLeft: `1.5px solid ${color}`, borderRadius: '0 0 0 4px' },
    { bottom: 0, right: 0, borderBottom: `1.5px solid ${color}`, borderRight: `1.5px solid ${color}`, borderRadius: '0 0 4px 0' },
  ]
  return (
    <div style={{
      position: 'relative', borderRadius: 12, overflow: 'hidden',
      border: `1px solid ${color}20`, background: bg,
      boxShadow: `0 0 0 1px #090909, 0 8px 32px rgba(0,0,0,0.55), 0 0 28px ${color}08`,
    }}>
      {corners.map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 14, height: 14, opacity: 0.55, zIndex: 2, ...s }} />
      ))}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 180"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', display: 'block' }}>
        <rect width="1600" height="3" fill={color} opacity="0.75" />
        <pattern id={`hg-${id}`} width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 80 0 L 0 0 0 80" fill="none" stroke={color} strokeWidth="0.5" opacity="0.03"/>
        </pattern>
        <rect width="1600" height="180" fill={`url(#hg-${id})`} />
        <circle cx="44" cy="42" r="5.5" fill={color}>
          <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
        </circle>
        <text x="62" y="49" fontFamily="'DM Mono',monospace" fontSize="20" fontWeight="bold"
          fill="#B8CAC0" letterSpacing="2.5">{badge}</text>
        <text x="340" y="49" fontFamily="'DM Mono',monospace" fontSize="14"
          fill={color} opacity="0.32" letterSpacing="2">SCANNING...</text>
        <rect x="1310" y="24" width="252" height="30" rx="5"
          fill={color} fillOpacity="0.07" stroke={color} strokeOpacity="0.18" strokeWidth="1" />
        <text x="1436" y="45" textAnchor="middle" fontFamily="'DM Mono',monospace" fontSize="14"
          fill={color} opacity="0.6" letterSpacing="1">{filename}</text>
        <line x1="44" y1="68" x2="1556" y2="68" stroke={color} strokeWidth="0.5" opacity="0.14" />
        {rows.map((row, i) => (
          <g key={i} transform={`translate(${44 + i * 510}, 86)`}>
            <text fontFamily="'DM Mono',monospace" fontSize="20" fill="#2C4838"
              letterSpacing="1.5" y="0">{row.label}</text>
            <text fontFamily="'DM Mono',monospace" fontSize="54" fill="#162A1C" y="76">
              00
              <animate attributeName="opacity" values="1;0" dur="7s"
                begin={`${row.d}s`} fill="freeze" repeatCount="indefinite" />
            </text>
            <text fontFamily="'DM Mono',monospace" fontSize="54" fill={color} y="76" opacity="0">
              {row.val}
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.86;1"
                dur="7s" begin={`${row.d}s`} fill="freeze" repeatCount="indefinite" />
            </text>
          </g>
        ))}
        <g transform="translate(1380, 86)">
          <text fontFamily="'DM Mono',monospace" fontSize="16" fill="#1E3828"
            letterSpacing="2" y="0">ÖSSZES TÉTEL</text>
          <text fontFamily="'DM Mono',monospace" fontSize="48" fill={color} y="76" opacity="0"
            style={{ filter: `drop-shadow(0 0 12px ${color}70)` }}>
            {total}
            <animate attributeName="opacity" values="0;0;1;1;0"
              keyTimes="0;0.35;0.48;0.88;1" dur="7s" begin="0s" repeatCount="indefinite" />
          </text>
        </g>
        <line x1="44" y1="170" x2="1556" y2="170" stroke={color} strokeWidth="0.5" opacity="0.07" />
      </svg>
    </div>
  )
}

function HeroTradeStack() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 880, margin: '0 auto' }}>
      {HERO_TRADES.map(t => <HeroTradeCard key={t.id} {...t} />)}
    </div>
  )
}

function HeroSection({ onStart }) {
  return (
    <section className="hero-section" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, overflow: 'hidden', padding: '120px 48px 80px' }}>

      {/* Subtle grid bg */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.025, backgroundImage: 'linear-gradient(#00E5A0 1px, transparent 1px), linear-gradient(90deg, #00E5A0 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      {/* Radial glow center */}
      <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(0,229,160,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', textAlign: 'center' }}>

        {/* ── Badge ── */}
        <FadeIn>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.18)', borderRadius: 999, padding: '6px 16px', marginBottom: 28 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 8px #00E5A0' }} />
            <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Villamos kivitelezőknek</span>
          </div>
        </FadeIn>

        {/* ── Headline ── */}
        <FadeIn delay={0.05}>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 900, lineHeight: 1.05, fontSize: 'clamp(38px, 5.5vw, 72px)', color: '#F0F0F0', marginBottom: 24, letterSpacing: '-0.03em' }}>
            DXF-ből profi árajánlat
            <br />
            <span style={{ color: '#00E5A0', textShadow: '0 0 50px rgba(0,229,160,0.35)' }}>2 perc alatt</span>
          </h1>
        </FadeIn>

        {/* ── Subtext ── */}
        <FadeIn delay={0.12}>
          <p style={{ fontFamily: 'DM Mono', fontSize: 'clamp(13px, 1.5vw, 16px)', color: '#999', lineHeight: 1.9, marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
            Töltsd fel a villamossági tervet, az alkalmazás automatikusan megszámolja<br className="hero-br" />
            a szerelvényeket, és generál egy profi PDF ajánlatot.
          </p>
        </FadeIn>

        {/* ── CTAs ── */}
        <FadeIn delay={0.2}>
          <div className="hero-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 64 }}>
            <button onClick={onStart} style={{ padding: '15px 36px', background: '#00E5A0', color: '#0A0A0A', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 800, fontSize: 16, boxShadow: '0 0 40px rgba(0,229,160,0.3)', transition: 'all 0.2s' }}
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

        {/* ── Trade result cards – all 3 specialties ── */}
        <FadeIn delay={0.25}>
          <HeroTradeStack />
        </FadeIn>

      </div>
    </section>
  )
}

// ─── Trade Support Section ─────────────────────────────────────────────────────

function GyengeAramSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" width="100%" height="100%">
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
    reverse: true,
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
  return (
    <section id="trades" style={{ background: '#050505', position: 'relative', zIndex: 1, paddingBottom: 0 }}>
      {/* ── Section header ── */}
      <div style={{ textAlign: 'center', padding: '100px 24px 80px' }}>
        <FadeIn>
          <div style={{
            display: 'inline-block', marginBottom: 20,
            background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.18)',
            borderRadius: 100, padding: '6px 18px',
            fontFamily: 'DM Mono', fontSize: 11, letterSpacing: '0.12em',
            color: '#00E5A0', textTransform: 'uppercase',
          }}>
            Szakterületek
          </div>
          <h2 style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(28px, 5vw, 52px)',
            color: '#F0F0F0', lineHeight: 1.1, letterSpacing: '-0.03em',
            marginBottom: 20,
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
        </FadeIn>
      </div>

      {/* ── Trade blocks ── */}
      {TRADE_BLOCKS.map((trade, i) => (
        <div key={trade.id} style={{
          borderTop: '1px solid #111',
          background: i % 2 === 0 ? '#050505' : '#060606',
        }}>
          <div style={{
            maxWidth: 1280, margin: '0 auto', padding: '80px 48px',
            display: 'grid',
            gridTemplateColumns: trade.reverse ? '1fr 1fr' : '1fr 1fr',
            gap: 72, alignItems: 'center',
          }} className="trade-block-grid">

            {/* Text column – left for !reverse, right for reverse */}
            {!trade.reverse && (
              <FadeIn delay={0.1}>
                <TradeTextBlock trade={trade} />
              </FadeIn>
            )}

            {/* SVG column */}
            <FadeIn delay={0.2}>
              <div style={{
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
            </FadeIn>

            {/* Text column – right side for reverse */}
            {trade.reverse && (
              <FadeIn delay={0.1}>
                <TradeTextBlock trade={trade} />
              </FadeIn>
            )}
          </div>
        </div>
      ))}
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
    <section className="sec-100" style={{ padding: '100px 24px', background: '#050505', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(0,229,160,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }} className="normtime-grid">

          {/* Left: explanation */}
          <FadeIn>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>
              Normaidő Kalkuláció
            </div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(26px, 4vw, 42px)', color: '#F0F0F0', letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
              Nem becsül –<br />
              <span style={{ color: '#00E5A0' }}>pontosan számol</span>
            </h2>
            <p style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#888', lineHeight: 1.85, marginBottom: 32 }}>
              60+ normaidő-adat, tételenként. Minden sorhoz beállítható a falanyag (GK / Ytong / Tégla / Beton) – a munkadíj pontosan tükrözi a valós beépítési körülményeket.
            </p>

            {/* Feature bullets */}
            {[
              ['Tételszintű falanyag', 'GK / Ytong / Tégla / Beton – soronként, nem globálisan'],
              ['Projekt szorzók', 'Hozzáférhetőség, magasság, projekt típus – az egész projektre'],
              ['60+ tétel', 'Magyar elektromos normák alapján előre feltöltve'],
              ['Saját normák', 'Szerkeszthető és bővíthető a Beállításokban'],
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
            <div className="anim-frame-32" style={{
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
      <div style={{ position: 'absolute', right: '15%', top: '50%', transform: 'translateY(-50%)', width: 500, height: 400, background: 'radial-gradient(ellipse, rgba(0,229,160,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

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
          <div style={{
            background: 'linear-gradient(145deg, #0C1C15 0%, #08120E 100%)',
            border: '1px solid rgba(0,229,160,0.28)',
            borderRadius: 24, padding: '44px 44px 40px',
            position: 'relative',
            boxShadow: '0 0 80px rgba(0,229,160,0.08)',
          }}>
            {/* Top badge */}
            <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#00E5A0', color: '#0A0A0A', fontFamily: 'Syne', fontWeight: 800, fontSize: 10, padding: '4px 20px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.1em' }}>
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
                <a href="tel:+36305252336"
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
      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444' }}>© 2025 TakeoffPro · Villamossági árajánlat rendszer</span>
    </footer>
  )
}

export default function Landing({ onStart }) {
  return (
    <div style={{ background: '#0A0A0A', color: '#F0F0F0', minHeight: '100vh', position: 'relative' }}>
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

        /* ─ TWO-COLUMN grids ─ */
        @media (max-width: 900px) {
          .hero-grid        { grid-template-columns: 1fr !important; gap: 36px !important; }
          .two-col-grid     { grid-template-columns: 1fr !important; gap: 36px !important; }
          .normtime-grid    { grid-template-columns: 1fr !important; gap: 36px !important; }
          .pdf-section-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .trade-block-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
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
        @media (max-width: 640px) {
          .anim-frame-169 { aspect-ratio: 4/3 !important; }
          .anim-frame-32  { aspect-ratio: 4/3 !important; }
        }

        /* ─ Mouse glow: hide on touch devices ─ */
        @media (hover: none) { #mouse-glow { display: none !important; } }

        /* ─ Pricing toggle ─ */
        @media (max-width: 400px) {
          .billing-toggle button { padding: 6px 12px !important; font-size: 11px !important; }
        }
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
