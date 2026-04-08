/**
 * dwgConversionFlow — DWG→DXF conversion orchestration extracted from TakeoffWorkspace.
 *
 * Manages the 4-step CloudConvert pipeline:
 *   1. Create job via our API (server creates CC job, returns upload URL)
 *   2. Upload file directly from browser to CloudConvert S3
 *   3. Poll for completion via our API
 *   4. Download converted DXF from CloudConvert CDN
 *
 * Pure async function — no React hooks, no state. Caller manages state updates.
 * Throws on failure with user-facing Hungarian error messages.
 *
 * @param {File} file — the .dwg file
 * @param {Function} getAuthHeaders — returns { Authorization: 'Bearer ...' }
 * @returns {Promise<string>} — the converted DXF text
 */

export async function convertDwgToDxf(file, getAuthHeaders) {
  const apiUrl = import.meta.env.VITE_API_URL || ''

  // ── Fetch with retry + exponential backoff ──
  const MAX_RETRIES = 3
  let _auth401Retried = false
  const isOwnApi = (url) => url.includes('/api/convert-dwg')

  const fetchWithRetry = async (url, opts, retries = MAX_RETRIES) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, opts)
        if (res.status === 401 && !_auth401Retried && isOwnApi(url)) {
          _auth401Retried = true
          console.warn('DWG convert: 401 — refreshing token and retrying')
          const freshHeaders = await getAuthHeaders()
          return fetchWithRetry(url, { ...opts, headers: freshHeaders }, 0)
        }
        if (res.ok || res.status < 500) return res
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
          console.warn(`DWG retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms (HTTP ${res.status})`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        return res
      } catch (netErr) {
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
          console.warn(`DWG retry ${attempt + 1}/${retries} after ${Math.round(delay)}ms (${netErr.message})`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw netErr
      }
    }
  }

  // Step 1: Create CloudConvert job
  const authHeaders = await getAuthHeaders()
  const createRes = await fetchWithRetry(`${apiUrl}/api/convert-dwg`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ filename: file.name }),
  })
  let createJson
  try {
    createJson = await createRes.json()
  } catch {
    throw new Error(
      createRes.status === 503
        ? 'A DWG konverzió szolgáltatás nem elérhető. Exportáld a tervrajzot PDF vagy DXF formátumba.'
        : `A szerver nem JSON választ adott (HTTP ${createRes.status}). Próbáld újra később, vagy használj PDF/DXF formátumot.`
    )
  }
  if (!createRes.ok || !createJson.success) {
    const errDetail = createJson.code ? ` [${createJson.code}]` : ''
    throw new Error((createJson.error || `Job létrehozása sikertelen (${createRes.status})`) + errDetail)
  }
  const { jobId, uploadUrl, uploadParams } = createJson

  // Step 2: Upload file directly to CloudConvert S3
  const formData = new FormData()
  for (const [key, val] of Object.entries(uploadParams)) {
    formData.append(key, val)
  }
  // Use ASCII-safe filename to prevent CloudConvert S3 upload failures
  // with non-ASCII characters (Hungarian accents, special chars)
  const safeFilename = file.name.replace(/[^\x20-\x7E]/g, '_') || 'input.dwg'
  formData.append('file', file, safeFilename)
  const uploadRes = await fetchWithRetry(uploadUrl, { method: 'POST', body: formData })
  if (!uploadRes.ok) {
    throw new Error(`Fájl feltöltése CloudConvert-re sikertelen (HTTP ${uploadRes.status})`)
  }

  // Step 3: Poll for completion (max 2 minutes)
  let downloadUrl = null
  const pollStart = Date.now()
  const MAX_POLL_MS = 120_000
  while (Date.now() - pollStart < MAX_POLL_MS) {
    await new Promise(r => setTimeout(r, 3000))
    const pollHeaders = await getAuthHeaders()
    const pollRes = await fetchWithRetry(`${apiUrl}/api/convert-dwg`, {
      method: 'POST',
      headers: pollHeaders,
      body: JSON.stringify({ jobId }),
    }, 2)
    let pollJson
    try { pollJson = await pollRes.json() } catch {
      throw new Error(`A szerver nem JSON választ adott a pollingra (HTTP ${pollRes.status}).`)
    }
    if (!pollRes.ok || !pollJson.success) {
      throw new Error(pollJson.error || 'Státusz lekérdezése sikertelen')
    }
    if (pollJson.status === 'finished') { downloadUrl = pollJson.downloadUrl; break }
    if (pollJson.status === 'error') {
      console.error('[DWG→DXF] CloudConvert error details:', JSON.stringify({
        error: pollJson.error,
        errorCode: pollJson.errorCode,
        errorTaskName: pollJson.errorTaskName,
        errorDetails: pollJson.errorDetails,
      }))
      throw new Error(pollJson.error || 'CloudConvert konverzió hiba')
    }
  }
  if (!downloadUrl) throw new Error('CloudConvert időtúllépés (120 mp). Próbáld újra.')

  // Step 4: Download converted DXF
  const dxfRes = await fetchWithRetry(downloadUrl, {}, 2)
  if (!dxfRes.ok) throw new Error(`DXF letöltése sikertelen (HTTP ${dxfRes.status})`)
  return await dxfRes.text()
}
