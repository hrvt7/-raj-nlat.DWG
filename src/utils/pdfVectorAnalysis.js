// ─── PDF Vector Analysis — page classification + text context ────────────────
// Determines if a PDF page is vector-based, mixed, or raster-only.
// Extracts nearby text for symbol validation / context scoring.

/**
 * Classify a PDF page as vector / mixed / raster based on operator density.
 * Vector PDFs have many path operators (moveTo, lineTo, curveTo, fill, stroke).
 * Raster PDFs are dominated by paintImageXObject.
 *
 * @param {object} page - pdf.js page object
 * @returns {{ type: 'vector'|'mixed'|'raster', vectorOps: number, imageOps: number, ratio: number }}
 */
export async function classifyPage(page) {
  const ops = await page.getOperatorList()
  let vectorOps = 0
  let imageOps = 0

  // pdf.js OPS constants for path operations
  const VECTOR_OPS = new Set([
    // Path construction
    6,  // moveTo
    7,  // lineTo
    8,  // curveTo
    9,  // curveTo2
    10, // curveTo3
    11, // closePath
    // Path painting
    12, // rectangle
    13, // stroke
    14, // closeStroke
    15, // fill
    16, // eoFill
    17, // fillStroke
    18, // eoFillStroke
    19, // closeFillStroke
  ])
  const IMAGE_OPS = new Set([
    85, // paintImageXObject
    86, // paintImageMaskXObject
    87, // paintInlineImageXObject
  ])

  for (const fn of ops.fnArray) {
    if (VECTOR_OPS.has(fn)) vectorOps++
    if (IMAGE_OPS.has(fn)) imageOps++
  }

  const total = vectorOps + imageOps
  const ratio = total > 0 ? vectorOps / total : 0

  let type = 'raster'
  if (ratio > 0.8) type = 'vector'
  else if (ratio > 0.2) type = 'mixed'

  return { type, vectorOps, imageOps, ratio }
}

/**
 * Extract text items with positions from a PDF page.
 * Returns flat array of { text, x, y, width, height, fontSize }.
 *
 * @param {object} page - pdf.js page object
 * @returns {Array<{text: string, x: number, y: number, width: number, height: number, fontSize: number}>}
 */
export async function extractTextItems(page) {
  const textContent = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1.0 })

  return textContent.items
    .filter(item => item.str && item.str.trim())
    .map(item => {
      const tx = item.transform
      return {
        text: item.str.trim(),
        x: tx[4],
        y: viewport.height - tx[5], // PDF y is bottom-up → flip to top-down
        width: item.width,
        height: item.height || Math.abs(tx[3]),
        fontSize: Math.abs(tx[0]) || 12,
      }
    })
}

/**
 * Find text labels near a given point within a search radius.
 * Useful for text-assisted symbol validation.
 *
 * @param {Array} textItems - from extractTextItems
 * @param {number} x - center x in PDF coords
 * @param {number} y - center y in PDF coords
 * @param {number} radius - search radius in PDF units
 * @returns {Array<{text: string, distance: number}>}
 */
export function findNearbyText(textItems, x, y, radius = 50) {
  return textItems
    .map(item => {
      const cx = item.x + item.width / 2
      const cy = item.y + item.height / 2
      const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2)
      return { text: item.text, distance: dist }
    })
    .filter(r => r.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
}

/**
 * Score a symbol candidate based on nearby text context.
 * Higher score = more likely to be a real symbol (has expected label nearby).
 *
 * @param {Array} nearbyTexts - from findNearbyText
 * @param {string} symbolCategory - 'light', 'socket', 'switch', etc.
 * @returns {number} context score 0-1
 */
export function textContextScore(nearbyTexts, symbolCategory) {
  if (!nearbyTexts.length) return 0.5 // no text = neutral

  // Electrical symbol labels often contain circuit identifiers
  const hasCircuitId = nearbyTexts.some(t => /^[A-Z]?\d{1,3}$/.test(t.text) || /^L\d|^K\d|^D\d/.test(t.text))
  const hasWattage = nearbyTexts.some(t => /\d+\s*[Ww]|\d+\s*VA/.test(t.text))
  const hasVoltage = nearbyTexts.some(t => /\d+\s*[Vv]|230|400/.test(t.text))
  const hasDimension = nearbyTexts.some(t => /\d+\s*mm|\d+×\d+/.test(t.text))

  let score = 0.5
  if (hasCircuitId) score += 0.2
  if (hasWattage) score += 0.15
  if (hasVoltage) score += 0.1
  if (hasDimension) score += 0.05
  return Math.min(1.0, score)
}
