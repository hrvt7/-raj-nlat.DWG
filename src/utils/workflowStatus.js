// ─── Workflow Status ─────────────────────────────────────────────────────────
// Pure function: merges DXF audit, review summary, quote readiness, and cable
// audit into a single unified workflow stage with one status line and one CTA.
//
// This is a UI-plumbing layer — no business logic, no side effects.
// It consumes outputs from reviewState.js, dxfAudit.js, cableAudit.js and
// produces a single "what should the user see/do right now?" decision.
//
// Workflow stages (ordered by priority):
//   'empty'             — no file loaded yet
//   'parse_failed'      — DXF/PDF parse returned error
//   'unresolved_blocks' — unresolved items need manual assignment
//   'review_warnings'   — auto_low items or weak cable exist
//   'ready'             — all items confirmed/auto_high, quote-ready
//
// Each stage carries:
//   - statusLine:  short Hungarian string for the header
//   - statusColor: design token color key
//   - cta:         { label, action } — the single most important next step
//   - detail:      { reasons[], structuredReasons[], stats{} } — collapsible extra info
//   - badges:      { takeoff, cable, calc } — warning dots for tab bar
//
// Structured reasons severity:
//   'blocker'  — hard save-gating issue (must fix before save)
//   'action'   — clear fix available (e.g., accept-all for auto_low)
//   'warning'  — should check but won't block save (weak cable)
//   'info'     — contextual guidance (hints, cable detail)
// ─────────────────────────────────────────────────────────────────────────────

import { CABLE_CONFIDENCE_STRONG } from './reviewState.js'

/**
 * Compute unified workflow status from all audit/review state.
 *
 * @param {object} opts
 * @param {object|null}  opts.dxfAudit       — from computeDxfAudit()
 * @param {object|null}  opts.reviewSummary   — from buildReviewSummary()
 * @param {object|null}  opts.quoteReadiness  — from computeQuoteReadiness()
 * @param {object|null}  opts.cableAudit      — from computeCableAudit()
 * @param {number}       opts.takeoffRowCount — takeoffRows.length
 * @param {boolean}      opts.isPdf           — PDF mode (no DXF audit)
 * @param {boolean}      opts.hasFile         — file is loaded
 * @param {boolean}      opts.cableReviewed   — user already reviewed cable (panel-assisted persisted)
 * @returns {object}     WorkflowStatus
 */
