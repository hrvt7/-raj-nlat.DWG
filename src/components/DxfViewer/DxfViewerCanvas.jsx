import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as three from 'three'

// ─── DxfViewerCanvas ────────────────────────────────────────────────────────
// Core WebGL canvas wrapper around dxf-viewer library.
// Accepts a File or Blob, creates an object URL, loads into dxf-viewer.
// Exposes imperative API: getLayers, showLayer, fitView, getViewer, subscribe

const DxfViewerCanvas = forwardRef(function DxfViewerCanvas({ file, onLoad, onError, onPointerDown, clearColor = '#09090B', style }, ref) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const blobUrlRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    getViewer: () => viewerRef.current,
    getLayers: (nonEmpty = true) => viewerRef.current?.GetLayers(nonEmpty) || [],
    showLayer: (name, show) => viewerRef.current?.ShowLayer(name, show),
    fitView: () => {
      const v = viewerRef.current
      if (v && v.bounds) {
        v.FitView(v.bounds.minX, v.bounds.maxX, v.bounds.minY, v.bounds.maxY, 0.1)
      }
    },
    subscribe: (event, handler) => viewerRef.current?.Subscribe(event, handler),
    getOrigin: () => viewerRef.current?.origin,
    getBounds: () => viewerRef.current?.bounds,
  }))

  // Initialize and load
  useEffect(() => {
    if (!containerRef.current || !file) return

    let cancelled = false
    let viewer = null

    async function init() {
      setLoading(true)
      setProgress(0)
      setError(null)

      try {
        // Dynamic import to avoid SSR issues and reduce initial bundle
        const { DxfViewer } = await import('dxf-viewer')

        if (cancelled) return

        // Cleanup any previous viewer
        if (viewerRef.current) {
          try { viewerRef.current.Destroy() } catch {}
          viewerRef.current = null
        }
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = null
        }

        // Clear container
        containerRef.current.innerHTML = ''

        // Create viewer
        viewer = new DxfViewer(containerRef.current, {
          clearColor: new three.Color(clearColor),
          autoResize: true,
          antialias: true,
          colorCorrection: true,
          sceneOptions: { wireframeMesh: false },
        })

        viewerRef.current = viewer

        // Create blob URL from file
        const blob = file instanceof Blob ? file : new Blob([file])
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url

        // Load with progress callback
        await viewer.Load({
          url,
          progressCbk: (phase, loaded, total) => {
            if (!cancelled) {
              const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
              setProgress(pct)
            }
          },
        })

        if (cancelled) return

        // Fit the view to content
        if (viewer.bounds) {
          viewer.FitView(viewer.bounds.minX, viewer.bounds.maxX, viewer.bounds.minY, viewer.bounds.maxY, 0.1)
        }

        setLoading(false)
        setProgress(100)

        // Wire up pointer events
        if (onPointerDown) {
          viewer.Subscribe('pointerdown', onPointerDown)
        }

        // Notify parent
        if (onLoad) {
          const layers = viewer.GetLayers(true)
          onLoad({ layers, bounds: viewer.bounds, origin: viewer.origin })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('DxfViewer load error:', err)
          setError(err.message || 'Hiba a DXF betöltésénél')
          setLoading(false)
          if (onError) onError(err)
        }
      }
    }

    init()

    return () => {
      cancelled = true
      if (viewerRef.current) {
        try { viewerRef.current.Destroy() } catch {}
        viewerRef.current = null
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [file]) // Only re-init when file changes

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      {/* WebGL container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: clearColor,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(9,9,11,0.85)', borderRadius: 8, zIndex: 5,
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

      {/* Error overlay */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(9,9,11,0.9)', borderRadius: 8, zIndex: 5,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ color: '#FF6B6B', fontSize: 13, fontFamily: 'Syne', textAlign: 'center', maxWidth: 280 }}>
            {error}
          </div>
        </div>
      )}
    </div>
  )
})

export default DxfViewerCanvas
