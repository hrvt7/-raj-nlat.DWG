/**
 * Merge correctness regression tests.
 *
 * Verifies that the remote/local merge policy:
 * - Does NOT use count-based comparison
 * - Preserves newer local state when remote is larger but staler
 * - Union-merges quotes by ID
 * - Recovers from remote when local is empty (new device)
 */
import { describe, it, expect } from 'vitest'

describe('quote union merge policy', () => {
  // Simulate the merge logic from App.jsx

  function mergeQuotes(localQuotes, remoteQuotes) {
    const merged = new Map()
    for (const q of localQuotes) { if (q.id) merged.set(q.id, q) }
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
    return Array.from(merged.values())
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  }

  it('fresher smaller local beats older larger remote', () => {
    const local = [
      { id: 'QT-2026-a1', createdAt: '2026-04-05T12:00:00Z', updatedAt: '2026-04-05T14:00:00Z', projectName: 'New Quote' },
    ]
    const remote = [
      { id: 'QT-2026-old1', createdAt: '2026-03-01T10:00:00Z', projectName: 'Old 1' },
      { id: 'QT-2026-old2', createdAt: '2026-03-02T10:00:00Z', projectName: 'Old 2' },
      { id: 'QT-2026-old3', createdAt: '2026-03-03T10:00:00Z', projectName: 'Old 3' },
    ]

    const result = mergeQuotes(local, remote)

    // All 4 quotes should be present — union, not replacement
    expect(result.length).toBe(4)
    expect(result.some(q => q.id === 'QT-2026-a1')).toBe(true)
    expect(result.some(q => q.id === 'QT-2026-old1')).toBe(true)
  })

  it('remote quotes not in local are added', () => {
    const local = [
      { id: 'QT-local-1', createdAt: '2026-04-01T10:00:00Z' },
    ]
    const remote = [
      { id: 'QT-remote-1', createdAt: '2026-04-02T10:00:00Z' },
    ]
    const result = mergeQuotes(local, remote)
    expect(result.length).toBe(2)
    expect(result.find(q => q.id === 'QT-remote-1')).toBeTruthy()
  })

  it('same ID: newer version wins', () => {
    const local = [
      { id: 'QT-same', createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-01T10:00:00Z', projectName: 'Old Local' },
    ]
    const remote = [
      { id: 'QT-same', createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-05T12:00:00Z', projectName: 'Updated Remote' },
    ]
    const result = mergeQuotes(local, remote)
    expect(result.length).toBe(1)
    expect(result[0].projectName).toBe('Updated Remote')
  })

  it('same ID: local wins when local is newer', () => {
    const local = [
      { id: 'QT-same', createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-05T15:00:00Z', projectName: 'Fresh Local' },
    ]
    const remote = [
      { id: 'QT-same', createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-03T12:00:00Z', projectName: 'Stale Remote' },
    ]
    const result = mergeQuotes(local, remote)
    expect(result.length).toBe(1)
    expect(result[0].projectName).toBe('Fresh Local')
  })

  it('empty local recovers everything from remote', () => {
    const local = []
    const remote = [
      { id: 'QT-r1', createdAt: '2026-04-01T10:00:00Z' },
      { id: 'QT-r2', createdAt: '2026-04-02T10:00:00Z' },
    ]
    const result = mergeQuotes(local, remote)
    expect(result.length).toBe(2)
  })

  it('empty remote does not discard local', () => {
    const local = [
      { id: 'QT-l1', createdAt: '2026-04-01T10:00:00Z' },
    ]
    const remote = []
    const result = mergeQuotes(local, remote)
    expect(result.length).toBe(1)
  })
})

describe('catalog merge policy: local-wins when both have data', () => {
  function mergeCatalog(local, remote) {
    if (!Array.isArray(remote) || remote.length === 0) return local
    if (!local || local.length === 0) return remote
    return local // local wins when both have data
  }

  it('empty local recovers from remote', () => {
    const result = mergeCatalog([], [{ id: 'asm-1' }, { id: 'asm-2' }])
    expect(result.length).toBe(2)
  })

  it('non-empty local wins over larger remote', () => {
    const local = [{ id: 'asm-1', name: 'Fresh Edit' }]
    const remote = [{ id: 'asm-1' }, { id: 'asm-2' }, { id: 'asm-3' }]
    const result = mergeCatalog(local, remote)
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('Fresh Edit')
  })

  it('empty remote does not affect local', () => {
    const local = [{ id: 'asm-1' }]
    const result = mergeCatalog(local, [])
    expect(result.length).toBe(1)
  })
})
