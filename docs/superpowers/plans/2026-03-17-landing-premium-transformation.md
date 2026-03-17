# Landing Page Premium Transformation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Landing.jsx from "AI template" level to enterprise SaaS quality with cinematic hero, 3D tilt cards, interactive timeline, upgraded pricing, and micro-animations.

**Architecture:** Single-file transformation of `src/Landing.jsx` (~2269 lines). All new components (BlueprintBackground, StaggerText, AnimatedCounter, TiltCard, HowItWorks timeline, FloatingDecor) are defined inline following the existing pattern. No external dependencies added — pure CSS keyframes + IntersectionObserver + React state.

**Tech Stack:** React, inline styles, CSS keyframes, IntersectionObserver API

**Spec:** `docs/superpowers/specs/2026-03-17-landing-premium-transformation-design.md`

---

## File Map

- **Modify:** `src/Landing.jsx` — all changes in this single file

### New components to add (all inside Landing.jsx):
| Component | Purpose |
|-----------|---------|
| `BlueprintBackground` | Extracted blueprint-only SVG from TakeoffAnimation (no HUD panel) for hero bg |
| `StaggerText` | Word-by-word reveal animation using IntersectionObserver |
| `AnimatedCounter` | Scroll-triggered count-up animation for STATS values |
| `TiltCard` | 3D perspective tilt + light-spot on mouse hover |
| `FloatingDecor` | Faint geometric shapes with float animation |
| `GradientSeparator` | Gradient line section divider |

### Components to modify:
| Component | Change |
|-----------|--------|
| `HeroSection` | Full restructure: blueprint bg, stagger text, CTA glow, stats bar |
| `FeaturesSection` | Wrap cards in TiltCard |
| `HowSection` | Replace vertical list with horizontal interactive timeline (vertical on mobile) |
| `TradeSupportSection` | Already has animated tab; just confirm key={active} animation works |
| `PricingSection` | Dramatic visual upgrade: glow border, large price, badge, guarantee |
| `FAQSection` | Smooth accordion via grid-template-rows transition |
| `CTASection` | Upgrade with glow bg, larger CTA, ctaGlow animation |
| `Landing` (main) | Add gradient separators, alternating section backgrounds |

---

## Chunk 1: Foundation — Keyframes + Utility Components

### Task 1: Add new CSS keyframes to the embedded style block

**Files:**
- Modify: `src/Landing.jsx:2098-2253` (the `<style>` block inside the Landing component)

- [ ] **Step 1: Add keyframes before the closing backtick of the style block**

Add these keyframes inside the existing `<style>{...}` tag, just before the `/* ─ Overflow guard ─ */` comment (around line 2251):

```css
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
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/horvathadam/Desktop/-raj-nlat.DWG-main 5" && npm run build 2>&1 | tail -3`
Expected: `✓ built in` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): add premium animation keyframes (ctaGlow, glowPulse, fadeUp, float)"
```

### Task 2: Add StaggerText component

**Files:**
- Modify: `src/Landing.jsx` — add after the FadeIn component (after line 42)

- [ ] **Step 1: Add StaggerText component**

Insert after the closing `}` of FadeIn (line 42):

```jsx
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Clean build (component defined but not yet used is fine with Vite)

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): add StaggerText word-by-word reveal component"
```

### Task 3: Add AnimatedCounter component

**Files:**
- Modify: `src/Landing.jsx` — add after StaggerText

- [ ] **Step 1: Add AnimatedCounter component**

Insert after StaggerText:

```jsx
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): add AnimatedCounter scroll-triggered count-up component"
```

### Task 4: Add TiltCard component

**Files:**
- Modify: `src/Landing.jsx` — add after AnimatedCounter

- [ ] **Step 1: Add TiltCard component**

```jsx
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
```

- [ ] **Step 2: Add GradientSeparator and FloatingDecor utility components**

```jsx
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
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): add TiltCard, GradientSeparator, FloatingDecor components"
```

---

## Chunk 2: Hero Section Cinematic Upgrade

### Task 5: Extract BlueprintBackground from TakeoffAnimation

**Files:**
- Modify: `src/Landing.jsx` — add new component after TakeoffAnimation (after line 390)

- [ ] **Step 1: Create BlueprintBackground component**

This is the TakeoffAnimation SVG with the UI panel group removed (lines 304-387 of the original). Add after line 390:

```jsx
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
        {/* Walls */}
        <path className="bp-bg-wall" d="M50,50 L50,600 L400,600 L400,400 L800,400 L800,50 L50,50 Z" />
        <path className="bp-bg-wall" d="M400,600 L800,600 L800,400" />
        <line className="bp-bg-wall" x1="400" y1="50" x2="400" y2="400" />

        {/* Partitions */}
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="200" y1="50" x2="200" y2="600" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="50"  y1="300" x2="400" y2="300" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="600" y1="50"  x2="600" y2="400" />
        <line stroke="#132A1E" strokeWidth="1.5" strokeDasharray="10,5" x1="400" y1="500" x2="800" y2="500" />

        {/* Door arcs */}
        <path stroke="#1A3828" strokeWidth="1.5" fill="none" d="M50,300 Q80,270 110,300" />
        <path stroke="#1A3828" strokeWidth="1.5" fill="none" d="M400,400 Q430,370 460,400" />

        {/* Sockets */}
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

        {/* Switches */}
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

        {/* Lamps */}
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

        {/* Scanner beam — slower (10s) with stronger glow */}
        <rect className="bp-bg-beam bp-bg-scan-anim" x="-20" y="0" width="40" height="700" />
        <line className="bp-bg-scan-anim" x1="20" y1="0" x2="20" y2="700"
          stroke="#00E5A0" strokeWidth="1.5" opacity="0.9" />
      </g>
    </svg>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): extract BlueprintBackground from TakeoffAnimation (no HUD panel)"
