import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react'
import * as three from 'three'

// ─── DxfViewerCanvas ────────────────────────────────────────────────────────
// Core WebGL canvas wrapper around dxf-viewer library.
// Exposes imperative API: camera access, coordinate conversion, layers, fitView.

const DxfViewerCanvas = forwardRef(function DxfViewerCanvas({ file, onLoad, onError, onPointerDown, onPointerMove, clearColor = '#09090B', style }, ref) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const blobUrlRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  useImperativeHandle(ref, () => ({
    getViewer: () => viewerRef.current,
    getLayers: (nonEmpty = true) => viewerRef.current?.GetLayers(nonEmpty) || [],
    showLayer: (name, show) => viewerRef.current?.ShowLayer(name, show),
    fitView: () => {
      const v = viewerRef.current
      if (v && v.bounds) {
        // Use origin-corrected bounds — the library stores geometry at (coords - origin)
        const ox = v.origin?.x || 0
        const oy = v.origin?.y || 0
        v.FitView(v.bounds.minX - ox, v.bounds.maxX - ox, v.bounds.minY - oy, v.bounds.maxY - oy, 0.1)
      }
    },
    subscribe: (event, handler) => viewerRef.current?.Subscribe(event, handler),
    getOrigin: () => viewerRef.current?.origin,
    getBounds: () => viewerRef.current?.bounds,
    getCamera: () => viewerRef.current?.camera || null,
    getRendererElement: () => viewerRef.current?.renderer?.domElement || containerRef.current?.querySelector('canvas') || null,
    sceneToScreen: (sx, sy) => {
      const v = viewerRef.current
      if (!v?.camera || !v?.renderer) return null
      const vec = new three.Vector3(sx, sy, 0)
      vec.project(v.camera)
      const canvas = v.renderer.domElement
      return {
        x: (vec.x + 1) / 2 * canvas.clientWidth,
        y: (-vec.y + 1) / 2 * canvas.clientHeight,
      }
    },
    screenToScene: (screenX, screenY) => {
      const v = viewerRef.current
      if (!v?.camera || !v?.renderer) return null
      const canvas = v.renderer.domElement
      const vec = new three.Vector3(
        (screenX / canvas.clientWidth) * 2 - 1,
        -(screenY / canvas.clientHeight) * 2 + 1,
        0
      )
      vec.unproject(v.camera)
      return { x: vec.x, y: vec.y }
    },
  }))

  useEffect(() => {
    if (!containerRef.current || !file) return

    let cancelled = false
    let moveHandler = null
    let wheelHandler = null

    async function init() {
      setLoading(true)
      setProgress(0)
      setError(null)

      try {
        // Retry dynamic import once — handles stale chunk hashes after Vercel deploy
        let DxfViewer
        try {
          ({ DxfViewer } = await import('dxf-viewer'))
        } catch {
          ({ DxfViewer } = await import('dxf-viewer'))
        }
        if (cancelled) return

        if (viewerRef.current) {
          try { viewerRef.current.Destroy() } catch {}
          viewerRef.current = null
        }
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
        }

        containerRef.current.innerHTML = ''

        const viewer = new DxfViewer(containerRef.current, {
          clearColor: new three.Color(clearColor),
          autoResize: true,
          antialias: true,
          colorCorrection: true,
          sceneOptions: { wireframeMesh: false },
        })

        viewerRef.current = viewer

        const blob = file instanceof Blob ? file : new Blob([file])
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url

        // Offload DXF parse to a web worker so the main thread never freezes.
        // Critical for large files (100+ MB DXF). Without a worker, the browser
        // UI locks up completely during the geometry build phase.
        const workerFactory = () => new Worker(
          new URL('../../workers/dxf-viewer.worker.js', import.meta.url),
          { type: 'module' }
        )

        await viewer.Load({
          url,
          workerFactory,
          progressCbk: (phase, loaded, total) => {
            if (!cancelled) {
              const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
              setProgress(pct)
            }
          },
        })

        if (cancelled) return

        // NOTE: Do NOT call FitView here. The dxf-viewer library already calls
        // FitView internally after Load() with origin-corrected bounds (bounds - origin).
        // Our old code was overriding with raw bounds, causing camera/scene misalignment.

        setLoading(false)
        setProgress(100)

        if (onPointerDown) {
          viewer.Subscribe('pointerdown', onPointerDown)
        }

        // Mouse move tracking for crosshair & live measurement
        if (onPointerMove && viewer.renderer?.domElement) {
          const canvas = viewer.renderer.domElement
          moveHandler = (e) => {
            const rect = canvas.getBoundingClientRect()
            const sx = e.clientX - rect.left
            const sy = e.clientY - rect.top
            const camera = viewer.camera
            if (camera) {
              const vec = new three.Vector3(
                (sx / canvas.clientWidth) * 2 - 1,
                -(sy / canvas.clientHeight) * 2 + 1,
                0
              )
              vec.unproject(camera)
              onPointerMove({ screenX: sx, screenY: sy, sceneX: vec.x, sceneY: vec.y })
            }
          }
          canvas.addEventListener('mousemove', moveHandler)
        }

        // Disable dxf-viewer's built-in scroll zoom so our custom handler takes over
        if (viewer.controls) {
          viewer.controls.enableZoom = false
        }

        // ── Custom wheel handler: matches PDF viewer behavior ──────────────
        // Intercepts ALL wheel events to provide:
        //   1. Two-finger trackpad scroll = pan (camera translate)
        //   2. Trackpad pinch-to-zoom = cursor-centered zoom (fine sensitivity)
        //   3. Mouse wheel = cursor-centered zoom (normal sensitivity)
        // Three.js OrbitControls default wheel zoom is disabled by consuming the event.
        wheelHandler = (e) => {
          e.preventDefault()
          e.stopPropagation()
          const cam = viewer.camera
          if (!cam) return
          const canvas = viewer.renderer?.domElement
          if (!canvas) return
          const viewWidth = cam.right - cam.left
          const viewHeight = cam.top - cam.bottom

          // Detect input type (same logic as PDF viewer)
          const isPinchZoom = e.ctrlKey  // browser sets ctrlKey for trackpad pinch
          const isTrackpadPan = !e.ctrlKey && !e.metaKey && (Math.abs(e.deltaX) > 1 || (Math.abs(e.deltaX) > 0 && Math.abs(e.deltaY) < 30))

          if (isTrackpadPan && !isPinchZoom) {
            // ── Two-finger trackpad scroll → pan ──
            const scale = viewWidth / canvas.clientWidth
            cam.left += e.deltaX * scale
            cam.right += e.deltaX * scale
            cam.top -= e.deltaY * scale
            cam.bottom -= e.deltaY * scale
          } else {
            // ── Zoom (mouse wheel or trackpad pinch) → cursor-centered ──
            // NOTE: frustum scaling is INVERSE of PDF zoom —
            // smaller frustum = zoomed IN, larger = zoomed OUT.
            // deltaY > 0 = scroll down = zoom OUT = frustum LARGER (>1)
            // deltaY < 0 = scroll up = zoom IN = frustum SMALLER (<1)
            const sensitivity = isPinchZoom
              ? (e.deltaY > 0 ? 1.03 : 0.97)   // fine steps for trackpad pinch
              : (e.deltaY > 0 ? 1.087 : 0.92)   // normal steps for mouse wheel
            const newWidth = viewWidth * sensitivity
            const newHeight = viewHeight * sensitivity
            // Clamp: prevent degenerate frustum or extreme zoom
            if (newWidth < 0.01 || newHeight < 0.01) return  // too close
            if (newWidth > 1e8 || newHeight > 1e8) return    // too far

            // Cursor position in NDC (-1 to 1)
            const rect = canvas.getBoundingClientRect()
            const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1
            const my = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
            // Scene position under cursor before zoom
            const cx = cam.left + (mx + 1) / 2 * viewWidth
            const cy = cam.bottom + (my + 1) / 2 * viewHeight
            // New frustum centered on cursor position
            cam.left = cx - (mx + 1) / 2 * newWidth
            cam.right = cam.left + newWidth
            cam.bottom = cy - (my + 1) / 2 * newHeight
            cam.top = cam.bottom + newHeight
          }
          cam.updateProjectionMatrix()
          viewer.Render()
        }
        const canvasEl = viewer.renderer?.domElement
        if (canvasEl) {
          canvasEl.addEventListener('wheel', wheelHandler, { passive: false })
        }

        if (onLoad) {
          const layers = viewer.GetLayers(true)
          onLoad({ layers, bounds: viewer.bounds, origin: viewer.origin })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[DxfViewer] load error:', err)
          setError(err.message || 'Hiba a DXF betöltésénél')
          setLoading(false)
          if (onError) onError(err)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      const canvasEl = viewerRef.current?.renderer?.domElement
      if (moveHandler && canvasEl) {
        canvasEl.removeEventListener('mousemove', moveHandler)
      }
      if (wheelHandler && canvasEl) {
        canvasEl.removeEventListener('wheel', wheelHandler)
      }
      if (viewerRef.current) {
        try { viewerRef.current.Destroy() } catch {}
        viewerRef.current = null
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [file])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: clearColor, overflow: 'hidden' }} />

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(9,9,11,0.85)', zIndex: 5,
        }}>
          <div style={{
            width: 36, height: 36, border: '3px solid #1E1E22',
            borderTopColor: '#00E5A0', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ marginTop: 12, color: '#E4E4E7', fontSize: 13, fontFamily: 'Syne' }}>
            Tervrajz betöltése...
          </div>
          {progress > 0 && progress < 100 && (
            <div style={{ marginTop: 8, width: 120, height: 4, background: '#1E1E22', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#00E5A0', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(9,9,11,0.9)', zIndex: 5, gap: 12,
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div style={{ color: '#FF6B6B', fontSize: 13, fontFamily: 'Syne', textAlign: 'center', maxWidth: 320 }}>
            {error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.4)',
              color: '#00E5A0', fontFamily: 'DM Mono', fontSize: 12,
            }}
          >Oldal újratöltése</button>
        </div>
      )}
    </div>
  )
})

export default DxfViewerCanvas
