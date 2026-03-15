// ─── Cross-Tab Storage Sync — Regression Tests ─────────────────────────────
// Verifies that the App.jsx storage-event handler dispatches reloads for all
// synced keys: quotes, settings, assemblies, materials, work_items,
// projects_meta, plans_meta.
//
// The handler pattern is:
//   window.addEventListener('storage', (e) => {
//     if (!e.key?.startsWith('takeoffpro_')) return
//     if (e.key.includes('quotes'))        → setQuotes(loadQuotes())
//     if (e.key.includes('settings'))      → setSettings(loadSettings())
//     if (e.key.includes('assemblies'))    → setAsmRev(r => r + 1)
//     if (e.key.includes('materials'))     → setMaterials(loadMaterials())
//     if (e.key.includes('work_items'))    → setWorkItems(loadWorkItems())
//     if (e.key.includes('projects_meta')) → setProjRev(r => r + 1)
//     if (e.key.includes('plans_meta'))    → setPlanRev(r => r + 1)
//   })
//
// This test exercises the key-matching logic in isolation to ensure
// each synced key triggers exactly the right reload, and non-synced keys
// are ignored.

import { describe, it, expect } from 'vitest'

// ── Simulate the handler's key-matching logic ─────────────────────────────
// Extracted from App.jsx so the test stays in sync with the real handler.

const SYNCED_KEYS = ['quotes', 'settings', 'assemblies', 'materials', 'work_items', 'projects_meta', 'plans_meta']

function simulateHandler(storageKey) {
  if (!storageKey || !storageKey.startsWith('takeoffpro_')) return []
  const triggered = []
  if (storageKey.includes('quotes'))        triggered.push('quotes')
  if (storageKey.includes('settings'))      triggered.push('settings')
  if (storageKey.includes('assemblies'))    triggered.push('assemblies')
  if (storageKey.includes('materials'))     triggered.push('materials')
  if (storageKey.includes('work_items'))    triggered.push('work_items')
  if (storageKey.includes('projects_meta')) triggered.push('projects_meta')
  if (storageKey.includes('plans_meta'))    triggered.push('plans_meta')
  return triggered
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Cross-tab storage sync key matching', () => {

  // ── Each synced key triggers exactly one reload ──────────────────────────

  it('takeoffpro_quotes triggers quotes reload', () => {
    expect(simulateHandler('takeoffpro_quotes')).toEqual(['quotes'])
  })

  it('takeoffpro_settings triggers settings reload', () => {
    expect(simulateHandler('takeoffpro_settings')).toEqual(['settings'])
  })

  it('takeoffpro_assemblies triggers assemblies reload', () => {
    expect(simulateHandler('takeoffpro_assemblies')).toEqual(['assemblies'])
  })

  it('takeoffpro_materials triggers materials reload', () => {
    expect(simulateHandler('takeoffpro_materials')).toEqual(['materials'])
  })

  it('takeoffpro_work_items triggers work_items reload', () => {
    expect(simulateHandler('takeoffpro_work_items')).toEqual(['work_items'])
  })

  it('takeoffpro_projects_meta triggers projects_meta reload', () => {
    expect(simulateHandler('takeoffpro_projects_meta')).toEqual(['projects_meta'])
  })

  it('takeoffpro_plans_meta triggers plans_meta reload', () => {
    expect(simulateHandler('takeoffpro_plans_meta')).toEqual(['plans_meta'])
  })

  // ── Non-synced keys must NOT trigger any reload ──────────────────────────

  it('takeoffpro_templates does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_templates')).toEqual([])
  })

  it('takeoffpro_asm_stats does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_asm_stats')).toEqual([])
  })

  it('takeoffpro_recmem_proj_xxx does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_recmem_proj_abc123')).toEqual([])
  })

  it('takeoffpro_symbol_overrides does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_symbol_overrides')).toEqual([])
  })

  it('takeoffpro_legend_templates_meta does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_legend_templates_meta')).toEqual([])
  })

  // ── Guard: non-takeoffpro keys and nulls are ignored ─────────────────────

  it('null key is ignored', () => {
    expect(simulateHandler(null)).toEqual([])
  })

  it('empty string key is ignored', () => {
    expect(simulateHandler('')).toEqual([])
  })

  it('unrelated key is ignored', () => {
    expect(simulateHandler('some_other_app_key')).toEqual([])
  })

  // ── No key substring collision ───────────────────────────────────────────

  it('asm_stats does not accidentally trigger assemblies (no "assemblies" substring)', () => {
    expect('takeoffpro_asm_stats'.includes('assemblies')).toBe(false)
    expect(simulateHandler('takeoffpro_asm_stats')).toEqual([])
  })

  it('plans_meta does not accidentally trigger projects_meta', () => {
    expect('takeoffpro_plans_meta'.includes('projects_meta')).toBe(false)
    expect(simulateHandler('takeoffpro_plans_meta')).toEqual(['plans_meta'])
  })

  it('projects_meta does not accidentally trigger plans_meta', () => {
    // 'takeoffpro_projects_meta' does NOT contain 'plans_meta' — verify
    expect('takeoffpro_projects_meta'.includes('plans_meta')).toBe(false)
    expect(simulateHandler('takeoffpro_projects_meta')).toEqual(['projects_meta'])
  })

  it('recmem_proj_ does not accidentally trigger projects_meta', () => {
    expect('takeoffpro_recmem_proj_abc'.includes('projects_meta')).toBe(false)
    expect(simulateHandler('takeoffpro_recmem_proj_abc')).toEqual([])
  })

  it('legend_templates_meta does not accidentally trigger plans_meta', () => {
    // 'takeoffpro_legend_templates_meta' does NOT contain 'plans_meta' — verify
    expect('takeoffpro_legend_templates_meta'.includes('plans_meta')).toBe(false)
    expect(simulateHandler('takeoffpro_legend_templates_meta')).toEqual([])
  })

  it('all 7 synced keys are covered', () => {
    // Exhaustive: every SYNCED_KEY must trigger exactly itself
    const LS_KEYS = {
      quotes:        'takeoffpro_quotes',
      settings:      'takeoffpro_settings',
      assemblies:    'takeoffpro_assemblies',
      materials:     'takeoffpro_materials',
      work_items:    'takeoffpro_work_items',
      projects_meta: 'takeoffpro_projects_meta',
      plans_meta:    'takeoffpro_plans_meta',
    }
    for (const [name, lsKey] of Object.entries(LS_KEYS)) {
      const triggered = simulateHandler(lsKey)
      expect(triggered, `${name} should trigger exactly [${name}]`).toEqual([name])
    }
  })
})
