// ─── Template Matching (NCC + Integral Images) ──────────────────────────────
// Normalized Cross-Correlation with Summed Area Tables for fast detection.
// Seed crops are captured at renderScale=2; matching also renders at scale=2
// for pixel-level correspondence. Results are converted to PDF scale=1 coords.

/** Default detection scale — must match seed capture renderScale */
export const DETECTION_SCALE = 2

/**
 * Convert ImageData (RGBA) to grayscale Float32Array [0,1]
 */
export function toGray(imageData) {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  return gray
}

/**
 * Trim whitespace from a grayscale template image (content-aware crop).
 * Removes rows/columns from edges where all pixels are near-white (> whiteThreshold).
 * Returns a new trimmed grayscale array + dimensions, or null if template is entirely blank.
 *
 * @param {Float32Array} gray - grayscale [0,1], shape [h × w]
 * @param {number} w - width
 * @param {number} h - height
 * @param {number} whiteThreshold - pixel value above which counts as "white" (default 0.92)
 * @param {number} minPad - minimum padding pixels to keep around content (default 2)
 * @returns {{ gray: Float32Array, w: number, h: number, trimRect: {x,y,w,h} } | null}
 */
export function trimWhitespace(gray, w, h, whiteThreshold = 0.92, minPad = 2) {
  let top = h, bottom = 0, left = w, right = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] < whiteThreshold) {
        if (y < top) top = y
        if (y > bottom) bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }

  // Entirely blank template
  if (top > bottom || left > right) return null

  // Add padding (clamped to image bounds)
  top = Math.max(0, top - minPad)
  bottom = Math.min(h - 1, bottom + minPad)
  left = Math.max(0, left - minPad)
  right = Math.min(w - 1, right + minPad)

  const tw = right - left + 1
  const th = bottom - top + 1

  // Skip trim if it doesn't remove much (< 10% reduction)
  if (tw >= w * 0.9 && th >= h * 0.9) {
    return { gray, w, h, trimRect: { x: 0, y: 0, w, h } }
  }

  const trimmed = new Float32Array(tw * th)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      trimmed[y * tw + x] = gray[(y + top) * w + (x + left)]
    }
  }
  return { gray: trimmed, w: tw, h: th, trimRect: { x: left, y: top, w: tw, h: th } }
}

/**
 * Apply simple contrast enhancement for line drawings.
 * Maps grayscale values through a sigmoid-like curve that pushes
 * near-white toward white and dark lines toward black.
 *
 * @param {Float32Array} gray - grayscale [0,1]
 * @param {number} strength - contrast strength (default 3.0)
 * @returns {Float32Array} - enhanced grayscale (same length)
 */
export function enhanceContrast(gray, strength = 3.0) {
  const out = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    // Centered sigmoid: push values toward 0 or 1
    const v = gray[i]
    const s = 1 / (1 + Math.exp(-strength * (v - 0.5)))
    out[i] = s
  }
  return out
}

/**
 * Build Summed Area Table (integral image) for grayscale and grayscale^2.
 * Enables O(1) mean/variance computation for any rectangle.
 */
export function buildSAT(gray, w, h) {
  const sat = new Float64Array((w + 1) * (h + 1))
  const sat2 = new Float64Array((w + 1) * (h + 1))

  for (let y = 1; y <= h; y++) {
    for (let x = 1; x <= w; x++) {
      const v = gray[(y - 1) * w + (x - 1)]
      sat[y * (w + 1) + x] = v
        + sat[(y - 1) * (w + 1) + x]
        + sat[y * (w + 1) + (x - 1)]
        - sat[(y - 1) * (w + 1) + (x - 1)]
      sat2[y * (w + 1) + x] = v * v
        + sat2[(y - 1) * (w + 1) + x]
        + sat2[y * (w + 1) + (x - 1)]
        - sat2[(y - 1) * (w + 1) + (x - 1)]
    }
  }
  return { sat, sat2 }
}

/**
 * Get sum of values in rectangle [x1,y1] → [x2,y2] (inclusive, 0-indexed) from SAT.
 */
function satSum(sat, w, x1, y1, x2, y2) {
  const W = w + 1
  return sat[(y2 + 1) * W + (x2 + 1)]
    - sat[y1 * W + (x2 + 1)]
    - sat[(y2 + 1) * W + x1]
    + sat[y1 * W + x1]
}

/**
 * Normalized Cross-Correlation template matching.
 * Returns detections sorted by score descending.
 *
 * @param {Float32Array} imgGray  - Image grayscale, shape [iH × iW]
 * @param {number} iW             - Image width
 * @param {number} iH             - Image height
 * @param {Float32Array} tplGray  - Template grayscale, shape [tH × tW]
 * @param {number} tW             - Template width
 * @param {number} tH             - Template height
 * @param {Object} sat            - { sat, sat2 } integral images of imgGray
 * @param {number} threshold      - Minimum NCC score to keep (default 0.6)
 * @param {number} stride         - Step size in pixels (default 2, for speed)
 * @returns {Array<{x,y,score}>}  - Detections, (x,y) = top-left corner of match in image coords
 */
