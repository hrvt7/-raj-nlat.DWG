// ─── Template Matching Web Worker (v5 — dual-channel precision) ─────────────
// Color-aware NCC + grayscale NCC with auto-trim.
//
// Key insight from research + real-world testing:
// Electrical plan symbols are COLORED (cyan, red, green) on white/gray
// background. Sobel edges treat all lines equally (walls, text, symbols)
// → too many false positives. The COLOR CHANNEL is the strongest discriminator.
//
// Pipeline:
// 1. Extract color-saturation channel (how "colorful" each pixel is)
// 2. Auto-trim template on saturation foreground
// 3. Run NCC on BOTH grayscale AND saturation channels
// 4. Combined score = weighted average (saturation 60%, grayscale 40%)
// 5. NMS to remove overlaps

// ── Color channels ──────────────────────────────────────────────────────────

function toGray(rgba, width, height) {
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255
  }
  return gray
}

// Saturation channel: how "colorful" is each pixel (0=gray/white/black, 1=vivid color)
// This is the KEY discriminator on electrical plans where symbols are colored
// and background/walls/text are grayscale.
function toSaturation(rgba, width, height) {
  const sat = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] / 255
    const g = rgba[i * 4 + 1] / 255
    const b = rgba[i * 4 + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // HSL saturation: chroma / (1 - |2L - 1|)
    const l = (max + min) / 2
    if (max === min) {
      sat[i] = 0 // achromatic (gray/white/black)
    } else {
      const chroma = max - min
      sat[i] = chroma / (1 - Math.abs(2 * l - 1))
    }
  }
  return sat
}

// Hue channel (0-1, cyclic) — useful for distinguishing red vs cyan vs green symbols
function toHue(rgba, width, height) {
  const hue = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] / 255
    const g = rgba[i * 4 + 1] / 255
    const b = rgba[i * 4 + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const chroma = max - min
    if (chroma < 0.05) { hue[i] = -1; continue } // achromatic → mark invalid
    let h = 0
    if (max === r) h = ((g - b) / chroma + 6) % 6
    else if (max === g) h = (b - r) / chroma + 2
    else h = (r - g) / chroma + 4
    hue[i] = h / 6 // normalize to [0,1]
  }
  return hue
}

// ── Rotate grayscale image 90° clockwise ────────────────────────────────────
function rotate90(src, w, h) {
  // 90° CW: new width = h, new height = w
  const dst = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      dst[x * h + (h - 1 - y)] = src[y * w + x]
    }
  }
  return { data: dst, w: h, h: w }
}

// ── Mirror horizontally ─────────────────────────────────────────────────────
function mirrorH(src, w, h) {
  const dst = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      dst[y * w + (w - 1 - x)] = src[y * w + x]
    }
  }
  return dst
}

// ── Bilinear resize (grayscale Float32Array) ────────────────────────────────
function resizeGray(src, srcW, srcH, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH)
  const xR = srcW / dstW, yR = srcH / dstH
  for (let dy = 0; dy < dstH; dy++) {
    const sy = dy * yR, y0 = Math.floor(sy), y1 = Math.min(y0 + 1, srcH - 1), fy = sy - y0
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * xR, x0 = Math.floor(sx), x1 = Math.min(x0 + 1, srcW - 1), fx = sx - x0
      dst[dy * dstW + dx] =
        src[y0 * srcW + x0] * (1-fx) * (1-fy) + src[y0 * srcW + x1] * fx * (1-fy) +
        src[y1 * srcW + x0] * (1-fx) * fy + src[y1 * srcW + x1] * fx * fy
    }
  }
  return dst
}

// ── Auto-trim on saturation foreground ──────────────────────────────────────
function autoTrim(channel, w, h, padding, fgThreshold) {
  const thresh = fgThreshold || 0.08
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (channel[y * w + x] > thresh) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return { offX: 0, offY: 0, tw: w, th: h }
  const pad = padding || 3
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)
  return { offX: minX, offY: minY, tw: maxX - minX + 1, th: maxY - minY + 1 }
}

