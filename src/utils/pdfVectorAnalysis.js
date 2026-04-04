// ─── PDF Vector Analysis — page classification + candidate generation ────────
// Determines if a PDF page is vector-based, mixed, or raster-only.
// Extracts colored path clusters for search-space pruning.
// Generates candidate regions for targeted template matching.

// pdf.js OPS constants (from pdfjs-dist/build/pdf.mjs)
const OPS = {
  // Path construction
  moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17,
  closePath: 18, rectangle: 19,
  // Path painting
  stroke: 20, closeStroke: 21, fill: 22, eoFill: 23,
  fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27,
  // State
  save: 10, restore: 11, transform: 12,
  // Color
  setStrokeRGBColor: 58, setFillRGBColor: 59,
  setStrokeGray: 56, setFillGray: 57,
  setStrokeCMYKColor: 60, setFillCMYKColor: 61,
  // Text
  showText: 44, showSpacedText: 45,
  // Images
  paintImageXObject: 85, paintImageMaskXObject: 83, paintInlineImageXObject: 86,
  // Bundled path (modern pdf.js)
  constructPath: 91,
}

const VECTOR_OPS = new Set([
  OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3,
  OPS.closePath, OPS.rectangle, OPS.constructPath,
  OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill,
  OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke,
])
const IMAGE_OPS = new Set([OPS.paintImageXObject, OPS.paintImageMaskXObject, OPS.paintInlineImageXObject])
const PAINT_OPS = new Set([
  OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill,
  OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke,
])

/**
 * Classify a PDF page as vector / mixed / raster based on operator density.
 *
 * @param {object} page - pdf.js page object
 * @returns {Promise<{ type: 'vector'|'mixed'|'raster', vectorOps: number, imageOps: number, ratio: number }>}
 */
export async function classifyPage(page) {
  const ops = await page.getOperatorList()
  let vectorOps = 0
  let imageOps = 0

  for (const fn of ops.fnArray) {
    if (VECTOR_OPS.has(fn)) vectorOps++
    if (IMAGE_OPS.has(fn)) imageOps++
  }

  const total = vectorOps + imageOps
  const ratio = total > 0 ? vectorOps / total : 0

  let type = 'raster'
  if (ratio > 0.85) type = 'vector'
  else if (ratio > 0.15) type = 'mixed'

  return { type, vectorOps, imageOps, ratio }
}

/**
 * Compute HSL saturation from RGB [0-1].
 * @returns {number} saturation 0-1
 */
function rgbSaturation(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const l = (max + min) / 2
  const chroma = max - min
  return chroma / (1 - Math.abs(2 * l - 1))
}

/**
 * Extract bounding boxes of colored (non-gray) vector paths from a PDF page.
 * Tracks color state through the operator list and collects bounding boxes
 * of paths painted in saturated colors (typical for electrical symbols).
 *
 * @param {object} page - pdf.js page object
 * @returns {Promise<Array<{x: number, y: number, w: number, h: number, r: number, g: number, b: number, sat: number}>>}
 */
