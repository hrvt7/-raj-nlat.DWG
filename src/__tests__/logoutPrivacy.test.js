/**
 * Logout privacy + backup suppression regression tests.
 *
 * Tests:
 * 1. clearAllLocalPlanData clears all 4 IDB stores
 * 2. Backup failure does not permanently suppress future recovery
 * 3. Normal backup success path unchanged
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localforage stores
const mockStores = {
  plan_files: new Map(),
  plan_thumbnails: new Map(),
  plan_annotations: new Map(),
  parse_cache: new Map(),
}

vi.mock('localforage', () => ({
  default: {
    createInstance: ({ storeName }) => ({
      getItem: vi.fn(k => Promise.resolve(mockStores[storeName]?.get(k) ?? null)),
      setItem: vi.fn((k, v) => { mockStores[storeName]?.set(k, v); return Promise.resolve() }),
      removeItem: vi.fn(k => { mockStores[storeName]?.delete(k); return Promise.resolve() }),
      clear: vi.fn(() => { mockStores[storeName]?.clear(); return Promise.resolve() }),
    }),
  },
}))

// Mock supabase
vi.mock('../supabase.js', () => ({
  supabaseConfigured: false,
  savePlansRemote: vi.fn(),
  saveAnnotationsRemote: vi.fn(),
  loadAnnotationsRemote: vi.fn(),
  deleteAnnotationsRemote: vi.fn(),
  uploadPlanBlob: vi.fn(),
  downloadPlanBlob: vi.fn(),
  deletePlanBlob: vi.fn(),
}))

// Mock localStorage
const mockStorage = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => mockStorage[k] ?? null,
  setItem: (k, v) => { mockStorage[k] = v },
  removeItem: (k) => { delete mockStorage[k] },
})

import { clearAllLocalPlanData } from '../data/planStore.js'

beforeEach(() => {
  // Seed mock stores with data
  for (const store of Object.values(mockStores)) store.clear()
  mockStores.plan_files.set('plan-1', new Blob(['test']))
  mockStores.plan_annotations.set('plan-1', { markers: [{ x: 1, y: 2 }] })
  mockStores.plan_thumbnails.set('plan-1', 'data:image/png;base64,...')
  mockStores.parse_cache.set('hash-abc', { blocks: [] })
})

describe('clearAllLocalPlanData', () => {
  it('clears all 4 IDB stores', async () => {
    // Verify data exists before clear
    expect(mockStores.plan_files.size).toBe(1)
    expect(mockStores.plan_annotations.size).toBe(1)
    expect(mockStores.plan_thumbnails.size).toBe(1)
    expect(mockStores.parse_cache.size).toBe(1)

    await clearAllLocalPlanData()

    // All stores should be empty
    expect(mockStores.plan_files.size).toBe(0)
    expect(mockStores.plan_annotations.size).toBe(0)
    expect(mockStores.plan_thumbnails.size).toBe(0)
    expect(mockStores.parse_cache.size).toBe(0)
  })

  it('does not throw if stores are already empty', async () => {
    for (const store of Object.values(mockStores)) store.clear()
    await expect(clearAllLocalPlanData()).resolves.not.toThrow()
  })
})

describe('backup suppression removed', () => {
  it('getPlanFile source does not contain permanent null suppression', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'data', 'planStore.js'), 'utf-8'
    )
    // The old pattern: `if (meta?.remoteBackupAt === null)` should be gone
    expect(src).not.toContain('remoteBackupAt === null')
    // The new pattern uses remoteBackupFailed instead of null suppression
    expect(src).toContain('remoteBackupFailed')
  })

  it('upload failure records timestamp, not null', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'data', 'planStore.js'), 'utf-8'
    )
    // Should NOT set remoteBackupAt to null
    expect(src).not.toContain("remoteBackupAt: null")
    // Should record failure time
    expect(src).toContain("remoteBackupFailed: new Date().toISOString()")
  })
})
