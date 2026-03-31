// ─── Template Matching Web Worker ────────────────────────────────────────────
// Runs NCC template matching off the main thread.
// Input:  { type: 'match', imgData: Uint8ClampedArray, imgW, imgH, tplData: Uint8ClampedArray, tplW, tplH, threshold, searchArea? }
// Output: { type: 'result', hits: [{x,y,score}] }
//         { type: 'error', message: string }
//
// imgData/tplData are raw RGBA pixel arrays (from ImageData.data).
// searchArea: optional {x, y, w, h} in image coords to limit search region.

function toGray(rgba, width, height) {
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255
  }
  return gray
}

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

self.onmessage = (e) => {
  try {
    const { imgData, imgW, imgH, tplData, tplW, tplH, threshold, searchArea } = e.data

    const imgGray = toGray(imgData, imgW, imgH)
    const tplGray = toGray(tplData, tplW, tplH)
    const sat = buildSAT(imgGray, imgW, imgH)
    const effectiveThreshold = threshold || 0.75
    const rawHits = matchTemplate(imgGray, imgW, imgH, tplGray, tplW, tplH, sat, effectiveThreshold, 3, searchArea)
    const hits = nonMaxSuppression(rawHits, tplW, tplH, 0.5)
    console.log(`[TemplateMatch] ${rawHits.length} raw → ${hits.length} after NMS (threshold=${effectiveThreshold}, stride=3, IoU=0.5, tpl=${tplW}x${tplH}, img=${imgW}x${imgH})`)

    self.postMessage({ type: 'result', hits })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker error' })
  }
}
