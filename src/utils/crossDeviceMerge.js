/**
 * crossDeviceMerge — pure merge decision functions for cross-device reconciliation.
 *
 * These functions contain ONLY the decision logic — no React state, no IDB writes,
 * no remote fetches. The orchestration (fetch + save + setState) stays in App.jsx.
 *
 * Merge policy:
 * - Quotes: union by ID + newer updatedAt wins per-ID
 * - Catalog blobs: timestamp-based newer-wins (local _updatedAt vs remote _savedAt)
 * - Settings: remote wins when available (no per-field timestamps)
 */

/**
 * Merge quotes by union: keeps all unique quotes from both sources,
 * preferring the version with the later updatedAt when both have the same ID.
 *
 * @param {Array} localQuotes - quotes from localStorage
 * @param {Array} remoteQuotes - quotes from Supabase
 * @returns {Array|null} merged array sorted by createdAt desc, or null if no change needed
 */
export function mergeQuotesByUnion(localQuotes, remoteQuotes) {
  if (!remoteQuotes.length) return null // no remote → no change

  const merged = new Map()
  // Local first — local is authoritative for recently-edited quotes
  for (const q of localQuotes) { if (q.id) merged.set(q.id, q) }
  // Remote — add missing quotes, update if remote is newer
  for (const q of remoteQuotes) {
    if (!q.id) continue
    const existing = merged.get(q.id)
    if (!existing) {
      merged.set(q.id, q)
    } else {
      const remoteTime = q.updatedAt || q.createdAt || ''
      const localTime = existing.updatedAt || existing.createdAt || ''
      if (remoteTime > localTime) merged.set(q.id, q)
    }
  }

  const result = Array.from(merged.values())
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  // Only return if something actually changed (check both IDs and timestamps)
  if (result.length === localQuotes.length && result.every((q, i) =>
    q.id === localQuotes[i]?.id && (q.updatedAt || q.createdAt || '') === (localQuotes[i]?.updatedAt || localQuotes[i]?.createdAt || '')
  )) {
    return null // no change
  }
  return result
}

/**
 * Decide whether to keep local or use remote for a catalog/metadata blob.
 * Uses timestamp comparison: the fresher write wins.
 *
 * @param {Array|null} localData - local array (from localStorage)
 * @param {string|null} localTimestamp - local envelope _updatedAt (ISO string)
 * @param {Array|null} remoteData - remote array (from Supabase)
 * @param {string|null} remoteTimestamp - remote blob _savedAt (ISO string)
 * @returns {{ action: 'keep-local'|'use-remote', data: Array|null, reason: string }}
 */
export function decideBlobMerge(localData, localTimestamp, remoteData, remoteTimestamp) {
  // No remote data → keep local
  if (!Array.isArray(remoteData) || remoteData.length === 0) {
    return { action: 'keep-local', data: localData, reason: 'no remote data' }
  }
  // Local empty → remote wins
  if (!localData || localData.length === 0) {
    return { action: 'use-remote', data: remoteData, reason: 'local empty' }
  }
  // Both have data → compare timestamps
  if (!localTimestamp && !remoteTimestamp) {
    return { action: 'use-remote', data: remoteData, reason: 'both legacy (no timestamps)' }
  }
  if (!localTimestamp) {
    return { action: 'use-remote', data: remoteData, reason: 'local has no timestamp' }
  }
  if (!remoteTimestamp) {
    return { action: 'keep-local', data: localData, reason: 'remote has no timestamp' }
  }
  // Both have timestamps → newer wins
  if (remoteTimestamp > localTimestamp) {
    return { action: 'use-remote', data: remoteData, reason: 'remote newer' }
  }
  return { action: 'keep-local', data: localData, reason: 'local newer or same' }
}

/**
 * Decide whether to use remote settings.
 * Settings don't have per-field timestamps, so remote wins when available.
 *
 * @param {string|null} localRaw - raw localStorage string for settings
 * @param {object|null} remoteSettings - settings object from Supabase
 * @returns {{ action: 'keep-local'|'use-remote', data: object|null }}
 */
export function decideSettingsMerge(localRaw, remoteSettings) {
  if (!remoteSettings || typeof remoteSettings !== 'object' || Object.keys(remoteSettings).length === 0) {
    return { action: 'keep-local', data: null }
  }
  // Remote has data → use it (canonical after login)
  return { action: 'use-remote', data: remoteSettings }
}