```

### Task 6: Rewrite HeroSection with cinematic layout

**Files:**
- Modify: `src/Landing.jsx` — replace the entire HeroSection function (lines 717-791)

- [ ] **Step 1: Replace HeroSection**

Replace the entire `function HeroSection({ onStart })` through its closing `}` with:

```jsx
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

          {/* Headline with stagger animation */}
          <h1 style={{ fontFamily: 'Syne', fontWeight: 900, lineHeight: 1.05, fontSize: 'clamp(28px, 4vw, 52px)', color: '#F0F0F0', marginBottom: 16, letterSpacing: '-0.03em' }}>
            <StaggerText text="DXF-ből profi árajánlat" style={{ display: 'block' }} />
            <span style={{ display: 'block', color: '#00E5A0', animation: 'glowPulse 3s ease-in-out infinite' }}>
              <StaggerText text="2 perc alatt" delay={0.36} />
            </span>
          </h1>

          {/* Subtext */}
          <FadeIn delay={0.5}>
            <p style={{ fontFamily: 'DM Mono', fontSize: 'clamp(12px, 1.3vw, 15px)', color: '#999', lineHeight: 1.75, maxWidth: 520, margin: '0 auto 28px' }}>
              Töltsd fel a villamossági tervet, az alkalmazás automatikusan megszámolja a szerelvényeket, és generál egy profi PDF ajánlatot.
            </p>
          </FadeIn>

          {/* CTA buttons */}
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

          {/* Hero animation frame — kept from original */}
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
```

- [ ] **Step 2: Add responsive CSS for the stats bar in the style block**

In the `<style>` tag, add after the existing hero mobile rules:

```css
/* ─ HERO stats bar ─ */
@media (max-width: 640px) {
  .hero-stats-bar { grid-template-columns: repeat(2, 1fr) !important; }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -3`
Expected: Clean build

- [ ] **Step 4: Run dev server and visually check**

Run: `npm run dev`
Check: Hero has full-viewport blueprint background, stagger text animation, glowing CTA, stats bar at bottom.

- [ ] **Step 5: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): cinematic hero — blueprint bg, stagger text, CTA glow, stats counter bar"
```

---

## Chunk 3: Feature Cards + Timeline + Pricing + FAQ + Final CTA

### Task 7: Upgrade FeaturesSection with TiltCard

**Files:**
- Modify: `src/Landing.jsx` — the FeaturesSection function

- [ ] **Step 1: Replace feature card wrapper with TiltCard**

In FeaturesSection, replace the card `<div>` (the one with `background: '#0D0D0D'`) and its hover handlers with a TiltCard. Replace the entire map callback content:

Find the existing feature card div (lines ~1193-1201) and replace the card with:

```jsx
<FadeIn key={i} delay={i * 0.08}>
  <TiltCard style={{ height: '100%' }}>
    <div style={{ width: 40, height: 40, background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
      <SvgIcon path={f.icon} size={18} />
    </div>
    <h3 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17, color: '#F0F0F0', marginBottom: 10 }}>{f.title}</h3>
    <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.75 }}>{f.desc}</p>
  </TiltCard>
</FadeIn>
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): feature cards with 3D tilt + light-spot hover effect"
```

### Task 8: Rewrite HowSection as horizontal interactive timeline

**Files:**
- Modify: `src/Landing.jsx` — replace the entire HowSection function

- [ ] **Step 1: Replace HowSection**

Replace the entire `function HowSection()` through its closing `}` with:

```jsx
function HowSection() {
  const [active, setActive] = useState(0)
  return (
    <section id="how" className="sec-100" style={{ padding: '100px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.12em', marginBottom: 16, textTransform: 'uppercase' }}>Hogyan működik</div>
            <h2 style={{ fontFamily: 'Syne', fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', color: '#F0F0F0', letterSpacing: '-0.02em' }}>5 lépés, 2 perc</h2>
          </div>
        </FadeIn>

        {/* Desktop: horizontal timeline */}
        <div className="how-timeline-desktop">
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, maxWidth: 800, margin: '0 auto 48px', position: 'relative' }}>
            {/* Background line */}
            <div style={{ position: 'absolute', top: 20, left: '10%', right: '10%', height: 2, background: 'rgba(255,255,255,0.04)' }} />
            {/* Active line */}
            <div style={{ position: 'absolute', top: 20, left: '10%', height: 2, background: '#00E5A0', width: `${(active / 4) * 80}%`, transition: 'width 0.5s cubic-bezier(.16,1,.3,1)', boxShadow: '0 0 10px rgba(0,229,160,0.3)' }} />

            {STEPS.map((s, i) => (
              <div key={i} onClick={() => setActive(i)} style={{ flex: 1, textAlign: 'center', cursor: 'pointer', position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', margin: '0 auto 12px',
                  background: i <= active ? '#00E5A0' : 'rgba(255,255,255,0.05)',
                  color: i <= active ? '#0A0A0A' : 'rgba(255,255,255,0.3)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono',
                  transition: 'all 0.3s',
                  boxShadow: i === active ? '0 0 20px rgba(0,229,160,0.4)' : 'none',
                }}>{s.n}</div>
                <div style={{ fontSize: 12, color: i === active ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 600, transition: 'color 0.3s', fontFamily: 'DM Mono' }}>{s.title}</div>
              </div>
            ))}
          </div>

          {/* Active step description */}
          <div key={active} style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', animation: 'fadeUp 0.4s ease both' }}>
            <p style={{ fontSize: 'clamp(14px, 1.4vw, 17px)', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, fontWeight: 300, fontFamily: 'DM Mono' }}>{STEPS[active].desc}</p>
          </div>
        </div>

        {/* Mobile: vertical timeline */}
        <div className="how-timeline-mobile">
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 2, background: 'linear-gradient(to bottom, transparent, rgba(0,229,160,0.15) 10%, rgba(0,229,160,0.15) 90%, transparent)' }} />
            {STEPS.map((s, i) => (
              <div key={i} onClick={() => setActive(i)} style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start', cursor: 'pointer' }}>
                <div style={{
                  width: 40, height: 40, flexShrink: 0, borderRadius: '50%',
                  background: i === active ? '#00E5A0' : 'rgba(255,255,255,0.05)',
                  color: i === active ? '#0A0A0A' : 'rgba(255,255,255,0.3)',
                  display: 'grid', placeItems: 'center',
                  fontFamily: 'DM Mono', fontSize: 14, fontWeight: 700,
                  transition: 'all 0.3s', position: 'relative', zIndex: 1,
                  boxShadow: i === active ? '0 0 20px rgba(0,229,160,0.4)' : 'none',
                }}>{s.n}</div>
                <div style={{ paddingTop: 6 }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: i === active ? '#fff' : '#888', marginBottom: 6, transition: 'color 0.3s' }}>{s.title}</div>
                  {i === active && <div key={active} style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, animation: 'fadeUp 0.3s ease both' }}>{s.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add responsive CSS for timeline desktop/mobile toggle**

Add to the `<style>` block:

```css
/* ─ HOW timeline responsive ─ */
.how-timeline-mobile { display: none; }
.how-timeline-desktop { display: block; }
@media (max-width: 640px) {
  .how-timeline-mobile { display: block !important; }
  .how-timeline-desktop { display: none !important; }
}
```

- [ ] **Step 3: Remove old HOW step responsive rules**

Remove the old `.step-row`, `.step-num`, `.step-line` responsive rules from the style block (they are no longer used).

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -3`

- [ ] **Step 5: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): horizontal interactive timeline with mobile vertical fallback"
```

### Task 9: Upgrade PricingSection

**Files:**
- Modify: `src/Landing.jsx` — replace the PricingSection function

- [ ] **Step 1: Replace PricingSection**

Replace the entire `function PricingSection()` through its closing `}` with:

```jsx
function PricingSection() {
  return (
    <section id="pricing" className="sec-100" style={{ padding: '100px 24px', position: 'relative', zIndex: 1 }}>
      {/* Floating decor */}
      <FloatingDecor top="10%" left="15%" size={7} delay={1} />
      <FloatingDecor top="80%" left="82%" size={5} delay={2.5} />

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

        <FadeIn delay={0.1}>
          <div className="pricing-card" style={{
            maxWidth: 480, margin: '0 auto',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(0,229,160,0.12)',
            borderRadius: 20, padding: '48px 40px',
            position: 'relative',
            boxShadow: '0 0 60px rgba(0,229,160,0.06), 0 20px 60px rgba(0,0,0,0.3)',
          }}>
            {/* Badge */}
            <div className="pricing-badge" style={{
              position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
              background: '#00E5A0', color: '#0A0A0A', padding: '6px 20px', borderRadius: 20,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'Syne', whiteSpace: 'nowrap',
            }}>Teljes csomag</div>

            {/* Contact CTA */}
            <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 32 }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#00E5A0', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>TakeoffPro</div>
              <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#aaa', lineHeight: 1.75, marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>
                Pontos árakért érdeklődjön – személyre szabott ajánlatot adunk.
              </p>
              <a href="tel:+36305252336" className="pricing-phone-cta"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '16px 28px', borderRadius: 10,
                  background: '#00E5A0', color: '#0A0A0A',
                  textDecoration: 'none', fontFamily: 'Syne', fontWeight: 700, fontSize: 15,
                  boxShadow: '0 0 30px rgba(0,229,160,0.3)',
                  animation: 'ctaGlow 3s ease-in-out infinite',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.64 3.42 2 2 0 0 1 3.62 1.25h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/>
                </svg>
                +36 30 525 2336
              </a>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#444', marginTop: 12 }}>
                Hétfő–Péntek · 8:00–17:00
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,229,160,0.08), transparent)', marginBottom: 24 }} />

            {/* Feature list with stagger */}
            {PLAN.features.map((f, i) => (
              <FadeIn key={i} delay={i * 0.04}>
                <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: '#00E5A0', fontSize: 16, flexShrink: 0 }}>✓</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'DM Mono' }}>{f}</span>
                </div>
              </FadeIn>
            ))}

            {/* Guarantee */}
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'DM Mono' }}>
              Nincs bankkártya · Nincs elköteleződés · Azonnal lemondható
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): pricing section dramatic upgrade — glow border, badge, guarantee"
```

### Task 10: Smooth FAQ accordion + Upgraded CTASection

**Files:**
- Modify: `src/Landing.jsx` — replace FAQSection and CTASection

- [ ] **Step 1: Replace FAQSection with smooth grid-template-rows accordion**

Replace the entire `function FAQSection()` through its closing `}`:

```jsx
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
            <div style={{ borderBottom: '1px solid #181818', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(open === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                <span className="faq-question" style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 600, color: open === i ? '#00E5A0' : '#DDD', transition: 'color 0.2s' }}>{item.q}</span>
                <span style={{ color: open === i ? '#00E5A0' : '#555', fontSize: 20, transition: 'transform 0.3s, color 0.2s', transform: open === i ? 'rotate(45deg)' : 'none', flexShrink: 0 }}>+</span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateRows: open === i ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.3s ease',
              }}>
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#888', lineHeight: 1.8, paddingBottom: open === i ? 20 : 0, transition: 'padding-bottom 0.3s ease' }}>{item.a}</p>
                </div>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Replace CTASection with dramatic upgrade**

