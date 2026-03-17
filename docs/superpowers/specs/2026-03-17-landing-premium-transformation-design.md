# Landing Page Premium Transformation — Design Spec

**Date:** 2026-03-17
**File:** `src/Landing.jsx` (single file, ~2270 lines, inline styles, React)
**Goal:** Transform the landing page from "AI template" level to enterprise SaaS quality (Notion/Linear/Vercel tier).

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| TakeoffAnimation hero background | Blueprint only (no HUD panel) | HUD text unreadable at 0.2 opacity, creates visual noise |
| Social proof testimonials | Skipped entirely | Fictitious quotes are unconvincing; add real ones later |
| FAQ accordion animation | CSS `grid-template-rows: 0fr → 1fr` | No magic max-height numbers, modern browser support |
| Timeline mobile layout | Vertical on <640px | More natural than horizontal scroll on small screens |

## Changes

### 1. Hero Section — Cinematic Upgrade

**Background:** Extract the blueprint portion of TakeoffAnimation (walls, doors, sockets, switches, lamps, scanner beam) into a standalone component. Render it as a full-viewport absolute-positioned background at opacity 0.2 with a gradient overlay for text readability.

**Text animation:** Hero headline rendered word-by-word with stagger animation (0.06s delay per word). Uses IntersectionObserver trigger. The "2 perc alatt" green text gets a glow pulse CSS animation.

**CTA button:** Larger padding (18px 40px), animated `ctaGlow` box-shadow that pulses between 30px and 50px spread.

**Stats counter bar:** STATS array moved to the bottom of the hero section. Each stat value animates upward (count-up) when scrolled into view using IntersectionObserver. Grid layout with 4 columns, glassmorphism background with backdrop-filter blur.

### 2. Feature Cards — 3D Tilt Effect

New `TiltCard` wrapper component:
- Tracks mouse position relative to card bounds
- Applies `perspective(800px) rotateY(x*10deg) rotateX(-y*10deg) scale(1.02)` on hover
- Radial gradient light spot follows cursor position
- Resets transform on mouse leave with 0.15s transition
- Cards appear with stagger delay (`i * 0.08`)

### 3. "Hogyan Működik" — Horizontal Interactive Timeline

Replace vertical step list with:
- Horizontal row of 5 clickable step circles connected by a progress line
- Active step highlighted with green fill + glow shadow
- Progress line fills from left to the active step position
- Step description panel below, animated with fade-up on change (`key={active}`)
- **Mobile (<640px):** Falls back to vertical layout with the same click interactivity

### 4. Trade Support — Animated Tab Switching

Current: 3 tabs render separate content blocks.
Change: Use `key={activeTab}` to trigger CSS fade animation on tab content swap. Single content area with animated transition instead of 3 stacked sections.

### 5. Pricing Section — Dramatic Upgrade

- Glow border: `1px solid rgba(0,229,160,0.12)` + `box-shadow: 0 0 60px rgba(0,229,160,0.06)`
- "Teljes csomag" badge positioned absolutely at top center
- Price displayed large: 56px Syne 800 weight
- Feature list items appear with stagger fade-in (`i * 0.04` delay)
- Guarantee text below CTA: "Nincs bankkártya · Nincs elköteleződés · Azonnal lemondható"

### 6. Final CTA Section (New — after FAQ, before Footer)

- Background glow ellipse (radial gradient, 600×300, centered)
- "Készen állsz?" label + large headline with green accent
- Trial description + CTA button with `ctaGlow` animation
- Fires same `onStart` handler as hero CTA

### 7. Micro-Animations (Cross-Cutting)

**Gradient section separators:** Replace solid borders with `linear-gradient(90deg, transparent, rgba(0,229,160,0.08), transparent)`.

**Alternating section backgrounds:** Even-indexed sections get `rgba(255,255,255,0.008)` background for subtle depth.

**Floating decorative elements:** Faint geometric shapes (circles, lines) around hero and pricing sections. CSS `float` animation (6s ease-in-out infinite, 12px vertical travel).

**FAQ smooth accordion:** Replace instant toggle with `grid-template-rows: 0fr → 1fr` CSS transition (0.3s ease). Overflow hidden on the inner wrapper.

**New keyframes:**
- `ctaGlow` — CTA button shadow pulse (3s)
- `textReveal` — word appear with blur clear (0.5s)
- `shimmer` — background position sweep (decorative)
- `countUp` — stat number appear with slide-up (0.6s)
- `float` — decorative element vertical bob (6s)

## What Does NOT Change

- Text content of FEATURES, STEPS, STATS, FAQ, PLAN arrays
- Syne + DM Mono font combination
- Color scheme: #0A0A0A background, #00E5A0 accent
- Navbar logo and structure
- SVG icon paths
- Overall section ordering (except stats move into hero, final CTA added)

## Deploy Strategy

- Push to `preview/landing-upgrade` branch (not main)
- Vercel preview deployment for review
- No merge until explicit approval received

## Files Changed

- `src/Landing.jsx` — all changes in this single file

## Implementation Notes

- No external animation libraries needed; all effects use CSS keyframes, transitions, and IntersectionObserver
- The blueprint-only background component is extracted from TakeoffAnimation by removing the HUD panel SVG group
- AnimatedCounter uses requestAnimationFrame for smooth number interpolation
- All new components (TiltCard, StaggerText, AnimatedCounter, HowItWorks timeline) are defined within Landing.jsx following the existing pattern