function cropRegion(src, srcW, offX, offY, tw, th) {
  const dst = new Float32Array(tw * th)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      dst[y * tw + x] = src[(offY + y) * srcW + (offX + x)]
    }
  }
  return dst
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

// ── Single-channel NCC (pre-mean-subtracted template) ───────────────────────
// tplNorm = tpl[i] - tMean, precomputed once per template.
// Saves one subtraction per pixel per position (mathematically identical).
function nccAtPosition(img, iW, tplNorm, tW, tH, x, y, iMean, iStd, tStd, N) {
  let ncc = 0
  for (let ty = 0; ty < tH; ty++) {
    const rowOff = (y + ty) * iW + x
    const tplRowOff = ty * tW
    for (let tx = 0; tx < tW; tx++) {
      ncc += (img[rowOff + tx] - iMean) * tplNorm[tplRowOff + tx]
    }
  }
  return ncc / (N * iStd * tStd)
}

// ── Dual-channel matching ───────────────────────────────────────────────────
function matchDualChannel(imgGray, imgSat, iW, iH, tplGray, tplSat, tW, tH,
                           satGray, satSatCh, threshold, stride, searchArea) {
  const N = tW * tH

  // Template stats + pre-mean-subtracted arrays — grayscale
  let tSumG = 0
  for (let i = 0; i < N; i++) tSumG += tplGray[i]
  const tMeanG = tSumG / N
  const tplNormG = new Float32Array(N) // tplGray[i] - tMeanG, precomputed once
  let tVarG = 0
  for (let i = 0; i < N; i++) { const d = tplGray[i] - tMeanG; tplNormG[i] = d; tVarG += d * d }
  const tStdG = Math.sqrt(tVarG / N)

  // Template stats + pre-mean-subtracted arrays — saturation
  let tSumS = 0
  for (let i = 0; i < N; i++) tSumS += tplSat[i]
  const tMeanS = tSumS / N
  const tplNormS = new Float32Array(N) // tplSat[i] - tMeanS, precomputed once
  let tVarS = 0
  for (let i = 0; i < N; i++) { const d = tplSat[i] - tMeanS; tplNormS[i] = d; tVarS += d * d }
  const tStdS = Math.sqrt(tVarS / N)

  // Determine if template has significant color content
  const hasColor = tStdS > 0.03
  const wSat = hasColor ? 0.6 : 0.0
  const wGray = hasColor ? 0.4 : 1.0

  if (tStdG < 0.01 && tStdS < 0.01) return [] // uniform template

  const detections = []
  const startX = searchArea ? Math.max(0, searchArea.x) : 0
  const startY = searchArea ? Math.max(0, searchArea.y) : 0
  const endX = searchArea ? Math.min(iW - tW, searchArea.x + searchArea.w - tW) : iW - tW
  const endY = searchArea ? Math.min(iH - tH, searchArea.y + searchArea.h - tH) : iH - tH

  for (let y = startY; y <= endY; y += stride) {
    for (let x = startX; x <= endX; x += stride) {
      // Quick check: if template is colorful, skip patches with no color
      if (hasColor) {
        const patchSatSum = satSum(satSatCh.sat, iW, x, y, x + tW - 1, y + tH - 1)
        const patchSatMean = patchSatSum / N
        if (patchSatMean < tMeanS * 0.2) continue // too little color → skip
      }

      // Grayscale NCC
      let scoreG = 0
      if (tStdG > 0.01) {
        const pSumG = satSum(satGray.sat, iW, x, y, x + tW - 1, y + tH - 1)
        const pSum2G = satSum(satGray.sat2, iW, x, y, x + tW - 1, y + tH - 1)
        const iMeanG = pSumG / N
        const iVarG = pSum2G / N - iMeanG * iMeanG
        const iStdG = Math.sqrt(Math.max(0, iVarG))
        if (iStdG > 0.01) {
          scoreG = nccAtPosition(imgGray, iW, tplNormG, tW, tH, x, y, iMeanG, iStdG, tStdG, N)
        }
      }

      // Saturation NCC
      let scoreS = 0
      if (hasColor && tStdS > 0.01) {
        const pSumS = satSum(satSatCh.sat, iW, x, y, x + tW - 1, y + tH - 1)
        const pSum2S = satSum(satSatCh.sat2, iW, x, y, x + tW - 1, y + tH - 1)
        const iMeanS = pSumS / N
        const iVarS = pSum2S / N - iMeanS * iMeanS
        const iStdS = Math.sqrt(Math.max(0, iVarS))
        if (iStdS > 0.01) {
          scoreS = nccAtPosition(imgSat, iW, tplNormS, tW, tH, x, y, iMeanS, iStdS, tStdS, N)
        }
      }

      const combined = wGray * scoreG + wSat * scoreS
      if (combined >= threshold) {
        detections.push({ x, y, score: combined })
      }
    }
  }

  detections.sort((a, b) => b.score - a.score)
  return detections
}

