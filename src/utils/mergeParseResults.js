// ─── Merge Parse Results ────────────────────────────────────────────────────
// Aggregates DXF block recognition from multiple plans by floor and assemblyType.
// Input: plans with parseResult + inferredMeta (floor/systemType read via planMetaAccessors)
// Output: byFloor breakdown, total aggregation, unknowns list

import { normalizeBlocks, mergeByAssemblyType, getAssemblyTypeLabel } from '../data/symbolDictionary.js'
import { getPlanFloor, getPlanDiscipline } from './planMetaAccessors.js'

/**
 * Merge parse results from multiple plans into an aggregated summary.
 * @param {Array<{id, name, floor, discipline, parseResult}>} plans
 * @returns {{
 *   byFloor: Object<string, Object<string, number>>,
 *   byDiscipline: Object<string, Object<string, number>>,
 *   total: Object<string, number>,
 *   unknowns: Array<{blockName, count, planId, planName, floor}>,
 *   planDetails: Array<{planId, planName, floor, discipline, normalized, unknowns}>,
 *   assemblyTypes: Array<string>,
 * }}
 */
export function mergeParseResults(plans) {
  const byFloor = {}       // { "Pince": { "CEILING_LIGHT": 12, ... }, ... }
  const byDiscipline = {}  // { "Világítás": { ... }, ... }
  const totalMap = {}      // { "CEILING_LIGHT": 102, ... }
  const allUnknowns = []
  const planDetails = []
  const assemblyTypeSet = new Set()

  for (const plan of plans) {
    const blocks = plan.parseResult?.blocks || []
    if (blocks.length === 0) continue

    const { normalized, unknowns } = normalizeBlocks(blocks)
    const floor = getPlanFloor(plan) || 'Nincs megadva'
    const discipline = getPlanDiscipline(plan) || 'Nincs megadva'

    // Per-plan detail
    planDetails.push({
      planId: plan.id,
      planName: plan.name,
      floor,
      discipline,
      blockCount: blocks.length,
      normalized,
      unknowns,
    })

    // Aggregate by floor
    if (!byFloor[floor]) byFloor[floor] = {}
    for (const b of normalized) {
      if (!b.assemblyType) continue
      assemblyTypeSet.add(b.assemblyType)
      byFloor[floor][b.assemblyType] = (byFloor[floor][b.assemblyType] || 0) + b.count
    }

    // Aggregate by discipline
    if (!byDiscipline[discipline]) byDiscipline[discipline] = {}
    for (const b of normalized) {
      if (!b.assemblyType) continue
      byDiscipline[discipline][b.assemblyType] = (byDiscipline[discipline][b.assemblyType] || 0) + b.count
    }

    // Total
    const merged = mergeByAssemblyType(normalized)
    for (const [type, count] of Object.entries(merged)) {
      totalMap[type] = (totalMap[type] || 0) + count
    }

    // Unknowns
    for (const u of unknowns) {
      allUnknowns.push({
        blockName: u.name,
        count: u.count,
        planId: plan.id,
        planName: plan.name,
        floor,
      })
    }
  }

  // Sort assembly types by total count descending
  const assemblyTypes = [...assemblyTypeSet].sort((a, b) => (totalMap[b] || 0) - (totalMap[a] || 0))

  return {
    byFloor,
    byDiscipline,
    total: totalMap,
    unknowns: allUnknowns,
    planDetails,
    assemblyTypes,
  }
}

/**
 * Get a flat table row array for display
 * @param {Object} mergeResult - Output of mergeParseResults
 * @returns {Array<{assemblyType, label, floors: Object<string, number>, total: number}>}
 */
export function getAggregatedRows(mergeResult) {
  const { byFloor, total, assemblyTypes } = mergeResult
  const floors = Object.keys(byFloor)

  return assemblyTypes.map(type => ({
    assemblyType: type,
    label: getAssemblyTypeLabel(type),
    floors: floors.reduce((acc, f) => {
      acc[f] = byFloor[f]?.[type] || 0
      return acc
    }, {}),
    total: total[type] || 0,
  }))
}

/**
 * Deduplicate unknowns by block name (aggregate count across plans)
 * @param {Array} unknowns - From mergeParseResults
 * @returns {Array<{blockName, totalCount, plans: Array<{planId, planName, count}>}>}
 */
export function deduplicateUnknowns(unknowns) {
  const map = {}
  for (const u of unknowns) {
    if (!map[u.blockName]) {
      map[u.blockName] = { blockName: u.blockName, totalCount: 0, plans: [] }
    }
    map[u.blockName].totalCount += u.count
    map[u.blockName].plans.push({ planId: u.planId, planName: u.planName, count: u.count })
  }
  return Object.values(map).sort((a, b) => b.totalCount - a.totalCount)
}