export function matchTemplate(imgGray, iW, iH, tplGray, tW, tH, satData, threshold = 0.60, stride = 2) {
  const { sat, sat2 } = satData
  const N = tW * tH

  // Precompute template mean + std
  let tSum = 0
  for (let i = 0; i < N; i++) tSum += tplGray[i]
  const tMean = tSum / N
  let tVar = 0
  for (let i = 0; i < N; i++) {
    const d = tplGray[i] - tMean
    tVar += d * d
  }
  const tStd = Math.sqrt(tVar / N)

  // If template is too uniform (very low std), skip — NCC is unreliable
  if (tStd < 0.02) return []

  const detections = []
  const maxX = iW - tW
  const maxY = iH - tH

  for (let y = 0; y <= maxY; y += stride) {
    for (let x = 0; x <= maxX; x += stride) {
      // Image patch statistics using SAT
      const patchSum = satSum(sat, iW, x, y, x + tW - 1, y + tH - 1)
      const patchSum2 = satSum(sat2, iW, x, y, x + tW - 1, y + tH - 1)
      const iMean = patchSum / N
      const iVar = patchSum2 / N - iMean * iMean
      const iStd = Math.sqrt(Math.max(0, iVar))

      if (iStd < 0.02) continue  // uniform patch, skip

      // Cross-correlation
      let cc = 0
      for (let ty = 0; ty < tH; ty++) {
        for (let tx = 0; tx < tW; tx++) {
          const imgVal = imgGray[(y + ty) * iW + (x + tx)]
          const tplVal = tplGray[ty * tW + tx]
          cc += (imgVal - iMean) * (tplVal - tMean)
        }
      }

      const ncc = cc / (N * iStd * tStd)

      if (ncc >= threshold) {
        detections.push({ x, y, score: ncc })
      }
    }
  }

  detections.sort((a, b) => b.score - a.score)
  return detections
}

/**
 * Non-maxima suppression: for each detection sorted by score, suppress
 * overlapping detections within radius pixels.
 *
 * @param {Array<{x,y,score}>} detections - sorted by score descending
 * @param {number} tW - template width
 * @param {number} tH - template height
 * @param {number} overlapThreshold - max IoU to allow (default 0.3)
 * @returns {Array<{x,y,score}>}
 */
export function nonMaxSuppression(detections, tW, tH, overlapThreshold = 0.3) {
  const kept = []

  outer: for (const d of detections) {
    for (const k of kept) {
      // Intersection over Union
      const ix1 = Math.max(d.x, k.x)
      const iy1 = Math.max(d.y, k.y)
      const ix2 = Math.min(d.x + tW, k.x + tW)
      const iy2 = Math.min(d.y + tH, k.y + tH)
      const iw = Math.max(0, ix2 - ix1)
      const ih = Math.max(0, iy2 - iy1)
      const intersection = iw * ih
      const union = 2 * tW * tH - intersection
      if (intersection / union > overlapThreshold) continue outer
    }
    kept.push(d)
  }

  return kept
}

/**
 * Render a PDF page to an offscreen canvas and return its ImageData.
 * @param {Object} pdfPage - pdf.js page object
 * @param {number} scale   - render scale (1 = native PDF coordinates)
 * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
 */
export async function renderPageImageData(pdfPage, scale = 1) {
  const viewport = pdfPage.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  await pdfPage.render({ canvasContext: ctx, viewport }).promise
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { imageData, width: canvas.width, height: canvas.height }
}

/**
 * Render a data URL image and return its ImageData at natural size.
 * @param {string} dataUrl
 * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
 */
