// ─── Legend Extractor v2 ─────────────────────────────────────────────────────
// Uses pdf.js text extraction to locate text labels + their positions,
// then crops the SYMBOL region (left of each text row) from the rendered page.
//
// Flow:
//  1. Render PDF page at high DPI
//  2. Extract text items with positions via page.getTextContent()
//  3. Group text items into rows by Y proximity
//  4. For each row: text → category match, left-of-text → symbol crop
//  5. Tight-crop dark pixels in the symbol area
//
// Output: [{ imageDataUrl, bounds, rowIndex, proposedCategory, proposedLabel, sourceText }]

import * as pdfjsLib from 'pdfjs-dist'

// ── Config ────────────────────────────────────────────────────────────────────
const RENDER_SCALE = 3        // 3x for ~300 DPI on A4
const DARK_THRESHOLD = 180    // Grayscale threshold for "dark pixel" detection
const CROP_PADDING = 6        // Extra px around cropped symbol
const MIN_SYMBOL_PX = 10      // Min width/height to accept a symbol crop
const MAX_SYMBOL_SCAN_PT = 150 // Max pts to scan left of text for symbol
const TEXT_ROW_GAP_FACTOR = 1.6 // Row grouping: items within fontSize*factor are same row

// ── Category keyword matching (Hungarian electrical terms) ───────────────────
const CATEGORY_KEYWORDS = [
  {
    key: 'socket', label: 'Dugalj', color: '#FF8C42',
    patterns: [
      'dugalj', 'dugasz', 'csatlakozó aljzat', 'aljzat', 'konnektor',
      'földelt', 'schuko', 'ipari csatl', 'erőcsatl',
      'usb', 'telefon aljzat', 'adat csatl', 'hálózat csatl',
    ],
  },
  {
    key: 'switch', label: 'Kapcsoló', color: '#A78BFA',
    patterns: [
      'kapcsoló', 'nyomó', 'dimmer', 'fényerő', 'fényerőszabályzó',
      'váltókapcsoló', 'váltó', 'csillárkapcs', 'keresztkapcs',
      'időkapcs', 'mozgásérzékelő', 'jelenlétzékelő',
      'nyomógomb', 'csengő', 'kaputelefon',
    ],
  },
  {
    key: 'light', label: 'Lámpa', color: '#FFD166',
    patterns: [
      'lámpa', 'lámpat', 'világít', 'fénycső', 'fénycs',
      'spot', 'led', 'mennyezeti', 'fali lámpa', 'falikar',
      'armatúra', 'beépített', 'süllyesztett', 'felületre',
      'vészvilág', 'biztonsági', 'kültéri lámpa', 'reflektor',
      'downlight', 'panel lámpa', 'csillár',
    ],
  },
  {
    key: 'elosztok', label: 'Elosztó', color: '#FF6B6B',
    patterns: [
      'elosztó', 'főelosztó', 'alelosztó', 'mérőhely',
      'tábla', 'szekrény', 'kapcsolótábla', 'biztosíték',
      'kismegszakít', 'fi relé', 'túlfesz', 'villámvéd',
    ],
  },
  {
    key: 'junction', label: 'Kötődoboz', color: '#4CC9F0',
    patterns: [
      'kötődoboz', 'kötő doboz', 'köteg', 'csomópont',
      'leágazó', 'leágazás', 'elágazó',
    ],
  },
  {
    key: 'conduit', label: 'Csővezeték', color: '#06B6D4',
    patterns: [
      'védőcső', 'csővez', 'kábelvéd', 'gégecső',
      'merev cső', 'hajlékony', 'müanyag cső', 'fém cső',
    ],
  },
  {
    key: 'cable_tray', label: 'Kábeltálca', color: '#818CF8',
    patterns: [
      'kábeltálca', 'tálca', 'kábelcsatorna', 'kábel csatorna',
      'parapetcsatorna', 'paraapet',
    ],
  },
  {
    key: 'other', label: 'Egyéb', color: '#71717A',
    patterns: [],
  },
]

/**
 * Match a text string against Hungarian electrical categories.
 * Returns the best matching category object.
 */
function matchCategory(text) {
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const lowerOrig = text.toLowerCase()
  for (const cat of CATEGORY_KEYWORDS) {
    for (const pattern of cat.patterns) {
      const pNorm = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (lowerOrig.includes(pattern) || lower.includes(pNorm)) return cat
    }
  }
  return CATEGORY_KEYWORDS[CATEGORY_KEYWORDS.length - 1]
}

