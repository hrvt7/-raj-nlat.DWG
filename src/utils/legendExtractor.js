// ─── Legend Extractor ──────────────────────────────────────────────────────────
// Automatically extracts symbol images from a legend PDF page.
// Uses: PDF → canvas render → grayscale → binary threshold → connected components
// → blob filtering → row clustering → symbol cropping
//
// Output: [{ imageDataUrl, bounds: {x,y,w,h}, rowIndex, proposedCategory }]

import * as pdfjsLib from 'pdfjs-dist'

// ── Config ────────────────────────────────────────────────────────────────────
const RENDER_SCALE = 3        // Render at 3x for high detail (~300 DPI for A4)
const BINARY_THRESHOLD = 180  // Pixels darker than this → black (0..255)
const MIN_BLOB_W = 12         // Min blob width in rendered pixels
const MIN_BLOB_H = 12         // Min blob height
const MAX_BLOB_W = 250        // Max blob width (filter out large borders/frames)
const MAX_BLOB_H = 250        // Max blob height
const MIN_BLOB_AREA = 80      // Min pixel area (filter tiny noise)
const ROW_GAP_THRESHOLD = 25  // Y-gap to consider blobs in same row (pixels)
const CROP_PADDING = 6        // Extra pixels around each symbol crop

// ── Category heuristics ───────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'socket',    label: 'Dugalj',    color: '#FF8C42' },
  { key: 'switch',    label: 'Kapcsoló',   color: '#FFD166' },
  { key: 'light',     label: 'Lámpa',      color: '#4CC9F0' },
  { key: 'panel',     label: 'Elosztó',    color: '#FF6B6B' },
  { key: 'junction',  label: 'Kötődoboz', color: '#A78BFA' },
  { key: 'conduit',   label: 'Csővezeték', color: '#71717A' },
  { key: 'other',     label: 'Egyéb',      color: '#00E5A0' },
]

function guessCategory(w, h) {
  const aspect = w / h
  const area = w * h
  // Small square-ish → switch
  if (area < 1200 && aspect > 0.7 && aspect < 1.4) return 'switch'
  // Small circle-ish (compact) → light
  if (area < 1500 && aspect > 0.6 && aspect < 1.6) return 'light'
  // Medium → socket
  if (area < 3000) return 'socket'
  // Large → panel
  if (area > 5000) return 'panel'
  return 'other'
}

// ── Connected Component labeling (flood fill) ─────────────────────────────────
function findConnectedComponents(binary, w, h) {
  const visited = new Uint8Array(w * h)
  const components = []

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (binary[idx] === 0 || visited[idx]) continue // 0 = white/bg, skip
      // BFS flood fill
      const queue = [idx]
      visited[idx] = 1
      let minX = x, maxX = x, minY = y, maxY = y
      let pixelCount = 0
      while (queue.length > 0) {
        const ci = queue.pop()
        const cx = ci % w
        const cy = (ci - cx) / w
        pixelCount++
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        // 4-connected neighbors
        const neighbors = [
          cy > 0 ? ci - w : -1,
          cy < h - 1 ? ci + w : -1,
          cx > 0 ? ci - 1 : -1,
          cx < w - 1 ? ci + 1 : -1,
        ]
        for (const ni of neighbors) {
          if (ni >= 0 && !visited[ni] && binary[ni] === 1) {
            visited[ni] = 1
            queue.push(ni)
          }
        }
      }
      const bw = maxX - minX + 1
      const bh = maxY - minY + 1
      components.push({ x: minX, y: minY, w: bw, h: bh, area: pixelCount })
    }
  }
  return components
}

// ── Merge nearby blobs that belong to same symbol ─────────────────────────────
function mergeNearbyBlobs(blobs, mergeDistance = 8) {
  if (blobs.length === 0) return []
  // Sort by y then x
  const sorted = [...blobs].sort((a, b) => a.y - b.y || a.x - b.x)
  const merged = []
  const used = new Set()

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue
    let { x, y, w, h } = sorted[i]
    let x2 = x + w, y2 = y + h
    used.add(i)
    // Try to merge with nearby blobs
    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < sorted.length; j++) {
        if (used.has(j)) continue
        const b = sorted[j]
        const bx2 = b.x + b.w, by2 = b.y + b.h
        // Check if blob j is within mergeDistance of current group
        if (b.x <= x2 + mergeDistance && bx2 >= x - mergeDistance &&
            b.y <= y2 + mergeDistance && by2 >= y - mergeDistance) {
          x = Math.min(x, b.x)
          y = Math.min(y, b.y)
          x2 = Math.max(x2, bx2)
          y2 = Math.max(y2, by2)
          used.add(j)
          changed = true
        }
      }
    }
    merged.push({ x, y, w: x2 - x, h: y2 - y })
  }
  return merged
}

