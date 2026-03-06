/**
 * Bundle Store — local-first persistence for plan bundles.
 *
 * Stores Bundle records in IndexedDB (via localforage) so that
 * multi-plan aggregation state survives panel close, page reload,
 * and browser restart.
 *
 * Each Bundle captures:
 *   - which plans are combined
 *   - user's assembly assignments
 *   - plan snapshots for stale detection
 *
 * Retention: max MAX_BUNDLES total (oldest dropped).
 */

import localforage from 'localforage'

const bundleDb = localforage.createInstance({
  name: 'takeoffpro',
  storeName: 'bundles',
  description: 'Multi-plan bundle configurations with stale detection',
})

/** Maximum bundles kept (oldest pruned automatically). */
const MAX_BUNDLES = 20

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Save a bundle (create or update).
 * @param {object} bundle — full bundle object from createBundle()
 * @returns {object} the saved bundle
 */
export async function saveBundle(bundle) {
  bundle.updatedAt = new Date().toISOString()
  await bundleDb.setItem(bundle.id, bundle)
  await _pruneOldBundles()
  return bundle
}

/**
 * Get a single bundle by ID.
 * @param {string} bundleId
 * @returns {object|null}
 */
export async function getBundle(bundleId) {
  return await bundleDb.getItem(bundleId) || null
}

/**
 * List all bundles, newest first.
 * @returns {object[]}
 */
export async function listBundles() {
  const all = []
  await bundleDb.iterate((bundle) => {
    all.push(bundle)
  })
  all.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
  return all
}

/**
 * Update an existing bundle (merge fields).
 * @param {string} bundleId
 * @param {object} patch — partial fields to merge
 * @returns {object|null} updated bundle or null if not found
 */
export async function updateBundle(bundleId, patch) {
  const existing = await bundleDb.getItem(bundleId)
  if (!existing) return null
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() }
  await bundleDb.setItem(bundleId, updated)
  return updated
}

/**
 * Delete a single bundle.
 * @param {string} bundleId
 */
export async function deleteBundle(bundleId) {
  await bundleDb.removeItem(bundleId)
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _pruneOldBundles() {
  const all = await listBundles()
  if (all.length > MAX_BUNDLES) {
    const toRemove = all.slice(MAX_BUNDLES)
    for (const old of toRemove) {
      await bundleDb.removeItem(old.id)
    }
  }
}
