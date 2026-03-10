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
//   - detail:      { reasons[], stats{} } — collapsible extra info
//   - badges:      { takeoff, cable, calc } — warning dots for tab bar
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
} = {}) {
  // ── Stage 0: no file yet ─────────────────────────────────────────────
  if (!hasFile) {
    return buildStatus('empty', {
      statusLine: 'Tölts fel egy DXF vagy PDF tervrajzot',
      statusColor: 'muted',
      cta: null,
      detail: { reasons: [], stats: {} },
      badges: { takeoff: null, cable: null, calc: null },
    })
  }

  // ── Stage 1: parse failed ────────────────────────────────────────────
  if (dxfAudit && dxfAudit.status === 'PARSE_LIMITED') {
    return buildStatus('parse_failed', {
      statusLine: 'A fájl beolvasása sikertelen',
      statusColor: 'red',
      cta: { label: 'Próbáld újra', action: 'retry' },
      detail: {
        reasons: dxfAudit.missing || [],
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
    return buildStatus('parse_failed', {
      statusLine: isExploded
        ? 'Robbantott rajz — nincs felismerhető blokk'
        : 'Nem találtunk tételt a rajzban',
      statusColor: 'red',
      cta: isExploded
        ? { label: 'Kérd újra nem-robbantva', action: 'reexport' }
        : { label: 'Ellenőrizd a fájlt', action: 'retry' },
      detail: {
        reasons: dxfAudit?.missing || [],
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
        detail: { reasons: [], stats: {} },
        badges: { takeoff: null, cable: null, calc: null },
      })
    }
    return buildStatus('ready', {
      statusLine: `${takeoffRowCount} tétel — árajánlat kész`,
      statusColor: 'accent',
      cta: { label: 'Mentés →', action: 'save' },
      detail: { reasons: [], stats: {} },
      badges: { takeoff: null, cable: null, calc: null },
    })
  }

  // ── Stage 2: unresolved blocks exist ─────────────────────────────────
  if (quoteReadiness?.status === 'review_required') {
    const unresolvedCount = reviewSummary?.unresolved || 0
    const unresolvedQty = reviewSummary?.unresolvedQty || 0
    const reasons = quoteReadiness.reasons || []

    return buildStatus('unresolved_blocks', {
      statusLine: `${unresolvedCount} ismeretlen blokk (${unresolvedQty} db) — rendelj hozzá tételt`,
      statusColor: 'red',
      cta: { label: 'Blokkok hozzárendelése', action: 'review_blocks' },
      detail: {
        reasons,
        stats: buildReviewStats(reviewSummary),
      },
      badges: {
        takeoff: 'error',
        cable: getCableBadge(cableAudit),
        calc: 'blocked',
      },
    })
  }

  // ── Stage 3: warnings (auto_low or weak cable) ───────────────────────
  if (quoteReadiness?.status === 'ready_with_warnings') {
    const reasons = quoteReadiness.reasons || []
    const hasAutoLow = (reviewSummary?.autoLow || 0) > 0
    const weakCable = cableAudit?.cableConfidence != null &&
      cableAudit.cableConfidence < CABLE_CONFIDENCE_STRONG

    // Determine the most impactful CTA
    let cta
    if (hasAutoLow) {
      cta = { label: 'Mind elfogadása ≥80%', action: 'accept_all' }
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
        reasons,
        stats: buildReviewStats(reviewSummary),
      },
      badges: {
        takeoff: hasAutoLow ? 'warning' : null,
        cable: getCableBadge(cableAudit),
        calc: null,
      },
    })
  }

  // ── Stage 4: fully ready ─────────────────────────────────────────────
  const activeItems = reviewSummary
    ? reviewSummary.total - (reviewSummary.excluded || 0)
    : takeoffRowCount

  return buildStatus('ready', {
    statusLine: `${activeItems} tétel — árajánlat kész`,
    statusColor: 'accent',
    cta: { label: 'Mentés →', action: 'save' },
    detail: {
      reasons: [],
      stats: buildReviewStats(reviewSummary),
    },
    badges: {
      takeoff: null,
      cable: getCableBadge(cableAudit),
      calc: null,
    },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStatus(stage, fields) {
  return { stage, ...fields }
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
 * Compute cable tab badge from cable audit.
 * @returns {'warning'|null}
 */
function getCableBadge(cableAudit) {
  if (!cableAudit) return null
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
