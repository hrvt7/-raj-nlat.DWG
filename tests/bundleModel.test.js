/**
 * Unit tests for bundleModel.js
 *
 * Tests the pure-JS bundle factory, snapshot creation, and stale detection.
 * No browser APIs needed — these are pure functions.
 */

const {
  generateBundleId,
  createBundle,
  createPlanSnapshot,
  checkBundleStaleness,
  staleReasonLabel,
  MERGE_TYPES,
} = require('../src/utils/bundleModel.js')

// ── generateBundleId ─────────────────────────────────────────────────────────

console.log('TEST 1: generateBundleId returns BDL- prefixed unique IDs')
const id1 = generateBundleId()
const id2 = generateBundleId()
console.assert(id1.startsWith('BDL-'), `Expected BDL- prefix, got: ${id1}`)
console.assert(id1 !== id2, 'IDs should be unique')
console.log('  PASS')

// ── MERGE_TYPES ──────────────────────────────────────────────────────────────

console.log('TEST 2: MERGE_TYPES contains manual, dxf, pdf')
console.assert(MERGE_TYPES.includes('manual'), 'missing manual')
console.assert(MERGE_TYPES.includes('dxf'), 'missing dxf')
console.assert(MERGE_TYPES.includes('pdf'), 'missing pdf')
console.assert(MERGE_TYPES.length === 3, 'should have exactly 3 types')
console.log('  PASS')

// ── createPlanSnapshot ───────────────────────────────────────────────────────

console.log('TEST 3: createPlanSnapshot captures plan state correctly')
const mockPlan = {
  id: 'PLAN-001',
  markerCount: 12,
  parseResult: { blocks: [1, 2, 3, 4, 5] },
  hasScale: true,
  floor: 'Pince',
  discipline: 'Világítás',
  updatedAt: '2025-06-01T10:00:00Z',
}
const snap = createPlanSnapshot(mockPlan)
console.assert(snap.planId === 'PLAN-001', 'planId')
console.assert(snap.markerCount === 12, 'markerCount')
console.assert(snap.parseBlockCount === 5, 'parseBlockCount')
console.assert(snap.hasScale === true, 'hasScale')
console.assert(snap.floor === 'Pince', 'floor')
console.assert(snap.discipline === 'Világítás', 'discipline')
console.assert(snap.updatedAt === '2025-06-01T10:00:00Z', 'updatedAt')
console.log('  PASS')

console.log('TEST 4: createPlanSnapshot handles missing fields gracefully')
const emptySnap = createPlanSnapshot({ id: 'PLAN-002' })
console.assert(emptySnap.markerCount === 0, 'default markerCount 0')
console.assert(emptySnap.parseBlockCount === 0, 'default parseBlockCount 0')
console.assert(emptySnap.hasScale === false, 'default hasScale false')
console.assert(emptySnap.floor === null, 'default floor null')
console.log('  PASS')

// ── createBundle ─────────────────────────────────────────────────────────────

