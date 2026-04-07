/**
 * useAutoSymbolSearch — search orchestration extracted from PdfViewer.
 *
 * Effects-only hook: search functions are extracted here, state stays in PdfViewer.
 * This avoids TDZ issues while centralizing the search orchestration logic.
 *
 * Provides:
 *   - docAreaToScaledArea: convert doc-coords to analysis pixel coords
 *   - runWorkerSearch: run a single NCC worker search
 *   - runAutoSymbolSearch: full single-template search with candidate regions
 *   - runBatchProjectSearch: family-aware batch search across project plans
 */
import { useCallback, useRef } from 'react'
import { renderPageImageData } from '../utils/templateMatching.js'
import { generateCandidateRegions } from '../utils/pdfVectorAnalysis.js'
import { migrateTemplatesToFamilies, mergeFamiliesFromPlans, sortVariantsByPerformance, updateVariantStats, updateFamilyStats } from '../utils/symbolFamily.js'
import { getPlanAnnotations, savePlanAnnotations, getPlansByProject } from '../data/planStore.js'
import { createMarker } from '../utils/markerModel.js'
import templateMatchWorkerUrl from '../workers/templateMatch.worker.js?url'

export default function useAutoSymbolSearch({
  pdfDoc, pageNum, planId, projectId,
  // State refs/setters from PdfViewer (not owned by this hook)
  autoSymbolSearchIdRef, autoSymbolWorkerRef, autoSymbolTemplateRef,
  autoSymbolAllHitsRef, mountedRef, unrotatedDimsRef, rotationRef,
  setAutoSymbolSearching, setAutoSymbolError, setAutoSymbolResults,
  setAutoSymbolPhase, autoSymbolThreshold, autoSymbolCategory,
  batchCancelRef, setBatchSearching, setBatchProgress,
  markersRef, markDirty, onMarkersChangeRef, assembliesProp,
}) {
  // ── Helper: convert doc-coords searchArea → analysis-pixel scaledArea for worker ──
  const docAreaToScaledArea = useCallback((area, ANALYSIS_SCALE) => {
    return {
      x: Math.round(area.x * ANALYSIS_SCALE),
      y: Math.round(area.y * ANALYSIS_SCALE),
      w: Math.round(area.w * ANALYSIS_SCALE),
      h: Math.round(area.h * ANALYSIS_SCALE),
    }
  }, [])

  // ── Helper: run a single NCC worker search and return hits ──
  const runWorkerSearch = useCallback((imgData, imgW, imgH, cropData, tW, tH, scaledArea) => {
    return new Promise((resolve, reject) => {
      if (autoSymbolWorkerRef.current) autoSymbolWorkerRef.current.terminate()
      const worker = new Worker(templateMatchWorkerUrl, { type: 'module' })
      autoSymbolWorkerRef.current = worker
      worker.onmessage = (e) => {
        if (e.data.type === 'result') resolve(e.data.hits)
        else reject(new Error(e.data.message || 'Worker hiba'))
      }
      worker.onerror = (e) => reject(new Error(e.message || 'Worker összeomlott'))
      worker.postMessage({
        imgData, imgW, imgH,
        tplData: cropData, tplW: tW, tplH: tH,
        threshold: 0.30,
        searchArea: scaledArea,
      })
    })
  }, [autoSymbolWorkerRef])

  // ── Main search: single template with candidate regions + combined NMS ──
  const runAutoSymbolSearch = useCallback(async (threshold, searchArea) => {
    if (!autoSymbolTemplateRef.current || !pdfDoc) return
    const mySearchId = ++autoSymbolSearchIdRef.current
    setAutoSymbolSearching(true)
    setAutoSymbolError(null)
    setAutoSymbolResults([])
    try {
      const searchT0 = performance.now()
      const ANALYSIS_SCALE = 300 / 72
      const page = await pdfDoc.getPage(pageNum)
      const { imageData, width, height } = await renderPageImageData(page, ANALYSIS_SCALE)
      const { cropData, w: tW, h: tH } = autoSymbolTemplateRef.current
      console.log(`[AutoSymbol] Template: ${tW}×${tH}px (${(tW * tH).toLocaleString()} px²) | Page: ${width}×${height}px`)

      let allHits = []

      if (searchArea) {
        const scaledArea = docAreaToScaledArea(searchArea, ANALYSIS_SCALE)
        allHits = await runWorkerSearch(imageData.data, width, height, cropData, tW, tH, scaledArea)
      } else {
        let usedCandidates = false
        try {
          const templateSize = Math.max(tW, tH) / ANALYSIS_SCALE
          const candidates = await generateCandidateRegions(page, templateSize)
          if (candidates && candidates.regions.length > 0) {
            usedCandidates = true
            for (const region of candidates.regions) {
              if (!mountedRef.current || autoSymbolSearchIdRef.current !== mySearchId) return
              const scaledArea = docAreaToScaledArea(region, ANALYSIS_SCALE)
              const regionHits = await runWorkerSearch(imageData.data, width, height, cropData, tW, tH, scaledArea)
              allHits.push(...regionHits)
            }
            console.log(`[AutoSymbol] Vector-aware search: ${candidates.regions.length} regions → ${allHits.length} raw hits`)
          }
        } catch (err) {
          console.warn('[AutoSymbol] Candidate generation failed, using full-page fallback:', err.message)
        }
        if (!usedCandidates || allHits.length === 0) {
          if (usedCandidates) console.log('[AutoSymbol] Candidate regions yielded 0 hits — falling back to full-page search')
          allHits = await runWorkerSearch(imageData.data, width, height, cropData, tW, tH, null)
        }
      }

      if (!mountedRef.current || autoSymbolSearchIdRef.current !== mySearchId) return

      const searchElapsed = Math.round(performance.now() - searchT0)
      console.log(`[AutoSymbol] Search complete: ${allHits.length} raw hits | ${searchElapsed}ms`)

      const nmsMinDist = Math.max(tW, tH) * 0.6
      allHits.sort((a, b) => b.score - a.score)
      const nmsHits = []
      for (const h of allHits) {
        const tooClose = nmsHits.some(k => Math.sqrt((h.x - k.x) ** 2 + (h.y - k.y) ** 2) < nmsMinDist)
        if (!tooClose) nmsHits.push(h)
      }

      const rawResults = nmsHits.map((h, i) => {
        return { x: h.x / ANALYSIS_SCALE, y: h.y / ANALYSIS_SCALE, score: h.score, accepted: true, idx: i }
      })

      autoSymbolAllHitsRef.current = rawResults
      const filtered = rawResults.filter(h => h.score >= threshold).map(h => ({ ...h, accepted: true }))
      setAutoSymbolResults(filtered)
      setAutoSymbolPhase('done')
      if (filtered.length === 0) setAutoSymbolError('Nincs találat ezen a küszöbértéken. Próbáld alacsonyabb küszöbbel.')
    } catch (err) {
      if (!mountedRef.current || autoSymbolSearchIdRef.current !== mySearchId) return
      console.error('[AutoSymbol] worker search failed:', err)
      setAutoSymbolError('Keresés sikertelen: ' + (err.message || 'ismeretlen hiba'))
      setAutoSymbolPhase('done')
    } finally {
      if (mountedRef.current && autoSymbolSearchIdRef.current === mySearchId) setAutoSymbolSearching(false)
    }
  }, [pdfDoc, pageNum, docAreaToScaledArea, runWorkerSearch, autoSymbolTemplateRef, autoSymbolSearchIdRef, autoSymbolAllHitsRef, mountedRef, setAutoSymbolSearching, setAutoSymbolError, setAutoSymbolResults, setAutoSymbolPhase])

  // ── Batch search: family-aware search across project plans ──
  const runBatchProjectSearch = useCallback(async () => {
    if (!pdfDoc || !planId || !projectId) return
    batchCancelRef.current = false
    setBatchSearching(true)
    setBatchProgress('Template-ek betöltése…')
    try {
      const projectPlans = getPlansByProject(projectId).filter(p => p.id !== planId)
      const familyArrays = []
      for (const plan of projectPlans) {
        const ann = await getPlanAnnotations(plan.id)
        const planFamilies = ann?.symbolFamilies?.length
          ? ann.symbolFamilies
          : migrateTemplatesToFamilies(ann?.savedTemplates || [])
        if (planFamilies.length) familyArrays.push(planFamilies)
      }
      const families = mergeFamiliesFromPlans(familyArrays)
      if (families.length === 0) {
        setBatchProgress('')
        setBatchSearching(false)
        setAutoSymbolError('Nincs mentett szimbólum ebben a projektben. Először használd az Auto szimbólum keresést egy másik rajzon.')
        return
      }

      const ANALYSIS_SCALE = 300 / 72
      const page = await pdfDoc.getPage(pageNum)
      const { imageData, width, height } = await renderPageImageData(page, ANALYSIS_SCALE)

      const SECONDARY_THRESHOLD = 2
      const allMarkers = []
      const batchT0 = performance.now()

      for (let fi = 0; fi < families.length; fi++) {
        if (batchCancelRef.current || !mountedRef.current) break
        const family = families[fi]
        const sorted = sortVariantsByPerformance(family)
        const threshold = family.preferredThreshold || 0.50

        setBatchProgress(`Keresés: ${family.name} (${fi + 1}/${families.length})…`)

        const primary = sorted[0]
        const primaryCrop = new Uint8ClampedArray(primary.cropData)
        const primaryHits = await runWorkerSearch(imageData.data, width, height, primaryCrop, primary.w, primary.h, null)
        if (!mountedRef.current) return

        const primaryAbove = primaryHits.filter(h => h.score >= threshold)
        let familyHits = [...primaryHits]
        updateVariantStats(primary, primaryAbove.length,
          primaryAbove.length > 0 ? primaryAbove.reduce((s, h) => s + h.score, 0) / primaryAbove.length : 0)

        if (primaryAbove.length < SECONDARY_THRESHOLD && sorted.length > 1) {
          for (let vi = 1; vi < sorted.length; vi++) {
            if (batchCancelRef.current) break
            const variant = sorted[vi]
            setBatchProgress(`Keresés: ${family.name} variáns ${vi + 1}/${sorted.length} (${fi + 1}/${families.length})…`)
            const varCrop = new Uint8ClampedArray(variant.cropData)
            const varHits = await runWorkerSearch(imageData.data, width, height, varCrop, variant.w, variant.h, null)
            if (!mountedRef.current) return
            const varAbove = varHits.filter(h => h.score >= threshold)
            updateVariantStats(variant, varAbove.length,
              varAbove.length > 0 ? varAbove.reduce((s, h) => s + h.score, 0) / varAbove.length : 0)
            familyHits.push(...varHits)
          }
        }

        const nmsMinDist = Math.max(primary.w, primary.h) * 0.6
        familyHits.sort((a, b) => b.score - a.score)
        const nmsHits = []
        for (const h of familyHits) {
          if (h.score < threshold) continue
          const tooClose = nmsHits.some(k => Math.sqrt((h.x - k.x) ** 2 + (h.y - k.y) ** 2) < nmsMinDist)
          if (!tooClose) nmsHits.push(h)
        }

        for (const h of nmsHits) {
          allMarkers.push({
            x: h.x / ANALYSIS_SCALE, y: h.y / ANALYSIS_SCALE,
            category: family.category, asmId: family.asmId,
            label: family.name, score: h.score, source: 'batch_detection',
          })
        }
        updateFamilyStats(family, nmsHits.length)
      }

      const batchElapsed = Math.round(performance.now() - batchT0)
      console.log(`[BatchSearch] ${families.length} families → ${allMarkers.length} raw markers | ${batchElapsed}ms | page ${width}×${height}px`)

      if (batchCancelRef.current) {
        setBatchProgress('Keresés megszakítva')
        setTimeout(() => setBatchProgress(''), 2000)
        setBatchSearching(false)
        return
      }

      allMarkers.sort((a, b) => b.score - a.score)
      const dedupDist = 15
      const unique = []
      for (const m of allMarkers) {
        const tooClose = unique.some(u =>
          u.category === m.category && Math.sqrt((m.x - u.x) ** 2 + (m.y - u.y) ** 2) < dedupDist
        )
        if (!tooClose) unique.push(m)
      }

      const asm = assembliesProp || []
      const ASM_COLORS_MAP = { 'szerelvenyek': '#4CC9F0', 'vilagitas': '#00E5A0', 'elosztok': '#FF6B6B', 'gyengaram': '#A78BFA', 'tuzjelzo': '#FF8C42' }
      for (const m of unique) {
        const a = asm.find(a => a.id === m.asmId)
        const color = a ? (ASM_COLORS_MAP[a.category] || '#9CA3AF') : '#9CA3AF'
        markersRef.current.push(createMarker({
          x: m.x, y: m.y, pageNum,
          category: m.category, color, asmId: m.asmId,
          source: 'batch_detection', confidence: m.score, label: m.label,
        }))
      }

      try {
        const ann = await getPlanAnnotations(planId)
        savePlanAnnotations(planId, { ...ann, symbolFamilies: families }, { silent: true })
      } catch { /* best-effort */ }

      markDirty()
      if (onMarkersChangeRef.current) onMarkersChangeRef.current([...markersRef.current])
      setBatchProgress(`✓ ${unique.length} szimbólum találva (${families.length} család)`)
      setTimeout(() => setBatchProgress(''), 3000)
    } catch (err) {
      console.error('[BatchSearch] failed:', err)
      setBatchProgress('Keresés sikertelen: ' + err.message)
      setTimeout(() => setBatchProgress(''), 5000)
    } finally {
      if (autoSymbolWorkerRef.current) {
        autoSymbolWorkerRef.current.terminate()
        autoSymbolWorkerRef.current = null
      }
      setBatchSearching(false)
    }
  }, [pdfDoc, pageNum, planId, projectId, assembliesProp, markDirty, runWorkerSearch, batchCancelRef, setBatchSearching, setBatchProgress, setAutoSymbolError, mountedRef, autoSymbolWorkerRef, markersRef, onMarkersChangeRef])

  return { docAreaToScaledArea, runWorkerSearch, runAutoSymbolSearch, runBatchProjectSearch }
}
