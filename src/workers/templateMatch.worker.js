// ─── Template Matching Web Worker (v4 — precision) ──────────────────────────
// Sobel edge NCC with auto-trim and foreground-weighted scoring.
//
// Key precision improvements over v3:
// 1. Auto-trim: template edges cropped to foreground bounding box + padding
//    (removes empty background that diluted scores → fewer false positives)
// 2. Foreground ratio filter: rejects matches where the image patch has
//    too little edge content (catches uniform/empty regions)
// 3. Single-scale only: multi-scale removed (±8% added noise, not precision)
// 4. Adaptive stride based on template size

// ── Grayscale ───────────────────────────────────────────────────────────────
function toGray(rgba, width, height) {
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255
  }
  return gray
}

// ── Sobel edge magnitude (3×3) → normalized [0,1] ──────────────────────────
function sobelEdges(gray, w, h) {
  const edges = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y-1)*w+(x-1)] + gray[(y-1)*w+(x+1)]
        -2*gray[y*w+(x-1)] + 2*gray[y*w+(x+1)]
        -gray[(y+1)*w+(x-1)] + gray[(y+1)*w+(x+1)]
      const gy =
        -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)]
        +gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)]
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  let maxVal = 0
  for (let i = 0; i < edges.length; i++) if (edges[i] > maxVal) maxVal = edges[i]
  if (maxVal > 0) for (let i = 0; i < edges.length; i++) edges[i] /= maxVal
  return edges
}

// ── Auto-trim: crop edge image to foreground bounding box + padding ─────────
// This is the KEY precision fix: the user's crop rectangle often includes
// lots of empty background. In edge space, background = 0. We find the
// tight bounding box of non-zero (foreground) pixels and crop to it.
function autoTrimEdges(edges, w, h, padding) {
  const EDGE_THRESHOLD = 0.05 // pixel considered "foreground" if edge > this
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x] > EDGE_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  // If no foreground found, return original
  if (maxX <= minX || maxY <= minY) return { trimmed: edges, tw: w, th: h, offX: 0, offY: 0 }

  // Add padding (but stay within bounds)
  const pad = padding || 2
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)

  const tw = maxX - minX + 1
  const th = maxY - minY + 1
  const trimmed = new Float32Array(tw * th)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      trimmed[y * tw + x] = edges[(minY + y) * w + (minX + x)]
    }
  }
  return { trimmed, tw, th, offX: minX, offY: minY }
}

// ── Summed Area Table ───────────────────────────────────────────────────────
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
  return sat[(y2+1)*sw+(x2+1)] - sat[y1*sw+(x2+1)] - sat[(y2+1)*sw+x1] + sat[y1*sw+x1]
}

// ── NCC matching with foreground-ratio filter ───────────────────────────────
function matchTemplate(imgEdges, iW, iH, tplEdges, tW, tH, satData, threshold, stride, searchArea, minFgRatio) {
  const { sat, sat2 } = satData
  const N = tW * tH

  // Template stats
  let tSum = 0
  for (let i = 0; i < N; i++) tSum += tplEdges[i]
  const tMean = tSum / N
  let tVar = 0
  for (let i = 0; i < N; i++) { const d = tplEdges[i] - tMean; tVar += d * d }
  const tStd = Math.sqrt(tVar / N)
  if (tStd < 0.02) return []

  // Template foreground pixel count (for reference)
  let tplFgCount = 0
  for (let i = 0; i < N; i++) if (tplEdges[i] > 0.05) tplFgCount++
  const tplFgRatio = tplFgCount / N

  const detections = []
  const startX = searchArea ? Math.max(0, searchArea.x) : 0
  const startY = searchArea ? Math.max(0, searchArea.y) : 0
  const endX = searchArea ? Math.min(iW - tW, searchArea.x + searchArea.w - tW) : iW - tW
  const endY = searchArea ? Math.min(iH - tH, searchArea.y + searchArea.h - tH) : iH - tH

  // Minimum foreground content in image patch to even consider matching
  // This skips empty/uniform regions instantly (the main false positive source)
  const requiredFgRatio = Math.max(minFgRatio || 0.3, tplFgRatio * 0.4)

  for (let y = startY; y <= endY; y += stride) {
    for (let x = startX; x <= endX; x += stride) {
      // Quick foreground check using SAT (mean edge value as proxy)
      const patchSum = satSum(sat, iW, x, y, x + tW - 1, y + tH - 1)
      const patchMean = patchSum / N
      // If patch mean is too low, it's mostly background → skip
      if (patchMean < requiredFgRatio * tMean * 0.5) continue

      const patchSum2 = satSum(sat2, iW, x, y, x + tW - 1, y + tH - 1)
      const iMean = patchMean
      const iVar = patchSum2 / N - iMean * iMean
      const iStd = Math.sqrt(Math.max(0, iVar))
      if (iStd < 0.02) continue

      let ncc = 0
      for (let ty = 0; ty < tH; ty++) {
        for (let tx = 0; tx < tW; tx++) {
          ncc += (imgEdges[(y + ty) * iW + (x + tx)] - iMean) * (tplEdges[ty * tW + tx] - tMean)
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
      const ix1 = Math.max(d.x, k.x), iy1 = Math.max(d.y, k.y)
      const ix2 = Math.min(d.x + tW, k.x + tW), iy2 = Math.min(d.y + tH, k.y + tH)
      const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1)
      const intersection = iw * ih
      const union = 2 * tW * tH - intersection
      if (intersection / union > overlapThreshold) continue outer
    }
    kept.push(d)
  }
  return kept
}

// ── Main ────────────────────────────────────────────────────────────────────
self.onmessage = (e) => {
  try {
    const { imgData, imgW, imgH, tplData, tplW, tplH, threshold, searchArea } = e.data
    const effectiveThreshold = threshold || 0.75
    const t0 = performance.now()

    // 1. Grayscale
    const imgGray = toGray(imgData, imgW, imgH)
    const tplGray = toGray(tplData, tplW, tplH)

    // 2. Sobel edges
    const imgEdges = sobelEdges(imgGray, imgW, imgH)
    const tplEdges = sobelEdges(tplGray, tplW, tplH)

    // 3. Auto-trim template to foreground bbox (removes empty background)
    const { trimmed: trimmedTpl, tw: trimW, th: trimH, offX, offY } = autoTrimEdges(tplEdges, tplW, tplH, 3)
    const trimRatio = (trimW * trimH) / (tplW * tplH)

    // 4. Build SAT on image edges
    const imgSAT = buildSAT(imgEdges, imgW, imgH)

    // 5. Single-scale matching (multi-scale removed — added noise, not precision)
    const tplArea = trimW * trimH
    const stride = tplArea > 2500 ? 4 : tplArea > 900 ? 3 : 2

    const rawHits = matchTemplate(imgEdges, imgW, imgH, trimmedTpl, trimW, trimH, imgSAT, effectiveThreshold, stride, searchArea)
    const hits = nonMaxSuppression(rawHits, trimW, trimH, 0.5)

    // Adjust hit coordinates: add back the trim offset so they point to
    // the center of the ORIGINAL (untrimmed) template region
    for (const h of hits) {
      h.x -= offX
      h.y -= offY
    }

    const elapsed = Math.round(performance.now() - t0)
    console.log(`[TemplateMatch v4] ${rawHits.length} raw → ${hits.length} NMS | trim ${(trimRatio*100).toFixed(0)}% (${tplW}x${tplH}→${trimW}x${trimH}) | ${elapsed}ms | threshold=${effectiveThreshold} stride=${stride}`)

    self.postMessage({ type: 'result', hits })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker error' })
  }
}
