/**
 * Symbol-Family System — grouped template variants per symbol type.
 *
 * A SymbolFamily groups multiple visual variants (templates) of the same
 * electrical symbol (same category + asmId). This enables:
 *   - Multi-variant coverage (different CAD styles, line weights, sizes)
 *   - Primary-first search (best variant searched first, secondaries on fallback)
 *   - Stats-based ranking (most successful variant becomes primary)
 *
 * Storage: planAnnotations.symbolFamilies (alongside legacy savedTemplates).
 * Dual-write ensures backward compatibility.
 */

let _famSeq = 0
let _varSeq = 0

export function generateFamilyId() {
  return `FAM-${Date.now().toString(36)}-${(++_famSeq).toString(36)}`
}

export function generateVariantId() {
  return `VAR-${Date.now().toString(36)}-${(++_varSeq).toString(36)}`
}

/** Max variants per family — prevents bloat and search time explosion. */
export const MAX_VARIANTS_PER_FAMILY = 5

/**
 * Create a new SymbolFamily with one initial variant.
 *
 * @param {object} opts
 * @param {string} opts.category
 * @param {string|null} opts.asmId
 * @param {string} opts.label
 * @param {object} variant — first SymbolVariant fields (cropData, w, h, threshold, etc.)
 * @returns {object} SymbolFamily
 */
export function createFamily({ category, asmId, label }, variant) {
  const now = new Date().toISOString()
  return {
    id: generateFamilyId(),
    name: label || category,
    category,
    asmId: asmId || null,
    variants: [createVariant(variant)],
    totalSearches: 0,
    totalHits: 0,
    avgAcceptRate: variant.acceptRate ?? 0.5,
    preferredThreshold: variant.threshold ?? 0.50,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  }
}

/**
 * Create a SymbolVariant from template data.
 *
 * @param {object} tpl — template fields
 * @returns {object} SymbolVariant
 */
export function createVariant(tpl) {
  const now = new Date().toISOString()
  return {
    id: generateVariantId(),
    cropData: tpl.cropData,
    w: tpl.w,
    h: tpl.h,
    sourcePlanId: tpl.sourcePlanId || null,
    sourcePlanName: tpl.sourcePlanName || null,
    threshold: tpl.threshold ?? 0.50,
    nmsRadius: tpl.nmsRadius ?? Math.max(tpl.w, tpl.h) * 0.6,
    acceptRate: tpl.acceptRate ?? 0.5,
    searches: tpl.searches ?? 0,
    hits: tpl.hits ?? 0,
    avgScore: tpl.avgScore ?? 0.6,
    savedAt: tpl.savedAt || now,
    lastUsedAt: tpl.lastUsedAt || now,
  }
}

/**
 * Check if a variant is a size-duplicate of any existing variant in a family.
 * Same ±5px threshold as the legacy savedTemplates dedup.
 */
export function isVariantDuplicate(family, w, h) {
  return family.variants.some(v =>
    Math.abs(v.w - w) < 5 && Math.abs(v.h - h) < 5
  )
}

/**
 * Add a variant to a family. Handles dedup, cap, and pruning.
 *
 * @param {object} family — SymbolFamily (mutated in place)
 * @param {object} variantData — raw template data (cropData, w, h, threshold, etc.)
 * @returns {{ added: boolean, family: object }}
 */
export function addVariantToFamily(family, variantData) {
  // Size-duplicate check
  if (isVariantDuplicate(family, variantData.w, variantData.h)) {
    // Update stats of the matching variant instead of adding
    const match = family.variants.find(v =>
      Math.abs(v.w - variantData.w) < 5 && Math.abs(v.h - variantData.h) < 5
    )
    if (match && variantData.acceptRate != null) {
      match.acceptRate = variantData.acceptRate
      match.threshold = variantData.threshold ?? match.threshold
      match.lastUsedAt = new Date().toISOString()
    }
    family.updatedAt = new Date().toISOString()
    return { added: false, family }
  }

  // Add new variant
  family.variants.push(createVariant(variantData))

  // Enforce cap — drop lowest-performing if over limit
  if (family.variants.length > MAX_VARIANTS_PER_FAMILY) {
    // Score: avgScore × (searches + 1) — avoids zero-searches dominating
    family.variants.sort((a, b) =>
      (b.avgScore * (b.searches + 1)) - (a.avgScore * (a.searches + 1))
    )
    family.variants = family.variants.slice(0, MAX_VARIANTS_PER_FAMILY)
  }

  family.updatedAt = new Date().toISOString()
  return { added: true, family }
}

/**
 * Find a family matching category + asmId in a families array.
 */
export function findFamily(families, category, asmId) {
  return families.find(f =>
    f.category === category && f.asmId === (asmId || null)
  ) || null
}

/**
 * Add or update a template into the family system.
 * Returns the updated families array (new reference).
 *
 * @param {Array} families — existing symbolFamilies
 * @param {object} templateData — { cropData, w, h, category, asmId, label, threshold, ... }
 * @returns {{ families: Array, familyName: string, variantCount: number, wasNew: boolean }}
 */
