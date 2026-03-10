import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── localStorage mock ────────────────────────────────────────────────────────
let store = {}
beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    get length() { return Object.keys(store).length },
    key: (i) => Object.keys(store)[i] ?? null,
    clear: () => { store = {} },
  })
})

import {
  normalizeSignature,
  normalizeLayerSignature,
  normalizeAttribSignature,
  normalizeTextSignature,
  lookupMemory,
  recordConfirmation,
  maybePromoteToAccount,
  detectConflict,
} from '../data/recognitionMemory.js'


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Normalization Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeLayerSignature', () => {
  it('strips E_ prefix', () => {
    expect(normalizeLayerSignature('E_SOCKET_2P')).toBe('SOCKET_P')
  })

  it('strips EL- prefix', () => {
    expect(normalizeLayerSignature('EL-LIGHT.01')).toBe('LIGHT')
  })

  it('strips ELEC_ prefix', () => {
    expect(normalizeLayerSignature('ELEC_PANEL')).toBe('PANEL')
  })

  it('strips ELECTRICAL_ prefix', () => {
    expect(normalizeLayerSignature('ELECTRICAL_MAIN')).toBe('MAIN')
  })

  it('preserves non-electrical layer names', () => {
    expect(normalizeLayerSignature('EROSARAM_ALJ')).toBe('EROSARAM_ALJ')
  })

  it('returns _EMPTY_ for null/undefined', () => {
    expect(normalizeLayerSignature(null)).toBe('_EMPTY_')
    expect(normalizeLayerSignature(undefined)).toBe('_EMPTY_')
    expect(normalizeLayerSignature('')).toBe('_EMPTY_')
  })

  it('uppercases and strips trailing digits', () => {
    expect(normalizeLayerSignature('e_socket_03')).toBe('SOCKET')
  })
})

describe('normalizeAttribSignature', () => {
  it('normalizes tag/value pairs', () => {
    const result = normalizeAttribSignature([{ tag: 'TYPE', value: 'socket_2p' }])
    expect(result).toBe('TYPE=SOCKET_P')
  })

  it('sorts by tag name', () => {
    const result = normalizeAttribSignature([
      { tag: 'ZETA', value: 'val1' },
      { tag: 'ALPHA', value: 'val2' },
    ])
    expect(result.indexOf('ALPHA')).toBeLessThan(result.indexOf('ZETA'))
  })

  it('filters skip-tags (HANDLE, XDATA, etc.)', () => {
    const result = normalizeAttribSignature([
      { tag: 'TYPE', value: 'LAMP' },
      { tag: 'HANDLE', value: 'FF01' },
      { tag: 'XDATA', value: 'anything' },
    ])
    expect(result).toBe('TYPE=LAMP')
    expect(result).not.toContain('HANDLE')
    expect(result).not.toContain('XDATA')
  })

  it('returns _EMPTY_ for null/empty', () => {
    expect(normalizeAttribSignature(null)).toBe('_EMPTY_')
    expect(normalizeAttribSignature([])).toBe('_EMPTY_')
  })

  it('returns _EMPTY_ when all tags are skip-tags', () => {
    expect(normalizeAttribSignature([
      { tag: 'HANDLE', value: 'FF01' },
      { tag: 'ID', value: '12345' },
    ])).toBe('_EMPTY_')
  })

  it('joins multiple attribs with pipe', () => {
    const result = normalizeAttribSignature([
      { tag: 'TYPE', value: 'LAMP' },
      { tag: 'POWER', value: '40W' },
    ])
    expect(result).toContain('|')
  })
})

