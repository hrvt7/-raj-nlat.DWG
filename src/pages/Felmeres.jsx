import React, { useState, useRef, useEffect, useCallback } from 'react'
import { loadPlans, getPlanFile } from '../data/planStore.js'

// ─── Colors (matches app theme) ──────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', textSub: '#A1A1AA', textMuted: '#71717A',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
  bgHover: 'rgba(255,255,255,0.03)',
}

function fmt(n) {
  return Number(n || 0).toLocaleString('hu-HU')
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── PDF icon ─────────────────────────────────────────────────────────────────
function PdfIcon({ size = 20, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2z"/>
      <path d="M14 2v6h6"/>
      <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3zM15 13h-1v3h1M12 13v3"/>
    </svg>
  )
}

// ─── Felmérés page ────────────────────────────────────────────────────────────
export default function FelmeresPage({ onOpenFile }) {
  const [dragging, setDragging] = useState(false)
  const [pdfPlans, setPdfPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState(null)
  const inputRef = useRef(null)

  // Load previously saved PDF plans from planStore
  useEffect(() => {
    const plans = loadPlans()
    const pdfs = plans.filter(p => {
      const name = (p.name || p.fileName || '').toLowerCase()
      return name.endsWith('.pdf')
    })
    setPdfPlans(pdfs)
    setLoading(false)
  }, [])

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (files.length === 0) return
    onOpenFile(files[0])
  }, [onOpenFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleInputChange = (e) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleOpenSaved = async (plan) => {
    setOpeningId(plan.id)
    try {
      const blob = await getPlanFile(plan.id)
      if (!blob) { setOpeningId(null); return }
      const file = new File([blob], plan.name || plan.fileName || 'terv.pdf', { type: 'application/pdf' })
      onOpenFile(file)
    } catch (err) {
      console.error('[Felmérés] Failed to load saved plan:', err)
      setOpeningId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 860 }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, color: C.text, margin: 0, lineHeight: 1.2 }}>
          Felmérés
        </h1>
        <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.muted, marginTop: 6, margin: '6px 0 0' }}>
          PDF tervrajz alapú helyszíni felmérés — manuális mérés, skálakalibráció, eszközjelölés
        </p>
      </div>

      {/* ── Upload zone ───────────────────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.accent : C.border}`,
          borderRadius: 14,
          padding: '44px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? C.accentDim : C.bgCard,
          transition: 'all 0.18s',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: dragging ? C.accentDim : 'rgba(0,229,160,0.06)',
          border: `1px solid ${dragging ? C.accentBorder : 'rgba(0,229,160,0.12)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.18s',
        }}>
          <PdfIcon size={24} color={dragging ? C.accent : 'rgba(0,229,160,0.6)'} />
        </div>

        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: dragging ? C.accent : C.text }}>
            {dragging ? 'Engedd el a PDF fájlt' : 'PDF tervrajz megnyitása'}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 5 }}>
            Húzd ide a fájlt, vagy kattints a böngészéshez
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {['PDF'].map(ext => (
            <span key={ext} style={{
              fontFamily: 'DM Mono', fontSize: 10, color: C.accent,
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              borderRadius: 20, padding: '3px 10px',
            }}>{ext}</span>
          ))}
        </div>
      </div>

      {/* ── What you can do ───────────────────────────────────────────────── */}
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '18px 20px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16,
      }}>
        {[
          { icon: '📐', label: 'Skálakalibráció', desc: 'Mértékszám alapú valós méret beállítása' },
          { icon: '📍', label: 'Eszközjelölés', desc: 'Kattintással jelöld be a szerelvényeket' },
          { icon: '📏', label: 'Kábelmérés', desc: 'Útvonal mérése skálához igazítva' },
          { icon: '💾', label: 'Automatikus mentés', desc: 'Munka mentése árajánlatba' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>{item.icon}</span>
            <div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>{item.label}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 3 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Saved PDF plans ───────────────────────────────────────────────── */}
      {!loading && pdfPlans.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12,
          }}>
            Korábban mentett PDF tervek · {pdfPlans.length} db
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pdfPlans.map(plan => (
              <button
                key={plan.id}
                onClick={() => handleOpenSaved(plan)}
                disabled={openingId === plan.id}
                style={{
                  background: C.bgCard, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: openingId === plan.id ? 'wait' : 'pointer',
                  transition: 'all 0.15s', textAlign: 'left', width: '100%',
                  opacity: openingId === plan.id ? 0.6 : 1,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.accentBorder; e.currentTarget.style.background = C.accentDim }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bgCard }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(0,229,160,0.06)', border: `1px solid rgba(0,229,160,0.12)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <PdfIcon size={16} color="rgba(0,229,160,0.6)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {plan.name || plan.fileName || 'Névtelen terv'}
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {fmtDate(plan.uploadedAt || plan.createdAt)}
                    {plan.fileSize ? ` · ${(plan.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}
                  </div>
                </div>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: openingId === plan.id ? C.muted : C.accent }}>
                  {openingId === plan.id ? 'Töltés…' : 'Megnyitás →'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state for no saved plans ───────────────────────────────── */}
      {!loading && pdfPlans.length === 0 && (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '20px 20px', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 22 }}>📂</span>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text }}>Még nincsenek mentett PDF tervek</div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 3 }}>
              Tölts fel egy PDF tervrajzot a felmérés megkezdéséhez
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
