/**
 * useCableEstimation — 3-tier cable estimation effects extracted from TakeoffWorkspace.
 *
 * This hook manages the EFFECTS only (not state ownership).
 * State is declared in TakeoffWorkspace and passed in.
 * This pattern avoids TDZ issues with hook ordering while still
 * centralizing the cable estimation logic.
 *
 * Tiers (priority order):
 *   P1: DXF layer detection (confidence ~0.92)
 *   P2: MST estimation from device positions (confidence ~0.75)
 *   P3: Device count × average cable length (fallback, confidence 0.55)
 *
 * Also handles:
 *   - Panel-assisted estimation (manual mode)
 *   - Reference panel persistence
 */
import { useEffect } from 'react'
import { estimateCablesMST } from '../pdfTakeoff.js'
import { normalizeCableEstimate, shouldOverwrite, CABLE_SOURCE } from '../utils/cableModel.js'
import { detectDxfCableLengths } from '../utils/blockRecognition.js'
import { computePanelAssistedEstimate } from '../utils/panelAssistedEstimate.js'
import { saveReferencePanels } from '../utils/referencePanelStore.js'

export default function useCableEstimation({
  takeoffRows, effectiveParsedDxf, recognizedItems, asmOverrides,
  setCableEstimate, referencePanels, planId,
}) {
  // ── 3-tier cascade ──
  useEffect(() => {
    if (!takeoffRows.length) {
      setCableEstimate(prev => {
        if (prev?._source !== CABLE_SOURCE.PDF_TAKEOFF && prev?._source !== CABLE_SOURCE.PDF_MARKERS) return null
        return prev
      })
      return
    }

    // Tier 1: actual cable geometry from DXF layers
    const layerResult = detectDxfCableLengths(effectiveParsedDxf)
    if (layerResult) {
      const normalized = normalizeCableEstimate(layerResult, CABLE_SOURCE.DXF_LAYERS)
      setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
      return
    }

    // Tier 2: MST from device positions
    const inserts = effectiveParsedDxf?.inserts
    if (inserts?.length >= 2) {
      const devices = inserts.map(ins => {
        const recog = recognizedItems.find(r => r.blockName === ins.name)
        const asmId = asmOverrides[ins.name] !== undefined ? asmOverrides[ins.name] : recog?.asmId
        const type = asmId === 'ASM-003' ? 'light' : asmId === 'ASM-001' ? 'socket' : asmId === 'ASM-002' ? 'switch' : 'other'
        return { type, x: ins.x, y: ins.y, name: ins.name }
      })
      const scaleFactor = effectiveParsedDxf?.units?.factor ?? 0.001
      try {
        const mstResult = estimateCablesMST(devices, scaleFactor)
        if (mstResult && mstResult.cable_total_m > 0) {
          mstResult.method = `MST becslés (${devices.length} eszközpozíció alapján)`
          const normalized = normalizeCableEstimate(mstResult, CABLE_SOURCE.DXF_MST)
          setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
          return
        }
      } catch (_e) { /* fallthrough to device-count */ }
    }

    // Tier 3: device count × average cable length
    const lightQty  = takeoffRows.filter(r => r.asmId === 'ASM-003').reduce((s, r) => s + r.qty, 0)
    const socketQty = takeoffRows.filter(r => r.asmId === 'ASM-001').reduce((s, r) => s + r.qty, 0)
    const switchQty = takeoffRows.filter(r => r.asmId === 'ASM-002').reduce((s, r) => s + r.qty, 0)
    const total = lightQty + socketQty + switchQty
    if (!total) { setCableEstimate(null); return }

    const lightM  = lightQty  * 8
    const socketM = socketQty * 6
    const switchM = switchQty * 4
    const totalM  = lightM + socketM + switchM
    const normalized = normalizeCableEstimate({
      cable_total_m: totalM,
      cable_by_type: { light_m: lightM, socket_m: socketM, switch_m: switchM, data_m: 0, fire_m: 0, other_m: 0 },
      method: 'Becslés eszközszám alapján (nincs pozícióadat)',
      confidence: 0.55,
    }, CABLE_SOURCE.DEVICE_COUNT)
    setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
  }, [takeoffRows, effectiveParsedDxf, recognizedItems, asmOverrides, setCableEstimate])

  // ── Panel-assisted estimation ──
  useEffect(() => {
    if (!referencePanels.length || !effectiveParsedDxf?.inserts?.length) return
    const scaleFactor = effectiveParsedDxf?.units?.factor ?? 0.001
    const panelEst = computePanelAssistedEstimate(
      effectiveParsedDxf.inserts, recognizedItems, asmOverrides,
      referencePanels, scaleFactor
    )
    if (panelEst) {
      const normalized = normalizeCableEstimate(panelEst, CABLE_SOURCE.PANEL_ASSISTED)
      setCableEstimate(prev => shouldOverwrite(prev, normalized) ? normalized : prev)
    }
  }, [referencePanels, effectiveParsedDxf, recognizedItems, asmOverrides, setCableEstimate])

  // ── Persist reference panels ──
  useEffect(() => {
    if (!planId) return
    saveReferencePanels(planId, referencePanels)
  }, [referencePanels, planId])
}