export async function extractColoredPaths(page) {
  const ops = await page.getOperatorList()
  const viewport = page.getViewport({ scale: 1.0 })
  const pageH = viewport.height
  const { fnArray, argsArray } = ops

  // Track current graphics state (color)
  let strokeR = 0, strokeG = 0, strokeB = 0
  let fillR = 0, fillG = 0, fillB = 0
  // Track path bounding box from moveTo/lineTo/curveTo/rectangle
  let pathMinX = Infinity, pathMinY = Infinity, pathMaxX = -Infinity, pathMaxY = -Infinity
  let pathActive = false

  const coloredPaths = []
  const MIN_SAT = 0.15 // minimum saturation to consider "colored"

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i]

    // Color state tracking
    if (fn === OPS.setStrokeRGBColor && args) {
      strokeR = args[0]; strokeG = args[1]; strokeB = args[2]
    } else if (fn === OPS.setFillRGBColor && args) {
      fillR = args[0]; fillG = args[1]; fillB = args[2]
    } else if (fn === OPS.setStrokeGray && args) {
      strokeR = strokeG = strokeB = args[0]
    } else if (fn === OPS.setFillGray && args) {
      fillR = fillG = fillB = args[0]

    // Path construction — accumulate bounding box
    } else if (fn === OPS.moveTo && args) {
      pathActive = true
      const px = args[0], py = args[1]
      if (px < pathMinX) pathMinX = px; if (px > pathMaxX) pathMaxX = px
      if (py < pathMinY) pathMinY = py; if (py > pathMaxY) pathMaxY = py
    } else if (fn === OPS.lineTo && args) {
      pathActive = true
      const px = args[0], py = args[1]
      if (px < pathMinX) pathMinX = px; if (px > pathMaxX) pathMaxX = px
      if (py < pathMinY) pathMinY = py; if (py > pathMaxY) pathMaxY = py
    } else if (fn === OPS.curveTo && args) {
      pathActive = true
      for (let j = 0; j < 6; j += 2) {
        const px = args[j], py = args[j + 1]
        if (px < pathMinX) pathMinX = px; if (px > pathMaxX) pathMaxX = px
        if (py < pathMinY) pathMinY = py; if (py > pathMaxY) pathMaxY = py
      }
    } else if ((fn === OPS.curveTo2 || fn === OPS.curveTo3) && args) {
      pathActive = true
      for (let j = 0; j < 4; j += 2) {
        const px = args[j], py = args[j + 1]
        if (px < pathMinX) pathMinX = px; if (px > pathMaxX) pathMaxX = px
        if (py < pathMinY) pathMinY = py; if (py > pathMaxY) pathMaxY = py
      }
    } else if (fn === OPS.rectangle && args) {
      pathActive = true
      const rx = args[0], ry = args[1], rw = args[2], rh = args[3]
      if (rx < pathMinX) pathMinX = rx
      if (rx + rw > pathMaxX) pathMaxX = rx + rw
      if (ry < pathMinY) pathMinY = ry
      if (ry + rh > pathMaxY) pathMaxY = ry + rh

    // constructPath — bundled path with optional minMax bounding box
    } else if (fn === OPS.constructPath && args) {
      pathActive = true
      // args[1] may be a minMax array [minX, maxX, minY, maxY]
      if (args[1] && args[1].length >= 4) {
        const mm = args[1]
        if (mm[0] < pathMinX) pathMinX = mm[0]
        if (mm[1] > pathMaxX) pathMaxX = mm[1]
        if (mm[2] < pathMinY) pathMinY = mm[2]
        if (mm[3] > pathMaxY) pathMaxY = mm[3]
      }

    // Path painting — emit colored path bbox and reset
    } else if (PAINT_OPS.has(fn) && pathActive) {
      // Determine color: stroke ops use stroke color, fill ops use fill color
      const isStroke = fn === OPS.stroke || fn === OPS.closeStroke
      const isFill = fn === OPS.fill || fn === OPS.eoFill
      const r = isStroke ? strokeR : (isFill ? fillR : Math.max(strokeR, fillR))
      const g = isStroke ? strokeG : (isFill ? fillG : Math.max(strokeG, fillG))
      const b = isStroke ? strokeB : (isFill ? fillB : Math.max(strokeB, fillB))
      const sat = rgbSaturation(r, g, b)

      if (sat >= MIN_SAT && pathMaxX > pathMinX && pathMaxY > pathMinY) {
        // Convert PDF coords (bottom-up) to top-down
        const x = pathMinX
        const y = pageH - pathMaxY
        const w = pathMaxX - pathMinX
        const h = pathMaxY - pathMinY
        if (w > 0.5 && h > 0.5 && w < viewport.width * 0.5 && h < viewport.height * 0.5) {
          coloredPaths.push({ x, y, w, h, r, g, b, sat })
        }
      }
      // Reset path accumulator
      pathMinX = Infinity; pathMinY = Infinity; pathMaxX = -Infinity; pathMaxY = -Infinity
      pathActive = false
    }
  }

  return coloredPaths
}

