// ─── Reference Panel Store ─────────────────────────────────────────────────────
// Persistence for reference panel data within planAnnotations.
// Stores per plan: which blocks the user marked as cable reference panels.
// Uses the existing planAnnotations IndexedDB store — no new DB.
// Pure functions + async I/O — safe for testing with mocks.

import { getPlanAnnotations, savePlanAnnotations } from '../data/planStore.js'

// ── Data model ────────────────────────────────────────────────────────────────
// Each reference panel entry:
//   { id, blockName, x, y, label, source: 'recognized_panel' | 'manual_panel' }

/**
 * Generate a stable ID for a reference panel entry.
 */
export function panelEntryId(blockName, x, y) {
  return `rpnl_${blockName}_${Math.round(x)}_${Math.round(y)}`
}

/**
 * Load reference panels for a plan from planAnnotations.
 * @param {string} planId
 * @returns {Promise<Array>} Array of reference panel objects
 */
export async function loadReferencePanels(planId) {
  if (!planId) return []
  const ann = await getPlanAnnotations(planId)
  return ann?.referencePanels || []
}

/**
 * Save reference panels for a plan into planAnnotations.
 * Merges with existing annotations — only overwrites the referencePanels field.
 * @param {string} planId
 * @param {Array} referencePanels
 */
export async function saveReferencePanels(planId, referencePanels) {
  if (!planId) return
  const ann = await getPlanAnnotations(planId)
  await savePlanAnnotations(planId, {
    ...ann,
    referencePanels,
  }, { silent: true })
}

/**
 * Build reference panel entries from recognized items + DXF inserts.
 * Used when the user selects a recognized panel block as reference.
 *
 * @param {string} blockName - The DXF block name
 * @param {Array} inserts - parsedDxf.inserts array
 * @returns {Array} Reference panel entries with positions
 */
export function buildRecognizedPanelEntries(blockName, inserts) {
  const matching = (inserts || []).filter(ins => ins.name === blockName)
  return matching.map(ins => ({
    id: panelEntryId(blockName, ins.x, ins.y),
    blockName,
    x: ins.x,
    y: ins.y,
    label: blockName,
    source: 'recognized_panel',
  }))
}

/**
 * Build reference panel entries from a clicked block on the DXF viewer.
 * Used when the user manually selects any block as a reference panel.
 *
 * @param {string} blockName - The DXF block name
 * @param {Array} inserts - parsedDxf.inserts array
 * @returns {Array} Reference panel entries with positions
 */
export function buildManualPanelEntries(blockName, inserts) {
  const matching = (inserts || []).filter(ins => ins.name === blockName)
  return matching.map(ins => ({
    id: panelEntryId(blockName, ins.x, ins.y),
    blockName,
    x: ins.x,
    y: ins.y,
    label: blockName,
    source: 'manual_panel',
  }))
}

/**
 * Toggle a block's reference panel status.
 * If the block already has entries → remove them all.
 * If it doesn't → add entries for all its inserts.
 *
 * @param {Array} currentPanels - Current reference panels array
 * @param {string} blockName - Block to toggle
 * @param {Array} inserts - parsedDxf.inserts array
 * @param {'recognized_panel'|'manual_panel'} source
 * @returns {Array} Updated reference panels array
 */
export function toggleReferencePanelBlock(currentPanels, blockName, inserts, source = 'manual_panel') {
  const hasBlock = currentPanels.some(p => p.blockName === blockName)
  if (hasBlock) {
    // Remove all entries for this block
    return currentPanels.filter(p => p.blockName !== blockName)
  }
  // Add entries for all inserts of this block
  const builder = source === 'recognized_panel' ? buildRecognizedPanelEntries : buildManualPanelEntries
  const newEntries = builder(blockName, inserts)
  return [...currentPanels, ...newEntries]
}
