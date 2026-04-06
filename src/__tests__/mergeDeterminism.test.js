/**
 * Cross-device merge determinism regression tests.
 *
 * Tests the extracted crossDeviceMerge module directly:
 * - mergeQuotesByUnion: union by ID + newer updatedAt wins
 * - decideBlobMerge: timestamp-based newer-wins for catalog blobs
 * - decideSettingsMerge: remote-wins for settings
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { mergeQuotesByUnion, decideBlobMerge, decideSettingsMerge } from '../utils/crossDeviceMerge.js'

const appSrc = readFileSync(resolve(import.meta.dirname, '..', 'App.jsx'), 'utf-8')

// ═══════════════════════════════════════════════════════════════════════════
// 1. QUOTE UNION MERGE
// ═══════════════════════════════════════════════════════════════════════════

describe('mergeQuotesByUnion', () => {
  it('newer remote version wins for same ID', () => {
    const local = [{ id: 'Q1', updatedAt: '2026-04-01T10:00:00Z', name: 'Old' }]
    const remote = [{ id: 'Q1', updatedAt: '2026-04-05T10:00:00Z', name: 'Fresh' }]
    const result = mergeQuotesByUnion(local, remote)
    expect(result).not.toBeNull()
    expect(result[0].name).toBe('Fresh')
  })

  it('disjoint quotes from both sources kept', () => {
    const local = [{ id: 'QA', createdAt: '2026-04-01T10:00:00Z' }]
    const remote = [{ id: 'QB', createdAt: '2026-04-02T10:00:00Z' }]
    const result = mergeQuotesByUnion(local, remote)
    expect(result).not.toBeNull()
    expect(result.length).toBe(2)
  })

  it('local newer than remote → local kept for that ID', () => {
    const local = [{ id: 'Q1', updatedAt: '2026-04-06T12:00:00Z', name: 'Local' }]
    const remote = [{ id: 'Q1', updatedAt: '2026-04-03T10:00:00Z', name: 'Remote' }]
    const result = mergeQuotesByUnion(local, remote)
    // No change since local is newer and same set
    expect(result).toBeNull()
  })

  it('empty remote → no change', () => {
    const local = [{ id: 'Q1', createdAt: '2026-04-01T10:00:00Z' }]
    expect(mergeQuotesByUnion(local, [])).toBeNull()
  })

  it('empty local + remote → uses remote', () => {
    const remote = [{ id: 'Q1', createdAt: '2026-04-01T10:00:00Z' }]
    const result = mergeQuotesByUnion([], remote)
    expect(result).not.toBeNull()
    expect(result.length).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. BLOB MERGE (TIMESTAMP-BASED)
// ═══════════════════════════════════════════════════════════════════════════

describe('decideBlobMerge', () => {
  it('local newer → keep-local', () => {
    const d = decideBlobMerge([{ id: 'A' }], '2026-04-06T12:00:00Z', [{ id: 'A' }], '2026-04-05T10:00:00Z')
    expect(d.action).toBe('keep-local')
  })

  it('remote newer → use-remote', () => {
    const d = decideBlobMerge([{ id: 'A' }], '2026-04-05T10:00:00Z', [{ id: 'A' }], '2026-04-06T12:00:00Z')
    expect(d.action).toBe('use-remote')
  })

  it('only local → keep-local', () => {
    const d = decideBlobMerge([{ id: 'A' }], '2026-04-05T10:00:00Z', [], null)
    expect(d.action).toBe('keep-local')
  })

  it('only remote → use-remote', () => {
    const d = decideBlobMerge([], null, [{ id: 'A' }], '2026-04-05T10:00:00Z')
    expect(d.action).toBe('use-remote')
  })

  it('empty remote does not wipe valid local', () => {
    const d = decideBlobMerge([{ id: 'A' }], '2026-04-05T10:00:00Z', [], null)
    expect(d.action).toBe('keep-local')
    expect(d.reason).toBe('no remote data')
  })

  it('missing local timestamp + valid remote → use-remote', () => {
    const d = decideBlobMerge([{ id: 'A' }], null, [{ id: 'B' }], '2026-04-05T10:00:00Z')
    expect(d.action).toBe('use-remote')
  })

  it('valid local + missing remote timestamp → keep-local', () => {
    const d = decideBlobMerge([{ id: 'A' }], '2026-04-05T10:00:00Z', [{ id: 'B' }], null)
    expect(d.action).toBe('keep-local')
  })

  it('both legacy (no timestamps) → use-remote as canonical', () => {
    const d = decideBlobMerge([{ id: 'A' }], null, [{ id: 'B' }], null)
    expect(d.action).toBe('use-remote')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. SETTINGS MERGE
// ═══════════════════════════════════════════════════════════════════════════

describe('decideSettingsMerge', () => {
  it('remote available → use-remote', () => {
    const d = decideSettingsMerge('{}', { labor: { hourly_rate: 12000 } })
    expect(d.action).toBe('use-remote')
  })

  it('remote empty → keep-local', () => {
    const d = decideSettingsMerge('{"labor":{}}', {})
    expect(d.action).toBe('keep-local')
  })

  it('remote null → keep-local', () => {
    const d = decideSettingsMerge('{"labor":{}}', null)
    expect(d.action).toBe('keep-local')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. APP.JSX SOURCE CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

describe('App.jsx uses crossDeviceMerge module', () => {
  it('imports from crossDeviceMerge', () => {
    expect(appSrc).toContain('crossDeviceMerge')
  })

  it('uses decideBlobMerge for catalog reconciliation', () => {
    expect(appSrc).toContain('decideBlobMerge')
  })

  it('uses mergeQuotesByUnion for quotes', () => {
    expect(appSrc).toContain('mergeQuotesByUnion')
  })

  it('no inline merge logic remaining', () => {
    // The old inline Map-based merge should be gone
    expect(appSrc).not.toContain('const merged = new Map()')
    // The old inline mergeByTimestamp function should be gone
    expect(appSrc).not.toContain('const mergeByTimestamp = async')
  })

  it('no count-based merge', () => {
    expect(appSrc).not.toContain('remote.length > local.length')
  })
})
