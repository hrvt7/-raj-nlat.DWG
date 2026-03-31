// ─── Template Matching Web Worker (v3) ───────────────────────────────────────
// Multi-scale NCC matching with Sobel edge preprocessing.
//
// Input:  { imgData, imgW, imgH, tplData, tplW, tplH, threshold, searchArea? }
// Output: { type: 'result', hits: [{x,y,score,scale}] }
//         { type: 'error', message: string }

// ── Grayscale conversion ────────────────────────────────────────────────────
function toGray(rgba, width, height) {
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255
  }
  return gray
}

// ── Sobel edge magnitude (3×3 kernel) ───────────────────────────────────────
// Produces edge-magnitude image [0,1] — suppresses flat/textured background,
// emphasizes lines and symbol contours. This dramatically reduces false
// positives on building plans where uniform-gray areas (walls, fill patterns)
// give high NCC scores against grayscale templates.
function sobelEdges(gray, w, h) {
  const edges = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
        - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)]
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
        + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)]
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  // Normalize to [0,1]
  let maxVal = 0
  for (let i = 0; i < edges.length; i++) if (edges[i] > maxVal) maxVal = edges[i]
  if (maxVal > 0) for (let i = 0; i < edges.length; i++) edges[i] /= maxVal
  return edges
}

// ── Bilinear resize (grayscale Float32Array) ────────────────────────────────
function resizeGray(src, srcW, srcH, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH)
  const xRatio = srcW / dstW
  const yRatio = srcH / dstH
  for (let dy = 0; dy < dstH; dy++) {
    const sy = dy * yRatio
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, srcH - 1)
    const fy = sy - y0
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * xRatio
      const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, srcW - 1)
      const fx = sx - x0
      dst[dy * dstW + dx] =
        src[y0 * srcW + x0] * (1 - fx) * (1 - fy) +
        src[y0 * srcW + x1] * fx * (1 - fy) +
        src[y1 * srcW + x0] * (1 - fx) * fy +
        src[y1 * srcW + x1] * fx * fy
    }
  }
  return dst
}

// ── Summed Area Table (integral image) ──────────────────────────────────────
function buildSAT(gray, w, h) {
  const sat = new Float64Array((w + 1) * (h + 1))
  const sat2 = new Float64Array((w + 1) * (h + 1))
  const sw = w + 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x]
      const idx = (y + 1) * sw + (x + 1)
      sat[idx] = v + sat[idx - 1] + sat[idx - sw] - sat[idx - sw - 1]
      sat2[idx] = v * v + sat2[idx - 1] + sat2[idx - sw] - sat2[idx - sw - 1]
    }
  }
  return { sat, sat2 }
}

function satSum(sat, w, x1, y1, x2, y2) {
  const sw = w + 1
  return sat[(y2 + 1) * sw + (x2 + 1)] - sat[(y1) * sw + (x2 + 1)] - sat[(y2 + 1) * sw + (x1)] + sat[(y1) * sw + (x1)]
}

// ── NCC Template Matching ───────────────────────────────────────────────────
function matchTemplate(imgGray, iW, iH, tplGray, tW, tH, satData, threshold, stride, searchArea) {
  const { sat, sat2 } = satData
  const N = tW * tH

  let tSum = 0
  for (let i = 0; i < N; i++) tSum += tplGray[i]
  const tMean = tSum / N
  let tVar = 0
  for (let i = 0; i < N; i++) { const d = tplGray[i] - tMean; tVar += d * d }
  const tStd = Math.sqrt(tVar / N)
  if (tStd < 0.02) return []

  const detections = []
  const startX = searchArea ? Math.max(0, searchArea.x) : 0
  const startY = searchArea ? Math.max(0, searchArea.y) : 0
  const endX = searchArea ? Math.min(iW - tW, searchArea.x + searchArea.w - tW) : iW - tW
  const endY = searchArea ? Math.min(iH - tH, searchArea.y + searchArea.h - tH) : iH - tH

  for (let y = startY; y <= endY; y += stride) {
    for (let x = startX; x <= endX; x += stride) {
      const patchSum = satSum(sat, iW, x, y, x + tW - 1, y + tH - 1)
      const patchSum2 = satSum(sat2, iW, x, y, x + tW - 1, y + tH - 1)
      const iMean = patchSum / N
      const iVar = patchSum2 / N - iMean * iMean
      const iStd = Math.sqrt(Math.max(0, iVar))
      if (iStd < 0.02) continue

      let ncc = 0
      for (let ty = 0; ty < tH; ty++) {
        for (let tx = 0; tx < tW; tx++) {
          ncc += (imgGray[(y + ty) * iW + (x + tx)] - iMean) * (tplGray[ty * tW + tx] - tMean)
        }
      }
      ncc /= (N * iStd * tStd)
      if (ncc >= threshold) detections.push({ x, y, score: ncc })
    }
  }

  detections.sort((a, b) => b.score - a.score)
  return detections
}