export function renderDataUrlImageData(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve({ imageData, width: canvas.width, height: canvas.height })
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * Run detection for a single template on a single PDF page.
 *
 * @param {Object} pdfPage   - pdf.js page object
 * @param {Object} template  - { id, category, color, imageDataUrl, width, height, label }
 * @param {number} detectionScale - scale to render PDF for matching (DETECTION_SCALE=2 to match seed capture)
 * @param {number} threshold - NCC threshold
 * @param {Object} [options] - { enableTrim, enableContrast }
 * @returns {Promise<Array>} - detections in PDF scale=1 coordinates
 */
export async function detectTemplateOnPage(pdfPage, template, detectionScale = DETECTION_SCALE, threshold = 0.60, options = {}) {
  if (!template.imageDataUrl) return []

  const { enableTrim = true, enableContrast = true } = options

  // Render PDF page at detectionScale (must match seed capture renderScale)
  const { imageData: pageImageData, width: pageW, height: pageH } = await renderPageImageData(pdfPage, detectionScale)
  let pageGray = toGray(pageImageData)

  // Render template image (already at capture resolution)
  const { imageData: tplImageData, width: rawTplW, height: rawTplH } = await renderDataUrlImageData(template.imageDataUrl)
  let tplGray = toGray(tplImageData)
  let tplW = rawTplW
  let tplH = rawTplH

  // Auto-trim whitespace from template FIRST (on raw grayscale where bg=1.0).
  // Must happen before enhanceContrast because sigmoid maps 1.0→~0.817 which
  // falls below trimWhitespace's whiteThreshold=0.92, preventing any trimming.
  let trimResult = null
  if (enableTrim) {
    trimResult = trimWhitespace(tplGray, tplW, tplH)
    if (!trimResult) {
      // Entirely blank template — nothing to match
      if (import.meta.env.DEV) console.log('[Matcher] template is entirely blank after trim, skipping:', template.id)
      return []
    }
    tplGray = trimResult.gray
    tplW = trimResult.w
    tplH = trimResult.h
  }

  // Optional contrast enhancement for line drawings (after trim)
  if (enableContrast) {
    pageGray = enhanceContrast(pageGray, 3.0)
    tplGray = enhanceContrast(tplGray, 3.0)
  }

  if (tplW > pageW || tplH > pageH) return []  // template bigger than page
  if (tplW < 4 || tplH < 4) return []  // template too small after trim

  // Build SAT for page (after contrast enhancement)
  const pageSAT = buildSAT(pageGray, pageW, pageH)

  // Run NCC
  const rawDetections = matchTemplate(pageGray, pageW, pageH, tplGray, tplW, tplH, pageSAT, threshold)

  // Dev-only diagnostics (includes localization debug info)
  if (import.meta.env.DEV) {
    const tplStd = (() => {
      let s = 0, s2 = 0
      for (let i = 0; i < tplGray.length; i++) { s += tplGray[i]; s2 += tplGray[i] * tplGray[i] }
      const m = s / tplGray.length
      return Math.sqrt(Math.max(0, s2 / tplGray.length - m * m))
    })()
    const trimInfo = trimResult
      ? `trimRect=(${trimResult.trimRect.x},${trimResult.trimRect.y}) trimSize=${tplW}×${tplH}`
      : 'noTrim'
    console.log(`[Matcher] template=${template.id} size=${rawTplW}×${rawTplH} ${trimInfo} tplStd=${tplStd.toFixed(4)} threshold=${threshold.toFixed(2)} rawHits=${rawDetections.length} maxScore=${rawDetections[0]?.score?.toFixed(4) || 'n/a'}`)
  }

  // NMS
  const filtered = nonMaxSuppression(rawDetections, tplW, tplH)

  // Convert to PDF coordinates at scale=1
  // d.x/d.y = top-left of where the TRIMMED template matched in detection-scale pixels.
  // The trimmed template contains only the symbol content (whitespace margins removed).
  // So the center of the trimmed match region IS the symbol center on the page.
  // Formula: center = (d.x + tplW/2) / detectionScale → PDF scale=1
  return filtered.map(d => {
    const centerX = (d.x + tplW / 2) / detectionScale
    const centerY = (d.y + tplH / 2) / detectionScale
    // Matched region dimensions in PDF scale=1 (trimmed template size)
    const matchW = tplW / detectionScale
    const matchH = tplH / detectionScale

    if (import.meta.env.DEV && filtered.indexOf(d) < 3) {
      const trimOff = trimResult ? `trimRect=(${trimResult.trimRect.x},${trimResult.trimRect.y})` : 'noTrim'
      console.log(`[Matcher:loc] hit@(${d.x},${d.y}) ${trimOff} tpl=${tplW}×${tplH} →center(${centerX.toFixed(1)},${centerY.toFixed(1)}) matchSize=${matchW.toFixed(1)}×${matchH.toFixed(1)} score=${d.score.toFixed(4)}`)
    }

    return {
      x: centerX,
      y: centerY,
      score: d.score,
      templateId: template.id,
      category: template.category,
      color: template.color,
      label: template.label,
      // Expose actual matched region dimensions (trimmed template in PDF scale=1)
      matchW,
      matchH,
    }
  })
}

/**
 * Run detection for a single template ONLY within a specified region of a PDF page.
 * Pre-crops the page image to the region before NCC matching, so no matches
 * outside the region are possible. Coordinates are returned in PDF scale=1.
 *
 * @param {Object} pdfPage - pdf.js page object
 * @param {Object} template - { id, category, color, imageDataUrl, label }
 * @param {{ x: number, y: number, w: number, h: number }} region - PDF scale=1 bbox
 * @param {number} detectionScale
 * @param {number} threshold
 * @param {Object} [options]
 * @returns {Promise<Array>} - detections in PDF scale=1 coordinates (within region)
 */
export async function detectTemplateInRegion(pdfPage, template, region, detectionScale = DETECTION_SCALE, threshold = 0.60, options = {}) {
  if (!template.imageDataUrl || !region) return []

  const { enableTrim = true, enableContrast = true } = options

  // 1. Render full page at detectionScale
  const { imageData: pageImageData, width: pageW, height: pageH } = await renderPageImageData(pdfPage, detectionScale)

  // 2. Compute region in detection-scale pixels (clamp to page bounds)
  const rx = Math.max(0, Math.floor(region.x * detectionScale))
  const ry = Math.max(0, Math.floor(region.y * detectionScale))
  const rw = Math.min(pageW - rx, Math.ceil(region.w * detectionScale))
  const rh = Math.min(pageH - ry, Math.ceil(region.h * detectionScale))

  if (rw < 8 || rh < 8) return [] // region too small

  // 3. Extract region pixels from page image
  const regionData = new Uint8ClampedArray(rw * rh * 4)
  for (let y = 0; y < rh; y++) {
    const srcOffset = ((ry + y) * pageW + rx) * 4
    const dstOffset = y * rw * 4
    regionData.set(pageImageData.data.subarray(srcOffset, srcOffset + rw * 4), dstOffset)
  }
  const regionImageData = new ImageData(regionData, rw, rh)
  let regionGray = toGray(regionImageData)

  // 4. Prepare template (same as detectTemplateOnPage)
  const { imageData: tplImageData, width: rawTplW, height: rawTplH } = await renderDataUrlImageData(template.imageDataUrl)
  let tplGray = toGray(tplImageData)
  let tplW = rawTplW
  let tplH = rawTplH

  let trimResult = null
  if (enableTrim) {
    trimResult = trimWhitespace(tplGray, tplW, tplH)
    if (!trimResult) return []
    tplGray = trimResult.gray
    tplW = trimResult.w
    tplH = trimResult.h
  }

  if (enableContrast) {
    regionGray = enhanceContrast(regionGray, 3.0)
    tplGray = enhanceContrast(tplGray, 3.0)
  }

  if (tplW > rw || tplH > rh) return [] // template bigger than region
  if (tplW < 4 || tplH < 4) return []

  // 5. Build SAT for region (not full page)
  const regionSAT = buildSAT(regionGray, rw, rh)

  // 6. Run NCC on region
  const rawDetections = matchTemplate(regionGray, rw, rh, tplGray, tplW, tplH, regionSAT, threshold)

  if (import.meta.env.DEV) {
    console.log(`[Matcher:region] template=${template.id} regionPx=(${rx},${ry} ${rw}×${rh}) rawHits=${rawDetections.length}`)
  }

  // 7. NMS
  const filtered = nonMaxSuppression(rawDetections, tplW, tplH)

  // 8. Convert to PDF scale=1 coords — offset by region origin
  return filtered.map(d => {
    const centerX = (rx + d.x + tplW / 2) / detectionScale
    const centerY = (ry + d.y + tplH / 2) / detectionScale
    const matchW = tplW / detectionScale
    const matchH = tplH / detectionScale

    return {
      x: centerX,
      y: centerY,
      score: d.score,
      templateId: template.id,
      category: template.category,
      color: template.color,
      label: template.label,
      matchW,
      matchH,
    }
  })
}

/**
 * Run detection for multiple templates on all pages of a PDF.
 * Yields progress via onProgress callback.
 *
 * @param {Object} pdfDoc     - pdf.js document
 * @param {Array}  templates  - [{ id, category, color, imageDataUrl, ... }]
 * @param {Object} options    - { detectionScale, threshold, onProgress }
 * @returns {Promise<Array>}  - all detections across pages with pageNum
 */
export async function detectAllTemplates(pdfDoc, templates, options = {}) {
  const {
    detectionScale = DETECTION_SCALE,
    threshold = 0.60,
    onProgress = null,
  } = options

  const allDetections = []
  const numPages = pdfDoc.numPages
  const total = numPages * templates.length

  let done = 0

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)

    for (const template of templates) {
      const detections = await detectTemplateOnPage(page, template, detectionScale, threshold)
      for (const d of detections) {
        allDetections.push({ ...d, pageNum })
      }
      done++
      if (onProgress) onProgress(done / total, pageNum, template)

      // Yield to keep UI responsive
      await new Promise(r => setTimeout(r, 0))
    }
  }

  return allDetections
}
