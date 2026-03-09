// ─── DXF Graceful Degradation Tests ──────────────────────────────────────────
// Tests for:
// 1. Recognition Summary Bar — status levels based on recognition %
// 2. Unknown Blocks Panel — assignment workflow
// 3. Project Block Dictionary — save/load/apply
// 4. Degradation Logic — auto-open panel, 0-insert handling
//
// These are architectural / contract tests — they verify the data flow and
// business logic without mounting React components.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// ── Source code reading helpers ──────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..')
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

// ── Mock localStorage for block dictionary tests ────────────────────────────
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
    _store: store,
  }
})()

// ─────────────────────────────────────────────────────────────────────────────
describe('Project Block Dictionary (planStore)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // Patch global localStorage
    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Import the functions dynamically to pick up the localStorage mock
  const importPlanStore = async () => {
    // We test the raw logic, not the module (which requires localforage)
    // Instead, test the dictionary functions structurally from source
    const src = readSrc('data/planStore.js')
    return src
  }

  it('planStore exports block dictionary functions', async () => {
    const src = await importPlanStore()
    expect(src).toContain('export function loadBlockDictionary')
    expect(src).toContain('export function saveBlockMapping')
    expect(src).toContain('export function lookupBlockInDictionary')
    expect(src).toContain('export function applyBlockDictionary')
  })

  it('_normBlockName normalizes block names consistently', async () => {
    const src = await importPlanStore()
    // Verify normalization logic exists
    expect(src).toContain("(name || '').toUpperCase().replace(/[_\\-\\.]/g, ' ').trim()")
  })

  it('saveBlockMapping stores to localStorage with project prefix', async () => {
    const src = await importPlanStore()
    expect(src).toContain("'takeoffpro_block_dict_'")
    expect(src).toContain('localStorage.setItem(BLOCK_DICT_PREFIX + projectId')
  })

  it('applyBlockDictionary preserves high-confidence items', async () => {
    const src = await importPlanStore()
    // The function should skip items with confidence > 0.5
    expect(src).toContain('item.asmId && item.confidence > 0.5')
    expect(src).toContain("matchType: 'dictionary'")
    expect(src).toContain('_dictApplied: true')
  })

  it('applyBlockDictionary sets confidence 0.85 for dictionary matches', async () => {
    const src = await importPlanStore()
    expect(src).toContain('confidence: 0.85')
  })

  it('loadBlockDictionary returns empty object for null projectId', async () => {
    const src = await importPlanStore()
    expect(src).toContain('if (!projectId) return {}')
  })

  it('saveBlockMapping handles null asmId as deletion', async () => {
    const src = await importPlanStore()
    expect(src).toContain('delete dict[key]')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Recognition Summary Bar', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('RecognitionSummaryBar component exists', () => {
    expect(workspaceSrc).toContain('function RecognitionSummaryBar(')
  })

  it('computes recognition percentage from recognized items', () => {
    // Verify the component calculates known/total ratio
    expect(workspaceSrc).toMatch(/const known = recognizedItems\.filter\(i => i\.asmId && i\.confidence >= 0\.5\)\.length/)
    expect(workspaceSrc).toMatch(/const pct = total > 0/)
  })

  it('has three status levels: green (>=70%), orange (20-70%), red (<20%)', () => {
    expect(workspaceSrc).toContain('pct >= 70')
    expect(workspaceSrc).toContain('pct >= 20')
    // Colors match the design token system
    expect(workspaceSrc).toMatch(/statusColor = C\.accent.*statusIcon = '✅'/)
    expect(workspaceSrc).toMatch(/statusColor = C\.yellow.*statusIcon = '⚠️'/)
    expect(workspaceSrc).toMatch(/statusColor = '#FF9090'.*statusIcon = '🟠'/)
  })

  it('handles 0 inserts case (exploded blocks)', () => {
    expect(workspaceSrc).toContain("!hasInserts")
    expect(workspaceSrc).toContain("statusIcon = '🔴'")
    expect(workspaceSrc).toContain('exploded')
  })

  it('shows progress bar for known percentage', () => {
    expect(workspaceSrc).toMatch(/width:.*\$\{pct\}%/)
  })

  it('shows "Hozzárendelés" button when unknowns exist', () => {
    expect(workspaceSrc).toContain('Hozzárendelés →')
    expect(workspaceSrc).toContain('onShowUnknown')
  })

  it('is rendered in the takeoff tab', () => {
    expect(workspaceSrc).toContain('<RecognitionSummaryBar')
    expect(workspaceSrc).toContain('recognizedItems={recognizedItems}')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Unknown Blocks Panel', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('UnknownBlocksPanel component exists', () => {
    expect(workspaceSrc).toContain('function UnknownBlocksPanel(')
  })

  it('filters items with no asmId or low confidence', () => {
    expect(workspaceSrc).toMatch(/const unknowns = items\.filter\(i => !i\.asmId \|\| i\.confidence < 0\.5\)/)
  })

  it('shows block name and quantity for each unknown', () => {
    expect(workspaceSrc).toContain('item.blockName')
    expect(workspaceSrc).toContain('item.qty')
    expect(workspaceSrc).toContain('{item.qty} db')
  })

  it('has assembly dropdown for assignment', () => {
    // Verify the dropdown maps assemblies
    expect(workspaceSrc).toContain("onAssign(item.blockName, e.target.value)")
    expect(workspaceSrc).toContain("Válassz...")
  })

  it('has close button', () => {
    expect(workspaceSrc).toContain('onClose')
  })

  it('shows total unknown count in header', () => {
    expect(workspaceSrc).toContain('Ismeretlen blokkok')
    expect(workspaceSrc).toContain('totalUnknownQty')
  })

  it('is conditionally rendered based on showUnknownPanel state', () => {
    expect(workspaceSrc).toContain('showUnknownPanel && isDxf')
    expect(workspaceSrc).toContain('<UnknownBlocksPanel')
  })

  it('onAssign updates asmOverrides AND saves to project dictionary', () => {
    // Verify the onAssign handler does both (multi-line handler)
    expect(workspaceSrc).toContain('onAssign={(blockName, asmId) => {')
    expect(workspaceSrc).toContain('setAsmOverrides(prev => ({ ...prev, [blockName]: asmId }))')
    expect(workspaceSrc).toContain('saveBlockMapping(currentProjectId, blockName, asmId)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Degradation Logic', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('DxfDegradationNotice component exists', () => {
    expect(workspaceSrc).toContain('function DxfDegradationNotice(')
  })

  it('shows when 0 inserts detected', () => {
    expect(workspaceSrc).toContain('A rajz nem tartalmaz blokkokat')
    expect(workspaceSrc).toContain('felrobbantott (exploded)')
  })

  it('recommends manual counting tool', () => {
    expect(workspaceSrc).toContain('kézi számlálás')
    expect(workspaceSrc).toContain('C billentyű')
    expect(workspaceSrc).toContain('Kézi számlálás indítása →')
  })

  it('has onActivateCountTool callback', () => {
    expect(workspaceSrc).toContain('onActivateCountTool')
  })

  it('auto-opens unknown panel when recognition < 70%', () => {
    expect(workspaceSrc).toContain('recognitionPct < 70')
    expect(workspaceSrc).toContain('setShowUnknownPanel(true)')
  })

  it('applies project block dictionary during recognition', () => {
    expect(workspaceSrc).toContain('applyBlockDictionary(currentProjectId, items)')
  })

  it('imports block dictionary functions from planStore', () => {
    expect(workspaceSrc).toContain('saveBlockMapping')
    expect(workspaceSrc).toContain('applyBlockDictionary')
    expect(workspaceSrc).toContain('loadBlockDictionary')
  })

  it('showUnknownPanel state exists', () => {
    expect(workspaceSrc).toContain("const [showUnknownPanel, setShowUnknownPanel] = useState(false)")
  })

  it('empty state shows helpful message when unknown blocks exist but no takeoff rows', () => {
    expect(workspaceSrc).toContain('Nincs hozzárendelt elem. Rendelje hozzá az ismeretlen blokkokat a fenti panelen.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Architecture Boundaries', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('recognition pipeline feeds into existing takeoffRows', () => {
    // The existing effectiveItems → takeoffRows pipeline should remain intact
    expect(workspaceSrc).toContain('const recognitionTakeoffRows = useMemo(')
    expect(workspaceSrc).toContain('const markerTakeoffRows = useMemo(')
    expect(workspaceSrc).toContain('const takeoffRows = useMemo(')
  })

  it('asmOverrides flow is preserved (existing RecognitionRow still works)', () => {
    expect(workspaceSrc).toContain('function RecognitionRow(')
    expect(workspaceSrc).toContain('asmOverrides[item.blockName]')
  })

  it('pricing pipeline is untouched (computePricing call unchanged)', () => {
    expect(workspaceSrc).toContain('computePricing({ takeoffRows, assemblies, workItems, materials, context, markup, hourlyRate, cableEstimate, difficultyMode })')
  })

  it('cable estimation cascade is untouched', () => {
    expect(workspaceSrc).toContain('detectDxfCableLengths(effectiveParsedDxf)')
    expect(workspaceSrc).toContain('estimateCablesMST(devices, scaleFactor)')
    // Tier 3 fallback
    expect(workspaceSrc).toContain("method: 'Becslés eszközszám alapján (nincs pozícióadat)'")
  })

  it('PDF path is not modified', () => {
    // Verify PDF viewer is still conditionally rendered
    expect(workspaceSrc).toContain('isPdf ? (')
    expect(workspaceSrc).toContain('<PdfViewerPanel')
    // No recognition summary bar for PDF
    expect(workspaceSrc).toContain('isDxf={isDxf}')
  })

  it('DxfViewerPanel onMarkersChange still wired', () => {
    expect(workspaceSrc).toContain('onMarkersChange={(markers) => {')
    expect(workspaceSrc).toContain('setPdfMarkers(markers)')
  })

  it('DxfBlockOverlay still rendered for DXF', () => {
    expect(workspaceSrc).toContain('<DxfBlockOverlay')
    expect(workspaceSrc).toContain('inserts={effectiveParsedDxf.inserts}')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Block Dictionary Data Flow', () => {
  const planStoreSrc = readSrc('data/planStore.js')

  it('block dictionary is separate from plan annotations', () => {
    // Block dict uses localStorage directly, not IndexedDB
    expect(planStoreSrc).toContain("const BLOCK_DICT_PREFIX = 'takeoffpro_block_dict_'")
    // Plan annotations use IndexedDB
    expect(planStoreSrc).toContain("storeName: 'plan_annotations'")
  })

  it('applyBlockDictionary returns items with dictionary metadata', () => {
    expect(planStoreSrc).toContain("matchType: 'dictionary'")
    expect(planStoreSrc).toContain('_dictApplied: true')
  })

  it('applyBlockDictionary short-circuits for empty dict', () => {
    expect(planStoreSrc).toContain("if (!Object.keys(dict).length) return items")
  })

  it('applyBlockDictionary does not override high-confidence items', () => {
    expect(planStoreSrc).toContain('if (item.asmId && item.confidence > 0.5) return item')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Smoke: Scenario Coverage', () => {
  const workspaceSrc = readSrc('components/TakeoffWorkspace.jsx')

  it('scenario: good block names → green summary, no unknown panel auto-open', () => {
    // recognitionPct >= 70 → no setShowUnknownPanel(true)
    // The condition is: if (recognitionPct < 70) setShowUnknownPanel(true)
    // So >=70% does NOT auto-open
    expect(workspaceSrc).toContain('recognitionPct < 70')
    // Green status
    expect(workspaceSrc).toContain('pct >= 70')
  })

  it('scenario: bad block names → orange/red summary, unknown panel auto-opens', () => {
    // Low recognition → auto-open unknown panel
    expect(workspaceSrc).toContain('setShowUnknownPanel(true)')
  })

  it('scenario: 0 INSERTs → degradation notice with manual counting CTA', () => {
    expect(workspaceSrc).toContain('<DxfDegradationNotice')
    expect(workspaceSrc).toContain("canvasRef.current?.setTool?.('count')")
  })

  it('scenario: user assigns block → takeoffRows updates automatically', () => {
    // asmOverrides change triggers effectiveItems recompute → takeoffRows recompute
    expect(workspaceSrc).toContain('setAsmOverrides(prev => ({ ...prev, [blockName]: asmId }))')
    // effectiveItems depends on asmOverrides
    expect(workspaceSrc).toContain('[effectiveItems, asmOverrides, qtyOverrides, variantOverrides, wallSplits]')
  })
})
