import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getPlanFile, getPlanAnnotations, savePlanAnnotations, updatePlanMeta } from '../data/planStore.js'
import { loadTemplatesWithImages, getTemplatesByProject } from '../data/legendStore.js'
import { detectAllTemplates } from '../utils/templateMatching.js'
import { createMarker, normalizeMarkers } from '../utils/markerModel.js'
import { createDetectionRun, updateDetectionRun, linkDetectionToMarker } from '../data/detectionRunStore.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg: '#09090B', bgCard: '#111113', bgModal: '#0D0D10', border: '#1E1E22',
  accent: '#00E5A0', yellow: '#FFD166', red: '#FF6B6B', blue: '#4CC9F0',
  text: '#E4E4E7', muted: '#71717A', textSub: '#A1A1AA',
  accentDim: 'rgba(0,229,160,0.08)', accentBorder: 'rgba(0,229,160,0.2)',
}

// ─── Review filter options ─────────────────────────────────────────────────────
const REVIEW_FILTERS = [
  { key: 'all',      label: 'Mind' },
  { key: 'accepted', label: '✓ Elfogadva' },
  { key: 'rejected', label: '✗ Elvetve' },
  { key: 'pending',  label: '⏳ Alacsony biz.' },
]

// ─── COUNT_CATEGORIES (mirrors DxfToolbar) ────────────────────────────────────
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

