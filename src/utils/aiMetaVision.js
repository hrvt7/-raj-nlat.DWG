// ─── AI Vision Metadata Fallback (Layer 3) ──────────────────────────────────
// Sends a first-page PDF image to the backend proxy which calls OpenAI Vision
// to extract structured metadata. The API key lives server-side only.
//
// SECURITY: This module MUST NOT import or reference any AI API keys directly.
//           All AI calls go through VITE_API_URL/api/meta-vision (Vercel serverless).
//           The OpenAI API key is stored exclusively as a Vercel environment variable.
//
// Isolated module — no side effects, no state, easy to test or swap backend.
// ─────────────────────────────────────────────────────────────────────────────
import { getApiHeaders } from './apiHeaders.js'

const MAX_IMAGE_DIMENSION = 1024      // scale down if larger

/**
 * Call the backend meta-vision proxy to extract metadata from a plan image.
 *
 * @param {string} imageBase64 — base64 data URL (data:image/jpeg;base64,...) or raw base64
 * @param {object} [existingMeta] — current metadata for context (optional)
 * @returns {Promise<object>} Structured metadata { floor, floorLabel, systemType, docType, drawingNumber, revision, confidence }
 * @throws {Error} If backend call fails or is not configured
 */
export async function callAiMetaVision(imageBase64, existingMeta = null) {
  const backendUrl = import.meta.env.VITE_API_URL

  if (!backendUrl) {
    throw new Error('AI Vision nem elérhető. A VITE_API_URL nincs beállítva.')
  }

  // Ensure proper data URL format
  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`

  const res = await fetch(`${backendUrl}/api/meta-vision`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({ image: imageUrl, existingMeta }),
  })

  if (!res.ok) {
    let errMsg = `Backend hiba (${res.status})`
    try {
      const errData = await res.json()
      if (errData.error) errMsg = errData.error
    } catch { /* ignore parse error */ }

    if (res.status === 404) throw new Error('Az /api/meta-vision végpont nem elérhető.')
    if (res.status === 413) throw new Error('A kép túl nagy. Próbálj kisebb felbontást.')
    if (res.status === 429) throw new Error('Túl sok kérés — próbáld újra később.')
    throw new Error(errMsg)
  }

  const data = await res.json()
  return validateAiResult(data)
}

// ── Validate response shape (client-side safety net) ─────────────────────────
const VALID_SYSTEM_TYPES = ['power', 'lighting', 'fire_alarm', 'low_voltage', 'security', 'lightning_protection', 'general']
const VALID_DOC_TYPES = ['plan', 'single_line', 'legend', 'schedule', 'detail', 'section']

function validateAiResult(obj) {
  return {
    floor: typeof obj.floor === 'string' ? obj.floor : null,
    floorLabel: typeof obj.floorLabel === 'string' ? obj.floorLabel : null,
    systemType: VALID_SYSTEM_TYPES.includes(obj.systemType) ? obj.systemType : null,
    docType: VALID_DOC_TYPES.includes(obj.docType) ? obj.docType : null,
    drawingNumber: typeof obj.drawingNumber === 'string' ? obj.drawingNumber : null,
    revision: typeof obj.revision === 'string' ? obj.revision : null,
    confidence: typeof obj.confidence === 'number' ? Math.min(1, Math.max(0, obj.confidence)) : 0.5,
  }
}

// ── Conservative merge: AI result into existing metadata ────────────────────
// Rules:
//   1. AI fills null/empty fields
//   2. AI overwrites fields where existing confidence < 0.60
//   3. AI confirms existing field → confidence boost +0.05
//   4. AI contradicts existing field (conf ≥ 0.60) → keep existing (no overwrite)
const MERGE_FIELDS = ['floor', 'floorLabel', 'systemType', 'docType', 'drawingNumber', 'revision']

/**
 * Merge AI vision result into existing metadata with conservative rules.
 *
 * @param {object} existing — current inferredMeta
 * @param {object} aiResult — result from callAiMetaVision
 * @returns {object} Merged metadata with updated metaSource, metaConfidence, metaExtractedAt
 */
export function mergeAiMeta(existing, aiResult) {
  const merged = { ...existing }
  let changed = false
  let confirmed = 0
  const existingConf = existing.metaConfidence ?? 0

  for (const field of MERGE_FIELDS) {
    const oldVal = existing[field]
    const aiVal = aiResult[field]

    if (!aiVal) continue // AI didn't find anything for this field

    if (!oldVal) {
      // Rule 1: Fill empty field
      merged[field] = aiVal
      changed = true
    } else if (existingConf < 0.60) {
      // Rule 2: Low confidence — allow overwrite
      merged[field] = aiVal
      changed = true
    } else if (oldVal === aiVal) {
      // Rule 3: Confirmation
      confirmed++
    }
    // Rule 4: Contradiction with high confidence — keep existing (implicit)
  }

  // ── Bookkeeping ──
  // Update source
  const oldSource = existing.metaSource || ''
  if (changed || confirmed > 0) {
    if (oldSource && !oldSource.includes('ai_vision')) {
      merged.metaSource = oldSource + '+ai_vision'
    } else if (!oldSource) {
      merged.metaSource = 'ai_vision'
    }
  }

  // Update confidence
  if (changed) {
    // Blend: weighted average of existing and AI confidence
    merged.metaConfidence = Math.min(0.98, Math.max(existingConf, aiResult.confidence) + confirmed * 0.05)
  } else if (confirmed > 0) {
    // Only confirmations — boost
    merged.metaConfidence = Math.min(0.98, existingConf + confirmed * 0.05)
  }

  merged.metaExtractedAt = new Date().toISOString()

  return merged
}

// ── Render first page of PDF to image data URL ─────────────────────────────
/**
 * Renders the first page of a PDF to a JPEG data URL suitable for Vision API.
 * If a cached thumbnail exists, uses that. Otherwise renders on-demand.
 *
 * @param {Blob} pdfBlob — raw PDF file
 * @param {number} [scale=0.6] — render scale (0.6 ≈ 1024px wide for A3)
 * @returns {Promise<string>} JPEG data URL
 */
export async function renderFirstPageImage(pdfBlob, scale = 0.6) {
  const pdfjsLib = await import('pdfjs-dist')
  const ab = await pdfBlob.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: ab }).promise
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale })

  // Cap dimensions
  let finalScale = scale
  if (vp.width > MAX_IMAGE_DIMENSION || vp.height > MAX_IMAGE_DIMENSION) {
    const ratio = MAX_IMAGE_DIMENSION / Math.max(vp.width, vp.height)
    finalScale = scale * ratio
  }
  const finalVp = finalScale !== scale ? page.getViewport({ scale: finalScale }) : vp

  const canvas = document.createElement('canvas')
  canvas.width = finalVp.width
  canvas.height = finalVp.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: finalVp }).promise

  const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
  doc.destroy()
  return dataUrl
}