// ── Non-Maximum Suppression ─────────────────────────────────────────────────
function nonMaxSuppression(detections, tW, tH, overlapThreshold) {
  // Center-distance NMS — hits are already center-of-match positions.
  // Two hits within minDist of each other are considered the same symbol;
  // the higher-scoring one wins.
  const minDist = Math.max(tW, tH) * 0.6
  const kept = []
  outer: for (const d of detections) {
    for (const k of kept) {
      const dist = Math.sqrt((d.x - k.x) ** 2 + (d.y - k.y) ** 2)
      if (dist < minDist) continue outer
    }
    kept.push(d)
  }
  return kept
}

// ── Image cache for batch search ────────────────────────────────────────────
// When the caller sends { type: 'init', imgData, imgW, imgH }, we extract
// channels and build SATs once. Subsequent { type: 'search', tplData, ... }
// messages reuse the cached data. This eliminates N × channel extraction and
// N × SAT rebuild in batch search (same image, different templates).
//
// Legacy mode (no type field): receives imgData + tplData in one message,
// processes everything from scratch. Single Auto Symbol search uses this.
let _cachedImgW = 0, _cachedImgH = 0
let _cachedImgGray = null, _cachedImgSat = null
let _cachedSatGray = null, _cachedSatSatCh = null

function initImageCache(imgData, imgW, imgH) {
  _cachedImgGray = toGray(imgData, imgW, imgH)
  _cachedImgSat = toSaturation(imgData, imgW, imgH)
  _cachedSatGray = buildSAT(_cachedImgGray, imgW, imgH)
  _cachedSatSatCh = buildSAT(_cachedImgSat, imgW, imgH)
  _cachedImgW = imgW
  _cachedImgH = imgH
}