function getCat(key) {
  return COUNT_CATEGORIES.find(c => c.key === key) || COUNT_CATEGORIES[COUNT_CATEGORIES.length - 1]
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function XIcon({ size = 16, color = C.muted }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function CheckIcon({ size = 14, color = '#fff' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function XSmIcon({ size = 12, color = C.red }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.text }}>{label}</div>
      <div style={{ width: 240, height: 6, background: '#1E1E22', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(value * 100)}%`, background: C.accent, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>{Math.round(value * 100)}%</div>
    </div>
  )
}

// ─── Detection group (per category) ──────────────────────────────────────────
function DetectionGroup({ category, detections, onAcceptAll, onRejectAll, onToggle, onLocate, scoreThreshold }) {
  const cat = getCat(category)
  const accepted = detections.filter(d => d.accepted !== false)
  // Sort by score descending for easier review
  const sorted = useMemo(() => [...detections].sort((a, b) => b.score - a.score), [detections])

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Group header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderBottom: detections.length > 0 ? `1px solid ${C.border}` : 'none',
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: cat.color, flexShrink: 0,
        }} />
        <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, flex: 1 }}>
          {cat.label}
        </span>
        <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
          {accepted.length}/{detections.length} elfogadva
        </span>
        <button
          onClick={() => onAcceptAll(category)}
          style={{ ...actionBtnStyle, color: C.accent, borderColor: C.accentBorder, background: C.accentDim }}
        >
          <CheckIcon size={11} color={C.accent} /> Összes
        </button>
        <button
          onClick={() => onRejectAll(category)}
          style={{ ...actionBtnStyle, color: C.red, borderColor: 'rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.06)' }}
        >
          <XSmIcon size={11} color={C.red} /> Összes elvet
        </button>
      </div>

      {/* Individual detections — sorted by score desc */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px' }}>
        {sorted.map((d) => {
          const isAccepted = d.accepted !== false
          const isBelowThreshold = d.score < scoreThreshold
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                onClick={() => onToggle(d.id)}
                title={`Bizonyosság: ${Math.round(d.score * 100)}%  ·  Oldal ${d.pageNum}  ·  (${Math.round(d.x)}, ${Math.round(d.y)})`}
                style={{
                  fontFamily: 'DM Mono', fontSize: 9,
                  color: isAccepted ? '#000' : C.muted,
                  background: isAccepted ? cat.color : isBelowThreshold ? 'rgba(255,209,102,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isAccepted ? cat.color : isBelowThreshold ? 'rgba(255,209,102,0.2)' : C.border}`,
                  borderRadius: '6px 0 0 6px', padding: '3px 8px', cursor: 'pointer',
                  transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {isAccepted
                  ? <CheckIcon size={9} color="#000" />
                  : <XSmIcon size={9} color={isBelowThreshold ? C.yellow : C.muted} />
                }
                {Math.round(d.score * 100)}%
                {d.pageNum > 1 && <span style={{ opacity: 0.7 }}>· o{d.pageNum}</span>}
              </button>
              {/* Locate button — shows where this detection is on the plan */}
              {onLocate && (
                <button
                  onClick={() => onLocate(d)}
                  title={`Ugrás: ${d.planId} · ${d.pageNum}. oldal · (${Math.round(d.x)}, ${Math.round(d.y)})`}
                  style={{
                    fontFamily: 'DM Mono', fontSize: 8,
                    color: C.muted, background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${C.border}`,
                    borderRadius: '0 6px 6px 0', padding: '3px 5px', cursor: 'pointer',
                    borderLeft: 'none', display: 'flex', alignItems: 'center',
                  }}
                >
                  📍
                </button>
              )}
            </div>
          )
        })}
        {detections.length === 0 && (
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>Nincs detektálás</span>
        )}
      </div>
    </div>
  )
}

// ─── Score Threshold Slider ──────────────────────────────────────────────────
function ScoreThresholdSlider({ value, onChange, onApply, detections }) {
  const aboveCount = detections.filter(d => d.score >= value).length
  const belowCount = detections.length - aboveCount
  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>
        Bizonyossági küszöb:
      </span>
      <input
        type="range" min={30} max={95} step={5} value={Math.round(value * 100)}
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        style={{ width: 120, accentColor: C.accent }}
      />
      <span style={{ fontFamily: 'DM Mono', fontSize: 12, fontWeight: 700, color: C.accent, minWidth: 32 }}>
        {Math.round(value * 100)}%
      </span>
      <span style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.muted }}>
        {aboveCount} felett · {belowCount} alatt
      </span>
      <button
        onClick={onApply}
        style={{
          ...actionBtnStyle,
          color: C.accent, borderColor: C.accentBorder, background: C.accentDim,
          fontWeight: 700,
        }}
      >
        ✓ {aboveCount} elfogadása (≥{Math.round(value * 100)}%)
      </button>
    </div>
  )
}

// ─── Review Filter Bar ──────────────────────────────────────────────────────
function ReviewFilterBar({ filter, onFilterChange, counts }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {REVIEW_FILTERS.map(f => (
        <button
          key={f.key}
          onClick={() => onFilterChange(f.key)}
          style={{
            fontFamily: 'DM Mono', fontSize: 10,
            color: filter === f.key ? '#000' : C.muted,
            background: filter === f.key ? C.accent : 'transparent',
            border: `1px solid ${filter === f.key ? C.accent : C.border}`,
            borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
            transition: 'all 0.12s',
          }}
        >
          {f.label} {counts[f.key] != null ? `(${counts[f.key]})` : ''}
        </button>
      ))}
    </div>
  )
}

const actionBtnStyle = {
  fontFamily: 'DM Mono', fontSize: 10,
  border: '1px solid', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.12s',
}

// ─── No templates warning ─────────────────────────────────────────────────────
function NoTemplatesWarning({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: '32px', maxWidth: 400, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>📋</div>
        <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 8 }}>
          Nincsenek jelmagyarázat sablonok
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginBottom: 24 }}>
          A szimbólumdetektáláshoz először add hozzá a jelmagyarázatból a szimbólum sablonjait a "Jelmagyarázat csatolása" funkcióval.
        </div>
        <button
          onClick={onClose}
          style={{
            fontFamily: 'DM Mono', fontSize: 12, color: C.text,
            background: C.bgCard, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '8px 24px', cursor: 'pointer',
          }}
        >
          Bezárás
        </button>
      </div>
    </div>
  )
}

// ─── DetectionReviewPanel ─────────────────────────────────────────────────────
export default function DetectionReviewPanel({ plans, onClose, onDone, projectId, onLocateDetection, existingRun }) {
  const [phase, setPhase] = useState('loading') // loading | no_templates | detecting | review | saving | done
  const [templates, setTemplates] = useState([])
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [allDetections, setAllDetections] = useState([]) // { id, planId, pageNum, x, y, score, category, color, templateId, accepted }
  const [error, setError] = useState(null)
  const runIdRef = useRef(null) // DetectionRun.id for persistence
  const [scoreThreshold, setScoreThreshold] = useState(0.70)
  const [reviewFilter, setReviewFilter] = useState('all') // all | accepted | rejected | pending

  // ── Reopen existing run (skip detection) ──
  useEffect(() => {
    if (!existingRun) return
    runIdRef.current = existingRun.id
    const dets = (existingRun.results || []).map(r => ({
      ...r,
      accepted: r.accepted !== false,
    }))
    setAllDetections(dets)
    setPhase('review')
  }, [existingRun])

  // ── Load templates and start detection (skip if reopening) ──
  useEffect(() => {
    if (existingRun) return // skip detection when reopening
    ;(async () => {
      setPhase('loading')
      // Load project-scoped templates if projectId provided, otherwise global
      const tpls = projectId
        ? await getTemplatesByProject(projectId)
        : await loadTemplatesWithImages()
      setTemplates(tpls)

      if (tpls.length === 0) {
        setPhase('no_templates')
        return
      }

      setPhase('detecting')

      // ── Persist DetectionRun ──
      const run = await createDetectionRun({
        projectId: projectId || null,
        planIds: plans.map(p => p.id),
        templateIds: tpls.map(t => t.id),
      })
      runIdRef.current = run.id

      const detections = []
      let globalDone = 0
      const totalWork = plans.length * tpls.length

      for (const plan of plans) {
        let blob
        try {
          blob = await getPlanFile(plan.id)
        } catch {
          continue
        }
        if (!blob) continue

        const arrayBuffer = await blob.arrayBuffer()
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const numPages = pdfDoc.numPages
        const workPerPlan = numPages * tpls.length
        let planDone = 0

        const planDetections = await detectAllTemplates(pdfDoc, tpls, {
          detectionScale: 1,
          threshold: 0.60,
          onProgress: (frac, pageNum, tpl) => {
            planDone = Math.round(frac * workPerPlan)
            setProgressLabel(`${plan.name || 'Terv'} · ${tpl.label} · ${pageNum}. oldal`)
            setProgress((globalDone + planDone) / (totalWork * plans.length))
          },
        })

        globalDone += workPerPlan

        for (const d of planDetections) {
          detections.push({
            id: `det-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            planId: plan.id,
            pageNum: d.pageNum,
            x: d.x,
            y: d.y,
            score: d.score,
            category: d.category,
            color: d.color,
            templateId: d.templateId,
            label: d.label,
            accepted: true, // default accept
          })
        }
      }

      setAllDetections(detections)
      setProgress(1)

      // ── Persist detection results into run ──
      if (runIdRef.current) {
        await updateDetectionRun(runIdRef.current, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          results: detections.map(d => ({
            id: d.id,
            planId: d.planId,
            pageNum: d.pageNum,
            x: d.x,
            y: d.y,
            score: d.score,
            category: d.category,
            color: d.color,
            templateId: d.templateId,
            label: d.label,
            accepted: d.accepted,
            markerId: null, // filled after apply
          })),
        })
      }

      if (detections.length === 0) {
        setPhase('review') // show review panel with empty state
      } else {
        setPhase('review')
      }
    })().catch(err => {
      console.error('[DetectionReview] error:', err)
      setError(err.message)
      if (runIdRef.current) {
        updateDetectionRun(runIdRef.current, { status: 'failed', completedAt: new Date().toISOString() })
      }
      setPhase('review')
    })
  }, [plans])

  // ── Toggle individual detection ──
  const handleToggle = useCallback((detId) => {
    setAllDetections(prev => prev.map(d =>
      d.id === detId ? { ...d, accepted: d.accepted === false ? true : false } : d
    ))
  }, [])

  // ── Accept/reject all in category ──
  const handleAcceptAll = useCallback((category) => {
    setAllDetections(prev => prev.map(d => d.category === category ? { ...d, accepted: true } : d))
  }, [])

  const handleRejectAll = useCallback((category) => {
    setAllDetections(prev => prev.map(d => d.category === category ? { ...d, accepted: false } : d))
  }, [])

  // ── Bulk accept by score threshold ──
  const handleApplyThreshold = useCallback(() => {
    setAllDetections(prev => prev.map(d => ({
      ...d,
      accepted: d.score >= scoreThreshold,
    })))
  }, [scoreThreshold])

  // ── Locate detection on plan (pass to parent) ──
  const handleLocate = useCallback((detection) => {
    if (onLocateDetection) {
      onLocateDetection({
        planId: detection.planId,
        pageNum: detection.pageNum,
        x: detection.x,
        y: detection.y,
        category: detection.category,
      })
    }
  }, [onLocateDetection])

  // ── Filtered detections for display ──
  const filteredDetections = useMemo(() => {
    switch (reviewFilter) {
      case 'accepted': return allDetections.filter(d => d.accepted !== false)
      case 'rejected': return allDetections.filter(d => d.accepted === false)
      case 'pending':  return allDetections.filter(d => d.score < scoreThreshold)
      default:         return allDetections
    }
  }, [allDetections, reviewFilter, scoreThreshold])

  // ── Filter counts ──
  const filterCounts = useMemo(() => ({
    all: allDetections.length,
    accepted: allDetections.filter(d => d.accepted !== false).length,
    rejected: allDetections.filter(d => d.accepted === false).length,
    pending: allDetections.filter(d => d.score < scoreThreshold).length,
  }), [allDetections, scoreThreshold])

  // ── Apply accepted detections to plan annotations ──
  const handleApply = useCallback(async () => {
    setPhase('saving')
    const accepted = allDetections.filter(d => d.accepted !== false)

    // Group by planId
    const byPlan = {}
    for (const d of accepted) {
      if (!byPlan[d.planId]) byPlan[d.planId] = []
      byPlan[d.planId].push(d)
    }

    for (const [planId, dets] of Object.entries(byPlan)) {
      const annotations = await getPlanAnnotations(planId)
      // Build new markers from accepted detections — unified marker model preserves origin
      const newMarkers = dets.map(d => createMarker({
        x: d.x,
        y: d.y,
        category: d.category,
        color: d.color,
        pageNum: d.pageNum,
        source: 'detection',
        confidence: d.score,
        detectionId: d.id,
        detectionRunId: runIdRef.current,
        templateId: d.templateId,
        label: d.label,
      }))
      // Merge with existing markers (avoid duplicates by proximity)
      const existing = normalizeMarkers(annotations.markers)
      const merged = mergeMarkers(existing, newMarkers)
      await savePlanAnnotations(planId, {
        ...annotations,
        markers: merged,
      })
      updatePlanMeta(planId, {
        markerCount: merged.length,
        detectedCount: dets.length,
        detectionReviewed: true,
        lastDetectionRunId: runIdRef.current,
      })

      // Back-reference: link each detection result to its created marker
      for (const marker of newMarkers) {
        if (marker.detectionId && runIdRef.current) {
          // Fire-and-forget: non-blocking back-ref update
          linkDetectionToMarker(runIdRef.current, marker.detectionId, marker.id)
        }
      }
    }

    // Update run status
    if (runIdRef.current) {
      // Sync final review decisions into run results
      await updateDetectionRun(runIdRef.current, {
        status: 'applied',
        results: allDetections.map(d => ({
          id: d.id,
          planId: d.planId,
          pageNum: d.pageNum,
          x: d.x,
          y: d.y,
          score: d.score,
          category: d.category,
          color: d.color,
          templateId: d.templateId,
          label: d.label,
          accepted: d.accepted !== false,
          markerId: null, // linkDetectionToMarker fills this async
        })),
      })
    }

    setPhase('done')
    if (onDone) onDone()
  }, [allDetections, onDone])

  // ── Merge new auto-detected markers with existing ones ──
  function mergeMarkers(existing, detected) {
    const PROXIMITY = 15 // pixels in PDF coords — treat as duplicate if within this
    const result = [...existing]
    for (const d of detected) {
      const isDuplicate = existing.some(e =>
        e.category === d.category &&
        Math.hypot(e.x - d.x, e.y - d.y) < PROXIMITY
      )
      if (!isDuplicate) result.push(d)
    }
    return result
  }

  // ── Group detections by category ──
  const categories = [...new Set(allDetections.map(d => d.category))]
  const acceptedCount = allDetections.filter(d => d.accepted !== false).length

  if (phase === 'no_templates') return <NoTemplatesWarning onClose={onClose} />

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'stretch',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
        background: C.bgModal,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: C.text }}>
            Szimbólumdetektálás áttekintés
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, flex: 1 }}>
            {plans.length} terv · {templates.length} sablon
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: 6, display: 'flex' }}>
            <XIcon size={18} color={C.muted} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

          {/* Detecting phase */}
          {(phase === 'loading' || phase === 'detecting') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 24 }}>
              <ProgressBar value={progress} label={progressLabel || 'Detektálás folyamatban…'} />
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                Ez eltarthat néhány másodpercig…
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)',
              borderRadius: 10, padding: '12px 16px', marginBottom: 20,
              fontFamily: 'DM Mono', fontSize: 11, color: C.red,
            }}>
              Hiba: {error}
            </div>
          )}

          {/* Review phase */}
          {phase === 'review' && (
            <>
              {allDetections.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
                  <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 8 }}>
                    Nem találtunk szimbólumokat
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                    Próbálj alacsonyabb küszöböt, vagy adj hozzá több/pontosabb sablonokat a jelmagyarázathoz.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800 }}>
                  {/* Summary */}
                  <div style={{
                    background: C.bgCard, border: `1px solid ${C.accentBorder}`,
                    borderRadius: 12, padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  }}>
                    <div>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700, color: C.accent }}>{allDetections.length}</span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginLeft: 6 }}>detektált</span>
                    </div>
                    <div>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700, color: C.text }}>{acceptedCount}</span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginLeft: 6 }}>elfogadva</span>
                    </div>
                    <div>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700, color: C.yellow }}>
                        {allDetections.filter(d => d.score < scoreThreshold).length}
                      </span>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, marginLeft: 6 }}>alacsony biz.</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted }}>
                      Kattints → elfogad/elvet · 📍 → ugrás a tervre
                    </div>
                  </div>

                  {/* Score threshold slider */}
                  <ScoreThresholdSlider
                    value={scoreThreshold}
                    onChange={setScoreThreshold}
                    onApply={handleApplyThreshold}
                    detections={allDetections}
                  />

                  {/* Filter bar */}
                  <ReviewFilterBar
                    filter={reviewFilter}
                    onFilterChange={setReviewFilter}
                    counts={filterCounts}
                  />

                  {/* Per-category groups (filtered) */}
                  {categories.map(cat => {
                    const catDetections = filteredDetections.filter(d => d.category === cat)
                    if (catDetections.length === 0 && reviewFilter !== 'all') return null
                    return (
                      <DetectionGroup
                        key={cat}
                        category={cat}
                        detections={catDetections}
                        onAcceptAll={handleAcceptAll}
                        onRejectAll={handleRejectAll}
                        onToggle={handleToggle}
                        onLocate={handleLocate}
                        scoreThreshold={scoreThreshold}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Saving phase */}
          {phase === 'saving' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16 }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: C.text }}>Jelölések mentése…</div>
            </div>
          )}

          {/* Done phase */}
          {phase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16 }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: C.text }}>
                {acceptedCount} szimbólum sikeresen hozzáadva
              </div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted }}>
                A jelölések megjelennek a tervekben. Most összevonhatod kalkulációhoz.
              </div>
              <button
                onClick={onClose}
                style={{
                  fontFamily: 'DM Mono', fontSize: 12, color: '#000',
                  background: C.accent, border: 'none',
                  borderRadius: 8, padding: '10px 28px', cursor: 'pointer',
                }}
              >
                Bezárás
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {phase === 'review' && allDetections.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderTop: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.muted, flex: 1 }}>
              {acceptedCount} szimbólum lesz hozzáadva a jelölésekhez
            </span>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'DM Mono', fontSize: 11, color: C.muted,
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Mégse
            </button>
            <button
              onClick={handleApply}
              disabled={acceptedCount === 0}
              style={{
                fontFamily: 'Syne', fontWeight: 700, fontSize: 12,
                color: acceptedCount > 0 ? '#000' : C.muted,
                background: acceptedCount > 0 ? C.accent : 'rgba(113,113,122,0.1)',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                cursor: acceptedCount > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              ✓ {acceptedCount} szimbólum alkalmazása
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
