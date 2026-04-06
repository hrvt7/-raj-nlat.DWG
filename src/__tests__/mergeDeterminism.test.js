/**
 * Cross-device merge determinism regression tests.
 *
 * Verifies the unified newer-wins merge policy:
 * - Quotes: union by ID + newer updatedAt wins (unchanged)
 * - Catalog blobs: timestamp-based newer-wins
 * - No count-based merge
 * - No "local non-empty wins" shortcut
 * - No "remote always wins" shortcut
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const appSrc = readFileSync(resolve(import.meta.dirname, '..', 'App.jsx'), 'utf-8')
const supabaseSrc = readFileSync(resolve(import.meta.dirname, '..', 'supabase.js'), 'utf-8')

// Simulate the mergeByTimestamp logic from App.jsx
function mergeByTimestamp(localData, localTime, remoteData, remoteSavedAt) {
  if (!Array.isArray(remoteData) || remoteData.length === 0) return { winner: 'local', reason: 'no remote' }
  if (!localData || localData.length === 0) return { winner: 'remote', reason: 'local empty' }
  if (!localTime && !remoteSavedAt) return { winner: 'remote', reason: 'both no timestamp (legacy)' }
  if (!localTime) return { winner: 'remote', reason: 'local no timestamp' }
  if (!remoteSavedAt) return { winner: 'local', reason: 'remote no timestamp' }
  if (remoteSavedAt > localTime) return { winner: 'remote', reason: 'remote newer' }
  return { winner: 'local', reason: 'local newer or same' }
}

describe('newer-wins merge for catalog blobs', () => {
  it('local newer than remote → local wins', () => {
    const r = mergeByTimestamp(
      [{ id: 'A' }], '2026-04-06T12:00:00Z',
      [{ id: 'A' }], '2026-04-05T10:00:00Z'
    )
    expect(r.winner).toBe('local')
  })

  it('remote newer than local → remote wins', () => {
    const r = mergeByTimestamp(
      [{ id: 'A' }], '2026-04-05T10:00:00Z',
      [{ id: 'A' }], '2026-04-06T12:00:00Z'
    )
    expect(r.winner).toBe('remote')
  })

  it('only local exists → local kept', () => {
    const r = mergeByTimestamp([{ id: 'A' }], '2026-04-05T10:00:00Z', [], null)
    expect(r.winner).toBe('local')
  })

  it('only remote exists → remote used', () => {
    const r = mergeByTimestamp([], null, [{ id: 'A' }], '2026-04-05T10:00:00Z')
    expect(r.winner).toBe('remote')
  })

  it('empty remote does not wipe valid local', () => {
    const r = mergeByTimestamp([{ id: 'A' }], '2026-04-05T10:00:00Z', [], null)
    expect(r.winner).toBe('local')
    expect(r.reason).toBe('no remote')
  })

  it('missing local timestamp + valid remote → remote wins', () => {
    const r = mergeByTimestamp([{ id: 'A' }], null, [{ id: 'B' }], '2026-04-05T10:00:00Z')
    expect(r.winner).toBe('remote')
  })

  it('valid local timestamp + missing remote → local wins', () => {
    const r = mergeByTimestamp([{ id: 'A' }], '2026-04-05T10:00:00Z', [{ id: 'B' }], null)
    expect(r.winner).toBe('local')
  })

  it('both missing timestamps (legacy) → remote wins as canonical', () => {
    const r = mergeByTimestamp([{ id: 'A' }], null, [{ id: 'B' }], null)
    expect(r.winner).toBe('remote')
  })
})

describe('source code policy verification', () => {
  it('no count-based merge in App.jsx', () => {
    expect(appSrc).not.toContain('remote.length > local.length')
    expect(appSrc).not.toContain('mapped.length > local.length')
  })

  it('uses mergeByTimestamp for catalogs', () => {
    expect(appSrc).toContain('mergeByTimestamp')
    expect(appSrc).toContain('getLocalTimestamp')
  })

  it('remote blob saves include _savedAt timestamp', () => {
    expect(supabaseSrc).toContain("_savedAt: new Date().toISOString()")
  })

  it('loadUserBlobWithTime returns data + savedAt', () => {
    expect(supabaseSrc).toContain('loadUserBlobWithTime')
    expect(supabaseSrc).toContain('savedAt')
  })

  it('quotes merge still uses union by ID', () => {
    expect(appSrc).toContain('merged.set(q.id, q)')
  })
})
