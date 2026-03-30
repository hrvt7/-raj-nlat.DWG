/**
 * Shared API request headers for serverless endpoint calls.
 * If VITE_API_SECRET is set, includes Bearer authorization.
 */
const API_SECRET = import.meta.env.VITE_API_SECRET || ''

export function getApiHeaders(contentType = 'application/json') {
  const headers = { 'Content-Type': contentType }
  if (API_SECRET) {
    headers['Authorization'] = `Bearer ${API_SECRET}`
  }
  return headers
}
