import { describe, it, expect } from 'vitest'
import { normalizeBlockName, ASSEMBLY_TYPES } from '../data/symbolDictionary.js'

// ── Helper: pass empty overrides array to avoid localStorage dependency ──────
const norm = name => normalizeBlockName(name, [])

// ─── Return shape ────────────────────────────────────────────────────────────

describe('normalizeBlockName return shape', () => {
  it('returns { assemblyType, confidence, source, label }', () => {
    const result = norm('SOCKET_1')
    expect(result).toHaveProperty('assemblyType')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('source')
    expect(result).toHaveProperty('label')
  })
})

// ─── Regex matching ──────────────────────────────────────────────────────────

describe('normalizeBlockName regex matching', () => {
  // Világítás
  it('matches E-WL prefix as CEILING_LIGHT', () => {
    expect(norm('E-WL-01').assemblyType).toBe('CEILING_LIGHT')
  })

  it('matches VIL prefix as CEILING_LIGHT', () => {
    expect(norm('VIL_MENNYEZETI').assemblyType).toBe('CEILING_LIGHT')
  })

  it('matches EMERGENCY as EMERGENCY_LIGHT', () => {
    expect(norm('EMERGENCY_EXIT_01').assemblyType).toBe('EMERGENCY_LIGHT')
  })

  it('matches LED_PANEL variant', () => {
    expect(norm('LED_PANEL_60X60').assemblyType).toBe('LED_PANEL')
  })

  it('matches DOWNLIGHT', () => {
    expect(norm('DL-ROUND-01').assemblyType).toBe('DOWNLIGHT')
  })

  it('matches WALL_LIGHT', () => {
    expect(norm('WALL_LIGHT_01').assemblyType).toBe('WALL_LIGHT')
  })

  it('matches generic LIGHT as CEILING_LIGHT', () => {
    expect(norm('LIGHT_FIXTURE_A').assemblyType).toBe('CEILING_LIGHT')
  })

  // Dugaljak — specifikusság
  it('matches SOCKET_FLOOR before generic SOCKET', () => {
    expect(norm('SOCKET_FLOOR_1').assemblyType).toBe('SOCKET_FLOOR')
  })

  it('matches SOCKET_DOUBLE before generic SOCKET', () => {
    expect(norm('SOCKET_DOUBLE_2G').assemblyType).toBe('SOCKET_DOUBLE')
  })

  it('matches IP44 as SOCKET_IP44', () => {
    expect(norm('IP44_DUGALJ').assemblyType).toBe('SOCKET_IP44')
  })

  it('matches CEE as CEE_OUTLET', () => {
    expect(norm('CEE_32A').assemblyType).toBe('CEE_OUTLET')
  })

  it('matches E-SO prefix as SOCKET', () => {
    expect(norm('E-SO-2PF').assemblyType).toBe('SOCKET')
  })

  it('matches generic SOCKET', () => {
    expect(norm('SOCKET_2P_F').assemblyType).toBe('SOCKET')
  })

  it('matches magyar dugalj', () => {
    expect(norm('DUGALJ_01').assemblyType).toBe('SOCKET')
  })

  // Kapcsolók
  it('matches DIMMER', () => {
    expect(norm('DIMMER_LED_01').assemblyType).toBe('SWITCH_DIMMER')
  })

  it('matches VALTO as SWITCH_ALTER', () => {
    expect(norm('VALTOKAPCSOLO').assemblyType).toBe('SWITCH_ALTER')
  })

  it('matches CSILLAR as SWITCH_DOUBLE', () => {
    expect(norm('CSILLARKAPCSOLO').assemblyType).toBe('SWITCH_DOUBLE')
  })

  it('matches E-SW prefix as SWITCH', () => {
    expect(norm('E-SW-01').assemblyType).toBe('SWITCH')
  })

  it('matches generic SWITCH', () => {
    expect(norm('SWITCH_1GANG').assemblyType).toBe('SWITCH')
  })

  it('matches SCHALTER as SWITCH_ALTER (ALTER substring matches first)', () => {
    // "SCHALTER" contains "ALTER" which matches the SWITCH_ALTER rule before generic SWITCH
    expect(norm('SCHALTER_3G').assemblyType).toBe('SWITCH_ALTER')
  })

  // Kábeltálca
  it('matches E-KT prefix as CABLE_TRAY', () => {
    expect(norm('E-KT-300').assemblyType).toBe('CABLE_TRAY')
  })

  it('matches TRAY keyword as CABLE_TRAY', () => {
    expect(norm('CABLE_TRAY_200').assemblyType).toBe('CABLE_TRAY')
  })

  // Kötődoboz
  it('matches E-JB prefix as JUNCTION_BOX', () => {
    expect(norm('E-JB-01').assemblyType).toBe('JUNCTION_BOX')
  })

  it('matches JUNCTION keyword', () => {
    expect(norm('JUNCTION_BOX_IP65').assemblyType).toBe('JUNCTION_BOX')
  })

  // Védelem
  it('matches MCB as CIRCUIT_BREAKER', () => {
    expect(norm('MCB_16A').assemblyType).toBe('CIRCUIT_BREAKER')
  })

  it('matches FI-RELE as RCD', () => {
    expect(norm('FI-RELE_40A').assemblyType).toBe('RCD')
  })

  // Elosztó
  it('matches DISTRIBUTION', () => {
    expect(norm('DISTRIBUTION_BOARD').assemblyType).toBe('DISTRIBUTION')
  })

  // Tűzjelző
  it('matches SMOKE as SMOKE_DETECTOR', () => {
    expect(norm('SMOKE_DET_01').assemblyType).toBe('SMOKE_DETECTOR')
  })

  it('matches MANUAL_CALL', () => {
    expect(norm('MANUAL_CALL_POINT').assemblyType).toBe('MANUAL_CALL')
  })

  // Gyengeáram
  it('matches RJ45 as DATA_OUTLET', () => {
    expect(norm('RJ45_CAT6').assemblyType).toBe('DATA_OUTLET')
  })

  it('matches CAMERA', () => {
    expect(norm('CAMERA_DOME_01').assemblyType).toBe('CAMERA')
  })

  it('matches PIR as MOTION_SENSOR', () => {
    expect(norm('PIR_SENSOR').assemblyType).toBe('MOTION_SENSOR')
  })

  it('matches THERMOSTAT', () => {
    expect(norm('THERMOSTAT_ROOM').assemblyType).toBe('THERMOSTAT')
  })

  it('matches DOORBELL', () => {
    expect(norm('DOORBELL_01').assemblyType).toBe('DOORBELL')
  })
})