/**
 * Find the tight bounding box of dark pixels within a region of the canvas.
 * Returns { minX, maxX, minY, maxY, hasDark } in LOCAL region coordinates.
 */
function findDarkBounds(ctx, rx, ry, rw, rh) {
  if (rw <= 0 || rh <= 0) return { hasDark: false }
  const imgData = ctx.getImageData(
    Math.round(rx), Math.round(ry),
    Math.round(rw), Math.round(rh)
  )
  const d = imgData.data
  const w = imgData.width, h = imgData.height
  let minX = w, maxX = 0, minY = h, maxY = 0
  let hasDark = false

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4
      const gray = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]
      if (gray < DARK_THRESHOLD) {
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        hasDark = true
      }
    }
  }
  return { minX, maxX, minY, maxY, hasDark }
}

// ── Exported categories (for UI) ─────────────────────────────────────────────
export const CATEGORIES = CATEGORY_KEYWORDS.map(c => ({
  key: c.key, label: c.label, color: c.color,
}))

// ── Main extraction function ─────────────────────────────────────────────────

/**
 * Extract symbols from a legend PDF using text-position analysis.
 * @param {Blob|File} pdfFile — The legend PDF file
 * @param {Object} options
 * @param {number}   options.pageNum    — Page number (default 1)
 * @param {function} options.onProgress — Progress callback (phase, 0..1)
 * @returns {Promise<Array>}
 */
