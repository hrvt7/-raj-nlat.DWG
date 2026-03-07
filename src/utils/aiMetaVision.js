// ─── AI Vision Metadata Fallback (Layer 3) ──────────────────────────────────
// Sends a first-page PDF image to OpenAI Vision API to extract structured
// metadata when filename + text scan layers produce low-confidence results.
//
// Isolated module — no side effects, no state, easy to test or swap backend.
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_MODEL = 'gpt-4o-mini'   // fast + cheap vision model
const MAX_IMAGE_DIMENSION = 1024      // scale down if larger

// ── Hungarian electrical drawing metadata prompt ────────────────────────────
const SYSTEM_PROMPT = `Te egy magyar villamos tervrajz metaadat-felismerő AI vagy.
A felhasználó egy épületvillamos tervrajz első oldalának képét küldi.
A képen jellemzően van fejléc / title block / bélyegző a jobb alsó sarokban.

Feladatod: strukturált JSON-t visszaadni az alábbi mezőkkel.
Ha egy mezőt nem tudsz megállapítani, adj null-t.

Mezők:
- floor: emelet kódja (pl. "fsz", "pince", "1_emelet", "2_emelet", "teto")
- floorLabel: emelet olvasható neve (pl. "Földszint", "1. emelet", "Tetőszint")
- systemType: villamos rendszer típusa, az alábbiak egyike:
    "power" | "lighting" | "fire_alarm" | "low_voltage" | "security" | "lightning_protection" | "general"
- docType: dokumentum típusa, az alábbiak egyike:
    "plan" | "single_line" | "legend" | "schedule" | "detail" | "section"
- drawingNumber: rajzszám (pl. "E-01", "V-03", "GY-02")
- revision: revízió (pl. "R1", "A", "Rev2")
- confidence: 0–1 közötti szám, mennyire vagy biztos az eredményben

FONTOS:
- Csak az képen látható információt használd
- Ne találj ki adatot
- A confidence legyen őszinte (ha alig látsz title block-ot, adj 0.3-at)
- Válaszolj KIZÁRÓLAG valid JSON-nel, semmi más szöveggel`

/**
 * Call OpenAI Vision API to extract metadata from a plan image.
 *
 * @param {string} imageBase64 — base64 data URL (data:image/jpeg;base64,...) or raw base64
 * @param {object} [existingMeta] — current metadata for context (optional)
 * @returns {Promise<object>} Structured metadata { floor, floorLabel, systemType, docType, drawingNumber, revision, confidence }
 * @throws {Error} If API call fails or no API key configured
 */
export async function callAiMetaVision(imageBase64, existingMeta = null) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  const backendUrl = import.meta.env.VITE_API_URL

  // ── Try direct OpenAI call ──
  if (apiKey) {
    return await callOpenAiDirect(apiKey, imageBase64, existingMeta)
  }

  // ── Try backend proxy ──
  if (backendUrl) {
    return await callBackendProxy(backendUrl, imageBase64, existingMeta)
  }

  throw new Error('AI Vision nem elérhető. Állítsd be a VITE_OPENAI_API_KEY környezeti változót.')
}

// ── Direct OpenAI Vision API call ───────────────────────────────────────────
async function callOpenAiDirect(apiKey, imageBase64, existingMeta) {
  // Ensure proper data URL format
  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`

  const userContent = [
    {
      type: 'image_url',
      image_url: { url: imageUrl, detail: 'low' },  // low detail = cheaper + faster
    },
  ]

  // Add context about existing metadata if available
  if (existingMeta) {
    const ctx = Object.entries(existingMeta)
      .filter(([k, v]) => v && !k.startsWith('meta'))
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    if (ctx) {
      userContent.push({
        type: 'text',
        text: `Jelenlegi (bizonytalan) metaadatok: ${ctx}\nKérlek erősítsd meg vagy javítsd ki a kép alapján.`,
      })
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('Érvénytelen OpenAI API kulcs.')
    if (res.status === 429) throw new Error('OpenAI API rate limit — próbáld újra később.')
    throw new Error(`OpenAI API hiba (${res.status}): ${errBody.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) throw new Error('Üres AI válasz.')

  return parseAiResponse(raw)
}

// ── Backend proxy call ──────────────────────────────────────────────────────
async function callBackendProxy(backendUrl, imageBase64, existingMeta) {
  const res = await fetch(`${backendUrl}/api/meta-vision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, existingMeta }),
  })

  if (!res.ok) {
    if (res.status === 404) throw new Error('Backend /api/meta-vision végpont nem elérhető. Használj VITE_OPENAI_API_KEY-t.')
    throw new Error(`Backend hiba (${res.status})`)
  }

  const data = await res.json()
  return validateAiResult(data)
}

// ── Parse & validate AI response ────────────────────────────────────────────
function parseAiResponse(raw) {
  // Strip markdown code fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }

  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try to extract JSON from surrounding text
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) } catch { /* fall through */ }
    }
    if (!parsed) throw new Error('AI válasz nem valid JSON.')
  }

  return validateAiResult(parsed)
}

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
