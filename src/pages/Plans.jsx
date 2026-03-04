import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { C, Button, Badge } from '../components/ui.jsx'
const DxfViewerPanel = lazy(() => import('../components/DxfViewer/index.jsx'))
const PdfViewerPanel = lazy(() => import('../components/PdfViewer/index.jsx'))
import MergePlansView from '../components/MergePlansView.jsx'
import { loadPlans, savePlan, getPlanFile, deletePlan, generatePlanId, savePlanThumbnail, getPlanThumbnail } from '../data/planStore.js'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const fmtSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const fmtDate = (iso) => {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return iso }
}

const FILE_TYPE_MAP = {
  'dxf': { color: 'green', label: 'DXF', viewer: 'dxf' },
  'dwg': { color: 'yellow', label: 'DWG', viewer: 'dxf' },
  'pdf': { color: 'red', label: 'PDF', viewer: 'pdf' },
}

function getFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'dwg') return 'dwg'
  if (ext === 'pdf') return 'pdf'
  return 'dxf'
}

async function generatePdfThumbnail(file, planId) {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc
    const arrayBuffer = await file.arrayBuffer()
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 0.5 })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
    await savePlanThumbnail(planId, dataUrl)
    return dataUrl
  } catch (err) {
    console.warn('Thumbnail generation failed:', err)
    return null
  }
}

