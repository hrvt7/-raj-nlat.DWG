import React, { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { saveTemplate, loadTemplates, getTemplateImage, deleteTemplate, generateTemplateId, saveTemplateBatch, getTemplatesByProject } from '../data/legendStore.js'
import { getPlanFile } from '../data/planStore.js'
import { extractLegendSymbols, CATEGORIES as LEGEND_CATEGORIES } from '../utils/legendExtractor.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgModal: '#0D0D10', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', textSub: '#A1A1AA',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
}

// ─── COUNT categories (same as DxfToolbar) ────────────────────────────────────
const COUNT_CATEGORIES = [
  { key: 'socket', label: 'Dugalj', color: '#FF8C42' },
  { key: 'switch', label: 'Kapcsoló', color: '#A78BFA' },
  { key: 'light', label: 'Lámpa', color: '#FFD166' },
  { key: 'panel', label: 'Elosztó', color: '#FF6B6B' },
  { key: 'junction', label: 'Kötődoboz', color: '#4CC9F0' },
  { key: 'conduit', label: 'Cső/Védőcs.', color: '#06B6D4' },
  { key: 'cable_tray', label: 'Kábeltálca', color: '#818CF8' },
  { key: 'other', label: 'Egyéb', color: '#71717A' },
]

// ─── Utility: render PDF page to canvas at given scale ───────────────────────
async function renderPageToCanvas(pdfPage, scale = 1) {
  const viewport = pdfPage.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await pdfPage.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function XIcon({ size = 16, color = '#71717A' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

function TrashIcon({ size = 14, color = C.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
    </svg>
  )
}

function UploadIcon({ size = 22, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

// ─── Category pill ────────────────────────────────────────────────────────────
function CategoryPill({ cat, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(cat.key)}
      style={{
        fontFamily: 'DM Mono', fontSize: 10,
        color: selected ? '#000' : cat.color,
        background: selected ? cat.color : `${cat.color}18`,
        border: `1px solid ${cat.color}40`,
        borderRadius: 20, padding: '3px 10px',
        cursor: 'pointer', transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {cat.label}
    </button>
  )
}

// ─── Saved template thumb ─────────────────────────────────────────────────────
function TemplateThumbnail({ template, onDelete }) {
  const [img, setImg] = useState(null)
  const cat = COUNT_CATEGORIES.find(c => c.key === template.category) || COUNT_CATEGORIES[COUNT_CATEGORIES.length - 1]

  useEffect(() => {
    getTemplateImage(template.id).then(url => { if (url) setImg(url) })
  }, [template.id])

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '8px 10px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${cat.color}40`,
      }}>
        {img
          ? <img src={img} alt={template.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 10, color: C.muted }}>…</span>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'DM Mono', fontSize: 10, color: cat.color,
          background: `${cat.color}18`, border: `1px solid ${cat.color}30`,
          borderRadius: 4, padding: '1px 6px', display: 'inline-block', marginBottom: 3,
        }}>{cat.label}</div>
        <div style={{ fontFamily: 'Syne', fontSize: 11, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {template.label || cat.label}
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
          {template.width}×{template.height}px
        </div>
      </div>
      <button
        onClick={() => onDelete(template.id)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'flex' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,107,107,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <TrashIcon size={13} color={C.red} />
      </button>
    </div>
  )
}

// ─── LegendPanel ──────────────────────────────────────────────────────────────
export default function LegendPanel({ onClose, projectId, legendPlanId }) {
  const [mode, setMode] = useState('manual') // 'manual' | 'auto' | 'auto-review'
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageNum, setPageNum] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [pageCanvas, setPageCanvas] = useState(null) // rendered canvas
  const [renderScale, setRenderScale] = useState(2)  // hi-DPI display scale
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Crop state (manual mode)
  const [cropStart, setCropStart] = useState(null)
  const [cropRect, setCropRect] = useState(null)  // { x,y,w,h } in canvas (logical) coords
  const [isCropping, setIsCropping] = useState(false)
  const [croppedImage, setCroppedImage] = useState(null) // data URL of crop
  const [selectedCategory, setSelectedCategory] = useState('socket')
  const [templateLabel, setTemplateLabel] = useState('')

  // Auto-extract state
  const [autoProgress, setAutoProgress] = useState(null) // { phase, value }
  const [extractedSymbols, setExtractedSymbols] = useState([]) // results from legendExtractor
  const [autoSaving, setAutoSaving] = useState(false)

  // Saved templates
  const [templates, setTemplates] = useState([])
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)

  // ── Load saved templates on mount ──
  useEffect(() => {
    if (projectId) {
      getTemplatesByProject(projectId).then(tpls => setTemplates(tpls))
    } else {
      setTemplates(loadTemplates())
    }
  }, [projectId])

  // ── Auto-load legend PDF if legendPlanId is provided ──
  useEffect(() => {
    if (!legendPlanId) return
    ;(async () => {
      try {
        const blob = await getPlanFile(legendPlanId)
        if (!blob) return
        const arrayBuffer = await blob.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        setPdfDoc(pdf)
        setPageNum(1)
        setPageCount(pdf.numPages)
        // Start auto-extract immediately
        setMode('auto')
        runAutoExtract(blob)
      } catch (err) {
        console.error('[LegendPanel] Auto-load failed:', err)
      }
    })()
  }, [legendPlanId])

  // ── Auto-extract runner ──
  const runAutoExtract = useCallback(async (pdfBlob) => {
    setAutoProgress({ phase: 'start', value: 0 })
    setExtractedSymbols([])
    try {
      const phaseLabels = { render: 'Renderelés…', threshold: 'Küszöbölés…', components: 'Összetevők keresése…', rows: 'Sorok csoportosítása…', crop: 'Szimbólumok kivágása…' }
      const results = await extractLegendSymbols(pdfBlob, {
        pageNum: 1,
        onProgress: (phase, value) => {
          setAutoProgress({ phase: phaseLabels[phase] || phase, value })
        },
      })
      // Assign editable fields to each result
      const editable = results.map((r, i) => ({
        ...r,
        id: `auto-${i}`,
        editCategory: r.proposedCategory,
        editLabel: r.proposedLabel,
        accepted: true,
      }))
      setExtractedSymbols(editable)
      setMode('auto-review')
      setAutoProgress(null)
    } catch (err) {
      console.error('[LegendPanel] Auto-extract failed:', err)
      setAutoProgress(null)
      setMode('manual') // fallback to manual
    }
  }, [])

  // ── Save all auto-extracted symbols ──
  const handleSaveAllExtracted = useCallback(async () => {
    const accepted = extractedSymbols.filter(s => s.accepted)
    if (accepted.length === 0) return
    setAutoSaving(true)
    const batch = accepted.map(s => {
      const cat = COUNT_CATEGORIES.find(c => c.key === s.editCategory) || COUNT_CATEGORIES[COUNT_CATEGORIES.length - 1]
      return {
        id: generateTemplateId(),
        category: s.editCategory,
        label: s.editLabel || cat.label,
        color: cat.color,
        width: s.width,
        height: s.height,
        projectId: projectId || undefined,
        createdAt: new Date().toISOString(),
        imageDataUrl: s.imageDataUrl,
      }
    })
    await saveTemplateBatch(batch)
    // Reload templates
    if (projectId) {
      const tpls = await getTemplatesByProject(projectId)
      setTemplates(tpls)
    } else {
      setTemplates(loadTemplates())
    }
    setAutoSaving(false)
    setMode('manual') // switch back to manual view showing saved templates
  }, [extractedSymbols, projectId])

  // ── Render current page ──
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    ;(async () => {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = await renderPageToCanvas(page, renderScale)
      if (!cancelled) {
        setPageCanvas(canvas)
        setOffset({ x: 0, y: 0 })
        setZoom(1)
        setCropRect(null)
        setCroppedImage(null)
      }
    })()
    return () => { cancelled = true }
  }, [pdfDoc, pageNum, renderScale])

  // ── Draw page + crop rect on overlay canvas ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !pageCanvas) return
    const ctx = canvas.getContext('2d')

    // Canvas display size = container size
    const container = containerRef.current
    if (!container) return
    const cw = container.clientWidth
    const ch = container.clientHeight || 540
    canvas.width = cw
    canvas.height = ch

    // Fill bg
    ctx.fillStyle = '#1a1a1f'
    ctx.fillRect(0, 0, cw, ch)

    // Draw page
    const pw = pageCanvas.width / renderScale * zoom
    const ph = pageCanvas.height / renderScale * zoom
    const dx = offset.x + (cw - pw) / 2
    const dy = offset.y + (ch - ph) / 2
    ctx.drawImage(pageCanvas, 0, 0, pageCanvas.width, pageCanvas.height, dx, dy, pw, ph)

    // Draw crop rect
    if (cropRect) {
      ctx.strokeStyle = C.accent
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
      ctx.setLineDash([])
      // Fill with transparent accent
      ctx.fillStyle = 'rgba(0,229,160,0.08)'
      ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
    }
  }, [pageCanvas, zoom, offset, cropRect, renderScale])

  // ── Pan handling ──
  const panRef = useRef(null)

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || e.altKey) {
      // Pan mode
      panRef.current = { startX: e.clientX - offset.x, startY: e.clientY - offset.y }
      e.preventDefault()
      return
    }
    // Crop mode: start drawing rect
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCropStart({ x, y })
    setCropRect(null)
    setCroppedImage(null)
    setIsCropping(true)
  }, [offset])

  const handleMouseMove = useCallback((e) => {
    if (panRef.current) {
      setOffset({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY })
      return
    }
    if (!isCropping || !cropStart) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCropRect({
      x: Math.min(cropStart.x, x),
      y: Math.min(cropStart.y, y),
      w: Math.abs(x - cropStart.x),
      h: Math.abs(y - cropStart.y),
    })
  }, [isCropping, cropStart])

  const handleMouseUp = useCallback((e) => {
    if (panRef.current) {
      panRef.current = null
      return
    }
    if (!isCropping) return
    setIsCropping(false)
    // Extract crop from pageCanvas
    if (!cropRect || cropRect.w < 8 || cropRect.h < 8 || !pageCanvas) {
      setCropRect(null)
      return
    }

    // Convert canvas display coords → pageCanvas pixel coords
    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight || 540
    const pw = pageCanvas.width / renderScale * zoom
    const ph = pageCanvas.height / renderScale * zoom
    const dx = offset.x + (cw - pw) / 2
    const dy = offset.y + (ch - ph) / 2

    const sx = (cropRect.x - dx) / zoom  // logical page x
    const sy = (cropRect.y - dy) / zoom  // logical page y
    const sw = cropRect.w / zoom
    const sh = cropRect.h / zoom

    // pageCanvas pixel coords (renderScale)
    const px = sx * renderScale
    const py = sy * renderScale
    const pw2 = sw * renderScale
    const ph2 = sh * renderScale

    // Extract crop
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = Math.max(1, Math.round(pw2))
    cropCanvas.height = Math.max(1, Math.round(ph2))
    const cctx = cropCanvas.getContext('2d')
    cctx.drawImage(pageCanvas, px, py, pw2, ph2, 0, 0, cropCanvas.width, cropCanvas.height)
    const dataUrl = cropCanvas.toDataURL('image/png')
    setCroppedImage(dataUrl)
  }, [isCropping, cropRect, pageCanvas, renderScale, zoom, offset])

  // ── Wheel zoom ──
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.85 : 1.18
    setZoom(z => Math.max(0.3, Math.min(8, z * delta)))
  }, [])

  // ── File upload ──
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    setPdfDoc(pdf)
    setPageNum(1)
    setPageCount(pdf.numPages)
  }, [])

  // ── Save template ──
  const handleSave = useCallback(async () => {
    if (!croppedImage || !cropRect) return
    setSaving(true)
    const cat = COUNT_CATEGORIES.find(c => c.key === selectedCategory) || COUNT_CATEGORIES[0]
    // Determine pixel size of the crop in renderScale
    const pw2 = Math.round(cropRect.w / zoom * renderScale)
    const ph2 = Math.round(cropRect.h / zoom * renderScale)
    const meta = {
      id: generateTemplateId(),
      category: selectedCategory,
      label: templateLabel || cat.label,
      color: cat.color,
      width: pw2,
      height: ph2,
      projectId: projectId || undefined,
      createdAt: new Date().toISOString(),
    }
    await saveTemplate(meta, croppedImage)
    if (projectId) {
      getTemplatesByProject(projectId).then(tpls => setTemplates(tpls))
    } else {
      setTemplates(loadTemplates())
    }
    setCroppedImage(null)
    setCropRect(null)
    setTemplateLabel('')
    setSaving(false)
  }, [croppedImage, cropRect, selectedCategory, templateLabel, zoom, renderScale])

  // ── Delete template ──
  const handleDeleteTemplate = useCallback(async (id) => {
    await deleteTemplate(id)
    if (projectId) {
      getTemplatesByProject(projectId).then(tpls => setTemplates(tpls))
    } else {
      setTemplates(loadTemplates())
    }
  }, [projectId])

  const canSave = !!croppedImage && !saving

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'stretch',
    }}>
      <div style={{
        display: 'flex', width: '100%', height: '100%',
        background: C.bgModal,
      }}>

        {/* ── Left: PDF viewer + crop tool ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: C.text }}>
              Jelmagyarázat szerkesztő
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, flex: 1 }}>
              Töltsd be a jelmagyarázat PDF-et, jelölj ki szimbólumokat téglalappal
            </div>

            {/* Page nav */}
            {pdfDoc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setPageNum(p => Math.max(1, p - 1))}
                  disabled={pageNum <= 1}
                  style={{ ...navBtnStyle, opacity: pageNum <= 1 ? 0.3 : 1 }}
                >‹</button>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>
                  {pageNum} / {pageCount}
                </span>
                <button
                  onClick={() => setPageNum(p => Math.min(pageCount, p + 1))}
                  disabled={pageNum >= pageCount}
                  style={{ ...navBtnStyle, opacity: pageNum >= pageCount ? 0.3 : 1 }}
                >›</button>
              </div>
            )}

            {/* Upload btn */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
                background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <UploadIcon size={13} color={C.accent} />
              PDF betöltése
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />

            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'flex' }}>
              <XIcon size={18} color={C.muted} />
            </button>
          </div>

          {/* Canvas area */}
          <div
            ref={containerRef}
            style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: isCropping ? 'crosshair' : 'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {!pdfDoc ? (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 14,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <UploadIcon size={28} color={C.accent} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text }}>
                    Jelmagyarázat PDF betöltése
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginTop: 6 }}>
                    A jelmagyarázat tartalmaz szimbólumokat és azok megnevezéseit
                  </div>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    fontFamily: 'DM Mono', fontSize: 11, color: C.accent,
                    background: C.accentDim, border: `1px solid ${C.accentBorder}`,
                    borderRadius: 8, padding: '8px 18px', cursor: 'pointer',
                  }}
                >
                  Fájl kiválasztása
                </button>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }}
              />
            )}
          </div>

          {/* Hint bar */}
          {pdfDoc && (
            <div style={{
              padding: '8px 16px', borderTop: `1px solid ${C.border}`,
              fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
              display: 'flex', gap: 16, flexShrink: 0,
            }}>
              <span>🖱️ Húzás = kijelölés</span>
              <span>Alt + húzás = mozgatás</span>
              <span>Görgetés = zoom</span>
            </div>
          )}
        </div>

        {/* ── Right: auto-extract or crop config + saved templates ── */}
        <div style={{
          width: 320, borderLeft: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden',
        }}>

          {/* ── Auto-extract progress ── */}
          {mode === 'auto' && autoProgress && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 16 }}>
                Szimbólumok keresése…
              </div>
              <div style={{ width: '100%', height: 6, background: '#1E1E22', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${Math.round(autoProgress.value * 100)}%`, background: C.accent, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                {autoProgress.phase} · {Math.round(autoProgress.value * 100)}%
              </div>
            </div>
          )}

          {/* ── Auto-extract review results ── */}
          {mode === 'auto-review' && (
            <>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 4 }}>
                  Felismert szimbólumok
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                  {extractedSymbols.filter(s => s.accepted).length}/{extractedSymbols.length} kiválasztva · Kattints az elvetéshez
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
                {extractedSymbols.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: C.muted, fontFamily: 'DM Mono', fontSize: 11 }}>
                    Nem található szimbólum. Próbáld kézzel a kijelölést.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {extractedSymbols.map((sym, idx) => {
                      const cat = COUNT_CATEGORIES.find(c => c.key === sym.editCategory) || COUNT_CATEGORIES[COUNT_CATEGORIES.length - 1]
                      return (
                        <div key={sym.id} style={{
                          background: sym.accepted ? C.bgCard : 'transparent',
                          border: `1px solid ${sym.accepted ? C.border : C.border + '60'}`,
                          borderRadius: 10, padding: '8px 10px',
                          opacity: sym.accepted ? 1 : 0.45,
                          display: 'flex', alignItems: 'center', gap: 8,
                          transition: 'all 0.15s',
                        }}>
                          {/* Toggle accept */}
                          <button
                            onClick={() => {
                              setExtractedSymbols(prev => prev.map((s, i) => i === idx ? { ...s, accepted: !s.accepted } : s))
                            }}
                            style={{
                              width: 20, height: 20, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                              background: sym.accepted ? C.accent : 'transparent',
                              border: `1.5px solid ${sym.accepted ? C.accent : C.muted}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {sym.accepted && <span style={{ color: '#000', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </button>

                          {/* Symbol image */}
                          <div style={{
                            width: 40, height: 40, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                            background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1.5px solid ${cat.color}40`,
                          }}>
                            <img src={sym.imageDataUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>

                          {/* Category + label */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Category selector */}
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
                              {COUNT_CATEGORIES.slice(0, 5).map(c => (
                                <button
                                  key={c.key}
                                  onClick={() => {
                                    setExtractedSymbols(prev => prev.map((s, i) => i === idx ? { ...s, editCategory: c.key, editLabel: c.label } : s))
                                  }}
                                  style={{
                                    fontFamily: 'DM Mono', fontSize: 8, padding: '1px 5px', borderRadius: 10, cursor: 'pointer',
                                    color: sym.editCategory === c.key ? '#000' : c.color,
                                    background: sym.editCategory === c.key ? c.color : 'transparent',
                                    border: `1px solid ${c.color}40`,
                                  }}
                                >{c.label}</button>
                              ))}
                            </div>
                            {/* Label input */}
                            <input
                              value={sym.editLabel}
                              onChange={e => {
                                setExtractedSymbols(prev => prev.map((s, i) => i === idx ? { ...s, editLabel: e.target.value } : s))
                              }}
                              style={{
                                fontFamily: 'DM Mono', fontSize: 10, color: C.text, width: '100%',
                                background: 'transparent', border: `1px solid ${C.border}`,
                                borderRadius: 5, padding: '3px 6px', outline: 'none', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Save all / switch to manual */}
              <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={handleSaveAllExtracted}
                  disabled={autoSaving || extractedSymbols.filter(s => s.accepted).length === 0}
                  style={{
                    fontFamily: 'Syne', fontWeight: 700, fontSize: 12, width: '100%',
                    color: extractedSymbols.filter(s => s.accepted).length > 0 ? '#000' : C.muted,
                    background: extractedSymbols.filter(s => s.accepted).length > 0 ? C.accent : 'rgba(113,113,122,0.1)',
                    border: 'none', borderRadius: 8, padding: '9px 16px',
                    cursor: extractedSymbols.filter(s => s.accepted).length > 0 ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                  }}
                >
                  {autoSaving ? 'Mentés…' : `✓ ${extractedSymbols.filter(s => s.accepted).length} sablon mentése`}
                </button>
                <button
                  onClick={() => setMode('manual')}
                  style={{
                    fontFamily: 'DM Mono', fontSize: 11, color: C.muted, width: '100%',
                    background: 'transparent', border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '7px 0', cursor: 'pointer',
                  }}
                >
                  Kézi kijelölés módra váltás
                </button>
              </div>
            </>
          )}

          {/* ── Manual mode: crop config + saved templates ── */}
          {(mode === 'manual' || (!autoProgress && mode !== 'auto-review')) && (
            <>
              {/* Crop preview & config */}
              <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Kijelölt szimbólum
                </div>

                {croppedImage ? (
                  <>
                    {/* Preview */}
                    <div style={{
                      background: '#fff', borderRadius: 8, padding: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minHeight: 80, marginBottom: 14, border: `1px solid ${C.border}`,
                    }}>
                      <img src={croppedImage} alt="Crop" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }} />
                    </div>

                    {/* Category */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 6 }}>Kategória</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {COUNT_CATEGORIES.map(cat => (
                          <CategoryPill
                            key={cat.key}
                            cat={cat}
                            selected={selectedCategory === cat.key}
                            onClick={setSelectedCategory}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Label */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginBottom: 5 }}>Megnevezés (opcionális)</div>
                      <input
                        value={templateLabel}
                        onChange={e => setTemplateLabel(e.target.value)}
                        placeholder={COUNT_CATEGORIES.find(c => c.key === selectedCategory)?.label || ''}
                        style={{
                          fontFamily: 'DM Mono', fontSize: 11, color: C.text,
                          background: C.bgCard, border: `1px solid ${C.border}`,
                          borderRadius: 7, padding: '7px 10px', width: '100%',
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Save btn */}
                    <button
                      onClick={handleSave}
                      disabled={!canSave}
                      style={{
                        fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                        color: canSave ? '#000' : C.muted,
                        background: canSave ? C.accent : 'rgba(113,113,122,0.1)',
                        border: 'none', borderRadius: 8, padding: '8px 16px',
                        cursor: canSave ? 'pointer' : 'default',
                        width: '100%', transition: 'all 0.15s',
                      }}
                    >
                      {saving ? 'Mentés…' : '✓ Sablon mentése'}
                    </button>
                  </>
                ) : (
                  <div style={{
                    fontFamily: 'DM Mono', fontSize: 11, color: C.muted,
                    textAlign: 'center', padding: '24px 0',
                  }}>
                    Húzz téglalapot a jelmagyarázat PDF-en egy szimbólum köré
                  </div>
                )}
              </div>

              {/* Saved templates list */}
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
                <div style={{
                  fontFamily: 'DM Mono', fontSize: 10, color: C.muted,
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10,
                }}>
                  Mentett sablonok · {templates.length} db
                </div>

                {templates.length === 0 ? (
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, textAlign: 'center', paddingTop: 20 }}>
                    Még nincsenek sablonok
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {templates.map(t => (
                      <TemplateThumbnail key={t.id} template={t} onDelete={handleDeleteTemplate} />
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom: close */}
              <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                <button
                  onClick={onClose}
                  style={{
                    fontFamily: 'DM Mono', fontSize: 12, color: C.text,
                    background: C.bgCard, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '8px 0', cursor: 'pointer',
                    width: '100%', transition: 'all 0.15s',
                  }}
                >
                  Kész — bezárás
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const navBtnStyle = {
  fontFamily: 'DM Mono', fontSize: 14, color: '#E4E4E7',
  background: 'rgba(255,255,255,0.05)', border: '1px solid #1E1E22',
  borderRadius: 6, width: 26, height: 26, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
}
