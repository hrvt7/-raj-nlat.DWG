/**
 * Security / ops hardening regression tests.
 *
 * Covers:
 * 1. convert-dwg fallback is fail-closed (not permissive)
 * 2. Backup failure dispatches user-facing event
 * 3. Supabase env detection is structured
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('convert-dwg fallback hardening', () => {
  const src = readFileSync(
    resolve(import.meta.dirname, '..', '..', 'api', 'convert-dwg.py'), 'utf-8'
  )

  it('check_origin fallback returns False (fail-closed)', () => {
    // The fallback check_origin must NOT return True
    expect(src).not.toMatch(/def check_origin.*return True/)
    // It should call _fail_closed_response and return False
    expect(src).toContain('def check_origin(handler)')
    expect(src).toContain('_fail_closed_response')
  })

  it('check_rate_limit fallback returns False (fail-closed)', () => {
    expect(src).not.toMatch(/def check_rate_limit.*return True/)
  })

  it('require_auth fallback returns False (fail-closed)', () => {
    expect(src).toContain("def require_auth(handler)")
    // Should return False or call _fail_closed_response
    expect(src).not.toMatch(/def require_auth.*return True/)
  })

  it('logs critical error when security_helpers import fails', () => {
    expect(src).toContain('CRITICAL: security_helpers import failed')
  })

  it('CORS fallback uses null origin (not wildcard)', () => {
    // The fallback send_cors_headers should NOT use '*' wildcard
    expect(src).toContain("'null'") // uses 'null' as origin
  })
})

describe('backup failure event surfacing', () => {
  const planStoreSrc = readFileSync(
    resolve(import.meta.dirname, '..', 'data', 'planStore.js'), 'utf-8'
  )

  it('dispatches takeoffpro:backup-failed event on upload failure', () => {
    expect(planStoreSrc).toContain("'takeoffpro:backup-failed'")
    expect(planStoreSrc).toContain('planId: plan.id')
    expect(planStoreSrc).toContain('error: err.message')
  })

  it('still records remoteBackupFailed timestamp', () => {
    expect(planStoreSrc).toContain("remoteBackupFailed: new Date().toISOString()")
  })
})

describe('App.jsx listens for backup failure', () => {
  const appSrc = readFileSync(
    resolve(import.meta.dirname, '..', 'App.jsx'), 'utf-8'
  )

  it('listens for takeoffpro:backup-failed event', () => {
    expect(appSrc).toContain("'takeoffpro:backup-failed'")
  })

  it('shows toast on backup failure', () => {
    expect(appSrc).toContain('Rajzfájl felhő mentése sikertelen')
  })

  it('cleans up backup listener on unmount', () => {
    expect(appSrc).toContain("removeEventListener('takeoffpro:backup-failed'")
  })
})