/**
 * Cluster nearby colored paths into candidate regions for template matching.
 * Uses a simple grid-based clustering approach.
 *
 * @param {Array} coloredPaths - from extractColoredPaths
 * @param {number} templateSize - approximate template dimension (PDF units) for cluster radius
 * @param {{ width: number, height: number }} pageDims - page dimensions (PDF units)
 * @returns {Array<{x: number, y: number, w: number, h: number, pathCount: number}>}
 */
export function clusterIntoCandidateRegions(coloredPaths, templateSize, pageDims) {
  if (!coloredPaths.length) return []

  // Cluster radius: paths within 2× template size belong to the same region
  const clusterRadius = templateSize * 2
  const clusters = []

  // Greedy clustering: assign each path to nearest cluster or create new one
  for (const p of coloredPaths) {
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    let assigned = false

    for (const c of clusters) {
      const dx = cx - (c.x + c.w / 2)
      const dy = cy - (c.y + c.h / 2)
      if (Math.abs(dx) < clusterRadius && Math.abs(dy) < clusterRadius) {
        // Expand cluster to include this path
        const nx = Math.min(c.x, p.x)
        const ny = Math.min(c.y, p.y)
        c.w = Math.max(c.x + c.w, p.x + p.w) - nx
        c.h = Math.max(c.y + c.h, p.y + p.h) - ny
        c.x = nx
        c.y = ny
        c.pathCount++
        assigned = true
        break
      }
    }

    if (!assigned) {
      clusters.push({ x: p.x, y: p.y, w: p.w, h: p.h, pathCount: 1 })
    }
  }

  return clusters
}

/**
 * Detect title block region (typically bottom-right, dense text, low colored paths).
 * Returns a bounding box to exclude from candidate search, or null.
 *
 * @param {Array} textItems - from extractTextItems
 * @param {{ width: number, height: number }} pageDims
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function detectTitleBlock(textItems, pageDims) {
  if (!textItems.length || !pageDims.width || !pageDims.height) return null

  // Title blocks are typically in the bottom-right ~25% of the page
  const tbX = pageDims.width * 0.6
  const tbY = pageDims.height * 0.75
  const tbTexts = textItems.filter(t => t.x >= tbX && t.y >= tbY)

  // If bottom-right quadrant has high text density relative to its area
  const tbArea = (pageDims.width - tbX) * (pageDims.height - tbY)
  const tbDensity = tbTexts.length / (tbArea / 1000) // texts per 1000 sq PDF units

  if (tbTexts.length >= 5 && tbDensity > 0.5) {
    // Find tight bounding box of the text cluster
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const t of tbTexts) {
      if (t.x < minX) minX = t.x
      if (t.y < minY) minY = t.y
      if (t.x + (t.width || 0) > maxX) maxX = t.x + (t.width || 0)
      if (t.y + (t.height || 10) > maxY) maxY = t.y + (t.height || 10)
    }
    // Add padding
    const pad = 20
    return {
      x: Math.max(0, minX - pad),
      y: Math.max(0, minY - pad),
      w: Math.min(pageDims.width, maxX + pad) - Math.max(0, minX - pad),
      h: Math.min(pageDims.height, maxY + pad) - Math.max(0, minY - pad),
    }
  }
  return null
}

/**
 * Generate candidate search regions for Auto Symbol template matching.
 * Combines colored path clustering with title block exclusion.
 *
 * @param {object} page - pdf.js page object
 * @param {number} templateSize - approximate symbol size (max of w,h in PDF units)
 * @param {object} [options]
 * @param {number} [options.maxRegions=20] - cap on candidate regions
 * @param {number} [options.minPathsPerRegion=2] - minimum colored paths to form a region
 * @param {number} [options.padding=0] - extra padding around each region (PDF units)
 * @returns {Promise<{ regions: Array<{x,y,w,h}>, pageType: string, stats: object } | null>}
 *   null if page is raster or analysis fails (caller should use full-page search)
 */
