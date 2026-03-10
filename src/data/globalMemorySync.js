// ─── Global Memory Sync — Phase 2 Stub ───────────────────────────────────────
// Cross-account shared recognition memory via Supabase.
// Phase 1: all functions are no-ops. The interface is defined so the
// recognition pipeline can call them today without breaking.
//
// Phase 2 Supabase table (to be created):
//
//   CREATE TABLE recognition_memory_global (
//     id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     signature   TEXT NOT NULL,
//     asm_id      TEXT NOT NULL,
//     account_count  INT DEFAULT 1,
//     evidence_count INT DEFAULT 1,
//     status      TEXT DEFAULT 'active'    -- 'active' | 'conflict' | 'retired'
//     created_at  TIMESTAMPTZ DEFAULT now(),
//     updated_at  TIMESTAMPTZ DEFAULT now(),
//     UNIQUE (signature, asm_id)
//   );
//
// Promotion rule: 3+ distinct accounts, no conflicts → status = 'active'
// Safety: global memory is suggestion-only (confidence 0.50), never auto-confirm.

/**
 * Sync local account memory up to the global Supabase table.
 * Phase 1: no-op.
 */
export async function syncAccountMemoryUp() {
  // Phase 2: will read account memory from localStorage,
  // compare with global table, and upsert new entries.
  return
}

/**
 * Fetch all global memory entries from Supabase.
 * Phase 1: returns empty object.
 * @returns {Promise<Object>} — { [signature]: { asmId, confidence, accountCount } }
 */
export async function fetchGlobalMemory() {
  return {}
}

/**
 * Look up a single signature in global memory.
 * Phase 1: returns null.
 * @param {string} _signature — normalized signature
 * @returns {null}
 */
export function lookupGlobalMemory(_signature) {
  return null
}
