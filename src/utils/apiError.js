/**
 * Unified API error handler for TakeoffPro frontend.
 *
 * Extracts user-facing Hungarian error messages from API responses,
 * logs developer-useful details to console, and provides consistent
 * error shape across all API callers.
 */

/**
 * Parse an API response error into a structured error object.
 * @param {Response} res - fetch Response object
 * @param {string} context - human-readable context (e.g. 'PDF feldolgozás', 'AI elemzés')
 * @returns {Promise<{message: string, status: number, detail?: string}>}
 */
export async function parseApiError(res, context = 'API hívás') {
  const status = res.status
  let detail = ''

  try {
    const body = await res.json()
    detail = body.error || body.message || ''
  } catch { /* non-JSON response */ }

  // Map status codes to Hungarian user messages
  const statusMessages = {
    401: 'Bejelentkezés szükséges ehhez a funkcióhoz.',
    403: 'Hozzáférés megtagadva.',
    413: 'A feltöltött fájl túl nagy.',
    429: 'Túl sok kérés — próbáld újra később.',
    503: 'A szolgáltatás ideiglenesen nem elérhető.',
  }

  const message = statusMessages[status]
    || detail
    || `${context} sikertelen (${status})`

  // Developer log with full context
  console.error(`[API] ${context} failed:`, { status, detail, url: res.url })

  return { message, status, detail }
}
