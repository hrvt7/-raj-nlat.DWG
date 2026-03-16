import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── localStorage mock ───────────────────────────────────────────────────────
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
  // Suppress CustomEvent dispatch in save()
  vi.stubGlobal('CustomEvent', class { constructor() {} })
  vi.stubGlobal('window', { dispatchEvent: () => {} })
})

import {
  loadSettings,
  saveSettings,
  loadCompanyLogo,
  saveCompanyLogo,
} from '../data/store.js'

const FAKE_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

// ─── Logo dedicated storage ─────────────────────────────────────────────────

describe('Company logo dedicated storage', () => {
  it('saveSettings does NOT persist logo_base64 in the settings blob', () => {
    const settings = {
      company: { name: 'Test Kft.', logo_base64: FAKE_LOGO },
      labor: { hourly_rate: 9000 },
    }
    saveSettings(settings)

    const raw = JSON.parse(store['takeoffpro_settings'])
    expect(raw.company.logo_base64).toBeUndefined()
    expect(raw.company.name).toBe('Test Kft.')
  })

  it('loadSettings rehydrates logo from dedicated key', () => {
    store['takeoffpro_settings'] = JSON.stringify({ company: { name: 'Kft.' } })
    store['takeoffpro_company_logo'] = FAKE_LOGO

    const settings = loadSettings()
    expect(settings.company.logo_base64).toBe(FAKE_LOGO)
    expect(settings.company.name).toBe('Kft.')
  })

  it('loadSettings migrates embedded logo to dedicated key', () => {
    // Simulate legacy state: logo inside settings blob
    store['takeoffpro_settings'] = JSON.stringify({
      company: { name: 'Old Kft.', logo_base64: FAKE_LOGO },
    })

    const settings = loadSettings()

    // Runtime object has the logo
    expect(settings.company.logo_base64).toBe(FAKE_LOGO)

    // Dedicated key was created
    expect(store['takeoffpro_company_logo']).toBe(FAKE_LOGO)

    // Settings blob no longer has the logo
    const rawAfter = JSON.parse(store['takeoffpro_settings'])
    expect(rawAfter.company.logo_base64).toBeUndefined()
  })

  it('migration does not overwrite existing dedicated logo', () => {
    const NEWER_LOGO = 'data:image/png;base64,NEWLOGO=='
    store['takeoffpro_settings'] = JSON.stringify({
      company: { logo_base64: FAKE_LOGO },
    })
    store['takeoffpro_company_logo'] = NEWER_LOGO

    loadSettings()

    // Dedicated key keeps the newer logo
    expect(store['takeoffpro_company_logo']).toBe(NEWER_LOGO)
  })

  it('saveCompanyLogo stores and loadCompanyLogo retrieves', () => {
    saveCompanyLogo(FAKE_LOGO)
    expect(loadCompanyLogo()).toBe(FAKE_LOGO)
  })

  it('saveCompanyLogo with empty string removes the key', () => {
    store['takeoffpro_company_logo'] = FAKE_LOGO
    saveCompanyLogo('')
    expect(store['takeoffpro_company_logo']).toBeUndefined()
    expect(loadCompanyLogo()).toBe('')
  })

  it('loadSettings returns empty string for logo when no logo exists', () => {
    store['takeoffpro_settings'] = JSON.stringify({ company: { name: 'X' } })
    const settings = loadSettings()
    expect(settings.company.logo_base64).toBe('')
  })
})
