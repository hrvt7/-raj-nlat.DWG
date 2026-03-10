// ─── Evidence Extractor — Build per-block evidence from normalized DXF data ──
// Pure function module. No side effects, no React, no DOM.
// Safe for Web Workers and tests.
//
// CRITICAL: This module consumes ONLY the normalized contract shape
// (output of normalizeDxfResult from dxfParseContract.js).
// It must never read raw parser output directly.
// This ensures parser-path independence (browser/worker/cableAgent).
//
// Uses contract fields: insertPositions (with .attribs), textEntities,
// geomBounds, blocks.

import {
  normalizeSignature,
  normalizeLayerSignature,
  normalizeAttribSignature,
  normalizeTextSignature,
} from './recognitionMemory.js'

// ── Evidence object shape ─────────────────────────────────────────────────────
// {
//   blockName:  string,              // raw block name
//   layer:      string,              // dominant layer for this block type
//   attribs:    [{tag, value}]|null, // canonical ATTRIB set (majority vote)
//   nearbyText: string[],           // text entities within proximity radius
//   signals: {
//     block_name:          string|null,  // normalizeSignature(blockName)
//     layer_name:          string|null,  // normalizeLayerSignature(layer)
//     attribute_signature: string|null,  // normalizeAttribSignature(attribs)
//     nearby_text:         string|null,  // normalizeTextSignature(nearbyText)
//   }
// }

// ── Proximity radius computation ─────────────────────────────────────────────
/**
 * Compute the proximity radius for nearby text detection.
 * Based on the geometry bounding box diagonal, clamped to [50, 2000].
 * @param {object|null} geomBounds — { width, height } from contract
 * @returns {number} — proximity radius in drawing units
 */
function computeProximityRadius(geomBounds) {
  if (!geomBounds) return 200 // sensible default
  const span = Math.max(geomBounds.width || 0, geomBounds.height || 0)
  const radius = span * 0.02
  return Math.max(50, Math.min(2000, radius))
}

// ── Dominant layer for a block type ──────────────────────────────────────────
/**
 * Find the most frequent layer for a given block name across all inserts.
 * @param {string} blockName
 * @param {Array} inserts — insertPositions from contract
 * @returns {string|null}
 */
function dominantLayer(blockName, inserts) {
  const layerCounts = {}
  for (const ins of inserts) {
    if (ins.name === blockName) {
      layerCounts[ins.layer] = (layerCounts[ins.layer] || 0) + 1
    }
  }
  let best = null, bestCount = 0
  for (const [layer, count] of Object.entries(layerCounts)) {
    if (count > bestCount) { best = layer; bestCount = count }
  }
  return best
}

// ── Aggregate ATTRIBs for a block type ───────────────────────────────────────
/**
 * If 70%+ of inserts of a block type share the same ATTRIB set, return it.
 * @param {string} blockName
 * @param {Array} inserts — insertPositions from contract
 * @returns {Array|null} — [{tag, value}] or null
 */
function aggregateAttribs(blockName, inserts) {
  const withAttribs = []
  let totalInserts = 0

  for (const ins of inserts) {
    if (ins.name !== blockName) continue
    totalInserts++
    if (ins.attribs && ins.attribs.length > 0) {
      // Canonical key: sorted tags joined
      const key = ins.attribs
        .map(a => `${a.tag}=${a.value}`)
        .sort()
        .join('|')
      withAttribs.push({ key, attribs: ins.attribs })
    }
  }

  if (withAttribs.length === 0) return null

  // Count occurrences of each canonical key
  const keyCounts = {}
  for (const { key } of withAttribs) {
    keyCounts[key] = (keyCounts[key] || 0) + 1
  }

  // Find the most common set
  let bestKey = null, bestCount = 0
  for (const [key, count] of Object.entries(keyCounts)) {
    if (count > bestCount) { bestKey = key; bestCount = count }
  }

  // Only use if 70%+ of inserts with this block name share this set
  if (bestCount / totalInserts < 0.7) return null

  // Return the actual attribs array from the first match
  return withAttribs.find(a => a.key === bestKey)?.attribs || null
}

