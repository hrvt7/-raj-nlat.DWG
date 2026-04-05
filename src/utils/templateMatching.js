// ─── Template Matching (NCC + Integral Images) ──────────────────────────────
// Normalized Cross-Correlation with Summed Area Tables for fast detection.
// All detection runs at scale=1 PDF coordinates (A4 = 595×842 logical px).
// Detected (x, y) positions are stored directly as marker coordinates.

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
export async function renderPageImageData(pdfPage, scale = 1, rotation = 0) {
  // Always render at 0° rotation. The rotation parameter is ignored —
  // rotation is handled at the view layer (unified viewport transform).
  // The template matching worker tries all 6 orientations internally,
  // so the analysis raster doesn't need to be pre-rotated.
  const viewport = pdfPage.getViewport({ scale, rotation: 0 })
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
 * @param {number} detectionScale - scale to render PDF for matching (1 = native)
 * @param {number} threshold - NCC threshold
 * @returns {Promise<Array>} - detections in PDF scale=1 coordinates
 */
export async function detectTemplateOnPage(pdfPage, template, detectionScale = 1, threshold = 0.60) {
  if (!template.imageDataUrl) return []

  // Render PDF page at detectionScale
  const { imageData: pageImageData, width: pageW, height: pageH } = await renderPageImageData(pdfPage, detectionScale)
  const pageGray = toGray(pageImageData)
  const pageSAT = buildSAT(pageGray, pageW, pageH)

  // Render template image
  const { imageData: tplImageData, width: tplW, height: tplH } = await renderDataUrlImageData(template.imageDataUrl)
  const tplGray = toGray(tplImageData)

  if (tplW > pageW || tplH > pageH) return []  // template bigger than page

  // Run NCC
  const rawDetections = matchTemplate(pageGray, pageW, pageH, tplGray, tplW, tplH, pageSAT, threshold)

  // NMS
  const filtered = nonMaxSuppression(rawDetections, tplW, tplH)

  // Convert to PDF coordinates at scale=1
  // Detection at detectionScale → divide by detectionScale → scale=1 coords
  return filtered.map(d => ({
    // Center of template box, in scale=1 PDF units
    x: (d.x + tplW / 2) / detectionScale,
    y: (d.y + tplH / 2) / detectionScale,
    score: d.score,
    templateId: template.id,
    category: template.category,
    color: template.color,
    label: template.label,
  }))
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
    detectionScale = 1,
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
