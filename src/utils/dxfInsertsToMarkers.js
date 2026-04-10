/**
 * DXF Inserts → Shared Marker Model
 *
 * Converts DXF INSERT positions + recognition results into marker objects
 * that follow the same contract as PDF manual/detection markers.
 *
 * This bridges the DXF auto-found hits into the shared marker model so that:
 * - The Canvas2D overlay renders them (same as manual markers)
 * - buildMarkerRows() generates takeoff rows (same as PDF)
 * - Undo, toggle, save/reopen all work identically to PDF
 *
 * Each INSERT becomes one marker. Block→assembly mapping comes from
 * recognizedItems + asmOverrides.
 */

import { createMarker } from './markerModel.js'

// Assembly category → marker color mapping (matches DXF toolbar / TakeoffRow colors)
const ASM_CATEGORY_COLORS = {
  szerelvenyek: '#4CC9F0',
  vilagitas:    '#00E5A0',
  elosztok:     '#FF6B6B',
  gyengaram:    '#A78BFA',
  tuzjelzo:     '#FF8C42',
}

const FALLBACK_COLOR = '#9CA3AF'

/**
 * Convert DXF inserts to shared marker objects.
 *
 * @param {Array<{name: string, layer: string, x: number, y: number}>} inserts
 *   Raw INSERT positions from dxfParser (DXF world coordinates)
 * @param {Array<{blockName: string, qty: number, asmId: string|null, confidence: number}>} recognizedItems
 *   Recognition results (block-level, not per-instance)
 * @param {Object<string, string>} asmOverrides
 *   User overrides: blockName → asmId
 * @param {Array<{id: string, category?: string, name?: string}>} assemblies
 *   Assembly catalog for color lookup
 * @param {{x: number, y: number}|null} origin
 *   dxf-viewer scene origin — subtracted from INSERT coords to match Three.js scene space.
 *   The library shifts all geometry by -origin to minimize float precision issues.
 *   Markers must use the same origin-shifted coords so they align with the rendered drawing.
 * @returns {Object[]} Array of createMarker() objects with source: 'detection'
 */
export function dxfInsertsToMarkers(inserts, recognizedItems, asmOverrides, assemblies, origin) {
  if (!inserts?.length) return []

  // Origin correction: shift DXF world coords to scene-local coords
  const ox = origin?.x || 0
  const oy = origin?.y || 0

  // Build blockName → recognition info lookup
  const recMap = {}
  for (const item of (recognizedItems || [])) {
    recMap[item.blockName] = item
  }

  // Build asmId → assembly lookup for color
  const asmMap = {}
  for (const asm of (assemblies || [])) {
    asmMap[asm.id] = asm
  }

  const markers = []

  for (const ins of inserts) {
    const blockName = ins.name
    const rec = recMap[blockName]
    if (!rec) continue // not recognized (junk/non-electrical filtered out already)

    // Resolve assembly: user override wins, then recognition
    const asmId = asmOverrides[blockName] !== undefined
      ? asmOverrides[blockName]
      : rec.asmId

    if (!asmId) continue // no assembly match → skip (unknown blocks don't become markers)

    // Resolve color from assembly category
    const asm = asmMap[asmId]
    const color = asm
      ? (ASM_CATEGORY_COLORS[asm.category] || FALLBACK_COLOR)
      : FALLBACK_COLOR

    markers.push(createMarker({
      x: ins.x - ox,
      y: ins.y - oy,
      category: asmId,          // Use asmId as category (matches PDF marker convention)
      color,
      asmId,
      source: 'detection',       // Explicit: auto-found from DXF block recognition
      sourceType: 'assembly',
      confidence: rec.confidence ?? null,
      label: blockName,          // Preserve block name for audit/review
    }))
  }

  return markers
}
