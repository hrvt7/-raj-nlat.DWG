// ─── PlanStore Save-Order Atomicity — Regression Tests ───────────────────────
// Verifies that savePlan writes the blob BEFORE metadata, so a blob-write
// failure never leaves orphan metadata entries pointing to missing files.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Track call order + configurable failure ──────────────────────────────────
const callLog = []
let failingKeys = new Set()  // IDB setItem throws for these keys

// ── In-memory localforage mock ───────────────────────────────────────────────
let idbStore = {}
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (k) => idbStore[k] ?? null,
      setItem: async (k, v) => {
        callLog.push({ layer: 'indexeddb', op: 'setItem', key: k })
        if (failingKeys.has(k)) throw new Error('IDB write failed')
        idbStore[k] = v
      },
      removeItem: async (k) => { delete idbStore[k] },
      iterate: async (cb) => { for (const v of Object.values(idbStore)) cb(v) },
    }),
  },
}))

// ── localStorage mock ────────────────────────────────────────────────────────
let lsStore = {}
beforeEach(() => {
  idbStore = {}
  lsStore = {}
  callLog.length = 0
  failingKeys = new Set()
  vi.stubGlobal('localStorage', {
    getItem: (k) => lsStore[k] ?? null,
    setItem: (k, v) => {
      callLog.push({ layer: 'localstorage', op: 'setItem', key: k })
      lsStore[k] = String(v)
    },
    removeItem: (k) => { delete lsStore[k] },
    get length() { return Object.keys(lsStore).length },
    key: (i) => Object.keys(lsStore)[i] ?? null,
    clear: () => { lsStore = {} },
  })
})

// Import after mocks
import { savePlan, loadPlans, getPlanFile } from '../data/planStore.js'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('planStore save-order atomicity', () => {

  it('writes blob to IndexedDB BEFORE metadata to localStorage', async () => {
    const plan = { id: 'PLN-order-1', name: 'Test Plan', fileType: 'dxf' }
    const blob = new Blob(['dxf-content'], { type: 'application/octet-stream' })

    await savePlan(plan, blob)

    // Find the two relevant write operations in call order
    const idbIdx = callLog.findIndex(c => c.layer === 'indexeddb' && c.key === 'PLN-order-1')
    const lsIdx = callLog.findIndex(c => c.layer === 'localstorage' && c.key === 'takeoffpro_plans_meta')

    expect(idbIdx).toBeGreaterThanOrEqual(0)
    expect(lsIdx).toBeGreaterThanOrEqual(0)
    expect(idbIdx).toBeLessThan(lsIdx)
  })

  it('successful save persists both blob and metadata', async () => {
    const plan = { id: 'PLN-success', name: 'Complete Plan', fileType: 'pdf' }
    const blob = new Blob(['pdf-content'])

    await savePlan(plan, blob)

    // Metadata readable
    const plans = loadPlans()
    const saved = plans.find(p => p.id === 'PLN-success')
    expect(saved).toBeTruthy()
    expect(saved.name).toBe('Complete Plan')

    // Blob readable
    const file = await getPlanFile('PLN-success')
    expect(file).toBeTruthy()
  })

  it('failed blob write does NOT leave orphan metadata', async () => {
    // Configure IDB to fail for this specific key
    failingKeys.add('PLN-fail')

    const plan = { id: 'PLN-fail', name: 'Should Not Appear', fileType: 'dxf' }
    const blob = new Blob(['content'])

    // savePlan should throw because IDB setItem fails
    await expect(savePlan(plan, blob)).rejects.toThrow('IDB write failed')

    // CRITICAL: metadata must NOT exist — no orphan entry
    const plans = loadPlans()
    expect(plans.find(p => p.id === 'PLN-fail')).toBeUndefined()

    // No localStorage write for plans_meta should have occurred
    const metaWrites = callLog.filter(c =>
      c.layer === 'localstorage' && c.key === 'takeoffpro_plans_meta'
    )
    expect(metaWrites).toHaveLength(0)
  })

  it('save without blob (null) still writes metadata', async () => {
    const plan = { id: 'PLN-no-blob', name: 'Metadata Only', fileType: 'dxf' }

    await savePlan(plan, null)

    // Metadata present
    const plans = loadPlans()
    expect(plans.find(p => p.id === 'PLN-no-blob')).toBeTruthy()

    // No IDB write for this plan
    const idbWrites = callLog.filter(c => c.layer === 'indexeddb' && c.key === 'PLN-no-blob')
    expect(idbWrites).toHaveLength(0)
  })

  it('overwrite updates both blob and metadata', async () => {
    await savePlan({ id: 'PLN-ow', name: 'V1', fileType: 'dxf' }, new Blob(['v1']))
    await savePlan({ id: 'PLN-ow', name: 'V2', fileType: 'dxf', fileSize: 42 }, new Blob(['v2']))

    const plans = loadPlans()
    const saved = plans.find(p => p.id === 'PLN-ow')
    expect(saved.name).toBe('V2')
    expect(saved.fileSize).toBe(42)
    expect(plans.filter(p => p.id === 'PLN-ow')).toHaveLength(1)
  })
})