export function computeWorkflowStatus({
  dxfAudit = null,
  reviewSummary = null,
  quoteReadiness = null,
  cableAudit = null,
  takeoffRowCount = 0,
  isPdf = false,
  hasFile = false,
  cableReviewed = false,
} = {}) {
  // ── Stage 0: no file yet ─────────────────────────────────────────────
  if (!hasFile) {
    return buildStatus('empty', {
      statusLine: 'Tölts fel egy DXF vagy PDF tervrajzot',
      statusColor: 'muted',
      cta: null,
      detail: { reasons: [], structuredReasons: [], stats: {} },
      badges: { takeoff: null, cable: null, calc: null },
    })
  }

  // ── Stage 1: parse failed ────────────────────────────────────────────
  if (dxfAudit && dxfAudit.status === 'PARSE_LIMITED') {
    const parseReasons = dxfAudit.missing || []
    return buildStatus('parse_failed', {
      statusLine: 'A fájl beolvasása sikertelen',
      statusColor: 'red',
      cta: { label: 'Próbáld újra', action: 'retry' },
      detail: {
        reasons: parseReasons,
        structuredReasons: tagReasons(parseReasons, 'blocker', 'parse'),
        stats: {},
      },
      badges: { takeoff: 'error', cable: null, calc: null },
    })
  }

  // ── From here, file is loaded. Check review state ────────────────────
  const hasRecognition = reviewSummary && reviewSummary.total > 0
  const hasRows = takeoffRowCount > 0

  // No recognition data and no rows yet
  if (!hasRecognition && !hasRows && !isPdf) {
    // DXF loaded but exploded or no blocks
    const isExploded = dxfAudit?.status === 'EXPLODED_RISK'

    // EXPLODED_RISK: guide user to PDF fallback instead of dead-end reexport CTA
    if (isExploded) {
      const auditMissing = dxfAudit?.missing || []
      const explodedBlocker = 'Blokk-alapú felmérés nem lehetséges — a rajz nem tartalmaz felismerhető blokkokat'
      const explodedHint = 'Alternatíva: kérd a tervezőt, hogy NE robbantva exportálja a DXF-et'
      const explodedReasons = [...auditMissing, explodedBlocker, explodedHint]
      const explodedStructured = [
        ...tagReasons(auditMissing, 'blocker', 'parse'),
        tagReason(explodedBlocker, 'blocker', 'parse'),
        tagReason(explodedHint, 'info', 'guidance'),
      ]
      return buildStatus('parse_failed', {
        statusLine: 'Robbantott rajz — váltás PDF felmérésre ajánlott',
        statusColor: 'red',
        cta: { label: 'Váltás PDF felmérésre →', action: 'switch_to_pdf' },
        detail: {
          reasons: explodedReasons,
          structuredReasons: explodedStructured,
          stats: dxfAudit?.stats || {},
        },
        badges: { takeoff: 'error', cable: null, calc: null },
      })
    }

    const noBlockReasons = dxfAudit?.missing || []
    return buildStatus('parse_failed', {
      statusLine: 'Nem találtunk tételt a rajzban',
      statusColor: 'red',
      cta: { label: 'Ellenőrizd a fájlt', action: 'retry' },
      detail: {
        reasons: noBlockReasons,
        structuredReasons: tagReasons(noBlockReasons, 'blocker', 'parse'),
        stats: dxfAudit?.stats || {},
      },
      badges: { takeoff: 'error', cable: null, calc: null },
    })
  }

  // PDF mode: simpler status
  if (isPdf) {
    if (!hasRows) {
      return buildStatus('empty', {
        statusLine: 'Jelölj ki elemeket a tervrajzon',
        statusColor: 'muted',
        cta: null,
        detail: { reasons: [], structuredReasons: [], stats: {} },
        badges: { takeoff: null, cable: null, calc: null },
      })
    }
    return buildStatus('ready', {
      statusLine: `${takeoffRowCount} tétel — árajánlat kész`,
      statusColor: 'accent',
      cta: { label: 'Mentés →', action: 'save' },
      detail: { reasons: [], structuredReasons: [], stats: {} },
      badges: { takeoff: null, cable: null, calc: null },
    })
  }

  // ── Stage 2: unresolved blocks exist ─────────────────────────────────
  if (quoteReadiness?.status === 'review_required') {
    const unresolvedCount = reviewSummary?.unresolved || 0
    const unresolvedQty = reviewSummary?.unresolvedQty || 0
    const reasons = quoteReadiness.reasons || []

    // Enrich for MANUAL_HEAVY DXF — most blocks need manual assignment
    const isManualHeavy = dxfAudit?.status === 'MANUAL_HEAVY'
    const manualHeavyHint = 'A rajz legtöbb blokkja ismeretlen — a legnagyobb darabszámúak vannak elöl'
    const enrichedReasons = isManualHeavy
      ? [...reasons, manualHeavyHint]
      : reasons
    const structuredReasons = [
      ...tagReasons(reasons, 'blocker', 'recognition'),
      ...(isManualHeavy ? [tagReason(manualHeavyHint, 'info', 'guidance')] : []),
    ]

    return buildStatus('unresolved_blocks', {
      statusLine: isManualHeavy
        ? `${unresolvedCount} ismeretlen blokk (${unresolvedQty} db) — legnagyobb tételektől`
        : `${unresolvedCount} ismeretlen blokk (${unresolvedQty} db) — rendelj hozzá tételt`,
      statusColor: 'red',
      cta: { label: 'Blokkok hozzárendelése', action: 'review_blocks' },
      detail: {
        reasons: enrichedReasons,
        structuredReasons,
        stats: buildReviewStats(reviewSummary),
      },
      badges: {
        takeoff: 'error',
        cable: getCableBadge(cableAudit, cableReviewed),
        calc: 'blocked',
      },
    })
  }

  // ── Stage 3: warnings (auto_low or weak cable) ───────────────────────
  if (quoteReadiness?.status === 'ready_with_warnings') {
    const reasons = quoteReadiness.reasons || []
    const hasAutoLow = (reviewSummary?.autoLow || 0) > 0
    const rawWeakCable = cableAudit?.cableConfidence != null &&
      cableAudit.cableConfidence < CABLE_CONFIDENCE_STRONG
    // Suppress cable warnings when user already reviewed cable via panel-assisted mode
    const weakCable = rawWeakCable && !(cableReviewed && cableAudit?.cableMode === 'PANEL_ASSISTED')

    // Surface top cable warnings in detail.reasons so WorkflowStatusCard
    // explains WHY cable is uncertain (not just "Kábelbecslés bizonytalanabb").
    const cableWarnings = getCableReasons(cableAudit, weakCable)
    const enrichedReasons = [...reasons, ...cableWarnings]

    // Build structured reasons with severity tags:
    //   auto_low reasons → 'action' (user can accept-all)
    //   cable confidence summary → 'warning' (should check)
    //   cable detail warnings → 'info' (contextual detail)
    const structuredReasons = [
      ...tagReasons(reasons, hasAutoLow ? 'action' : 'warning', hasAutoLow ? 'recognition' : 'cable'),
      ...getCableStructuredReasons(cableAudit, weakCable),
    ]

    // Determine the most impactful CTA
    let cta
    if (hasAutoLow) {
      cta = { label: 'Mind elfogadása ≥80%', action: 'accept_all' }
    } else if (weakCable && cableAudit?.manualCableRecommended) {
      cta = { label: 'Elosztó megjelölése →', action: 'activate_manual_cable' }
    } else if (weakCable) {
      cta = { label: 'Kábel ellenőrzése', action: 'check_cable' }
    } else {
      cta = { label: 'Mentés →', action: 'save' }
    }

    return buildStatus('review_warnings', {
      statusLine: `${takeoffRowCount} tétel — ellenőrzés javasolt`,
      statusColor: 'yellow',
      cta,
      detail: {
        reasons: enrichedReasons,
        structuredReasons,
        stats: buildReviewStats(reviewSummary),
      },
      badges: {
        takeoff: hasAutoLow ? 'warning' : null,
        cable: getCableBadge(cableAudit, cableReviewed),
        calc: null,
      },
    })
  }

  // ── Stage 4: fully ready ─────────────────────────────────────────────
  const activeItems = reviewSummary
    ? reviewSummary.total - (reviewSummary.excluded || 0)
    : takeoffRowCount

  // Even in ready stage, surface cable warnings if badge is active
  const cableBadge = getCableBadge(cableAudit, cableReviewed)
  const readyReasons = cableBadge ? getCableReasons(cableAudit, true) : []
  const readyStructured = cableBadge ? getCableStructuredReasons(cableAudit, true) : []

  return buildStatus('ready', {
    statusLine: `${activeItems} tétel — árajánlat kész`,
    statusColor: 'accent',
    cta: { label: 'Mentés →', action: 'save' },
    detail: {
      reasons: readyReasons,
      structuredReasons: readyStructured,
      stats: buildReviewStats(reviewSummary),
    },
    badges: {
      takeoff: null,
      cable: cableBadge,
      calc: null,
    },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Valid structured reason severity levels.
 * @type {readonly ['blocker','action','warning','info']}
 */
export const REASON_SEVERITIES = Object.freeze(['blocker', 'action', 'warning', 'info'])

function buildStatus(stage, fields) {
  return { stage, ...fields }
}

/**
 * Wrap a single reason string into a structured reason object.
 *
 * @param {string} text — reason text
 * @param {'blocker'|'action'|'warning'|'info'} severity
 * @param {string} category — 'parse'|'recognition'|'cable'|'guidance'
 * @returns {{ text: string, severity: string, category: string }}
 */
function tagReason(text, severity, category) {
  return { text, severity, category }
}

/**
 * Wrap an array of reason strings into structured reason objects.
 *
 * @param {string[]} reasons
 * @param {'blocker'|'action'|'warning'|'info'} severity
 * @param {string} category
 * @returns {Array<{ text: string, severity: string, category: string }>}
 */
function tagReasons(reasons, severity, category) {
  return reasons.map(r => tagReason(r, severity, category))
}

/**
 * Build structured cable reasons from cableAudit.
 * Cable detail warnings are tagged as 'info' (contextual detail).
 * Returns at most 2 items to avoid overwhelming the status card.
 *
 * @param {object|null} cableAudit
 * @param {boolean} weakCable
 * @returns {Array<{ text: string, severity: string, category: string }>}
 */
function getCableStructuredReasons(cableAudit, weakCable) {
  if (!cableAudit || !weakCable) return []
  const warnings = cableAudit.cableWarnings
  if (!Array.isArray(warnings) || warnings.length === 0) return []
  return warnings.slice(0, 2).map(w => tagReason(w, 'info', 'cable'))
}

function buildReviewStats(summary) {
  if (!summary) return {}
  return {
    confirmed: summary.confirmed || 0,
    confirmedQty: summary.confirmedQty || 0,
    autoHigh: summary.autoHigh || 0,
    autoHighQty: summary.autoHighQty || 0,
    autoLow: summary.autoLow || 0,
    autoLowQty: summary.autoLowQty || 0,
    unresolved: summary.unresolved || 0,
    unresolvedQty: summary.unresolvedQty || 0,
    excluded: summary.excluded || 0,
    total: summary.total || 0,
  }
}

/**
 * Extract top cable warnings from cableAudit for display in detail.reasons.
 * Returns at most 2 warnings to avoid overwhelming the status card.
 *
 * @param {object|null} cableAudit
 * @param {boolean} weakCable — whether cable confidence is below threshold
 * @returns {string[]}
 */
function getCableReasons(cableAudit, weakCable) {
  if (!cableAudit || !weakCable) return []
  const warnings = cableAudit.cableWarnings
  if (!Array.isArray(warnings) || warnings.length === 0) return []
  return warnings.slice(0, 2)
}

/**
 * Compute cable tab badge from cable audit.
 * @param {object|null} cableAudit
 * @param {boolean} [cableReviewed=false] — user reviewed cable (panel-assisted)
 * @returns {'warning'|null}
 */
function getCableBadge(cableAudit, cableReviewed = false) {
  if (!cableAudit) return null
  // Suppress badge when user already reviewed via panel-assisted
  if (cableReviewed && cableAudit.cableMode === 'PANEL_ASSISTED') return null
  if (cableAudit.manualCableRecommended) return 'warning'
  if (cableAudit.cableConfidence != null &&
      cableAudit.cableConfidence < CABLE_CONFIDENCE_STRONG) return 'warning'
  return null
}

/**
 * Determine whether the save button should be gated (disabled).
 *
 * @param {object} workflowStatus — from computeWorkflowStatus()
 * @returns {{ disabled: boolean, reason: string|null }}
 */
export function getSaveGating(workflowStatus) {
  if (!workflowStatus) return { disabled: true, reason: null }

  switch (workflowStatus.stage) {
    case 'empty':
    case 'parse_failed':
      return { disabled: true, reason: null }

    case 'unresolved_blocks':
      return {
        disabled: true,
        reason: 'Rendelj hozzá minden ismeretlen blokkot a mentés előtt',
      }

    case 'review_warnings':
    case 'ready':
      return { disabled: false, reason: null }

    default:
      return { disabled: false, reason: null }
  }
}

/**
 * Save button label based on workflow + context.
 *
 * @param {object} workflowStatus
 * @param {string|null} planId — plan ID for per-plan flow
 * @param {boolean} saving — in-progress
 * @returns {string}
 */
export function getSaveLabel(workflowStatus, planId, saving) {
  if (saving) return '...'
  if (workflowStatus?.stage === 'unresolved_blocks') return 'Felülvizsgálat szükséges'
  return planId ? 'Kalkuláció mentése' : 'Ajánlat létrehozása →'
}

/**
 * Design token color for save button background.
 *
 * @param {object} workflowStatus
 * @returns {string} — CSS color
 */
export function getSaveColor(workflowStatus) {
  if (!workflowStatus) return '#00E5A0'
  switch (workflowStatus.stage) {
    case 'unresolved_blocks':
      return '#71717A' // muted gray
    case 'review_warnings':
      return '#FFD166' // yellow — proceed with caution
    case 'ready':
    default:
      return '#00E5A0' // accent green
  }
}
