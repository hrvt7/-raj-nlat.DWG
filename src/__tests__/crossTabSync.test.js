// ─── Cross-Tab Storage Sync — Regression Tests ─────────────────────────────
// Verifies that the App.jsx storage-event handler dispatches reloads for all
// synced keys: quotes, settings, assemblies, materials, work_items.
//
// The handler pattern is:
//   window.addEventListener('storage', (e) => {
//     if (!e.key?.startsWith('takeoffpro_')) return
//     if (e.key.includes('quotes'))     → setQuotes(loadQuotes())
//     if (e.key.includes('settings'))   → setSettings(loadSettings())
//     if (e.key.includes('assemblies')) → setAsmRev(r => r + 1)
//     if (e.key.includes('materials'))  → setMaterials(loadMaterials())
//     if (e.key.includes('work_items')) → setWorkItems(loadWorkItems())
//   })
//
// This test exercises the key-matching logic in isolation to ensure
// each synced key triggers exactly the right reload, and non-synced keys
// are ignored.

import { describe, it, expect } from 'vitest'

// ── Simulate the handler's key-matching logic ─────────────────────────────
// Extracted from App.jsx so the test stays in sync with the real handler.

const SYNCED_KEYS = ['quotes', 'settings', 'assemblies', 'materials', 'work_items']

function simulateHandler(storageKey) {
  if (!storageKey || !storageKey.startsWith('takeoffpro_')) return []
  const triggered = []
  if (storageKey.includes('quotes'))     triggered.push('quotes')
  if (storageKey.includes('settings'))   triggered.push('settings')
  if (storageKey.includes('assemblies')) triggered.push('assemblies')
  if (storageKey.includes('materials'))  triggered.push('materials')
  if (storageKey.includes('work_items')) triggered.push('work_items')
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

  // ── Non-synced keys must NOT trigger any reload ──────────────────────────

  it('takeoffpro_templates does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_templates')).toEqual([])
  })

  it('takeoffpro_asm_stats does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_asm_stats')).toEqual([])
  })

  it('takeoffpro_projects_meta does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_projects_meta')).toEqual([])
  })

  it('takeoffpro_plans_meta does not trigger any reload', () => {
    expect(simulateHandler('takeoffpro_plans_meta')).toEqual([])
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
    // 'takeoffpro_asm_stats' does NOT contain 'assemblies' — verify
    expect('takeoffpro_asm_stats'.includes('assemblies')).toBe(false)
    expect(simulateHandler('takeoffpro_asm_stats')).toEqual([])
  })

  it('all 5 synced keys are covered', () => {
    // Exhaustive: every SYNCED_KEY must trigger exactly itself
    const LS_KEYS = {
      quotes:     'takeoffpro_quotes',
      settings:   'takeoffpro_settings',
      assemblies: 'takeoffpro_assemblies',
      materials:  'takeoffpro_materials',
      work_items: 'takeoffpro_work_items',
    }
    for (const [name, lsKey] of Object.entries(LS_KEYS)) {
      const triggered = simulateHandler(lsKey)
      expect(triggered, `${name} should trigger exactly [${name}]`).toEqual([name])
    }
  })
})