export default function Plans({ onNavigate }) {
  const [plans, setPlans] = useState([])
  const [activePlan, setActivePlan] = useState(null)
  const [activeFile, setActiveFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [thumbnails, setThumbnails] = useState({}) // { planId: dataUrl }
  const [mergeMode, setMergeMode] = useState(false)
  const inputRef = useRef()

  // Load plans + thumbnails on mount
  useEffect(() => {
    setPlans(loadPlans())
  }, [])

  // Load thumbnails for all plans
  useEffect(() => {
    if (plans.length === 0) return
    const pdfPlans = plans.filter(p => p.fileType === 'pdf')
    Promise.all(pdfPlans.map(async p => {
      const thumb = await getPlanThumbnail(p.id)
      return { id: p.id, thumb }
    })).then(results => {
      const map = {}
      for (const r of results) {
        if (r.thumb) map[r.id] = r.thumb
      }
      setThumbnails(prev => ({ ...prev, ...map }))
    })
  }, [plans])

  const handleUpload = useCallback(async (fileList) => {
    const files = Array.from(fileList)
    setUploading(true)

    for (const file of files) {
      const id = generatePlanId()
      const fileType = getFileType(file.name)
      const plan = {
        id,
        name: file.name,
        fileType,
        fileSize: file.size,
        units: null,
        parsedResult: null,
        createdAt: new Date().toISOString(),
      }
      await savePlan(plan, file)

      // Generate thumbnail for PDFs
      if (fileType === 'pdf') {
        generatePdfThumbnail(file, id).then(dataUrl => {
          if (dataUrl) setThumbnails(prev => ({ ...prev, [id]: dataUrl }))
        }).catch(() => {})
      }
    }

    setPlans(loadPlans())
    setUploading(false)
  }, [])

  const handleOpen = useCallback(async (plan) => {
    setActivePlan(plan)
    const blob = await getPlanFile(plan.id)
    setActiveFile(blob)
  }, [])

  const handleDelete = useCallback(async (planId) => {
    await deletePlan(planId)
    setPlans(loadPlans())
    if (activePlan?.id === planId) {
      setActivePlan(null)
      setActiveFile(null)
    }
  }, [activePlan])

  const handleBack = useCallback(() => {
    setActivePlan(null)
    setActiveFile(null)
  }, [])

  const [dragging, setDragging] = useState(false)

  // ─── Merge mode ──────────────────────────────────────────────────────────
  if (mergeMode) {
    return (
      <MergePlansView
        plans={plans}
        onClose={() => setMergeMode(false)}
        onCreateQuote={(data) => { setMergeMode(false); onNavigate?.('new-quote', data) }}
      />
    )
  }

  // ─── Full-screen viewer mode ─────────────────────────────────────────────
  if (activePlan) {
    const ftInfo = FILE_TYPE_MAP[activePlan.fileType] || FILE_TYPE_MAP.dxf
    const isPdf = ftInfo.viewer === 'pdf'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={handleBack} style={{
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
            color: C.text, fontSize: 13, fontFamily: 'Syne',
          }}>
            ← Vissza
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.text, fontSize: 16, fontWeight: 700, fontFamily: 'Syne' }}>
              {activePlan.name}
            </div>
            <div style={{ color: C.muted, fontSize: 11, fontFamily: 'DM Mono', marginTop: 2 }}>
              {fmtSize(activePlan.fileSize)} • {fmtDate(activePlan.createdAt)}
            </div>
          </div>
          <Badge color={ftInfo.color}>
            {ftInfo.label}
          </Badge>
        </div>

        {/* Viewer */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <Suspense fallback={<div style={{ height: '100%', background: C.bg }} />}>
            {isPdf ? (
              <PdfViewerPanel
                file={activeFile}
                planId={activePlan.id}
                onCreateQuote={(data) => { onNavigate?.('new-quote', { ...data, planName: activePlan.name }) }}
                style={{ height: '100%' }}
              />
            ) : (
              <DxfViewerPanel
                file={activeFile}
                unitFactor={activePlan.units?.factor}
                unitName={activePlan.units?.name}
                planId={activePlan.id}
                onCreateQuote={(data) => { onNavigate?.('new-quote', { ...data, planName: activePlan.name }) }}
                style={{ height: '100%' }}
              />
            )}
          </Suspense>
        </div>
      </div>
    )
  }

  // ─── Grid view (plan cards) ──────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            Tervrajzok
          </h1>
          <p style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.textSub }}>
            DXF, DWG és PDF tervrajzok kezelése — mérés, számlálás, kalibráció
          </p>
        </div>
        {plans.length >= 2 && (
          <button onClick={() => setMergeMode(true)} style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(76,201,240,0.1)', border: `1px solid rgba(76,201,240,0.3)`,
            color: '#4CC9F0', fontSize: 12, fontFamily: 'Syne', fontWeight: 700,
          }}>
            Tervek összevonása
          </button>
        )}
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.accent : C.border}`,
          borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          background: dragging ? C.accent + '08' : C.bgCard,
          marginBottom: 24,
        }}
      >
        {/* Animated scanner SVG */}
        <div style={{ width: 96, height: 96, margin: '0 auto 12px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
            <style>{`
              .pl-grid-bg { stroke: rgba(255,255,255,0.18); stroke-width: 1; opacity: 0.3; }
              .pl-doc-outline { stroke: #17C7FF; stroke-width: 2.5; fill: none; stroke-linejoin: round; stroke-linecap: round; }
              .pl-doc-inner { stroke: rgba(255,255,255,0.18); stroke-width: 2; fill: none; stroke-dasharray: 4 6; stroke-linecap: round; }
              .pl-scan-line { stroke: #21F3A3; stroke-width: 2; filter: url(#pl-glow-scan); }
              .pl-scanner-group { animation: pl-scan-move 3s ease-in-out infinite; }
              @keyframes pl-scan-move {
                0%, 100% { transform: translateY(120px); }
                50% { transform: translateY(380px); }
              }
            `}</style>
            <defs>
              <pattern id="pl-grid2" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M 16 0 L 0 0 0 16" className="pl-grid-bg" fill="none"/>
              </pattern>
              <filter id="pl-glow-scan" x="-20%" y="-50%" width="140%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <linearGradient id="pl-scan-trail" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#21F3A3" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#21F3A3" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect width="512" height="512" fill="url(#pl-grid2)" />
            <path d="M 176 112 L 288 112 L 336 160 L 336 400 L 176 400 Z" className="pl-doc-outline" />
            <path d="M 288 112 L 288 160 L 336 160" className="pl-doc-outline" />
            <line x1="208" y1="208" x2="304" y2="208" className="pl-doc-inner" />
            <line x1="208" y1="256" x2="304" y2="256" className="pl-doc-inner" />
            <line x1="208" y1="304" x2="272" y2="304" className="pl-doc-inner" />
            <path d="M 160 112 L 192 112 M 176 96 L 176 128" stroke="#17C7FF" strokeWidth="1"/>
            <path d="M 160 400 L 192 400 M 176 384 L 176 416" stroke="#17C7FF" strokeWidth="1"/>
            <path d="M 320 400 L 352 400 M 336 384 L 336 416" stroke="#17C7FF" strokeWidth="1"/>
            <g className="pl-scanner-group">
              <rect x="156" y="-30" width="200" height="30" fill="url(#pl-scan-trail)" />
              <line x1="156" y1="0" x2="356" y2="0" className="pl-scan-line" />
              <polygon points="156,0 150,-5 150,5" fill="#21F3A3" />
              <polygon points="356,0 362,-5 362,5" fill="#21F3A3" />
            </g>
          </svg>
        </div>
        {/* Title */}
        <div style={{
          fontSize: 14, fontWeight: 700, fontFamily: 'Syne',
          background: 'linear-gradient(90deg, #21F3A3 0%, #17C7FF 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          Tervrajz feltöltése
        </div>
        <div style={{ color: '#17C7FF', fontSize: 12, marginTop: 4, opacity: 0.65, fontFamily: 'DM Mono', letterSpacing: '0.03em' }}>
          DXF / DWG / PDF fájlok — húzd ide vagy kattints
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
          {['DXF', 'DWG', 'PDF'].map(ext => (
            <span key={ext} style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'DM Mono',
              background: 'rgba(33,243,163,0.07)',
              border: '1px solid rgba(33,243,163,0.25)',
              color: '#21F3A3',
            }}>{ext}</span>
          ))}
        </div>
        <input ref={inputRef} type="file" multiple accept=".dxf,.dwg,.pdf"
          style={{ display: 'none' }}
          onChange={e => handleUpload(e.target.files)}
        />
        {uploading && (
          <div style={{ marginTop: 8, color: C.accent, fontSize: 12, fontFamily: 'DM Mono' }}>
            Feltöltés...
          </div>
        )}
      </div>

      {/* Plans grid */}
      {plans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: C.muted }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={C.border} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div style={{ fontSize: 14, fontFamily: 'Syne', color: C.textSub }}>Még nincsenek tervrajzok</div>
          <div style={{ fontSize: 12, marginTop: 6, fontFamily: 'DM Mono', color: C.textMuted }}>Töltsd fel az első DXF/DWG/PDF fájlt</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {plans.map(plan => {
            const ftInfo = FILE_TYPE_MAP[plan.fileType] || FILE_TYPE_MAP.dxf
            return (
              <div
                key={plan.id}
                style={{
                  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10,
                  overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onClick={() => handleOpen(plan)}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = C.accent + '40'
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,229,160,0.08)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = C.border
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Preview / thumbnail */}
                <div style={{
                  height: 120, background: C.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderBottom: `1px solid ${C.border}`, flexDirection: 'column', gap: 6,
                  overflow: 'hidden', position: 'relative',
                }}>
                  {thumbnails[plan.id] ? (
                    <img
                      src={thumbnails[plan.id]}
                      alt={plan.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                    />
                  ) : (
                    <>
                      <PlanIcon type={plan.fileType} />
                      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, letterSpacing: '0.08em' }}>
                        {ftInfo.label} terv
                      </span>
                    </>
                  )}
                  {/* Badge overlay */}
                  {(plan.markerCount > 0 || plan.hasScale) && (
                    <div style={{
                      position: 'absolute', bottom: 6, left: 6,
                      display: 'flex', gap: 4,
                    }}>
                      {plan.markerCount > 0 && (
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono',
                          background: 'rgba(0,229,160,0.2)', color: C.accent, backdropFilter: 'blur(4px)',
                        }}>{plan.markerCount} elem</span>
                      )}
                      {plan.hasScale && (
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontFamily: 'DM Mono',
                          background: 'rgba(76,201,240,0.2)', color: C.blue, backdropFilter: 'blur(4px)',
                        }}>Kalibrálva</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{
                      color: C.text, fontSize: 13, fontWeight: 600, fontFamily: 'Syne',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                    }}>
                      {plan.name}
                    </div>
                    <Badge color={ftInfo.color}>
                      {ftInfo.label}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted, fontSize: 10, fontFamily: 'DM Mono' }}>
                    <span>{fmtSize(plan.fileSize)}</span>
                    <span>{fmtDate(plan.createdAt)}</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpen(plan) }}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 5,
                        background: C.accent + '12', border: `1px solid ${C.accent}30`,
                        color: C.accent, fontSize: 11, fontFamily: 'Syne', fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Megnyitás
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Biztosan törlöd ezt a tervrajzot?')) handleDelete(plan.id)
                      }}
                      style={{
                        padding: '6px 10px', borderRadius: 5,
                        background: 'transparent', border: `1px solid ${C.border}`,
                        color: C.muted, fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlanIcon({ type }) {
  const colors = { dxf: C.accent, dwg: C.yellow, pdf: '#FF6B6B' }
  const color = colors[type] || C.accent

  if (type === 'pdf') {
    return (
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <path d="M9 15v-2h1.5a1.5 1.5 0 0 1 0 3H9"/><path d="M15 13h2M15 13v4"/>
      </svg>
    )
  }

  return (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      {type === 'dwg' ? (
        <>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </>
      ) : (
        <>
          <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
        </>
      )}
    </svg>
  )
}
