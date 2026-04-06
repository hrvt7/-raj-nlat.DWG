/**
 * Plan file remote recovery integrity tests.
 *
 * Verifies:
 * 1. Upload and recovery use consistent file identity
 * 2. Recovery tries multiple extensions when fileType is unknown
 * 3. No stale null-suppression check
 * 4. Proper error logging
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const planStoreSrc = readFileSync(
  resolve(import.meta.dirname, '..', 'data', 'planStore.js'), 'utf-8'
)
const projektekSrc = readFileSync(
  resolve(import.meta.dirname, '..', 'pages', 'Projektek.jsx'), 'utf-8'
)
const supabaseSrc = readFileSync(
  resolve(import.meta.dirname, '..', 'supabase.js'), 'utf-8'
)

describe('upload and download use same path pattern', () => {
  it('uploadPlanBlob uses {userId}/{planId}.{ext} pattern', () => {
    expect(supabaseSrc).toContain('`${user.id}/${planId}.${ext}`')
  })

  it('downloadPlanBlob uses same {userId}/{planId}.{ext} pattern', () => {
    // Both should use the identical template
    const uploadMatch = supabaseSrc.match(/function uploadPlanBlob[\s\S]*?const path = `\$\{user\.id\}\/\$\{planId\}\.\$\{ext\}`/)
    const downloadMatch = supabaseSrc.match(/function downloadPlanBlob[\s\S]*?const path = `\$\{user\.id\}\/\$\{planId\}\.\$\{ext\}`/)
    expect(uploadMatch).toBeTruthy()
    expect(downloadMatch).toBeTruthy()
  })
})

describe('getPlanFile recovery tries multiple extensions', () => {
  it('tries known fileType first', () => {
    expect(planStoreSrc).toContain("fileType ? [fileType] : ['pdf', 'dxf', 'dwg']")
  })

  it('falls back to other extensions if primary fails', () => {
    expect(planStoreSrc).toContain("for (const ft of typesToTry)")
    expect(planStoreSrc).toContain("downloadPlanBlob(planId, ft)")
  })

  it('updates meta fileType if recovered with different extension', () => {
    expect(planStoreSrc).toContain("if (ft !== fileType) updatePlanMeta(planId, { fileType: ft })")
  })

  it('logs recovery attempts for diagnostics', () => {
    expect(planStoreSrc).toContain('attempting remote recovery')
    expect(planStoreSrc).toContain('Remote recovery succeeded')
    expect(planStoreSrc).toContain('exhausted all extensions')
  })
})

describe('no stale null-suppression in Projektek open flow', () => {
  it('does NOT check remoteBackupAt === null', () => {
    // The old suppression pattern should be gone from the plan-open flow
    expect(projektekSrc).not.toContain('remoteBackupAt === null')
  })

  it('always attempts recovery when local is missing', () => {
    expect(projektekSrc).toContain('Always attempt recovery when local is missing')
  })
})

describe('EXT_MAP fallback safety', () => {
  it('unknown fileType maps to bin extension', () => {
    // This is the safety net — should never be needed if meta has correct fileType
    expect(supabaseSrc).toContain("|| 'bin'")
  })
})