// ── Main ────────────────────────────────────────────────────────────────────
self.onmessage = (e) => {
  try {
    const msg = e.data

    // ── Init message: cache image channels + SATs for batch reuse ──
    if (msg.type === 'init') {
      const t0 = performance.now()
      initImageCache(msg.imgData, msg.imgW, msg.imgH)
      const elapsed = Math.round(performance.now() - t0)
      console.log(`[TemplateMatch] Image cached: ${msg.imgW}×${msg.imgH} | channels + SATs in ${elapsed}ms`)
      self.postMessage({ type: 'init-done' })
      return
    }

    // ── Search message (batch mode): uses cached image ──
    // ── Legacy message (no type): full standalone search ──
    const isBatchSearch = msg.type === 'search'
    const { tplData, tplW, tplH, threshold, searchArea } = isBatchSearch ? msg : msg
    const effectiveThreshold = threshold || 0.55
    const t0 = performance.now()

    // 1. Extract channels from RGBA — use cache if available, else compute
    let imgGray, imgSat, satGray, satSatCh, imgW, imgH
    if (isBatchSearch && _cachedImgGray) {
      imgGray = _cachedImgGray; imgSat = _cachedImgSat
      satGray = _cachedSatGray; satSatCh = _cachedSatSatCh
      imgW = _cachedImgW; imgH = _cachedImgH
    } else {
      // Legacy mode: compute everything from scratch
      const { imgData: legacyImgData, imgW: legacyImgW, imgH: legacyImgH } = msg
      imgW = legacyImgW; imgH = legacyImgH
      imgGray = toGray(legacyImgData, imgW, imgH)
      imgSat = toSaturation(legacyImgData, imgW, imgH)
      satGray = buildSAT(imgGray, imgW, imgH)
      satSatCh = buildSAT(imgSat, imgW, imgH)
    }

    const tplGray = toGray(tplData, tplW, tplH)
    const tplSat = toSaturation(tplData, tplW, tplH)

    // 2. Auto-trim on saturation (if template is colorful) or grayscale variance
    let tplSatStd = 0
    { let s = 0; for (let i = 0; i < tplW * tplH; i++) s += tplSat[i]; const m = s / (tplW * tplH); let v = 0; for (let i = 0; i < tplW * tplH; i++) { const d = tplSat[i] - m; v += d * d }; tplSatStd = Math.sqrt(v / (tplW * tplH)) }
    const trimChannel = tplSatStd > 0.03 ? tplSat : imgGray // trim by color if colorful, else by luminance
    const trimThreshold = tplSatStd > 0.03 ? 0.08 : 0.15
    const { offX, offY, tw: trimW, th: trimH } = autoTrim(
      tplSatStd > 0.03 ? tplSat : tplGray, tplW, tplH, 3, trimThreshold
    )

    // Crop both channels to the trimmed region
    const tGray = cropRegion(tplGray, tplW, offX, offY, trimW, trimH)
    const tSat = cropRegion(tplSat, tplW, offX, offY, trimW, trimH)

    // 3. SATs for image channels — already built above (from cache or legacy path)

    // 4. Adaptive stride (same as original v7)
    const tplArea = trimW * trimH
    const stride = tplArea > 2500 ? 4 : tplArea > 900 ? 3 : 2

    // 5. Scale: single scale only (multi-scale was 3x slower for minimal gain)
    const SCALE_LEVELS = [1.00]

    // 6. Multi-rotation matching (0°, 90°, 180°, 270° + mirror)
    // Electrical symbols appear in multiple orientations on plans.
    // This replaces multi-scale (rotation is more important than ±10% scale).
    // Generate rotated + mirrored variants of the trimmed template
    const variants = []
    // 0° (original)
    variants.push({ grayTpl: tGray, satTpl: tSat, w: trimW, h: trimH, label: '0°' })
    // 90° CW
    { const rg = rotate90(tGray, trimW, trimH); const rs = rotate90(tSat, trimW, trimH); variants.push({ grayTpl: rg.data, satTpl: rs.data, w: rg.w, h: rg.h, label: '90°' }) }
    // 180°
    { const rg1 = rotate90(tGray, trimW, trimH); const rg2 = rotate90(rg1.data, rg1.w, rg1.h); const rs1 = rotate90(tSat, trimW, trimH); const rs2 = rotate90(rs1.data, rs1.w, rs1.h); variants.push({ grayTpl: rg2.data, satTpl: rs2.data, w: rg2.w, h: rg2.h, label: '180°' }) }
    // 270° CW (= 90° CCW)
    { const rg1 = rotate90(tGray, trimW, trimH); const rg2 = rotate90(rg1.data, rg1.w, rg1.h); const rg3 = rotate90(rg2.data, rg2.w, rg2.h); const rs1 = rotate90(tSat, trimW, trimH); const rs2 = rotate90(rs1.data, rs1.w, rs1.h); const rs3 = rotate90(rs2.data, rs2.w, rs2.h); variants.push({ grayTpl: rg3.data, satTpl: rs3.data, w: rg3.w, h: rg3.h, label: '270°' }) }
    // Mirror (horizontal flip of original)
    { const mg = mirrorH(tGray, trimW, trimH); const ms = mirrorH(tSat, trimW, trimH); variants.push({ grayTpl: mg, satTpl: ms, w: trimW, h: trimH, label: 'mirror' }) }
    // Mirror + 90°
    { const mg = mirrorH(tGray, trimW, trimH); const ms = mirrorH(tSat, trimW, trimH); const rg = rotate90(mg, trimW, trimH); const rs = rotate90(ms, trimW, trimH); variants.push({ grayTpl: rg.data, satTpl: rs.data, w: rg.w, h: rg.h, label: 'mirror+90°' }) }

    let allHits = []
    for (const variant of variants) {
      for (const scale of SCALE_LEVELS) {
        // Scale the template variant
        const sW = Math.round(variant.w * scale)
        const sH = Math.round(variant.h * scale)
        if (sW < 4 || sH < 4 || sW >= imgW || sH >= imgH) continue

        let sGray, sSat
        if (scale === 1.0) {
          sGray = variant.grayTpl; sSat = variant.satTpl
        } else {
          sGray = resizeGray(variant.grayTpl, variant.w, variant.h, sW, sH)
          sSat = resizeGray(variant.satTpl, variant.w, variant.h, sW, sH)
        }

        // Single-pass matching at the effective threshold and adaptive stride
        const variantHits = matchDualChannel(
          imgGray, imgSat, imgW, imgH,
          sGray, sSat, sW, sH,
          satGray, satSatCh,
          effectiveThreshold, stride, searchArea
        )

        for (const h of variantHits) {
          // Convert top-left hit position to center-of-match position.
          // Use the VARIANT dimensions (sW/sH), not the original template dimensions,
          // so rotated variants produce correct center positions.
          allHits.push({ x: h.x + sW / 2, y: h.y + sH / 2, score: h.score })
        }
      }
    }

    // 7. Cross-rotation + cross-scale NMS — best-scoring hit wins per location
    allHits.sort((a, b) => b.score - a.score)
    const hits = nonMaxSuppression(allHits, Math.max(trimW, trimH), Math.max(trimW, trimH), 0.5)

    // Adjust coords for trim offset
    for (const h of hits) {
      h.x -= offX
      h.y -= offY
    }

    // 8. Hue post-filter: reject hits where the color doesn't match the template.
    // Only active when the template has a clear dominant color (high saturation).
    // Grayscale or low-saturation templates bypass this filter entirely.
    const HUE_SAT_GATE = 0.15        // min saturation to count a pixel as "colored"
    const HUE_MIN_COLORED_RATIO = 0.2 // at least 20% of template pixels must be colored
    const HUE_DOMINANCE_RATIO = 0.40  // dominant hue must be ≥40% of colored pixels
    const HUE_MAX_DISTANCE = 0.12     // max cyclic hue distance (0-0.5 scale) ~43° on color wheel

    let hueFilterActive = false
    let tplDominantHue = 0
    let hueFilteredCount = 0

    // Compute template dominant hue from the TRIMMED region of the original RGBA
    {
      const N = trimW * trimH
      // Build hue histogram (12 buckets, 30° each)
      const BUCKETS = 12
      const hueBuckets = new Uint32Array(BUCKETS)
      let coloredCount = 0

      for (let y = 0; y < trimH; y++) {
        for (let x = 0; x < trimW; x++) {
          const srcIdx = ((offY + y) * tplW + (offX + x))
          const r = tplData[srcIdx * 4] / 255
          const g = tplData[srcIdx * 4 + 1] / 255
          const b = tplData[srcIdx * 4 + 2] / 255
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const chroma = max - min
          const l = (max + min) / 2
          const sat = (max === min) ? 0 : chroma / (1 - Math.abs(2 * l - 1))
          if (sat < HUE_SAT_GATE) continue
          coloredCount++
          // Compute hue 0-1
          let h = 0
          if (max === r) h = ((g - b) / chroma + 6) % 6
          else if (max === g) h = (b - r) / chroma + 2
          else h = (r - g) / chroma + 4
          h = h / 6
          const bucket = Math.min(BUCKETS - 1, Math.floor(h * BUCKETS))
          hueBuckets[bucket]++
        }
      }

      const coloredRatio = coloredCount / N
      if (coloredRatio >= HUE_MIN_COLORED_RATIO) {
        // Find dominant bucket
        let maxBucket = 0, maxCount = 0
        for (let i = 0; i < BUCKETS; i++) {
          if (hueBuckets[i] > maxCount) { maxCount = hueBuckets[i]; maxBucket = i }
        }
        const dominance = maxCount / coloredCount
        if (dominance >= HUE_DOMINANCE_RATIO) {
          hueFilterActive = true
          tplDominantHue = (maxBucket + 0.5) / BUCKETS // center of bucket
        }
      }
    }

    // Apply hue filter to NMS hits
    let finalHits = hits
    if (hueFilterActive) {
      const imgHue = toHue(imgData, imgW, imgH)
      finalHits = hits.filter(hit => {
        // Sample patch at hit position (hit.x/y are center coords in full-image space)
        // Convert back to top-left for patch extraction
        const px = Math.round(hit.x + offX - trimW / 2)
        const py = Math.round(hit.y + offY - trimH / 2)
        // Count colored pixels and build hue histogram for the patch
        const BUCKETS = 12
        const patchBuckets = new Uint32Array(BUCKETS)
        let patchColored = 0
        for (let y = Math.max(0, py); y < Math.min(imgH, py + trimH); y++) {
          for (let x = Math.max(0, px); x < Math.min(imgW, px + trimW); x++) {
            const hv = imgHue[y * imgW + x]
            if (hv < 0) continue // achromatic
            // Also check saturation
            const sv = imgSat[y * imgW + x]
            if (sv < HUE_SAT_GATE) continue
            patchColored++
            const bucket = Math.min(BUCKETS - 1, Math.floor(hv * BUCKETS))
            patchBuckets[bucket]++
          }
        }

        // If patch has too few colored pixels, can't validate → keep the hit
        if (patchColored < trimW * trimH * 0.1) return true

        // Find patch dominant hue
        let pMaxBucket = 0, pMaxCount = 0
        for (let i = 0; i < BUCKETS; i++) {
          if (patchBuckets[i] > pMaxCount) { pMaxCount = patchBuckets[i]; pMaxBucket = i }
        }
        const patchHue = (pMaxBucket + 0.5) / BUCKETS

        // Cyclic hue distance (0 to 0.5)
        let hueDist = Math.abs(tplDominantHue - patchHue)
        if (hueDist > 0.5) hueDist = 1 - hueDist

        if (hueDist > HUE_MAX_DISTANCE) {
          hueFilteredCount++
          return false // reject: wrong color
        }
        return true // accept: color matches
      })
    }

    const elapsed = Math.round(performance.now() - t0)
    const colorMode = tplSatStd > 0.03 ? 'color(60%)+gray(40%)' : 'gray-only'
    const hueInfo = hueFilterActive ? ` | hue-filter: ${hueFilteredCount} rejected` : ' | hue-filter: OFF'
    console.log(`[TemplateMatch v8] ${allHits.length} raw (${variants.length} orientations) → ${hits.length} NMS → ${finalHits.length} final | ${colorMode}${hueInfo} | trim ${tplW}x${tplH}→${trimW}x${trimH} | ${elapsed}ms | threshold=${effectiveThreshold} stride=${stride}`)

    self.postMessage({ type: 'result', hits: finalHits })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Worker error' })
  }
}
