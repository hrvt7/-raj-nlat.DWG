// ─── Auth / Session / Protected Request Tests ───────────────────────────────
// Covers: getAuthHeaders contract, 401 retry logic, convert-dwg auth boundary,
// and error code mapping.

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ── Source reading for architecture tests ────────────────────────────────────
const ROOT = path.resolve(__dirname, '..')
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

// ═════════════════════════════════════════════════════════════════════════════
// 1. getAuthHeaders contract
// ═════════════════════════════════════════════════════════════════════════════

describe('getAuthHeaders — contract verification', () => {
  const supabaseSrc = readSrc('supabase.js')

  it('getAuthHeaders exists and is exported', () => {
    expect(supabaseSrc).toContain('export async function getAuthHeaders')
  })

  it('proactively checks token expiry with 2-min buffer', () => {
    expect(supabaseSrc).toContain('expiresAt - 120000')
  })

  it('calls refreshSession when token is near-expiry', () => {
    expect(supabaseSrc).toContain('supabase.auth.refreshSession()')
  })

  it('handles refresh failure gracefully (uses existing token)', () => {
    // The catch block should not throw — falls back to existing token
    expect(supabaseSrc).toContain('catch { /* refresh failed')
  })

  it('handles no-session gracefully (returns headers without auth)', () => {
    expect(supabaseSrc).toContain('catch { /* no session available')
  })

  it('sets Authorization: Bearer header when session exists', () => {
    expect(supabaseSrc).toContain("headers['Authorization'] = `Bearer ${session.access_token}`")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. DWG convert 401-retry logic
// ═════════════════════════════════════════════════════════════════════════════

describe('DWG convert fetchWithRetry — architecture', () => {
  // DWG conversion logic extracted to utils/dwgConversionFlow.js
  const workspaceSrc = readSrc('utils/dwgConversionFlow.js')

  it('401 retry is one-shot (flag prevents infinite loop)', () => {
    expect(workspaceSrc).toContain('let _auth401Retried = false')
    expect(workspaceSrc).toContain('_auth401Retried = true')
  })

  it('401 retry only fires for own API (not CloudConvert)', () => {
    expect(workspaceSrc).toContain("const isOwnApi = (url) => url.includes('/api/convert-dwg')")
    expect(workspaceSrc).toContain('isOwnApi(url)')
  })

  it('retry calls getAuthHeaders for fresh token', () => {
    expect(workspaceSrc).toContain('const freshHeaders = await getAuthHeaders()')
  })

  it('retry goes through fetchWithRetry (not raw fetch)', () => {
    // The retry should use fetchWithRetry(..., 0) not raw fetch()
    expect(workspaceSrc).toContain('return fetchWithRetry(url, { ...opts, headers: freshHeaders }, 0)')
  })

  it('5xx errors trigger exponential backoff', () => {
    expect(workspaceSrc).toContain('Math.pow(2, attempt)')
    expect(workspaceSrc).toContain('Math.random() * 500')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. convert-dwg.py auth boundary
// ═════════════════════════════════════════════════════════════════════════════

describe('convert-dwg auth boundary — architecture', () => {
  const convertSrc = fs.readFileSync(path.resolve(__dirname, '../../api/convert-dwg.py'), 'utf-8')
  const securitySrc = fs.readFileSync(path.resolve(__dirname, '../../security_helpers.py'), 'utf-8')

  it('require_auth is called in do_POST', () => {
    expect(convertSrc).toContain('if not require_auth(self): return')
  })

  it('require_auth is called BEFORE check_body_size and check_required_env in do_POST', () => {
    const doPost = convertSrc.slice(convertSrc.indexOf('def do_POST'))
    const authIdx = doPost.indexOf('require_auth')
    const bodyIdx = doPost.indexOf('check_body_size')
    const envIdx = doPost.indexOf("check_required_env(self, 'CLOUDCONVERT_API_KEY')")
    expect(authIdx).toBeLessThan(bodyIdx)
    expect(authIdx).toBeLessThan(envIdx)
  })

  it('fallback require_auth exists in ImportError block', () => {
    expect(convertSrc).toContain('def require_auth(handler)')
    // The fallback should be fail-closed (return False / 401)
    const fallbackSection = convertSrc.split('except ImportError:')[1]?.split('CLOUDCONVERT_API_KEY')[0] || ''
    expect(fallbackSection).toContain('return False')
  })

  it('security_helpers require_auth includes diagnostic code field', () => {
    expect(securitySrc).toContain("'code': reason or 'auth_failed'")
  })

  it('security_helpers verify_supabase_token returns (user, reason) tuple', () => {
    expect(securitySrc).toContain("return None, 'no_token'")
    expect(securitySrc).toContain("return None, 'config_missing'")
    expect(securitySrc).toContain("return None, 'url_error'")
    expect(securitySrc).toContain("return None, 'auth_api_error'")
  })

  it('SUPABASE_URL is stripped of whitespace and trailing slash', () => {
    expect(securitySrc).toContain(".strip().rstrip('/')")
  })

  it('URLError is caught separately from generic Exception', () => {
    expect(securitySrc).toContain('except urllib.error.URLError as e:')
  })

  it('rate limit is 30 (not 5) for convert-dwg', () => {
    expect(convertSrc).toContain('check_rate_limit(self, limit=30)')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. Frontend error code display
// ═════════════════════════════════════════════════════════════════════════════

describe('DWG convert error code display', () => {
  const workspaceSrc = readSrc('utils/dwgConversionFlow.js')

  it('appends diagnostic [code] to error message', () => {
    expect(workspaceSrc).toContain("const errDetail = createJson.code ? ` [${createJson.code}]` : ''")
  })
})