export function upsertTemplateIntoFamilies(families, templateData) {
  const list = [...families]
  const existing = findFamily(list, templateData.category, templateData.asmId)

  if (existing) {
    const { added } = addVariantToFamily(existing, templateData)
    return {
      families: list,
      familyName: existing.name,
      variantCount: existing.variants.length,
      wasNew: false,
      variantAdded: added,
    }
  }

  // Create new family
  const fam = createFamily(
    { category: templateData.category, asmId: templateData.asmId, label: templateData.label },
    templateData
  )
  list.push(fam)
  return {
    families: list,
    familyName: fam.name,
    variantCount: 1,
    wasNew: true,
    variantAdded: true,
  }
}

/**
 * Migrate legacy savedTemplates into symbolFamilies structure.
 * Groups by category + asmId, deduplicates variants by size.
 *
 * @param {Array} savedTemplates — legacy flat template array
 * @returns {Array} symbolFamilies
 */
export function migrateTemplatesToFamilies(savedTemplates) {
  if (!savedTemplates?.length) return []

  let families = []
  for (const tpl of savedTemplates) {
    const result = upsertTemplateIntoFamilies(families, {
      cropData: tpl.cropData,
      w: tpl.w,
      h: tpl.h,
      category: tpl.category,
      asmId: tpl.asmId || null,
      label: tpl.label,
      threshold: tpl.threshold ?? 0.50,
      nmsRadius: tpl.nmsRadius,
      acceptRate: tpl.acceptRate ?? 0.5,
      searches: tpl.totalSearched ?? 0,
      hits: tpl.totalAccepted ?? 0,
      avgScore: 0.6, // unknown from legacy data
      savedAt: tpl.savedAt,
    })
    families = result.families
  }

  return families
}

/**
 * Merge families from multiple plans into a unified set.
 * Groups by category + asmId, unions variants with dedup.
 *
 * @param {Array<Array>} familyArrays — array of per-plan symbolFamilies
 * @returns {Array} merged families
 */
export function mergeFamiliesFromPlans(familyArrays) {
  let merged = []

  for (const planFamilies of familyArrays) {
    if (!planFamilies?.length) continue
    for (const fam of planFamilies) {
      const existing = findFamily(merged, fam.category, fam.asmId)
      if (!existing) {
        // Deep-copy the family to avoid mutating source
        merged.push({
          ...fam,
          variants: fam.variants.map(v => ({ ...v })),
        })
      } else {
        // Merge variants from this plan's family into existing
        for (const v of fam.variants) {
          addVariantToFamily(existing, v)
        }
        // Merge stats
        existing.totalSearches += fam.totalSearches || 0
        existing.totalHits += fam.totalHits || 0
      }
    }
  }

  return merged
}

/**
 * Select the primary variant from a family (best-performing, most-used).
 * Returns variants sorted by performance score (primary = index 0).
 *
 * @param {object} family
 * @returns {Array} sorted variants (primary first)
 */
export function sortVariantsByPerformance(family) {
  return [...family.variants].sort((a, b) => {
    // Score: avgScore × log(searches + 2) — log prevents high-search-count from
    // permanently dominating, giving newer variants a fair chance
    const scoreA = a.avgScore * Math.log2(a.searches + 2)
    const scoreB = b.avgScore * Math.log2(b.searches + 2)
    return scoreB - scoreA
  })
}

/**
 * Update variant stats after a search run.
 *
 * @param {object} variant — mutated in place
 * @param {number} hitCount — number of hits this variant produced
 * @param {number} avgHitScore — average NCC score of hits (0 if no hits)
 */
export function updateVariantStats(variant, hitCount, avgHitScore) {
  variant.searches = (variant.searches || 0) + 1
  variant.hits = (variant.hits || 0) + hitCount
  variant.lastUsedAt = new Date().toISOString()
  if (hitCount > 0 && avgHitScore > 0) {
    // Exponential moving average for score stability
    const alpha = 0.3
    variant.avgScore = variant.avgScore * (1 - alpha) + avgHitScore * alpha
  }
}

/**
 * Update family-level stats after a batch search.
 *
 * @param {object} family — mutated in place
 * @param {number} hitCount — total hits from this family
 */
export function updateFamilyStats(family, hitCount) {
  family.totalSearches = (family.totalSearches || 0) + 1
  family.totalHits = (family.totalHits || 0) + hitCount
  family.lastUsedAt = new Date().toISOString()
  family.updatedAt = new Date().toISOString()
  // Recompute avgAcceptRate from variants
  const totalVariantHits = family.variants.reduce((s, v) => s + (v.hits || 0), 0)
  const totalVariantSearches = family.variants.reduce((s, v) => s + (v.searches || 0), 0)
  if (totalVariantSearches > 0) {
    family.avgAcceptRate = totalVariantHits / Math.max(1, totalVariantSearches)
  }
}

/**
 * Convert families back to flat savedTemplates format for dual-write.
 * Takes the primary (best) variant from each family.
 *
 * @param {Array} families
 * @returns {Array} flat savedTemplates
 */
export function familiesToFlatTemplates(families) {
  const templates = []
  for (const fam of families) {
    for (const v of fam.variants) {
      templates.push({
        cropData: v.cropData,
        w: v.w,
        h: v.h,
        category: fam.category,
        asmId: fam.asmId,
        label: fam.name,
        threshold: v.threshold,
        nmsRadius: v.nmsRadius,
        acceptRate: v.acceptRate,
        totalSearched: v.searches,
        totalAccepted: v.hits,
        savedAt: v.savedAt,
      })
    }
  }
  return templates
}