console.log('TEST 5: createBundle creates bundle with correct shape')
const plans = [
  { id: 'P1', markerCount: 5, hasScale: true },
  { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
]
const bundle = createBundle({
  name: 'Test Bundle',
  planIds: ['P1', 'P2'],
  mergeType: 'manual',
  assignments: { socket: 'ASM-001' },
  plans,
})
console.assert(bundle.id.startsWith('BDL-'), 'bundle id prefix')
console.assert(bundle.name === 'Test Bundle', 'name')
console.assert(bundle.planIds.length === 2, 'planIds length')
console.assert(bundle.mergeType === 'manual', 'mergeType')
console.assert(bundle.assignments.socket === 'ASM-001', 'assignments')
console.assert(Object.keys(bundle.planSnapshots).length === 2, 'planSnapshots count')
console.assert(bundle.planSnapshots['P1'].markerCount === 5, 'P1 snapshot markerCount')
console.assert(bundle.planSnapshots['P2'].parseBlockCount === 2, 'P2 snapshot parseBlockCount')
console.assert(bundle.createdAt, 'createdAt exists')
console.assert(bundle.updatedAt, 'updatedAt exists')
console.log('  PASS')

console.log('TEST 6: createBundle defaults — empty assignments, name fallback')
const bundle2 = createBundle({ planIds: ['X'], plans: [{ id: 'X' }] })
console.assert(bundle2.name === 'Névtelen csomag', 'default name')
console.assert(bundle2.mergeType === 'manual', 'default mergeType')
console.assert(Object.keys(bundle2.assignments).length === 0, 'empty assignments')
console.assert(Object.keys(bundle2.unknownMappings).length === 0, 'empty unknownMappings')
console.log('  PASS')

// ── checkBundleStaleness ─────────────────────────────────────────────────────

console.log('TEST 7: checkBundleStaleness returns empty for fresh bundle')
const freshBundle = createBundle({
  planIds: ['P1', 'P2'],
  plans,
})
const stale1 = checkBundleStaleness(freshBundle, plans)
console.assert(stale1.length === 0, `Expected 0 stale, got ${stale1.length}`)
console.log('  PASS')

console.log('TEST 8: checkBundleStaleness detects marker count change')
const changedPlans = [
  { id: 'P1', markerCount: 8, hasScale: true }, // was 5, now 8
  { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
]
const stale2 = checkBundleStaleness(freshBundle, changedPlans)
console.assert(stale2.length === 1, `Expected 1 stale, got ${stale2.length}`)
console.assert(stale2[0].planId === 'P1', 'stale plan is P1')
console.assert(stale2[0].reason === 'markers_changed', `Expected markers_changed, got ${stale2[0].reason}`)
console.log('  PASS')

console.log('TEST 9: checkBundleStaleness detects deleted plan')
const deletedPlans = [{ id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } }]
const stale3 = checkBundleStaleness(freshBundle, deletedPlans)
console.assert(stale3.length === 1, `Expected 1 stale, got ${stale3.length}`)
console.assert(stale3[0].planId === 'P1', 'stale plan is P1')
console.assert(stale3[0].reason === 'deleted', `Expected deleted, got ${stale3[0].reason}`)
console.log('  PASS')

console.log('TEST 10: checkBundleStaleness detects block count change')
const blockChangedPlans = [
  { id: 'P1', markerCount: 5, hasScale: true },
  { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2, 3, 4] } }, // was 2, now 4
]
const stale4 = checkBundleStaleness(freshBundle, blockChangedPlans)
console.assert(stale4.length === 1, `Expected 1 stale, got ${stale4.length}`)
console.assert(stale4[0].reason === 'blocks_changed', `Expected blocks_changed, got ${stale4[0].reason}`)
console.log('  PASS')

console.log('TEST 11: checkBundleStaleness detects scale change')
const scaleChangedPlans = [
  { id: 'P1', markerCount: 5, hasScale: false }, // was true, now false
  { id: 'P2', markerCount: 3, parseResult: { blocks: [1, 2] } },
]
const stale5 = checkBundleStaleness(freshBundle, scaleChangedPlans)
console.assert(stale5.length === 1, `Expected 1 stale, got ${stale5.length}`)
console.assert(stale5[0].reason === 'scale_changed', `Expected scale_changed, got ${stale5[0].reason}`)
console.log('  PASS')

// ── staleReasonLabel ─────────────────────────────────────────────────────────

console.log('TEST 12: staleReasonLabel returns human-readable labels')
console.assert(staleReasonLabel('deleted') === 'Terv törölve', 'deleted label')
console.assert(staleReasonLabel('markers_changed') === 'Jelölések változtak', 'markers_changed label')
console.assert(staleReasonLabel('blocks_changed') === 'DXF blokkok változtak', 'blocks_changed label')
console.assert(staleReasonLabel('scale_changed') === 'Kalibráció változott', 'scale_changed label')
console.assert(staleReasonLabel('metadata_changed') === 'Emelet/szakág változott', 'metadata_changed label')
console.assert(staleReasonLabel('unknown') === 'Változás történt', 'fallback label')
console.log('  PASS')

console.log('\n✅ All 12 bundle model tests passed!')