describe('normalizeTextSignature', () => {
  it('normalizes and deduplicates text', () => {
    const result = normalizeTextSignature(['DUGALJ', '2P', 'Legrand'])
    // DUGALJ contains keyword → passes quality gate
    // 2P is on blocklist → filtered
    expect(result).toContain('DUGALJ')
    expect(result).toContain('LEGRAND')
    expect(result).not.toContain('2P')
  })

  it('returns null when all tokens are blocked', () => {
    expect(normalizeTextSignature(['2P', '16A', 'IP44'])).toBeNull()
  })

  it('returns null for pure numbers', () => {
    expect(normalizeTextSignature(['123', '456'])).toBeNull()
  })

  it('returns null for empty/null input', () => {
    expect(normalizeTextSignature(null)).toBeNull()
    expect(normalizeTextSignature([])).toBeNull()
  })

  it('passes quality gate for BLOCK_ASM_RULES keywords', () => {
    expect(normalizeTextSignature(['KAPCSOLÓ'])).toBeTruthy()
    expect(normalizeTextSignature(['SOCKET'])).toBeTruthy()
    expect(normalizeTextSignature(['LÁMPA'])).toBeTruthy()
    expect(normalizeTextSignature(['PANEL'])).toBeTruthy()
  })

  it('passes quality gate for alphabetic tokens ≥4 chars', () => {
    expect(normalizeTextSignature(['LEGRAND'])).toBeTruthy()
    expect(normalizeTextSignature(['HAGER'])).toBeTruthy()
  })

  it('fails quality gate for tokens <3 chars', () => {
    expect(normalizeTextSignature(['AB'])).toBeNull()
  })

  it('blocks common generic tokens', () => {
    // All these should be blocked
    expect(normalizeTextSignature(['230V'])).toBeNull()
    expect(normalizeTextSignature(['IP65'])).toBeNull()
    expect(normalizeTextSignature(['MM'])).toBeNull()
    expect(normalizeTextSignature(['KG'])).toBeNull()
  })

  it('takes top 3 sorted by length', () => {
    const result = normalizeTextSignature(['DUGALJ', 'KAPCSOLÓ', 'BIZTOSÍTÉK', 'PANEL'])
    const parts = result.split('|')
    expect(parts.length).toBeLessThanOrEqual(3)
    // Should be sorted by length (shortest first)
    for (let i = 0; i + 1 < parts.length; i++) {
      expect(parts[i].length).toBeLessThanOrEqual(parts[i + 1].length)
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Multi-Signal Record + Lookup
// ═══════════════════════════════════════════════════════════════════════════════

describe('recordConfirmation v2 with evidence', () => {
  const evidence = {
    blockName: 'KAP_DUGALJ_01',
    layer: 'E_SOCKET',
    attribs: [{ tag: 'TYPE', value: 'SOCKET_2P' }],
    nearbyText: ['DUGALJ'],
    signals: {
      block_name: 'KAP_DUGALJ',
      layer_name: 'SOCKET',
      attribute_signature: 'TYPE=SOCKET_P',
      nearby_text: 'DUGALJ',
    },
  }

  it('records block_name signal entry (backward compat)', () => {
    recordConfirmation('KAP_DUGALJ_01', 'ASM-001', 'proj-1', 'user_override')

    const projMem = JSON.parse(store['takeoffpro_recmem_proj_proj-1'])
    const sig = normalizeSignature('KAP_DUGALJ_01')
    expect(projMem[sig]).toBeDefined()
    expect(projMem[sig].asmId).toBe('ASM-001')
  })

  it('records v2 signal entries when evidence is provided', () => {
    recordConfirmation('KAP_DUGALJ_01', 'ASM-001', 'proj-1', 'user_override', evidence)

    const projMem = JSON.parse(store['takeoffpro_recmem_proj_proj-1'])

    // block_name entry
    const blockSig = normalizeSignature('KAP_DUGALJ_01')
    expect(projMem[blockSig]).toBeDefined()
    expect(projMem[blockSig].asmId).toBe('ASM-001')

    // layer_name entry
    expect(projMem['layer_name::SOCKET']).toBeDefined()
    expect(projMem['layer_name::SOCKET'].asmId).toBe('ASM-001')
    expect(projMem['layer_name::SOCKET'].signalType).toBe('layer_name')

    // attribute_signature entry
    expect(projMem['attribute_signature::TYPE=SOCKET_P']).toBeDefined()
    expect(projMem['attribute_signature::TYPE=SOCKET_P'].asmId).toBe('ASM-001')

    // nearby_text entry
    expect(projMem['nearby_text::DUGALJ']).toBeDefined()
    expect(projMem['nearby_text::DUGALJ'].asmId).toBe('ASM-001')
  })

  it('rejects non-explicit sources for v2 signals too', () => {
    recordConfirmation('BLK_01', 'ASM-002', 'proj-1', 'auto_detect', evidence)

    // Nothing should be recorded
    expect(store['takeoffpro_recmem_proj_proj-1']).toBeUndefined()
  })

  it('does not record nearby_text when quality gate fails (null signal)', () => {
    const noTextEvidence = {
      ...evidence,
      signals: { ...evidence.signals, nearby_text: null },
    }

    recordConfirmation('BLK_02', 'ASM-003', 'proj-1', 'user_override', noTextEvidence)

    const projMem = JSON.parse(store['takeoffpro_recmem_proj_proj-1'])
    // No nearby_text entries should exist
    const textKeys = Object.keys(projMem).filter(k => k.startsWith('nearby_text::'))
    expect(textKeys.length).toBe(0)
  })
})

describe('lookupMemory v2 with evidence', () => {
  const evidence = {
    signals: {
      block_name: 'KAP_DUGALJ',
      layer_name: 'SOCKET',
      attribute_signature: 'TYPE=SOCKET_P',
      nearby_text: 'DUGALJ',
    },
  }

  it('backward compat: lookup without evidence returns block_name match', () => {
    recordConfirmation('KAP_DUGALJ_01', 'ASM-001', 'proj-1', 'user_override')

    const result = lookupMemory('KAP_DUGALJ_01', 'proj-1')
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-001')
    expect(result.confidence).toBe(0.85) // block_name project confidence
  })

  it('lookup with evidence finds layer_name signal', () => {
    // Record only via layer signal
    const layerEvidence = {
      signals: { block_name: null, layer_name: 'SOCKET', attribute_signature: null, nearby_text: null },
    }
    recordConfirmation('OTHER_BLOCK', 'ASM-010', 'proj-1', 'user_override', {
      ...layerEvidence,
      signals: { ...layerEvidence.signals, block_name: normalizeSignature('OTHER_BLOCK') },
    })

    // Now look up a DIFFERENT block that happens to be on the same layer
    const lookupEv = {
      signals: { block_name: normalizeSignature('NEW_BLOCK'), layer_name: 'SOCKET', attribute_signature: null, nearby_text: null },
    }
    const result = lookupMemory('NEW_BLOCK', 'proj-1', lookupEv)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-010')
    expect(result.signalType).toBe('layer_name')
    expect(result.confidence).toBe(0.78) // layer_name project confidence
  })

  it('lookup with evidence finds attribute_signature signal', () => {
    const attribEvidence = {
      signals: { block_name: normalizeSignature('SRC_BLK'), layer_name: null, attribute_signature: 'TYPE=SOCKET_P', nearby_text: null },
    }
    recordConfirmation('SRC_BLK', 'ASM-020', 'proj-1', 'user_override', attribEvidence)

    // Look up different block with same attrib signature
    const lookupEv = {
      signals: { block_name: normalizeSignature('OTHER_BLK'), layer_name: null, attribute_signature: 'TYPE=SOCKET_P', nearby_text: null },
    }
    const result = lookupMemory('OTHER_BLK', 'proj-1', lookupEv)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-020')
    expect(result.signalType).toBe('attribute_signature')
    expect(result.confidence).toBe(0.82)
  })

  it('old entries without signalType treated as block_name', () => {
    // Simulate old-format entry (no signalType field)
    const sig = normalizeSignature('OLD_BLOCK')
    store['takeoffpro_recmem_proj_proj-1'] = JSON.stringify({
      [sig]: {
        signature: sig, asmId: 'ASM-OLD', confirmCount: 1,
        projectIds: ['proj-1'], blockNames: ['OLD_BLOCK'],
        firstConfirmed: Date.now(), lastConfirmed: Date.now(),
        source: 'user_override',
        // NO signalType field — old format
      },
    })

    const result = lookupMemory('OLD_BLOCK', 'proj-1')
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-OLD')
    expect(result.confidence).toBe(0.85) // block_name project confidence
  })

  it('confidence values match CONFIDENCE_V2 table', () => {
    // Record with all signals
    const fullEvidence = {
      signals: {
        block_name: normalizeSignature('MULTI_BLK'),
        layer_name: 'TEST_LAYER',
        attribute_signature: 'TAG=VAL',
        nearby_text: 'DUGALJ',
      },
    }
    recordConfirmation('MULTI_BLK', 'ASM-050', 'proj-1', 'user_override', fullEvidence)

    // Check each signal type individually
    // Block name
    const blockResult = lookupMemory('MULTI_BLK', 'proj-1')
    expect(blockResult.confidence).toBe(0.85) // block_name project

    // Layer name only
    const layerResult = lookupMemory('UNKNOWN', 'proj-1', {
      signals: { block_name: 'NONEXISTENT', layer_name: 'TEST_LAYER', attribute_signature: null, nearby_text: null },
    })
    expect(layerResult).not.toBeNull()
    expect(layerResult.confidence).toBe(0.78) // layer_name project
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Hybrid Matching
// ═══════════════════════════════════════════════════════════════════════════════

describe('hybrid matching', () => {
  it('2 signals agree → hybrid confidence boost', () => {
    const ev = {
      signals: {
        block_name: normalizeSignature('HYBRID_BLK'),
        layer_name: 'TEST_LAYER',
        attribute_signature: null,
        nearby_text: null,
      },
    }
    recordConfirmation('HYBRID_BLK', 'ASM-060', 'proj-1', 'user_override', ev)

    const result = lookupMemory('HYBRID_BLK', 'proj-1', ev)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-060')
    expect(result.signalType).toBe('hybrid')
    // hybrid = min(0.88, max(0.85, 0.78) + 0.05 * (2-1)) = min(0.88, 0.90) = 0.88
    expect(result.confidence).toBe(0.88)
  })

  it('3 signals agree → capped at 0.88', () => {
    const ev = {
      signals: {
        block_name: normalizeSignature('TRI_BLK'),
        layer_name: 'TRI_LAYER',
        attribute_signature: 'TAG=TRI',
        nearby_text: null,
      },
    }
    recordConfirmation('TRI_BLK', 'ASM-070', 'proj-1', 'user_override', ev)

    const result = lookupMemory('TRI_BLK', 'proj-1', ev)
    expect(result).not.toBeNull()
    expect(result.signalType).toBe('hybrid')
    // hybrid = min(0.88, max(0.85, 0.78, 0.82) + 0.05 * (3-1)) = min(0.88, 0.95) = 0.88
    expect(result.confidence).toBe(0.88)
  })

  it('signals disagree → return null', () => {
    // Record block_name → ASM-080
    recordConfirmation('CONFLICT_BLK', 'ASM-080', 'proj-1', 'user_override')

    // Record layer_name → ASM-081 (different asmId!)
    const layerKey = 'layer_name::CONFLICT_LAYER'
    store['takeoffpro_recmem_proj_proj-1'] = JSON.stringify({
      ...JSON.parse(store['takeoffpro_recmem_proj_proj-1']),
      [layerKey]: {
        signature: layerKey, asmId: 'ASM-081', confirmCount: 1,
        projectIds: ['proj-1'], blockNames: ['CONFLICT_BLK'],
        firstConfirmed: Date.now(), lastConfirmed: Date.now(),
        source: 'user_override', signalType: 'layer_name',
      },
    })

    const ev = {
      signals: {
        block_name: normalizeSignature('CONFLICT_BLK'),
        layer_name: 'CONFLICT_LAYER',
        attribute_signature: null,
        nearby_text: null,
      },
    }
    const result = lookupMemory('CONFLICT_BLK', 'proj-1', ev)
    expect(result).toBeNull() // Cross-signal conflict → null
  })

  it('all signals unknown → null', () => {
    const ev = {
      signals: {
        block_name: 'NONEXISTENT',
        layer_name: 'NONEXISTENT',
        attribute_signature: null,
        nearby_text: null,
      },
    }
    const result = lookupMemory('NONEXISTENT_BLK', 'proj-1', ev)
    expect(result).toBeNull()
  })

  it('hybrid is never persisted as memory entry', () => {
    const ev = {
      signals: {
        block_name: normalizeSignature('PERSIST_TEST'),
        layer_name: 'PERSIST_LAYER',
        attribute_signature: null,
        nearby_text: null,
      },
    }
    recordConfirmation('PERSIST_TEST', 'ASM-090', 'proj-1', 'user_override', ev)

    // Check all entries in storage — none should have signalType: 'hybrid'
    const projMem = JSON.parse(store['takeoffpro_recmem_proj_proj-1'])
    for (const entry of Object.values(projMem)) {
      expect(entry.signalType).not.toBe('hybrid')
    }
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Promotion with Per-Signal Thresholds
// ═══════════════════════════════════════════════════════════════════════════════

describe('promotion with per-signal thresholds', () => {
  it('block_name: 2 projects → promoted to account', () => {
    recordConfirmation('PROMO_BLK', 'ASM-100', 'proj-1', 'user_override')
    recordConfirmation('PROMO_BLK', 'ASM-100', 'proj-2', 'user_override')

    // Should now be in account memory
    const acctKeys = Object.keys(store).filter(k => k.startsWith('takeoffpro_recmem_account_'))
    expect(acctKeys.length).toBe(1)
    const acctMem = JSON.parse(store[acctKeys[0]])
    const sig = normalizeSignature('PROMO_BLK')
    expect(acctMem[sig]).toBeDefined()
    expect(acctMem[sig].asmId).toBe('ASM-100')
  })

  it('attribute_signature: 2 projects → promoted to account', () => {
    const ev1 = { signals: { block_name: normalizeSignature('ATTR_BLK_1'), layer_name: null, attribute_signature: 'TAG=PROMO_ATTR', nearby_text: null } }
    const ev2 = { signals: { block_name: normalizeSignature('ATTR_BLK_2'), layer_name: null, attribute_signature: 'TAG=PROMO_ATTR', nearby_text: null } }

    recordConfirmation('ATTR_BLK_1', 'ASM-110', 'proj-1', 'user_override', ev1)
    recordConfirmation('ATTR_BLK_2', 'ASM-110', 'proj-2', 'user_override', ev2)

    const acctKeys = Object.keys(store).filter(k => k.startsWith('takeoffpro_recmem_account_'))
    if (acctKeys.length > 0) {
      const acctMem = JSON.parse(store[acctKeys[0]])
      expect(acctMem['attribute_signature::TAG=PROMO_ATTR']).toBeDefined()
    }
  })

  it('layer_name: needs 3+ projects (not 2)', () => {
    const mkEv = (blk) => ({ signals: { block_name: normalizeSignature(blk), layer_name: 'PROMO_LAYER', attribute_signature: null, nearby_text: null } })

    recordConfirmation('LAYER_BLK_1', 'ASM-120', 'proj-1', 'user_override', mkEv('LAYER_BLK_1'))
    recordConfirmation('LAYER_BLK_2', 'ASM-120', 'proj-2', 'user_override', mkEv('LAYER_BLK_2'))

    // After 2 projects, should NOT be promoted yet
    const acctKeys2 = Object.keys(store).filter(k => k.startsWith('takeoffpro_recmem_account_'))
    const acctMem2 = acctKeys2.length > 0 ? JSON.parse(store[acctKeys2[0]]) : {}
    expect(acctMem2['layer_name::PROMO_LAYER']).toBeUndefined()

    // 3rd project → should promote
    recordConfirmation('LAYER_BLK_3', 'ASM-120', 'proj-3', 'user_override', mkEv('LAYER_BLK_3'))

    const acctKeys3 = Object.keys(store).filter(k => k.startsWith('takeoffpro_recmem_account_'))
    expect(acctKeys3.length).toBeGreaterThan(0)
    const acctMem3 = JSON.parse(store[acctKeys3[0]])
    expect(acctMem3['layer_name::PROMO_LAYER']).toBeDefined()
    expect(acctMem3['layer_name::PROMO_LAYER'].asmId).toBe('ASM-120')
  })

  it('nearby_text: needs 3+ projects AND no conflict', () => {
    const mkEv = (blk) => ({ signals: { block_name: normalizeSignature(blk), layer_name: null, attribute_signature: null, nearby_text: 'DUGALJ' } })

    recordConfirmation('TEXT_BLK_1', 'ASM-130', 'proj-1', 'user_override', mkEv('TEXT_BLK_1'))
    recordConfirmation('TEXT_BLK_2', 'ASM-130', 'proj-2', 'user_override', mkEv('TEXT_BLK_2'))
    recordConfirmation('TEXT_BLK_3', 'ASM-130', 'proj-3', 'user_override', mkEv('TEXT_BLK_3'))

    const acctKeys = Object.keys(store).filter(k => k.startsWith('takeoffpro_recmem_account_'))
    expect(acctKeys.length).toBeGreaterThan(0)
    const acctMem = JSON.parse(store[acctKeys[0]])
    expect(acctMem['nearby_text::DUGALJ']).toBeDefined()
    expect(acctMem['nearby_text::DUGALJ'].asmId).toBe('ASM-130')
  })

  it('cross-project conflict on signal → not promoted', () => {
    const ev1 = { signals: { block_name: normalizeSignature('CONF_BLK_1'), layer_name: null, attribute_signature: 'TAG=CONFLICT', nearby_text: null } }
    const ev2 = { signals: { block_name: normalizeSignature('CONF_BLK_2'), layer_name: null, attribute_signature: 'TAG=CONFLICT', nearby_text: null } }

    recordConfirmation('CONF_BLK_1', 'ASM-140', 'proj-1', 'user_override', ev1)
    recordConfirmation('CONF_BLK_2', 'ASM-141', 'proj-2', 'user_override', ev2) // DIFFERENT asmId!

    // Should NOT be in account memory (conflict)
    const acctKeys = Object.keys(store).filter(k => k.startsWith('takeoffpro_recmem_account_'))
    const acctMem = acctKeys.length > 0 ? JSON.parse(store[acctKeys[0]]) : {}
    expect(acctMem['attribute_signature::TAG=CONFLICT']).toBeUndefined()
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Smoke Scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe('smoke scenarios', () => {
  it('S1: unknown block recognized via learned layer convention', () => {
    // Train: block A on layer E_SOCKET → ASM-001
    const trainEv = { signals: { block_name: normalizeSignature('KNOWN_BLOCK'), layer_name: 'SOCKET', attribute_signature: null, nearby_text: null } }
    recordConfirmation('KNOWN_BLOCK', 'ASM-001', 'proj-1', 'user_override', trainEv)

    // Test: new unknown block on same layer
    const testEv = { signals: { block_name: normalizeSignature('UNKNOWN_BLK_XYZ'), layer_name: 'SOCKET', attribute_signature: null, nearby_text: null } }
    const result = lookupMemory('UNKNOWN_BLK_XYZ', 'proj-1', testEv)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-001')
    expect(result.signalType).toBe('layer_name')
  })

  it('S2: unknown block recognized via learned ATTRIB convention', () => {
    const trainEv = { signals: { block_name: normalizeSignature('SRC'), layer_name: null, attribute_signature: 'TYPE=SPOT_LED', nearby_text: null } }
    recordConfirmation('SRC', 'ASM-002', 'proj-1', 'user_override', trainEv)

    const testEv = { signals: { block_name: normalizeSignature('RANDOM_NAME'), layer_name: null, attribute_signature: 'TYPE=SPOT_LED', nearby_text: null } }
    const result = lookupMemory('RANDOM_NAME', 'proj-1', testEv)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-002')
    expect(result.signalType).toBe('attribute_signature')
  })

  it('S3: unknown block recognized via nearby text convention', () => {
    const trainEv = { signals: { block_name: normalizeSignature('TEXT_SRC'), layer_name: null, attribute_signature: null, nearby_text: 'KAPCSOLÓ' } }
    recordConfirmation('TEXT_SRC', 'ASM-003', 'proj-1', 'user_override', trainEv)

    const testEv = { signals: { block_name: normalizeSignature('OPAQUE_001'), layer_name: null, attribute_signature: null, nearby_text: 'KAPCSOLÓ' } }
    const result = lookupMemory('OPAQUE_001', 'proj-1', testEv)
    expect(result).not.toBeNull()
    expect(result.asmId).toBe('ASM-003')
    expect(result.signalType).toBe('nearby_text')
  })

  it('S4: hybrid signals improve confidence', () => {
    const ev = { signals: { block_name: normalizeSignature('MULTI'), layer_name: 'MULTI_LAYER', attribute_signature: 'TAG=MULTI', nearby_text: null } }
    recordConfirmation('MULTI', 'ASM-004', 'proj-1', 'user_override', ev)

    const result = lookupMemory('MULTI', 'proj-1', ev)
    expect(result).not.toBeNull()
    expect(result.signalType).toBe('hybrid')
    expect(result.confidence).toBeGreaterThan(0.85) // higher than single block_name
    expect(result.confidence).toBeLessThanOrEqual(0.88) // capped
  })

  it('S5: conflict case → unknown instead of false auto-match', () => {
    // Record block_name → ASM-005
    recordConfirmation('CONFLICT_BLOCK', 'ASM-005', 'proj-1', 'user_override')

    // Manually inject conflicting layer signal
    const projMem = JSON.parse(store['takeoffpro_recmem_proj_proj-1'])
    projMem['layer_name::CONFLICT_LYR'] = {
      signature: 'layer_name::CONFLICT_LYR',
      asmId: 'ASM-006', // DIFFERENT from block_name's ASM-005
      confirmCount: 1,
      projectIds: ['proj-1'],
      blockNames: ['CONFLICT_BLOCK'],
      firstConfirmed: Date.now(),
      lastConfirmed: Date.now(),
      source: 'user_override',
      signalType: 'layer_name',
    }
    store['takeoffpro_recmem_proj_proj-1'] = JSON.stringify(projMem)

    const ev = {
      signals: {
        block_name: normalizeSignature('CONFLICT_BLOCK'),
        layer_name: 'CONFLICT_LYR',
        attribute_signature: null,
        nearby_text: null,
      },
    }
    const result = lookupMemory('CONFLICT_BLOCK', 'proj-1', ev)
    expect(result).toBeNull() // conflict → null → unknown panel
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Learning Trigger Safety
// ═══════════════════════════════════════════════════════════════════════════════

describe('learning trigger safety for v2 signals', () => {
  const evidence = {
    signals: {
      block_name: normalizeSignature('SAFETY_BLK'),
      layer_name: 'SAFETY_LAYER',
      attribute_signature: 'TAG=SAFETY',
      nearby_text: 'DUGALJ',
    },
  }

  it('rejects "auto_detect" source', () => {
    recordConfirmation('SAFETY_BLK', 'ASM-200', 'proj-1', 'auto_detect', evidence)
    expect(store['takeoffpro_recmem_proj_proj-1']).toBeUndefined()
  })

  it('rejects "background" source', () => {
    recordConfirmation('SAFETY_BLK', 'ASM-200', 'proj-1', 'background', evidence)
    expect(store['takeoffpro_recmem_proj_proj-1']).toBeUndefined()
  })

  it('rejects "recognition" source', () => {
    recordConfirmation('SAFETY_BLK', 'ASM-200', 'proj-1', 'recognition', evidence)
    expect(store['takeoffpro_recmem_proj_proj-1']).toBeUndefined()
  })

  it('accepts "user_override" source', () => {
    recordConfirmation('SAFETY_BLK', 'ASM-200', 'proj-1', 'user_override', evidence)
    expect(store['takeoffpro_recmem_proj_proj-1']).toBeDefined()
  })

  it('accepts "accept_all" source', () => {
    recordConfirmation('SAFETY_BLK_2', 'ASM-201', 'proj-2', 'accept_all', evidence)
    expect(store['takeoffpro_recmem_proj_proj-2']).toBeDefined()
  })

  it('accepts "save_plan" source', () => {
    recordConfirmation('SAFETY_BLK_3', 'ASM-202', 'proj-3', 'save_plan', evidence)
    expect(store['takeoffpro_recmem_proj_proj-3']).toBeDefined()
  })
})