// ─── Case insensitivity and whitespace ───────────────────────────────────────

describe('normalizeBlockName case and whitespace handling', () => {
  it('is case insensitive', () => {
    expect(norm('led_panel_60x60').assemblyType).toBe('LED_PANEL')
    expect(norm('Led_Panel_60x60').assemblyType).toBe('LED_PANEL')
  })

  it('trims leading and trailing whitespace', () => {
    expect(norm('  SOCKET_01  ').assemblyType).toBe('SOCKET')
  })
})

// ─── Confidence and source for regex matches ─────────────────────────────────

describe('normalizeBlockName regex confidence and source', () => {
  it('returns confidence 0.9 and source regex for regex match', () => {
    const result = norm('SOCKET_2P')
    expect(result.confidence).toBe(0.9)
    expect(result.source).toBe('regex')
  })

  it('returns a label for regex match', () => {
    const result = norm('SOCKET_2P')
    expect(result.label).toBe('Dugalj')
  })
})

// ─── Fuzzy matching ──────────────────────────────────────────────────────────

describe('normalizeBlockName fuzzy matching', () => {
  it('fuzzy-matches near-miss against assembly type keys', () => {
    // "SOCKE" is 1 edit away from "SOCKET" → similarity ≈ 0.83
    const result = norm('SOCKE')
    expect(result.assemblyType).toBe('SOCKET')
    expect(result.source).toBe('fuzzy')
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result.confidence).toBeLessThan(1.0)
  })
})

// ─── Unknown / fallback ──────────────────────────────────────────────────────

describe('normalizeBlockName unknown fallback', () => {
  it('returns null assemblyType for unrecognizable input', () => {
    const result = norm('XYZFOOBAR_QQQ')
    expect(result.assemblyType).toBeNull()
    expect(result.confidence).toBe(0)
    expect(result.source).toBe('unknown')
    expect(result.label).toBeNull()
  })

  it('returns unknown for empty string', () => {
    const result = norm('')
    expect(result.assemblyType).toBeNull()
    expect(result.source).toBe('unknown')
  })
})

// ─── User override ───────────────────────────────────────────────────────────

describe('normalizeBlockName user override', () => {
  it('user override takes priority over regex', () => {
    const overrides = [{ blockName: 'MY_BLOCK', assemblyType: 'SOCKET' }]
    const result = normalizeBlockName('MY_BLOCK', overrides)
    expect(result.assemblyType).toBe('SOCKET')
    expect(result.confidence).toBe(1.0)
    expect(result.source).toBe('user')
    expect(result.label).toBe('Dugalj')
  })

  it('user override is case insensitive', () => {
    const overrides = [{ blockName: 'my_block', assemblyType: 'SWITCH' }]
    const result = normalizeBlockName('MY_BLOCK', overrides)
    expect(result.assemblyType).toBe('SWITCH')
    expect(result.source).toBe('user')
  })

  it('user override beats regex even if regex would match', () => {
    // "SOCKET_01" would regex-match SOCKET, but override says CAMERA
    const overrides = [{ blockName: 'SOCKET_01', assemblyType: 'CAMERA' }]
    const result = normalizeBlockName('SOCKET_01', overrides)
    expect(result.assemblyType).toBe('CAMERA')
    expect(result.source).toBe('user')
  })
})