// ── Non-Maximum Suppression ─────────────────────────────────────────────────
function nonMaxSuppression(detections, tW, tH, overlapThreshold) {
  const kept = []
  outer: for (const d of detections) {
    for (const k of kept) {
      const dW = d.tW || tW, dH = d.tH || tH
      const kW = k.tW || tW, kH = k.tH || tH
      const ix1 = Math.max(d.x, k.x), iy1 = Math.max(d.y, k.y)
      const ix2 = Math.min(d.x + dW, k.x + kW), iy2 = Math.min(d.y + dH, k.y + kH)
      const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1)
      const intersection = iw * ih
      const union = dW * dH + kW * kH - intersection
      if (intersection / union > overlapThreshold) continue outer
    }
    kept.push(d)
  }
  return kept
}

// ── Main message handler ────────────────────────────────────────────────────
self.onmessage = (e) => {
  try {
    const { imgData, imgW, imgH, tplData, tplW, tplH, threshold, searchArea } = e.data
    const effectiveThreshold = threshold || 0.75

    // Step 1: Convert to grayscale
    const imgGray = toGray(imgData, imgW, imgH)
    const tplGray = toGray(tplData, tplW, tplH)

    // Step 2: Compute Sobel edges for both image and template
    // Edge-based matching is far more selective than raw grayscale —
    // it ignores uniform fill areas and focuses on contour shapes.
    const imgEdges = sobelEdges(imgGray, imgW, imgH)
    const tplEdges = sobelEdges(tplGray, tplW, tplH)

    // Step 3: Build SAT for edge image (used by all scales)
    const imgSAT = buildSAT(imgEdges, imgW, imgH)

    // Step 4: Multi-scale matching (85% to 115% of template size, 5 steps)
    // This handles slight scale differences between the sample and
    // the actual symbols on the plan.
    const SCALES = [0.85, 0.92, 1.0, 1.08, 1.15]
    const stride = 3
    let allHits = []

    for (const s of SCALES) {
      let scaledTpl = tplEdges
      let sW = tplW, sH = tplH

      if (s !== 1.0) {
        sW = Math.round(tplW * s)
        sH = Math.round(tplH * s)
        if (sW < 4 || sH < 4 || sW >= imgW || sH >= imgH) continue
        scaledTpl = resizeGray(tplEdges, tplW, tplH, sW, sH)
      }

      // Need a SAT for this scale's template size (reuse imgSAT — it's the image SAT)
      const hits = matchTemplate(imgEdges, imgW, imgH, scaledTpl, sW, sH, imgSAT, effectiveThreshold, stride, searchArea)

      for (const h of hits) {
        allHits.push({ x: h.x, y: h.y, score: h.score, scale: s, tW: sW, tH: sH })
      }
    }

    // Step 5: Cross-scale NMS — keeps best hit when multiple scales match same spot
    allHits.sort((a, b) => b.score - a.score)
    const hits = nonMaxSuppression(allHits, tplW, tplH, 0.5)

    console.log(`[TemplateMatch] ${allHits.length} raw (${SCALES.length} scales) → ${hits.length} after NMS (threshold=${effectiveThreshold}, edge+multiscale, tpl=${tplW}x${tplH}, img=${imgW}x${imgH})`)

    self.postMessage({ type: 'result', hits })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker error' })
  }
}
