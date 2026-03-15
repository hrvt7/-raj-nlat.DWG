// ─── LegendStore Save-Order Atomicity — Regression Tests ─────────────────────
// Verifies that saveTemplate writes the image to IndexedDB BEFORE metadata
// to localStorage, so an image-write failure never leaves phantom metadata
// entries pointing to missing image data.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Track call order + configurable failure ──────────────────────────────────
const callLog = []
let failingKeys = new Set()

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
      clear: async () => { idbStore = {} },
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
import { saveTemplate, loadTemplates, getTemplateImage } from '../data/legendStore.js'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('legendStore save-order atomicity', () => {

  it('writes image to IndexedDB BEFORE metadata to localStorage', async () => {
    const meta = { id: 'TPL-order-1', category: 'socket', label: 'Dugalj' }
    const imageData = 'data:image/png;base64,AAAA'

    await saveTemplate(meta, imageData)

    const idbIdx = callLog.findIndex(c => c.layer === 'indexeddb' && c.key === 'TPL-order-1')
    const lsIdx = callLog.findIndex(c => c.layer === 'localstorage' && c.key === 'takeoffpro_legend_templates_meta')

    expect(idbIdx).toBeGreaterThanOrEqual(0)
    expect(lsIdx).toBeGreaterThanOrEqual(0)
    expect(idbIdx).toBeLessThan(lsIdx)
  })

  it('successful save persists both image and metadata', async () => {
    const meta = { id: 'TPL-ok', category: 'light', label: 'Lámpa', color: '#FF0' }
    const imageData = 'data:image/png;base64,BBBB'

    await saveTemplate(meta, imageData)

    // Metadata readable
    const templates = loadTemplates()
    const saved = templates.find(t => t.id === 'TPL-ok')
    expect(saved).toBeTruthy()
    expect(saved.label).toBe('Lámpa')
    expect(saved.color).toBe('#FF0')

    // Image readable
    const img = await getTemplateImage('TPL-ok')
    expect(img).toBe(imageData)
  })

  it('failed image write does NOT leave phantom metadata', async () => {
    failingKeys.add('TPL-fail')

    const meta = { id: 'TPL-fail', category: 'switch', label: 'Should Not Appear' }
    const imageData = 'data:image/png;base64,CCCC'

    await expect(saveTemplate(meta, imageData)).rejects.toThrow('IDB write failed')

    // CRITICAL: metadata must NOT exist
    const templates = loadTemplates()
    expect(templates.find(t => t.id === 'TPL-fail')).toBeUndefined()

    // No LS write for legend meta should have occurred
    const metaWrites = callLog.filter(c =>
      c.layer === 'localstorage' && c.key === 'takeoffpro_legend_templates_meta'
    )
    expect(metaWrites).toHaveLength(0)
  })

  it('overwrite updates both image and metadata', async () => {
    const meta1 = { id: 'TPL-ow', category: 'socket', label: 'V1' }
    await saveTemplate(meta1, 'data:image/png;base64,V1')

    const meta2 = { id: 'TPL-ow', category: 'socket', label: 'V2', color: '#0F0' }
    await saveTemplate(meta2, 'data:image/png;base64,V2')

    const templates = loadTemplates()
    const saved = templates.find(t => t.id === 'TPL-ow')
    expect(saved.label).toBe('V2')
    expect(saved.color).toBe('#0F0')
    expect(templates.filter(t => t.id === 'TPL-ow')).toHaveLength(1)

    const img = await getTemplateImage('TPL-ow')
    expect(img).toBe('data:image/png;base64,V2')
  })

  it('multiple templates are stored independently', async () => {
    await saveTemplate({ id: 'TPL-a', label: 'A' }, 'img-a')
    await saveTemplate({ id: 'TPL-b', label: 'B' }, 'img-b')

    const templates = loadTemplates()
    expect(templates).toHaveLength(2)
    expect(await getTemplateImage('TPL-a')).toBe('img-a')
    expect(await getTemplateImage('TPL-b')).toBe('img-b')
  })
})