// ── Find nearby text ─────────────────────────────────────────────────────────
/**
 * Find text entities within radius of a point.
 * @param {Array} textEntities — [{text, x, y, layer}]
 * @param {number} cx — center x
 * @param {number} cy — center y
 * @param {number} radius — search radius
 * @returns {string[]} — deduplicated text strings
 */
function findNearbyText(textEntities, cx, cy, radius) {
  if (!textEntities || textEntities.length === 0) return []

  const r2 = radius * radius
  const found = new Set()

  for (const te of textEntities) {
    const dx = te.x - cx, dy = te.y - cy
    if (dx * dx + dy * dy <= r2) {
      const trimmed = te.text.trim()
      if (trimmed.length >= 2 && trimmed.length <= 30) {
        found.add(trimmed)
      }
    }
  }

  // Return top-3 shortest meaningful texts (not pure digits)
  return [...found]
    .filter(t => !/^\d+$/.test(t))
    .sort((a, b) => a.length - b.length)
    .slice(0, 3)
}

// ── Main export ──────────────────────────────────────────────────────────────
/**
 * Build evidence objects for each unique block type from normalized DXF data.
 *
 * @param {object} normalizedDxf — normalized DXF result (from normalizeDxfResult)
 *   Uses: insertPositions (with .attribs), textEntities, geomBounds, blocks
 * @returns {Map<string, Evidence>} — keyed by raw block name
 */
export function buildBlockEvidence(normalizedDxf) {
  const evidenceMap = new Map()

  if (!normalizedDxf || !normalizedDxf.success) return evidenceMap

  const inserts = normalizedDxf.insertPositions || []
  const textEnts = normalizedDxf.textEntities || []
  const geomBounds = normalizedDxf.geomBounds || null
  const blocks = normalizedDxf.blocks || []

  if (blocks.length === 0 && inserts.length === 0) return evidenceMap

  const radius = computeProximityRadius(geomBounds)

  // Collect unique block names
  const blockNames = new Set(blocks.map(b => b.name))

  // Compute centroid of all inserts per block type
  const centroidMap = new Map() // blockName → {sumX, sumY, count}
  for (const ins of inserts) {
    if (!centroidMap.has(ins.name)) {
      centroidMap.set(ins.name, { sumX: 0, sumY: 0, count: 0 })
    }
    const c = centroidMap.get(ins.name)
    c.sumX += ins.x
    c.sumY += ins.y
    c.count++
  }

  for (const blockName of blockNames) {
    // Dominant layer
    const layer = dominantLayer(blockName, inserts)

    // Aggregated ATTRIBs
    const attribs = aggregateAttribs(blockName, inserts)

    // Nearby text (from centroid)
    let nearbyText = []
    const centroid = centroidMap.get(blockName)
    if (centroid && centroid.count > 0) {
      const cx = centroid.sumX / centroid.count
      const cy = centroid.sumY / centroid.count
      nearbyText = findNearbyText(textEnts, cx, cy, radius)
    }

    // Build signal signatures
    const blockSig = normalizeSignature(blockName)
    const layerSig = layer ? normalizeLayerSignature(layer) : null
    const attribSig = attribs ? normalizeAttribSignature(attribs) : null
    const textSig = nearbyText.length > 0 ? normalizeTextSignature(nearbyText) : null

    evidenceMap.set(blockName, {
      blockName,
      layer: layer || 'DEFAULT',
      attribs,
      nearbyText,
      signals: {
        block_name: blockSig !== '_EMPTY_' ? blockSig : null,
        layer_name: layerSig || null,
        attribute_signature: attribSig || null,
        nearby_text: textSig || null,  // null if quality gate failed
      },
    })
  }

  return evidenceMap
}