Replace the entire `function CTASection({ onStart })` through its closing `}`:

```jsx
function CTASection({ onStart }) {
  return (
    <section className="cta-section" style={{ padding: '100px 24px', textAlign: 'center', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      {/* Background glow */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.06), transparent 70%)', pointerEvents: 'none' }} />

      <FadeIn>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, color: '#00E5A0', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16, fontFamily: 'DM Mono' }}>Készen állsz?</div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontFamily: 'Syne', fontWeight: 800, letterSpacing: '-0.03em', maxWidth: 600, margin: '0 auto 16px', color: '#F0F0F0' }}>
            Az első profi ajánlatod <span style={{ color: '#00E5A0' }}>2 percre van</span>
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.35)', marginBottom: 32, fontFamily: 'DM Mono' }}>14 napos ingyenes próba · Nem kell bankkártya</p>
          <button onClick={onStart} className="cta-btn" style={{
            padding: '18px 48px', background: '#00E5A0', color: '#0A0A0A', border: 'none',
            borderRadius: 10, fontSize: 17, fontWeight: 700, fontFamily: 'Syne', cursor: 'pointer',
            boxShadow: '0 0 40px rgba(0,229,160,0.35), 0 4px 20px rgba(0,0,0,0.3)',
            animation: 'ctaGlow 3s ease-in-out infinite', transition: 'transform 0.2s',
          }}
            onMouseEnter={e => e.target.style.transform = 'translateY(-3px) scale(1.02)'}
            onMouseLeave={e => e.target.style.transform = 'none'}>
            Indítsd el az ingyenes próbát →
          </button>
        </div>
      </FadeIn>
    </section>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): smooth FAQ accordion (grid-template-rows) + dramatic final CTA"
```