export async function extractLegendSymbols(pdfFile, options = {}) {
  const { pageNum = 1, onProgress } = options
  onProgress?.('render', 0)

  // 1. Load PDF
  const ab = await pdfFile.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: ab }).promise
  const page = await doc.getPage(pageNum)

  // 2. Get unscaled viewport (for coordinate math)
  const vpBase = page.getViewport({ scale: 1 })

  // 3. Render at high DPI
  const vpRender = page.getViewport({ scale: RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = vpRender.width
  canvas.height = vpRender.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport: vpRender }).promise
  onProgress?.('render', 1)

  // 4. Extract text content
  onProgress?.('text', 0)
  const textContent = await page.getTextContent()

  // Map text items to canvas coordinates
  // PDF coord system: origin bottom-left, y goes UP
  // Canvas coord system: origin top-left, y goes DOWN
  const textItems = textContent.items
    .filter(item => item.str && item.str.trim().length > 1) // skip single chars / empty
    .map(item => {
      const tx = item.transform[4]  // PDF x
      const ty = item.transform[5]  // PDF y (from bottom)
      const fontSize = Math.sqrt(
        item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]
      ) || 10

      // Text width: use item.width if available, else estimate
      const textWidth = item.width || (item.str.length * fontSize * 0.5)

      // Convert to canvas coords (top-left origin, scaled)
      const canvasX = tx * RENDER_SCALE
      const canvasY = (vpBase.height - ty) * RENDER_SCALE
      const canvasH = fontSize * RENDER_SCALE * 1.3
      const canvasW = textWidth * RENDER_SCALE

      return {
        str: item.str.trim(),
        x: canvasX,
        y: canvasY - canvasH, // top of the text line
        w: canvasW,
        h: canvasH,
        fontSize,
      }
    })
    .filter(t => t.w > 0 && t.h > 0)

  if (textItems.length === 0) {
    // No text found — likely a scanned image PDF
    onProgress?.('text', 1)
    onProgress?.('crop', 1)
    return [] // Fallback: return empty, LegendPanel shows "use manual mode"
  }

  // 5. Group text items into rows by Y proximity
  const avgFontSize = textItems.reduce((s, t) => s + t.fontSize, 0) / textItems.length
  const rowThreshold = avgFontSize * RENDER_SCALE * TEXT_ROW_GAP_FACTOR

  const sortedByY = [...textItems].sort((a, b) => a.y - b.y)
  const textRows = []

  for (const item of sortedByY) {
    let placed = false
    for (const row of textRows) {
      const rowMidY = row.reduce((s, t) => s + t.y + t.h / 2, 0) / row.length
      const itemMidY = item.y + item.h / 2
      if (Math.abs(itemMidY - rowMidY) < rowThreshold) {
        row.push(item)
        placed = true
        break
      }
    }
    if (!placed) textRows.push([item])
  }

  // Sort rows top to bottom, sort items within each row left to right
  textRows.sort((a, b) => {
    const ay = Math.min(...a.map(t => t.y))
    const by = Math.min(...b.map(t => t.y))
    return ay - by
  })
  textRows.forEach(row => row.sort((a, b) => a.x - b.x))

  onProgress?.('text', 1)

  // 6. Determine row vertical extents (for symbol cropping)
  // Each row's vertical extent = midpoint to prev row .. midpoint to next row
  const rowExtents = textRows.map((row, idx) => {
    const rowTop = Math.min(...row.map(t => t.y))
    const rowBottom = Math.max(...row.map(t => t.y + t.h))
    const rowMidY = (rowTop + rowBottom) / 2

    let extTop, extBottom
    if (idx === 0) {
      extTop = Math.max(0, rowTop - (rowBottom - rowTop) * 0.8)
    } else {
      const prevBottom = Math.max(...textRows[idx - 1].map(t => t.y + t.h))
      extTop = Math.max(0, (prevBottom + rowTop) / 2)
    }
    if (idx === textRows.length - 1) {
      extBottom = Math.min(canvas.height, rowBottom + (rowBottom - rowTop) * 0.8)
    } else {
      const nextTop = Math.min(...textRows[idx + 1].map(t => t.y))
      extBottom = Math.min(canvas.height, (rowBottom + nextTop) / 2)
    }

    return { extTop, extBottom, rowMidY }
  })

  // 7. For each text row, crop the symbol to the LEFT of the text
  onProgress?.('crop', 0)
  const results = []

  for (let ri = 0; ri < textRows.length; ri++) {
    const row = textRows[ri]
    const { extTop, extBottom } = rowExtents[ri]

    // Combine all text in this row
    const rowText = row.map(t => t.str).join(' ')

    // Skip very short or likely-header text
    if (rowText.length < 2) continue

    // Find leftmost text x in this row
    const leftmostTextX = Math.min(...row.map(t => t.x))

    // Symbol scan area: from 0 (or limited range) to just before the text
    const scanRight = Math.max(0, leftmostTextX - CROP_PADDING)
    const scanLeft = Math.max(0, scanRight - MAX_SYMBOL_SCAN_PT * RENDER_SCALE)
    const scanTop = Math.max(0, Math.floor(extTop))
    const scanBottom = Math.min(canvas.height, Math.ceil(extBottom))
    const scanW = Math.round(scanRight - scanLeft)
    const scanH = Math.round(scanBottom - scanTop)

    if (scanW < 5 || scanH < 5) continue

    // Find tight dark-pixel bounds in the symbol area
    const bounds = findDarkBounds(ctx, Math.round(scanLeft), scanTop, scanW, scanH)
    if (!bounds.hasDark) continue

    const symW = bounds.maxX - bounds.minX + 1
    const symH = bounds.maxY - bounds.minY + 1
    if (symW < MIN_SYMBOL_PX || symH < MIN_SYMBOL_PX) continue

    // Convert local bounds back to canvas coords + padding
    const cx = Math.max(0, Math.round(scanLeft) + bounds.minX - CROP_PADDING)
    const cy = Math.max(0, scanTop + bounds.minY - CROP_PADDING)
    const cw = Math.min(canvas.width - cx, symW + CROP_PADDING * 2)
    const ch = Math.min(canvas.height - cy, symH + CROP_PADDING * 2)

    if (cw < MIN_SYMBOL_PX || ch < MIN_SYMBOL_PX) continue
    // Skip unreasonably large crops (probably not a single symbol)
    if (cw > 200 * RENDER_SCALE || ch > 200 * RENDER_SCALE) continue

    // Crop symbol image
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cw
    cropCanvas.height = ch
    const cropCtx = cropCanvas.getContext('2d')
    cropCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)
    const imageDataUrl = cropCanvas.toDataURL('image/png')

    // Match category from text content
    const cat = matchCategory(rowText)

    results.push({
      imageDataUrl,
      bounds: { x: cx, y: cy, w: cw, h: ch },
      rowIndex: ri,
      proposedCategory: cat.key,
      proposedLabel: rowText.substring(0, 50),
      proposedColor: cat.color,
      width: cw,
      height: ch,
      sourceText: rowText,
    })

    onProgress?.('crop', (ri + 1) / textRows.length)
  }

  return results
}