// ── Cluster blobs into rows ───────────────────────────────────────────────────
function clusterIntoRows(blobs, threshold = ROW_GAP_THRESHOLD) {
  if (blobs.length === 0) return []
  const sorted = [...blobs].sort((a, b) => a.y - b.y)
  const rows = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const lastRow = rows[rows.length - 1]
    const lastMidY = lastRow.reduce((s, b) => s + b.y + b.h / 2, 0) / lastRow.length
    const curMidY = sorted[i].y + sorted[i].h / 2
    if (Math.abs(curMidY - lastMidY) < threshold) {
      lastRow.push(sorted[i])
    } else {
      rows.push([sorted[i]])
    }
  }
  // Sort blobs within each row by x
  rows.forEach(row => row.sort((a, b) => a.x - b.x))
  return rows
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract symbols from a legend PDF.
 * @param {Blob|File} pdfFile — The legend PDF file
 * @param {Object} options
 * @param {number} options.pageNum — Page number to extract from (default 1)
 * @param {function} options.onProgress — Progress callback (phase, progress 0-1)
 * @returns {Promise<Array<{ imageDataUrl, bounds, rowIndex, proposedCategory, proposedLabel }>>}
 */
export async function extractLegendSymbols(pdfFile, options = {}) {
  const { pageNum = 1, onProgress } = options
  onProgress?.('render', 0)

  // 1. Load and render PDF page
  const ab = await pdfFile.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: ab }).promise
  const page = await doc.getPage(pageNum)
  const vp = page.getViewport({ scale: RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = vp.width; canvas.height = vp.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  onProgress?.('render', 1)

  // 2. Convert to grayscale binary
  onProgress?.('threshold', 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = imageData
  const binary = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    binary[i] = gray < BINARY_THRESHOLD ? 1 : 0 // 1 = dark/foreground
  }
  onProgress?.('threshold', 1)

  // 3. Find connected components
  onProgress?.('components', 0)
  const rawBlobs = findConnectedComponents(binary, width, height)
  onProgress?.('components', 0.5)

  // 4. Filter by size
  const sizeFiltered = rawBlobs.filter(b =>
    b.w >= MIN_BLOB_W && b.h >= MIN_BLOB_H &&
    b.w <= MAX_BLOB_W && b.h <= MAX_BLOB_H &&
    b.area >= MIN_BLOB_AREA
  )

  // 5. Merge nearby blobs (parts of same symbol)
  const merged = mergeNearbyBlobs(sizeFiltered, 10)
  onProgress?.('components', 1)

  // 6. Re-filter merged blobs
  const validBlobs = merged.filter(b =>
    b.w >= MIN_BLOB_W && b.h >= MIN_BLOB_H &&
    b.w <= MAX_BLOB_W && b.h <= MAX_BLOB_H
  )

  // 7. Cluster into rows
  onProgress?.('rows', 0)
  const rows = clusterIntoRows(validBlobs)
  onProgress?.('rows', 1)

  // 8. For each row, take leftmost blob group as symbol
  onProgress?.('crop', 0)
  const results = []
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    // Take the leftmost blob as the symbol (legend layout: symbol | text)
    const symbol = row[0]
    if (!symbol) continue

    // Crop with padding
    const cx = Math.max(0, symbol.x - CROP_PADDING)
    const cy = Math.max(0, symbol.y - CROP_PADDING)
    const cw = Math.min(width - cx, symbol.w + CROP_PADDING * 2)
    const ch = Math.min(height - cy, symbol.h + CROP_PADDING * 2)

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cw; cropCanvas.height = ch
    const cropCtx = cropCanvas.getContext('2d')
    cropCtx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)
    const imageDataUrl = cropCanvas.toDataURL('image/png')

    const proposedCategory = guessCategory(symbol.w, symbol.h)
    const catInfo = CATEGORIES.find(c => c.key === proposedCategory) || CATEGORIES[CATEGORIES.length - 1]

    results.push({
      imageDataUrl,
      bounds: { x: cx, y: cy, w: cw, h: ch },
      rowIndex: ri,
      proposedCategory: catInfo.key,
      proposedLabel: catInfo.label,
      proposedColor: catInfo.color,
      width: cw,
      height: ch,
    })

    onProgress?.('crop', (ri + 1) / rows.length)
  }

  return results
}

export { CATEGORIES }