---

## Chunk 4: Micro-Animations + Polish + Deploy

### Task 11: Add gradient separators and alternating section backgrounds

**Files:**
- Modify: `src/Landing.jsx` — the main Landing component (export default)

- [ ] **Step 1: Add GradientSeparator between sections and alternating backgrounds**

In the main `Landing` component (around line 2095), update the section rendering to include gradient separators and alternating backgrounds. Wrap alternating sections in a div with subtle background:

```jsx
export default function Landing({ onStart }) {
  return (
    <div className="landing-root" style={{ background: '#0A0A0A', color: '#F0F0F0', minHeight: '100vh', position: 'relative' }}>
      <style>{`
        /* ... existing styles ... */
      `}</style>
      <GlobalMouseGlow />
      <NavBar onStart={onStart} />
      <HeroSection onStart={onStart} />
      <GradientSeparator />
      <TradeSupportSection onStart={onStart} />
      <GradientSeparator />
      <div style={{ background: 'rgba(255,255,255,0.008)' }}>
        <NormTimeSection />
      </div>
      <GradientSeparator />
      <AISection />
      <GradientSeparator />
      <div style={{ background: 'rgba(255,255,255,0.008)' }}>
        <PDFOutputSection />
      </div>
      <GradientSeparator />
      <HowSection />
      <GradientSeparator />
      <div style={{ background: 'rgba(255,255,255,0.008)' }}>
        <FeaturesSection />
      </div>
      <GradientSeparator />
      <PricingSection />
      <GradientSeparator />
      <div style={{ background: 'rgba(255,255,255,0.008)' }}>
        <FAQSection />
      </div>
      <GradientSeparator />
      <CTASection onStart={onStart} />
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/Landing.jsx
git commit -m "feat(landing): gradient separators + alternating section backgrounds"
```

### Task 12: Final build + branch push for preview

- [ ] **Step 1: Run full build**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build

- [ ] **Step 2: Run vitest**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass (Landing.jsx has no tests; ensure nothing else broke)

- [ ] **Step 3: Create preview branch and push**

```bash
git checkout -b preview/landing-upgrade
git push origin preview/landing-upgrade
```

- [ ] **Step 4: Report to user**

Tell user: "A `preview/landing-upgrade` branch kész és push-olva. Nézd meg a Vercel preview deployment-et és adj visszajelzést mielőtt main-be mergelnénk."
