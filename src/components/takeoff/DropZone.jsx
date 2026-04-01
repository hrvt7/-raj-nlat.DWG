import React, { useState, useRef } from 'react'
import { C } from './designTokens.js'

// ─── File drop zone ───────────────────────────────────────────────────────────
export default function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  const handleChange = (e) => { if (e.target.files[0]) onFile(e.target.files[0]) }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        border: `2px dashed ${dragging ? C.accent : C.border}`,
        borderRadius: 16, background: dragging ? C.accentDim : C.bgCard,
        cursor: 'pointer', transition: 'all 0.2s', padding: 48, gap: 16,
      }}
    >
      {/* Animated upload SVG */}
      <div style={{ width: 160, height: 160, flexShrink: 0 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
          <style>{`
            .dz-grid-circle { stroke: rgba(255,255,255,0.18); stroke-width: 1; opacity: 0.4; fill: none; }
            .dz-ring-bg { stroke: rgba(255,255,255,0.18); stroke-width: 3; fill: none; stroke-dasharray: 4 8; }
            .dz-ring-progress {
              stroke: #21F3A3; stroke-width: 4; fill: none; stroke-linecap: round;
              stroke-dasharray: 350; filter: url(#dz-glow-ring);
              animation: dz-spin-load 3s ease-in-out infinite;
              transform-origin: 256px 224px;
            }
            .dz-upload-arrow {
              stroke: #17C7FF; stroke-width: 4; fill: none; stroke-linecap: round; stroke-linejoin: round;
              animation: dz-float 3s ease-in-out infinite;
            }
            .dz-data-line { stroke: rgba(255,255,255,0.18); stroke-width: 2; fill: none; }
            .dz-data-pulse {
              stroke: #21F3A3; stroke-width: 2; fill: none; stroke-linecap: round;
              stroke-dasharray: 15 50; animation: dz-up-flow 2s linear infinite;
            }
            @keyframes dz-spin-load {
              0% { stroke-dashoffset: 350; transform: rotate(-90deg); }
              60% { stroke-dashoffset: 0; transform: rotate(270deg); }
              100% { stroke-dashoffset: 350; transform: rotate(270deg); }
            }
            @keyframes dz-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes dz-up-flow {
              0% { stroke-dashoffset: 65; }
              100% { stroke-dashoffset: 0; }
            }
          `}</style>
          <defs>
            <pattern id="dz-grid3" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M 64 0 L 0 0 0 64" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" fill="none" opacity="0.5"/>
            </pattern>
            <filter id="dz-glow-ring" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <rect width="512" height="512" fill="url(#dz-grid3)" />
          <circle cx="256" cy="224" r="180" className="dz-grid-circle" />
          <circle cx="256" cy="224" r="120" className="dz-grid-circle" />
          <path d="M 196 336 L 316 336 M 226 352 L 286 352" stroke="#17C7FF" strokeWidth="3" strokeLinecap="round" />
          <circle cx="256" cy="224" r="72" className="dz-ring-bg" />
          <circle cx="256" cy="224" r="56" className="dz-ring-progress" />
          <g className="dz-upload-arrow">
            <path d="M 256 190 L 256 256" />
            <path d="M 230 216 L 256 190 L 282 216" />
          </g>
          <path d="M 256 368 L 256 512" className="dz-data-line" />
          <path d="M 256 368 L 256 512" className="dz-data-pulse" />
          <path d="M 226 368 L 226 512" className="dz-data-line" opacity="0.6"/>
          <path d="M 226 368 L 226 512" className="dz-data-pulse" style={{ animationDelay: '-0.5s' }}/>
          <path d="M 286 368 L 286 512" className="dz-data-line" opacity="0.6"/>
          <path d="M 286 368 L 286 512" className="dz-data-pulse" style={{ animationDelay: '-1s' }}/>
        </svg>
      </div>
      {/* Title with gradient matching SVG accent colours */}
      <div style={{
        fontFamily: 'Syne', fontWeight: 700, fontSize: 20,
        background: 'linear-gradient(90deg, #21F3A3 0%, #17C7FF 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        Húzd ide a tervrajzot
      </div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#17C7FF', opacity: 0.7, letterSpacing: '0.04em' }}>
        DXF, DWG vagy PDF formátum
      </div>
      <div style={{
        marginTop: 8, padding: '10px 28px', borderRadius: 10,
        background: 'linear-gradient(90deg, rgba(33,243,163,0.12) 0%, rgba(23,199,255,0.12) 100%)',
        border: '1px solid rgba(33,243,163,0.35)',
        fontFamily: 'Syne', fontWeight: 700, fontSize: 14,
        color: '#21F3A3',
      }}>
        Fájl választása
      </div>
      <input ref={inputRef} type="file" accept=".dxf,.dwg,.pdf" style={{ display: 'none' }} onChange={handleChange} />
    </div>
  )
}
