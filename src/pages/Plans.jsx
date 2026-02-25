import React, { useState, useEffect, useRef, useCallback } from 'react'
import { C, Button, Badge } from '../components/ui.jsx'
import DxfViewerPanel from '../components/DxfViewer/index.jsx'
import { loadPlans, savePlan, getPlanFile, deletePlan, generatePlanId } from '../data/planStore.js'

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

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [activePlan, setActivePlan] = useState(null) // plan meta
  const [activeFile, setActiveFile] = useState(null) // Blob for viewer
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  // Load plans on mount
  useEffect(() => {
    setPlans(loadPlans())
  }, [])

  // Upload handler
  const handleUpload = useCallback(async (fileList) => {
    const files = Array.from(fileList)
    setUploading(true)

    for (const file of files) {
      const id = generatePlanId()
      const plan = {
        id,
        name: file.name,
        fileType: file.name.toLowerCase().endsWith('.dwg') ? 'dwg' : 'dxf',
        fileSize: file.size,
        units: null,
        parsedResult: null,
        createdAt: new Date().toISOString(),
      }
      await savePlan(plan, file)
    }

    setPlans(loadPlans())
    setUploading(false)
  }, [])

  // Open a plan in the viewer
  const handleOpen = useCallback(async (plan) => {
    setActivePlan(plan)
    const blob = await getPlanFile(plan.id)
    setActiveFile(blob)
  }, [])

  // Delete a plan
  const handleDelete = useCallback(async (planId) => {
    await deletePlan(planId)
    setPlans(loadPlans())
    if (activePlan?.id === planId) {
      setActivePlan(null)
      setActiveFile(null)
    }
  }, [activePlan])

  // Back to grid
  const handleBack = useCallback(() => {
    setActivePlan(null)
    setActiveFile(null)
  }, [])

  // Drag & drop on the page
  const [dragging, setDragging] = useState(false)

  // ─── Full-screen viewer mode ─────────────────────────────────────────────
  if (activePlan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 16,
        }}>
          <button
            onClick={handleBack}
            style={{
              background: C.bgCard, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
              color: C.text, fontSize: 13, fontFamily: 'Syne',
            }}
          >
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
          <Badge color={activePlan.fileType === 'dwg' ? 'yellow' : 'green'}>
            {activePlan.fileType.toUpperCase()}
          </Badge>
        </div>

        {/* Viewer */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <DxfViewerPanel
            file={activeFile}
            unitFactor={activePlan.units?.factor}
            unitName={activePlan.units?.name}
            style={{ height: '100%' }}
          />
        </div>
      </div>
    )
  }

  // ─── Grid view (plan cards) ──────────────────────────────────────────────
  return (
    <div>
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
        <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 600, fontFamily: 'Syne' }}>
          Tervrajz feltöltése
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          DXF / DWG fájlok — húzd ide vagy kattints
        </div>
        <input ref={inputRef} type="file" multiple accept=".dxf,.dwg"
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
          <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 14, fontFamily: 'Syne' }}>Még nincsenek tervrajzok</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Töltsd fel az első DXF/DWG fájlt a megtekintéshez</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280, 1fr))',
          gap: 16,
        }}>
          {plans.map(plan => (
            <div
              key={plan.id}
              style={{
                background: C.bgCard,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'border-color 0.2s, box-shadow 0.2s',
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
              {/* Preview placeholder */}
              <div style={{
                height: 120, background: C.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 40 }}>
                  {plan.fileType === 'dwg' ? '📋' : '📐'}
                </span>
              </div>

              {/* Info */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6,
                }}>
                  <div style={{
                    color: C.text, fontSize: 13, fontWeight: 600,
                    fontFamily: 'Syne', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 200,
                  }}>
                    {plan.name}
                  </div>
                  <Badge color={plan.fileType === 'dwg' ? 'yellow' : 'green'}>
                    {plan.fileType.toUpperCase()}
                  </Badge>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  color: C.muted, fontSize: 10, fontFamily: 'DM Mono',
                }}>
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
                      color: C.accent, fontSize: 11, fontFamily: 'Syne',
                      fontWeight: 600, cursor: 'pointer',
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
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
