// ─── suggestAssemblies Tests ─────────────────────────────────────────────────
// Tests for the quick-pick suggestion engine that helps users classify
// unknown DXF blocks faster by showing scored assembly suggestions.
//
// Pure function — no DOM, no side effects, no localStorage.

import { describe, it, expect } from 'vitest'
import { suggestAssemblies } from '../utils/suggestAssemblies.js'

// ── Minimal assembly fixtures (mimic ASSEMBLIES_DEFAULT shape) ────────────────
const ASSEMBLIES = [
  { id: 'ASM-001', name: 'Dugalj 2P+F alap (komplett)', category: 'szerelvenyek', tags: ['dugalj', 'szerelvény', 'lakás', 'alap'] },
  { id: 'ASM-002', name: 'Kapcsoló 1G (komplett)', category: 'szerelvenyek', tags: ['kapcsoló', 'szerelvény', 'lakás'] },
  { id: 'ASM-003', name: 'Lámpatest mennyezeti (alap)', category: 'vilagitas', tags: ['lámpa', 'világítás', 'bekötés'] },
  { id: 'ASM-004', name: 'Dugalj IP44 (nedves helyiség)', category: 'szerelvenyek', variantOf: 'ASM-001', tags: ['dugalj', 'IP44', 'nedves'] },
  { id: 'ASM-013', name: 'Lámpatest süllyesztett', category: 'vilagitas', variantOf: 'ASM-003', tags: ['lámpa', 'downlight', 'süllyesztett'] },
  { id: 'ASM-017', name: 'Vészvilágítás', category: 'vilagitas', tags: ['vészvilágítás', 'biztonság'] },
  { id: 'ASM-018', name: 'Elosztó tábla 12M', category: 'elosztok', tags: ['elosztó', 'tábla', 'védelem'] },
  { id: 'ASM-023', name: 'Kábeltálca 100×60', category: 'kabeltalca', tags: ['kábeltálca', 'ipari', 'tálca'] },
  { id: 'ASM-026', name: 'Adataljzat RJ45', category: 'gyengaram', tags: ['adataljzat', 'RJ45', 'Cat6'] },
  { id: 'ASM-028', name: 'Füstérzékelő', category: 'gyengaram', tags: ['füstérzékelő', 'tűzvédelem'] },
  { id: 'ASM-041', name: 'WiFi AP felszerelés', category: 'gyengaram', tags: ['wifi', 'AP', 'hálózat', 'PoE'] },
  { id: 'ASM-043', name: 'Kamerarendszer pont', category: 'gyengaram', tags: ['kamera', 'CCTV', 'biztonság', 'PoE'] },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function ids(result) {
  return result.map(a => a.id)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('suggestAssemblies', () => {
  // ── Block name signals ─────────────────────────────────────────────────
  describe('block name signals', () => {
    it('DUGALJ in block name suggests ASM-001 (Dugalj)', () => {
      const result = suggestAssemblies('KAP_DUGALJ_2P', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-001')
      expect(result[0].id).toBe('ASM-001')  // should be top suggestion
    })

    it('LAMP in block name suggests ASM-003 (Lámpatest)', () => {
      const result = suggestAssemblies('LAMP_01', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-003')
      expect(result[0].id).toBe('ASM-003')
    })

    it('SWITCH in block name suggests ASM-002 (Kapcsoló)', () => {
      const result = suggestAssemblies('SWITCH_TYPE_A', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-002')
      expect(result[0].id).toBe('ASM-002')
    })

    it('PANEL in block name suggests ASM-018 (Elosztó)', () => {
      const result = suggestAssemblies('DB_PANEL_MAIN', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-018')
    })

    it('CAMERA in block name suggests ASM-043', () => {
      const result = suggestAssemblies('CAMERA_01', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-043')
    })
  })

  // ── Layer name signals ─────────────────────────────────────────────────
  describe('layer name signals', () => {
    it('layer E_SOCKET suggests ASM-001 (Dugalj)', () => {
      const evidence = { layer: 'E_SOCKET', nearbyText: [], attribs: null }
      const result = suggestAssemblies('BLK_001', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-001')
    })

    it('layer VILAGITAS suggests ASM-003 (Lámpatest)', () => {
      const evidence = { layer: 'VILAGITAS', nearbyText: [], attribs: null }
      const result = suggestAssemblies('BLOCK_X', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-003')
    })

    it('layer EL_LIGHT suggests ASM-003', () => {
      const evidence = { layer: 'EL_LIGHT_01', nearbyText: [], attribs: null }
      const result = suggestAssemblies('BLK_42', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-003')
    })

    it('DEFAULT layer does not influence scoring', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: [], attribs: null }
      const result = suggestAssemblies('X', evidence, ASSEMBLIES)
      // 'X' is too short (< 3 chars) and DEFAULT is skipped → no tokens
      expect(result).toEqual([])
    })
  })

  // ── Nearby text signals ────────────────────────────────────────────────
  describe('nearby text signals', () => {
    it('nearby text DUGALJ suggests ASM-001', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: ['DUGALJ', '2P'], attribs: null }
      const result = suggestAssemblies('OPAQUE_BLK_001', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-001')
    })

    it('nearby text LÁMPA suggests ASM-003', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: ['LÁMPA'], attribs: null }
      const result = suggestAssemblies('BLK_UNKNOWN', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-003')
    })
  })

  // ── ATTRIB signals ─────────────────────────────────────────────────────
  describe('ATTRIB signals', () => {
    it('ATTRIB TYPE=SOCKET suggests ASM-001', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: [], attribs: [{ tag: 'TYPE', value: 'SOCKET_2P' }] }
      const result = suggestAssemblies('BLK_REF_99', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-001')
    })

    it('ATTRIB DESC=KAPCSOLO suggests ASM-002', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: [], attribs: [{ tag: 'DESC', value: 'KAPCSOLO_1G' }] }
      const result = suggestAssemblies('REF_BLOCK', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-002')
    })
  })

  // ── Combined signals ───────────────────────────────────────────────────
  describe('combined signals', () => {
    it('block name + layer agree → same assembly ranked first', () => {
      const evidence = { layer: 'E_SOCKET_LAYER', nearbyText: [], attribs: null }
      const result = suggestAssemblies('KAP_DUGALJ_2P', evidence, ASSEMBLIES)
      expect(result[0].id).toBe('ASM-001')  // highest score from both signals
    })

    it('opaque block name + meaningful layer + nearby text → correct suggestion', () => {
      const evidence = { layer: 'EL_LIGHT', nearbyText: ['LÁMPA'], attribs: null }
      const result = suggestAssemblies('BLK_001', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-003')
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('null evidence returns suggestions from block name only', () => {
      const result = suggestAssemblies('DUGALJ_ALAP', null, ASSEMBLIES)
      expect(result.length).toBeGreaterThan(0)
      expect(ids(result)).toContain('ASM-001')
    })

    it('empty block name + no evidence returns empty', () => {
      const result = suggestAssemblies('', null, ASSEMBLIES)
      expect(result).toEqual([])
    })

    it('very short block name (< 3 chars) + no evidence returns empty', () => {
      const result = suggestAssemblies('AB', null, ASSEMBLIES)
      expect(result).toEqual([])
    })

    it('pure-digit block name is skipped (no suggestions)', () => {
      const result = suggestAssemblies('123456', null, ASSEMBLIES)
      expect(result).toEqual([])
    })

    it('skip tokens (2P, 16A, IP44) do not produce false matches', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: ['2P', '16A'], attribs: null }
      // Block name only has skip-worthy tokens
      const result = suggestAssemblies('2P_16A', evidence, ASSEMBLIES)
      expect(result).toEqual([])
    })

    it('returns max 3 results by default', () => {
      // DUGALJ matches multiple assemblies but should cap at 3
      const result = suggestAssemblies('DUGALJ_SWITCH_LAMP', null, ASSEMBLIES)
      expect(result.length).toBeLessThanOrEqual(3)
    })

    it('variants (variantOf) are excluded from results', () => {
      const result = suggestAssemblies('DUGALJ', null, ASSEMBLIES)
      const resultIds = ids(result)
      expect(resultIds).not.toContain('ASM-004')  // variant of ASM-001
      expect(resultIds).not.toContain('ASM-013')  // variant of ASM-003
    })

    it('empty assemblies list returns empty', () => {
      const result = suggestAssemblies('DUGALJ', null, [])
      expect(result).toEqual([])
    })
  })

  // ── Real-world scenarios ───────────────────────────────────────────────
  describe('real-world scenarios', () => {
    it('S1: opaque block on E_SOCKET layer → suggests Dugalj', () => {
      const evidence = { layer: 'E_SOCKET', nearbyText: [], attribs: null }
      const result = suggestAssemblies('BLK_REF_001', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-001')
    })

    it('S2: opaque block with ATTRIB TYPE=LIGHT → suggests Lámpatest', () => {
      const evidence = { layer: 'DEFAULT', nearbyText: [], attribs: [{ tag: 'TYPE', value: 'LIGHT_FIXTURE' }] }
      const result = suggestAssemblies('INSERT_42', evidence, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-003')
    })

    it('S3: KAP_DUGALJ_2P on E_DUGALJ layer with nearby text DUGALJ → strong match', () => {
      const evidence = { layer: 'E_DUGALJ', nearbyText: ['DUGALJ'], attribs: null }
      const result = suggestAssemblies('KAP_DUGALJ_2P', evidence, ASSEMBLIES)
      expect(result[0].id).toBe('ASM-001')
    })

    it('S4: CABLE_TRAY block → suggests Kábeltálca', () => {
      const result = suggestAssemblies('CABLE_TRAY_100', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-023')
    })

    it('S5: WIFI_AP block → suggests WiFi AP', () => {
      const result = suggestAssemblies('WIFI_AP_MOUNT', null, ASSEMBLIES)
      expect(ids(result)).toContain('ASM-041')
    })
  })
})