export async function generateCandidateRegions(page, templateSize, options = {}) {
  const { maxRegions = 20, minPathsPerRegion = 2, padding = 0 } = options
  const t0 = performance.now()

  try {
    // 1. Classify page
    const classification = await classifyPage(page)
    if (classification.type === 'raster') {
      return null // full-page fallback
    }

    const viewport = page.getViewport({ scale: 1.0 })
    const pageDims = { width: viewport.width, height: viewport.height }

    // 2. Extract colored paths
    const coloredPaths = await extractColoredPaths(page)
    if (coloredPaths.length === 0) {
      console.log('[VectorAnalysis] No colored paths found — full-page fallback')
      return null
    }

    // 3. Cluster into candidate regions
    const tplSize = Math.max(templateSize || 30, 15)
    let clusters = clusterIntoCandidateRegions(coloredPaths, tplSize, pageDims)

    // 4. Extract text + detect title block for exclusion
    let titleBlock = null
    try {
      const textItems = await extractTextItems(page)
      titleBlock = detectTitleBlock(textItems, pageDims)
    } catch { /* text extraction optional */ }

    // 5. Filter: remove title block overlap, enforce minimum path count
    if (titleBlock) {
      clusters = clusters.filter(c => {
        // Check if cluster center is inside title block
        const cx = c.x + c.w / 2
        const cy = c.y + c.h / 2
        const inTB = cx >= titleBlock.x && cx <= titleBlock.x + titleBlock.w &&
                     cy >= titleBlock.y && cy <= titleBlock.y + titleBlock.h
        return !inTB
      })
    }

    // Filter by minimum path density
    clusters = clusters.filter(c => c.pathCount >= minPathsPerRegion)

    // 6. Sort by path count (densest first) and cap
    clusters.sort((a, b) => b.pathCount - a.pathCount)
    if (clusters.length > maxRegions) clusters = clusters.slice(0, maxRegions)

    // 7. Add padding around each region (template may extend beyond cluster bounds)
    const pad = padding || Math.round(tplSize * 1.5)
    const regions = clusters.map(c => ({
      x: Math.max(0, Math.round(c.x - pad)),
      y: Math.max(0, Math.round(c.y - pad)),
      w: Math.min(Math.round(c.w + pad * 2), Math.round(pageDims.width)),
      h: Math.min(Math.round(c.h + pad * 2), Math.round(pageDims.height)),
    }))

    // 8. Merge overlapping regions
    const merged = mergeOverlappingRegions(regions)

    const elapsed = Math.round(performance.now() - t0)
    const stats = {
      pageType: classification.type,
      vectorRatio: classification.ratio,
      coloredPaths: coloredPaths.length,
      clustersRaw: clusters.length,
      regionsAfterMerge: merged.length,
      titleBlockDetected: !!titleBlock,
      elapsed,
    }
    console.log(`[VectorAnalysis] ${classification.type} page | ${coloredPaths.length} colored paths → ${merged.length} candidate regions | title block: ${!!titleBlock} | ${elapsed}ms`)

    if (merged.length === 0) return null // fallback

    return { regions: merged, pageType: classification.type, stats }
  } catch (err) {
    console.warn('[VectorAnalysis] Analysis failed, full-page fallback:', err.message)
    return null
  }
}

/**
 * Merge overlapping rectangles into minimal set of non-overlapping regions.
 */
function mergeOverlappingRegions(regions) {
  if (regions.length <= 1) return regions
  const merged = [...regions]
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i], b = merged[j]
        // Check overlap
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          // Merge into a
          const nx = Math.min(a.x, b.x)
          const ny = Math.min(a.y, b.y)
          a.w = Math.max(a.x + a.w, b.x + b.w) - nx
          a.h = Math.max(a.y + a.h, b.y + b.h) - ny
          a.x = nx
          a.y = ny
          merged.splice(j, 1)
          changed = true
          break
        }
      }
      if (changed) break
    }
  }
  return merged
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
