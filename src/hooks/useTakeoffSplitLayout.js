/**
 * useTakeoffSplitLayout — Split layout + mobile shell orchestration for TakeoffWorkspace.
 *
 * Owns:
 *   - isMobile detection + resize listener
 *   - showDxfOnMobile toggle state
 *   - panelRatio + containerRef + drag resize lifecycle
 *
 * Returns state/refs/callbacks consumed by TakeoffWorkspace JSX.
 * Pure UI orchestration — no business logic.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export default function useTakeoffSplitLayout() {
  // ── Mobile responsive state ───────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [showDxfOnMobile, setShowDxfOnMobile] = useState(false)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── Resizable split panel ─────────────────────────────────────────────────
  // panelRatio: left panel width as % of the container (clamp 25–80)
  const [panelRatio, setPanelRatio] = useState(58)
  const containerRef = useRef(null)
  const dragStateRef = useRef({ active: false, startX: 0, startRatio: 58 })

  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    dragStateRef.current = { active: true, startX: e.clientX, startRatio: panelRatio }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [panelRatio])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragStateRef.current.active) return
      const containerW = containerRef.current?.offsetWidth || 1
      const dx = e.clientX - dragStateRef.current.startX
      const delta = (dx / containerW) * 100
      const newRatio = Math.min(80, Math.max(25, dragStateRef.current.startRatio + delta))
      setPanelRatio(newRatio)
    }
    const onUp = () => {
      if (!dragStateRef.current.active) return
      dragStateRef.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return {
    isMobile,
    showDxfOnMobile,
    setShowDxfOnMobile,
    panelRatio,
    containerRef,
    handleDividerMouseDown,
  }
}
